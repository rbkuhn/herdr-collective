// Reads Claude Code's statusLine JSON on stdin; writes
// ~/.config/herdr-app/data/traveler/sessions/<HC_TERMINAL_ID>.json for the party cards.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
const id = process.env.HC_TERMINAL_ID;
if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) process.exit(0);
const raw = readFileSync(0, "utf8");
const dir = `${homedir()}/.config/herdr-app/data/traveler/sessions`;
mkdirSync(dir, { recursive: true });
if (process.env.COLLECTIVE_DEBUG === "1") writeFileSync(`${dir}/../raw-last.json`, raw);
let d; try { d = JSON.parse(raw); } catch { process.exit(0); }
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (v) => (v === null ? null : Math.max(0, Math.min(100, Math.round(v))));
const left = (o) => {
  if (!o || typeof o !== "object") return null;
  const r = num(o.remaining_percentage) ?? num(o.remaining_percent);
  if (r !== null) return r;
  const u = num(o.used_percentage) ?? num(o.used_percent) ?? num(o.utilization);
  return u === null ? null : 100 - (u <= 1 && u > 0 && o.utilization !== undefined ? u * 100 : u);
};
const out = {
  updatedAt: Math.floor(Date.now() / 1000),
  contextRemainingPct: clamp(left(d.context_window)),
  fiveHourRemainingPct: clamp(left(d.rate_limits?.five_hour ?? d.rate_limits?.fiveHour)),
  sessionName: typeof d.session_name === "string" ? d.session_name : null,
  model: d.model?.display_name ?? d.model?.id ?? null,
  effort: d.effort?.level ?? (typeof d.effort === "string" ? d.effort : null),
};
const file = `${dir}/${id}.json`;
writeFileSync(`${file}.tmp`, JSON.stringify(out));
renameSync(`${file}.tmp`, file);
