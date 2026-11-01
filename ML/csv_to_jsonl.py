#!/usr/bin/env python3
"""Convert a hand-written spreadsheet (exported as CSV) into dataset records.

Each team member fills handwritten_template.csv in Google Sheets, then:
  File > Download > Comma Separated Values (.csv)
  python csv_to_jsonl.py my_messages.csv --author komal

Records are appended to data/handwritten.jsonl. Nothing is written if any row has an error,
so fix the rows listed and run it again.

Sheet tips: format the `date` and `time` columns as PLAIN TEXT so Sheets does not change them.
  date = YYYY-MM-DD   time = HH:MM (24h)   team = a key from rosters.py
"""
import argparse
import csv
import json
import sys
from datetime import datetime
from pathlib import Path

from rosters import ROSTER_SETS

OUT = Path(__file__).parent / "data" / "handwritten.jsonl"
CATEGORIES = {"clear_task", "multi_task", "self_commitment", "missing_info", "ambiguous", "not_task", "looks_like_task"}


def clean(value):
    value = (value or "").strip()
    return value or None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--author", required=True, help="short lowercase name, used in record ids")
    ap.add_argument("--rosters", default="v1", choices=sorted(ROSTER_SETS), help="which team-member set the CSV uses (see rosters.py)")
    args = ap.parse_args()
    ROSTERS = ROSTER_SETS[args.rosters]

    existing = set()
    if OUT.exists():
        existing = {json.loads(line)["id"] for line in OUT.read_text(encoding="utf-8").splitlines() if line.strip()}

    records, errors = [], []
    with open(args.csv_path, encoding="utf-8-sig", newline="") as f:
        for n, row in enumerate(csv.DictReader(f), start=1):
            where = f"row {n + 1}"  # +1 because row 1 of the sheet is the header
            try:
                team = clean(row.get("team"))
                if team not in ROSTERS:
                    raise ValueError(f"team must be one of {sorted(ROSTERS)}")
                members = ROSTERS[team]["members"]
                date_s, time_s = clean(row.get("date")), clean(row.get("time")) or "10:00"
                hh, mm = time_s.split(":")
                ts = datetime.fromisoformat(f"{date_s}T{int(hh):02d}:{mm}:00+05:30")
                message = clean(row.get("message"))
                if not message:
                    raise ValueError("message is empty")
                category = clean(row.get("category"))
                if category not in CATEGORIES:
                    raise ValueError(f"category must be one of {sorted(CATEGORIES)}")
                language = clean(row.get("language")) or "en"

                tasks = []
                for i in (1, 2, 3):
                    title = clean(row.get(f"t{i}_title"))
                    if not title:
                        continue
                    priority = clean(row.get(f"t{i}_priority"))
                    tasks.append(
                        {
                            "title": title,
                            "assignee": clean(row.get(f"t{i}_assignee")),
                            "deadline_text": clean(row.get(f"t{i}_deadline_text")),
                            "deadline_date": clean(row.get(f"t{i}_deadline_date")),
                            "priority": priority.lower() if priority else None,
                        }
                    )
                rec = {
                    "id": f"hand-{args.author}-{n:03d}",
                    "source": "handwritten",
                    "timestamp": ts.isoformat(),
                    "sender": clean(row.get("sender")),
                    "team_members": members,
                    "message": message,
                    "language": language,
                    "is_task": bool(tasks),
                    "category": category,
                    "tasks": tasks,
                    "needs_confirmation": (clean(row.get("needs_confirmation")) or "").lower() in {"y", "yes", "true", "1"},
                    "reviewed": True,
                }
                if rec["id"] in existing:
                    raise ValueError("this id is already in the output file (already imported?)")
                records.append(rec)
                print(f"{where}: sent on {ts:%A %Y-%m-%d}  |  {message[:50]}")
            except Exception as exc:
                errors.append(f"{where}: {exc}")

    if errors:
        print("\nNothing was written. Fix these rows and run again:")
        print("\n".join("  " + e for e in errors))
        sys.exit(1)

    OUT.parent.mkdir(exist_ok=True)
    with OUT.open("a", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"\nAppended {len(records)} records to {OUT}")


if __name__ == "__main__":
    main()
