// The Collective: agents() as a roster of drones with animated pixel-art faces. Cortex = context
// left, Link = 5-hour quota left, read from the statusLine cache (data/traveler/sessions, shared
// with the traveler and inferno layouts). No network. Hovering a card shows its screen (`hc read`,
// every 1s while open). A blocked agent's card reads its screen
// (`hc read`, every 1.5s while blocked) and, only when you press its buttons, answers it
// (`hc keys`, `hc send --force`, `hc interrupt`).
import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex, Popup } from "gpui-base";
import { agents, appHome, focused, hc, notify, playSound, readTextFile, run, setAgentOrder, spaces, theme, watchFolder, window } from "herdr";
import { extract, tail } from "./ask.js";
import { Telemetry, etaText } from "./telemetry.js";

// Context left at or under this is critical: the card flashes and offers /compact.
const CTX_CRIT = 15;
const CTX_LOW = 30;
const LNK_CRIT = 15;
import { CLASS_TITLE, animPath, appLabel, assignJobs, cachePath, cells, designation, gauge, jobIn, modelText, parseCache, remoteCachePath, tabNames } from "./lib.js";

const HOME = appHome();
const SESSIONS_DIR = `${HOME}/data/traveler/sessions`;
const JOBS_FILE = `${HOME}/mods/collective-agents/jobs.json`;
const BLIP = "mods/collective-chrome/sounds/blip.mp3";
// Compact cards: a small face and three short lines.
const FACE = 44;
const SEGMENTS = 8;
// The hover feed: how long the pointer rests before it opens, how many screen lines, how wide.
const PEEK_DELAY = 400;
const FEED_LINES = 16;
const FEED_WIDTH = 560;
const HUD = "Silkscreen";
const GREEN = "#39d353";
const DIM = "#1f5c2c";
// Short words so the names keep the room in a narrow sidebar.
const STATUS = { working: "BUSY", blocked: "INPUT", done: "DONE", idle: "IDLE" };

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
    // Each drone starts its loop at its own point, so two of a kind don't move in step.
    const offset = [...String(a.address)].reduce((n, c) => (n * 31 + c.codePointAt(0)) % 9973, 7);
    const i = (Math.floor(now / anim.ms) + offset) % anim.frames;
    // The status word moved beside the name; the face is too small for a HUD strip.
    // One file per frame: a strip stepped by an offset lands between frames at
    // fractional display scales and the face drifts. The still sits under it while a frame loads.
    return shell
      .child(image(`mods/collective-agents/faces/${job}.png`).absolute().top(-1).left(-1).size(FACE))
      .child(image(`${anim.dir}/${String(i).padStart(2, "0")}.png`).absolute().top(-1).left(-1).size(FACE));
  }
  const p = a.program;
  if (!p?.icon) return shell;
  return shell.child((p.tint ? svg(p.icon).text_color(GREEN) : image(p.icon)).absolute().left(8).top(8).size(FACE - 16));
}

// An LED power cell: a word, SEGMENTS square lamps, the number. Green, amber under 30%, red under 15%.
function cell(word, g, t) {
  const lit = cells(g.pct, SEGMENTS);
  const color = g.pct === null ? t.dim : g.pct < 15 ? "#ff4433" : g.pct < 30 ? "#e8b13a" : g.stale ? "#2f9a48" : GREEN;
  const lamps = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const on = lit !== null && i < lit;
    lamps.push(div().w(3).h(7).flex_none().bg(on ? color : "#0d1f12").border(1).border_color(on ? color : "#163d20"));
  }
  return h_flex()
    .flex_1()
    .min_w(0)
    .h(11)
    .gap(4)
    .items_center()
    .child(div().flex_none().font_family(HUD).text_size(7).text_color(t.dim).child(word))
    .child(h_flex().gap(1).flex_none().children(lamps))
    .child(div().flex_none().text_size(10).text_color(g.pct === null ? t.dim : color).child(g.stale ? `${g.text}*` : g.text));
}

// A card's title: its tab's name. Drones sharing a tab (split panes) get their
// node id first, as the pane header shows it, so truncation keeps them apart.
function droneName(a) {
  const name = a.tab_name || a.address;
  if (!a.tab_name || agents().filter((b) => b.tab === a.tab).length < 2) return name;
  return `${String(a.address).replace(/^.*\//, "").toUpperCase()} \u00b7 ${name}`;
}

// Tag row: a small framed label, then "model · effort" when known.
function tag(label, model, t) {
  const color = label.builder ? t.unknown : GREEN;
  return h_flex()
    .w_full()
    .min_w(0)
    .h(13)
    .gap(5)
    .items_center()
    .child(div().flex_none().px(3).border(1).border_color(`${color}99`).bg(`${color}14`).font_family(HUD).text_size(7).text_color(color).child(label.text.toUpperCase()))
    .when(model !== null, (el) => el.child(modelLine(model, t)));
}

function modelLine(model, t) {
  return div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(model);
}

// HUD corner brackets: an L of two 2px bars on each corner.
function brackets(color) {
  const bar = (w, h) => div().absolute().w(w).h(h).bg(color);
  return [
    bar(6, 2).top(-1).left(-1), bar(2, 6).top(-1).left(-1),
    bar(6, 2).top(-1).right(-1), bar(2, 6).top(-1).right(-1),
    bar(6, 2).bottom(-1).left(-1), bar(2, 6).bottom(-1).left(-1),
    bar(6, 2).bottom(-1).right(-1), bar(2, 6).bottom(-1).right(-1),
  ];
}

// The agent cards, drawn by the sector tree (main.js) under each sector.
export class Roster {
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
    // Answering from the sidebar: what each blocked agent asks, the reply being typed, the last result.
    this.asks = {}; // address -> { lines, options }
    this.reading = new Set();
    this.acting = new Set();
    this.results = {}; // address -> { ok, text, at }
    this.replyTo = null;
    this.reply = "";
    this.replyFocus = cx.focus_handle();
    cx.timer.every(1500, (cx) => this.readAsks(cx));
    // The hover feed: which card the pointer rests on, since when, and its screen's last lines.
    this.peekAddr = null;
    this.peekSince = 0;
    this.inPanel = false;
    this.feeds = {}; // address -> string[]
    // Burn rates and the warnings already given (cleared once the value recovers).
    this.tele = new Telemetry();
    this.warned = new Set();
    this.fleet = null;
    cx.timer.every(1000, (cx) => { if (this.peekOpen()) this.readFeed(this.peekAddr, cx); });
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

  // The feed opens once the pointer has rested on a card for PEEK_DELAY ms, never over the answer panel.
  peekOpen() {
    return Boolean(this.peekAddr) && !this.inPanel && Date.now() - this.peekSince >= PEEK_DELAY;
  }

  readFeed(addr, cx) {
    const key = `feed:${addr}`;
    if (this.reading.has(key)) return;
    this.reading.add(key);
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["read", addr, "--json"]);
        if (r.code === 0) this.feeds[addr] = tail(JSON.parse(r.stdout).text, FEED_LINES);
      } catch {}
      this.reading.delete(key);
      cx.notify();
    });
  }

  // The neural feed: a read-only look at the agent's screen, hung right of its card.
  feed(a, details, statusColor, t) {
    const lines = this.feeds[a.address];
    return v_flex().id(`feed-${a.address}`).relative().ml(10).w(FEED_WIDTH).p(8).gap(6)
      .bg("#020604f4").border(1).border_color(`${GREEN}aa`).shadow_lg()
      .children(brackets(GREEN))
      .child(h_flex().gap(8).items_center()
        .child(div().flex_none().font_family(HUD).text_size(8).text_color(GREEN).child("NEURAL FEED"))
        .child(div().flex_1().min_w(0).truncate().font_weight(700).text_size(12).text_color("#b8ffbf").child(droneName(a)))
        .child(div().flex_none().font_family(HUD).text_size(7).text_color(statusColor).child(STATUS[a.status] ?? ""))
        .child(div().flex_none().text_size(10).text_color(t.dim).child(a.address)))
      .child(div().w_full().text_size(10).text_color(t.dim).child(details))
      .child(div().w_full().h(1).bg(DIM))
      .child(v_flex().w_full().min_w(0).gap(0)
        .children(lines
          ? lines.map((l) => div().w_full().min_w(0).truncate().font_family("JetBrains Mono").text_size(10.5).line_height("15px").text_color("#9fe8a9").child(l))
          : [div().font_family(HUD).text_size(7.5).text_color(t.dim).child("ESTABLISHING LINK…")]))
      .child(div().w_full().h(1).bg(DIM))
      .child(div().font_family(HUD).text_size(7).text_color(t.dim).child("CLICK THE CARD TO OPEN · READ-ONLY"));
  }

  // Read each blocked agent's screen; forget agents that aren't blocked any more.
  readAsks(cx) {
    const blocked = agents().filter((a) => a.status === "blocked").map((a) => a.address);
    for (const addr of Object.keys(this.asks)) if (!blocked.includes(addr)) delete this.asks[addr];
    if (this.replyTo && !blocked.includes(this.replyTo)) { this.replyTo = null; this.reply = ""; }
    for (const addr of blocked) this.readAsk(addr, cx);
  }

  readAsk(addr, cx) {
    if (this.reading.has(addr)) return;
    this.reading.add(addr);
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["read", addr, "--json"]);
        if (r.code === 0) this.asks[addr] = extract(JSON.parse(r.stdout).text);
      } catch {}
      this.reading.delete(addr);
      cx.notify();
    });
  }

  // Run hc steps in order against one agent, then say how it went under its card.
  act(addr, steps, okText, cx) {
    if (this.acting.has(addr)) return;
    this.acting.add(addr);
    cx.notify();
    cx.spawn(async (cx) => {
      let failed = null;
      for (const args of steps) {
        let r;
        try { r = await hc(args); } catch (e) { r = { code: 1, stderr: String(e) }; }
        if (r.code !== 0) { failed = (r.stderr || r.stdout || "no answer").trim().split("\n")[0].slice(0, 80); break; }
      }
      this.acting.delete(addr);
      this.results[addr] = { ok: !failed, text: failed ? `FAILED: ${failed}` : okText, at: Date.now() };
      this.readAsk(addr, cx);
      cx.notify();
    });
  }

  // A reply declines a choice list first (Esc), then types the text.
  sendReply(addr, cx) {
    const text = this.reply.trim();
    if (!text) return;
    const steps = [];
    if (this.asks[addr]?.options.length) steps.push(["keys", addr, "esc"]);
    steps.push(["send", "--force", addr, text]);
    this.reply = "";
    this.act(addr, steps, "REPLY SENT", cx);
  }

  replyKey(e, cx, addr) {
    const m = e.modifiers;
    if (e.key === "enter") this.sendReply(addr, cx);
    else if (e.key === "escape") {
      this.reply = "";
      this.replyTo = null;
      const p = focused()?.pane;
      if (p) run("pane.focus", { pane: p });
    } else if (e.key === "backspace") this.reply = m.alt || m.control ? this.reply.replace(/\S+\s*$/, "") : this.reply.slice(0, -1);
    else if (m.control && e.key === "u") this.reply = "";
    else if (e.key_char && !m.control && !m.platform) this.reply = (this.reply + e.key_char).slice(0, 2000);
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  // The panel under a blocked agent's card: its question, its choices, Interrupt and a reply line.
  askPanel(a, t) {
    const addr = a.address;
    const ask = this.asks[addr];
    const busy = this.acting.has(addr);
    const result = this.results[addr] && Date.now() - this.results[addr].at < 5000 ? this.results[addr] : null;
    const RED = t.blocked;
    const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    const button = (id, label, fn, o = {}) => stop(h_flex().id(id).w_full().min_w(0).px(5).py(2).gap(5).items_center()
      .border(1).border_color(o.lit ? RED : `${RED}66`).bg(o.lit ? `${RED}2a` : "#00000000")
      .cursor_pointer().hover((s) => s.bg(`${RED}40`))
      .when(busy, (el) => el.opacity(0.4))
      .on_click((_e, cx) => { cx.stop_propagation(); if (!busy) fn(cx); })
      .when(Boolean(o.key), (el) => el.child(div().flex_none().font_family(HUD).text_size(7.5).text_color(RED).child(o.key)))
      .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color("#ffd9cf").child(label)));
    const typing = this.replyTo === addr && this.replyFocus.is_focused();

    return stop(v_flex().id(`ask-${addr}`).w_full().mt(4).p(5).gap(4).bg("#1a0604e8").border(1).border_color(`${RED}88`)
      .on_hover((h, cx) => { this.inPanel = h; cx.notify(); })
      .on_click((_e, cx) => cx.stop_propagation()))
      .child(h_flex().gap(6).items_center()
        .child(div().flex_none().font_family(HUD).text_size(7.5).text_color(RED).child("AWAITING INPUT"))
        .child(div().flex_1().h(1).bg(`${RED}55`)))
      // The question, as the agent's screen shows it.
      .child(v_flex().w_full().min_w(0).gap(0)
        .children(ask ? ask.lines.map((l) => div().w_full().min_w(0).truncate().font_family("JetBrains Mono").text_size(10).text_color("#e8c9c0").child(l))
          : [div().font_family(HUD).text_size(7).text_color(t.dim).child("READING SCREEN…")]))
      // Its choices, or a plain Approve (Enter).
      .children(ask?.options.length
        ? ask.options.map((o, i) => button(`ask-${addr}-opt-${i}`, o.label, (cx) => this.act(addr, [["keys", addr, ...o.keys]], `CHOSE ${i + 1}`, cx), { key: String(i + 1), lit: o.selected }))
        : [button(`ask-${addr}-ok`, "Approve (press Enter)", (cx) => this.act(addr, [["keys", addr, "enter"]], "APPROVED", cx), { key: "⏎" })])
      .child(button(`ask-${addr}-stop`, "Interrupt", (cx) => this.act(addr, [["interrupt", addr]], "INTERRUPTED", cx), { key: "■" }))
      // The reply line: click, type, Enter.
      .child(stop(h_flex().id(`ask-${addr}-reply`).track_focus(this.replyFocus).w_full().min_w(0).h(20).px(5).gap(4).items_center()
        .bg("#000000aa").border(1).border_color(typing ? RED : `${RED}55`).cursor_text()
        .on_click((_e, cx) => {
          cx.stop_propagation();
          if (this.replyTo !== addr) this.reply = "";
          this.replyTo = addr;
          this.replyFocus.focus();
          cx.notify();
        })
        .on_key_down((e, cx) => { if (this.replyTo === addr) this.replyKey(e, cx, addr); })
        .when(typing || (this.replyTo === addr && this.reply), (el) => el
          .child(div().min_w(0).truncate().text_size(10.5).text_color("#ffd9cf").child(this.reply))
          .when(typing, (el) => el.child(div().flex_none().w(5).h(10).bg(RED).loop("opacity", { from: 0, to: 1, period: 900 }))))
        .when(!typing && !(this.replyTo === addr && this.reply), (el) => el.child(div().min_w(0).truncate().text_size(10).text_color(`${RED}aa`)
          .child(ask?.options.length ? "Reply instead (declines)… Enter" : "Reply… Enter sends")))))
      .when(Boolean(result) || busy, (el) => el.child(div().font_family(HUD).text_size(7).text_color(busy ? t.dim : result.ok ? GREEN : RED)
        .child(busy ? "TRANSMITTING…" : result.text)));
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
    // What the compact card leaves out goes in the hover feed's header.
    const ctxEta = a.status === "working" ? etaText(this.tele.eta(a.address, "hp")) : null;
    const lnkEta = etaText(this.tele.eta(a.address, "sp"));
    const details = [designation(index, total), job ? CLASS_TITLE[job] : null, cache?.name,
      `Context left ${cortex.text}${ctxEta ? ` (${ctxEta} at this pace)` : ""}`,
      `5h quota left ${link.text}${lnkEta ? ` (${lnkEta})` : ""}`].filter(Boolean).join(" · ");
    const crit = cortex.pct !== null && !cortex.stale && cortex.pct <= CTX_CRIT && !label?.builder;
    const peeking = this.peekAddr === a.address && this.peekOpen();
    const top = h_flex()
      .id(`collective-top-${a.address}`)
      .w_full()
      .gap(7)
      .items_center()
      .child(face(a, job, t, this.ms))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          // Line 1: name, then the status word.
          .child(
            h_flex()
              .w_full()
              .min_w(0)
              .gap(6)
              .items_center()
              .child(div().flex_1().min_w(0).truncate().font_weight(700).text_size(12.5).text_color(nameColor).child(droneName(a)))
              .child(div().flex_none().font_family(HUD).text_size(7).text_color(statusColor)
                .when(a.status === "blocked", (el) => el.loop("opacity", { from: 0.2, to: 1, period: 700 }))
                .child(STATUS[a.status] ?? String(a.status ?? "").toUpperCase())),
          )
          // Line 2: program tag and model.
          .when(Boolean(label), (el) => el.child(tag(label, label.builder ? null : model, t)))
          .when(Boolean(label?.builder) && model !== null, (el) => el.child(h_flex().w_full().min_w(0).child(modelLine(model, t))))
          // Line 3: both gauges side by side. Builders have no cortex/link source, so no empty cells.
          .when(!label?.builder, (el) => el.child(h_flex().w_full().min_w(0).gap(8).child(cell("CTX", cortex, t)).child(cell("LNK", link, t)))),
      );
    return v_flex()
      .id(`collective-${a.address}`)
      .relative()
      .w_full()
      .flex_none()
      .p(4)
      .bg(a.focused ? "#071409f0" : "#030805e8")
      .border(1)
      .border_color(crit ? "#ff4433" : a.focused || a.status === "blocked" ? `${edge}99` : "#0f2a16")
      .cursor_pointer()
      .hover((s) => s.bg("#0b2010f0"))
      .on_hover((h, cx) => {
        if (h && this.peekAddr !== a.address) {
          this.peekAddr = a.address;
          this.peekSince = Date.now();
          this.readFeed(a.address, cx);
        } else if (!h && this.peekAddr === a.address) this.peekAddr = null;
        cx.notify();
      })
      .on_click(() => {
        this.peekAddr = null;
        playSound(BLIP);
        run("agent.focus", { terminal: a.address });
      })
      .children(brackets(edge))
      // A 1px anchor at the card's top-right corner: the feed hangs from it, outside the sidebar.
      .child(Popup.new(`peek-${a.address}`, div()).absolute().top(-1).right(-1).size(1)
        .when(peeking, (pop) => pop.content(this.feed(a, details, statusColor, t))))
      .child(top)
      .when(crit && a.status !== "blocked", (el) => el.child(this.ctxWarning(a, cortex, ctxEta, t)))
      .when(a.status === "blocked", (el) => el.child(this.askPanel(a, t)));
  }

  // Samples every drone's gauges, works out the fleet's lowest, and raises a toast once
  // when a drone's context or the 5-hour quota crosses into critical.
  watchFuel(list) {
    const fleet = { sp: null, spEta: null, low: [] };
    for (const a of list) {
      const c = this.cache[a.address] ?? this.remote[a.address] ?? null;
      this.tele.add(a.address, c);
      if (!c || this.now - c.updatedAt > 300) continue;
      if (c.sp != null && (fleet.sp === null || c.sp < fleet.sp)) fleet.sp = c.sp;
      const e = this.tele.eta(a.address, "sp");
      if (e != null && (fleet.spEta === null || e < fleet.spEta)) fleet.spEta = e;
      if (c.hp != null && c.hp <= CTX_LOW) fleet.low.push({ a, hp: c.hp });
      this.alarm(`ctx:${a.address}`, c.hp, CTX_CRIT, "Context almost full",
        `${a.tab_name || a.address} has ${c.hp}% context left. Compact it from its card.`);
    }
    this.alarm("lnk", fleet.sp, LNK_CRIT, "5-hour quota almost used",
      `${fleet.sp}% of the 5-hour quota is left${fleet.spEta ? `, about ${etaText(fleet.spEta).replace("~", "")} at this pace` : ""}.`);
    fleet.low.sort((x, y) => x.hp - y.hp);
    this.fleet = fleet;
    this.tele.save(new Set(list.map((a) => a.address)));
  }

  alarm(key, value, at, title, body) {
    if (value == null) return;
    if (value > at + 5) this.warned.delete(key);
    else if (value <= at && !this.warned.has(key)) {
      this.warned.add(key);
      notify({ title, body, level: "warning" });
    }
  }

  // Under a card whose context is nearly gone: how much is left, how long at this pace, and /compact.
  ctxWarning(a, cortex, eta, t) {
    const addr = a.address;
    const busy = this.acting.has(addr);
    const result = this.results[addr] && Date.now() - this.results[addr].at < 5000 ? this.results[addr] : null;
    const RED = "#ff4433";
    return h_flex().id(`ctx-warn-${addr}`).w_full().mt(4).px(5).py(3).gap(6).items_center()
      .bg("#1a0604e8").border(1).border_color(`${RED}88`)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => cx.stop_propagation())
      .child(div().flex_none().font_family(HUD).text_size(7.5).text_color(RED)
        .loop("opacity", { from: 0.35, to: 1, period: 900 })
        .child(`CORTEX ${cortex.text}${eta ? ` · ${eta}` : ""}`))
      .child(div().flex_1().min_w(0).truncate().font_family(HUD).text_size(7).text_color(result ? (result.ok ? GREEN : RED) : t.dim)
        .child(busy ? "TRANSMITTING…" : result ? result.text : ""))
      .child(h_flex().id(`ctx-compact-${addr}`).flex_none().px(5).py(1).border(1).border_color(RED).bg(`${RED}22`)
        .cursor_pointer().hover((s) => s.bg(`${RED}55`)).when(busy, (el) => el.opacity(0.4))
        .tooltip("Send /compact: the agent summarises its conversation to free up context")
        .on_click((_e, cx) => { cx.stop_propagation(); if (!busy) this.act(addr, [["send", addr, "/compact"]], "COMPACTING", cx); })
        .child(div().font_family(HUD).text_size(7.5).text_color("#ffd9cf").child("COMPACT")));
  }

  // The tree's telemetry line: the 5-hour quota left and when it runs dry, and the drones low on context.
  telemetryStrip(t) {
    const f = this.fleet;
    if (!f || (f.sp === null && !f.low.length)) return null;
    const color = f.sp === null ? t.dim : f.sp <= LNK_CRIT ? "#ff4433" : f.sp < 30 ? "#e8b13a" : GREEN;
    const eta = etaText(f.spEta);
    const worst = f.low[0];
    return h_flex().id("telemetry").flex_none().h(18).px(16).gap(6).items_center()
      .tooltip("5-hour quota left across the collective, and when it runs out at the current pace")
      .when(f.sp !== null, (el) => el
        .child(div().flex_none().font_family(HUD).text_size(7.5).text_color(t.dim).child("LINK"))
        .child(div().flex_none().text_size(10.5).text_color(color)
          .when(f.sp <= LNK_CRIT, (d) => d.loop("opacity", { from: 0.35, to: 1, period: 900 }))
          .child(`${f.sp}%`))
        .when(Boolean(eta), (el) => el.child(div().flex_none().font_family(HUD).text_size(7).text_color(t.dim).child(`DRY ${eta}`))))
      .child(div().flex_1())
      .when(Boolean(worst), (el) => el.child(div().min_w(0).truncate().font_family(HUD).text_size(7)
        .text_color(worst.hp <= CTX_CRIT ? "#ff4433" : "#e8b13a")
        .child(`LOW CORTEX ${worst.hp}%${f.low.length > 1 ? ` +${f.low.length - 1}` : ""}`)));
  }

  // Once per tree render: jobs, fresh caches, the clock the cards animate by.
  prepare(cx) {
    const list = agents();
    this.assigned = assignJobs(tabNames(spaces(), list), this.jobs);
    // A newly seen agent reads its cache now instead of at the next tick.
    const fresh = list.filter((a) => !this.seen.has(a.address));
    if (fresh.some((a) => cachePath(HOME, a.address) !== null)) this.load(cx);
    if (fresh.some((a) => remoteCachePath(a.address) !== null)) this.loadRemote(cx);
    this.ms = Date.now();
    this.now = Math.floor(this.ms / 1000);
    this.watchFuel(list);
  }
}
