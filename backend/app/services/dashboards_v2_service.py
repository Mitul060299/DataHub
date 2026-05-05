from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from ..db import SessionLocal
from ..models import DashboardTileOut, DashboardV2Out
from ..models_db import DashboardAccessDB, DashboardPublishDB, DashboardTileDB, DashboardV2DB, DashboardViewDB


class DashboardsV2Service:
    @staticmethod
    def _to_iso(value: datetime | None) -> str:
        return value.isoformat() if value else datetime.now(timezone.utc).isoformat()

    @classmethod
    def _tile_out(cls, tile: DashboardTileDB) -> DashboardTileOut:
        return DashboardTileOut(
            id=str(tile.id),
            dashboard_id=str(tile.dashboard_id),
            dataset_id=tile.dataset_id,
            title=tile.title,
            chart_type=tile.chart_type,
            query_spec=tile.query_spec or {},
            layout=tile.layout or {},
            tile_type=getattr(tile, "tile_type", "chart") or "chart",
            echarts_config=getattr(tile, "echarts_config", None),
            table_data=getattr(tile, "table_data", None),
            metric_value=getattr(tile, "metric_value", None),
            metric_label=getattr(tile, "metric_label", None),
            metric_trend=getattr(tile, "metric_trend", None),
            metric_threshold=getattr(tile, "metric_threshold", None),
            snapshot_id=getattr(tile, "snapshot_id", None),
            created_at=cls._to_iso(tile.created_at),
        )

    @classmethod
    def _dashboard_out(cls, dashboard: DashboardV2DB, tiles: list[DashboardTileDB]) -> DashboardV2Out:
        return DashboardV2Out(
            id=str(dashboard.id),
            dataset_id=dashboard.dataset_id,
            name=dashboard.name,
            description=dashboard.description,
            layout=dashboard.layout or {},
            theme=getattr(dashboard, "theme", None) or {},
            is_published=bool(getattr(dashboard, "is_published", False)),
            share_token=getattr(dashboard, "share_token", None),
            tiles=[cls._tile_out(tile) for tile in tiles],
            created_at=cls._to_iso(dashboard.created_at),
            updated_at=cls._to_iso(getattr(dashboard, "updated_at", None) or dashboard.created_at),
        )

    @classmethod
    def list_dashboards(
        cls,
        user_id: str,
        visible_user_ids: list[str] | None = None,
        project_id: str | None = None,
    ) -> list[DashboardV2Out]:
        db = SessionLocal()
        try:
            ids_to_query = visible_user_ids if visible_user_ids else [user_id]
            query = db.query(DashboardV2DB).filter(DashboardV2DB.user_id.in_(ids_to_query))
            if project_id:
                # Strict filter — do NOT include NULL-project rows (orphans from
                # deleted projects) when a specific project context is requested.
                query = query.filter(DashboardV2DB.project_id == project_id)
            dashboards = query.order_by(DashboardV2DB.created_at.desc()).all()

            dashboard_ids = [str(d.id) for d in dashboards]
            tiles_by_dashboard: dict[str, list[DashboardTileDB]] = {dashboard_id: [] for dashboard_id in dashboard_ids}
            if dashboard_ids:
                tiles = (
                    db.query(DashboardTileDB)
                    .filter(DashboardTileDB.dashboard_id.in_(dashboard_ids))
                    .order_by(DashboardTileDB.created_at.asc())
                    .all()
                )
                for tile in tiles:
                    tiles_by_dashboard.setdefault(str(tile.dashboard_id), []).append(tile)

            return [
                cls._dashboard_out(dashboard, tiles_by_dashboard.get(str(dashboard.id), []))
                for dashboard in dashboards
            ]
        finally:
            db.close()

    @classmethod
    def create_dashboard(
        cls,
        user_id: str,
        dataset_id: str | None,
        name: str,
        description: str | None,
        layout: dict,
        theme: dict | None = None,
    ) -> DashboardV2Out:
        db = SessionLocal()
        try:
            row = DashboardV2DB(
                id=str(uuid.uuid4()),
                user_id=user_id,
                dataset_id=dataset_id,
                name=name.strip(),
                description=description,
                layout=layout or {},
                theme=theme or {},
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return cls._dashboard_out(row, [])
        finally:
            db.close()

    @classmethod
    def get_dashboard(cls, user_id: str, dashboard_id: str) -> DashboardV2Out | None:
        db = SessionLocal()
        try:
            dashboard = (
                db.query(DashboardV2DB)
                .filter(DashboardV2DB.id == dashboard_id)
                .filter(DashboardV2DB.user_id == user_id)
                .first()
            )
            if not dashboard:
                return None
            tiles = (
                db.query(DashboardTileDB)
                .filter(DashboardTileDB.dashboard_id == dashboard_id)
                .order_by(DashboardTileDB.created_at.asc())
                .all()
            )
            return cls._dashboard_out(dashboard, tiles)
        finally:
            db.close()

    @classmethod
    def add_tile(
        cls,
        user_id: str,
        dashboard_id: str,
        dataset_id: str | None,
        title: str,
        chart_type: str,
        query_spec: dict,
        layout: dict,
        tile_type: str = "chart",
        echarts_config: dict | None = None,
        table_data: dict | None = None,
        metric_value: str | None = None,
        metric_label: str | None = None,
        metric_trend: str | None = None,
        metric_threshold: dict | None = None,
        source_table: str | None = None,
        snapshot_id: str | None = None,
    ) -> DashboardTileOut:
        db = SessionLocal()
        try:
            dashboard = (
                db.query(DashboardV2DB)
                .filter(DashboardV2DB.id == dashboard_id)
                .filter(DashboardV2DB.user_id == user_id)
                .first()
            )
            if not dashboard:
                raise ValueError("Dashboard not found")

            # Store source_table reference in query_spec for snapshot binding
            qs = dict(query_spec or {})
            if source_table:
                qs["source_table"] = source_table

            tile = DashboardTileDB(
                id=str(uuid.uuid4()),
                dashboard_id=dashboard_id,
                dataset_id=dataset_id,
                title=title.strip(),
                chart_type=chart_type.strip(),
                query_spec=qs,
                layout=layout or {},
                tile_type=tile_type,
                echarts_config=echarts_config,
                table_data=table_data,
                metric_value=metric_value,
                metric_label=metric_label,
                metric_trend=metric_trend,
                metric_threshold=metric_threshold,
                snapshot_id=snapshot_id,
            )
            db.add(tile)
            db.commit()
            db.refresh(tile)
            return cls._tile_out(tile)
        finally:
            db.close()

    @classmethod
    def update_dashboard(
        cls,
        user_id: str,
        dashboard_id: str,
        updates: dict[str, Any],
    ) -> DashboardV2Out | None:
        db = SessionLocal()
        try:
            dashboard = (
                db.query(DashboardV2DB)
                .filter(DashboardV2DB.id == dashboard_id)
                .filter(DashboardV2DB.user_id == user_id)
                .first()
            )
            if not dashboard:
                return None
            for key, val in updates.items():
                if hasattr(dashboard, key) and val is not None:
                    setattr(dashboard, key, val)
            db.commit()
            db.refresh(dashboard)
            tiles = (
                db.query(DashboardTileDB)
                .filter(DashboardTileDB.dashboard_id == dashboard_id)
                .order_by(DashboardTileDB.created_at.asc())
                .all()
            )
            return cls._dashboard_out(dashboard, tiles)
        finally:
            db.close()

    @classmethod
    def delete_tile(cls, user_id: str, dashboard_id: str, tile_id: str) -> bool:
        db = SessionLocal()
        try:
            dashboard = (
                db.query(DashboardV2DB)
                .filter(DashboardV2DB.id == dashboard_id)
                .filter(DashboardV2DB.user_id == user_id)
                .first()
            )
            if not dashboard:
                return False
            tile = (
                db.query(DashboardTileDB)
                .filter(DashboardTileDB.id == tile_id)
                .filter(DashboardTileDB.dashboard_id == dashboard_id)
                .first()
            )
            if not tile:
                return False
            db.delete(tile)
            db.commit()
            return True
        finally:
            db.close()

    @classmethod
    def update_tile(
        cls,
        user_id: str,
        dashboard_id: str,
        tile_id: str,
        updates: dict[str, Any],
    ) -> DashboardTileOut | None:
        db = SessionLocal()
        try:
            dashboard = (
                db.query(DashboardV2DB)
                .filter(DashboardV2DB.id == dashboard_id)
                .filter(DashboardV2DB.user_id == user_id)
                .first()
            )
            if not dashboard:
                return None
            tile = (
                db.query(DashboardTileDB)
                .filter(DashboardTileDB.id == tile_id)
                .filter(DashboardTileDB.dashboard_id == dashboard_id)
                .first()
            )
            if not tile:
                return None
            for key, val in updates.items():
                if hasattr(tile, key) and val is not None:
                    setattr(tile, key, val)
            db.commit()
            db.refresh(tile)
            return cls._tile_out(tile)
        finally:
            db.close()

    @classmethod
    def publish_dashboard(
        cls,
        user_id: str,
        dashboard_id: str,
        expires_at: datetime | None = None,
    ) -> DashboardPublishDB:
        db = SessionLocal()
        try:
            dashboard = (
                db.query(DashboardV2DB)
                .filter(DashboardV2DB.id == dashboard_id)
                .filter(DashboardV2DB.user_id == user_id)
                .first()
            )
            if not dashboard:
                raise ValueError("Dashboard not found")

            publish = db.query(DashboardPublishDB).filter(DashboardPublishDB.dashboard_id == dashboard_id).first()
            if publish is None:
                publish = DashboardPublishDB(
                    id=str(uuid.uuid4()),
                    dashboard_id=dashboard_id,
                    publish_token=uuid.uuid4().hex,
                    is_active=True,
                    expires_at=expires_at,
                )
                db.add(publish)
            else:
                publish.is_active = True
                publish.expires_at = expires_at

            db.commit()
            db.refresh(publish)
            return publish
        finally:
            db.close()

    @classmethod
    def unpublish_dashboard(cls, user_id: str, dashboard_id: str) -> bool:
        db = SessionLocal()
        try:
            dashboard = (
                db.query(DashboardV2DB)
                .filter(DashboardV2DB.id == dashboard_id)
                .filter(DashboardV2DB.user_id == user_id)
                .first()
            )
            if not dashboard:
                return False

            publish = db.query(DashboardPublishDB).filter(DashboardPublishDB.dashboard_id == dashboard_id).first()
            if not publish:
                return False
            publish.is_active = False
            db.commit()
            return True
        finally:
            db.close()

    @classmethod
    def get_public_dashboard(cls, publish_token: str) -> DashboardV2Out | None:
        db = SessionLocal()
        try:
            publish = (
                db.query(DashboardPublishDB)
                .filter(DashboardPublishDB.publish_token == publish_token)
                .first()
            )
            if not publish or not publish.is_active:
                return None
            if publish.expires_at and publish.expires_at < datetime.now(timezone.utc):
                return None

            dashboard = db.query(DashboardV2DB).filter(DashboardV2DB.id == publish.dashboard_id).first()
            if not dashboard:
                return None
            tiles = (
                db.query(DashboardTileDB)
                .filter(DashboardTileDB.dashboard_id == dashboard.id)
                .order_by(DashboardTileDB.created_at.asc())
                .all()
            )
            return cls._dashboard_out(dashboard, tiles)
        finally:
            db.close()

    @classmethod
    def get_dashboard_by_share_token(cls, share_token: str) -> DashboardV2Out | None:
        """Look up a dashboard directly by its share_token field (new access model)."""
        db = SessionLocal()
        try:
            dashboard = db.query(DashboardV2DB).filter(DashboardV2DB.share_token == share_token).first()
            if not dashboard:
                return None
            # Reject expired share tokens. NULL means "never expires" for
            # backward compatibility with tokens minted before 0066.
            expires_at = getattr(dashboard, "share_expires_at", None)
            if expires_at and expires_at < datetime.now(timezone.utc):
                return None
            tiles = (
                db.query(DashboardTileDB)
                .filter(DashboardTileDB.dashboard_id == dashboard.id)
                .order_by(DashboardTileDB.created_at.asc())
                .all()
            )
            return cls._dashboard_out(dashboard, tiles)
        finally:
            db.close()