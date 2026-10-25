// The browser-side maths, checked without a browser or an AI.  Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize } from "../public/app.js";

const a = (verdict, confidence, extra = {}) => ({ question: "q", referenceAnswer: "r", userAnswer: "u", correctAnswer: "c", feedback: "f", skipped: false, verdict, confidence, ...extra });

test("two certain-but-wrong answers produce the demo headline and the study list", () => {
  const r = summarize([a("wrong", "certain"), a("right", "certain"), a("wrong", "certain"), a("partly", "unsure"), a("right", "fairly")]);
  assert.equal(r.headline, "You were Certain on 3 answers — and got 2 of them wrong.");
  assert.equal(r.score, 2.5);
  assert.equal(r.accuracy, 0.5);
  assert.equal(r.confidence, (1 + 1 + 1 + 0.5 + 0.75) / 5);
  assert.deepEqual(r.studyFirst.map((x) => x.number), [1, 3]);
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
});
