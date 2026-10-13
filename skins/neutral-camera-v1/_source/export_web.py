"""Export runtime (web) assets for Neutral Camera V1.

The art files are full-artboard PNGs (the skin contract). Browsers on phones
would decode every layer at full artboard size, so this script trims each layer
to its visible bounding box, converts to WebP, and writes web/manifest.json with
each layer's position in artboard @1x units plus the layout from layout.json.

Usage:  python3 export_web.py            (run from anywhere)
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SKIN = os.path.dirname(HERE)
WEB = os.path.join(SKIN, "web")
PAD = 2  # @1x px of breathing room around each trimmed layer
STAGE_H = 760  # ready photo bottom (718) + its shadow

CAMERA_LAYERS = [
    "shared/body-shadow", "shared/body-shell", "shared/slot-cavity", "shared/slot-lip",
    "shared/flash-housing", "shared/flash-lamp-off", "shared/flash-lamp-on", "shared/flash-glow",
    "shared/shutter-normal", "shared/shutter-pressed",
    "instant-photo/front-panel", "instant-photo/lens", "instant-photo/lens-glint",
    "instant-camera/front-panel", "instant-camera/screen-off", "instant-camera/screen-glass",
    "instant-camera/screen-frame",
]
FILM_LAYERS = ["film/film-paper", "film/film-shadow", "film/film-gloss"]


def save_webp(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "WEBP", quality=90, alpha_quality=100, method=6)


def main():
    layout = json.load(open(os.path.join(SKIN, "layout.json")))
    layers = {}
    for name in CAMERA_LAYERS:
        im3 = Image.open(os.path.join(SKIN, name + "@3x.png")).convert("RGBA")
        im2 = Image.open(os.path.join(SKIN, name + "@2x.png")).convert("RGBA")
        bb = im3.getchannel("A").point(lambda a: 255 if a > 1 else 0).getbbox()
        if bb is None:
            continue
        x0 = max(0, bb[0] // 3 - PAD); y0 = max(0, bb[1] // 3 - PAD)
        x1 = min(layout["artboard"]["w"], -(-bb[2] // 3) + PAD)
        y1 = min(layout["artboard"]["h"], -(-bb[3] // 3) + PAD)
        for scale, im in ((2, im2), (3, im3)):
            crop = im.crop((x0 * scale, y0 * scale, x1 * scale, y1 * scale))
            save_webp(crop, os.path.join(WEB, f"{name}@{scale}x.webp"))
        layers[name] = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}
    for name in FILM_LAYERS:
        for scale in (2, 3):
            im = Image.open(os.path.join(SKIN, f"{name}@{scale}x.png")).convert("RGBA")
            save_webp(im, os.path.join(WEB, f"{name}@{scale}x.webp"))
    tex = Image.open(os.path.join(SKIN, "film/film-develop-texture.png")).convert("RGBA")
    save_webp(tex, os.path.join(WEB, "film/film-develop-texture.webp"))

    manifest = {
        "name": "neutral-camera-v1",
        "version": 1,
        "layout": layout,
        # visible stage = artboard cropped below the hanging photo (saves empty space)
        "stage": {"w": layout["artboard"]["w"], "h": STAGE_H},
        "layers": layers,
        "files": {"pattern": "{name}@{scale}x.webp", "scales": [2, 3]},
        "film": {
            "paper": "film/film-paper", "shadow": "film/film-shadow", "gloss": "film/film-gloss",
            "developTexture": "film/film-develop-texture.webp",
        },
    }
    with open(os.path.join(WEB, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(WEB) for fn in fns)
    print(f"web assets: {total/1024:.0f} KB, {len(layers)} camera layers")


if __name__ == "__main__":
    main()
