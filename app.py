#!/usr/bin/env python3
"""
Full-Stack Macro Tracker Web Application - Midnight Edition
===========================================================
- 24-Hour PDT Chronological Meal Timeline (No Breakfast/Lunch/Dinner dropdowns)
- PnL-Style Monthly Protein Goal Calendar (Green = Hit, Red = Missed, Grey = Untracked)
- Barcode Scanner Integration (Open Food Facts API)
- Midnight Palette (Pitch black #000000 with vibrant cyan accents)
- Goal Coach with 1-Click Custom Goal Transfer
- Zero external package dependencies - standard Python 3 only
"""
import http.server
import socketserver
import json
import urllib.parse
import urllib.request
import os
import mimetypes
import base64
import uuid
import re
import sqlite3
import csv
import io
from datetime import datetime, timedelta, timezone

PORT = int(os.environ.get("PORT", 8000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
UPLOAD_DIR = os.path.join(STATIC_DIR, "uploads")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# PDT Timezone helper (UTC - 7 hours)
PDT_TZ = timezone(timedelta(hours=-7))

def get_current_pdt_time_str():
    return datetime.now(PDT_TZ).strftime("%I:%M %p")

def get_current_pdt_date_str():
    return datetime.now(PDT_TZ).strftime("%Y-%m-%d")

# ----------------------------------------------------------------------
# 1. Nutrition Reference Database & Natural Language Estimator
# ----------------------------------------------------------------------
NUTRITION_DB = {
    # Proteins & Meats
    "chicken breast": {"unit": "100g", "cal": 165, "p": 31.0, "c": 0.0, "f": 3.6, "na": 74, "fib": 0.0},
    "chicken thigh": {"unit": "100g", "cal": 209, "p": 26.0, "c": 0.0, "f": 10.9, "na": 84, "fib": 0.0},
    "chicken": {"unit": "100g", "cal": 180, "p": 28.0, "c": 0.0, "f": 7.0, "na": 75, "fib": 0.0},
    "ground beef 80/20": {"unit": "100g", "cal": 254, "p": 17.2, "c": 0.0, "f": 20.0, "na": 66, "fib": 0.0},
    "ground beef 90/10": {"unit": "100g", "cal": 176, "p": 21.4, "c": 0.0, "f": 10.0, "na": 66, "fib": 0.0},
    "ground beef": {"unit": "100g", "cal": 215, "p": 20.0, "c": 0.0, "f": 15.0, "na": 66, "fib": 0.0},
    "beef": {"unit": "100g", "cal": 215, "p": 22.0, "c": 0.0, "f": 14.0, "na": 60, "fib": 0.0},
    "steak": {"unit": "100g", "cal": 240, "p": 25.0, "c": 0.0, "f": 15.0, "na": 58, "fib": 0.0},
    "salmon": {"unit": "100g", "cal": 208, "p": 20.0, "c": 0.0, "f": 13.0, "na": 59, "fib": 0.0},
    "tuna": {"unit": "100g", "cal": 132, "p": 28.0, "c": 0.0, "f": 1.0, "na": 45, "fib": 0.0},
    "canned tuna": {"unit": "can", "cal": 140, "p": 30.0, "c": 0.0, "f": 1.5, "na": 320, "fib": 0.0},
    "egg": {"unit": "large", "cal": 72, "p": 6.3, "c": 0.4, "f": 4.8, "na": 71, "fib": 0.0},
    "eggs": {"unit": "large", "cal": 72, "p": 6.3, "c": 0.4, "f": 4.8, "na": 71, "fib": 0.0},
    "egg white": {"unit": "large", "cal": 17, "p": 3.6, "c": 0.2, "f": 0.1, "na": 55, "fib": 0.0},
    "tofu": {"unit": "100g", "cal": 76, "p": 8.0, "c": 1.9, "f": 4.8, "na": 7, "fib": 0.3},
    "turkey breast": {"unit": "100g", "cal": 135, "p": 30.0, "c": 0.0, "f": 1.0, "na": 50, "fib": 0.0},
    "turkey": {"unit": "100g", "cal": 145, "p": 29.0, "c": 0.0, "f": 3.0, "na": 55, "fib": 0.0},
    "pork chop": {"unit": "100g", "cal": 210, "p": 26.0, "c": 0.0, "f": 11.0, "na": 65, "fib": 0.0},
    "shrimp": {"unit": "100g", "cal": 99, "p": 24.0, "c": 0.2, "f": 0.3, "na": 111, "fib": 0.0},
    "whey protein": {"unit": "scoop", "cal": 120, "p": 24.0, "c": 3.0, "f": 1.5, "na": 140, "fib": 0.5},
    "protein powder": {"unit": "scoop", "cal": 120, "p": 24.0, "c": 3.0, "f": 1.5, "na": 140, "fib": 0.5},
    "greek yogurt": {"unit": "cup", "cal": 130, "p": 15.0, "c": 6.0, "f": 4.0, "na": 65, "fib": 0.0},
    "cottage cheese": {"unit": "cup", "cal": 220, "p": 28.0, "c": 6.0, "f": 9.0, "na": 700, "fib": 0.0},

    # Carbohydrates & Grains
    "white rice": {"unit": "cup cooked", "cal": 205, "p": 4.2, "c": 44.5, "f": 0.4, "na": 0, "fib": 0.6},
    "brown rice": {"unit": "cup cooked", "cal": 218, "p": 4.5, "c": 45.8, "f": 1.6, "na": 2, "fib": 3.5},
    "jasmine rice": {"unit": "cup cooked", "cal": 205, "p": 4.2, "c": 44.5, "f": 0.4, "na": 0, "fib": 0.6},
    "rice": {"unit": "cup cooked", "cal": 205, "p": 4.2, "c": 44.5, "f": 0.4, "na": 0, "fib": 0.6},
    "oats": {"unit": "cup dry", "cal": 307, "p": 10.7, "c": 54.8, "f": 5.3, "na": 4, "fib": 8.2},
    "oatmeal": {"unit": "cup cooked", "cal": 158, "p": 6.0, "c": 27.0, "f": 3.2, "na": 115, "fib": 4.0},
    "pasta": {"unit": "cup cooked", "cal": 220, "p": 8.0, "c": 43.0, "f": 1.3, "na": 1, "fib": 2.5},
    "sourdough bread": {"unit": "slice", "cal": 95, "p": 3.8, "c": 18.5, "f": 0.8, "na": 190, "fib": 1.0},
    "whole wheat bread": {"unit": "slice", "cal": 80, "p": 4.0, "c": 13.0, "f": 1.0, "na": 130, "fib": 2.0},
    "bread": {"unit": "slice", "cal": 80, "p": 3.5, "c": 15.0, "f": 1.0, "na": 150, "fib": 1.0},
    "potato": {"unit": "medium", "cal": 160, "p": 4.3, "c": 36.6, "f": 0.2, "na": 15, "fib": 3.8},
    "sweet potato": {"unit": "medium", "cal": 112, "p": 2.0, "c": 26.0, "f": 0.1, "na": 70, "fib": 3.9},
    "quinoa": {"unit": "cup cooked", "cal": 222, "p": 8.1, "c": 39.4, "f": 3.6, "na": 13, "fib": 5.2},
    "bagel": {"unit": "whole", "cal": 280, "p": 11.0, "c": 56.0, "f": 1.5, "na": 450, "fib": 2.0},
    "tortilla": {"unit": "medium", "cal": 130, "p": 3.5, "c": 22.0, "f": 3.0, "na": 250, "fib": 1.5},

    # Fats & Oils
    "olive oil": {"unit": "tbsp", "cal": 119, "p": 0.0, "c": 0.0, "f": 13.5, "na": 0, "fib": 0.0},
    "butter": {"unit": "tbsp", "cal": 102, "p": 0.1, "c": 0.0, "f": 11.5, "na": 90, "fib": 0.0},
    "avocado": {"unit": "half", "cal": 120, "p": 1.5, "c": 6.0, "f": 11.0, "na": 5, "fib": 5.0},
    "peanut butter": {"unit": "tbsp", "cal": 94, "p": 4.0, "c": 3.2, "f": 8.0, "na": 75, "fib": 1.0},
    "almonds": {"unit": "oz", "cal": 164, "p": 6.0, "c": 6.0, "f": 14.0, "na": 1, "fib": 3.5},
    "cheese": {"unit": "oz", "cal": 110, "p": 7.0, "c": 0.5, "f": 9.0, "na": 180, "fib": 0.0},

    # Fruits & Vegetables
    "banana": {"unit": "medium", "cal": 105, "p": 1.3, "c": 27.0, "f": 0.3, "na": 1, "fib": 3.1},
    "apple": {"unit": "medium", "cal": 95, "p": 0.5, "c": 25.0, "f": 0.3, "na": 2, "fib": 4.4},
    "berries": {"unit": "cup", "cal": 65, "p": 1.0, "c": 15.0, "f": 0.5, "na": 1, "fib": 3.5},
    "blueberries": {"unit": "cup", "cal": 84, "p": 1.1, "c": 21.0, "f": 0.5, "na": 1, "fib": 3.6},
    "strawberries": {"unit": "cup", "cal": 49, "p": 1.0, "c": 11.7, "f": 0.5, "na": 1, "fib": 3.0},
    "broccoli": {"unit": "cup", "cal": 31, "p": 2.5, "c": 6.0, "f": 0.3, "na": 30, "fib": 2.4},
    "spinach": {"unit": "cup raw", "cal": 7, "p": 0.9, "c": 1.1, "f": 0.1, "na": 24, "fib": 0.7},
    "asparagus": {"unit": "cup", "cal": 27, "p": 3.0, "c": 5.0, "f": 0.2, "na": 3, "fib": 2.8},
    "salad": {"unit": "bowl", "cal": 50, "p": 2.0, "c": 9.0, "f": 1.0, "na": 50, "fib": 3.0},
    "green beans": {"unit": "cup", "cal": 31, "p": 1.8, "c": 7.0, "f": 0.2, "na": 6, "fib": 2.7},
    "carrots": {"unit": "cup", "cal": 52, "p": 1.2, "c": 12.0, "f": 0.3, "na": 88, "fib": 3.6},

    # Common Meals
    "stir fry": {"unit": "plate", "cal": 480, "p": 32.0, "c": 45.0, "f": 18.0, "na": 950, "fib": 4.0},
    "pizza": {"unit": "slice", "cal": 285, "p": 12.0, "c": 36.0, "f": 10.0, "na": 640, "fib": 2.0},
    "burger": {"unit": "whole", "cal": 550, "p": 30.0, "c": 40.0, "f": 30.0, "na": 980, "fib": 2.0},
    "burrito": {"unit": "whole", "cal": 750, "p": 38.0, "c": 85.0, "f": 26.0, "na": 1450, "fib": 8.0},
    "sandwich": {"unit": "whole", "cal": 420, "p": 24.0, "c": 42.0, "f": 16.0, "na": 850, "fib": 3.0},
}

def parse_portion(text):
    pattern = r'(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|g|gram|grams|cup|cups|slice|slices|tbsp|tsp|scoop|scoops|can|cans|piece|pieces|bowl|bowls|plate|plates|medium|large|small|whole)?'
    match = re.search(pattern, text.lower())
    if match:
        qty = float(match.group(1))
        unit = match.group(2) or "serving"
        return qty, unit
    return 1.0, "serving"

def calculate_multiplier(found_qty, found_unit, base_unit):
    base_unit = base_unit.lower()
    found_unit = found_unit.lower()
    if "100g" in base_unit:
        if found_unit in ["oz", "ounce", "ounces"]:
            return (found_qty * 28.35) / 100.0
        elif found_unit in ["g", "gram", "grams"]:
            return found_qty / 100.0
        elif found_unit in ["lb", "lbs", "pound", "pounds"]:
            return (found_qty * 453.6) / 100.0
        return found_qty * 1.5
    if "cup" in base_unit:
        return found_qty
    if "slice" in base_unit or "tbsp" in base_unit or "scoop" in base_unit or "large" in base_unit or "medium" in base_unit:
        return found_qty
    return found_qty

def estimate_meal_nutrition(description):
    items = []
    raw_segments = re.split(r'[,+\n]|(?:\band\b)', description, flags=re.IGNORECASE)
    total = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "sodium": 0.0, "fiber": 0.0}

    sorted_keys = sorted(NUTRITION_DB.keys(), key=len, reverse=True)

    for seg in raw_segments:
        seg = seg.strip()
        if not seg:
            continue
        qty, unit = parse_portion(seg)
        seg_lower = seg.lower()

        best_match = None
        for key in sorted_keys:
            if key in seg_lower:
                best_match = NUTRITION_DB[key]
                break

        if best_match:
            mult = calculate_multiplier(qty, unit, best_match["unit"])
            cal = round(best_match["cal"] * mult, 1)
            p = round(best_match["p"] * mult, 1)
            c = round(best_match["c"] * mult, 1)
            f = round(best_match["f"] * mult, 1)
            na = round(best_match["na"] * mult, 1)
            fib = round(best_match["fib"] * mult, 1)

            clean_name = seg[0].upper() + seg[1:] if len(seg) > 1 else seg.upper()
            item = {
                "name": clean_name,
                "portion": f"{qty:g} {unit}" if unit != "serving" else f"{qty:g} serving",
                "calories": cal,
                "protein": p,
                "carbs": c,
                "fat": f,
                "sodium": na,
                "fiber": fib
            }
            items.append(item)
            total["calories"] += cal
            total["protein"] += p
            total["carbs"] += c
            total["fat"] += f
            total["sodium"] += na
            total["fiber"] += fib
        else:
            clean_name = seg[0].upper() + seg[1:] if len(seg) > 1 else seg.upper()
            item = {
                "name": clean_name,
                "portion": f"{qty:g} {unit}",
                "calories": round(qty * 220, 1),
                "protein": round(qty * 14, 1),
                "carbs": round(qty * 22, 1),
                "fat": round(qty * 8, 1),
                "sodium": round(qty * 280, 1),
                "fiber": round(qty * 2, 1)
            }
            items.append(item)
            total["calories"] += item["calories"]
            total["protein"] += item["protein"]
            total["carbs"] += item["carbs"]
            total["fat"] += item["fat"]
            total["sodium"] += item["sodium"]
            total["fiber"] += item["fiber"]

    for k in total:
        total[k] = round(total[k], 1)

    return {"items": items, "totals": total}

def lookup_barcode(code):
    """Queries Open Food Facts for packaged product macros."""
    clean_code = code.strip()
    url = f"https://world.openfoodfacts.org/api/v2/product/{clean_code}.json"
    req = urllib.request.Request(url, headers={"User-Agent": "MacroTrackerPro/1.0 (contact@example.com)"})
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
            if data.get("status") == 1 and "product" in data:
                prod = data["product"]
                nutriments = prod.get("nutriments", {})
                name = prod.get("product_name") or prod.get("generic_name") or f"Product {clean_code}"
                brand = prod.get("brands", "")
                full_name = f"{brand} {name}".strip() if brand else name
                serving = prod.get("serving_size", "1 serving (100g)")

                # Per serving if available, otherwise per 100g
                cal = float(nutriments.get("energy-kcal_serving", nutriments.get("energy-kcal_100g", 0)))
                p = float(nutriments.get("proteins_serving", nutriments.get("proteins_100g", 0)))
                c = float(nutriments.get("carbohydrates_serving", nutriments.get("carbohydrates_100g", 0)))
                f = float(nutriments.get("fat_serving", nutriments.get("fat_100g", 0)))
                na_g = float(nutriments.get("sodium_serving", nutriments.get("sodium_100g", 0)))
                na = round(na_g * 1000, 1) # convert to mg
                fib = float(nutriments.get("fiber_serving", nutriments.get("fiber_100g", 0)))

                return {
                    "found": True,
                    "item": {
                        "name": full_name,
                        "portion": serving,
                        "calories": round(cal, 1),
                        "protein": round(p, 1),
                        "carbs": round(c, 1),
                        "fat": round(f, 1),
                        "sodium": round(na, 1),
                        "fiber": round(fib, 1)
                    }
                }
    except Exception as e:
        print(f"Barcode fetch error: {e}")
    return {"found": False, "error": "Product not found or barcode invalid"}

# ----------------------------------------------------------------------
# 2. Database Persistence Layer
# ----------------------------------------------------------------------
def determine_db_path():
    cand = os.path.join(BASE_DIR, "macro_tracker.db")
    try:
        conn = sqlite3.connect(cand)
        conn.execute("CREATE TABLE IF NOT EXISTS _test_lock (id int)")
        conn.commit()
        conn.close()
        return cand
    except Exception:
        return "/tmp/macro_tracker.db"

DB_PATH = determine_db_path()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS meals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT DEFAULT '',
        meal_type TEXT DEFAULT 'Meal',
        name TEXT NOT NULL,
        portion TEXT,
        calories REAL DEFAULT 0,
        protein REAL DEFAULT 0,
        carbs REAL DEFAULT 0,
        fat REAL DEFAULT 0,
        sodium REAL DEFAULT 0,
        fiber REAL DEFAULT 0,
        custom_nutrients TEXT DEFAULT '{}',
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    # Check if 'time' column exists for existing DBs
    try:
        c.execute("SELECT time FROM meals LIMIT 1")
    except Exception:
        c.execute("ALTER TABLE meals ADD COLUMN time TEXT DEFAULT ''")

    c.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        calorie_target REAL DEFAULT 2400,
        protein_target REAL DEFAULT 175,
        carbs_target REAL DEFAULT 260,
        fat_target REAL DEFAULT 70,
        sodium_target REAL DEFAULT 2300,
        fiber_target REAL DEFAULT 35,
        week_start_day TEXT DEFAULT 'Monday',
        custom_nutrients TEXT DEFAULT '["sodium", "fiber"]',
        theme TEXT DEFAULT 'dark'
    );
    """)
    c.execute("""
    INSERT OR IGNORE INTO settings (id, calorie_target, protein_target, carbs_target, fat_target, sodium_target, fiber_target, week_start_day, custom_nutrients, theme)
    VALUES (1, 2400, 175, 260, 70, 2300, 35, 'Monday', '["sodium", "fiber"]', 'dark');
    """)
    conn.commit()
    conn.close()

def get_settings():
    conn = get_db()
    row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    conn.close()
    if row:
        d = dict(row)
        try:
            d["custom_nutrients"] = json.loads(d["custom_nutrients"])
        except Exception:
            d["custom_nutrients"] = ["sodium", "fiber"]
        return d
    return {
        "calorie_target": 2400, "protein_target": 175, "carbs_target": 260,
        "fat_target": 70, "sodium_target": 2300, "fiber_target": 35,
        "week_start_day": "Monday", "custom_nutrients": ["sodium", "fiber"], "theme": "dark"
    }

def update_settings(data):
    conn = get_db()
    custom_json = json.dumps(data.get("custom_nutrients", ["sodium", "fiber"]))
    conn.execute("""
    UPDATE settings SET
        calorie_target = ?, protein_target = ?, carbs_target = ?, fat_target = ?,
        sodium_target = ?, fiber_target = ?, week_start_day = ?, custom_nutrients = ?, theme = ?
    WHERE id = 1
    """, (
        float(data.get("calorie_target", 2400)),
        float(data.get("protein_target", 175)),
        float(data.get("carbs_target", 260)),
        float(data.get("fat_target", 70)),
        float(data.get("sodium_target", 2300)),
        float(data.get("fiber_target", 35)),
        data.get("week_start_day", "Monday"),
        custom_json,
        data.get("theme", "dark")
    ))
    conn.commit()
    conn.close()
    return get_settings()

def add_meal(m):
    conn = get_db()
    c = conn.cursor()
    custom_json = json.dumps(m.get("custom_nutrients", {}))
    # Record current PDT time if not provided
    pdt_time = m.get("time") or get_current_pdt_time_str()
    c.execute("""
    INSERT INTO meals (date, time, meal_type, name, portion, calories, protein, carbs, fat, sodium, fiber, custom_nutrients, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        m.get("date"),
        pdt_time,
        m.get("meal_type", "Meal"),
        m.get("name"),
        m.get("portion", "1 serving"),
        float(m.get("calories", 0)),
        float(m.get("protein", 0)),
        float(m.get("carbs", 0)),
        float(m.get("fat", 0)),
        float(m.get("sodium", 0)),
        float(m.get("fiber", 0)),
        custom_json,
        m.get("image_url", "")
    ))
    new_id = c.lastrowid
    conn.commit()
    conn.close()
    return get_meal_by_id(new_id)

def get_meal_by_id(meal_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM meals WHERE id = ?", (meal_id,)).fetchone()
    conn.close()
    if row:
        item = dict(row)
        try:
            item["custom_nutrients"] = json.loads(item["custom_nutrients"])
        except Exception:
            item["custom_nutrients"] = {}
        return item
    return None

def delete_meal(meal_id):
    conn = get_db()
    conn.execute("DELETE FROM meals WHERE id = ?", (meal_id,))
    conn.commit()
    conn.close()
    return True

def get_meals_by_date(target_date):
    """Returns meals sorted chronologically for the 24-hour timeline view."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM meals WHERE date = ? ORDER BY id ASC", (target_date,)).fetchall()
    conn.close()

    meals = []
    daily_totals = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "sodium": 0.0, "fiber": 0.0}

    for r in rows:
        item = dict(r)
        try:
            item["custom_nutrients"] = json.loads(item["custom_nutrients"])
        except Exception:
            item["custom_nutrients"] = {}
        meals.append(item)

        daily_totals["calories"] += item["calories"]
        daily_totals["protein"] += item["protein"]
        daily_totals["carbs"] += item["carbs"]
        daily_totals["fat"] += item["fat"]
        daily_totals["sodium"] += item["sodium"]
        daily_totals["fiber"] += item["fiber"]

    for k in daily_totals:
        daily_totals[k] = round(daily_totals[k], 1)

    return {
        "date": target_date,
        "meals": meals,
        "totals": daily_totals
    }

def get_monthly_pnl_calendar(year_month):
    """
    Computes PnL-style protein tracking status for every day in YYYY-MM.
    Status: 'hit' (Green), 'missed' (Red), or 'untracked' (Grey)
    """
    settings = get_settings()
    p_target = float(settings.get("protein_target", 175))

    conn = get_db()
    # Group by date and sum protein
    rows = conn.execute("""
    SELECT date, SUM(protein) as total_protein, COUNT(id) as meal_count, SUM(calories) as total_calories
    FROM meals
    WHERE date LIKE ?
    GROUP BY date
    """, (f"{year_month}%",)).fetchall()
    conn.close()

    data_map = {}
    for r in rows:
        data_map[r["date"]] = {
            "protein": round(r["total_protein"], 1),
            "calories": round(r["total_calories"], 1),
            "meal_count": r["meal_count"]
        }

    # Build full month list
    parts = year_month.split("-")
    year = int(parts[0])
    month = int(parts[1])

    import calendar
    _, num_days = calendar.monthrange(year, month)

    days_result = []
    summary = {"hit": 0, "missed": 0, "untracked": 0}

    for d in range(1, num_days + 1):
        d_str = f"{year:04d}-{month:02d}-{d:02d}"
        dt = datetime(year, month, d)
        
        if d_str in data_map:
            logged_p = data_map[d_str]["protein"]
            if logged_p >= p_target:
                status = "hit"
                summary["hit"] += 1
            else:
                status = "missed"
                summary["missed"] += 1
            days_result.append({
                "date": d_str,
                "day": d,
                "weekday": dt.weekday(), # 0=Mon, 6=Sun
                "protein": logged_p,
                "target": p_target,
                "status": status,
                "meal_count": data_map[d_str]["meal_count"]
            })
        else:
            summary["untracked"] += 1
            days_result.append({
                "date": d_str,
                "day": d,
                "weekday": dt.weekday(),
                "protein": 0,
                "target": p_target,
                "status": "untracked",
                "meal_count": 0
            })

    return {
        "year_month": year_month,
        "protein_target": p_target,
        "summary": summary,
        "days": days_result
    }

def get_weekly_analytics(ref_date_str):
    settings = get_settings()
    week_start = settings.get("week_start_day", "Monday")
    ref_date = datetime.strptime(ref_date_str, "%Y-%m-%d").date()

    if week_start.lower() == "sunday":
        offset = (ref_date.weekday() + 1) % 7
    else:
        offset = ref_date.weekday()

    start_date = ref_date - timedelta(days=offset)
    days_data = []
    week_sums = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "sodium": 0.0, "fiber": 0.0}
    active_days_count = 0

    for i in range(7):
        current_d = start_date + timedelta(days=i)
        d_str = current_d.strftime("%Y-%m-%d")
        day_res = get_meals_by_date(d_str)
        t = day_res["totals"]

        if len(day_res["meals"]) > 0:
            active_days_count += 1

        days_data.append({
            "date": d_str,
            "day_name": current_d.strftime("%a"),
            "meal_count": len(day_res["meals"]),
            "totals": t
        })

        week_sums["calories"] += t["calories"]
        week_sums["protein"] += t["protein"]
        week_sums["carbs"] += t["carbs"]
        week_sums["fat"] += t["fat"]
        week_sums["sodium"] += t["sodium"]
        week_sums["fiber"] += t["fiber"]

    divisor = 7.0
    averages = {}
    for k, v in week_sums.items():
        averages[k] = round(v / divisor, 1)

    end_date = start_date + timedelta(days=6)

    return {
        "week_start": start_date.strftime("%Y-%m-%d"),
        "week_end": end_date.strftime("%Y-%m-%d"),
        "active_days": active_days_count,
        "days": days_data,
        "week_totals": {k: round(v, 1) for k, v in week_sums.items()},
        "week_averages": averages,
        "targets": {
            "calories": settings["calorie_target"],
            "protein": settings["protein_target"],
            "carbs": settings["carbs_target"],
            "fat": settings["fat_target"],
            "sodium": settings["sodium_target"],
            "fiber": settings["fiber_target"]
        }
    }

def export_data(format_type="json"):
    conn = get_db()
    rows = conn.execute("SELECT * FROM meals ORDER BY date DESC, id DESC").fetchall()
    conn.close()

    data = []
    for r in rows:
        item = dict(r)
        try:
            item["custom_nutrients"] = json.loads(item["custom_nutrients"])
        except Exception:
            item["custom_nutrients"] = {}
        data.append(item)

    if format_type == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Date", "Time (PDT)", "Food Name", "Portion", "Calories (kcal)", "Protein (g)", "Carbs (g)", "Fat (g)", "Sodium (mg)", "Fiber (g)", "Image"])
        for m in data:
            writer.writerow([
                m["date"], m.get("time", ""), m["name"], m["portion"],
                m["calories"], m["protein"], m["carbs"], m["fat"], m["sodium"], m["fiber"],
                m.get("image_url", "")
            ])
        return output.getvalue()
    return data

# ----------------------------------------------------------------------
# 3. HTTP Request Handler & RESTful API
# ----------------------------------------------------------------------
class MacroTrackerHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message, status=400):
        self.send_json({"error": message}, status=status)

    def parse_body(self):
        content_len = int(self.headers.get("Content-Length", 0))
        if content_len > 0:
            raw_data = self.rfile.read(content_len).decode("utf-8")
            try:
                return json.loads(raw_data)
            except Exception:
                return {}
        return {}

    def serve_static(self, filepath):
        if not os.path.exists(filepath) or os.path.isdir(filepath):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")
            return

        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode("utf-8"))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/" or path == "/index.html":
            self.serve_static(os.path.join(STATIC_DIR, "index.html"))
            return
        elif path.startswith("/static/"):
            rel_path = path[len("/static/"):]
            self.serve_static(os.path.join(STATIC_DIR, rel_path))
            return

        # APIs
        if path == "/api/settings":
            self.send_json(get_settings())
            return
        elif path == "/api/meals":
            date_param = query.get("date", [get_current_pdt_date_str()])[0]
            self.send_json(get_meals_by_date(date_param))
            return
        elif path == "/api/weekly":
            date_param = query.get("date", [get_current_pdt_date_str()])[0]
            self.send_json(get_weekly_analytics(date_param))
            return
        elif path == "/api/calendar":
            ym_param = query.get("month", [datetime.now(PDT_TZ).strftime("%Y-%m")])[0]
            self.send_json(get_monthly_pnl_calendar(ym_param))
            return
        elif path == "/api/barcode":
            code = query.get("code", [""])[0]
            if not code:
                self.send_error_json("Missing barcode", 400)
                return
            res = lookup_barcode(code)
            self.send_json(res)
            return
        elif path == "/api/export":
            fmt = query.get("format", ["json"])[0]
            data = export_data(fmt)
            if fmt == "csv":
                body = data.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="macro_tracker_export.csv"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_json(data)
            return

        self.send_error_json("Not found", 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        payload = self.parse_body()

        if path == "/api/settings":
            updated = update_settings(payload)
            self.send_json(updated)
            return
        elif path == "/api/estimate":
            desc = payload.get("description", "")
            res = estimate_meal_nutrition(desc)
            self.send_json(res)
            return
        elif path == "/api/upload":
            image_data = payload.get("image", "")
            if not image_data:
                self.send_error_json("No image data provided", 400)
                return
            try:
                if "," in image_data:
                    header, b64_str = image_data.split(",", 1)
                    ext = ".png" if "png" in header else ".jpg"
                else:
                    b64_str = image_data
                    ext = ".jpg"

                file_id = f"meal_{uuid.uuid4().hex[:10]}{ext}"
                file_path = os.path.join(UPLOAD_DIR, file_id)
                with open(file_path, "wb") as f:
                    f.write(base64.b64decode(b64_str))

                self.send_json({"url": f"/static/uploads/{file_id}"})
            except Exception as e:
                self.send_error_json(f"Upload failed: {str(e)}", 500)
            return
        elif path == "/api/meals":
            pdt_time = payload.get("time") or get_current_pdt_time_str()
            m_date = payload.get("date", get_current_pdt_date_str())
            img = payload.get("image_url", "")

            if "items" in payload and isinstance(payload["items"], list):
                created = []
                for item in payload["items"]:
                    item_data = {
                        "date": m_date,
                        "time": pdt_time,
                        "meal_type": "Meal",
                        "name": item.get("name", "Food Item"),
                        "portion": item.get("portion", "1 serving"),
                        "calories": float(item.get("calories", 0)),
                        "protein": float(item.get("protein", 0)),
                        "carbs": float(item.get("carbs", 0)),
                        "fat": float(item.get("fat", 0)),
                        "sodium": float(item.get("sodium", 0)),
                        "fiber": float(item.get("fiber", 0)),
                        "custom_nutrients": item.get("custom_nutrients", {}),
                        "image_url": img
                    }
                    created.append(add_meal(item_data))
                self.send_json({"created": created})
            else:
                if not payload.get("name") or not payload.get("date"):
                    self.send_error_json("Missing meal name or date", 400)
                    return
                if not payload.get("time"):
                    payload["time"] = pdt_time
                self.send_json(add_meal(payload))
            return

        self.send_error_json("Not found", 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/meals/"):
            try:
                meal_id = int(path.split("/")[-1])
                delete_meal(meal_id)
                self.send_json({"success": True})
            except Exception as e:
                self.send_error_json(str(e), 400)
            return
        self.send_error_json("Not found", 404)

def run_server(port=PORT):
    init_db()
    server_address = ("0.0.0.0", port)
    httpd = http.server.ThreadingHTTPServer(server_address, MacroTrackerHandler)
    print(f"Macro Tracker Midnight Server running at http://0.0.0.0:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server(PORT)
