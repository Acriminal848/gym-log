#!/usr/bin/env python3
"""ทดสอบ 2.0/2.1: คลังท่า + ภาพประกอบ pictogram (ท่าจากคลังเกิดเมื่อกดเพิ่มเท่านั้น · ไม่แตะท่าผู้ใช้ · ชื่อคล้ายถามใช้ท่าเดิม) + รูปท่าจากแหล่งเดียว
รัน: python3 tests/e2e_v21b.py http://localhost:8765/gym-log/ (ข้อมูลสมมติ)"""
import sys, json
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L

WRAP_JS = """() => {
  const sel = 'button, .chip, .tag, .btn, [role=tab], .badge, .pill';
  const bad = [];
  document.querySelectorAll(sel).forEach(el => {
    const cs = getComputedStyle(el), r0 = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || r0.width === 0 || r0.height === 0) return;
    const txt = (el.innerText || '').trim().replace(/\\s+/g, ' ');
    if (!txt) return;
    // การ์ดที่เป็นปุ่มทั้งใบ (ตั้งใจให้หลายบรรทัด) ข้าม: ถือว่าเป็นข้อความยาว > 22 ตัวอักษรหรือมีลูกเป็นบล็อก
    if (txt.length > 22 || el.querySelector('div, p, h1, h2, h3, li')) return;
    const rg = document.createRange(); rg.selectNodeContents(el);
    const tops = new Set([...rg.getClientRects()].filter(r => r.width > 1 && r.height > 1).map(r => Math.round(r.top / 4)));
    // ไอคอน svg ในปุ่มอาจอยู่คนละระดับกับข้อความเล็กน้อย → นับบรรทัดจากเฉพาะ text node
    const lines = new Set();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      [...r.getClientRects()].forEach(q => { if (q.width > 1) lines.add(Math.round(q.top / 6)); });
    }
    const over = el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible';
    // ข้อความล้นกล่องของปุ่ม (เช่น “+ Warm-up” ทะลุขอบ)
    const rr = document.createRange(); rr.selectNodeContents(el);
    const rb = rr.getBoundingClientRect(), eb = el.getBoundingClientRect();
    const spill = rb.width > 0 && (rb.right > eb.right + 1 || rb.left < eb.left - 1);
    if (lines.size > 1 || over || spill) bad.push((el.className || el.tagName) + ' «' + txt + '» lines=' + lines.size + (spill ? ' spill' : '') + (over ? ' clip' : ''));
  });
  // ข้อความที่ถูกตัดด้วย … (ellipsis) ในหน้าจอ = ข้อมูลหาย ต้องไม่มี
  document.querySelectorAll('#view *, .sheet *').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.getBoundingClientRect().width > 0) bad.push('ellipsis ' + (el.className || el.tagName) + ' «' + (el.innerText || '').trim().slice(0, 20) + '»');
  });
  const hs = document.documentElement.scrollWidth > window.innerWidth + 1;
  return { bad, hs };
}"""


def audit(pg, name, widths=(320, 390, 430)):
    for w in widths:
        pg.set_viewport_size({'width': w, 'height': 844}); pg.wait_for_timeout(120)
        r = pg.evaluate(WRAP_JS)
        check('W %s @%d: ปุ่ม/ชิป/แท็กไม่ตกบรรทัด ไม่ล้น' % (name, w), not r['bad'] and not r['hs'], r)
    pg.set_viewport_size({'width': 390, 'height': 844})

def ex_by_id(pg):
    return {e['id']: e for e in db(pg, 'exercises')}

def open_lib_tab(pg):
    tab(pg, 'exercises'); pg.wait_for_selector('#ex-q')
    pg.click('[data-action=lib-open][data-ctx=tab]'); pg.wait_for_selector('.sheet [data-action=lib-pick]')

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = new_page(b)
        # ผู้ใช้สร้างท่าเองไว้ก่อน (ต้องไม่ถูกแตะ)
        pg.evaluate("""async () => { const now = new Date().toISOString();
          await GymStorage.put('exercises', {id:'user-face', name:'Face Pull', muscle:'ไหล่หลัง', equipment:'สายเคเบิล', repMin:12, repMax:20, step:2.5, weightMode:'cable', subs:[], archived:false, isSample:false, createdAt:now, note:'ของฉัน'});
          await GymStorage.put('exercises', {id:'user-x', name:'My Weird Machine', muscle:'อก', equipment:'เครื่องแปลก', repMin:6, repMax:9, step:7, weightMode:'machine', subs:[], archived:false, isSample:false, createdAt:now}); }""")
        pg.reload(); pg.wait_for_selector('.today-card, .session-bar')
        before = ex_by_id(pg); n0 = len(before)
        tab(pg, 'exercises'); pg.wait_for_selector('#ex-q')
        check('L1 หน้า “ท่า” มีปุ่ม “คลังท่า” (แต่ละปุ่มเป็นบรรทัดเดียว)', pg.locator('[data-action=lib-open][data-ctx=tab]').count() == 1)
        audit(pg, 'หน้าท่า+คลังท่า')
        pg.click('[data-action=lib-open][data-ctx=tab]'); pg.wait_for_selector('.sheet [data-action=lib-pick]')
        rows = pg.locator('.sheet [data-action=lib-pick]').count()
        check('L2 เปิดคลังท่า: มีท่า ≥ 60 ท่า มีชิปหมวดใหญ่ และช่องค้นหา', rows >= 60 and pg.locator('#pick-chips .chip').count() >= 8 and pg.locator('#pick-q').count() == 1, rows)
        check('L3 แค่เปิดดูคลัง ไม่เขียนอะไรลงฐานข้อมูล (ไม่มีท่า lib-…)', not [k for k in ex_by_id(pg) if k.startswith('lib-')] and len(ex_by_id(pg)) == n0)
        audit(pg, 'คลังท่า(รายการ)')
        pg.fill('#pick-q', 'อก'); pg.wait_for_timeout(150)
        vis = pg.evaluate("() => [...document.querySelectorAll('#pick-list [data-action=lib-pick]')].filter(e => !e.hidden && e.offsetParent).length")
        check('L4 ค้นหา “อก” เจอทุกท่าในหมวดอก (รวมส่วนย่อยอกบน/กลาง/ล่าง)', 8 <= vis < rows, vis)
        pg.fill('#pick-q', 'crossover'); pg.wait_for_timeout(150)
        vis = pg.evaluate("() => [...document.querySelectorAll('#pick-list [data-action=lib-pick]')].filter(e => !e.hidden && e.offsetParent).map(e => e.textContent)")
        check('L5 ค้นหาชื่อ: Low Cable Crossover (Cable Crossover ธรรมดามีในท่า PPL อยู่แล้ว จึงไม่เสนอซ้ำ)', len(vis) == 1 and 'Low Cable Crossover' in vis[0], vis)
        pg.fill('#pick-q', ''); pg.wait_for_timeout(100)
        aslug = pg.evaluate("() => GymArt.entries()[0].slug")
        pg.click('[data-action=lib-pick][data-slug=%s]' % aslug); pg.wait_for_selector('.sheet .art-big img.exart')
        pg.wait_for_function("() => [...document.querySelectorAll('.sheet .art-big img')].every(i => i.complete && i.naturalWidth > 0)")
        check('L6 หน้ารายละเอียดของท่าที่มีภาพ: แสดงภาพใหญ่ภาพเดียว ไม่มีข้อความแหล่งที่มา/ลิขสิทธิ์', pg.locator('.sheet .art-big img').count() == 1 and 'free-exercise-db' not in pg.inner_text('.sheet') and pg.locator('.sheet .photo-pair').count() == 0)
        check('L7 ภาพเป็นไฟล์ในโฟลเดอร์ art/ ของแอปเอง (ไม่ดึงจากเว็บอื่น) และเป็นภาพตกแต่ง (alt ว่าง)', pg.evaluate("() => [...document.querySelectorAll('.sheet .art-big img')].every(i => /\\/art\\/[a-z0-9-]+\\.svg$/.test(i.src) && i.getAttribute('alt') === '')"))
        audit(pg, 'คลังท่า(รายละเอียด)')
        check('L8 เปิดดูรายละเอียดก็ยังไม่เขียนข้อมูล', len(ex_by_id(pg)) == n0)
        pg.click('[data-action=lib-back]') if False else pg.click('[data-action=lib-list]'); pg.click('[data-action=lib-pick][data-slug=Low_Cable_Crossover]'); pg.wait_for_selector('.sheet h3')
        pg.click('[data-action=lib-add][data-slug=Low_Cable_Crossover]'); pg.wait_for_timeout(400)
        after = ex_by_id(pg)
        new = [k for k in after if k not in before]
        check('L9 กดเพิ่ม → เกิดท่าใหม่ 1 ท่า id = lib-Cable_Crossover ค่าตามคลัง', new == ['lib-Low_Cable_Crossover'] and after['lib-Low_Cable_Crossover']['repMin'] == 10 and after['lib-Low_Cable_Crossover']['weightMode'] == 'cable' and after['lib-Low_Cable_Crossover']['equipment'] == 'สายเคเบิล' and after['lib-Low_Cable_Crossover']['isSample'] is False, new)
        check('L10 ท่าเดิมทุกท่า (รวมท่าที่ผู้ใช้สร้างเอง) เหมือนเดิมทุกตัวอักษร', all(json.dumps(after[k], sort_keys=True) == json.dumps(before[k], sort_keys=True) for k in before))
        check('L11 กลับมาที่รายการท่า: กรองชื่อท่านั้นให้เห็นเลย + ปิดแผ่น', not pg.locator('.sheet').count() and 'Low Cable Crossover' in pg.inner_text('#ex-list'))
        pg.fill('#ex-q', ''); pg.evaluate("GL.state.exQuery = ''")
        pg.click('[data-action=lib-open][data-ctx=tab]'); pg.wait_for_selector('.sheet [data-action=lib-pick]')
        check('L12 เปิดคลังอีกครั้ง: ท่าที่เพิ่มแล้วไม่โผล่ซ้ำ', pg.locator('[data-action=lib-pick][data-slug=Low_Cable_Crossover]').count() == 0 and pg.locator('.sheet [data-action=lib-pick]').count() == rows - 1)
        # ----- ชื่อคล้ายกัน → ถามใช้ท่าเดิม
        pg.click('[data-action=lib-pick][data-slug=Close-Grip_Front_Lat_Pulldown]'); pg.wait_for_selector('.sheet h3')
        txt = pg.inner_text('.sheet')
        check('L13 ชื่อคล้าย (Lat Pulldown ของคุณ): แจ้งให้ใช้ท่าเดิม ปุ่มหลัก = ใช้ท่าเดิม ปุ่มรอง = เพิ่มเป็นท่าใหม่', 'ชื่อคล้ายกัน' in txt and pg.locator('.sheet .btn.primary[data-action=lib-use]').count() >= 1 and pg.locator('.sheet [data-action=lib-add]').count() == 1 and 'เพิ่มเป็นท่าใหม่จากคลัง' in txt, txt[:300])
        n1 = len(ex_by_id(pg))
        pg.click('.sheet .btn.primary[data-action=lib-use]'); pg.wait_for_timeout(300)
        check('L14 เลือกใช้ท่าเดิม → ไม่สร้างท่าใหม่ ไม่แก้ท่าเดิม', len(ex_by_id(pg)) == n1 and all(json.dumps(ex_by_id(pg)[k], sort_keys=True) == json.dumps(before[k], sort_keys=True) for k in before))
        pg.evaluate("GL.state.exQuery = ''; GL.render()")
        # ----- ชื่อเดียวกันเป๊ะ (Face Pull ของผู้ใช้) → ไม่เพิ่มซ้ำ
        pg.click('[data-action=lib-open][data-ctx=tab]'); pg.wait_for_selector('.sheet [data-action=lib-pick]')
        pg.click('[data-action=lib-pick][data-slug=Face_Pull]'); pg.wait_for_selector('.sheet h3')
        check('L15 ชื่อเดียวกันเป๊ะกับท่าของผู้ใช้ (Face Pull): ไม่มีปุ่มเพิ่มซ้ำ มีข้อความอธิบาย', pg.locator('.sheet [data-action=lib-add]').count() == 0 and 'ไม่เพิ่มซ้ำ' in pg.inner_text('.sheet'))
        pg.click('.sheet [data-action=close-sheet]'); pg.wait_for_timeout(150)
        # ----- ใน session: เพิ่มจากคลัง
        go_home(pg); start_plan(pg, 'Push'); pg.wait_for_selector('.target')
        n_ent = pg.evaluate("GL.state.active.entries.length")
        pg.click('[data-action=entry-menu]'); pg.click('.sheet [data-action=add-ex]'); pg.wait_for_selector('.sheet #pick-q')
        audit(pg, 'เพิ่มท่าใน session (ปุ่มคู่)')
        pg.click('.sheet [data-action=lib-open][data-ctx=session]'); pg.wait_for_selector('.sheet [data-action=lib-pick]')
        pg.click('[data-action=lib-pick][data-slug=Pull_Through]'); pg.wait_for_selector('.sheet h3')
        check('L16 ใน session: ปุ่มเพิ่มบอกว่า “เพิ่มและใช้ใน session นี้”', 'เพิ่มและใช้ใน session นี้' in pg.inner_text('.sheet'))
        pg.click('[data-action=lib-add][data-slug=Pull_Through]'); pg.wait_for_timeout(500)
        cur = pg.evaluate("GL.state.active.entries[GL.state.cur]")
        check('L17 เพิ่มแล้วท่านั้นเข้า session ทันที (และเป็นท่าที่กำลังดู)', pg.evaluate("GL.state.active.entries.length") == n_ent + 1 and cur['exerciseId'] == 'lib-Pull_Through' and 'lib-Pull_Through' in ex_by_id(pg))
        check('L18 ท่าจากคลังที่ไม่มีภาพ (Pull Through): หัวท่าเป็นไอคอนคนเส้นปกติ ไม่มีปุ่มภาพ/ป้าย', pg.locator('.ex-head .tile-art').count() == 0 and pg.locator('.ex-head img').count() == 0)
        # ----- สลับท่าใน session จากคลัง
        pg.evaluate('GL.clearUndo(); GL.render()'); pg.click('[data-action=swap]'); pg.wait_for_selector('.sheet #pick-q')
        pg.click('.sheet [data-action=lib-open][data-ctx=swap]'); pg.wait_for_selector('.sheet [data-action=lib-pick]')
        pg.click('[data-action=lib-pick][data-slug=Standing_Leg_Curl]'); pg.wait_for_selector('.sheet h3')
        check('L20 สลับท่า: ปุ่มบอกว่า “เพิ่มและเปลี่ยนเป็นท่านี้”', 'เพิ่มและเปลี่ยนเป็นท่านี้' in pg.inner_text('.sheet'))
        pg.click('[data-action=lib-add][data-slug=Standing_Leg_Curl]'); pg.wait_for_timeout(500)
        check('L21 สลับแล้วท่าปัจจุบันเป็นท่าจากคลัง', pg.evaluate("GL.state.active.entries[GL.state.cur].exerciseId") == 'lib-Standing_Leg_Curl')
        # ท่าที่ไม่มีรูป ไม่มีป้ายกล้อง
        pg.evaluate("GL.state.cur = GL.state.active.entries.findIndex(e => e.exerciseId === 'ppl-pec-deck'); GL.render()")
        check('L22 ท่า PPL Pec Deck ได้ภาพประกอบที่หัวท่า', pg.locator('.ex-head .tile-art img.exart').count() == 1)
        pg.evaluate("GL.state.cur = GL.state.active.entries.findIndex(e => e.exerciseId === 'ppl-pec-deck'); GL.clearUndo(); GL.render()")
        pg.click('.ex-head .tile-art'); pg.wait_for_selector('.sheet .art-big img')
        pg.wait_for_function("() => [...document.querySelectorAll('.sheet .art-big img')].every(i => i.complete && i.naturalWidth > 0)")
        check('L19 แตะไอคอนหัวท่า Pec Deck → ภาพใหญ่ + บรรทัดเดียว “ส่วนที่ทำงาน = สีส้ม” (ไม่มีย่อหน้าอธิบาย)', pg.locator('.sheet .art-big img').count() == 1 and 'สีส้ม' in pg.inner_text('.sheet') and len(pg.inner_text('.sheet')) < 80, pg.inner_text('.sheet'))
        pg.click('.sheet [data-action=close-sheet]')
        pg.evaluate("GL.state.cur = GL.state.active.entries.findIndex(e => e.exerciseId === 'ppl-cable-lateral-raise'); GL.render()")
        check('L23 ท่า PPL ที่ไม่มีภาพในชุดที่ทำมา: เป็นไอคอนคนเส้นเดิม ไม่ใช้ภาพอื่นแทน', pg.evaluate("() => !GymArt.forId('ppl-cable-lateral-raise')") == (pg.locator('.ex-head img').count() == 0))
        # ----- แผน
        tab(pg, 'plans'); pg.wait_for_selector('[data-action=plan-edit]')
        pg.click('[data-action=plan-edit] >> nth=0'); pg.wait_for_selector('[data-action=pi-add]')
        n_it = pg.evaluate("GL.state.sub.draft.items.length")
        pg.click('[data-action=pi-add]'); pg.wait_for_selector('.sheet #pick-q')
        pg.click('.sheet [data-action=lib-open][data-ctx=plan]'); pg.wait_for_selector('.sheet [data-action=lib-pick]')
        pg.click('[data-action=lib-pick][data-slug=Seated_Calf_Raise]'); pg.wait_for_selector('.sheet h3')
        pg.click('[data-action=lib-add][data-slug=Seated_Calf_Raise]'); pg.wait_for_timeout(400)
        check('L24 แผน: เพิ่มจากคลัง → ใส่ในร่างแผน (ยังไม่บันทึกแผน) และเป็นท่าในรายการของคุณ', pg.evaluate("GL.state.sub.draft.items.length") == n_it + 1 and pg.evaluate("GL.state.sub.draft.items.slice(-1)[0].exerciseId") == 'lib-Seated_Calf_Raise' and 'lib-Seated_Calf_Raise' in ex_by_id(pg))
        pg.click('[data-action=plan-back]'); pg.wait_for_selector('.sheet')
        pg.click('.sheet [data-action=discard-edit]') if pg.locator('.sheet [data-action=discard-edit]').count() else None
        # ----- สำรองข้อมูล
        ok = pg.evaluate("async () => { const j = await GymStorage.exportAll('x'); const r = GymStorage.validateBackup(JSON.parse(JSON.stringify(j))); return [r.ok, j.data.exercises.filter(e => e.id.startsWith('lib-')).length]; }")
        check('L25 ส่งออกข้อมูลที่มีท่าจากคลัง → ตรวจผ่าน และท่า lib-… อยู่ในไฟล์', ok[0] and ok[1] >= 3, ok)
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z6 ไม่มี error ใน console', not errs, errs)
        # ----- 2.1: ท่าที่ผู้ใช้สร้างเอง ไม่ถูกใส่ภาพเอง และเลือกภาพเองได้
        pg = new_page(b)
        pg.evaluate("""async () => { const now = new Date().toISOString();
          await GymStorage.put('exercises', {id:'user-lp', name:'Leg Press', muscle:'ขา', equipment:'เครื่อง', repMin:8, repMax:12, step:5, weightMode:'machine', subs:[], archived:false, isSample:false, createdAt:now, note:'ของฉัน', weights:[20,30,40]});
          await GymStorage.put('exercises', {id:'user-x', name:'My Weird Machine', muscle:'อก', equipment:'เครื่องแปลก', repMin:6, repMax:9, step:7, weightMode:'machine', subs:[], archived:false, isSample:false, createdAt:now}); }""")
        pg.reload(); pg.wait_for_selector('.today-card, .session-bar')
        snap = ex_by_id(pg)
        tab(pg, 'exercises'); pg.wait_for_selector('#ex-q')
        rows = pg.evaluate("() => ['user-lp', 'user-x'].map(id => document.querySelector('[data-action=ex-edit][data-id=' + id + ']').querySelectorAll('img.exart').length)")
        check('A1 ท่าที่ผู้ใช้สร้างเอง (Leg Press ชื่อซ้ำกับท่าในแอป / My Weird Machine) ไม่ถูกใส่ภาพเอง', rows == [0, 0], rows)
        pg.click('[data-action=ex-edit][data-id=user-x]'); pg.wait_for_selector('#ef-name'); pg.click('[data-action=ex-adv]'); pg.wait_for_selector('[data-action=art-open]')
        check('A2 หน้าแก้ไขท่า: มีปุ่ม “เลือกภาพท่า” ปุ่มเดียว และไม่มีปุ่มกล้อง/ดูภาพ', pg.locator('[data-action=art-open]').count() == 1 and pg.locator('[data-action=ex-photo]').count() == 0)
        pg.click('[data-action=art-open]'); pg.wait_for_selector('.sheet .art-opt')
        n_opt = pg.locator('.sheet .art-opt').count()
        check('A3 ตัวเลือกภาพ: มีครบ 72 ภาพ จัดกลุ่มตามกล้ามเนื้อ ปุ่มสูง ≥ 44px', n_opt == 72 and pg.evaluate("() => [...document.querySelectorAll('.sheet .art-opt')].every(b => b.getBoundingClientRect().height >= 44)"), n_opt)
        for w in (320, 390):
            pg.set_viewport_size({'width': w, 'height': 844}); pg.wait_for_timeout(120)
            r = pg.evaluate("() => ({hs: document.documentElement.scrollWidth > innerWidth + 1, clipped: [...document.querySelectorAll('.sheet .art-opt')].filter(b => b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1).length, small: [...document.querySelectorAll('.sheet .art-opt')].filter(b => b.getBoundingClientRect().width < 80).length})")
            check('A3b ตัวเลือกภาพ @%d: ไม่ล้นจอ ชื่อภาพไม่ถูกตัด ช่องไม่เล็กกว่า 80px' % w, not r['hs'] and r['clipped'] == 0 and r['small'] == 0, r)
        pg.set_viewport_size({'width': 390, 'height': 844})
        pg.click('.sheet .art-opt >> nth=3'); pg.wait_for_timeout(250)
        key = pg.evaluate("GL.state.sub.draft.icon")
        check('A4 เลือกภาพ → แผ่นปิด ร่างเก็บ icon = art:<id>', key.startswith('art:') and pg.locator('.sheet').count() == 0 and pg.locator('.art-btn img.exart').count() == 1, key)
        pg.click('[data-action=ex-save]') if pg.locator('[data-action=ex-save]').count() else pg.click('.btn.primary:has-text("บันทึก")'); pg.wait_for_timeout(400)
        after = ex_by_id(pg)
        check('A5 บันทึกแล้ว icon = art:… ฟิลด์อื่นของท่าเดียวกันไม่เปลี่ยน', after['user-x'].get('icon') == key and all(after['user-x'][k] == snap['user-x'][k] for k in snap['user-x']), after['user-x'])
        check('A6 ท่าอื่น (Leg Press ที่ผู้ใช้สร้าง พร้อมรายการน้ำหนัก) เหมือนเดิมทุกตัวอักษร', json.dumps(after['user-lp'], sort_keys=True) == json.dumps(snap['user-lp'], sort_keys=True))
        check('A7 รายการท่า: ท่านั้นแสดงภาพที่เลือก', pg.evaluate("() => [...document.querySelectorAll('#ex-list .list-btn')].filter(b => /My Weird Machine/.test(b.textContent))[0].querySelectorAll('img.exart').length") == 1)
        ok = pg.evaluate("async () => { const j = await GymStorage.exportAll('x'); const r = GymStorage.validateBackup(JSON.parse(JSON.stringify(j))); const e = r.clean.exercises.find(x => x.id === 'user-x'); const l = r.clean.exercises.find(x => x.id === 'user-lp'); return [r.ok, e && e.icon, l && l.weights]; }")
        check('A8 สำรอง/นำเข้า: icon art:… และรายการน้ำหนักผ่านการตรวจและอยู่ครบ', ok[0] and ok[1] == key and ok[2] == [20, 30, 40], ok)
        # ท่าใหม่ที่ชื่อตรงกับภาพเดียวชัดเจน → ได้ภาพอัตโนมัติ; ชื่อกำกวม → ไม่ได้
        pg.click('[data-action=ex-new]'); pg.wait_for_selector('#ef-name')
        pg.fill('#ef-name', 'Assisted Pull-up Machine'); pg.evaluate("GL.state.sub.draft.muscle = 'หลัง'")
        pg.click('.btn.primary:has-text("บันทึก")'); pg.wait_for_timeout(400)
        a2 = [e for e in db(pg, 'exercises') if e['name'] == 'Assisted Pull-up Machine']
        check('A9 ท่าใหม่ชื่อตรงกับภาพเดียว → ได้ภาพนั้นอัตโนมัติ', len(a2) == 1 and a2[0].get('icon', '').startswith('art:'), a2)
        pg.click('[data-action=ex-new]'); pg.wait_for_selector('#ef-name')
        pg.fill('#ef-name', 'Bench Press'); pg.evaluate("GL.state.sub.draft.muscle = 'อก'")
        pg.click('.btn.primary:has-text("บันทึก")'); pg.wait_for_timeout(400)
        a3 = [e for e in db(pg, 'exercises') if e['name'] == 'Bench Press']
        check('A10 ท่าใหม่ชื่อกำกวม (Bench Press) → ไม่เดาภาพให้', len(a3) == 1 and not str(a3[0].get('icon', '')).startswith('art:'), a3)
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z7 ไม่มี error ใน console', not errs, errs)
        b.close()
        # ----- ออฟไลน์: ภาพมากับแอป (cache) ไม่ต้องโหลดจากเน็ต
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='th-TH', service_workers='allow')
        pg = ctx.new_page(); pg.goto(BASE + 'index.html'); pg.wait_for_selector('.today-card, .session-bar')
        pg.wait_for_timeout(2500); pg.reload(); pg.wait_for_selector('.today-card, .session-bar'); pg.wait_for_timeout(800)
        n_cached = pg.evaluate("async () => { const ks = await caches.keys(); let n = 0; for (const k of ks) { const c = await caches.open(k); n += (await c.keys()).filter(r => /\\/art\\/.*\\.svg$/.test(r.url)).length; } return [ks, n]; }")
        check('O1 ภาพทั้ง 72 ถูกเก็บใน cache ของแอป และไม่มี cache รูปถ่ายเก่า', n_cached[1] == 72 and 'gymlib-photos-v1' not in n_cached[0], n_cached)
        ctx.set_offline(True)
        pg.reload(); pg.wait_for_selector('.today-card, .session-bar')
        open_lib_tab(pg); pg.click('[data-action=lib-pick][data-slug=%s]' % aslug); pg.wait_for_selector('.sheet .art-big img')
        pg.wait_for_function("() => [...document.querySelectorAll('.sheet .art-big img')].every(i => i.complete && i.naturalWidth > 0)", timeout=8000)
        check('O2 ออฟไลน์: ภาพประกอบยังแสดงได้', True)
        b.close()

    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

if __name__ == '__main__':
    main()
