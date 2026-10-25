// All talking-to-the-AI code lives here. server.js calls these functions.
//
// How a call works: we send Claude a system prompt (the rules), the learner's text, and a
// JSON schema — a description of the exact shape we want back. The model is constrained to
// answer in that shape. We still parse and check it before trusting it.
import Anthropic from "@anthropic-ai/sdk";

export const MAX_WORDS = 2500;
export const MIN_WORDS = 100;
export const QUESTION_COUNT = 5;

const MOCK = process.env.RECALL_MOCK === "1";
const MODEL = process.env.RECALL_MODEL || "claude-opus-5-5";
const client = MOCK ? null : new Anthropic();   // reads ANTHROPIC_API_KEY from the environment

export function aiStatus() {
  return { ready: MOCK || Boolean(process.env.ANTHROPIC_API_KEY), mock: MOCK, model: MODEL,
    minWords: MIN_WORDS, maxWords: MAX_WORDS };
}

const words = (t) => t.trim().match(/\S+/g) || [];
export const trimWords = (t, max = MAX_WORDS) => words(t).slice(0, max).join(" ");
const fail = (message, status = 502, code = "ai_failed") => Object.assign(new Error(message), { status, code });

// ---------- Call 1: notes → five questions ----------

const QUESTIONS_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["ok", "reason", "questions"],
  properties: {
    ok: { type: "boolean", description: "true if the text is study material and five questions were written" },
    reason: { type: ["string", "null"], description: "when ok is false: one friendly sentence saying why questions could not be written" },
    questions: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["question", "answer"],
        properties: { question: { type: "string" }, answer: { type: "string" } } },
    },
  },
};

const QUESTIONS_PROMPT = `You write short-answer recall questions for a learner who is about to answer them from memory.

Rules:
- Write exactly ${QUESTION_COUNT} questions, using ONLY the text the learner pasted. Never bring in outside facts.
- Each question must be answerable in one or two sentences by someone who studied this text, and must have one clearly correct answer that is stated in the text.
- Cover different parts and ideas of the text; no two questions about the same fact.
- No yes/no questions, no multiple choice, no questions about formatting, headings or the author's wording.
- Each "answer" is the correct answer in one or two sentences, drawn from the text.
- If the text is not study material (random characters, a shopping list, a single repeated line, too little content for five distinct questions), set ok to false, give a short friendly reason, and return an empty questions list.`;

export async function generateQuestions(rawNotes) {
  const notes = trimWords(rawNotes);
  if (words(notes).length < MIN_WORDS) throw fail(`Paste at least ${MIN_WORDS} words.`, 400, "too_short");
  if (MOCK) return mockQuestions(notes);
  const data = await askForJson({ system: QUESTIONS_PROMPT, user: notes, schema: QUESTIONS_SCHEMA, maxTokens: 2000, effort: "medium" });
  if (data.ok === false) return { ok: false, reason: String(data.reason || "That text doesn't look like study material.") };
  const qs = Array.isArray(data.questions) ? data.questions.filter((q) => q && typeof q.question === "string" && typeof q.answer === "string" && q.question.trim() && q.answer.trim()) : [];
  if (qs.length < QUESTION_COUNT) throw fail("The AI didn't return five usable questions.");
  return { ok: true, questions: qs.slice(0, QUESTION_COUNT).map((q) => ({ question: q.question.trim(), answer: q.answer.trim() })) };
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

// ---------- shared: one structured-output call ----------

async function askForJson({ system, user, schema, maxTokens, effort }) {
  if (!process.env.ANTHROPIC_API_KEY) throw fail("No API key configured. Add ANTHROPIC_API_KEY to .env and restart.", 503, "missing_key");
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

function mockQuestions(notes) {
  const sentences = notes.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => words(s).length >= 6);
  if (sentences.length < QUESTION_COUNT) return { ok: false, reason: "Practice mode needs at least five full sentences to make questions from." };
  const step = Math.max(1, Math.floor(sentences.length / QUESTION_COUNT));
  const picked = Array.from({ length: QUESTION_COUNT }, (_, i) => sentences[i * step]);
  return { ok: true, questions: picked.map((s) => {
    const w = words(s);
    const lead = w.slice(0, Math.min(5, Math.ceil(w.length / 3))).join(" ").replace(/[,;:]$/, "");
    return { question: `According to your notes, what follows "${lead}…"?`, answer: s };
  }) };
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
