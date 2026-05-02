#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
TILES_DIR = ROOT / 'public/assets/tilesets/tiles'
ATLAS_DIR = ROOT / 'public/assets/tilesets/atlas'
TILE_SIZE = 96
TILES_PER_ROW = 8
VARIANT_COUNT = 10
VARIANT_COLS = 5


def open_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert('RGBA')


def upscale_tile(path: Path) -> Image.Image:
    img = open_rgba(path)
    if img.size == (TILE_SIZE, TILE_SIZE):
        return img
    img = img.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
    img = ImageEnhance.Sharpness(img).enhance(1.35)
    img = ImageEnhance.Contrast(img).enhance(1.08)
    return img


def save_tile_pngs() -> dict[str, Image.Image]:
    tiles: dict[str, Image.Image] = {}
    for path in sorted(TILES_DIR.glob('tile_*.png')):
        img = upscale_tile(path)
        img.save(path)
        tiles[path.stem.removeprefix('tile_')] = img
    return tiles


def write_main_atlas(tiles: dict[str, Image.Image]) -> None:
    names = sorted(tiles)
    rows = math.ceil(len(names) / TILES_PER_ROW)
    atlas = Image.new('RGBA', (TILES_PER_ROW * TILE_SIZE, rows * TILE_SIZE), (0, 0, 0, 0))
    meta: dict[str, object] = {
        'atlas_size': max(atlas.size),
        'tile_size': TILE_SIZE,
        'tiles_per_row': TILES_PER_ROW,
        'total_tiles': len(names),
        'tiles': {},
    }
    for index, name in enumerate(names):
        x = index % TILES_PER_ROW
        y = index // TILES_PER_ROW
        atlas.alpha_composite(tiles[name], (x * TILE_SIZE, y * TILE_SIZE))
        meta['tiles'][name] = {
            'atlas_coords': [x, y],
            'px_coords': [x * TILE_SIZE, y * TILE_SIZE],
            'filename': f'tile_{name}.png',
        }
    atlas.save(ATLAS_DIR / 'tiles_atlas.png')
    (ATLAS_DIR / 'tiles_atlas.json').write_text(json.dumps(meta, indent=2) + '\n')


def wrapped_crop(source: Image.Image, x: int, y: int, size: int) -> Image.Image:
    source = source.convert('RGBA')
    w, h = source.size
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for oy in range(0, size, h):
        for ox in range(0, size, w):
            out.alpha_composite(source, (ox - x, oy - y))
    return out.crop((0, 0, size, size))


def add_noise(img: Image.Image, seed: int, strength: int) -> Image.Image:
    rng = random.Random(seed)
    pixels = img.load()
    out = img.copy()
    out_pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            n = rng.randint(-strength, strength)
            out_pixels[x, y] = (
                max(0, min(255, r + n)),
                max(0, min(255, g + n)),
                max(0, min(255, b + n)),
                a,
            )
    return out


def source_variants(source_paths: Iterable[Path], fallback_tiles: Iterable[Image.Image], seed_base: int) -> list[Image.Image]:
    sources = [open_rgba(p) for p in source_paths if p.exists()]
    if not sources:
        sources = [img.convert('RGBA') for img in fallback_tiles]

    variants: list[Image.Image] = []
    for i in range(VARIANT_COUNT):
        src = sources[i % len(sources)]
        # Use the full repeatable source as base, then mild deterministic shifts/tone changes.
        base = src.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
        if i % 2:
            base = ImageOps.mirror(base)
        if i % 3 == 2:
            base = ImageOps.flip(base)
        base = ImageEnhance.Contrast(base).enhance(1.0 + ((i % 5) - 2) * 0.035)
        base = ImageEnhance.Brightness(base).enhance(1.0 + ((i % 4) - 1.5) * 0.025)
        base = ImageEnhance.Color(base).enhance(1.0 + ((i % 3) - 1) * 0.04)
        base = add_noise(base, seed_base + i * 7919, 4 + (i % 3))
        base = base.filter(ImageFilter.UnsharpMask(radius=1.1, percent=85, threshold=3))
        variants.append(base)
    return variants


def write_variant_atlas(name: str, variants: list[Image.Image]) -> None:
    rows = math.ceil(len(variants) / VARIANT_COLS)
    atlas = Image.new('RGBA', (VARIANT_COLS * TILE_SIZE, rows * TILE_SIZE), (0, 0, 0, 0))
    for index, img in enumerate(variants):
        x = index % VARIANT_COLS
        y = index // VARIANT_COLS
        atlas.alpha_composite(img.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS), (x * TILE_SIZE, y * TILE_SIZE))
    atlas.save(ATLAS_DIR / f'{name}_variants_atlas.png')
    meta = {
        'tile_size': TILE_SIZE,
        'tiles_per_row': VARIANT_COLS,
        'total_tiles': len(variants),
        'frames': [{'index': i, 'atlas_coords': [i % VARIANT_COLS, i // VARIANT_COLS], 'px_coords': [(i % VARIANT_COLS) * TILE_SIZE, (i // VARIANT_COLS) * TILE_SIZE]} for i in range(len(variants))],
    }
    (ATLAS_DIR / f'{name}_variants_atlas.json').write_text(json.dumps(meta, indent=2) + '\n')


def main() -> None:
    tiles = save_tile_pngs()
    write_main_atlas(tiles)

    bedrock_sources = [
        ATLAS_DIR / 'source-bedrock-extra-coarse-imagegen2.png',
        ATLAS_DIR / 'source-bedrock-coarse-seamless-imagegen2.png',
        ATLAS_DIR / 'source-bedrock-detailed-repeatable-imagegen2.png',
        ATLAS_DIR / 'source-bedrock-seamless-imagegen2.png',
        ATLAS_DIR / 'source-bedrock-single-tile-repeatable-imagegen2.png',
    ]
    earth_sources = [
        TILES_DIR / 'tile_dirt.png',
        TILES_DIR / 'tile_sand.png',
        TILES_DIR / 'tile_clay.png',
        TILES_DIR / 'tile_gravel.png',
    ]
    backwall_sources = [
        ATLAS_DIR / 'source-earth-backwall-extra-coarse-imagegen2.png',
        ATLAS_DIR / 'source-earth-backwall-detailed-repeatable-imagegen2.png',
        ATLAS_DIR / 'source-mined-backwall-earthy-seamless-imagegen2.png',
        ATLAS_DIR / 'source-mined-backwall-light-earth-seamless-imagegen2.png',
        ATLAS_DIR / 'source-mined-backwall-seamless-imagegen2.png',
        ATLAS_DIR / 'source-backwall-single-tile-repeatable-imagegen2.png',
    ]

    write_variant_atlas('bedrock', source_variants(bedrock_sources, [tiles['bedrock']], 1000))
    write_variant_atlas('earth', source_variants(earth_sources, [tiles['dirt'], tiles['sand']], 2000))
    write_variant_atlas('backwall', source_variants(backwall_sources, [tiles['dirt']], 3000))
    # Keep legacy name valid for any external references, now as a 10-frame atlas too.
    (ATLAS_DIR / 'backwall_atlas.png').write_bytes((ATLAS_DIR / 'backwall_variants_atlas.png').read_bytes())


if __name__ == '__main__':
    main()
