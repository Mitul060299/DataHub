from __future__ import annotations

from pathlib import Path
from typing import Optional
import os

import boto3
from botocore.config import Config

from ..config import settings


_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class StorageService:
    @staticmethod
    def _s3_client():
        return boto3.client(
            "s3",
            region_name=settings.s3_region or "us-east-1",
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
        )

    @staticmethod
    def _r2_client():
        endpoint = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
        return boto3.client(
            "s3",
            region_name="auto",
            endpoint_url=endpoint,
            aws_access_key_id=settings.r2_access_key_id or None,
            aws_secret_access_key=settings.r2_secret_access_key or None,
            config=Config(signature_version="s3v4"),
        )

    @staticmethod
    def _local_dir() -> Path:
        base = Path(os.getenv("LOCAL_STORAGE_DIR", str(_DATA_DIR / "object_storage")))
        base.mkdir(parents=True, exist_ok=True)
        return base

    @classmethod
    def upload(cls, user_id: Optional[str], dataset_id: str, buffer: bytes, file_name: str) -> str:
        key_prefix = user_id or "anonymous"
        key = f"{key_prefix}/{dataset_id}/{file_name}"

        provider = settings.storage_provider.lower()
        if provider == "r2":
            client = cls._r2_client()
            if not settings.r2_bucket_name:
                raise ValueError("R2_BUCKET_NAME is required for R2 uploads")
            client.put_object(
                Bucket=settings.r2_bucket_name,
                Key=key,
                Body=buffer,
                ContentType="application/octet-stream",
            )
            return f"r2://{settings.r2_bucket_name}/{key}"

        if provider == "s3":
            client = cls._s3_client()
            if not settings.s3_bucket_name:
                raise ValueError("S3_BUCKET_NAME is required for S3 uploads")
            client.put_object(
                Bucket=settings.s3_bucket_name,
                Key=key,
                Body=buffer,
                ContentType="application/octet-stream",
                ServerSideEncryption="AES256",
                StorageClass="STANDARD",
            )
            return f"s3://{settings.s3_bucket_name}/{key}"

        local_path = cls._local_dir() / key
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(buffer)
        return f"local://{key}"

    @classmethod
    def get_signed_url(cls, storage_path: str, expires_in: int = 3600) -> str:
        provider, bucket, key, local_path = cls._parse_path(storage_path)
        if provider == "local":
            return str(local_path)

        if provider == "r2":
            client = cls._r2_client()
        else:
            client = cls._s3_client()

        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    @classmethod
    def delete(cls, storage_path: str) -> None:
        provider, bucket, key, local_path = cls._parse_path(storage_path)
        if provider == "local":
            if local_path.exists():
                local_path.unlink()
            return

        client = cls._r2_client() if provider == "r2" else cls._s3_client()
        client.delete_object(Bucket=bucket, Key=key)

    @classmethod
    def archive_to_glacier(cls, storage_path: str) -> None:
        provider, bucket, key, _ = cls._parse_path(storage_path)
        if provider != "s3":
            return
        client = cls._s3_client()
        client.copy_object(
            Bucket=bucket,
            CopySource=f"{bucket}/{key}",
            Key=key,
            StorageClass="GLACIER",
        )

    @classmethod
    def get_query_path(cls, storage_path: str) -> str:
        provider, _, _, local_path = cls._parse_path(storage_path)
        if provider == "local":
            return local_path.as_posix()
        return cls.get_signed_url(storage_path)

    @classmethod
    def _parse_path(cls, storage_path: str) -> tuple[str, str, str, Path]:
        if storage_path.startswith("local://"):
            key = storage_path.replace("local://", "", 1)
            local_path = cls._local_dir() / key
            return "local", "", key, local_path

        if "://" not in storage_path:
            raise ValueError("Invalid storage path")
        protocol, rest = storage_path.split("://", 1)
        parts = rest.split("/")
        bucket = parts[0]
        key = "/".join(parts[1:])
        return protocol, bucket, key, Path("")
