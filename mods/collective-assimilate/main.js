// Assimilate a drone: pick a role (its face comes from jobs.json by the tab's name),
// a sector (space) and a unit (an installed agent on that sector's machine), write a
// first directive, and Enter starts it: tab.new { space, name: role, argv, task }.
// Opened with ctrl-shift-a in the Collective layout, or a sector row's "+" (props.space).

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, closeOverlay, knownAgents, playSound, props, readTextFile, run, spaces, theme } from "herdr";

const HUD = "Silkscreen";
const GREEN = "#39d353";
const DIM = "#1f5c2c";
const JOBS_FILE = `${appHome()}/mods/collective-agents/jobs.json`;
const FACES = "mods/collective-agents/faces";
const KNOWN = new Set(["analyst", "engineer", "infiltrator", "medical", "navigator", "scout", "sentinel", "tactical"]);
const BLIP = "mods/collective-chrome/sounds/blip.mp3";

export default class Assimilate extends View {
  init(_p, cx) {
    this.focus = cx.focus_handle();
    this.focus.focus();
    this.roles = []; // [{ name, job }]
    this.role = null;
    const sp = spaces();
    this.space = props()?.space ?? sp.find((s) => s.active)?.id ?? sp[0]?.id ?? null;
    this.units = null; // null while asking the machine
    this.unit = null;
    this.brief = "";
    this.error = null;
    cx.spawn(async (cx) => {
      let jobs = {};
      try { jobs = JSON.parse(await readTextFile(JOBS_FILE)) ?? {}; } catch {}
      this.roles = Object.entries(jobs).filter(([, j]) => KNOWN.has(j)).map(([name, job]) => ({ name, job }));
      this.role = this.roles.find((r) => !/^(claude code|codex)$/i.test(r.name))?.name ?? this.roles[0]?.name ?? null;
      cx.notify();
    });
    this.ask(cx);
  }

  // The agents installed on the chosen sector's machine.
  ask(cx) {
    const on = spaces().find((s) => s.id === this.space)?.machine ?? null;
    this.units = null;
    cx.spawn(async (cx) => {
      let list = [];
      try { list = (await knownAgents({ on })).filter((a) => a.installed && a.run); } catch {}
      this.units = list;
      if (!list.some((u) => u.key === this.unit)) this.unit = (list.find((u) => /claude/i.test(u.key)) ?? list[0])?.key ?? null;
      cx.notify();
    });
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  go() {
    const unit = (this.units ?? []).find((u) => u.key === this.unit);
    if (!this.space) return (this.error = "PICK A SECTOR");
    if (!unit) return (this.error = this.units === null ? "STILL SCANNING FOR UNITS…" : "NO AGENT INSTALLED THERE");
    const args = { space: this.space, argv: unit.run };
    if (this.role) args.name = this.role;
    if (this.brief.trim()) args.task = this.brief.trim();
    playSound(BLIP);
    run("tab.new", args);
    this.close();
  }

  key(e, cx) {
    const m = e.modifiers;
    if (e.key === "escape") this.close();
    else if (e.key === "enter" && !m.shift) this.go();
    else if (e.key === "tab") this.cycleRole(m.shift ? -1 : 1);
    else if (e.key === "backspace") this.brief = m.alt || m.control ? this.brief.replace(/\S+\s*$/, "") : this.brief.slice(0, -1);
    else if (m.control && e.key === "u") this.brief = "";
    else if (e.key_char && !m.control && !m.platform) this.brief = (this.brief + e.key_char).slice(0, 4000);
    else return;
    this.error = null;
    cx.stop_propagation();
    cx.notify();
  }

  cycleRole(step) {
    if (!this.roles.length) return;
    const i = this.roles.findIndex((r) => r.name === this.role);
    this.role = this.roles[(i + step + this.roles.length) % this.roles.length].name;
  }

  label(text) {
    return div().flex_none().font_family(HUD).text_size(8).text_color(GREEN).child(text);
  }

  chip(id, on, fn, ...kids) {
    return h_flex().id(id).flex_none().px(6).py(3).gap(5).items_center()
      .border(1).border_color(on ? GREEN : DIM).bg(on ? "#0b2a14" : "#030805")
      .cursor_pointer().hover((s) => s.bg(on ? "#0b2a14" : "#0b2010"))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { fn(cx); this.error = null; this.focus.focus(); cx.notify(); })
      .children(kids);
  }

  button(id, text, fn, solid) {
    return div().id(id).flex_none().px(10).py(4).border(1).border_color(GREEN)
      .bg(solid ? GREEN : "#00000000").font_family(HUD).text_size(8.5).text_color(solid ? "#020604" : GREEN)
      .cursor_pointer().hover((s) => s.bg(solid ? "#8cff9e" : "#0b2010"))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { fn(); cx.notify(); })
      .child(text);
  }

  render(_cx) {
    const t = theme();
    const sp = spaces();
    return v_flex().id("assimilate").track_focus(this.focus).on_key_down((e, cx) => this.key(e, cx))
      .size_full().px(18).py(14).gap(11).bg("#020604f6").border(1).border_color(GREEN)
      .text_color(t.foreground).text_size(12)
      .child(h_flex().gap(8).items_center()
        .child(div().font_family(HUD).font_weight(700).text_size(12).text_color(GREEN).child("ASSIMILATE A DRONE"))
        .child(div().w(7).h(12).bg(GREEN).loop("opacity", { from: 0, to: 1, period: 1000 }))
        .child(div().flex_1().h(1).bg(DIM)))
      // Role: its face and name; the tab is named after it.
      .child(v_flex().gap(5).child(this.label("ROLE  ·  TAB SWITCHES"))
        .child(div().flex().flex_wrap().gap(5).children(this.roles.map((r) =>
          this.chip(`role-${r.job}-${r.name}`, r.name === this.role, () => { this.role = r.name; },
            image(`${FACES}/${r.job}.png`).size(22).flex_none().border(1).border_color(DIM),
            div().text_size(11.5).child(r.name))))))
      // Sector: which space it joins (and so which machine).
      .child(v_flex().gap(5).child(this.label("SECTOR"))
        .child(div().flex().flex_wrap().gap(5).children(sp.map((s, i) =>
          this.chip(`sector-${s.id}`, s.id === this.space, (cx) => { this.space = s.id; this.ask(cx); },
            div().font_family(HUD).text_size(7.5).text_color(t.dim).child(String(i + 1).padStart(3, "0")),
            div().text_size(11.5).child(s.name),
            ...(s.machine ? [div().font_family(HUD).text_size(7).text_color(t.dim).child(s.machine.toUpperCase())] : []))))))
      // Unit: the agent program it runs.
      .child(v_flex().gap(5).child(this.label("UNIT"))
        .child(div().flex().flex_wrap().gap(5)
          .when(this.units === null, (el) => el.child(div().font_family(HUD).text_size(7.5).text_color(t.dim).child("SCANNING SECTOR FOR UNITS…")))
          .when(this.units !== null && !this.units.length, (el) => el.child(div().font_family(HUD).text_size(7.5).text_color("#ff4433").child("NO AGENTS INSTALLED ON THAT MACHINE")))
          .when(Boolean(this.units?.length), (el) => el.children(this.units.map((u) =>
            this.chip(`unit-${u.key}`, u.key === this.unit, () => { this.unit = u.key; }, div().text_size(11.5).child(u.name)))))))
      // Directive: the agent's first message.
      .child(v_flex().flex_1().min_h(0).gap(5).child(this.label("DIRECTIVE  ·  OPTIONAL FIRST MESSAGE"))
        .child(div().id("directive").flex_1().min_h(60).p(7).bg("#000000").border(1).border_color(GREEN)
          .child(this.brief
            ? div().text_size(12).text_color("#b8ffbf").child(`${this.brief}▏`)
            : div().text_size(12).text_color(t.dim).child("▏Type what this drone should do…"))))
      .child(div().h(1).w_full().bg(DIM))
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().font_family(HUD).text_size(7.5)
          .text_color(this.error ? "#ff4433" : t.dim)
          .child(this.error ?? "ENTER ASSIMILATES · ESC CANCELS"))
        .child(this.button("assim-cancel", "CANCEL", () => this.close(), false))
        .child(this.button("assim-go", "ASSIMILATE", () => this.go(), true)));
  }
}
