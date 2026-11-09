// Burn-rate telemetry: samples of each drone's context left (hp) and the 5-hour quota
// left (sp), taken whenever its statusLine cache changes, so we can say how long
// until either runs out. Kept in localStorage so a reload doesn't forget the trend.

const WINDOW = 45 * 60; // seconds of samples the rate looks at
const KEEP = 80;
const STORE = "telemetry.v1";

export class Telemetry {
  constructor() {
    try {
      this.hist = JSON.parse(localStorage.getItem(STORE) ?? "{}") ?? {};
    } catch {
      this.hist = {};
    }
    this.dirty = false;
  }

  /** One cache reading for a drone; repeats of the same reading are ignored. */
  add(addr, c) {
    if (!c || (c.hp == null && c.sp == null)) return;
    const h = (this.hist[addr] ??= []);
    const last = h[h.length - 1];
    if (last && last.at === c.updatedAt) return;
    // Older than what we have (a restored or replaced cache): start again.
    if (last && c.updatedAt < last.at) h.length = 0;
    // A jump up is a compaction, a new session or a quota reset: the old trend no longer applies.
    if (last && ((c.hp ?? 0) > (last.hp ?? 0) + 5 || (c.sp ?? 0) > (last.sp ?? 0) + 5)) h.length = 0;
    h.push({ at: c.updatedAt, hp: c.hp, sp: c.sp });
    const cut = c.updatedAt - WINDOW;
    while (h.length > KEEP || (h.length && h[0].at < cut)) h.shift();
    this.dirty = true;
  }

  /** Forget drones that are gone, and store the rest. */
  save(alive) {
    for (const k of Object.keys(this.hist)) if (!alive.has(k)) { delete this.hist[k]; this.dirty = true; }
    if (!this.dirty) return;
    this.dirty = false;
    try { localStorage.setItem(STORE, JSON.stringify(this.hist)); } catch {}
  }

  /** Minutes until `key` ("hp" or "sp") reaches 0 at its recent rate, or null when it isn't dropping. */
  eta(addr, key) {
    const h = (this.hist[addr] ?? []).filter((s) => s[key] != null);
    if (h.length < 2) return null;
    const a = h[0], b = h[h.length - 1];
    const mins = (b.at - a.at) / 60;
    const drop = a[key] - b[key];
    if (mins < 3 || drop <= 0) return null;
    return b[key] / (drop / mins);
  }
}

/** "~8m", "~2.5h", "<1m"; null for nothing to say. */
export function etaText(m) {
  if (m == null || !Number.isFinite(m)) return null;
  if (m < 1) return "<1m";
  if (m < 60) return `~${Math.round(m)}m`;
  if (m < 48 * 60) return `~${(m / 60).toFixed(m < 600 ? 1 : 0)}h`;
  return null;
}
