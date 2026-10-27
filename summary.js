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

  /* ---------- 1.5: หน้าแรก (วันนี้ / สัปดาห์ / กล้ามเนื้อที่ยังไม่ได้เล่น) ---------- */

  // แผนที่นับอยู่ในวงจร (rotation): ทุกแผนที่ไม่ถูกเก็บ ยกเว้น “วันเสริม” (ไม่บังคับ ทำเป็นครั้งคราว)
  function rotationPlans(plans) {
    return plans.filter(function (p) { return !p.archived && !/extra/i.test(String(p.id)); });
  }

  // แผนถัดไปในวงจร: ต่อจากแผนของ session ที่จบล่าสุดซึ่งอยู่ในวงจร (finishedNewestFirst = เรียงใหม่→เก่า)
  function nextInRotation(rotation, finishedNewestFirst) {
    if (!rotation.length) return null;
    for (let i = 0; i < finishedNewestFirst.length; i++) {
      const idx = rotation.findIndex(function (p) { return p.id === finishedNewestFirst[i].planId; });
      if (idx >= 0) return { plan: rotation[(idx + 1) % rotation.length], after: finishedNewestFirst[i] };
    }
    return { plan: rotation[0], after: null };
  }

  /* 1.8: แผนรายสัปดาห์ — ลำดับเป็น “ช่อง” (ซ้ำแผนได้) รีเซ็ตทุกสัปดาห์ (จันทร์–อาทิตย์)
   * ช่องถัดไป = ช่องแรกที่ยังไม่ได้ทำ “ในสัปดาห์นี้” ไม่ผูกกับวัน ไม่ตามทวงช่องที่ข้ามไปจากสัปดาห์ก่อน
   * session ที่จบแล้วและมีเซตจริงอย่างน้อย 1 เซต จะถูกจับคู่กับช่องแรกที่ยังว่างของแผนเดียวกัน (เรียงตามเวลา)
   * session ของแผนที่ไม่อยู่ในช่อง (เช่น วันเสริม) หรือซ้ำเกินจำนวนช่อง ไม่นับ
   * slotPlanIds: id แผนตามลำดับช่อง → { slots:[{planId, done, workoutId}], next: index|null, doneCount, complete } */
  function weekProgress(slotPlanIds, workouts, todayKey) {
    const ws = weekStart(todayKey), we = weekEnd(ws);
    const slots = slotPlanIds.map(function (id) { return { planId: id, done: false, workoutId: null }; });
    workouts.filter(function (w) {
      return w.status === 'finished' && w.date >= ws && w.date <= we && w.entries.some(function (e) { return completedWorking(e).length; });
    }).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const sa = a.startedAt || '', sb = b.startedAt || '';
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }).forEach(function (w) {
      const s = slots.find(function (x) { return !x.done && x.planId === w.planId; });
      if (s) { s.done = true; s.workoutId = w.id; }
    });
    const next = slots.findIndex(function (x) { return !x.done; });
    const doneCount = slots.filter(function (x) { return x.done; }).length;
    return { slots: slots, next: next < 0 ? null : next, doneCount: doneCount, complete: slots.length > 0 && next < 0 };
  }

  // แถบสัปดาห์ (จันทร์–อาทิตย์) ของวันที่ todayKey: นับเฉพาะ session ที่จบแล้วและมีเซตจริงอย่างน้อย 1 เซต
  function weekStrip(workouts, todayKey) {
    const ws = weekStart(todayKey);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = parseKey(ws); d.setDate(d.getDate() + i);
      const key = dateKey(d);
      days.push({ key: key, dow: i, isToday: key === todayKey, isFuture: key > todayKey, sessions: [] });
    }
    let count = 0;
    workouts.forEach(function (w) {
      if (w.status !== 'finished') return;
      if (!w.entries.some(function (e) { return completedWorking(e).length; })) return;
      const day = days.find(function (x) { return x.key === w.date; });
      if (day) { day.sessions.push({ workoutId: w.id, planName: w.planName }); count++; }
    });
    return { weekStart: ws, days: days, sessions: count };
  }

  // จำนวนเซตทำงานที่ทำเสร็จของแต่ละกล้ามเนื้อในสัปดาห์ (นับเซตต่อกล้ามเนื้อหลักของท่า — เฉพาะ “เซตตรง”)
  // exById: ฟังก์ชันหาท่าจาก id (ถ้าท่าถูกลบไปแล้ว จะข้าม)
  function muscleSets(workouts, exById, weekStartKey) {
    const end = weekEnd(weekStartKey), out = {};
    workouts.forEach(function (w) {
      if (w.status !== 'finished' || w.date < weekStartKey || w.date > end) return;
      w.entries.forEach(function (e) {
        const ex = exById(e.exerciseId);
        const m = ex && ex.muscle ? ex.muscle : null;
        const n = completedWorking(e).length;
        if (m && n) out[m] = (out[m] || 0) + n;
      });
    });
    return out;
  }

  // กล้ามเนื้อที่แผนในวงจรครอบคลุม แต่สัปดาห์นี้ยังไม่มีเซตตรง (ใช้แสดงเป็นชิปเตือนความจำ ไม่ใช่การตำหนิ)
  function untrainedMuscles(rotation, exById, trained) {
    const seen = {}, order = [];
    rotation.forEach(function (p) {
      p.items.forEach(function (it) {
        const ex = exById(it.exerciseId);
        if (ex && !ex.archived && ex.muscle && !seen[ex.muscle]) { seen[ex.muscle] = true; order.push(ex.muscle); }
      });
    });
    return order.filter(function (m) { return !trained[m]; });
  }

  /* ---------- 1.6: ภาพรวมกล้ามเนื้อ / แนวโน้มรายท่า / ตารางความสม่ำเสมอ / สรุปหลังจบ ---------- */

  // 1RM โดยประมาณ (Epley) — ใช้เทียบแนวโน้มของท่าเดียวกันเท่านั้น ไม่แม่นเมื่อ reps สูง
  function e1rm(weight, reps) { return round2(weight * (1 + reps / 30)); }

  // เซตตรง + จำนวนครั้งที่ฝึก ต่อกล้ามเนื้อ ในสัปดาห์ที่เริ่มวัน weekStartKey: { 'อก': { sets, sessions } }
  function muscleWeek(workouts, exById, weekStartKey) {
    const end = weekEnd(weekStartKey), out = {};
    workouts.forEach(function (w) {
      if (w.status !== 'finished' || w.date < weekStartKey || w.date > end) return;
      const seen = {};
      w.entries.forEach(function (e) {
        const ex = exById(e.exerciseId);
        const m = ex && ex.muscle ? ex.muscle : null;
        const n = completedWorking(e).length;
        if (!m || !n) return;
        const x = out[m] || (out[m] = { sets: 0, sessions: 0 });
        x.sets += n;
        if (!seen[m]) { seen[m] = true; x.sessions++; }
      });
    });
    return out;
  }

  // จุดแนวโน้มของกลุ่มอุปกรณ์เดียว (sessionsNewestFirst จาก exerciseHistory().sessions)
  // metric: 'top' = น้ำหนักเซตหนักสุด | 'e1rm' = 1RM โดยประมาณสูงสุดของครั้งนั้น
  // คืนเก่า → ใหม่; pr = ทำลายสถิติเดิมของกลุ่มนี้ (ครั้งแรกไม่ถือเป็น PR)
  function exerciseTrend(sessionsNewestFirst, metric) {
    const asc = sessionsNewestFirst.slice().reverse();
    const pts = [];
    let best = null;
    asc.forEach(function (r) {
      let v, label;
      if (metric === 'e1rm') {
        v = 0; r.sets.forEach(function (s) { const x = e1rm(s.weight, s.reps); if (x > v) { v = x; } });
        label = null;
      } else { v = r.top.weight; label = r.top.reps; }
      const pr = best !== null && v > best + 1e-9;
      if (best === null || v > best) best = v;
      pts.push({ date: r.date, value: v, reps: label, weight: r.top.weight, topReps: r.top.reps, pr: pr, workoutId: r.workoutId });
    });
    return pts;
  }

  // ตาราง N สัปดาห์ล่าสุด (เก่า → ใหม่) นับ session ที่จบและมีเซตจริงต่อวัน
  function consistencyGrid(workouts, todayKey, nWeeks) {
    nWeeks = nWeeks || 12;
    const start = parseKey(weekStart(todayKey));
    start.setDate(start.getDate() - 7 * (nWeeks - 1));
    const counts = {};
    workouts.forEach(function (w) {
      if (w.status !== 'finished') return;
      if (!w.entries.some(function (e) { return completedWorking(e).length; })) return;
      counts[w.date] = (counts[w.date] || 0) + 1;
    });
    const weeks = [];
    let total = 0, activeWeeks = 0;
    for (let i = 0; i < nWeeks; i++) {
      const days = [];
      let wsum = 0;
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start); dt.setDate(start.getDate() + i * 7 + d);
        const key = dateKey(dt);
        const c = counts[key] || 0;
        days.push({ key: key, count: c, isFuture: key > todayKey, isToday: key === todayKey });
        wsum += c;
      }
      total += wsum; if (wsum) activeWeeks++;
      weeks.push({ weekStart: days[0].key, days: days, sessions: wsum });
    }
    return { weeks: weeks, total: total, activeWeeks: activeWeeks, avg: Math.round(total / nWeeks * 10) / 10 };
  }

  // สถิติใหม่ใน session นี้ เทียบกับ session ที่จบแล้วก่อนหน้า (ท่าเดียวกัน อุปกรณ์/วิธีนับเดียวกัน)
  // คืน [{ exerciseId, name, kind: 'weight'|'e1rm', value, prev }] — ครั้งแรกที่เล่นท่านั้นไม่นับเป็น PR
  function sessionPRs(workouts, workoutId) {
    const cur = workouts.find(function (w) { return w.id === workoutId; });
    if (!cur) return [];
    const prior = workouts.filter(function (w) {
      if (w.status !== 'finished' || w.id === workoutId) return false;
      return w.date < cur.date || (w.date === cur.date && String(w.startedAt || '') < String(cur.startedAt || ''));
    });
    const out = [];
    cur.entries.forEach(function (e) {
      const row = sessionRow(cur, e);
      if (!row) return;
      let pTop = null, pE = null;
      finishedRows(prior).forEach(function (r) {
        if (r.exerciseId !== e.exerciseId || r.basis !== row.basis) return;
        if (pTop === null || r.top.weight > pTop) pTop = r.top.weight;
        r.sets.forEach(function (s) { const x = e1rm(s.weight, s.reps); if (pE === null || x > pE) pE = x; });
      });
      if (pTop === null) return;
      let myE = 0; row.sets.forEach(function (s) { const x = e1rm(s.weight, s.reps); if (x > myE) myE = x; });
      if (row.top.weight > pTop + 1e-9) out.push({ exerciseId: e.exerciseId, name: e.exerciseName, kind: 'weight', value: row.top.weight, prev: pTop });
      else if (myE > pE + 1e-9) out.push({ exerciseId: e.exerciseId, name: e.exerciseName, kind: 'e1rm', value: myE, prev: pE });
    });
    return out;
  }

  // ระยะเวลา session เป็นนาที (null ถ้าไม่มีเวลาเริ่ม/จบ หรือค่าผิดปกติ — เช่น ลืมกดจบข้ามวัน)
  function durationMin(w) {
    if (!w || !w.startedAt || !w.finishedAt) return null;
    const ms = new Date(w.finishedAt) - new Date(w.startedAt);
    if (!isFinite(ms) || ms < 0) return null;
    const m = Math.round(ms / 60000);
    return m >= 1 && m <= 360 ? m : null;
  }

  // กล้ามเนื้อที่ได้เซตตรงใน session นี้ (มาก → น้อย)
  function sessionMuscles(w, exById) {
    const map = {};
    w.entries.forEach(function (e) {
      const ex = exById(e.exerciseId), n = completedWorking(e).length;
      if (ex && ex.muscle && n) map[ex.muscle] = (map[ex.muscle] || 0) + n;
    });
    return Object.keys(map).map(function (m) { return { muscle: m, sets: map[m] }; })
      .sort(function (a, b) { return b.sets - a.sets || String(a.muscle).localeCompare(String(b.muscle), 'th'); });
  }

  const api = {
    e1rm: e1rm, muscleWeek: muscleWeek, exerciseTrend: exerciseTrend, consistencyGrid: consistencyGrid,
    sessionPRs: sessionPRs, durationMin: durationMin, sessionMuscles: sessionMuscles,
    weekStart: weekStart, weekEnd: weekEnd,
    rotationPlans: rotationPlans, nextInRotation: nextInRotation, weekProgress: weekProgress, weekStrip: weekStrip,
    muscleSets: muscleSets, untrainedMuscles: untrainedMuscles,
    exerciseIndex: exerciseIndex, exerciseHistory: exerciseHistory, weeklyOverview: weeklyOverview
  };
  global.GymSummary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
