// All talking-to-the-AI code lives here. server.js calls these two functions.
// Slice 1: only status + limits. The real calls arrive in slices 2 and 4.
export const MAX_WORDS = 2500;
export const MIN_WORDS = 100;

const MOCK = process.env.RECALL_MOCK === "1";
const MODEL = process.env.RECALL_MODEL || "claude-opus-5-5";

export function aiStatus() {
  return { ready: MOCK || Boolean(process.env.ANTHROPIC_API_KEY), mock: MOCK, model: MODEL,
    minWords: MIN_WORDS, maxWords: MAX_WORDS };
}

export async function generateQuestions() { throw Object.assign(new Error("Not built yet"), { status: 501 }); }
export async function gradeAnswer() { throw Object.assign(new Error("Not built yet"), { status: 501 }); }
