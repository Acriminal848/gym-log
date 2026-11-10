#!/usr/bin/env python3
"""ทดสอบ 1.9 (ส่วน UI): กราฟแตะดูค่า · ปุ่ม/ชิป/แท็กไม่ตกบรรทัดที่ความกว้าง 320–430 ทุกหน้าหลัก
รัน: python3 tests/e2e_v19b.py http://localhost:8765/gym-log/ (ข้อมูลสมมติ)"""
import sys
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L
exec(open(__file__.replace('e2e_v19b.py', 'e2e_v17.py')).read().split("def main")[0].split("import e2e_v14_lib as L")[1])

def hist(pg, mode):
    tab(pg, 'history'); pg.wait_for_selector('.seg')
    pg.click('[data-action=his-mode][data-mode=%s]' % mode); pg.wait_for_timeout(150)

# ปุ่ม/ชิป/แท็ก/แท็บที่ข้อความต้องอยู่บรรทัดเดียว: นับบรรทัดจริงของข้อความด้วย Range (ไม่พึ่งความสูง)
WRAP_JS = """() => {
  const sel = 'button, .chip, .tag, .btn, [role=tab], .badge, .pill';
  const bad = [];
  document.querySelectorAll(sel).forEach(el => {
    const cs = getComputedStyle(el), r0 = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || r0.width === 0 || r0.height === 0) return;
    const txt = (el.innerText || '').trim().replace(/\\s+/g, ' ');
    if (!txt) return;
    // การ์ดที่เป็นปุ่มทั้งใบ (ตั้งใจให้หลายบรรทัด) ข้าม: ถือว่าเป็นข้อความยาว > 22 ตัวอักษรหรือมีลูกเป็นบล็อก
    if (txt.length > 22 || el.querySelector('div, p, h1, h2, h3, li')) return;
    const rg = document.createRange(); rg.selectNodeContents(el);
    const tops = new Set([...rg.getClientRects()].filter(r => r.width > 1 && r.height > 1).map(r => Math.round(r.top / 4)));
    // ไอคอน svg ในปุ่มอาจอยู่คนละระดับกับข้อความเล็กน้อย → นับบรรทัดจากเฉพาะ text node
    const lines = new Set();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      [...r.getClientRects()].forEach(q => { if (q.width > 1) lines.add(Math.round(q.top / 6)); });
    }
    const over = el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible';
    // ข้อความล้นกล่องของปุ่ม (เช่น “+ Warm-up” ทะลุขอบ)
    const rr = document.createRange(); rr.selectNodeContents(el);
    const rb = rr.getBoundingClientRect(), eb = el.getBoundingClientRect();
    const spill = rb.width > 0 && (rb.right > eb.right + 1 || rb.left < eb.left - 1);
    if (lines.size > 1 || over || spill) bad.push((el.className || el.tagName) + ' «' + txt + '» lines=' + lines.size + (spill ? ' spill' : '') + (over ? ' clip' : ''));
  });
  // ข้อความที่ถูกตัดด้วย … (ellipsis) ในหน้าจอ = ข้อมูลหาย ต้องไม่มี
  document.querySelectorAll('#view *, .sheet *').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.getBoundingClientRect().width > 0) bad.push('ellipsis ' + (el.className || el.tagName) + ' «' + (el.innerText || '').trim().slice(0, 20) + '»');
  });
  const hs = document.documentElement.scrollWidth > window.innerWidth + 1;
  return { bad, hs };
}"""

def audit(pg, name, widths):
    for w in widths:
        pg.set_viewport_size({'width': w, 'height': 844}); pg.wait_for_timeout(120)
        r = pg.evaluate(WRAP_JS)
        check('W %s @%d: ปุ่ม/ชิป/แท็กไม่ตกบรรทัด และไม่มี scroll แนวนอน' % (name, w), not r['bad'] and not r['hs'], r)

def main():
    W = [320, 360, 375, 390, 430]
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = new_page(b)
        for i in range(6):
            seed(pg, -i * 3, 'c%d' % i, [[40 + 2.5 * (5 - i), 10]] * 3, 'ppl-plan-push')
        pg.reload(); pg.wait_for_selector('.today-card, .session-bar')
        # ===== กราฟแตะดูค่า
        hist(pg, 'exercises'); pg.click('[data-action=sum-open][data-ex=ppl-incline-chest-press]'); pg.wait_for_selector('svg.chart')
        rd0 = pg.inner_text('.chart-read')
        check('C1 ใต้กราฟมีข้อความค่าล่าสุดตั้งแต่ยังไม่แตะ (วันที่ · kg × reps)', 'kg' in rd0 and '×' in rd0, rd0)
        bb = pg.locator('svg.chart').bounding_box()
        pg.mouse.move(bb['x'] + 46, bb['y'] + bb['height'] / 2); pg.mouse.down()
        pg.wait_for_timeout(80)
        rd1 = pg.inner_text('.chart-read')
        vis = pg.locator('svg.chart .ch-cross').get_attribute('visibility')
        check('C2 แตะซ้ายสุด → เส้นแนวตั้งโผล่ + ข้อความเปลี่ยนเป็นครั้งแรก (40 kg)', vis == 'visible' and rd1 != rd0 and '40 kg' in rd1, (vis, rd0, rd1))
        pg.mouse.move(bb['x'] + bb['width'] - 20, bb['y'] + bb['height'] / 2, steps=6); pg.wait_for_timeout(80)
        rd2 = pg.inner_text('.chart-read')
        check('C3 ลากไปขวาสุด → ข้อความเป็นครั้งล่าสุด (52.5 kg)', '52.5 kg' in rd2, rd2)
        pg.mouse.up()
        check('C4 ค่าที่อ่านได้ตรงกับตารางรายครั้งด้านล่าง (มีแถว 52.5)', '52.5' in pg.inner_text('#view'))
        bx = pg.locator('.chart-read').bounding_box()
        check('C5 ข้อความค่าสูง ≥44px และอยู่ในจอ', bx['height'] >= 44 and bx['x'] >= 0 and bx['x'] + bx['width'] <= 391, bx)
        pg.screenshot(path='/tmp/claude-0/-home-claude/44a71f2a-f023-536c-9269-b50168aee976/scratchpad/gym/shots/v19_chart.png')

        # ===== ปุ่มไม่ตกบรรทัด ทุกหน้า
        go_home(pg); audit(pg, 'หน้าแรก', W)
        pg.set_viewport_size({'width': 390, 'height': 844})
        tab(pg, 'plans'); pg.wait_for_timeout(150); audit(pg, 'แผน', W)
        pg.set_viewport_size({'width': 390, 'height': 844})
        tab(pg, 'exercises'); pg.wait_for_timeout(150); audit(pg, 'ท่า', W)
        pg.set_viewport_size({'width': 390, 'height': 844})
        pg.click('[data-action=ex-new]'); pg.wait_for_selector('#ef-name'); audit(pg, 'ฟอร์มท่า', W)
        pg.click('[data-action=muscle-pick][data-v=อก]'); audit(pg, 'ฟอร์มท่า+ส่วนย่อย', W)
        pg.set_viewport_size({'width': 390, 'height': 844})
        pg.screenshot(path='/tmp/claude-0/-home-claude/44a71f2a-f023-536c-9269-b50168aee976/scratchpad/gym/shots/v19_form_sub.png')
        pg.click('.topbar .back'); pg.wait_for_timeout(200)
        if pg.locator('.sheet').count(): pg.click('.sheet button:has-text("ทิ้งการแก้ไข")'); pg.wait_for_timeout(250)
        for m, nm in (('overview', 'ภาพรวม'), ('exercises', 'รายท่า'), ('sessions', 'รายครั้ง')):
            hist(pg, m); pg.wait_for_timeout(100); audit(pg, 'ประวัติ ' + nm, W)
            pg.set_viewport_size({'width': 390, 'height': 844})
        hist(pg, 'exercises'); pg.click('[data-action=sum-open][data-ex=ppl-incline-chest-press]'); pg.wait_for_selector('svg.chart'); audit(pg, 'หน้าท่า+กราฟ', W)
        pg.set_viewport_size({'width': 390, 'height': 844})
        go_home(pg); pg.click('[data-action=open-settings]'); pg.wait_for_selector('.rest-presets'); audit(pg, 'ตั้งค่า', W)
        pg.set_viewport_size({'width': 390, 'height': 844})
        go_home(pg); start_plan(pg, 'Push'); pg.wait_for_selector('.target'); pg.wait_for_timeout(200)
        audit(pg, 'หน้าจด', W)
        pg.set_viewport_size({'width': 390, 'height': 844})
        for _ in range(1):
            fill(pg, 0, 40, 10); confirm(pg); pg.wait_for_timeout(250)
        audit(pg, 'หน้าจด (พักเซต)', W)
        pg.set_viewport_size({'width': 390, 'height': 844})
        pg.click('[data-action=step-edit]'); pg.wait_for_selector('#step-in'); audit(pg, 'แผ่นขั้นน้ำหนัก', W)
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z4 ไม่มี error ใน console', not errs, errs)
        b.close()
    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

if __name__ == '__main__':
    main()
