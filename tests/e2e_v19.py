#!/usr/bin/env python3
"""ทดสอบ 1.9: ตัวตัดสินความก้าวหน้า (เซตอ่อนสุด + เป้า) · ขั้นน้ำหนักต่อเครื่อง · หมวดกล้ามเนื้อใหญ่-ย่อย · ปุ่มไม่ตกบรรทัด · เสียง timer
รัน: python3 tests/e2e_v19.py http://localhost:8765/gym-log/ (ข้อมูลสมมติ)"""
import sys
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L
exec(open(__file__.replace('e2e_v19.py', 'e2e_v17.py')).read().split("def main")[0].split("import e2e_v14_lib as L")[1])

def hist(pg, mode):
    tab(pg, 'history'); pg.wait_for_selector('.seg')
    pg.click('[data-action=his-mode][data-mode=%s]' % mode); pg.wait_for_timeout(150)

def first_ex(pg):
    return pg.evaluate("GL.state.active.entries[0].exerciseId")

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = new_page(b)
        # ===== ข้อ 1: เคส pec deck ของผู้ใช้ — ครั้งก่อน 12×15, 18×11, 18×8
        seed(pg, -7, 'h1', [[12, 15], [18, 11], [18, 8]])
        pg.reload(); pg.wait_for_selector('.today-card')
        start_plan(pg, 'Push'); pg.wait_for_selector('.target')
        tg = pg.inner_text('.target')
        check('V1 ครั้งก่อน 12/18/18: เป้า = 12 kg ทุกเซต (ไม่ใช่ขึ้นเป็น 17)', '12 kg' in tg and '17' not in tg, tg)
        ex1 = pg.evaluate("GL.state.active.entries[0].exerciseName")
        for _ in range(3):
            fill(pg, 0, 12, 12); confirm(pg)
            pg.evaluate("GL.rest.stop()")
        pg.click('[data-action=manage]'); pg.click('.sheet [data-action=finish]'); pg.wait_for_selector('[data-action=finish-confirm]'); pg.click('[data-action=finish-confirm]')
        pg.wait_for_selector('h1:has-text("จบการฝึกแล้ว")')
        txt = pg.inner_text('#view')
        check('V2 หน้าสรุป: ขึ้น “▲ ก้าวหน้า” + “ตามเป้า ✓” และไม่มี “ต่ำกว่าครั้งก่อน”', '▲ ก้าวหน้า' in txt and 'ตามเป้า' in txt and 'ต่ำกว่า' not in txt and 'น้ำหนักสูงสุดเพิ่ม' not in txt, txt[:500])
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z1 ไม่มี error ใน console (ข้อ 1)', not errs, errs)
        pg.close()

        # ===== ข้อ 2: ขั้นน้ำหนักต่อเครื่อง
        pg = new_page(b)
        seed(pg, -7, 'h1', [[12, 15], [18, 11], [18, 8]])
        pg.reload(); pg.wait_for_selector('.today-card')
        start_plan(pg, 'Push'); pg.wait_for_selector('.target')
        exid = pg.evaluate("GL.state.active.entries[0].exerciseId")
        step0 = pg.evaluate("(id) => GL.exById(id).step", exid)
        lab = pg.inner_text('.adj-c.edit')
        check('S1 ปุ่มปรับน้ำหนักเป็นกลุ่ม “− [ขั้น] +” และแสดงขั้นจริงของท่า', lab.replace(' ', '').lower() == (str(step0).rstrip('0').rstrip('.') + 'kg') and pg.locator('.adj-grp').count() == 2, (lab, step0))
        check('S2 ไม่มีข้อเสนอขั้นก่อนจดเซต', pg.locator('.step-offer').count() == 0)
        fill(pg, 0, 18, 10); confirm(pg); pg.evaluate("GL.rest.stop()"); pg.wait_for_timeout(200)
        check('S3 จด 18 หลังเคยจด 12 → แถบเสนอ “ขั้น 6 kg” (ไม่ลงตัวกับ 5)', pg.locator('.step-offer').count() == 1 and '6 kg' in pg.inner_text('.step-offer'), pg.inner_text('#view')[-300:])
        check('S4 แถบเสนอ: ปุ่มใช้/ปิด สูง ≥44px', pg.evaluate("() => [...document.querySelectorAll('.step-offer button')].every(b => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().width >= 44)"))
        top0 = pg.evaluate("() => document.querySelector('.sets').getBoundingClientRect().top")
        pg.click('[data-action=step-offer-yes]'); pg.wait_for_timeout(250)
        check('S5 กด “ใช้ขั้นนี้” → ท่าเก็บ step = 6 ในฐานข้อมูล และปุ่มแสดง 6 kg', next(e for e in db(pg, 'exercises') if e['id'] == exid)['step'] == 6 and '6 kg' in pg.inner_text('.adj-c.edit') and pg.locator('.step-offer').count() == 0)
        pg.fill('input[data-pending="0"][data-field=weight]', '18'); pg.click('.adj-grp:first-child .adj-b >> nth=1')
        check('S6 ปุ่ม + ของน้ำหนักเพิ่มตามขั้นใหม่ (18 → 24)', pg.input_value('input[data-pending="0"][data-field=weight]') == '24')
        pg.click('.adj-c.edit'); pg.wait_for_selector('#step-in')
        sh = pg.inner_text('.sheet')
        check('S7 แผ่นแก้ขั้น: ปุ่มลัด 1.25/2.5/5/10 + ช่องพิมพ์เอง + ตัวอย่างขั้นถัดไป', all(x in sh for x in ['1.25', '2.5', '5', '10', 'หรือพิมพ์เอง', 'ตัวอย่าง']), sh)
        check('S8 แผ่นแก้ขั้นไม่ล้นจอ (สูง < 70% ของจอ) และปุ่มลัดอยู่แถวเดียว', pg.evaluate("() => { const s = document.querySelector('.sheet').getBoundingClientRect(); const cs = [...document.querySelectorAll('.step-chips .chip')].map(c => c.getBoundingClientRect().top); return s.height < innerHeight * 0.7 && Math.max(...cs) - Math.min(...cs) < 4; }"))
        pg.fill('#step-in', '1.5'); pg.wait_for_timeout(100)
        check('S9 พิมพ์ขั้นเอง → ตัวอย่างอัปเดตสด', '19.5' in pg.inner_text('#step-prev'), pg.inner_text('#step-prev'))
        pg.click('[data-action=step-save]'); pg.wait_for_timeout(250)
        check('S10 บันทึกขั้นที่พิมพ์ (1.5) → ปุ่มแสดง 1.5 kg', next(e for e in db(pg, 'exercises') if e['id'] == exid)['step'] == 1.5 and '1.5 kg' in pg.inner_text('.adj-c.edit'))
        pg.click('.adj-c.edit'); pg.wait_for_selector('#step-in'); pg.click('[data-action=step-set][data-v="2.5"]'); pg.wait_for_timeout(250)
        check('S11 ปุ่มลัด 2.5 → ตั้งทันทีและปิดแผ่น (แตะครั้งเดียว)', next(e for e in db(pg, 'exercises') if e['id'] == exid)['step'] == 2.5 and pg.locator('.sheet').count() == 0)
        # ปฏิเสธข้อเสนอ → ไม่ถามซ้ำ
        fill(pg, 0, 18, 10); confirm(pg); pg.evaluate("GL.rest.stop()"); pg.wait_for_timeout(200)
        check('S12 ขั้น 2.5 ลงตัวกับ 12→18? (6 ไม่ใช่พหุคูณ) → เสนอ 6 อีกครั้งได้', pg.locator('.step-offer').count() == 1)
        pg.click('[data-action=step-offer-no]'); pg.wait_for_timeout(250)
        sd = {r['key']: r['value'] for r in db(pg, 'settings')}.get('stepDismissed')
        check('S13 กดปิด → จำว่าไม่ถามท่านี้อีก (เก็บใน settings.stepDismissed)', sd == [exid], sd)
        fill(pg, 0, 24, 8); confirm(pg); pg.evaluate("GL.rest.stop()"); pg.wait_for_timeout(200)
        check('S14 หลังปฏิเสธ จดเซตต่อไปแล้วไม่ถามซ้ำ', pg.locator('.step-offer').count() == 0)
        exp = pg.evaluate("GymStorage.exportAll('x')")
        check('S15 ไฟล์สำรองมี stepDismissed และ validate ผ่าน', exp['data']['settings'].get('stepDismissed') == [exid] and pg.evaluate("(j) => GymStorage.validateBackup(j).ok", exp))
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z2 ไม่มี error ใน console (ข้อ 2)', not errs, errs)

        # ===== ข้อ 4: หมวดกล้ามเนื้อใหญ่-ย่อย
        pg.close(); pg = new_page(b)
        seed(pg, 0, 'm1', [[40, 10], [40, 10], [40, 10]])
        pg.reload(); pg.wait_for_selector('.today-card, .session-bar')
        tab(pg, 'exercises'); pg.wait_for_selector('#ex-q')
        chips = pg.evaluate("() => [...document.querySelectorAll('[data-action=ex-muscle]')].map(c => c.dataset.v).filter(Boolean)")
        check('M1 ตัวกรองหมวดในแท็บ “ท่า” เป็นหมวดใหญ่ (ไม่มีไหล่ข้าง/ต้นขาหน้า ปนเป็นหมวดเอง)', 'ไหล่' in chips and 'ขา' in chips and 'ไหล่ข้าง' not in chips and 'ต้นขาหน้า' not in chips, chips)
        pg.click('[data-action=ex-muscle][data-v=ขา]'); pg.wait_for_timeout(120)
        lt = pg.inner_text('#ex-list')
        check('M2 กรอง “ขา” เจอทุกส่วน (Leg Press, Leg Curl, Hip Thrust, Calf อยู่หมวดน่องแยก)', all(n in lt for n in ('Leg Press', 'Leg Curl', 'Hip Thrust')) and 'Calf Raise' not in lt, lt[:200])
        pg.click('[data-action=ex-muscle][data-v=""]'); pg.fill('#ex-q', 'อก'); pg.wait_for_timeout(120)
        check('M3 ค้นหา “อก” เจอท่าอกทั้งหมด (Incline/Flat/Pec Deck/Cable Fly)', all(n in pg.inner_text('#ex-list') for n in ('Incline Chest Press', 'Flat Chest Press', 'Pec Deck', 'Cable Fly')))
        pg.fill('#ex-q', '')
        pg.click('[data-action=ex-new]'); pg.wait_for_selector('#ef-name')
        check('M4 ฟอร์มท่าใหม่: หมวดใหญ่แถวเดียวกลุ่มเดียว ยังไม่มีส่วนย่อยจนกว่าเลือกหมวด', pg.locator('[data-action=muscle-pick]').count() == 9 and pg.locator('[data-action=muscle-sub]').count() == 0)
        pg.fill('#ef-name', 'Hip Abduction (Machine)'); pg.click('[data-action=muscle-pick][data-v=ขา]')
        subs = pg.evaluate("() => [...document.querySelectorAll('[data-action=muscle-sub]')].map(c => c.textContent.trim())")
        check('M5 เลือก “ขา” → โผล่ส่วนย่อย (ไม่ระบุ/ต้นขาหน้า/ต้นขาหลัง/ก้น/ด้านใน/ด้านนอก)', subs == ['ไม่ระบุ', 'ต้นขาหน้า', 'ต้นขาหลัง', 'ก้น', 'ต้นขาด้านใน', 'ต้นขาด้านนอก'], subs)
        pg.click('[data-action=muscle-sub][data-v=ต้นขาด้านนอก]'); pg.click('[data-action=ex-equip][data-i="0"]'); pg.click('[data-action=ex-save]'); pg.wait_for_timeout(300)
        ne = [e for e in db(pg, 'exercises') if e['name'] == 'Hip Abduction (Machine)']
        check('M6 บันทึกท่า: muscle = ส่วนย่อยที่เลือก และยังอยู่ในหมวดใหญ่ “ขา” ในรายการ', len(ne) == 1 and ne[0]['muscle'] == 'ต้นขาด้านนอก')
        pg.click('[data-action=ex-muscle][data-v=ขา]'); pg.wait_for_timeout(120)
        check('M7 ท่าใหม่โผล่ในตัวกรอง “ขา”', 'Hip Abduction' in pg.inner_text('#ex-list'))
        pg.click('[data-action=ex-muscle][data-v=""]')
        # ประเภทเดิมไม่ถูกแก้
        pecs = next(e for e in db(pg, 'exercises') if e['id'] == 'ppl-pec-deck')
        check('M8 ข้อมูลท่าเดิมไม่ถูกแก้ (Pec Deck ยังเป็น muscle = อก ในฐานข้อมูล)', pecs['muscle'] == 'อก')
        hist(pg, 'overview')
        ov = pg.inner_text('.ov-card')
        check('M9 ภาพรวมรายสัปดาห์: หมวดใหญ่ “อก” แยกส่วนย่อย อกบน/อกกลาง และบอกว่า “อกล่าง ยังไม่ได้เล่น”', all(n in ov for n in ('อกบน', 'อกกลาง', 'อกล่าง')) and pg.locator('.mb-subs li.none', has_text='อกล่าง').count() == 1 and 'ยังไม่ได้เล่น' in pg.inner_text('.mb-subs li.none'), ov[:400])
        check('M10 ส่วนย่อยแต่ละแถวมีตัวเลข/ข้อความสถานะ (ไม่ใช้สีหรือความยาวแท่งอย่างเดียว)', pg.evaluate("() => [...document.querySelectorAll('.mb-subs li')].every(li => /เซต|ยังไม่ได้เล่น/.test(li.textContent))"))
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z3 ไม่มี error ใน console (ข้อ 4)', not errs, errs)
        b.close()
    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

if __name__ == '__main__':
    main()
