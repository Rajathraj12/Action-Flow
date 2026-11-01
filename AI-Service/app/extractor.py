import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from .classifier import classify_text
from .resolver import resolve_assignee, resolve_deadline, resolve_priority
from .schemas import DetectionRequest, DetectionResponse, TaskSuggestion

logger = logging.getLogger("actionflow.ai.extractor")

CLEAN_TITLE_PREFIXES = [
    r"^(please\s*|can\s*you\s*please\s*|can\s*you\s*|could\s*you\s*please\s*|could\s*you\s*|we\s*need\s*to\s*|need\s*to\s*|someone\s*needs\s*to\s*|someone\s*should\s*|kindly\s*|just\s*)",
    r"^(i'll\s*|i\s*will\s*|i\s*can\s*|main\s*)",
]

REMOVE_TRAILING_DEADLINES = [
    r"\s+(by|before|on|for)\s+(today|tonight|tomorrow|yesterday|eod|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)('s\s*(call|demo|review|meeting|sync))?(\s*(morning|evening|afternoon|night))?.*$",
    r"\s+(today|tonight|tomorrow|parso|kal|aaj)(\s*(morning|evening|afternoon|night|tak))?.*$",
    r"\s+asap\s*.*$",
]


def clean_task_title(text: str, assignee_name: Optional[str] = None) -> str:
    """
    Cleans raw clause into a concise imperative title (max 8 words, no dates or leading assignee).
    """
    cleaned = text.strip()

    # Remove leading assignee address like "Meera, " or "Aditi please "
    if assignee_name:
        first = assignee_name.split()[0]
        cleaned = re.sub(rf"^(hey\s+)?{re.escape(assignee_name)}[,\s:]*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(rf"^(hey\s+)?{re.escape(first)}[,\s:]*", "", cleaned, flags=re.IGNORECASE)

    # Remove general leading name pattern like "Name, " if matching a single word
    cleaned = re.sub(r"^[A-Z][a-z]+[,\s:]+", "", cleaned)

    # Remove polite imperatives and helper words
    for prefix in CLEAN_TITLE_PREFIXES:
        cleaned = re.sub(prefix, "", cleaned, flags=re.IGNORECASE)

    # Remove trailing deadlines and urgency markers from the title
    for d_pat in REMOVE_TRAILING_DEADLINES:
        cleaned = re.sub(d_pat, "", cleaned, flags=re.IGNORECASE)

    # Remove trailing punctuation
    cleaned = re.sub(r"[\.,;:!?]+$", "", cleaned).strip()

    # If title is empty, fallback to first 6 words of original text
    if not cleaned or len(cleaned) < 3:
        cleaned = " ".join(text.split()[:6])

    # Capitalize first letter
    if cleaned:
        cleaned = cleaned[0].upper() + cleaned[1:]

    # Truncate to max 8-10 words
    words = cleaned.split()
    if len(words) > 8:
        cleaned = " ".join(words[:8])

    return cleaned


def split_multi_task_clauses(text: str, team_members: List[str]) -> List[str]:
    """
    Splits multi-task messages into separate task clauses based on punctuation,
    coordinate conjunctions, or transitions between team member names.
    """
    # 1. Split on semicolons or distinct period sentences
    raw_clauses = re.split(r";\s*|\.\s+(?=[A-Z])", text)
    clauses: List[str] = []

    for rc in raw_clauses:
        clause = rc.strip()
        if not clause:
            continue

        # Look for conjunctions with member names: "..., and Priya, ..."
        # or "and [Name],"
        split_by_and = re.split(r",?\s+and\s+(?=[A-Z])", clause, flags=re.IGNORECASE)
        if len(split_by_and) > 1:
            for s in split_by_and:
                if s.strip():
                    clauses.append(s.strip())
        else:
            clauses.append(clause)

    return clauses if clauses else [text]


def extract_candidate_name_from_clause(
    clause: str,
    team_members: List[str]
) -> Optional[str]:
    """
    Detects which team member is addressed or mentioned in a clause.
    """
    clause_lower = clause.lower()

    # Look for full names first
    for member in team_members:
        if member.lower() in clause_lower:
            return member

    # Look for first names at the beginning or after prepositions: "Meera, ...", "Need Rahul to ..."
    for member in team_members:
        first = member.split()[0].lower()
        # Word boundary match
        pattern = rf"\b{re.escape(first)}\b"
        if re.search(pattern, clause_lower):
            return member.split()[0]

    return None


def extract_tasks_deterministic(
    message: str,
    category: str,
    sender: Optional[str] = None,
    timestamp: Optional[str] = None,
    team_members: Optional[List[str]] = None,
    base_confidence: float = 0.88,
) -> Tuple[List[TaskSuggestion], List[str], bool]:
    """
    Rule-based extraction engine crafted strictly against ActionFlow dataset annotations.
    """
    members = team_members or []
    tasks: List[TaskSuggestion] = []
    warnings: List[str] = []
    needs_confirmation = category in {"ambiguous", "missing_info", "looks_like_task"}

    if category == "not_task":
        return [], warnings, False

    # Multi-task handling
    if category == "multi_task":
        clauses = split_multi_task_clauses(message, members)
        if len(clauses) < 2:
            # Fallback if clause splitting didn't find clear dividers
            clauses = [message]
    else:
        clauses = [message]

    for clause in clauses:
        # 1. Identify Candidate Name
        is_self = (category == "self_commitment") or bool(re.search(r"\b(i'll|i\s*will|i\s*can|main)\b", clause, re.IGNORECASE))
        candidate_name = None if is_self else extract_candidate_name_from_clause(clause, members)

        # 2. Resolve Assignee
        resolved_assignee, is_ambig, ambig_warning = resolve_assignee(
            candidate_name=candidate_name,
            team_members=members,
            sender=sender,
            is_self_commitment=is_self,
        )

        if ambig_warning:
            warnings.append(ambig_warning)
        if is_ambig:
            needs_confirmation = True

        # 3. Extract and Resolve Deadline
        d_text, d_date = resolve_deadline(clause, timestamp)

        # 4. Extract Priority
        prio = resolve_priority(clause)

        # 5. Extract Clean Imperative Title
        title = clean_task_title(clause, candidate_name or resolved_assignee)

        task_conf = base_confidence
        if resolved_assignee:
            task_conf = min(0.98, max(task_conf, 0.88))
            if prio == "urgent":
                task_conf = min(0.98, max(task_conf, 0.94))
        else:
            task_conf = min(0.85, max(task_conf, 0.76))

        tasks.append(
            TaskSuggestion(
                title=title,
                assignee=resolved_assignee,
                deadline_text=d_text,
                deadline_date=d_date,
                priority=prio,
                confidence=round(task_conf, 2),
            )
        )

    # In missing_info category, flag if assignee or deadline is missing
    if category == "missing_info":
        for t in tasks:
            if not t.assignee or not t.deadline_date:
                needs_confirmation = True
                warnings.append("Task details (assignee or deadline) are incomplete. Please review.")

    return tasks, warnings, needs_confirmation


def extract_tasks_llm(
    message: str,
    sender: Optional[str],
    timestamp: Optional[str],
    team_members: List[str],
) -> Optional[List[TaskSuggestion]]:
    """
    Optional LLM extractor using Gemini if GEMINI_API_KEY is configured.
    Falls back gracefully if unavailable.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        prompt = (
            f"You are ActionFlow Task Extractor.\n"
            f"Message: {message}\n"
            f"Sender: {sender}\n"
            f"Timestamp: {timestamp}\n"
            f"Team: {team_members}\n"
            f"Extract JSON: {{\"tasks\": [{{\"title\": str, \"assignee\": str or null, \"deadline_text\": str or null, \"priority\": str or null}}]}}"
        )
        response = client.models.generate_content(
            model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
            contents=prompt,
        )
        text = response.text
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            data = json.loads(match.group(0))
            task_list = []
            for item in data.get("tasks", []):
                d_text, d_date = resolve_deadline(item.get("deadline_text") or message, timestamp)
                task_list.append(
                    TaskSuggestion(
                        title=item.get("title", "Task"),
                        assignee=item.get("assignee"),
                        deadline_text=d_text,
                        deadline_date=d_date,
                        priority=item.get("priority"),
                        confidence=0.95,
                    )
                )
            if task_list:
                return task_list
    except Exception as err:
        logger.warning(f"LLM extraction skipped or failed: {err}. Falling back to deterministic.")

    return None


def detect_and_extract_tasks(req: DetectionRequest) -> DetectionResponse:
    """
    Full ActionFlow pipeline:
    1. Fast Linear SVM Classification (7 classes)
    2. Structured Task Extraction (Deterministic + Optional LLM)
    3. Roster & Deadline Resolution
    """
    # 1. Classification
    cls_result = classify_text(req.message)
    category = cls_result.category
    is_task_candidate = cls_result.is_task_candidate

    if not is_task_candidate:
        return DetectionResponse(
            category=category,
            is_task_candidate=False,
            needs_confirmation=False,
            confidence=cls_result.confidence,
            tasks=[],
            warnings=[],
            extraction_status="no_task" if category == "not_task" else "status_update",
        )

    # 2. Structured Task Extraction
    # Try LLM first if configured, otherwise deterministic extractor
    llm_tasks = extract_tasks_llm(req.message, req.sender, req.timestamp, req.team_members or [])
    if llm_tasks:
        tasks = llm_tasks
        warnings = []
        needs_confirmation = category in {"ambiguous", "missing_info"}
    else:
        tasks, warnings, needs_confirmation = extract_tasks_deterministic(
            message=req.message,
            category=category,
            sender=req.sender,
            timestamp=req.timestamp,
            team_members=req.team_members or [],
            base_confidence=cls_result.confidence,
        )

    status = "needs_clarification" if needs_confirmation else "success"

    return DetectionResponse(
        category=category,
        is_task_candidate=True,
        needs_confirmation=needs_confirmation,
        confidence=cls_result.confidence,
        tasks=tasks,
        warnings=warnings,
        extraction_status=status,
    )

