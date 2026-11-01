import json
import sys
from pathlib import Path

# Add AI-Service to path
sys.path.insert(0, str(Path(__file__).parent))

from app.schemas import DetectionRequest
from app.extractor import detect_and_extract_tasks
from app.model_loader import ModelManager

print("Initializing ModelManager...")
mgr = ModelManager.get_instance()
print(f"Model loaded: {mgr.is_loaded()}")
print(f"Model path: {mgr.model_path}")
print(f"Categories: {mgr.get_classes()}")
acc, f1 = mgr.get_metrics()
print(f"Test Accuracy: {acc}, Macro F1: {f1}")

cases = [
    {
        "name": "Clear Task",
        "message": "Meera, send the revised onboarding flow to design by Friday.",
        "sender": "Kabir",
        "timestamp": "2027-01-28T15:56:00+05:30",
        "team_members": ["Aarav", "Priya", "Vikram", "Meera", "Kabir"]
    },
    {
        "name": "Multi Task",
        "message": "Meera, review the new dashboard today and Kabir, fix the chart labels by Wednesday.",
        "sender": "Vikram",
        "timestamp": "2027-01-15T15:08:00+05:30",
        "team_members": ["Aarav", "Priya", "Vikram", "Meera", "Kabir"]
    },
    {
        "name": "Ambiguous (Two Rahuls)",
        "message": "Rahul can you merge the approved changes by EOD?",
        "sender": "Aditi",
        "timestamp": "2026-11-10T15:47:00+05:30",
        "team_members": ["Rahul Kumar", "Rahul Sharma", "Neha", "Aditi", "Manish"]
    },
    {
        "name": "Self Commitment",
        "message": "I'll share the build link by Friday morning.",
        "sender": "Aditi",
        "timestamp": "2026-12-18T15:38:00+05:30",
        "team_members": ["Rahul Kumar", "Rahul Sharma", "Neha", "Aditi", "Manish"]
    },
    {
        "name": "Non-Task (Banter)",
        "message": "Lunch at 1?",
        "sender": "Aarav",
        "timestamp": "2027-02-05T12:43:00+05:30",
        "team_members": ["Aarav", "Priya", "Vikram", "Meera", "Kabir"]
    },
    {
        "name": "Missing Info",
        "message": "Please arrange the consent forms for the survey.",
        "sender": "Sana",
        "timestamp": "2027-01-07T15:41:00+05:30",
        "team_members": ["Ishita", "Ananya", "Dev", "Rohan", "Sana"]
    }
]

print("\n" + "=" * 60)
print("TESTING DETECTION & EXTRACTION")
print("=" * 60)

for c in cases:
    req = DetectionRequest(
        message=c["message"],
        sender=c["sender"],
        timestamp=c["timestamp"],
        team_members=c["team_members"]
    )
    res = detect_and_extract_tasks(req)
    print(f"\n[{c['name']}] Message: \"{c['message']}\"")
    print(f"Predicted Category: {res.category} (Confidence: {res.confidence:.1%})")
    print(f"Is Task Candidate: {res.is_task_candidate} | Needs Confirmation: {res.needs_confirmation}")
    print(f"Extraction Status: {res.extraction_status}")
    if res.tasks:
        print(f"Tasks ({len(res.tasks)}):")
        for i, t in enumerate(res.tasks, 1):
            print(f"  #{i}: Title=\"{t.title}\" | Assignee={t.assignee} | DeadlineText=\"{t.deadline_text}\" | DeadlineDate={t.deadline_date} | Priority={t.priority}")
    else:
        print("Tasks: None")
    if res.warnings:
        print(f"Warnings: {res.warnings}")

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)

