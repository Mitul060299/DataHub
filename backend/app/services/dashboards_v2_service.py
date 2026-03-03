from __future__ import annotations

import uuid
from datetime import datetime, timezone

from ..db import SessionLocal
from ..models import DashboardTileOut, DashboardV2Out
from ..models_db import DashboardPublishDB, DashboardTileDB, DashboardV2DB


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
            created_at=cls._to_iso(tile.created_at),
        )

    @classmethod
    def _dashboard_out(cls, dashboard: DashboardV2DB, tiles: list[DashboardTileDB]) -> DashboardV2Out:
        return DashboardV2Out(
            id=str(dashboard.id),
            workspace_id=dashboard.workspace_id,
            dataset_id=dashboard.dataset_id,
            name=dashboard.name,
            description=dashboard.description,
            layout=dashboard.layout or {},
            tiles=[cls._tile_out(tile) for tile in tiles],
            created_at=cls._to_iso(dashboard.created_at),
        )

    @classmethod
    def list_dashboards(cls, user_id: str, workspace_id: str | None = None) -> list[DashboardV2Out]:
        db = SessionLocal()
        try:
            query = db.query(DashboardV2DB).filter(DashboardV2DB.user_id == user_id)
            if workspace_id:
                query = query.filter(DashboardV2DB.workspace_id == workspace_id)
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
        workspace_id: str,
        dataset_id: str | None,
        name: str,
        description: str | None,
        layout: dict,
    ) -> DashboardV2Out:
        db = SessionLocal()
        try:
            row = DashboardV2DB(
                id=str(uuid.uuid4()),
                user_id=user_id,
                workspace_id=workspace_id,
                dataset_id=dataset_id,
                name=name.strip(),
                description=description,
                layout=layout or {},
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

            tile = DashboardTileDB(
                id=str(uuid.uuid4()),
                dashboard_id=dashboard_id,
                dataset_id=dataset_id,
                title=title.strip(),
                chart_type=chart_type.strip(),
                query_spec=query_spec or {},
                layout=layout or {},
            )
            db.add(tile)
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