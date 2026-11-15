import calendar
from datetime import date, datetime, timedelta, timezone
import re
from typing import List, Optional, Tuple

WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
    "mon": 0,
    "tue": 1,
    "wed": 2,
    "thu": 3,
    "fri": 4,
    "sat": 5,
    "sun": 6,
}

WORD_TO_NUM = {
    "a": 1,
    "an": 1,
    "one": 1,
    "two": 2,
    "couple": 2,
    "couple of": 2,
    "three": 3,
    "few": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
}

PRIORITY_PATTERNS = [
    (r"\b(asap|urgent|urgently|emergency|critical)\b", "urgent"),
    (r"\b(high\s*priority|highest\s*priority|important)\b", "high"),
    (r"\b(low\s*priority|lowest\s*priority|no\s*rush|whenever\s*(you\s*get\s*time|free|possible))\b", "low"),
    (r"\b(medium\s*priority|normal\s*priority)\b", "medium"),
]


def parse_reference_datetime(timestamp_str: Optional[str]) -> datetime:
    tz_ist = timezone(timedelta(hours=5, minutes=30))
    if not timestamp_str:
        return datetime.now(tz_ist)

    try:
        # Standard ISO 8601 parse
        clean = timestamp_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(tz_ist)
    except Exception:
        return datetime.now(tz_ist)


def resolve_deadline(
    message_text: str,
    timestamp_str: Optional[str] = None
) -> Tuple[Optional[str], Optional[str]]:
    """
    Extracts deadline phrase and resolves it to an ISO date (YYYY-MM-DD)
    using the reference timestamp and ActionFlow labeling guidelines (v1, section 4).
    """
    ref_dt = parse_reference_datetime(timestamp_str)
    ref_date = ref_dt.date()
    ref_weekday = ref_date.weekday()

    text_lower = message_text.lower()

    # 0. Relative days (e.g. "two days from now", "in 2 days", "within 3 days", "3 days later", "after two days")
    m_rel_days = re.search(
        r"\b((?:by|before|in|within|after)\s+(?:a\s+)?)?(\d+|a|an|one|two|couple(?:\s+of)?|three|few|four|five|six|seven|eight|nine|ten)\s+days?(?:\s+(?:from\s+now|later))?\b",
        text_lower,
    )
    if m_rel_days:
        matched_str = m_rel_days.group(0).strip()
        num_raw = m_rel_days.group(2).lower()
        num = int(num_raw) if num_raw.isdigit() else WORD_TO_NUM.get(num_raw, 2)
        target = ref_date + timedelta(days=num)
        return matched_str, target.isoformat()

    # 0b. Relative weeks (e.g. "two weeks from now", "in 2 weeks", "a week from now", "within two weeks")
    m_rel_weeks = re.search(
        r"\b((?:by|before|in|within|after)\s+(?:a\s+)?)?(\d+|a|an|one|two|couple(?:\s+of)?|three|few|four)\s+weeks?(?:\s+(?:from\s+now|later))?\b",
        text_lower,
    )
    if m_rel_weeks:
        matched_str = m_rel_weeks.group(0).strip()
        num_raw = m_rel_weeks.group(2).lower()
        num = int(num_raw) if num_raw.isdigit() else WORD_TO_NUM.get(num_raw, 1)
        target = ref_date + timedelta(weeks=num)
        return matched_str, target.isoformat()

    # 0c. Relative months (e.g. "in a month", "two months from now")
    m_rel_months = re.search(
        r"\b((?:by|before|in|within|after)\s+(?:a\s+)?)?(\d+|a|an|one|two|three)\s+months?(?:\s+(?:from\s+now|later))?\b",
        text_lower,
    )
    if m_rel_months:
        matched_str = m_rel_months.group(0).strip()
        num_raw = m_rel_months.group(2).lower()
        num = int(num_raw) if num_raw.isdigit() else WORD_TO_NUM.get(num_raw, 1)
        target = ref_date + timedelta(days=30 * num)
        return matched_str, target.isoformat()

    # 0d. Relative hours (e.g. "in 24 hours", "within 48 hours")
    m_rel_hours = re.search(
        r"\b((?:by|before|in|within)\s+)?(\d+|a|an|one|two|three|four|five|six|eight|twelve|24|48)\s+hours?\b",
        text_lower,
    )
    if m_rel_hours:
        matched_str = m_rel_hours.group(0).strip()
        num_raw = m_rel_hours.group(2).lower()
        num = int(num_raw) if num_raw.isdigit() else WORD_TO_NUM.get(num_raw, 24)
        days = 2 if num >= 40 else (1 if num >= 18 else 0)
        target = ref_date + timedelta(days=days)
        return matched_str, target.isoformat()

    # 1. Day after tomorrow / Parso
    m_parso = re.search(r"\b(day\s*after\s*tomorrow|parso|parson)\b", text_lower)
    if m_parso:
        target = ref_date + timedelta(days=2)
        return m_parso.group(0), target.isoformat()

    # 2. Tomorrow / Kal / Kal tak / Kal subah
    m_tomorrow = re.search(r"\b(by\s*tomorrow(\s*(morning|evening|afternoon|night))?|tomorrow(\s*(morning|evening|afternoon|night))?|kal\s*tak|kal\s*subah(\s*tak)?|kal\s*evening(\s*tak)?|kal)\b", text_lower)
    if m_tomorrow:
        target = ref_date + timedelta(days=1)
        matched_phrase = m_tomorrow.group(0)
        return matched_phrase, target.isoformat()

    # 3. Today / Tonight / EOD / End of day / Aaj / Aaj tak
    m_today = re.search(r"\b(today|tonight|by\s*eod|eod|end\s*of\s*day|by\s*5\s*pm|by\s*end\s*of\s*day|aaj\s*tak|aaj)\b", text_lower)
    if m_today:
        return m_today.group(0), ref_date.isoformat()

    # 4. Next <Weekday> (e.g. "next Friday", "next Wednesday")
    # Rule: The weekday in the FOLLOWING calendar week
    m_next_weekday = re.search(
        r"\b(by\s*next\s*|before\s*next\s*|next\s*)(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b",
        text_lower,
    )
    if m_next_weekday:
        matched_str = m_next_weekday.group(0)
        target_name = m_next_weekday.group(2)
        target_wd = WEEKDAYS[target_name]
        # Days until next Monday (start of following calendar week)
        days_to_next_mon = 7 - ref_weekday
        target = ref_date + timedelta(days=days_to_next_mon + target_wd)
        return matched_str, target.isoformat()

    # 5. Bare or Prepositioned Weekday (e.g. "by Friday", "before Thursday", "on Friday", "Wednesday")
    # Rule: Next such day AFTER today. Bare weekday is never today (if today is Monday and message says Monday, +7 days).
    m_weekday = re.search(
        r"\b(by\s*|before\s*|on\s*|for\s*)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)('s\s*(call|demo|review|meeting|sync))?\b",
        text_lower,
    )
    if m_weekday:
        matched_str = m_weekday.group(0)
        target_name = m_weekday.group(2)
        target_wd = WEEKDAYS[target_name]
        diff = (target_wd - ref_weekday) % 7
        if diff == 0:
            diff = 7  # Bare weekday on same day means following week
        target = ref_date + timedelta(days=diff)
        return matched_str, target.isoformat()

    # 6. End of week / This week
    m_eow = re.search(r"\b(end\s*of\s*(the\s*)?week|this\s*week)\b", text_lower)
    if m_eow:
        # Friday of current week (4)
        days_to_fri = (4 - ref_weekday) % 7
        target = ref_date + timedelta(days=days_to_fri if days_to_fri > 0 else 7)
        return m_eow.group(0), target.isoformat()

    # 7. Next week
    m_next_week = re.search(r"\b(next\s*week|end\s*of\s*next\s*week)\b", text_lower)
    if m_next_week:
        # Friday of next week
        days_to_next_mon = 7 - ref_weekday
        target = ref_date + timedelta(days=days_to_next_mon + 4)
        return m_next_week.group(0), target.isoformat()

    # 8. End of month
    m_eom = re.search(r"\b(end\s*of\s*(the\s*)?month)\b", text_lower)
    if m_eom:
        _, last_day = calendar.monthrange(ref_date.year, ref_date.month)
        target = date(ref_date.year, ref_date.month, last_day)
        return m_eom.group(0), target.isoformat()

    # 9. Event-based deadlines (cannot compute exact calendar date)
    m_event = re.search(
        r"\b(before\s*the\s*demo|after\s*the\s*review|before\s*the\s*presentation|before\s*the\s*release|after\s*the\s*call|once\s*the\s*api\s*is\s*ready)\b",
        text_lower,
    )
    if m_event:
        return m_event.group(0), None

    return None, None


def resolve_priority(message_text: str) -> Optional[str]:
    text_lower = message_text.lower()
    for pattern, prio in PRIORITY_PATTERNS:
        if re.search(pattern, text_lower):
            return prio
    return None


def resolve_assignee(
    candidate_name: Optional[str],
    team_members: List[str],
    sender: Optional[str] = None,
    is_self_commitment: bool = False,
) -> Tuple[Optional[str], bool, Optional[str]]:
    """
    Resolves extracted name candidate against the active workspace roster.
    Returns: (resolved_member_name, is_ambiguous, warning_message)
    """
    clean_members = [m.strip() for m in team_members if m and m.strip()]

    # 1. Self-commitment: Assignee is the sender
    if is_self_commitment:
        if sender and sender.strip().lower() != "teammate":
            sender_clean = sender.strip()
            # Find exact or first-name match for sender in roster
            for m in clean_members:
                if m.lower() == sender_clean.lower() or m.lower().startswith(sender_clean.lower() + " "):
                    return m, False, None
            return sender_clean, False, None
        return None, False, None

    if not candidate_name or not candidate_name.strip():
        return None, False, None

    cand = candidate_name.strip()
    cand_lower = cand.lower()

    # 2. Exact match (case-insensitive)
    for m in clean_members:
        if m.lower() == cand_lower:
            return m, False, None

    # 3. First-name / Prefix matching
    matching_members = []
    for m in clean_members:
        first_name = m.split()[0].lower()
        if first_name == cand_lower or m.lower().startswith(cand_lower + " "):
            matching_members.append(m)

    if len(matching_members) == 1:
        return matching_members[0], False, None
    elif len(matching_members) > 1:
        # Ambiguous match (e.g. "Rahul" with "Rahul Kumar" and "Rahul Sharma")
        warning = (
            f"Name '{cand}' is ambiguous. Matches multiple workspace members: "
            f"{', '.join(matching_members)}. Human confirmation required."
        )
        return None, True, warning

    # Candidate not found in roster
    warning = f"Assignee candidate '{cand}' is not an active workspace member."
    return None, False, warning

