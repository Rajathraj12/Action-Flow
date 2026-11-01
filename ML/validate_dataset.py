#!/usr/bin/env python3
"""Check dataset files for mistakes and (optionally) split them into train/dev/test.

Check only:
  python validate_dataset.py data/seed_examples.jsonl data/handwritten.jsonl data/synthetic_raw.jsonl

Check and split (70/15/15, stratified by category, only reviewed records):
  python validate_dataset.py data/*.jsonl --split --out data/splits
"""
import argparse
import json
import random
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

CATEGORIES = {"clear_task", "multi_task", "self_commitment", "missing_info", "ambiguous", "not_task", "looks_like_task"}
MUST_BE_TASK = {"clear_task", "multi_task", "self_commitment", "missing_info", "ambiguous"}
MUST_NOT_BE_TASK = {"not_task", "looks_like_task"}
LANGUAGES = {"en", "hinglish"}
PRIORITIES = {None, "low", "medium", "high"}
TOP_KEYS = {"id", "source", "timestamp", "sender", "team_members", "message", "language",
            "is_task", "category", "tasks", "needs_confirmation", "reviewed"}
TASK_KEYS = {"title", "assignee", "deadline_text", "deadline_date", "priority"}


def check(rec):
    errors, warnings = [], []
    missing = TOP_KEYS - rec.keys()
    if missing:
        return [f"missing keys {sorted(missing)}"], warnings
    if rec.keys() - TOP_KEYS:
        warnings.append(f"unknown keys {sorted(rec.keys() - TOP_KEYS)}")

    try:
        ts = datetime.fromisoformat(rec["timestamp"])
    except (TypeError, ValueError):
        errors.append("timestamp must look like 2026-10-26T10:30:00+05:30")
        ts = None

    members = rec["team_members"]
    if not isinstance(members, list) or not members:
        errors.append("team_members must be a non-empty list")
        members = []
    if rec["sender"] not in members:
        errors.append(f"sender '{rec['sender']}' is not in team_members")
    if not isinstance(rec["message"], str) or not rec["message"].strip():
        errors.append("message is empty")
    if rec["language"] not in LANGUAGES:
        errors.append(f"language must be one of {sorted(LANGUAGES)}")
    if rec["category"] not in CATEGORIES:
        errors.append(f"unknown category '{rec['category']}'")

    tasks = rec["tasks"]
    if not isinstance(tasks, list):
        return errors + ["tasks must be a list"], warnings
    if rec["is_task"] != bool(tasks):
        errors.append("is_task must be true exactly when tasks is not empty")
    if rec["category"] in MUST_BE_TASK and not tasks:
        errors.append(f"category {rec['category']} needs at least one task")
    if rec["category"] in MUST_NOT_BE_TASK and tasks:
        errors.append(f"category {rec['category']} must have no tasks")
    if rec["category"] == "multi_task" and len(tasks) < 2:
        errors.append("multi_task needs at least 2 tasks")
    if rec["category"] == "ambiguous" and not rec["needs_confirmation"]:
        errors.append("ambiguous needs needs_confirmation = true")

    for i, t in enumerate(tasks, 1):
        tag = f"task {i}"
        if not isinstance(t, dict) or TASK_KEYS - t.keys():
            errors.append(f"{tag}: needs keys {sorted(TASK_KEYS)}")
            continue
        if not t["title"] or not str(t["title"]).strip():
            errors.append(f"{tag}: empty title")
        elif len(str(t["title"]).split()) > 8:
            warnings.append(f"{tag}: title longer than 8 words")
        if t["assignee"] is not None and t["assignee"] not in members:
            errors.append(f"{tag}: assignee '{t['assignee']}' is not in team_members")
        if rec["needs_confirmation"] and t["assignee"] is not None:
            errors.append(f"{tag}: needs_confirmation is true, so assignee must be null")
        if rec["category"] == "self_commitment" and t["assignee"] != rec["sender"]:
            errors.append(f"{tag}: self_commitment assignee must be the sender")
        if t["priority"] not in PRIORITIES:
            errors.append(f"{tag}: priority must be low, medium, high or null")
        if t["deadline_date"] is not None:
            try:
                d = date.fromisoformat(t["deadline_date"])
                if ts and d < ts.date():
                    errors.append(f"{tag}: deadline_date {d} is before the message date {ts.date()}")
            except (TypeError, ValueError):
                errors.append(f"{tag}: deadline_date must be YYYY-MM-DD or null")
            if t["deadline_text"] is None:
                warnings.append(f"{tag}: deadline_date set but deadline_text is null")
        elif t["deadline_text"] is not None:
            warnings.append(f"{tag}: deadline_text '{t['deadline_text']}' has no date (fine if event-based)")
    return errors, warnings


def stratified_split(records, seed=42):
    rng = random.Random(seed)
    groups = defaultdict(list)
    for r in records:
        groups[r["category"]].append(r)
    train, dev, test = [], [], []
    for cat in sorted(groups):
        items = groups[cat]
        rng.shuffle(items)
        n_test = round(len(items) * 0.15)
        n_dev = round(len(items) * 0.15)
        test += items[:n_test]
        dev += items[n_test:n_test + n_dev]
        train += items[n_test + n_dev:]
    return train, dev, test


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--split", action="store_true")
    ap.add_argument("--out", default="data/splits")
    ap.add_argument("--include-unreviewed", action="store_true")
    ap.add_argument("--holdout-source", metavar="SOURCE",
                    help="with --split: put every record whose source is SOURCE (e.g. handwritten) into dev and test "
                         "(half each, stratified) and all other records into train")
    args = ap.parse_args()

    records, problems = [], 0
    for p in args.paths:
        for n, line in enumerate(Path(p).read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            where = f"{p}:{n}"
            try:
                rec = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"ERROR {where}: invalid JSON ({exc})")
                problems += 1
                continue
            errs, warns = check(rec)
            for e in errs:
                print(f"ERROR {where} [{rec.get('id')}]: {e}")
            for w in warns:
                print(f"warn  {where} [{rec.get('id')}]: {w}")
            problems += len(errs)
            records.append(rec)

    ids = Counter(r.get("id") for r in records)
    for rid, c in ids.items():
        if c > 1:
            print(f"ERROR duplicate id {rid} appears {c} times")
            problems += 1
    msgs = Counter(str(r.get("message", "")).strip().lower() for r in records)
    for m, c in msgs.items():
        if c > 1:
            print(f"warn  duplicate message appears {c} times: {m[:60]}")

    print(f"\n{len(records)} records, {problems} errors")
    print("is_task:", dict(Counter(r.get("is_task") for r in records)))
    print("categories:", dict(Counter(r.get("category") for r in records)))
    print("language:", dict(Counter(r.get("language") for r in records)))
    print("source:", dict(Counter(r.get("source") for r in records)))
    print("reviewed:", dict(Counter(r.get("reviewed") for r in records)))

    if problems:
        print("\nFix the errors above before splitting.")
        sys.exit(1)

    if args.split:
        usable = [r for r in records if r["reviewed"] or args.include_unreviewed]
        if args.holdout_source:
            held = [r for r in usable if r.get("source") == args.holdout_source]
            train = [r for r in usable if r.get("source") != args.holdout_source]
            if not held:
                print(f"no usable records with source '{args.holdout_source}'")
                sys.exit(1)
            rng, groups = random.Random(42), defaultdict(list)
            for r in held:
                groups[r["category"]].append(r)
            dev, test = [], []
            for cat in sorted(groups):
                items = groups[cat]
                rng.shuffle(items)
                dev += items[: len(items) // 2]
                test += items[len(items) // 2:]
        else:
            train, dev, test = stratified_split(usable)
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        for name, part in (("train", train), ("dev", dev), ("test", test)):
            with (out / f"{name}.jsonl").open("w", encoding="utf-8") as f:
                for r in part:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            print(f"{name}: {len(part)} records -> {out / (name + '.jsonl')}")
        print("\nFreeze test.jsonl now. Do not tune prompts on it.")


if __name__ == "__main__":
    main()
