// Recall First — the page. One in-memory session object, four screens, two fetch calls.
export const MIN_WORDS = 100;
export const MAX_WORDS = 2500;

export const countWords = (text) => (text.trim().match(/\S+/g) || []).length;
export const trimWords = (text, max = MAX_WORDS) => (text.trim().match(/\S+/g) || []).slice(0, max).join(" ");

// Everything below touches the DOM; skip it when imported by a test.
if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const notes = $("notes"), meta = $("word-meta"), quizBtn = $("quiz-btn"), notice = $("start-notice");

  function updateIntake() {
    const n = countWords(notes.value);
    quizBtn.disabled = n < MIN_WORDS;
    if (n === 0) meta.textContent = "0 words. Paste about 100 more to start.";
    else if (n < MIN_WORDS) meta.textContent = `${n} words. Paste a bit more, about ${MIN_WORDS - n} more, so the questions have something to work with.`;
    else meta.textContent = `${n.toLocaleString()} words`;
    const long = n > MAX_WORDS;
    notice.hidden = !long;
    notice.classList.remove("error");
    if (long) notice.textContent = `That's a lot. Only the first ${MAX_WORDS.toLocaleString()} words will be used.`;
  }
  notes.addEventListener("input", updateIntake);
  updateIntake();
}
