// The API, independent of how it is hosted. server.js (local) and api/*.js (Vercel)
// both call these with an already-parsed JSON body and send back whatever they return.
import { speak, transcribe, voiceStatus } from "./voice.js";
import { generateQuestions, gradeAnswer, generateFollowUps, reviewQuestions, explainAnswer, coachPlan, askNotes, aiStatus } from "./ai.js";

const bad = (message) => Object.assign(new Error(message), { status: 400, code: "bad_request" });
const str = (x) => typeof x === "string";

export const handlers = {
  status: async () => ({ ...aiStatus(), voice: voiceStatus() }),

  // Returns a Buffer (audio/wav); hosts send it as binary.
  speak: async (body) => speak(body.text),

  transcribe: async (body) => transcribe({ audio: body.audio, mime: body.mime }),

  questions: async (body) => {
    if (!str(body.notes) || !body.notes.trim()) throw bad("Paste some notes first.");
    const avoid = Array.isArray(body.avoid) ? body.avoid.filter(str).slice(0, 20) : [];
    const difficulty = ["easy", "exam", "hard"].includes(body.difficulty) ? body.difficulty : "exam";
    return generateQuestions(body.notes, { avoid, difficulty });
  },

  grade: async (body) => {
    for (const k of ["question", "referenceAnswer", "userAnswer", "notes"]) if (!str(body[k])) throw bad(`Missing ${k}`);
    return gradeAnswer(body);
  },

  explain: async (body) => {
    for (const k of ["question", "correctAnswer", "notes"]) if (!str(body[k])) throw bad(`Missing ${k}`);
    return explainAnswer({ question: body.question.slice(0, 600), correctAnswer: body.correctAnswer.slice(0, 1200), userAnswer: str(body.userAnswer) ? body.userAnswer.slice(0, 1200) : "", notes: body.notes });
  },

  coach: async (body) => {
    if (!body || typeof body.summary !== "object" || !body.summary) throw bad("Missing summary");
    return coachPlan(body.summary);
  },

  ask: async (body) => {
    if (!str(body.notes) || !str(body.question) || !body.question.trim()) throw bad("Ask a question about your notes.");
    return askNotes({ notes: body.notes, question: body.question.slice(0, 400) });
  },

  review: async (body) => {
    if (!str(body.notes)) throw bad("Missing notes");
    const questions = Array.isArray(body.questions) ? body.questions.filter((q) => q && str(q.question) && str(q.answer)).slice(0, 10) : [];
    if (!questions.length) throw bad("Nothing to review");
    return reviewQuestions({ questions, notes: body.notes });
  },

  followups: async (body) => {
    if (!str(body.notes)) throw bad("Missing notes");
    const items = Array.isArray(body.items) ? body.items.filter((it) => it && str(it.question) && str(it.correctAnswer)).slice(0, 5) : [];
    if (!items.length) throw bad("Nothing to follow up on");
    return generateFollowUps({ items, notes: body.notes });
  },
};

// Turns a thrown error into { status, body } for either host.
export function errorResponse(err) {
  const status = err.status || 502;
  if (status >= 500) console.error("[api]", err.message);
  return { status, body: { error: err.code || "failed", message: err.message } };
}
