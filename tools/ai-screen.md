# ai-screen — simulate an LLM recruiter screen

`screen.py` checks keywords the way an ATS filter does. Most screening layers now
add an LLM on top that reads the parsed text, judges evidence against the posting
and writes a note for the recruiter. This file is the prompt for simulating that
layer with a **fresh subagent** that has seen nothing but the two inputs below.

## How to run

1. Extract the CV text the way a parser sees it (not the source JSON):
   `<py> -c "from pypdf import PdfReader as R; import sys; print('\n'.join(p.extract_text() for p in R(sys.argv[1]).pages))" <cv>.pdf > <id>/.cv.txt`
2. The screener must be a fresh context, so `cv-maker` does not answer the prompt
   itself: it writes `.cv.txt` and Spiritus (or `cv-maker`, if its runtime lets a
   subagent spawn one) summons a new general-purpose subagent with **only** the prompt below, the text
   of `<id>/.cv.txt` and of `<id>/job-description.md`. Do not pass the charter,
   the bullet bank, `amendments.md` or anything about the candidate: the point
   is a reader who knows nothing else.
3. Save its answer to `<id>/ai-screen.md` and act on it (see "Reading the result").

Run it twice for an important application, once with the default prompt and once
with the line "You are strict: shortlist only if every must-have is clearly
evidenced." added: a strict screener is what costs interviews.

## Prompt

```
You screen CVs for a hiring team. You get one job posting and the plain text a
parser extracted from one candidate's CV. Judge only what the text shows.

Return, in this order:
1. DECISION: shortlist / maybe / reject, and one sentence why.
2. SCORE: 0-100 fit for this posting.
3. MUST-HAVES: each must-have from the posting -> evidenced / weak / missing,
   quoting the CV words that evidence it (or "none").
4. KNOCKOUTS: years of experience (count the dates yourself), location and
   work authorization, language, seniority. Flag any that would fail.
5. RECRUITER NOTE: the 3-line summary you would write for the hiring manager.
6. CONCERNS: what made you hesitate (vague claims, missing numbers, mismatch of
   recent role and posting, too much tooling and too little outcome, anything
   that reads inflated or machine-written).
7. FIXES: up to 5 concrete changes to the CV text that would raise the score
   without inventing experience.
```

## Reading the result

- **Knockouts first.** A failed knockout (years, location, authorization) beats
  any keyword work; fix it in the header / dates if it is a parsing problem,
  report it if it is a real gap.
- **"weak" must-haves** are the lever: the experience is there but the text does
  not show it. Pick a stronger bullet from `librarium/cv/bullet-bank.md`.
- **"missing"** stays missing unless the catalog or the bank has it. Never add a
  claim because the screener asked for it.
- The simulated screener is Claude, and LLM screeners rate text written by their
  own model family higher. Treat a high score as optimistic; treat concerns and
  knockouts as real.
- Report DECISION, SCORE and the knockouts to Spiritus with the rest of the
  application report.
