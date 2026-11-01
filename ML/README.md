# ActionFlow - Machine Learning & NLP Service

This directory contains the machine learning dataset, training pipeline, and trained classification model for **ActionFlow**.

ActionFlow automatically detects, categorizes, and converts chat messages into actionable tasks.

---

## 1. Directory Structure

```
ML/
├── data/
│   ├── splits_final/          # Final holdout stratified train/dev/test splits
│   │   ├── train.jsonl        # 493 records (synthetic + seed data)
│   │   ├── dev.jsonl          # 82 records (real human hand-written holdout)
│   │   └── test.jsonl         # 83 records (real human hand-written holdout)
│   ├── handwritten.jsonl      # 165 hand-written team chat messages
│   ├── seed_examples.jsonl    # 13 gold-standard seed examples
│   ├── synthetic_template.jsonl # 480 synthetic template-generated messages
│   └── ...
├── models/
│   ├── message_classifier.joblib  # Trained scikit-learn LinearSVC pipeline
│   └── model_comparison.json      # Benchmark metrics across 4 models
├── exports/                   # Flattened CSV and eval_pairs.jsonl
├── predict.py                 # CLI & Python module for inference
├── train_classifier.py        # Model benchmarking & training script
├── validate_dataset.py        # Dataset validation and split generator
├── build_synthetic_dataset.py # Synthetic template data generator
├── generate_synthetic.py      # LLM-assisted synthetic data generator
├── csv_to_jsonl.py            # Converts human-labeled CSV into JSONL
├── lint_handwritten_csv.py    # Quality control and linting for human CSV
├── export_formats.py          # Exports JSONL to evaluation & CSV formats
├── rosters.py                 # Team rosters for context-aware entity resolution
├── labeling_guidelines.md     # Annotation taxonomy and rules
├── NEXT_STEPS.md              # Roadmap and downstream LLM extractor design
├── requirements.txt           # Python dependencies
└── README.md                  # This file
```

---

## 2. Classification Taxonomy (7 Categories)

| Category | Is Task? | Needs Confirmation? | Description & Example |
|---|---|---|---|
| `clear_task` | **Yes** | No | One unambiguous task for one person. *"Amit, please fix the login bug today."* |
| `multi_task` | **Yes** | No | Multiple tasks within a single message. *"Rahul, review the PR; Neha, update Figma."* |
| `self_commitment` | **Yes** | No | Sender commits themselves to future work. *"I'll send the wireframes by Wednesday."* |
| `missing_info` | **Yes** | No | A real task lacking assignee or deadline. *"Someone needs to update the README."* |
| `ambiguous` | **Yes** | **Yes** | Assignee name matches multiple team members. *"Rahul, test the build."* (Rahul Sharma vs Rahul Kumar) |
| `not_task` | **No** | No | Casual banter, lunch, greetings, questions. *"Lunch at 1?"*, *"Good morning all"* |
| `looks_like_task` | **No** | No | Status of ongoing/past work or vague wishes. *"I'm working on the login page right now."* |

---

## 3. Model Architecture & Benchmark

### Feature Extraction
- **Word n-grams:** Range `(1, 2)`, Sublinear TF scaling, max 30,000 features.
- **Character n-grams:** Range `(2, 5)`, Sublinear TF scaling, max 30,000 features (handles typos and Romanized Hinglish).
- Combined via scikit-learn `FeatureUnion`.

### Classifier Comparison (Validation Set)
| Model | Validation Accuracy | Macro F1 | Weighted F1 | Selected? |
|---|---|---|---|---|
| **Linear SVM (LinearSVC)** | **70.73%** | **72.95%** | **69.09%** | **Yes (Best)** |
| Logistic Regression | 69.51% | 72.26% | 67.26% | No |
| Random Forest (300 trees) | 69.51% | 71.62% | 69.14% | No |
| Complement Naive Bayes | 58.54% | 59.87% | 57.82% | No |

### Final Evaluation on Holdout Test Set (Real Hand-written Messages)
- **Test Accuracy:** `73.49%`
- **Test Macro F1:** `74.05%`
- **Test Weighted F1:** `72.89%`

---

## 4. Quickstart & Usage

### Setup Environment
```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

### Run Predictions
```bash
# Single message
python predict.py "Amit, please fix the login bug today."

# Multiple messages with JSON output
python predict.py --json "Lunch at 1?" "I'll submit the report tomorrow"
```

### Python API
```python
from predict import classify_message

result = classify_message("Neha, update the landing page before Friday.")
print(result)
# {
#   "message": "Neha, update the landing page before Friday.",
#   "category": "clear_task",
#   "is_task": True,
#   "needs_confirmation": False,
#   "confidence": 0.42
# }
```

### Retrain Model
```bash
python train_classifier.py
```
Model artifacts will be written to `models/message_classifier.joblib` and `models/model_comparison.json`.

