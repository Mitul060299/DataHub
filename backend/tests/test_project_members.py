"""Tests for the project-level collaboration feature.

Coverage
--------
A — POST /projects/{id}/members  (invite_project_member)
    A1. Non-owner gets 403
    A2. Unknown project returns 404
    A3. Free plan owner gets plan-gate 403 (member_limit_reached)
    A4. Pro plan owner gets plan-gate 403 (member_limit_reached)
    A5. Team plan owner over per-project cap → 403 member_limit_reached
    A6. Team plan owner over collaborative-projects cap → 403
    A7. Duplicate active member → 409
    A8. Duplicate pending → refresh token + email
    A9. New invite creates pending row, lowercases email, sends email

B — GET /projects/{id}/members  (list_project_members)
    B1. Non-member non-owner → 403
    B2. Owner can list
    B3. Active member can list

C — PUT /projects/{id}/members/{member_id}  (update_project_member_role)
    C1. Non-owner → 403
    C2. Unknown member → 404
    C3. Owner role update is persisted

D — DELETE /projects/{id}/members/{member_id}  (remove_project_member)
    D1. Non-owner non-self → 403
    D2. Member can self-remove
    D3. Owner can remove anyone

E — accept_project_invite
    E1. Unknown token → 404
    E2. Email mismatch → 403
    E3. Already-active invite → redirect, no state change
    E4. Valid accept → status=active, user_id set, redirect with joined=1

F — plan_guard for project members
    F1. limits_for_plan returns expected max_project_members
    F2. limits_for_plan returns expected max_collaborative_projects
"""
from __future__ import annotations

import os
import sys
import uuid
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

# ── Stub heavy deps before any app import ─────────────────────────────────────
for _mod in [
    "chromadb", "chromadb.utils", "chromadb.config", "chromadb.api",
    "slowapi", "slowapi.util", "slowapi.errors", "slowapi.middleware",
]:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_user(uid="owner-1", email="owner@example.com", plan="Team"):
    from app.dependencies import CurrentUser
    return CurrentUser(id=uid, email=email, role="admin", plan=plan)


def _make_project(pid="proj-1", owner_id="owner-1", name="P1"):
    p = MagicMock()
    p.id = pid
    p.user_id = owner_id
    p.name = name
    return p


def _make_pmember(
    mid=None, project_id="proj-1", user_id=None,
    email="invitee@example.com", role="editor",
    status="pending", invite_token=None,
):
    m = MagicMock()
    m.id = mid or str(uuid.uuid4())
    m.project_id = project_id
    m.user_id = user_id
    m.email = email
    m.role = role
    m.status = status
    m.invite_token = invite_token or str(uuid.uuid4())
    m.invited_by = "owner-1"
    m.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    m.accepted_at = datetime(2026, 1, 2, tzinfo=timezone.utc) if status == "active" else None
    return m


# =============================================================================
# A — POST /projects/{id}/members
# =============================================================================

class TestInviteProjectMember(unittest.TestCase):

    def _invoke(self, project_id, payload_dict, current_user, db):
        from app.routers.project_members import invite_project_member
        from app.models import ProjectMemberInvite
        return invite_project_member(
            project_id=project_id,
            payload=ProjectMemberInvite(**payload_dict),
            current_user=current_user,
            db=db,
        )

    def _project_db(self, project, member_first=None):
        """A db that returns project on ProjectDB query, member_first on ProjectMemberDB."""
        db = MagicMock()

        def _q(model):
            mq = MagicMock()
            filt = MagicMock()
            mq.filter.return_value = filt
            filt.filter.return_value = filt
            name = getattr(model, "__name__", str(model))
            if "ProjectMember" in name:
                filt.first.return_value = member_first
                filt.count.return_value = 0
            elif "Project" in name:
                filt.first.return_value = project
            return mq

        db.query.side_effect = _q
        return db

    def test_A1_non_owner_gets_403(self):
        from fastapi import HTTPException
        proj = _make_project(owner_id="someone-else")
        user = _make_user(uid="not-owner")
        db = self._project_db(proj)
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("proj-1", {"email": "x@y.com"}, user, db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_A2_unknown_project_returns_404(self):
        from fastapi import HTTPException
        user = _make_user()
        db = self._project_db(project=None)
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("missing", {"email": "x@y.com"}, user, db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_A3_free_plan_blocked_with_member_limit_reached(self):
        from fastapi import HTTPException
        proj = _make_project()
        user = _make_user(plan="Free")
        db = self._project_db(proj)

        with patch("app.routers.project_members.resolve_project_plan",
                   return_value=("owner-1", "Free")):
            with self.assertRaises(HTTPException) as ctx:
                self._invoke("proj-1", {"email": "x@y.com"}, user, db)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail["code"], "member_limit_reached")

    def test_A4_pro_plan_blocked_with_member_limit_reached(self):
        from fastapi import HTTPException
        proj = _make_project()
        user = _make_user(plan="Professional")
        db = self._project_db(proj)

        with patch("app.routers.project_members.resolve_project_plan",
                   return_value=("owner-1", "Professional")):
            with self.assertRaises(HTTPException) as ctx:
                self._invoke("proj-1", {"email": "x@y.com"}, user, db)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail["code"], "member_limit_reached")

    def test_A5_team_owner_over_per_project_cap(self):
        from fastapi import HTTPException
        proj = _make_project()
        user = _make_user(plan="Team")
        db = self._project_db(proj)

        with patch("app.routers.project_members.resolve_project_plan",
                   return_value=("owner-1", "Team")), \
             patch("app.routers.project_members.enforce_project_member_limit",
                   side_effect=HTTPException(
                       status_code=403,
                       detail={"code": "member_limit_reached", "message": "cap reached"},
                   )):
            with self.assertRaises(HTTPException) as ctx:
                self._invoke("proj-1", {"email": "x@y.com"}, user, db)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail["code"], "member_limit_reached")

    def test_A6_team_owner_over_collab_projects_cap(self):
        from fastapi import HTTPException
        proj = _make_project()
        user = _make_user(plan="Team")
        db = self._project_db(proj)  # member_first=None, count=0 → triggers 0→1

        with patch("app.routers.project_members.resolve_project_plan",
                   return_value=("owner-1", "Team")), \
             patch("app.routers.project_members.enforce_project_member_limit"), \
             patch("app.routers.project_members.enforce_collaborative_project_limit",
                   side_effect=HTTPException(
                       status_code=403,
                       detail={"code": "collaborative_project_limit_reached"},
                   )):
            with self.assertRaises(HTTPException) as ctx:
                self._invoke("proj-1", {"email": "x@y.com"}, user, db)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(
            ctx.exception.detail["code"], "collaborative_project_limit_reached"
        )

    def test_A7_duplicate_active_member_returns_409(self):
        from fastapi import HTTPException
        proj = _make_project()
        user = _make_user(plan="Team")
        existing = _make_pmember(email="dupe@y.com", status="active")

        db = MagicMock()
        call_count = [0]

        def _q(model):
            mq = MagicMock(); filt = MagicMock()
            mq.filter.return_value = filt; filt.filter.return_value = filt
            name = getattr(model, "__name__", str(model))
            if "ProjectMember" in name:
                call_count[0] += 1
                filt.count.return_value = 1  # existing members count > 0 → skip collab cap
                if call_count[0] == 1:
                    # existing-member-count for the 0->1 collab check
                    pass
                filt.first.return_value = existing
            elif "Project" in name:
                filt.first.return_value = proj
            return mq

        db.query.side_effect = _q
        with patch("app.routers.project_members.resolve_project_plan",
                   return_value=("owner-1", "Team")), \
             patch("app.routers.project_members.enforce_project_member_limit"), \
             patch("app.routers.project_members.enforce_collaborative_project_limit"), \
             patch("app.routers.project_members.enforce_member_seat_limit"):
            with self.assertRaises(HTTPException) as ctx:
                self._invoke("proj-1", {"email": "dupe@y.com", "role": "editor"}, user, db)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_A8_duplicate_pending_refreshes_token(self):
        proj = _make_project()
        user = _make_user(plan="Team")
        existing = _make_pmember(email="pending@y.com", status="pending")

        db = MagicMock()

        def _q(model):
            mq = MagicMock(); filt = MagicMock()
            mq.filter.return_value = filt; filt.filter.return_value = filt
            name = getattr(model, "__name__", str(model))
            if "ProjectMember" in name:
                filt.first.return_value = existing
                filt.count.return_value = 1
            elif "Project" in name:
                filt.first.return_value = proj
            return mq

        db.query.side_effect = _q
        with patch("app.routers.project_members.resolve_project_plan",
                   return_value=("owner-1", "Team")), \
             patch("app.routers.project_members.enforce_project_member_limit"), \
             patch("app.routers.project_members.enforce_collaborative_project_limit"), \
             patch("app.routers.project_members.enforce_member_seat_limit"), \
             patch("app.routers.project_members.send_project_invite") as mock_email:
            self._invoke("proj-1", {"email": "pending@y.com", "role": "viewer"}, user, db)

        mock_email.assert_called_once()
        # Token must have been refreshed and committed
        db.commit.assert_called()

    def test_A9_new_invite_creates_pending_row(self):
        proj = _make_project()
        user = _make_user(plan="Team")
        db = MagicMock()

        def _q(model):
            mq = MagicMock(); filt = MagicMock()
            mq.filter.return_value = filt; filt.filter.return_value = filt
            name = getattr(model, "__name__", str(model))
            if "ProjectMember" in name:
                filt.first.return_value = None  # no existing member
                filt.count.return_value = 0
            elif "Project" in name:
                filt.first.return_value = proj
            return mq

        db.query.side_effect = _q
        added = []
        db.add.side_effect = added.append

        def _refresh(m):
            m.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
            m.accepted_at = None

        db.refresh.side_effect = _refresh

        with patch("app.routers.project_members.resolve_project_plan",
                   return_value=("owner-1", "Team")), \
             patch("app.routers.project_members.enforce_project_member_limit"), \
             patch("app.routers.project_members.enforce_collaborative_project_limit"), \
             patch("app.routers.project_members.enforce_member_seat_limit"), \
             patch("app.routers.project_members.send_project_invite") as mock_email:
            self._invoke("proj-1", {"email": "  NEW@Example.COM  ", "role": "viewer"}, user, db)

        self.assertEqual(len(added), 1)
        new = added[0]
        self.assertEqual(new.email, "new@example.com")  # lowercased + stripped
        self.assertEqual(new.role, "viewer")
        self.assertEqual(new.status, "pending")
        self.assertIsNone(new.user_id)
        self.assertIsNotNone(new.invite_token)
        mock_email.assert_called_once()


# =============================================================================
# B — GET /projects/{id}/members
# =============================================================================

class TestListProjectMembers(unittest.TestCase):

    def _invoke(self, project_id, current_user, db):
        from app.routers.project_members import list_project_members
        return list_project_members(
            project_id=project_id,
            current_user=current_user,
            db=db,
        )

    def test_B1_non_member_non_owner_gets_403(self):
        from fastapi import HTTPException
        proj = _make_project(owner_id="someone-else")
        user = _make_user(uid="random")

        db = MagicMock()

        def _q(model):
            mq = MagicMock(); filt = MagicMock()
            mq.filter.return_value = filt; filt.filter.return_value = filt
            name = getattr(model, "__name__", str(model))
            if "ProjectMember" in name:
                filt.first.return_value = None  # not a member
            elif "Project" in name:
                filt.first.return_value = proj
            return mq

        db.query.side_effect = _q
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("proj-1", user, db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_B2_owner_can_list(self):
        proj = _make_project(owner_id="owner-1")
        user = _make_user(uid="owner-1")
        rows = [_make_pmember(email="a@y.com", status="active")]

        db = MagicMock()

        def _q(model):
            mq = MagicMock(); filt = MagicMock()
            mq.filter.return_value = filt; filt.filter.return_value = filt
            name = getattr(model, "__name__", str(model))
            if "ProjectMember" in name:
                filt.order_by.return_value.all.return_value = rows
                filt.all.return_value = rows
            elif "Project" in name:
                filt.first.return_value = proj
            return mq

        db.query.side_effect = _q
        result = self._invoke("proj-1", user, db)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].email, "a@y.com")

    def test_B3_active_member_can_list(self):
        proj = _make_project(owner_id="someone-else")
        user = _make_user(uid="user-x")
        rows = [_make_pmember(email="a@y.com", status="active")]
        active_membership = _make_pmember(user_id="user-x", status="active")

        db = MagicMock()

        def _q(model):
            mq = MagicMock(); filt = MagicMock()
            mq.filter.return_value = filt; filt.filter.return_value = filt
            name = getattr(model, "__name__", str(model))
            if "ProjectMember" in name:
                # _require_project_access first; then order_by.all for the listing
                filt.first.return_value = active_membership
                filt.order_by.return_value.all.return_value = rows
                filt.all.return_value = rows
            elif "Project" in name:
                filt.first.return_value = proj
            return mq

        db.query.side_effect = _q
        result = self._invoke("proj-1", user, db)
        self.assertEqual(len(result), 1)


# =============================================================================
# C — PUT /projects/{id}/members/{member_id}
# =============================================================================

class TestUpdateProjectMemberRole(unittest.TestCase):

    def _invoke(self, project_id, member_id, payload_dict, current_user, db):
        from app.routers.project_members import update_project_member_role
        from app.models import ProjectMemberUpdate
        return update_project_member_role(
            project_id=project_id,
            member_id=member_id,
            payload=ProjectMemberUpdate(**payload_dict),
            current_user=current_user,
            db=db,
        )

    def test_C1_non_owner_gets_403(self):
        from fastapi import HTTPException
        proj = _make_project(owner_id="someone-else")
        user = _make_user(uid="not-owner")
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = proj

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("proj-1", "m-1", {"role": "viewer"}, user, db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_C2_unknown_member_returns_404(self):
        from fastapi import HTTPException
        proj = _make_project(owner_id="owner-1")
        user = _make_user(uid="owner-1")

        db = MagicMock()

        def _q(model):
            mq = MagicMock(); filt = MagicMock()
            mq.filter.return_value = filt; filt.filter.return_value = filt
            name = getattr(model, "__name__", str(model))
            if "ProjectMember" in name:
                filt.first.return_value = None
            elif "Project" in name:
                filt.first.return_value = proj
            return mq

        db.query.side_effect = _q
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("proj-1", "missing", {"role": "viewer"}, user, db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_C3_owner_role_update_persists(self):
        proj = _make_project(owner_id="owner-1")
        user = _make_user(uid="owner-1")
        member = _make_pmember(role="editor", status="active")

        db = MagicMock()

        def _q(model):
            mq = MagicMock(); filt = MagicMock()
            mq.filter.return_value = filt; filt.filter.return_value = filt
            name = getattr(model, "__name__", str(model))
            if "ProjectMember" in name:
                filt.first.return_value = member
            elif "Project" in name:
                filt.first.return_value = proj
            return mq

        db.query.side_effect = _q
        self._invoke("proj-1", member.id, {"role": "viewer"}, user, db)
        self.assertEqual(member.role, "viewer")
        db.commit.assert_called()


# =============================================================================
# D — DELETE /projects/{id}/members/{member_id}
# =============================================================================

class TestRemoveProjectMember(unittest.TestCase):

    def _invoke(self, project_id, member_id, current_user, db):
        from app.routers.project_members import remove_project_member
        return remove_project_member(
            project_id=project_id,
            member_id=member_id,
            current_user=current_user,
            db=db,
        )

    def _db_with(self, project, member):
        db = MagicMock()
        def _q(model):
            mq = MagicMock(); filt = MagicMock()
            mq.filter.return_value = filt; filt.filter.return_value = filt
            name = getattr(model, "__name__", str(model))
            if "ProjectMember" in name:
                filt.first.return_value = member
            elif "Project" in name:
                filt.first.return_value = project
            return mq
        db.query.side_effect = _q
        return db

    def test_D1_non_owner_non_self_gets_403(self):
        from fastapi import HTTPException
        proj = _make_project(owner_id="owner-1")
        user = _make_user(uid="other-user")
        member = _make_pmember(user_id="someone-else")
        db = self._db_with(proj, member)

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("proj-1", member.id, user, db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_D2_member_can_self_remove(self):
        proj = _make_project(owner_id="owner-1")
        user = _make_user(uid="self-user")
        member = _make_pmember(user_id="self-user")
        db = self._db_with(proj, member)

        self._invoke("proj-1", member.id, user, db)
        db.delete.assert_called_once_with(member)
        db.commit.assert_called()

    def test_D3_owner_can_remove_anyone(self):
        proj = _make_project(owner_id="owner-1")
        user = _make_user(uid="owner-1")
        member = _make_pmember(user_id="someone-else")
        db = self._db_with(proj, member)

        self._invoke("proj-1", member.id, user, db)
        db.delete.assert_called_once_with(member)


# =============================================================================
# E — accept_project_invite
# =============================================================================

class TestAcceptProjectInvite(unittest.TestCase):

    def _invoke(self, token, current_user, db):
        from app.routers.project_members import accept_project_invite
        return accept_project_invite(token=token, current_user=current_user, db=db)

    def test_E1_unknown_token_returns_404(self):
        from fastapi import HTTPException
        user = _make_user()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("bad-token", user, db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_E2_email_mismatch_returns_403(self):
        from fastapi import HTTPException
        user = _make_user(email="actual@example.com")
        member = _make_pmember(email="invited@example.com", status="pending")
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = member
        with self.assertRaises(HTTPException) as ctx:
            self._invoke(member.invite_token, user, db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_E3_already_active_redirects_silently(self):
        from fastapi.responses import RedirectResponse
        user = _make_user(email="a@y.com")
        member = _make_pmember(email="a@y.com", status="active", user_id="u-1")
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = member

        result = self._invoke(member.invite_token, user, db)
        self.assertIsInstance(result, RedirectResponse)
        # No state change
        db.commit.assert_not_called()

    def test_E4_valid_accept_activates_membership(self):
        from fastapi.responses import RedirectResponse
        user = _make_user(uid="new-user", email="invitee@example.com")
        member = _make_pmember(
            email="invitee@example.com", status="pending", user_id=None
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = member

        result = self._invoke(member.invite_token, user, db)

        self.assertIsInstance(result, RedirectResponse)
        self.assertEqual(member.status, "active")
        self.assertEqual(member.user_id, "new-user")
        self.assertIsNone(member.invite_token)
        self.assertIsNotNone(member.accepted_at)
        db.commit.assert_called()


# =============================================================================
# F — plan_guard PLAN_LIMITS for project members
# =============================================================================

class TestProjectPlanLimits(unittest.TestCase):

    def test_F1_max_project_members(self):
        from app.services.plan_guard import limits_for_plan
        self.assertEqual(limits_for_plan("Free").max_project_members, 1)
        self.assertEqual(limits_for_plan("Professional").max_project_members, 1)
        self.assertEqual(limits_for_plan("Team").max_project_members, 10)
        self.assertEqual(limits_for_plan("Business").max_project_members, 50)
        self.assertEqual(limits_for_plan("Enterprise").max_project_members, -1)

    def test_F2_max_collaborative_projects(self):
        from app.services.plan_guard import limits_for_plan
        self.assertEqual(limits_for_plan("Free").max_collaborative_projects, 0)
        self.assertEqual(limits_for_plan("Professional").max_collaborative_projects, 0)
        self.assertEqual(limits_for_plan("Team").max_collaborative_projects, 5)
        self.assertEqual(limits_for_plan("Business").max_collaborative_projects, -1)
        self.assertEqual(limits_for_plan("Enterprise").max_collaborative_projects, -1)


if __name__ == "__main__":
    unittest.main()
