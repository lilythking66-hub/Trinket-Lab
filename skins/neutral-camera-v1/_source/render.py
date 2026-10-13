"""Neutral Camera V1 skin renderer.

Height-field + lighting renderer: every part is described by a signed-distance
shape, turned into a height map with a rounded bevel, then lit by one shared key
light (upper-left, front). All camera layers share one artboard.
"""
import json, os, sys
import numpy as np
from scipy.ndimage import gaussian_filter
from PIL import Image

S = int(os.environ.get("S", "3"))          # working scale (render scale)
W, H = 640, 860                             # artboard @1x
FW, FH = 250, 282                           # film card @1x
FPAD = 28                                   # film shadow padding @1x

LIGHT = np.array([-0.48, -0.78, 1.0], np.float32); LIGHT /= np.linalg.norm(LIGHT)
HALF = LIGHT + np.array([0, 0, 1], np.float32); HALF /= np.linalg.norm(HALF)
RNG = np.random.default_rng(7)
BOUNCE = np.array([0.1, 1.0, 0.25], np.float32); BOUNCE /= np.linalg.norm(BOUNCE)
FILL = np.array([1.0, -0.2, 0.4], np.float32); FILL /= np.linalg.norm(FILL)

def grid(w, h):
    yy, xx = np.mgrid[0:h * S, 0:w * S].astype(np.float32)
    return (xx + 0.5) / S, (yy + 0.5) / S

X, Y = grid(W, H)

# ---------------------------------------------------------------- shapes (1x units)
def sd_rrect(cx, cy, hw, hh, r, X=None, Y=None):
    X = globals()["X"] if X is None else X; Y = globals()["Y"] if Y is None else Y
    qx = np.abs(X - cx) - (hw - r); qy = np.abs(Y - cy) - (hh - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r

def sd_circle(cx, cy, r, X=None, Y=None):
    X = globals()["X"] if X is None else X; Y = globals()["Y"] if Y is None else Y
    return np.hypot(X - cx, Y - cy) - r

def cov(d):  # anti-aliased coverage
    return np.clip(0.5 - d * S, 0, 1).astype(np.float32)

def bevel(d, b, height=None):
    """Rounded edge: 0 at the silhouette, `height` (default b) on the flat."""
    height = b if height is None else height
    t = np.clip(-d / b, 0, 1)
    return (height * np.sin(t * np.pi / 2)).astype(np.float32)

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# ---------------------------------------------------------------- lighting
def shade(Hm, base, kd=0.95, ks=0.35, p=28, gloss_flat=0.0):
    """Light a height map. `base` is HxWx3 (0-255) or an rgb tuple."""
    gy, gx = np.gradient(Hm * S)
    n = np.stack([-gx, -gy, np.ones_like(Hm)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    ndl = n @ LIGHT; ndh = np.clip(n @ HALF, 0, 1)
    wrap = lambda v: (v + 0.55) / 1.55
    f = 1 + kd * (wrap(ndl) - wrap(LIGHT[2]))
    # warm bounce from the surface below + sky fill from above-right
    f = f + 0.22 * np.clip(n @ BOUNCE, 0, 1) + 0.08 * np.clip(n @ FILL, 0, 1)
    spec = ks * (ndh ** p - HALF[2] ** p * (1 - gloss_flat))
    base = np.asarray(base, np.float32)
    rgb = base * f[..., None] + np.clip(spec, -0.2, 1)[..., None] * 255
    return rgb

def grain(rgb, amt=1.1):
    return rgb + RNG.normal(0, amt, rgb.shape[:2]).astype(np.float32)[..., None]

def mix(a, b, t):
    a = np.asarray(a, np.float32); b = np.asarray(b, np.float32)
    return a + (b - a) * t[..., None]

# ---------------------------------------------------------------- layers
def layer(rgb, a):
    return [np.clip(rgb, 0, 255).astype(np.float32), np.clip(a, 0, 1).astype(np.float32)]

def over(dst, src):
    (dr, da), (sr, sa) = dst, src
    oa = sa + da * (1 - sa)
    orgb = (sr * sa[..., None] + dr * (da * (1 - sa))[..., None]) / np.maximum(oa, 1e-6)[..., None]
    return [orgb, oa]

def stack(*ls):
    out = ls[0]
    for l in ls[1:]:
        out = over(out, l)
    return out

def shadow(mask, dx, dy, blur, alpha, color=(58, 46, 36)):
    m = np.roll(np.roll(mask, int(round(dy * S)), 0), int(round(dx * S)), 1)
    m = gaussian_filter(m, blur * S) * alpha
    rgb = np.empty(mask.shape + (3,), np.float32); rgb[:] = color
    return layer(rgb, m)

def solid(color, shape):
    rgb = np.empty(shape + (3,), np.float32); rgb[:] = color; return rgb

# ---------------------------------------------------------------- palette
CREAM = (236, 231, 222)
CREAM_PANEL = (240, 235, 227)
CREAM_BASE = (240, 236, 228)
CHAR = (66, 66, 68)
CHAR_D = (40, 40, 42)
ACCENT = (226, 148, 126)

# ---------------------------------------------------------------- geometry (1x)
BODY = dict(cx=320, cy=290, hw=210, hh=190, r=80)        # x110..530, y100..480
GROOVE_Y = 394
SLOT = dict(cx=320, cy=436, hw=135, hh=7.5, r=6)          # x185..455, y428.5..443.5
SLOT_LINE = 432
PANEL = dict(cx=320, cy=252, hw=190, hh=130, r=62)        # x130..510, y122..382
FLASH = dict(cx=194, cy=174, hw=34, hh=23, r=12)
FLASH_WIN = dict(cx=194, cy=174, hw=25, hh=15, r=8)
SHUTTER = dict(cx=460, cy=336, r=26)
LENS = dict(cx=320, cy=262, r=90)
SCREEN_OUT = dict(cx=320, cy=282, hw=104, hh=78, r=22)    # frame outer x216..424 y204..360
SCREEN = dict(x=228, y=216, w=184, h=132, r=12)           # live preview slot
SCREEN_IN = dict(cx=320, cy=282, hw=90, hh=64, r=10)      # frame opening (overlaps preview by 2px)
TOP_BTNS = [(244, 104), (396, 104)]

def body_mask():
    return cov(sd_rrect(**BODY))

# ---------------------------------------------------------------- shared
def body_height(with_slot):
    d = sd_rrect(**BODY)
    Hm = bevel(d, 38)
    # base block protrudes slightly below the groove
    inside = smooth(0, 1, -d)
    Hm = Hm + 2.2 * smooth(GROOVE_Y - 2.5, GROOVE_Y + 1.5, Y) * inside
    Hm = Hm - 1.6 * np.exp(-((Y - (GROOVE_Y - 1.5)) / 1.4) ** 2) * smooth(0, 30, -d)
    if with_slot:
        ds = sd_rrect(**SLOT)
        Hm = Hm - 9 * (1 - np.clip(1 - (-ds) / 3.5, 0, 1) ** 2) * (ds < 0)
    return Hm

def body_color(with_slot):
    t = smooth(GROOVE_Y - 1, GROOVE_Y + 1, Y)
    col = mix(CREAM, CREAM_BASE, t)
    # broad top-to-bottom falloff on the front
    f = 1.035 - 0.07 * smooth(100, 480, Y)
    col = col * f[..., None]
    if with_slot:
        ds = sd_rrect(**SLOT)
        depth = smooth(0, 3.5, -ds)
        inner = mix((24, 24, 26), (52, 50, 50), smooth(SLOT["cy"] - 6, SLOT["cy"] + 7, Y))
        col = mix(col, inner, depth)
    return col

def top_buttons():
    out = None
    for cx, cy in TOP_BTNS:
        d = sd_rrect(cx, cy, 17, 8, 8)
        Hm = bevel(d, 7)
        l = layer(shade(Hm, CHAR, kd=1.0, ks=0.45, p=40), cov(d))
        out = l if out is None else over(out, l)
    return out

def r_body_shell():
    d = sd_rrect(**BODY)
    rgb = grain(shade(body_height(False), body_color(False), kd=0.75, ks=0.20, p=18))
    body = layer(rgb, cov(d))
    return over(top_buttons(), body)

def r_body_full():
    d = sd_rrect(**BODY)
    rgb = grain(shade(body_height(True), body_color(True), kd=0.75, ks=0.20, p=18))
    return layer(rgb, cov(d))

def r_body_shadow():
    m = body_mask()
    soft = shadow(m, 4, 14, 18, 0.20)
    near = shadow(m, 2, 5, 5, 0.18)
    # contact shadow along the bottom edge
    strip = cov(sd_rrect(322, 478, 190, 4, 4))
    contact = shadow(strip, 0, 4, 5, 0.22)
    return stack(soft, near, contact)

def r_slot_cavity(full):
    ds = sd_rrect(**SLOT)
    a = cov(ds - 2.0)                       # opening + its outer edge
    return layer(full[0], a * full[1])

def r_slot_lip(full):
    ds = sd_rrect(**SLOT)
    above = np.clip((SLOT_LINE - Y) * S + 0.5, 0, 1)   # hard edge exactly at slotLine
    a = cov(ds - 2.0) * above
    lip = layer(full[0], a * full[1])
    # soft shadow the lip throws downward onto the photo
    xr = smooth(SLOT["cx"] - SLOT["hw"] - 2, SLOT["cx"] - SLOT["hw"] + 10, X) * \
         smooth(-(SLOT["cx"] + SLOT["hw"] + 2), -(SLOT["cx"] + SLOT["hw"] - 10), -X)
    yr = (Y >= SLOT_LINE) * np.exp(-np.maximum(Y - SLOT_LINE, 0) / 4.5)
    sh = layer(solid((30, 26, 22), Y.shape), 0.55 * xr * yr)
    return over(lip, sh)

def r_flash_housing():
    d = sd_rrect(**FLASH); dw = sd_rrect(**FLASH_WIN)
    Hm = bevel(d, 7, 5) - 4 * smooth(0, 3, -dw)
    col = solid(CREAM_PANEL, Y.shape) * 1.01
    rgb = grain(shade(Hm, col, kd=1.1, ks=0.3, p=26))
    body = layer(rgb, cov(d))
    sh = shadow(cov(d), 1.5, 3, 3, 0.25)
    return over(sh, body)

def fresnel_lamp(on):
    d = sd_rrect(**FLASH_WIN)
    ridges = 0.35 * np.sin((Y - FLASH_WIN["cy"]) * 2 * np.pi / 3.2)
    Hm = bevel(d, 3, 1.5) + ridges * smooth(0, 3, -d)
    r = np.hypot((X - FLASH_WIN["cx"]) / FLASH_WIN["hw"], (Y - FLASH_WIN["cy"]) / FLASH_WIN["hh"])
    if on:
        col = mix((255, 253, 244), (255, 226, 160), smooth(0.1, 1.1, r))
        rgb = shade(Hm, col, kd=0.25, ks=0.25, p=20)
    else:
        col = mix((246, 241, 228), (214, 206, 188), smooth(0.2, 1.2, r))
        col = mix(col, (200, 192, 176), smooth(FLASH_WIN["cy"] - 15, FLASH_WIN["cy"] - 9, -Y + 2 * FLASH_WIN["cy"] - 30) * 0)
        rgb = shade(Hm, col, kd=0.9, ks=0.35, p=30)
        # recess shade at the top of the window
        top = np.exp(-np.maximum(Y - (FLASH_WIN["cy"] - FLASH_WIN["hh"]), 0) / 4)
        rgb = rgb * (1 - 0.18 * top)[..., None]
    return layer(grain(rgb, 0.8), cov(d))

def r_flash_glow():
    dx = (X - FLASH["cx"]) / 1.25; dy = Y - FLASH["cy"]
    r = np.hypot(dx, dy)
    a = 0.80 * np.exp(-(r / 26) ** 2) + 0.38 * np.exp(-(r / 60) ** 2) + 0.14 * np.exp(-(r / 130) ** 2)
    return layer(solid((255, 244, 210), Y.shape), np.clip(a, 0, 1))

def shutter(pressed):
    c = SHUTTER
    r = c["r"] - (0.6 if pressed else 0)
    d = sd_circle(c["cx"], c["cy"], r)
    hgt = 3.0 if pressed else 7.5
    Hm = bevel(d, 10, hgt)
    base = ACCENT if not pressed else tuple(v * 0.93 for v in ACCENT)
    rr = np.hypot(X - c["cx"], Y - c["cy"]) / r
    col = mix(base, tuple(v * 0.9 for v in base), smooth(0.3, 1.0, rr))
    rgb = grain(shade(Hm, col, kd=1.0, ks=0.5 if not pressed else 0.35, p=34))
    btn = layer(rgb, cov(d))
    sh = shadow(cov(d), 1, 1.5, 1.6, 0.30) if pressed else \
        stack(shadow(cov(d), 2.5, 5, 5, 0.28), shadow(cov(d), 1, 2, 1.5, 0.22))
    return over(sh, btn)

# ---------------------------------------------------------------- panels
def panel(variant):
    d = sd_rrect(**PANEL)
    Hm = bevel(d, 12, 6)
    col = solid(CREAM_PANEL, Y.shape) * (1.03 - 0.06 * smooth(122, 382, Y))[..., None]
    recess = np.zeros_like(Hm)

    def pocket(dd, depth, wall):
        nonlocal recess
        recess = np.maximum(recess, depth * smooth(0, wall, -dd))

    pocket(sd_rrect(FLASH["cx"], FLASH["cy"], FLASH["hw"] + 2.5, FLASH["hh"] + 2.5, FLASH["r"] + 2), 2.5, 2.5)
    pocket(sd_circle(SHUTTER["cx"], SHUTTER["cy"], SHUTTER["r"] + 5), 1.6, 2.2)
    dots = []
    if variant == "photo":
        pocket(sd_circle(LENS["cx"], LENS["cy"], LENS["r"] + 4), 4.5, 3)
        dots = [(452, 162, 6.0)]
    else:
        pocket(sd_rrect(SCREEN_OUT["cx"], SCREEN_OUT["cy"], SCREEN_OUT["hw"] + 3, SCREEN_OUT["hh"] + 3, SCREEN_OUT["r"] + 3), 4, 3)
        dots = [(438, 162, 6.5), (462, 162, 4.0)]
    Hm = Hm - recess
    # ambient occlusion inside pockets (top-left wall casts onto the floor)
    ao = gaussian_filter((recess > 0.5).astype(np.float32), 2.5 * S)
    ao = np.clip(1 - ao, 0, 1) * (recess > 0.3)
    rgb = shade(Hm, col, kd=1.0, ks=0.22, p=18)
    rgb = rgb * (1 - 0.10 * ao)[..., None]
    out = layer(grain(rgb), cov(d))
    for (cx, cy, r) in dots:
        dd = sd_circle(cx, cy, r)
        ring = layer(grain(shade(bevel(sd_circle(cx, cy, r + 2.2), 2, 1.2) - 1.5 * smooth(0, 1.5, -dd), solid(CREAM_PANEL, Y.shape), kd=1.0, ks=0.2)), cov(sd_circle(cx, cy, r + 2.2)))
        rr = np.hypot(X - cx + r * 0.3, Y - cy + r * 0.3) / r
        dcol = mix((70, 72, 78), (22, 22, 25), smooth(0, 1.2, rr))
        dot = layer(shade(bevel(dd, r * 0.8, r * 0.4), dcol, kd=0.6, ks=0.9, p=60), cov(dd))
        out = stack(out, ring, dot)
    sh = stack(shadow(cov(d), 1, 2.5, 2.5, 0.22), shadow(cov(d), 0, 0.6, 0.8, 0.18))
    return over(sh, out)

# ---------------------------------------------------------------- lens
def r_lens():
    c = LENS; cx, cy = c["cx"], c["cy"]
    rr = np.hypot(X - cx, Y - cy)
    d_ring = rr - c["r"]
    # cream outer ring
    Hm = bevel(d_ring, 14, 11)
    col = solid(CREAM_PANEL, Y.shape)
    # charcoal barrel with fine ridges
    d_bar = rr - 70
    bar = smooth(0.5, -0.5, d_bar)
    Hm = Hm + 3 * bevel(d_bar, 6, 1) + 0.25 * np.sin(rr * 2 * np.pi / 2.2) * smooth(54, 57, rr) * smooth(-69, -66, -rr)
    col = mix(col, mix(CHAR, (52, 52, 55), smooth(56, 70, rr)), bar)
    # inner black ring and glass
    d_in = rr - 54
    Hm = Hm - 3 * smooth(0, 2, -d_in)
    col = mix(col, (28, 28, 30), smooth(0.5, -0.5, d_in))
    d_gl = rr - 47
    glass_t = smooth(0.5, -0.5, d_gl)
    gx = np.hypot(X - cx + 10, Y - cy + 12) / 47
    gcol = mix((34, 42, 54), (8, 9, 12), smooth(0.0, 1.25, gx))
    # coating tint ring
    coat = np.exp(-((rr - 34) / 6) ** 2) * smooth(-0.2, 0.6, (X - cx + Y - cy) / 60)
    gcol = mix(gcol, (60, 52, 96), coat * 0.55)
    inner = np.exp(-((rr - 20) / 1.6) ** 2)
    gcol = mix(gcol, (70, 78, 92), inner * 0.5)
    col = mix(col, gcol, glass_t)
    Hm = Hm + glass_t * (6 * np.sqrt(np.clip(1 - (rr / 47) ** 2, 0, 1)) - 3)
    rgb = shade(Hm, col, kd=1.0, ks=0.4, p=30)
    lens = layer(grain(rgb, 0.9), cov(d_ring))
    sh = stack(shadow(cov(d_ring), 3, 6, 7, 0.28), shadow(cov(d_ring), 1, 2, 2, 0.22))
    return over(sh, lens)

def r_lens_glint():
    cx, cy = LENS["cx"], LENS["cy"]
    a1 = cov(sd_circle(cx, cy, 43)) * (1 - cov(sd_circle(cx + 7, cy + 9, 43)))
    a1 = gaussian_filter(a1, 1.5 * S) * 0.55
    a2 = np.exp(-((np.hypot(X - (cx - 17), Y - (cy - 19))) / 4.5) ** 2) * 0.9
    a3 = cov(sd_circle(cx, cy, 44)) * (1 - cov(sd_circle(cx - 5, cy - 6, 44)))
    a3 = gaussian_filter(a3, 1.2 * S) * 0.18
    return layer(solid((255, 255, 255), Y.shape), np.clip(a1 + a2 + a3, 0, 1))

# ---------------------------------------------------------------- screen
def screen_rect_sd(inflate=0):
    s = SCREEN
    return sd_rrect(s["x"] + s["w"] / 2, s["y"] + s["h"] / 2, s["w"] / 2 + inflate, s["h"] / 2 + inflate, s["r"] + inflate)

def r_screen_off():
    d = screen_rect_sd(2)
    s = SCREEN
    t = ((X - s["x"]) / s["w"] * 0.6 + (Y - s["y"]) / s["h"] * 0.4)
    col = mix((50, 55, 60), (22, 24, 27), smooth(0, 1, t))
    return layer(grain(col, 0.7), cov(d))

def r_screen_glass():
    d = screen_rect_sd(0)
    s = SCREEN
    u = (X - s["x"]) / s["w"]; v = (Y - s["y"]) / s["h"]
    diag = u * 0.75 + v
    band = smooth(0.05, 0.25, diag) * smooth(-0.62, -0.42, -diag)
    a = 0.13 * band + 0.10 * smooth(0.25, 0.0, v) + 0.05 * smooth(0.6, 1.0, v) * smooth(0.5, 1, u)
    return layer(solid((255, 255, 255), Y.shape), a * cov(d))

def r_screen_frame():
    d_out = sd_rrect(**SCREEN_OUT); d_in = sd_rrect(**SCREEN_IN)
    Hm = bevel(d_out, 6, 5) - 4 * smooth(-3, 0, d_in) * 0 - 3.5 * (1 - smooth(0, 3, d_in))
    col = mix((74, 75, 78), (56, 57, 60), smooth(204, 360, Y))
    rgb = grain(shade(Hm, col, kd=1.0, ks=0.4, p=36), 0.8)
    a = cov(d_out) * (1 - cov(d_in))
    fr = layer(rgb, a)
    m = cov(d_out) * (1 - cov(d_in + 3))
    sh = stack(shadow(cov(d_out), 2, 4, 4, 0.25), shadow(cov(d_out), 0.5, 1, 1, 0.2))
    sh[1] = sh[1] * (1 - cov(d_in))
    # inner shadow the bezel throws onto the screen top edge
    inner = np.clip(1 - cov(d_in), 0, 1)
    inner_sh = gaussian_filter(np.roll(inner, int(2.5 * S), 0), 2.5 * S) * cov(d_in) * 0.55
    return stack(sh, fr, layer(solid((0, 0, 0), Y.shape), inner_sh))

# ---------------------------------------------------------------- film
FX, FY = grid(FW, FH)
WIN = dict(x=14, y=14, w=222, h=222)
CAPTION = dict(x=14, y=240, w=222, h=34)

def r_film_paper():
    d = sd_rrect(FW / 2, FH / 2, FW / 2, FH / 2, 3, FX, FY)
    Hm = bevel(d, 2.0, 0.8)
    fib = gaussian_filter(RNG.normal(0, 1, FX.shape).astype(np.float32), 1.2 * S)
    fib = fib / (fib.std() + 1e-6)
    col = solid((248, 246, 241), FX.shape) + (1.6 * fib)[..., None]
    col = col * (1.0 - 0.025 * smooth(0, FH, FY))[..., None]
    wd = sd_rrect(WIN["x"] + WIN["w"] / 2, WIN["y"] + WIN["h"] / 2, WIN["w"] / 2, WIN["h"] / 2, 1, FX, FY)
    wt = cov(wd)
    und = mix((214, 217, 214), (200, 205, 206), smooth(0, 1, (FY - WIN["y"]) / WIN["h"]))
    col = mix(col, und, wt)
    Hm = Hm - 0.6 * smooth(0, 1.2, -wd)
    # paper casts a hairline shadow onto the window edge
    edge = gaussian_filter(1 - wt, 0.8 * S) * wt
    gy, gx = np.gradient(Hm * S)
    n = np.stack([-gx, -gy, np.ones_like(Hm)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    f = 1 + 0.9 * (n @ LIGHT - LIGHT[2])
    rgb = col * f[..., None] * (1 - 0.35 * edge)[..., None]
    rgb = rgb + RNG.normal(0, 0.8, FX.shape).astype(np.float32)[..., None]
    return layer(rgb, cov(d))

def r_film_shadow():
    PX, PY = grid(FW + 2 * FPAD, FH + 2 * FPAD)
    d = sd_rrect(FPAD + FW / 2, FPAD + FH / 2, FW / 2, FH / 2, 3, PX, PY)
    m = cov(d)
    a = gaussian_filter(np.roll(m, int(8 * S), 0), 9 * S) * 0.24 + gaussian_filter(np.roll(m, int(2 * S), 0), 2 * S) * 0.16
    return layer(solid((58, 46, 36), m.shape), a * (1 - m * 0.0))

def r_film_gloss():
    u = FX / FW; v = FY / FH
    diag = u * 0.8 + v
    band = smooth(0.25, 0.45, diag) * smooth(-0.75, -0.55, -diag)
    wd = sd_rrect(WIN["x"] + WIN["w"] / 2, WIN["y"] + WIN["h"] / 2, WIN["w"] / 2, WIN["h"] / 2, 1, FX, FY)
    a = (0.16 * band + 0.05) * cov(wd)
    return layer(solid((255, 255, 255), FX.shape), a)

def r_develop_texture():
    n = 256 * S // 3 * 3 // S if False else 256
    g = RNG.normal(0, 1, (n, n)).astype(np.float32)
    g = gaussian_filter(g, 0.7, mode="wrap") * 0.7 + gaussian_filter(g, 3, mode="wrap") * 2.0
    g = (g - g.min()) / (g.max() - g.min())
    rgb = np.empty((n, n, 3), np.float32); rgb[:] = (226, 228, 224)
    rgb = rgb * (0.9 + 0.2 * g)[..., None]
    return layer(rgb, np.full((n, n), 0.9, np.float32))
