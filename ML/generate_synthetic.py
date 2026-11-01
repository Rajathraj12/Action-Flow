#!/usr/bin/env python3
"""Generate synthetic, labeled chat messages for ActionFlow.

Everything produced here is a DRAFT: records are saved with reviewed=false and
must be checked by a human (see labeling_guidelines.md, section 7).

Setup:   pip install google-genai
Key:     set GEMINI_API_KEY (free key from Google AI Studio)
Check:   python generate_synthetic.py --dry-run          (prints one prompt, no API call)
Run:     python generate_synthetic.py --calls 30 --per-call 10
Output:  data/synthetic_raw.jsonl

To use another provider, only change call_llm().
"""
import argparse
import json
import os
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from rosters import ROSTERS

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")  # check the current name in AI Studio
IST = timezone(timedelta(hours=5, minutes=30))
OUT = Path(__file__).parent / "data" / "synthetic_raw.jsonl"

SCENARIOS = [
    "sprint planning for a mobile app",
    "fixing bugs before a release",
    "preparing a client demo",
    "designers handing screens over to developers",
    "final-year project submission and viva preparation",
    "organising a college tech fest",
    "launching a marketing campaign",
    "setting up servers and deployment",
    "writing documentation and test cases",
    "daily stand-up and status updates",
    "onboarding a new team member",
    "handling a customer complaint",
]

CATEGORY_WEIGHTS = {
    "clear_task": 22,
    "multi_task": 10,
    "self_commitment": 6,
    "missing_info": 10,
    "ambiguous": 8,
    "not_task": 24,
    "looks_like_task": 16,
}

CATEGORY_SPECS = {
    "clear_task": "ONE clear task given to ONE named team member, with or without a deadline. Include polite question-style requests ('can you...?') in about a third of them.",
    "multi_task": "ONE message that contains TWO or THREE separate tasks for one or more people.",
    "self_commitment": "The SENDER promises to do something ('I'll ...'). The assignee is the sender.",
    "missing_info": "A real task where the assignee, the deadline, or both are missing, e.g. 'Someone needs to...', 'Please update the docs'. Use null for the missing parts.",
    "ambiguous": "A task addressed ONLY by the first name 'Rahul', which matches two team members (Rahul Sharma and Rahul Kumar). Set assignee to null and needs_confirmation to true.",
    "not_task": "Normal chat with NO work to do: greetings, jokes, thanks, lunch or tea plans, opinions, celebrations.",
    "looks_like_task": "Messages that sound work-related but are NOT assignments: status updates about finished or ongoing work, vague wishes ('we should someday...'), questions that only ask for information, complaints, event reminders with no action.",
}

RULES = """RULES FOR LABELING
- A message is a TASK if it asks, assigns, or commits someone (possibly the sender) to do a concrete piece of work in the future. Polite requests count.
- NOT a task: greetings, small talk, thanks, status updates, opinions, vague wishes with no owner and no deadline, pure information questions, event reminders.
- A message can contain several tasks; list each one separately.
- assignee must be exactly one of the team members, or null. A self-commitment is assigned to the sender.
- deadline_text = the words from the message that give the deadline, or null.
- deadline_date = YYYY-MM-DD computed from the reference time, or null if it cannot be computed (e.g. 'before the demo').
  A bare weekday means the next such day AFTER the reference date. today/tonight/EOD = the reference date. tomorrow/kal = reference date + 1.
  'next week' or 'end of the week' = the Friday of that week.
- priority: only if the message says so ('urgent', 'ASAP' = high; 'no rush', 'whenever you get time' = low). Otherwise null.
- title: short imperative phrase, max 8 words, no dates."""

FORMAT = """Return ONLY a JSON array with exactly {n} objects and nothing else. Each object:
{{"sender": "<one team member>", "message": "<the chat message>", "needs_confirmation": false,
  "tasks": [{{"title": "...", "assignee": "<team member or null>", "deadline_text": "<words or null>",
             "deadline_date": "<YYYY-MM-DD or null>", "priority": "<low|medium|high or null>"}}]}}
Use "tasks": [] when the message contains no task."""


def random_timestamp(rng):
    day = datetime(2026, 10, 26, tzinfo=IST) + timedelta(days=rng.randint(0, 50))
    if day.weekday() >= 5 and rng.random() < 0.9:  # mostly weekdays
        day += timedelta(days=7 - day.weekday())
    return day.replace(hour=rng.randint(9, 19), minute=rng.choice([0, 5, 10, 15, 20, 30, 35, 40, 45, 50]))


def build_prompt(roster, scenario, category, language, ts, n):
    members = ", ".join(roster["members"])
    lang_note = (
        "Write in English."
        if language == "en"
        else "Write in Hinglish: Hindi written in Roman script mixed with English, the way Indian teams type on WhatsApp."
    )
    return (
        "You are helping build a labeled dataset for a team-chat app that detects work assignments.\n\n"
        + RULES
        + f"\n\nTEAM MEMBERS: {members}\n"
        + f"REFERENCE TIME (when every message below is sent): {ts.strftime('%A, %Y-%m-%d, %H:%M')} IST\n"
        + f"SCENARIO: {scenario}\n"
        + f"CATEGORY TO WRITE: {category}: {CATEGORY_SPECS[category]}\n"
        + f"LANGUAGE: {lang_note}\n\n"
        + f"Write {n} DIFFERENT messages for this category. Make them sound like real chat: short, informal, "
        "occasional abbreviations or typos, an emoji in about 1 of 10 messages. Vary the length and the "
        "sentence structure; do not start every message with a name. Do not repeat earlier phrasing.\n\n"
        + FORMAT.format(n=n)
    )


_client = None


def call_llm(prompt):
    """Swap this function to use another provider. Must return the raw JSON text."""
    global _client
    from google import genai
    from google.genai import types

    if _client is None:
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    resp = _client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=1.0),
    )
    return resp.text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--calls", type=int, default=30)
    ap.add_argument("--per-call", type=int, default=10)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--pause", type=float, default=5.0, help="seconds between API calls (free-tier rate limits)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    OUT.parent.mkdir(exist_ok=True)
    seen, next_id = set(), 1
    if OUT.exists():
        for line in OUT.read_text(encoding="utf-8").splitlines():
            if line.strip():
                seen.add(json.loads(line)["message"].strip().lower())
                next_id += 1

    added = 0
    for call_no in range(1, args.calls + 1):
        category = rng.choices(list(CATEGORY_WEIGHTS), weights=list(CATEGORY_WEIGHTS.values()))[0]
        key = "two_rahuls" if category == "ambiguous" else rng.choice([k for k in ROSTERS if k != "two_rahuls"])
        roster = ROSTERS[key]
        language = "hinglish" if rng.random() < 0.2 else "en"
        ts = random_timestamp(rng)
        prompt = build_prompt(roster, rng.choice(SCENARIOS), category, language, ts, args.per_call)

        if args.dry_run:
            print(prompt)
            return

        try:
            items = json.loads(call_llm(prompt))
        except Exception as exc:  # network, quota, bad JSON ...
            print(f"call {call_no}: failed ({exc}); waiting 15s")
            time.sleep(15)
            continue

        kept = 0
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict) or not isinstance(item.get("message"), str):
                continue
            if item.get("sender") not in roster["members"]:
                continue
            msg = item["message"].strip()
            if not msg or msg.lower() in seen:
                continue
            tasks = [
                {k: t.get(k) for k in ("title", "assignee", "deadline_text", "deadline_date", "priority")}
                for t in item.get("tasks") or []
                if isinstance(t, dict)
            ]
            rec = {
                "id": f"syn-{next_id:04d}",
                "source": "synthetic",
                "timestamp": ts.isoformat(),
                "sender": item["sender"],
                "team_members": roster["members"],
                "message": msg,
                "language": language,
                "is_task": bool(tasks),
                "category": category,
                "tasks": tasks,
                "needs_confirmation": bool(item.get("needs_confirmation", False)),
                "reviewed": False,
            }
            with OUT.open("a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            seen.add(msg.lower())
            next_id += 1
            kept += 1
        added += kept
        print(f"call {call_no}/{args.calls}: {category}/{language}, kept {kept} (total new: {added})")
        time.sleep(args.pause)


if __name__ == "__main__":
    main()
