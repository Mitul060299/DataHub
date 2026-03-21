"""
migrate_s3_to_mumbai.py
=======================
One-time script to copy S3 objects from us-east-1 to ap-south-1 (Mumbai).

Usage:
  python scripts/migrate_s3_to_mumbai.py [--dry-run] [--prefix PREFIX]

Prerequisites:
  pip install boto3
  AWS credentials with s3:GetObject / s3:PutObject / s3:ListObjectsV2

Steps:
1. Lists all objects in the source bucket (us-east-1).
2. Copies each object to the destination bucket (ap-south-1) using
   server-side copy (no local download).
3. Optionally deletes originals after successful copy (pass --delete-source).
"""

import argparse
import sys
import os
import boto3
from botocore.exceptions import ClientError

SRC_REGION = "us-east-1"
DST_REGION = "ap-south-1"


def get_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Migrate S3 data from us-east-1 to ap-south-1")
    p.add_argument("--dry-run", action="store_true", help="List objects but do not copy")
    p.add_argument("--prefix", default="", help="Key prefix to filter (default: all)")
    p.add_argument("--delete-source", action="store_true", help="Delete source objects after copy")
    p.add_argument("--src-bucket", default=os.environ.get("S3_BUCKET", ""), help="Source bucket name")
    p.add_argument("--dst-bucket", default="", help="Destination bucket name (default: same as source)")
    return p.parse_args()


def make_client(region: str):
    return boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
    )


def list_objects(client, bucket: str, prefix: str) -> list[dict]:
    """Paginate through all objects."""
    objects: list[dict] = []
    kwargs = {"Bucket": bucket}
    if prefix:
        kwargs["Prefix"] = prefix
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(**kwargs):
        objects.extend(page.get("Contents", []))
    return objects


def copy_object(src_client, dst_client, src_bucket: str, dst_bucket: str, key: str) -> bool:
    """Copy a single object using server-side copy if same-account, otherwise get/put."""
    try:
        # Try server-side copy (works if same AWS account)
        dst_client.copy_object(
            CopySource={"Bucket": src_bucket, "Key": key},
            Bucket=dst_bucket,
            Key=key,
            MetadataDirective="COPY",
        )
        return True
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("AccessDenied", "NoSuchKey"):
            # Fall back to download + re-upload
            try:
                obj = src_client.get_object(Bucket=src_bucket, Key=key)
                body = obj["Body"].read()
                content_type = obj.get("ContentType", "application/octet-stream")
                dst_client.put_object(
                    Bucket=dst_bucket,
                    Key=key,
                    Body=body,
                    ContentType=content_type,
                )
                return True
            except Exception as inner:
                print(f"  ERROR uploading {key}: {inner}", file=sys.stderr)
                return False
        print(f"  ERROR copying {key}: {e}", file=sys.stderr)
        return False


def ensure_bucket(client, bucket: str, region: str) -> None:
    """Create bucket in region if it does not exist."""
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            if region == "us-east-1":
                client.create_bucket(Bucket=bucket)
            else:
                client.create_bucket(
                    Bucket=bucket,
                    CreateBucketConfiguration={"LocationConstraint": region},
                )
            print(f"Created bucket '{bucket}' in {region}")
        else:
            raise


def main() -> None:
    args = get_args()

    if not args.src_bucket:
        print("ERROR: --src-bucket or S3_BUCKET env var required", file=sys.stderr)
        sys.exit(1)

    dst_bucket = args.dst_bucket or args.src_bucket

    src_client = make_client(SRC_REGION)
    dst_client = make_client(DST_REGION)

    print(f"Source:      s3://{args.src_bucket} [{SRC_REGION}]")
    print(f"Destination: s3://{dst_bucket} [{DST_REGION}]")
    print(f"Prefix:      '{args.prefix}' (empty = all)")
    print(f"Dry run:     {args.dry_run}")
    print(f"Delete src:  {args.delete_source}")
    print()

    objects = list_objects(src_client, args.src_bucket, args.prefix)
    print(f"Found {len(objects)} object(s)")

    if args.dry_run:
        for obj in objects:
            print(f"  [DRY-RUN] would copy: {obj['Key']} ({obj['Size']} bytes)")
        return

    if objects and src_bucket != dst_bucket:
        ensure_bucket(dst_client, dst_bucket, DST_REGION)

    copied, failed = 0, 0
    for obj in objects:
        key = obj["Key"]
        print(f"  Copying {key} ...", end=" ", flush=True)
        ok = copy_object(src_client, dst_client, args.src_bucket, dst_bucket, key)
        if ok:
            copied += 1
            print("OK")
            if args.delete_source:
                src_client.delete_object(Bucket=args.src_bucket, Key=key)
                print(f"  Deleted source: {key}")
        else:
            failed += 1

    print(f"\nDone. Copied: {copied}, Failed: {failed}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
