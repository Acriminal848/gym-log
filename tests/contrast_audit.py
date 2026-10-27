#!/usr/bin/env python3
"""ตรวจคอนทราสต์จริงตามสัดส่วน WCAG บนพื้นหลังที่แสดงผลจริง
วิธี: ซ่อนสีตัวอักษรทั้งหมด → จับภาพ → สุ่มพิกเซลพื้นหลังหลังกรอบข้อความแต่ละชิ้น
      → เทียบกับสีตัวอักษร (computed) เอาค่าที่แย่ที่สุด; เกณฑ์ >= 4.5 (ข้อความเล็ก) / 3.0 (ข้อความตัวใหญ่ ≥ 24px หรือ ≥ 18.66px ตัวหนา)
รัน: python3 tests/contrast_audit.py http://localhost:8765/gym-log/
ทดสอบในเบราว์เซอร์จำลอง (Chromium) ไม่ใช่หน้าจอ iPhone จริง"""
import sys, io, re, warnings
warnings.filterwarnings('ignore')
from playwright.sync_api import sync_playwright
from PIL import Image

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/gym-log/'
DPR = 2
JS_COLLECT = """() => {
  const out = [];
  const sh = document.querySelector('.sheet'); const root = sh || document.body;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.textContent.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || ['SCRIPT','STYLE'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || (el.checkVisibility && !el.checkVisibility())) continue;
    let op = 1, p = el; while (p) { op *= parseFloat(getComputedStyle(p).opacity); p = p.parentElement; }
    const r = document.createRange(); r.selectNodeContents(n);
    const rects = Array.from(r.getClientRects()).filter(x => x.width > 1 && x.height > 1);
    if (!rects.length) continue;
    const b = rects[0];
    const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, b.left + b.width / 2)), Math.min(innerHeight - 1, Math.max(0, b.top + b.height / 2)));
    if (!hit || !(el.contains(hit) || hit.contains(el))) continue;   // ถูกบัง (เช่น แถบเมนู/ปุ่มล่าง/แผ่นเลื่อน) หรืออยู่ในส่วนที่ซ่อน
    if (b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue;
    out.push({t: t.slice(0, 40), color: cs.color, op, fs: parseFloat(cs.fontSize), fw: parseInt(cs.fontWeight), x: b.left, y: b.top, w: b.width, h: b.height, cls: el.className || el.tagName});
  }
  // placeholder ของช่องกรอก
  root.querySelectorAll('input, textarea').forEach(i => {
    if (!i.placeholder || i.value) return;
    const cs = getComputedStyle(i, '::placeholder'); const b = i.getBoundingClientRect();
    if (b.width < 2 || b.top > innerHeight || b.bottom < 0) return;
    out.push({t: 'placeholder:' + i.placeholder.slice(0, 20), color: cs.color, op: 1, fs: parseFloat(getComputedStyle(i).fontSize), fw: 400, x: b.left + 8, y: b.top + 6, w: Math.min(b.width - 16, 40), h: Math.max(4, b.height - 12), cls: 'input'});
  });
  return out;
}"""
def parse(c):
    m = re.findall(r'[\d.]+', c); v = [float(x) for x in m]
    return v[0], v[1], v[2], (v[3] if len(v) > 3 else 1.0)
def lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
def lum(rgb): return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
def ratio(a, b):
    la, lb = lum(a), lum(b); hi, lo = max(la, lb), min(la, lb); return (hi + 0.05) / (lo + 0.05)

HIDE = "*{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important} ::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important} svg *{} "
bad_all = []; total = 0; worst = []

def audit(pg, name):
    global total
    items = pg.evaluate(JS_COLLECT)
    st = pg.add_style_tag(content=HIDE)
    pg.wait_for_timeout(120)
    img = Image.open(io.BytesIO(pg.screenshot())).convert('RGB')
    pg.evaluate("el => el.remove()", st)
    bad = []
    for it in items:
        total += 1
        x0, y0 = max(0, int(it['x'] * DPR)), max(0, int(it['y'] * DPR))
        x1, y1 = min(img.width, int((it['x'] + it['w']) * DPR)), min(img.height, int((it['y'] + it['h']) * DPR))
        if x1 <= x0 or y1 <= y0: continue
        crop = img.crop((x0, y0, x1, y1)); px = list(crop.getdata())
        r, g, b, a = parse(it['color']); a *= it['op']
        large = it['fs'] >= 24 or (it['fs'] >= 18.66 and it['fw'] >= 700)
        need = 3.0 if large else 4.5
        # ผสมสีตัวอักษรกับพื้นหลังแต่ละพิกเซลแล้วหาค่าต่ำสุดที่ระดับ 5th percentile
        rs = []
        step = max(1, len(px) // 400)
        for (pr, pg_, pb) in px[::step]:
            fg = (r * a + pr * (1 - a), g * a + pg_ * (1 - a), b * a + pb * (1 - a))
            rs.append(ratio(fg, (pr, pg_, pb)))
        rs.sort(); val = rs[max(0, int(len(rs) * 0.03))]
        worst.append((val, name, it['t'], it['cls']))
        if val < need: bad.append((round(val, 2), need, it['t'], it['cls'], it['color']))
    for b_ in bad: bad_all.append((name,) + b_)
    print('%-34s ข้อความ %3d ชิ้น  ต่ำกว่าเกณฑ์ %d' % (name, len(items), len(bad)))

def tabgo(pg, name):
    # 1.4: แถบเมนูล่างซ่อนระหว่างจด → ออกด้วยปุ่มกลับก่อน
    if not pg.locator('#tabs').is_visible():
        pg.click('.s-head .back'); pg.wait_for_selector('#tabs', state='visible')
    pg.click('#tabs [data-tab=%s]' % name)

def open_page(b, w=390, h=844):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=DPR, locale='th-TH', service_workers='block', reduced_motion='reduce')
    pg = ctx.new_page(); pg.goto(BASE + 'index.html'); pg.wait_for_selector('.plan-card'); return pg

with sync_playwright() as p:
    b = p.chromium.launch(); pg = open_page(b)
    audit(pg, 'home')
    pg.click('.plan-card >> nth=0'); pg.wait_for_selector('[data-action=start-plan]'); audit(pg, 'plan-preview')
    pg.click('[data-action=start-plan]'); pg.wait_for_selector('.sets'); audit(pg, 'session-empty')
    pg.fill('input[data-pending="0"][data-field=weight]', '60'); pg.fill('input[data-pending="0"][data-field=reps]', '10')
    pg.click('.cf.cur'); pg.wait_for_timeout(200); audit(pg, 'session-after-confirm(undo+carry)')
    audit(pg, 'session+rest-bar')
    pg.click('[data-action=entry-menu]'); pg.wait_for_selector('.sheet'); audit(pg, 'sheet-entry-menu')
    pg.click('[data-action=add-ex]'); pg.wait_for_selector('#pick-q'); audit(pg, 'sheet-add-ex')
    pg.click('.create-cta'); pg.wait_for_selector('#qx-name'); audit(pg, 'sheet-quick-create'); pg.mouse.click(195, 30); pg.wait_for_timeout(100)
    pg.click('[data-action=ex-list]'); pg.wait_for_selector('.sheet'); audit(pg, 'sheet-exercise-list'); pg.mouse.click(195, 30); pg.wait_for_timeout(100)
    pg.click('[data-action=swap]'); pg.wait_for_selector('.sheet'); audit(pg, 'sheet-swap'); pg.click('.sheet details summary'); pg.wait_for_timeout(150); audit(pg, 'sheet-swap(คลังท่าเปิด)'); pg.mouse.click(195, 30); pg.wait_for_timeout(100)
    pg.click('[data-action=manage]'); pg.wait_for_selector('.sheet'); audit(pg, 'sheet-manage'); pg.mouse.click(195, 30); pg.wait_for_timeout(100)
    pg.click('[data-action=ex-history]'); pg.wait_for_selector('.sheet'); audit(pg, 'sheet-ex-history'); pg.mouse.click(195, 30); pg.wait_for_timeout(100)
    tabgo(pg, 'home'); pg.wait_for_selector('.session-bar'); audit(pg, 'home-with-session-bar')
    pg.click('.plan-card >> nth=1'); pg.click('[data-action=start-plan]'); pg.wait_for_selector('.sheet'); audit(pg, 'sheet-start-conflict')
    pg.click('[data-action=conflict-discard]'); pg.wait_for_selector('[data-action=discard-confirm]'); audit(pg, 'sheet-discard-confirm'); pg.mouse.click(195, 30); pg.wait_for_timeout(100)
    pg.click('[data-action=conflict-resume]') if pg.locator('[data-action=conflict-resume]').count() else None
    pg.wait_for_timeout(100)
    # สร้างประวัติแล้วจบ
    if pg.locator('[data-action=manage]').count() == 0:
        pg.goto(BASE + 'index.html'); pg.wait_for_selector('.plan-card'); pg.click('.session-bar [data-action=resume]'); pg.wait_for_selector('.sets')
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=finish]'); pg.wait_for_selector('.sheet'); audit(pg, 'sheet-finish-incomplete')
    pg.click('[data-action=finish-confirm]'); pg.wait_for_selector('h1:has-text("จบการฝึกแล้ว")'); audit(pg, 'done')
    for tab, nm in [('plans', 'plans'), ('exercises', 'exercises'), ('history', 'history')]:
        tabgo(pg, tab); pg.wait_for_timeout(200); audit(pg, nm)
    pg.click('[data-action=his-mode][data-mode=exercises]'); pg.wait_for_timeout(100); audit(pg, 'history-by-exercise')
    pg.click('[data-action=his-mode][data-mode=weeks]'); pg.wait_for_timeout(100); audit(pg, 'history-weekly')
    pg.click('[data-action=his-mode][data-mode=sessions]')
    pg.click('[data-action=open-detail] >> nth=0'); pg.wait_for_selector('.setline'); audit(pg, 'workout-detail')
    tabgo(pg, 'plans'); pg.wait_for_timeout(150)
    pg.click('[data-action=plan-edit] >> nth=0'); pg.wait_for_selector('[data-action=pi-add]'); audit(pg, 'plan-edit')
    pg.click('[data-action=pi-add]'); pg.wait_for_selector('#pick-q'); audit(pg, 'sheet-plan-add-picker')
    pg.mouse.click(195, 30); pg.wait_for_timeout(100)
    pg.goto(BASE + 'index.html'); pg.wait_for_selector('.plan-card')
    tabgo(pg, 'exercises'); pg.wait_for_selector('#ex-q'); pg.click('[data-action=ex-new]'); pg.wait_for_selector('#ef-name'); audit(pg, 'exercise-edit(new)')
    pg.click('[data-action=icon-pick][data-v=curl]'); audit(pg, 'exercise-edit(icon picked)')
    tabgo(pg, 'home'); 
    if pg.locator('.sheet').count(): pg.click('[data-action=discard-edit]')
    pg.wait_for_selector('.plan-card'); pg.click('[data-action=open-backup]'); pg.wait_for_selector('[data-action=export]'); audit(pg, 'backup')
    b.close()

worst.sort(key=lambda x: x[0])
print('\nตรวจทั้งหมด %d ชิ้น; ค่าต่ำสุด 8 อันดับ:' % total)
for w_ in worst[:8]: print('  %.2f  %s | %s | %s' % w_)
if bad_all:
    print('\nไม่ผ่านเกณฑ์ %d ชิ้น:' % len(bad_all))
    for x in bad_all: print('  ', x)
    sys.exit(1)
print('\nผ่านทั้งหมด (>= 4.5 ข้อความปกติ, >= 3.0 ข้อความใหญ่)')
