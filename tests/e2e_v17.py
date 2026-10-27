#!/usr/bin/env python3
"""ทดสอบ 1.7: น้ำหนักผสม → ตัดสินจากเซตอ่อนสุด, เตือนเซตหลังตกแรงระหว่างจด, คำแนะนำจากครั้งก่อน, เตือนติดนิ่ง 3 ครั้ง
และตรวจว่าไม่มีการเขียนฟิลด์ใหม่ลงข้อมูล
รัน: python3 tests/e2e_v17.py http://localhost:8765/gym-log/ (ข้อมูลสมมติ)"""
import sys
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L

SEED = """async ({offset, id, planId, sets}) => {
  const plans = await GymStorage.getAll('plans'), exs = await GymStorage.getAll('exercises');
  const byId = Object.fromEntries(exs.map(e => [e.id, e]));
  const d = new Date(); d.setDate(d.getDate() + offset); const date = GL.localDateKey(d);
  const pl = plans.find(p => p.id === planId);
  await GymStorage.put('workouts', {id, date, status:'finished', startedAt: date+'T08:00:00.000Z', finishedAt: date+'T08:50:00.000Z', planId, planName: pl.name,
    entries: pl.items.map((it, i) => { const ex = byId[it.exerciseId]; return {id: id+'e'+i, plannedExerciseId: ex.id, plannedExerciseName: ex.name, exerciseId: ex.id, exerciseName: ex.name, equipment: ex.equipment, weightMode: ex.weightMode, plannedSets: it.sets, target: null, draft: null, drafts: [],
      sets: sets.map((wr, k) => ({id: id+'s'+i+k, kind:'working', status:'completed', weight: wr[0], reps: wr[1], at: date+'T09:30:00.000Z'}))}; })});
}"""

def seed(pg, offset, id, sets, plan='ppl-plan-push'):
    pg.evaluate(SEED, {'offset': offset, 'id': id, 'planId': plan, 'sets': sets})

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = new_page(b)
        # ----- เคสของผู้ใช้: เซตแรกหนัก เซตหลังลดน้ำหนัก
        seed(pg, -7, 'h1', [[70, 8], [55, 8], [55, 7]])
        pg.reload(); pg.wait_for_selector('.today-card, .session-bar')
        start_plan(pg, 'Push')
        pg.wait_for_selector('.target')
        tg = pg.inner_text('.target')
        check('A1 ครั้งก่อนน้ำหนักผสม: เป้า = น้ำหนักต่ำสุด (55 kg) ทุกเซต', '55 kg × 8' in tg and 'ทุกเซต' in tg, tg)
        check('A2 ป้ายเป็น “น้ำหนักเดียวทุกเซต” (ไม่ใช่ “ระมัดระวัง”)', 'น้ำหนักเดียวทุกเซต' in tg and 'ระมัดระวัง' not in tg, tg)
        check('A3 หน้าจดไม่มีกล่องคำแนะนำ (ย้ายไปแผ่น ⓘ) และไม่มีข้อความอธิบายยาว', pg.locator('.target .coach-note').count() == 0 and pg.locator('.hint-row').count() == 0)
        pg.click('.target .tg-info'); pg.wait_for_selector('.sheet')
        sh = pg.inner_text('.sheet')
        check('A4 แผ่น ⓘ: บอกว่าตัดสินจากเซตอ่อนสุด + คำแนะนำจากครั้งก่อน (หยุดก่อนสุดแรง)', 'อ่อนสุด' in sh and 'หยุดเซตแรกก่อนสุดแรง' in sh, sh)
        pg.click('.sheet [data-action=close-sheet] >> nth=-1'); pg.wait_for_timeout(150)
        check('A5 ค่าเสนอในช่องแถวแรก = 55 / 8', pg.input_value('input[data-pending="0"][data-field=weight]') == '55' and pg.input_value('input[data-pending="0"][data-field=reps]') == '8')
        check('A6 ยังไม่เตือนระหว่างจด (ยังไม่มีเซตที่ยืนยัน)', pg.locator('.coach-note.live').count() == 0)
        # ----- เตือนระหว่างจด: เซตแรก 12 reps แล้วเซต 2 ตกเหลือ 7
        fill(pg, 0, 55, 12); confirm(pg)
        check('B1 เซตเดียว ยังไม่เตือน', pg.locator('.coach-note.live').count() == 0)
        fill(pg, 0, 55, 10); confirm(pg)
        check('B2 ตกปกติ (12 → 10) ไม่เตือน', pg.locator('.coach-note.live').count() == 0)
        fill(pg, 0, 55, 6); confirm(pg)
        live = pg.locator('.coach-note.live')
        check('B3 ตกแรง (12 → 6) → เตือนบรรทัดเดียวสั้น ๆ', live.count() == 1 and '12 → 6' in live.inner_text() and '1–2 reps' in live.inner_text() and len(live.inner_text()) < 70, pg.inner_text('#view')[:400])
        check('B4 คำเตือนไม่บล็อกการใช้งาน (ปุ่มจบ/ท่าถัดไปยังอยู่)', pg.locator('.cta-next').count() == 1)
        # แก้เซตที่ตก ให้เป็น 9 → คำเตือนหายไป (คำนวณสดจากข้อมูล)
        pg.click('.st-row.done >> nth=2 >> .st-val >> nth=1'); pg.wait_for_selector('.sheet')
        inp = pg.locator('.sheet input[type=text]').nth(1)
        inp.fill('9'); pg.click('.sheet [data-action=es-save]'); pg.wait_for_timeout(250)
        check('B5 แก้ reps เป็น 9 → คำเตือนหายไป', pg.locator('.coach-note.live').count() == 0)
        # ----- ไม่มีฟิลด์ใหม่ในข้อมูลที่เก็บ
        w = [x for x in workouts(pg) if x['status'] == 'active'][0]
        e0 = w['entries'][0]
        check('C1 เป้าหมายที่เก็บยังมีเฉพาะ weight/reps/reason/kind (ไม่เพิ่มฟิลด์)', sorted(e0['target'].keys()) == ['kind', 'reason', 'reps', 'weight'], list(e0['target'].keys()))
        check('C2 เซตที่เก็บไม่มีฟิลด์ใหม่', all(set(s.keys()) <= {'id', 'kind', 'status', 'weight', 'reps', 'at'} for s in e0['sets']), [list(s.keys()) for s in e0['sets']])
        pg.click('[data-action=manage]'); pg.click('.sheet [data-action=cancel-session]')
        pg.wait_for_timeout(200)
        try:
            pg.click('[data-action=discard-confirm]')
        except Exception:
            pass
        pg.wait_for_timeout(300)
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z1 ไม่มี error ใน console', not errs, errs)
        b.close()

        # ----- ติดนิ่ง 3 ครั้ง (เครื่องใหม่) — คำแนะนำอยู่ที่ประวัติท่า ไม่ใช่กลางการจด
        b = p.chromium.launch(); pg = new_page(b)
        flat = [[60, 9], [60, 8], [60, 8]]
        for k, off in enumerate((-28, -21, -14, -7)):
            seed(pg, off, 's%d' % k, flat)
        pg.reload(); pg.wait_for_selector('.today-card, .session-bar')
        start_plan(pg, 'Push'); pg.wait_for_selector('.target')
        check('D0 กลางการจดไม่มีคำเตือนติดนิ่ง', pg.locator('.coach-note').count() == 0)
        pg.click('.s-head .back'); pg.wait_for_selector('#tabs', state='visible')
        pg.click('#tabs [data-tab=history]'); pg.wait_for_selector('.seg')
        pg.click('[data-action=his-mode][data-mode=exercises]'); pg.click('[data-action=sum-open][data-ex=ppl-incline-chest-press]'); pg.wait_for_selector('.stat-row')
        notes = pg.locator('.coach-note')
        check('D1 ประวัติท่า: ไม่ก้าวหน้า 3 ครั้งติด → ขึ้นคำแนะนำ', notes.count() >= 1 and '3 ครั้งติด' in pg.inner_text('#view') and 'ลดน้ำหนักราว 10%' in pg.inner_text('#view'), pg.inner_text('#view')[:300])
        b.close()
        # ก้าวหน้า 1 ครั้งแล้วไม่ขึ้น
        b = p.chromium.launch(); pg = new_page(b)
        for k, (off, sets_) in enumerate(((-28, flat), (-21, flat), (-14, flat), (-7, [[62.5, 8], [62.5, 8], [62.5, 8]]))):
            seed(pg, off, 't%d' % k, sets_)
        pg.reload(); pg.wait_for_selector('.today-card, .session-bar')
        start_plan(pg, 'Push'); pg.wait_for_selector('.target')
        check('D3 เป้า = เดิม 62.5 kg เพิ่ม reps (กติกาเดิมไม่เปลี่ยน)', '62.5 kg × 9' in pg.inner_text('.target'), pg.inner_text('.target')[:200])
        pg.click('.s-head .back'); pg.wait_for_selector('#tabs', state='visible')
        pg.click('#tabs [data-tab=history]'); pg.wait_for_selector('.seg')
        pg.click('[data-action=his-mode][data-mode=exercises]'); pg.click('[data-action=sum-open][data-ex=ppl-incline-chest-press]'); pg.wait_for_selector('.stat-row')
        check('D2 มีก้าวหน้าล่าสุด (น้ำหนักต่ำสุดขึ้น) → ไม่เตือนติดนิ่ง', '3 ครั้งติด' not in pg.inner_text('#view'))
        # รูปแบบสวย/ไม่ล้น
        check('Y1 ไม่เลื่อนแนวนอนที่ 390px', pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth"))
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z2 ไม่มี error ใน console', not errs, errs)
        b.close()
    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

main()
