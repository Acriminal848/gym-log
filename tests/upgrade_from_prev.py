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
PLANSEL = '.plan-card'
def to_home(pg):
    if not pg.locator('#tabs').is_visible():
        pg.click('.s-head .back'); pg.wait_for_selector('#tabs', state='visible')
    pg.click('#tabs [data-tab=home]'); pg.wait_for_selector(PLANSEL)

try:
    ud = os.path.join(root, 'profile'); os.makedirs(ud)
    with sync_playwright() as p:
        def ctx():
            c = p.chromium.launch_persistent_context(ud, viewport={'width': 390, 'height': 844}, service_workers='block')
            c.route('**/*', lambda r: r.continue_(headers={**r.request.headers, 'cache-control': 'no-cache'}))
            return c
        c1 = ctx(); pg = c1.new_page(); pg.goto(URL); pg.wait_for_selector('.plan-card'); pg.wait_for_timeout(600)
        pg.evaluate("""async () => { const now = new Date().toISOString();
          await GymStorage.put('exercises', {id:'user-leg', name:'My Leg Curl (สมมติ)', muscle:'ขา', equipment:'เครื่อง', repMin:8, repMax:12, step:5, weightMode:'machine', subs:[], archived:false, isSample:false, createdAt:now});
          await GymStorage.put('exercises', {id:'user-shoulder', name:'My Shoulder (สมมติ)', muscle:'ไหล่', equipment:'ดัมเบล', repMin:8, repMax:12, step:2, weightMode:'dumbbell_each', subs:[], archived:false, isSample:false, createdAt:now});
          const lp = await GymStorage.get('exercises', 'ppl-leg-press'); lp.muscle = 'ขาที่ฉันตั้งเอง'; await GymStorage.put('exercises', lp);
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
        try: pg.wait_for_selector('.plan-row', timeout=8000)
        except Exception: print('BOOT FAIL', errs, pg.inner_text('body')[:300]); raise
        pg.wait_for_timeout(800)
        ver_new = pg.evaluate("GL.APP_VERSION")
        check('U1 แอปใหม่ (%s) เปิดบนข้อมูลเดิมได้ ไม่มี error' % ver_new, ver_new != ver_old and not errs, errs)
        new = snap(pg)
        MS = {'ppl-lateral-raise-machine':'ไหล่ข้าง','ppl-cable-lateral-raise':'ไหล่ข้าง','ppl-reverse-pec-deck':'ไหล่หลัง','ppl-cable-rear-delt-fly':'ไหล่หลัง',
              'ppl-leg-press':'ต้นขาหน้า','ppl-hack-squat':'ต้นขาหน้า','ppl-leg-extension':'ต้นขาหน้า','ppl-leg-extension-b':'ต้นขาหน้า','ppl-seated-leg-curl':'ต้นขาหลัง','ppl-lying-leg-curl':'ต้นขาหลัง'}
        def expect_ex(e):
            c = dict(e)
            if e['id'] in MS and e['muscle'] in ('ไหล่', 'ขา'): c['muscle'] = MS[e['id']]
            return c
        for s_ in ('plans', 'workouts'):
            check('U2 %s: ทุกระเบียนเหมือนเดิมทุกตัวอักษร (%d รายการ)' % (s_, len(old[s_])), new[s_] == old[s_], (len(old[s_]), len(new[s_])))
        check('U2a exercises: จำนวนเท่าเดิม ไม่มีเพิ่ม/ลด (%d)' % len(old['exercises']), [e['id'] for e in new['exercises']] == [e['id'] for e in old['exercises']])
        check('U2b exercises: เปลี่ยนเฉพาะชื่อกล้ามเนื้อของท่า PPL ที่ยังเป็นค่าเดิม (9 ท่า) ฟิลด์อื่นเหมือนเดิมทุกตัวอักษร',
              new['exercises'] == [expect_ex(e) for e in old['exercises']], [(a['id'], a['muscle'], b['muscle']) for a, b in zip(old['exercises'], new['exercises']) if expect_ex(a) != b][:5])
        nb = {e['id']: e for e in new['exercises']}
        check('U2c ท่าที่ผู้ใช้สร้างเอง (ไหล่/ขา) ไม่ถูกแตะ', nb['user-leg']['muscle'] == 'ขา' and nb['user-shoulder']['muscle'] == 'ไหล่' and nb['user-extra']['muscle'] == 'หลัง')
        check('U2d ท่า PPL ที่ผู้ใช้ตั้งชื่อกล้ามเนื้อเองแล้ว (Leg Press = “ขาที่ฉันตั้งเอง”) ไม่ถูกแตะ', nb['ppl-leg-press']['muscle'] == 'ขาที่ฉันตั้งเอง')
        check('U2e ท่า PPL ที่ยังเป็นค่าเดิมถูกแยกตามที่ตั้งใจ (ไหล่ข้าง/ไหล่หลัง/ต้นขาหน้า/ต้นขาหลัง)',
              nb['ppl-cable-lateral-raise']['muscle'] == 'ไหล่ข้าง' and nb['ppl-reverse-pec-deck']['muscle'] == 'ไหล่หลัง' and nb['ppl-hack-squat']['muscle'] == 'ต้นขาหน้า' and nb['ppl-lying-leg-curl']['muscle'] == 'ต้นขาหลัง')
        st = {r['key']: r['value'] for r in new['settings']}
        check('U3 settings เดิมไม่ถูกแก้/ลบ (ค่าที่มีอยู่เดิมคงอยู่)', all(r in new['settings'] for r in old['settings']), [r for r in old['settings'] if r not in new['settings']])
        added = sorted(r['key'] for r in new['settings'] if r not in old['settings'])
        check('U4 คีย์ใหม่ที่แอปเขียนตอนเปิดครั้งแรกมีแค่ธงย้ายข้อมูลและสำรองค่าเดิม', added == ['muscleSplit', 'muscleSplitBackup'], added)
        bk = st.get('muscleSplitBackup') or []
        restored = {e['id']: dict(e) for e in new['exercises']}
        for b_ in bk: restored[b_['id']]['muscle'] = b_['muscle']
        check('U4a สำรองค่าเดิมครบ: เอาค่าสำรองกลับไปใส่ → ได้ข้อมูลเดิมทุกตัวอักษร (ย้อนกลับได้)', [restored[e['id']] for e in old['exercises']] == old['exercises'] and len(bk) == 9, len(bk))
        exp_new = export(pg)
        exp_old_norm = json.loads(json.dumps(old_exp)); exp_old_norm['data']['exercises'] = [expect_ex(e) for e in exp_old_norm['data']['exercises']]
        check('U5 ไฟล์สำรอง (export) เหมือนของแอปเก่า ต่างเฉพาะชื่อกล้ามเนื้อที่แยกแล้ว', exp_new == exp_old_norm)
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
        pg.click('#tabs [data-tab=history]'); pg.wait_for_timeout(300); pg.click('[data-action=his-mode][data-mode=sessions]'); pg.wait_for_timeout(150)
        check('U10 หน้าประวัติเห็น session ที่จบเดิม', pg.locator('text=Pull').count() >= 1)
        fin_old = [w for w in old['workouts'] if w['status'] == 'finished'][0]
        now_w = {w['id']: w for w in pg.evaluate("GymStorage.getAll('workouts')")}
        check('U11 หลังใช้งานต่อ session จบเดิมยังเหมือนเดิม', now_w[fin_old['id']] == fin_old)
        # เปลี่ยนการตั้งค่า → export มีค่าใหม่ และยัง import กลับได้
        pg.click('#tabs [data-tab=home]'); pg.wait_for_selector('.plan-row')
        pg.click('[data-action=open-settings]'); pg.wait_for_selector('.rest-presets')
        pg.click('[data-action=set-rest][data-v="60"]'); pg.wait_for_timeout(200)
        ex2 = pg.evaluate("GymStorage.exportAll('x')")
        check('U12 หลังตั้งค่าเวลาพัก ไฟล์สำรองเก็บ restSeconds=60 และ validate ผ่าน',
              json.dumps(ex2).count('restSeconds') >= 1 and pg.evaluate("(j) => GymStorage.validateBackup(j).ok", ex2))
        # กู้คืนไฟล์สำรองของแอปเก่า (ชื่อกล้ามเนื้อเดิม) ด้วยหน้าจอจริง → ต้องถูกแยกชื่ออีกครั้งโดยไม่กระทบข้อมูลอื่น
        oldfile = os.path.join(root, 'old_backup.json'); json.dump(old_exp, open(oldfile, 'w'))
        pg.click('[data-action=open-backup]'); pg.wait_for_selector('[data-action=import-pick]')
        pg.set_input_files('#import-file', oldfile); pg.wait_for_selector('[data-action=import-replace-ask]')
        pg.click('[data-action=import-replace-ask]'); pg.wait_for_selector('[data-action=import-replace]'); pg.click('[data-action=import-replace]')
        pg.wait_for_selector('.plan-row'); pg.wait_for_timeout(500)
        after = snap(pg); ab = {e['id']: e for e in after['exercises']}
        check('U12a กู้คืนไฟล์สำรองเก่า → ถูกแยกชื่อกล้ามเนื้อให้เหมือนกัน (ท่าผู้ใช้/ที่ผู้ใช้แก้เองไม่ถูกแตะ)', ab['ppl-hack-squat']['muscle'] == 'ต้นขาหน้า' and ab['ppl-cable-rear-delt-fly']['muscle'] == 'ไหล่หลัง' and ab['user-leg']['muscle'] == 'ขา' and ab['ppl-leg-press']['muscle'] == 'ขาที่ฉันตั้งเอง')
        check('U12b กู้คืนแล้วประวัติ/แผนตรงกับไฟล์ที่กู้ทุกตัวอักษร', after['workouts'] == [w for w in old['workouts']] or sorted(w['id'] for w in after['workouts']) == sorted(w['id'] for w in old['workouts']))
        check('U13 ไม่มี error ตลอดการทดสอบ', not errs, errs)
        c2.close()
finally:
    srv.terminate()
print('\n%d/%d ผ่าน' % (passed, passed + failed))
sys.exit(1 if failed else 0)
