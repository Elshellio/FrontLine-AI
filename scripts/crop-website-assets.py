#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/websites/website-assets.png"
OUT_DIR = ROOT / "public/assets/websites/crops"

OUTPUT_NAMES = [
    "01-website-hero-premium-build.png",
    "02-website-luxury-food-imagery.png",
    "03-website-salon-premium-imagery.png",
    "04-website-clinic-premium-imagery.png",
    "05-website-property-premium-imagery.png",
    "06-website-trades-premium-imagery.png",
    "07-website-ai-assistant-overlay.png",
    "08-website-enquiry-flow.png",
    "09-website-service-page-mockup.png",
    "10-website-dashboard-handoff.png",
]


def runs(values, threshold, min_len):
    found = []
    start = None
    for index, value in enumerate(values):
        if value >= threshold and start is None:
            start = index
        elif value < threshold and start is not None:
            if index - start >= min_len:
                found.append((start, index - 1))
            start = None
    if start is not None and len(values) - start >= min_len:
        found.append((start, len(values) - 1))
    return found


def dark_count(pixel_iter, threshold=230):
    count = 0
    for r, g, b in pixel_iter:
        if (r + g + b) / 3 < threshold:
            count += 1
    return count


def detect_tile_boxes(image):
    width, height = image.size
    pixels = image.load()

    row_counts = []
    for y in range(height):
        row_counts.append(dark_count(pixels[x, y] for x in range(width)))

    row_bands = runs(row_counts, int(width * 0.65), 80)[:2]
    if len(row_bands) != 2:
        raise RuntimeError(f"Expected 2 visual rows, detected {len(row_bands)}: {row_bands}")

    boxes = []
    for y0, y1 in row_bands:
        band_height = y1 - y0 + 1
        col_counts = []
        for x in range(width):
            col_counts.append(dark_count(pixels[x, y] for y in range(y0, y1 + 1)))

        col_bands = runs(col_counts, int(band_height * 0.42), 40)
        if len(col_bands) != 5:
            raise RuntimeError(
                f"Expected 5 visual columns in row {y0}-{y1}, detected {len(col_bands)}: {col_bands}"
            )

        for x0, x1 in col_bands:
            boxes.append((x0, y0, x1 + 1, y1 + 1))

    if len(boxes) != 10:
        raise RuntimeError(f"Expected 10 crop boxes, detected {len(boxes)}")

    return boxes


def make_review_sheet(crops):
    thumb_w = 260
    label_h = 44
    gutter = 18
    cols = 5
    rows = 2
    thumb_h = 0
    thumbs = []

    for label, image in crops:
        thumb = image.copy()
        thumb.thumbnail((thumb_w, 180), Image.LANCZOS)
        thumbs.append((label, thumb))
        thumb_h = max(thumb_h, thumb.height)

    sheet_w = cols * thumb_w + (cols + 1) * gutter
    sheet_h = rows * (thumb_h + label_h) + (rows + 1) * gutter
    sheet = Image.new("RGB", (sheet_w, sheet_h), "#07101c")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for index, (label, thumb) in enumerate(thumbs):
        col = index % cols
        row = index // cols
        x = gutter + col * (thumb_w + gutter)
        y = gutter + row * (thumb_h + label_h + gutter)
        frame = Image.new("RGB", (thumb_w, thumb_h), "#0d1b31")
        frame.paste(thumb, ((thumb_w - thumb.width) // 2, (thumb_h - thumb.height) // 2))
        sheet.paste(frame, (x, y))
        draw.text((x, y + thumb_h + 10), label, fill="#dbeafe", font=font)

    return sheet


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.chmod(0o755)

    image = Image.open(SOURCE).convert("RGB")
    width, height = image.size
    print(f"source: {SOURCE}")
    print(f"dimensions: {width}x{height}")

    boxes = detect_tile_boxes(image)
    crops = []

    for name, box in zip(OUTPUT_NAMES, boxes):
        crop = image.crop(box)
        out_path = OUT_DIR / name
        crop.save(out_path, "PNG", optimize=True)
        out_path.chmod(0o644)
        crops.append((name, crop))
        print(f"crop: {name} box={box} size={crop.size} -> {out_path}")

    review = make_review_sheet(crops)
    review_path = OUT_DIR / "_review-contact-sheet.png"
    review.save(review_path, "PNG", optimize=True)
    review_path.chmod(0o644)
    print(f"review: {review_path} size={review.size}")


if __name__ == "__main__":
    main()
