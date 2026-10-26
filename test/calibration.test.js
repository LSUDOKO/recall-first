import { test } from "node:test";
import assert from "node:assert/strict";
import { calibration } from "../public/calibration.js";

const a = (verdict, confidence, hintsUsed = 0) => ({ verdict, confidence, hintsUsed, skipped: false });

test("perfect calibration: certain+right and guessing+wrong gives a low Brier score", () => {
  const r = calibration([a("right", "certain"), a("right", "certain"), a("wrong", "guessing"), a("wrong", "guessing")]);
  assert.equal(r.brier, (0 + 0 + 0.0625 + 0.0625) / 4);
  assert.equal(r.score, 97);
  assert.ok(r.resolution > 0.2);
});

test("certain-but-wrong is the worst Brier contribution and triggers the Certain coaching line", () => {
  const r = calibration([a("wrong", "certain"), a("wrong", "certain"), a("right", "certain"), a("right", "unsure"), a("partly", "fairly")]);
  const certain = r.byLevel.find((l) => l.level === "certain");
  assert.equal(certain.n, 3);
  assert.equal(certain.hit, 1 / 3);
  assert.match(r.coaching, /Treat Certain as Fairly sure/);
});

test("underconfidence gets the trust-yourself line", () => {
  const r = calibration([a("right", "guessing"), a("right", "unsure"), a("right", "unsure"), a("right", "fairly"), a("right", "certain")]);
  assert.match(r.coaching, /trust yourself more/);
});

test("no separation between levels is called out", () => {
  const r = calibration([a("right", "fairly"), a("wrong", "fairly"), a("right", "unsure"), a("wrong", "unsure")]);
  assert.ok(r.resolution < 0.02);
  assert.match(r.coaching, /didn't separate/);
});

test("empty input is safe", () => {
  assert.deepEqual(calibration([]).byLevel, []);
});
