import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// The brand cube: a rotating pixel cube strip (CUBE_FRAMES frames), stepped by a gentle clock.
const CUBE = 30, CUBE_FRAMES = 36, CUBE_MS = 90;

export default class WorkspaceChrome extends View {
  // The cube holds its first frame: a redraw timer here repainted the whole window ~11x/sec.
  init(_props, _cx) {}
  cube() {
    const i = 0;
    return div().relative().size(CUBE).flex_none().overflow_hidden()
      .child(image("mods/collective-chrome/art/cube.webp").absolute().top(0).left(-i * CUBE).w(CUBE * CUBE_FRAMES).h(CUBE));
  }
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
        .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action).child(svg(`mods/collective-chrome/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(label));
      return v_flex().size_full().bg("#020503e0").border_t(1).border_color("#1f5c2c").px(8).pt(4).pb(8).text_size(13)
        .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(div().size(6).rounded_full().bg(t.accent))))
        .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
    }
    return h_flex().size_full().bg("#020503d0").border_b(1).border_color("#1f5c2c").pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center().child(this.cube()).child(v_flex().child(div().font_family("Silkscreen").font_weight(700).text_size(14).text_color("#39d353").child("HERDR")).child(div().font_family("Silkscreen").text_size(7).text_color(t.dim).child("COLLECTIVE")))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/collective-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/collective-chrome/sidebar.svg").size(15), toggleSidebar)));
  }
}
