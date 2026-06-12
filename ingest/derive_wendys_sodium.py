"""Derive sodium for Wendy's food items from the official UK Salt (g) column.

The Wendy's dataset is official Wendy's UK menu data in METRIC units, scraped from
wendys.com/sites/default/files/2025-02/Core Menu.pdf (committed locally as
wendys_core_menu.pdf). The PDF reports "Salt (g)", NOT sodium (mg) — so when the
data was first ingested, sodium was simply never converted and 34 food items were
left with `sodium: null`. The scoring engine then imputes a median for them, which
is a fairness band-aid, not real data.

UK food labels report salt; the standard conversion is:
    sodium_mg = salt_g / 2.5 * 1000   ==   salt_g * 400
(2.5 g salt contains 1 g sodium). This script reads the salt column straight from
the source PDF and writes the derived sodium back — preserving the consistent UK
dataset (calories etc. already match the PDF exactly) rather than re-sourcing from
a US menu, which would change every calorie value.

Idempotent: safe to re-run. Each item is matched to its PDF row by name and its
calories are cross-checked against the PDF energy, so a bad name match fails loudly
instead of writing a wrong number.

See docs/superpowers/specs/2026-06-11-data-quality-cleanup-design.md.

Usage:  python derive_wendys_sodium.py
"""

import json
import re
from pathlib import Path

from pypdf import PdfReader

BASE = Path(__file__).parent
PDF_PATH = BASE / "wendys_core_menu.pdf"
JSON_PATH = BASE / "wendys_items.json"

# UK convention: 2.5 g salt == 1 g sodium, expressed in mg.
SALT_G_TO_SODIUM_MG = 400

_NUM = re.compile(r"^-?\d+(?:\.\d+)?$")


def _norm(name: str) -> str:
    """Lowercase + collapse whitespace for robust name matching."""
    return re.sub(r"\s+", " ", name).strip().lower()


def parse_pdf_salt() -> dict[str, tuple[float, float]]:
    """Return {normalized name: (energy_kcal, salt_g)} for every PDF data row.

    Each row is `<name tokens> E Fat SatFat Carb Sugar Fibre Protein Salt`; the 8
    nutrient values are the last 8 contiguous numeric tokens (names may themselves
    contain numbers like "4 Pc" or "20 oz", but those are separated from the
    nutrient block by a word). Allergen check-marks trail the salt value as
    non-numeric glyphs and are stripped first. A name may wrap onto its own line,
    leaving the numbers on the following line — handled via `pending_name`.
    """
    reader = PdfReader(str(PDF_PATH))
    rows: dict[str, tuple[float, float]] = {}
    pending_name = None

    for page in reader.pages:
        for raw in (page.extract_text() or "").splitlines():
            toks = raw.split()
            if not toks:
                continue
            if not any(_NUM.match(t) for t in toks):
                # Pure-text line: either a wrapped item name awaiting its numbers
                # (consumed below) or a section header (harmlessly overwritten).
                pending_name = raw.strip()
                continue

            # Drop trailing non-numeric junk (allergen glyphs / blanks).
            while toks and not _NUM.match(toks[-1]):
                toks.pop()

            # Count the trailing run of contiguous numeric tokens.
            k = 0
            while k < len(toks) and _NUM.match(toks[-1 - k]):
                k += 1
            words = toks[: len(toks) - k]

            if k >= 8:
                name = " ".join(words) if words else pending_name
                pending_name = None
                if not name:
                    continue
                nums = [float(t) for t in toks[len(toks) - k :]][-8:]
                rows[_norm(name)] = (nums[0], nums[-1])  # energy, salt

    return rows


def main():
    salt_by_name = parse_pdf_salt()
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    items = data.values() if isinstance(data, dict) else data

    filled, skipped, problems = 0, 0, []
    for it in items:
        if it.get("sodium") is not None:
            skipped += 1  # already has sodium (drinks) — leave it
            continue
        row = salt_by_name.get(_norm(it["name"]))
        if row is None:
            problems.append(f"no PDF row for {it['name']!r}")
            continue
        energy, salt_g = row
        cal = it.get("calories")
        if cal is not None and abs(float(cal) - energy) > 1:
            problems.append(
                f"calorie mismatch for {it['name']!r}: json={cal} pdf={energy}"
            )
            continue
        it["sodium"] = round(salt_g * SALT_G_TO_SODIUM_MG)
        filled += 1

    if problems:
        raise SystemExit("Aborting, nothing written:\n  " + "\n  ".join(problems))

    JSON_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Derived sodium for {filled} items ({skipped} already had it).")
    still_missing = [
        it["name"] for it in items if it.get("sodium") is None
    ]
    if still_missing:
        print(f"Still missing ({len(still_missing)}): {still_missing}")


if __name__ == "__main__":
    main()
