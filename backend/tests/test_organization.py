"""Tests for the organization-account model.

Coverage
--------
A — organization_service
    A1. get_or_create_personal_org creates exactly one org per user
    A2. resolve_org_owner_user_id returns owner for active member
    A3. resolve_org_owner_user_id returns self when not in any org
    A4. resolve_org_owner_user_id ignores pending invites
    A5. list_org_sibling_user_ids returns owner + active members
    A6. count_org_seats counts owner + active + pending invites
    A7. get_or_create_personal_org is idempotent

B — project_access org awareness
    B1. user_can_access_project returns True for org sibling's project
    B2. list_visible_project_ids includes sibling-owned projects
"""
from __future__ import annotations

import os
import unittest

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models_db import (
    OrganizationDB,
    OrganizationMemberDB,
    ProjectDB,
)


def _fresh_session():
    engine = create_engine("sqlite:///:memory:")
    OrganizationDB.__table__.create(bind=engine)
    OrganizationMemberDB.__table__.create(bind=engine)
    ProjectDB.__table__.create(bind=engine)
    # ProjectMemberDB references projects via FK — needed by project_access too.
    from app.models_db import ProjectMemberDB
    ProjectMemberDB.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session(), engine


# ── A — organization_service ─────────────────────────────────────────────────

class OrganizationServiceTests(unittest.TestCase):
    def test_get_or_create_creates_one_org_for_a_user(self):
        from app.services.organization_service import get_or_create_personal_org
        db, _ = _fresh_session()
        org = get_or_create_personal_org("u-1", db)
        self.assertEqual(org.owner_user_id, "u-1")
        self.assertEqual(db.query(OrganizationDB).count(), 1)

    def test_get_or_create_is_idempotent(self):
        from app.services.organization_service import get_or_create_personal_org
        db, _ = _fresh_session()
        a = get_or_create_personal_org("u-1", db)
        b = get_or_create_personal_org("u-1", db)
        self.assertEqual(a.id, b.id)
        self.assertEqual(db.query(OrganizationDB).count(), 1)

    def test_resolve_org_owner_returns_self_when_not_in_org(self):
        from app.services.organization_service import resolve_org_owner_user_id
        db, _ = _fresh_session()
        self.assertEqual(resolve_org_owner_user_id("u-99", db), "u-99")

    def test_resolve_org_owner_returns_owner_for_active_member(self):
        from app.services.organization_service import (
            get_or_create_personal_org,
            resolve_org_owner_user_id,
        )
        db, _ = _fresh_session()
        org = get_or_create_personal_org("owner", db)
        db.add(OrganizationMemberDB(
            id="m1", org_id=org.id, user_id="member",
            email="member@example.com", status="active",
            invited_by="owner",
        ))
        db.commit()
        self.assertEqual(resolve_org_owner_user_id("member", db), "owner")

    def test_resolve_org_owner_ignores_pending_invites(self):
        from app.services.organization_service import (
            get_or_create_personal_org,
            resolve_org_owner_user_id,
        )
        db, _ = _fresh_session()
        org = get_or_create_personal_org("owner", db)
        db.add(OrganizationMemberDB(
            id="m1", org_id=org.id, user_id="member",
            email="member@example.com", status="pending",
            invited_by="owner", invite_token="t-1",
        ))
        db.commit()
        # Pending must NOT redirect quota — only active members do.
        self.assertEqual(resolve_org_owner_user_id("member", db), "member")

    def test_list_siblings_returns_owner_and_active_members(self):
        from app.services.organization_service import (
            get_or_create_personal_org,
            list_org_sibling_user_ids,
        )
        db, _ = _fresh_session()
        org = get_or_create_personal_org("owner", db)
        db.add(OrganizationMemberDB(
            id="r1", org_id=org.id, user_id="m1",
            email="m1@example.com", status="active", invited_by="owner",
        ))
        db.add(OrganizationMemberDB(
            id="r2", org_id=org.id, user_id="m2",
            email="m2@example.com", status="pending",
            invited_by="owner", invite_token="t-2",
        ))
        db.commit()
        sibs = set(list_org_sibling_user_ids("owner", db))
        # Owner sees owner + active member; pending member is excluded.
        self.assertEqual(sibs, {"owner", "m1"})

    def test_count_org_seats_counts_owner_plus_active_and_pending(self):
        from app.services.organization_service import (
            get_or_create_personal_org,
            count_org_seats,
        )
        db, _ = _fresh_session()
        org = get_or_create_personal_org("owner", db)
        db.add(OrganizationMemberDB(
            id="r1", org_id=org.id, user_id="m1",
            email="m1@example.com", status="active", invited_by="owner",
        ))
        db.add(OrganizationMemberDB(
            id="r2", org_id=org.id, user_id=None,
            email="m2@example.com", status="pending",
            invited_by="owner", invite_token="t-2",
        ))
        db.commit()
        # +1 for owner + 1 active + 1 pending = 3
        self.assertEqual(count_org_seats(org.id, db), 3)


# ── B — project_access org awareness ─────────────────────────────────────────

class ProjectAccessOrgTests(unittest.TestCase):
    def test_user_can_access_org_siblings_project(self):
        from app.services.organization_service import get_or_create_personal_org
        from app.services.project_access import user_can_access_project
        db, _ = _fresh_session()
        org = get_or_create_personal_org("owner", db)
        db.add(OrganizationMemberDB(
            id="m1", org_id=org.id, user_id="member",
            email="member@example.com", status="active", invited_by="owner",
        ))
        # Owner creates a project; member must see it via org-sibling rule.
        db.add(ProjectDB(id="p-owner", user_id="owner", name="Owners P"))
        db.commit()
        self.assertTrue(user_can_access_project("p-owner", "member", db))

    def test_list_visible_project_ids_includes_sibling_projects(self):
        from app.services.organization_service import get_or_create_personal_org
        from app.services.project_access import list_visible_project_ids
        db, _ = _fresh_session()
        org = get_or_create_personal_org("owner", db)
        db.add(OrganizationMemberDB(
            id="m1", org_id=org.id, user_id="member",
            email="member@example.com", status="active", invited_by="owner",
        ))
        db.add(ProjectDB(id="p-owner", user_id="owner", name="Owners P"))
        db.add(ProjectDB(id="p-member", user_id="member", name="Members P"))
        db.commit()
        ids = list_visible_project_ids("member", db)
        self.assertEqual(ids, {"p-owner", "p-member"})


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
