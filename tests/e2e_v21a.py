#!/usr/bin/env python3
"""ทดสอบ 2.1: ไม่มีเสียงเลย (เพลงของผู้ใช้ต้องไม่ถูกขัด) · ข้อความ “ครบแล้ว X ที่แล้ว” ยังอยู่
รัน: python3 tests/e2e_v21a.py http://localhost:8765/gym-log/"""
import sys
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L

SPY = """() => {
  window.__au = { plays: 0, ctx: 0, audioEls: 0 };
  HTMLMediaElement.prototype.play = function () { window.__au.plays++; return Promise.resolve(); };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) { window.AudioContext = function () { window.__au.ctx++; return new AC(); }; window.webkitAudioContext = window.AudioContext; }
  const ce = document.createElement.bind(document);
  document.createElement = function (t) { if (String(t).toLowerCase() === 'audio') window.__au.audioEls++; return ce(t); };
}"""
def au(pg): return pg.evaluate("() => Object.assign({}, window.__au)")

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        reqs = []
        pg = new_page(b)
        pg.on('request', lambda r: reqs.append(r.url))
        pg.evaluate(SPY)
        start_plan(pg, 'Push'); pg.wait_for_selector('.target')
        fill(pg, 0, 40, 10); confirm(pg)
        pg.wait_for_timeout(300)
        check('T1 จดเซตแล้วเริ่มพัก → ไม่มีการสร้าง <audio>/AudioContext/เล่นเสียงใด ๆ', au(pg) == {'plays': 0, 'ctx': 0, 'audioEls': 0}, au(pg))
        pg.evaluate("GL.rest.stop(); GL.rest.start(2)"); pg.wait_for_timeout(2700)
        check('T2 พักครบ → เงียบ (ไม่มีเสียง) แต่แถบขึ้น “พร้อมเล่น”', au(pg)['plays'] == 0 and 'พร้อม' in pg.inner_text('#rest-bar'), (au(pg), pg.inner_text('#rest-bar')))
        check('T3 ไม่มีไฟล์ chime/เสียงถูกโหลด', not [u for u in reqs if 'chime' in u or u.endswith('.wav') or u.endswith('.mp3')], reqs[:5])
        check('T4 ไม่มีฟังก์ชันปลดล็อกเสียงเหลืออยู่ (GL.rest.unlock)', pg.evaluate("() => typeof GL.rest.unlock") == 'undefined')
        pg.evaluate("GL.rest.stop(); GL.rest.start(60); GL.state.rest.endsAt = Date.now() - 42000; GL.rest.refresh()")
        pg.wait_for_timeout(300)
        bar = pg.inner_text('#rest-bar')
        check('T5 กลับเข้าแอปหลังครบนานแล้ว → “ครบแล้ว 42 วินาทีที่แล้ว”', 'ครบแล้ว 4' in bar and 'วินาทีที่แล้ว' in bar, bar)
        pg.evaluate("GL.rest.stop(); GL.rest.start(60); GL.state.rest.endsAt = Date.now() - 125000; GL.rest.refresh()"); pg.wait_for_timeout(200)
        check('T6 ครบเมื่อ 2 นาที 5 วินาทีก่อน → แสดงเป็นนาที', '2 นาที 5 วิ' in pg.inner_text('#rest-bar'), pg.inner_text('#rest-bar'))
        pg.evaluate("GL.rest.stop(); GL.rest.start(60); GL.state.rest.endsAt = Date.now() - 1000000; GL.rest.refresh()"); pg.wait_for_timeout(200)
        check('T7 ครบเกิน 15 นาที → ซ่อนเงียบ ๆ', not pg.locator('#rest-bar').is_visible())
        go_home(pg); pg.click('[data-action=open-settings]'); pg.wait_for_selector('.rest-presets')
        txt = pg.inner_text('#view')
        check('T8 ตั้งค่า: ไม่มีคำว่า เสียง/เตือนด้วยเสียง', 'เสียง' not in txt, txt[:200])
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z5 ไม่มี error ใน console', not errs, errs)
        b.close()
    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

if __name__ == '__main__':
    main()
