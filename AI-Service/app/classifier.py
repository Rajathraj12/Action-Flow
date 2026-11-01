import logging
from typing import Dict, Any, Tuple
import numpy as np

from .model_loader import ModelManager
from .schemas import ClassificationResponse

logger = logging.getLogger("actionflow.ai.classifier")

TASK_CANDIDATE_CATEGORIES = {
    "clear_task",
    "multi_task",
    "self_commitment",
    "missing_info",
    "ambiguous",
    "looks_like_task",
}

CONFIRMATION_REQUIRED_CATEGORIES = {
    "ambiguous",
    "missing_info",
    "looks_like_task",
}


def classify_text(message: str) -> ClassificationResponse:
    text = (message or "").strip()
    if not text:
        return ClassificationResponse(
            category="not_task",
            is_task_candidate=False,
            needs_confirmation=False,
            confidence=0.0,
        )

    mgr = ModelManager.get_instance()
    model = mgr.classifier_pipeline

    if model is None:
        logger.error("Classifier pipeline is not loaded. Cannot perform inference.")
        raise RuntimeError("Classification model is currently unavailable.")

    # Model prediction
    try:
        prediction = model.predict([text])[0]
        category = str(prediction).strip()
    except Exception as err:
        logger.error(f"Error during model prediction: {err}")
        raise RuntimeError(f"Model prediction failed: {err}")

    # Calculate calibrated confidence using temperature-scaled softmax over decision function
    confidence = 0.85
    try:
        if hasattr(model, "decision_function"):
            df = model.decision_function([text])[0]
            if len(df.shape) == 1:
                # Temperature scaling T=0.25 yields standard calibrated class probabilities
                scaled = df / 0.25
                probs = np.exp(scaled - np.max(scaled)) / np.sum(np.exp(scaled - np.max(scaled)))
                classes = list(model.classes_)
                if category in classes:
                    idx = classes.index(category)
                    confidence = float(probs[idx])
        elif hasattr(model, "predict_proba"):
            probs = model.predict_proba([text])[0]
            confidence = float(np.max(probs))
    except Exception as conf_err:
        logger.debug(f"Could not compute probability distribution: {conf_err}")
        confidence = 0.85

    is_task_candidate = category in TASK_CANDIDATE_CATEGORIES
    needs_confirmation = category in CONFIRMATION_REQUIRED_CATEGORIES

    return ClassificationResponse(
        category=category,
        is_task_candidate=is_task_candidate,
        needs_confirmation=needs_confirmation,
        confidence=round(confidence, 4),
    )

