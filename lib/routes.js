// The API, independent of how it is hosted. server.js (local) and api/*.js (Vercel)
// both call these with an already-parsed JSON body and send back whatever they return.
import { generateQuestions, gradeAnswer, generateFollowUps, aiStatus } from "./ai.js";

const bad = (message) => Object.assign(new Error(message), { status: 400, code: "bad_request" });
const str = (x) => typeof x === "string";

export const handlers = {
  status: async () => aiStatus(),

  questions: async (body) => {
    if (!str(body.notes) || !body.notes.trim()) throw bad("Paste some notes first.");
    const avoid = Array.isArray(body.avoid) ? body.avoid.filter(str).slice(0, 20) : [];
    return generateQuestions(body.notes, { avoid });
  },

  grade: async (body) => {
    for (const k of ["question", "referenceAnswer", "userAnswer", "notes"]) if (!str(body[k])) throw bad(`Missing ${k}`);
    return gradeAnswer(body);
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
