// Browser-only persistence: saved decks, relearning schedule, interleaving, share links, backup.
// Pure where possible; the storage object is injectable so node --test can use a plain Map.
export const KEYS = { runs: "recallfirst.runs", decks: "recallfirst.decks", settings: "recallfirst.settings", pretest: "recallfirst.pretest" };
export const DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_SETTINGS = { feedbackMode: "now", explainPrompts: true, letterHints: true, missIntervalDays: 2, hitIntervalDays: 4, retireAfter: 3 };

const mem = new Map();
const storage = () => (typeof localStorage !== "undefined" ? localStorage : { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) });
export function read(key, fallback) { try { const v = storage().getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } }
export function write(key, value) { try { storage().setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export function remove(key) { try { storage().removeItem(key); } catch {} }

export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) });
export const saveSettings = (patch) => write(KEYS.settings, { ...loadSettings(), ...patch });
export const loadDecks = () => read(KEYS.decks, []);
export const saveDecks = (decks) => write(KEYS.decks, decks.slice(-50));

// ---- decks and the relearning schedule ----
// Successive relearning: retrieve until correct, then again on spaced days (Rawson 2013/2022).
// Equal spacing, not expanding (Karpicke & Roediger 2007). An item retires after `retireAfter` spaced hits.

export function makeDeck({ name, concepts = [], questions, answers = [], source = "paste", now = Date.now(), settings = DEFAULT_SETTINGS, revealLater = false }) {
  const items = questions.map((q, i) => {
    const a = answers[i];
    const hit = a ? a.verdict === "right" && !a.hintsUsed : false;
    return { qid: i, streak: hit ? 1 : 0, corrections: 0, hypercorrected: false, revealLater: revealLater && Boolean(a),
      due: now + (hit ? settings.hitIntervalDays : settings.missIntervalDays) * DAY,
      history: a ? [{ t: now, verdict: a.verdict, confidence: a.confidence }] : [] };
  });
  return { id: `d${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, createdAt: now, concepts, source,
    questions: questions.map((q) => ({ question: q.question, answer: q.answer, concept: q.concept, hints: q.hints || [] })), items };
}

export function scheduleItem(item, { verdict, confidence, hintsUsed = 0 }, now = Date.now(), settings = DEFAULT_SETTINGS) {
  const hit = verdict === "right" && !hintsUsed;
  const streak = hit ? item.streak + 1 : 0;
  return { ...item, streak, revealLater: false, hypercorrected: false,
    retired: streak >= settings.retireAfter,
    due: now + (hit ? settings.hitIntervalDays : settings.missIntervalDays) * DAY,
    history: [...item.history, { t: now, verdict, confidence }] };
}

// Items fixed in the hypercorrection round come back a week later: high-confidence errors return (Butler 2011).
export const scheduleFixed = (item, now = Date.now()) => ({ ...item, hypercorrected: true, due: now + 7 * DAY });

export function dueItems(decks, now = Date.now()) {
  return decks.flatMap((deck) => deck.items.filter((it) => !it.retired && it.due <= now).map((it) => ({ deckId: deck.id, deckName: deck.name, ...deck.questions[it.qid], item: it })));
}

// Interleave: no two consecutive items from the same deck when it can be avoided (Brunmair 2019, Sana 2021).
export function interleave(items) {
  const pool = [...items];
  const out = [];
  while (pool.length) {
    let i = pool.findIndex((x) => !out.length || x.deckId !== out[out.length - 1].deckId);
    if (i < 0) i = 0;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// Interleaving helps less for word lists; a deck whose answers average under 4 words looks like one.
export const looksLikeWordList = (deck) => deck.questions.length > 0 &&
  deck.questions.reduce((s, q) => s + (q.answer.trim().match(/\S+/g) || []).length, 0) / deck.questions.length < 4;

// ---- pretesting proof (Pan 2023: learners need feedback to believe guess-first works) ----
export function recordPretest(pretested, read, now = Date.now()) {
  const data = read_(KEYS.pretest, { runs: [] });
  data.runs.push({ t: now, pretested, read });
  write(KEYS.pretest, { runs: data.runs.slice(-30) });
}
const read_ = read;
export function pretestGain() {
  const runs = read(KEYS.pretest, { runs: [] }).runs;
  if (!runs.length) return null;
  return { runs: runs.length, gain: runs.reduce((s, r) => s + (r.read - r.pretested), 0) / runs.length };
}

// ---- share a deck by link: questions and answers only, compressed into the URL hash ----
const MAX_SHARE_BYTES = 8192;
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
async function pump(stream) { const chunks = []; for await (const c of stream) chunks.push(c); const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0)); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out; }

export async function encodeDeck(deck) {
  const payload = JSON.stringify({ n: deck.name, c: deck.concepts, q: deck.questions.map((q) => [q.question, q.answer, q.concept, q.hints]) });
  const compressed = await pump(new Blob([payload]).stream().pipeThrough(new CompressionStream("deflate")));
  if (compressed.length > MAX_SHARE_BYTES) throw Object.assign(new Error("Too long to share by link; export it instead."), { code: "too_long" });
  return b64url(compressed);
}
export async function decodeDeck(code) {
  const bytes = await pump(new Blob([unb64url(code)]).stream().pipeThrough(new DecompressionStream("deflate")));
  const d = JSON.parse(new TextDecoder().decode(bytes));
  if (!d || !Array.isArray(d.q) || !d.q.length) throw new Error("That link doesn't contain a deck.");
  return { name: String(d.n || "Shared deck"), concepts: Array.isArray(d.c) ? d.c : [],
    questions: d.q.map(([question, answer, concept, hints]) => ({ question: String(question), answer: String(answer), concept: String(concept || ""), hints: Array.isArray(hints) ? hints : [] })) };
}

// ---- backup / restore of every recallfirst.* key ----
export function backup() { return Object.fromEntries(Object.values(KEYS).map((k) => [k, read(k, null)]).filter(([, v]) => v != null)); }
export function restore(data) {
  let count = 0;
  for (const k of Object.values(KEYS)) if (data && data[k] != null) { write(k, data[k]); count += 1; }
  return count;
}
