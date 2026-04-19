"""Static guard: ``DatasetMetaDB`` / ``ArtifactDB`` rows must only be created
through ``app.services.persistence_policy``.

This test AST-walks every ``app/**.py`` file and fails if it finds a direct
constructor call to either model class outside the allow-list.  Type-hint
references, ``isinstance`` checks, and ``db.query(DatasetMetaDB)`` calls are
*not* flagged because they are not ``ast.Call`` nodes whose ``func`` is the
class name.
"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path

TARGETS = {"DatasetMetaDB", "ArtifactDB"}

# Files allowed to construct these rows directly.  Keep this list small.
ALLOWED_FILES: set[str] = {
    "app/models_db.py",                    # the class definitions themselves
    "app/services/persistence_policy.py",  # the only sanctioned creator
}


class _ConstructorVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.hits: list[tuple[int, str]] = []

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802 (ast API)
        func = node.func
        name: str | None = None
        if isinstance(func, ast.Name):
            name = func.id
        elif isinstance(func, ast.Attribute):
            name = func.attr
        if name in TARGETS:
            self.hits.append((node.lineno, name))
        self.generic_visit(node)


class PersistencePolicyGuardTests(unittest.TestCase):
    def test_no_direct_constructions_outside_policy_module(self) -> None:
        backend_root = Path(__file__).resolve().parents[1]
        violations: list[str] = []
        for py_file in (backend_root / "app").rglob("*.py"):
            rel = py_file.relative_to(backend_root).as_posix()
            if rel in ALLOWED_FILES:
                continue
            try:
                tree = ast.parse(py_file.read_text(encoding="utf-8", errors="ignore"))
            except SyntaxError:
                # Skip files we can't parse (unlikely, but don't break the build).
                continue
            visitor = _ConstructorVisitor()
            visitor.visit(tree)
            for line, name in visitor.hits:
                violations.append(f"{rel}:{line}: direct {name}(...) call")

        self.assertEqual(
            violations,
            [],
            "DatasetMetaDB / ArtifactDB must be created via "
            "app.services.persistence_policy.materialize_dataset / "
            "materialize_artifact.  Direct constructions found:\n"
            + "\n".join(violations),
        )


class PersistencePolicyHelperTests(unittest.TestCase):
    """Sanity checks on the helper itself."""

    def test_unknown_dataset_trigger_is_rejected(self) -> None:
        from app.services.persistence_policy import materialize_dataset

        class _DummyDB:
            def add(self, _row):  # noqa: D401
                raise AssertionError("should not reach add() on bad trigger")

        with self.assertRaises(ValueError):
            materialize_dataset(_DummyDB(), triggered_by="not_a_real_trigger", id="x")

    def test_unknown_artifact_trigger_is_rejected(self) -> None:
        from app.services.persistence_policy import materialize_artifact

        class _DummyDB:
            def add(self, _row):
                raise AssertionError("should not reach add() on bad trigger")

        with self.assertRaises(ValueError):
            materialize_artifact(_DummyDB(), triggered_by="bogus", id="x")


if __name__ == "__main__":
    unittest.main()
