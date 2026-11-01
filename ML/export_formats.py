#!/usr/bin/env python3
"""Turn the JSONL dataset into other formats.

  python export_formats.py data/seed_examples.jsonl data/synthetic_template.jsonl data/handwritten.jsonl --name all
  python export_formats.py data/splits_final/test.jsonl --name test

Writes into exports/ :
  <name>_detection.csv      one row per MESSAGE: is it a task? (Excel/Sheets, or a simple classifier)
  <name>_extraction.csv     one row per TASK: title, assignee, deadline, priority (Excel/Sheets, review)
  <name>_eval_pairs.jsonl   one line per message: {"id", "input": {what the AI is given}, "expected": {the right answer}}
                            this is what the evaluation script feeds to the LLM and scores against
"""
import argparse
import csv
import json
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--name", default="all")
    ap.add_argument("--out", default="exports")
    args = ap.parse_args()

    records = [json.loads(l) for p in args.paths for l in Path(p).read_text(encoding="utf-8").splitlines() if l.strip()]
    out = Path(args.out)
    out.mkdir(exist_ok=True)

    with open(out / f"{args.name}_detection.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "source", "language", "category", "sender", "timestamp", "message", "is_task"])
        for r in records:
            w.writerow([r["id"], r["source"], r["language"], r["category"], r["sender"], r["timestamp"],
                        r["message"], int(r["is_task"])])

    n_tasks = 0
    with open(out / f"{args.name}_extraction.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "source", "language", "category", "timestamp", "sender", "team_members", "message",
                    "task_no", "title", "assignee", "deadline_text", "deadline_date", "priority", "needs_confirmation"])
        for r in records:
            for i, t in enumerate(r["tasks"], 1):
                n_tasks += 1
                w.writerow([r["id"], r["source"], r["language"], r["category"], r["timestamp"], r["sender"],
                            "; ".join(r["team_members"]), r["message"], i, t["title"], t["assignee"] or "",
                            t["deadline_text"] or "", t["deadline_date"] or "", t["priority"] or "",
                            "yes" if r["needs_confirmation"] else ""])

    with open(out / f"{args.name}_eval_pairs.jsonl", "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps({
                "id": r["id"],
                "input": {"message": r["message"], "sender": r["sender"], "timestamp": r["timestamp"],
                          "team_members": r["team_members"]},
                "expected": {"is_task": r["is_task"], "needs_confirmation": r["needs_confirmation"], "tasks": r["tasks"]},
            }, ensure_ascii=False) + "\n")
    print(f"{args.name}: {len(records)} messages, {n_tasks} tasks -> {out}/{args.name}_(detection.csv, extraction.csv, eval_pairs.jsonl)")


if __name__ == "__main__":
    main()
