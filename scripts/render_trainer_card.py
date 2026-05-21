#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import math
import sys
import urllib.request
from pathlib import Path
from typing import Any, Optional

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


CARD_W = 1536
CARD_H = 1024
ITEM_W = 920
ITEM_H = 460

BLUE_DARK = (15, 77, 157, 255)
BLUE_MAIN = (34, 116, 214, 255)
BLUE_LIGHT = (111, 183, 255, 255)
BLUE_PANEL = (69, 147, 225, 210)
BLUE_PANEL_DARK = (19, 82, 166, 255)
WHITE = (248, 252, 255, 255)
INK = (14, 31, 57, 255)
GOLD = (255, 221, 88, 255)


def main() -> None:
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        mode = payload.get("mode")

        if mode == "trainer_card":
            image = render_trainer_card(payload)
        elif mode == "item_card":
            image = render_item_card(payload)
        else:
            raise ValueError(f"Unknown render mode: {mode!r}")

        out = io.BytesIO()
        image.save(out, format="PNG", optimize=True)
        sys.stdout.buffer.write(out.getvalue())
    except Exception as exc:
        print(f"render_trainer_card.py failed: {exc}", file=sys.stderr)
        raise


def render_trainer_card(payload: dict[str, Any]) -> Image.Image:
    trainer = payload.get("trainer") or {}
    badges = payload.get("badges") or []
    team = payload.get("team") or []

    image = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    bg = vertical_gradient((CARD_W, CARD_H), (22, 93, 185), (14, 70, 153))
    image.alpha_composite(bg)
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((6, 6, CARD_W - 6, CARD_H - 6), radius=32, fill=(10, 16, 28, 255))
    draw.rounded_rectangle((15, 15, CARD_W - 15, CARD_H - 15), radius=26, fill=None, outline=(237, 248, 255, 255), width=5)
    draw.rounded_rectangle((21, 21, CARD_W - 21, CARD_H - 21), radius=20, fill=None, outline=(61, 139, 231, 255), width=4)

    draw_pokeball_watermark(image, (520, 300), 300)
    draw_header(draw)
    draw_info_bars(image, trainer)
    draw_avatar_panel(image, trainer)
    draw_badges(image, badges)
    draw_team(image, team)

    # A final tiny pixel grid texture keeps the Discord attachment from feeling too flat.
    texture = Image.new("RGBA", image.size, (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(texture)
    for x in range(22, CARD_W - 22, 8):
        tdraw.line((x, 22, x, CARD_H - 22), fill=(255, 255, 255, 8), width=1)
    for y in range(22, CARD_H - 22, 8):
        tdraw.line((22, y, CARD_W - 22, y), fill=(0, 20, 70, 8), width=1)
    image.alpha_composite(texture)

    return image


def render_item_card(payload: dict[str, Any]) -> Image.Image:
    item = payload.get("item") or {}
    image = Image.new("RGBA", (ITEM_W, ITEM_H), (0, 0, 0, 0))
    image.alpha_composite(vertical_gradient((ITEM_W, ITEM_H), (29, 102, 196), (15, 78, 160)))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((6, 6, ITEM_W - 6, ITEM_H - 6), radius=24, fill=(10, 16, 28, 255))
    draw.rounded_rectangle((15, 15, ITEM_W - 15, ITEM_H - 15), radius=18, fill=(26, 104, 201, 255), outline=(237, 248, 255), width=4)
    draw_pokeball_watermark(image, (178, 235), 135)

    title_font = load_font(42, bold=True, mono=True)
    text_font = load_font(24, bold=True, mono=True)
    small_font = load_font(21, bold=False, mono=True)

    draw_glow_box(image, (48, 84, 288, 324), radius=18, fill=(92, 170, 246, 215), outline=(14, 61, 130, 255))
    sprite = load_url_image(item.get("spriteUrl") or item.get("sprite_url"))
    if sprite:
        paste_sprite(image, sprite, (72, 98, 264, 294), pixel=True)
    else:
        draw_centered_text(draw, "ITEM", (168, 206), title_font, WHITE, stroke=(18, 62, 122))

    draw_text(draw, trunc(str(item.get("name") or "Item"), 24), (330, 92), title_font, WHITE, stroke=(18, 62, 122), stroke_width=2)
    meta = f"Qtd: {item.get('quantity', 0)} | {item.get('categoryLabel') or item.get('category') or 'Outro'}"
    draw_text(draw, meta, (330, 140), text_font, (220, 239, 255, 255))

    description = str(item.get("description") or "Item sem descricao especial.")
    for i, line in enumerate(wrap_text(description, 45, 5)):
        draw_text(draw, line, (330, 178 + i * 32), small_font, WHITE)

    draw.rounded_rectangle((48, 346, 868, 408), radius=12, fill=(45, 119, 207, 220), outline=(124, 201, 255, 140), width=2)
    draw_text(draw, "Escolha Usar para selecionar um Pokemon da equipe.", (70, 386), small_font, WHITE)
    return image


def draw_header(draw: ImageDraw.ImageDraw) -> None:
    title_font = load_font(56, bold=True, mono=True)
    draw_small_pokeball(draw, (72, 70), 28)
    draw_text(draw, "CARTÃO DE TREINADOR", (112, 48), title_font, WHITE, stroke=(18, 62, 122), stroke_width=3)
    star = regular_star(1464, 82, 45, 20, 5)
    draw.polygon(star, fill=GOLD)
    draw.line(star + [star[0]], fill=(178, 126, 14, 255), width=2)


def draw_info_bars(image: Image.Image, trainer: dict[str, Any]) -> None:
    label_font = load_font(42, bold=True, mono=True)
    value_font = load_font(40, bold=True, mono=True)
    value_gold_font = load_font(40, bold=True, mono=True)
    draw = ImageDraw.Draw(image)

    rows = [
        ("trainer", "NOME DO TREINADOR", str(trainer.get("name") or "TREINADOR"), WHITE),
        ("coin", "DINHEIRO TOTAL", format_money(trainer.get("money", 0)), GOLD),
        ("ball", "POKÉDEX", str(trainer.get("pokedex", 0)), WHITE),
    ]

    for index, (icon, label, value, value_color) in enumerate(rows):
        y = 132 + index * 120
        draw_glow_box(image, (40, y, 960, y + 104), radius=12, fill=BLUE_PANEL, outline=(123, 198, 255, 100))
        draw_info_icon(draw, icon, (96, y + 52))
        draw_text(draw, label, (174, y + 30), label_font, WHITE, stroke=(18, 62, 122), stroke_width=2)
        font = value_gold_font if value_color == GOLD else value_font
        draw_right_text(draw, value.upper() if icon == "trainer" else value, (930, y + 30), font, value_color, stroke=(12, 36, 70), stroke_width=1)


def draw_avatar_panel(image: Image.Image, trainer: dict[str, Any]) -> None:
    draw = ImageDraw.Draw(image)
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.rounded_rectangle((1010, 118, 1510, 624), radius=34, fill=(79, 181, 255, 92))
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    image.alpha_composite(glow)

    draw.rounded_rectangle((1016, 122, 1506, 620), radius=30, fill=(38, 111, 200, 255), outline=(13, 74, 152, 255), width=5)
    draw.rounded_rectangle((1040, 150, 1470, 580), radius=28, fill=(91, 169, 242, 255), outline=(132, 203, 255, 255), width=3)

    avatar = load_url_image(trainer.get("avatarUrl") or trainer.get("avatar_url"))
    if avatar:
        avatar = ImageOps.fit(avatar, (410, 410), method=Image.Resampling.LANCZOS)
        avatar = pixelize(avatar, 92)
        avatar = ImageEnhance.Color(avatar).enhance(0.88)
        avatar = ImageEnhance.Contrast(avatar).enhance(1.05)
        mask = rounded_mask((410, 410), 22)
        image.paste(avatar, (1050, 160), mask)
        scan = Image.new("RGBA", (410, 410), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(scan)
        for y in range(0, 410, 6):
            sdraw.line((0, y, 410, y), fill=(255, 255, 255, 13), width=1)
        image.paste(scan, (1050, 160), mask)
    else:
        initials = initials_from_name(str(trainer.get("name") or "T"))
        draw.ellipse((1147, 246, 1363, 462), fill=(47, 121, 211), outline=WHITE, width=5)
        draw_centered_text(draw, initials, (1255, 358), load_font(76, bold=True, mono=True), WHITE)


def draw_badges(image: Image.Image, badges: list[Any]) -> None:
    draw = ImageDraw.Draw(image)
    title_font = load_font(36, bold=True, mono=True)
    draw.rounded_rectangle((38, 508, 978, 698), radius=14, fill=(19, 89, 171, 255), outline=(11, 65, 139, 255), width=4)
    draw_text(draw, "INSÍGNIAS", (64, 523), title_font, WHITE, stroke=(18, 62, 122), stroke_width=2)
    draw.rounded_rectangle((58, 566, 960, 676), radius=10, fill=(63, 140, 221, 162), outline=(12, 70, 145, 255), width=3)

    palette = [
        (184, 190, 199), (72, 200, 255), (247, 201, 72), (244, 108, 206),
        (246, 92, 118), (205, 210, 220), (113, 213, 126), (156, 126, 255),
    ]
    slots = normalize_badges(badges)
    for index in range(8):
        cx = 108 + index * 108
        cy = 622
        if slots[index]:
            draw_badge(draw, (cx, cy), palette[index], str(slots[index]))
        else:
            draw_silhouette_badge(draw, (cx, cy))


def draw_team(image: Image.Image, team: list[Any]) -> None:
    draw = ImageDraw.Draw(image)
    title_font = load_font(36, bold=True, mono=True)
    name_font = load_font(20, bold=True, mono=True)
    draw.rounded_rectangle((38, 720, 1498, 965), radius=14, fill=(19, 89, 171, 255), outline=(11, 65, 139, 255), width=4)
    draw_text(draw, "EQUIPE", (64, 730), title_font, WHITE, stroke=(18, 62, 122), stroke_width=2)

    slot_w = 218
    gap = 26
    start_x = 84
    for index in range(6):
        x = start_x + index * (slot_w + gap)
        y = 770
        draw_glow_box(image, (x, y, x + slot_w, y + 172), radius=12, fill=(71, 147, 223, 185), outline=(10, 64, 136, 255), blur=5)
        pokemon = team[index] if index < len(team) else None
        if pokemon:
            sprite = load_url_image(pokemon.get("spriteUrl") or pokemon.get("sprite_url"))
            if sprite:
                paste_sprite(image, sprite, (x + 26, y + 12, x + slot_w - 26, y + 142), pixel=True)
            else:
                draw.ellipse((x + 70, y + 38, x + 148, y + 116), fill=(24, 80, 151, 185))
            name = trunc(str(pokemon.get("name") or "POKEMON"), 14)
        else:
            draw.ellipse((x + 70, y + 42, x + 148, y + 120), fill=(24, 80, 151, 170))
            name = "VAZIO"
        draw_centered_text(draw, name.upper(), (x + slot_w // 2, y + 151), name_font, WHITE, stroke=(12, 47, 96), stroke_width=1)


def draw_pokeball_watermark(image: Image.Image, center: tuple[int, int], radius: int) -> None:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = center
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    draw.ellipse(box, fill=(255, 255, 255, 18))
    draw.arc(box, 20, 340, fill=(255, 255, 255, 28), width=34)
    draw.line((cx - radius + 38, cy, cx - 70, cy), fill=(255, 255, 255, 28), width=34)
    draw.line((cx + 70, cy, cx + radius - 38, cy), fill=(255, 255, 255, 28), width=34)
    draw.ellipse((cx - 72, cy - 72, cx + 72, cy + 72), outline=(255, 255, 255, 30), width=32)
    image.alpha_composite(overlay)


def draw_info_icon(draw: ImageDraw.ImageDraw, kind: str, center: tuple[int, int]) -> None:
    cx, cy = center
    if kind == "coin":
        draw.ellipse((cx - 35, cy - 35, cx + 35, cy + 35), fill=(249, 211, 79), outline=(183, 122, 22), width=6)
        draw.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), outline=(230, 166, 36), width=5)
        draw_centered_text(draw, "P", (cx, cy - 2), load_font(28, bold=True, mono=True), (164, 105, 16))
    elif kind == "ball":
        draw_small_pokeball(draw, (cx, cy), 35)
    else:
        draw.rounded_rectangle((cx - 27, cy - 30, cx + 27, cy + 32), radius=12, fill=WHITE, outline=(21, 57, 110), width=4)
        draw.ellipse((cx - 12, cy - 22, cx + 12, cy + 2), fill=(30, 41, 59))
        draw.rounded_rectangle((cx - 17, cy + 8, cx + 17, cy + 28), radius=8, fill=(30, 41, 59))
        draw.rounded_rectangle((cx - 24, cy - 34, cx + 24, cy - 14), radius=6, fill=(229, 59, 59), outline=(17, 24, 39), width=3)


def draw_small_pokeball(draw: ImageDraw.ImageDraw, center: tuple[int, int], radius: int) -> None:
    cx, cy = center
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    draw.ellipse(box, fill=WHITE, outline=(17, 24, 39), width=max(4, radius // 6))
    draw.pieslice(box, 180, 360, fill=(229, 59, 59), outline=(17, 24, 39), width=max(4, radius // 6))
    draw.line((cx - radius, cy, cx + radius, cy), fill=(17, 24, 39), width=max(5, radius // 5))
    draw.ellipse((cx - radius // 3, cy - radius // 3, cx + radius // 3, cy + radius // 3), fill=WHITE, outline=(17, 24, 39), width=max(4, radius // 7))


def draw_badge(draw: ImageDraw.ImageDraw, center: tuple[int, int], color: tuple[int, int, int], label: str) -> None:
    cx, cy = center
    points = [(cx, cy - 42), (cx + 36, cy - 18), (cx + 36, cy + 22), (cx, cy + 42), (cx - 36, cy + 22), (cx - 36, cy - 18)]
    draw.polygon(points, fill=(*color, 255), outline=(16, 48, 94, 255))
    draw.line(points + [points[0]], fill=(16, 48, 94, 255), width=4)
    draw.polygon([(cx, cy - 32), (cx + 16, cy - 6), (cx + 30, cy + 4), (cx + 8, cy + 12), (cx, cy + 32), (cx - 8, cy + 12), (cx - 30, cy + 4), (cx - 16, cy - 6)], fill=(255, 255, 255, 58))
    draw_centered_text(draw, label[:1].upper(), (cx, cy + 2), load_font(25, bold=True, mono=True), INK)


def draw_silhouette_badge(draw: ImageDraw.ImageDraw, center: tuple[int, int]) -> None:
    cx, cy = center
    points = [(cx, cy - 38), (cx + 33, cy - 15), (cx + 30, cy + 25), (cx, cy + 40), (cx - 30, cy + 25), (cx - 33, cy - 15)]
    draw.polygon(points, fill=(20, 75, 143, 170))


def draw_glow_box(
    image: Image.Image,
    box: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int],
    blur: int = 7,
) -> None:
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.rounded_rectangle(box, radius=radius, fill=(101, 190, 255, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(blur))
    image.alpha_composite(glow)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=3)
    x0, y0, x1, y1 = box
    draw.rounded_rectangle((x0 + 4, y0 + 4, x1 - 4, y0 + 26), radius=radius // 2, fill=(255, 255, 255, 38))


def paste_sprite(image: Image.Image, sprite: Image.Image, box: tuple[int, int, int, int], pixel: bool) -> None:
    x0, y0, x1, y1 = box
    max_w = x1 - x0
    max_h = y1 - y0
    sprite = trim_transparency(sprite.convert("RGBA"))
    ratio = min(max_w / max(1, sprite.width), max_h / max(1, sprite.height))
    size = (max(1, int(sprite.width * ratio)), max(1, int(sprite.height * ratio)))
    resample = Image.Resampling.NEAREST if pixel else Image.Resampling.LANCZOS
    sprite = sprite.resize(size, resample)
    pos = (x0 + (max_w - size[0]) // 2, y0 + (max_h - size[1]) // 2)
    image.alpha_composite(sprite, pos)


def trim_transparency(image: Image.Image) -> Image.Image:
    bbox = image.getbbox()
    return image.crop(bbox) if bbox else image


def pixelize(image: Image.Image, small_size: int) -> Image.Image:
    small = image.resize((small_size, small_size), Image.Resampling.BILINEAR)
    return small.resize(image.size, Image.Resampling.NEAREST)


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    w, h = size
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    for y in range(h):
        t = y / max(1, h - 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)) + (255,)
        draw.line((0, y, w, y), fill=color)
    return image


def load_url_image(url: Optional[str]) -> Optional[Image.Image]:
    if not url:
        return None

    try:
        request = urllib.request.Request(str(url), headers={"User-Agent": "ArceusRpgBot/1.0"})
        with urllib.request.urlopen(request, timeout=7) as response:
            data = response.read(4 * 1024 * 1024)
        return Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception:
        return None


def load_font(size: int, *, bold: bool = False, mono: bool = False):
    names = []
    if mono:
        names.extend([
            "C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
            "DejaVuSansMono-Bold.ttf" if bold else "DejaVuSansMono.ttf",
        ])
    names.extend([
        "C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
    ])

    for name in names:
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            continue

    try:
        return ImageFont.truetype(str(Path(__file__).with_name("DejaVuSans.ttf")), size=size)
    except OSError:
        return ImageFont.load_default()


def draw_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    pos: tuple[int, int],
    font: ImageFont.ImageFont,
    fill: Any,
    *,
    stroke: Any = None,
    stroke_width: int = 0,
) -> None:
    draw.text(pos, text, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke or fill)


def draw_right_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    pos: tuple[int, int],
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int, int],
    *,
    stroke: Any = None,
    stroke_width: int = 0,
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    draw.text((pos[0] - (bbox[2] - bbox[0]), pos[1]), text, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke or fill)


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    center: tuple[int, int],
    font: ImageFont.ImageFont,
    fill: Any,
    *,
    stroke: Any = None,
    stroke_width: int = 0,
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    x = center[0] - (bbox[2] - bbox[0]) // 2
    y = center[1] - (bbox[3] - bbox[1]) // 2 - 2
    draw.text((x, y), text, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke or fill)


def regular_star(cx: int, cy: int, outer: int, inner: int, points: int) -> list[tuple[float, float]]:
    result = []
    for index in range(points * 2):
        radius = outer if index % 2 == 0 else inner
        angle = math.radians(-90 + index * 180 / points)
        result.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    return result


def normalize_badges(raw: list[Any]) -> list[Optional[str]]:
    result: list[Optional[str]] = []
    for entry in raw[:8]:
        if isinstance(entry, dict):
            result.append(str(entry.get("name") or "B") if entry.get("obtained", True) else None)
        elif entry:
            result.append(str(entry))
        else:
            result.append(None)
    while len(result) < 8:
        result.append(None)
    return result


def format_money(value: Any) -> str:
    try:
        amount = int(value)
    except (TypeError, ValueError):
        amount = 0
    return f"₽ {amount:,}".replace(",", ".")


def initials_from_name(name: str) -> str:
    parts = [part for part in name.strip().split() if part]
    if not parts:
        return "T"
    return "".join(part[0].upper() for part in parts[:2])


def wrap_text(text: str, max_chars: int, max_lines: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = candidate
        if len(lines) >= max_lines:
            break
    if current and len(lines) < max_lines:
        lines.append(current)
    return lines


def trunc(value: str, limit: int) -> str:
    return value if len(value) <= limit else value[: max(0, limit - 1)] + "."


if __name__ == "__main__":
    main()
