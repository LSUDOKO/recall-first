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

## Run it

You need Node.js 22 or newer and an Anthropic API key.

```bash
git clone https://github.com/LSUDOKO/recall-first.git
cd recall-first
npm install
cp .env.example .env     # open .env and paste your key after ANTHROPIC_API_KEY=
npm start                # then open http://localhost:3000
```

Try it with `samples/memory-and-learning.txt` if you don't have notes to hand.

The key is read by the server only (`lib/ai.js`); it never reaches the browser. `.env` is in
`.gitignore`, so it will not be committed.

**Practice mode (no AI calls):** `RECALL_MOCK=1 npm start` serves canned questions built from
your sentences and a crude word-overlap grader, clearly labelled in the UI. Handy for seeing
the screens without a key. The demo uses the real model.

**Tests:** `npm test` checks the score and overconfidence maths (`public/app.js > summarize`).

**Model:** defaults to `claude-opus-5-5`. Set `RECALL_MODEL=claude-sonnet-5-5` in `.env` for
a cheaper, faster option.

## How it works

```
browser (public/)  --POST /api/questions {notes}-->  server.js  --> lib/ai.js --> Claude
                   <-- {ok, questions:[{question, answer}]} --                 (JSON schema)
                   --POST /api/grade {question, referenceAnswer, userAnswer, notes}-->
                   <-- {verdict: right|partly|wrong, feedback, correctAnswer} --
```

- `server.js` serves the page and the two API routes. Node's built-in `http`, no framework.
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
server.js              Node http server: static files + /api/questions + /api/grade
lib/ai.js              Claude calls with JSON-schema output, validation, practice mode
public/index.html      page shell and the four screens
public/styles.css      design tokens and components
public/app.js          session object, screen rendering, fetch calls, summarize()
test/summarize.test.js score and overconfidence maths
samples/               example notes to paste
devpost/               scope, PRD, spec, checklist and app map from the Devpost Learn skills
```

## Later

Guess-first questions before reading new material, spaced review of missed questions, a
hint-only mode, saved history. See `devpost/prd.md > Possible Later Enhancements`.

## License

MIT
