# Recall First

**An app that shows you what you only *think* you know.**

Paste your study notes. Claude writes five short-answer questions from that text only. You
answer each one from memory (the notes are hidden) and say how sure you are *before* you see
the result. Each answer is graded with short feedback and the correct answer from your notes.
The results screen puts your confidence next to your actual score and lists the answers you
were sure about but got wrong, so you know what to study first.

Built for the Devpost [Build With AI: Basics](https://devpost.com) hackathon with the Devpost
Learn skill pack. The planning documents that drove the build are in [`devpost/`](devpost/):
[scope](devpost/scope.md), [PRD](devpost/prd.md), [spec](devpost/spec.md) and the
[build checklist](devpost/checklist.md).

## Why

Asking an AI to summarise your notes feels like studying, but research on retrieval practice
says recalling beats rereading (Pan & Rickard 2018, 122 experiments), typing an answer beats
recognising one (Rowland 2014), and testing makes your confidence judgments more accurate
(Barenberg & Dutke 2018). Recall First is a small, honest version of that loop: no summary
first, no multiple choice, and a confidence rating captured before every result.

## What makes it different

Everything is built around one idea: the gap between what you *feel* you know and what you can
actually recall.

- **Confidence before every result**, then a calibration scale: felt vs knew, gap highlighted.
- **Certainty-based marking**: being sure and wrong costs more than admitting doubt.
- **Fluency traps**: answered fast, Certain, and wrong. The feeling of knowing without the knowing.
- **Spot the false sentence**: an AI summary of your notes with one planted error. Can you catch it?
- **Fix these now**: a second question on each sure-but-wrong item, from a new angle (hypercorrection).
- **Teach the gap**: write the correction in your own words; it's checked against your notes.
- **Blind-spot map**: which concepts in your notes were right, missed, sure-but-wrong, or untested.
- **Hint ladder** instead of answers; a right answer after hints counts half.
- **Guess first**: quiz before you read, read, quiz again with new questions.
- **Mix in a second set of notes**; questions alternate between them.
- **Come back to it**: export missed questions for Anki or as 1/3/7-day calendar reminders.
- **Share the shape, not the notes**: a Wordle-style card with no content in it.
- **Local trend**: felt/knew per run kept only in your browser.
- **Speak your answer** where the browser supports it.

## Run it

You need Node.js 22 or newer and a Groq API key (free tier) or an Anthropic API key.

```bash
git clone https://github.com/LSUDOKO/recall-first.git
cd recall-first
npm install
cp .env.example .env     # open .env and paste your key after GROQ_API_KEY=
npm start                # then open http://localhost:3000 (landing) or http://localhost:3000/app (the quiz)
```

Add your notes as sources (PDF, Word .docx, text or Markdown; drag and drop, several at once, each switchable) or paste text. Files are read in the browser and never uploaded; only the extracted text goes to the model. Try `samples/memory-and-learning.txt` if you don't have notes to hand.

The key is read by the server only (`lib/ai.js`); it never reaches the browser. With `ANTHROPIC_API_KEY` the app uses Claude; otherwise `GROQ_API_KEY` uses `openai/gpt-oss-120b` on Groq with strict JSON-schema output. `.env` is in
`.gitignore`, so it will not be committed.

**Practice mode (no AI calls):** `RECALL_MOCK=1 npm start` serves canned questions built from
your sentences and a crude word-overlap grader, clearly labelled in the UI. Handy for seeing
the screens without a key. The demo uses the real model.

**Tests:** `npm test` checks the score and overconfidence maths (`public/app.js > summarize`).

**Model:** `openai/gpt-oss-120b` on Groq or `claude-opus-5-5` on Claude; override with `RECALL_MODEL`.

## Android

`dist/recall-first.apk` is a small WebView app that opens the live site. Download it from the
[latest release](https://github.com/LSUDOKO/recall-first/releases/latest), allow the install,
done. Rebuild with `android/build.sh` (needs the Android SDK build-tools; no Gradle). Details in
[`android/README.md`](android/README.md).

## Deploy it

The repo deploys to Vercel as-is: `public/` is static, `api/*.js` are functions sharing
`lib/`. Set `ANTHROPIC_API_KEY` in the project's environment variables (or `RECALL_MOCK=1` to
run practice mode publicly without a key). Live: https://recall-first.vercel.app

## How it works

```
browser (public/)  --POST /api/questions {notes}-->  server.js  --> lib/ai.js --> Claude
                   <-- {ok, questions:[{question, answer}]} --                 (JSON schema)
                   --POST /api/grade {question, referenceAnswer, userAnswer, notes}-->
                   <-- {verdict: right|partly|wrong, feedback, correctAnswer} --
```

- `server.js` serves the page and the API routes locally (Node's built-in `http`, no framework);
  `api/*.js` serve the same routes on Vercel. Both use `lib/routes.js`.
- `lib/ai.js` calls Claude with a system prompt and a **JSON schema** (`output_config.format`)
  so the reply always has the expected shape, then validates it anyway.
- `public/app.js` holds the whole session in one in-memory object and renders the four screens:
  Start, Question, Feedback, Results. Nothing is saved anywhere; a refresh starts over.

Edge cases handled: under 100 words (no request made), over 2,500 words (trimmed, with a
notice), empty answer or "I don't know" (counts as wrong with the lowest confidence), text that
isn't study material (the model says so), AI errors (friendly message and a retry that keeps
your progress), missing or rejected key (setup message).

## Project layout

```
server.js              local Node http server: static files + /api/*
api/                   Vercel functions (status, questions, grade, followups)
lib/ai.js              Claude calls with JSON-schema output, validation, practice mode
lib/routes.js          the API handlers, shared by server.js and api/
lib/vercel.js          wraps a handler as a Vercel function
public/index.html      landing page
public/landing.css     landing page styles
public/app.html        the quiz: page shell and its screens
public/styles.css      design tokens and components
public/app.js          session object, screen rendering, fetch calls, summarize()
test/summarize.test.js score and overconfidence maths
samples/               example notes to paste
devpost/               scope, PRD, spec, checklist and app map from the Devpost Learn skills
```

## Built in two stages

Slices 1–6 in `devpost/checklist.md` are the proof of concept the hackathon asks for: one loop,
end to end. Slices 7–8 add the features above and the deployment; `devpost/prd.md > Expansion
After the Proof of Concept` records what and why.

## License

MIT
