from __future__ import annotations

from pathlib import Path
from typing import Optional
import os
import logging

from ..config import settings
from ..services.storage_tiering import storage_tier_service

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class StorageService:
    @staticmethod
    def _s3_client():
        import boto3  # lazy — defers ~35 MB AWS SDK load until first upload
        return boto3.client(
            "s3",
            region_name=settings.s3_region or "ap-south-1",
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
        )

    @staticmethod
    def _r2_client():
        import boto3  # lazy — defers ~35 MB AWS SDK load until first upload
        from botocore.config import Config  # lazy
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
    def upload(
        cls,
        user_id: Optional[str],
        dataset_id: str,
        buffer: bytes,
        file_name: str,
        storage_tier: str = "hot",
    ) -> str:
        key_prefix = user_id or "anonymous"
        # Sanitize file_name to prevent path traversal in the storage key,
        # whether on local disk or in S3-style object stores.
        _safe_file_name = os.path.basename(file_name.replace("\\", "/")) or "data.parquet"
        key = f"{key_prefix}/{dataset_id}/{_safe_file_name}"

        provider = settings.storage_provider.lower()
        
        if provider == "gcs":
            client = cls._gcs_client()
            if not settings.gcs_bucket_name:
                raise ValueError("GCS_BUCKET_NAME is required for GCS uploads")
            bucket = client.bucket(settings.gcs_bucket_name)
            blob = bucket.blob(key)
            # Step 8: enforce private ACL so the object inherits no public policy.
            blob.upload_from_string(
                buffer,
                content_type="application/octet-stream",
                predefined_acl="private",
            )
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
            put_kwargs = {
                "Bucket": settings.r2_bucket_name,
                "Key": key,
                "Body": buffer,
                "ContentType": "application/octet-stream",
                # Step 8: enable server-side encryption for R2 objects.
                "ServerSideEncryption": "AES256",
            }
            storage_class = storage_tier_service.resolve_storage_class(storage_tier, provider)
            if storage_class:
                put_kwargs["StorageClass"] = storage_class
            client.put_object(
                **put_kwargs,
            )
            return f"r2://{settings.r2_bucket_name}/{key}"

        if provider == "s3":
            client = cls._s3_client()
            if not settings.s3_bucket_name:
                raise ValueError("S3_BUCKET_NAME is required for S3 uploads")
            storage_class = storage_tier_service.resolve_storage_class(storage_tier, provider) or "STANDARD"
            client.put_object(
                Bucket=settings.s3_bucket_name,
                Key=key,
                Body=buffer,
                ContentType="application/octet-stream",
                ServerSideEncryption="AES256",
                StorageClass=storage_class,
            )
            return f"s3://{settings.s3_bucket_name}/{key}"

        # Default to local
        # Step 9: verify the resolved path is inside the storage root before
        # writing to prevent any path traversal that bypassed key sanitization.
        storage_root = cls._local_dir().resolve()
        local_path = (cls._local_dir() / key).resolve()
        if not str(local_path).startswith(str(storage_root)):
            raise ValueError(f"Storage path traversal detected for key: {key!r}")
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(buffer)
        # Step 8: restrict to owner read/write only — prevents other OS users
        # on the same host from reading uploaded files.
        try:
            os.chmod(local_path, 0o600)
        except Exception:
            pass
        return f"local://{key}"

    @classmethod
    def generate_presigned_put_url(
        cls,
        user_id: str,
        dataset_id: str,
        file_name: str,
        expires_in: int = 3600,
    ) -> tuple[str, str]:
        """Generate a presigned PUT URL so the browser can upload directly to S3/R2.

        Returns ``(presigned_url, storage_path)`` where *storage_path* is the
        canonical path to store in ``DatasetMetaDB`` once the upload completes.

        Only S3 and R2 are supported.  GCS and Azure use different presigned-PUT
        APIs and are not yet wired up — callers should fall back to the standard
        ``/import/upload`` route for those providers.
        """
        provider = (settings.storage_provider or "local").lower()
        if provider not in ("s3", "r2"):
            raise NotImplementedError(
                f"Presigned PUT upload is not supported for provider '{provider}'. "
                "Use the standard /import/upload route instead."
            )

        safe_name = os.path.basename(file_name.replace("\\", "/")) or "data.parquet"
        key = f"{user_id}/{dataset_id}/{safe_name}"

        if provider == "r2":
            client = cls._r2_client()
            bucket = settings.r2_bucket_name
            if not bucket:
                raise ValueError("R2_BUCKET_NAME is not configured")
            storage_path = f"r2://{bucket}/{key}"
        else:  # s3
            client = cls._s3_client()
            bucket = settings.s3_bucket_name
            if not bucket:
                raise ValueError("S3_BUCKET_NAME is not configured")
            storage_path = f"s3://{bucket}/{key}"

        presigned_url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": "application/octet-stream",
            },
            ExpiresIn=expires_in,
        )
        logger.info(
            "presigned_put_url_generated storage_path=%s ttl_seconds=%d",
            storage_path, expires_in,
        )
        return presigned_url, storage_path

    @classmethod
    def get_signed_url(cls, storage_path: str, expires_in: int = 900) -> str:
        """Return a short-lived pre-signed URL (default: 15 min / 900 s).

        Pass a larger ``expires_in`` for bulk export downloads.
        All calls are logged for audit purposes.
        """
        provider, bucket, key, local_path = cls._parse_path(storage_path)
        logger.info(
            "presigned_url_generated storage_path=%s ttl_seconds=%d",
            storage_path, expires_in,
        )
        if provider == "local":
            # Local paths are only for internal DuckDB reads, not for frontend serving.
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
        """Return a DuckDB-readable path for the given object.

        INTERNAL USE ONLY — never include the return value in a JSON API
        response. For local storage the return value is a raw filesystem path
        which would expose the server’s directory layout to callers.
        """
        provider, _, _, local_path = cls._parse_path(storage_path)
        if provider == "local":
            # Verify the resolved path stays within the configured storage root
            # to catch any path traversal that might have slipped through upload.
            storage_root = cls._local_dir().resolve()
            resolved = local_path.resolve()
            if not str(resolved).startswith(str(storage_root)):
                logger.error(
                    "Path traversal detected in get_query_path: %s escaped root %s",
                    local_path, storage_root,
                )
                raise ValueError("Storage path traversal detected.")
            return resolved.as_posix()
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
