---
doc: scope
status: approved
---

# Recall First

One line: a small web app that shows you what you only *think* you know.

## The Unique Kernel
You answer from memory **before** the AI explains anything, and you rate your confidence
**before** you see the result. The payoff is the overconfidence check: the results screen puts
your confidence next to your actual accuracy and lists the answers you were *certain* about but
got wrong — "study these first." Remove that comparison and this is just another AI quiz.

## Who It's For
A student or self-learner the night before an exam, a course checkpoint or an interview, holding
a page of notes they have already read twice. Today they ask an AI to summarize the notes, feel
reassured, and stop. They have no quick way to find out which parts they would actually fail on.

## The Core Loop
1. Paste notes (or a reading) into one text box and press **Quiz me**.
2. The AI writes 5 short-answer questions from that text only. The notes disappear.
3. For each question: type an answer from memory, pick a confidence level
   (Guessing / Unsure / Fairly sure / Certain), submit — or say "I don't know."
4. The AI grades it: right / partly right / wrong, one or two lines of feedback, and the correct
   answer taken from the notes.
5. After five: a results screen with score vs. average confidence and the "sure but wrong" list.
   Then "Try again with new notes."

Why they come back: every page of notes gets its own honest gap list in under five minutes.

## Inspiration & Identity
Feel: a focused study partner, not a test. Calm and spacious — one question at a time, large
readable type, soft paper-like background, a single warm accent colour used for the
"sure but wrong" moment so it lands. Professional, brand-like, not a generic AI-app template.
Grounding: retrieval practice beats rereading (Pan & Rickard 2018), typed recall beats
recognition (Rowland 2014), practice testing improves confidence accuracy (Barenberg & Dutke
2018) — see `../recall-first-brief/RESEARCH.md` for links. Claims stay as "based on research on
retrieval practice", never "proven to raise grades."

## Why This Matters to the Learner
"I study with AI summaries and it feels productive. I want the thing that tells me where I'm
fooling myself, and I want to understand how an app actually talks to an AI model along the way."

## What "Working" Looks Like
Open the app in a browser, paste a real page of notes, get five sensible questions that come
only from that text, answer them from memory with confidence ratings, get fair grades
(including "partly right" and credit for differently-worded correct answers), and land on a
results screen that says something like: **"You were Certain on 3 answers — and got 2 of them
wrong."** That sentence, on screen, is the demo moment.

## The POC Boundary
In: one session, in the browser, nothing saved. Paste box → 5 AI questions → answer +
confidence → per-question AI grading → results with the confidence-vs-accuracy comparison and
the "sure but wrong" list. Sensible handling of too-short text, too-long text, empty answers,
non-study text, and AI failures. A small server that holds the API key.

## Later
- Guess-first questions before reading new material.
- Spaced review that brings missed questions back days later.
- Hint-only mode when stuck.
- Saving history, accounts, PDF upload, sharing, mobile app.

## Explicitly Cut
- **Multiple-choice questions** — recognition is easier than recall and defeats the kernel.
- **Summary or explanation before answering** — the whole point is that the learner thinks first.
- **Accounts and saved history** — infrastructure that proves nothing about the idea in a 2-minute demo.
- **PDF / file upload** — paste covers the proof; upload adds parsing and storage work.
- **Deployment** — optional for the hackathon; a local run plus a recording is enough.
