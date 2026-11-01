# ActionFlow dataset: quick guide

## What is in this folder

| File | What it is |
|---|---|
| `data/synthetic_template.jsonl` | 480 synthetic labeled chat messages (7 categories, about 21% Hinglish) |
| `data/synthetic_template_review.csv` | The same 480 records as a flat sheet. Open in Google Sheets to review |
| `data/seed_examples.jsonl` | 13 hand-checked examples (use these as few-shot examples in your prompt) |
| `data/splits/train.jsonl, dev.jsonl, test.jsonl` | 70/15/15 split, stratified by category |
| `build_synthetic_dataset.py` | Rebuilds or enlarges the dataset: `--seed 8` for a new draw, `--scale 2` for about 960 records |
| `validate_dataset.py` | Checks every record and creates splits |
| `generate_synthetic.py` | Optional: LLM-written messages (needs an API key) for more natural variety |
| `csv_to_jsonl.py`, `handwritten_template.csv` | For your team's hand-written messages |
| `labeling_guidelines.md` | The labeling rules |

## What to do next (in this order)

1. **Spot-check 10-15% of the CSV** (about 60 rows) in Google Sheets. Use the checklist in `labeling_guidelines.md` section 7. Mark `reviewed = yes`. Note any pattern that looks wrong in `reviewer_notes`.
2. **Write 150-200 messages by hand** (see the next section). These become your real test set.
3. Optionally generate 150-300 LLM-written messages with `generate_synthetic.py`, then review them.
4. Rebuild the splits with all files:
   `python validate_dataset.py data/seed_examples.jsonl data/synthetic_template.jsonl data/handwritten.jsonl --split --include-unreviewed --out data/splits`
5. **Use the hand-written messages as the final test set.** Template data is for training, few-shot examples and development.

## Hand-writing messages

Ask each teammate to write 40-50 messages in the `handwritten_template.csv` format. Tell them to type the way your team actually types: short, informal, some typos, some Hinglish. Use the four rosters in `rosters.py`. Then run `python csv_to_jsonl.py their_file.csv --author name`.

## Using ICSI

The ICSI Meeting Corpus is real spoken meetings (about 70 hours). The public download (https://groups.inf.ed.ac.uk/ami/icsi/download) has transcripts, dialogue-act labels, and topic and summary annotations, but **no action-item labels**. The only action-item layer I found is AIMU (Chen and Hakkani-Tur, LREC 2016), which annotated about 21K utterances from 22 ICSI meetings; its authors point to a Microsoft Research page I could not verify.

Two limits to know about:
- ICSI is spoken English with "um", "uh" and half-sentences. It looks nothing like chat, so use it only to add a small amount of realistic "someone commits to or is asked to do something" wording.
- It has no assignee, deadline or priority labels, so every ICSI-derived record needs full manual labeling.

Recommended use: take 100-150 utterances (AIMU action-item utterances if you can get them, otherwise utterances containing "I'll", "can you", "we need to"), clean them into chat-like sentences, then label them by hand with `handwritten_template.csv`. Mention ICSI as a secondary source in your report. ICSI is released under CC BY 4.0 (cite Janin et al., 2003).
