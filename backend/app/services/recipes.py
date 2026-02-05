from typing import Dict, Any, List
import uuid
from datetime import datetime
from ..models import TransformationRecipe


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

    def save(self, recipe: TransformationRecipe) -> None:
        self._recipes[recipe.dataset_id] = recipe
        versions = self._history.setdefault(recipe.dataset_id, [])
        versions.append(RecipeVersion(recipe.dataset_id, recipe))

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
