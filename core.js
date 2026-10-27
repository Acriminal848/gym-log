/* core.js — ตัวช่วยกลางของหน้าจอ: state, จัดรูปแบบ, บันทึก workout, โมเดลแถวเซต
 * ใช้ร่วมกับ views.js (วาดหน้า) และ app.js (การกระทำ/เหตุการณ์) ผ่าน window.GL
 *
 * หลักการสำคัญ (ตาม UX brief):
 *  - state.tab/state.sub (หน้าที่เปิดอยู่) แยกจาก state.active (session ที่ค้าง) เด็ดขาด
 *  - session ที่ค้างเก็บเป็นระเบียน workouts สถานะ 'active' (draft) และถูกตัดออกจากประวัติ/สรุป/progression เสมอ
 *    ประวัติเกิดเฉพาะเมื่อผู้ใช้กด "จบและเก็บผลการฝึก" และมีเซตที่ยืนยันแล้วจริงเท่านั้น
 */
(function () {
  'use strict';

  const GL = window.GL = {
    S: window.GymStorage, P: window.GymProgression, SM: window.GymSummary, I: window.GymIcons, PG: window.GymProgram,
    APP_VERSION: '1.8.0',
    views: {}
  };
  const S = GL.S, P = GL.P, SM = GL.SM;

  GL.WEIGHT_MODE_LABEL = {
    barbell_total: 'บาร์เบล · นับน้ำหนักรวมบาร์',
    dumbbell_each: 'ดัมเบล · นับต่อข้าง',
    machine: 'เครื่อง · ตามแผ่นน้ำหนักบนเครื่อง',
    cable: 'สายเคเบิล · ตามแผ่นน้ำหนัก',
    bodyweight: 'น้ำหนักตัว · กรอกเฉพาะน้ำหนักที่เพิ่ม'
  };
  GL.WEIGHT_MODE_SHORT = {
    barbell_total: 'รวมบาร์', dumbbell_each: 'ต่อข้าง', machine: 'ตามเครื่อง', cable: 'ตามสาย', bodyweight: 'น้ำหนักเพิ่ม'
  };
  GL.WEIGHT_MODE_ORDER = ['barbell_total', 'dumbbell_each', 'machine', 'cable', 'bodyweight'];
  GL.DEFAULT_MUSCLES = ['อก', 'หลัง', 'ไหล่ข้าง', 'ไหล่หลัง', 'ต้นขาหน้า', 'ต้นขาหลัง', 'ก้น', 'ไบเซ็ป', 'ไตรเซ็ป', 'หน้าท้อง', 'น่อง', 'ปลายแขน'];

  /* ---------- การตั้งค่า (เก็บใน settings store ทีละ key — ไม่ต้องเปลี่ยนโครงฐานข้อมูล) ---------- */
  GL.DEFAULTS = { restSeconds: 90, restAuto: true, restSound: true, keepAwake: true, showTargets: false };
  GL.REST_PRESETS = [60, 90, 120, 180];
  GL.setting = function (key) {
    const v = window.GL.state.settings[key];
    return v === undefined ? GL.DEFAULTS[key] : v;
  };
  // เวลาพักของท่านี้: ค่าที่ตั้งเฉพาะท่า (restSec) ถ้ามี ไม่งั้นใช้ค่ากลางในตั้งค่า
  GL.restFor = function (ex) {
    const s = ex && ex.restSec;
    return Number.isInteger(s) && s >= 10 && s <= 900 ? s : GL.setting('restSeconds');
  };
  GL.fmtClock = function (sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  };
  /* ---------- สร้างท่าแบบเร็ว: ค่าเริ่มต้นตามอุปกรณ์ + เดาภาพจากชื่อ ---------- */
  // [ชื่อบนชิป, วิธีนับน้ำหนัก, ขั้นน้ำหนักเริ่มต้น]
  GL.QX_EQUIP = [
    ['เครื่อง', 'machine', 5], ['สายเคเบิล', 'cable', 2.5], ['บาร์เบล', 'barbell_total', 2.5],
    ['ดัมเบล', 'dumbbell_each', 2], ['Smith Machine', 'machine', 5], ['น้ำหนักตัว', 'bodyweight', 2.5]
  ];
  // เรียงจากเฉพาะเจาะจงไปทั่วไป (ตัวแรกที่ตรงชนะ)
  const ICON_GUESS = [
    [/t[\s-]?bar/i, 'tbar_row'], [/leg\s*press/i, 'leg_press'], [/hack/i, 'hack_squat'], [/hip\s*thrust|glute/i, 'hip_thrust'],
    [/leg\s*ext/i, 'leg_extension'], [/lying.*curl|prone.*curl/i, 'lying_curl'], [/leg\s*curl|hamstring/i, 'leg_curl'],
    [/calf/i, 'calf_raise'], [/cable\s*crunch/i, 'cable_crunch'], [/crunch|sit[\s-]?up|abs?\b/i, 'crunch'],
    [/pull[\s-]?down|lat\b/i, 'lat_pulldown'], [/single[\s-]?arm|one[\s-]?arm|unilateral/i, 'one_arm_row'], [/row/i, 'cable_row'],
    [/rear|reverse\s*(pec|fly)/i, 'rear_fly'], [/lateral|side\s*raise/i, 'lateral_raise'], [/preacher/i, 'preacher'],
    [/(ez|bar).*curl|curl.*bar/i, 'bar_curl'], [/curl/i, 'curl'], [/push[\s-]?down|tricep|extension/i, 'pushdown'],
    [/incline/i, 'incline_press'], [/chest\s*press|bench|press/i, 'chest_press'], [/cable.*fly|fly.*cable/i, 'cable_fly'], [/fly|pec/i, 'pec_fly']
  ];
  GL.guessIcon = function (name) {
    for (let i = 0; i < ICON_GUESS.length; i++) if (ICON_GUESS[i][0].test(name || '')) return ICON_GUESS[i][1];
    return '';
  };
  // ท่าอ้างอิงสำหรับคัดลอกช่วง reps/ขั้นน้ำหนัก/ภาพ: ท่าที่กำลังดูอยู่ ถ้ากล้ามเนื้อเดียวกัน
  GL.qxDefaults = function (q, refEx) {
    const eq = GL.QX_EQUIP[q.equipKey] || GL.QX_EQUIP[0];
    const sameMuscle = refEx && q.muscle && refEx.muscle === q.muscle;
    return {
      weightMode: eq[1],
      repMin: sameMuscle ? refEx.repMin : 8, repMax: sameMuscle ? refEx.repMax : 12,
      step: sameMuscle && refEx.weightMode === eq[1] ? refEx.step : eq[2],
      icon: GL.guessIcon(q.name) || (sameMuscle && refEx.icon ? refEx.icon : '')
    };
  };
  GL.qxHint = function (q) {
    const d = GL.qxDefaults(q, GL.exById(q.refId));
    return 'จะตั้งช่วง reps ' + d.repMin + '–' + d.repMax + ' และขั้นน้ำหนัก ' + GL.fmtNum(d.step) + ' kg ให้ก่อน (แก้ละเอียดได้ภายหลังในแท็บ “ท่า”)';
  };

  GL.inSession = function () {
    const st = window.GL.state;
    return st.tab === 'home' && !!st.sub && st.sub.name === 'session' && !!st.active;
  };

  const state = GL.state = {
    tab: 'home',                // home | plans | exercises | history
    sub: null,                  // หน้าย่อยของแท็บ (null = หน้ารากของแท็บ)
    exercises: [], plans: [], workouts: [], settings: {},
    active: null,               // session ที่ค้าง (draft) — แยกจาก tab/sub
    cur: 0,                     // ท่าที่กำลังดูใน session (ลำดับใน entries)
    persisted: null,
    undo: null,                 // { label, fn, error } แสดงค้างจนมีการกระทำถัดไป
    carry: null,                // { entryId, weight, afterPending } ข้อเสนอ "เซตที่เหลือใช้น้ำหนักนี้"
    busy: false,
    hisMode: 'overview',        // overview | exercises | sessions
    hisWeek: 0,                 // 0 = สัปดาห์นี้, -1 = สัปดาห์ก่อน ...
    sumMode: 'ex', sumView: 'session', trendMetric: 'top',
    exQuery: '', exMuscle: '',
    lastFinishedId: null,
    rest: null,                 // ตัวจับเวลาพัก { total, endsAt, announced } (อยู่ในหน่วยความจำเท่านั้น)
    justSet: null,              // id เซตที่เพิ่งยืนยัน ใช้เล่นแอนิเมชันครั้งเดียว
    addSets: 3                  // จำนวนเซตเริ่มต้นเมื่อเพิ่มท่าเข้า session
  };

  /* ---------- ตัวช่วยทั่วไป ---------- */

  GL.esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  GL.fmtNum = function (n) {
    if (n == null || isNaN(n)) return '';
    return Number.isInteger(n) ? String(n) : String(+Number(n).toFixed(2));
  };
  GL.clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  GL.exById = function (id) { return state.exercises.find(function (e) { return e.id === id; }) || null; };
  GL.planById = function (id) { return state.plans.find(function (p) { return p.id === id; }) || null; };
  GL.findWorkout = function (id) { return state.workouts.find(function (w) { return w.id === id; }) || null; };
  GL.findEntry = function (w, entryId) { return w ? (w.entries.find(function (e) { return e.id === entryId; }) || null) : null; };
  GL.byName = function (a, b) { return String(a.name).localeCompare(String(b.name), 'th'); };

  GL.localDateKey = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  GL.parseKey = function (key) { const p = key.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  GL.fmtDate = function (key, withYear) {
    const d = GL.parseKey(key);
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (withYear || d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('th-TH', opts);
  };
  GL.fmtShort = function (key) {
    const d = GL.parseKey(key);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };
  GL.agoLabel = function (key) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const days = Math.round((t - GL.parseKey(key)) / 86400000);
    if (days <= 0) return 'วันนี้';
    if (days === 1) return 'เมื่อวาน';
    return days + ' วันก่อน';
  };
  GL.fmtDateTime = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  GL.parseWeight = function (text) {
    const t = String(text == null ? '' : text).trim().replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    if (!isFinite(n) || n < 0 || n > 2000) return NaN;
    return n;
  };
  GL.parseReps = function (text) {
    const t = String(text == null ? '' : text).trim();
    if (!/^\d+$/.test(t)) return NaN;
    const n = Number(t);
    return n >= 1 && n <= 500 ? n : NaN;
  };

  /* ---------- ข้อความแจ้ง (ใช้นอกหน้าจดเท่านั้น; ในหน้าจดใช้แถบ undo ที่ไม่บังปุ่ม) ---------- */

  let toastTimer = null;
  GL.toast = function (msg, opts) {
    opts = opts || {};
    const el = document.getElementById('toast');
    clearTimeout(toastTimer);
    el.className = opts.error ? 'error' : '';
    el.innerHTML = '<span>' + GL.esc(msg) + '</span>' +
      (opts.undo ? '<button type="button" data-action="toast-undo">ย้อนกลับ</button>' : '');
    el._undo = opts.undo || null;
    el.hidden = false;
    toastTimer = setTimeout(function () { el.hidden = true; el._undo = null; }, opts.undo ? 9000 : (opts.error ? 6000 : 3500));
  };
  GL.hideToast = function () {
    const el = document.getElementById('toast');
    clearTimeout(toastTimer); el.hidden = true; el._undo = null;
  };

  /* ---------- แผ่นล่าง (sheet) ---------- */

  GL.sheetCtx = null;
  GL.openSheet = function (html, opts) {
    const root = document.getElementById('sheet-root');
    root.innerHTML = '<div class="backdrop" data-action="close-sheet"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>' + html + '</div>';
    const sh = root.querySelector('.sheet');
    if (opts && opts.id) sh.id = opts.id;
    document.body.classList.add('has-sheet');
  };
  GL.closeSheet = function () {
    document.getElementById('sheet-root').innerHTML = '';
    GL.sheetCtx = null;
    document.body.classList.remove('has-sheet');
  };

  /* ---------- บันทึก workout ---------- */

  GL.saveWorkout = function (w) {
    return S.put('workouts', w).catch(function (err) {
      throw err;
    });
  };

  let saveTimer = null, pendingSave = null;
  GL.scheduleSave = function (w) {
    pendingSave = w;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(GL.flushSave, 350);
  };
  GL.flushSave = function () {
    clearTimeout(saveTimer);
    if (pendingSave) {
      const w = pendingSave;
      pendingSave = null;
      S.put('workouts', w).catch(function (err) {
        GL.setUndo({ label: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', error: true });
        if (GL.render) GL.render();
      });
    }
  };

  /* ---------- Undo (แสดงค้างจนมีการกระทำถัดไป) ---------- */

  GL.setUndo = function (u) { state.undo = u ? Object.assign(u, { fresh: true }) : null; };
  GL.clearUndo = function () { state.undo = null; };

  /* ---------- โมเดลเซตของท่าหนึ่ง ---------- */

  GL.workingCompleted = function (entry) { return P.workingCompleted(entry); };
  GL.completedAny = function (entry) { return entry.sets.filter(function (s) { return s.status === 'completed'; }); };
  // เซตที่ยืนยันแล้วจริง (working หรือ warm-up) ใน session — ใช้ตัดสินว่า "มีข้อมูล" ก่อนทิ้ง/จบ
  GL.sessionSetCount = function (w) {
    return w.entries.reduce(function (n, e) { return n + GL.completedAny(e).length; }, 0);
  };
  GL.sessionWorkingCount = function (w) {
    return w.entries.reduce(function (n, e) { return n + P.workingCompleted(e).length; }, 0);
  };
  GL.hasData = function (w) { return !!w && GL.sessionSetCount(w) > 0; };

  // จำนวนแถว working ที่มีสถานะแล้ว (ทำแล้วหรือข้าม) และจำนวนแถวที่ยังรอ
  GL.workingRows = function (entry) {
    return entry.sets.filter(function (s) { return s.kind === 'working'; }).length;
  };
  GL.pendingCount = function (entry) { return Math.max(0, (entry.plannedSets || 0) - GL.workingRows(entry)); };
  GL.pendingSetsTotal = function (w) {
    return w.entries.reduce(function (n, e) { return n + GL.pendingCount(e); }, 0);
  };

  // ค่าที่เสนอไว้ในช่องของแถวที่ยังไม่ยืนยัน (มาจากเป้าหมายวันนี้เท่านั้น ไม่ใช่ผลที่ทำไปแล้ว)
  GL.suggestion = function (entry) {
    const t = entry.target;
    return {
      weight: t && t.weight != null ? GL.fmtNum(t.weight) : '',
      reps: t && t.reps != null ? String(t.reps) : ''
    };
  };
  GL.draftOf = function (entry, p) {
    const d = (entry.drafts && entry.drafts[p]) || null;
    const sug = GL.suggestion(entry);
    const wT = !!(d && d.weight != null), rT = !!(d && d.reps != null);
    return {
      weight: wT ? d.weight : sug.weight, reps: rT ? d.reps : sug.reps,
      weightTouched: wT, repsTouched: rT
    };
  };
  GL.setDraft = function (entry, p, field, value) {
    entry.drafts = entry.drafts || [];
    while (entry.drafts.length <= p) entry.drafts.push(null);
    entry.drafts[p] = entry.drafts[p] || { weight: null, reps: null };
    entry.drafts[p][field] = value;
  };
  GL.hasDraftValues = function (w) {
    return w.entries.some(function (e) {
      return (e.drafts || []).some(function (d) { return d && ((d.weight != null && d.weight !== '') || (d.reps != null && d.reps !== '')); });
    });
  };

  // เป้าหมายวันนี้แบบย่อ (เก็บในประวัติเฉพาะที่ใช้แสดง)
  GL.slimTarget = function (t) {
    if (!t) return null;
    return { weight: t.weight, reps: t.reps, reason: t.reason, kind: t.kind };
  };

  GL.makeEntry = function (ex, plannedSets, plannedEx, workoutId) {
    const entry = {
      id: S.uid('e'),
      plannedExerciseId: plannedEx ? plannedEx.id : null,
      plannedExerciseName: plannedEx ? plannedEx.name : null,
      exerciseId: ex.id,
      exerciseName: ex.name,
      equipment: ex.equipment,
      weightMode: ex.weightMode,
      plannedSets: plannedSets,
      target: null,
      sets: [],
      draft: null,        // คงไว้เพื่อให้รูปแบบข้อมูลเท่าเดิม (ไม่ใช้แล้ว)
      drafts: []          // ค่าที่กรอกในแถวที่ยังไม่ยืนยัน (ไม่ใช่ผลจริง จนกว่าจะกดยืนยัน)
    };
    entry.target = GL.slimTarget(P.suggestTarget(state.workouts, entry, ex, workoutId));
    return entry;
  };

  /* ---------- ประวัติของท่า (ไม่รวม session ที่ค้าง) ---------- */

  GL.finishedWorkouts = function () {
    return P.sortNewestFirst(state.workouts.filter(function (w) { return w.status === 'finished'; }));
  };

  // session ล่าสุดของท่า+อุปกรณ์เดียวกัน (วันที่เล่นล่าสุด) สำหรับแสดงในรายการท่าทางเลือก
  GL.lastPlayed = function (exId, equipment, weightMode) {
    const list = GL.finishedWorkouts();
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      for (let j = 0; j < w.entries.length; j++) {
        const e = w.entries[j];
        if (e.exerciseId === exId && P.workingCompleted(e).length) {
          return { date: w.date, sameBasis: P.sameBasis(e, { equipment: equipment, weightMode: weightMode }) };
        }
      }
    }
    return null;
  };

  // รายการ session ย้อนหลังของท่านี้ (ทุกอุปกรณ์) — ใช้ในหน้า "ประวัติท่านี้"
  GL.exerciseSessions = function (exId, limit) {
    const out = [];
    GL.finishedWorkouts().forEach(function (w) {
      w.entries.forEach(function (e) {
        if (e.exerciseId === exId && e.sets.some(function (s) { return s.status === 'completed'; })) out.push({ workout: w, entry: e });
      });
    });
    return out.slice(0, limit || 2);
  };

  /* 1.8: ช่องของแผนรายสัปดาห์ (ซ้ำแผนได้) — ใช้ค่าที่ผู้ใช้ตั้ง (settings.weekPlan) ถ้าไม่มี/ว่าง ใช้ค่าเริ่มต้น = แผนทั้งหมดที่ไม่ใช่วันเสริมตามลำดับ */
  GL.weekIsCustom = function () {
    const wp = state.settings.weekPlan;
    return Array.isArray(wp) && wp.some(function (id) { return !!GL.planById(id) && !GL.planById(id).archived; });
  };
  GL.weekSlots = function () {
    if (GL.weekIsCustom()) {
      return state.settings.weekPlan.map(function (id) { return GL.planById(id); }).filter(function (p) { return p && !p.archived; });
    }
    return SM.rotationPlans(GL.sortedPlans());
  };

  GL.sortedPlans = function () {
    return state.plans.filter(function (p) { return !p.archived; }).slice().sort(function (a, b) {
      const ca = a.createdAt || '', cb = b.createdAt || '';
      if (ca !== cb) return ca < cb ? -1 : 1;
      return GL.byName(a, b);
    });
  };
  GL.planLastUsed = function (planId) {
    const list = GL.finishedWorkouts().filter(function (w) { return w.planId === planId; });
    return list.length ? list[0].date : null;
  };
  GL.exerciseHasHistory = function (id) {
    return state.workouts.some(function (w) {
      return w.entries.some(function (e) { return e.exerciseId === id || e.plannedExerciseId === id; });
    });
  };
  GL.plansUsing = function (id) {
    return state.plans.filter(function (p) { return p.items.some(function (it) { return it.exerciseId === id; }); });
  };
  GL.muscleOptions = function () {
    const seen = {}, out = [];
    GL.DEFAULT_MUSCLES.forEach(function (m) { seen[m] = true; out.push(m); });
    state.exercises.forEach(function (e) { if (e.muscle && !seen[e.muscle]) { seen[e.muscle] = true; out.push(e.muscle); } });
    return out;
  };
  GL.groupByMuscle = function (list) {
    const groups = {};
    list.forEach(function (e) { const g = e.muscle || 'อื่น ๆ'; (groups[g] = groups[g] || []).push(e); });
    const order = GL.muscleOptions().filter(function (m) { return groups[m]; });
    Object.keys(groups).forEach(function (g) { if (order.indexOf(g) < 0) order.push(g); });
    return order.map(function (g) { return { muscle: g, items: groups[g].sort(GL.byName) }; });
  };
  GL.iconKeyFor = function (ex) {
    if (ex && ex.icon && GL.I.EX_KEYS.indexOf(ex.icon) >= 0) return ex.icon;
    return 'dumbbell';
  };

  /* ---------- finalize: เปลี่ยน session ที่ค้างเป็นประวัติ (เก็บเฉพาะท่าที่มีเซตยืนยันแล้ว) ---------- */

  GL.finalized = function (w) {
    const out = GL.clone(w);
    out.entries = out.entries.filter(function (e) { return e.sets.some(function (s) { return s.status === 'completed'; }); });
    out.entries.forEach(function (e) { e.draft = null; delete e.drafts; });
    out.status = 'finished';
    out.finishedAt = new Date().toISOString();
    return out;
  };
})();
