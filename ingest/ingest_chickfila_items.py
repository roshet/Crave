import json
import re
import unicodedata
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

URL = "https://www.chick-fil-a.com/nutrition-allergens"

# --------------------------------------------------
# Helpers
# --------------------------------------------------

def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")

def normalize_text(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()

def clean_number(text):
    if not text:
        return None
    text = text.lower().replace(",", "").strip()
    if text in {"—", "-", "n/a"}:
        return None
    m = re.search(r"\d+(\.\d+)?", text)
    return float(m.group()) if m else None

def normalize_header_text(s: str) -> str:
    s = s.lower()
    s = s.replace("(g)", "").replace("(mg)", "")
    s = s.replace("total ", "")
    return re.sub(r"\s+", " ", s).strip()

def normalize_section_id(s: str) -> str:
    s = normalize_text(s)
    s = s.lower()
    s = re.sub(r"\(.*?\)", "", s)   # remove parentheticals
    s = s.replace("entrées", "entrees")
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")

# --------------------------------------------------
# Nutrition schema (matches your recommender)
# --------------------------------------------------

EMPTY_NUTRITION = {
    "calories": None,
    "fat": None,
    "carbs": None,
    "sugars": None,
    "protein": None,
    "sodium": None,
}

# --------------------------------------------------
# Sidebar-driven category extraction (NOT guessing)
# --------------------------------------------------

def extract_sidebar_sections(soup: BeautifulSoup) -> list[str]:
    """
    Extract section order from the sidebar:
    <li data-id="Breakfast">, <li data-id="Entrées">, etc.
    Order matters.
    """
    sections = []
    for li in soup.select("aside li[data-id]"):
        raw = li.get("data-id")
        if raw:
            sections.append(normalize_section_id(raw))
    return sections

# --------------------------------------------------
# Main
# --------------------------------------------------

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(URL, timeout=60000)

        for txt in ["Accept", "Accept All", "I Accept"]:
            btn = page.get_by_role("button", name=txt)
            if btn.count():
                btn.first.click(force=True)
                break

        for _ in range(25):
            page.mouse.wheel(0, 2000)
            page.wait_for_timeout(250)

        html = page.content()
        browser.close()

    soup = BeautifulSoup(html, "lxml")

    tables = soup.select("table")
    sections = extract_sidebar_sections(soup)

    print(f"Found {len(tables)} tables")
    print(f"Sections detected: {sections}")

    if not sections:
        raise RuntimeError("No sidebar sections found — site layout changed")

    # --------------------------------------------------
    # Deterministic mapping:
    # Tables appear in the same order as sidebar sections.
    # Tables are grouped per section.
    # --------------------------------------------------

    tables_per_section = len(tables) // len(sections)
    if tables_per_section == 0:
        raise RuntimeError("Unexpected table/section ratio")

    items = {}

    section_index = 0
    current_section = sections[section_index]

    for table_index, table in enumerate(tables):
        if table_index > 0 and table_index % tables_per_section == 0:
            section_index = min(section_index + 1, len(sections) - 1)
            current_section = sections[section_index]

        headers = [
            normalize_header_text(
                normalize_text(th.get_text(" ", strip=True))
            )
            for th in table.select("thead th")
        ]

        if not headers:
            continue

        for row in table.select("tbody tr"):
            cells = row.find_all("td")
            if len(cells) != len(headers):
                continue

            link = row.find("a")
            if not link:
                continue

            name = normalize_text(link.get_text(strip=True))
            if not name or name.lower() == "find restaurants":
                continue

            nutrition = EMPTY_NUTRITION.copy()

            for header, cell in zip(headers, cells):
                value = clean_number(cell.get_text(" ", strip=True))
                if value is None:
                    continue

                # EXACT column matching — no substring bugs
                if header == "calories":
                    nutrition["calories"] = value
                elif header == "fat":
                    nutrition["fat"] = value          # total fat only
                elif header == "carbohydrates":
                    nutrition["carbs"] = value
                elif header in {"sugar", "sugars"}:
                    nutrition["sugars"] = value
                elif header == "protein":
                    nutrition["protein"] = value
                elif header == "sodium":
                    nutrition["sodium"] = value

            if nutrition["calories"] is None:
                continue

            item_id = f"chickfila_{slugify(name)}"
            item_type = "drink" if current_section == "drinks" else "food"

            items[item_id] = {
                "item_id": item_id,
                "name": name,
                "restaurant": "chickfila",
                "category": current_section,
                "item_type": item_type,
                **nutrition,
            }

    print(f"Extracted {len(items)} Chick-fil-A items")

    with open("chickfila_items.json", "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2)

if __name__ == "__main__":
    main()
