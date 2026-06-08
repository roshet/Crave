"""One-off parser: Taco Bell nutrition PDF -> inspection dump / tacobell_items.json.

PDF columns (validated against Crunchwrap Supreme = 530 20 7 0 20 1210 74 6 6 2 15):
  1 Calories  2 Total Fat  3 Sat Fat  4 Trans Fat  5 Cholesterol
  6 Sodium    7 Total Carb 8 Fiber   9 Sugars     10 Added Sugars  11 Protein
"""
import re
import sys
from pypdf import PdfReader

PDF = r"C:\Users\rohan\Downloads\Nutrition-Information-_-Taco-Bell®.pdf"

# Known menu-section headers as they appear in the PDF (document order varies).
SECTION_HEADERS = {
    "New", "New - Dirty Sodas", "Cantina Chicken Menu", "Tacos", "Burritos",
    "Quesadillas", "Nachos", "Specialties", "Sides & Sweets", "Drinks",
    "Luxe Value Menu", "Veggie Cravings", "Breakfast (Regional)", "Breakfast",
    "Cantina Menu", "Cantina Beer, Wine and Spirits", "Las Vegas Cantina Menu",
}

COL_LABELS = {
    "Calories", "Total Fat (g)", "Sodium (mg)", "Total Carbohydrates (g)",
    "Sugars (g)", "Added Sugars (g)", "Protein (g)", "Saturated Fat (g)",
    "Trans Fat (g)", "Cholesterol (mg)", "Dietary Fiber (g)", "Close", "!",
    "Full Nutrition Information", "Click on a nutrition heading to sort the menu in real-time.",
}

# Alcohol, regional one-offs, and pure re-listings of items already in core sections.
EXCLUDE_SECTIONS = {
    "Cantina Beer, Wine and Spirits", "Las Vegas Cantina Menu",
    "Luxe Value Menu", "Veggie Cravings", "Cantina Menu",
}

# PDF section -> our base category (entrees/sides). Drinks & sauces decided by name.
SECTION_CATEGORY = {
    "Tacos": "tacos", "Burritos": "burritos", "Quesadillas": "quesadillas",
    "Nachos": "nachos", "Specialties": "specialties",
    "Breakfast (Regional)": "breakfast", "Breakfast": "breakfast",
    "Cantina Chicken Menu": "specialties",
}


def clean_name(s):
    s = s.replace("(V)", "").replace("(VG)", "")
    s = s.encode("ascii", "ignore").decode()   # drop ®/™ and stray replacement bytes
    s = re.sub(r"\s+", " ", s).strip(" -")
    return s.strip()


def is_junk(s):
    low = s.lower()
    return (
        bool(re.search(r"\d{1,2}/\d{1,2}/\d{2}", s))      # date stamp
        or " pm" in low or " am" in low                      # time stamp
        or "full nutrition" in low or "taco bell -" in low
        or "tacobell.com" in low or low.startswith("http")
    )


def categorize(section, name):
    low = name.lower()
    sauce_kw = ("dipping sauce", "packet", "creamy jalapeno", "guacamole",
                "sour cream", "red sauce")
    drink_kw = ("freeze", "soda", "dew", "pepsi", "brisk", "lemonade", "limonada",
                "refresca", "coffee", "water", "tea", "dr pepper", "mug ", "starry",
                "juice", "milk", "agua", "baja blast", "refresco")
    if any(k in low for k in sauce_kw):
        return "sauces", "sauce"
    if "creamer" in low and "coffee" not in low:   # standalone creamer add-in, not a coffee
        return "sauces", "sauce"
    base = SECTION_CATEGORY.get(section)
    if section in ("Drinks", "New - Dirty Sodas") or (base is None and any(k in low for k in drink_kw)):
        return "drinks", "drink"
    if section == "Sides & Sweets":
        sweet_kw = ("cinnabon", "cinnamon", "twists", "delight", "churro", "dessert", "cookie")
        return ("sweets" if any(k in low for k in sweet_kw) else "sides"), "food"
    if base:
        return base, "food"
    # "New" and leftovers: infer from name
    if any(k in low for k in ("taco",)):     return "tacos", "food"
    if any(k in low for k in ("burrito",)):   return "burritos", "food"
    if any(k in low for k in ("quesadilla", "quesarito")): return "quesadillas", "food"
    if any(k in low for k in ("nachos", "fries")): return "nachos", "food"
    if any(k in low for k in ("nugget", "strip", "crunchwrap")): return "specialties", "food"
    return "specialties", "food"

NUM = r"<?\d[\d,]*(?:\.\d+)?"
# trailing run of exactly 11 numeric tokens
TAIL = re.compile(r"^(?P<name>.*?)\s*(?P<nums>(?:%s)(?:\s+(?:%s)){10})\s*$" % (NUM, NUM))


def num(tok):
    tok = tok.replace(",", "").lstrip("<")
    return float(tok)


def main():
    r = PdfReader(PDF)
    section = "New"
    name_buf = []
    items = []   # dicts
    seen = set()
    for p in r.pages:
        for raw in (p.extract_text() or "").splitlines():
            s = raw.strip()
            if not s or s in COL_LABELS:
                continue
            if s in SECTION_HEADERS:
                section = s
                name_buf = []
                continue
            m = TAIL.match(s)
            if not m:
                if is_junk(s):
                    name_buf = []
                elif len(s) < 60 and not s.startswith(("Menu data", "Except", "nutrition", "alter", "Bell ")):
                    name_buf.append(s)
                continue
            prefix = m.group("name").strip()
            raw_name = (" ".join(name_buf) + " " + prefix).strip()
            name_buf = []
            if section in EXCLUDE_SECTIONS or is_junk(raw_name):
                continue
            toks = m.group("nums").split()
            if len(toks) != 11:
                continue
            name = clean_name(raw_name)
            if not name:
                continue
            key = name.lower()
            if key in seen:        # dedupe across sections
                continue
            seen.add(key)
            cal, fat, _sf, _tf, _ch, sod, carb, _fb, sug, _as, prot = [num(t) for t in toks]
            cat, itype = categorize(section, name)
            items.append({"section": section, "name": name, "category": cat,
                          "item_type": itype, "calories": cal, "protein": prot,
                          "fat": fat, "carbohydrate": carb, "sugars": sug, "sodium": sod})

    from collections import Counter
    print("TOTAL items (deduped, core sections):", len(items))
    print("\nby category:")
    for cat, c in Counter(i["category"] for i in items).most_common():
        print(f"  {c:3d}  {cat}")
    print("\nby item_type:", dict(Counter(i["item_type"] for i in items)))

    # Build final JSON (list-of-objects shape, matching mcdonalds_items.json).
    import json
    out = []
    for n, it in enumerate(items):
        out.append({
            "item_id": 600000 + n,
            "name": it["name"],
            "restaurant": "tacobell",
            "category": it["category"],
            "item_type": it["item_type"],
            "calories": it["calories"],
            "protein": it["protein"],
            "fat": it["fat"],
            "carbohydrate": it["carbohydrate"],
            "sugars": it["sugars"],
            "sodium": it["sodium"],
        })
    with open("tacobell_items.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"\nWROTE tacobell_items.json ({len(out)} items, ids 600000-{600000+len(out)-1})")


if __name__ == "__main__":
    main()
