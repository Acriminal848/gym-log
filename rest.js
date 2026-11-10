/* rest.js — ตัวจับเวลาพัก, เสียงเตือน, และการเปิดจอค้างระหว่างจด (Wake Lock)
 *
 * - เวลาพักเริ่มนับเมื่อยืนยันเซต (ค่ากลางอยู่ใน "ตั้งค่า" ตั้งต่อท่าได้ในหน้าแก้ไขท่า)
 * - คำนวณจากเวลาจริง (endsAt) ไม่ใช่การนับถอยหลังทีละวินาที จึงไม่เพี้ยนถ้าสลับแอป/จอหน่วงไป
 * - ทุกอย่างอยู่ในหน่วยความจำ ไม่เขียนลงฐานข้อมูล จึงไม่กระทบข้อมูลที่บันทึกไว้
 * - เสียง/Wake Lock ไม่รองรับในบางเครื่อง: ล้มเหลวเงียบ ๆ แอปยังใช้ได้ปกติ
 * - 1.9: เสียงเตือนเล่นผ่าน <audio> (3 โน้ต ดังชัด ไม่โดนสวิตช์เงียบ) · “พักครบแล้ว X วินาทีที่แล้ว” เมื่อกลับเข้าแอป
 *   · โหมดทดลอง restKeepAlive: เล่นไฟล์ “เงียบ → เสียงเตือน” ตั้งแต่เริ่มพัก เพื่อให้ iOS เล่นเสียงเตือนต่อได้แม้ล็อกจอ (ต้องทดสอบบนเครื่องจริง)
 */
(function () {
  'use strict';

  const GL = window.GL, state = GL.state;
  const bar = document.getElementById('rest-bar');
  const live = document.getElementById('rest-live');
  const AUTO_HIDE_MS = 6000;     // ซ่อนแถบเองหลังพักครบ
  let tickId = null, audioCtx = null, wakeLock = null;

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

  /* ---------- เสียง ---------- */
  let audioEl = null, trackUrl = null, chimeUrl = null, silentUrl = null, audioOk = false, trackOn = false;
  function mkUrl(bytes) { return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })); }
  function el() {
    if (!audioEl) {
      audioEl = new Audio(); audioEl.preload = 'auto'; audioEl.setAttribute('playsinline', '');
      audioEl.addEventListener('ended', function () { trackOn = false; clearTrackUrl(); });
    }
    return audioEl;
  }
  function clearTrackUrl() { if (trackUrl) { try { URL.revokeObjectURL(trackUrl); } catch (e) { /* ignore */ } trackUrl = null; } }
  function setMedia(on) {
    try {
      if (!('mediaSession' in navigator)) return;
      if (on) {
        navigator.mediaSession.metadata = new window.MediaMetadata({ title: 'พักระหว่างเซต', artist: 'Gym Log' });
        navigator.mediaSession.playbackState = 'playing';
        ['play', 'pause', 'stop'].forEach(function (a) { try { navigator.mediaSession.setActionHandler(a, function () { if (a !== 'play') GL.rest.stop(); }); } catch (e) { /* ignore */ } });
      } else { navigator.mediaSession.playbackState = 'none'; navigator.mediaSession.metadata = null; }
    } catch (e) { /* ignore */ }
  }
  // ต้องเรียกจากการแตะของผู้ใช้ (กดยืนยันเซต) เพื่อให้ iOS ยอมให้เล่นเสียงทีหลังได้
  function unlockAudio() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* ไม่มีเสียงก็ไม่เป็นไร */ }
    try {
      if (!audioOk && window.GymChime && !trackOn) {
        if (!silentUrl) silentUrl = mkUrl(window.GymChime.silence(0.2));
        const a = el(); a.src = silentUrl;
        const p = a.play();
        if (p && p.then) p.then(function () { audioOk = true; }).catch(function () { /* ผู้ใช้ยังไม่ได้แตะ/ไม่รองรับ */ });
        else audioOk = true;
      }
    } catch (e) { /* ignore */ }
  }
  // สำรอง: เสียงสังเคราะห์ด้วย Web Audio (ใช้เมื่อเล่นไฟล์เสียงไม่ได้)
  function webBeep() {
    if (!audioCtx) return;
    try {
      const t0 = audioCtx.currentTime;
      [880, 1318.5, 1760].forEach(function (f, i) {
        const off = i * 0.2, o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.6, t0 + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.28);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + off); o.stop(t0 + off + 0.3);
      });
    } catch (e) { /* ignore */ }
  }
  function beep() {
    if (GL.setting('restSound') === false) return;
    if (trackOn) return;                  // โหมดทดลอง: ไฟล์เสียงที่เล่นอยู่จะส่งเสียงเตือนเอง ไม่ซ้ำ
    try {
      if (window.GymChime) {
        if (!chimeUrl) chimeUrl = mkUrl(window.GymChime.chime());
        const a = el(); a.src = chimeUrl; a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(webBeep);
        return;
      }
    } catch (e) { /* ตกไปใช้ Web Audio */ }
    webBeep();
  }
  // โหมดทดลอง: เตรียมไฟล์ “เงียบ → เสียงเตือน” ให้ตรงกับเวลาที่เหลือ แล้วเล่นทันที (ไฟล์เดียวจบ ไม่พึ่ง JavaScript ตอนล็อกจอ)
  function startTrack(remainSec) {
    stopTrack();
    if (!GL.inSession() || GL.setting('restKeepAlive') !== true || GL.setting('restSound') === false || !window.GymChime || !(remainSec > 0)) return;
    try {
      const bytes = window.GymChime.restTrack(remainSec);
      if (!bytes) return;                 // นานเกินไป → ไม่ทำไฟล์ (ใช้เสียงปกติตอนกลับเข้าแอป)
      trackUrl = mkUrl(bytes);
      const a = el(); a.src = trackUrl; a.currentTime = 0;
      trackOn = true;
      const p = a.play();
      if (p && p.then) p.then(function () { setMedia(true); }).catch(function () { trackOn = false; clearTrackUrl(); });
      else setMedia(true);
    } catch (e) { trackOn = false; }
  }
  function stopTrack() {
    if (!audioEl) { trackOn = false; return; }
    if (trackOn) { try { audioEl.pause(); } catch (e) { /* ignore */ } setMedia(false); }
    trackOn = false; clearTrackUrl();
  }
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
          stopTrack();
        } else if (over >= 0) {
          r.announced = true; r.doneAt = Date.now();
          beep();
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
    unlock: unlockAudio,
    start: function (seconds) {
      if (!(seconds > 0)) return;
      if (live) live.textContent = '';
      state.rest = { total: seconds, endsAt: Date.now() + seconds * 1000, announced: false, doneAt: null };
      startTrack(seconds);
      startTick(); update();
    },
    adjust: function (delta) {
      const r = state.rest;
      if (!r) return;
      const rem = r.endsAt - Date.now();
      if (rem <= 0) {
        if (delta > 0) { r.endsAt = Date.now() + delta * 1000; r.total = delta; r.announced = false; r.doneAt = null; r.late = null; startTrack(delta); }
      } else {
        r.endsAt = Math.max(Date.now(), r.endsAt + delta * 1000);
        r.total = Math.max(5, r.total + delta);
        if (r.endsAt > Date.now()) { r.announced = false; r.doneAt = null; r.late = null; startTrack(Math.ceil((r.endsAt - Date.now()) / 1000)); }
      }
      update();
    },
    stop: function () { state.rest = null; stopTrack(); if (live) live.textContent = ''; update(); },
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
