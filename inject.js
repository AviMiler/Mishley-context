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

  // בונה טקסט רב-שורות כ-DocumentFragment של text-node-ים מופרדים ב-<br>,
  // ולא כמחרוזת גולמית עם "\n" בתוך node אחד — contenteditable לא בהכרח
  // מוגדר עם white-space:pre-wrap, כך ש-"\n" גולמי בתוך text node יכול
  // להיקרס לרווח בודד במקום לשבור שורה. <br> אמיתי לכל מעבר שורה נכון
  // בלי תלות ב-CSS של השדה — אותה תוצאה ש-execCommand("insertText") היה
  // מייצר בעצמו פנימית.
  function buildLineFragment(text) {
    const frag = document.createDocumentFragment();
    const lines = text.split("\n");
    let last = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) {
        const node = document.createTextNode(lines[i]);
        frag.appendChild(node);
        last = node;
      }
      if (i < lines.length - 1) {
        const br = document.createElement("br");
        frag.appendChild(br);
        last = br;
      }
    }
    return { frag, last };
  }

  // מכניס את ה-fragment בטווח הנתון ומשאיר את הסמן (caret) מיד אחריו —
  // אותה התנהגות ש-execCommand("insertText") היה נותן, בלי execCommand.
  //
  // למה לא execCommand: נמדד בפועל (benchmark בדפדפן אמיתי, לא Node) —
  // document.execCommand("insertText", false, text) על contenteditable
  // כבר על ~300,000 תווים לא הסתיים תוך יותר מדקה (חוסם את ה-thread
  // הראשי לגמרי, תקוע). הכנסת DOM ישירה דרך Range.insertNode סקיילת
  // לינארית: 100K תווים ~100ms, 2M תווים ~2s, 5M תווים ~5.3s — פער
  // של סדרי גודל, לא שיפור שולי. זו הסיבה האמיתית לתקיעת "טען קבצים"
  // שדווחה ב-2026-07-27 — התיקון הקודם (הכנסה בנקודה קבועה במקום
  // קריאה-והחלפה מלאה) שינה איפה מכניסים אבל לא את המנגנון עצמו, ו-
  // execCommand על טקסט גדול נשאר איטי/תקוע גם כשמכניסים רק את הטקסט
  // החדש בלבד.
  function insertRangeText(range, sel, text) {
    const { frag, last } = buildLineFragment(text);
    range.insertNode(frag);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function replaceContentEditable(el, value) {
    el.focus();
    try {
      el.replaceChildren();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      insertRangeText(range, sel, value);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: value }));
    } catch {
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // מכניס טקסט בנקודה אחת (תחילת/סוף השדה) בלי לקרוא או להחליף את כל
  // התוכן הקיים. אחרי "טען קבצים" השדה יכול להכיל מאות KB — select-all
  // + insertText מעבד את כל זה (מחיקה והחלפה מלאה), ו-getCurrentValue
  // (innerText) כופה layout סינכרוני עליו. הכנסה בנקודה קבועה היא
  // O(טקסט חדש) בלבד, לא O(כל השדה).
  function insertAtEdge(el, text, atStart) {
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(atStart);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      insertRangeText(range, sel, text);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: text }));
    } catch {
      // נתיב גיבוי נדיר בלבד (למשל אין Selection/Range API) — כאן כן צריך
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
