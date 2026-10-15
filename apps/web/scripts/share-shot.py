"""Regenerates the landing link-preview image (apps/web/public/share-preview.png) from the live site, in dark mode.
Run from the repo root: python3 apps/web/scripts/share-shot.py (needs playwright with chromium installed)."""
import glob
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=glob.glob("/Users/nicktillmann/Library/Caches/ms-playwright/chromium-1187/chrome-mac/*.app/Contents/MacOS/*")[0], args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width":1200,"height":630}, color_scheme="dark")
    pg = ctx.new_page()
    pg.add_init_script("localStorage.setItem('theme','dark')")
    pg.goto("https://www.peerfolio.org/", wait_until="networkidle")
    pg.wait_for_function("document.querySelector('h1') && /with friends\s*$/.test(document.querySelector('h1').innerText)", timeout=40000)
    pg.add_style_tag(content=".caret{display:none !important}")
    pg.wait_for_timeout(400)
    pg.screenshot(path="apps/web/public/share-preview.png")
    b.close()
