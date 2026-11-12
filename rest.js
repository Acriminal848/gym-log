/* rest.js — ตัวจับเวลาพัก, เสียงเตือน, และการเปิดจอค้างระหว่างจด (Wake Lock)
 *
 * - เวลาพักเริ่มนับเมื่อยืนยันเซต (ค่ากลางอยู่ใน "ตั้งค่า" ตั้งต่อท่าได้ในหน้าแก้ไขท่า)
 * - คำนวณจากเวลาจริง (endsAt) ไม่ใช่การนับถอยหลังทีละวินาที จึงไม่เพี้ยนถ้าสลับแอป/จอหน่วงไป
 * - ทุกอย่างอยู่ในหน่วยความจำ ไม่เขียนลงฐานข้อมูล จึงไม่กระทบข้อมูลที่บันทึกไว้
 * - 2.1: ไม่มีเสียงใดทั้งสิ้น (เดิมเสียงเตือนทำให้ iOS ตัดเพลงที่เปิดอยู่) — พักครบแล้วแสดงข้อความ “พร้อมเล่น”
 *   และถ้ากลับเข้าแอปทีหลังจะบอกว่า “ครบแล้ว X ที่แล้ว” · Wake Lock ไม่รองรับ = ล้มเหลวเงียบ ๆ
 */
(function () {
  'use strict';

  const GL = window.GL, state = GL.state;
  const bar = document.getElementById('rest-bar');
  const live = document.getElementById('rest-live');
  const AUTO_HIDE_MS = 6000;     // ซ่อนแถบเองหลังพักครบ
  let tickId = null, wakeLock = null;

  bar.innerHTML =
    '<div class="rb-ctl">' +
      '<button type="button" class="rb-skip" data-action="rest-skip">ข้าม</button>' +
      '<button type="button" data-action="rest-minus" aria-label="ลดเวลาพัก 15 วินาที">−15</button>' +
      '<button type="button" data-action="rest-plus" aria-label="เพิ่มเวลาพัก 15 วินาที">+15</button>' +
    '</div>' +
    '<div class="rb-read"><span class="rb-lbl">พัก</span><span class="rb-time" id="rb-time">0:00</span></div>' +
    '<div class="rb-prog" aria-hidden="true"><i id="rb-fill"></i></div>';
  const elSkip = bar.querySelector('.rb-skip');
  const elTime = bar.querySelector('#rb-time'), elLbl = bar.querySelector('.rb-lbl'), elFill = bar.querySelector('#rb-fill');

  function agoText(sec) {
    if (sec < 60) return sec + ' วินาที';
    const m = Math.floor(sec / 60), r = sec % 60;
    return m + ' นาที' + (r ? ' ' + r + ' วิ' : '');
  }

  /* ---------- ตัวจับเวลา ---------- */
  function remainingSec(r) { return Math.ceil((r.endsAt - Date.now()) / 1000); }

  function update() {
    const r = state.rest;
    const show = !!r && GL.inSession();
    bar.hidden = !show;
    document.body.classList.toggle('resting', show);
    if (!r) { stopTick(); return; }
    if (!show) return;            // ยังนับต่อ แต่ซ่อนเมื่อไม่ได้อยู่หน้าจด
    const rem = remainingSec(r);
    if (rem > 0) {
      bar.classList.remove('done');
      elLbl.textContent = 'พัก';
      elSkip.textContent = 'ข้าม';
      elTime.textContent = GL.fmtClock(rem);
      elFill.style.width = Math.max(0, Math.min(100, (1 - rem / r.total) * 100)) + '%';
    } else {
      /* 1.8: พักครบแล้ว "หยุดนับ" — ไม่นับเวลาเกิน (ไม่มีประโยชน์ตอนฝึก) แสดง “พร้อมเล่น” นิ่ง ๆ แล้วซ่อนเอง
         1.9: ถ้าครบตอนแอปไม่ได้อยู่หน้าจอ (ล็อกจอ/สลับแอป) แล้วเพิ่งกลับมา → บอกว่า “ครบแล้ว X ที่แล้ว” แทนการเงียบหรือเสียงเตือนช้า */
      const over = Math.floor((Date.now() - r.endsAt) / 1000);
      bar.classList.add('done');
      elLbl.textContent = '';
      elSkip.textContent = 'ปิด';
      elTime.textContent = 'พร้อมเล่น';
      elFill.style.width = '100%';
      if (!r.announced) {
        if (over >= 3 && document.visibilityState === 'visible') {
          if (over > 900) { GL.rest.stop(); return; }                 // นานเกิน 15 นาที ไม่มีประโยชน์แล้ว
          r.announced = true; r.doneAt = Date.now(); r.late = over;
        } else if (over >= 0) {
          r.announced = true; r.doneAt = Date.now();
        }
        if (r.announced && live) live.textContent = r.late ? 'พักครบแล้ว ' + agoText(r.late) + 'ที่แล้ว พร้อมเล่น' : 'พักครบแล้ว พร้อมเล่น';
      }
      if (r.late) elLbl.textContent = 'ครบแล้ว ' + agoText(r.late) + 'ที่แล้ว';
      if (Date.now() - (r.doneAt || Date.now()) >= (r.late ? AUTO_HIDE_MS + 4000 : AUTO_HIDE_MS)) { GL.rest.stop(); return; }
    }
  }
  function startTick() { if (!tickId) tickId = setInterval(update, 250); }
  function stopTick() { if (tickId) { clearInterval(tickId); tickId = null; } }

  GL.rest = {
    start: function (seconds) {
      if (!(seconds > 0)) return;
      if (live) live.textContent = '';
      state.rest = { total: seconds, endsAt: Date.now() + seconds * 1000, announced: false, doneAt: null };
      startTick(); update();
    },
    adjust: function (delta) {
      const r = state.rest;
      if (!r) return;
      const rem = r.endsAt - Date.now();
      if (rem <= 0) {
        if (delta > 0) { r.endsAt = Date.now() + delta * 1000; r.total = delta; r.announced = false; r.doneAt = null; r.late = null; }
      } else {
        r.endsAt = Math.max(Date.now(), r.endsAt + delta * 1000);
        r.total = Math.max(5, r.total + delta);
        if (r.endsAt > Date.now()) { r.announced = false; r.doneAt = null; r.late = null; }
      }
      update();
    },
    stop: function () { state.rest = null; if (live) live.textContent = ''; update(); },
    refresh: update
  };

  /* ---------- เปิดจอค้างระหว่างจด ---------- */
  async function syncWake() {
    const want = GL.inSession() && GL.setting('keepAwake') !== false && document.visibilityState === 'visible';
    try {
      if (want && !wakeLock && navigator.wakeLock && navigator.wakeLock.request) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', function () { wakeLock = null; });
      } else if (!want && wakeLock) {
        const w = wakeLock; wakeLock = null; await w.release();
      }
    } catch (e) { wakeLock = null; }
  }
  GL.wake = { sync: syncWake };

  // แตะช่องกรอกหลังพักครบ = พร้อมเล่นแล้ว → ซ่อนแถบทันที (ไม่ต้องกดข้าม)
  document.addEventListener('focusin', function (e) {
    const r = state.rest;
    if (r && r.announced && e.target && e.target.classList && e.target.classList.contains('st-in')) GL.rest.stop();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { update(); syncWake(); }
  });
})();
