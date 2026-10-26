// Calibration maths. Pure functions, no DOM, so node --test can import them.
export const CONFIDENCE = [
  // win/lose = certainty-based marking points (Gardner-Medwin style, four levels)
  { level: "guessing", label: "Guessing", value: 0.25, win: 1, lose: 0 },
  { level: "unsure", label: "Unsure", value: 0.5, win: 2, lose: -1 },
  { level: "fairly", label: "Fairly sure", value: 0.75, win: 3, lose: -3 },
  { level: "certain", label: "Certain", value: 1, win: 4, lose: -8 },
];
export const conf = (level) => CONFIDENCE.find((c) => c.level === level);

// Points for one answer: right 1, partly 0.5, wrong 0; a right answer that needed hints counts as half.
export const points = (a) => (a.verdict === "right" ? (a.hintsUsed ? 0.5 : 1) : a.verdict === "partly" ? 0.5 : 0);

// Brier score (0 = perfect), resolution (how well the levels separate hits from misses),
// a per-level reliability table, and one coaching sentence chosen from the data.
// Research: judgment feedback, not score feedback, is what shifts calibration (Callender 2016).
export function calibration(answers) {
  const n = answers.length;
  if (!n) return { brier: 0, score: 100, resolution: 0, byLevel: [], coaching: "" };
  const hits = answers.map(points);
  const overall = hits.reduce((s, h) => s + h, 0) / n;
  const brier = answers.reduce((s, a, i) => s + (conf(a.confidence).value - hits[i]) ** 2, 0) / n;
  const byLevel = CONFIDENCE.map((c) => {
    const idx = answers.map((a, i) => (a.confidence === c.level ? i : -1)).filter((i) => i >= 0);
    const hit = idx.length ? idx.reduce((s, i) => s + hits[i], 0) / idx.length : null;
    return { level: c.level, label: c.label, claimed: c.value, n: idx.length, hit };
  });
  const resolution = byLevel.reduce((s, l) => s + (l.n ? (l.n / n) * (l.hit - overall) ** 2 : 0), 0);
  const pct = (x) => Math.round(x * 100);
  const certain = byLevel[3], low = { n: byLevel[0].n + byLevel[1].n,
    hit: byLevel[0].n + byLevel[1].n ? ((byLevel[0].hit ?? 0) * byLevel[0].n + (byLevel[1].hit ?? 0) * byLevel[1].n) / (byLevel[0].n + byLevel[1].n) : null };
  let coaching;
  if (certain.n >= 2 && certain.hit <= 0.6) coaching = `You chose Certain ${certain.n} times and it held ${pct(certain.hit)}% of the time. Treat Certain as Fairly sure until it earns the name.`;
  else if (low.n >= 2 && low.hit >= 0.75) coaching = `When you said Guessing or Unsure you were right ${pct(low.hit)}% of the time. You can trust yourself more than you do.`;
  else if (brier <= 0.1 && resolution >= 0.05) coaching = "Your levels mean what they say, and they separate what you know from what you don't. Keep rating this honestly.";
  else if (brier <= 0.1) coaching = "Well calibrated this run: what you felt matched what you knew.";
  else if (resolution < 0.02) coaching = "Your confidence levels didn't separate hits from misses this run. Use the whole scale; Guessing is a fine answer.";
  else coaching = "Your confidence sorts right from wrong, but the levels are pitched too high or too low. The strip above shows which.";
  return { brier, score: Math.round((1 - brier) * 100), resolution, byLevel, coaching };
}
