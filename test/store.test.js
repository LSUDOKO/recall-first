import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDeck, scheduleItem, scheduleFixed, dueItems, interleave, looksLikeWordList, encodeDeck, decodeDeck, backup, restore, write, read, KEYS, DAY, DEFAULT_SETTINGS } from "../public/store.js";

const qs = (n, prefix = "Q") => Array.from({ length: n }, (_, i) => ({ question: `${prefix}${i} question with several words in it?`, answer: `${prefix}${i} answer that is long enough to not be a word list`, concept: "A", hints: ["h1", "h2", "h3"] }));
const ans = (verdict, confidence = "unsure", hintsUsed = 0) => ({ verdict, confidence, hintsUsed });
const T0 = 1_000_000;

test("makeDeck schedules misses sooner than hits and keeps the first history entry", () => {
  const deck = makeDeck({ name: "Memory", questions: qs(3), answers: [ans("right"), ans("wrong"), ans("right", "certain", 1)], now: T0 });
  assert.equal(deck.items[0].due, T0 + 4 * DAY);
  assert.equal(deck.items[1].due, T0 + 2 * DAY);
  assert.equal(deck.items[2].due, T0 + 2 * DAY, "a right answer with hints is treated as a miss");
  assert.equal(deck.items[0].streak, 1);
  assert.equal(deck.items[1].history[0].verdict, "wrong");
});

test("equal spacing: a hit always schedules the same interval and retires after three spaced hits", () => {
  let item = makeDeck({ name: "x", questions: qs(1), now: T0 }).items[0];
  item = scheduleItem(item, ans("right"), T0 + 1 * DAY);
  assert.equal(item.due - (T0 + 1 * DAY), 4 * DAY);
  item = scheduleItem(item, ans("right"), T0 + 5 * DAY);
  assert.equal(item.due - (T0 + 5 * DAY), 4 * DAY, "interval does not expand");
  assert.equal(item.retired, false);
  item = scheduleItem(item, ans("right"), T0 + 9 * DAY);
  assert.equal(item.retired, true);
  item = scheduleItem(item, ans("wrong"), T0 + 13 * DAY);
  assert.equal(item.streak, 0);
  assert.equal(item.retired, false);
});

test("fixed items come back a week later and are flagged", () => {
  const item = scheduleFixed(makeDeck({ name: "x", questions: qs(1), now: T0 }).items[0], T0);
  assert.equal(item.due, T0 + 7 * DAY);
  assert.equal(item.hypercorrected, true);
});

test("dueItems returns only unretired items whose due date has passed, with deck context", () => {
  const deck = makeDeck({ name: "Memory", questions: qs(3), answers: [ans("wrong"), ans("right"), ans("wrong")], now: T0 });
  deck.items[2].retired = true;
  assert.equal(dueItems([deck], T0 + 1 * DAY).length, 0);
  const due = dueItems([deck], T0 + 2 * DAY);
  assert.deepEqual(due.map((d) => d.item.qid), [0]);
  assert.equal(due[0].deckName, "Memory");
  assert.equal(dueItems([deck], T0 + 10 * DAY).length, 2);
});

test("interleave never puts two items from the same deck back to back when avoidable", () => {
  const items = [...Array(3).fill({ deckId: "a" }), ...Array(3).fill({ deckId: "b" }), { deckId: "c" }];
  const out = interleave(items);
  assert.equal(out.length, 7);
  for (let i = 1; i < out.length; i++) assert.notEqual(out[i].deckId, out[i - 1].deckId);
  assert.deepEqual(interleave([{ deckId: "a" }, { deckId: "a" }]).length, 2, "falls back when only one deck remains");
});

test("word-list detector", () => {
  assert.equal(looksLikeWordList(makeDeck({ name: "x", questions: qs(2), now: T0 })), false);
  const vocab = makeDeck({ name: "v", questions: [{ question: "cat", answer: "gato" }, { question: "dog", answer: "perro" }], now: T0 });
  assert.equal(looksLikeWordList(vocab), true);
});

test("share codec round-trips and rejects oversize decks", async () => {
  const deck = makeDeck({ name: "Memory & sleep", concepts: ["A"], questions: qs(5), now: T0 });
  const code = await encodeDeck(deck);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const back = await decodeDeck(code);
  assert.equal(back.name, "Memory & sleep");
  assert.deepEqual(back.questions.map((q) => q.answer), deck.questions.map((q) => q.answer));
  const rnd = () => Array.from({ length: 6 }, () => crypto.randomUUID()).join(" ");
  const huge = makeDeck({ name: "big", questions: Array.from({ length: 150 }, () => ({ question: rnd(), answer: rnd() })), now: T0 });
  await assert.rejects(encodeDeck(huge), /Too long/);
});

test("backup and restore cover every key", () => {
  write(KEYS.runs, [{ t: 1 }]); write(KEYS.settings, { feedbackMode: "end" });
  const b = backup();
  assert.ok(b[KEYS.runs] && b[KEYS.settings]);
  write(KEYS.runs, []);
  assert.equal(restore(b), 2);
  assert.deepEqual(read(KEYS.runs, null), [{ t: 1 }]);
  assert.equal(DEFAULT_SETTINGS.feedbackMode, "now");
});
