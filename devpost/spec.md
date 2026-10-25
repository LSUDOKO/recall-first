---
doc: spec
status: approved
---

# Recall First — Technical Spec

## How This Works, In Plain Language
There are three pieces.

1. **The page in the browser** (`public/`). Plain HTML, CSS and JavaScript — no framework.
   It shows the four screens, keeps the five questions and answers in memory, does the
   score maths, and talks to the server with two small requests.
2. **A tiny server on your laptop** (`server.js`). Node's built-in web server. It does two
   jobs: hands the browser the page files, and answers two API requests —
   "write me questions for these notes" and "grade this answer." It is the only place the
   AI key exists. The browser never sees the key.
3. **Claude, the AI model**, reached through Anthropic's official SDK. The server sends the
   notes (or an answer) with instructions and a **JSON schema** — a description of the exact
   shape of answer we want back (for example: a list of exactly five objects, each with a
   `question` and an `answer`). The model is constrained to reply in that shape, and the server
   still checks the reply before using it.

Why this shape: a beginner can read every file, there is one dependency, one command starts
it, and the secret stays on the server. Anything fancier (a frontend framework, a database,
accounts) would add setup without proving the idea.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.

1. You open `http://localhost:3000/app`. The server reads `public/app.html` (plus CSS and JS)
   from disk and sends it. You see the Start screen.
2. You paste notes and press Quiz me. `public/app.js` checks the word count (100–2,500),
   trims if needed, then `POST /api/questions` with `{ notes }`.
3. `server.js` receives it, re-checks the length, and calls Claude with a system prompt
   ("write exactly five short-answer questions using only this text…") and the **questions
   schema**. Claude returns JSON: `{ ok: true, questions: [{ question, answer }, …] }` or
   `{ ok: false, reason }` if the text is not study material.
4. The server validates the JSON (five items, non-empty strings) and sends it back. The page
   stores the questions in a JavaScript object and shows Question 1. The notes textbox is
   gone from the screen.
5. You type an answer, pick a confidence, press Submit. The page `POST /api/grade` with
   `{ question, referenceAnswer, userAnswer, notes }`.
6. The server calls Claude with the **grade schema**. Claude returns
   `{ verdict: "right" | "partly" | "wrong", feedback, correctAnswer }`. The server validates
   and returns it. The page records `{ verdict, confidence }` and shows Feedback.
7. "I don't know" never hits the server: the page records `wrong` + `guessing` and shows the
   stored reference answer.
8. After the fifth answer the page computes score, accuracy %, confidence %, the headline and
   the Study these first list from its in-memory array and shows Results. Try again resets the
   object and shows Start. Nothing is ever written to disk or a database.

## Stack
- **Node.js 22** (present: v22.22.2) — runs the server. Built-in `http`, `fs`, `path`.
  `node --env-file=.env` loads the key, so no dotenv package.
  Docs: https://nodejs.org/docs/latest-v22.x/api/
- **`@anthropic-ai/sdk`** (latest) — official Claude SDK; `client.messages.create` with
  `output_config.format` for structured JSON. Docs: https://platform.claude.com/docs and
  https://github.com/anthropics/anthropic-sdk-typescript
- **Model:** `claude-opus-5-5` by default (overridable with `RECALL_MODEL`). Chosen for
  grading quality — it has to be fair about "right in meaning, worded differently." Tradeoff:
  a few seconds per call and a few cents per quiz; `claude-sonnet-5-5` is a cheaper swap.
- **Frontend:** vanilla HTML/CSS/JS, Google Fonts (IBM Plex Serif + IBM Plex Sans) with
  system fallbacks. No build step, no framework. Tradeoff accepted: a little more hand-written
  DOM code in exchange for zero tooling.
- **Verified in this session:** Node version, SDK method names and the `output_config.format`
  shape (from the Claude API reference). **To check early in the build:** the installed SDK
  version accepts `output_config` (it is current API; if not, upgrade the package).

## Where It Runs and How Someone Tries It
Runtime: a local Node process serving a page to any modern browser. Requires Node 22+ and an
Anthropic API key.

```bash
git clone https://github.com/LSUDOKO/recall-first && cd recall-first
npm install
cp .env.example .env        # then paste your key: ANTHROPIC_API_KEY=sk-ant-...
npm start                   # → http://localhost:3000 (landing), /app (the quiz)
```

For the demo recording: open `http://localhost:3000/app` at ~125 % zoom, paste real notes, run
the full loop, end on the Results screen. Deployment is optional and not planned for the
submission; the server is a single file and would deploy to any Node host later.

Dev-only switch: `RECALL_MOCK=1 npm start` serves canned questions and grades (clearly
labelled in the UI) so the screens can be exercised without spending API calls. Never used
in the demo.

## Look and Feel
Carried from `prd.md > Look and Feel`; implemented as CSS custom properties in
`public/styles.css`.

- Palette: `--paper: #F5F4F0` background, `--ink: #17213A` text, `--muted: #5C6273`,
  `--rule: #D9DAD5` lines, `--card: #FFFFFF`; `--mark: #F5E663` highlighter (gap on the
  calibration scale, "sure but wrong" items, Certain step when selected); `--right: #1F6F5B`,
  `--partly: #9A6B00`, `--wrong: #B3261E`.
- Type: IBM Plex Serif for wordmark, questions, headline and big numbers; IBM Plex Sans for
  everything else; both from Google Fonts with Georgia / system-ui fallbacks. Base 18 px,
  questions ~30 px, score number ~88 px. Serif body lines get a little extra line-height.
- Layout: one left-aligned column, max-width 640 px, 24 px gutters on mobile. Thin 1 px
  rules separate regions; cards only where a region needs to read as one object (the
  "correct answer" block, each Study-these-first item). No shadows, no gradients.
- Motion: screen changes fade/slide 180 ms; the verdict word appears with a short ease-out;
  everything respects `prefers-reduced-motion`.
- Brand mark: inline SVG — thin ring with a filled dot sitting low-left inside it.
- Controls: primary button = ink fill / paper text; secondary = underlined text button;
  confidence picker = four equal segments in a single bordered strip, the chosen one fills
  with ink (Certain fills with highlighter and ink text). Visible focus rings everywhere.
- Calibration scale (Results): a 0–100 % track; two markers labelled "felt" and "knew"; the
  span between them filled with `--mark`. This is the memorable element; the rest stays quiet.

## Components

### The page shell and screen switcher
`public/app.html` holds all the quiz screens as `<section>` elements; `public/app.js` shows
exactly one by toggling a `hidden` attribute and fading the new one in. Holds the single
in-memory `session` object (notes, questions, answers, current index).
PRD ref: `prd.md > Screens and Layout`.

### Start screen and note intake
Textarea with live word count, Quiz me button (disabled under 100 words), truncation notice
over 2,500 words, inline area for "not study material" / error / missing-key messages.
Calls `POST /api/questions`.
PRD ref: `prd.md > Pasting notes and starting a quiz`, `prd.md > States and Boundaries`.

### Question screen and confidence picker
Progress label + bar, question text, textarea, four-segment confidence control, Submit
(disabled until a confidence is picked), I don't know. Calls `POST /api/grade` or records
the I-don't-know result locally.
PRD ref: `prd.md > Answering from memory with a confidence rating`.

### Feedback screen
Verdict pill, feedback text, correct answer, chosen confidence, Next question / See results.
PRD ref: `prd.md > Grading each answer`.

### Results screen and the overconfidence check
Score, calibration scale (felt vs knew), headline sentence, Study these first list,
collapsed All answers, Try again. All computed in `app.js` from `session.answers` by a pure
function `summarize(answers)` so it can be checked with a tiny script.
PRD ref: `prd.md > Results and the overconfidence check`.

### The server
`server.js`: serves `public/` statically; `POST /api/questions` and `POST /api/grade` read a
JSON body, validate inputs, call `lib/ai.js`, validate the model's JSON, respond. Returns
`503 { error: "missing_key" }` if `ANTHROPIC_API_KEY` is unset and mock mode is off.
PRD ref: `prd.md > States and Boundaries` (AI error, missing key).

### Deployment (Vercel)
`api/status.js`, `api/questions.js`, `api/grade.js`, `api/followups.js` each wrap one handler
from `lib/routes.js` with `lib/vercel.js`; `public/` is served as static files. `vercel.json`
raises the function timeout to 60 s for the Opus call. Env vars on Vercel: `ANTHROPIC_API_KEY`
(live) or `RECALL_MOCK=1` (practice mode until a key is added). Local dev keeps `server.js`.
PRD ref: `prd.md > Expansion After the Proof of Concept > Deployment`.

### Shared route handlers
`lib/routes.js`: `handlers.status / questions / grade / followups` take a parsed body and return
data or throw `{status, code}`; `errorResponse` maps a throw to `{status, body}`. Both hosts use it.

### Expansion features (page side)
All in `public/app.js`, driven by the same `session` object: hint ladder (`renderQuestion`),
voice (`setupVoice`, Web Speech API, feature-detected), spot-the-false-sentence (`renderSpot`),
hypercorrection (`startFix` → `/api/followups` → the normal question/feedback loop with
`session.fix` set), teach-the-gap (`checkCorrection` → `/api/grade`), guess-first (`session.round`,
`renderRead`, `startRound(avoid)`), second notes set (`combinedNotes`, sets joined by a `---`
line), exports (`download`, `ics`), share card (`shareCard`), local trend (`saveRun`,
`renderTrend`, `localStorage` key `recallfirst.runs`). Maths for certainty-based marking,
fluency traps and the blind-spot map live in `summarize` and are covered by `npm test`.
PRD ref: `prd.md > Expansion After the Proof of Concept`.

### The AI module
`lib/ai.js`: `generateQuestions(notes, {avoid})`, `gradeAnswer({...})` and
`generateFollowUps({items, notes})`. The questions schema also returns `concepts`, three `hints`
per question and a `summary` with one planted false sentence. Each builds a
system prompt, calls `client.messages.create` with `output_config: { format: { type:
"json_schema", schema } }`, parses the text block with `JSON.parse`, and checks the shape.
Also hosts the mock implementations behind `RECALL_MOCK`.
PRD ref: `prd.md > Pasting notes and starting a quiz`, `prd.md > Grading each answer`.

## Data Model
Nothing is stored. The browser holds one object for the life of the page:

```js
session = {
  notes: "",            // trimmed to 2,500 words; sent with each grade request for context
  questions: [{ question, answer }],   // 5 items from the AI
  answers: [{           // one per answered question, in order
    question, referenceAnswer, userAnswer,
    confidence: "guessing" | "unsure" | "fairly" | "certain",
    verdict: "right" | "partly" | "wrong",
    feedback, correctAnswer, skipped: boolean
  }],
  index: 0              // current question
}
```

Updated by the page as the learner acts; reset by Try again or a refresh. The server is
stateless — every request carries what it needs. (Reference answers do travel to the browser;
this is a self-study tool, so "cheating" is not a threat model.)

Score maths (`summarize`): right = 1, partly = 0.5, wrong = 0; accuracy = score / 5;
confidence = mean of {guessing 0.25, unsure 0.5, fairly 0.75, certain 1}; studyFirst =
answers where verdict ≠ right and confidence ∈ {fairly, certain}, Certain first.

## File Structure

```
recall-first/
├── server.js            # local Node http server: static files + /api/* via lib/routes.js
├── api/                 # Vercel functions: status.js, questions.js, grade.js, followups.js
├── vercel.json          # function timeout
├── lib/
│   ├── ai.js            # Claude calls with JSON-schema output, validation, mock mode
│   ├── routes.js        # the four handlers, host-independent
│   └── vercel.js        # wraps a handler as a Vercel function
├── public/
│   ├── index.html       # landing page (what it is, how it works, research)
│   ├── landing.css      # landing styles, reuses the tokens below
│   ├── app.html         # the quiz: <section> screens, brand mark, fonts
│   ├── styles.css       # design tokens (palette, type) and components
│   └── app.js           # session object, screen switching, fetch calls, summarize()
├── test/
│   └── summarize.test.js  # node --test check of the score/overconfidence maths
├── .env.example         # ANTHROPIC_API_KEY=your-key-here
├── .gitignore           # .env, node_modules, devpost/learner-profile.md
├── package.json         # "start": "node --env-file=.env server.js"
├── README.md            # what it is, how to run, how to add the key
└── devpost/             # scope.md, prd.md, spec.md, checklist.md, app-map.html
```

## External Services and Dependencies
**Anthropic Claude API** via `@anthropic-ai/sdk`. Auth: `ANTHROPIC_API_KEY` env var read by
`new Anthropic()`. Cost: Opus 5.5 is $4 / $20 per million input / output tokens; one quiz is
roughly 1 generate + 5 grade calls of ~1–2k tokens each, a few cents. Rate limits are far
above a single user.

Call 1 — questions. `client.messages.create({ model, max_tokens: 4000, system, messages:
[{ role: "user", content: notes }], output_config: { format: { type: "json_schema", schema:
QUESTIONS_SCHEMA } } })` where

```json
{ "type": "object", "additionalProperties": false,
  "required": ["ok", "reason", "questions"],
  "properties": {
    "ok": { "type": "boolean" },
    "reason": { "type": ["string", "null"] },
    "questions": { "type": "array", "items": {
      "type": "object", "additionalProperties": false,
      "required": ["question", "answer"],
      "properties": { "question": { "type": "string" }, "answer": { "type": "string" } } } } } }
```

Server-side validation: `ok === true` ⇒ exactly 5 questions with non-empty strings, else treat
as a malformed response. `ok === false` ⇒ pass `reason` to the page as "not study material."

Call 2 — grade. Same call shape with `GRADE_SCHEMA`:

```json
{ "type": "object", "additionalProperties": false,
  "required": ["verdict", "feedback", "correctAnswer"],
  "properties": {
    "verdict": { "type": "string", "enum": ["right", "partly", "wrong"] },
    "feedback": { "type": "string" },
    "correctAnswer": { "type": "string" } } }
```

Prompts (summarised; full text lives in `lib/ai.js`): questions must be answerable from the
text alone, short-answer, cover different parts of the text, no yes/no, no trivia about
formatting; grading must accept paraphrases, give `partly` for incomplete-but-on-track, be
one or two sentences, and quote the correct answer from the notes. Response `stop_reason` is
checked: `refusal` or `max_tokens` is treated as an error.

Docs: Messages API https://platform.claude.com/docs/en/api/messages ·
Structured outputs https://platform.claude.com/docs/en/build-with-claude/structured-outputs

## Important Failure Modes
- **AI request fails (network, rate limit, bad key)** → server returns `502 { error }`; page
  shows "Something went wrong talking to the AI. Nothing was lost — try again." with a retry
  that repeats the same request. A 401 shows the missing/invalid key message instead.
- **Model returns the wrong shape** (should be rare with schema output) → validation fails,
  same retry path as above; the server logs the raw text for debugging.
- **Text is not study material** → model returns `ok: false` with a reason; page shows it on
  Start and keeps the text editable.
- **Very long notes** → page trims to 2,500 words and says so; server also caps at the same
  limit so a hand-crafted request cannot send a novel.

## What Was Simplified and Why
- **No framework, no build step** instead of React/Vite — four screens and one state object
  fit comfortably in one JS file; the learner can read all of it.
- **Reference answers generated up front and sent to the browser** instead of a server-side
  session store — keeps the server stateless and the code tiny; acceptable for self-study.
- **Mock mode** instead of a test harness that hits the real API — lets the UI be verified
  for free; the real path is still exercised before each checkpoint.
- **Run locally + record** instead of deploying — the submission needs a video and a repo, not
  a URL.

## Decisions and Open Issues
- **Learner choice — AI provider:** Claude via the Anthropic SDK (learner already uses Claude
  tooling and has an Anthropic key). Tradeoff: no free tier; cost is cents per quiz.
- **Learner choice — stack:** plain Node + vanilla frontend, one command to run.
- **Derived — structured output over free-text parsing:** asking for a JSON schema removes
  the most common breakage (the model adding prose around JSON). Still validated server-side.
- **Derived — key only on the server:** the browser calls `/api/*`; the SDK client lives in
  `lib/ai.js`.
- **The learner's uncertainty (learning outcome):** "how does my page actually talk to the
  AI?" Clarified by the journey above: page → `fetch('/api/questions')` → `server.js` →
  `lib/ai.js` → Claude → JSON back → validated → rendered. During the build this is checked
  by logging one real request/response pair in the server console and by the `summarize`
  test showing the browser-side maths independent of the AI.
- **Open:** exact prompt wording will be tuned against real notes during slices 2 and 4;
  if Opus 5.5 feels slow for grading, switch `RECALL_MODEL` to `claude-sonnet-5-5`.
