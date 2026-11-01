import json
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).parent))

from app.schemas import DetectionRequest
from app.extractor import detect_and_extract_tasks
from app.model_loader import ModelManager

test_pairs_path = Path(__file__).parent.parent / "ML" / "exports" / "test_eval_pairs.jsonl"
if not test_pairs_path.exists():
    test_pairs_path = Path("ML/exports/test_eval_pairs.jsonl")

records = []
with open(test_pairs_path, "r", encoding="utf-8") as f:
    for line in f:
        if line.strip():
            records.append(json.loads(line))

total = len(records)
print(f"Loaded {total} test evaluation pairs from {test_pairs_path}")

is_task_matches = 0
needs_confirm_matches = 0
task_count_matches = 0
assignee_matches = 0
assignee_total = 0
deadline_date_matches = 0
deadline_date_total = 0

category_correct = 0

for r in records:
    inp = r["input"]
    exp = r["expected"]
    
    req = DetectionRequest(
        message=inp["message"],
        sender=inp.get("sender"),
        timestamp=inp.get("timestamp"),
        team_members=inp.get("team_members", [])
    )
    
    pred = detect_and_extract_tasks(req)
    
    # 1. is_task match
    if pred.is_task_candidate == exp["is_task"]:
        is_task_matches += 1
        
    # 2. needs_confirmation match
    if pred.needs_confirmation == exp["needs_confirmation"]:
        needs_confirm_matches += 1
        
    # 3. task count match
    if len(pred.tasks) == len(exp["tasks"]):
        task_count_matches += 1
        
    # 4. Field level matches
    for i in range(min(len(pred.tasks), len(exp["tasks"]))):
        pt = pred.tasks[i]
        et = exp["tasks"][i]
        
        assignee_total += 1
        # Check assignee
        if pt.assignee == et["assignee"]:
            assignee_matches += 1
            
        deadline_date_total += 1
        # Check deadline date
        if pt.deadline_date == et["deadline_date"]:
            deadline_date_matches += 1

print("\n" + "=" * 60)
print("EVALUATION RESULTS ON FROZEN TEST SET (83 records)")
print("=" * 60)
print(f"Is-Task Binary Detection Accuracy: {is_task_matches}/{total} ({is_task_matches/total:.1%})")
print(f"Needs-Confirmation Accuracy:        {needs_confirm_matches}/{total} ({needs_confirm_matches/total:.1%})")
print(f"Task Count Exact Match:             {task_count_matches}/{total} ({task_count_matches/total:.1%})")
if assignee_total > 0:
    print(f"Assignee Exact Match Accuracy:      {assignee_matches}/{assignee_total} ({assignee_matches/assignee_total:.1%})")
if deadline_date_total > 0:
    print(f"Deadline Date Exact Match Accuracy: {deadline_date_matches}/{deadline_date_total} ({deadline_date_matches/deadline_date_total:.1%})")
print("=" * 60)

