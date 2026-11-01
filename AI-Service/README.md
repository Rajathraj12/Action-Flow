# ActionFlow AI Inference Service

A high-performance Python FastAPI service providing real-time message-to-task detection for **ActionFlow**.

---

## 1. Features
- **Trained Model Serving:** Loads the `message_classifier.joblib` Linear SVM once at startup.
- **7-Class Taxonomy:** Classifies chat messages (`clear_task`, `multi_task`, `self_commitment`, `missing_info`, `ambiguous`, `not_task`, `looks_like_task`).
- **Structured Extraction:** Extracts imperative task title, assignee, verbatim deadline phrase, and priority.
- **Context-Aware Resolution:** Resolves relative dates against the original message timestamp and maps assignees against workspace rosters.
- **Ambiguity Detection:** Identifies name collisions (e.g. multiple "Rahul"s on team) and flags them for manager review.
- **Internal Security:** Requires an internal shared API key (`x-api-key`) to prevent public exposure.

---

## 2. Setup & Installation

### Requirements
- Python 3.10+ (Tested on Python 3.13)
- Dependencies listed in `requirements.txt`

```bash
cd AI-Service
pip install -r requirements.txt
```

---

## 3. Running the Service

```bash
# From repository root or AI-Service directory:
python -m uvicorn AI-Service.app.main:app --host 127.0.0.1 --port 8000
```

Environment variables:
- `PORT` (default: `8000`)
- `HOST` (default: `127.0.0.1`)
- `AI_SERVICE_API_KEY` (default: `actionflow-internal-ai-key-2026`)
- `GEMINI_API_KEY` (optional, for LLM-enhanced extraction)

---

## 4. API Endpoints

### `GET /health`
Public health status and model metrics.
```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_name": "Linear SVM (TF-IDF Word + Char N-grams)",
  "categories": ["ambiguous", "clear_task", "looks_like_task", "missing_info", "multi_task", "not_task", "self_commitment"],
  "accuracy": 0.7349,
  "macro_f1": 0.7405,
  "version": "1.0.0"
}
```

### `POST /detect`
Requires header `x-api-key: actionflow-internal-ai-key-2026`.
```json
// Request
{
  "message": "Meera, review the new dashboard today and Kabir, fix the chart labels by Wednesday.",
  "sender": "Vikram",
  "timestamp": "2027-01-15T15:08:00+05:30",
  "team_members": ["Aarav", "Priya", "Vikram", "Meera", "Kabir"]
}

// Response
{
  "category": "multi_task",
  "is_task_candidate": true,
  "needs_confirmation": false,
  "confidence": 0.88,
  "tasks": [
    {
      "title": "Review new dashboard",
      "assignee": "Meera",
      "deadline_text": "today",
      "deadline_date": "2027-01-15",
      "priority": null,
      "confidence": 0.9
    },
    {
      "title": "Fix chart labels",
      "assignee": "Kabir",
      "deadline_text": "by Wednesday",
      "deadline_date": "2027-01-20",
      "priority": null,
      "confidence": 0.9
    }
  ],
  "warnings": [],
  "extraction_status": "success"
}
```

