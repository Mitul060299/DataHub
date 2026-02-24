from typing import Dict, Any, List
import uuid
from datetime import datetime, timedelta
from ..models import TransformationRecipe
from ..config import settings


class RecipeVersion:
    def __init__(self, dataset_id: str, recipe: TransformationRecipe) -> None:
        self.version_id = str(uuid.uuid4())
        self.dataset_id = dataset_id
        self.steps = recipe.steps
        self.notes = recipe.notes
        self.created_at = datetime.utcnow().isoformat()


class RecipeStore:
    def __init__(self) -> None:
        self._recipes: Dict[str, TransformationRecipe] = {}
        self._history: Dict[str, List[RecipeVersion]] = {}
        self._retention_max_versions = settings.recipe_retention_max_versions
        self._retention_max_age_days = settings.recipe_retention_max_age_days

    def retention_policy(self) -> Dict[str, int]:
        return {
            "max_versions": self._retention_max_versions,
            "max_age_days": self._retention_max_age_days,
        }

    def set_retention_policy(self, max_versions: int | None = None, max_age_days: int | None = None) -> Dict[str, int]:
        if max_versions is not None:
            self._retention_max_versions = max_versions
        if max_age_days is not None:
            self._retention_max_age_days = max_age_days
        self._prune_all()
        return self.retention_policy()

    def _is_expired(self, version: RecipeVersion) -> bool:
        try:
            created_at = datetime.fromisoformat(version.created_at)
        except ValueError:
            return False
        threshold = datetime.utcnow() - timedelta(days=self._retention_max_age_days)
        return created_at < threshold

    def _prune_dataset(self, dataset_id: str) -> None:
        versions = self._history.get(dataset_id, [])
        if not versions:
            return

        filtered = [version for version in versions if not self._is_expired(version)]
        if len(filtered) > self._retention_max_versions:
            filtered = filtered[-self._retention_max_versions:]
        self._history[dataset_id] = filtered

    def _prune_all(self) -> None:
        for dataset_id in list(self._history.keys()):
            self._prune_dataset(dataset_id)

    def save(self, recipe: TransformationRecipe) -> None:
        self._recipes[recipe.dataset_id] = recipe
        versions = self._history.setdefault(recipe.dataset_id, [])
        versions.append(RecipeVersion(recipe.dataset_id, recipe))
        self._prune_dataset(recipe.dataset_id)

    def get(self, dataset_id: str) -> TransformationRecipe | None:
        return self._recipes.get(dataset_id)

    def history(self, dataset_id: str) -> List[RecipeVersion]:
        return self._history.get(dataset_id, [])

    def revert(self, dataset_id: str, version_id: str) -> TransformationRecipe | None:
        versions = self._history.get(dataset_id, [])
        for version in versions:
            if version.version_id == version_id:
                recipe = TransformationRecipe(
                    dataset_id=dataset_id,
                    steps=version.steps,
                    notes=version.notes,
                )
                self._recipes[dataset_id] = recipe
                return recipe
        return None


recipe_store = RecipeStore()
