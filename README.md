# Collective

A cybernetic hive-mind layout for the [Herdr](https://herdr.dev) desktop app, drawn in pixel art. Your coding agents become drones in a collective. Each drone has an animated 48×48 pixel-art face, a designation like "THREE OF FOUR", and two LED power cells: CORTEX (context left) and LINK (5-hour quota left). While an agent works, its drone sweeps an ocular laser across the screen. When an agent needs you, the face glitches red. Spaces are numbered sectors with pixel-art locations, a pixel cube sits in the corner, and the whole window glows hive green over a dark circuit hull.

![Collective](preview.png)

Collective follows the structure of [herdr-inferno](https://github.com/rbkuhn/herdr-inferno), which is built on [herdr-traveler](https://github.com/franky5440-afk/herdr-traveler). All of its art, animation, sound and styling is new.

## Install

```sh
git clone https://github.com/rbkuhn/herdr-collective
cd herdr-collective
H=~/.config/herdr-app
cp layouts/collective.json layouts/collective.png "$H/layouts/"
cp themes/collective.json "$H/themes/"
cp -r mods/collective-agents mods/collective-assimilate mods/collective-chrome mods/collective-pane mods/collective-spaces mods/collective-tabs mods/collective-tree mods/layout-sounds "$H/mods/"
herdr-app do layout.switch '{"name":"collective"}'
```

Then add the key from `keys.json` to your own `~/.config/herdr-app/keys.json`: copy its `"layout:collective"` section in. It only applies while Collective is showing.

Press `ctrl-shift-l` to switch back. To remove Collective, delete the files you copied.

## Using it

- **One tree**: each sector (space) lists its drones under it. Click a sector's count to fold it; folded, a dot shows its most urgent drone.
- **Answer from the sidebar**: when a drone needs you, its card opens an AWAITING INPUT panel with the question, one button per choice, Interrupt and a reply line. You don't leave the terminal you're in.
- **Neural feed**: rest the pointer on a card to see the last lines of that drone's terminal. Click the card to open it.
- **Fuel warnings**: the line under the header shows the 5-hour quota left (LINK) and when it runs dry at the current pace. At 15% context a card turns red and offers COMPACT (sends `/compact`), and a toast warns you once.
- **Assimilate** (`ctrl-shift-a`, or a sector's `+`): pick a role, a sector, an installed agent and a first message, and Enter starts it in a new tab named after the role, so it gets that drone's face.

The faces only animate while at least one agent is working or blocked, and step 4 frames a second. With every drone idle, the sidebar doesn't redraw, so Herdr stays near idle.

The sidebar runs `hc` against your own agents: `hc read` to show a blocked or hovered drone's screen, and `hc keys`, `hc send` and `hc interrupt` only when you press a button. Nothing reaches the network.

### Optional: fill the Cortex and Link cells (Claude Code)

The cells read a small cache file that a Claude Code statusline writes:

```sh
mkdir -p ~/.config/herdr-app/scripts
cp scripts/collective-statusline.sh scripts/collective-record.mjs ~/.config/herdr-app/scripts/
```

Then set Claude Code's statusline in `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "/bin/sh ~/.config/herdr-app/scripts/collective-statusline.sh" }
```

The script needs `node`. It records the numbers without printing anything, so your statusline stays empty. If you already have a statusline, add a line to `collective-statusline.sh` that pipes `$input` into it. If you already use Inferno's or Traveler's statusline, skip this step: they write the same cache. Without any of them, the cells show "—".

### Optional: sounds

A hive chorus of six voices runs through a metallic radio filter. "Task complete." plays over a cold chime. For "an agent needs you", a short, quiet klaxon plays first, then the chorus says "Your input is required." on its own, so the words come through clearly. The layout carries a small invisible mod, `layout-sounds`, that sets these two sounds in `~/.config/herdr-app/settings.json` whenever Collective comes on screen, so there is nothing to set up. Herdr's sounds setting is global: the sounds stay until you change them or switch to another layout that sets its own. `mods/layout-sounds/sounds.json` lists the pair for each layout; edit it to pick other files.

`blocked.mp3` is the older take, with the voices mixed under the klaxon. `done_fx_only.mp3` and `blocked_fx_only.mp3` are the effects without the voices. Assimilate plays `blip.mp3` when it starts a drone; clicking a drone card is silent.

## Customise

- **Which drone a tab gets:** edit `mods/collective-agents/jobs.json`. It maps tab names to roles: tactical, medical, engineer, scout, analyst, navigator, infiltrator or sentinel. Tabs not listed get a role based on their name.
- **Which location a space gets:** edit `mods/collective-spaces/places.json`, e.g. `{"my-space": "vortex"}`. The choices are cube, sphere, alcove, planet, nexus and vortex.

## Credits and licences

- Code: Apache-2.0 (see `LICENSE` and `NOTICE`). It is adapted from Herdr's shipped mods and from herdr-traveler, both Apache-2.0.
- Art: the drone faces, locations, icons and backgrounds were generated with OpenAI image models for this project. They were then reduced by script to a fixed 24-colour palette and animated frame by frame. They are released under Apache-2.0.
- Sounds: generated with ElevenLabs on a paid plan, then processed with ffmpeg. They are released under Apache-2.0.
- Fonts: [Silkscreen](https://fonts.google.com/specimen/Silkscreen), [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) and [VT323](https://fonts.google.com/specimen/VT323), SIL Open Font License 1.1 (see `mods/collective-chrome/fonts/OFL-*.txt`).

Collective is an original work. It is not affiliated with or endorsed by any film, TV or game studio.
