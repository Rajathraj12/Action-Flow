#!/usr/bin/env python3
"""Build a labeled SYNTHETIC dataset for ActionFlow from templates (no API key, no cost).

Labels are produced by construction, so names, dates and categories are consistent with
labeling_guidelines.md. Dates are computed in code, never by an LLM.

    python build_synthetic_dataset.py                 # about 480 records
    python build_synthetic_dataset.py --seed 8        # a different random draw
    python build_synthetic_dataset.py --scale 2       # about 960 records

Outputs (in data/):
    synthetic_template.jsonl        the records (reviewed = false until a human spot-checks them)
    synthetic_template_review.csv   the same records as a flat sheet for Google Sheets review
"""
import argparse
import csv
import json
import random
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from rosters import ROSTERS

IST = timezone(timedelta(hours=5, minutes=30))
DATA = Path(__file__).parent / "data"
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
HI_WD = {"Monday": "Somvar", "Tuesday": "Mangalvar", "Wednesday": "Budhvar", "Thursday": "Guruvar", "Friday": "Shukravar"}
FEMALE = {"Neha", "Priya", "Simran", "Ananya", "Meera", "Isha", "Tanvi", "Sana"}

TARGETS = {"clear_task": 110, "multi_task": 50, "self_commitment": 30, "missing_info": 50,
           "ambiguous": 40, "not_task": 120, "looks_like_task": 80}

# ---------------------------------------------------------------- task bank
# (verb, object phrase, short Hinglish object)
BANK = {
    "dev": [
        ("fix", "the login bug", "login bug"),
        ("complete", "the payment integration", "payment integration"),
        ("review", "the open pull request", "open pull request"),
        ("update", "the README", "README"),
        ("write", "unit tests for the API", "API ke unit tests"),
        ("deploy", "the latest build to staging", "latest build"),
        ("set up", "the CI pipeline", "CI pipeline"),
        ("fix", "the crash on the settings screen", "settings screen ka crash"),
        ("optimize", "the search query", "search query"),
        ("push", "the latest code to the repo", "latest code"),
        ("merge", "the feature branch", "feature branch"),
        ("update", "the API documentation", "API documentation"),
        ("migrate", "the database to the new schema", "database"),
        ("add", "dark mode to the app", "dark mode"),
        ("fix", "the broken signup form", "signup form"),
        ("write", "the release notes", "release notes"),
        ("test", "the checkout flow", "checkout flow"),
        ("integrate", "push notifications", "push notifications"),
        ("clean up", "the unused code", "unused code"),
        ("check", "the staging server", "staging server"),
        ("rotate", "the API keys", "API keys"),
        ("debug", "the chat message delay", "chat message delay"),
    ],
    "design": [
        ("send", "the updated UI", "updated UI"),
        ("finish", "the landing page design", "landing page design"),
        ("share", "the wireframes", "wireframes"),
        ("export", "the app icons", "app icons"),
        ("update", "the color palette", "color palette"),
        ("create", "the pitch deck slides", "pitch deck slides"),
        ("design", "the new logo options", "new logo options"),
        ("prepare", "the user flow diagram", "user flow diagram"),
    ],
    "college": [
        ("submit", "the project report", "project report"),
        ("prepare", "the viva presentation", "viva presentation"),
        ("write", "the literature review", "literature review"),
        ("collect", "the survey responses", "survey responses"),
        ("book", "the seminar hall", "seminar hall"),
        ("print", "the project documents", "project documents"),
        ("record", "the demo video", "demo video"),
        ("upload", "the code to the portal", "code"),
        ("finalize", "the abstract", "abstract"),
        ("proofread", "the final report", "final report"),
        ("prepare", "the PPT for the review", "review PPT"),
        ("collect", "the signed forms from the guide", "signed forms"),
    ],
    "marketing": [
        ("schedule", "the Instagram posts", "Instagram posts"),
        ("write", "the campaign copy", "campaign copy"),
        ("send", "the newsletter", "newsletter"),
        ("share", "the campaign analytics", "campaign analytics"),
        ("book", "the ad slots", "ad slots"),
        ("update", "the client proposal", "client proposal"),
        ("prepare", "the monthly report", "monthly report"),
        ("call", "the vendor about the banners", "vendor"),
    ],
    "ops": [
        ("send", "the invoice to the client", "client invoice"),
        ("book", "the meeting room", "meeting room"),
        ("update", "the sprint board", "sprint board"),
        ("share", "the meeting notes", "meeting notes"),
        ("collect", "the timesheets", "timesheets"),
        ("confirm", "the client call", "client call"),
    ],
    "group": [
        ("submit", "your timesheets", "timesheets"),
        ("update", "your task status on the board", "task status"),
        ("fill", "the feedback form", "feedback form"),
        ("send", "your availability for the demo", "availability"),
        ("review", "the updated guidelines", "updated guidelines"),
        ("submit", "your weekly reports", "weekly reports"),
        ("share", "your project updates", "project updates"),
        ("complete", "the training module", "training module"),
    ],
}
ROSTER_DOMAINS = {"startup": ["dev", "design", "ops"], "college": ["college", "dev"],
                  "agency": ["marketing", "design", "ops"], "two_rahuls": ["dev", "ops"]}
VERBS = {  # base: (past, gerund)
    "fix": ("fixed", "fixing"), "complete": ("completed", "completing"), "review": ("reviewed", "reviewing"),
    "update": ("updated", "updating"), "write": ("wrote", "writing"), "deploy": ("deployed", "deploying"),
    "set up": ("set up", "setting up"), "optimize": ("optimized", "optimizing"), "push": ("pushed", "pushing"),
    "merge": ("merged", "merging"), "migrate": ("migrated", "migrating"), "add": ("added", "adding"),
    "test": ("tested", "testing"), "integrate": ("integrated", "integrating"),
    "clean up": ("cleaned up", "cleaning up"), "check": ("checked", "checking"), "rotate": ("rotated", "rotating"),
    "debug": ("debugged", "debugging"), "send": ("sent", "sending"), "finish": ("finished", "finishing"),
    "share": ("shared", "sharing"), "export": ("exported", "exporting"), "create": ("created", "creating"),
    "design": ("designed", "designing"), "prepare": ("prepared", "preparing"), "submit": ("submitted", "submitting"),
    "collect": ("collected", "collecting"), "book": ("booked", "booking"), "print": ("printed", "printing"),
    "record": ("recorded", "recording"), "upload": ("uploaded", "uploading"), "finalize": ("finalized", "finalizing"),
    "proofread": ("proofread", "proofreading"), "schedule": ("scheduled", "scheduling"),
    "call": ("called", "calling"), "confirm": ("confirmed", "confirming"), "fill": ("filled", "filling"),
}
HI_VERB = {"set up": "setup", "clean up": "cleanup"}
HI_END = ["kar dena", "kar do", "kar dijiye", "kar dena please"]


def make_task(entry):
    verb, obj, hi_obj = entry
    past, ger = VERBS[verb]
    return {"verb": verb, "obj": obj, "hi_obj": hi_obj, "imp": f"{verb} {obj}", "past": f"{past} {obj}",
            "ger": f"{ger} {obj}", "title": f"{verb.capitalize()} {obj}", "hverb": HI_VERB.get(verb, verb)}


def pick_tasks(rng, roster_key, n, group=False):
    pool = BANK["group"] if group else [e for d in ROSTER_DOMAINS[roster_key] for e in BANK[d]]
    return [make_task(e) for e in rng.sample(pool, n)]


def hi_phrase(rng, t):
    return f"{t['hi_obj']} {t['hverb']} {rng.choice(HI_END)}"


# ---------------------------------------------------------------- dates
def monday_of(d):
    return d - timedelta(days=d.weekday())


def next_weekday_after(d, wd):
    delta = (wd - d.weekday()) % 7 or 7
    return d + timedelta(days=delta)


def month_end(d):
    first_next = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return first_next - timedelta(days=1)


def resolve(kind, d0, idx):
    if kind == "today":
        return d0
    if kind == "tomorrow":
        return d0 + timedelta(days=1)
    if kind == "dayafter":
        return d0 + timedelta(days=2)
    if kind == "weekday":
        return next_weekday_after(d0, idx)
    if kind == "nextweekday":
        return monday_of(d0) + timedelta(days=7 + idx)
    if kind == "endweek":
        return monday_of(d0) + timedelta(days=4)
    if kind == "nextweek":
        return monday_of(d0) + timedelta(days=11)
    if kind == "endmonth":
        return month_end(d0)
    raise ValueError(kind)


EN_PHRASES = {
    "today": ["today", "by EOD", "by end of day", "by 5 pm", "tonight", "by the end of today", "EOD today", "by 6 pm today"],
    "tomorrow": ["tomorrow", "by tomorrow", "tomorrow morning", "by tomorrow EOD", "tomorrow by noon", "by tomorrow evening"],
    "dayafter": ["day after tomorrow", "by day after tomorrow"],
    "weekday": ["by {W}", "on {W}", "by {W} EOD", "by {W} evening", "by {W} noon", "latest by {W}"],
    "nextweekday": ["by next {W}", "next {W}"],
    "endweek": ["by end of the week", "this week", "by the end of this week", "before the week ends"],
    "nextweek": ["next week", "by next week", "by end of next week"],
    "endmonth": ["by end of the month", "by month end"],
    "event": ["before the demo", "before the release", "once the API is ready", "after the review",
              "before the client call", "before the viva", "before the sprint review", "before the next standup"],
}
HI_PHRASES = {
    "today": ["aaj tak", "aaj shaam tak", "aaj hi", "EOD tak"],
    "tomorrow": ["kal tak", "kal subah tak", "kal shaam tak"],
    "dayafter": ["parso tak"],
    "weekday": ["{W} tak", "{HW} tak"],
    "endweek": ["is hafte ke end tak", "hafte ke end tak"],
    "nextweek": ["agle hafte tak", "next week tak"],
    "event": ["demo se pehle", "release se pehle", "client call se pehle", "review se pehle"],
}
WEIGHTS = {"today": 12, "tomorrow": 22, "dayafter": 3, "weekday": 30, "nextweekday": 6,
           "endweek": 9, "nextweek": 8, "endmonth": 3}
NO_DL = {"text": None, "date": None, "kind": None}


def make_deadline(rng, ts, lang, kinds=None, event=False):
    d0 = ts.date()
    table = EN_PHRASES if lang == "en" else HI_PHRASES
    if event:
        kind, idx = "event", None
    else:
        w = {k: v for k, v in WEIGHTS.items() if k in table and (kinds is None or k in kinds)}
        if d0.weekday() > 3:
            w.pop("tomorrow", None)  # tomorrow would be a weekend
        if d0.weekday() > 2:
            w.pop("dayafter", None)
        kind = rng.choices(list(w), list(w.values()))[0]
        idx = None
        if kind in ("weekday", "nextweekday"):
            idx = rng.choice([i for i in range(5) if not (kind == "weekday" and i == d0.weekday())])
    phrase = rng.choice(table[kind])
    wd = WEEKDAYS[idx] if idx is not None else ""
    text = phrase.format(W=wd, HW=HI_WD.get(wd, ""))
    iso = None if kind == "event" else resolve(kind, d0, idx).isoformat()
    return {"text": text, "date": iso, "kind": kind}


def maybe_deadline(rng, ts, lang, p_have=1.0, p_event=0.1):
    if rng.random() > p_have:
        return NO_DL
    return make_deadline(rng, ts, lang, event=rng.random() < p_event)


# ---------------------------------------------------------------- priority (appended after the sentence)
PR_HIGH = {"en": [" ASAP.", " Urgent!", " It's urgent.", " High priority.", " This is urgent!", " Needed ASAP."],
           "hinglish": [" Urgent hai.", " Ye urgent hai!", " Bahut urgent hai."]}
PR_LOW = {"en": [" No rush.", " Low priority.", " Whenever you get time.", " No hurry."],
          "hinglish": [" Koi jaldi nahi.", " Araam se kar lena, koi jaldi nahi."]}


def make_priority(rng, lang, dl_kind, p_high=0.12, p_low=0.05):
    r = rng.random()
    if r < p_high:
        return rng.choice(PR_HIGH[lang]), "high"
    if r < p_high + p_low and dl_kind in (None, "nextweek", "endmonth", "event"):
        return rng.choice(PR_LOW[lang]), "low"
    return "", None


# ---------------------------------------------------------------- text helpers
def gender_f(name):
    return name.split()[0] in FEMALE


def can_form(name):
    return "sakti ho" if gender_f(name) else "sakte ho"


def will_form(name):
    return "kar dungi" if gender_f(name) else "kar dunga"


def pron(name):
    return "she" if gender_f(name) else "he"


def finish(body, term):
    body = re.sub(r"\s+", " ", body).strip()
    body = re.sub(r"\s+([,.?!;:])", r"\1", body)
    if body and body[-1] not in ".!?)" and term:
        body += term
    for i, ch in enumerate(body):
        if ch.isalpha():
            body = body[:i] + ch.upper() + body[i + 1:]
            break
    return body


def dl_str(dl):
    return " " + dl["text"] if dl["text"] else ""


def task_dict(t, assignee, dl, prio):
    return {"title": t["title"], "assignee": assignee, "deadline_text": dl["text"],
            "deadline_date": dl["date"], "priority": prio}


# ---------------------------------------------------------------- templates
EN_CLEAR = [
    ("{N}, {imp}{dl}", "."), ("{N}, please {imp}{dl}", "."), ("Can you {imp}{dl}, {N}", "?"),
    ("{N} pls {imp}{dl}", "."), ("@{N} {imp}{dl}", "."), ("Hey {N}, could you {imp}{dl}", "?"),
    ("{N} - need you to {imp}{dl}", "."), ("Please {imp}{dl}, {N}", "."), ("{N}, I need you to {imp}{dl}", "."),
    ("{N} can you {imp}{dl}", "?"), ("Action for {N}: {imp}{dl}", "."), ("{N}: {imp}{dl}", "."),
    ("{N}, could you please {imp}{dl}", "?"),
]
HI_CLEAR = [
    ("{N},{dl} {hi}", "."), ("{N}, please{dl} {hi}", "."), ("{N} yaar,{dl} {hi}", "."), ("@{N}{dl} {hi}", "."),
    ("{N}, kya tum{dl} {obj} {verb} kar {can}", "?"), ("{N}, {obj} {verb} kar dena{dl}", "."),
]
EN_SELF = [
    ("I'll {imp}{dl}", "."), ("I will {imp}{dl}", "."), ("Let me {imp}{dl}", "."), ("I can {imp}{dl}", "."),
    ("Will {imp}{dl}", "."), ("Ok, I'll {imp}{dl}", "."), ("On it. I'll {imp}{dl}", "."),
    ("I'll take this one, will {imp}{dl}", "."), ("Sure, I'll {imp}{dl}", "."), ("I'll {imp}{dl}, don't worry", "."),
]
HI_SELF = [
    ("Main{dl} {obj} {verb} {will}", "."), ("Theek hai, main {obj} {verb} {will}{dl}", "."),
    ("{obj} {verb} main {will}{dl}", "."),
]
EN_NOA = [
    ("Someone needs to {imp}{dl}", "."), ("Can someone {imp}{dl}", "?"), ("We need to {imp}{dl}", "."),
    ("Need someone to {imp}{dl}", "."), ("Anyone free to {imp}{dl}", "?"), ("Somebody please {imp}{dl}", "."),
    ("Can anyone {imp}{dl}", "?"), ("We still need to {imp}{dl}", "."),
]
EN_NOA_NEEDS_DL = [("Let's {imp}{dl}", ".")]
HI_NOA = [
    ("Koi {obj} {verb} kar de{dl}", "."), ("{obj} {verb} karna hai{dl}", "."),
    ("Kya koi {obj} {verb} kar sakta hai{dl}", "?"), ("Kisi ko {obj} {verb} karna padega{dl}", "."),
]
EN_GROUP = [
    ("Everyone please {imp}{dl}", "."), ("All, {imp}{dl}", "."), ("Team, please {imp}{dl}", "."),
    ("Reminder to everyone: {imp}{dl}", "."), ("Everyone needs to {imp}{dl}", "."),
]
HI_GROUP = [("Sab log{dl} {obj} {verb} kar dena", "."), ("Team,{dl} {obj} {verb} kar dijiye", ".")]

NOT_EN = [
    "Good morning team!", "Good morning everyone ☀️", "Morning folks", "Lunch at 1?", "Anyone up for chai?",
    "Thanks {N}, got the files!", "Thanks a lot {N} 🙏", "Thank you so much {N}!", "Happy birthday {N}! 🎉",
    "Many happy returns of the day {N} 🎂", "Congrats team, great work on the release!",
    "Congrats {N} on the promotion!", "lol that meme is gold 😂", "brb 5 mins", "Back now", "ok", "Okay 👍",
    "Sure, will do", "Done", "Noted", "Got it, thanks", "Sounds good", "👍", "Haha same", "Traffic is crazy today",
    "Rain again, so slow commute", "Is anyone watching the match tonight?", "Who's up for a cricket game on Sunday?",
    "That's great news!", "Welcome to the team, {N}! 🎉", "Happy Diwali everyone! 🪔", "Have a great weekend folks!",
    "See you all on Monday", "Good night everyone", "Coffee machine is finally fixed 🙌",
    "There's cake in the pantry 🎂", "Nice work {N}!", "Great presentation today, {N}", "I'm on leave tomorrow",
    "Running 10 mins late", "Reached the office", "Just got out of the meeting", "That was a long call 😅",
    "My internet is so slow today", "Pizza for lunch today?", "Thanks for the quick help!", "Haha you're right",
    "Wow that looks amazing", "Love the new design!", "Can't believe it's already Friday", "Monday blues 😩",
    "The new chairs are so comfy", "Great, thanks for letting me know", "No worries!", "Np, anytime", "Same here",
    "Interesting idea, let me think about it", "Cool 😎", "Lol", "Yes!", "Absolutely", "Haha nice one {N}",
    "Enjoy your vacation {N}!", "Exam stress is real 😭", "Viva went well! 😊", "Anyone tried the new cafe nearby?",
    "What a game last night!", "This weather is perfect today ☀️", "I need a coffee badly ☕", "Fingers crossed 🤞",
    "Proud of this team 💪", "Ha, classic {N} 😄", "Feeling sleepy after lunch 😴",
    "Pro tip: the 4th floor pantry has the best chai", "That's so funny 😂", "Welcome back {N}!",
    "Good luck for tomorrow everyone!", "All the best {N}!", "Thanks everyone for the wishes 🙏",
    "Mood today: Friday energy 🎉", "Hope everyone had a good weekend", "What a day!",
]
NOT_HI = [
    "Chai peene chalein?", "Kya haal hai sab ka?", "Good morning sabko!", "Lunch ka kya plan hai?",
    "Bhai maza aa gaya 😂", "Thanks yaar!", "Happy birthday {N}! 🎂", "Aaj bahut traffic tha",
    "Barish ho rahi hai yaar ☔", "Kal match dekha kya?", "Theek hai", "Haan ji", "Achha, samajh gaya",
    "Bohot badhiya kaam kiya {N}!", "Chalo kal milte hain", "Sabko Diwali ki shubhkamnayein 🪔", "Mast hai ye!",
    "Office pahunch gaya", "Aaj Friday hai, mood set hai 😄", "Hahaha sahi hai", "Kya baat hai {N}!",
    "Bhook lag rahi hai yaar", "Samose aaye hain, aa jao 😋", "Good night sabko", "Arre waah, badhai ho {N}!",
    "Shukriya {N}!", "Maza aa gaya aaj ka lunch 😋", "Kuch nahi yaar, bas thoda thak gaya hoon",
]
LOOK_FIXED_EN = [
    "Standup at 11.", "Standup at 11 in the usual room.", "Demo is on Friday.", "Sprint review tomorrow at 3 pm.",
    "Meeting moved to 4 pm.", "Client call is at 5 today.", "What's the staging URL?", "What time is the review?",
    "Where is the meeting today?", "Is the server down for everyone?", "Wi-Fi is down on the 3rd floor.",
    "The build is red again 😩", "The app crashed on my phone again.", "Prod is slow today.",
    "Office is closed on Monday for the holiday.", "{N} said {he} would send the UI tomorrow.",
    "Release is planned for next Friday.", "The viva is on Monday, all the best everyone!",
    "Seminar hall is booked for Thursday.", "FYI the client approved the design.", "Update: server is back up.",
    "Update: payment gateway is working now.", "Heads up, the API will be down for maintenance tonight.",
    "Just a heads up, I'll be offline after 6.", "Client wants the demo to be shorter, FYI.",
    "The review got postponed to next week.", "Sprint planning is on Wednesday at 10.", "FYI: Friday is a half day.",
]
LOOK_FIXED_HI = [
    "Standup 11 baje hai.", "Demo Friday ko hai.", "Meeting 4 baje shift ho gayi hai.", "Staging ka URL kya hai?",
    "Server phir se down hai yaar", "Review kal 3 baje hai.", "Client call 5 baje hai aaj.", "Wi-Fi band ho gaya hai",
    "Aaj office jaldi band hoga", "Release agle hafte plan hai.",
]
LOOK_TASK_EN = [
    "{N} {past} yesterday.", "{N} already {past}.", "I {past} this morning.", "Finished {ger}, all good now.",
    "I'm {ger} right now.", "Still {ger}, almost there.", "We should {imp} someday.",
    "It would be nice to {imp} at some point.", "Would be great if we could {imp} sometime in the future.",
    "{N} said {he} will {imp} tomorrow.", "{N} mentioned {he}'ll {imp} by Friday.", "Done with {obj}.",
    "Don't worry about {obj} anymore.", "Forget {obj}, the client dropped it.", "Who is handling {obj}?",
    "What's the status of {obj}?", "Any update on {obj}?",
]
LOOK_TASK_HI = [
    "{N} ne kal {hobj} {hverb} kar diya.", "Maine {hobj} {hverb} kar diya hai.",
    "Abhi main {hobj} {hverb} {doing}.", "Kabhi na kabhi {hobj} {hverb} kar lena chahiye.",
    "{hobj} ka status kya hai?", "{N} ne bola ki wo kal {hobj} {hverb} {willother}.",
    "{hobj} {hverb} ho gaya, ab sab theek hai.",
]


# ---------------------------------------------------------------- context helpers
BASE = date(2026, 11, 2)


def random_ts(rng):
    while True:
        d = BASE + timedelta(days=rng.randint(0, 90))
        if d.weekday() < 5:
            break
    return datetime(d.year, d.month, d.day, rng.randint(9, 15), rng.choice(range(0, 60, 5)), tzinfo=IST)


def pick_roster(rng, two_p=0.12):
    return "two_rahuls" if rng.random() < two_p else rng.choice(["startup", "college", "agency"])


def pick_sender(rng, members, exclude=()):
    pool = [m for m in members if m not in exclude]
    if members[0] in pool and rng.random() < 0.5:
        return members[0]  # the first member acts as the manager half of the time
    return rng.choice(pool)


def pick_lang(rng, p=0.2):
    return "hinglish" if rng.random() < p else "en"


def render_single(rng, lang, name, t, dl, can_name=None):
    if lang == "en":
        tpl, term = rng.choice(EN_CLEAR)
        body = tpl.format(N=name, imp=t["imp"], dl=dl_str(dl))
    else:
        tpl, term = rng.choice(HI_CLEAR)
        body = tpl.format(N=name, dl=dl_str(dl), hi=hi_phrase(rng, t), obj=t["hi_obj"], verb=t["hverb"],
                          can=can_form(can_name or name))
    return finish(body, term)


def add_noise(rng, msg, tasks):
    orig = (msg, [dict(t) for t in tasks])
    m, ts = msg, [dict(t) for t in tasks]
    r = rng.random()
    if r < 0.15:
        m = m.lower()
        for t in ts:
            if t["deadline_text"]:
                t["deadline_text"] = t["deadline_text"].lower()
    elif r < 0.35 and m.endswith("."):
        m = m[:-1]
    if rng.random() < 0.15:
        m = re.sub(r"\bplease\b", "pls", m, flags=re.I)
    if rng.random() < 0.10:
        m += " " + rng.choice(["🙏", "👍", "🙂", "🔥"])
    if any(t["deadline_text"] and t["deadline_text"] not in m for t in ts):
        return orig
    return m, ts


def finalize(rng, rk, ts, sender, msg, lang, cat, tasks, nc=False):
    msg, tasks = add_noise(rng, msg, tasks)
    return {"source": "synthetic_template", "timestamp": ts.isoformat(), "sender": sender,
            "team_members": ROSTERS[rk]["members"], "message": msg, "language": lang,
            "is_task": bool(tasks), "category": cat, "tasks": tasks, "needs_confirmation": nc, "reviewed": False}


# ---------------------------------------------------------------- generators
def gen_clear(rng):
    lang, rk, ts = pick_lang(rng), pick_roster(rng), random_ts(rng)
    members = ROSTERS[rk]["members"]
    who = rng.choice(members)
    sender = pick_sender(rng, members, exclude={who})
    t = pick_tasks(rng, rk, 1)[0]
    dl = make_deadline(rng, ts, lang, event=rng.random() < 0.10)
    pr_text, prio = make_priority(rng, lang, dl["kind"], p_high=0.12, p_low=0.12)
    msg = render_single(rng, lang, who, t, dl) + pr_text
    return finalize(rng, rk, ts, sender, msg, lang, "clear_task", [task_dict(t, who, dl, prio)])


def gen_ambiguous(rng):
    lang, rk, ts = pick_lang(rng), "two_rahuls", random_ts(rng)
    members = ROSTERS[rk]["members"]
    sender = pick_sender(rng, members, exclude={"Rahul Sharma", "Rahul Kumar"})
    t = pick_tasks(rng, rk, 1)[0]
    dl = maybe_deadline(rng, ts, lang, p_have=0.8)
    pr_text, prio = make_priority(rng, lang, dl["kind"], p_high=0.08, p_low=0.03)
    msg = render_single(rng, lang, "Rahul", t, dl, can_name="Rahul") + pr_text
    return finalize(rng, rk, ts, sender, msg, lang, "ambiguous", [task_dict(t, None, dl, prio)], nc=True)


def gen_self(rng):
    lang, rk, ts = pick_lang(rng), pick_roster(rng), random_ts(rng)
    members = ROSTERS[rk]["members"]
    sender = rng.choice(members)
    t = pick_tasks(rng, rk, 1)[0]
    dl = maybe_deadline(rng, ts, lang, p_have=0.7, p_event=0.08)
    pr_text, prio = make_priority(rng, lang, dl["kind"], p_high=0.06, p_low=0.10)
    if lang == "en":
        tpl, term = rng.choice(EN_SELF)
        body = tpl.format(imp=t["imp"], dl=dl_str(dl))
    else:
        tpl, term = rng.choice(HI_SELF)
        body = tpl.format(dl=dl_str(dl), obj=t["hi_obj"], verb=t["hverb"], will=will_form(sender))
    return finalize(rng, rk, ts, sender, finish(body, term) + pr_text, lang, "self_commitment",
                    [task_dict(t, sender, dl, prio)])


def gen_missing(rng):
    lang, rk, ts = pick_lang(rng), pick_roster(rng), random_ts(rng)
    members = ROSTERS[rk]["members"]
    mode = rng.choices("ABCD", [35, 25, 30, 10])[0]
    sender = pick_sender(rng, members)
    t = pick_tasks(rng, rk, 1, group=(mode == "D"))[0]
    assignee = None
    if mode == "A":
        dl = make_deadline(rng, ts, lang, event=rng.random() < 0.25)
    elif mode == "D":
        dl = maybe_deadline(rng, ts, lang, p_have=0.8, p_event=0.0)
    else:
        dl = NO_DL
    pr_text, prio = make_priority(rng, lang, dl["kind"], p_high=0.08, p_low=0.20)
    if mode == "C":
        assignee = rng.choice([m for m in members if m != sender])
        msg = render_single(rng, lang, assignee, t, dl)
    else:
        if lang == "en":
            pool = EN_GROUP if mode == "D" else EN_NOA + (EN_NOA_NEEDS_DL if dl["text"] else [])
            tpl, term = rng.choice(pool)
            body = tpl.format(imp=t["imp"], dl=dl_str(dl))
        else:
            tpl, term = rng.choice(HI_GROUP if mode == "D" else HI_NOA)
            body = tpl.format(obj=t["hi_obj"], verb=t["hverb"], dl=dl_str(dl))
        msg = finish(body, term)
    return finalize(rng, rk, ts, sender, msg + pr_text, lang, "missing_info", [task_dict(t, assignee, dl, prio)])


def gen_multi(rng):
    lang, rk, ts = pick_lang(rng), pick_roster(rng), random_ts(rng)
    members = ROSTERS[rk]["members"]
    sender = pick_sender(rng, members)
    others = [m for m in members if m != sender]
    kind = rng.choice(["m1", "m1", "m3", "m4", "m5", "m2", "m7"] if lang == "en" else ["h1", "h1", "h2", "h3"])
    n = 3 if kind == "m4" else 2
    same_person = kind in ("m2", "m7", "h2")
    names = [rng.choice(others)] * 2 if same_person else rng.sample(others, n)
    ts_ = pick_tasks(rng, rk, n)
    if kind == "m2":
        d = maybe_deadline(rng, ts, lang, p_have=0.9)
        dls = [d, d]
    else:
        dls = [maybe_deadline(rng, ts, lang, p_have=0.85) for _ in range(n)]
    prs = [("", None)] * n
    if kind in ("m1", "m3", "m7", "h1"):
        prs = [make_priority(rng, lang, dls[i]["kind"], p_high=0.06, p_low=0.0) for i in range(n)]
    N, T, D = names, ts_, [dl_str(d) for d in dls]
    P = [p[0] for p in prs]
    if kind == "m1":
        msg = finish(f"{N[0]}, {T[0]['imp']}{D[0]}", ".") + P[0] + " " + finish(f"{N[1]}, {T[1]['imp']}{D[1]}", ".") + P[1]
    elif kind == "m3":
        msg = finish(f"{N[0]} can you {T[0]['imp']}{D[0]}", "?") + P[0] + " " + finish(f"{N[1]} please {T[1]['imp']}{D[1]}", ".") + P[1]
    elif kind == "m5":
        msg = finish(f"{N[0]}, {T[0]['imp']}{D[0]}, and {N[1]}, {T[1]['imp']}{D[1]}", ".")
    elif kind == "m2":
        msg = finish(f"{N[0]}, please {T[0]['imp']} and {T[1]['imp']}{D[0]}", ".")
    elif kind == "m4":
        head = rng.choice(["Action items:", "Quick assignments:", "Next steps:"])
        body = "; ".join(f"{N[i]} - {T[i]['imp']}{D[i]}" for i in range(3))
        msg = finish(f"{head} {body}", ".")
    elif kind == "m7":
        msg = finish(f"{N[0]}, {T[0]['imp']}{D[0]}", ".") + P[0] + " " + finish(f"Also {T[1]['imp']}{D[1]}", ".") + P[1]
    elif kind == "h1":
        msg = (finish(f"{N[0]},{D[0]} {hi_phrase(rng, T[0])}", ".") + P[0] + " "
               + finish(f"{N[1]},{D[1]} {hi_phrase(rng, T[1])}", ".") + P[1])
    elif kind == "h2":
        msg = finish(f"{N[0]}, pehle{D[0]} {hi_phrase(rng, T[0])}, phir{D[1]} {hi_phrase(rng, T[1])}", ".")
    else:  # h3
        msg = finish(f"{N[0]}{D[0]} {hi_phrase(rng, T[0])}, aur {N[1]}{D[1]} {hi_phrase(rng, T[1])}", ".")
    tasks = [task_dict(T[i], N[i], dls[i], prs[i][1]) for i in range(n)]
    return finalize(rng, rk, ts, sender, msg, lang, "multi_task", tasks)


def two_lines(rng, pool):
    if rng.random() < 0.75:
        return rng.choice(pool)
    first = rng.choice(pool)
    if first[-1].isalnum():
        first += "."
    return first + " " + rng.choice(pool)


def gen_not(rng):
    lang, rk, ts = pick_lang(rng, 0.22), pick_roster(rng), random_ts(rng)
    members = ROSTERS[rk]["members"]
    sender = rng.choice(members)
    first = lambda m: m.split()[0]
    N = first(rng.choice([m for m in members if m != sender]))
    line = two_lines(rng, NOT_HI if lang == "hinglish" else NOT_EN).format(N=N)
    return finalize(rng, rk, ts, sender, line, lang, "not_task", [])


def gen_looks(rng):
    lang, rk, ts = pick_lang(rng, 0.2), pick_roster(rng), random_ts(rng)
    members = ROSTERS[rk]["members"]
    sender = rng.choice(members)
    other = rng.choice([m for m in members if m != sender])
    N = other.split()[0]
    t = pick_tasks(rng, rk, 1)[0]
    if lang == "en":
        pool = LOOK_FIXED_EN if rng.random() < 0.3 else LOOK_TASK_EN
        msg = rng.choice(pool).format(N=N, he=pron(other), past=t["past"], ger=t["ger"], imp=t["imp"], obj=t["obj"])
    else:
        if rng.random() < 0.3:
            msg = rng.choice(LOOK_FIXED_HI)
        else:
            msg = rng.choice(LOOK_TASK_HI).format(
                N=N, hobj=t["hi_obj"], hverb=t["hverb"],
                doing="kar rahi hoon" if gender_f(sender) else "kar raha hoon",
                willother="karegi" if gender_f(other) else "karega")
    return finalize(rng, rk, ts, sender, msg, lang, "looks_like_task", [])


GENERATORS = [("clear_task", gen_clear), ("multi_task", gen_multi), ("self_commitment", gen_self),
              ("missing_info", gen_missing), ("ambiguous", gen_ambiguous), ("not_task", gen_not),
              ("looks_like_task", gen_looks)]


def write_review_csv(path, records):
    cols = ["id", "weekday", "timestamp", "sender", "team_members", "message", "language", "category", "needs_confirmation"]
    for i in (1, 2, 3):
        cols += [f"t{i}_title", f"t{i}_assignee", f"t{i}_deadline_text", f"t{i}_deadline_date", f"t{i}_priority"]
    cols += ["reviewed", "reviewer_notes"]
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in records:
            row = [r["id"], datetime.fromisoformat(r["timestamp"]).strftime("%A"), r["timestamp"], r["sender"],
                   ", ".join(r["team_members"]), r["message"], r["language"], r["category"],
                   "yes" if r["needs_confirmation"] else ""]
            for i in range(3):
                t = r["tasks"][i] if i < len(r["tasks"]) else {}
                row += [t.get(k) or "" for k in ("title", "assignee", "deadline_text", "deadline_date", "priority")]
            row += ["no", ""]
            w.writerow(row)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--out", default=str(DATA / "synthetic_template.jsonl"))
    args = ap.parse_args()

    rng = random.Random(args.seed)
    DATA.mkdir(exist_ok=True)
    seen = set()
    seed_file = DATA / "seed_examples.jsonl"
    if seed_file.exists():
        seen = {json.loads(l)["message"].strip().lower() for l in seed_file.read_text(encoding="utf-8").splitlines() if l.strip()}

    records = []
    for cat, fn in GENERATORS:
        want, made, tries = round(TARGETS[cat] * args.scale), 0, 0
        while made < want and tries < want * 200:
            tries += 1
            rec = fn(rng)
            key = rec["message"].strip().lower()
            if key in seen:
                continue
            seen.add(key)
            records.append(rec)
            made += 1
        if made < want:
            print(f"warning: only {made}/{want} unique records for {cat}; add more templates or lower --scale")
    rng.shuffle(records)
    for i, r in enumerate(records, 1):
        r["id"] = f"tpl-{i:04d}"
    out = Path(args.out)
    with out.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps({"id": r["id"], **{k: v for k, v in r.items() if k != "id"}}, ensure_ascii=False) + "\n")
    write_review_csv(out.with_name(out.stem + "_review.csv"), records)
    print(f"wrote {len(records)} records to {out}")


if __name__ == "__main__":
    main()
