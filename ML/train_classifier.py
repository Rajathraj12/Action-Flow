
import json
from pathlib import Path

import joblib

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.naive_bayes import ComplementNB
from sklearn.ensemble import RandomForestClassifier

from sklearn.metrics import (
    accuracy_score,
    f1_score,
    classification_report,
    confusion_matrix
)


# ==================================================
# 1. PROJECT PATHS
# ==================================================

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data" / "splits_final"
MODEL_DIR = BASE_DIR / "models"

MODEL_DIR.mkdir(exist_ok=True)


# ==================================================
# 2. LOAD JSONL FILES
# ==================================================

def load_jsonl(file_path):

    if not file_path.exists():
        raise FileNotFoundError(
            f"File not found: {file_path}"
        )

    records = []

    with open(file_path, "r", encoding="utf-8") as file:

        for line_number, line in enumerate(file, start=1):

            if line.strip():

                try:
                    records.append(json.loads(line))

                except json.JSONDecodeError as error:

                    raise ValueError(
                        f"Invalid JSON at line {line_number}: {error}"
                    )

    return records


def prepare_data(records):

    messages = []
    labels = []

    for record in records:

        message = record.get("message")
        category = record.get("category")

        if not isinstance(message, str) or not message.strip():
            continue

        if not isinstance(category, str) or not category.strip():
            continue

        messages.append(message.strip())
        labels.append(category.strip())

    if not messages:
        raise ValueError("No valid records found.")

    return messages, labels


# ==================================================
# 3. LOAD DATASET
# ==================================================

train_records = load_jsonl(
    DATA_DIR / "train.jsonl"
)

dev_records = load_jsonl(
    DATA_DIR / "dev.jsonl"
)

test_records = load_jsonl(
    DATA_DIR / "test.jsonl"
)

X_train, y_train = prepare_data(train_records)
X_dev, y_dev = prepare_data(dev_records)
X_test, y_test = prepare_data(test_records)


print("\n========== DATASET INFORMATION ==========")

print("Training records:", len(X_train))
print("Validation records:", len(X_dev))
print("Testing records:", len(X_test))

print("\nTraining class distribution:")

for category in sorted(set(y_train)):

    print(
        f"{category}: {y_train.count(category)}"
    )


# ==================================================
# 4. TF-IDF FEATURE EXTRACTION
# ==================================================

def create_features():

    return FeatureUnion([

        (
            "word",

            TfidfVectorizer(
                analyzer="word",
                ngram_range=(1, 2),
                sublinear_tf=True,
                max_features=30000
            )
        ),

        (
            "character",

            TfidfVectorizer(
                analyzer="char",
                ngram_range=(2, 5),
                sublinear_tf=True,
                max_features=30000
            )
        )

    ])


# ==================================================
# 5. DEFINE FOUR CLASSIFICATION MODELS
# ==================================================

classifiers = {

    "Logistic Regression": LogisticRegression(
        max_iter=3000,
        class_weight="balanced",
        random_state=42
    ),

    "Linear SVM": LinearSVC(
        C=1.0,
        class_weight="balanced",
        random_state=42
    ),

    "Complement Naive Bayes": ComplementNB(
        alpha=0.5
    ),

    "Random Forest": RandomForestClassifier(
        n_estimators=300,
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=-1
    )

}


# ==================================================
# 6. TRAIN AND VALIDATE MODELS
# ==================================================

results = {}
trained_models = {}

print("\n========== MODEL TRAINING ==========")

for name, classifier in classifiers.items():

    print(f"\nTraining {name}...")

    model = Pipeline([

        ("features", create_features()),

        ("classifier", classifier)

    ])

    model.fit(X_train, y_train)

    dev_predictions = model.predict(X_dev)

    accuracy = accuracy_score(
        y_dev,
        dev_predictions
    )

    macro_f1 = f1_score(
        y_dev,
        dev_predictions,
        average="macro",
        zero_division=0
    )

    weighted_f1 = f1_score(
        y_dev,
        dev_predictions,
        average="weighted",
        zero_division=0
    )

    results[name] = {

        "accuracy": float(accuracy),

        "macro_f1": float(macro_f1),

        "weighted_f1": float(weighted_f1)

    }

    trained_models[name] = model

    print("Validation Accuracy:", round(accuracy, 4))

    print("Validation Macro F1:", round(macro_f1, 4))

    print("Validation Weighted F1:", round(weighted_f1, 4))


# ==================================================
# 7. COMPARE ALL MODELS
# ==================================================

print("\n========== MODEL COMPARISON ==========")

print(
    f"{'Model':<25}"
    f"{'Accuracy':<15}"
    f"{'Macro F1':<15}"
    f"{'Weighted F1':<15}"
)

print("-" * 70)

for name, scores in results.items():

    print(
        f"{name:<25}"
        f"{scores['accuracy']:<15.4f}"
        f"{scores['macro_f1']:<15.4f}"
        f"{scores['weighted_f1']:<15.4f}"
    )


# ==================================================
# 8. SELECT MODEL USING VALIDATION MACRO F1
# ==================================================

best_model_name = max(
    results,
    key=lambda name: results[name]["macro_f1"]
)

best_model = trained_models[best_model_name]

print("\n========== SELECTED MODEL ==========")

print("Model:", best_model_name)

print(
    "Validation Macro F1:",
    round(results[best_model_name]["macro_f1"], 4)
)


# ==================================================
# 9. FINAL TEST EVALUATION
# ==================================================

print("\n========== FINAL TEST EVALUATION ==========")

test_predictions = best_model.predict(X_test)

test_accuracy = accuracy_score(
    y_test,
    test_predictions
)

test_macro_f1 = f1_score(
    y_test,
    test_predictions,
    average="macro",
    zero_division=0
)

test_weighted_f1 = f1_score(
    y_test,
    test_predictions,
    average="weighted",
    zero_division=0
)

print("Selected model:", best_model_name)

print("Test Accuracy:", round(test_accuracy, 4))

print("Test Macro F1:", round(test_macro_f1, 4))

print("Test Weighted F1:", round(test_weighted_f1, 4))


print("\nClassification Report:")

print(
    classification_report(
        y_test,
        test_predictions,
        zero_division=0
    )
)


# ==================================================
# 10. CONFUSION MATRIX
# ==================================================

labels = sorted(set(y_train))

print("\nConfusion Matrix:")

print(
    confusion_matrix(
        y_test,
        test_predictions,
        labels=labels
    )
)

print("\nCategory order:")

print(labels)


# ==================================================
# 11. SAVE BEST MODEL
# ==================================================

model_path = (
    MODEL_DIR / "message_classifier.joblib"
)

joblib.dump(best_model, model_path)

print("\nBest model saved:")

print(model_path)


# ==================================================
# 12. SAVE COMPARISON RESULTS
# ==================================================

comparison_path = (
    MODEL_DIR / "model_comparison.json"
)

with open(
    comparison_path,
    "w",
    encoding="utf-8"
) as file:

    json.dump(
        {
            "selected_model": best_model_name,
            "validation_results": results,
            "test_results": {
                "accuracy": float(test_accuracy),
                "macro_f1": float(test_macro_f1),
                "weighted_f1": float(test_weighted_f1)
            }
        },
        file,
        indent=4
    )

print("\nComparison results saved:")

print(comparison_path)


# ==================================================
# 13. SAMPLE PREDICTIONS
# ==================================================

examples = [

    "Amit, please fix the login bug today.",

    "Lunch at 1?",

    "I'll send the wireframes by Wednesday.",

    "We need to discuss the project deadline.",

    "Please prepare the report before Friday."

]

print("\n========== SAMPLE PREDICTIONS ==========")

for message in examples:

    prediction = best_model.predict([message])[0]

    print("\nMessage:", message)

    print("Predicted category:", prediction)

    classifier = best_model.named_steps["classifier"]

    if hasattr(classifier, "predict_proba"):

        probabilities = best_model.predict_proba([message])[0]

        print(
            f"Confidence: {max(probabilities):.2%}"
        )

    else:

        print(
            "Probability confidence: Not available "
            "for this model."
        )


print("\n========== TRAINING COMPLETED ==========")
