"""Compose preview frames from rendered layers (uses the same stacking order as the contract)."""
import os, sys, pickle
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
SKIN = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import render as R

S = int(os.environ.get("S", "1"))
cache_file = os.path.join(HERE, ".cache", f"keep_s{S}.pkl")
keep = {k: Image.frombytes(m, sz, b) for k, (m, sz, b) in pickle.load(open(cache_file, "rb")).items()}
BG = (236, 233, 228, 255)
W, H = R.W * S, R.H * S

sample_path = os.environ.get("SAMPLE", os.path.join(HERE, "sample.jpg"))
cat_path = os.environ.get("SAMPLE_CAT", os.path.join(HERE, "sample_cat.jpg"))
sample = Image.open(sample_path).convert("RGBA") if os.path.exists(sample_path) else None
cat = Image.open(cat_path).convert("RGBA") if os.path.exists(cat_path) else None

def film_card(develop=1.0, img=None):
    paper = keep["film/film-paper"].copy()
    if img is not None and develop > 0:
        w = R.WIN
        ph = img.resize((w["w"] * S, w["h"] * S), Image.LANCZOS)
        und = Image.new("RGBA", ph.size, (214, 217, 214, 255))
        ph = Image.blend(und, ph, develop)
        paper.alpha_composite(ph, (w["x"] * S, w["y"] * S))
        # keep paper hairline: re-apply nothing; fine for preview
    paper.alpha_composite(keep["film/film-gloss"])
    return paper

def camera(variant, flash=False, pressed=False, photo_y=None, develop=1.0, img=None, preview=None):
    im = Image.new("RGBA", (W, H), BG)
    im.alpha_composite(keep["shared/body-shadow"])
    im.alpha_composite(keep["shared/body-shell"])
    im.alpha_composite(keep["shared/slot-cavity"])
    if photo_y is not None:
        card = film_card(develop, img)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sh = keep["film/film-shadow"]
        x = int(195 * S); y = int(photo_y * S)
        layer.alpha_composite(sh, (x - R.FPAD * S, y - R.FPAD * S)) if y - R.FPAD * S >= 0 else layer.paste(sh, (x - R.FPAD * S, y - R.FPAD * S), sh)
        layer.alpha_composite(card, (x, y)) if y >= 0 else layer.paste(card, (x, y), card)
        # engine clip: nothing above slotLine
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).rectangle([0, int(R.SLOT_LINE * S), W, H], fill=255)
        clipped = Image.new("RGBA", (W, H), (0, 0, 0, 0)); clipped.paste(layer, (0, 0), mask)
        im.alpha_composite(clipped)
    im.alpha_composite(keep["shared/slot-lip"])
    v = "instant-photo" if variant == "photo" else "instant-camera"
    im.alpha_composite(keep[f"{v}/front-panel"])
    if variant == "camera":
        if preview is not None:
            s = R.SCREEN
            pv = preview.resize((s["w"] * S + 4 * S, s["h"] * S + 4 * S), Image.LANCZOS)
            m = Image.new("L", pv.size, 0)
            ImageDraw.Draw(m).rounded_rectangle([0, 0, pv.size[0] - 1, pv.size[1] - 1], radius=(s["r"] + 2) * S, fill=255)
            im.paste(pv, ((s["x"] - 2) * S, (s["y"] - 2) * S), m)
        else:
            im.alpha_composite(keep["instant-camera/screen-off"])
        im.alpha_composite(keep["instant-camera/screen-glass"])
        im.alpha_composite(keep["instant-camera/screen-frame"])
    else:
        im.alpha_composite(keep["instant-photo/lens"])
        im.alpha_composite(keep["instant-photo/lens-glint"])
    im.alpha_composite(keep["shared/flash-housing"])
    im.alpha_composite(keep["shared/flash-lamp-on" if flash else "shared/flash-lamp-off"])
    im.alpha_composite(keep["shared/shutter-pressed" if pressed else "shared/shutter-normal"])
    if flash:
        im.alpha_composite(keep["shared/flash-glow"])
    return im

if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, ".cache"), exist_ok=True)
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, ".cache", "preview.jpg")
    a = camera("photo")
    b = camera("camera", preview=cat)
    c = camera("photo", photo_y=R.SLOT_LINE + 4, develop=1.0, img=sample)
    d = camera("camera", flash=True, pressed=True, photo_y=R.SLOT_LINE - 150, develop=0.0, img=sample)
    sheet = Image.new("RGBA", (W * 4, H), BG)
    for i, f in enumerate([a, b, c, d]):
        sheet.alpha_composite(f, (W * i, 0))
    sheet.convert("RGB").save(out)
    print(out)
