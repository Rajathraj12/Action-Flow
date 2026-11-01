# ActionFlow: what to do next (and how the data gets used)

## Where you are

| Step | Status |
|---|---|
| 1. Labeling rules (`labeling_guidelines.md`) | done |
| 2. Dataset | done: 493 synthetic/seed + 165 hand-written (checked and corrected) |
| 3. Extraction prompt + JSON schema | NEXT |
| 4. Date/name resolver code, duplicate check | after 3 |
| 5. Evaluation on the test set | after 4 |
| 6. Backend endpoint + confirm/edit screen | after 5 |

## Which file format is used for what

You do not choose one format. Each format has one job, and the scripts convert between them.

| Format | Job | Who uses it |
|---|---|---|
| **CSV** (`handwritten_v1_corrected.csv`) | Typing, reviewing and fixing rows in Google Sheets | You and your teammates |
| **JSONL** (`data/*.jsonl`) | The master copy. One JSON object per line. It can hold several tasks per message and a list of team members, which a flat CSV cannot | Your code |
| **eval_pairs.jsonl** (`exports/test_eval_pairs.jsonl`) | `input` = exactly what the AI sees, `expected` = the right answer | The evaluation script |
| **detection.csv / extraction.csv** (`exports/`) | Flat copies of the same data, for Excel, charts, or training a simple classifier | Optional |

How the data flows:

```
Google Sheet (CSV)  --csv_to_jsonl.py-->  data/handwritten.jsonl  --validate_dataset.py-->  train / dev / test (.jsonl)
                                                                          |
                                                          export_formats.py --> CSV files and eval_pairs.jsonl
```

### How the LLM uses one record

Your backend sends this to the model (the `input` part):

```json
{"message": "Rahul, complete the payment integration by Friday. Neha, send Rahul the updated UI tomorrow.",
 "sender": "Vikram", "timestamp": "2026-10-26T10:30:00+05:30",
 "team_members": ["Vikram", "Rahul", "Neha", "Amit", "Priya"]}
```

and asks for the `expected` shape back:

```json
{"is_task": true, "needs_confirmation": false,
 "tasks": [{"title": "Complete payment integration", "assignee": "Rahul", "deadline_text": "by Friday",
            "deadline_date": "2026-10-30", "priority": null}, ...]}
```

The evaluation script runs every test message through the model and counts how many answers match `expected`.

## Next steps, in order

1. **Read the change log** (`handwritten_v1_changes.csv`). Decide on the 7 leftover warnings (listed in the report).
2. **Write 15-20 more "ambiguous" messages, about 10 more multi-task messages, and some more not-task Hinglish.** The hand-written test set has only 5 ambiguous and 10 multi-task messages, too few to measure those reliably. Add them with `csv_to_jsonl.py`, then run `lint_handwritten_csv.py` first.
3. **Rebuild the splits** (command below). Freeze `test.jsonl`. Never tune the prompt on it.
4. **Build the extractor** (ask me): the prompt, the JSON schema, and 10-15 few-shot examples taken from `train.jsonl`.
5. **Write the resolver code** that turns `deadline_text` into a date from the timestamp and matches names to the team list. Do not let the LLM do date arithmetic.
6. **Evaluate**: dev set while building, test set once at the end. Report accuracy per category.
7. **Connect it**: `POST /ai/detect-task` returns the suggestion; the manager confirms or edits it.

## Command cheat-sheet

```
# check a CSV (report only), or repair mechanical mistakes into a NEW file
python lint_handwritten_csv.py data/my.csv --rosters v2
python lint_handwritten_csv.py data/my.csv --rosters v2 --fix data/my_corrected.csv --log data/my_changes.csv

# CSV -> JSONL, check everything, make splits (hand-written -> dev/test, everything else -> train)
python csv_to_jsonl.py data/my_corrected.csv --author team --rosters v2
python validate_dataset.py data/seed_examples.jsonl data/synthetic_template.jsonl data/handwritten.jsonl \
       --split --include-unreviewed --holdout-source handwritten --out data/splits_final

# JSONL -> CSV and eval files
python export_formats.py data/splits_final/test.jsonl --name test
```
