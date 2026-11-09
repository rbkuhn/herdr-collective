// What a blocked agent is asking, read off its screen (`hc read`): the question's
// last lines and, when the program shows a choice list, those choices with the
// keys that pick each one:
// - numbered (Claude Code's "1. Yes / 2. Yes, and don't ask again / 3. No"): its digit;
// - an arrow list ("❯ No, exit / Yes, I trust this folder"): up/down from the
//   highlighted one, then Enter.

const RULE = /^[\s─━═│┃╭╮╰╯┌┐└┘├┤┬┴┼╌╍┄┅·•\-_=]*$/;
const EDGE_L = /^[│┃]/;
const EDGE_R = /[\s│┃]+$/;
// Footer hints that aren't part of the question.
const HINT = /^(⏵|⏸|esc to |enter to |ctrl\+|tab to |shift\+tab|\? for shortcuts)/i;
const MARK = /^[❯›>▶]\s*/;
const NUMBERED = /^(?:([❯›>▶])\s*)?(\d{1,2})[.)]\s+(.+)$/;

/** Screen text -> { lines: string[], options: [{ keys: string[], label, selected }] }. */
export function extract(text) {
  const rows = String(text ?? "")
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .split("\n")
    .map((l) => l.replace(EDGE_L, "").replace(EDGE_R, ""))
    .map((l) => ({ text: l.trim(), indent: l.length - l.trimStart().length }))
    .filter((r) => r.text !== "" && !RULE.test(r.text) && !HINT.test(r.text) && !/^[>❯›]$/.test(r.text));
  const question = (end) => rows.slice(Math.max(0, end - 3), end).map((r) => r.text);

  // Numbered: the last run of numbered rows counting up from 1. Rows indented deeper than the
  // option above them are its description (Claude Code's question tool) and are skipped.
  let end = -1;
  for (let i = rows.length - 1; i >= 0; i--) if (NUMBERED.test(rows[i].text)) { end = i; break; }
  if (end >= 0) {
    const picked = [end];
    let start = end;
    for (let i = end - 1; i >= 0; i--) {
      if (NUMBERED.test(rows[i].text)) { picked.unshift(i); start = i; continue; }
      const below = rows[picked[0]];
      if (rows[i].indent > below.indent + 1 && i > 0 && (NUMBERED.test(rows[i - 1].text) || rows[i - 1].indent > below.indent + 1)) continue;
      break;
    }
    const options = picked.map((i) => {
      const m = NUMBERED.exec(rows[i].text);
      return { keys: [m[2]], label: m[3].trim(), selected: Boolean(m[1]) };
    });
    if (options.every((o, i) => Number(o.keys[0]) === i + 1)) return { lines: question(start), options };
  }

  // Arrow list: the highlighted row and the rows beside it indented like an unmarked choice.
  let sel = -1;
  for (let i = rows.length - 1; i >= 0; i--) if (MARK.test(rows[i].text) && rows[i].text.replace(MARK, "")) { sel = i; break; }
  if (sel >= 0) {
    const inList = (r) => !MARK.test(r.text) && r.indent >= rows[sel].indent + 1 && r.indent <= rows[sel].indent + 3;
    let start = sel, stop = sel;
    while (start > 0 && inList(rows[start - 1])) start--;
    while (stop < rows.length - 1 && inList(rows[stop + 1])) stop++;
    if (stop > start) {
      const at = sel - start;
      const options = rows.slice(start, stop + 1).map((r, i) => ({
        keys: [...Array(Math.abs(i - at)).fill(i < at ? "up" : "down"), "enter"],
        label: r.text.replace(MARK, ""),
        selected: i === at,
      }));
      return { lines: question(start), options };
    }
  }
  return { lines: rows.slice(-6).map((r) => r.text), options: [] };
}

/** The last `n` lines of output on a screen, for the hover feed: blank lines, rules,
 * the empty input prompt and footer hints dropped; indentation kept. */
export function tail(text, n = 16) {
  return String(text ?? "")
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "" && !RULE.test(l) && !HINT.test(l.trim()) && !/^[>❯›]$/.test(l.trim()))
    .slice(-n)
    .map((l) => (l.length > 140 ? `${l.slice(0, 139)}…` : l));
}
