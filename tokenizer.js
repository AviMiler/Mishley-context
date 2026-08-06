(() => {
  "use strict";

  // ============================================================
  // טוקנייזר BPE אמיתי (o200k_base) — מחליף את אומדן התווים-לטוקן
  // ההיוריסטי של config.js#estimateTextTokens כשהוא זמין.
  //
  // למה JS טהור ולא WASM: content script כפוף ל-CSP של הדף המארח,
  // ו-gemini.google.com לא מתיר 'wasm-unsafe-eval' (אותה סיבה בדיוק
  // שבגללה tree-sitter חי ב-background.js). ניתוב הטוקנייזר דרך ה-worker
  // היה הופך כל ספירה לאסינכרונית ושובר את שרשרת הקריאות הסינכרונית של
  // ctx-meter.js#measureMessage. מימוש JS טהור רץ כאן, סינכרונית.
  //
  // למה o200k_base ולא cl100k_base: אוצר המילים הרב-לשוני שלו מטפל
  // בעברית משמעותית טוב יותר, וזה בדיוק המקרה שבגללו קיים בכלל הפיצול
  // ההיוריסטי עברית/לועזית. המחיר: 3.6MB במקום 1.7MB.
  //
  // הטעינה עצלה ולא חוסמת: הנתונים נמשכים רק אחרי שהפאנל עולה באתר
  // הפעיל (content.js#init), כך שדפים אחרים לא משלמים כלום.
  // ============================================================

  const RANKS_URL = "tokenizer/o200k_base.tiktoken";

  // דפוס הפיצול הרשמי של o200k_base. המקור משתמש ב-(?i:...) —
  // דגל inline שאינו נתמך באופן אמין ב-JS, ולכן הורחב ידנית לכל
  // צירופי הרישיות. כל שאר הדפוס זהה למקור תו-בתו.
  const APOS = "(?:'[sS]|'[tT]|'[rR][eE]|'[vV][eE]|'[mM]|'[lL][lL]|'[dD])?";
  const SPLIT_RE = new RegExp(
    "[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]*" +
      "[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]+" + APOS +
      "|[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]+" +
      "[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]*" + APOS +
      "|\\p{N}{1,3}" +
      "| ?[^\\s\\p{L}\\p{N}]+[\\r\\n/]*" +
      "|\\s*[\\r\\n]+" +
      "|\\s+(?!\\S)" +
      "|\\s+",
    "gu",
  );

  // מעל התקרה הזו נופלים בחזרה להיוריסטיקה, כדי לחסום את זמן הקריאה
  // הסינכרונית הבודדת. נמדד ~5.4M תווים לשנייה (1,346 קבצים / 8.5M תווים
  // ב-1.6 שניות), כלומר התקרה הזו חוסמת קריאה יחידה ל-~100ms.
  const MAX_EXACT_CHARS = 500000;

  let _ranks = null;
  let _loadPromise = null;
  let _failed = false;

  const _encoder = new TextEncoder();
  // מטמון ברמת המילה: הטקסט האמיתי חוזר על עצמו מאוד (רווחים, מילות
  // קישור, טוקני קוד), כך שרוב הקריאות ל-BPE הן על מחרוזות שכבר נמדדו.
  const _pieceCache = new Map();
  const PIECE_CACHE_MAX = 50000;

  /** ממיר מחרוזת ל-"מחרוזת בתים" (תו אחד לכל בית UTF-8) לשימוש כמפתח במפה. */
  function toByteString(str) {
    const bytes = _encoder.encode(str);
    let out = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return out;
  }

  /**
   * מיזוג BPE סטנדרטי — מחזיר את מספר הטוקנים בלבד (לא את המזהים עצמם,
   * שאיש כאן לא צריך). זהה באלגוריתם למימוש הייחוס של tiktoken.
   */
  function bpeCount(piece) {
    if (_ranks.has(piece)) return 1;
    const n = piece.length;
    if (n <= 1) return n;

    const starts = new Array(n + 1);
    const rankOf = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
      starts[i] = i;
      rankOf[i] = Infinity;
    }
    let len = n + 1;

    const rankAt = (i, skip) => {
      const j = i + skip + 2;
      if (j >= len) return Infinity;
      const r = _ranks.get(piece.slice(starts[i], starts[j]));
      return r === undefined ? Infinity : r;
    };

    for (let i = 0; i < len - 2; i++) rankOf[i] = rankAt(i, 0);

    while (len > 1) {
      let minRank = Infinity;
      let minIdx = -1;
      for (let i = 0; i < len - 1; i++) {
        if (rankOf[i] < minRank) {
          minRank = rankOf[i];
          minIdx = i;
        }
      }
      if (minIdx < 0) break;

      rankOf[minIdx] = rankAt(minIdx, 1);
      if (minIdx > 0) rankOf[minIdx - 1] = rankAt(minIdx - 1, 1);

      for (let i = minIdx + 1; i < len - 1; i++) {
        starts[i] = starts[i + 1];
        rankOf[i] = rankOf[i + 1];
      }
      len--;
    }
    return len - 1;
  }

  function countPiece(text) {
    const cached = _pieceCache.get(text);
    if (cached !== undefined) return cached;
    const count = bpeCount(toByteString(text));
    if (_pieceCache.size < PIECE_CACHE_MAX) _pieceCache.set(text, count);
    return count;
  }

  /**
   * ספירת הטוקנים המדויקת של טקסט.
   * @returns {number|null} null כשהטוקנייזר לא זמין או שהטקסט ארוך מדי —
   *   הקורא (config.js#estimateTextTokens) נופל אז להיוריסטיקה.
   */
  function countTokens(text) {
    if (!_ranks || typeof text !== "string") return null;
    if (!text.length) return 0;
    if (text.length > MAX_EXACT_CHARS) return null;

    let total = 0;
    SPLIT_RE.lastIndex = 0;
    let m;
    while ((m = SPLIT_RE.exec(text)) !== null) {
      total += countPiece(m[0]);
      if (m[0] === "") SPLIT_RE.lastIndex++;
    }
    return total;
  }

  function parseRanks(raw) {
    const map = new Map();
    let pos = 0;
    while (pos < raw.length) {
      let nl = raw.indexOf("\n", pos);
      if (nl === -1) nl = raw.length;
      const sp = raw.lastIndexOf(" ", nl);
      if (sp > pos) {
        const rank = +raw.slice(sp + 1, nl);
        if (!Number.isNaN(rank)) {
          try {
            map.set(atob(raw.slice(pos, sp)), rank);
          } catch {
            /* שורה פגומה — מדלגים, שאר האוצר עדיין שמיש */
          }
        }
      }
      pos = nl + 1;
    }
    return map;
  }

  /** טעינה עצלה ואידמפוטנטית. בטוח לקרוא פעמים רבות. */
  function load() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(chrome.runtime.getURL(RANKS_URL));
        if (!res.ok) throw new Error("HTTP " + res.status);
        const parsed = parseRanks(await res.text());
        if (!parsed.size) throw new Error("empty ranks");
        _ranks = parsed;
        console.log("[ccb-timing] tokenizer.load", {
          ranks: parsed.size,
          totalMs: Math.round(performance.now() - t0),
        });
        return true;
      } catch (e) {
        _failed = true;
        console.error("[ccb] tokenizer load failed, using heuristic:", e);
        return false;
      }
    })();
    return _loadPromise;
  }

  window.__ccbTokenizer = {
    load,
    countTokens,
    isReady: () => !!_ranks,
    isFailed: () => _failed,
    MAX_EXACT_CHARS,
  };
})();
