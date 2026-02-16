from __future__ import annotations

import os

import boto3


def setup_lifecycle_policies() -> None:
    bucket = os.getenv("S3_BUCKET_NAME")
    if not bucket:
        raise SystemExit("S3_BUCKET_NAME is required")

    client = boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )

    params = {
        "Bucket": bucket,
        "LifecycleConfiguration": {
            "Rules": [
                {
                    "ID": "archive-old-data",
                    "Status": "Enabled",
                    "Transitions": [
                        {"Days": 90, "StorageClass": "GLACIER"},
                        {"Days": 180, "StorageClass": "DEEP_ARCHIVE"},
                    ],
                }
            ]
        },
    }

    client.put_bucket_lifecycle_configuration(**params)
    print("Lifecycle policies configured")


if __name__ == "__main__":
    setup_lifecycle_policies()
