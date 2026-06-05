#!/usr/bin/env python3
import re, json, sys
from pathlib import Path
import pdfplumber

SKU_RE = re.compile(r"^(\d{6})\s+(.+)$")
SECTION_RE = re.compile(r"^[A-Z][A-Z /&-]{4,}$")

JUNK_RE = re.compile(
    r"^(SUPPLIES|CLINICAL|For additional|This is a representation|\d+\s*\|)"
)

BAD_SECTION_OR_NAME = re.compile(
    r"(Lacinilc|Seilppus|Uncategorized Products|^\w$|^\d+$|Description$)"
)

BAD_DESC = re.compile(
    r"^\d{6}(?:\s+\d{6})+|-\s*\d{6}|SUPPLIES|CLINICAL|Lacinilc|Seilppus"
)

TABLE_LABEL_NAMES = {
    "Description",
    "Dimensions",
    "Color",
    "Blue Vinyl Description",
    "Black Polyurethane Description",
    "Polyurethane Description",
    "Without Pocket Description",
    "Therapy Kits Description",
    "Accessories Description",
    "Cool Sombra Description",
    "Warm Sombra Description",
    "Drop Description",
    "Fascia Description",
    "Safety Tube Description",
    "Sterile Description",
    "Cloth Electrode Description",
    "Foam Electrode Description",
    '2" Rolls Description',
    '2" Bulk Rolls Description',
    '2" Bulk Roll Description',
    '2" Standard Roll Description',
    '2" Precut Roll Description',
    "Pre-Cut Description",
}

def clean(s):
    return re.sub(r"\s+", " ", s.strip())

def is_section(line):
    return (
        SECTION_RE.match(line)
        and len(line.split()) <= 5
        and "DESCRIPTION" not in line
    )

def is_sku(line):
    return SKU_RE.match(line)

def is_probable_group(line):
    if not line:
        return False
    if line in TABLE_LABEL_NAMES:
        return True
    if JUNK_RE.search(line):
        return False
    if is_section(line):
        return False
    if is_sku(line):
        return False
    if line.startswith(("–", "-", "•", "■")):
        return False
    if len(line) > 90:
        return False
    if re.match(r"^\d", line):
        return False
    return True

def extract_column_text(page, side):
    w, h = page.width, page.height

    top = h * 0.06
    bottom = h * 0.94

    # Slight overlap is intentional. Later scoring removes bad/caption groups.
    if side == "left":
        box = (0, top, w * 0.56, bottom)
    else:
        box = (w * 0.44, top, w, bottom)

    text = page.crop(box).extract_text(x_tolerance=2, y_tolerance=3) or ""
    return [clean(x) for x in text.splitlines() if clean(x)]

def parse_lines(lines, page_num, column):
    groups = []
    section = None
    group = None
    pending_variant = None

    def start_group(name):
        nonlocal group, pending_variant
        group_name = name
        variant = None

        if name in TABLE_LABEL_NAMES:
            variant = name.replace(" Description", "").strip()
            group_name = "Uncategorized Products"

        group = {
            "page": page_num,
            "column": column,
            "section": section,
            "name": group_name,
            "variant": variant,
            "features": [],
            "products": []
        }
        groups.append(group)
        pending_variant = None

    for line in lines:
        if JUNK_RE.search(line):
            continue

        if is_section(line):
            section = line.title()
            group = None
            continue

        if line in TABLE_LABEL_NAMES:
            if group:
                group["variant"] = line.replace(" Description", "").strip()
            else:
                start_group(line)
            continue

        if line.startswith(("–", "-", "•", "■")):
            feature = line.lstrip("–-•■ ").strip()
            if feature and group:
                group["features"].append(feature)
            continue

        m = SKU_RE.match(line)
        if m:
            if not group:
                start_group("Uncategorized Products")
            desc = clean_description(m.group(2))
            group["products"].append({
                "sku": m.group(1),
                "description": desc
            })
            continue

        if is_probable_group(line):
            start_group(line)

    return [g for g in groups if g["products"]]

def clean_description(desc):
    desc = clean(desc)

    cut_markers = [
        " SUPPLIES",
        " CLINICAL",
        " Description",
        " Round Description",
        " Square Description",
        " Bulk Rolls Description",
        " DO YOUR PATIENTS",
        " PAIN MANAGEMENT",
    ]

    for marker in cut_markers:
        if marker in desc:
            desc = desc.split(marker)[0].strip()

    # Remove dangling bullet artifacts.
    desc = desc.rstrip("–- ").strip()
    return desc

def group_quality(g):
    score = 0
    name = g.get("name") or ""
    section = g.get("section") or ""
    products = g.get("products", [])

    if BAD_SECTION_OR_NAME.search(name):
        score -= 5

    if section and BAD_SECTION_OR_NAME.search(section):
        score -= 5

    # Product count helps, but cap it.
    score += min(len(products), 10)

    if g.get("features"):
        score += 2

    if g.get("variant"):
        score += 1

    # Reasonable product-family names help.
    if re.search(r"[®™]|Pack|Packs|Wrap|Therapy|Tape|Needles|Container|Pads|Covers|Tongs|Rolls|Gel|Electrodes|Sombra|Kinesio|RockTape|CorPak|Thermotech|Thera|Pro Advantage|BioFreeze", name):
        score += 3

    for p in products:
        desc = p["description"]

        if BAD_DESC.search(desc):
            score -= 3

        if len(desc) > 100:
            score -= 2

        if re.search(r"[A-Za-z]", desc):
            score += 1

        # Captions often look like "021628 021630".
        if re.fullmatch(r"(?:\d{6}\s*)+", desc):
            score -= 5

    return score

def dedupe_groups(groups):
    seen = set()
    out = []

    for g in groups:
        product_key = tuple((p["sku"], p["description"]) for p in g["products"])
        key = (g.get("section"), g.get("name"), product_key)

        if key in seen:
            continue

        seen.add(key)
        out.append(g)

    return out

def extract_catalog(pdf_path, start_page=5, end_page=None):
    all_groups = []

    with pdfplumber.open(pdf_path) as pdf:
        last_page = end_page or len(pdf.pages)

        for idx in range(start_page - 1, min(last_page, len(pdf.pages))):
            page = pdf.pages[idx]
            page_num = idx + 1

            for column in ("left", "right"):
                lines = extract_column_text(page, column)

                sku_count = sum(1 for x in lines if SKU_RE.match(x))
                if sku_count < 1:
                    continue

                all_groups.extend(parse_lines(lines, page_num, column))

    filtered = [g for g in all_groups if group_quality(g) >= 3]
    filtered = dedupe_groups(filtered)

    return {
        "source": str(pdf_path),
        "groups": filtered,
        "stats": {
            "groups": len(filtered),
            "products": sum(len(g["products"]) for g in filtered)
        }
    }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python ingest_pdf.py input.pdf output.json [start_page] [end_page]")
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])

    start_page = int(sys.argv[3]) if len(sys.argv) >= 4 else 5
    end_page = int(sys.argv[4]) if len(sys.argv) >= 5 else None

    catalog = extract_catalog(pdf_path, start_page=start_page, end_page=end_page)
    out_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False))

    print(f"Wrote {out_path}")
    print(f"Groups: {catalog['stats']['groups']}")
    print(f"Products: {catalog['stats']['products']}")