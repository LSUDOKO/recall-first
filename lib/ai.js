// All talking-to-the-AI code lives here. server.js calls these functions.
//
// How a call works: we send Claude a system prompt (the rules), the learner's text, and a
// JSON schema — a description of the exact shape we want back. The model is constrained to
// answer in that shape. We still parse and check it before trusting it.
import Anthropic from "@anthropic-ai/sdk";

export const MAX_WORDS = 6000;
export const MIN_WORDS = 100;
export const QUESTION_COUNT = 5;

const MOCK = process.env.RECALL_MOCK === "1";
// Provider: Claude if ANTHROPIC_API_KEY is set, otherwise Groq if GROQ_API_KEY is set.
// Both are asked for the same JSON schema and the reply is validated the same way.
const PROVIDER = process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.GROQ_API_KEY ? "groq" : null;
const MODEL = process.env.RECALL_MODEL || (PROVIDER === "groq" ? "openai/gpt-oss-120b" : "claude-opus-5-5");
const client = PROVIDER === "anthropic" && !MOCK ? new Anthropic() : null;   // reads ANTHROPIC_API_KEY

export function aiStatus() {
  return { ready: MOCK || Boolean(PROVIDER), mock: MOCK, provider: MOCK ? "practice" : PROVIDER, model: MODEL,
    minWords: MIN_WORDS, maxWords: MAX_WORDS };
}

const words = (t) => t.trim().match(/\S+/g) || [];
export const trimWords = (t, max = MAX_WORDS) => (words(t).length <= max ? t.trim() : words(t).slice(0, max).join(" "));
const fail = (message, status = 502, code = "ai_failed") => Object.assign(new Error(message), { status, code });

// ---------- Call 1: notes → five questions ----------

const QUESTIONS_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["ok", "reason", "concepts", "questions", "summary"],
  properties: {
    ok: { type: "boolean", description: "true if the text is study material and five questions were written" },
    reason: { type: ["string", "null"], description: "when ok is false: one friendly sentence saying why questions could not be written" },
    concepts: { type: "array", items: { type: "string" }, description: "4 to 6 short labels (2-4 words) for the main ideas the text covers, in order of appearance" },
    questions: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["question", "answer", "concept", "hints"],
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          concept: { type: "string", description: "exactly one of the concepts labels" },
          hints: { type: "array", items: { type: "string" }, description: "three hints, weakest first: 1) the area of the notes it comes from, 2) a related detail that narrows it, 3) the first few words of the answer. Never the full answer." },
        } },
    },
    summary: {
      type: "object", additionalProperties: false, required: ["sentences", "wrongIndex", "explanation"],
      description: "a three-sentence summary of the text where exactly one sentence contains a plausible factual error",
      properties: {
        sentences: { type: "array", items: { type: "string" } },
        wrongIndex: { type: "integer", description: "0, 1 or 2: which sentence is wrong" },
        explanation: { type: "string", description: "one sentence: what the error is and what the notes actually say" },
      },
    },
  },
};

const QUESTIONS_PROMPT = `You write short-answer recall questions for a learner who is about to answer them from memory.

Rules:
- Write exactly ${QUESTION_COUNT} questions, using ONLY the text the learner pasted. Never bring in outside facts.
- Each question must be answerable in one or two sentences by someone who studied this text, and must have one clearly correct answer that is stated in the text.
- Cover different parts and ideas of the text; no two questions about the same fact. If the text contains sections separated by a line of dashes, alternate between the sections.
- No yes/no questions, no multiple choice, no questions about formatting, headings or the author's wording.
- Each "answer" is the correct answer in one or two sentences, drawn from the text.
- "concepts": 4 to 6 short labels for the main ideas in the text. Tag every question with exactly one of them. Not every concept needs a question.
- "hints": three per question, weakest first. Hint 3 may give the first few words of the answer but never the whole answer.
- "summary": write a plausible three-sentence summary of the text, but make exactly one sentence factually wrong in a subtle, believable way (a swapped cause and effect, a wrong number, a wrong name). Record which one and why.
- If the learner supplies a list of questions to avoid, write different questions on different facts.
- If the text is not study material (random characters, a shopping list, a single repeated line, too little content for five distinct questions), set ok to false, give a short friendly reason, and return empty lists.`;

export async function generateQuestions(rawNotes, { avoid = [] } = {}) {
  const notes = trimWords(rawNotes);
  if (words(notes).length < MIN_WORDS) throw fail(`Paste at least ${MIN_WORDS} words.`, 400, "too_short");
  if (MOCK) return mockQuestions(notes, avoid);
  const user = avoid.length ? `${notes}\n\nQUESTIONS TO AVOID (already asked):\n${avoid.map((q) => `- ${q}`).join("\n")}` : notes;
  const data = await askForJson({ system: QUESTIONS_PROMPT, user, schema: QUESTIONS_SCHEMA, maxTokens: 4000, effort: "medium" });
  if (data.ok === false) return { ok: false, reason: String(data.reason || "That text doesn't look like study material.") };
  return { ok: true, ...shapeQuiz(data) };
}

// Checks the model's reply and trims it to exactly what the page needs.
function shapeQuiz(data) {
  const str = (x) => typeof x === "string" && x.trim();
  const concepts = (Array.isArray(data.concepts) ? data.concepts : []).filter(str).map((c) => c.trim()).slice(0, 6);
  const qs = (Array.isArray(data.questions) ? data.questions : [])
    .filter((q) => q && str(q.question) && str(q.answer))
    .slice(0, QUESTION_COUNT)
    .map((q) => ({
      question: q.question.trim(), answer: q.answer.trim(),
      concept: concepts.includes(q.concept) ? q.concept : (concepts[0] || "General"),
      hints: (Array.isArray(q.hints) ? q.hints : []).filter(str).map((h) => h.trim()).slice(0, 3),
    }));
  if (qs.length < QUESTION_COUNT) throw fail("The AI didn't return five usable questions.");
  const sm = data.summary || {};
  const sentences = (Array.isArray(sm.sentences) ? sm.sentences : []).filter(str).map((x) => x.trim()).slice(0, 3);
  const summary = sentences.length === 3 && Number.isInteger(sm.wrongIndex) && sm.wrongIndex >= 0 && sm.wrongIndex < 3
    ? { sentences, wrongIndex: sm.wrongIndex, explanation: str(sm.explanation) ? sm.explanation.trim() : "" }
    : null;   // the quiz still works without the spot-the-error round
  return { concepts: concepts.length ? concepts : [...new Set(qs.map((q) => q.concept))], questions: qs, summary };
}

// ---------- Call 1b: follow-up questions for the answers you were sure about and missed ----------

const FOLLOWUPS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["followUps"],
  properties: { followUps: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["question", "answer", "hints"],
    properties: { question: { type: "string" }, answer: { type: "string" }, hints: { type: "array", items: { type: "string" } } } } } },
};

const FOLLOWUPS_PROMPT = `A learner just answered some questions wrongly while feeling sure. For each item, write ONE new short-answer question that tests the same fact from a different angle (a different phrasing, the reverse direction, or an application of it), using only the notes. Give the answer in one or two sentences drawn from the notes and three hints, weakest first, never containing the full answer. Return the follow-ups in the same order as the items, one per item.`;

export async function generateFollowUps({ items, notes }) {
  if (MOCK) return { followUps: items.map((it) => ({ question: `Second try, put differently: ${it.question.replace(/^According to your notes, /, "")}`, answer: it.correctAnswer, hints: mockHints(it.correctAnswer) })) };
  const user = `NOTES:\n${trimWords(notes)}\n\nITEMS:\n${items.map((it, i) => `${i + 1}. Q: ${it.question}\n   Correct answer: ${it.correctAnswer}`).join("\n")}`;
  const data = await askForJson({ system: FOLLOWUPS_PROMPT, user, schema: FOLLOWUPS_SCHEMA, maxTokens: 2000, effort: "low" });
  const str = (x) => typeof x === "string" && x.trim();
  const fu = (Array.isArray(data.followUps) ? data.followUps : []).filter((f) => f && str(f.question) && str(f.answer))
    .map((f) => ({ question: f.question.trim(), answer: f.answer.trim(), hints: (Array.isArray(f.hints) ? f.hints : []).filter(str).slice(0, 3) }));
  if (fu.length < items.length) throw fail("The AI didn't return a follow-up for every item.");
  return { followUps: fu.slice(0, items.length) };
}

// ---------- Call 2: grade one typed answer ----------

const GRADE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["verdict", "feedback", "correctAnswer"],
  properties: {
    verdict: { type: "string", enum: ["right", "partly", "wrong"] },
    feedback: { type: "string", description: "one or two short sentences, second person, warm and direct" },
    correctAnswer: { type: "string", description: "the correct answer in one or two sentences, drawn from the notes" },
  },
};

const GRADE_PROMPT = `You grade one short answer a learner typed from memory, against the notes they studied.

Rules:
- "right": the answer matches the reference answer in meaning. Different wording, order, or level of detail is fine as long as the key idea is correct and nothing important is wrong.
- "partly": the main idea is there but something important is missing, vague, or one detail is wrong.
- "wrong": the key idea is missing or incorrect, or the answer is empty, off-topic, or a guess that misses.
- Feedback is one or two sentences, second person, specific: say what was right and what was missing or mistaken. No praise padding, no scolding.
- correctAnswer is the correct answer in one or two sentences, taken from the notes.
- Judge only against the notes and the reference answer, never outside knowledge.`;

export async function gradeAnswer({ question, referenceAnswer, userAnswer, notes }) {
  if (MOCK) return mockGrade(referenceAnswer, userAnswer);
  const user = `NOTES:\n${trimWords(notes)}\n\nQUESTION:\n${question}\n\nREFERENCE ANSWER:\n${referenceAnswer}\n\nLEARNER'S ANSWER:\n${userAnswer.trim() || "(no answer)"}`;
  const data = await askForJson({ system: GRADE_PROMPT, user, schema: GRADE_SCHEMA, maxTokens: 600, effort: "low" });
  if (!["right", "partly", "wrong"].includes(data.verdict) || typeof data.feedback !== "string" || typeof data.correctAnswer !== "string")
    throw fail("The AI returned a grade in an unexpected shape.");
  return { verdict: data.verdict, feedback: data.feedback.trim(), correctAnswer: data.correctAnswer.trim() };
}

// ---------- Call 3: question-quality review (keeps "only from your notes" verifiable) ----------

const REVIEW_SCHEMA = {
  type: "object", additionalProperties: false, required: ["issues"],
  properties: { issues: { type: "array", items: { type: "object", additionalProperties: false, required: ["index", "kind", "note"],
    properties: { index: { type: "integer" }, kind: { type: "string", enum: ["not_in_notes", "ambiguous", "duplicate"] }, note: { type: "string" } } } } },
};
const REVIEW_PROMPT = `You audit quiz questions against the notes they were written from. For each question, check: is the answer actually stated in the notes (else "not_in_notes"); could a careful reader give a different correct answer (else "ambiguous"); does it test the same fact as another question ("duplicate")? Report only real problems, one short note each. An empty list is the normal result.`;

export async function reviewQuestions({ questions, notes }) {
  if (MOCK) return { issues: [] };
  const user = `NOTES:\n${trimWords(notes)}\n\nQUESTIONS:\n${questions.map((q, i) => `${i}. Q: ${q.question}\n   A: ${q.answer}`).join("\n")}`;
  const data = await askForJson({ system: REVIEW_PROMPT, user, schema: REVIEW_SCHEMA, maxTokens: 800, effort: "low" });
  const issues = (Array.isArray(data.issues) ? data.issues : []).filter((x) => x && Number.isInteger(x.index) && x.index >= 0 && x.index < questions.length && ["not_in_notes", "ambiguous", "duplicate"].includes(x.kind))
    .map((x) => ({ index: x.index, kind: x.kind, note: String(x.note || "").trim() }));
  return { issues };
}

// ---------- shared: one structured-output call ----------

async function askForJson(args) {
  if (!PROVIDER) throw fail("No API key configured. Add GROQ_API_KEY or ANTHROPIC_API_KEY to .env and restart.", 503, "missing_key");
  return PROVIDER === "groq" ? askGroq(args) : askClaude(args);
}

// Groq: OpenAI-compatible chat completions with strict JSON-schema decoding.
// https://console.groq.com/docs/structured-outputs
async function askGroq({ system, user, schema, maxTokens, effort }) {
  let res;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_completion_tokens: maxTokens * 3,   // reasoning models spend tokens before the JSON
        reasoning_effort: effort === "medium" ? "medium" : "low",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_schema", json_schema: { name: "reply", strict: true, schema } },
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    throw fail("Could not reach the AI service.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw fail("The API key was rejected. Check GROQ_API_KEY.", 401, "bad_key");
  if (res.status === 429) throw fail("The AI is busy right now (rate limit). Try again in a moment.", 429, "rate_limited");
  if (!res.ok) { console.error("[ai] groq error:", res.status, JSON.stringify(data).slice(0, 400)); throw fail(`The AI request failed (${res.status}).`); }
  const choice = data.choices && data.choices[0];
  if (!choice) throw fail("The AI returned nothing. Try again.");
  if (choice.finish_reason === "length") throw fail("The AI's reply was cut off. Try again.");
  const text = choice.message && (choice.message.content || "");
  try {
    return JSON.parse(text);
  } catch {
    console.error("[ai] unparseable reply:", String(text).slice(0, 400));
    throw fail("The AI's reply wasn't valid JSON. Try again.");
  }
}

async function askClaude({ system, user, schema, maxTokens, effort }) {
  let res;
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort, format: { type: "json_schema", schema } },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw fail("The API key was rejected. Check ANTHROPIC_API_KEY in .env.", 401, "bad_key");
    if (err instanceof Anthropic.RateLimitError) throw fail("The AI is busy right now (rate limit). Try again in a moment.", 429, "rate_limited");
    if (err instanceof Anthropic.APIError) throw fail(`The AI request failed (${err.status}).`);
    throw fail("Could not reach the AI service.");
  }
  if (res.stop_reason === "refusal") throw fail("The AI declined to work with this text.");
  if (res.stop_reason === "max_tokens") throw fail("The AI's reply was cut off. Try again.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    console.error("[ai] unparseable reply:", text.slice(0, 400));
    throw fail("The AI's reply wasn't valid JSON. Try again.");
  }
}

// ---------- mock mode: canned behaviour for trying the screens without AI ----------
// ponytail: crude heuristics on purpose. Never used for a real quiz.

function mockQuestions(notes, avoid = []) {
  const sentences = notes.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => words(s).length >= 6);
  const asked = new Set(avoid);
  const toQuestion = (s) => {
    const w = words(s);
    const lead = w.slice(0, Math.min(5, Math.ceil(w.length / 3))).join(" ").replace(/[,;:]$/, "");
    return `According to your notes, what follows "${lead}…"?`;
  };
  const pool = sentences.filter((s) => !asked.has(toQuestion(s)));
  if (pool.length < QUESTION_COUNT) return { ok: false, reason: "Practice mode needs at least five full sentences to make questions from." };
  const step = Math.max(1, Math.floor(pool.length / QUESTION_COUNT));
  const picked = Array.from({ length: QUESTION_COUNT }, (_, i) => pool[i * step]);
  const conceptOf = (s) => `Part ${Math.min(5, Math.floor((sentences.indexOf(s) / sentences.length) * 5) + 1)} of your notes`;
  const concepts = [...new Set(sentences.map(conceptOf))];
  const summary = sentences.length >= 3 ? (() => {
    const pick = [sentences[0], sentences[Math.floor(sentences.length / 2)], sentences[sentences.length - 1]];
    const wrongIndex = 1;
    const wrong = pick[wrongIndex].replace(/\b(more|better|increase|increases|higher|larger)\b/i, (m) => ({ more: "less", better: "worse", increase: "decrease", increases: "decreases", higher: "lower", larger: "smaller" })[m.toLowerCase()] || m).replace(/\b(\d+)\b/, (m) => String(Number(m) * 2 + 1));
    const changed = wrong !== pick[wrongIndex];
    return { sentences: pick.map((x, i) => (i === wrongIndex ? (changed ? wrong : `It is not the case that ${x.charAt(0).toLowerCase()}${x.slice(1)}`) : x)), wrongIndex,
      explanation: `Practice mode flipped this sentence. Your notes actually say: ${pick[wrongIndex]}` };
  })() : null;
  return { ok: true, concepts, summary, questions: picked.map((s) => ({ question: toQuestion(s), answer: s, concept: conceptOf(s), hints: mockHints(s) })) };
}

function mockHints(answer) {
  const w = words(answer);
  return [`It comes from the part of your notes about "${w.slice(0, 3).join(" ")}…".`, `The sentence has about ${w.length} words and mentions "${w[Math.floor(w.length / 2)]}".`, `It starts: "${w.slice(0, Math.ceil(w.length / 3)).join(" ")}…"`];
}

function mockGrade(referenceAnswer, userAnswer) {
  const norm = (t) => new Set(words(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "")).filter((x) => x.length > 3));
  const ref = norm(referenceAnswer), ans = norm(userAnswer);
  const overlap = [...ans].filter((x) => ref.has(x)).length / Math.max(1, ref.size);
  const verdict = overlap >= 0.5 ? "right" : overlap >= 0.2 ? "partly" : "wrong";
  const feedback = { right: "Practice mode: most of the key words from your notes are there.",
    partly: "Practice mode: you have part of it, but some key words from your notes are missing.",
    wrong: "Practice mode: this doesn't match what your notes say." }[verdict];
  return { verdict, feedback, correctAnswer: referenceAnswer };
}
