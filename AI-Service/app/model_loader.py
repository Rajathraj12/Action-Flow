import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
import warnings

# Suppress version warnings when unpickling across patch releases
warnings.filterwarnings("ignore")

import joblib

logger = logging.getLogger("actionflow.ai.model_loader")

# Candidate directories for model artifacts
BASE_DIR = Path(__file__).resolve().parent.parent
SEARCH_PATHS = [
    BASE_DIR / "models",
    BASE_DIR.parent / "ML" / "models",
    Path("models"),
    Path("ML/models"),
]


class ModelManager:
    _instance: Optional["ModelManager"] = None

    def __init__(self):
        self.classifier_pipeline: Optional[Any] = None
        self.metadata: Dict[str, Any] = {}
        self.model_path: Optional[Path] = None
        self._load_artifacts()

    @classmethod
    def get_instance(cls) -> "ModelManager":
        if cls._instance is None:
            cls._instance = ModelManager()
        return cls._instance

    def _find_file(self, filename: str) -> Optional[Path]:
        for base in SEARCH_PATHS:
            candidate = base / filename
            if candidate.exists() and candidate.is_file():
                return candidate
        return None

    def _load_artifacts(self) -> None:
        model_file = self._find_file("message_classifier.joblib")
        comparison_file = self._find_file("model_comparison.json")

        if model_file is None:
            logger.error("Model artifact 'message_classifier.joblib' not found in search paths.")
            self.classifier_pipeline = None
            return

        try:
            logger.info(f"Loading trained model pipeline from {model_file}...")
            self.classifier_pipeline = joblib.load(model_file)
            self.model_path = model_file
            logger.info("Trained model pipeline loaded successfully.")
        except Exception as err:
            logger.error(f"Failed to load joblib model pipeline: {err}", exc_info=True)
            self.classifier_pipeline = None

        if comparison_file and comparison_file.exists():
            try:
                with open(comparison_file, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
            except Exception as err:
                logger.warning(f"Could not read model_comparison.json: {err}")
                self.metadata = {}

    def is_loaded(self) -> bool:
        return self.classifier_pipeline is not None

    def get_classes(self) -> list:
        if self.classifier_pipeline is not None and hasattr(self.classifier_pipeline, "classes_"):
            return list(self.classifier_pipeline.classes_)
        return [
            "ambiguous",
            "clear_task",
            "looks_like_task",
            "missing_info",
            "multi_task",
            "not_task",
            "self_commitment",
        ]

    def get_metrics(self) -> Tuple[Optional[float], Optional[float]]:
        test_res = self.metadata.get("test_results", {})
        acc = test_res.get("accuracy")
        f1 = test_res.get("macro_f1")
        return acc, f1

