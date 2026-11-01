#!/usr/bin/env python3
"""ActionFlow Message Classifier - Prediction & Inference CLI

Classifies chat messages into ActionFlow task categories:
  - clear_task (is_task=True)
  - multi_task (is_task=True)
  - self_commitment (is_task=True)
  - missing_info (is_task=True)
  - ambiguous (is_task=True, needs_confirmation=True)
  - not_task (is_task=False)
  - looks_like_task (is_task=False)

Usage:
  python predict.py "Amit, please fix the login bug today."
  python predict.py --json "Lunch at 1?"
  python predict.py --batch "message 1" "message 2"
"""

import argparse
import json
from pathlib import Path
import sys
import warnings

# Suppress unpickling version warnings for clean output
warnings.filterwarnings("ignore")

import joblib
import numpy as np

TASK_CATEGORIES = {
    "clear_task",
    "multi_task",
    "self_commitment",
    "missing_info",
    "ambiguous",
}

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = BASE_DIR / "models" / "message_classifier.joblib"

_cached_model = None


def load_model(model_path=DEFAULT_MODEL_PATH):
    global _cached_model
    if _cached_model is None:
        if not model_path.exists():
            raise FileNotFoundError(
                f"Trained model not found at '{model_path}'. "
                f"Please run 'python train_classifier.py' first."
            )
        _cached_model = joblib.load(model_path)
    return _cached_model


def classify_message(message: str, model=None) -> dict:
    if model is None:
        model = load_model()

    cleaned = message.strip()
    if not cleaned:
        return {
            "message": message,
            "category": "not_task",
            "is_task": False,
            "needs_confirmation": False,
            "confidence": 0.0,
        }

    category = model.predict([cleaned])[0]
    is_task = category in TASK_CATEGORIES
    needs_confirmation = category == "ambiguous"

    # Compute softmax confidence score over decision function
    confidence = 1.0
    if hasattr(model, "decision_function"):
        df = model.decision_function([cleaned])[0]
        # Softmax
        exp_scores = np.exp(df - np.max(df))
        probs = exp_scores / np.sum(exp_scores)
        predicted_idx = list(model.classes_).index(category)
        confidence = float(probs[predicted_idx])
    elif hasattr(model, "predict_proba"):
        probs = model.predict_proba([cleaned])[0]
        confidence = float(np.max(probs))

    return {
        "message": cleaned,
        "category": category,
        "is_task": is_task,
        "needs_confirmation": needs_confirmation,
        "confidence": round(confidence, 4),
    }


def main():
    parser = argparse.ArgumentParser(description="Classify chat messages for ActionFlow")
    parser.add_argument("messages", nargs="+", help="One or more chat messages to classify")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    args = parser.parse_args()

    model = load_model()
    results = [classify_message(msg, model=model) for msg in args.messages]

    if args.json:
        if len(results) == 1:
            print(json.dumps(results[0], indent=2))
        else:
            print(json.dumps(results, indent=2))
    else:
        for r in results:
            task_badge = "[TASK]" if r["is_task"] else "[NON-TASK]"
            ambig_badge = " (NEEDS CONFIRMATION)" if r["needs_confirmation"] else ""
            print(f"\nMessage: \"{r['message']}\"")
            print(f"Status:   {task_badge}{ambig_badge}")
            print(f"Category: {r['category']} (Confidence: {r['confidence']:.1%})")


if __name__ == "__main__":
    main()

