#!/usr/bin/env python3
"""Draws the Collective drone animations: one PNG per frame, a different act per drone and state.

  python3 collective-faces.py            write mods/collective-agents/frames/<role>/<state>/NN.png
  python3 collective-faces.py --sheet D  also write a contact sheet per role into folder D

Everything is drawn on the 48px grid of faces/<role>.png and saved at 96px. Each loop is
seamless: all motion is a whole number of cycles of the loop's phase p = frame / frames.
Frame counts here must match ANIM in mods/collective-tree/lib.js.
"""
import math, os, shutil, sys
import numpy as np
from PIL import Image

HOME = os.path.expanduser("~/.config/herdr-app")
FACES = f"{HOME}/mods/collective-agents/faces"
OUT = f"{HOME}/mods/collective-agents/frames"
W = 48
FRAMES = {"rest": 48, "working": 32, "blocked": 16, "done": 24}
TAU = math.tau

rgb = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255
GREEN, HI, RED, CYAN, AMBER, WHITE = rgb("#39d353"), rgb("#8cff9e"), rgb("#ff4433"), rgb("#5ce1e6"), rgb("#e8b13a"), np.ones(3)
BLUE = rgb("#7cc4ee")


def rnd(k):
    return (math.sin(k * 12.9898 + 4.1414) * 43758.5453) % 1


def wave(p, cycles=1, phase=0.0):
    """0..1..0 once per cycle."""
    return 0.5 - 0.5 * math.cos(TAU * (p * cycles + phase))


def bump(p, at, width):
    """1 at `at`, falling to 0 `width` away, on the loop's circle."""
    d = abs((p - at + 0.5) % 1 - 0.5)
    return max(0.0, 1 - d / width)


# ---------- drawing on a layer (additive light) ----------

def put(L, x, y, c, a=1.0):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < W and 0 <= y < W:
        L[y, x] += c * a


def mix(L, x, y, c, a=1.0):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < W and 0 <= y < W:
        L[y, x] = L[y, x] * (1 - a) + c * a


def line(L, x0, y0, x1, y1, c, a=1.0, fade=0.0):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    seen = set()
    for k in range(n + 1):
        u = k / max(n, 1)
        pt = (int(round(x0 + (x1 - x0) * u)), int(round(y0 + (y1 - y0) * u)))
        if pt in seen:
            continue
        seen.add(pt)
        put(L, pt[0], pt[1], c, a * (1 - fade * u))


def ring(L, cx, cy, r, c, a=1.0, a0=0.0, a1=TAU, dash=0, squash=1.0):
    n = max(8, int(r * 8))
    seen = set()
    for k in range(n + 1):
        ang = a0 + (a1 - a0) * k / n
        if dash and int(ang / TAU * dash * 2) % 2:
            continue
        pt = (int(round(cx + math.cos(ang) * r)), int(round(cy + math.sin(ang) * r * squash)))
        if pt in seen:
            continue
        seen.add(pt)
        put(L, pt[0], pt[1], c, a)


def glow(L, cx, cy, r, c, a=1.0):
    for y in range(int(cy - r), int(cy + r) + 2):
        for x in range(int(cx - r), int(cx + r) + 2):
            d = math.hypot(x - cx, y - cy)
            if d < r:
                put(L, x, y, c, a * (1 - d / r) ** 2)


def brackets(L, x0, y0, x1, y1, c, a=1.0, n=2):
    for sx, sy, dx, dy in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        for k in range(n + 1):
            put(L, sx + dx * k, sy, c, a)
            if k:
                put(L, sx, sy + dy * k, c, a)


FONT = {
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
    "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001010010",
    "8": "111101111101111", "9": "111101111001111", "A": "010101111101101", "B": "110101110101110",
    "C": "111100100100111", "D": "110101101101110", "E": "111100110100111", "F": "111100110100100",
    "?": "111001011000010", "!": "010010010000010", "K": "101101110101101", "O": "111101101101111",
    "X": "101101010101101", "+": "000010111010000", "-": "000000111000000", "N": "111101101101101",
    "L": "100100100100111", "S": "011100010001110", "T": "111010010010010",
}


def text(L, x, y, s, c, a=1.0):
    for ch in s:
        bits = FONT.get(ch)
        if bits:
            for k, b in enumerate(bits):
                if b == "1":
                    put(L, x + k % 3, y + k // 3, c, a)
        x += 4


def check(L, x, y, c, a=1.0, upto=1.0):
    pts = [(0, 3), (1, 4), (2, 5), (3, 4), (4, 3), (5, 2), (6, 1), (7, 0)]
    for px, py in pts[: max(0, int(round(len(pts) * upto)))]:
        put(L, x + px, y + py, c, a)
        put(L, x + px, y + py + 1, c, a * 0.5)


# ---------- the portrait and what can be done to it ----------

class Drone:
    def __init__(self, role):
        self.role = role
        self.base = np.asarray(Image.open(f"{FACES}/{role}.png").convert("RGB"), dtype=float)[::4, ::4] / 255
        b = self.base
        self.lum = b.mean(2)
        r, g, bl = b[..., 0], b[..., 1], b[..., 2]
        self.green = (g > r * 1.45) & (g > bl * 1.15) & (g > 0.3)
        self.red = (r > g * 1.9) & (r > bl * 1.8) & (r > 0.3)
        # Background: the dark area connected to the picture's edge.
        dark = self.lum < 0.075
        bg = np.zeros((W, W), bool)
        todo = [(y, x) for y in range(W) for x in range(W) if (y in (0, W - 1) or x in (0, W - 1)) and dark[y, x]]
        for p in todo:
            bg[p] = True
        while todo:
            y, x = todo.pop()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < W and 0 <= nx < W and dark[ny, nx] and not bg[ny, nx]:
                    bg[ny, nx] = True
                    todo.append((ny, nx))
        self.bg = bg
        fig = ~bg
        pad = np.pad(bg, 1, constant_values=True)
        self.rim = fig & (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:])
        gy, gx = np.gradient(self.lum)
        self.edges = (np.hypot(gx, gy) > 0.085) | self.rim

    def frame(self):
        return self.base.copy(), np.zeros((W, W, 3))

    def compose(self, img, back, over=0.0):
        """`back` shows behind the figure; `over` lets a little of it wash over the figure too."""
        m = np.where(self.bg, 1.0, over)[..., None]
        return np.clip(img + back * m, 0, 1)


def breathe(img, neck, on):
    if on:
        img[neck + 1:] = img[neck:-1].copy()


def blink(d, img, rects, amount):
    """Close organic eyes: the lid is the skin just above the eye, a little darker."""
    if amount <= 0:
        return
    for x0, y0, x1, y1 in rects:
        rows = range(y0, y1 + 1) if amount >= 1 else range(y0, y0 + max(1, (y1 - y0 + 1) // 2))
        for y in rows:
            for x in range(x0, x1 + 1):
                img[y, x] = d.base[y0 - 1, x] * 0.82


def blink_amount(i, at):
    """A blink is three frames: half, shut, half."""
    return max((1.0 if i == a + 1 else 0.5 if i in (a, a + 2) else 0.0) for a in at)


def recolor(img, mask, c, a=1.0):
    """Turn the lit pixels (LEDs, implants) another colour, keeping their brightness."""
    peak = img.max(2)
    img[mask] = img[mask] * (1 - a) + (c[None, :] * peak[mask][:, None]) * a


def lights(img, mask, k):
    img[mask] = np.clip(img[mask] * k, 0, 1)


def tint(img, c, a, where=None):
    lum = img.mean(2, keepdims=True)
    t = img * (1 - a) + lum * c * 1.6 * a
    if where is None:
        img[:] = t
    else:
        img[where] = t[where]


def glitch(img, i, rows, shift=3):
    for k in range(rows):
        y = int(rnd(i * 31 + k) * W)
        h = 1 + int(rnd(i * 17 + k * 3) * 2)
        dx = int((rnd(i * 7 + k) - 0.5) * 2 * shift)
        img[y:y + h] = np.roll(img[y:y + h], dx, axis=1)


def chroma(img, dx):
    img[..., 0] = np.roll(img[..., 0], dx, axis=1)
    img[..., 2] = np.roll(img[..., 2], -dx, axis=1)


def alarm(d, img, i, n, level=0.34):
    """What every blocked drone shares: a red pulse and the lit pixels turning red."""
    p = i / n
    tint(img, RED, level * (0.45 + 0.55 * wave(p, 2)), ~d.bg)
    recolor(img, d.green, RED)
    lights(img, d.green | d.red, 0.7 + 0.6 * wave(p, 4))


def lamp(L, x, y, on):
    if on:
        glow(L, x, y, 3.2, RED, 1.2)
        put(L, x, y, WHITE, 0.8)


# =====================================================================================
# ANALYST: reads the signal. Spectrum bars to her left, a scrolling hex column to her
# right, a reticle turning around the eye implant, light running through the hair spikes.
# =====================================================================================

def analyst(d, state, i, n):
    p = i / n
    img, back = d.frame()
    ex, ey = 25.5, 25.5
    eye_l = [(17, 24, 20, 25)]
    bars_x = [1, 3, 5, 7, 9]
    spikes = (~d.bg) & (np.arange(W)[:, None] < 11)

    def bars(heights, c, a):
        for x, h in zip(bars_x, heights):
            for k in range(int(round(h))):
                put(back, x, 35 - k, c, a * (0.55 + 0.45 * k / 14))
            put(back, x, 35 - int(round(h)), WHITE, a * 0.5)

    def column(speed, c, a, x=40):
        for row in range(8):
            y = (row * 6 + p * 48 * speed) % 48 - 5
            ch = "0123456789ABCDEF"[int(rnd(row * 5 + int(p * n * speed / 4)) * 16)]
            text(back, x, int(y), ch, c, a * (0.35 + 0.65 * (row % 3 == 0)))

    def hair(c, a, cycles):
        at = (p * cycles) % 1 * 22 + 12
        for y, x in zip(*np.where(spikes)):
            put(img, x, y, c, a * max(0, 1 - abs(x - at) / 3))

    if state == "rest":
        breathe(img, 39, wave(p) > 0.5)
        blink(d, img, eye_l, blink_amount(i, (20,)))
        hair(GREEN, 0.5, 1)
        column(1, GREEN, 0.4)
        bars([2 + 2 * wave(p, 1, k / 5) for k in range(5)], GREEN, 0.4)
        glow(img, ex, ey, 3.5, GREEN, 0.35 + 0.5 * wave(p, 2))
    elif state == "working":
        hair(HI, 0.9, 2)
        column(3, HI, 0.75)
        bars([2 + 12 * abs(math.sin(TAU * (p * (k + 1)) + k)) * (0.5 + 0.5 * wave(p, 2, k / 3)) for k in range(5)], HI, 0.9)
        ring(img, ex, ey, 5, HI, 0.8, a0=TAU * p, a1=TAU * p + TAU, dash=4)
        ring(img, ex, ey, 3, GREEN, 0.5, a0=-TAU * 2 * p, a1=-TAU * 2 * p + TAU * 0.7)
        glow(img, ex, ey, 3, HI, 0.9)
        # The implant projects onto the bars: a thin beam that flickers.
        if i % 3 != 2:
            line(img, ex - 2, ey, 10, 30 - 6 * wave(p, 2), HI, 0.28)
    elif state == "blocked":
        alarm(d, img, i, n)
        glitch(img, i, 2)
        bars([1 + rnd(i * 9 + k) * 2 for k in range(5)], RED, 0.9)
        if i % 8 < 5:
            text(back, 40, 12, "?", RED, 1.0)
            glow(back, 41, 14, 6, RED, 0.35)
        ring(img, ex, ey, 5, RED, 0.9 * (i % 2), dash=4)
        glow(img, ex, ey, 4, RED, 0.9)
    else:  # done: the reading resolves, bars fill, a check is signed
        rise = min(1, p * 3)
        recolor(img, d.green, CYAN)
        bars([14 * rise - k % 2 for k in range(5)], CYAN, 0.9)
        check(back, 38, 12, CYAN, 1.0, upto=min(1, max(0, p * 3 - 0.6)))
        hair(CYAN, 0.8, 1)
        glow(img, ex, ey, 4, CYAN, 0.5 + 0.5 * wave(p, 2))
        ring(img, ex, ey, 2 + 9 * min(1, p * 2.5), CYAN, max(0, 1 - p * 2.5))
    return d.compose(img, back)


# =====================================================================================
# ENGINEER: builds. A cog turns in the corner, the helmet's nodes chase each other, and
# when working a welding arc throws sparks and lights the face.
# =====================================================================================

def engineer(d, state, i, n):
    p = i / n
    img, back = d.frame()
    nodes = [(15, 14), (28, 15), (33, 23), (28, 39), (14, 30), (21, 22)]
    eyes = [(19, 22, 23, 23), (31, 23, 35, 24)]

    def cog(ang, c, a, cx=6, cy=6, r=4):
        ring(back, cx, cy, r, c, a)
        ring(back, cx, cy, 1.4, c, a * 0.8)
        for k in range(6):
            t = ang + k * TAU / 6
            put(back, cx + math.cos(t) * (r + 1.3), cy + math.sin(t) * (r + 1.3), c, a)
            put(back, cx + math.cos(t) * 2.6, cy + math.sin(t) * 2.6, c, a * 0.6)

    def chase(c, a, cycles, width=1.0):
        at = (p * cycles) % 1 * len(nodes)
        for k, (x, y) in enumerate(nodes):
            near = max(0, 1 - min(abs(k - at), len(nodes) - abs(k - at)) / width)
            glow(img, x, y, 2.6, c, a * near)
            put(img, x, y, WHITE, 0.6 * near)

    if state == "rest":
        breathe(img, 37, wave(p) > 0.5)
        blink(d, img, eyes, blink_amount(i, (30,)))
        cog(TAU * p / 6 * 1, GREEN, 0.45)
        chase(GREEN, 0.9, 1)
        # Embers drift up from the bench below.
        for k in range(5):
            u = (p + rnd(k)) % 1
            put(back, 40 + rnd(k + 9) * 6 + math.sin(u * TAU + k) * 1.5, 34 - u * 30, AMBER, 0.7 * (1 - u))
    elif state == "working":
        wx, wy = 41, 41
        flash = 1.0 if i % 4 in (0, 1) else 0.25
        cog(TAU * p, HI, 0.9)
        chase(HI, 1.0, 3, 1.4)
        # Arc light on the side of the face nearest the weld.
        yy, xx = np.mgrid[0:W, 0:W]
        lit = np.clip(1 - np.hypot(xx - wx, yy - wy) / 30, 0, 1) ** 2 * flash * 0.55
        img += (img.mean(2) * lit)[..., None] * (BLUE * 1.4)
        glow(img, wx, wy, 5, BLUE, 1.4 * flash)
        glow(img, wx, wy, 2.5, WHITE, 1.5 * flash)
        for k in range(14):
            u = (p * 2 + rnd(k * 3)) % 1
            ang = -TAU * (0.28 + 0.36 * rnd(k * 7 + 1))
            sp = 10 + 22 * rnd(k * 11 + 2)
            x = wx + math.cos(ang) * sp * u
            y = wy + math.sin(ang) * sp * u + 26 * u * u
            c = WHITE if u < 0.25 else AMBER
            put(img, x, y, c, 1.0 - u * 0.8)
            put(img, x - math.cos(ang), y - math.sin(ang) + 1, AMBER, 0.4 * (1 - u))
    elif state == "blocked":
        alarm(d, img, i, n)
        cog(0.25 * math.sin(TAU * p * 4), RED, 1.0)  # jammed: it rocks and can't turn
        # Hazard stripes run along the bottom.
        for x in range(W):
            if (x + i) % 6 < 3:
                for y in (45, 46, 47):
                    mix(img, x + (47 - y), y, AMBER, 0.75)
        # A short circuit jumps between two nodes.
        a_, b_ = nodes[i % len(nodes)], nodes[(i + 2) % len(nodes)]
        if i % 2 == 0:
            pts = [a_] + [(a_[0] + (b_[0] - a_[0]) * t + (rnd(i * 5 + t * 9) - 0.5) * 6, a_[1] + (b_[1] - a_[1]) * t + (rnd(i * 3 + t * 5) - 0.5) * 6) for t in (0.33, 0.66)] + [b_]
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                line(img, x0, y0, x1, y1, AMBER, 0.9)
            glow(img, *a_, 3, WHITE, 0.9)
    else:  # done: the nodes lock in one by one and the cog settles
        recolor(img, d.green, CYAN)
        cog(TAU * min(1, p * 2) ** 0.5 * 0.5, CYAN, 0.9)
        lit = min(len(nodes), int(p * 2.4 * len(nodes)) + 1)
        for k, (x, y) in enumerate(nodes[:lit]):
            glow(img, x, y, 2.8, CYAN, 0.55 + 0.45 * wave(p, 2, k / 6))
            put(img, x, y, WHITE, 0.5)
        if p > 0.45:
            text(back, 39, 2, "OK", CYAN, 0.9)
    return d.compose(img, back)


# =====================================================================================
# INFILTRATOR: hides. A cloak shimmer crosses the face leaving only its wireframe; at
# work the body falls into streams of code, and when caught the cloak fails in red.
# =====================================================================================

def infiltrator(d, state, i, n):
    p = i / n
    img, back = d.frame()
    eyes = [(17.5, 23), (29, 22.5)]
    fig = ~d.bg

    def wire(c, a, where):
        m = d.edges & where
        img[where & fig] *= 0.12
        img[m] += c * a

    def visor(c, a):
        for k, (x, y) in enumerate(eyes):
            glow(img, x, y, 3.2, c, a)

    xx = np.arange(W)[None, :].repeat(W, 0)
    yy = np.arange(W)[:, None].repeat(W, 1)
    if state == "rest":
        breathe(img, 39, wave(p) > 0.5)
        # One pass of the cloak per loop: a slanted band where only the outline is left.
        at = p * 2.2 * (W + 24) - 20
        band = (np.abs(xx + (yy - 24) * 0.4 - at) < 5) & (p < 0.5)
        wire(GREEN, 0.75, band)
        edge = (np.abs(np.abs(xx + (yy - 24) * 0.4 - at) - 5) < 1) & fig & (p < 0.5)
        img[edge] += HI * 0.5
        visor(GREEN, 0.3 + 0.5 * wave(p, 3))
    elif state == "working":
        # Columns of the body dissolve into falling code and return, in a rolling pattern.
        gone = np.zeros((W, W), bool)
        for x in range(W):
            amt = wave(p, 1, rnd(x * 3) * 0.6 + x / 60)
            if amt > 0.55:
                gone[:, x] = True
            head = (p * 48 * (1 + int(rnd(x) * 2)) + rnd(x + 5) * 48) % 48
            for k in range(7):
                y = int(head - k) % 48
                c = WHITE if k == 0 else HI
                if gone[y, x] or d.bg[y, x]:
                    put(back if d.bg[y, x] else img, x, y, c, (0.9 if gone[y, x] else 0.35) * (1 - k / 7) * (x % 2 or 0.5))
        wire(GREEN, 0.5, gone)
        visor(HI, 0.9)
        for x, y in eyes:  # the eyes hold steady while the rest phases
            line(img, x - 2, y, x + 2, y, WHITE, 0.6)
    elif state == "blocked":
        # Detected: the cloak fails, snapping between the body and a red wireframe.
        alarm(d, img, i, n, 0.25)
        if i % 4 in (0, 1):
            wire(RED, 1.0, np.ones((W, W), bool))
        else:
            chroma(img, 1 + i % 2)
        glitch(img, i, 3, 4)
        visor(RED, 1.0)
        if i % 8 < 4:
            brackets(img, 8, 6, 39, 40, RED, 0.9, 4)
    else:  # done: rematerialises top to bottom out of a cyan wireframe
        recolor(img, d.green, CYAN)
        cut = min(1, p * 2.2) * (W + 4)
        below = yy > cut
        wire(CYAN, 0.9, below)
        seam = np.abs(yy - cut) < 1
        img[seam & fig] += CYAN * 0.9
        img[d.rim] += CYAN * 0.5 * max(0, 1 - abs(p - 0.6) * 4)
        visor(CYAN, 0.4 + 0.5 * wave(p, 2))
    return d.compose(img, back)


# =====================================================================================
# MEDICAL: keeps things alive. A heart trace sweeps under her, her eyes beat with it, and
# a DNA helix turns at her side while she works.
# =====================================================================================

def ecg(u):
    u %= 1
    if 0.10 < u < 0.20:
        return 1.0 * math.sin((u - 0.10) / 0.10 * math.pi)
    if 0.26 <= u < 0.30:
        return -1.5 * (u - 0.26) / 0.04
    if 0.30 <= u < 0.34:
        return -1.5 + 8.5 * (u - 0.30) / 0.04
    if 0.34 <= u < 0.39:
        return 7 - 9.5 * (u - 0.34) / 0.05
    if 0.39 <= u < 0.43:
        return -2.5 + 2.5 * (u - 0.39) / 0.04
    if 0.55 < u < 0.72:
        return 1.8 * math.sin((u - 0.55) / 0.17 * math.pi)
    return 0.0


def medical(d, state, i, n):
    p = i / n
    img, back = d.frame()
    eyes = [(15.5, 16), (26, 16)]
    lids = [(13, 16, 18, 17), (24, 16, 28, 17)]

    def trace(beats, c, a, sweeps=1, flat=False, base=43):
        head = (p * sweeps) % 1 * W
        prev = None
        for x in range(W):
            y = base - (0 if flat else ecg(x / W * beats))
            age = ((head - x) % W) / W
            b = a * max(0.0, 1 - age * 1.25)
            if prev is not None:
                line(img, x, prev, x, y, c, b)
            else:
                put(img, x, y, c, b)
            prev = y
        put(img, head, base - (0 if flat else ecg(head / W * beats)), WHITE, 0.9)
        glow(img, head, base - (0 if flat else ecg(head / W * beats)), 2.5, c, 0.6)

    def beat(beats, sweeps=1):
        """How close the sweep is to a spike: the eyes and the cross pulse on it."""
        u = ((p * sweeps) % 1 * beats) % 1
        return max(0.0, 1 - abs(u - 0.33) / 0.12)

    def cross(c, a, x=41, y=5):
        for k in range(-2, 3):
            put(back, x + k, y, c, a)
            put(back, x, y + k, c, a)
        put(back, x - 1, y - 1, c, a * 0.35), put(back, x + 1, y + 1, c, a * 0.35)
        put(back, x + 1, y - 1, c, a * 0.35), put(back, x - 1, y + 1, c, a * 0.35)

    def helix(cycles, c, a, cx=5, y0=3, y1=37):
        for y in range(y0, y1):
            t = TAU * (y / 13 + p * cycles)
            xa, xb = cx + 3.4 * math.sin(t), cx - 3.4 * math.sin(t)
            za = 0.55 + 0.45 * math.cos(t)
            if y % 3 == 0:
                line(back, xa, y, xb, y, c, a * 0.28)
            put(back, xa, y, c, a * (0.35 + 0.65 * za))
            put(back, xb, y, c, a * (0.35 + 0.65 * (1 - za)))

    if state == "rest":
        breathe(img, 38, wave(p) > 0.5)
        blink(d, img, lids, blink_amount(i, (22, 26)))
        k = beat(2)
        trace(2, GREEN, 0.95)
        cross(GREEN, 0.35 + 0.65 * k)
        for x, y in eyes:
            glow(img, x, y, 3, GREEN, 0.2 + 0.7 * k)
    elif state == "working":
        k = beat(3, 2)
        trace(3, HI, 1.0, sweeps=2)
        helix(2, HI, 0.95)
        helix(2, GREEN, 0.7, cx=43, y0=12, y1=34)
        cross(HI, 0.5 + 0.5 * k)
        for x, y in eyes:
            glow(img, x, y, 3.2, HI, 0.4 + 0.6 * k)
        # A diagnostic bar reads the face from top to bottom.
        y = int((p * 2) % 1 * 36)
        row = ~d.bg[y]
        img[y, row] += HI * 0.55
        if y > 0:
            img[y - 1, ~d.bg[y - 1]] += GREEN * 0.22
    elif state == "blocked":
        alarm(d, img, i, n)
        trace(1, RED, 1.0, sweeps=1, flat=True)
        if i % 4 < 2:
            cross(RED, 1.0)
            glow(back, 41, 5, 6, RED, 0.5)
        helix(0, RED, 0.5 if i % 3 else 0.15)
        for x, y in eyes:
            glow(img, x, y, 3.5, RED, 0.9)
    else:  # done: a strong steady rhythm, and small crosses rise like bubbles
        recolor(img, d.green, CYAN)
        k = beat(2)
        trace(2, CYAN, 1.0)
        cross(CYAN, 0.7 + 0.3 * k)
        helix(1, CYAN, 0.6)
        for j in range(4):
            u = (p + j / 4) % 1
            x, y = 40 + (j % 2) * 4, 34 - u * 22
            a = 0.8 * math.sin(u * math.pi)
            put(back, x, y, CYAN, a), put(back, x - 1, y, CYAN, a * 0.5), put(back, x + 1, y, CYAN, a * 0.5)
            put(back, x, y - 1, CYAN, a * 0.5), put(back, x, y + 1, CYAN, a * 0.5)
        for x, y in eyes:
            glow(img, x, y, 3, CYAN, 0.35 + 0.6 * k)
    return d.compose(img, back)


# =====================================================================================
# NAVIGATOR: flies. Stars drift behind it at rest and stretch into warp streaks at work,
# with an orbit ring circling the head; lost, its compass spins.
# =====================================================================================

def navigator(d, state, i, n):
    p = i / n
    img, back = d.frame()
    ex, ey = 25, 19
    throat = d.green & (np.arange(W)[:, None] > 28)
    eye = d.green & ~throat
    cx, cy = 24, 20

    def stars(c, a, drift=1, jitter=0.0):
        for k in range(34):
            layer = 1 + k % 2
            x = (rnd(k) * 48 + p * 48 * drift * layer) % 48
            y = rnd(k + 50) * 44 + (rnd(k + i * 13) - 0.5) * jitter
            tw = 0.35 + 0.65 * wave(p, 1 + k % 3, rnd(k + 9))
            put(back, x, y, c if k % 5 else WHITE, a * tw * (0.5 + 0.5 * (layer - 1)))

    def warp(c, a, cycles):
        for k in range(30):
            ang = rnd(k + 3) * TAU
            u = (rnd(k + 20) + p * cycles) % 1
            r0, r1 = 5 + u * u * 34, 5 + u * u * 34 + 2 + u * 9
            line(back, cx + math.cos(ang) * r0, cy + math.sin(ang) * r0, cx + math.cos(ang) * r1, cy + math.sin(ang) * r1, c if k % 4 else WHITE, a * (0.25 + 0.75 * u))

    def orbit(c, a, cycles, tilt=0.32, r=23):
        # The far half goes behind the head, the near half in front of it.
        ring(back, cx, cy + 2, r, c, a * 0.45, a0=math.pi, a1=TAU, squash=tilt)
        ring(img, cx, cy + 2, r, c, a * 0.5, a0=0, a1=math.pi, squash=tilt)
        t = TAU * p * cycles
        bx, by = cx + math.cos(t) * r, cy + 2 + math.sin(t) * r * tilt
        L = img if math.sin(t) > 0 else back
        glow(L, bx, by, 2.6, c, 1.0)
        put(L, bx, by, WHITE, 1.0)

    def iris(c, a, slit):
        glow(img, ex, ey, 4, c, a)
        if slit:  # the pupil narrows to a vertical slit
            for y in range(17, 22):
                mix(img, ex - 1, y, np.zeros(3), 0.8 * slit)
                mix(img, ex + 1, y, np.zeros(3), 0.8 * slit)

    if state == "rest":
        breathe(img, 39, wave(p) > 0.5)
        stars(GREEN, 0.8)
        iris(GREEN, 0.3 + 0.4 * wave(p, 2), bump(p, 0.6, 0.08))
        lights(img, throat, 0.5 + 1.0 * wave(p, 2))
        lights(img, d.red, 0.4 + 1.4 * (i % 12 < 6))
    elif state == "working":
        warp(HI, 1.0, 2)
        orbit(HI, 1.0, 2)
        iris(HI, 0.9, 0)
        ring(img, ex, ey, 4.5, HI, 0.7, a0=TAU * p * 2, a1=TAU * p * 2 + TAU * 0.6)
        lights(img, throat, 0.6 + 1.2 * (i % 4 < 2))
        lights(img, d.red, 0.4 + 1.6 * (i % 4 < 2))
    elif state == "blocked":
        alarm(d, img, i, n)
        stars(RED, 0.9, drift=0, jitter=2.5)
        # No fix: the compass needle swings wildly.
        ring(back, 7, 7, 5, RED, 0.8)
        t = TAU * (p * 3 + 0.25 * math.sin(TAU * p * 5))
        line(back, 7, 7, 7 + math.cos(t) * 4, 7 + math.sin(t) * 4, WHITE, 1.0)
        line(back, 7, 7, 7 - math.cos(t) * 3, 7 - math.sin(t) * 3, RED, 0.8)
        iris(RED, 1.0, 0.8 * (i % 2))
        if i % 8 < 4:
            text(back, 37, 3, "??", RED, 0.9)
    else:  # done: course laid in, brackets close on the destination star
        recolor(img, d.green, CYAN)
        stars(CYAN, 0.6, drift=0)
        tx, ty = 41, 8
        gap = 2 + 7 * max(0, 1 - p * 2.5)
        brackets(back, tx - gap, ty - gap, tx + gap, ty + gap, CYAN, 1.0, 2)
        glow(back, tx, ty, 4, CYAN, 0.6 + 0.4 * wave(p, 3))
        put(back, tx, ty, WHITE, 1.0)
        orbit(CYAN, 0.8, 1)
        iris(CYAN, 0.5 + 0.4 * wave(p, 2), 0)
    return d.compose(img, back)


# =====================================================================================
# SCOUT: looks. Sonar rings leave the eye implant; at work a search cone sweeps the dark
# and marks what it finds.
# =====================================================================================

def scout(d, state, i, n):
    p = i / n
    img, back = d.frame()
    ex, ey = 18.5, 18.5
    eye_r = [(26, 19, 30, 20)]
    blips = [(4, 6), (42, 10), (40, 28), (5, 30), (44, 20), (9, 14)]

    def ping(u, c, a, rmax=30):
        if 0 <= u < 1:
            r = 2 + u * rmax
            ring(back, ex, ey, r, c, a * (1 - u))
            ring(img, ex, ey, r, c, a * (1 - u) * 0.3)
            for bx, by in blips:
                near = max(0, 1 - abs(math.hypot(bx - ex, by - ey) - r) / 4)
                glow(back, bx, by, 2.2, c, near * 1.2)
                put(back, bx, by, WHITE, near)

    if state == "rest":
        breathe(img, 37, wave(p) > 0.5)
        blink(d, img, eye_r, blink_amount(i, (33,)))
        ping(p * 2.5, GREEN, 0.9)
        ping((p - 0.5) * 2.5, GREEN, 0.9)
        glow(img, ex, ey, 3.5, GREEN, 0.35 + 0.45 * wave(p, 2))
    elif state == "working":
        # The search cone swings across the dark.
        ang = math.pi + 0.95 * math.sin(TAU * p)
        yy, xx = np.mgrid[0:W, 0:W]
        dist = np.hypot(xx - ex, yy - ey)
        da = np.abs((np.arctan2(yy - ey, xx - ex) - ang + math.pi) % TAU - math.pi)
        cone = np.clip(1 - da / 0.34, 0, 1) * np.clip(1 - dist / 34, 0, 1)
        back += cone[..., None] * HI * 0.75
        img += (cone * 0.18)[..., None] * HI
        for k, (bx, by) in enumerate(blips):
            hit = cone[by, bx] > 0.12
            seen = bump(p, [0.75, 0.1, 0.3, 0.6, 0.2, 0.85][k], 0.16)
            if hit or seen > 0:
                a = 1.0 if hit else seen
                put(back, bx, by, WHITE, a)
                brackets(back, bx - 2, by - 2, bx + 2, by + 2, HI, a, 1)
        # The lens focuses: rings close in on the implant.
        for k in range(2):
            u = (p * 3 + k / 2) % 1
            ring(img, ex, ey, 7 - 5.5 * u, HI, 0.75 * u)
        glow(img, ex, ey, 3, WHITE, 0.7)
    elif state == "blocked":
        alarm(d, img, i, n)
        ping((p * 2) % 1, RED, 1.0, 22)
        glow(img, ex, ey, 4, RED, 1.0)
        if i % 8 < 5:
            text(back, 40, 3, "!", RED, 1.0)
            glow(back, 41, 5, 6, RED, 0.4)
        if i % 4 < 2:
            brackets(img, ex - 5, ey - 5, ex + 5, ey + 5, RED, 0.9, 2)
    else:  # done: one wide ring, and everything found stays marked
        recolor(img, d.green, CYAN)
        ping(p * 1.6, CYAN, 1.0, 40)
        for k, (bx, by) in enumerate(blips):
            if p * 1.6 * 40 + 2 > math.hypot(bx - ex, by - ey):
                put(back, bx, by, CYAN, 0.6 + 0.4 * wave(p, 2, k / 6))
                put(back, bx - 1, by, CYAN, 0.3), put(back, bx + 1, by, CYAN, 0.3)
        glow(img, ex, ey, 3.5, CYAN, 0.5 + 0.4 * wave(p, 2))
    return d.compose(img, back)


# =====================================================================================
# SENTINEL: guards. A hex shield hangs behind him and power runs round his cables; at
# work the shield takes hits, and when blocked it breaks.
# =====================================================================================

def hexes():
    size = 3.4
    ids = np.zeros((W, W, 2), int)
    for y in range(W):
        for x in range(W):
            q = (math.sqrt(3) / 3 * x - 1 / 3 * y) / size
            r = (2 / 3 * y) / size
            cx_, cz = q, r
            cy_ = -cx_ - cz
            rx, ry, rz = round(cx_), round(cy_), round(cz)
            dx, dy, dz = abs(rx - cx_), abs(ry - cy_), abs(rz - cz)
            if dx > dy and dx > dz:
                rx = -ry - rz
            elif dy <= dz:
                rz = -rx - ry
            ids[y, x] = (rx, rz)
    cell = ids[..., 0] * 100 + ids[..., 1]
    edge = np.zeros((W, W), bool)
    edge[:, :-1] |= cell[:, :-1] != cell[:, 1:]
    edge[:-1, :] |= cell[:-1, :] != cell[1:, :]
    return cell, edge


HEX_CELL, HEX_EDGE = hexes()


def sentinel(d, state, i, n):
    p = i / n
    img, back = d.frame()
    ex, ey = 28, 18.5
    eye_l = [(17, 19, 21, 20)]
    yy, xx = np.mgrid[0:W, 0:W]
    rim_ang = np.arctan2(yy - 22, xx - 24)

    def shield(c, a, level):
        """`level`: per-pixel brightness of the grid lines."""
        back[HEX_EDGE] += (c[None, :] * (level[HEX_EDGE] * a)[:, None])

    def cables(c, a, cycles, width=0.5, count=2):
        for k in range(count):
            at = TAU * (p * cycles + k / count)
            near = np.clip(1 - np.abs((rim_ang - at + math.pi) % TAU - math.pi) / width, 0, 1)
            img[d.rim] += c[None, :] * (near[d.rim] * a)[:, None]

    def eye(c, a):
        glow(img, ex, ey, 3.5, c, a)

    if state == "rest":
        breathe(img, 39, wave(p) > 0.5)
        blink(d, img, eye_l, blink_amount(i, (15,)))
        sweep = np.clip(1 - np.abs((xx + yy) / 96 - (p * 1.6 - 0.3)) / 0.16, 0, 1)
        shield(GREEN, 0.75, 0.12 + sweep)
        cables(GREEN, 0.9, 1)
        eye(RED, 0.3 + 0.6 * wave(p, 2))
    elif state == "working":
        # Impacts land on the shield; each one sends a ripple through the cells.
        level = np.full((W, W), 0.28)
        for k, (hx, hy) in enumerate([(6, 8), (42, 12), (40, 34), (4, 30)]):
            u = (p * 2 + k / 4) % 1
            dist = np.hypot(xx - hx, yy - hy)
            level += np.clip(1 - np.abs(dist - u * 26) / 3.5, 0, 1) * (1 - u) * 1.3
            if u < 0.18:
                glow(back, hx, hy, 4.5, WHITE, 1.2 * (1 - u / 0.18))
        shield(HI, 0.9, level)
        cables(HI, 1.0, 3, 0.4, 3)
        eye(RED, 1.0)
        # The eye tracks: a short red beam swings with it.
        t = math.pi * 0.05 + 0.6 * math.sin(TAU * p)
        line(img, ex, ey, ex + math.cos(t) * 26, ey + math.sin(t) * 26, RED, 0.95, fade=0.7)
        brackets(img, 9, 5, 39, 36, HI, 0.25 + 0.5 * wave(p, 4), 3)
    elif state == "blocked":
        alarm(d, img, i, n)
        # Breach: cells fall dark at random and cracks run across the grid.
        dead = np.vectorize(lambda c: rnd(c * 0.37 + i // 2 * 5.1) < 0.45)(HEX_CELL)
        shield(RED, 1.0, np.where(dead, 0.05, 0.9) * (0.6 + 0.4 * (i % 2)))
        for k in range(2):
            x, y = 3 + k * 38, 4
            for s in range(9):
                nx, ny = x + (rnd(k * 9 + s + i // 4 * 3) - 0.5) * 5, y + 3
                line(back, x, y, nx, ny, WHITE, 0.8)
                x, y = nx, ny
        lamp(img, 44, 3, i % 4 < 2)
        eye(RED, 1.0)
        cables(RED, 1.0, 2, 0.9)
    else:  # done: the shield flashes whole, then holds as a calm lattice
        flash = max(0, 1 - p * 3)
        ripple = np.clip(1 - np.abs(np.hypot(xx - 24, yy - 22) - p * 2.2 * 34) / 4, 0, 1)
        shield(CYAN, 1.0, 0.3 + flash + ripple)
        cables(CYAN, 0.9, 1, 0.8)
        eye(CYAN, 0.4 + 0.5 * wave(p, 2))
        recolor(img, d.red, CYAN, 0.8)
    return d.compose(img, back)


# =====================================================================================
# TACTICAL: aims. A reticle hunts in the dark beside him; at work the red eye's laser
# tracks a moving target; done, the target is locked and gone.
# =====================================================================================

def tactical(d, state, i, n):
    p = i / n
    img, back = d.frame()
    ex, ey = 18, 17
    eye_r = [(26, 18, 30, 19)]
    chest = d.green | ((np.arange(W)[:, None] > 34) & (d.base[..., 1] > d.base[..., 0] * 1.25) & (d.base[..., 1] > 0.2))

    def reticle(L, x, y, r, c, a, spin=0.0):
        ring(L, x, y, r, c, a, a0=spin, a1=spin + TAU, dash=4)
        for k in range(4):
            t = spin + k * TAU / 4
            line(L, x + math.cos(t) * (r + 1), y + math.sin(t) * (r + 1), x + math.cos(t) * (r + 3), y + math.sin(t) * (r + 3), c, a)
        put(L, x, y, c, a)

    def target(u):
        """A figure-of-eight path in the dark to the right of the head."""
        return 40 + 4.5 * math.sin(TAU * u), 14 + 9 * math.sin(TAU * u * 2) * 0.8

    def flare(c, a):
        glow(img, ex, ey, 4, c, a)
        for k in range(1, 5):
            for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
                put(img, ex + dx, ey + dy, c, a * 0.5 * (1 - k / 5))

    def ticks(c, a):
        for k in range(6):
            put(back, 1, 4 + k * 5, c, a), put(back, 2, 4 + k * 5, c, a * (k % 2))

    if state == "rest":
        breathe(img, 37, wave(p) > 0.5)
        blink(d, img, eye_r, blink_amount(i, (36,)))
        flare(RED, 0.25 + 0.6 * wave(p, 2))
        tx, ty = target(p)
        reticle(back, tx, ty, 3, GREEN, 0.7)
        ticks(GREEN, 0.5)
        put(back, 1, 4 + (p * 30) % 30, HI, 0.9)
        lights(img, chest, 0.5 + 1.0 * wave(p, 3))
    elif state == "working":
        tx, ty = target(p)
        lx, ly = target(p - 0.06)  # the laser trails the target, then catches it
        line(img, ex, ey, lx, ly, RED, 1.0)
        line(back, ex, ey, lx, ly, RED, 1.0)
        line(img, ex, ey + 1, lx, ly + 1, RED, 0.3)
        glow(back, lx, ly, 3.5, RED, 0.9)
        put(back, lx, ly, WHITE, 1.0)
        for k in range(5):  # sparks where the beam lands
            u = (p * 4 + rnd(k)) % 1
            put(back, lx + (rnd(k + 3) - 0.5) * 10 * u, ly + (rnd(k + 7) - 0.3) * 9 * u, AMBER, 1 - u)
        reticle(back, tx, ty, 4, HI, 0.95, spin=TAU * p)
        flare(RED, 1.0)
        ticks(HI, 0.7)
        text(back, 4, 3, str(int(9 - p * 10) % 10), HI, 0.8)
        lights(img, chest, 0.5 + 1.3 * (i % 4 < 2))
    elif state == "blocked":
        alarm(d, img, i, n)
        glitch(img, i, 2, 3)
        # Target lost: the reticle spins on an empty point, a warning triangle blinks.
        reticle(back, 40, 22, 4, RED, 0.9, spin=TAU * p * 3)
        if i % 4 < 2:
            for k in range(6):
                line(back, 40 - k, 4 + k, 40 + k, 4 + k, RED, 1.0 if k in (0, 5) else 0.0)
                put(back, 40 - k, 4 + k, RED, 1.0), put(back, 40 + k, 4 + k, RED, 1.0)
            line(back, 40, 6, 40, 7, WHITE, 1.0)
        flare(RED, 0.6 + 0.4 * (i % 2))
    else:  # done: brackets close on the target, it flashes out, the eye stands down
        recolor(img, d.green, CYAN)
        tx, ty = 40, 14
        gap = 2 + 8 * max(0, 1 - p * 3)
        brackets(back, tx - gap, ty - gap, tx + gap, ty + gap, CYAN, 1.0 if p < 0.4 else max(0.0, 1 - (p - 0.4) * 5), 2)
        if p < 0.4:
            put(back, tx, ty, WHITE, 1.0)
            glow(back, tx, ty, 2.5, RED, 0.8)
        else:
            u = min(1, (p - 0.4) * 3)
            ring(back, tx, ty, 1 + u * 7, CYAN, 1 - u)
            check(back, tx - 4, ty - 2, CYAN, 0.9, upto=u)
        flare(CYAN, 0.35 + 0.5 * wave(p, 2))
        recolor(img, d.red, CYAN, 0.85)
        lights(img, chest, 0.7 + 0.8 * wave(p, 2))
    return d.compose(img, back)


ROLES = {"analyst": analyst, "engineer": engineer, "infiltrator": infiltrator, "medical": medical,
         "navigator": navigator, "scout": scout, "sentinel": sentinel, "tactical": tactical}


def render(role, state):
    d = Drone(role)
    n = FRAMES[state]
    return [ROLES[role](d, state, i, n) for i in range(n)]


def save(frame, path):
    Image.fromarray((frame * 255).round().astype("uint8")).resize((96, 96), Image.NEAREST).save(path, optimize=True)


def main():
    sheet = sys.argv[sys.argv.index("--sheet") + 1] if "--sheet" in sys.argv else None
    only = [a for a in sys.argv[1:] if a in ROLES] or list(ROLES)
    for role in only:
        rows = []
        for state, n in FRAMES.items():
            frames = render(role, state)
            folder = f"{OUT}/{role}/{state}"
            shutil.rmtree(folder, ignore_errors=True)
            os.makedirs(folder)
            for i, f in enumerate(frames):
                save(f, f"{folder}/{i:02d}.png")
            if sheet:
                rows.append(np.concatenate([frames[int(k * n / 12)] for k in range(12)], 1))
        if sheet:
            os.makedirs(sheet, exist_ok=True)
            im = Image.fromarray((np.concatenate(rows, 0) * 255).round().astype("uint8"))
            im.resize((im.width * 4, im.height * 4), Image.NEAREST).save(f"{sheet}/{role}.png")
        print(role, "ok")


if __name__ == "__main__":
    main()
