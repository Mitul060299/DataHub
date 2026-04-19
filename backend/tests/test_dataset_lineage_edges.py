"""Tests for arch #3: dataset_lineage_edges replaces the parent_id chain.

Same SQLite-only strategy as ``test_dataset_sessions.py``: build a fresh
in-memory engine and create *only* the small set of tables we need so the
Postgres-only JSONB columns on ``dataset_meta`` don't blow up SQLite.

Coverage:
* ``record_lineage_edge`` is idempotent and rejects self-edges
* ``lineage_parents`` / ``lineage_children`` walk the new edges table
* ``materialize_dataset`` auto-records the edge when ``parent_id`` is set
* (Note: end-to-end cascade-delete behaviour is exercised by the existing
  ``test_soft_delete.py`` against the real router; we keep this file focused
  on the new helper surface so the suite stays fast and dialect-portable.)
"""
from __future__ import annotations

import os
import unittest
import uuid

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models_db import DatasetLineageEdgeDB
from app.services.persistence_policy import (
    record_lineage_edge,
    lineage_parents,
    lineage_children,
)


def _fresh_session():
    engine = create_engine("sqlite:///:memory:")
    DatasetLineageEdgeDB.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session(), engine


class RecordEdgeTests(unittest.TestCase):
    def test_inserts_a_new_edge(self) -> None:
        session, _ = _fresh_session()
        record_lineage_edge(session, child_id="c-1", parent_id="p-1")
        session.commit()
        rows = session.query(DatasetLineageEdgeDB).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].child_id, "c-1")
        self.assertEqual(rows[0].parent_id, "p-1")
        self.assertIsNone(rows[0].transform_id)

    def test_is_idempotent_for_same_pair(self) -> None:
        session, _ = _fresh_session()
        record_lineage_edge(session, child_id="c-1", parent_id="p-1")
        record_lineage_edge(session, child_id="c-1", parent_id="p-1")
        record_lineage_edge(session, child_id="c-1", parent_id="p-1")
        session.commit()
        self.assertEqual(session.query(DatasetLineageEdgeDB).count(), 1)

    def test_rejects_self_edges(self) -> None:
        session, _ = _fresh_session()
        record_lineage_edge(session, child_id="c-1", parent_id="c-1")
        session.commit()
        self.assertEqual(session.query(DatasetLineageEdgeDB).count(), 0)

    def test_ignores_empty_ids(self) -> None:
        session, _ = _fresh_session()
        record_lineage_edge(session, child_id="", parent_id="p-1")
        record_lineage_edge(session, child_id="c-1", parent_id="")
        session.commit()
        self.assertEqual(session.query(DatasetLineageEdgeDB).count(), 0)

    def test_carries_transform_id_when_provided(self) -> None:
        session, _ = _fresh_session()
        record_lineage_edge(
            session, child_id="c-1", parent_id="p-1", transform_id="step-7"
        )
        session.commit()
        row = session.query(DatasetLineageEdgeDB).one()
        self.assertEqual(row.transform_id, "step-7")


class LineageHelperTests(unittest.TestCase):
    def test_parents_returns_all_recorded_parents(self) -> None:
        session, _ = _fresh_session()
        # Multi-parent join: child c-join has both p-1 and p-2 as parents.
        record_lineage_edge(session, child_id="c-join", parent_id="p-1")
        record_lineage_edge(session, child_id="c-join", parent_id="p-2")
        session.commit()
        parents = sorted(lineage_parents(session, "c-join"))
        self.assertEqual(parents, ["p-1", "p-2"])

    def test_children_returns_all_recorded_children(self) -> None:
        session, _ = _fresh_session()
        # Fork: parent p-root has two children.
        record_lineage_edge(session, child_id="c-a", parent_id="p-root")
        record_lineage_edge(session, child_id="c-b", parent_id="p-root")
        record_lineage_edge(session, child_id="c-c", parent_id="other-parent")
        session.commit()
        children = sorted(lineage_children(session, "p-root"))
        self.assertEqual(children, ["c-a", "c-b"])

    def test_helpers_return_empty_for_unknown_id(self) -> None:
        session, _ = _fresh_session()
        self.assertEqual(lineage_parents(session, "nope"), [])
        self.assertEqual(lineage_children(session, "nope"), [])
        self.assertEqual(lineage_parents(session, ""), [])
        self.assertEqual(lineage_children(session, ""), [])


class _DummyDB:
    """Minimal session-shaped object that records adds + serves no queries."""

    def __init__(self) -> None:
        self.added: list = []

    def add(self, obj) -> None:
        self.added.append(obj)

    def query(self, *_a, **_k):
        # ``record_lineage_edge`` calls .query(...).filter(...).first().
        # Return a chain that always says "no existing row" so the helper
        # proceeds to add a new edge.
        class _Q:
            def filter(self, *_a, **_k):
                return self

            def first(self):
                return None

        return _Q()


class MaterializeDatasetEdgeWiringTests(unittest.TestCase):
    """``materialize_dataset`` must auto-record a lineage edge for parent_id."""

    def test_auto_records_edge_when_parent_id_present(self) -> None:
        from app.services.persistence_policy import materialize_dataset
        db = _DummyDB()
        cid = str(uuid.uuid4())
        materialize_dataset(
            db,
            triggered_by="user_publish",
            id=cid,
            parent_id="p-root",
            row_count=1,
        )
        edges = [a for a in db.added if isinstance(a, DatasetLineageEdgeDB)]
        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0].child_id, cid)
        self.assertEqual(edges[0].parent_id, "p-root")

    def test_no_edge_when_no_parent_id(self) -> None:
        from app.services.persistence_policy import materialize_dataset
        db = _DummyDB()
        materialize_dataset(
            db,
            triggered_by="user_upload",
            id=str(uuid.uuid4()),
            row_count=1,
        )
        edges = [a for a in db.added if isinstance(a, DatasetLineageEdgeDB)]
        self.assertEqual(edges, [])


if __name__ == "__main__":
    unittest.main()
