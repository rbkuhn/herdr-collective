// The Collective: agents() as a roster of drones with animated pixel-art faces. Cortex = context
// left, Link = 5-hour quota left, read from the statusLine cache (data/traveler/sessions, shared
// with the traveler and inferno layouts). Reads cache files only: no commands, no network.
import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, appHome, playSound, readTextFile, run, setAgentOrder, spaces, theme, watchFolder, window } from "herdr";
import { CLASS_TITLE, animPath, appLabel, assignJobs, cachePath, cells, designation, gauge, jobIn, modelText, parseCache, remoteCachePath, tabNames } from "./lib.js";

const HOME = appHome();
const SESSIONS_DIR = `${HOME}/data/traveler/sessions`;
const JOBS_FILE = `${HOME}/mods/collective-agents/jobs.json`;
const BLIP = "mods/collective-chrome/sounds/blip.mp3";
const FACE = 96;
const SEGMENTS = 10;
const HUD = "Silkscreen";
const GREEN = "#39d353";
const DIM = "#1f5c2c";
const STATUS = { working: "PROCESSING", blocked: "AWAITING INPUT", done: "COMPLETE", idle: "REGENERATING" };

// The drone's face: one strip of frames per role and state (rest = blinking, implants flickering;
// working = ocular scan beam and data overlay; blocked = red alert glitch; done = assimilation
// sweep), slid one frame at a time by the card clock. Herdr's image() shows only an animated
// file's first frame, so the stepping is ours.
function face(a, job, t, now) {
  const state = a.status === "working" || a.status === "blocked" || a.status === "done" ? a.status : "rest";
  const anim = animPath(job, state);
  const frame = a.status === "blocked" ? t.blocked : DIM;
  const shell = div().relative().size(FACE).flex_none().overflow_hidden().bg("#000000").border(1).border_color(frame);
  if (anim) {
    const i = Math.floor(now / anim.ms) % anim.frames;
    const color = a.status === "blocked" ? t.blocked : a.status === "working" ? "#8cff9e" : a.status === "done" ? t.done : t.dim;
    return shell
      .child(image(anim.path).absolute().top(0).left(-i * FACE).w(FACE * anim.frames).h(FACE))
      // HUD status strip across the bottom of the portrait.
      .child(h_flex().absolute().left(0).right(0).bottom(0).h(12).justify_center().items_center().bg("#000000c8").border_t(1).border_color(frame)
        .child(div().font_family(HUD).text_size(7).text_color(color)
          .when(a.status === "blocked", (el) => el.loop("opacity", { from: 0.2, to: 1, period: 700 }))
          .child(STATUS[a.status] ?? String(a.status ?? "").toUpperCase())));
  }
  const p = a.program;
  if (!p?.icon) return shell;
  return shell.child((p.tint ? svg(p.icon).text_color(GREEN) : image(p.icon)).absolute().left(30).top(30).size(36));
}

// An LED power cell: a word, SEGMENTS square lamps, the number. Green, amber under 30%, red under 15%.
function cell(word, g, t) {
  const lit = cells(g.pct, SEGMENTS);
  const color = g.pct === null ? t.dim : g.pct < 15 ? "#ff4433" : g.pct < 30 ? "#e8b13a" : g.stale ? "#2f9a48" : GREEN;
  const lamps = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const on = lit !== null && i < lit;
    lamps.push(div().w(4).h(8).flex_none().bg(on ? color : "#0d1f12").border(1).border_color(on ? color : "#163d20"));
  }
  return h_flex()
    .w_full()
    .min_w(0)
    .h(12)
    .gap(5)
    .items_center()
    .child(div().w(36).flex_none().font_family(HUD).text_size(7.5).text_color(t.dim).child(word))
    .child(h_flex().gap(1).flex_none().children(lamps))
    .child(div().flex_none().text_size(11).text_color(g.pct === null ? t.dim : color).child(g.stale ? `${g.text}*` : g.text));
}

// Tag row: a small framed label, then "model · effort" when known.
function tag(label, model, t) {
  const color = label.builder ? t.unknown : GREEN;
  return h_flex()
    .w_full()
    .min_w(0)
    .h(15)
    .gap(6)
    .items_center()
    .child(div().flex_none().px(4).border(1).border_color(`${color}99`).bg(`${color}14`).font_family(HUD).text_size(8).text_color(color).child(label.text.toUpperCase()))
    .when(model !== null, (el) => el.child(modelLine(model, t)));
}

function modelLine(model, t) {
  return div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(model);
}

// HUD corner brackets: an L of two 2px bars on each corner.
function brackets(color) {
  const bar = (w, h) => div().absolute().w(w).h(h).bg(color);
  return [
    bar(9, 2).top(-1).left(-1), bar(2, 9).top(-1).left(-1),
    bar(9, 2).top(-1).right(-1), bar(2, 9).top(-1).right(-1),
    bar(9, 2).bottom(-1).left(-1), bar(2, 9).bottom(-1).left(-1),
    bar(9, 2).bottom(-1).right(-1), bar(2, 9).bottom(-1).right(-1),
  ];
}

export default class Collective extends View {
  init(_props, cx) {
    this.jobs = {};
    this.cache = {};
    this.remote = {};
    this.tick = 0;
    this.seen = new Set();
    this.watching = false;
    this.clock = 0;
    cx.timer.every(80, (cx) => {
      this.clock++;
      if (agents().length === 0) return;
      if (window()?.active || this.clock % 3 === 0) cx.notify();
    });
    this.loadJobs(cx);
    this.load(cx);
    this.loadRemote(cx);
    this.watch(cx);
    // 資料是數字，最多 30 秒看一次就夠；也讓「舊」標記自己出現，順便重試監看。
    cx.timer.every(30000, (cx) => {
      this.load(cx);
      this.watch(cx);
      // 遠端每 60 秒讀一次，跟 statusLine 的更新間隔一樣；遠端資料夾不能監看。
      if (++this.tick % 2 === 0) this.loadRemote(cx);
    });
  }

  // 監看快取資料夾：有變更就重讀。資料夾不存在或不被允許時結束迴圈，
  // 交給上面的計時器每 30 秒重試，不會變成緊迴圈。
  watch(cx) {
    if (this.watching) return;
    this.watching = true;
    cx.spawn(async (cx) => {
      let quick = 0;
      for (;;) {
        let changed;
        const started = Date.now();
        try {
          changed = await watchFolder(SESSIONS_DIR);
        } catch {
          break;
        }
        // 立刻回來又沒有任何變更，代表監看沒真的生效，也別讓它空轉。
        quick = Date.now() - started < 500 && (changed ?? []).length === 0 ? quick + 1 : 0;
        if (quick >= 3) break;
        this.load(cx);
      }
      this.watching = false;
    });
  }

  loadJobs(cx) {
    cx.spawn(async (cx) => {
      const text = await readTextFile(JOBS_FILE).catch(() => null);
      let jobs = {};
      try {
        const parsed = JSON.parse(text);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) jobs = parsed;
      } catch {
        jobs = {};
      }
      this.jobs = jobs;
      cx.notify();
    });
  }

  // 每個本機 agent 讀自己那份快取；遠端的由 loadRemote 讀。
  load(cx) {
    const wanted = [];
    for (const a of agents()) {
      const path = cachePath(HOME, a.address);
      if (path === null) continue;
      this.seen.add(a.address);
      wanted.push({ address: a.address, path });
    }
    cx.spawn(async (cx) => {
      const next = {};
      for (const w of wanted) {
        const text = await readTextFile(w.path).catch(() => null);
        next[w.address] = parseCache(text);
      }
      this.cache = next;
      cx.notify();
    });
  }

  // 遠端 agent 讀它那台的快取檔（透過 Herdr 原有的連線，不執行指令）；連不上就是 null，畫面顯示「—」。
  loadRemote(cx) {
    const wanted = [];
    for (const a of agents()) {
      const r = remoteCachePath(a.address);
      if (r === null) continue;
      this.seen.add(a.address);
      wanted.push({ address: a.address, ...r });
    }
    if (wanted.length === 0) return;
    cx.spawn(async (cx) => {
      const next = {};
      for (const w of wanted) {
        const text = await readTextFile(w.path, { on: w.on }).catch(() => null);
        next[w.address] = parseCache(text);
      }
      this.remote = next;
      cx.notify();
    });
  }

  card(a, index, total, now, t) {
    const cache = this.cache[a.address] ?? this.remote[a.address] ?? null;
    const cortex = gauge(cache ? cache.hp : null, cache ? cache.updatedAt : null, now);
    const link = gauge(cache ? cache.sp : null, cache ? cache.updatedAt : null, now);
    const job = jobIn(a.tab_name, this.assigned);
    const edge = a.status === "blocked" ? t.blocked : a.focused ? GREEN : "#1f5c2c";
    const statusColor = a.status === "blocked" ? t.blocked : a.status === "working" ? "#8cff9e" : t[a.status] ?? t.dim;
    const nameColor = a.status === "blocked" ? "#ff7a62" : a.focused || a.status === "working" ? "#b8ffbf" : t.foreground;
    const label = appLabel(a.app);
    const model = modelText(cache?.model, cache?.effort);
    return h_flex()
      .id(`collective-${a.address}`)
      .relative()
      .w_full()
      .flex_none()
      .p(6)
      .gap(9)
      .items_center()
      .bg(a.focused ? "#071409f0" : "#030805e8")
      .border(1)
      .border_color(a.focused || a.status === "blocked" ? `${edge}99` : "#0f2a16")
      .cursor_pointer()
      .hover((s) => s.bg("#0b2010f0"))
      .on_click(() => {
        playSound(BLIP);
        run("agent.focus", { terminal: a.address });
      })
      .children(brackets(edge))
      .child(face(a, job, t, this.ms))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(3)
          .child(
            h_flex()
              .w_full()
              .min_w(0)
              .gap(6)
              .items_center()
              .child(div().flex_1().min_w(0).truncate().font_family(HUD).text_size(8).text_color(statusColor).child(designation(index, total))),
          )
          .child(div().w_full().min_w(0).truncate().font_weight(700).text_size(14).text_color(nameColor).child(a.tab_name || a.address))
          .when(Boolean(job), (el) => el.child(div().font_family(HUD).text_size(8).text_color(`${GREEN}b0`).child((CLASS_TITLE[job] ?? "").toUpperCase())))
          // Session name (set with /rename); takes no row when unset.
          .when(Boolean(cache?.name), (el) =>
            el.child(div().w_full().min_w(0).truncate().text_size(11).text_color(t.dim).child(cache.name)),
          )
          .when(Boolean(label), (el) => el.child(tag(label, label.builder ? null : model, t)))
          .when(Boolean(label?.builder) && model !== null, (el) => el.child(h_flex().w_full().min_w(0).child(modelLine(model, t))))
          // Builders have no cortex/link source, so no empty cells.
          .when(!label?.builder, (el) => el.child(v_flex().w_full().pt(1).gap(2).child(cell("CORTEX", cortex, t)).child(cell("LINK", link, t)))),
      );
  }

  render(cx) {
    const t = theme();
    const list = agents();
    this.assigned = assignJobs(tabNames(spaces(), list), this.jobs);
    setAgentOrder(list.map((a) => a.address));
    // A newly seen agent reads its cache now instead of at the next tick.
    const fresh = list.filter((a) => !this.seen.has(a.address));
    if (fresh.some((a) => cachePath(HOME, a.address) !== null)) this.load(cx);
    if (fresh.some((a) => remoteCachePath(a.address) !== null)) this.loadRemote(cx);
    this.ms = Date.now();
    const now = Math.floor(this.ms / 1000);
    return v_flex()
      .id("collective")
      .size_full()
      .min_h(0)
      .text_color(t.foreground)
      .text_size(13)
      .child(
        h_flex().h(28).flex_none().px(14).gap(8).items_center()
          .child(div().font_family(HUD).font_weight(700).text_size(10).text_color(GREEN).child("THE COLLECTIVE"))
          .child(div().w(6).h(10).bg(GREEN).loop("opacity", { from: 0, to: 1, period: 1000 }))
          .child(div().flex_1().h(1).bg("#1f5c2c"))
          .child(div().font_family(HUD).text_size(9).text_color(t.dim).child(`${list.length} DRONES`)),
      )
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .gap(9)
          .px(9)
          .pt(3)
          .pb(9)
          .overflow_y_scrollbar()
          .children(list.map((a, i) => this.card(a, i, list.length, now, t)))
          .when(list.length === 0, (el) =>
            el.child(div().p(8).font_family(HUD).text_size(9).text_color(t.dim).child("NO DRONES LINKED. AWAITING ASSIMILATION.")),
          ),
      );
  }
}
