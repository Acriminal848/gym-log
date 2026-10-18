/* summary.js — สรุปความก้าวหน้า (คำนวณล้วน ๆ ไม่แตะ DOM/ฐานข้อมูล)
 *
 * กติกา:
 *  - ใช้เฉพาะ workout ที่จบแล้ว และเฉพาะเซต working ที่ทำเสร็จจริง (ข้าม/warm-up ไม่นับ)
 *  - สรุป "ต่อท่า" เท่านั้น ไม่รวม volume ข้ามท่าเป็นคะแนนรวม
 *  - ท่าเดียวกันแต่อุปกรณ์/วิธีนับน้ำหนักต่างกัน แยกเป็นคนละกลุ่ม ไม่รวมกัน
 *  - volume load = น้ำหนัก × reps ตามวิธีนับน้ำหนักของกลุ่มนั้น (ระบุให้เห็นเสมอ)
 *  - สัปดาห์เริ่มวันจันทร์ ใช้วันที่ท้องถิ่นที่บันทึกไว้ใน workout
 */
(function (global) {
  'use strict';

  function norm(s) { return String(s || '').trim().toLowerCase(); }
  function parseKey(key) { const p = key.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  // วันจันทร์ของสัปดาห์ที่วันที่นั้นอยู่ (YYYY-MM-DD)
  function weekStart(key) {
    const d = parseKey(key);
    const back = (d.getDay() + 6) % 7;   // จันทร์ = 0 ... อาทิตย์ = 6
    d.setDate(d.getDate() - back);
    return dateKey(d);
  }
  function weekEnd(startKey) {
    const d = parseKey(startKey);
    d.setDate(d.getDate() + 6);
    return dateKey(d);
  }

  function basisKey(e) { return norm(e.equipment) + '|' + e.weightMode; }

  function completedWorking(e) {
    return (e.sets || []).filter(function (s) { return s.kind === 'working' && s.status === 'completed'; });
  }

  // แถวสรุปของ 1 ท่า 1 workout
  function sessionRow(w, e) {
    const sets = completedWorking(e);
    if (!sets.length) return null;
    let vol = 0, top = sets[0];
    sets.forEach(function (s) {
      vol += s.weight * s.reps;
      if (s.weight > top.weight || (s.weight === top.weight && s.reps > top.reps)) top = s;
    });
    return {
      workoutId: w.id, date: w.date, planName: w.planName,
      exerciseId: e.exerciseId, exerciseName: e.exerciseName,
      equipment: e.equipment, weightMode: e.weightMode, basis: basisKey(e),
      sets: sets.map(function (s) { return { weight: s.weight, reps: s.reps }; }),
      workingSets: sets.length, volume: round2(vol),
      top: { weight: top.weight, reps: top.reps }
    };
  }

  function finishedRows(workouts) {
    const rows = [];
    workouts.forEach(function (w) {
      if (w.status !== 'finished') return;
      w.entries.forEach(function (e) { const r = sessionRow(w, e); if (r) rows.push(r); });
    });
    return rows;
  }

  // รายการท่าที่มีประวัติ: [{ exerciseId, name, sessions, lastDate }] (ชื่อล่าสุดที่เคยจด)
  function exerciseIndex(workouts) {
    const map = {};
    finishedRows(workouts).forEach(function (r) {
      const m = map[r.exerciseId] || (map[r.exerciseId] = { exerciseId: r.exerciseId, name: r.exerciseName, sessions: 0, lastDate: '' });
      m.sessions++;
      if (r.date >= m.lastDate) { m.lastDate = r.date; m.name = r.exerciseName; }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /* ประวัติรายท่า แยกกลุ่มตามอุปกรณ์/วิธีนับน้ำหนัก
   * คืน [{ basis, equipment, weightMode, sessions:[แถว ใหม่→เก่า], weeks:[รายสัปดาห์ ใหม่→เก่า] }]
   * กลุ่มที่เล่นล่าสุดมาก่อน */
  function exerciseHistory(workouts, exerciseId) {
    const rows = finishedRows(workouts).filter(function (r) { return r.exerciseId === exerciseId; });
    const groups = {};
    rows.forEach(function (r) {
      const g = groups[r.basis] || (groups[r.basis] = { basis: r.basis, equipment: r.equipment, weightMode: r.weightMode, sessions: [] });
      g.sessions.push(r);
    });
    return Object.keys(groups).map(function (k) {
      const g = groups[k];
      g.sessions.sort(function (a, b) { return a.date === b.date ? 0 : (a.date < b.date ? 1 : -1); });
      const wk = {};
      g.sessions.forEach(function (r) {
        const ws = weekStart(r.date);
        const w = wk[ws] || (wk[ws] = { weekStart: ws, weekEnd: weekEnd(ws), sessions: 0, workingSets: 0, volume: 0, top: null });
        w.sessions++; w.workingSets += r.workingSets; w.volume = round2(w.volume + r.volume);
        if (!w.top || r.top.weight > w.top.weight || (r.top.weight === w.top.weight && r.top.reps > w.top.reps)) w.top = r.top;
      });
      g.weeks = Object.keys(wk).map(function (x) { return wk[x]; }).sort(function (a, b) { return a.weekStart < b.weekStart ? 1 : -1; });
      g.lastDate = g.sessions[0].date;
      return g;
    }).sort(function (a, b) { return a.lastDate < b.lastDate ? 1 : -1; });
  }

  /* สรุปรายสัปดาห์: [{ weekStart, weekEnd, workouts, exercises:[{ exerciseId, name, equipment, weightMode, workingSets, volume, top }] }]
   * ไม่มีผลรวมข้ามท่า (ตั้งใจ) */
  function weeklyOverview(workouts) {
    const weeks = {};
    workouts.forEach(function (w) {
      if (w.status !== 'finished') return;
      const rows = w.entries.map(function (e) { return sessionRow(w, e); }).filter(Boolean);
      if (!rows.length) return;
      const ws = weekStart(w.date);
      const wk = weeks[ws] || (weeks[ws] = { weekStart: ws, weekEnd: weekEnd(ws), workouts: 0, map: {} });
      wk.workouts++;
      rows.forEach(function (r) {
        const key = r.exerciseId + '|' + r.basis;
        const x = wk.map[key] || (wk.map[key] = { exerciseId: r.exerciseId, name: r.exerciseName, equipment: r.equipment, weightMode: r.weightMode, workingSets: 0, volume: 0, top: null, _last: '' });
        x.workingSets += r.workingSets; x.volume = round2(x.volume + r.volume);
        if (!x.top || r.top.weight > x.top.weight || (r.top.weight === x.top.weight && r.top.reps > x.top.reps)) x.top = r.top;
        if (r.date >= x._last) { x._last = r.date; x.name = r.exerciseName; }
      });
    });
    return Object.keys(weeks).map(function (k) {
      const wk = weeks[k];
      const exs = Object.keys(wk.map).map(function (m) { const x = wk.map[m]; delete x._last; return x; })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'th'); });
      return { weekStart: wk.weekStart, weekEnd: wk.weekEnd, workouts: wk.workouts, exercises: exs };
    }).sort(function (a, b) { return a.weekStart < b.weekStart ? 1 : -1; });
  }

  const api = {
    weekStart: weekStart, weekEnd: weekEnd,
    exerciseIndex: exerciseIndex, exerciseHistory: exerciseHistory, weeklyOverview: weeklyOverview
  };
  global.GymSummary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
