#!/usr/bin/env python3
"""ทดสอบ 1.9: เสียง timer แบบ A+B — เสียงเตือนผ่าน <audio> · โหมดทดลอง (ไฟล์เงียบ→เสียงเตือน) · ข้อความ “ครบแล้ว X ที่แล้ว”
หมายเหตุ: ทดสอบในเบราว์เซอร์จำลอง — เสียงจริงตอนล็อกจอ/สลับแอป/สวิตช์เงียบของ iPhone ต้องลองบนเครื่องจริง
รัน: python3 tests/e2e_v19c.py http://localhost:8765/gym-log/"""
import sys
sys.argv = sys.argv[:2] if len(sys.argv) > 1 else sys.argv
from e2e_v14_lib import *  # noqa
import e2e_v14_lib as L

SPY = """() => {
  window.__au = { plays: [], pauses: 0 };
  const P = HTMLMediaElement.prototype.play, Pa = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play = function () { window.__au.plays.push(this.src); return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () { window.__au.pauses++; };
}"""
def spy_reset(pg): pg.evaluate("() => { window.__au.plays = []; window.__au.pauses = 0; }")
def plays(pg): return pg.evaluate("() => window.__au.plays.slice()")
def blob_size(pg, url): return pg.evaluate("async u => (await (await fetch(u)).blob()).size", url)

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = new_page(b)
        pg.evaluate(SPY)
        start_plan(pg, 'Push'); pg.wait_for_selector('.target')
        # ===== A: เสียงเตือนปกติผ่าน <audio>
        spy_reset(pg)
        pg.evaluate("GL.rest.start(2)"); pg.wait_for_timeout(2700)
        pl = plays(pg)
        check('T1 พักครบ (โหมดปกติ) → เล่นเสียงเตือนผ่าน <audio> 1 ครั้ง (blob)', len(pl) == 1 and pl[0].startswith('blob:'), pl)
        sz = blob_size(pg, pl[0]) if pl else 0
        check('T2 ไฟล์เสียงเตือนเป็น WAV ยาว ~1.8 วินาที (8kHz 16bit)', 26000 < sz < 31000, sz)
        pg.evaluate("GL.rest.stop()")
        # ปิดเสียง → ไม่เล่น
        pg.evaluate("GL.state.settings.restSound = false"); spy_reset(pg)
        pg.evaluate("GL.rest.start(1)"); pg.wait_for_timeout(1700)
        check('T3 ปิด “เสียงเตือน” → ไม่เล่นเสียง', len(plays(pg)) == 0, plays(pg))
        pg.evaluate("GL.rest.stop(); delete GL.state.settings.restSound")
        # ===== ข้อความ “ครบแล้ว X ที่แล้ว”
        spy_reset(pg)
        pg.evaluate("GL.rest.start(60); GL.state.rest.endsAt = Date.now() - 42000; GL.rest.refresh()")
        pg.wait_for_timeout(300)
        bar = pg.inner_text('#rest-bar')
        check('T4 กลับเข้าแอปหลังครบนานแล้ว → ข้อความ “ครบแล้ว 42 วินาทีที่แล้ว” + พร้อมเล่น', 'ครบแล้ว 4' in bar and 'วินาทีที่แล้ว' in bar and 'พร้อมเล่น' in bar, bar)
        check('T5 กรณีนั้นไม่เล่นเสียงเตือนซ้ำ (ช้าไปแล้ว) และประกาศ screen reader', len(plays(pg)) == 0 and 'ที่แล้ว' in pg.inner_text('#rest-live'), (plays(pg), pg.inner_text('#rest-live')))
        pg.evaluate("GL.rest.stop(); GL.rest.start(60); GL.state.rest.endsAt = Date.now() - 125000; GL.rest.refresh()"); pg.wait_for_timeout(200)
        check('T6 ครบเมื่อ 2 นาที 5 วินาทีก่อน → แสดงเป็นนาที', '2 นาที 5 วิ' in pg.inner_text('#rest-bar'), pg.inner_text('#rest-bar'))
        pg.evaluate("GL.rest.stop(); GL.rest.start(60); GL.state.rest.endsAt = Date.now() - 1000000; GL.rest.refresh()"); pg.wait_for_timeout(200)
        check('T7 ครบเกิน 15 นาที → ซ่อนเงียบ ๆ', not pg.locator('#rest-bar').is_visible())
        # ===== โหมดทดลอง
        go_home(pg); pg.click('[data-action=open-settings]'); pg.wait_for_selector('.rest-presets')
        sw = pg.locator('[data-action=set-toggle][data-key=restKeepAlive]')
        check('T8 ตั้งค่า: มีสวิตช์ “เตือนด้วยเสียงแม้ล็อกจอ (ทดลอง)” และปิดอยู่เป็นค่าเริ่มต้น', sw.count() == 1 and (sw.get_attribute('aria-checked') in ('false', None) or sw.get_attribute('aria-pressed') in ('false', None)), sw.get_attribute('aria-checked'))
        check('T8a ยังไม่เคยเขียนค่าลงฐานข้อมูลจนกว่าจะกดเอง', 'restKeepAlive' not in {r['key'] for r in db(pg, 'settings')})
        sw.click(); pg.wait_for_timeout(250)
        check('T9 เปิดแล้วเก็บ restKeepAlive=true', {r['key']: r['value'] for r in db(pg, 'settings')}.get('restKeepAlive') is True)
        pg.evaluate("document.querySelector('.back').click()") if False else None
        go_home(pg)
        start_plan(pg, 'Push'); pg.wait_for_selector('.target'); spy_reset(pg)
        pg.evaluate("GL.rest.start(30)"); pg.wait_for_timeout(200)
        pl = plays(pg)
        sz = blob_size(pg, pl[-1]) if pl else 0
        exp = (30 + 1.76) * 16000
        check('T10 เปิดโหมดทดลอง: เริ่มพัก 30 วิ → เล่นไฟล์เดียว “เงียบ 30 วิ + เสียงเตือน” ทันที', len(pl) == 1 and abs(sz - exp) < 6000, (len(pl), sz, exp))
        pg.evaluate("GL.rest.adjust(15)"); pg.wait_for_timeout(200)
        pl2 = plays(pg)
        sz2 = blob_size(pg, pl2[-1]) if len(pl2) > 1 else 0
        check('T11 กด +15 → สร้างไฟล์ใหม่ให้ตรงเวลาที่เหลือ (ยาวขึ้น ~15 วิ)', len(pl2) == 2 and 13 * 16000 < sz2 - sz < 17 * 16000, (len(pl2), sz, sz2))
        pg.evaluate("GL.rest.start(2)"); pg.wait_for_timeout(2600)
        pl3 = plays(pg)
        check('T12 พักครบตอนอยู่ในแอป (โหมดทดลอง): ไม่เล่นเสียงเตือนซ้ำ (ไฟล์เล่นอยู่แล้ว)', len(pl3) == len(pl2) + 1, (len(pl2), len(pl3)))
        check('T12a แถบยังขึ้น “พร้อมเล่น” ตามปกติ', 'พร้อมเล่น' in pg.inner_text('#rest-bar'))
        pg.evaluate("GL.rest.start(20)"); pg.wait_for_timeout(100); spy_reset(pg)
        pg.click('[data-action=rest-skip]'); pg.wait_for_timeout(150)
        check('T13 กดข้ามพัก → หยุดไฟล์เสียง (pause)', pg.evaluate("window.__au.pauses") >= 1)
        spy_reset(pg); pg.evaluate("GL.rest.start(600)"); pg.wait_for_timeout(100)
        check('T14 พักนานเกิน 7 นาที → ไม่ทำไฟล์ยาว (ไม่เล่น) ใช้เสียงปกติตอนกลับเข้าแอป', len(plays(pg)) == 0, plays(pg))
        pg.evaluate("GL.rest.stop()")
        # ส่งออก/ตรวจสอบ
        bk = pg.evaluate("async () => JSON.stringify(await GymStorage.exportAll())") if pg.evaluate("typeof GymStorage.exportAll") == 'function' else None
        if bk:
            ok = pg.evaluate("s => GymStorage.validateBackup(JSON.parse(s)).ok", bk)
            check('T15 ส่งออกข้อมูลที่มี restKeepAlive แล้วตรวจสอบผ่าน และค่ายังอยู่', ok and '"restKeepAlive":true' in bk.replace(' ', ''), ok)
        errs = [e for e in pg.errors if 'favicon' not in e]
        check('Z5 ไม่มี error ใน console', not errs, errs)
        b.close()
    print('\n%d/%d ผ่าน' % (L.passed, L.passed + L.failed))
    if L.failed:
        print('ไม่ผ่าน:', L.fails); sys.exit(1)

if __name__ == '__main__':
    main()
