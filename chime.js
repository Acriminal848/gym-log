/* chime.js — สร้างไฟล์เสียง WAV เองในเครื่อง (ไม่ดาวน์โหลดอะไร) ฟังก์ชันล้วน ทดสอบด้วย node ได้
 *
 * ใช้ 2 แบบ:
 *  1) chime()            = เสียงเตือน 3 โน้ตขึ้น × 2 รอบ (~2 วินาที) เล่นผ่าน <audio> เมื่อพักครบ (ดังกว่าเสียง Web Audio เดิม และไม่โดนสวิตช์เงียบของ iPhone)
 *  2) restTrack(sec)     = “เงียบ sec วินาที แล้วตามด้วยเสียงเตือน” เป็นไฟล์เดียว — เล่นตั้งแต่เริ่มพัก ให้ iOS เล่นต่อได้แม้ล็อกจอ/สลับแอป
 *                           (โหมดทดลอง ปิดไว้เป็นค่าเริ่มต้น) เสียงเตือนจึงไม่ต้องพึ่ง JavaScript ที่ iOS หยุดไว้ตอนล็อกจอ
 * 8000 Hz · 16 bit · mono: โน้ตสูงสุด 1760 Hz ต่ำกว่าครึ่งของ 8000 จึงไม่เพี้ยน และไฟล์ไม่ใหญ่ (นาทีละ ~0.96 MB)
 */
(function (global) {
  'use strict';
  const RATE = 8000;
  const MAX_SEC = 420;                 // เกินนี้ไม่ทำไฟล์ยาว (ใช้เสียงเตือนปกติตอนกลับเข้าแอป)
  const NOTES = [880, 1318.5, 1760];   // A5 · E6 · A6
  const NOTE_SEC = 0.16, GAP_SEC = 0.04, ROUND_GAP_SEC = 0.28;

  function chimeSamples() {
    const out = [];
    for (let round = 0; round < 2; round++) {
      NOTES.forEach(function (f) {
        const n = Math.round(NOTE_SEC * RATE);
        for (let i = 0; i < n; i++) {
          const t = i / RATE;
          const env = Math.min(1, i / (0.01 * RATE)) * Math.exp(-3.2 * (i / n));   // เปิดเร็ว หายค่อย ๆ (ไม่มีเสียงแตก)
          out.push(0.95 * env * Math.sin(2 * Math.PI * f * t));
        }
        for (let i = 0; i < Math.round(GAP_SEC * RATE); i++) out.push(0);
      });
      for (let i = 0; i < Math.round(ROUND_GAP_SEC * RATE); i++) out.push(0);
    }
    return out;
  }

  function wavBytes(samplesFloat, leadSilenceSec) {
    const lead = Math.max(0, Math.round((leadSilenceSec || 0) * RATE));
    const total = lead + samplesFloat.length;
    const buf = new Uint8Array(44 + total * 2);
    const dv = new DataView(buf.buffer);
    function str(o, s) { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + total * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, RATE, true); dv.setUint32(28, RATE * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, total * 2, true);
    for (let i = 0; i < samplesFloat.length; i++) {
      const s = Math.max(-1, Math.min(1, samplesFloat[i]));
      dv.setInt16(44 + (lead + i) * 2, Math.round(s * 32767), true);
    }
    return buf;
  }

  function chime() { return wavBytes(chimeSamples(), 0); }
  function silence(sec) { return wavBytes([], Math.max(0.1, sec)); }
  // เงียบ sec วินาที (ปัดเป็นจำนวนเต็มวินาทีไม่ต่ำกว่า 1) แล้วเสียงเตือน; เกิน MAX_SEC → null
  function restTrack(sec) {
    const s = Math.max(1, Math.round(sec));
    if (s > MAX_SEC) return null;
    return wavBytes(chimeSamples(), s);
  }
  function chimeSeconds() { return chimeSamples().length / RATE; }

  const api = { chime: chime, silence: silence, restTrack: restTrack, chimeSeconds: chimeSeconds, RATE: RATE, MAX_SEC: MAX_SEC };
  global.GymChime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
