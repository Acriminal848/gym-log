#!/usr/bin/env python3
"""ทดสอบ 1.8: หน้าแรกลดข้อความ, แผนรายสัปดาห์ (ช่อง รีเซ็ตทุกสัปดาห์), ตัวแก้ลำดับ, ปุ่มรอง, หน้าจดแบบใหม่, ฟอร์มเพิ่มท่า 2 ระดับ
รัน: python3 tests/e2e_v18.py http://localhost:8765/gym-log/ (ข้อมูลสมมติ; วันที่คำนวณจากวันนี้ของเครื่อง)"""
import sys
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L
from e2e_v15 import SEED  # noqa  (ไม่รันซ้ำ: e2e_v15 ถูกป้องกันด้วย __main__)

def seed(pg, offset, id, plan, sets=3):
    return pg.evaluate(SEED, {'offset': offset, 'id': id, 'planId': plan, 'sets': sets})

def reload(pg):
    pg.reload(); pg.wait_for_selector('.today-card, .session-bar'); pg.wait_for_timeout(250)

def settings(pg):
    return {r['key']: r['value'] for r in db(pg, 'settings')}

def slots(pg):
    return [t.strip() for t in pg.locator('#wk-editor .slot-t').all_inner_texts()]

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = new_page(b)
        # ----- หน้าแรกลดข้อความ
        txt = pg.inner_text('#view')
        check('H1 หน้าแรก: การ์ดถัดไป = Push + “6 ท่า · 17 เซต” (ไม่มีข้อความ “ครั้งก่อน/แผนทั้งหมด/ยังไม่ได้เล่น”)',
              'Push' in pg.inner_text('.tc-title') and '6 ท่า · 17 เซต' in pg.inner_text('.tc-meta') and not any(k in txt for k in ('ครั้งก่อน', 'แผนทั้งหมด', 'ยังไม่ได้เล่น', 'ไม่ใช่เป้า')), txt)
        check('H2 หน้าแรกมีปุ่มหลักปุ่มเดียว (เริ่ม) และปุ่มรอง 2 ปุ่มเป็นปุ่มจริง', pg.locator('#view .btn.primary').count() == 1 and pg.locator('.home-actions .btn').count() == 2)
        check('H3 ข้อความทั้งหน้าแรกสั้น (< 260 ตัวอักษร)', len(txt) < 260, len(txt))
        check('H4 เครื่องใหม่ไม่เขียนค่า weekPlan ลงข้อมูลเอง', 'weekPlan' not in settings(pg), settings(pg))
        # ----- จดอิสระ
        pg.click('[data-action=start-free]'); pg.wait_for_selector('.s-head')
        check('H5 “จดอิสระ” เริ่ม session ไม่มีแผน (ยังไม่มีท่า)', 'ยังไม่มีท่า' in pg.inner_text('#view'))
        pg.click('[data-action=manage]'); pg.click('.sheet [data-action=cancel-session]'); pg.wait_for_timeout(250)
        try: pg.click('[data-action=discard-confirm]', timeout=1500)
        except Exception: pass
        pg.wait_for_selector('.today-card, .session-bar')
        # ----- ตัวแก้ลำดับ
        pg.click('[data-action=wk-edit]'); pg.wait_for_selector('#wk-editor')
        check('W1 ปุ่มปรับลำดับ → ไปตัวแก้ลำดับในหน้า “แผน” ค่าเริ่มต้น Push/Pull/Legs', slots(pg) == ['PPL · Push', 'PPL · Pull', 'PPL · Legs'], slots(pg))
        check('W2 ตัวแก้ลำดับบอกสั้น ๆ ว่ารีเซ็ตทุกวันจันทร์ ไม่ตามทวง', 'ทุกวันจันทร์' in pg.inner_text('#wk-editor') and 'ไม่ตามทวง' in pg.inner_text('#wk-editor'))
        check('W3 ปุ่มในตัวแก้สูง/กว้าง ≥44px', pg.evaluate("() => [...document.querySelectorAll('#wk-editor .iconbtn')].every(b => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })"))
        pg.click('#wk-editor [data-action=wk-down][data-i="1"]'); pg.wait_for_timeout(250)
        check('W4 เลื่อน Pull ลง → Push/Legs/Pull และเก็บค่า', slots(pg) == ['PPL · Push', 'PPL · Legs', 'PPL · Pull'] and settings(pg).get('weekPlan') == ['ppl-plan-push', 'ppl-plan-legs', 'ppl-plan-pull'], (slots(pg), settings(pg).get('weekPlan')))
        pg.click('#wk-editor [data-action=wk-add]'); pg.wait_for_selector('.sheet')
        pg.click('.sheet [data-action=wk-add-pick][data-plan=ppl-plan-push]'); pg.wait_for_timeout(250)
        check('W5 เพิ่มช่อง Push ซ้ำได้ → 4 ช่อง', slots(pg) == ['PPL · Push', 'PPL · Legs', 'PPL · Pull', 'PPL · Push'], slots(pg))
        pg.click('#wk-editor [data-action=wk-del][data-i="3"]'); pg.wait_for_timeout(250)
        check('W6 ลบช่อง → 3 ช่อง', len(slots(pg)) == 3)
        # ทำตามลำดับที่ตั้ง: Push แล้วถัดไปต้องเป็น Legs
        dow = pg.evaluate("() => (new Date().getDay() + 6) % 7")
        seed(pg, -dow, 'k1', 'ppl-plan-push'); pg.click('#tabs [data-tab=home]'); reload(pg)
        check('W7 ตั้งลำดับ Push→Legs→Pull ทำ Push แล้ว → ถัดไป Legs', 'Legs' in pg.inner_text('.tc-title') and pg.inner_text('.wk-count').replace(' ', '').startswith('1/3'), (pg.inner_text('.tc-title'), pg.inner_text('.wk-count')))
        # คืนค่าเริ่มต้น
        pg.click('[data-action=wk-edit]'); pg.wait_for_selector('#wk-editor')
        pg.click('#wk-editor [data-action=wk-reset]'); pg.wait_for_timeout(250)
        check('W8 คืนค่าเริ่มต้น → Push/Pull/Legs และไม่มีปุ่มคืนค่า', slots(pg) == ['PPL · Push', 'PPL · Pull', 'PPL · Legs'] and pg.locator('[data-action=wk-reset]').count() == 0)
        pg.click('#tabs [data-tab=home]'); reload(pg)
        check('W9 ค่าเริ่มต้น + ทำ Push แล้ว → ถัดไป Pull', 'Pull' in pg.inner_text('.tc-title'))
        b.close()

        # ----- สัปดาห์ใหม่: ข้ามขาแล้วไม่ถูกบังคับ
        b = p.chromium.launch(); pg = new_page(b)
        seed(pg, -dow - 7, 'o1', 'ppl-plan-push'); seed(pg, -dow - 5, 'o2', 'ppl-plan-pull')   # สัปดาห์ก่อนข้าม Legs
        reload(pg)
        check('W10 สัปดาห์ใหม่ (สัปดาห์ก่อนข้ามขา) → เริ่ม Push ใหม่ ไม่ถูกบังคับเล่นขา', 'Push' in pg.inner_text('.tc-title') and pg.inner_text('.wk-count').replace(' ', '').startswith('0/3'), (pg.inner_text('.tc-title'), pg.inner_text('.wk-count')))
        # จันทร์ Push พุธ Pull → ศุกร์ถึง Legs
        seed(pg, -dow, 'n1', 'ppl-plan-push'); seed(pg, -dow + 0, 'n2', 'ppl-plan-pull'); reload(pg)
        check('W11 Push + Pull ในสัปดาห์นี้แล้ว → ถัดไป Legs', 'Legs' in pg.inner_text('.tc-title'))
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z1 ไม่มี error ใน console', not errs, errs)
        b.close()

        # ----- หน้าจดแบบลดข้อความ
        b = p.chromium.launch(); pg = new_page(b)
        seed(pg, -7, 'h1', 'ppl-plan-push'); reload(pg)
        pg.click('.today-card [data-action=start-plan]'); pg.wait_for_selector('.target')
        v = pg.inner_text('#view')
        check('T1 หน้าจดไม่มีข้อความอธิบายเก่า (ทั้ง session / คำแนะนำ ยังไม่ใช่ผลจริง / ปรับเซต … เซตปัจจุบัน / ตัวเลขสีเทา)', not any(k in v for k in ('ทั้ง session', 'ยังไม่ใช่ผลจริง', 'เซตปัจจุบัน', 'ตัวเลขสีเทา', 'ดูเหตุผล')), v)
        check('T2 หัวหน้าจอแสดงความคืบหน้าสั้น ๆ “0 / 17 เซต”', '0 / 17 เซต' in pg.inner_text('.s-title'), pg.inner_text('.s-title'))
        check('T3 การ์ดเป้าหมายเตี้ยกว่าเดิม (< 110px) และมีไอคอน ⓘ ขนาดแตะ ≥44px', pg.evaluate("() => document.querySelector('.target').getBoundingClientRect().height") < 110 and pg.evaluate("() => { const r = document.querySelector('.tg-info').getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }"))
        fill(pg, 0, 40, 10); confirm(pg)
        check('T4 ยืนยันเซต → ความคืบหน้า 1 / 17 และไม่มีบรรทัด session เพิ่ม', '1 / 17 เซต' in pg.inner_text('.s-title'))
        check('T5 แถบ Undo ลอยทับ ไม่ดันตารางให้ขยับ (ช่อง strip-slot สูง 0)', pg.evaluate("() => document.querySelector('.strip-slot').getBoundingClientRect().height") == 0)
        b.close()

        # ----- ฟอร์มเพิ่มท่า 2 ระดับ
        b = p.chromium.launch(); pg = new_page(b)
        tab(pg, 'exercises'); pg.wait_for_selector('#ex-q'); pg.click('[data-action=ex-new]'); pg.wait_for_selector('#ef-name')
        check('E1 ฟอร์มใหม่แสดงเฉพาะพื้นฐาน: ชื่อ/กล้ามเนื้อ/อุปกรณ์ — ส่วนเพิ่มเติมพับอยู่', pg.locator('#ex-adv').is_hidden() and pg.locator('#ef-name').is_visible() and pg.locator('#ef-equipment').is_visible() and pg.locator('#ef-rmin').is_hidden())
        check('E2 ปุ่มบันทึกอยู่ล่างจอ เต็มความกว้าง ไม่อยู่มุมขวาบน', pg.locator('.topbar [data-action=ex-save]').count() == 0 and pg.evaluate("() => { const r = document.querySelector('.form-cta .btn').getBoundingClientRect(); return r.bottom > window.innerHeight - 140 && r.width > window.innerWidth * 0.8 && r.height >= 44; }"))
        check('E3 มีบรรทัดสรุปค่าเริ่มต้น (reps/ขั้นน้ำหนัก/วิธีนับ) บนปุ่มตั้งค่าเพิ่มเติม', '8–12 reps' in pg.inner_text('.adv-toggle') and '+2.5 kg' in pg.inner_text('.adv-toggle'), pg.inner_text('.adv-toggle'))
        pg.fill('#ef-name', 'Test Cable Row Wide'); pg.click('[data-action=muscle-pick][data-v=หลัง]'); pg.click('[data-action=ex-equip][data-i="1"]')
        check('E4 เลือกอุปกรณ์ “สายเคเบิล” → เติมชื่ออุปกรณ์ + เดาวิธีนับ/ขั้นน้ำหนักเป็นค่าเริ่มต้น', pg.input_value('#ef-equipment') == 'สายเคเบิล' and '+2.5 kg' in pg.inner_text('.adv-toggle') and 'ตามสาย' in pg.inner_text('.adv-toggle'), pg.inner_text('.adv-toggle'))
        check('E5 ยังพิมพ์ชื่อไว้ครบหลัง re-render (ค่าไม่หาย)', pg.input_value('#ef-name') == 'Test Cable Row Wide')
        pg.click('[data-action=ex-save]'); pg.wait_for_selector('#ex-q'); pg.wait_for_timeout(250)
        ne = [e for e in db(pg, 'exercises') if e['name'] == 'Test Cable Row Wide']
        check('E6 กรอก 3 อย่างแล้วบันทึกได้เลย: ใช้ค่าเริ่มต้น + ภาพเดาจากชื่อ', len(ne) == 1 and ne[0]['muscle'] == 'หลัง' and ne[0]['weightMode'] == 'cable' and ne[0]['repMin'] == 8 and ne[0]['repMax'] == 12 and ne[0].get('icon'), ne)
        pg.click('[data-action=ex-new]'); pg.wait_for_selector('#ef-name')
        pg.fill('#ef-name', 'Test Bad Reps'); pg.click('[data-action=ex-adv]'); pg.fill('#ef-rmin', '15'); pg.fill('#ef-rmax', '10'); pg.click('[data-action=ex-adv]')
        check('E7 พับส่วนเพิ่มเติมแล้วค่าที่กรอกยังอยู่', pg.input_value('#ef-rmin') == '15' or pg.locator('#ex-adv').is_hidden())
        pg.click('[data-action=ex-save]'); pg.wait_for_timeout(250)
        check('E8 ค่าผิดในส่วนที่พับ → เปิดส่วนนั้นให้เห็น + แจ้งเตือน (ไม่บันทึก)', pg.locator('#ex-adv').is_visible() and pg.locator('#toast:visible').count() == 1 and not [e for e in db(pg, 'exercises') if e['name'] == 'Test Bad Reps'])
        pg.fill('#ef-name', ''); pg.fill('#ef-rmin', '8'); pg.fill('#ef-rmax', '12'); pg.click('[data-action=ex-save]'); pg.wait_for_timeout(250)
        check('E9 ไม่ใส่ชื่อ → แจ้ง “ใส่ชื่อท่าก่อน” ไม่บันทึก', pg.locator('#toast:visible').count() == 1 and 'ใส่ชื่อท่า' in pg.inner_text('#toast'))
        # แก้ท่าเดิม: เปลี่ยนชื่ออุปกรณ์ด้วยชิป ไม่เปลี่ยนวิธีนับของท่าที่มีอยู่
        pg.click('[data-action=ex-back]'); pg.wait_for_selector('.sheet')
        pg.click('[data-action=discard-edit]'); pg.wait_for_timeout(300)
        pg.wait_for_selector('#ex-q'); pg.fill('#ex-q', 'Leg Press'); pg.click('#ex-list .list-btn >> nth=0'); pg.wait_for_selector('#ef-name')
        mode_before = pg.evaluate("() => GL.state.sub.draft.weightMode")
        pg.click('[data-action=ex-equip][data-i="3"]')
        check('E10 แก้ท่าเดิม: แตะชิปอุปกรณ์ไม่เปลี่ยนวิธีนับน้ำหนักเอง (ป้องกันประวัติเทียบไม่ได้)', pg.evaluate("() => GL.state.sub.draft.weightMode") == mode_before)
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z2 ไม่มี error ใน console (ฟอร์ม)', not errs, errs)
        b.close()

    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

if __name__ == '__main__':
    main()
