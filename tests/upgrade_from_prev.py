#!/usr/bin/env python3
"""ทดสอบอัปเกรดจากเวอร์ชันก่อนหน้า (เช่น 1.3.1) → เวอร์ชันใหม่ บน origin/IndexedDB เดิม
ใช้: python3 tests/upgrade_from_prev.py <gym-log เวอร์ชันเก่า> <gym-log เวอร์ชันใหม่>
สร้างข้อมูลด้วย “แอปเก่าจริง ๆ” ผ่านหน้าจอ (2 session: จบแล้ว 1 + ค้างอยู่ 1 พร้อมค่าที่พิมพ์ค้าง)
แล้วเปิดแอปใหม่บนโปรไฟล์เดียวกัน ตรวจว่าทุกระเบียนเดิมเหมือนเดิมทุกตัวอักษร ข้อมูลทดสอบเป็นข้อมูลสมมติ"""
import sys, os, subprocess, time, tempfile, json
from playwright.sync_api import sync_playwright

OLD, NEW = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
root = tempfile.mkdtemp(prefix='gl_upg_'); link = os.path.join(root, 'gym-log'); os.symlink(OLD, link)
PORT = 8767
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', root], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:%d/gym-log/index.html' % PORT
passed = failed = 0
def check(n, c, e=''):
    global passed, failed
    if c: passed += 1; print('PASS', n)
    else: failed += 1; print('FAIL', n, e)

STORES = ['exercises', 'plans', 'workouts']
def snap(pg):
    d = {s: sorted(pg.evaluate("s => GymStorage.getAll(s)", s), key=lambda r: str(r.get('id'))) for s in STORES}
    d['settings'] = sorted(pg.evaluate("GymStorage.getAll('settings')"), key=lambda r: r['key'])
    return d
def export(pg):
    j = pg.evaluate("GymStorage.exportAll('x')")
    j = json.loads(json.dumps(j))
    for k in ('exportedAt', 'appVersion'): j.pop(k, None)
    return j
def fill(pg, w, r):
    pg.fill('input[data-pending="0"][data-field=weight]', str(w)); pg.fill('input[data-pending="0"][data-field=reps]', str(r))
def confirm(pg):
    pg.click('.cf.cur'); pg.wait_for_timeout(250)
def to_home(pg):
    if not pg.locator('#tabs').is_visible():
        pg.click('.s-head .back'); pg.wait_for_selector('#tabs', state='visible')
    pg.click('#tabs [data-tab=home]'); pg.wait_for_selector('.plan-card')

try:
    ud = os.path.join(root, 'profile'); os.makedirs(ud)
    with sync_playwright() as p:
        def ctx():
            c = p.chromium.launch_persistent_context(ud, viewport={'width': 390, 'height': 844}, service_workers='block')
            c.route('**/*', lambda r: r.continue_(headers={**r.request.headers, 'cache-control': 'no-cache'}))
            return c
        c1 = ctx(); pg = c1.new_page(); pg.goto(URL); pg.wait_for_selector('.plan-card'); pg.wait_for_timeout(600)
        pg.evaluate("""async () => { const now = new Date().toISOString();
          await GymStorage.put('exercises', {id:'user-extra', name:'My Extra Row (สมมติ)', muscle:'หลัง', equipment:'สายเคเบิล', repMin:8, repMax:12, step:2.5, weightMode:'cable', subs:[], archived:false, isSample:false, createdAt:now}); }""")
        # session 1 (จบแล้ว) ผ่านหน้าจอจริงของแอปเก่า
        pg.reload(); pg.wait_for_selector('.plan-card')
        pg.click('.plan-card:has-text("Pull")'); pg.click('[data-action=start-plan]'); pg.wait_for_selector('.sets')
        for w_, r_ in ((60, 10), (60, 9), (57.5, 9)):
            fill(pg, w_, r_); confirm(pg)
        pg.click('[data-action=manage]'); pg.click('[data-action=finish]'); pg.click('[data-action=finish-confirm]'); pg.wait_for_timeout(500)
        # session 2 (ค้างอยู่) + ค่าที่พิมพ์ค้างในช่อง
        to_home(pg)
        pg.click('.plan-card:has-text("Push")'); pg.click('[data-action=start-plan]'); pg.wait_for_selector('.sets')
        fill(pg, 80, 8); confirm(pg)
        fill(pg, 82.5, 7); confirm(pg)
        fill(pg, 70, 6)           # ยังไม่ยืนยัน = draft
        pg.wait_for_timeout(900)
        old = snap(pg); old_exp = export(pg)
        n_fin = len([w for w in old['workouts'] if w['status'] == 'finished']); n_act = len([w for w in old['workouts'] if w['status'] == 'active'])
        ver_old = pg.evaluate("GL.APP_VERSION")
        check('U0 เตรียมข้อมูลด้วยแอปเก่า %s: จบแล้ว 1 + ค้าง 1 + ท่า/แผนครบ' % ver_old, n_fin == 1 and n_act == 1 and len(old['exercises']) >= 10 and len(old['plans']) >= 3, (n_fin, n_act, len(old['exercises']), len(old['plans'])))
        c1.close()

        os.remove(link); os.symlink(NEW, link)
        c2 = ctx(); pg = c2.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
        pg.goto(URL)
        try: pg.wait_for_selector('.plan-card', timeout=8000)
        except Exception: print('BOOT FAIL', errs, pg.inner_text('body')[:300]); raise
        pg.wait_for_timeout(800)
        ver_new = pg.evaluate("GL.APP_VERSION")
        check('U1 แอปใหม่ (%s) เปิดบนข้อมูลเดิมได้ ไม่มี error' % ver_new, ver_new != ver_old and not errs, errs)
        new = snap(pg)
        for s in STORES:
            check('U2 %s: ทุกระเบียนเหมือนเดิมทุกตัวอักษร (%d รายการ)' % (s, len(old[s])), new[s] == old[s],
                  [ (a['id']) for a, b in zip(old[s], new[s]) if a != b ][:5] or (len(old[s]), len(new[s])))
        check('U3 settings เดิมไม่ถูกแก้/ลบ (ค่าที่มีอยู่เดิมคงอยู่)', all(r in new['settings'] for r in old['settings']), [r for r in old['settings'] if r not in new['settings']])
        check('U4 แอปใหม่ไม่ได้เขียน key ใหม่ลงฐานข้อมูลเองตอนเปิดครั้งแรก', len(new['settings']) == len(old['settings']), [r['key'] for r in new['settings'] if r not in old['settings']])
        check('U5 ไฟล์สำรอง (export) เหมือนของแอปเก่าทุกอย่าง', export(pg) == old_exp)
        vb = pg.evaluate("(j) => { const r = GymStorage.validateBackup(j); return {ok:r.ok, errors:r.errors}; }", old_exp)
        check('U6 ไฟล์สำรองที่ export จากแอปเก่า นำเข้าแอปใหม่ได้ (validate ผ่าน)', vb['ok'], vb)
        # ใช้งานต่อจาก session ที่ค้าง
        pg.click('[data-action=resume]'); pg.wait_for_selector('.sets')
        check('U7 เล่นต่อ session ค้าง: เซตที่ยืนยันแล้วครบ 2 เซต', pg.evaluate("GL.state.active.entries[0].sets.filter(s=>s.status==='completed').length") == 2)
        w_in = pg.input_value('input[data-pending="0"][data-field=weight]'); r_in = pg.input_value('input[data-pending="0"][data-field=reps]')
        check('U8 ค่าที่พิมพ์ค้างไว้ (70 × 6) ยังอยู่ในช่อง', (w_in, r_in) == ('70', '6'), (w_in, r_in))
        confirm(pg)
        check('U9 ยืนยันเซตต่อได้ และเริ่มจับเวลาพัก', pg.evaluate("GL.state.active.entries[0].sets.filter(s=>s.status==='completed').length") == 3 and pg.locator('#rest-bar').is_visible())
        pg.click('[data-action=rest-skip]')
        pg.click('.s-head .back'); pg.wait_for_selector('#tabs', state='visible')
        pg.click('#tabs [data-tab=history]'); pg.wait_for_timeout(300)
        check('U10 หน้าประวัติเห็น session ที่จบเดิม', pg.locator('text=Pull').count() >= 1)
        fin_old = [w for w in old['workouts'] if w['status'] == 'finished'][0]
        now_w = {w['id']: w for w in pg.evaluate("GymStorage.getAll('workouts')")}
        check('U11 หลังใช้งานต่อ session จบเดิมยังเหมือนเดิม', now_w[fin_old['id']] == fin_old)
        # เปลี่ยนการตั้งค่า → export มีค่าใหม่ และยัง import กลับได้
        pg.click('#tabs [data-tab=home]'); pg.wait_for_selector('.plan-card')
        pg.click('[data-action=open-settings]'); pg.wait_for_selector('.rest-presets')
        pg.click('[data-action=set-rest][data-v="60"]'); pg.wait_for_timeout(200)
        ex2 = pg.evaluate("GymStorage.exportAll('x')")
        check('U12 หลังตั้งค่าเวลาพัก ไฟล์สำรองเก็บ restSeconds=60 และ validate ผ่าน',
              json.dumps(ex2).count('restSeconds') >= 1 and pg.evaluate("(j) => GymStorage.validateBackup(j).ok", ex2))
        check('U13 ไม่มี error ตลอดการทดสอบ', not errs, errs)
        c2.close()
finally:
    srv.terminate()
print('\n%d/%d ผ่าน' % (passed, passed + failed))
sys.exit(1 if failed else 0)
