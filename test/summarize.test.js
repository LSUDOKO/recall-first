// The browser-side maths, checked without a browser or an AI.  Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, shareCard, points } from "../public/app.js";

const a = (verdict, confidence, extra = {}) => ({ question: "q", referenceAnswer: "r", userAnswer: "u", correctAnswer: "c", feedback: "f", skipped: false, hintsUsed: 0, ms: null, concept: "A", verdict, confidence, ...extra });

test("two certain-but-wrong answers produce the demo headline and the study list", () => {
  const r = summarize([a("wrong", "certain"), a("right", "certain"), a("wrong", "certain"), a("partly", "unsure"), a("right", "fairly")]);
  assert.equal(r.headline, "You were Certain on 3 answers — and got 2 of them wrong.");
  assert.equal(r.score, 2.5);
  assert.equal(r.accuracy, 0.5);
  assert.equal(r.confidence, (1 + 1 + 1 + 0.5 + 0.75) / 5);
  assert.deepEqual(r.studyFirst.map((x) => x.number), [1, 3]);
  assert.equal(r.overconfidence, 2 / 4);
});

test("study-first orders certain before fairly sure and skips low-confidence misses", () => {
  const r = summarize([a("wrong", "fairly"), a("wrong", "guessing"), a("partly", "certain"), a("right", "certain"), a("wrong", "unsure")]);
  assert.deepEqual(r.studyFirst.map((x) => x.number), [3, 1]);
  assert.equal(r.headline, "You were Certain on 2 answers — and got 1 of them not quite right.");
});

test("all right and all certain reads as calibrated", () => {
  const r = summarize(Array(5).fill(a("right", "certain")));
  assert.equal(r.score, 5);
  assert.equal(r.studyFirst.length, 0);
  assert.equal(r.headline, "Your confidence matched your knowledge. Nice calibration.");
  assert.equal(r.cbm.score, 20);
});

test("right answers with low confidence means you know more than you think", () => {
  const r = summarize([a("right", "guessing"), a("right", "unsure"), a("right", "guessing"), a("right", "unsure"), a("partly", "guessing")]);
  assert.equal(r.headline, "You know more than you think.");
});

test("I don't know on everything is wrong, guessing, and never in study-first", () => {
  const r = summarize(Array(5).fill(a("wrong", "guessing", { skipped: true, userAnswer: "" })));
  assert.equal(r.score, 0);
  assert.equal(r.confidence, 0.25);
  assert.equal(r.studyFirst.length, 0);
  assert.equal(r.counts.wrong, 5);
  assert.equal(r.cbm.score, 0);
});

test("certainty-based marking punishes sure-and-wrong and shows the honest alternative", () => {
  const r = summarize([a("right", "certain"), a("wrong", "certain"), a("right", "guessing"), a("partly", "fairly"), a("wrong", "unsure")]);
  // +4, -8, +1, +1.5, -1
  assert.equal(r.cbm.score, -2.5);
  assert.equal(r.cbm.max, 20);
  // every miss (wrong or partly) marked Guessing instead: +4, 0, +1, +0.5, 0
  assert.equal(r.cbm.ifHonest, 5.5);
});

test("a right answer after hints counts half everywhere", () => {
  const hinted = a("right", "certain", { hintsUsed: 2 });
  assert.equal(points(hinted), 0.5);
  const r = summarize([hinted, a("right", "certain"), a("right", "certain"), a("right", "certain"), a("right", "certain")]);
  assert.equal(r.score, 4.5);
  assert.equal(r.cbm.score, 18);
});

test("fluency trap = fast, certain and wrong; slow or unsure misses are not traps", () => {
  const r = summarize([a("wrong", "certain", { ms: 3000 }), a("wrong", "certain", { ms: 20000 }), a("wrong", "unsure", { ms: 2000 }), a("right", "certain", { ms: 1000 }), a("wrong", "certain", { skipped: true, ms: 1000 })]);
  assert.deepEqual(r.fluencyTraps.map((x) => x.number), [1]);
});

test("blind-spot map marks untested, right, missed and sure-but-wrong concepts", () => {
  const r = summarize([a("right", "unsure", { concept: "A" }), a("wrong", "guessing", { concept: "B" }), a("wrong", "certain", { concept: "C" }), a("right", "certain", { concept: "C" }), a("right", "fairly", { concept: "A" })], 5, ["A", "B", "C", "D"]);
  assert.deepEqual(r.blindSpots.map((b) => `${b.name}:${b.status}`), ["A:right", "B:missed", "C:sure-wrong", "D:untested"]);
});

test("share card has one box per answer and leaks no text", () => {
  const answers = [a("right", "certain"), a("wrong", "certain"), a("partly", "unsure"), a("wrong", "guessing", { skipped: true }), a("right", "fairly")];
  const card = shareCard(answers, summarize(answers));
  const lines = card.split("\n");
  assert.equal(lines[1], "🟩🟥🟨🟥🟩");
  assert.equal(lines[2].slice(0, 5), "●●○◌●");
  assert.ok(card.includes("Felt 70%, knew 50%"));
  assert.ok(!card.includes("q") || !card.includes("correct answer"));
});
