// Recall First — the page. One in-memory session object, a handful of screens, four fetch calls.
export const MIN_WORDS = 100;
export const MAX_WORDS = 6000;
export const QUESTION_COUNT = 5;
export const FAST_MS = 8000;             // ponytail: fixed cutoff for "answered fast"; make it relative to the learner's median if it misfires
export const CONFIDENCE = [
  // win/lose = certainty-based marking points (Gardner-Medwin style, four levels)
  { level: "guessing", label: "Guessing", value: 0.25, win: 1, lose: 0 },
  { level: "unsure", label: "Unsure", value: 0.5, win: 2, lose: -1 },
  { level: "fairly", label: "Fairly sure", value: 0.75, win: 3, lose: -3 },
  { level: "certain", label: "Certain", value: 1, win: 4, lose: -8 },
];
const conf = (level) => CONFIDENCE.find((c) => c.level === level);

export const countWords = (text) => (text.trim().match(/\S+/g) || []).length;
export const trimWords = (text, max = MAX_WORDS) => {
  const w = text.trim().match(/\S+/g) || [];
  return w.length <= max ? text.trim() : w.slice(0, max).join(" ");   // keep paragraph breaks unless we have to cut
};

// Points for one answer: right 1, partly 0.5, wrong 0; a right answer that needed hints counts as half.
export const points = (a) => (a.verdict === "right" ? (a.hintsUsed ? 0.5 : 1) : a.verdict === "partly" ? 0.5 : 0);

// Score maths and the overconfidence check. Pure: answers in, summary out.
export function summarize(answers, total = QUESTION_COUNT, concepts = []) {
  const score = answers.reduce((sum, a) => sum + points(a), 0);
  const accuracy = score / total;
  const confidence = answers.reduce((sum, a) => sum + conf(a.confidence).value, 0) / total;
  const missed = (a) => a.verdict !== "right";
  const numbered = answers.map((a, i) => ({ ...a, number: i + 1 }));
  const studyFirst = numbered
    .filter((a) => missed(a) && (a.confidence === "fairly" || a.confidence === "certain"))
    .sort((a, b) => conf(b.confidence).value - conf(a.confidence).value);
  const certain = answers.filter((a) => a.confidence === "certain");
  const certainMissed = certain.filter(missed);
  const fairlyMissed = studyFirst.filter((a) => a.confidence === "fairly");
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  let headline;
  if (certainMissed.length) {
    const allWrong = certainMissed.every((a) => a.verdict === "wrong");
    headline = `You were Certain on ${plural(certain.length, "answer")} — and got ${certainMissed.length} of them ${allWrong ? "wrong" : "not quite right"}.`;
  } else if (fairlyMissed.length) {
    headline = `You were fairly sure on ${plural(fairlyMissed.length, "answer")} that didn't hold up.`;
  } else if (accuracy - confidence >= 0.2) {
    headline = "You know more than you think.";
  } else if (confidence - accuracy >= 0.2) {
    headline = "Your confidence ran a little ahead of your recall.";
  } else {
    headline = "Your confidence matched your knowledge. Nice calibration.";
  }
  const counts = { right: 0, partly: 0, wrong: 0 };
  for (const a of answers) counts[a.verdict] += 1;

  // Certainty-based marking: being sure and wrong costs more than admitting doubt.
  const cbmFor = (a, level) => {
    if (a.skipped) return 0;
    const c = conf(level);
    return a.verdict === "right" ? (a.hintsUsed ? c.win / 2 : c.win) : a.verdict === "partly" ? c.win / 2 : c.lose;
  };
  const cbm = {
    score: answers.reduce((s, a) => s + cbmFor(a, a.confidence), 0),
    max: total * CONFIDENCE[3].win,
    ifHonest: answers.reduce((s, a) => s + cbmFor(a, missed(a) ? "guessing" : a.confidence), 0),
  };

  // Fluency trap: fast, certain, and wrong — the feeling of knowing without the knowing.
  const fluencyTraps = numbered.filter((a) => !a.skipped && a.confidence === "certain" && a.verdict === "wrong" && a.ms != null && a.ms < FAST_MS);

  // Blind-spot map: one status per concept the notes cover.
  const blindSpots = concepts.map((name) => {
    const mine = numbered.filter((a) => a.concept === name);
    const status = !mine.length ? "untested" : mine.some((a) => missed(a) && conf(a.confidence).value >= 0.75) ? "sure-wrong" : mine.some(missed) ? "missed" : "right";
    return { name, status, count: mine.length };
  });

  const sure = answers.filter((a) => conf(a.confidence).value >= 0.75);
  const overconfidence = sure.length ? sure.filter(missed).length / sure.length : 0;

  return { score, accuracy, confidence, studyFirst, headline, counts, cbm, fluencyTraps, blindSpots, overconfidence };
}

// XP for one answer = its certainty-based mark. Sure and right earns most, sure and wrong costs most,
// "I don't know" costs nothing: honesty is never punished.
export function xpFor(a) {
  if (a.skipped) return 0;
  const c = conf(a.confidence);
  return a.verdict === "right" ? (a.hintsUsed ? c.win / 2 : c.win) : a.verdict === "partly" ? c.win / 2 : c.lose;
}

// Days in a row with at least one finished run, ending today or yesterday (local time).
export function streakDays(times, now = Date.now()) {
  const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const days = new Set(times.map(day));
  const d = new Date(now);
  if (!days.has(day(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(day(d))) { n += 1; d.setDate(d.getDate() - 1); }
  return n;
}

// Wordle-style share text. No notes, no answers — just the shape of the run.
export function shareCard(answers, summary) {
  const box = { right: "🟩", partly: "🟨", wrong: "🟥" };
  const dot = (a) => (a.skipped ? "◌" : conf(a.confidence).value >= 0.75 ? "●" : "○");
  const pct = (x) => Math.round(x * 100);
  return [
    "Recall First",
    answers.map((a) => box[a.verdict]).join(""),
    answers.map(dot).join("") + "  sure / not sure",
    `Felt ${pct(summary.confidence)}%, knew ${pct(summary.accuracy)}%`,
    summary.studyFirst.length ? `${summary.studyFirst.length} sure-but-wrong to study first` : "No overconfident misses",
  ].join("\n");
}

// Everything below touches the DOM; skip it when imported by a test.
if (typeof document !== "undefined") {
  const { extract, ACCEPT } = await import("./sources.js");
  const { calibration } = await import("./calibration.js");
  const $ = (id) => document.getElementById(id);
  const screens = Object.fromEntries(["start", "read", "question", "feedback", "spot", "results"].map((k) => [k, $(`screen-${k}`)]));
  const notes = $("notes"), notesB = $("notes-b"), meta = $("word-meta"), quizBtn = $("quiz-btn"), notice = $("start-notice");
  const progressLabel = $("progress-label"), progress = $("progress"), progressFill = $("progress-fill");
  const STORE = "recallfirst.runs";
  const XP_KEY = "recallfirst.xp", SOUND_KEY = "recallfirst.sound";
  const MASCOT = { idle: "img/mascot-idle.webp", thinking: "img/mascot-thinking.webp", success: "img/mascot-success.webp", blocked: "img/mascot-blocked.webp" };

  // ----- Sound: tiny WebAudio blips, no files. Off switch in the header. -----
  let soundOn = (() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } })();
  let actx = null;
  function tone(freq, start, dur, type = "sine", gain = 0.08) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + start;
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch { /* audio blocked: silent is fine */ }
  }
  const sfx = {
    tap: () => tone(660, 0, 0.06, "triangle", 0.04),
    right: () => { tone(784, 0, 0.12, "triangle"); tone(1175, 0.09, 0.22, "triangle"); },
    partly: () => { tone(587, 0, 0.14, "triangle"); tone(659, 0.1, 0.18, "triangle"); },
    wrong: () => { tone(330, 0, 0.16, "sawtooth", 0.04); tone(247, 0.12, 0.26, "sawtooth", 0.04); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.28, "triangle")),
  };
  const soundBtn = $("sound-btn");
  function paintSound() { soundBtn.setAttribute("aria-pressed", String(soundOn)); soundBtn.setAttribute("aria-label", soundOn ? "Sound on" : "Sound off"); soundBtn.style.opacity = soundOn ? "1" : ".5"; }
  soundBtn.addEventListener("click", () => { soundOn = !soundOn; try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch {} paintSound(); sfx.tap(); });
  paintSound();

  // ----- Voice out: Groq voice when available, the browser's voice otherwise -----
  const READ_KEY = "recallfirst.readaloud";
  let readAloud = (() => { try { return localStorage.getItem(READ_KEY) !== "off"; } catch { return true; } })();
  const ttsCache = new Map();
  let currentAudio = null, speakToken = 0;
  function stopSpeech() {
    speakToken += 1;
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch {}
    document.querySelectorAll(".speaking").forEach((el) => el.classList.remove("speaking"));
  }
  function browserSay(text, done) {
    if (!("speechSynthesis" in window)) return done();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 1.05; u.lang = "en-US";
    const v = speechSynthesis.getVoices().find((x) => /en[-_](US|GB)/i.test(x.lang) && /natural|google|samantha|female|aria|jenny/i.test(x.name)) || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
  }
  // Speak text; resolves when finished (or immediately when read-aloud is off or cancelled).
  function say(text, { force = false, el = null } = {}) {
    return new Promise(async (resolve) => {
      if ((!readAloud && !force) || !text) return resolve(false);
      stopSpeech();
      const token = speakToken;
      if (el) el.classList.add("speaking");
      const done = () => { if (el) el.classList.remove("speaking"); resolve(token === speakToken); };
      const groq = status.voice && status.voice.tts === "groq" && text.length <= 200;
      if (groq) {
        try {
          let url = ttsCache.get(text);
          if (!url) {
            const res = await fetch("/api/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
            if (!res.ok) { status.voice.tts = "browser"; throw new Error("tts"); }
            url = URL.createObjectURL(await res.blob());
            ttsCache.set(text, url);
          }
          if (token !== speakToken) return resolve(false);
          currentAudio = new Audio(url);
          currentAudio.onended = currentAudio.onerror = done;
          await currentAudio.play();
          return;
        } catch { if (token !== speakToken) return resolve(false); }
      }
      browserSay(text, done);
    });
  }
  const readBtn = $("read-btn");
  function paintRead() { readBtn.setAttribute("aria-pressed", String(readAloud)); readBtn.setAttribute("aria-label", readAloud ? "Read aloud on" : "Read aloud off"); readBtn.classList.toggle("off", !readAloud); }
  readBtn.addEventListener("click", () => { readAloud = !readAloud; try { localStorage.setItem(READ_KEY, readAloud ? "on" : "off"); } catch {} paintRead(); if (!readAloud) stopSpeech(); });
  paintRead();

  // ----- Voice in: record, then Whisper on the server; the browser's recogniser as fallback -----
  // The transcript lands in the answer box for the learner to check; it is never submitted on its own.
  function setupMic(btn, target, { onText } = {}) {
    const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) && status.voice && status.voice.stt === "groq";
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!canRecord && !SR) { btn.hidden = true; return; }
    const label = btn.querySelector(".mic-label"), meter = btn.querySelector(".mic-meter");
    const put = (text) => { target.value = (target.value.trim() + " " + text).trim(); target.dispatchEvent(new Event("input")); onText && onText(text); };
    let rec = null, stream = null, chunks = [], timer = null, raf = 0, actxMic = null, started = 0;
    const idle = () => { btn.classList.remove("rec", "busy"); btn.setAttribute("aria-pressed", "false"); label.textContent = btn.dataset.idle; if (meter) meter.style.setProperty("--lvl", 0); };
    btn.dataset.idle = label.textContent;
    btn.addEventListener("click", async () => {
      if (rec) { rec.stop(); return; }
      stopSpeech();
      if (!canRecord) {   // browser recogniser
        rec = new SR(); rec.lang = "en-US"; rec.interimResults = false; rec.continuous = true;
        btn.classList.add("rec"); btn.setAttribute("aria-pressed", "true"); label.textContent = "Listening… tap to stop";
        rec.onresult = (e) => put(Array.from(e.results).slice(e.resultIndex).map((r) => r[0].transcript).join(" ").trim());
        rec.onerror = () => { label.textContent = "Mic unavailable"; };
        rec.onend = () => { rec = null; idle(); };
        return rec.start();
      }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch { label.textContent = "Allow the microphone to answer by voice"; return; }
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks = []; started = Date.now();
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        clearTimeout(timer); cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); try { actxMic && actxMic.close(); } catch {}
        const took = Date.now() - started; rec = null;
        if (took < 700) { idle(); label.textContent = "Hold on a little longer, then tap stop"; return; }
        btn.classList.remove("rec"); btn.classList.add("busy"); label.textContent = "Transcribing…";
        try {
          const blob = new Blob(chunks, { type: mime || "audio/webm" });
          const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
          const out = await api("/api/transcribe", { audio: b64, mime: blob.type });
          idle();
          if (out.heard) { put(out.text); sfx.tap(); } else label.textContent = "Didn't catch that. Try again?";
        } catch (err) { idle(); label.textContent = err.message && err.code ? err.message : "Couldn't transcribe. Try again?"; }
      };
      rec.start(250);
      btn.classList.add("rec"); btn.setAttribute("aria-pressed", "true"); label.textContent = "Listening… tap to stop";
      timer = setTimeout(() => rec && rec.state === "recording" && rec.stop(), 60_000);
      try {   // live level meter
        actxMic = new (window.AudioContext || window.webkitAudioContext)();
        const an = actxMic.createAnalyser(); an.fftSize = 256; actxMic.createMediaStreamSource(stream).connect(an);
        const data = new Uint8Array(an.frequencyBinCount);
        const tick = () => { an.getByteFrequencyData(data); const lvl = Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 90); meter && meter.style.setProperty("--lvl", lvl.toFixed(2)); raf = requestAnimationFrame(tick); };
        tick();
      } catch {}
    });
  }
  const micButton = (id, text) => `<button type="button" class="mic" id="${id}" aria-pressed="false"><span class="mic-dot"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z"/></svg></span><span class="mic-meter" aria-hidden="true"></span><span class="mic-label">${text}</span></button>`;

  // ----- HUD: lifetime XP and streak, both kept only in this browser -----
  const loadXp = () => { try { return Number(localStorage.getItem(XP_KEY)) || 0; } catch { return 0; } };
  function addXp(n) {
    const total = Math.max(0, loadXp() + n);
    try { localStorage.setItem(XP_KEY, String(total)); } catch {}
    renderHud(true);
    return total;
  }
  function renderHud(bump = false) {
    $("xp-n").textContent = loadXp().toLocaleString();
    $("streak-n").textContent = streakDays(loadRuns().map((r) => r.t));
    if (bump) { const p = $("xp-pill"); p.classList.remove("bump"); void p.offsetWidth; p.classList.add("bump"); }
  }
  function confetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = document.createElement("div"); box.className = "confetti"; box.setAttribute("aria-hidden", "true");
    const colors = ["#5C9DFF", "#1F6BFF", "#BFDBFF", "#3DBD8C", "#FFB547", "#EEF4FF"];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement("i");
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.setProperty("--dx", `${(Math.random() - 0.5) * 240}px`);
      c.style.setProperty("--rot", `${(Math.random() - 0.5) * 1080}deg`);
      c.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
      c.style.animationDelay = `${Math.random() * 0.4}s`;
      box.append(c);
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 3800);
  }

  // The whole session lives here and nowhere else. A refresh wipes it.
  let session = freshSession();
  let status = { ready: true, mock: false };
  function freshSession() {
    return { notes: "", guessFirst: false, round: 1, round1: null, concepts: [], summary: null,
      questions: [], answers: [], index: 0, spot: null, fix: null, startedAt: 0 };
  }

  const touch = window.matchMedia("(pointer: coarse)").matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => Math.round(x * 100);
  const IDK = (q) => ({ userAnswer: "", confidence: "guessing", verdict: "wrong", feedback: "Honest. Here's the answer to study.", correctAnswer: q.answer, skipped: true });

  let scrim = null;
  function show(name, { label, fill } = {}) {
    stopSpeech();
    const asSheet = name === "feedback";   // feedback slides up over the question instead of replacing it
    for (const [k, el] of Object.entries(screens)) {
      el.hidden = asSheet ? !(k === "question" || k === "feedback") : k !== name;
      if (k === name && !asSheet) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; }
    }
    screens.feedback.classList.toggle("sheet", asSheet);
    screens.question.classList.toggle("dim", asSheet);
    screens.question.inert = asSheet;
    if (asSheet && !scrim) { scrim = document.createElement("div"); scrim.className = "scrim"; document.body.append(scrim); }
    if (!asSheet && scrim) { scrim.remove(); scrim = null; }
    progressLabel.hidden = progress.hidden = label == null;
    if (label != null) { progressLabel.textContent = label; progressFill.style.width = `${fill}%`; }
    if (!asSheet) window.scrollTo({ top: 0, behavior: "instant" });
  }
  function quizLabel(offset = 0) {
    const inFix = Boolean(session.fix);
    const n = inFix ? session.fix.items.length : QUESTION_COUNT;
    const prefix = inFix ? "Fix" : session.guessFirst ? `Round ${session.round}, question` : "Question";
    return { label: `${prefix} ${session.index + 1} of ${n}`, fill: ((session.index + offset) / n) * 100 };
  }

  function setNotice(text, kind = "") {
    notice.hidden = !text;
    notice.textContent = text || "";
    notice.className = `notice ${kind}`.trim();
  }

  async function api(path, body) {
    let res;
    try {
      res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      throw Object.assign(new Error("Couldn't reach the server. Is it still running? Nothing was lost — try again."), { code: "offline" });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || "Something went wrong talking to the AI."), { code: data.error, status: res.status });
    return data;
  }
  function friendly(err) {
    if (err.code === "missing_key" || err.code === "bad_key") return err.message + " See README.md for setup.";
    return err.code ? err.message : "Something went wrong talking to the AI. Nothing was lost — try again.";
  }

  // ----- Local-only trend (no account, no server) -----
  function loadRuns() { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; } }
  function saveRun(r) {
    try {
      const runs = loadRuns();
      runs.push({ t: Date.now(), felt: pct(r.confidence), knew: pct(r.accuracy), over: pct(r.overconfidence) });
      localStorage.setItem(STORE, JSON.stringify(runs.slice(-20)));
    } catch { /* private mode or storage blocked: the trend is a nicety, not a need */ }
  }
  function renderTrend() {
    const runs = loadRuns();
    const box = $("trend");
    box.hidden = runs.length === 0;
    if (!runs.length) return;
    const last = runs[runs.length - 1], first = runs[0];
    const bars = runs.slice(-10).map((r) => `<span class="bar" title="felt ${r.felt}%, knew ${r.knew}%"><i class="felt" style="height:${r.felt}%"></i><i class="knew" style="height:${r.knew}%"></i></span>`).join("");
    const change = runs.length > 1 ? ` Overconfidence ${first.over}% on your first run, ${last.over}% on your last.` : "";
    box.innerHTML = `<p class="meta">Your last ${runs.length === 1 ? "run" : `${Math.min(runs.length, 10)} runs`} in this browser: dark is what you felt, light is what you knew.${change}</p><div class="bars">${bars}</div><button type="button" class="btn quiet small" id="clear-runs">Clear</button>`;
    $("clear-runs").addEventListener("click", () => { try { localStorage.removeItem(STORE); } catch {} renderTrend(); });
  }

  // ----- Start screen -----
  // ----- Sources (NotebookLM-style): uploaded files become switchable chips -----
  const sources = [];   // { id, name, kind, text, pages, words, on }
  const fileInput = $("file-input"), drop = $("drop"), list = $("sources");
  fileInput.accept = ACCEPT;
  $("browse-btn").addEventListener("click", () => fileInput.click());
  drop.addEventListener("click", (e) => { if (e.target === drop || e.target.tagName === "P" || e.target.tagName === "svg") fileInput.click(); });
  fileInput.addEventListener("change", () => { const files = [...fileInput.files]; fileInput.value = ""; addFiles(files); });
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); });
  drop.addEventListener("drop", (e) => addFiles([...e.dataTransfer.files]));
  async function addFiles(files) {
    for (const file of files) {
      const src = { id: Math.random().toString(36).slice(2), name: file.name, kind: "", text: "", pages: null, words: 0, on: true, loading: true };
      sources.push(src); renderSources();
      try {
        const r = await extract(file, (p, n) => { src.progress = `${p}/${n}`; renderSources(); });
        Object.assign(src, r, { words: countWords(r.text), loading: false });
        sfx.tap();
      } catch (err) {
        src.loading = false; src.error = err.message || "Couldn't read that file.";
      }
      renderSources(); updateIntake();
    }
  }
  const KIND = { pdf: "PDF", docx: "Word", text: "Text" };
  function renderSources() {
    list.innerHTML = sources.map((s) => `
      <li class="source ${s.on ? "" : "off"} ${s.error ? "bad" : ""}" data-id="${s.id}">
        <span class="src-kind">${s.error ? "!" : KIND[s.kind] || "…"}</span>
        <span class="src-main"><span class="src-name">${esc(s.name)}</span>
          <span class="src-meta">${s.loading ? `Reading${s.progress ? ` page ${s.progress}` : ""}…` : s.error ? esc(s.error) : `${s.words.toLocaleString()} words${s.pages ? `, ${s.pages} page${s.pages === 1 ? "" : "s"}` : ""}`}</span></span>
        ${s.loading || s.error ? "" : `<label class="switch" title="Use this source"><input type="checkbox" ${s.on ? "checked" : ""} data-act="toggle" aria-label="Use ${esc(s.name)}"><span></span></label>`}
        <button type="button" class="icon-btn" data-act="remove" aria-label="Remove ${esc(s.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </li>`).join("");
  }
  list.addEventListener("click", (e) => {
    const li = e.target.closest(".source"); if (!li) return;
    const i = sources.findIndex((s) => s.id === li.dataset.id);
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "remove") { sources.splice(i, 1); renderSources(); updateIntake(); }
  });
  list.addEventListener("change", (e) => {
    const li = e.target.closest(".source"); if (!li) return;
    const s = sources.find((x) => x.id === li.dataset.id); s.on = e.target.checked; renderSources(); updateIntake();
  });

  $("sample-btn").addEventListener("click", async () => {
    try {
      const text = await (await fetch("sample-notes.txt")).text();
      sources.push({ id: "sample", name: "Sample: memory and learning.txt", kind: "text", text, pages: null, words: countWords(text), on: true });
      renderSources(); updateIntake(); sfx.tap(); $("sample-btn").hidden = true;
    } catch { setNotice("Couldn't load the sample notes.", "error"); }
  });

  // Every switched-on source plus pasted text, separated by a line of dashes so questions spread across them.
  const combinedNotes = () => {
    const parts = sources.filter((s) => s.on && s.text).map((s) => s.text);
    if (notes.value.trim()) parts.push(notes.value.trim());
    if (!notesB.closest("#notes-b-wrap").hidden && notesB.value.trim()) parts.push(notesB.value.trim());
    return parts.join("\n\n---\n\n");
  };
  function updateIntake() {
    const n = countWords(combinedNotes());
    quizBtn.disabled = n < MIN_WORDS || !status.ready;
    if (n === 0) meta.textContent = "Add a source or paste about 100 words to start.";
    else if (n < MIN_WORDS) meta.textContent = `${n} words. Paste a bit more, about ${MIN_WORDS - n} more, so the questions have something to work with.`;
    else meta.textContent = `${n.toLocaleString()} words`;
    if (n > MAX_WORDS) setNotice(`That's a lot. Only the first ${MAX_WORDS.toLocaleString()} words will be used.`);
    else if (notice.textContent.startsWith("That's a lot")) setNotice("");
  }
  notes.addEventListener("input", updateIntake);
  notesB.addEventListener("input", updateIntake);
  $("add-set-btn").addEventListener("click", () => {
    const wrap = $("notes-b-wrap");
    wrap.hidden = !wrap.hidden;
    $("add-set-btn").textContent = wrap.hidden ? "Mix in a second set of notes" : "Remove the second set";
    if (!wrap.hidden) notesB.focus();
    updateIntake();
  });

  $("start-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (quizBtn.disabled) return;
    session = freshSession();
    session.notes = trimWords(combinedNotes());
    session.guessFirst = $("guess-first").checked;
    session.difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || "exam";
    await startRound();
  });

  async function startRound(avoid = []) {
    quizBtn.classList.add("busy"); quizBtn.disabled = true; notes.disabled = true;
    meta.textContent = "Writing your questions…";
    try {
      const data = await api("/api/questions", { notes: session.notes, avoid, difficulty: session.difficulty || "exam" });
      if (!data.ok) { setNotice(data.reason, "error"); return; }
      session.questions = data.questions;
      session.concepts = data.concepts || [];
      session.summary = data.summary || null;
      session.answers = []; session.index = 0;
      setNotice("");
      renderQuestion();
    } catch (err) {
      setNotice(friendly(err), "error");
      if (session.round === 2) show("read");   // stay on the read screen so they can retry from there
    } finally {
      quizBtn.classList.remove("busy"); notes.disabled = false; updateIntake();
    }
  }

  // ----- Read screen (guess-first, between round 1 and round 2) -----
  function renderRead() {
    const r1 = summarize(session.round1, QUESTION_COUNT, session.concepts);
    screens.read.innerHTML = `
      <p class="eyebrow-line">Round 1 done: ${fmt(r1.score)} of ${QUESTION_COUNT} before reading.</p>
      <h2 class="headline">Now read your notes.</h2>
      <p class="lede">Guessing first primes you for what matters. Read with the questions you just missed in mind, then take a fresh round.</p>
      <div class="notes-view">${esc(session.notes).replace(/\n\n---\n\n/g, "<hr>").replace(/\n/g, "<br>")}</div>
      <div class="actions"><button class="btn primary" id="round2-btn" type="button">I've read it. Quiz me again</button></div>`;
    show("read");
    $("round2-btn").addEventListener("click", async () => {
      session.round = 2;
      $("round2-btn").classList.add("busy"); $("round2-btn").disabled = true;
      await startRound(session.round1.map((a) => a.question));
    });
  }
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  // ----- Question screen -----
  function currentQ() { return session.fix ? session.fix.items[session.index] : session.questions[session.index]; }

  function renderQuestion() {
    const q = currentQ();
    screens.question.innerHTML = `
      ${status.mock ? '<span class="practice-tag">Practice mode: canned questions, no AI</span>' : ""}
      ${session.fix ? '<p class="eyebrow-line">You were sure about this one. Second chance, new angle.</p>' : ""}
      <div class="coach"><img src="${MASCOT.thinking}" alt="" width="92"><div class="bubble pop" id="q-bubble"><h2 class="question">${esc(q.question)}</h2><button type="button" class="replay" id="replay-btn" aria-label="Read the question aloud"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg></button></div></div>
      <label class="sr-only" for="answer">Your answer</label>
      <div class="answer-wrap">
        <textarea id="answer" rows="5" placeholder="Answer from memory. A sentence or two is enough." autocomplete="off"></textarea>
        ${micButton("mic-btn", "Answer by voice")}
      </div>
      <div id="hints" class="hints" hidden></div>
      <span class="field-label" id="conf-label">How sure are you?</span>
      <div class="confidence" role="group" aria-labelledby="conf-label" id="confidence">
        ${CONFIDENCE.map((c, i) => `<button type="button" data-level="${c.level}" aria-pressed="false"><span class="sig" aria-hidden="true">${[0, 1, 2, 3].map((j) => `<i class="${j <= i ? "on" : ""}"></i>`).join("")}</span><span class="lv">${c.label}</span></button>`).join("")}
      </div>
      <p class="stakes" id="stakes" aria-live="polite">Pick how sure you are. Being sure and wrong costs the most.</p>
      <div class="actions">
        <button class="btn primary" id="check-btn" type="button" disabled>Check answer</button>
        <button class="btn quiet" id="hint-btn" type="button">${q.hints && q.hints.length ? "Get a hint" : "I don't know"}</button>
      </div>`;
    show("question", quizLabel());
    session.startedAt = Date.now();
    const qIndex = session.index, qFix = session.fix;
    const readQ = (force) => say(q.question, { force, el: $("q-bubble") }).then((finished) => {
      // the fluency-trap clock starts when the question has been read, not while it is being read
      if (finished && session.index === qIndex && session.fix === qFix) session.startedAt = Date.now();
    });
    $("replay-btn").addEventListener("click", () => readQ(true));
    readQ(false);
    let confidence = null, hintsUsed = 0;
    const answer = $("answer"), checkBtn = $("check-btn"), picker = $("confidence"), hintBtn = $("hint-btn"), hintsBox = $("hints");
    picker.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-level]");
      if (!btn) return;
      confidence = btn.dataset.level;
      for (const b of picker.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === btn));
      checkBtn.disabled = false;
      const c = conf(confidence);
      $("stakes").innerHTML = `Right: <b>+${c.win} XP</b>. Wrong: <b>${c.lose < 0 ? "−" + Math.abs(c.lose) : "0"} XP</b>.`;
      sfx.tap();
    });
    checkBtn.addEventListener("click", () => submitAnswer(answer.value, confidence, hintsUsed));
    hintBtn.addEventListener("click", () => {
      const hints = q.hints || [];
      if (hintsUsed < hints.length) {
        hintsUsed += 1;
        hintsBox.hidden = false;
        hintsBox.innerHTML = hints.slice(0, hintsUsed).map((h, i) => `<p><span>Hint ${i + 1}</span>${esc(h)}</p>`).join("");
        hintBtn.textContent = hintsUsed < hints.length ? `Another hint (${hints.length - hintsUsed} left)` : "Show the answer";
        if (hintsUsed === 1) hintsBox.insertAdjacentHTML("beforeend", '<p class="meta">A right answer after hints counts half.</p>');
        answer.focus();
      } else {
        recordAnswer({ ...IDK(q), hintsUsed });
      }
    });
    setupMic($("mic-btn"), answer);
    if (!touch) answer.focus();   // on phones, don't pop the keyboard over the question
  }

  async function submitAnswer(userAnswer, confidence, hintsUsed) {
    const q = currentQ();
    const ms = Date.now() - session.startedAt;
    if (!userAnswer.trim()) return recordAnswer({ ...IDK(q), hintsUsed, ms });   // empty = I don't know
    const checkBtn = $("check-btn");
    checkBtn.classList.add("busy"); checkBtn.disabled = true; $("hint-btn").disabled = true; $("answer").disabled = true;
    try {
      const grade = await api("/api/grade", { question: q.question, referenceAnswer: q.answer, userAnswer, notes: session.notes });
      recordAnswer({ userAnswer, confidence, ...grade, skipped: false, hintsUsed, ms });
    } catch (err) {
      showQuestionError(friendly(err), () => submitAnswer(userAnswer, confidence, hintsUsed));
    } finally {
      checkBtn.classList.remove("busy"); checkBtn.disabled = false; $("hint-btn").disabled = false; $("answer").disabled = false;
    }
  }

  function showQuestionError(message, retry) {
    let box = screens.question.querySelector(".notice");
    if (!box) { box = document.createElement("p"); box.className = "notice error"; box.setAttribute("role", "alert"); screens.question.append(box); }
    box.innerHTML = `${esc(message)} <button type="button" class="btn quiet" id="retry-btn">Try again</button>`;
    $("retry-btn").addEventListener("click", () => { box.remove(); retry(); });
  }

  function recordAnswer(entry) {
    const q = currentQ();
    const list = session.fix ? session.fix.answers : session.answers;
    list[session.index] = { question: q.question, referenceAnswer: q.answer, concept: q.concept, hintsUsed: 0, ms: null, ...entry };
    renderFeedback();
  }

  // ----- Feedback screen -----
  const VERDICT = { right: "Right", partly: "Partly right", wrong: "Wrong" };
  function renderFeedback() {
    const list = session.fix ? session.fix.answers : session.answers;
    const total = session.fix ? session.fix.items.length : QUESTION_COUNT;
    const a = list[session.index];
    const last = session.index === total - 1;
    const nextLabel = last ? (session.fix ? "Back to results" : session.guessFirst && session.round === 1 ? "Read your notes" : session.summary ? "One more thing" : "See results") : "Next question";
    const xp = xpFor(a);
    const sure = !a.skipped && conf(a.confidence).value >= 0.75;
    const pose = a.verdict === "right" ? MASCOT.success : a.verdict === "wrong" && sure ? MASCOT.blocked : a.skipped ? MASCOT.idle : MASCOT.thinking;
    const cheer = a.verdict === "right" ? (sure ? "Earned it." : "Right, and you doubted it.") : a.verdict === "partly" ? "Close." : a.skipped ? "Honest." : sure ? "Sure, and wrong." : "Not this time.";
    screens.feedback.innerHTML = `
      <div class="sheet-inner ${a.verdict}" role="dialog" aria-label="Result">
        <div class="sheet-head">
          <img src="${pose}" alt="" width="76">
          <div><p class="verdict ${a.verdict}">${VERDICT[a.verdict]}</p><p class="meta">${cheer}${a.hintsUsed && a.verdict === "right" ? " With hints, counts half." : ""}</p></div>
          <span class="xp-delta ${xp > 0 ? "up" : xp < 0 ? "down" : "zero"}">${xp > 0 ? "+" : xp < 0 ? "−" : ""}${Math.abs(xp)} XP</span>
        </div>
        <p class="feedback-text">${esc(a.feedback)}</p>
        <div class="correct">
          <span class="correct-label">Correct answer, from your notes</span>
          <p>${esc(a.correctAnswer)}</p>
        </div>
        <p class="meta">${a.skipped ? "You said you didn't know." : `You said you were ${conf(a.confidence).label.toLowerCase()}.`}${!a.skipped ? ` You wrote: <q>${esc(a.userAnswer)}</q>` : ""}${a.ms != null && !a.skipped ? ` Answered in ${Math.max(1, Math.round(a.ms / 1000))}s.` : ""}</p>
        ${a.verdict !== "right" || a.hintsUsed ? `<div class="why" id="why-box"><button type="button" class="btn small" id="why-btn">Why? Explain it</button></div>` : ""}
        <div class="actions"><button class="btn wide go-${a.verdict}" id="next-btn" type="button">${nextLabel}</button></div>
      </div>`;
    session.xp = (session.xp || 0) + xp;
    addXp(xp);
    (a.verdict === "right" ? sfx.right : a.verdict === "partly" ? sfx.partly : a.skipped ? sfx.tap : sfx.wrong)();
    setTimeout(() => { if (!screens.feedback.hidden) say(`${VERDICT[a.verdict]}. ${a.feedback}`); }, 350);
    const whyBtn = $("why-btn");
    if (whyBtn) whyBtn.addEventListener("click", async () => {
      whyBtn.classList.add("busy"); whyBtn.disabled = true;
      try {
        const ex = await api("/api/explain", { question: a.question, correctAnswer: a.correctAnswer, userAnswer: a.userAnswer || "", notes: session.notes });
        $("why-box").innerHTML = `<p class="why-text">${esc(ex.explanation)}</p><p class="why-hook"><span>Remember it</span>${esc(ex.hook)}</p>`;
        say(`${ex.explanation} ${ex.hook}`, { force: true });
      } catch (err) {
        whyBtn.classList.remove("busy"); whyBtn.disabled = false;
        $("why-box").insertAdjacentHTML("beforeend", `<p class="meta">${esc(friendly(err))}</p>`);
      }
    });
    show("feedback", quizLabel(1));
    $("next-btn").addEventListener("click", () => {
      if (!last) { session.index += 1; return renderQuestion(); }
      if (session.fix) return finishFix();
      if (session.guessFirst && session.round === 1) { session.round1 = session.answers; return renderRead(); }
      if (session.summary) return renderSpot();
      renderResults();
    });
    $("next-btn").focus();
  }

  // ----- Spot the fake summary -----
  function renderSpot() {
    const sm = session.summary;
    screens.spot.innerHTML = `
      <p class="eyebrow-line">One more thing</p>
      <h2 class="headline">One of these sentences is wrong.</h2>
      <p class="lede">Here's an AI summary of your notes. It reads smoothly, and one sentence is false. Which one?</p>
      <ol class="spot-list" id="spot-list">${sm.sentences.map((s, i) => `<li><button type="button" data-i="${i}">${esc(s)}</button></li>`).join("")}</ol>
      <div id="spot-result" hidden></div>`;
    show("spot", { label: "Spot the error", fill: 100 });
    $("spot-list").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-i]");
      if (!btn || session.spot) return;
      const picked = Number(btn.dataset.i);
      session.spot = { picked, correct: picked === sm.wrongIndex };
      for (const b of screens.spot.querySelectorAll("button[data-i]")) {
        b.disabled = true;
        if (Number(b.dataset.i) === sm.wrongIndex) b.classList.add("is-wrong-sentence");
        else if (Number(b.dataset.i) === picked) b.classList.add("is-picked");
      }
      const box = $("spot-result");
      box.hidden = false;
      box.innerHTML = `<p class="verdict ${session.spot.correct ? "right" : "wrong"}">${session.spot.correct ? "You caught it." : "That one was true."}</p>
        <p class="feedback-text">${esc(sm.explanation || "The highlighted sentence is the false one.")}</p>
        <p class="meta">This is why a summary can feel like studying and still mislead you: it reads just as smoothly when it's wrong.</p>
        <div class="actions"><button class="btn primary" id="to-results" type="button">See results</button></div>`;
      $("to-results").addEventListener("click", renderResults);
      $("to-results").focus();
    });
  }

  // ----- Hypercorrection round -----
  async function startFix(items, btn) {
    btn.classList.add("busy"); btn.disabled = true;
    try {
      const data = await api("/api/followups", { notes: session.notes, items: items.map((a) => ({ question: a.question, correctAnswer: a.correctAnswer })) });
      session.fix = { items: data.followUps.map((f, i) => ({ ...f, concept: items[i].concept, originalNumber: items[i].number })), answers: [] };
      session.index = 0;
      renderQuestion();
    } catch (err) {
      btn.classList.remove("busy"); btn.disabled = false;
      const p = document.createElement("p"); p.className = "notice error"; p.textContent = friendly(err);
      btn.closest(".fix-box").append(p);
    }
  }
  function finishFix() {
    session.fixDone = session.fix.answers;
    session.fix = null;
    renderResults();
  }

  // ----- Results screen -----
  function renderResults() {
    const r = summarize(session.answers, QUESTION_COUNT, session.concepts);
    const r1 = session.round1 ? summarize(session.round1, QUESTION_COUNT, session.concepts) : null;
    const label = (level) => conf(level).label;
    const lo = Math.min(r.confidence, r.accuracy), hi = Math.max(r.confidence, r.accuracy);
    if (!session.saved) { saveRun(r); session.saved = true; }
    const runs = loadRuns(); const prev = runs.length > 1 ? runs[runs.length - 2] : null;
    const fixed = session.fixDone ? session.fixDone.filter((a) => a.verdict === "right").length : null;
    const trapNumbers = new Set(r.fluencyTraps.map((a) => a.number));

    const item = (a) => `
      <li class="study-item" data-n="${a.number}">
        <span class="badge">${label(a.confidence)}</span>${trapNumbers.has(a.number) ? '<span class="badge trap">Fluency trap</span>' : ""}
        <p class="study-q">${esc(a.question)}</p>
        <p class="study-line"><span>You wrote</span>${a.skipped ? "<em>I don't know</em>" : esc(a.userAnswer)}</p>
        <p class="study-line"><span>Correct</span>${esc(a.correctAnswer)}</p>
        <details class="teach">
          <summary>Write the correction in your own words</summary>
          <textarea rows="2" placeholder="One sentence, from memory, as you'd explain it to a friend."></textarea>
          <div class="actions small-actions"><button type="button" class="btn small teach-btn">Check it</button><span class="teach-out" aria-live="polite"></span></div>
        </details>
      </li>`;

    const good = !r.studyFirst.length && r.score >= 3;
    screens.results.innerHTML = `
      <div class="results-top">
        <img src="${r.studyFirst.length ? MASCOT.thinking : MASCOT.success}" alt="" width="110">
        <p class="score"><span class="score-num">${fmt(r.score)}</span><span class="score-of"> of ${QUESTION_COUNT}</span>${r1 ? `<span class="score-before">up from ${fmt(r1.score)} before reading</span>` : ""}</p>
      </div>
      <h2 class="headline results-headline">${esc(r.headline)}</h2>
      <div class="xp-row">
        <span class="pill xp"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>${(session.xp || 0) >= 0 ? "+" : "−"}${Math.abs(session.xp || 0)} XP this run</span>
        <span class="pill streak"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.4 1 2.5 2.3 2.5 1.6 0 2.4-1.4 2-3.4C17.6 10.4 19 13 19 15.5 19 19.6 15.9 22 12 22s-7-2.4-7-6.5C5 10 10.5 7.5 12 2z"/></svg>${streakDays(loadRuns().map((x) => x.t))}-day streak</span>
      </div>

      <div class="scale" role="img" aria-label="You felt ${pct(r.confidence)} percent sure on average and knew ${pct(r.accuracy)} percent.">
        <div class="track">
          <div class="gap" style="left:${pct(lo)}%; width:${pct(hi) - pct(lo)}%"></div>
          <div class="marker felt" style="left:${pct(r.confidence)}%"><span>Felt ${pct(r.confidence)}%</span></div>
          <div class="marker knew" style="left:${pct(r.accuracy)}%"><span>Knew ${pct(r.accuracy)}%</span></div>
        </div>
        <div class="scale-ends"><span>0%</span><span>100%</span></div>
      </div>
      <p class="meta scale-note">Felt is your average confidence. Knew is your score. The highlighted part is the gap.${prev ? ` Last run the gap was ${Math.abs(prev.felt - prev.knew)} points; now it's ${Math.abs(pct(r.confidence) - pct(r.accuracy))}.` : ""}</p>

      ${(() => { const c = calibration(session.answers); return `
      <div class="calib">
        <div class="calib-head"><span class="stat-num">${c.score}</span><span class="stat-label">calibration score <span class="meta">(Brier ${c.brier.toFixed(2)}; 100 is perfect)</span></span></div>
        <div class="rel" role="img" aria-label="How often each confidence level was right">${c.byLevel.map((l) => `
          <div class="rel-col ${l.n ? "" : "empty"}"><div class="rel-bar"><i style="height:${l.n ? Math.round(l.hit * 100) : 0}%"></i><b style="bottom:${Math.round(l.claimed * 100)}%"></b></div><span>${l.label}</span><em>${l.n ? `${Math.round(l.hit * 100)}% of ${l.n}` : "unused"}</em></div>`).join("")}
        </div>
        <p class="meta">Bars show how often each level was right; the tick is what that level claims.</p>
        <p class="calib-coach">${esc(c.coaching)}</p>
      </div>`; })()}

      <div class="coach-card" id="coach-card">
        <img src="${MASCOT.idle}" alt="" width="70">
        <div><p class="eyebrow-line">Your coach</p><p class="coach-msg" id="coach-msg">Looking at your answers…</p><ol class="coach-steps" id="coach-steps"></ol></div>
      </div>

      <div class="stats">
        <div class="stat">
          <span class="stat-num">${r.cbm.score}</span><span class="stat-label">of ${r.cbm.max} confidence-weighted points</span>
          <p class="meta">Sure and right earns most; sure and wrong costs most. Had you marked every miss as Guessing, you'd have ${r.cbm.ifHonest}.</p>
        </div>
        ${r.fluencyTraps.length ? `<div class="stat"><span class="stat-num">${r.fluencyTraps.length}</span><span class="stat-label">fluency trap${r.fluencyTraps.length === 1 ? "" : "s"}</span><p class="meta">Answered in under ${FAST_MS / 1000} seconds, Certain, and wrong. That's the feeling of knowing without the knowing.</p></div>` : ""}
        ${session.spot ? `<div class="stat"><span class="stat-num">${session.spot.correct ? "Caught" : "Missed"}</span><span class="stat-label">the false sentence in the AI summary</span></div>` : ""}
        ${fixed != null ? `<div class="stat"><span class="stat-num">${fixed} of ${session.fixDone.length}</span><span class="stat-label">fixed on the second try</span></div>` : ""}
      </div>

      ${r.blindSpots.length ? `<h3 class="section-title">Blind-spot map</h3>
      <ul class="spots">${r.blindSpots.map((b) => `<li class="spot ${b.status}"><span class="spot-dot"></span>${esc(b.name)}<span class="meta"> ${({ untested: "not tested this run", right: "right", missed: "missed", "sure-wrong": "sure but wrong" })[b.status]}</span></li>`).join("")}</ul>` : ""}

      <h3 class="section-title">Study these first</h3>
      ${r.studyFirst.length
        ? `<p class="meta">Answers you were sure about that didn't hold up.</p>
           ${fixed == null ? `<div class="fix-box"><button type="button" class="btn primary" id="fix-btn">Fix these now</button><span class="meta"> A second question on each, from a new angle. Confident mistakes are the easiest to correct once you see them.</span></div>` : ""}
           <ol class="study">${r.studyFirst.map(item).join("")}</ol>`
        : `<p class="empty">Nothing to flag. Every answer you were sure about was right.</p>`}

      <h3 class="section-title">Ask your notes</h3>
      <p class="meta">Now that you've answered, ask anything. Answers come only from your notes, with the line they came from.</p>
      <form class="ask" id="ask-form">
        <input id="ask-input" type="text" placeholder="e.g. Why does rereading feel like knowing?" autocomplete="off" maxlength="400">
        ${micButton("ask-mic", "")}
        <button class="btn primary small" type="submit">Ask</button>
      </form>
      <div id="ask-out" class="ask-out" aria-live="polite"></div>

      ${r.counts.right < QUESTION_COUNT ? `<h3 class="section-title">Come back to it</h3>
      <p class="meta">Spaced review beats one long session. Export what you missed and see it again in 1, 3 and 7 days.</p>
      <div class="actions small-actions"><button type="button" class="btn small" id="anki-btn">Download for Anki</button><button type="button" class="btn small" id="ics-btn">Add reminders to calendar</button></div>` : ""}

      <h3 class="section-title">Share the shape, not the notes</h3>
      <pre class="card" id="card">${esc(shareCard(session.answers, r))}</pre>
      <div class="actions small-actions"><button type="button" class="btn small" id="copy-btn">Copy</button><span class="meta" id="copy-out"></span></div>

      <details class="all">
        <summary>All ${QUESTION_COUNT} answers${r1 ? " (round 2)" : ""}</summary>
        <ol class="all-list">${session.answers.map((a) => `
          <li><span class="v ${a.verdict}">${VERDICT[a.verdict]}</span> <span class="meta">${a.skipped ? "didn't know" : label(a.confidence).toLowerCase()}${a.hintsUsed ? `, ${a.hintsUsed} hint${a.hintsUsed === 1 ? "" : "s"}` : ""}</span><p>${esc(a.question)}</p></li>`).join("")}</ol>
      </details>

      <div class="actions"><button class="btn primary" id="again-btn" type="button">Try again with new notes</button></div>`;
    show("results");
    renderHud();
    loadCoach(r);
    const askForm = $("ask-form"), askInput = $("ask-input"), askOut = $("ask-out");
    setupMic($("ask-mic"), askInput);
    askForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = askInput.value.trim(); if (!q) return;
      const btn = askForm.querySelector('button[type="submit"]'); btn.classList.add("busy"); btn.disabled = true;
      try {
        const a = await api("/api/ask", { notes: session.notes, question: q });
        askOut.insertAdjacentHTML("afterbegin", `<div class="ask-item ${a.found ? "" : "nf"}"><p class="ask-q">${esc(q)}</p><p>${esc(a.answer)}</p>${a.quote ? `<blockquote>${esc(a.quote)}</blockquote>` : ""}</div>`);
        askInput.value = "";
        say(a.answer, { force: false });
      } catch (err) { askOut.insertAdjacentHTML("afterbegin", `<p class="notice error">${esc(friendly(err))}</p>`); }
      finally { btn.classList.remove("busy"); btn.disabled = false; }
    });
    if (!session.celebrated) { session.celebrated = true; if (good) { confetti(); sfx.win(); } else sfx.partly(); }

    $("again-btn").addEventListener("click", () => {
      session = freshSession();
      notes.value = ""; notesB.value = ""; $("guess-first").checked = false; sources.length = 0; renderSources(); $("sample-btn").hidden = false; setNotice(""); updateIntake(); renderTrend();
      show("start"); if (!touch) notes.focus();
    });
    const fixBtn = $("fix-btn");
    if (fixBtn) fixBtn.addEventListener("click", () => startFix(r.studyFirst, fixBtn));
    for (const el of screens.results.querySelectorAll(".teach-btn")) el.addEventListener("click", () => checkCorrection(el));
    $("copy-btn").addEventListener("click", async () => {
      const text = $("card").textContent;
      try { await navigator.clipboard.writeText(text); $("copy-out").textContent = "Copied."; }
      catch { $("copy-out").textContent = "Select the text above and copy it."; }
    });
    const missedList = session.answers.filter((a) => a.verdict !== "right");
    const ankiBtn = $("anki-btn"), icsBtn = $("ics-btn");
    if (ankiBtn) ankiBtn.addEventListener("click", () => download("recall-first.txt", "text/plain", missedList.map((a) => `${tsv(a.question)}\t${tsv(a.correctAnswer)}`).join("\n")));
    if (icsBtn) icsBtn.addEventListener("click", () => download("recall-first-review.ics", "text/calendar", ics(missedList)));
  }

  async function loadCoach(r) {
    if (session.coach) return paintCoach(session.coach, false);
    const c = calibration(session.answers);
    const summary = {
      score: r.score, of: QUESTION_COUNT, felt: pct(r.confidence), knew: pct(r.accuracy), calibrationNote: c.coaching,
      byLevel: c.byLevel.filter((l) => l.n).map((l) => ({ level: l.label, used: l.n, rightRate: Math.round(l.hit * 100) })),
      sureButWrong: r.studyFirst.map((a) => ({ concept: a.concept, question: a.question })),
      fluencyTraps: r.fluencyTraps.length, concepts: Object.fromEntries(r.blindSpots.map((b) => [b.name, b.status])),
    };
    try { session.coach = await api("/api/coach", { summary }); paintCoach(session.coach, true); }
    catch { $("coach-card") && ($("coach-card").hidden = true); }
  }
  function paintCoach(c, speakIt) {
    const msg = $("coach-msg"); if (!msg) return;
    msg.textContent = c.message;
    $("coach-steps").innerHTML = c.steps.map((x) => `<li>${esc(x)}</li>`).join("");
    if (speakIt) say(c.message);
  }

  async function checkCorrection(btn) {
    const li = btn.closest(".study-item");
    const a = session.answers[Number(li.dataset.n) - 1];
    const text = li.querySelector("textarea").value;
    const out = li.querySelector(".teach-out");
    if (!text.trim()) { out.textContent = "Write a sentence first."; return; }
    btn.classList.add("busy"); btn.disabled = true;
    try {
      const g = await api("/api/grade", { question: a.question, referenceAnswer: a.correctAnswer, userAnswer: text, notes: session.notes });
      out.innerHTML = `<span class="v ${g.verdict}">${VERDICT[g.verdict]}.</span> ${esc(g.feedback)}`;
    } catch (err) {
      out.textContent = friendly(err);
    } finally {
      btn.classList.remove("busy"); btn.disabled = false;
    }
  }

  // ----- exports -----
  const tsv = (s) => s.replace(/[\t\n]+/g, " ");
  function download(name, type, content) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function ics(items) {
    const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const escI = (s) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
    const body = items.map((a, i) => `${i + 1}. ${a.question}`).join("\\n");
    const events = [1, 3, 7].map((days) => {
      const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0);
      const end = new Date(d.getTime() + 15 * 60 * 1000);
      return ["BEGIN:VEVENT", `UID:recallfirst-${Date.now()}-${days}@recall-first`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(d)}`, `DTEND:${stamp(end)}`,
        `SUMMARY:Recall First review (day ${days})`, `DESCRIPTION:${escI("Answer these from memory, then check your notes:")}\\n${escI(body)}`, "END:VEVENT"].join("\r\n");
    });
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Recall First//EN", ...events, "END:VCALENDAR"].join("\r\n");
  }

  // ----- boot -----
  fetch("/api/status").then((r) => r.json()).then((s) => {
    status = s;
    if (!s.ready) setNotice("No API key is configured yet. Add ANTHROPIC_API_KEY to .env and restart the server. See README.md.", "error");
    updateIntake();
  }).catch(() => updateIntake());
  updateIntake();
  renderTrend();
  renderHud();
}
