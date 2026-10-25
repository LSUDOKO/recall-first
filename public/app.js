// Recall First — the page. One in-memory session object, four screens, two fetch calls.
export const MIN_WORDS = 100;
export const MAX_WORDS = 2500;
export const QUESTION_COUNT = 5;
export const CONFIDENCE = [
  { level: "guessing", label: "Guessing", value: 0.25 },
  { level: "unsure", label: "Unsure", value: 0.5 },
  { level: "fairly", label: "Fairly sure", value: 0.75 },
  { level: "certain", label: "Certain", value: 1 },
];

// Score maths and the overconfidence check. Pure: answers in, summary out.
export function summarize(answers, total = QUESTION_COUNT) {
  const points = { right: 1, partly: 0.5, wrong: 0 };
  const value = (level) => CONFIDENCE.find((c) => c.level === level).value;
  const score = answers.reduce((sum, a) => sum + points[a.verdict], 0);
  const accuracy = score / total;
  const confidence = answers.reduce((sum, a) => sum + value(a.confidence), 0) / total;
  const missed = (a) => a.verdict !== "right";
  const studyFirst = answers
    .map((a, i) => ({ ...a, number: i + 1 }))
    .filter((a) => missed(a) && (a.confidence === "fairly" || a.confidence === "certain"))
    .sort((a, b) => value(b.confidence) - value(a.confidence));
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
  return { score, accuracy, confidence, studyFirst, headline, counts };
}

export const countWords = (text) => (text.trim().match(/\S+/g) || []).length;
export const trimWords = (text, max = MAX_WORDS) => (text.trim().match(/\S+/g) || []).slice(0, max).join(" ");

// Everything below touches the DOM; skip it when imported by a test.
if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const screens = { start: $("screen-start"), question: $("screen-question"), feedback: $("screen-feedback"), results: $("screen-results") };
  const notes = $("notes"), meta = $("word-meta"), quizBtn = $("quiz-btn"), notice = $("start-notice");
  const progressLabel = $("progress-label"), progress = $("progress"), progressFill = $("progress-fill");

  // The whole session lives here and nowhere else. A refresh wipes it.
  let session = freshSession();
  let status = { ready: true, mock: false };
  function freshSession() { return { notes: "", questions: [], answers: [], index: 0 }; }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function show(name) {
    for (const [k, el] of Object.entries(screens)) {
      el.hidden = k !== name;
      if (k === name) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; }
    }
    const inQuiz = name === "question" || name === "feedback";
    progressLabel.hidden = progress.hidden = !inQuiz;
    if (inQuiz) {
      progressLabel.textContent = `Question ${session.index + 1} of ${QUESTION_COUNT}`;
      progressFill.style.width = `${((session.index + (name === "feedback" ? 1 : 0)) / QUESTION_COUNT) * 100}%`;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function setNotice(text, kind = "") {
    notice.hidden = !text;
    notice.textContent = text || "";
    notice.className = `notice ${kind}`.trim();
  }

  async function api(path, body) {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || "Something went wrong talking to the AI."), { code: data.error, status: res.status });
    return data;
  }

  // ----- Start screen -----
  function updateIntake() {
    const n = countWords(notes.value);
    quizBtn.disabled = n < MIN_WORDS || !status.ready;
    if (n === 0) meta.textContent = "0 words. Paste about 100 more to start.";
    else if (n < MIN_WORDS) meta.textContent = `${n} words. Paste a bit more, about ${MIN_WORDS - n} more, so the questions have something to work with.`;
    else meta.textContent = `${n.toLocaleString()} words`;
    if (n > MAX_WORDS) setNotice(`That's a lot. Only the first ${MAX_WORDS.toLocaleString()} words will be used.`);
    else if (notice.textContent.startsWith("That's a lot")) setNotice("");
  }
  notes.addEventListener("input", updateIntake);

  $("start-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (quizBtn.disabled) return;
    session = freshSession();
    session.notes = trimWords(notes.value);
    quizBtn.classList.add("busy"); quizBtn.disabled = true; notes.disabled = true;
    meta.textContent = "Writing your questions…";
    try {
      const data = await api("/api/questions", { notes: session.notes });
      if (!data.ok) { setNotice(data.reason, "error"); return; }
      session.questions = data.questions;
      setNotice("");
      renderQuestion();
    } catch (err) {
      setNotice(friendly(err), "error");
    } finally {
      quizBtn.classList.remove("busy"); notes.disabled = false; updateIntake();
    }
  });

  function friendly(err) {
    if (err.code === "missing_key" || err.code === "bad_key") return err.message + " See README.md for setup.";
    return err.message || "Something went wrong talking to the AI. Nothing was lost — try again.";
  }

  // ----- Question screen -----
  function renderQuestion() {
    const q = session.questions[session.index];
    screens.question.innerHTML = `
      ${status.mock ? '<span class="practice-tag">Practice mode: canned questions, no AI</span>' : ""}
      <h2 class="question">${esc(q.question)}</h2>
      <label class="sr-only" for="answer">Your answer</label>
      <textarea id="answer" rows="5" placeholder="Answer from memory. A sentence or two is enough." autocomplete="off"></textarea>
      <span class="field-label" id="conf-label">How sure are you?</span>
      <div class="confidence" role="group" aria-labelledby="conf-label" id="confidence">
        ${CONFIDENCE.map((c) => `<button type="button" data-level="${c.level}" aria-pressed="false">${c.label}</button>`).join("")}
      </div>
      <div class="actions">
        <button class="btn primary" id="check-btn" type="button" disabled>Check answer</button>
        <button class="btn quiet" id="idk-btn" type="button">I don't know</button>
      </div>`;
    show("question");
    const answer = $("answer"), checkBtn = $("check-btn"), picker = $("confidence");
    let confidence = null;
    picker.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-level]");
      if (!btn) return;
      confidence = btn.dataset.level;
      for (const b of picker.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === btn));
      checkBtn.disabled = false;
    });
    checkBtn.addEventListener("click", () => submitAnswer(answer.value, confidence));
    $("idk-btn").addEventListener("click", () => recordAnswer({ userAnswer: "", confidence: "guessing", verdict: "wrong",
      feedback: "Honest. Here's the answer to study.", correctAnswer: q.answer, skipped: true }));
    answer.focus();
  }

  async function submitAnswer(userAnswer, confidence) {
    const q = session.questions[session.index];
    if (!userAnswer.trim()) {   // an empty answer is the same as "I don't know"
      return recordAnswer({ userAnswer: "", confidence: "guessing", verdict: "wrong",
        feedback: "Honest. Here's the answer to study.", correctAnswer: q.answer, skipped: true });
    }
    const checkBtn = $("check-btn");
    checkBtn.classList.add("busy"); checkBtn.disabled = true; $("idk-btn").disabled = true; $("answer").disabled = true;
    try {
      const grade = await api("/api/grade", { question: q.question, referenceAnswer: q.answer, userAnswer, notes: session.notes });
      recordAnswer({ userAnswer, confidence, ...grade, skipped: false });
    } catch (err) {
      showQuestionError(friendly(err), () => submitAnswer(userAnswer, confidence));
    } finally {
      checkBtn.classList.remove("busy"); checkBtn.disabled = false; $("idk-btn").disabled = false; $("answer").disabled = false;
    }
  }

  function showQuestionError(message, retry) {
    let box = screens.question.querySelector(".notice");
    if (!box) { box = document.createElement("p"); box.className = "notice error"; box.setAttribute("role", "alert"); screens.question.append(box); }
    box.innerHTML = `${esc(message)} <button type="button" class="btn quiet" id="retry-btn">Try again</button>`;
    $("retry-btn").addEventListener("click", () => { box.remove(); retry(); });
  }

  function recordAnswer(entry) {
    const q = session.questions[session.index];
    session.answers[session.index] = { question: q.question, referenceAnswer: q.answer, ...entry };
    renderFeedback();
  }

  // ----- Feedback screen -----
  const VERDICT = { right: "Right", partly: "Partly right", wrong: "Wrong" };
  function renderFeedback() {
    const a = session.answers[session.index];
    const last = session.index === QUESTION_COUNT - 1;
    const conf = CONFIDENCE.find((c) => c.level === a.confidence);
    screens.feedback.innerHTML = `
      <p class="verdict ${a.verdict}">${VERDICT[a.verdict]}</p>
      <p class="feedback-text">${esc(a.feedback)}</p>
      <div class="correct">
        <span class="correct-label">Correct answer, from your notes</span>
        <p>${esc(a.correctAnswer)}</p>
      </div>
      <p class="meta">${a.skipped ? "You said you didn't know." : `You said you were ${conf.label.toLowerCase()}.`}${!a.skipped ? ` You wrote: <q>${esc(a.userAnswer)}</q>` : ""}</p>
      <div class="actions"><button class="btn primary" id="next-btn" type="button">${last ? "See results" : "Next question"}</button></div>`;
    show("feedback");
    $("next-btn").addEventListener("click", () => {
      if (last) return renderResults();
      session.index += 1;
      renderQuestion();
    });
    $("next-btn").focus();
  }

  // ----- Results screen -----
  function renderResults() {
    const r = summarize(session.answers);
    const pct = (x) => Math.round(x * 100);
    const label = (level) => CONFIDENCE.find((c) => c.level === level).label;
    const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    const lo = Math.min(r.confidence, r.accuracy), hi = Math.max(r.confidence, r.accuracy);
    const item = (a) => `
      <li class="study-item">
        <span class="badge">${label(a.confidence)}</span>
        <p class="study-q">${esc(a.question)}</p>
        <p class="study-line"><span>You wrote</span>${a.skipped ? "<em>I don't know</em>" : esc(a.userAnswer)}</p>
        <p class="study-line"><span>Correct</span>${esc(a.correctAnswer)}</p>
      </li>`;
    screens.results.innerHTML = `
      <p class="score"><span class="score-num">${fmt(r.score)}</span><span class="score-of"> of ${QUESTION_COUNT}</span></p>
      <h2 class="headline results-headline">${esc(r.headline)}</h2>

      <div class="scale" role="img" aria-label="You felt ${pct(r.confidence)} percent sure on average and knew ${pct(r.accuracy)} percent.">
        <div class="track">
          <div class="gap" style="left:${pct(lo)}%; width:${pct(hi) - pct(lo)}%"></div>
          <div class="marker felt" style="left:${pct(r.confidence)}%"><span>Felt ${pct(r.confidence)}%</span></div>
          <div class="marker knew" style="left:${pct(r.accuracy)}%"><span>Knew ${pct(r.accuracy)}%</span></div>
        </div>
        <div class="scale-ends"><span>0%</span><span>100%</span></div>
      </div>
      <p class="meta scale-note">Felt is your average confidence. Knew is your score. The highlighted part is the gap.</p>

      <h3 class="section-title">Study these first</h3>
      ${r.studyFirst.length
        ? `<p class="meta">Answers you were sure about that didn't hold up.</p><ol class="study">${r.studyFirst.map(item).join("")}</ol>`
        : `<p class="empty">Nothing to flag. Every answer you were sure about was right.</p>`}

      <details class="all">
        <summary>All ${QUESTION_COUNT} answers</summary>
        <ol class="all-list">${session.answers.map((a, i) => `
          <li><span class="v ${a.verdict}">${VERDICT[a.verdict]}</span> <span class="meta">${a.skipped ? "didn't know" : label(a.confidence).toLowerCase()}</span><p>${esc(a.question)}</p></li>`).join("")}</ol>
      </details>

      <div class="actions"><button class="btn primary" id="again-btn" type="button">Try again with new notes</button></div>`;
    show("results");
    $("again-btn").addEventListener("click", () => {
      session = freshSession();
      notes.value = ""; setNotice(""); updateIntake();
      show("start"); notes.focus();
    });
  }

  // ----- boot -----
  fetch("/api/status").then((r) => r.json()).then((s) => {
    status = s;
    if (!s.ready) setNotice("No API key is configured yet. Add ANTHROPIC_API_KEY to .env and restart the server. See README.md.", "error");
    updateIntake();
  }).catch(() => updateIntake());
  updateIntake();
}
