from __future__ import annotations

from pathlib import Path
from typing import Optional
import os
import logging

import boto3
from botocore.config import Config

from ..config import settings

logger = logging.getLogger(__name__)

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
    def _gcs_client():
        """Initialize Google Cloud Storage client."""
        try:
            from google.cloud import storage
        except ImportError:
            raise ImportError("google-cloud-storage is required for GCS storage")
        
        # Use service account JSON file if provided, otherwise use default credentials
        if settings.gcs_credentials_json:
            import json
            from google.oauth2 import service_account
            creds_dict = json.loads(settings.gcs_credentials_json)
            credentials = service_account.Credentials.from_service_account_info(creds_dict)
            return storage.Client(credentials=credentials, project=settings.gcs_project_id)
        else:
            return storage.Client(project=settings.gcs_project_id)

    @staticmethod
    def _azure_client():
        """Initialize Azure Blob Storage client."""
        try:
            from azure.storage.blob import BlobServiceClient
        except ImportError:
            raise ImportError("azure-storage-blob is required for Azure Blob storage")
        
        if settings.azure_connection_string:
            return BlobServiceClient.from_connection_string(settings.azure_connection_string)
        elif settings.azure_account_name and settings.azure_account_key:
            account_url = f"https://{settings.azure_account_name}.blob.core.windows.net"
            from azure.storage.blob import BlobServiceClient
            return BlobServiceClient(account_url=account_url, credential=settings.azure_account_key)
        else:
            raise ValueError("Azure credentials not configured")

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
        
        if provider == "gcs":
            client = cls._gcs_client()
            if not settings.gcs_bucket_name:
                raise ValueError("GCS_BUCKET_NAME is required for GCS uploads")
            bucket = client.bucket(settings.gcs_bucket_name)
            blob = bucket.blob(key)
            blob.upload_from_string(buffer, content_type="application/octet-stream")
            return f"gcs://{settings.gcs_bucket_name}/{key}"

        if provider == "azure" or provider == "azure-blob":
            client = cls._azure_client()
            if not settings.azure_container_name:
                raise ValueError("AZURE_CONTAINER_NAME is required for Azure Blob uploads")
            blob_client = client.get_blob_client(container=settings.azure_container_name, blob=key)
            blob_client.upload_blob(buffer, overwrite=True, content_settings={"content_type": "application/octet-stream"})
            return f"azure://{settings.azure_container_name}/{key}"
        
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

        # Default to local
        local_path = cls._local_dir() / key
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(buffer)
        return f"local://{key}"

    @classmethod
    def get_signed_url(cls, storage_path: str, expires_in: int = 3600) -> str:
        provider, bucket, key, local_path = cls._parse_path(storage_path)
        
        if provider == "local":
            return str(local_path)

        if provider == "gcs":
            from datetime import timedelta
            client = cls._gcs_client()
            bucket_obj = client.bucket(bucket)
            blob = bucket_obj.blob(key)
            return blob.generate_signed_url(expiration=timedelta(seconds=expires_in), method="GET")

        if provider == "azure":
            from datetime import datetime, timedelta, timezone
            from azure.storage.blob import generate_blob_sas, BlobSasPermissions
            
            if not settings.azure_account_name or not settings.azure_account_key:
                raise ValueError("Azure account name and key required for signed URLs")
            
            sas_token = generate_blob_sas(
                account_name=settings.azure_account_name,
                container_name=bucket,
                blob_name=key,
                account_key=settings.azure_account_key,
                permission=BlobSasPermissions(read=True),
                expiry=datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            )
            
            return f"https://{settings.azure_account_name}.blob.core.windows.net/{bucket}/{key}?{sas_token}"

        if provider == "r2":
            client = cls._r2_client()
        else:  # s3
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

        if provider == "gcs":
            client = cls._gcs_client()
            bucket_obj = client.bucket(bucket)
            blob = bucket_obj.blob(key)
            blob.delete()
            return

        if provider == "azure":
            client = cls._azure_client()
            blob_client = client.get_blob_client(container=bucket, blob=key)
            blob_client.delete_blob()
            return

        # S3 or R2
        client = cls._r2_client() if provider == "r2" else cls._s3_client()
        client.delete_object(Bucket=bucket, Key=key)

    @classmethod
    def archive_to_glacier(cls, storage_path: str) -> None:
        provider, bucket, key, _ = cls._parse_path(storage_path)
        if provider != "s3":
            logger.warning(f"Glacier archiving only supported for S3, not {provider}")
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
