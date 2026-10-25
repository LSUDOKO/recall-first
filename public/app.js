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
    $("answer").focus();
  }

  // ----- boot -----
  fetch("/api/status").then((r) => r.json()).then((s) => {
    status = s;
    if (!s.ready) setNotice("No API key is configured yet. Add ANTHROPIC_API_KEY to .env and restart the server. See README.md.", "error");
    updateIntake();
  }).catch(() => updateIntake());
  updateIntake();
}
