---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [ ] **1. You can paste notes and the page tells you when there's enough to quiz on**
  Becomes usable: `npm start` serves the branded Start screen; the paste box shows a live word count, Quiz me unlocks at 100 words, and over 2,500 words a notice says only the first part will be used.
  Why now: Bootstraps the whole shape (server + static page + design tokens) around the first real behaviour, so every later slice lands on a running, on-brand page.
  PRD ref: `prd.md > The Core Journey` (steps 1–2), `prd.md > Pasting notes and starting a quiz`, `prd.md > Look and Feel`
  Spec ref: `spec.md > The server`, `spec.md > Start screen and note intake`, `spec.md > Look and Feel`, `spec.md > File Structure`
  Build: `package.json` with `start`, `server.js` static serving, `public/index.html` with all four screen sections (later ones empty), `styles.css` tokens and Start screen styles, `app.js` word count + gating + truncation notice.
  Verify (mechanical): `npm start` boots with no errors; `curl localhost:3000` returns the page; in a browser, 40 words leaves Quiz me disabled with the "paste a bit more" message, 300 words enables it, 4,000 words shows the truncation notice.
  Learner check: Run `npm start`, open http://localhost:3000, paste a short note and then a long one, and say whether the Start screen looks like the brand you wanted.
  Commit: `Add Start screen with note intake and server`

- [ ] **2. Quiz me turns your notes into five real questions**
  Becomes usable: Pressing Quiz me calls the AI and shows Question 1 of 5 from the pasted text; non-study text shows the AI's "can't make questions" reason; a missing key shows the setup message.
  Why now: This is the first unfamiliar, risky piece (structured JSON from the model) and the first half of the kernel; finding out early that the schema call works protects everything after it.
  PRD ref: `prd.md > Pasting notes and starting a quiz`, `prd.md > States and Boundaries` (loading, not study material, missing key)
  Spec ref: `spec.md > The AI module`, `spec.md > External Services and Dependencies` (Call 1), `spec.md > Question screen and confidence picker` (question display only)
  Build: `lib/ai.js` with `generateQuestions` using `output_config.format` + validation + mock implementation; `POST /api/questions` in `server.js`; loading state and question rendering in `app.js`.
  Verify (mechanical): `RECALL_MOCK=1` — `curl -X POST /api/questions` returns 5 validated questions; with a real key, the same call on a 300-word passage returns 5 questions answerable from the text; a missing key returns 503 `missing_key` and the page shows the setup message.
  Learner check: Paste real notes from a subject you know, press Quiz me, and check that the five questions come only from your notes.
  Commit: `Generate five questions from notes with structured output`

- [ ] **3. You answer from memory and rate your confidence before anything is revealed**
  Becomes usable: Each question has an answer box and the four-step confidence picker; Submit unlocks only after a confidence is chosen; I don't know records Wrong + Guessing and shows the stored answer; Next question advances through all five.
  Why now: Captures the second half of the kernel — confidence before result — and the session shape, independent of grading, so grading can slot in next.
  PRD ref: `prd.md > Answering from memory with a confidence rating`, `prd.md > Screens and Layout` (Question, Feedback)
  Spec ref: `spec.md > Question screen and confidence picker`, `spec.md > Feedback screen`, `spec.md > Data Model`
  Build: confidence control, Submit gating, I don't know path, Feedback screen rendering from `session.answers`, progress label and bar, forward-only flow.
  Verify (mechanical): In mock mode, walk five questions using I don't know each time; `session.answers` has five entries with `wrong`/`guessing`; Submit stays disabled until a confidence is picked.
  Learner check: Answer a question, notice Submit is off until you pick a confidence, then try I don't know on another and see the correct answer appear.
  Commit: `Add answer, confidence picker and I don't know flow`

- [ ] **4. Your typed answer is graded fairly, with feedback and the correct answer**
  Becomes usable: Submit sends the answer for grading; Feedback shows Right / Partly right / Wrong, one or two lines of feedback, the correct answer from the notes, and your chosen confidence.
  Why now: Completes the per-question loop with the second AI call; the schema pattern from slice 2 is reused.
  PRD ref: `prd.md > Grading each answer`, `prd.md > States and Boundaries` (loading grading)
  Spec ref: `spec.md > The AI module` (`gradeAnswer`), `spec.md > External Services and Dependencies` (Call 2), `spec.md > Feedback screen`
  Build: `gradeAnswer` with grade schema + mock; `POST /api/grade`; Checking… state; Feedback rendering of verdict colours.
  Verify (mechanical): Mock mode returns each verdict and the page renders all three colours; with a real key, a paraphrased correct answer grades `right`, a half answer grades `partly`, and nonsense grades `wrong`.
  Learner check: Answer one question correctly in your own words and one half-way; check the grades feel fair.
  Commit: `Grade answers with feedback and correct answer`

- [ ] **5. The results screen shows where your confidence and your knowledge disagree**
  Becomes usable: After question 5: score, the calibration scale (felt vs knew with the gap highlighted), the headline sentence, Study these first, All answers, Try again.
  Why now: This is the demo moment and the payoff of the kernel; it needs all five answers to exist, which slices 3–4 provide.
  PRD ref: `prd.md > Results and the overconfidence check`, `prd.md > Look and Feel`
  Spec ref: `spec.md > Results screen and the overconfidence check`, `spec.md > Data Model` (score maths)
  Build: pure `summarize(answers)` in `app.js` (exported for test), `test/summarize.test.js` with `node --test`, Results rendering including the calibration scale and highlighter marks, Try again reset.
  Verify (mechanical): `npm test` passes with cases: 2 Certain-but-wrong produce the expected headline and Study-first list; all-right-all-certain gives the calibration message; score/percentages match. In the browser, a full mock run ends on Results with the correct numbers and Try again returns to an empty Start.
  Learner check: Run the whole quiz, answer two questions wrongly with Certain, and see whether the Results screen makes you want to study those two first.
  Commit: `Add results with calibration scale and study-first list`

- [ ] **6. Errors, edge cases, README and polish**
  Becomes usable: AI failures show the friendly message with a working Try again that keeps your notes and progress; empty Submit counts as I don't know; server caps notes at 2,500 words; README and `.env.example` let a stranger run it; keyboard focus and reduced motion respected; a final visual pass against the brand.
  Why now: Hardening belongs after the loop exists so every edge case is tested against real behaviour.
  PRD ref: `prd.md > States and Boundaries`, `prd.md > Look and Feel`
  Spec ref: `spec.md > Important Failure Modes`, `spec.md > Where It Runs and How Someone Tries It`
  Build: error paths in `app.js` and `server.js` (502/401/503 handling, retry), empty-answer rule, README, `.env.example`, accessibility and responsive checks, screenshot review.
  Verify (mechanical): Simulate a failing AI call (mock error switch) and confirm the retry works and keeps state; `curl` a 10,000-word body and confirm the server trims; README steps work from a clean clone in a temp folder; keyboard-only run through the loop.
  Learner check: Follow the README from a fresh clone, run one quiz end to end, and say what still feels rough.
  Commit: `Handle errors and edge cases, add README`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 2 (questions appear from real notes)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [pending]
Route and stops: [pending]
Edit outcome: [pending]
Reflection: [pending]
Activity mode: [pending]

## Revisions

- Look and Feel changed from "warm paper + editorial serif + ember accent" to "chalk paper + IBM Plex + one highlighter yellow for the felt/knew gap" — the first direction matched the most common AI-generated styling and would not have read as the learner's own brand. `prd.md > Look and Feel` and `spec.md > Look and Feel` updated to match; the two-bar comparison became a single calibration scale with the gap highlighted.
