"""Diagnostic: why is DataTransformationService.execute_transformation not called?"""
import sys
import os
# Make sure backend/ is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("GROQ_API_KEY", "test-key")

from unittest.mock import MagicMock, patch

for m in ["chromadb", "chromadb.utils", "chromadb.config", "chromadb.api"]:
    sys.modules.setdefault(m, MagicMock())

from app.controllers.cleaning_controller import CleaningController
import app.controllers.cleaning_controller as cc_mod

called = []

def fake(ds_id, user_id, transformation, db):
    called.append(ds_id)
    return {"result": {"outputDataset": {"id": "out-1", "rowCount": 1}}}

mock_dts = MagicMock()
mock_dts.execute_transformation = fake

db = MagicMock()
db.query.return_value.filter.return_value.first.return_value = MagicMock(row_count=10)

print("DataTransformationService type:", type(cc_mod.DataTransformationService).__name__)

with patch("app.controllers.cleaning_controller.DataTransformationService", mock_dts):
    print("Is patched?", cc_mod.DataTransformationService is mock_dts)
    with patch("app.controllers.cleaning_controller.get_current_role", return_value="editor"), \
         patch("app.controllers.cleaning_controller.require_role"), \
         patch("app.controllers.cleaning_controller.get_current_subject", return_value="u1"):
        try:
            r = CleaningController.replay_steps(
                "ds-x", [{"sql": "SELECT 1"}], "Bearer x", db
            )
            print("Calls to fake:", called)
            print("Result:", r)
        except Exception as e:
            print("ERROR:", type(e).__name__, str(e))
            import traceback
            traceback.print_exc()
