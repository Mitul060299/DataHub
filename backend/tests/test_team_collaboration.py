"""
Tests for the team-collaboration feature.

Coverage
--------
  A — workspace_access.get_visible_user_ids service
        A1. Returns only requester when workspace_id is blank
        A2. Returns only requester when workspace_id is 'default'
        A3. Returns only requester when user is NOT an active member
        A4. Returns all active member IDs when user IS an active member
        A5. Always includes requester even if not present in members table

  B — POST /workspaces/{id}/members  (invite_member)
        B1. Free-plan user gets 403 (max_team_members == 1)
        B2. Non-admin member gets 403
        B3. Unknown workspace returns 404
        B4. Duplicate active member returns 409
        B5. Duplicate pending invite refreshes token and re-sends email
        B6. Member cap exceeded returns 403
        B7. Admin on Team plan creates a pending member row and sends email
        B8. Created member has correct email, role, status=pending

  C — GET /workspaces/{id}/members  (list_members)
        C1. Non-member gets 403
        C2. Active member can list members
        C3. Returns both active and pending members

  D — PUT /workspaces/{id}/members/{member_id}  (update_member_role)
        D1. Non-admin gets 403
        D2. Unknown member returns 404
        D3. Cannot demote last admin (returns 400)
        D4. Can demote admin when there is another admin
        D5. Valid role update is persisted

  E — DELETE /workspaces/{id}/members/{member_id}  (remove_member)
        E1. Non-admin cannot remove another member (403)
        E2. Member can remove themselves
        E3. Cannot remove the last admin (400)
        E4. Admin can remove another member
        E5. Unknown member returns 404

  F — GET /invites/{token}/accept  (accept_invite)
        F1. Unknown token returns 404
        F2. Email mismatch returns 403
        F3. Already active invite redirects home silently
        F4. Valid accept sets status=active, user_id, accepted_at, clears token

  G — plan_limits  max_team_members values
        G1. Free plan = 1 (solo only)
        G2. Professional plan = 1
        G3. Team plan = 10
        G4. Business plan = 50
        G5. Enterprise plan = -1 (unlimited)

  H — WorkspaceMemberDB model
        H1. WorkspaceMemberDB has expected columns
        H2. WorkspaceMemberInvite Pydantic model validates email and role
        H3. WorkspaceMemberOut exposes all required fields
"""
from __future__ import annotations

import os
import sys
import uuid
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

# ── Stub optional heavy deps before any app import ────────────────────────────
for _mod in [
    "chromadb", "chromadb.utils", "chromadb.config", "chromadb.api",
    "slowapi", "slowapi.util", "slowapi.errors", "slowapi.middleware",
]:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")


# =============================================================================
# Shared helpers
# =============================================================================

def _make_current_user(
    uid: str = "user-1",
    email: str = "admin@example.com",
    role: str = "admin",
    plan: str = "Team",
) -> MagicMock:
    from app.dependencies import CurrentUser
    return CurrentUser(id=uid, email=email, role=role, plan=plan)


def _make_workspace(ws_id: str = "ws-1", name: str = "Test Workspace") -> MagicMock:
    ws = MagicMock()
    ws.id = ws_id
    ws.name = name
    return ws


def _make_member_db(
    member_id: str | None = None,
    workspace_id: str = "ws-1",
    user_id: str | None = "user-1",
    email: str = "admin@example.com",
    role: str = "admin",
    status: str = "active",
    invite_token: str | None = None,
) -> MagicMock:
    m = MagicMock()
    m.id = member_id or str(uuid.uuid4())
    m.workspace_id = workspace_id
    m.user_id = user_id
    m.email = email
    m.role = role
    m.status = status
    m.invite_token = invite_token or str(uuid.uuid4())
    m.invited_by = "user-0"
    m.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    m.accepted_at = datetime(2026, 1, 2, tzinfo=timezone.utc) if status == "active" else None
    return m


def _build_db(
    workspace: MagicMock | None = None,
    member_rows: list | None = None,    # rows returned for WorkspaceMemberDB queries
    member_first: MagicMock | None = None,  # single .first() result
    member_count: int = 1,
):
    """Build a mock SQLAlchemy session wired for common workspace_member patterns."""
    db = MagicMock()

    def _query(model):
        mq = MagicMock()
        model_name = str(model) if isinstance(model, str) else getattr(model, "__name__", str(model))

        filt = MagicMock()
        mq.filter.return_value = filt

        if "Workspace" in model_name and "Member" not in model_name:
            filt.first.return_value = workspace
        elif "WorkspaceMemberDB" in model_name or "WorkspaceMember" in model_name:
            filt.first.return_value = member_first
            filt.filter.return_value = filt  # chained .filter()
            filt.count.return_value = member_count
            filt.order_by.return_value.all.return_value = member_rows or []
            filt.all.return_value = member_rows or []
        return mq

    db.query.side_effect = _query
    return db


# =============================================================================
# A — workspace_access.get_visible_user_ids
# =============================================================================

class TestGetVisibleUserIds(unittest.TestCase):

    def _invoke(self, db, requesting_user_id: str, workspace_id: str) -> list[str]:
        from app.services.workspace_access import get_visible_user_ids
        return get_visible_user_ids(db, requesting_user_id, workspace_id)

    def _db_is_member(self, member_user_ids: list[str], requesting_uid: str) -> MagicMock:
        """DB where requesting_uid IS an active member and member_user_ids are active."""
        db = MagicMock()

        def _query(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt

            # first() call: check if requester is a member
            requester_row = MagicMock()
            requester_row.user_id = requesting_uid
            filt.first.return_value = requester_row

            # all() call: return tuples of (user_id,)
            filt.all.return_value = [(uid,) for uid in member_user_ids]
            return mq

        db.query.side_effect = _query
        return db

    def _db_not_member(self) -> MagicMock:
        db = MagicMock()
        mq = MagicMock()
        filt = MagicMock()
        mq.filter.return_value = filt
        filt.filter.return_value = filt
        filt.first.return_value = None  # not a member
        db.query.return_value = mq
        return db

    def test_A1_blank_workspace_returns_only_requester(self):
        db = MagicMock()
        result = self._invoke(db, "user-1", "")
        self.assertEqual(result, ["user-1"])
        db.query.assert_not_called()

    def test_A2_default_workspace_returns_only_requester(self):
        db = MagicMock()
        result = self._invoke(db, "user-1", "default")
        self.assertEqual(result, ["user-1"])
        db.query.assert_not_called()

    def test_A3_non_member_returns_only_requester(self):
        db = self._db_not_member()
        result = self._invoke(db, "user-42", "ws-real")
        self.assertEqual(result, ["user-42"])

    def test_A4_active_member_returns_all_team_ids(self):
        team_ids = ["user-1", "user-2", "user-3"]
        db = self._db_is_member(team_ids, "user-1")
        result = self._invoke(db, "user-1", "ws-1")
        self.assertIn("user-1", result)
        self.assertIn("user-2", result)
        self.assertEqual(sorted(result), sorted(team_ids))

    def test_A5_requester_always_included_as_fallback(self):
        """Even if the DB query omits the requester, they are still included."""
        # Return other members but NOT the requester
        db = self._db_is_member(["user-2", "user-3"], "user-1")
        result = self._invoke(db, "user-1", "ws-1")
        self.assertIn("user-1", result)


# =============================================================================
# B — POST /workspaces/{id}/members
# =============================================================================

class TestInviteMember(unittest.TestCase):

    def _invoke(self, workspace_id, payload_dict, current_user, db):
        from app.routers.workspace_members import invite_member
        from app.models import WorkspaceMemberInvite
        payload = WorkspaceMemberInvite(**payload_dict)
        return invite_member(
            workspace_id=workspace_id,
            payload=payload,
            current_user=current_user,
            db=db,
        )

    def test_B1_free_plan_gets_403(self):
        from fastapi import HTTPException
        user = _make_current_user(plan="Free")
        db = MagicMock()
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", {"email": "x@y.com"}, user, db)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Team plan", ctx.exception.detail)

    def test_B2_non_admin_gets_403(self):
        from fastapi import HTTPException
        user = _make_current_user(plan="Team", uid="viewer-user")
        ws = _make_workspace()

        db = MagicMock()

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            model_name = getattr(model, "__name__", str(model))
            if "Workspace" in model_name and "Member" not in model_name:
                filt.first.return_value = ws
            else:
                # viewer-user is a member but NOT admin
                viewer_row = MagicMock()
                viewer_row.role = "viewer"
                filt.first.return_value = viewer_row
            return mq

        db.query.side_effect = _q

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", {"email": "x@y.com"}, user, db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_B3_unknown_workspace_returns_404(self):
        from fastapi import HTTPException
        user = _make_current_user(plan="Team")
        db = _build_db(workspace=None)
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-bad", {"email": "x@y.com"}, user, db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_B4_duplicate_active_member_returns_409(self):
        from fastapi import HTTPException
        user = _make_current_user(plan="Team")
        ws = _make_workspace()

        existing_active = _make_member_db(email="x@y.com", role="viewer", status="active")

        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            model_name = getattr(model, "__name__", str(model))
            if "Workspace" in model_name and "Member" not in model_name:
                filt.first.return_value = ws
            else:
                call_count[0] += 1
                if call_count[0] == 1:
                    # _require_workspace_admin: return admin row
                    admin = MagicMock(); admin.role = "admin"
                    filt.first.return_value = admin
                elif call_count[0] == 2:
                    # active_count query
                    filt.count.return_value = 1
                elif call_count[0] == 3:
                    # duplicate check — existing active member
                    filt.first.return_value = existing_active
                else:
                    filt.first.return_value = None
            return mq

        db.query.side_effect = _q

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", {"email": "x@y.com", "role": "viewer"}, user, db)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_B5_duplicate_pending_refreshes_token_and_sends_email(self):
        user = _make_current_user(plan="Team")
        ws = _make_workspace()
        existing_pending = _make_member_db(email="pending@y.com", role="viewer", status="pending")

        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            model_name = getattr(model, "__name__", str(model))
            if "Workspace" in model_name and "Member" not in model_name:
                filt.first.return_value = ws
            else:
                call_count[0] += 1
                if call_count[0] == 1:
                    admin = MagicMock(); admin.role = "admin"
                    filt.first.return_value = admin
                elif call_count[0] == 2:
                    filt.count.return_value = 1
                elif call_count[0] == 3:
                    filt.first.return_value = existing_pending
                else:
                    filt.first.return_value = None
            return mq

        db.query.side_effect = _q

        with patch("app.routers.workspace_members._send_invite_email") as mock_email:
            result = self._invoke("ws-1", {"email": "pending@y.com", "role": "editor"}, user, db)

        mock_email.assert_called_once()
        db.commit.assert_called()

    def test_B6_member_cap_exceeded_returns_403(self):
        from fastapi import HTTPException
        user = _make_current_user(plan="Team")  # max 10
        ws = _make_workspace()

        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            model_name = getattr(model, "__name__", str(model))
            if "Workspace" in model_name and "Member" not in model_name:
                filt.first.return_value = ws
            else:
                call_count[0] += 1
                if call_count[0] == 1:
                    admin = MagicMock(); admin.role = "admin"
                    filt.first.return_value = admin
                elif call_count[0] == 2:
                    # active_count == 10 == max_team_members
                    filt.count.return_value = 10
                else:
                    filt.first.return_value = None
            return mq

        db.query.side_effect = _q

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", {"email": "new@y.com", "role": "viewer"}, user, db)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("maximum", ctx.exception.detail)

    def test_B7_admin_team_plan_creates_pending_member(self):
        user = _make_current_user(plan="Team")
        ws = _make_workspace()

        created_member = _make_member_db(
            email="new@y.com", role="viewer", status="pending", user_id=None
        )
        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            model_name = getattr(model, "__name__", str(model))
            if "Workspace" in model_name and "Member" not in model_name:
                filt.first.return_value = ws
            else:
                call_count[0] += 1
                if call_count[0] == 1:
                    admin = MagicMock(); admin.role = "admin"
                    filt.first.return_value = admin
                elif call_count[0] == 2:
                    filt.count.return_value = 2
                elif call_count[0] == 3:
                    filt.first.return_value = None  # no duplicate
                else:
                    filt.first.return_value = None
            return mq

        db.query.side_effect = _q
        db.refresh.side_effect = lambda m: None

        added_members = []
        db.add.side_effect = lambda m: added_members.append(m)

        with patch("app.routers.workspace_members._send_invite_email") as mock_email:
            # patch db.refresh to set values on the added object
            def _refresh(m):
                m.id = created_member.id
                m.created_at = created_member.created_at
                m.accepted_at = None

            db.refresh.side_effect = _refresh
            result = self._invoke("ws-1", {"email": "new@y.com", "role": "viewer"}, user, db)

        self.assertEqual(len(added_members), 1)
        new_row = added_members[0]
        self.assertEqual(new_row.email, "new@y.com")
        self.assertEqual(new_row.role, "viewer")
        self.assertEqual(new_row.status, "pending")
        self.assertIsNone(new_row.user_id)
        mock_email.assert_called_once()
        db.commit.assert_called()

    def test_B8_email_is_lowercased_and_stripped(self):
        user = _make_current_user(plan="Team")
        ws = _make_workspace()
        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            model_name = getattr(model, "__name__", str(model))
            if "Workspace" in model_name and "Member" not in model_name:
                filt.first.return_value = ws
            else:
                call_count[0] += 1
                if call_count[0] == 1:
                    admin = MagicMock(); admin.role = "admin"
                    filt.first.return_value = admin
                elif call_count[0] == 2:
                    filt.count.return_value = 1
                elif call_count[0] == 3:
                    filt.first.return_value = None
                else:
                    filt.first.return_value = None
            return mq

        db.query.side_effect = _q
        added = []
        db.add.side_effect = added.append

        def _refresh(m):
            m.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
            m.accepted_at = None

        db.refresh.side_effect = _refresh

        with patch("app.routers.workspace_members._send_invite_email"):
            self._invoke("ws-1", {"email": "  UPPER@Example.COM  ", "role": "viewer"}, user, db)

        self.assertEqual(added[0].email, "upper@example.com")


# =============================================================================
# C — GET /workspaces/{id}/members
# =============================================================================

class TestListMembers(unittest.TestCase):

    def _invoke(self, workspace_id, current_user, db):
        from app.routers.workspace_members import list_members
        return list_members(workspace_id=workspace_id, current_user=current_user, db=db)

    def test_C1_non_member_gets_403(self):
        from fastapi import HTTPException
        user = _make_current_user()
        ws = _make_workspace()
        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            model_name = getattr(model, "__name__", str(model))
            call_count[0] += 1
            if call_count[0] == 1:
                filt.first.return_value = ws
            else:
                filt.first.return_value = None  # not a member
            return mq

        db.query.side_effect = _q

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", user, db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_C2_active_member_can_list(self):
        user = _make_current_user()
        ws = _make_workspace()
        rows = [
            _make_member_db(email="a@b.com", status="active"),
            _make_member_db(email="c@d.com", status="pending"),
        ]
        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            model_name = getattr(model, "__name__", str(model))
            call_count[0] += 1
            if call_count[0] == 1:
                filt.first.return_value = ws
            elif call_count[0] == 2:
                # _require_workspace_member — user is active member
                active_row = MagicMock(); active_row.role = "viewer"
                filt.first.return_value = active_row
            else:
                filt.order_by.return_value.all.return_value = rows
            return mq

        db.query.side_effect = _q

        result = self._invoke("ws-1", user, db)
        self.assertEqual(len(result), 2)

    def test_C3_returns_both_active_and_pending(self):
        user = _make_current_user()
        ws = _make_workspace()
        rows = [
            _make_member_db(email="active@b.com", status="active"),
            _make_member_db(email="pending@b.com", status="pending", user_id=None),
        ]
        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            call_count[0] += 1
            if call_count[0] == 1:
                filt.first.return_value = ws
            elif call_count[0] == 2:
                active_row = MagicMock(); active_row.role = "admin"
                filt.first.return_value = active_row
            else:
                filt.order_by.return_value.all.return_value = rows
            return mq

        db.query.side_effect = _q

        result = self._invoke("ws-1", user, db)
        statuses = {r.status for r in result}
        self.assertIn("active", statuses)
        self.assertIn("pending", statuses)


# =============================================================================
# D — PUT /workspaces/{id}/members/{member_id}
# =============================================================================

class TestUpdateMemberRole(unittest.TestCase):

    def _invoke(self, workspace_id, member_id, role, current_user, db):
        from app.routers.workspace_members import update_member_role
        from app.models import WorkspaceMemberUpdate
        payload = WorkspaceMemberUpdate(role=role)
        return update_member_role(
            workspace_id=workspace_id,
            member_id=member_id,
            payload=payload,
            current_user=current_user,
            db=db,
        )

    def _simple_db(self, ws, caller_role, target_member, admin_count=2):
        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            model_name = getattr(model, "__name__", str(model))
            call_count[0] += 1
            if call_count[0] == 1:
                filt.first.return_value = ws
            elif call_count[0] == 2:
                caller = MagicMock(); caller.role = caller_role
                filt.first.return_value = caller
            elif call_count[0] == 3:
                filt.first.return_value = target_member
            elif call_count[0] == 4:
                filt.count.return_value = admin_count
            else:
                filt.first.return_value = None
            return mq

        db.query.side_effect = _q
        return db

    def test_D1_non_admin_gets_403(self):
        from fastapi import HTTPException
        user = _make_current_user()
        ws = _make_workspace()
        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            call_count[0] += 1
            if call_count[0] == 1:
                filt.first.return_value = ws
            else:
                viewer = MagicMock(); viewer.role = "viewer"
                filt.first.return_value = viewer
            return mq

        db.query.side_effect = _q

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", "member-id", "editor", user, db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_D2_unknown_member_returns_404(self):
        from fastapi import HTTPException
        user = _make_current_user()
        ws = _make_workspace()
        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            call_count[0] += 1
            if call_count[0] == 1:
                filt.first.return_value = ws
            elif call_count[0] == 2:
                admin = MagicMock(); admin.role = "admin"
                filt.first.return_value = admin
            else:
                filt.first.return_value = None  # member not found
            return mq

        db.query.side_effect = _q

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", "no-such", "viewer", user, db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_D3_cannot_demote_last_admin(self):
        from fastapi import HTTPException
        user = _make_current_user()
        ws = _make_workspace()
        only_admin = _make_member_db(role="admin", status="active")
        db = self._simple_db(ws, caller_role="admin", target_member=only_admin, admin_count=1)

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", only_admin.id, "viewer", user, db)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("only admin", ctx.exception.detail)

    def test_D4_can_demote_admin_when_another_exists(self):
        user = _make_current_user()
        ws = _make_workspace()
        target_admin = _make_member_db(role="admin", status="active")
        db = self._simple_db(ws, caller_role="admin", target_member=target_admin, admin_count=2)

        result = self._invoke("ws-1", target_admin.id, "viewer", user, db)
        self.assertEqual(target_admin.role, "viewer")
        db.commit.assert_called()

    def test_D5_valid_role_update_is_persisted(self):
        user = _make_current_user()
        ws = _make_workspace()
        target = _make_member_db(role="viewer", status="active")
        db = self._simple_db(ws, caller_role="admin", target_member=target, admin_count=1)

        result = self._invoke("ws-1", target.id, "editor", user, db)
        self.assertEqual(target.role, "editor")
        db.commit.assert_called()


# =============================================================================
# E — DELETE /workspaces/{id}/members/{member_id}
# =============================================================================

class TestRemoveMember(unittest.TestCase):

    def _invoke(self, workspace_id, member_id, current_user, db):
        from app.routers.workspace_members import remove_member
        return remove_member(
            workspace_id=workspace_id,
            member_id=member_id,
            current_user=current_user,
            db=db,
        )

    def _build_db_for_remove(self, ws, target_member, caller_is_admin=True, admin_count=2):
        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            call_count[0] += 1
            if call_count[0] == 1:
                filt.first.return_value = ws
            elif call_count[0] == 2:
                filt.first.return_value = target_member
            elif call_count[0] == 3:
                if caller_is_admin:
                    caller_row = MagicMock(); caller_row.role = "admin"
                    filt.first.return_value = caller_row
                else:
                    filt.first.return_value = None
            elif call_count[0] == 4:
                filt.count.return_value = admin_count
            else:
                filt.first.return_value = None
            return mq

        db.query.side_effect = _q
        return db

    def test_E1_non_admin_cannot_remove_other(self):
        from fastapi import HTTPException
        current_user = _make_current_user(uid="viewer-uid")
        ws = _make_workspace()
        # target is a different user
        target = _make_member_db(user_id="other-uid", role="viewer", status="active")
        db = self._build_db_for_remove(ws, target, caller_is_admin=False)

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", target.id, current_user, db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_E2_member_can_remove_themselves(self):
        current_user = _make_current_user(uid="self-uid")
        ws = _make_workspace()
        # target IS the current user, but not admin
        target = _make_member_db(user_id="self-uid", role="viewer", status="active")
        # admin_count=2 so viewer can self-remove without admin_count constraint
        db = self._build_db_for_remove(ws, target, caller_is_admin=False, admin_count=2)

        self._invoke("ws-1", target.id, current_user, db)
        db.delete.assert_called_once_with(target)
        db.commit.assert_called()

    def test_E3_cannot_remove_last_admin(self):
        from fastapi import HTTPException
        current_user = _make_current_user(uid="admin-uid")
        ws = _make_workspace()
        target = _make_member_db(user_id="admin-uid", role="admin", status="active")
        db = self._build_db_for_remove(ws, target, caller_is_admin=True, admin_count=1)

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", target.id, current_user, db)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("only admin", ctx.exception.detail)

    def test_E4_admin_can_remove_other_member(self):
        current_user = _make_current_user(uid="admin-uid")
        ws = _make_workspace()
        target = _make_member_db(user_id="viewer-uid", role="viewer", status="active")
        db = self._build_db_for_remove(ws, target, caller_is_admin=True, admin_count=2)

        self._invoke("ws-1", target.id, current_user, db)
        db.delete.assert_called_once_with(target)
        db.commit.assert_called()

    def test_E5_unknown_member_returns_404(self):
        from fastapi import HTTPException
        current_user = _make_current_user()
        ws = _make_workspace()
        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            call_count[0] += 1
            if call_count[0] == 1:
                filt.first.return_value = ws
            else:
                filt.first.return_value = None  # member not found
            return mq

        db.query.side_effect = _q

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ws-1", "no-such-member", current_user, db)
        self.assertEqual(ctx.exception.status_code, 404)


# =============================================================================
# F — GET /invites/{token}/accept
# =============================================================================

class TestAcceptInvite(unittest.TestCase):

    def _invoke(self, token, current_user, db):
        from app.routers.workspace_members import accept_invite
        return accept_invite(token=token, current_user=current_user, db=db)

    def test_F1_unknown_token_returns_404(self):
        from fastapi import HTTPException
        user = _make_current_user()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("bad-token", user, db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_F2_email_mismatch_returns_403(self):
        from fastapi import HTTPException
        user = _make_current_user(email="wrong@example.com")
        invite = _make_member_db(email="correct@example.com", status="pending", user_id=None)
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = invite

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("some-token", user, db)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("correct@example.com", ctx.exception.detail)

    def test_F3_already_active_invite_redirects_home(self):
        from fastapi.responses import RedirectResponse
        user = _make_current_user(email="admin@example.com")
        already_active = _make_member_db(email="admin@example.com", status="active")
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = already_active

        with patch("app.routers.workspace_members.settings") as mock_settings:
            mock_settings.public_base_url = "https://app.example.com"
            response = self._invoke("some-token", user, db)

        self.assertIsInstance(response, RedirectResponse)
        self.assertIn("/home", response.headers["location"])
        # Should NOT commit (no change needed)
        db.commit.assert_not_called()

    def test_F4_valid_accept_sets_active_state(self):
        from fastapi.responses import RedirectResponse
        user = _make_current_user(uid="new-user", email="invited@example.com")
        invite = _make_member_db(
            email="invited@example.com",
            status="pending",
            user_id=None,
            invite_token="valid-tok",
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = invite

        with patch("app.routers.workspace_members.settings") as mock_settings:
            mock_settings.public_base_url = "https://app.example.com"
            response = self._invoke("valid-tok", user, db)

        self.assertEqual(invite.user_id, "new-user")
        self.assertEqual(invite.status, "active")
        self.assertIsNone(invite.invite_token)
        self.assertIsNotNone(invite.accepted_at)
        db.commit.assert_called_once()
        self.assertIsInstance(response, RedirectResponse)
        self.assertIn("joined=1", response.headers["location"])


# =============================================================================
# G — plan_limits max_team_members
# =============================================================================

class TestPlanLimits(unittest.TestCase):

    def _limits(self, plan: str) -> dict:
        from app.services.plan_limits import get_limits
        return get_limits(plan)

    def test_G1_free_plan_solo_only(self):
        self.assertEqual(self._limits("Free")["max_team_members"], 1)

    def test_G2_professional_plan_solo_only(self):
        self.assertEqual(self._limits("Professional")["max_team_members"], 1)

    def test_G3_team_plan_10_members(self):
        self.assertEqual(self._limits("Team")["max_team_members"], 10)

    def test_G4_business_plan_50_members(self):
        self.assertEqual(self._limits("Business")["max_team_members"], 50)

    def test_G5_enterprise_plan_unlimited(self):
        self.assertEqual(self._limits("Enterprise")["max_team_members"], -1)


# =============================================================================
# H — Models and schema
# =============================================================================

class TestModels(unittest.TestCase):

    def test_H1_workspace_member_db_has_expected_columns(self):
        from app.models_db import WorkspaceMemberDB
        cols = {c.name for c in WorkspaceMemberDB.__table__.columns}
        for expected in ("id", "workspace_id", "user_id", "email", "role",
                         "status", "invite_token", "invited_by", "created_at", "accepted_at"):
            self.assertIn(expected, cols, f"Column '{expected}' missing from workspace_members table")

    def test_H2_workspace_member_invite_validates_role(self):
        from pydantic import ValidationError
        from app.models import WorkspaceMemberInvite
        # Valid roles
        for role in ("admin", "editor", "viewer"):
            m = WorkspaceMemberInvite(email="x@y.com", role=role)
            self.assertEqual(m.role, role)
        # Invalid role
        with self.assertRaises(ValidationError):
            WorkspaceMemberInvite(email="x@y.com", role="superuser")

    def test_H3_workspace_member_invite_default_role_is_viewer(self):
        from app.models import WorkspaceMemberInvite
        m = WorkspaceMemberInvite(email="x@y.com")
        self.assertEqual(m.role, "viewer")

    def test_H4_workspace_member_out_fields(self):
        from app.models import WorkspaceMemberOut
        out = WorkspaceMemberOut(
            id="m-1",
            workspace_id="ws-1",
            user_id="u-1",
            email="a@b.com",
            role="editor",
            status="active",
            invited_by="u-0",
            created_at="2026-01-01T00:00:00+00:00",
            accepted_at=None,
        )
        self.assertEqual(out.role, "editor")
        self.assertIsNone(out.accepted_at)

    def test_H5_workspace_has_owner_id_column(self):
        from app.models_db import Workspace
        cols = {c.name for c in Workspace.__table__.columns}
        self.assertIn("owner_id", cols)


if __name__ == "__main__":
    unittest.main()
