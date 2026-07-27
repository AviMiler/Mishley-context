// inject.js — chat input detection and text injection. Loaded before content.js.
window.__ccbInject = (() => {
  const { CHAT_INPUT_SELECTOR, INPUT_FALLBACKS } = window.__ccbRawConfig;

  function isTextInput(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT" && /^(text|search|)$/i.test(el.type)) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") return false;
    return true;
  }

  function getCurrentValue(el) {
    return el.isContentEditable ? el.innerText || "" : el.value || "";
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.focus();
  }

  function replaceContentEditable(el, value) {
    el.focus();
    try {
      const sel = window.getSelection();
      sel.selectAllChildren(el);
      const ok = document.execCommand("insertText", false, value);
      if (!ok) throw new Error("execCommand failed");
    } catch {
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // מכניס טקסט בנקודה אחת (תחילת/סוף השדה) בלי לקרוא או להחליף את כל
  // התוכן הקיים. אחרי "טען קבצים" השדה יכול להכיל מאות KB — select-all
  // + insertText מעבד את כל זה (מחיקה והחלפה מלאה), ו-getCurrentValue
  // (innerText) כופה layout סינכרוני עליו. הכנסה בנקודה קבועה היא
  // O(טקסט חדש) בלבד, לא O(כל השדה) — זה מה שגרם לתקיעה כשטוענים
  // פרומפטים/הודעות אחרי טעינת קבצים.
  function insertAtEdge(el, text, atStart) {
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(atStart);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand("insertText", false, text);
      if (!ok) throw new Error("execCommand failed");
    } catch {
      // נתיב גיבוי נדיר בלבד (למשל אין Selection API) — כאן כן צריך
      // לקרוא את התוכן הקיים, במחיר שהפונקציה הזו קיימת כדי להימנע ממנו.
      const current = el.innerText || "";
      const next = atStart ? text + current : current + text;
      el.textContent = next;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function findInput() {
    if (CHAT_INPUT_SELECTOR) {
      const el = document.querySelector(CHAT_INPUT_SELECTOR);
      if (el && isVisible(el)) return el;
    }
    const active = document.activeElement;
    if (isTextInput(active) && isVisible(active)) return active;
    for (const sel of INPUT_FALLBACKS) {
      const candidates = document.querySelectorAll(sel);
      for (let i = candidates.length - 1; i >= 0; i--) {
        const el = candidates[i];
        if (isTextInput(el) && isVisible(el)) return el;
      }
    }
    return null;
  }

  function injectIntoInput(text, mode) {
    const el = findInput();
    if (!el) return { ok: false, error: "לא נמצא שדה קלט" };

    if (el.isContentEditable) {
      // ריקנות נבדקת דרך textContent (לא innerText) — אינה תלוית-פריסה.
      const empty = !el.textContent;
      if (mode === "replace" || empty) replaceContentEditable(el, text);
      else if (mode === "prepend") insertAtEdge(el, text, true);
      else insertAtEdge(el, "\n\n" + text, false);
      return { ok: true };
    }

    const current = getCurrentValue(el);
    let next;
    if (mode === "replace" || !current) next = text;
    else if (mode === "prepend") next = text + current;
    else next = current + "\n\n" + text;
    setNativeValue(el, next);
    return { ok: true };
  }

  return { findInput, injectIntoInput };
})();
