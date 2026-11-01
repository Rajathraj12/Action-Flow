"""Fake teams used for hand-written and generated data.

Using a fixed roster is what lets us label names ("Rahul") and dates ("Friday")
objectively. Add more teams if you like, but keep the keys short.
"""

ROSTERS = {
    "startup": {
        "description": "Mobile app startup",
        "members": ["Vikram", "Rahul", "Neha", "Amit", "Priya"],
    },
    "college": {
        "description": "College final-year project group",
        "members": ["Aarav", "Simran", "Kabir", "Ananya", "Dev"],
    },
    "agency": {
        "description": "Marketing agency",
        "members": ["Meera", "Rohan", "Isha", "Karan", "Tanvi"],
    },
    # Two members share the first name "Rahul". Used for the `ambiguous` category.
    "two_rahuls": {
        "description": "Software team with two people named Rahul",
        "members": ["Vikram", "Rahul Sharma", "Rahul Kumar", "Neha", "Sana"],
    },
}

# Second set: the team members used in the team's own hand-written CSV (actionflow_team_chat_dataset.csv).
# Same team keys, different people. Use with:  csv_to_jsonl.py file.csv --author team --rosters v2
ROSTERS_V2 = {
    "startup": {"description": "Startup team", "members": ["Aarav", "Priya", "Vikram", "Meera", "Kabir"]},
    "college": {"description": "College project group", "members": ["Ishita", "Ananya", "Dev", "Rohan", "Sana"]},
    "agency": {"description": "Marketing agency", "members": ["Farah", "Nisha", "Arjun", "Tanya", "Kunal"]},
    "two_rahuls": {"description": "Team with two people named Rahul",
                   "members": ["Rahul Kumar", "Rahul Sharma", "Neha", "Aditi", "Manish"]},
}
ROSTER_SETS = {"v1": ROSTERS, "v2": ROSTERS_V2}
