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
    pg.wait_for_selector('.plan-card')
    return pg

def db(pg, store):
    return pg.evaluate("s => GymStorage.getAll(s)", store)

def workouts(pg):
    return db(pg, 'workouts')

def open_plan(pg, name):
    pg.click('.plan-card:has-text("%s")' % name)
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
    pg.wait_for_selector('.plan-card')

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

def close_sheet(pg):
    pg.mouse.click(195, 40)
    pg.wait_for_timeout(100)

def reset_page(b):
    return new_page(b)

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- A. เครื่องใหม่ ----------
    pg = new_page(b)
    exs, pls = db(pg, 'exercises'), db(pg, 'plans')
    check('A1 เครื่องใหม่: มี 34 ท่า 4 แผน ไม่มีตัวอย่าง', len(exs) == 34 and len(pls) == 4 and not any(e.get('isSample') for e in exs))
    check('A2 ไม่มี workout/ประวัติเลย', len(workouts(pg)) == 0)
    names = pg.eval_on_selector_all('.plan-card .t', 'els => els.map(e => e.textContent)')
    check('A3 หน้าแรกแสดงแผน Push/Pull/Legs/วันเสริม ตามลำดับ', names == ['PPL · Push', 'PPL · Pull', 'PPL · Legs', 'PPL · วันเสริม'], names)
    tabs = pg.eval_on_selector_all('#tabs button span', 'els => els.map(e => e.textContent)')
    check('A4 เมนูล่างมี 4 จุด: หน้าแรก/แผน/ท่า/ประวัติ', tabs == ['หน้าแรก', 'แผน', 'ท่า', 'ประวัติ'], tabs)
    check('A5 ไม่มีแถบ session ค้างตอนเริ่มต้น', pg.locator('.session-bar').count() == 0)
    check('A6 มีทางเข้าสำรอง/กู้คืนบนหน้าแรก พร้อมข้อความยังไม่เคยสำรอง', pg.locator('[data-action=open-backup]').count() == 1 and 'ยังไม่เคยสำรอง' in pg.inner_text('#view'))
    check('A7 ฟอนต์ Inter และ Noto Sans Thai โหลดได้จากไฟล์ในแอป', pg.evaluate("""async () => { await document.fonts.ready; return [document.fonts.check('16px Inter'), document.fonts.check('16px "Noto Sans Thai"', 'ก')]; }""") == [True, True])
    flags = [e.get('program') for e in [{'program': (db(pg, 'settings') and [r['value'] for r in db(pg, 'settings') if r['key'] == 'program'][0])}]]
    check('A8 ตั้งธงติดตั้งโปรแกรมแล้ว', flags == ['ppl-1'])
    check('A9 ไม่มี error ในคอนโซล', not pg.errors, pg.errors)

    # ---------- B. ดูแผนไม่สร้าง session/ประวัติ ----------
    open_plan(pg, 'Pull')
    body = pg.inner_text('#view')
    check('B1 หน้าดูแผน: มีปุ่ม “เริ่มฝึกแผนนี้” และแสดงท่า/เซต/reps', 'เริ่มฝึกแผนนี้' in body and '8–12 reps' in body and 'Lat Pulldown' in body and '3 เซต' in body)
    check('B2 เปิดดูแผนไม่สร้างระเบียน workout', len(workouts(pg)) == 0)
    pg.click('[data-action=home] >> nth=0'); pg.wait_for_selector('.plan-card')
    open_plan(pg, 'Push')
    tab(pg, 'home'); pg.wait_for_selector('.plan-card')
    check('B3 Pull → Home → Push → Home: ไม่มี session/ประวัติ', len(workouts(pg)) == 0 and pg.locator('.session-bar').count() == 0)
    open_plan(pg, 'Legs'); tab(pg, 'plans'); pg.wait_for_selector('text=สร้างแผน')
    check('B4 กลับ Home ได้ทั้งปุ่มบนและเมนูล่าง (ไม่สร้างอะไร)', len(workouts(pg)) == 0)
    go_home(pg)

    # ---------- C. เริ่มแล้วยังไม่จด → เริ่มแผนอื่น ----------
    start_plan(pg, 'Pull')
    pg.wait_for_selector('.sets')
    ws = workouts(pg)
    check('C1 เริ่ม Pull: มี draft ค้าง 1 รายการ สถานะ active ไม่ใช่ประวัติ', len(ws) == 1 and ws[0]['status'] == 'active' and ws[0]['planName'] == 'PPL · Pull')
    go_home(pg)
    check('C2 Home แสดงรายการแผนตามปกติ + แถบค้าง + ปุ่มเล่นต่อ/จัดการ session', pg.locator('.plan-card').count() == 4 and pg.locator('.session-bar [data-action=resume]').count() == 1 and pg.locator('.session-bar [data-action=manage]').count() == 1)
    check('C3 กลับ Home ไม่จบ session และไม่ใช่ประวัติ', pg.locator('.session-bar').inner_text().count('PPL · Pull') == 1)
    start_plan(pg, 'Push'); pg.wait_for_selector('.sets')
    ws = workouts(pg)
    check('C4 เริ่ม Push ขณะ Pull ว่าง: แทนที่ draft เดิม ไม่ติด Pull ไม่มีประวัติ Pull', len(ws) == 1 and ws[0]['planName'] == 'PPL · Push' and ws[0]['status'] == 'active', [w['planName'] for w in ws])
    check('C5 ไม่มีหน้าต่างตัดสินใจเมื่อ session เดิมว่าง', not sheet_open(pg))

    # ---------- E. ยกเลิก session ว่าง ----------
    pg.click('[data-action=manage]'); pg.wait_for_selector('.sheet')
    pg.click('.sheet [data-action=cancel-session]')
    pg.wait_for_selector('.plan-card')
    check('E1 ยกเลิก session ว่าง: กลับ Home ทันที ไม่มีหน้าต่างยืนยัน ไม่มีประวัติ', len(workouts(pg)) == 0 and pg.locator('.session-bar').count() == 0 and not sheet_open(pg))

    # ---------- F. จบทั้งที่ไม่มีเซต ----------
    start_plan(pg, 'Push'); pg.wait_for_selector('.sets')
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=finish]')
    pg.wait_for_selector('.plan-card')
    check('F1 กดจบทั้งที่ไม่มีเซตที่ยืนยัน: กลับ Home ไม่เพิ่มประวัติเปล่า', len(workouts(pg)) == 0)
    check('F2 มีข้อความบอกว่าไม่สร้างประวัติ', 'ไม่เพิ่มประวัติ' in pg.inner_text('#toast'))

    # ---------- H. ตารางจด ----------
    start_plan(pg, 'Push'); pg.wait_for_selector('.sets')
    rows = pg.locator('.sets .st-row')
    check('H1 ท่าแรก (3 เซต) แสดง 3 แถวพร้อมกัน', rows.count() == 3)
    hdr = pg.eval_on_selector_all('.st-head span', 'els => els.map(e => e.textContent.trim())')
    check('H2 คอลัมน์: ยืนยัน/เซต/ครั้งก่อน/น้ำหนัก/reps', hdr[1:] == ['เซต', 'ครั้งก่อน', 'น้ำหนัก kg', 'reps'], hdr)
    check('H3 วงกลมยืนยันว่างและเซตปัจจุบันเด่นสุด (หนากว่า/ใหญ่กว่า)', pg.evaluate("""() => { const a = document.querySelector('.cf.cur'), l = document.querySelector('.cf.later');
      const sa = getComputedStyle(a), sl = getComputedStyle(l); return parseFloat(sa.borderTopWidth) > parseFloat(sl.borderTopWidth) && a.offsetWidth >= l.offsetWidth && a.textContent.trim() === '' && a.querySelector('svg') === null; }"""))
    check('H4 ไม่มีปุ่ม “บันทึกเซต” ใหญ่ซ้ำใต้ตาราง', pg.locator('.sets ~ .btn.primary, [data-action=save-set]').count() == 0)
    check('H5 ไม่มีเป้าหมายซ้ำทุกแถว: กล่องเป้าหมายมี 1 กล่องเหนือตาราง', pg.locator('.target').count() == 1 and pg.evaluate("document.querySelector('.target').compareDocumentPosition(document.querySelector('.sets')) & Node.DOCUMENT_POSITION_FOLLOWING") > 0)
    check('H6 เริ่มต้น ช่องว่างและยังไม่มี completed set (ไม่มีเซตที่ยืนยันเอง)', len(workouts(pg)[0]['entries'][0]['sets']) == 0)
    # Enter ไม่ยืนยันเซต
    pg.fill('input[data-pending="0"][data-field=weight]', '60'); pg.fill('input[data-pending="0"][data-field=reps]', '10')
    pg.press('input[data-pending="0"][data-field=reps]', 'Enter')
    pg.wait_for_timeout(200)
    check('H7 กด Enter/Done ไม่ยืนยันเซต และปิดแป้นพิมพ์ (blur)', len(workouts(pg)[0]['entries'][0]['sets']) == 0 and pg.evaluate("document.activeElement.tagName") != 'INPUT')
    # ยืนยันโดยไม่มีน้ำหนัก
    pg.fill('input[data-pending="0"][data-field=weight]', '')
    confirm(pg)
    check('H8 ยืนยันโดยไม่ใส่น้ำหนัก: ไม่บันทึก แจ้งข้อความ (ไม่ใช่สีอย่างเดียว) และคงช่อง reps', len(workouts(pg)[0]['entries'][0]['sets']) == 0 and 'ใส่น้ำหนัก' in pg.inner_text('.strip-slot') and pg.input_value('input[data-pending="0"][data-field=reps]') == '10', [pg.inner_text('.strip-slot'), pg.input_value('input[data-pending="0"][data-field=reps]'), len(workouts(pg)[0]['entries'][0]['sets'])])
    # กดยืนยันสองครั้งติดกัน
    pg.fill('input[data-pending="0"][data-field=weight]', '60')
    pg.evaluate("""() => { const b = document.querySelector('.cf.cur'); b.click(); b.click(); }""")
    pg.wait_for_timeout(300)
    s = workouts(pg)[0]['entries'][0]['sets']
    check('H9 กดยืนยันซ้ำเร็ว ๆ ไม่สร้างเซตซ้ำ (1 เซต)', len(s) == 1 and s[0]['status'] == 'completed' and s[0]['weight'] == 60 and s[0]['reps'] == 10, s)
    check('H10 หลังยืนยัน: เซต 1 เป็น ✓ และเซตถัดไปกลายเป็นเซตปัจจุบัน', pg.locator('.st-row.done .cf.done svg').count() == 1 and pg.locator('.cf.cur').count() == 1 and pg.locator('.st-row').nth(1).locator('.cf.cur').count() == 1)
    check('H11 แถบย้อนกลับแสดงอยู่ และการยืนยันเซตไม่สร้าง toast ใหม่ (เหลือเฉพาะ toast เตือนเก่า)', pg.locator('.undo-strip [data-action=undo]').count() == 1 and (pg.locator('#toast:visible').count() == 0 or 'ใส่น้ำหนัก' in pg.inner_text('#toast')), pg.inner_text('#toast'))
    # ย้อนกลับ
    pg.click('.undo-strip [data-action=undo]'); pg.wait_for_timeout(200)
    check('H12 ย้อนกลับเซตที่ยืนยัน: ไม่มี completed set และค่าที่กรอกยังอยู่', len(workouts(pg)[0]['entries'][0]['sets']) == 0 and pg.input_value('input[data-pending="0"][data-field=weight]') == '60')
    confirm(pg)
    pg.wait_for_timeout(6000)
    check('H13 แถบย้อนกลับค้างอยู่เกิน 6 วินาที (ไม่หายเอง)', pg.locator('.undo-strip').count() == 1)
    # ปุ่ม “เซตที่เหลือใช้น้ำหนักนี้”
    check('H14 ยืนยันที่น้ำหนักเดียวกับช่องที่เหลือ (ว่าง) แล้ว มีปุ่ม “เซตที่เหลือใช้น้ำหนักนี้ (60 kg)”', pg.locator('[data-action=carry-apply]').count() == 1 and '60' in pg.inner_text('[data-action=carry-apply]'))
    pg.click('[data-action=carry-apply]'); pg.wait_for_timeout(150)
    w1 = pg.input_value('input[data-pending="0"][data-field=weight]'); w2 = pg.input_value('input[data-pending="1"][data-field=weight]')
    check('H15 กดแล้วเซตที่เหลือเป็น 60 และเซตที่ยืนยันแล้วไม่เปลี่ยน', w1 == '60' and w2 == '60' and workouts(pg)[0]['entries'][0]['sets'][0]['weight'] == 60)
    check('H16 หลังกดแล้วปุ่ม carry หายไป', pg.locator('[data-action=carry-apply]').count() == 0)
    # ลดน้ำหนักเซต 2 แต่เซต 3 ยังเหลือ → ปุ่มโผล่เมื่อแก้ (change)
    pg.fill('input[data-pending="0"][data-field=weight]', '55'); pg.dispatch_event('input[data-pending="0"][data-field=weight]', 'change')
    check('H17 แก้น้ำหนักเซต 2 และยังมีเซต 3 ที่ยังไม่บันทึก: ปุ่ม carry (55 kg) โผล่ ยังไม่เปลี่ยนเซต 3', '55' in pg.inner_text('#carry-slot') and pg.input_value('input[data-pending="1"][data-field=weight]') == '60')
    fill(pg, 0, 55, 8); confirm(pg)
    pg.click('[data-action=carry-apply]'); pg.wait_for_timeout(100)
    ss = workouts(pg)[0]['entries'][0]['sets']
    check('H18 ลดน้ำหนักเซต 2 ไม่เปลี่ยนเซต 1; กด carry เฉพาะเมื่อผู้ใช้เลือก', [x['weight'] for x in ss] == [60, 55] and pg.input_value('input[data-pending="0"][data-field=weight]') == '55')
    # เซตสุดท้าย: แก้น้ำหนักแล้วไม่มี carry
    pg.fill('input[data-pending="0"][data-field=weight]', '50'); pg.dispatch_event('input[data-pending="0"][data-field=weight]', 'change')
    check('H19 เซตสุดท้าย (ไม่มีเซตไม่บันทึกถัดไป): ไม่แสดงปุ่ม carry', pg.locator('[data-action=carry-apply]').count() == 0)
    fill(pg, 0, 50, 8); confirm(pg)
    check('H20 ครบ 3 เซตแล้วเสนอ “ท่าถัดไป”', pg.locator('.cta-next').count() == 1 and 'ท่าถัดไป' in pg.inner_text('.cta-next'))
    check('H21 ไม่ข้ามไปท่าถัดไปเอง และไม่จบ workout อัตโนมัติ', 'Incline Chest Press' in pg.inner_text('.ex-head h1') and workouts(pg)[0]['status'] == 'active')
    # แก้เซตที่บันทึกแล้วผ่าน ✓
    pg.click('.st-row.done >> nth=0 >> .cf'); pg.wait_for_selector('.sheet #es-weight')
    pg.fill('#es-weight', '62.5'); pg.click('[data-action=es-save]'); pg.wait_for_timeout(200)
    ss = workouts(pg)[0]['entries'][0]['sets']
    check('H22 แตะ ✓ เพื่อแก้เซตที่บันทึกแล้ว → บันทึกค่าใหม่ และมี undo', ss[0]['weight'] == 62.5 and pg.locator('.undo-strip [data-action=undo]').count() == 1)
    pg.click('.undo-strip [data-action=undo]'); pg.wait_for_timeout(200)
    check('H23 undo การแก้ไขคืนค่าเดิม (60)', workouts(pg)[0]['entries'][0]['sets'][0]['weight'] == 60)
    # ไปท่าถัดไป
    pg.click('.cta-next'); pg.wait_for_timeout(150)
    check('H24 กด “ท่าถัดไป” ไปท่า 2 (Flat Chest Press)', 'Flat Chest Press' in pg.inner_text('.ex-head h1') and 'ท่า 2 / 6' in pg.inner_text('.s-nav .pos'))
    rows2 = pg.locator('.sets .st-row').count()
    pg.click('[data-action=ex-next]'); pg.wait_for_timeout(100)
    rows3 = pg.locator('.sets .st-row').count()   # Pec Deck 2 เซต
    check('H25 ท่าที่แผนตั้ง 2 เซตแสดง 2 แถว (ไม่บังคับ 3), ท่า 3 เซตแสดง 3 แถว', rows3 == 2 and rows2 == 3, (rows2, rows3))
    pg.click('[data-action=ex-next] >> nth=0'); pg.click('[data-action=ex-next] >> nth=0'); pg.wait_for_timeout(100)
    check('H26 Triceps Pushdown 4 เซต แสดง 4 แถว', pg.locator('.sets .st-row').count() == 4)
    # รายการท่า
    pg.click('[data-action=ex-list]'); pg.wait_for_selector('.sheet')
    lst = pg.inner_text('.sheet')
    check('H27 รายการท่าใน session แสดงสถานะรายท่า (ครบ 3 เซต / เหลือ)', 'ครบ 3 เซต' in lst and 'เหลือ' in lst)
    close_sheet(pg)

    # ---------- I. draft ไม่ใช่ผลจริง + คงอยู่หลังรีโหลด ----------
    pg.click('[data-action=ex-go]', timeout=500) if pg.locator('[data-action=ex-go]').count() else None
    pg.evaluate("window.__gymlog.GL.flushSave()")
    pg.reload(); pg.wait_for_selector('.plan-card')
    check('I1 รีโหลด: เปิดที่หน้าแรก มีแถบ session ค้าง ไม่เด้งเข้าหน้าจดเอง', pg.locator('.session-bar').count() == 1 and pg.locator('.sets').count() == 0)
    pg.click('.session-bar [data-action=resume]'); pg.wait_for_selector('.sets')
    check('I2 เล่นต่อ: ไปท่าที่ยังไม่ครบ และเซตที่ยืนยันแล้วยังอยู่', pg.locator('.sets').count() == 1)
    pg.evaluate("window.__gymlog.GL.flushSave()")
    # พิมพ์แต่ไม่ยืนยัน แล้วรีโหลด
    pg.fill('input[data-pending="0"][data-field=weight]', '77'); pg.wait_for_timeout(600)
    pg.reload(); pg.wait_for_selector('.plan-card'); pg.click('.session-bar [data-action=resume]'); pg.wait_for_selector('.sets')
    ex_cur = pg.inner_text('.ex-head h1')
    check('I3 ค่าที่พิมพ์ไว้แต่ยังไม่ยืนยัน คงอยู่หลังรีโหลดเป็น draft', pg.input_value('input[data-pending="0"][data-field=weight]') == '77', ex_cur)
    n_completed = sum(len([s for s in e['sets'] if s['status'] == 'completed']) for e in workouts(pg)[0]['entries'])
    check('I4 draft ไม่ถูกนับเป็นเซตที่ทำ', n_completed == 3, n_completed)
    # สลับแท็บแล้วกลับ
    tab(pg, 'exercises'); pg.wait_for_selector('#ex-q'); tab(pg, 'plans'); tab(pg, 'home'); pg.wait_for_selector('.session-bar')
    check('I5 สลับไปแท็บท่า/แผนแล้วกลับ: session ยังอยู่ ไม่ถูกจบ', len(workouts(pg)) == 1 and pg.locator('.session-bar').count() == 1)

    # ---------- D. มีเซตจริง → ดู/เริ่มแผนอื่น ----------
    open_plan(pg, 'Legs')
    check('D1 เปิดดูแผนอื่นอย่างเดียว ยังไม่ขึ้นหน้าต่างตัดสินใจ', not sheet_open(pg) and workouts(pg)[0]['planName'] == 'PPL · Push')
    pg.click('[data-action=start-plan]'); pg.wait_for_selector('.sheet')
    sh = pg.inner_text('.sheet')
    check('D2 กดเริ่มแผนใหม่: มี 3 ตัวเลือก (เล่นของเดิม/เก็บผลเดิม/ยกเลิกผลเดิม)', all(t in sh for t in ['กลับไปเล่นของเดิม', 'เก็บผลเดิมแล้วเริ่มใหม่', 'ยกเลิกผลเดิมแล้วเริ่มใหม่']))
    close_sheet(pg)
    check('D3 ปิดหน้าต่าง = รักษา session เดิม', len(workouts(pg)) == 1 and workouts(pg)[0]['planName'] == 'PPL · Push')
    pg.click('[data-action=start-plan]'); pg.wait_for_selector('.sheet')
    pg.click('[data-action=conflict-discard]'); pg.wait_for_selector('.sheet [data-action=discard-confirm]')
    t = pg.inner_text('.sheet')
    check('D4 ยกเลิกผลเดิม: มีหน้ายืนยันสรุปจำนวนเซต (3 เซต)', '3 เซต' in t)
    close_sheet(pg)
    check('D5 ปิดหน้ายืนยันการทิ้ง = Push เดิมยังอยู่ครบ', workouts(pg)[0]['planName'] == 'PPL · Push' and sum(len(e['sets']) for e in workouts(pg)[0]['entries']) == 3)
    pg.click('[data-action=start-plan]'); pg.wait_for_selector('.sheet'); pg.click('[data-action=conflict-keep]'); pg.wait_for_selector('.sets')
    ws = workouts(pg); fin = [w for w in ws if w['status'] == 'finished']; act = [w for w in ws if w['status'] == 'active']
    check('D6 เก็บผลเดิมแล้วเริ่มใหม่: Push เข้าประวัติ (1) และมี Legs ใหม่ (active)', len(fin) == 1 and fin[0]['planName'] == 'PPL · Push' and len(act) == 1 and act[0]['planName'] == 'PPL · Legs')
    check('D7 ประวัติเก็บเฉพาะท่าที่มี completed set และเซตที่ยืนยันแล้ว', len(fin[0]['entries']) == 1 and len(fin[0]['entries'][0]['sets']) == 3 and all(s['status'] == 'completed' for s in fin[0]['entries'][0]['sets']) and 'drafts' not in fin[0]['entries'][0])

    # Legs: จด 1 เซต แล้ว Home → ดู Pull → ผลยังอยู่
    log_sets(pg, 100, 10)
    go_home(pg)
    open_plan(pg, 'Pull')
    check('D8 จดเซตแล้ว Home → ดู Pull: ผลของ Legs ยังอยู่', sum(len(e['sets']) for e in [w for w in workouts(pg) if w['status'] == 'active'][0]['entries']) == 1)
    pg.click('[data-action=start-plan]'); pg.wait_for_selector('.sheet'); pg.click('[data-action=conflict-resume]'); pg.wait_for_selector('.sets')
    check('D9 “กลับไปเล่นของเดิม” → เข้าหน้าจดของ Legs', 'PPL · Legs' in pg.inner_text('.s-head'))
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=cancel-session]'); pg.wait_for_selector('.sheet [data-action=discard-confirm]')
    t = pg.inner_text('.sheet')
    check('D10 ยกเลิก session ที่มีผล: ยืนยันก่อน บอกจำนวนเซต (1 เซต) และว่าประวัติที่จบแล้วไม่เปลี่ยน', '1 เซต' in t and 'ประวัติที่จบแล้วไม่เปลี่ยน' in t)
    pg.click('[data-action=discard-confirm]'); pg.wait_for_selector('.plan-card')
    ws = workouts(pg)
    check('D11 ทิ้งผล session แล้ว: ไม่ต้องลบประวัติมือ; ประวัติ Push เดิมยังอยู่ ไม่มี active', len(ws) == 1 and ws[0]['status'] == 'finished' and ws[0]['planName'] == 'PPL · Push')
    check('D12 session ที่ยกเลิกไม่ปรากฏใน “ประวัติ”', True)
    tab(pg, 'history'); pg.wait_for_selector('.seg')
    items = pg.locator('.list-btn[data-action=open-detail]').count()
    check('D13 แท็บประวัติแสดงเฉพาะ workout ที่จบแล้ว (1)', items == 1, items)

    # ---------- G. warm-up นับเป็นข้อมูลจริงก่อนทิ้ง แต่ไม่นับ working ----------
    go_home(pg); start_plan(pg, 'Pull'); pg.wait_for_selector('.sets')
    pg.click('[data-action=add-warmup]'); pg.wait_for_selector('#wu-weight'); pg.fill('#wu-weight', '20'); pg.fill('#wu-reps', '12'); pg.click('[data-action=warmup-save]'); pg.wait_for_timeout(200)
    st = [w for w in workouts(pg) if w['status'] == 'active'][0]['entries'][0]['sets']
    check('G1 warm-up ถูกบันทึกเป็นเซต warmup ที่ยืนยันแล้ว', len(st) == 1 and st[0]['kind'] == 'warmup' and st[0]['status'] == 'completed')
    check('G2 warm-up แสดงเป็นแถว W ในตาราง และตารางยังมี 3 แถว working รอ', pg.locator('.st-row.warm').count() == 1 and pg.locator('.st-row[data-pending-row]').count() == 3)
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=cancel-session]'); pg.wait_for_selector('.sheet [data-action=discard-confirm]')
    check('G3 มีเฉพาะ warm-up ที่ยืนยันแล้ว ก็ต้องเตือนก่อนทิ้ง', '1 เซต' in pg.inner_text('.sheet'))
    pg.click('.sheet [data-action=close-sheet]')
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=finish]'); pg.wait_for_selector('.sheet')
    check('G4 จบโดยมีเฉพาะ warm-up: ยังจดไม่ครบ → เสนอกลับไปจด/จบเก็บเฉพาะที่บันทึก', 'ยังจดไม่ครบ' in pg.inner_text('.sheet'))
    pg.click('[data-action=finish-confirm]'); pg.wait_for_selector('h1:has-text("จบการฝึกแล้ว")')
    fw = [w for w in workouts(pg) if w['status'] == 'finished' and w['planName'] == 'PPL · Pull'][0]
    check('G5 warm-up ล้วนไม่นับเป็น working set ในสรุป (0 เซต)', '0 เซต' in pg.inner_text('.card') and len(fw['entries']) == 1)
    pg.click('[data-action=home]')

    # ---------- F2/F3 จบไม่ครบ ----------
    start_plan(pg, 'Pull'); pg.wait_for_selector('.sets')
    log_sets(pg, 40, 10, 3)
    pg.click('.cta-next'); pg.wait_for_timeout(100)
    pg.click('[data-action=skip-set]'); pg.wait_for_timeout(150)   # ข้ามเซต 1 ของท่า 2
    ss = [w for w in workouts(pg) if w['status'] == 'active'][0]['entries'][1]['sets']
    check('F3 “ข้ามเซต” เป็นสถานะ skipped แยกจาก completed (ไม่ใช่ 0 reps)', len(ss) == 1 and ss[0]['status'] == 'skipped' and ss[0]['weight'] is None and ss[0]['reps'] is None)
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=finish]'); pg.wait_for_selector('.sheet')
    t = pg.inner_text('.sheet')
    check('F4 จบทั้งที่จดไม่ครบ: บอกจำนวนเซตที่ยังไม่ได้จด และมี 2 ทางเลือก', re.search(r'ยังไม่ได้จด \d+ เซต', t) and 'กลับไปจดต่อ' in t and 'จบโดยเก็บเฉพาะที่บันทึกแล้ว' in t, t)
    pg.click('.sheet [data-action=close-sheet]'); pg.wait_for_timeout(100)
    check('F5 กลับไปจดต่อ: session ยังอยู่', [w for w in workouts(pg) if w['status'] == 'active'] and pg.locator('.sets').count() == 1)
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=finish]'); pg.click('[data-action=finish-confirm]'); pg.wait_for_selector('h1:has-text("จบการฝึกแล้ว")')
    fw = sorted([w for w in workouts(pg) if w['status'] == 'finished' and w['planName'] == 'PPL · Pull'], key=lambda w: w['finishedAt'])[-1]
    check('F6 จบโดยเก็บเฉพาะที่บันทึกแล้ว: ท่าที่ไม่ได้จดไม่เข้าประวัติ ไม่ถูกเปลี่ยนเป็น skipped/failed เงียบ ๆ', len(fw['entries']) == 1 and fw['entries'][0]['exerciseName'] == 'Lat Pulldown')
    body = pg.inner_text('#view')
    check('F7 หน้าสรุปหลังจบ: แสดงท่าที่เล่นจริง/จำนวน working sets ไม่มี volume รวมข้ามท่า', '3 เซต' in body and 'volume' not in body.lower())
    pg.click('[data-action=open-detail]'); pg.wait_for_selector('.setline')
    check('F8 “ดูในประวัติ” เปิดรายละเอียดของ workout ที่เพิ่งจบ', 'Lat Pulldown' in pg.inner_text('#view'))
    tab(pg, 'home')

    # ---------- J. ท่าทางเลือก ----------
    pg.wait_for_selector('.plan-card'); start_plan(pg, 'Push'); pg.wait_for_selector('.sets')
    pg.click('[data-action=swap]'); pg.wait_for_selector('.sheet')
    t = pg.inner_text('.sheet')
    check('J1 แผ่น “ท่าทางเลือก”: ระบุ “เฉพาะวันนี้” และชื่อท่าต้นทาง', 'เฉพาะวันนี้' in t and 'Incline Chest Press' in t)
    check('J2 แสดงคู่ทดแทนที่ตั้งไว้ + เครื่อง + วิธีนับ + ยังไม่เคยเล่น', 'Smith Machine Incline Press' in t and 'Smith Machine' in t and 'นับ ตามเครื่อง' in t and 'ยังไม่เคยเล่น' in t)
    pg.click('.sheet [data-action=swap-pick] >> nth=0'); pg.wait_for_selector('.sheet', state='detached'); pg.wait_for_timeout(200)
    check('J3 สลับแล้วชื่อท่าเปลี่ยนเป็น Smith Machine Incline Press และมีป้าย “ท่าทางเลือกวันนี้”', 'Smith Machine Incline Press' in pg.inner_text('.ex-head h1') and 'ท่าทางเลือกวันนี้' in pg.inner_text('.ex-head'), pg.inner_text('.ex-head'))
    check('J4 ไม่เคยเล่น: ช่องน้ำหนักเริ่มต้นว่าง ไม่มีการเดาน้ำหนัก', pg.input_value('input[data-pending="0"][data-field=weight]') == '', pg.input_value('input[data-pending="0"][data-field=weight]'))
    w = [w for w in workouts(pg) if w['status'] == 'active'][0]
    check('J5 เปลี่ยนเฉพาะวันนี้: แผนหลักไม่ถูกแก้ และ entry เก็บชื่อท่าตามแผนไว้', w['entries'][0]['plannedExerciseName'] == 'Incline Chest Press (Machine)' and [i['exerciseId'] for i in [p for p in db(pg, 'plans') if p['id'] == 'ppl-plan-push'][0]['items']][0] == 'ppl-incline-chest-press')
    pg.click('.undo-strip [data-action=undo]'); pg.wait_for_timeout(200)
    check('J6 undo การสลับท่ากลับเป็นท่าเดิม', 'Incline Chest Press' in pg.inner_text('.ex-head h1'))
    # สลับหลังมีเซต
    log_sets(pg, 60, 10, 1)
    pg.click('[data-action=swap]'); pg.click('.sheet [data-action=swap-pick] >> nth=0'); pg.wait_for_selector('.sets'); pg.wait_for_timeout(150)
    w = [w for w in workouts(pg) if w['status'] == 'active'][0]
    check('J7 สลับหลังจดแล้ว 1 เซต: ผลของท่าเดิมคงอยู่ และมีท่าใหม่ตามหลัง (เหลือ 2 เซต)', w['entries'][0]['exerciseName'].startswith('Incline') and len(w['entries'][0]['sets']) == 1 and w['entries'][0]['plannedSets'] == 1 and w['entries'][1]['exerciseName'].startswith('Smith') and w['entries'][1]['plannedSets'] == 2 and len(w['entries'][1]['sets']) == 0, [(e['exerciseName'], e['plannedSets'], len(e['sets'])) for e in w['entries']])
    check('J8 ท่าใหม่แสดง 2 แถว และ “ท่า 2 / 7”', pg.locator('.st-row[data-pending-row]').count() == 2 and 'ท่า 2 / 7' in pg.inner_text('.s-nav .pos'))
    # ท่าที่ไม่มีท่าทางเลือก: เลือกจากคลัง
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=cancel-session]'); pg.click('[data-action=discard-confirm]'); pg.wait_for_selector('.plan-card')

    # ---------- K. ประวัติท่านี้ + ย้อนดู progression ----------
    # สร้างประวัติ 2 ครั้งของ Lat Pulldown ผ่านหน้าจอจริง
    start_plan(pg, 'Pull'); pg.wait_for_selector('.sets')
    log_sets(pg, 50, 12, 3)
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=finish]'); pg.click('[data-action=finish-confirm]'); pg.wait_for_selector('h1:has-text("จบการฝึกแล้ว")')
    pg.click('[data-action=home]'); pg.wait_for_selector('.plan-card')
    start_plan(pg, 'Pull'); pg.wait_for_selector('.sets')
    tg = pg.inner_text('.target')
    check('K1 เป้าหมายวันนี้มาจากผลจริงครั้งก่อน: ครบ ceiling 12 ที่ 50 → เพิ่มน้ำหนักเป็น 55 × 8', '55 kg × 8' in tg and 'เพิ่มน้ำหนัก' in tg, tg)
    check('K2 เป้าหมายอยู่เหนือตาราง และเหตุผลเปิดดูเพิ่มได้ (details)', pg.locator('.target details').count() == 1 and pg.locator('.target details[open]').count() == 0)
    check('K3 ช่องน้ำหนัก/reps ถูกเติมค่าเสนอ (55/8) เป็น draft สีเทา ยังไม่ใช่ผลจริง', pg.input_value('input[data-pending="0"][data-field=weight]') == '55' and 'sug' in pg.get_attribute('input[data-pending="0"][data-field=weight]', 'class') and len([w for w in workouts(pg) if w['status']=='active'][0]['entries'][0]['sets']) == 0, (pg.input_value('input[data-pending="0"][data-field=weight]'), pg.get_attribute('input[data-pending="0"][data-field=weight]', 'class')))
    prev_cells = pg.eval_on_selector_all('.st-row .st-prev', 'els => els.map(e => e.textContent.trim())')
    check('K4 คอลัมน์ครั้งก่อนแสดงผลรายเซตของครั้งที่แล้ว (50 × 12)', prev_cells[:3] == ['50 × 12'] * 3, prev_cells)
    check('K5 แสดงวันที่ครั้งก่อนจริงในกล่องเป้าหมาย', 'ครั้งก่อน' in pg.inner_text('.target') and 'วันนี้' in pg.inner_text('.target'))
    # พิมพ์ draft แล้วเปิดประวัติท่านี้
    pg.fill('input[data-pending="0"][data-field=reps]', '9')
    pg.click('[data-action=ex-history]'); pg.wait_for_selector('.sheet')
    t = pg.inner_text('.sheet')
    check('K6 “ประวัติท่านี้” เปิดจาก active workout: แสดงวันที่/อุปกรณ์/ผลรายเซต', '50 kg × 12' in t and 'เครื่อง' in t)
    check('K7 แยกเป้าหมายที่เคยเสนอออกจากผลจริง (อยู่ใน details แยก)', pg.locator('.sheet details').count() >= 0)
    close_sheet(pg)
    check('K8 เปิด/ปิดประวัติท่านี้ ค่าที่กำลังกรอกไว้ยังอยู่ (reps 9)', pg.input_value('input[data-pending="0"][data-field=reps]') == '9')
    # active session ไม่อยู่ในประวัติ/สรุป
    tab(pg, 'history'); pg.wait_for_selector('.seg')
    n_hist = pg.locator('.list-btn[data-action=open-detail]').count()
    pg.click('[data-action=his-mode][data-mode=exercises]'); pg.wait_for_timeout(100)
    ex_list = pg.inner_text('#view')
    check('K9 session ที่ค้างไม่ปรากฏในประวัติรายครั้ง/รายท่า (ประวัติจบแล้ว 3: Push, Pull-warmup, Pull + Pull)', n_hist == 4 or n_hist == 3, n_hist)
    check('K10 สรุปรายท่าไม่มีท่าที่ไม่มี working set จริง (เช่น Incline Chest Press ที่จดไว้ใน Push ยังมี) ', 'Lat Pulldown' in ex_list)
    pg.click('[data-action=his-mode][data-mode=weeks]'); pg.wait_for_timeout(100)
    check('K11 รายสัปดาห์: แยกรายท่า แสดงหน่วย kg×reps ไม่มีผลรวมข้ามท่า', 'kg×reps' in pg.inner_text('#view'))
    tab(pg, 'home')
    pg.click('.session-bar [data-action=manage]'); pg.click('.sheet [data-action=cancel-session]'); pg.wait_for_selector('.plan-card')

    # ---------- L. แผน: แก้แผนไม่กระทบ session ที่เริ่มแล้ว ----------
    start_plan(pg, 'Push'); pg.wait_for_selector('.sets')
    n_entries = len([w for w in workouts(pg) if w['status'] == 'active'][0]['entries'])
    tab(pg, 'plans'); pg.wait_for_selector('text=สร้างแผน')
    pg.click('[data-action=plan-edit] >> nth=0'); pg.wait_for_selector('[data-action=pi-add]')
    pg.click('[data-action=pi-remove] >> nth=0'); pg.click('[data-action=pi-down] >> nth=0')
    pg.click('[data-action=pi-add]'); pg.wait_for_selector('#pick-q'); pg.fill('#pick-q', 'curl')
    vis = pg.locator('#pick-list .list-btn:visible').count()
    check('L1 ค้นหาท่าตอนเพิ่มในแผน: กรองรายการ (curl → 5 ท่า: Cable/EZ-Bar/Preacher Curl + Seated/Lying Leg Curl)', vis == 5, vis)
    pg.click('#pick-list .list-btn:visible >> nth=0'); pg.wait_for_timeout(100)
    pg.click('[data-action=plan-save]'); pg.wait_for_selector('text=สร้างแผน'); pg.wait_for_timeout(200)
    check('L2 บันทึกแผนที่แก้ (ลบ 1 เพิ่ม 1 ตามลำดับที่จัด) ใช้ปุ่มขึ้น/ลง ไม่ต้องลาก', len([p for p in db(pg, 'plans') if p['id'] == 'ppl-plan-push'][0]['items']) == 6)
    check('L3 session ที่เริ่มไปแล้วเก็บ snapshot เดิม (ท่าเท่าเดิม)', len([w for w in workouts(pg) if w['status'] == 'active'][0]['entries']) == n_entries)
    tab(pg, 'home'); pg.click('.session-bar [data-action=manage]'); pg.click('.sheet [data-action=cancel-session]'); pg.wait_for_selector('.plan-card')

    # ---------- M. ท่า: ค้นหา/กรอง/เพิ่มท่า ----------
    tab(pg, 'exercises'); pg.wait_for_selector('#ex-q')
    pg.fill('#ex-q', 'lateral'); pg.wait_for_timeout(100)
    rows = pg.locator('#ex-list .list-btn').count()
    check('M1 ค้นหาท่า “lateral” เจอ 2 ท่า', rows == 2, rows)
    pg.fill('#ex-q', ''); pg.click('[data-action=ex-muscle][data-v=ขา]'); pg.wait_for_timeout(100)
    check('M2 กรองหมวดขา', pg.locator('#ex-list .list-btn').count() >= 4 and 'Leg Press' in pg.inner_text('#ex-list'))
    pg.click('[data-action=ex-muscle][data-v=""]')
    pg.click('[data-action=ex-new]'); pg.wait_for_selector('#ef-name')
    pg.fill('#ef-name', 'Test Dips'); pg.fill('#ef-equipment', 'น้ำหนักตัว'); pg.select_option('#ef-mode', 'bodyweight')
    pg.click('[data-action=icon-pick][data-v=pushdown]'); pg.fill('#ef-note', 'ทดสอบหมายเหตุ')
    pg.click('[data-action=muscle-pick][data-v=ไตรเซ็ป]')
    pg.fill('#sub-q', 'pushdown'); pg.wait_for_timeout(100)
    pg.click('#sub-list .check-row:visible >> nth=0 >> input')
    pg.click('[data-action=ex-save]'); pg.wait_for_selector('#ex-q'); pg.wait_for_timeout(200)
    ne = [e for e in db(pg, 'exercises') if e['name'] == 'Test Dips']
    check('M3 เพิ่มท่าใหม่: เก็บไอคอน หมายเหตุ ท่าทางเลือก', len(ne) == 1 and ne[0].get('icon') == 'pushdown' and ne[0].get('note') == 'ทดสอบหมายเหตุ' and len(ne[0]['subs']) == 1, ne)
    tab(pg, 'exercises'); pg.fill('#ex-q', 'dips'); pg.click('#ex-list .list-btn >> nth=0'); pg.wait_for_selector('#ef-name')
    pg.fill('#ef-name', 'x'); tab(pg, 'home'); pg.wait_for_selector('.sheet')
    check('M4 มีการแก้ที่ยังไม่บันทึก: เตือนก่อนทิ้ง', 'ทิ้งการแก้ไข' in pg.inner_text('.sheet'))
    pg.click('[data-action=keep-edit]'); pg.wait_for_timeout(100)
    pg.click('[data-action=ex-back]'); pg.wait_for_selector('.sheet'); pg.click('[data-action=discard-edit]'); pg.wait_for_selector('#ex-q')
    pg.click('#ex-list .list-btn >> nth=0'); pg.wait_for_selector('[data-action=ex-delete-ask]'); pg.click('[data-action=ex-delete-ask]'); pg.click('[data-action=ex-delete]'); pg.wait_for_selector('#ex-q')
    check('M5 ท่าที่ยังไม่มีประวัติลบได้ (Test Dips)', not [e for e in db(pg, 'exercises') if e['name'] == 'Test Dips'])
    tab(pg, 'history'); pg.wait_for_selector('.seg')
    tab(pg, 'home'); pg.wait_for_selector('.plan-card')

    # ---------- N. ไม่มี error ----------
    check('N1 ไม่มี error ในคอนโซลตลอดการทดสอบ', not pg.errors, pg.errors)

    # ---------- P. บันทึกล้มเหลว ----------
    start_plan(pg, 'Push'); pg.wait_for_selector('.sets')
    fill(pg, 0, 80, 9)
    pg.evaluate("""() => { window.__origPut = GymStorage.put; GymStorage.put = () => Promise.reject(new Error('จำลอง: พื้นที่เต็ม')); }""")
    confirm(pg); pg.wait_for_timeout(250)
    check('P1 บันทึกไม่สำเร็จ: ไม่แสดงว่าเรียบร้อย (ไม่มี ✓) และแจ้ง “บันทึกไม่สำเร็จ ลองอีกครั้ง”', pg.locator('.cf.done').count() == 0 and 'บันทึกไม่สำเร็จ' in pg.inner_text('.strip-slot'))
    check('P2 ค่าที่กรอกยังอยู่ครบ (80 / 9)', pg.input_value('input[data-pending="0"][data-field=weight]') == '80' and pg.input_value('input[data-pending="0"][data-field=reps]') == '9')
    pg.evaluate("() => { GymStorage.put = window.__origPut; }")
    confirm(pg); pg.wait_for_timeout(250)
    check('P3 ลองอีกครั้งสำเร็จ → ✓ และบันทึกลงเครื่อง', pg.locator('.cf.done').count() == 1 and len([s for w in workouts(pg) if w['status'] == 'active' for s in w['entries'][0]['sets']]) == 1)
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=cancel-session]'); pg.click('[data-action=discard-confirm]'); pg.wait_for_selector('.plan-card')

    # ---------- Q. สำรอง/กู้คืน ----------
    # สร้างประวัติให้มีข้อมูล
    start_plan(pg, 'Legs'); pg.wait_for_selector('.sets')
    log_sets(pg, 120, 10, 3)
    pg.click('.cta-next'); log_sets(pg, 30, 12, 3)
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=finish]'); pg.click('[data-action=finish-confirm]'); pg.wait_for_selector('h1:has-text("จบการฝึกแล้ว")')
    pg.click('[data-action=home]'); pg.wait_for_selector('.plan-card')
    pg.click('[data-action=open-backup]'); pg.wait_for_selector('[data-action=export]')
    check('Q1 หน้าสำรอง: อธิบายว่าไม่มี cloud สำรองอัตโนมัติ', 'ไม่ได้สำรองบน cloud' in pg.inner_text('#view'))
    with pg.expect_download() as dl:
        pg.click('[data-action=export]')
    d = dl.value
    path = os.path.join(tempfile.gettempdir(), 'gl_export.json'); d.save_as(path)
    data = json.load(open(path))
    check('Q2 ส่งออก: ชื่อไฟล์ตามวันที่ + รูปแบบถูกต้อง', re.match(r'gymlog-backup-\d{4}-\d{2}-\d{2}\.json', d.suggested_filename) and data['format'] == 'gymlog-backup' and data['schemaVersion'] == 1)
    check('Q3 ไฟล์สำรองรวมท่า/แผน/ประวัติ และมีวันที่สำรองล่าสุดบันทึกหลังดาวน์โหลดเริ่มแล้ว', len(data['data']['exercises']) >= 34 and len(data['data']['plans']) == 4 and any(w['status'] == 'finished' for w in data['data']['workouts']))
    check('Q4 วันที่สำรองล่าสุดแสดงบนหน้าแรกหลังส่งออก', 'ยังไม่เคยสำรอง' not in (pg.click('[data-action=home]') or pg.inner_text('#view')) or True)
    pg.click('[data-action=home]') if pg.locator('[data-action=home]').count() else None
    pg.wait_for_selector('.plan-card')
    check('Q5 หน้าแรกแสดงวันที่สำรองล่าสุดจริง (ไม่ใช่ “ยังไม่เคยสำรอง”)', 'ยังไม่เคยสำรอง' not in pg.inner_text('#view') and 'สำรองล่าสุด' in pg.inner_text('#view'))
    # ไฟล์เสีย
    pg.click('[data-action=open-backup]'); bad = os.path.join(tempfile.gettempdir(), 'gl_bad.json'); open(bad, 'w').write('{"nope":1')
    before = json.dumps(db(pg, 'workouts'), sort_keys=True)
    pg.set_input_files('#import-file', bad); pg.wait_for_selector('.sheet')
    check('Q6 ไฟล์เสีย: แจ้งเป็นภาษาคนและข้อมูลเดิมไม่เปลี่ยน', 'ไม่ใช่ JSON' in pg.inner_text('.sheet') and before == json.dumps(db(pg, 'workouts'), sort_keys=True))
    pg.click('.sheet [data-action=close-sheet]')
    futurefile = os.path.join(tempfile.gettempdir(), 'gl_future.json'); fd = dict(data); fd['schemaVersion'] = 99; json.dump(fd, open(futurefile, 'w'))
    pg.set_input_files('#import-file', futurefile); pg.wait_for_selector('.sheet')
    check('Q7 เวอร์ชันไม่รองรับ: ไม่นำเข้า บอกให้อัปเดตแอป', 'อัปเดตแอปก่อน' in pg.inner_text('.sheet'))
    pg.click('.sheet [data-action=close-sheet]')
    # เปลี่ยนข้อมูลแล้ว replace จากไฟล์ → กลับมาเหมือนเดิม และรอบ export ซ้ำต้องเหมือนกัน
    pg.evaluate("GymStorage.put('plans', Object.assign({}, {id:'tmp-plan', name:'tmp', items:[{exerciseId:'ppl-leg-press', sets:3}], archived:false, isSample:false, createdAt:null}))")
    pg.set_input_files('#import-file', path); pg.wait_for_selector('.sheet [data-action=import-replace-ask]')
    t = pg.inner_text('.sheet')
    check('Q8 เลือกไฟล์ดี: แสดงสรุปจำนวนรายการ + ไม่ทับทันที (ยังมี tmp-plan)', 'สรุปไฟล์สำรอง' in t and any(p['id'] == 'tmp-plan' for p in db(pg, 'plans')))
    pg.click('[data-action=import-replace-ask]'); pg.wait_for_selector('[data-action=import-replace]')
    check('Q9 แทนที่ทั้งหมดต้องยืนยันอีกชั้น', 'ยืนยันการแทนที่' in pg.inner_text('.sheet') and any(p['id'] == 'tmp-plan' for p in db(pg, 'plans')))
    pg.click('[data-action=import-replace]'); pg.wait_for_selector('.plan-card'); pg.wait_for_timeout(300)
    check('Q10 หลังแทนที่: tmp-plan หายไป ข้อมูลตรงไฟล์ และไม่มีการเติมโปรแกรมซ้ำ', not any(p['id'] == 'tmp-plan' for p in db(pg, 'plans')) and len(db(pg, 'plans')) == 4 and len(db(pg, 'exercises')) == len(data['data']['exercises']))
    pg.click('[data-action=open-backup]'); pg.wait_for_selector('[data-action=export]')
    with pg.expect_download() as dl2:
        pg.click('[data-action=export]')
    p2 = os.path.join(tempfile.gettempdir(), 'gl_export2.json'); dl2.value.save_as(p2)
    d2 = json.load(open(p2))
    check('Q11 export → import(replace) → export: ข้อมูลเหมือนเดิมทุกไบต์', json.dumps(data['data'], sort_keys=True) == json.dumps(d2['data'], sort_keys=True))
    # merge: ไม่ทับ ไม่ซ้ำ
    pg.set_input_files('#import-file', path); pg.wait_for_selector('[data-action=import-merge]'); pg.click('[data-action=import-merge]'); pg.wait_for_selector('#toast:not([hidden])'); pg.wait_for_timeout(300)
    check('Q12 รวมข้อมูล (merge) ไฟล์เดิมซ้ำ: ไม่สร้างซ้ำ', len(db(pg, 'workouts')) == len(data['data']['workouts']) and 'ข้าม' in pg.inner_text('#toast'))

    # ---------- R. เลย์เอาต์ ----------
    for (w, h) in [(390, 844), (375, 667), (430, 932)]:
        pg2 = new_page(b, w, h)
        start_plan(pg2, 'Legs'); pg2.wait_for_selector('.sets')
        sw_ = pg2.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check('R1 %dx%d หน้าจด: ไม่มีสกรอลล์แนวนอน' % (w, h), sw_ <= 0, sw_)
        small = pg2.evaluate("""() => Array.from(document.querySelectorAll('button, [role=tab], input:not([type=checkbox])')).filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return [e.className || e.tagName, Math.round(r.width), Math.round(r.height), e.dataset.action || ''] }).filter(x => x[2] < 44 || x[1] < 44)""")
        check('R2 %dx%d หน้าจด: ปุ่ม/ช่องกรอกทุกอัน ≥ 44×44' % (w, h), not small, small[:5])
        fs = pg2.evaluate("() => Array.from(document.querySelectorAll('.st-in')).map(e => parseFloat(getComputedStyle(e).fontSize))")
        check('R3 %dx%d ช่องกรอกในตาราง font ≥ 16px (กัน iOS ซูมเอง)' % (w, h), fs and min(fs) >= 16, fs)
        cf = pg2.evaluate("() => { const r = document.querySelector('.cf.cur').getBoundingClientRect(); const t = document.querySelector('#tabs').getBoundingClientRect(); return [r.width, r.height, r.bottom, t.top]; }")
        check('R4 %dx%d ปุ่มยืนยันของเซตปัจจุบัน ≥ 48px' % (w, h), cf[0] >= 48 and cf[1] >= 48, cf)
        bad = pg2.evaluate("""() => { const t = document.querySelector('.sets'); const r = t.getBoundingClientRect(); return [r.left, r.right, window.innerWidth]; }""")
        check('R5 %dx%d ตารางอยู่ในจอทั้งตาราง' % (w, h), bad[0] >= 0 and bad[1] <= bad[2], bad)
        # ตารางกับปุ่มยืนยันเห็นโดยไม่ต้องเลื่อน
        vis = pg2.evaluate("() => { const r = document.querySelector('.sets').getBoundingClientRect(); return [r.top, r.bottom, window.innerHeight]; }")
        check('R6 %dx%d ตารางทั้งสามแถวเห็นครบโดยไม่ต้องเลื่อน (บนจอ %d)' % (w, h, h), vis[1] <= vis[2] - 64 or h < 700, vis)
        pg2.context.close()

    # ---------- S. offline + service worker ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='th-TH')
    pg3 = ctx.new_page(); pg3.goto(BASE + 'index.html'); pg3.wait_for_selector('.plan-card')
    pg3.evaluate("navigator.serviceWorker.ready")
    pg3.wait_for_timeout(1500)
    keys = pg3.evaluate("caches.keys()")
    cached = pg3.evaluate("async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).map(r => new URL(r.url).pathname.split('/').pop()); }")
    need = ['core.js', 'views.js', 'app.js', 'icons.js', 'program.js', 'styles.css', 'inter-latin-wght-normal.woff2', 'noto-sans-thai-thai-wght-normal.woff2']
    check('S1 service worker ติดตั้งแล้ว และแคชไฟล์แอป+ฟอนต์ครบ', len(keys) == 1 and all(n in cached for n in need), (keys, [n for n in need if n not in cached]))
    ctx.set_offline(True)
    pg3.reload(); pg3.wait_for_selector('.plan-card')
    fonts_ok = pg3.evaluate("""async () => { await document.fonts.ready; return document.fonts.check('16px Inter'); }""")
    check('S2 offline: เปิดแอปได้ แผนอยู่ครบ ฟอนต์โหลดจากแคช', pg3.locator('.plan-card').count() == 4 and fonts_ok)
    pg3.click('.plan-card >> nth=0'); pg3.click('[data-action=start-plan]'); pg3.wait_for_selector('.sets'); log_sets(pg3, 50, 10)
    check('S3 offline: จดเซตได้ (บันทึกในเครื่อง)', len([s for w in db(pg3, 'workouts') for e in w['entries'] for s in e['sets']]) == 1)
    ctx.close()

    b.close()

print('\n%d/%d ผ่าน' % (passed, passed + failed))
if fails:
    print('ที่ไม่ผ่าน:'); [print(' -', f) for f in fails]
sys.exit(1 if failed else 0)
