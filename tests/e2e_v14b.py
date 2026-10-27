#!/usr/bin/env python3
"""ทดสอบฟีเจอร์ใหม่ของ 1.4: ตัวจับเวลาพัก, ตั้งค่า, สร้างท่าเร็ว, เพิ่ม/ลบ/แก้ท่าที่จดผิด, โหมดโฟกัสหน้าจด
รัน: python3 tests/e2e_v14b.py http://localhost:8765/gym-log/   (ข้อมูลสมมติทั้งหมด)
"""
import sys
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L

def st(pg, expr):
    return pg.evaluate("() => " + expr)

def settings(pg):
    return {r['key']: r['value'] for r in db(pg, 'settings')}

def names(pg):
    return [e['exerciseName'] for e in workouts(pg)[0]['entries']]

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = new_page(b)
        start_plan(pg, 'Pull')
        pg.wait_for_selector('.sets')
        # ---- โหมดโฟกัส
        check('F1 ในหน้าจด แถบเมนูล่างถูกซ่อน', not pg.locator('#tabs').is_visible())
        check('F2 ยังมีปุ่มกลับหน้าแรก', pg.locator('.s-head .back').count() == 1)
        # ---- ตัวจับเวลาพัก
        check('R0 ก่อนยืนยันเซต ไม่มีแถบพัก', not pg.locator('#rest-bar').is_visible())
        log_sets(pg, 60, 10)
        pg.wait_for_selector('#rest-bar', state='visible')
        t0 = pg.inner_text('#rb-time')
        check('R1 ยืนยันเซต → แถบพักขึ้น เริ่ม ~1:30 (ค่าเริ่มต้น 90 วิ)', t0 in ('1:30', '1:29'), t0)
        pg.click('[data-action=rest-plus]')
        check('R2 +15 → ~1:45', pg.inner_text('#rb-time') in ('1:45', '1:44'), pg.inner_text('#rb-time'))
        pg.click('[data-action=rest-minus]'); pg.click('[data-action=rest-minus]')
        check('R3 −15 ×2 → ~1:15', pg.inner_text('#rb-time') in ('1:15', '1:14'), pg.inner_text('#rb-time'))
        check('R4 แถบพักไม่บังปุ่มยืนยัน (ปุ่มยืนยันอยู่เหนือแถบ)', pg.evaluate("() => { const c=document.querySelector('.cf.cur').getBoundingClientRect(), r=document.getElementById('rest-bar').getBoundingClientRect(); return c.bottom <= r.top; }"))
        pg.evaluate("() => { GL.state.rest.endsAt = Date.now() - 4000; }")
        pg.wait_for_timeout(500)
        check('R5 พักครบ → แสดง “พร้อมเล่น” (ไม่มีเลขนับเกิน)', pg.inner_text('#rb-time') == 'พร้อมเล่น' and not __import__('re').search(r'\+\d+:\d', pg.inner_text('#rest-bar')), pg.inner_text('#rest-bar'))
        pg.wait_for_timeout(1500)
        check('R5a พักครบแล้วหยุดนับ: ผ่านไปอีก 1.5 วิ ข้อความยังนิ่ง ไม่มี +0:0x', pg.inner_text('#rb-time') == 'พร้อมเล่น' and not __import__('re').search(r'\+\d+:\d', pg.inner_text('#rest-bar')), pg.inner_text('#rest-bar'))
        check('R6 พักครบ → ประกาศให้ screen reader', 'พักครบแล้ว' in pg.inner_text('#rest-live'))
        check('R6a ปุ่มข้ามเปลี่ยนเป็น “ปิด” ตอนพักครบ', pg.inner_text('[data-action=rest-skip]').strip() == 'ปิด')
        pg.click('[data-action=rest-skip]')
        check('R7 กดปิด → แถบหาย', not pg.locator('#rest-bar').is_visible())
        log_sets(pg, 60, 9)
        check('R8 เซตถัดไป → เริ่มนับใหม่', pg.locator('#rest-bar').is_visible())
        pg.evaluate("() => { GL.state.rest.endsAt = Date.now() - 1000; }"); pg.wait_for_timeout(450)
        check('R8a พักครบ แล้วแตะช่องกรอก → แถบซ่อนเอง (ไม่ต้องกดข้าม)', pg.inner_text('#rb-time') == 'พร้อมเล่น')
        pg.click('input[data-pending="0"][data-field=weight]'); pg.wait_for_timeout(200)
        check('R8b แตะช่องกรอกหลังพักครบ → แถบหาย', not pg.locator('#rest-bar').is_visible())
        pg.evaluate("() => GL.rest.start(30)"); pg.wait_for_timeout(300)
        check('R8c เริ่มพักรอบใหม่ → นับถอยหลังตามเดิม', pg.locator('#rest-bar').is_visible() and pg.inner_text('#rb-time') != 'พร้อมเล่น')
        pg.evaluate("() => { GL.state.rest.endsAt = Date.now() - 1000; }"); pg.wait_for_timeout(450)
        pg.evaluate("() => { GL.state.rest.doneAt = Date.now() - 7000; }"); pg.wait_for_timeout(450)
        check('R8d พักครบแล้วไม่ทำอะไร → ซ่อนเองหลังไม่กี่วินาที', not pg.locator('#rest-bar').is_visible())
        pg.click('.s-head .back'); pg.wait_for_selector('#tabs', state='visible')
        check('R9 ออกจากหน้าจด → แถบพักซ่อน', not pg.locator('#rest-bar').is_visible())

        # ---- ตั้งค่า
        go_home(pg)
        pg.click('[data-action=open-settings]'); pg.wait_for_selector('.rest-presets')
        check('G1 หน้าตั้งค่ามี preset 60/90/120/180', pg.locator('[data-action=set-rest]').count() == 4)
        check('G2 ค่าเริ่มต้น 90 ถูกเลือก', pg.locator('[data-action=set-rest][data-v="90"].on').count() == 1)
        pg.click('[data-action=set-rest][data-v="60"]'); pg.wait_for_timeout(150)
        check('G3 เลือก 60 → เก็บลง settings', settings(pg).get('restSeconds') == 60, settings(pg))
        pg.click('[data-action=set-rest-custom]'); pg.wait_for_selector('#rest-custom')
        pg.fill('#rest-custom', '45'); pg.press('#rest-custom', 'Tab'); pg.wait_for_timeout(200)
        check('G4 กำหนดเอง 45 → เก็บ 45', settings(pg).get('restSeconds') == 45, settings(pg))
        pg.fill('#rest-custom', '5'); pg.press('#rest-custom', 'Tab'); pg.wait_for_timeout(200)
        check('G5 ค่าไม่ถูกต้อง (5) → ไม่เปลี่ยน แจ้งเตือน', settings(pg).get('restSeconds') == 45 and pg.locator('#toast:visible').count() == 1)
        pg.click('[data-action=set-toggle][data-key=restSound]'); pg.wait_for_timeout(150)
        check('G6 ปิดเสียง → เก็บ false', settings(pg).get('restSound') is False)
        pg.click('[data-action=set-toggle][data-key=restAuto]'); pg.wait_for_timeout(150)
        check('G7 ปิดนับอัตโนมัติ → เก็บ false', settings(pg).get('restAuto') is False)
        pg.reload(); pg.wait_for_selector('.today-card, .session-bar')
        check('G8 รีโหลดแล้วค่าตั้งค่ายังอยู่', settings(pg).get('restSeconds') == 45 and settings(pg).get('restAuto') is False)
        pg.click('[data-action=open-settings]'); pg.wait_for_selector('.rest-presets')
        pg.click('[data-action=set-toggle][data-key=restAuto]'); pg.wait_for_timeout(100)
        pg.click('[data-action=set-rest][data-v="120"]'); pg.wait_for_timeout(100)
        check('G9 กลับมาเปิดนับอัตโนมัติ + 120 วิ', settings(pg).get('restAuto') is True and settings(pg).get('restSeconds') == 120)
        check('G10 restFor: ท่ามี restSec ใช้ของท่า, ไม่งั้นใช้ค่ากลาง, ค่านอกช่วงถูกเมิน',
              pg.evaluate("() => [GL.restFor({restSec:30}), GL.restFor({}), GL.restFor({restSec:5}), GL.restFor({restSec:2000})]") == [30, 120, 120, 120])
        go_home(pg)

        # ---- เปิด session ต่อ
        pg.wait_for_selector('[data-action=resume]'); pg.click('[data-action=resume]')
        pg.wait_for_selector('.sets')
        n_before = len(names(pg))
        cur_name = names(pg)[st(pg, 'GL.state.cur')]
        # ---- เพิ่ม/สร้างท่าเร็ว
        pg.click('[data-action=entry-menu]'); pg.click('[data-action=add-ex]'); pg.wait_for_selector('#pick-q')
        check('A1 หน้าต่างเพิ่มท่า มีปุ่มสร้างท่าใหม่', pg.locator('[data-action=qx-open]').count() >= 1)
        pg.click('[data-action=add-sets][data-dir="1"]')
        check('A2 ปรับจำนวนเซตได้ (3→4)', st(pg, 'GL.state.addSets') == 4)
        pg.click('.create-cta'); pg.wait_for_selector('#qx-name')
        pg.fill('#qx-name', cur_name)  # ชื่อซ้ำกับท่าที่มี
        pg.click('[data-action=qx-save]'); pg.wait_for_timeout(200)
        check('A3 ชื่อซ้ำ → ไม่สร้าง แจ้งเตือน', pg.locator('#qx-name').count() == 1 and len(db(pg, 'exercises')) == st(pg, 'GL.state.exercises.length'))
        pg.fill('#qx-name', 'T-bar Row Close Grip')
        pg.click('#qx-muscles .chip >> nth=0'); pg.click('#qx-equips .chip >> nth=2')
        pg.click('[data-action=qx-save]'); pg.wait_for_timeout(300)
        ws = workouts(pg)[0]
        exs = [e for e in db(pg, 'exercises') if e['name'] == 'T-bar Row Close Grip']
        check('A4 สร้างท่าใหม่ถูกเก็บลง DB 1 รายการ', len(exs) == 1 and exs[0]['equipment'] == 'บาร์เบล' and exs[0]['repMin'] and exs[0]['step'], exs)
        check('A5 ท่าใหม่ถูกแทรก “ต่อจากท่าที่ดูอยู่” ไม่ใช่ท้ายสุด', ws['entries'][1]['exerciseName'] == 'T-bar Row Close Grip' or names(pg).index('T-bar Row Close Grip') == names(pg).index(cur_name) + 1, names(pg))
        check('A6 พาไปที่ท่าใหม่ทันที + มี 4 แถวเซต', 'T-bar Row Close Grip' in pg.inner_text('.ex-head') and pg.locator('input[data-field=weight]').count() == 4, pg.locator('input[data-field=weight]').count())
        check('A7 จำนวนท่าใน session เพิ่ม 1', len(names(pg)) == n_before + 1)
        check('A8 ท่าใหม่ไม่กระทบแผนหลัก', all('T-bar Row Close Grip' not in str(pl) for pl in db(pg, 'plans')))
        pg.click('[data-action=undo]'); pg.wait_for_timeout(250)
        check('A9 ย้อนกลับ → ท่าใหม่หายจาก session (ท่ายังอยู่ในคลัง)', 'T-bar Row Close Grip' not in names(pg) and len(names(pg)) == n_before)

        # ---- จดท่าผิด → แก้ (relabel)
        pg.wait_for_selector('.sets')
        idx = st(pg, 'GL.state.cur')
        log_sets(pg, 50, 10, 1)
        name_wrong = names(pg)[idx]
        pg.click('[data-action=swap]'); pg.wait_for_selector('.mode-seg')
        pg.click('[data-action=swap-mode][data-mode=fix]'); pg.wait_for_timeout(150)
        pg.click('.create-cta'); pg.wait_for_selector('#qx-name')
        pg.fill('#qx-name', 'Row Fixed Test'); pg.click('[data-action=qx-save]'); pg.wait_for_timeout(350)
        e = workouts(pg)[0]['entries'][idx]
        done = [s for s in e['sets'] if s['status'] == 'completed']
        check('X1 “จดผิดท่า”: เซตที่จดไว้ 3 เซตย้ายไปเป็นท่าใหม่ครบ น้ำหนัก/reps เดิมคงอยู่', e['exerciseName'] == 'Row Fixed Test' and len(done) == 3 and done[-1]['weight'] == 50 and done[-1]['reps'] == 10, e)
        check('X2 จำนวนท่าใน session ไม่เพิ่ม (ไม่แยกเป็นสองแถว)', len(names(pg)) == n_before)
        pg.click('[data-action=undo]'); pg.wait_for_timeout(250)
        e = workouts(pg)[0]['entries'][idx]
        check('X3 ย้อนกลับ → ชื่อเดิมกลับมา', e['exerciseName'] == name_wrong)

        # ---- โหมด “เปลี่ยนเฉพาะเซตที่เหลือ”
        pg.click('[data-action=swap]'); pg.wait_for_selector('.mode-seg')
        pg.click('[data-action=swap-pick] >> nth=0'); pg.wait_for_timeout(300)
        ws = workouts(pg)[0]
        check('X4 โหมดเซตที่เหลือ: ท่าเดิมเก็บ 3 เซต + มีแถวใหม่ต่อท้าย', len(ws['entries']) == n_before + 1 and ws['entries'][idx]['exerciseName'] == name_wrong and len([s for s in ws['entries'][idx]['sets'] if s['status']=='completed']) == 3)
        pg.click('[data-action=undo]'); pg.wait_for_timeout(250)

        # ---- ลบท่า
        pg.wait_for_selector('.sets')
        cnt = len(names(pg))
        pg.click('[data-action=entry-menu]'); pg.click('[data-action=entry-remove-ask]')
        check('D1 ลบท่าที่จดไว้แล้ว → เตือนจำนวนเซตก่อน + เสนอทางเลือกย้ายเซต', '3 เซต' in pg.inner_text('.sheet') and pg.locator('[data-action=swap-fix]').count() == 1)
        pg.click('[data-action=entry-remove-confirm]'); pg.wait_for_timeout(300)
        check('D2 ลบแล้วท่าหายจาก session และ DB', len(names(pg)) == cnt - 1 and name_wrong not in names(pg))
        pg.click('[data-action=undo]'); pg.wait_for_timeout(250)
        e = [x for x in workouts(pg)[0]['entries'] if x['exerciseName'] == name_wrong]
        check('D3 ย้อนกลับ → ท่าและเซตที่จดกลับมาครบ', len(names(pg)) == cnt and len(e) == 1 and len([s for s in e[0]['sets'] if s['status']=='completed']) == 3)

        # ---- คำแนะนำสีเทา
        has_hint = pg.locator('[data-action=hint-seen]').count()
        if has_hint:
            pg.click('[data-action=hint-seen]'); pg.wait_for_timeout(200)
            check('H1 กด “เข้าใจแล้ว” → ซ่อนคำอธิบาย + จำไว้', pg.locator('[data-action=hint-seen]').count() == 0 and settings(pg).get('hintSug') == 'seen')
        else:
            check('H1 (ไม่มีคำแนะนำให้ทดสอบในข้อมูลนี้ — ข้าม)', True)
        # ---- CTA ติดล่าง
        while pg.locator('.cf.cur').count():
            log_sets(pg, 40, 10)
        check('C1 ครบทุกเซต → ปุ่ม “ท่าถัดไป/จบ” ติดล่างและมองเห็น', pg.locator('.sticky-cta .cta-next').is_visible())
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z1 ไม่มี error ใน console', not errs, errs)
        b.close()
    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

main()
