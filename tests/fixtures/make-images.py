"""Generate the CC0 synthetic test images used by the e2e suite (all made from scratch)."""
from pathlib import Path
from PIL import Image, ImageDraw
import random

OUT = Path(__file__).parent / "images"
OUT.mkdir(exist_ok=True)
random.seed(7)

for name, c in [("red", (215, 65, 88)), ("green", (46, 164, 121)), ("blue", (54, 103, 220))]:
    im = Image.new("RGB", (600, 600), c)
    ImageDraw.Draw(im).ellipse((145, 145, 465, 465), fill=tuple(min(255, x + 25) for x in c))
    im.save(OUT / f"{name}.png")

def art(w, h, base, accent, name, **kw):
    im = Image.new("RGB", (w, h), base)
    d = ImageDraw.Draw(im)
    s = min(w, h)
    for _ in range(14):
        r = random.randint(s // 14, s // 4); x = random.randint(0, w); y = random.randint(0, h)
        d.ellipse((x - r, y - r, x + r, y + r), fill=tuple(min(255, max(0, a + random.randint(-40, 40))) for a in accent))
    im.save(OUT / name, **kw)
    return im

art(1200, 1200, (70, 110, 190), (240, 190, 80), "square.png")
art(2400, 800, (30, 140, 120), (250, 240, 200), "wide.jpg", quality=90)
# tall: top quarter is a distinct yellow band so we can tell if the top is reachable
im = Image.new("RGB", (600, 1800), (180, 60, 90)); d = ImageDraw.Draw(im)
d.rectangle((0, 0, 600, 300), fill=(250, 220, 40)); d.rectangle((0, 1500, 600, 1800), fill=(40, 60, 200))
im.save(OUT / "tall.png")
im = Image.new("RGBA", (800, 800), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.ellipse((200, 100, 600, 500), fill=(255, 170, 200, 255)); d.rectangle((260, 450, 540, 780), fill=(120, 180, 255, 255))
im.save(OUT / "transparent.png")
im = Image.new("RGB", (1000, 1000), (128, 128, 130)); d = ImageDraw.Draw(im)
for _ in range(40):
    v = random.randint(90, 170); x = random.randint(0, 1000); y = random.randint(0, 1000)
    d.ellipse((x - 60, y - 60, x + 60, y + 60), fill=(v, v, v + 3))
d.rectangle((900, 900, 960, 960), fill=(230, 20, 30))
im.save(OUT / "grey-red-logo.png")
Image.new("RGB", (64, 64), (120, 70, 200)).save(OUT / "tiny.png")
art(1000, 1000, (200, 90, 40), (60, 200, 240), "photo.webp", quality=90)
art(5200, 5200, (20, 60, 110), (255, 120, 60), "huge.jpg", quality=85)
(OUT / "broken.png").write_bytes(b"not really a png")
print("ok", sorted(p.name for p in OUT.iterdir()))
