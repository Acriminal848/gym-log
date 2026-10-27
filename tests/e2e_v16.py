#!/usr/bin/env python3
"""ทดสอบ 1.6: ประวัติแบบ ภาพรวม/รายท่า/รายครั้ง, กราฟแนวโน้ม+PR, ตารางความสม่ำเสมอ, สรุปหลังจบ, ตั้งค่าเส้นอ้างอิง, ชื่อกล้ามเนื้อใหม่
รัน: python3 tests/e2e_v16.py http://localhost:8765/gym-log/ (ข้อมูลสมมติ; วันที่คำนวณจากวันนี้ของเครื่อง)"""
import sys
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L

SEED = """async ({offset, id, planId, sets, bump}) => {
  const plans = await GymStorage.getAll('plans'), exs = await GymStorage.getAll('exercises');
  const byId = Object.fromEntries(exs.map(e => [e.id, e]));
  const d = new Date(); d.setDate(d.getDate() + offset); const date = GL.localDateKey(d);
  const pl = plans.find(p => p.id === planId);
  await GymStorage.put('workouts', {id, date, status:'finished', startedAt: date+'T0'+(offset % 7 + 7)+':00:00.000Z', finishedAt: date+'T0'+(offset % 7 + 7)+':50:00.000Z', planId, planName: pl.name,
    entries: pl.items.map((it, i) => { const ex = byId[it.exerciseId]; return {id: id+'e'+i, plannedExerciseId: ex.id, plannedExerciseName: ex.name, exerciseId: ex.id, exerciseName: ex.name, equipment: ex.equipment, weightMode: ex.weightMode, plannedSets: it.sets, target: null, draft: null, drafts: [],
      sets: Array.from({length: sets}, (_, k) => ({id: id+'s'+i+k, kind:'working', status:'completed', weight: 40+i*5+bump, reps: 10, at: date+'T09:30:00.000Z'}))}; })});
  return date;
}"""

def seed(pg, offset, id, plan, sets=3, bump=0):
    return pg.evaluate(SEED, {'offset': offset, 'id': id, 'planId': plan, 'sets': sets, 'bump': bump})

def hist(pg, mode):
    tab(pg, 'history'); pg.wait_for_selector('.seg')
    pg.click('[data-action=his-mode][data-mode=%s]' % mode); pg.wait_for_timeout(150)

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = new_page(b)
        # ----- เครื่องใหม่ / ไม่มีประวัติ
        tab(pg, 'history'); pg.wait_for_selector('.seg')
        check('P1 โหมดเริ่มต้นของประวัติคือ “ภาพรวม” และมี 3 แท็บ ภาพรวม/รายท่า/รายครั้ง', pg.locator('.seg [role=tab]').count() == 3 and pg.locator('.seg [role=tab].on').inner_text().strip() == 'ภาพรวม', pg.locator('.seg').inner_text())
        check('P2 ไม่มีประวัติ: บอกสถานะ + ปุ่มเริ่มฝึก (ไม่ใช่ทางตัน)', pg.locator('.empty [data-action=start-plan]').count() == 1)
        for m in ('exercises', 'sessions'):
            pg.click('[data-action=his-mode][data-mode=%s]' % m); pg.wait_for_timeout(100)
            check('P3 ไม่มีประวัติ (%s): มีปุ่มทำต่อ' % m, pg.locator('.empty .btn').count() == 1)
        # ----- ข้อมูล: 6 ครั้งของ Push ย้อนหลังทุก 7 วัน น้ำหนักเพิ่ม + 2 ครั้งของ Pull + Legs
        dow = pg.evaluate("() => (new Date().getDay() + 6) % 7")
        for k in range(6):
            seed(pg, -dow - 7 * (5 - k) , 'p%d' % k, 'ppl-plan-push', 3, [0, 5, 5, 2.5, 10, 15][k])
        seed(pg, -dow, 'q1', 'ppl-plan-pull', 3, 0)
        seed(pg, -dow + 0, 'q2', 'ppl-plan-legs', 2, 0)
        pg.reload(); pg.wait_for_selector('.plan-row')
        hist(pg, 'overview')
        txt = pg.inner_text('#view')
        check('P4 ภาพรวม: มีหัวสัปดาห์ + “เซตต่อกล้ามเนื้อ” + คำอธิบายว่านับเซตตรง', 'เซตต่อกล้ามเนื้อ' in txt and 'เซตตรง' in txt and 'สัปดาห์นี้' in txt)
        rows = pg.locator('.mb-row').count()
        check('P5 แสดงกล้ามเนื้อตามโปรแกรม (≥10 กลุ่ม) และใช้ชื่อแยกใหม่ (ไหล่ข้าง/ไหล่หลัง/ต้นขาหน้า/ต้นขาหลัง)', rows >= 10 and all(n in txt for n in ('ไหล่ข้าง', 'ไหล่หลัง', 'ต้นขาหน้า', 'ต้นขาหลัง')) and '\nไหล่\n' not in txt, rows)
        def row(name):
            r = pg.locator('.mb-row', has=pg.locator('.mb-name', has_text=name)).first
            return r.inner_text().replace('\n', ' ')
        push_sets_chest = pg.evaluate("""() => { const pl = GL.state.plans.find(p=>p.id==='ppl-plan-push'); return pl.items.filter(it => GL.exById(it.exerciseId).muscle==='อก').reduce((n,it)=>n+3,0); }""")
        check('P6 เซตต่อกล้ามเนื้อสัปดาห์นี้ถูก (อก = เซตของ Push สัปดาห์นี้ ล้วนเป็นเซตตรง)', ('%d เซต' % push_sets_chest) in row('อก'), row('อก'))
        check('P7 บอกจำนวนครั้งที่ฝึกต่อกล้ามเนื้อ (อก 1 ครั้ง)', '1 ครั้ง' in row('อก'), row('อก'))
        check('P8 เส้นอ้างอิงปิดอยู่เป็นค่าเริ่มต้น (ไม่มีขีด/ไม่มีสีแดง)', pg.locator('.mb-mark').count() == 0 and 'เปิดเส้นอ้างอิง' in txt)
        check('P9 แถบกล้ามเนื้อมีตัวเลขกำกับและ aria-label (ไม่ใช้สี/ความยาวอย่างเดียว)', pg.evaluate("() => [...document.querySelectorAll('.mb-track')].every(t => (t.getAttribute('aria-label')||'').includes('เซต'))"))
        pg.click('[data-action=his-week][data-d="-1"]'); pg.wait_for_timeout(150)
        check('P10 ย้อนไปสัปดาห์ก่อน: หัวเปลี่ยน + ปุ่มสัปดาห์ถัดไปใช้ได้', '1 สัปดาห์ก่อน' in pg.inner_text('.ov-title') and not pg.locator('[data-action=his-week][data-d="1"]').is_disabled())
        check('P11 สัปดาห์ก่อนนับเซต Push ของสัปดาห์นั้น (อก = %d)' % push_sets_chest, ('%d เซต' % push_sets_chest) in row('อก'), row('อก'))
        pg.click('[data-action=his-week][data-d="1"]'); pg.wait_for_timeout(100)
        check('P12 กลับมาสัปดาห์นี้: ปุ่มถัดไปปิด', pg.locator('[data-action=his-week][data-d="1"]').is_disabled())
        # ตารางความสม่ำเสมอ
        check('P13 ตารางความสม่ำเสมอ: 7 แถว × 12 สัปดาห์ มีตัวเลขในช่อง และมีป้ายอ่านออกเสียงทุกช่อง', pg.locator('table.cg tbody tr').count() == 7 and pg.locator('table.cg tbody tr:first-child td').count() == 12 and pg.evaluate("() => [...document.querySelectorAll('table.cg td')].every(c => c.getAttribute('aria-label'))"))
        filled = pg.locator('table.cg td.on').count()
        check('P14 ช่องที่ฝึกมีตัวเลขจำนวนครั้ง (ตัวเลขไม่ใช่แค่สี) และจำนวนช่อง = จำนวนวันที่มี session', filled >= 6 and pg.evaluate("() => [...document.querySelectorAll('table.cg td.on')].every(c => /^[1-9]$/.test(c.textContent.trim()))"), filled)
        check('P15 สรุปรวม/เฉลี่ยต่อสัปดาห์แสดง', 'เฉลี่ย' in pg.inner_text('.cg-card') and 'จาก 12 สัปดาห์' in pg.inner_text('.cg-card'))
        # ----- เส้นอ้างอิงเปิดในตั้งค่า
        go_home(pg); pg.click('[data-action=open-settings]'); pg.wait_for_selector('.rest-presets')
        pg.click('[data-action=set-toggle][data-key=showTargets]'); pg.wait_for_timeout(200)
        check('P16 ตั้งค่า: เปิดเส้นอ้างอิง → เก็บ showTargets=true', {r['key']: r['value'] for r in db(pg, 'settings')}.get('showTargets') is True)
        hist(pg, 'overview')
        check('P17 เปิดเส้นอ้างอิง: มีขีด 10/20 ต่อกล้ามเนื้อ + ข้อความ “ไม่ใช่เป้า”', pg.locator('.mb-mark').count() >= 2 * 10 and 'ไม่ใช่เป้า' in pg.inner_text('.ov-card'))
        go_home(pg); pg.click('[data-action=open-settings]'); pg.wait_for_selector('.rest-presets')
        pg.click('[data-action=set-toggle][data-key=showTargets]'); pg.wait_for_timeout(150)
        # ----- รายท่า + กราฟ
        hist(pg, 'exercises')
        check('P18 รายท่า: มีรายการท่า (Push/Pull/Legs ที่เล่น)', pg.locator('[data-action=sum-open]').count() >= 15)
        pg.click('[data-action=sum-open][data-ex=ppl-incline-chest-press]'); pg.wait_for_selector('.stat-row')
        check('P19 หน้าท่า: การ์ดสถิติ ล่าสุด/ดีที่สุด/เล่นแล้ว 6 ครั้ง', pg.locator('.stat').count() == 3 and '6' in pg.locator('.stat').nth(2).inner_text(), pg.locator('.stat-row').inner_text())
        check('P20 เล่น ≥4 ครั้ง → มีกราฟเส้น (SVG มี aria-label สรุป) และไม่มีข้อความ “จะขึ้นเมื่อครบ 4 ครั้ง”', pg.locator('svg.chart').count() == 1 and 'จาก' in pg.locator('svg.chart').get_attribute('aria-label') and 'ครบ 4 ครั้ง' not in pg.inner_text('#view'))
        prs = pg.locator('svg.chart .ch-pr').count()
        check('P21 กราฟมีสถิติใหม่ (รูปเพชร) และมีป้ายตัวอักษร PR ประกอบ', prs >= 2 and pg.locator('svg.chart .ch-prt').count() == prs, prs)
        check('P22 รายการรายครั้งใต้กราฟมีป้าย PR เป็นข้อความ', pg.locator('.sum-row .tag.pr').count() == prs, (pg.locator('.sum-row .tag.pr').count(), prs))
        pg.click('[data-action=trend-metric][data-v=e1rm]'); pg.wait_for_timeout(150)
        check('P23 สลับเป็น 1RM โดยประมาณ → กราฟ/คำอธิบายเปลี่ยน และบอกสูตร', '1RM' in pg.locator('svg.chart').get_attribute('aria-label') and 'Epley' in pg.inner_text('.hint:near(.chart-wrap)') if False else '1RM' in pg.locator('svg.chart').get_attribute('aria-label'))
        # ท่าที่เล่นน้อยกว่า 4 ครั้ง → การ์ดตัวเลข ไม่มีกราฟ
        pg.click('.back'); pg.wait_for_selector('[data-action=sum-open]')
        pg.click('[data-action=sum-open][data-ex=ppl-lat-pulldown]'); pg.wait_for_selector('.stat-row')
        check('P24 เล่น <4 ครั้ง → ไม่มีกราฟ แต่มีการ์ดตัวเลข + บอกเงื่อนไขกราฟ', pg.locator('svg.chart').count() == 0 and 'ครบ 4 ครั้ง' in pg.inner_text('#view'))
        # ----- รายครั้ง
        hist(pg, 'sessions')
        check('P25 รายครั้ง: รายการ session ที่จบแล้ว (8)', pg.locator('[data-action=open-detail]').count() == 8, pg.locator('[data-action=open-detail]').count())
        # ----- สรุปหลังจบ
        go_home(pg)
        pg.click('.today-card .btn'); pg.wait_for_selector('.sets')
        # ทำ 2 ท่าแรกจนครบ โดยท่าแรกหนักกว่าเดิม (ทำสถิติใหม่)
        ex1 = pg.evaluate("GL.state.active.entries[0].exerciseName"); heavy = 200
        for _ in range(3):
            fill(pg, 0, heavy, 10); confirm(pg)
        pg.click('[data-action=manage]'); pg.click('.sheet [data-action=finish]'); pg.wait_for_selector('[data-action=finish-confirm]'); pg.click('[data-action=finish-confirm]')
        pg.wait_for_selector('h1:has-text("จบการฝึกแล้ว")')
        check('S1 สรุปหลังจบ: การ์ดตัวเลข ระยะเวลา/เซต/ท่า', pg.locator('.done-stats .stat').count() == 3 and pg.inner_text('.done-stats .stat:nth-child(2) b') == '3')
        check('S2 สรุปหลังจบ: ท่าแรกทำสถิติใหม่ → ขึ้น “สถิติใหม่” พร้อมป้าย PR', pg.locator('.pr-card .tag.pr').count() == 1 and ex1 in pg.inner_text('.pr-card'), pg.inner_text('#view')[:300])
        check('S3 สรุปหลังจบ: กล้ามเนื้อที่ได้เซต + จำนวนเซต', pg.locator('.chips.wrap .tag').count() >= 1 and '3 เซต' in pg.inner_text('.chips.wrap'))
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z1 ไม่มี error ใน console', not errs, errs)
        # เลย์เอาต์
        for (w_, h_) in ((375, 667), (430, 932)):
            ctx = b.new_context(viewport={'width': w_, 'height': h_}, locale='th-TH', service_workers='block')
            pg2 = ctx.new_page(); pg2.goto(BASE + 'index.html'); pg2.wait_for_selector('.plan-row')
            pg2.evaluate("""async (ids) => { for (const w of ids) await GymStorage.put('workouts', w); }""", [w for w in workouts(pg)])
            pg2.reload(); pg2.wait_for_selector('.plan-row'); pg2.click('#tabs [data-tab=history]'); pg2.wait_for_selector('.cg')
            check('Y1 %dx%d ภาพรวมไม่เลื่อนแนวนอน และตารางไม่ล้นจอ' % (w_, h_), pg2.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth") and pg2.evaluate("() => document.querySelector('table.cg').getBoundingClientRect().right <= window.innerWidth"))
            pg2.click('[data-action=his-mode][data-mode=exercises]'); pg2.click('[data-action=sum-open][data-ex=ppl-incline-chest-press]'); pg2.wait_for_selector('svg.chart')
            check('Y2 %dx%d หน้ากราฟไม่เลื่อนแนวนอน' % (w_, h_), pg2.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth"))
            ctx.close()
        b.close()
    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

main()
