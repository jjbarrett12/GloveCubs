"""
Hospeco image scraper: reads a CSV of gloves, searches Hospeco by item number,
scrapes product page image URLs, and writes a new CSV with Image_URLs (pipe-separated).
Input: Hospeco Gloves.csv (expects item numbers in column "Unnamed: 6" or set ITEM_COLUMN).
Output: Hospeco_Gloves_With_Images.csv
"""
import pandas as pd
import requests
from bs4 import BeautifulSoup
import time

INPUT_FILE = "Hospeco Gloves.csv"
OUTPUT_FILE = "Hospeco_Gloves_With_Images.csv"
# Column containing item number / SKU for search. Change if your CSV has a named column (e.g. "SKU", "Item #").
ITEM_COLUMN = "Unnamed: 6"


def get_product_images(item_number):
    search_url = f"https://www.hospecobrands.com/search?q={item_number}"
    headers = {
        "User-Agent": "Mozilla/5.0"
    }
    try:
        r = requests.get(search_url, headers=headers, timeout=10)
        soup = BeautifulSoup(r.text, "lxml")
        product_link = soup.select_one("a.product-item-link")
        if not product_link:
            return ""
        product_url = product_link["href"]
        r = requests.get(product_url, headers=headers, timeout=10)
        soup = BeautifulSoup(r.text, "lxml")
        images = []
        for img in soup.select(".gallery-placeholder img"):
            src = img.get("src")
            if src and src not in images:
                images.append(src)
        return "|".join(images)
    except Exception:
        return ""


def main():
    df = pd.read_csv(INPUT_FILE)
    if ITEM_COLUMN not in df.columns:
        raise SystemExit(f'Column "{ITEM_COLUMN}" not found. Columns: {list(df.columns)}. Set ITEM_COLUMN at top of script.')
    image_urls = []
    for index, row in df.iterrows():
        item = str(row[ITEM_COLUMN]).strip()
        print("Searching:", item)
        images = get_product_images(item)
        image_urls.append(images)
        time.sleep(1)
    df["Image_URLs"] = image_urls
    df.to_csv(OUTPUT_FILE, index=False)
    print("DONE. File saved:", OUTPUT_FILE)


if __name__ == "__main__":
    main()
