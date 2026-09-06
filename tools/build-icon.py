# Builds public/icon-512.png, icon-192.png and apple-touch-icon.png, the
# home-screen icon: a pixel globe rasterized from the game's own border data.
#
#   python tools/build-icon.py        (needs Pillow)
#
# Every country ring in public/borders/countries.json is projected
# orthographically around VIEW, filled at high resolution, then box-filtered
# down to a DIAMETER-pixel disc that sits centered in a TILE-pixel square. The
# margin keeps the globe inside the safe zone that Android's circular and
# rounded-square launcher masks leave untouched. Shading is a real sphere
# normal lit from the upper left, quantized to three steps per surface.
#
# The output PNGs are nearest-neighbor upscales of that one small tile, so the
# pixels stay crisp at every size.

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PRECISION = 1e4  # matches src/game/borders.js

VIEW = (20, 10)  # lat, lon at the centre of the disc: Europe over Africa
TILE = 40
DIAMETER = 30
SIZES = {"icon-512.png": 512, "icon-192.png": 192, "apple-touch-icon.png": 180}

BACKGROUND = (0x1E, 0x1E, 0x1E)
OCEAN = [(0x24, 0x4A, 0x70), (0x2F, 0x5F, 0x8F), (0x3D, 0x76, 0xAC)]
LAND = [(0x6F, 0xA0, 0x66), (0x8A, 0xBE, 0x7D), (0x9C, 0xCF, 0x8F)]


def decode_ring(text):
    out = []
    at = x = y = 0
    while at < len(text):
        deltas = []
        for _ in range(2):
            shift = bits = 0
            while True:
                byte = ord(text[at]) - 63
                at += 1
                bits |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            deltas.append(~(bits >> 1) if bits & 1 else bits >> 1)
        x += deltas[0]
        y += deltas[1]
        out.append((x / PRECISION, y / PRECISION))
    return out


def land_mask(lat0, lon0, size, hires=1024):
    """Orthographic land/sea mask, downsampled to size x size."""
    la0, lo0 = math.radians(lat0), math.radians(lon0)
    radius = hires / 2

    def project(lon, lat):
        la, lo = math.radians(lat), math.radians(lon)
        facing = math.sin(la0) * math.sin(la) + math.cos(la0) * math.cos(la) * math.cos(lo - lo0)
        x = math.cos(la) * math.sin(lo - lo0)
        y = math.cos(la0) * math.sin(la) - math.sin(la0) * math.cos(la) * math.cos(lo - lo0)
        return radius + x * radius, radius - y * radius, facing

    image = Image.new("L", (hires, hires), 0)
    draw = ImageDraw.Draw(image)
    countries = json.loads((ROOT / "public" / "borders" / "countries.json").read_text())
    for country in countries:
        for polygon in country["p"]:
            for index, ring in enumerate(polygon):
                points = [project(lon, lat) for lon, lat in decode_ring(ring)]
                visible = [(x, y) for x, y, facing in points if facing > 0]
                if len(visible) < 3:
                    continue
                draw.polygon(visible, fill=0 if index else 255)
    return image.resize((size, size), Image.BOX)


def build():
    land = land_mask(*VIEW, DIAMETER)
    tile = Image.new("RGB", (TILE, TILE), BACKGROUND)
    offset = (TILE - DIAMETER) / 2
    centre = (TILE - 1) / 2
    radius = DIAMETER / 2 - 0.5
    for y in range(TILE):
        for x in range(TILE):
            dx, dy = (x - centre) / radius, (y - centre) / radius
            if dx * dx + dy * dy > 1:
                continue
            nz = math.sqrt(1 - dx * dx - dy * dy)
            light = -dx * 0.45 - dy * 0.45 + nz * 0.75
            level = 2 if light > 0.62 else 1 if light > 0.22 else 0
            ground = land.getpixel((int(x - offset), int(y - offset)))
            tile.putpixel((x, y), (LAND if ground > 110 else OCEAN)[level])
    for name, size in SIZES.items():
        tile.resize((size, size), Image.NEAREST).save(ROOT / "public" / name)


if __name__ == "__main__":
    build()
