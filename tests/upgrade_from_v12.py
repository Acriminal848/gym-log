#!/usr/bin/env python3
"""ทดสอบอัปเกรด 1.2.0 → 1.3.0 บน origin เดิม (IndexedDB เดิม)
ใช้: python3 tests/upgrade_from_v12.py <โฟลเดอร์ gym-log เวอร์ชัน 1.2.0> <โฟลเดอร์ gym-log เวอร์ชัน 1.3.0>
ข้อมูลทดสอบเป็นข้อมูลสมมติทั้งหมด"""
import sys, os, subprocess, time, tempfile, shutil, json
from playwright.sync_api import sync_playwright

OLD, NEW = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
root = tempfile.mkdtemp(prefix='gl_upg_'); link = os.path.join(root, 'gym-log'); os.symlink(OLD, link)
PORT = 8766
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', root], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:%d/gym-log/index.html' % PORT
passed = failed = 0
def check(n, c, e=''):
    global passed, failed
    if c: passed += 1; print('PASS', n)
    else: failed += 1; print('FAIL', n, e)

def S(set_id, w, r): return {'id': set_id, 'kind': 'working', 'status': 'completed', 'weight': w, 'reps': r, 'at': '2026-01-05T10:00:00.000Z'}
def entry(eid, ex, name, eq, mode, planned, sets):
    return {'id': eid, 'plannedExerciseId': ex, 'plannedExerciseName': name, 'exerciseId': ex, 'exerciseName': name, 'equipment': eq, 'weightMode': mode, 'plannedSets': planned, 'target': None, 'sets': sets, 'draft': None}

try:
    # ใช้ persistent context เพื่อให้ IndexedDB เดิมอยู่ข้ามการสลับ
    ud = os.path.join(root, 'profile'); os.makedirs(ud)
    with sync_playwright() as p:
        c1 = p.chromium.launch_persistent_context(ud, viewport={'width': 390, 'height': 844}, service_workers='block')
        c1.route('**/*', lambda r: r.continue_(headers={**r.request.headers, 'cache-control': 'no-cache'}))
        pg = c1.new_page(); pg.goto(URL); pg.wait_for_function("window.GymStorage && window.__gymlog"); pg.wait_for_timeout(500)
        pg.evaluate("""async ({S1, S2, S3}) => {
          const now = new Date().toISOString();
          await GymStorage.put('exercises', {id:'user-curl', name:'My Cable Curl (สมมติ)', muscle:'ไบเซ็ป', equipment:'สายเคเบิล', repMin:10, repMax:15, step:2.5, weightMode:'cable', subs:[], archived:false, isSample:false, createdAt:now});
          await GymStorage.put('plans', {id:'user-plan', name:'แผนของฉัน (สมมติ)', archived:false, isSample:false, createdAt:now, items:[{exerciseId:'seed-lat-pulldown', sets:3},{exerciseId:'user-curl', sets:3}]});
          const mk = (id, date, entries) => ({id, date, status:'finished', startedAt:date+'T09:00:00.000Z', finishedAt:date+'T10:00:00.000Z', planId:null, planName:'เก่า', entries:[entries]});
          await GymStorage.put('workouts', mk('w-old1','2026-01-05',S1));
          await GymStorage.put('workouts', mk('w-old2','2026-01-08',S2));
          await GymStorage.put('workouts', {id:'w-active', date:'2026-01-10', status:'active', startedAt:'2026-01-10T09:00:00.000Z', finishedAt:null, planId:'user-plan', planName:'แผนของฉัน (สมมติ)', entries:S3});
        }""", {
            'S1': entry('e1', 'seed-bench-press', 'Barbell Bench Press', 'บาร์เบล', 'barbell_total', 3, [S('s1', 60, 8), S('s2', 60, 8)]),
            'S2': entry('e2', 'user-curl', 'My Cable Curl (สมมติ)', 'สายเคเบิล', 'cable', 3, [S('s3', 20, 12)]),
            'S3': [entry('e3', 'seed-lat-pulldown', 'Lat Pulldown', 'เครื่อง Lat Pulldown', 'machine', 3, [S('s4', 50, 10)]), entry('e4', 'user-curl', 'My Cable Curl (สมมติ)', 'สายเคเบิล', 'cable', 3, [])]
        })
        n_before = len(pg.evaluate("GymStorage.getAll('workouts')"))
        check('U0 เตรียมข้อมูลแบบ 1.2.0 (ท่า/แผนตัวอย่าง + ข้อมูลผู้ใช้ + session ค้าง 1)', n_before == 3 and any(e.get('isSample') for e in pg.evaluate("GymStorage.getAll('exercises')")))
        c1.close()
        os.remove(link); os.symlink(NEW, link)
        c2 = p.chromium.launch_persistent_context(ud, viewport={'width': 390, 'height': 844}, service_workers='block')
        c2.route('**/*', lambda r: r.continue_(headers={**r.request.headers, 'cache-control': 'no-cache'}))
        pg = c2.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
        pg.goto(URL)
        try: pg.wait_for_selector('.plan-card', timeout=8000)
        except Exception: print('BOOT FAIL', errs, pg.inner_text('body')[:300]); raise
        pg.wait_for_timeout(300)
        exs = pg.evaluate("GymStorage.getAll('exercises')"); pls = pg.evaluate("GymStorage.getAll('plans')"); ws = pg.evaluate("GymStorage.getAll('workouts')")
        byid = {e['id']: e for e in exs}
        check('U1 ประวัติ 3 รายการอยู่ครบ ไม่เสียหาย (2 จบแล้ว + 1 active)', len(ws) == 3 and sorted(w['status'] for w in ws) == ['active', 'finished', 'finished'])
        check('U2 ท่าตัวอย่างที่มีประวัติ (Bench Press) ถูกเก็บเข้าคลัง ไม่ลบ', 'seed-bench-press' in byid and byid['seed-bench-press']['archived'] is True)
        check('U3 ท่าตัวอย่างที่ session ค้างใช้อยู่ (Lat Pulldown) ไม่ถูกลบ', 'seed-lat-pulldown' in byid)
        check('U4 ท่าตัวอย่างที่ไม่เคยใช้ถูกเอาออก (เช่น Dumbbell Curl)', 'seed-db-curl' not in byid and 'seed-shoulder-press' not in byid)
        check('U5 ท่าของผู้ใช้ไม่ถูกแตะ', byid.get('user-curl', {}).get('name') == 'My Cable Curl (สมมติ)' and not byid['user-curl'].get('archived'))
        check('U6 แผนของผู้ใช้ยังอยู่และครบ 2 ท่า', any(p_['id'] == 'user-plan' and len(p_['items']) == 2 for p_ in pls))
        check('U7 แผนตัวอย่างถูกลบ และเพิ่มแผน PPL 4 แผน', not any(p_['id'].startswith('seed-plan') for p_ in pls) and sum(1 for p_ in pls if p_['id'].startswith('ppl-plan')) == 4)
        check('U8 เพิ่มท่า PPL ครบ 34 ท่า', sum(1 for e in exs if e['id'].startswith('ppl-')) == 34)
        check('U9 แสดงแจ้งเตือนครั้งเดียวที่หน้าแรกพร้อมปุ่ม “รับทราบ”', pg.locator('.notice [data-action=dismiss-notice]').count() == 1)
        check('U10 Home มี session ค้างจาก 1.2.0 (ปุ่มเล่นต่อ) ไม่เด้งเข้าหน้าจดเอง', pg.locator('.session-bar [data-action=resume]').count() == 1 and pg.locator('.sets').count() == 0)
        pg.click('.session-bar [data-action=resume]'); pg.wait_for_selector('.sets')
        txt = pg.inner_text('#view')
        check('U11 เล่นต่อ session 1.2.0 ได้: ชื่อท่าถูก และเซตที่จดไว้ (50 × 10) ยังอยู่ในตาราง', 'Lat Pulldown' in txt and '50' in txt and pg.locator('.st-row.done').count() == 1, txt[:200])
        # จดเซตต่อในรูปแบบเก่าได้
        pg.fill('input[data-pending="0"][data-field=weight]', '50'); pg.fill('input[data-pending="0"][data-field=reps]', '9'); pg.click('.cf.cur'); pg.wait_for_timeout(250)
        w = [x for x in pg.evaluate("GymStorage.getAll('workouts')") if x['status'] == 'active'][0]
        check('U12 จดเซตต่อใน session เก่าได้และบันทึกลงเครื่อง (2 เซต)', len(w['entries'][0]['sets']) == 2 and w['entries'][0]['sets'][1]['reps'] == 9)
        # รีโหลด: ไม่ติดตั้งซ้ำ ไม่แจ้งซ้ำหลังรับทราบ
        pg.click('#tabs [data-tab=home]'); pg.click('[data-action=dismiss-notice]'); pg.wait_for_timeout(200)
        pg.reload(); pg.wait_for_selector('.plan-card'); pg.wait_for_timeout(300)
        exs2 = pg.evaluate("GymStorage.getAll('exercises')")
        check('U13 รีโหลด: ไม่เพิ่มท่าซ้ำ และไม่แจ้งเตือนซ้ำหลังรับทราบ', len(exs2) == len(exs) and pg.locator('.notice').count() == 0)
        # ส่งออกจาก 1.3.0 ผ่าน validator
        res = pg.evaluate("""async () => { const d = await GymStorage.exportAll(); const r = GymStorage.validateBackup(JSON.parse(JSON.stringify(d))); return {ok: r.ok, err: r.errors, n: (d.data.workouts||[]).length}; }""")
        check('U14 ส่งออกหลังอัปเกรดผ่านตัวตรวจไฟล์สำรองของแอปเอง', res['ok'] and res['n'] == 3, res)
        # ประวัติ/สรุปไม่นับ active
        pg.click('#tabs [data-tab=history]'); pg.wait_for_selector('.seg')
        check('U15 แท็บประวัติแสดง 2 ครั้งที่จบแล้ว ไม่รวม session ค้าง', pg.locator('.list-btn[data-action=open-detail]').count() == 2)
        check('U16 ไม่มี error ในคอนโซล', not errs, errs)
        c2.close()
finally:
    srv.terminate(); shutil.rmtree(root, ignore_errors=True)
print('\n%d/%d ผ่าน' % (passed, passed + failed)); sys.exit(1 if failed else 0)
