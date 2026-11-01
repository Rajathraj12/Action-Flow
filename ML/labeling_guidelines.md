# ActionFlow: Labeling Guidelines (v1)

Everyone on the team labels with THESE rules. If two people disagree, the rule in this file wins.
If a case is not covered, discuss it, then add a line to section 6 so it stays consistent.

## 1. What we are labeling

One chat message at a time (v1 ignores earlier messages). For each message we decide:
1. Is it a task? (`is_task`)
2. If yes, what are the task(s)? (`tasks`: title, assignee, deadline_text, deadline_date, priority)
3. Which category does it belong to? (`category`, used to check that the dataset is balanced)

Every message also has context: `timestamp` (when it was sent), `sender`, `team_members` (the roster).
Names and dates are resolved against that context.

## 2. Is it a task?

A message is a TASK when it contains a concrete action that someone is asked, told, or promises to do in the future.

Counts as a task:
- Direct orders: "Rahul, fix the login bug."
- Polite requests / questions: "Can you review my PR by EOD?"
- Self-commitments: "I'll send the wireframes by Wednesday."
- "Needs to" statements: "Someone needs to update the README before the demo."
- Group requests: "Everyone please submit timesheets by Friday." (assignee = null)

NOT a task:
- Greetings, jokes, thanks, small talk, lunch plans
- Status of finished work: "Rahul finished the API yesterday."
- Status of ongoing work: "I'm working on the login page."
- Vague wishes with no owner and no deadline: "We should clean up the DB someday."
- Pure information questions: "What is the staging URL?"
- Reminders about events with no action: "Standup at 11."
- Cancellations: "Don't worry about the report anymore."
- Reports of someone else's promise: "Neha said she'd send the UI tomorrow."

Rule of thumb: concrete action + (a named owner OR a deadline OR a direct request / "needs to") = task.
Otherwise it is NOT a task.

## 3. Fields

| Field | Rule |
|---|---|
| title | Short imperative phrase, max 8 words, no names of the assignee, no dates. "Send updated UI to Rahul" is fine because Rahul is the recipient, not the owner. |
| assignee | EXACTLY one name from `team_members`, or null if nobody is named. Self-commitment = the sender. If the first name matches ONE roster member, use that member's full roster name. |
| needs_confirmation | true only when the assignee cannot be decided safely (two members share the first name). Then assignee MUST be null. |
| deadline_text | The words of the message that express the deadline ("by Friday", "kal tak"), or null. |
| deadline_date | `YYYY-MM-DD` resolved from `timestamp`, or null if no date can be computed. |
| priority | Only when the message says so. "urgent", "ASAP", "high priority", "important" = high. "whenever you get time", "low priority", "no rush" = low. "medium" is rarely used. Otherwise null. Never guess. |

One message can contain several tasks. List each one separately, in the order they appear.

## 4. Date rules

Examples assume the message was sent on Monday 2026-10-26.

| Words in the message | deadline_date |
|---|---|
| today, tonight, EOD, end of day, by 5 pm, aaj | 2026-10-26 |
| tomorrow, kal (when used about the future) | 2026-10-27 |
| day after tomorrow, parso | 2026-10-28 |
| Friday | 2026-10-30 (the next such day AFTER today) |
| Monday (said on a Monday) | 2026-11-02 (bare weekday is never today; write "today" if you mean today) |
| next Friday | 2026-11-06 (the Friday in the FOLLOWING calendar week) |
| end of the week, this week | 2026-10-30 (Friday of this week) |
| next week | 2026-11-06 (Friday of next week) |
| end of the month | 2026-10-31 |
| before the demo, after the review, once the API is ready | null (event-based, cannot be computed) |

Always check the weekday of the message date (the importer prints it) before writing a weekday deadline.

## 5. Categories (pick exactly one)

| category | Meaning | is_task |
|---|---|---|
| clear_task | One clear task for one named person | true |
| multi_task | Two or more tasks in one message | true |
| self_commitment | The sender promises to do something | true |
| missing_info | A real task but assignee or deadline (or both) is missing | true |
| ambiguous | Name matches two roster members, so needs_confirmation = true | true |
| not_task | Normal chat with no work | false |
| looks_like_task | Sounds like work but is NOT an assignment (status updates, wishes, info questions) | false |

Separate field `language`: `en` or `hinglish` (Hindi in Roman script mixed with English).

## 6. Decisions on tricky cases (add new ones here)

- "Can you...?" / "Could you...?" requests are tasks.
- "Let's finalize the logo by Thursday." = task, assignee null, deadline Thursday.
- "Sure, will do" / "Done" / "ok" on its own = not_task (v1 has no conversation context).
- "I'll start the login page tomorrow" = self_commitment (future). "I'm working on the login page" = not_task (present status).
- Group assignment ("Everyone submit...") = one task, assignee null, needs_confirmation false.
- Roster has "Rahul Sharma" and "Rahul Kumar" and the message says only "Rahul" = ambiguous.
- Two different people addressed with two actions = multi_task, two entries.

## 7. Review checklist (for every record you review)

1. Is `is_task` right under section 2?
2. Is every assignee spelled exactly like the roster, or null?
3. Does `deadline_date` match the weekday of `timestamp` and section 4?
4. Is the priority really stated in the message?
5. Is the title short and imperative?
6. Does the message sound like something a real team would type? If not, rewrite or delete it.
7. Set `"reviewed": true` only after all six checks pass.

## 8. Target dataset (about 480 messages)

| category | target |
|---|---|
| clear_task | 110 |
| multi_task | 50 |
| self_commitment | 30 |
| missing_info | 50 |
| ambiguous | 40 |
| not_task | 120 |
| looks_like_task | 80 |

At least 15% of all messages should be `hinglish`.
Sources: about 200 hand-written by the team, the rest AI-generated and then human-reviewed.
