#!/usr/bin/env python3
"""ทดสอบเบราว์เซอร์จำลอง (Chromium + Playwright) สำหรับ UI ใหม่ Pearl Ledger + lifecycle ตาม brief
รัน: python3 tests/e2e_v14.py http://localhost:8765/gym-log/
ข้อมูลที่ใช้ทั้งหมดเป็นข้อมูลสมมติ — ไม่ใช่ประวัติการฝึกจริงของใคร
ทดสอบในเบราว์เซอร์จำลอง ไม่ใช่ Safari บน iPhone จริง
"""
import sys, json, re, time, os, tempfile
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/gym-log/'
passed = failed = 0
fails = []

def check(name, cond, extra=''):
    global passed, failed
    if cond:
        passed += 1
        print('PASS', name)
    else:
        failed += 1
        fails.append(name)
        print('FAIL', name, extra)

def new_page(b, w=390, h=844, sw='block', offline=False):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, locale='th-TH',
                        service_workers=sw, accept_downloads=True)
    pg = ctx.new_page()
    pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    pg.on('console', lambda m: pg.errors.append('console:' + m.text) if m.type == 'error' else None)
    pg.goto(BASE + 'index.html')
    pg.wait_for_selector('.plan-row')
    return pg

def db(pg, store):
    return pg.evaluate("s => GymStorage.getAll(s)", store)

def workouts(pg):
    return db(pg, 'workouts')

def open_plan(pg, name):
    pg.click('.plan-row:has-text("%s")' % name)
    pg.wait_for_selector('[data-action=start-plan]')

def start_plan(pg, name):
    open_plan(pg, name)
    pg.click('[data-action=start-plan]')

def tab(pg, name):
    # 1.4: ตอนอยู่ในหน้าจด แถบเมนูล่างถูกซ่อน (โหมดโฟกัส) → ออกด้วยปุ่ม “หน้าแรก” ก่อน
    if not pg.locator('#tabs').is_visible():
        pg.click('.s-head .back')
        pg.wait_for_selector('#tabs', state='visible')
    pg.click('#tabs [data-tab=%s]' % name)

def go_home(pg):
    tab(pg, 'home')
    pg.wait_for_selector('.plan-row')

def fill(pg, row, w, r):
    pg.fill('input[data-pending="%d"][data-field=weight]' % row, str(w))
    pg.fill('input[data-pending="%d"][data-field=reps]' % row, str(r))

def confirm(pg):
    pg.click('.cf.cur')
    pg.wait_for_timeout(120)

def log_sets(pg, w, r, n=1):
    for _ in range(n):
        fill(pg, 0, w, r)
        confirm(pg)

def sheet_open(pg):
    return pg.locator('.sheet').count() > 0
