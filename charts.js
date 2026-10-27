/* charts.js — วาดกราฟเส้นแนวโน้มเป็น SVG (ฟังก์ชันล้วน ไม่แตะ DOM/ฐานข้อมูล ทดสอบด้วย node ได้)
 *
 * หลักการ (ตามแนวทางออกแบบ chart): เส้นเดียว สีเข้ม · แกน X ตามวันที่จริง (ช่วงห่างไม่เท่ากันก็เห็นตามจริง)
 * · จุดสถิติใหม่ (PR) ใช้ “รูปเพชร + ตัวอักษร PR” ไม่ใช้สีอย่างเดียว · มีเส้นตารางบางและตัวเลขแกน Y 3 ค่า
 * · มี aria-label สรุปให้ screen reader และมีตาราง/รายการตัวเลขอยู่ใต้กราฟในหน้าจอเสมอ
 */
(function (global) {
  'use strict';

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function parseKey(key) { const p = key.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]).getTime(); }
  function fmtNum(n) { return String(Math.round(n * 100) / 100); }

  // ช่วงแกน Y ที่ปัดเป็นเลขกลม 3 เส้น (ล่าง/กลาง/บน)
  function niceRange(min, max) {
    if (!isFinite(min) || !isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 0.5, 1] };
    if (max - min < 1e-9) { const d = Math.max(Math.abs(max) * 0.1, 1); min -= d; max += d; }
    const span = max - min;
    const raw = span / 2;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const steps = [1, 2, 2.5, 5, 10];
    let step = mag;
    for (let i = 0; i < steps.length; i++) { step = steps[i] * mag; if (step >= raw) break; }
    const lo = Math.floor(min / step) * step;
    let hi = lo + step * 2;
    if (hi < max) hi = Math.ceil(max / step) * step;
    const mid = (lo + hi) / 2;
    return { lo: lo, hi: hi, ticks: [lo, mid, hi] };
  }

  /* points: [{ date:'YYYY-MM-DD', value:Number, pr:Boolean }] เก่า → ใหม่ (อย่างน้อย 2 จุด)
   * opts: { width, height, unit, label (ชื่อกราฟสำหรับ aria), fmtDate(key) } */
  function line(points, opts) {
    opts = opts || {};
    const W = opts.width || 340, H = opts.height || 200, unit = opts.unit || '';
    const fmtDate = opts.fmtDate || function (k) { return k; };
    if (!points || points.length < 2) return '';
    const pad = { l: 44, r: 18, t: 22, b: 30 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const vals = points.map(function (p) { return p.value; });
    const r = niceRange(Math.min.apply(null, vals), Math.max.apply(null, vals));
    const t0 = parseKey(points[0].date), t1 = parseKey(points[points.length - 1].date);
    function X(p, i) {
      if (t1 === t0) return pad.l + (iw * i) / (points.length - 1);
      return pad.l + ((parseKey(p.date) - t0) / (t1 - t0)) * iw;
    }
    function Y(v) { return pad.t + ih - ((v - r.lo) / (r.hi - r.lo)) * ih; }

    let g = '';
    r.ticks.forEach(function (tv) {
      const y = Y(tv);
      g += '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" class="ch-grid"/>' +
        '<text x="' + (pad.l - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" class="ch-ax">' + esc(fmtNum(tv)) + '</text>';
    });
    const first = points[0], last = points[points.length - 1];
    g += '<text x="' + pad.l + '" y="' + (H - 8) + '" text-anchor="start" class="ch-ax">' + esc(fmtDate(first.date)) + '</text>' +
      '<text x="' + (W - pad.r) + '" y="' + (H - 8) + '" text-anchor="end" class="ch-ax">' + esc(fmtDate(last.date)) + '</text>';

    const d = points.map(function (p, i) { return (i ? 'L' : 'M') + X(p, i).toFixed(1) + ' ' + Y(p.value).toFixed(1); }).join(' ');
    g += '<path d="' + d + '" class="ch-line"/>';
    points.forEach(function (p, i) {
      const x = X(p, i), y = Y(p.value);
      if (p.pr) {
        g += '<path d="M' + x.toFixed(1) + ' ' + (y - 7).toFixed(1) + ' l7 7 l-7 7 l-7 -7 z" class="ch-pr"/>';
      } else {
        g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" class="ch-dot"/>';
      }
    });
    // ป้ายค่าล่าสุด + ป้าย PR (ตัวอักษร ไม่พึ่งสีอย่างเดียว)
    const lx = X(last, points.length - 1), ly = Y(last.value);
    g += '<text x="' + Math.min(lx, W - pad.r).toFixed(1) + '" y="' + Math.max(ly - 12, 12).toFixed(1) + '" text-anchor="end" class="ch-val">' + esc(fmtNum(last.value)) + '</text>';
    points.forEach(function (p, i) {
      if (!p.pr || i === points.length - 1) return;
      g += '<text x="' + X(p, i).toFixed(1) + '" y="' + (Y(p.value) - 11).toFixed(1) + '" text-anchor="middle" class="ch-prt">PR</text>';
    });
    if (last.pr) g += '<text x="' + (lx - 2).toFixed(1) + '" y="' + Math.max(ly - 24, 10).toFixed(1) + '" text-anchor="end" class="ch-prt">PR</text>';

    const prN = points.filter(function (p) { return p.pr; }).length;
    const label = (opts.label || 'แนวโน้ม') + ': จาก ' + fmtNum(first.value) + ' เป็น ' + fmtNum(last.value) + ' ' + unit + ' ใน ' + points.length + ' ครั้ง' + (prN ? ' · สถิติใหม่ ' + prN + ' ครั้ง' : '');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '" preserveAspectRatio="xMidYMid meet"><title>' + esc(label) + '</title>' + g + '</svg>';
  }

  const api = { line: line, niceRange: niceRange };
  global.GymCharts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
