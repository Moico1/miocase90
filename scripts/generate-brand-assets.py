from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "images"
BRAND = ROOT / "assets" / "brand"
FONT = (
    ROOT
    / "node_modules"
    / "@expo-google-fonts"
    / "playfair-display"
    / "900Black_Italic"
    / "PlayfairDisplay_900Black_Italic.ttf"
)
SCALE = 4
BASE_POINTS = {
    "front": [(240, 400), (610, 415), (610, 770), (240, 750), (240, 400)],
    "right": [(610, 415), (790, 295), (790, 635), (610, 770), (610, 415)],
    "top": [(240, 400), (450, 265), (790, 295), (610, 415)],
    "tape_left": [(450, 265), (452, 365), (466, 400)],
    "tape_right": [(520, 278), (522, 380), (535, 402)],
    "label": [(300, 640), (405, 644), (410, 705), (306, 700), (300, 640)],
}


def create_box_mark(
    size: int,
    background: tuple,
    stroke: tuple,
    scale: float,
    include_wordmark: bool = False,
) -> Image.Image:
    canvas_size = size * SCALE
    image = Image.new("RGBA", (canvas_size, canvas_size), background)
    draw = ImageDraw.Draw(image)
    width = max(1, round(24 * size / 1024 * SCALE))

    def point(pair: tuple) -> tuple:
        x, y = pair
        return (
            round((512 + (x - 512) * scale) * size / 1024 * SCALE),
            round((512 + (y - 512) * scale) * size / 1024 * SCALE),
        )

    for path in BASE_POINTS.values():
        draw.line([point(item) for item in path], fill=stroke, width=width, joint="curve")

    if include_wordmark:
        if not FONT.is_file():
            raise FileNotFoundError(f"No se encontró la fuente de marca: {FONT}")

        front_width = (610 - 240) * size / 1024 * scale * SCALE
        font_size = round(68 * size / 1024 * scale * SCALE)
        font = ImageFont.truetype(str(FONT), font_size)
        for text, center_y in (("Mío", 510), ("CASE", 598)):
            while draw.textbbox((0, 0), text, font=font)[2] > front_width * 0.82:
                font_size -= 1
                font = ImageFont.truetype(str(FONT), font_size)
            draw.text(
                point((425, center_y)),
                text,
                fill=stroke,
                font=font,
                anchor="mm",
            )

    mark = image.resize((size, size), Image.Resampling.LANCZOS)
    return mark


def save(name: str, size: int, background: tuple, stroke: tuple, scale: float) -> None:
    create_box_mark(size, background, stroke, scale).save(OUTPUT / name)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    BRAND.mkdir(parents=True, exist_ok=True)
    transparent = (0, 0, 0, 0)
    yellow = (249, 227, 0, 255)
    black = (17, 16, 14, 255)
    white = (255, 255, 255, 255)

    save("icon.png", 1024, yellow, black, 1.4)
    save("android-icon-foreground.png", 1024, transparent, black, 1.0)
    save("android-icon-monochrome.png", 1024, transparent, white, 1.0)
    create_box_mark(512, transparent, black, 1.2, include_wordmark=True).save(
        OUTPUT / "splash-icon.png"
    )
    save("favicon.png", 256, yellow, black, 1.4)
    create_box_mark(512, transparent, black, 1.6, include_wordmark=True).save(
        BRAND / "box-mark.png"
    )


if __name__ == "__main__":
    main()
