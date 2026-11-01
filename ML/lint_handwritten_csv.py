#!/usr/bin/env python3
"""Check (and optionally repair) a hand-written ActionFlow CSV against labeling_guidelines.md.

Report only:
  python lint_handwritten_csv.py data/my.csv --rosters v2
Repair the mechanical mistakes, writing a NEW csv plus a change log (the original is never touched):
  python lint_handwritten_csv.py data/my.csv --rosters v2 --fix data/my_corrected.csv --log data/my_changes.csv
Save the full report:  add  --report data/my_report.txt

ERR  = breaks a labeling rule (the importer/validator would reject it or the label is wrong)
WARN = suspicious, a human should look (never auto-changed)
FIX  = a mechanical change that --fix makes (listed in the change log)
"""
import argparse
import csv
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from rosters import ROSTER_SETS

TASK_CATS = {"clear_task", "multi_task", "self_commitment", "missing_info", "ambiguous"}
NO_TASK_CATS = {"not_task", "looks_like_task"}
WD = {"monday": 0, "somvar": 0, "tuesday": 1, "mangalvar": 1, "wednesday": 2, "budhvar": 2,
      "thursday": 3, "guruvar": 3, "friday": 4, "shukravar": 4}
FEMALE = {"Priya", "Meera", "Ishita", "Ananya", "Sana", "Farah", "Nisha", "Tanya", "Neha", "Aditi",
          "Simran", "Isha", "Tanvi"}
HI = set("kal aaj yaar hai hain karna karne karwane kar dena dungi dunga bhej kya chahiye raha rahi rahega "
         "rahegi pakka wali wala mein pe ka ki ke ko ne aur abhi bas nahi liye tak lena daal bahar mangwayein "
         "karo subah shaam baje ho se".split())
PRIORITY_CUE = re.compile(r"\b(asap|urgent|urgently|high priority|critical|important|top priority|no rush|"
                          r"no hurry|low priority|whenever|when free|when you get time|when you can)\b", re.I)
HIGH_CUE = re.compile(r"\b(asap|urgent|urgently|high priority|critical|top priority)\b", re.I)
EVENT_CUE = re.compile(r"\b(before|after|once) (the |we |this )?(next )?(release|demo|review|viva|stand-?up|sprint|"
                       r"launch|call|meeting|deployment|can close)\b", re.I)
REQUEST_CUE = re.compile(r"\bplease\b|\bcan you\b|\bcould you\b|\bneeds? to\b|dekh lena|kar dena|kar do|have a look", re.I)
STOP = {"the", "and", "for", "to", "of", "a", "an", "in", "on", "with", "from"}


def independent_date(text, d0):
    """Resolve a deadline phrase from the message date, stepping day by day (no clever arithmetic)."""
    t = text.lower()
    if "day after tomorrow" in t or "parso" in t:
        return d0 + timedelta(days=2)
    if "tomorrow" in t or re.search(r"\bkal\b", t):
        return d0 + timedelta(days=1)
    if "next week" in t or "agle hafte" in t:
        d = d0
        while d.weekday() != 0 or d == d0:
            d += timedelta(days=1)
        return d + timedelta(days=4)
    m = re.search(r"next (monday|tuesday|wednesday|thursday|friday)", t)
    if m:
        d = d0
        while d.weekday() != 0 or d == d0:
            d += timedelta(days=1)
        return d + timedelta(days=WD[m.group(1)])
    if "end of the week" in t or "this week" in t or "week ends" in t or "hafte ke end" in t:
        d = d0
        while d.weekday() != 4:
            d += timedelta(days=1)
        return d
    if "month end" in t or "end of the month" in t:
        d = d0
        while (d + timedelta(days=1)).month == d.month:
            d += timedelta(days=1)
        return d
    for w, idx in WD.items():
        if re.search(rf"\b{w}\b", t):
            d = d0 + timedelta(days=1)  # a bare weekday is never today
            while d.weekday() != idx:
                d += timedelta(days=1)
            return d
    if re.search(r"today|eod|tonight|5 pm|6 pm|aaj|end of day", t):
        return d0
    return None  # event-based ("before the demo"): no date


def mentioned(msg, member):
    return re.search(rf"\b{re.escape(member.split()[0])}\b", msg, re.I) is not None


def stems(text):
    return {w.rstrip("s") for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 2 and w not in STOP}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--rosters", default="v1", choices=sorted(ROSTER_SETS))
    ap.add_argument("--fix", metavar="OUT_CSV")
    ap.add_argument("--log", metavar="CHANGES_CSV")
    ap.add_argument("--report", metavar="REPORT_TXT")
    ap.add_argument("--spread-weeks", type=int, default=0, metavar="N",
                    help="with --fix: move each message by 0..N-1 WHOLE weeks (same weekday) so the data covers many dates; "
                         "deadline dates move by the same number of days")
    args = ap.parse_args()
    rosters = ROSTER_SETS[args.rosters]

    with open(args.csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames
        rows = [{k: (v or "").strip() for k, v in r.items() if k} for r in reader]

    issues, changes, out_rows = [], [], []
    if args.spread_weeks:
        for idx, r in enumerate(rows):
            try:
                shift = timedelta(days=7 * ((idx * 5) % args.spread_weeks))
                old = r["date"]
                r["date"] = (date.fromisoformat(old) + shift).isoformat()
                for i in (1, 2, 3):
                    if r.get(f"t{i}_deadline_date"):
                        r[f"t{i}_deadline_date"] = (date.fromisoformat(r[f"t{i}_deadline_date"]) + shift).isoformat()
                if shift:
                    changes.append((idx + 2, "date", old, r["date"], f"spread over weeks (+{shift.days} days, same weekday)"))
            except ValueError:
                pass
    seen_msgs = Counter(r["message"].strip().lower() for r in rows)

    for idx, row in enumerate(rows):
        n = idx + 2  # row number in the sheet (row 1 = header)
        w = dict(row)
        msg, cat = w["message"], w["category"]

        def flag(sev, code, text):
            issues.append((sev, n, code, text, msg))

        def change(field, new, reason):
            old = w.get(field, "")
            if old == new:
                return
            changes.append((n, field, old, new, reason))
            w[field] = new
            issues.append(("FIX", n, "auto-fix", f"{field}: '{old}' -> '{new}'  ({reason})", msg))

        if w["team"] not in rosters:
            flag("ERR", "team", f"unknown team '{w['team']}'")
            out_rows.append(w)
            continue
        try:
            d0 = date.fromisoformat(w["date"])
            hh, mm = w["time"].split(":")
            int(hh), int(mm)
        except Exception:
            flag("ERR", "date-time", f"bad date/time '{w['date']}' '{w['time']}'")
            out_rows.append(w)
            continue
        if d0.weekday() > 4:
            flag("WARN", "weekend", f"message sent on a weekend ({d0})")

        # ---- team / sender
        members = rosters[w["team"]]["members"]
        if w["sender"] not in members:
            hits = {t: sum(mentioned(msg, m) for m in r["members"]) for t, r in rosters.items()}
            if hits[w["team"]] > 0:  # names in the message belong to this team, so the sender is the odd one out
                avoid = {m for m in members if mentioned(msg, m)}
                cands = [m for m in members if m not in avoid] or members
                change("sender", cands[n % len(cands)], f"'{w['sender']}' is not in team {w['team']}")
                flag("WARN", "check-sender", f"sender replaced because '{row['sender']}' is not in team {w['team']}")
            else:
                other = [t for t, s in hits.items() if s > 0 and t != w["team"]]
                new_team = max(other, key=lambda t: hits[t]) if other else next(
                    (t for t, r in rosters.items() if w["sender"] in r["members"]), None)
                if new_team is None:
                    flag("ERR", "sender", f"sender '{w['sender']}' is in no team")
                    out_rows.append(w)
                    continue
                change("team", new_team, f"sender '{w['sender']}' / names in message belong to team {new_team}")
                flag("WARN", "check-team", f"team changed to {new_team}; confirm this is the team you meant")
                members = rosters[new_team]["members"]
        sender = w["sender"]

        # ---- language
        hindi_words = [t for t in re.findall(r"[a-z]+", msg.lower()) if t in HI]
        guess = "hinglish" if hindi_words else "en"
        if w["language"] != guess:
            change("language", guess, f"message {'has' if hindi_words else 'has no'} Hindi words {sorted(set(hindi_words))[:3]}")

        # ---- task presence
        present = [i for i in (1, 2, 3) if w.get(f"t{i}_title")]
        for i in (1, 2, 3):
            if i not in present and any(w.get(f"t{i}_{k}") for k in ("assignee", "deadline_text", "deadline_date", "priority")):
                flag("ERR", "orphan-fields", f"t{i} has fields but no title")
        if cat in NO_TASK_CATS and present:
            flag("ERR", "task-in-chat", f"{cat} must have no task fields")
        if cat in TASK_CATS and not present:
            flag("ERR", "no-task", f"{cat} needs a task")
        if cat == "multi_task" and len(present) < 2:
            flag("ERR", "multi-needs-two", "multi_task needs at least 2 tasks")
        if cat not in TASK_CATS | NO_TASK_CATS:
            flag("ERR", "category", f"unknown category '{cat}'")
        if cat in NO_TASK_CATS and REQUEST_CUE.search(msg):
            flag("WARN", "maybe-a-task", f"{cat} but has a request cue; per the guidelines a polite request is a task")

        # ---- assignees
        assignees = []
        for i in present:
            a = w.get(f"t{i}_assignee", "")
            if cat == "ambiguous":
                change(f"t{i}_assignee", "", "ambiguous: assignee must be blank")
                a = ""
            elif cat == "self_commitment":
                change(f"t{i}_assignee", sender, "self_commitment: assignee is the sender")
                a = sender
            elif a and a not in members:
                if sum(m.split()[0] == a for m in members) > 1:
                    change(f"t{i}_assignee", "", f"'{a}' matches more than one member, so the assignee must be blank")
                    flag("WARN", "check-category", f"bare '{a}' in a two-Rahul team: should this be category ambiguous?")
                    a = ""
                else:
                    flag("ERR", "assignee", f"assignee '{a}' is not in team {w['team']}")
            elif not a and cat in ("clear_task", "multi_task"):
                flag("ERR", "assignee-missing", f"{cat} needs an assignee")
            assignees.append(a)

        if cat in ("clear_task", "multi_task") and sender in assignees:
            avoid = set(assignees)
            cands = [m for m in members if m not in avoid]
            pref = [m for m in cands if not mentioned(msg, m)] or cands
            change("sender", pref[n % len(pref)], f"sender '{sender}' was also the assignee (talking to themselves)")
            sender = w["sender"]

        # ---- ambiguity rules
        bare_rahul = re.search(r"\bRahul\b(?!\s+(Sharma|Kumar))", msg, re.I) is not None
        if w["needs_confirmation"].lower() in ("yes", "y", "true", "1") and cat != "ambiguous":
            flag("ERR", "confirm-flag", "needs_confirmation is yes but category is not ambiguous")
        if cat == "ambiguous":
            if w["team"] != "two_rahuls":
                flag("ERR", "ambiguous-team", "ambiguous only makes sense in the two_rahuls team")
            if not bare_rahul:
                flag("ERR", "ambiguous-msg", "message does not contain a bare 'Rahul'")
            change("needs_confirmation", "yes", "ambiguous needs needs_confirmation = yes")
            if sender.startswith("Rahul"):
                others = [m for m in members if not m.startswith("Rahul")]
                change("sender", others[n % len(others)],
                       f"sender was {sender}, so 'Rahul' could only mean the other Rahul (not truly ambiguous)")
                sender = w["sender"]

        # ---- deadlines, priority, titles
        for i in present:
            txt, dt, pr = w.get(f"t{i}_deadline_text", ""), w.get(f"t{i}_deadline_date", ""), w.get(f"t{i}_priority", "")
            if txt and txt.lower() not in msg.lower():
                if HIGH_CUE.search(msg) and txt.lower() in ("today", "now"):
                    change(f"t{i}_deadline_text", "", "'today' is not in the message; ASAP/urgent is a priority, not a deadline")
                    change(f"t{i}_deadline_date", "", "no deadline was written in the message")
                    txt, dt = "", ""
                else:
                    flag("ERR", "deadline-text", f"t{i} deadline_text '{txt}' is not in the message")
            if txt:
                exp = independent_date(txt, d0)
                exp_s = exp.isoformat() if exp else ""
                if exp_s != dt:
                    change(f"t{i}_deadline_date", exp_s,
                           f"'{txt}' sent {d0:%a %Y-%m-%d} -> {exp_s or 'no date (event-based)'}  (bare weekday is never today)")
            elif dt:
                change(f"t{i}_deadline_date", "", "date without deadline_text")
            elif cat in TASK_CATS and EVENT_CUE.search(msg):
                flag("WARN", "event-deadline", "message has an event-based deadline ('before the ...') that is not in deadline_text")
            if pr and not PRIORITY_CUE.search(msg):
                change(f"t{i}_priority", "", "priority is not stated in the message")
                pr = ""
            if not pr and HIGH_CUE.search(msg) and len(present) == 1:
                flag("WARN", "priority-missing", "message says ASAP/urgent but priority is empty")
            title = w[f"t{i}_title"]
            if len(title.split()) > 8:
                flag("WARN", "title-long", f"title has more than 8 words: '{title}'")
            body = stems(" ".join(title.split()[1:]))
            if body and not (body & stems(msg)):
                flag("ERR", "title-mismatch", f"t{i} title '{title}' shares no words with the message")

        # ---- misc warnings
        if re.search(r"\bdungi\b", msg.lower()) and sender not in FEMALE:
            flag("WARN", "gender", f"feminine promise ('dungi') but sender {sender} is a male name")
        if re.search(r"\bdunga\b", msg.lower()) and sender in FEMALE:
            flag("WARN", "gender", f"masculine promise ('dunga') but sender {sender} is a female name")
        if seen_msgs[msg.lower()] > 1:
            flag("WARN", "duplicate", "duplicate message")
        out_rows.append(w)

    dates = {r["date"] for r in rows}
    if len(dates) < 10 and not args.spread_weeks:
        issues.append(("WARN", 0, "date-coverage",
                       f"all {len(rows)} messages are sent on only {len(dates)} different days "
                       f"({min(dates)} .. {max(dates)}); spread them over several weeks so date resolution is tested properly", ""))

    # ---- report
    by_code = Counter((s, c) for s, _, c, _, _ in issues)
    lines = [f"{len(rows)} rows checked", ""]
    for (s, c), k in sorted(by_code.items(), key=lambda kv: ({"ERR": 0, "WARN": 1, "FIX": 2}[kv[0][0]], -kv[1])):
        lines.append(f"{s:<5}{c:<18}{k}")
    lines.append("")
    for s in ("ERR", "WARN", "FIX"):
        lines.append(f"===== {s} =====")
        for sev, n, c, text, m in sorted((i for i in issues if i[0] == s), key=lambda i: (i[2], i[1])):
            lines.append(f"row {n:<4} [{c}] {text}" + (f"\n          \"{m[:90]}\"" if m else ""))
        lines.append("")
    report = "\n".join(lines)
    print(report if len(report) < 9000 else "\n".join(lines[:40]) + "\n... (full report: use --report)")
    if args.report:
        open(args.report, "w", encoding="utf-8").write(report)

    if args.fix:
        with open(args.fix, "w", encoding="utf-8-sig", newline="") as f:
            wr = csv.DictWriter(f, fieldnames=columns)
            wr.writeheader()
            wr.writerows(out_rows)
        print(f"\nwrote corrected CSV: {args.fix}")
    if args.log:
        with open(args.log, "w", encoding="utf-8-sig", newline="") as f:
            wr = csv.writer(f)
            wr.writerow(["sheet_row", "field", "old_value", "new_value", "reason"])
            wr.writerows(changes)
        print(f"wrote change log: {args.log} ({len(changes)} changes)")
    print("\nERR:", sum(1 for i in issues if i[0] == "ERR"), "| WARN:", sum(1 for i in issues if i[0] == "WARN"),
          "| auto-fixes:", len(changes))
    sys.exit(0)


if __name__ == "__main__":
    main()
