"""Draws the launcher icon and the TV banner (run once; PNGs are committed)."""
import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
BG, ACC, WHITE = (16, 20, 24), (79, 195, 247), (255, 255, 255)

def tv(d, x, y, w, h):
    r = h // 8
    d.rounded_rectangle([x, y, x + w, y + h], radius=r, outline=ACC, width=max(4, h // 14))
    d.line([x + w * 0.35, y + h + h * 0.12, x + w * 0.65, y + h + h * 0.12], fill=ACC, width=max(4, h // 14))
    cx, cy, a = x + w / 2, y + h / 2, h * 0.24  # down arrow = "drop"
    d.line([cx, cy - a, cx, cy + a * 0.6], fill=WHITE, width=max(4, h // 12))
    d.polygon([(cx - a * 0.7, cy + a * 0.05), (cx + a * 0.7, cy + a * 0.05), (cx, cy + a * 0.95)], fill=WHITE)

icon = Image.new("RGBA", (192, 192), BG + (255,))
d = ImageDraw.Draw(icon)
tv(d, 30, 40, 132, 96)
icon.save(f"{out}/icon.png")

banner = Image.new("RGBA", (640, 360), BG + (255,))
d = ImageDraw.Draw(banner)
tv(d, 56, 104, 180, 130)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 76)
except OSError:
    font = ImageFont.load_default()
d.text((272, 132), "TV Drop", fill=WHITE, font=font)
banner.save(f"{out}/banner.png")
