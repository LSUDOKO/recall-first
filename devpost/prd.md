---
doc: prd
status: approved
---

# Recall First — Product Requirements

One line: Recall First is a single-session web app for students and self-learners that turns a
page of pasted notes into five typed-recall questions, asks for a confidence rating before
every result, and ends by showing exactly where confidence and knowledge disagree.
Source: `scope.md > The Unique Kernel`, `scope.md > The Core Loop`.

## The Core Journey
1. The learner opens the app and sees the Start screen: the name, one line explaining what it
   does, a large paste box, and a **Quiz me** button.
2. They paste their notes and press Quiz me. A short "Writing your questions…" state appears.
3. The Question screen shows **Question 1 of 5**, the question text, an empty answer box, a
   four-step confidence picker (Guessing / Unsure / Fairly sure / Certain), **Submit**, and
   **I don't know**. The notes are not visible anywhere.
4. They type an answer from memory, pick a confidence level, and press Submit. A short
   "Checking…" state appears.
5. The Feedback screen shows the verdict (Right / Partly right / Wrong), one or two lines of
   feedback, the correct answer from the notes, the confidence they chose, and **Next question**.
6. Steps 3–5 repeat for questions 2–5.
7. The Results screen shows the score (e.g. 3/5), the average confidence next to the accuracy,
   a one-sentence headline such as "You were Certain on 3 answers — and got 2 of them wrong",
   a highlighted **Study these first** list of confident-but-wrong answers, a compact review of
   all five, and **Try again with new notes**, which returns to an empty Start screen.

Success = a learner can run steps 1–7 with real notes and real AI questions and grades, and the
Results screen correctly reflects what they answered and how confident they were.

## Screens and Layout
Four screens, one visible at a time, all in a single centred column (one idea per screen).

- **Start** — wordmark + tagline at top; a large paste box with a live word count; Quiz me
  button; a small line underneath: "Questions come only from your notes. No summary first."
- **Question** — small progress label ("Question 2 of 5") with a thin progress bar; the question
  in large type; a multi-line answer box; the confidence picker as four side-by-side segments;
  Submit (primary) and I don't know (quiet, secondary).
- **Feedback** — verdict word (Right / Partly right / Wrong) coloured by outcome; the feedback
  text; "Correct answer" block quoted from the notes; "You said you were: Certain" line;
  Next question button (reads "See results" after question 5).
- **Results** — big score; one calibration scale with two markers, *felt* (confidence) and
  *knew* (accuracy), the gap between them highlighted; the headline sentence; the Study these first list (question, your answer, the
  correct answer, your confidence); a collapsed "All answers" review; Try again button.

Movement is strictly forward: Start → Question → Feedback → Question … → Results → Start.
No back button (looking back at a question after seeing its answer defeats the point).

## Look and Feel
- **Mood:** calm, focused study partner. Spacious, quiet, confident. Not a test, not a game.
- **The one loud thing — the highlighter.** Students mark what to study with a highlighter.
  Recall First uses a single highlighter yellow for exactly one job: marking the gap between
  what you *felt* you knew and what you *actually* knew — the "sure but wrong" items and the
  gap on the calibration scale. Nothing else on screen is yellow.
- **Palette:** cool chalk-white paper, deep navy ink for text, soft grey rules; highlighter
  yellow as above; pine green for Right, ochre for Partly right, carmine for Wrong.
- **Typography:** the IBM Plex family — Plex Serif for the wordmark, questions, headline and
  big numbers (bookish, studious, slightly technical); Plex Sans for body, buttons and labels.
  Large base size, left-aligned text, lines under 70 characters.
- **Density and energy:** one thing per screen, generous whitespace, a single left-aligned
  column, thin rules instead of boxes wherever possible, no drop shadows, no gradients.
  Motion only in response to an action (a screen change, a verdict appearing).
- **Copy tone:** short, warm, direct. Second person, sentence case. "Study these first," not
  "Areas for improvement." No emoji, no all-caps labels.
- **Brand mark:** the wordmark "Recall First" with a small mark — a filled dot sitting inside a
  thin ring, off-centre. The dot is what you know; the ring is what you think you know; the
  space between is the gap the app finds. Appears top-left on every screen.
- **Avoid:** cream-and-terracotta "AI app" styling, purple gradients, chat bubbles, robot
  icons, rounded-card grids, multiple-choice-looking tiles.

## Features and Behavior

### Pasting notes and starting a quiz
- The paste box accepts plain text of any length; a live word count sits beneath it.
- Quiz me is disabled until the text has at least 100 words; below that, a message says
  "Paste a bit more — about a paragraph or two — so the questions have something to work with."
- Text over 2,500 words is used only up to the first 2,500 words, and the Start screen says so
  before sending ("Only the first 2,500 words will be used").
- Pressing Quiz me shows a loading state and asks the AI for exactly 5 short-answer questions
  based only on the pasted text, each with a reference answer drawn from the text.
- Once questions arrive, the notes are hidden for the rest of the session.
  - [ ] With a real 300-word passage, five questions appear and each is answerable from the passage alone.
  - [ ] With 40 words pasted, no request is made and the "paste a bit more" message shows.
  - [ ] With 4,000 words pasted, the truncation notice shows and the quiz still runs.

### Answering from memory with a confidence rating
- The answer box is multi-line and starts empty and focused.
- The confidence picker has exactly four steps: Guessing, Unsure, Fairly sure, Certain. None is
  pre-selected; Submit stays disabled until one is chosen.
- Submit sends the answer and confidence for grading. An empty answer with Submit is treated as
  "I don't know."
- I don't know skips grading of the text, records the question as Wrong with confidence
  Guessing, and shows the correct answer with the feedback "Honest. Here's the answer to study."
- No hint, summary, or note excerpt is available while answering.
  - [ ] Submit is disabled until a confidence step is picked.
  - [ ] I don't know goes straight to Feedback marked Wrong / Guessing with the correct answer shown.

### Grading each answer
- The AI compares the typed answer with the reference answer and the notes, and returns one of
  Right / Partly right / Wrong, one or two lines of feedback, and the correct answer.
- Answers that are correct in meaning but worded differently are Right.
- Answers with the main idea but a missing or wrong detail are Partly right.
- The Feedback screen shows all of this plus the learner's chosen confidence, then Next question.
  - [ ] A paraphrased correct answer is graded Right.
  - [ ] A half-answer is graded Partly right with feedback naming what was missing.
  - [ ] The correct answer shown is traceable to the pasted notes.

### Results and the overconfidence check
- Score: Right counts 1, Partly right counts 0.5, Wrong counts 0. Shown as "3.5 / 5".
- Accuracy % = score ÷ 5. Confidence % = average of chosen confidence steps mapped to
  Guessing 25 %, Unsure 50 %, Fairly sure 75 %, Certain 100 %.
- The two percentages appear on one horizontal calibration scale (0–100 %) as two markers,
  "felt" and "knew", with the gap between them highlighted.
- Headline sentence is generated from the data, e.g. "You were Certain on 3 answers — and got
  2 of them wrong." If there are no confident misses: "Your confidence matched your knowledge.
  Nice calibration." If confidence is far below accuracy: "You know more than you think."
- **Study these first** lists every answer that was Wrong or Partly right with confidence
  Fairly sure or Certain, ordered Certain first. Each item shows the question, what the learner
  wrote, the correct answer, and the confidence badge in the ember accent.
- "All answers" is a collapsed list of all five with verdict and confidence.
- Try again with new notes clears everything and returns to Start.
  - [ ] With 2 Certain-but-Wrong answers the headline and the Study these first list both show them.
  - [ ] Score, accuracy % and confidence % match the five recorded answers exactly.
  - [ ] Try again returns to an empty Start screen with no leftover state.

## States and Boundaries
- **First use / empty** — Start screen with an empty box, Quiz me disabled, a quiet hint of
  what to paste ("lecture notes, a textbook section, your own summary").
- **Loading (questions)** — box and button disabled; "Writing your questions…" with a subtle
  indicator. Typical wait a few seconds.
- **Loading (grading)** — answer controls disabled; "Checking…".
- **Not study material** — if the AI reports it cannot write questions from the text (random
  characters, a shopping list, a single sentence repeated), Start shows that message and keeps
  the text in the box for editing.
- **AI error** — if the request fails or the response is not in the expected shape, a friendly
  message ("Something went wrong talking to the AI. Nothing was lost — try again.") with a
  Try again button that repeats the same request. Pasted text and progress are kept.
- **Missing API key** — the server tells the page the key is not configured and the Start
  screen shows a plain setup message pointing to the README.
- **Nothing persists** — a browser refresh returns to Start. The app stores nothing anywhere.
- **Session shape** — 5 questions, always; no fewer, no more.

## Product Decisions
- **Five questions, fixed** — enough to produce a meaningful confidence-vs-accuracy split, short
  enough for a two-minute demo.
- **Confidence before result, never after** — rating after seeing the answer is hindsight; the
  calibration signal only exists if it is captured first.
- **Partly right counts half** — fairer than binary and shows up honestly in the score.
- **"I don't know" is Wrong + Guessing, not a skip** — honesty is the opposite of overconfidence
  and should never appear in Study these first.
- **Notes hidden during the quiz** — recall, not recognition. No peeking.
- **No back navigation** — prevents revising an answer after seeing feedback.
- **Word limits (100 min / 2,500 max)** — below 100 words there is not enough for five distinct
  questions; above 2,500 the request gets slow and expensive without improving the demo.
- **Calm, studious look with one highlighter accent** — the overconfidence moment should be the only
  loud thing on the screen.

## What We're Building
Everything under Features and Behavior and States and Boundaries, as four screens in one
browser page backed by a small server that talks to the AI: paste → 5 questions → answer +
confidence → grade + feedback → results with confidence-vs-accuracy and Study these first →
try again.

## Deferred From the POC
- **Saving sessions / history** — needs storage and identity; a single run proves the idea.
- **Accounts** — same reason; nothing to protect in a no-save app.
- **PDF or file upload** — parsing and storage work; paste is enough to prove the loop.
- **Hosted deployment** — optional for the hackathon; may be added after the demo video.

## Possible Later Enhancements
- Guess-first mode: answer questions before reading new material, then read.
- Spaced review that brings back the Study these first items days later.
- Hint-only mode when stuck, instead of revealing the answer.
- Choosing the number of questions or a topic focus within the notes.

## Non-Goals
- **Multiple choice** — recognition is not recall (`scope.md > Explicitly Cut`).
- **Summaries, explanations or chat before answering** — defeats the kernel.
- **Proving learning gains** — the app is based on retrieval-practice research; it does not
  measure improvement itself.
- **Mobile app, sharing, leaderboards** — out of scope for a proof of concept.

## Open Questions
- None blocking `4-spec`. The exact wording of the headline sentence variants can be tuned
  during the build.
