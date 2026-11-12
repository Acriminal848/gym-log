#!/usr/bin/env python3
"""ทดสอบ 2.1: ไล่น้ำหนัก (ramp) · รายการน้ำหนักที่เครื่องมี · ปุ่ม ± ตามรายการ · คาด reps ใหม่หลังปรับน้ำหนัก
รัน: python3 tests/e2e_v21c.py http://localhost:8765/gym-log/"""
import sys, json
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L

def finish_active(pg):
    pg.click('[data-action=manage]'); pg.click('.sheet [data-action=finish]'); pg.wait_for_selector('.sheet')
    pg.click('[data-action=finish-confirm]'); pg.wait_for_selector('h1:has-text("จบการฝึกแล้ว")')

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = new_page(b)
        start_plan(pg, 'Pull'); pg.wait_for_selector('.sets')
        ids = pg.evaluate("GL.state.active.entries.map(e => e.exerciseId)")
        ex_a, ex_b = ids[0], ids[1]
        # ท่า A: เครื่องมี 12/18/24/30 · ท่า B: ไม่ตั้งรายการ · ทั้งคู่ 8–12 reps
        pg.evaluate("""async ([a, b]) => { for (const [id, wl] of [[a, [12, 18, 24, 30]], [b, null]]) {
          const e = Object.assign({}, GL.exById(id), { repMin: 8, repMax: 12, step: 6 }); if (wl) e.weights = wl; else delete e.weights;
          await GymStorage.put('exercises', e); Object.assign(GL.exById(id), e); if (!wl) delete GL.exById(id).weights; } GL.render(); }""", [ex_a, ex_b])
        pg.wait_for_selector('.sets')
        log_sets(pg, 18, 12, 3)
        pg.click('.cta-next'); pg.wait_for_timeout(150)
        for w_, r_ in [(24, 25), (30, 20), (39, 10)]:
            fill(pg, 0, w_, r_); confirm(pg)
        finish_active(pg)
        # ===== session 2
        go_home(pg)
        start_plan(pg, 'Pull'); pg.wait_for_selector('.sets')
        t0 = pg.evaluate("GL.state.active.entries[0].target")
        check('R1 18×12 ×3 และเครื่องมี 12/18/24/30: แนะนำอยู่ที่ 18 (ไม่ใช่ 23 ที่เครื่องไม่มี) แล้วเพิ่ม reps', t0 and t0['weight'] == 18 and t0['reps'] >= 13, t0)
        txt = pg.inner_text('#view')
        check('R2 บอกเหตุผลสั้น ๆ ว่าทำไมไม่ขึ้น 24 (ไม่ใช่ย่อหน้ายาว)', ('24' in (t0.get('reason') or '') or '24' in txt) and len(t0.get('reason') or '') < 160, t0)
        check('R3 ปุ่มปรับน้ำหนักตรงกลางเขียน “ตามเครื่อง” เมื่อมีรายการน้ำหนัก', 'ตามเครื่อง' in pg.inner_text('.adj-c.edit'), pg.inner_text('.adj-c.edit'))
        w_in = 'input[data-pending="0"][data-field=weight]'
        pg.click('.adj-grp:first-child .adj-b >> nth=1'); pg.wait_for_timeout(200)
        check('R4 กด + → ขึ้นไปน้ำหนักถัดไปในรายการ (18 → 24 ไม่ใช่ 24 จากขั้น 6 โดยบังเอิญ)', pg.input_value(w_in) == '24', pg.input_value(w_in))
        pred = pg.inner_text('#pred-slot')
        check('R5 หลังปรับเป็น 24 → แอปคำนวณ reps ที่คาดว่าทำได้ใหม่ (บรรทัดเดียว) และเติม reps ให้', 'ที่ 24 kg' in pred and 'reps' in pred and pg.input_value('input[data-pending="0"][data-field=reps]') != '', (pred, pg.input_value('input[data-pending="0"][data-field=reps]')))
        pg.click('.adj-grp:first-child .adj-b >> nth=1'); pg.wait_for_timeout(150)
        check('R6 กด + อีกครั้ง → 30 (ตามรายการ ไม่ใช่ 30 เพราะเลขกลม)', pg.input_value(w_in) == '30', pg.input_value(w_in))
        pg.click('.adj-grp:first-child .adj-b >> nth=0'); pg.click('.adj-grp:first-child .adj-b >> nth=0'); pg.wait_for_timeout(150)
        check('R7 กด − สองครั้ง → กลับ 18', pg.input_value(w_in) == '18', pg.input_value(w_in))
        # reps ที่ผู้ใช้พิมพ์เอง ต้องไม่ถูกแอปเขียนทับ
        pg.fill('input[data-pending="0"][data-field=reps]', '9'); pg.press('input[data-pending="0"][data-field=reps]', 'Tab')
        pg.click('.adj-grp:first-child .adj-b >> nth=1'); pg.wait_for_timeout(150)
        check('R8 reps ที่พิมพ์เองไม่ถูกเขียนทับเมื่อกด ±น้ำหนัก (แต่ยังบอกค่าที่คาดไว้)', pg.input_value('input[data-pending="0"][data-field=reps]') == '9' and 'คาดทำได้' in pg.inner_text('#pred-slot'))
        # แผ่นตั้งค่า
        pg.click('.adj-c.edit'); pg.wait_for_selector('#step-in')
        h = pg.evaluate("document.querySelector('.sheet').getBoundingClientRect().height / innerHeight")
        check('R9 แผ่นขั้นน้ำหนักไม่ยาว (< 70% ของจอ) และมีแถว “น้ำหนักที่เครื่องมี”', h < 0.7 and pg.locator('[data-action=weights-open]').count() == 1, h)
        pg.click('[data-action=weights-open]'); pg.wait_for_selector('#wl-in')
        check('R10 แผ่นรายการน้ำหนัก: ค่าเดิม 12, 18, 24, 30', pg.input_value('#wl-in') == '12, 18, 24, 30', pg.input_value('#wl-in'))
        pg.fill('#wl-in', '12 18 x'); pg.click('[data-action=weights-save]'); pg.wait_for_timeout(200)
        check('R11 ค่าไม่ใช่ตัวเลข → ไม่บันทึก แจ้งเตือน และข้อมูลเดิมไม่เปลี่ยน', pg.locator('#toast:visible').count() == 1 and next(e for e in db(pg, 'exercises') if e['id'] == ex_a)['weights'] == [12, 18, 24, 30])
        pg.fill('#wl-in', '18'); pg.click('[data-action=weights-save]'); pg.wait_for_timeout(200)
        check('R12 ใส่ค่าเดียว → ไม่บันทึก (ต้อง ≥ 2 ค่า)', next(e for e in db(pg, 'exercises') if e['id'] == ex_a)['weights'] == [12, 18, 24, 30])
        pg.fill('#wl-in', '12, 18, 24, 30, 39, 39'); pg.click('[data-action=weights-save]'); pg.wait_for_timeout(300)
        check('R13 บันทึกรายการ → เรียง/ตัดซ้ำ เก็บที่ท่า (12, 18, 24, 30, 39)', next(e for e in db(pg, 'exercises') if e['id'] == ex_a)['weights'] == [12, 18, 24, 30, 39])
        pg.click('.adj-c.edit'); pg.click('[data-action=weights-open]'); pg.wait_for_selector('#wl-in')
        pg.fill('#wl-in', ''); pg.click('[data-action=weights-save]'); pg.wait_for_timeout(300)
        e_a = next(e for e in db(pg, 'exercises') if e['id'] == ex_a)
        check('R14 เว้นว่างแล้วบันทึก → ล้างรายการ (ไม่มีคีย์ weights) ฟิลด์อื่นเดิม', 'weights' not in e_a and e_a['repMin'] == 8 and e_a['step'] == 6, e_a)
        # ===== ท่า B: ไล่น้ำหนัก 24×25, 30×20, 39×10 (ไม่มีรายการ)
        pg.click('.cta-next') if False else pg.evaluate("GL.state.cur = 1; GL.render()")
        tb = pg.evaluate("GL.state.active.entries[1].target")
        check('R15 ไล่น้ำหนัก 24×25 → 30×20 → 39×10 (ช่วง 8–12): แนะนำ 39 × 11 ไม่ถอยไป 24', tb and tb['weight'] == 39 and tb['reps'] == 11 and tb['kind'] == 'ramp', tb)
        check('R16 ป้ายเหตุผลสั้น “จากเซตที่ไหวสุด” และบรรทัดไม่ยาว', 'จากเซตที่ไหวสุด' in pg.inner_text('#view') and len(tb.get('reason') or '') < 160, tb.get('reason'))
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z8 ไม่มี error ใน console', not errs, errs)
        b.close()
    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

if __name__ == '__main__':
    main()
