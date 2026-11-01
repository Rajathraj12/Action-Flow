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

PRIORITY_PATTERNS = [
    (r"\b(asap|urgent|urgently|emergency|critical)\b", "urgent"),
    (r"\b(high\s*priority|highest\s*priority|important)\b", "high"),
    (r"\b(low\s*priority|lowest\s*priority|no\s*rush|whenever\s*(you\s*get\s*time|free|possible))\b", "low"),
    (r"\b(medium\s*priority|normal\s*priority)\b", "medium"),
]


def parse_reference_datetime(timestamp_str: Optional[str]) -> datetime:
    if not timestamp_str:
        return datetime.now(timezone(timedelta(hours=5, minutes=30)))

    try:
        # Standard ISO 8601 parse
        clean = timestamp_str.replace("Z", "+00:00")
        return datetime.fromisoformat(clean)
    except Exception:
        return datetime.now(timezone(timedelta(hours=5, minutes=30)))


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
    if is_self_commitment and sender:
        sender_clean = sender.strip()
        # Find exact or first-name match for sender in roster
        for m in clean_members:
            if m.lower() == sender_clean.lower() or m.lower().startswith(sender_clean.lower() + " "):
                return m, False, None
        return sender_clean, False, None

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

