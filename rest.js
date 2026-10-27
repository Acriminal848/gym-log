/* rest.js — ตัวจับเวลาพัก, เสียงเตือน, และการเปิดจอค้างระหว่างจด (Wake Lock)
 *
 * - เวลาพักเริ่มนับเมื่อยืนยันเซต (ค่ากลางอยู่ใน "ตั้งค่า" ตั้งต่อท่าได้ในหน้าแก้ไขท่า)
 * - คำนวณจากเวลาจริง (endsAt) ไม่ใช่การนับถอยหลังทีละวินาที จึงไม่เพี้ยนถ้าสลับแอป/จอหน่วงไป
 * - ทุกอย่างอยู่ในหน่วยความจำ ไม่เขียนลงฐานข้อมูล จึงไม่กระทบข้อมูลที่บันทึกไว้
 * - เสียง/Wake Lock ไม่รองรับในบางเครื่อง: ล้มเหลวเงียบ ๆ แอปยังใช้ได้ปกติ
 */
(function () {
  'use strict';

  const GL = window.GL, state = GL.state;
  const bar = document.getElementById('rest-bar');
  const live = document.getElementById('rest-live');
  let tickId = null, audioCtx = null, wakeLock = null;

  bar.innerHTML =
    '<div class="rb-ctl">' +
      '<button type="button" class="rb-skip" data-action="rest-skip">ข้าม</button>' +
      '<button type="button" data-action="rest-minus" aria-label="ลดเวลาพัก 15 วินาที">−15</button>' +
      '<button type="button" data-action="rest-plus" aria-label="เพิ่มเวลาพัก 15 วินาที">+15</button>' +
    '</div>' +
    '<div class="rb-read"><span class="rb-lbl">พัก</span><span class="rb-time" id="rb-time">0:00</span></div>' +
    '<div class="rb-prog" aria-hidden="true"><i id="rb-fill"></i></div>';
  const elTime = bar.querySelector('#rb-time'), elLbl = bar.querySelector('.rb-lbl'), elFill = bar.querySelector('#rb-fill');

  /* ---------- เสียง ---------- */
  function unlockAudio() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* ไม่มีเสียงก็ไม่เป็นไร */ }
  }
  function beep() {
    if (!audioCtx || GL.setting('restSound') === false) return;
    try {
      const t0 = audioCtx.currentTime;
      [0, 0.22].forEach(function (off) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.18);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + off); o.stop(t0 + off + 0.2);
      });
    } catch (e) { /* ignore */ }
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
      elTime.textContent = GL.fmtClock(rem);
      elFill.style.width = Math.max(0, Math.min(100, (1 - rem / r.total) * 100)) + '%';
    } else {
      bar.classList.add('done');
      elLbl.textContent = 'พักครบแล้ว';
      elTime.textContent = '+' + GL.fmtClock(-rem);
      elFill.style.width = '100%';
      if (!r.announced) {
        r.announced = true;
        beep();
        if (live) live.textContent = 'พักครบแล้ว';
      }
    }
  }
  function startTick() { if (!tickId) tickId = setInterval(update, 250); }
  function stopTick() { if (tickId) { clearInterval(tickId); tickId = null; } }

  GL.rest = {
    unlock: unlockAudio,
    start: function (seconds) {
      if (!(seconds > 0)) return;
      if (live) live.textContent = '';
      state.rest = { total: seconds, endsAt: Date.now() + seconds * 1000, announced: false };
      startTick(); update();
    },
    adjust: function (delta) {
      const r = state.rest;
      if (!r) return;
      const rem = r.endsAt - Date.now();
      if (rem <= 0) {
        if (delta > 0) { r.endsAt = Date.now() + delta * 1000; r.total = delta; r.announced = false; }
      } else {
        r.endsAt = Math.max(Date.now(), r.endsAt + delta * 1000);
        r.total = Math.max(5, r.total + delta);
        r.announced = r.endsAt <= Date.now() ? r.announced : false;
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

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { update(); syncWake(); }
  });
})();
