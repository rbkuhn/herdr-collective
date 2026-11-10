// Layout sounds: gives each layout its own done/blocked alert sounds. Herdr's sounds setting is
// global, so when a layout that carries this mod (as an invisible floating block) comes on
// screen, this sets settings.json's sounds.done/blocked to that layout's pair from sounds.json.
// It writes only when they differ, and keeps every other setting. Draws nothing.

import { View } from "gpui-kit";
import { appHome, readTextFile, writeTextFile, shared } from "herdr";

const HOME = appHome();
const MAP = `${HOME}/mods/layout-sounds/sounds.json`;
const SETTINGS = `${HOME}/settings.json`;

export default class LayoutSounds extends View {
  init(_props, cx) {
    this.applied = null;
    this.apply(cx);
  }

  apply(cx) {
    const name = shared("layout");
    if (!name || name === this.applied) return;
    this.applied = name;
    cx.spawn(async () => {
      try {
        const map = JSON.parse((await readTextFile(MAP)) ?? "{}");
        const want = map[name];
        if (!want?.done || !want?.blocked) return;
        const text = await readTextFile(SETTINGS);
        const s = text ? JSON.parse(text) : {};
        const cur = s.sounds ?? {};
        if (cur.done === want.done && cur.blocked === want.blocked) return;
        s.sounds = { ...cur, enabled: cur.enabled ?? true, done: want.done, blocked: want.blocked };
        await writeTextFile(SETTINGS, JSON.stringify(s, null, 2) + "\n", text);
      } catch (e) {
        console.log(`layout-sounds: ${e}`);
        this.applied = null;
      }
    });
  }

  render(cx) {
    this.apply(cx);
    return "";
  }
}
