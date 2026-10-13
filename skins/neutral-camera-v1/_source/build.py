import os, sys, json
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SKIN = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import render as R

OUT = os.environ.get("OUT", SKIN)
CACHE = os.path.join(HERE, ".cache")
S = R.S

def to_img(l):
    rgb, a = l
    arr = np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).round().astype(np.uint8)
    return Image.fromarray(arr, "RGBA")

def save(name, l, keep):
    im = to_img(l)
    keep[name] = im
    if S == 3:
        path = os.path.join(OUT, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        im.save(path + "@3x.png", optimize=True)
        im.resize((im.width * 2 // 3, im.height * 2 // 3), Image.LANCZOS).save(path + "@2x.png", optimize=True)

def build():
    keep = {}
    full = R.r_body_full()
    save("shared/body-shadow", R.r_body_shadow(), keep)
    save("shared/body-shell", R.r_body_shell(), keep)
    save("shared/slot-cavity", R.r_slot_cavity(full), keep)
    save("shared/slot-lip", R.r_slot_lip(full), keep)
    del full
    save("shared/flash-housing", R.r_flash_housing(), keep)
    save("shared/flash-lamp-off", R.fresnel_lamp(False), keep)
    save("shared/flash-lamp-on", R.fresnel_lamp(True), keep)
    save("shared/flash-glow", R.r_flash_glow(), keep)
    save("shared/shutter-normal", R.shutter(False), keep)
    save("shared/shutter-pressed", R.shutter(True), keep)
    save("instant-photo/front-panel", R.panel("photo"), keep)
    save("instant-photo/lens", R.r_lens(), keep)
    save("instant-photo/lens-glint", R.r_lens_glint(), keep)
    save("instant-camera/front-panel", R.panel("camera"), keep)
    save("instant-camera/screen-off", R.r_screen_off(), keep)
    save("instant-camera/screen-glass", R.r_screen_glass(), keep)
    save("instant-camera/screen-frame", R.r_screen_frame(), keep)
    save("film/film-paper", R.r_film_paper(), keep)
    save("film/film-shadow", R.r_film_shadow(), keep)
    save("film/film-gloss", R.r_film_gloss(), keep)
    tex = R.r_develop_texture()
    ti = to_img(tex); keep["film/film-develop-texture"] = ti
    if S == 3:
        ti.save(os.path.join(OUT, "film/film-develop-texture.png"), optimize=True)
    return keep

if __name__ == "__main__":
    keep = build()
    import pickle
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, f"keep_s{S}.pkl"), "wb") as f:
        pickle.dump({k: (v.mode, v.size, v.tobytes()) for k, v in keep.items()}, f)
    print("done", S)
