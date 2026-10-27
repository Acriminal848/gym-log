#!/usr/bin/env python3
"""ทดสอบหน้าแรกใหม่ของ 1.5: การ์ด “วันนี้”, แถบสัปดาห์, ชิปกล้ามเนื้อที่ยังไม่ได้เล่น, แถวแผนกะทัดรัด, แถวสำรอง
รัน: python3 tests/e2e_v15.py http://localhost:8765/gym-log/ (ข้อมูลสมมติ; วันที่คำนวณจากวันนี้ของเครื่อง)"""
import sys
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L

SEED = """async ({offset, id, planId, sets}) => {
  const plans = await GymStorage.getAll('plans'), exs = await GymStorage.getAll('exercises');
  const byId = Object.fromEntries(exs.map(e => [e.id, e]));
  const d = new Date(); d.setDate(d.getDate() + offset); const date = GL.localDateKey(d);
  const pl = plans.find(p => p.id === planId);
  await GymStorage.put('workouts', {id, date, status:'finished', startedAt: date+'T0'+(id.replace(/\D/g,'')%10)+':00:00.000Z', finishedAt: date+'T23:00:00.000Z', planId, planName: pl.name,
    entries: pl.items.map((it, i) => { const ex = byId[it.exerciseId]; return {id: id+'e'+i, plannedExerciseId: ex.id, plannedExerciseName: ex.name, exerciseId: ex.id, exerciseName: ex.name, equipment: ex.equipment, weightMode: ex.weightMode, plannedSets: it.sets, target: null, draft: null, drafts: [],
      sets: Array.from({length: sets}, (_, k) => ({id: id+'s'+i+k, kind:'working', status:'completed', weight: 40+i*5, reps: 10, at: date+'T09:30:00.000Z'}))}; })});
  return date;
}"""

def seed(pg, offset, id, plan, sets=3):
    return pg.evaluate(SEED, {'offset': offset, 'id': id, 'planId': plan, 'sets': sets})

def reload(pg):
    pg.reload(); pg.wait_for_selector('.today-card, .session-bar'); pg.wait_for_timeout(250)

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = new_page(b)
        pg.wait_for_selector('.today-card')
        check('N1 เครื่องใหม่: การ์ดวันนี้เสนอแผนแรกในวงจร (Push)', 'Push' in pg.inner_text('.tc-title'), pg.inner_text('.tc-title'))
        check('N2 แถบสัปดาห์มี 7 วัน จ–อา และเริ่ม 0/3', pg.locator('.wk-day').count() == 7 and pg.inner_text('.wk-count').replace(' ', '').startswith('0/3'), pg.inner_text('.wk-count'))
        check('N3 ทุกวันในแถบมีป้ายอ่านออกเสียง (ไม่ใช้สีอย่างเดียว)', pg.evaluate("() => [...document.querySelectorAll('.wk-day')].every(d => (d.getAttribute('aria-label')||'').length > 6)"))
        check('N4 ยังไม่มีชิป “ยังไม่ได้เล่น” ถ้าสัปดาห์นี้ยังไม่ได้จด', pg.locator('.fresh-card').count() == 0)
        check('N5 หน้าแรกไม่มีรายการแผนยาว — มีแต่ปุ่ม “แผนอื่น” และ “จดอิสระ” (ปุ่มจริง ขอบชัด สูง ≥44px)', pg.locator('.plan-row').count() == 0 and pg.locator('.home-actions .btn').count() == 2 and pg.evaluate("() => [...document.querySelectorAll('.home-actions .btn')].every(b => b.getBoundingClientRect().height >= 44 && getComputedStyle(b).borderTopWidth !== '0px')"))
        pg.click('[data-action=plans-sheet]'); pg.wait_for_selector('.sheet .plan-row')
        check('N5a แผ่น “แผนอื่น” แสดงแผนทั้ง 4 แถวเดียว ไม่มีแถวไอคอน', pg.locator('.sheet .plan-row').count() == 4 and pg.locator('.sheet .plan-row .pc-icons').count() == 0)
        pg.click('.sheet [data-action=close-sheet] >> nth=-1'); pg.wait_for_timeout(150)
        check('N6 ปุ่ม “เริ่ม” สูง ≥48px', pg.evaluate("() => document.querySelector('.today-card .btn.primary').getBoundingClientRect().height") >= 48)
        check('N7 วงจรไม่รวม “วันเสริม” ในจำนวนเป้าสัปดาห์', '/3' in pg.inner_text('.wk-count').replace(' ', ''))
        check('N8 เครื่องใหม่ไม่มีเซสชัน: แถวสำรองไม่เตือน', pg.locator('.backup-row.nudge').count() == 0)
        # จด Push ไว้ 1 ครั้ง (วันนี้หรือวันจันทร์ของสัปดาห์นี้)
        dow = pg.evaluate("() => (new Date().getDay() + 6) % 7")
        seed(pg, -dow, 'wk1', 'ppl-plan-push'); reload(pg)
        check('N9 หลังทำ Push → การ์ดเสนอ Pull ต่อ', 'Pull' in pg.inner_text('.tc-title'), pg.inner_text('.tc-title'))
        check('N10 สัปดาห์นี้ 1/3 และมีวันที่ติ๊ก 1 วัน', pg.inner_text('.wk-count').replace(' ', '').startswith('1/3') and pg.locator('.wk-day.done').count() == 1)
        check('N11 หน้าแรกไม่มีการ์ด “ยังไม่ได้เล่น” แล้ว (ลดข้อความ)', pg.locator('.fresh-card').count() == 0)
        # กดเริ่มจากการ์ด
        pg.click('.today-card .btn.primary'); pg.wait_for_selector('.sets')
        w = [x for x in workouts(pg) if x['status'] == 'active']
        check('N13 กด “เริ่ม” จากการ์ด → เริ่ม session ของแผน Pull ทันที', len(w) == 1 and 'Pull' in w[0]['planName'], [x['planName'] for x in w])
        go_home(pg)
        check('N14 มี session ค้าง → ซ่อนการ์ดวันนี้ แสดงแถบ “เล่นต่อ”', pg.locator('.today-card').count() == 0 and pg.locator('.session-bar').count() == 1)
        # ยกเลิก session ที่ค้างด้วย DB แล้วโหลดใหม่
        pg.evaluate("async () => { for (const w of await GymStorage.getAll('workouts')) if (w.status === 'active') await GymStorage.del('workouts', w.id); }"); reload(pg)
        # จบครบวง: Pull, Legs → กลับ Push
        seed(pg, -dow, 'wk2', 'ppl-plan-pull'); seed(pg, -dow, 'wk3', 'ppl-plan-legs'); reload(pg)
        check('N15 ทำครบ 3 ช่อง → ขึ้น “ครบสัปดาห์นี้” ไม่วนกลับ Push และไม่มีปุ่มเริ่มเด่น', pg.locator('.today-card.done').count() == 1 and 'ครบสัปดาห์นี้' in pg.inner_text('.today-card') and pg.locator('.today-card .btn.primary').count() == 0, pg.inner_text('.today-card'))
        pg.evaluate("async () => { await GymStorage.del('workouts', 'wk3'); }")
        d = seed(pg, 0, 'wk4', 'ppl-plan-push'); reload(pg)
        check('N16 ทำแล้ววันนี้ → การ์ดเปลี่ยนป้าย “จดไปแล้ว” และปุ่มเริ่มไม่เด่น', pg.locator('.today-card.done').count() == 1 and pg.locator('.today-card .btn.primary').count() == 0)
        check('N17 วันนี้ในแถบถูกไฮไลต์และติ๊ก', pg.locator('.wk-day.today.done').count() == 1)
        # วันเสริมไม่ขยับวงจร
        before = pg.inner_text('.tc-title')
        seed(pg, 0, 'wk5', 'ppl-plan-extra'); reload(pg)
        check('N18 ทำ “วันเสริม” ไม่ทำให้แผนถัดไปเปลี่ยน', pg.inner_text('.tc-title') == before, (before, pg.inner_text('.tc-title')))
        # สำรองข้อมูล
        check('N19 มี session แต่ไม่เคยสำรอง → เตือนที่แถวสำรอง', pg.locator('.backup-row.nudge').count() == 1)
        pg.evaluate("async () => { await GymStorage.setSetting('lastBackupAt', new Date().toISOString()); }"); reload(pg)
        check('N20 เพิ่งสำรอง → แถวสำรองหายไปจากหน้าแรกทั้งแถว (ไม่รก)', pg.locator('.backup-row').count() == 0)
        pg.evaluate("async () => { await GymStorage.setSetting('lastBackupAt', new Date(Date.now()-20*86400000).toISOString()); }"); reload(pg)
        check('N21 สำรองเกิน 14 วัน → เตือน', pg.locator('.backup-row.nudge').count() == 1)
        pg.click('.backup-row [data-action=open-backup]'); pg.wait_for_selector('[data-action=export]')
        check('N22 ปุ่ม “สำรอง” พาไปหน้าสำรอง/กู้คืน', True)
        # เลย์เอาต์
        for (w_, h_) in ((375, 667), (430, 932)):
            ctx = b.new_context(viewport={'width': w_, 'height': h_}, locale='th-TH', service_workers='block')
            pg2 = ctx.new_page(); pg2.goto(BASE + 'index.html'); pg2.wait_for_selector('.today-card')
            check('N23 %dx%d หน้าแรกไม่เลื่อนแนวนอน' % (w_, h_), pg2.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth"))
            check('N24 %dx%d ปุ่ม “เริ่ม” เห็นโดยไม่ต้องเลื่อน' % (w_, h_), pg2.evaluate("() => document.querySelector('.today-card .btn.primary').getBoundingClientRect().bottom <= window.innerHeight - 64"))
            ctx.close()
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('N25 ไม่มี error ใน console', not errs, errs)
        b.close()
    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

if __name__ == '__main__':
    main()
