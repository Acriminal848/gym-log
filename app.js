/* app.js — หน้าจอและการเชื่อมหน้าจอกับข้อมูล (ช่วงที่ 1)
 * ข้อมูลทุกอย่างอยู่ใน IndexedDB ผ่าน storage.js, การคำนวณอยู่ใน progression.js
 */
(function () {
  'use strict';

  const S = window.GymStorage;
  const P = window.GymProgression;
  const APP_VERSION = '1.0.0';   // ต้องตรงกับ VERSION ใน sw.js

  const WEIGHT_MODE_LABEL = {
    barbell_total: 'บาร์เบล · นับน้ำหนักรวมบาร์',
    dumbbell_each: 'ดัมเบล · นับต่อข้าง',
    machine: 'เครื่อง · ตามแผ่นน้ำหนักบนเครื่อง',
    cable: 'สายเคเบิล · ตามแผ่นน้ำหนัก',
    bodyweight: 'น้ำหนักตัว · กรอกเฉพาะน้ำหนักที่เพิ่ม'
  };
  const WEIGHT_MODE_SHORT = {
    barbell_total: 'รวมบาร์', dumbbell_each: 'ต่อข้าง', machine: 'ตามเครื่อง', cable: 'ตามสาย', bodyweight: 'น้ำหนักเพิ่ม'
  };

  const state = {
    tab: 'workout',
    sub: null,                 // { name: 'active' } | { name: 'detail', id }
    exercises: [], plans: [], workouts: [], settings: {},
    active: null,              // workout ที่ยังไม่จบ (ถ้ามี)
    persisted: null
  };
  let sheetCtx = null;
  let pendingImport = null;
  let toastTimer = null;
  let saveTimer = null;
  let pendingSave = null;
  let swReg = null;
  let updateRequested = false;

  /* ---------- ตัวช่วย ---------- */

  const view = document.getElementById('view');
  const sheetRoot = document.getElementById('sheet-root');
  const toastEl = document.getElementById('toast');

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '';
    return Number.isInteger(n) ? String(n) : String(+Number(n).toFixed(2));
  }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function exById(id) { return state.exercises.find(function (e) { return e.id === id; }) || null; }

  function localDateKey(d) {
    d = d || new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function parseKey(key) {
    const p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function fmtDate(key, withYear) {
    const d = parseKey(key);
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (withYear || d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('th-TH', opts);
  }
  function agoLabel(key) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const days = Math.round((t - parseKey(key)) / 86400000);
    if (days <= 0) return 'วันนี้';
    if (days === 1) return 'เมื่อวาน';
    return days + ' วันก่อน';
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function parseWeight(text) {
    const t = String(text == null ? '' : text).trim().replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    if (!isFinite(n) || n < 0 || n > 2000) return NaN;
    return n;
  }
  function parseReps(text) {
    const t = String(text == null ? '' : text).trim();
    if (!/^\d+$/.test(t)) return NaN;
    const n = Number(t);
    return n >= 1 && n <= 500 ? n : NaN;
  }

  function toast(msg, opts) {
    opts = opts || {};
    clearTimeout(toastTimer);
    toastEl.className = opts.error ? 'error' : '';
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' +
      (opts.undo ? '<button type="button" data-action="toast-undo">ยกเลิก (Undo)</button>' : '');
    toastEl._undo = opts.undo || null;
    toastEl.hidden = false;
    toastTimer = setTimeout(function () { toastEl.hidden = true; toastEl._undo = null; }, opts.undo ? 7000 : 3500);
  }
  function hideToast() { clearTimeout(toastTimer); toastEl.hidden = true; toastEl._undo = null; }

  /* ---------- บันทึก workout ---------- */

  function saveWorkout(w) {
    return S.put('workouts', w).catch(function (err) {
      toast('บันทึกไม่สำเร็จ: ' + (err && err.message ? err.message : 'ไม่ทราบสาเหตุ'), { error: true });
      throw err;
    });
  }
  function scheduleSave(w) {
    pendingSave = w;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 350);
  }
  function flushSave() {
    clearTimeout(saveTimer);
    if (pendingSave) {
      const w = pendingSave;
      pendingSave = null;
      saveWorkout(w).catch(function () { /* แจ้งแล้วใน saveWorkout */ });
    }
  }

  // แก้ sets ของ entry แล้วบันทึกทันที พร้อมให้ Undo
  async function commitEntryChange(w, entry, label, mutator) {
    const beforeSets = clone(entry.sets);
    const beforeDraft = clone(entry.draft);
    mutator();
    try {
      await saveWorkout(w);
    } catch (e) {
      entry.sets = beforeSets;
      entry.draft = beforeDraft;
      render();
      return false;
    }
    render();
    toast(label, {
      undo: async function () {
        entry.sets = beforeSets;
        entry.draft = beforeDraft;
        try { await saveWorkout(w); } catch (e) { /* แจ้งแล้ว */ }
        render();
      }
    });
    return true;
  }

  function findWorkout(id) { return state.workouts.find(function (w) { return w.id === id; }) || null; }
  function findEntry(w, entryId) { return w ? (w.entries.find(function (e) { return e.id === entryId; }) || null) : null; }

  /* ---------- สร้าง workout ---------- */

  function makeEntry(ex, plannedSets, plannedEx, workoutId) {
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
      draft: null
    };
    entry.target = P.targetForToday(P.findPrevious(state.workouts, entry, workoutId));
    return entry;
  }

  async function startWorkout(planId) {
    if (state.active) { state.sub = { name: 'active' }; render(); return; }
    const plan = planId ? state.plans.find(function (p) { return p.id === planId; }) : null;
    const now = new Date();
    const w = {
      id: S.uid('w'), date: localDateKey(now), status: 'active',
      startedAt: now.toISOString(), finishedAt: null,
      planId: plan ? plan.id : null,
      planName: plan ? plan.name : 'เลือกท่าเอง',
      entries: []
    };
    if (plan) {
      plan.items.forEach(function (it) {
        const ex = exById(it.exerciseId);
        if (ex) w.entries.push(makeEntry(ex, it.sets, ex, w.id));
      });
    }
    try { await saveWorkout(w); } catch (e) { return; }
    state.workouts.push(w);
    state.active = w;
    state.sub = { name: 'active' };
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- หน้าจอ ---------- */

  function render() {
    const y = window.scrollY;
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === state.tab);
      if (b.dataset.tab === state.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    let html = '';
    if (state.tab === 'workout') html = renderWorkoutTab();
    else if (state.tab === 'plans') html = renderPlans();
    else if (state.tab === 'exercises') html = renderExercises();
    else html = renderBackup();
    view.innerHTML = html;
    window.scrollTo(0, y);
  }

  function renderWorkoutTab() {
    if (state.sub && state.sub.name === 'active' && state.active) return renderActive();
    if (state.sub && state.sub.name === 'detail') return renderDetail(state.sub.id);
    return renderHome();
  }

  function renderHome() {
    const finished = P.sortNewestFirst(state.workouts.filter(function (w) { return w.status === 'finished'; }));
    let h = '<h1>Gym Log</h1><p class="muted">' + esc(fmtDate(localDateKey(), true)) + '</p>';

    if (state.active) {
      const done = countCompleted(state.active);
      h += '<div class="card"><h3>มี workout ที่ยังเล่นไม่จบ</h3>' +
        '<p class="muted small">' + esc(state.active.planName) + ' · เริ่ม ' + esc(fmtDate(state.active.date)) +
        ' · บันทึกแล้ว ' + done + ' เซต</p>' +
        '<button type="button" class="btn primary" data-action="resume">เล่นต่อ</button></div>';
    } else {
      h += '<h2>เลือกแผนที่จะเล่นวันนี้</h2>';
      const plans = state.plans.filter(function (p) { return !p.archived; });
      if (!plans.length) h += '<p class="muted">ยังไม่มีแผน</p>';
      plans.forEach(function (p) {
        const names = p.items.map(function (it) { const e = exById(it.exerciseId); return e ? e.name : '(ไม่พบท่า)'; });
        h += '<button type="button" class="list-btn" data-action="start-plan" data-plan="' + esc(p.id) + '">' +
          '<div class="t">เริ่ม: ' + esc(p.name) + '</div>' +
          '<div class="s">' + p.items.length + ' ท่า · ' + esc(names.join(', ')) + '</div></button>';
      });
      h += '<button type="button" class="btn ghost" data-action="start-free">เริ่มแบบเลือกท่าเอง (ไม่ใช้แผน)</button>';
    }

    h += '<h2>ประวัติ</h2>';
    if (!finished.length) {
      h += '<p class="muted">ยังไม่มีประวัติ — จบ workout แรกแล้วจะมาแสดงที่นี่</p>';
    }
    finished.slice(0, 60).forEach(function (w) {
      const sets = countCompleted(w);
      const exs = w.entries.filter(function (e) { return P.workingCompleted(e).length; }).length;
      h += '<button type="button" class="list-btn" data-action="open-detail" data-id="' + esc(w.id) + '">' +
        '<div class="t">' + esc(fmtDate(w.date, true)) + ' <span class="muted small">· ' + esc(agoLabel(w.date)) + '</span></div>' +
        '<div class="s">' + esc(w.planName) + ' · ' + exs + ' ท่า · ' + sets + ' working sets</div></button>';
    });
    return h;
  }

  function countCompleted(w) {
    return w.entries.reduce(function (n, e) { return n + P.workingCompleted(e).length; }, 0);
  }

  function modeLabel(m) { return WEIGHT_MODE_LABEL[m] || m; }

  function setsText(entry) {
    return P.workingCompleted(entry).map(function (s) { return fmtNum(s.weight) + '×' + s.reps; }).join(' · ');
  }

  function renderActive() {
    const w = state.active;
    let h = '<div class="topbar"><button type="button" class="btn small ghost" data-action="back-home">← ประวัติ</button>' +
      '<button type="button" class="btn small primary" data-action="finish">จบ workout</button></div>';
    h += '<h1>' + esc(w.planName) + '</h1><p class="muted">' + esc(fmtDate(w.date, true)) +
      ' · ทุกเซตที่กดยืนยันถูกบันทึกทันที</p>';
    if (!w.entries.length) h += '<div class="card muted">ยังไม่มีท่า — กด “+ เพิ่มท่า” ด้านล่าง</div>';
    w.entries.forEach(function (entry) { h += renderEntry(w, entry); });
    h += '<button type="button" class="btn" data-action="add-ex">+ เพิ่มท่า</button>';
    h += '<div class="btn-row"><button type="button" class="btn danger" data-action="discard">ยกเลิก workout นี้</button></div>';
    return h;
  }

  function renderEntry(w, entry) {
    const ex = exById(entry.exerciseId);
    const prev = P.findPrevious(state.workouts, entry, w.id);
    const swapped = entry.plannedExerciseId && entry.plannedExerciseId !== entry.exerciseId;
    const repRange = ex ? ex.repMin + '–' + ex.repMax + ' reps' : '';
    let h = '<section class="card" data-entry-card="' + esc(entry.id) + '">';
    h += '<div class="card-head"><div><h3>' + esc(entry.exerciseName) + '</h3>' +
      '<div class="muted small">' + (ex && ex.muscle ? esc(ex.muscle) + ' · ' : '') + esc(entry.equipment) + (repRange ? ' · ' + repRange : '') + '</div>' +
      '<div class="muted tiny">นับน้ำหนัก: ' + esc(modeLabel(entry.weightMode)) + '</div>' +
      (swapped ? '<div class="tiny"><span class="tag accent">เปลี่ยนท่าวันนี้ (แผน: ' + esc(entry.plannedExerciseName || '') + ')</span></div>' : '') +
      '</div><button type="button" class="btn small" data-action="swap" data-entry="' + esc(entry.id) + '">เปลี่ยนท่า</button></div>';

    // ครั้งก่อน / เป้าหมายวันนี้ / ผลจริง อยู่ติดกัน
    h += '<div class="trio">';
    h += '<div><div class="lbl">ครั้งก่อน</div>';
    if (!prev) {
      h += '<div class="muted">ยังไม่เคยเล่นท่านี้ — กรอกน้ำหนักเริ่มต้นเอง</div>';
    } else {
      h += '<div class="val">' + esc(setsText(prev.entry)) + ' <span class="muted small">kg×reps</span></div>' +
        '<div class="muted small">' + esc(fmtDate(prev.workout.date, true)) + ' · ' + esc(agoLabel(prev.workout.date)) + '</div>';
      if (!prev.comparable) {
        h += '<div class="warn">ครั้งนั้นใช้ ' + esc(prev.entry.equipment) + ' (' + esc(WEIGHT_MODE_SHORT[prev.entry.weightMode] || '') +
          ') ต่างจากตอนนี้ — เทียบน้ำหนักกันไม่ได้</div>';
      }
    }
    h += '</div>';
    h += '<div class="target"><div class="lbl">เป้าหมายวันนี้ (ยังไม่นับเป็นผลงาน)</div>';
    if (entry.target && entry.target.weight != null) {
      h += '<div class="val">' + esc(fmtNum(entry.target.weight)) + ' kg × ' + esc(entry.target.reps) + '</div>';
    } else {
      h += '<div class="muted">—</div>';
    }
    if (entry.target && entry.target.reason) h += '<div class="muted tiny">' + esc(entry.target.reason) + '</div>';
    h += '</div>';

    h += '<div><div class="lbl">ผลจริงวันนี้</div>';
    const wDone = entry.sets.filter(function (s) { return s.kind === 'working'; }).length;
    h += '<div class="progress"><b>' + P.workingCompleted(entry).length + '</b> เซตที่ทำแล้ว · แผน ' + entry.plannedSets + ' เซต</div></div>';
    h += '</div>';

    // เซตที่ยืนยันแล้ว
    let wi = 0;
    h += '<div class="trio" style="margin-top:0">';
    entry.sets.forEach(function (s) {
      let label;
      if (s.kind === 'warmup') label = 'W'; else { wi++; label = String(wi); }
      let txt;
      if (s.status === 'skipped') txt = 'ข้ามเซตนี้';
      else txt = fmtNum(s.weight) + ' kg × ' + s.reps + (s.kind === 'warmup' ? ' <span class="muted small">(warm-up)</span>' : '');
      h += '<div class="set-row ' + (s.status === 'completed' ? 'done' : 'skipped') + '"><span class="n">' + label + '</span>' +
        '<span class="txt">' + (s.status === 'skipped' ? esc(txt) : txt) + '</span>' +
        '<button type="button" class="edit" data-action="edit-set" data-workout="' + esc(w.id) + '" data-entry="' + esc(entry.id) + '" data-set="' + esc(s.id) + '">แก้</button></div>';
    });

    const showInput = !!entry.draft || wDone < entry.plannedSets;
    if (showInput) {
      h += renderInputRow(entry, ex);
    } else {
      h += '<div class="entry-input"><div class="progress">ครบ ' + entry.plannedSets + ' เซตตามแผนแล้ว</div>' +
        '<button type="button" class="btn small" style="margin-top:8px" data-action="more-set" data-entry="' + esc(entry.id) + '">+ เพิ่มเซต</button></div>';
    }
    h += '</div></section>';
    return h;
  }

  function suggestionFor(entry) {
    const done = P.workingCompleted(entry);
    if (done.length) {
      const last = done[done.length - 1];
      return { weight: fmtNum(last.weight), reps: String(last.reps) };
    }
    if (entry.target && entry.target.weight != null) {
      return { weight: fmtNum(entry.target.weight), reps: String(entry.target.reps) };
    }
    return { weight: '', reps: '' };
  }

  function renderInputRow(entry, ex) {
    const d = entry.draft || {};
    const kind = d.kind === 'warmup' ? 'warmup' : 'working';
    const sug = kind === 'warmup' ? { weight: '', reps: '' } : suggestionFor(entry);
    const wTouched = d.weight != null, rTouched = d.reps != null;
    const wVal = wTouched ? d.weight : sug.weight;
    const rVal = rTouched ? d.reps : sug.reps;
    const wOn = wTouched || wVal === '';
    const rOn = rTouched || rVal === '';
    const id = esc(entry.id);
    let h = '<div class="entry-input" data-input-for="' + id + '">';
    h += '<div class="chips">' +
      '<button type="button" class="chip' + (kind === 'working' ? ' on' : '') + '" data-action="set-kind" data-entry="' + id + '" data-kind="working">เซตจริง (working)</button>' +
      '<button type="button" class="chip' + (kind === 'warmup' ? ' on' : '') + '" data-action="set-kind" data-entry="' + id + '" data-kind="warmup">Warm-up</button></div>';
    h += '<div class="grid">' +
      '<div><div class="field-lbl">น้ำหนัก (kg' + (entry.weightMode === 'dumbbell_each' ? ' ต่อข้าง' : '') + ')</div>' +
      '<div class="stepper"><button type="button" data-action="bump" data-entry="' + id + '" data-field="weight" data-dir="-1" aria-label="ลดน้ำหนัก">−</button>' +
      '<input type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" data-entry="' + id + '" data-field="weight" value="' + esc(wVal) + '" placeholder="kg" class="' + (wOn ? '' : 'suggested') + '" aria-label="น้ำหนัก">' +
      '<button type="button" data-action="bump" data-entry="' + id + '" data-field="weight" data-dir="1" aria-label="เพิ่มน้ำหนัก">+</button></div></div>' +
      '<div><div class="field-lbl">reps</div>' +
      '<div class="stepper"><button type="button" data-action="bump" data-entry="' + id + '" data-field="reps" data-dir="-1" aria-label="ลด reps">−</button>' +
      '<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done" data-entry="' + id + '" data-field="reps" value="' + esc(rVal) + '" placeholder="reps" class="' + (rOn ? '' : 'suggested') + '" aria-label="reps">' +
      '<button type="button" data-action="bump" data-entry="' + id + '" data-field="reps" data-dir="1" aria-label="เพิ่ม reps">+</button></div></div></div>';
    h += '<div class="btn-row">' +
      (kind === 'working' ? '<button type="button" class="btn" data-action="skip-set" data-entry="' + id + '">ข้ามเซต</button>' : '') +
      '<button type="button" class="btn primary" data-action="confirm-set" data-entry="' + id + '">✓ ยืนยันเซต</button></div>';
    h += '<p class="hint">ตัวเลขสีจางคือค่าที่เสนอไว้ — ยังไม่ถูกนับจนกว่าจะกด “ยืนยันเซต”</p>';
    h += '</div>';
    return h;
  }

  function renderDetail(id) {
    const w = findWorkout(id);
    if (!w) return '<p class="muted">ไม่พบ workout นี้</p><button class="btn" data-action="back-home">กลับ</button>';
    let h = '<div class="topbar"><button type="button" class="btn small ghost" data-action="back-home">← ประวัติ</button></div>';
    h += '<h1>' + esc(fmtDate(w.date, true)) + '</h1><p class="muted">' + esc(w.planName) + ' · ' + esc(agoLabel(w.date)) + '</p>';
    w.entries.forEach(function (entry) {
      const swapped = entry.plannedExerciseId && entry.plannedExerciseId !== entry.exerciseId;
      const vol = P.volumeLoad(entry);
      h += '<section class="card"><h3>' + esc(entry.exerciseName) + '</h3>' +
        '<div class="muted small">' + esc(entry.equipment) + ' · นับน้ำหนัก: ' + esc(WEIGHT_MODE_SHORT[entry.weightMode] || '') + '</div>' +
        (swapped ? '<div class="tiny"><span class="tag accent">แทน ' + esc(entry.plannedExerciseName || '') + '</span></div>' : '');
      if (!entry.sets.length) h += '<p class="muted small">ไม่มีเซตที่บันทึก</p>';
      let wi = 0;
      h += '<div class="trio">';
      entry.sets.forEach(function (s) {
        let label; if (s.kind === 'warmup') label = 'W'; else { wi++; label = String(wi); }
        const txt = s.status === 'skipped' ? 'ข้ามเซตนี้' : fmtNum(s.weight) + ' kg × ' + s.reps + (s.kind === 'warmup' ? ' (warm-up)' : '');
        h += '<div class="set-row ' + (s.status === 'completed' ? 'done' : 'skipped') + '"><span class="n">' + label + '</span><span class="txt">' + esc(txt) + '</span>' +
          '<button type="button" class="edit" data-action="edit-set" data-workout="' + esc(w.id) + '" data-entry="' + esc(entry.id) + '" data-set="' + esc(s.id) + '">แก้</button></div>';
      });
      h += '</div>';
      h += '<p class="muted small">working sets ที่ทำจริง: <b style="color:var(--text)">' + P.workingCompleted(entry).length +
        '</b> · volume load: <b style="color:var(--text)">' + esc(fmtNum(vol)) + '</b> kg×reps (' + esc(WEIGHT_MODE_SHORT[entry.weightMode] || '') + ')</p>';
      h += '</section>';
    });
    h += '<button type="button" class="btn danger" data-action="delete-workout" data-id="' + esc(w.id) + '">ลบ workout นี้</button>';
    return h;
  }

  function renderPlans() {
    let h = '<h1>Plans</h1><div class="notice">ช่วงที่ 1: แผนด้านล่างเป็นตัวอย่างสำหรับทดลองใช้ (ดูได้อย่างเดียว) — การสร้างและแก้แผนจะมาในช่วงที่ 2</div>';
    state.plans.forEach(function (p) {
      h += '<section class="card"><h3>' + esc(p.name) + (p.isSample ? ' <span class="tag">ตัวอย่าง</span>' : '') + '</h3><ol style="margin:8px 0 0;padding-left:20px">';
      p.items.forEach(function (it) {
        const e = exById(it.exerciseId);
        h += '<li>' + esc(e ? e.name : '(ไม่พบท่า)') + ' <span class="muted">× ' + it.sets + ' เซต</span></li>';
      });
      h += '</ol></section>';
    });
    return h;
  }

  function renderExercises() {
    let h = '<h1>Exercises</h1><div class="notice">ช่วงที่ 1: ท่าด้านล่างเป็นตัวอย่างสำหรับทดลองใช้ (ดูได้อย่างเดียว) — การเพิ่ม/แก้ท่า หมวดกล้ามเนื้อ และท่าทดแทนจะมาในช่วงที่ 2</div>';
    const groups = {};
    state.exercises.filter(function (e) { return !e.archived; }).forEach(function (e) {
      const g = e.muscle || 'อื่น ๆ';
      (groups[g] = groups[g] || []).push(e);
    });
    Object.keys(groups).forEach(function (g) {
      h += '<h2>' + esc(g) + '</h2>';
      groups[g].forEach(function (e) {
        const subs = (e.subs || []).map(function (id) { const s = exById(id); return s ? s.name : null; }).filter(Boolean);
        h += '<section class="card"><h3>' + esc(e.name) + '</h3>' +
          '<div class="muted small">' + esc(e.equipment) + ' · ' + e.repMin + '–' + e.repMax + ' reps · เพิ่มทีละ ' + esc(fmtNum(e.step)) + ' kg</div>' +
          '<div class="muted small">นับน้ำหนัก: ' + esc(modeLabel(e.weightMode)) + '</div>' +
          '<div class="muted small">ท่าทดแทน: ' + (subs.length ? esc(subs.join(', ')) : '—') + '</div></section>';
      });
    });
    return h;
  }

  function renderBackup() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const finished = state.workouts.filter(function (w) { return w.status === 'finished'; }).length;
    let h = '<h1>สำรอง / กู้คืนข้อมูล</h1>';
    h += '<div class="notice">ข้อมูลทั้งหมดเก็บ <b>ในเครื่องนี้เท่านั้น</b> และ<b>ไม่ได้สำรองบน cloud อัตโนมัติ</b> ' +
      'ควรกด “ส่งออกข้อมูล” เป็นระยะ แล้วเก็บไฟล์ไว้ที่ Files/iCloud Drive ของคุณ</div>';
    if (!standalone) {
      h += '<div class="notice">ตอนนี้เปิดผ่าน Safari ธรรมดา — iPhone อาจล้างข้อมูลเว็บที่ไม่ได้เปิดนาน แนะนำให้ Add to Home Screen แล้วเปิดจากไอคอน</div>';
    }
    h += '<div class="card"><h3>ส่งออก (Export)</h3><p class="muted small">ได้ไฟล์ .json ตั้งชื่อตามวันที่ ที่รวมท่า แผน ประวัติ และการตั้งค่า</p>' +
      '<button type="button" class="btn primary" data-action="export">ส่งออกข้อมูล</button></div>';
    h += '<div class="card"><h3>กู้คืน (Import)</h3><p class="muted small">เลือกไฟล์สำรอง แอปจะตรวจไฟล์และแสดงสรุปก่อน จะไม่ทับข้อมูลเดิมถ้าคุณยังไม่ยืนยัน</p>' +
      '<button type="button" class="btn" data-action="import-pick">เลือกไฟล์สำรอง</button></div>';
    h += '<div class="card"><h3>ข้อมูลในเครื่อง</h3>' +
      kv('หน่วยน้ำหนัก', esc(state.settings.unit || 'kg')) +
      kv('สำรองล่าสุด', esc(state.settings.lastBackupAt ? fmtDateTime(state.settings.lastBackupAt) : 'ยังไม่เคยสำรอง')) +
      kv('จำนวน workout ที่จบแล้ว', finished) +
      kv('เวอร์ชันโครงข้อมูล', 'v' + S.SCHEMA_VERSION) +
      kv('เวอร์ชันแอป', esc(APP_VERSION)) +
      kv('ที่เก็บข้อมูลแบบถาวร', state.persisted === true ? 'ขอสิทธิ์แล้ว' : state.persisted === false ? 'เบราว์เซอร์ยังไม่รับรอง' : 'ไม่ทราบ') +
      '</div>';
    h += '<div class="card"><h3>อัปเดตแอป</h3><p class="muted small">ถ้ามีเวอร์ชันใหม่ จะมีแถบแจ้งด้านบน แอปไม่รีโหลดเองกลางการจด</p>' +
      '<button type="button" class="btn" data-action="check-update">ตรวจหาเวอร์ชันใหม่</button></div>';
    return h;
  }
  function kv(k, v) { return '<div class="kv"><span>' + k + '</span><span>' + v + '</span></div>'; }

  /* ---------- Sheet ---------- */

  function openSheet(html) {
    sheetRoot.innerHTML = '<div class="backdrop" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
  }
  function closeSheet() { sheetRoot.innerHTML = ''; sheetCtx = null; }

  function openEditSet(workoutId, entryId, setId) {
    const w = findWorkout(workoutId), entry = findEntry(w, entryId);
    const s = entry && entry.sets.find(function (x) { return x.id === setId; });
    if (!s) return;
    sheetCtx = { type: 'edit', workoutId: workoutId, entryId: entryId, setId: setId, kind: s.kind, status: s.status };
    openSheet(
      '<h3>แก้เซต — ' + esc(entry.exerciseName) + '</h3>' +
      '<div class="field-lbl">ชนิดเซต</div><div class="chips">' +
      '<button type="button" class="chip' + (s.kind === 'working' ? ' on' : '') + '" data-action="es-kind" data-value="working">เซตจริง</button>' +
      '<button type="button" class="chip' + (s.kind === 'warmup' ? ' on' : '') + '" data-action="es-kind" data-value="warmup">Warm-up</button></div>' +
      '<div class="field-lbl">สถานะ</div><div class="chips">' +
      '<button type="button" class="chip' + (s.status === 'completed' ? ' on' : '') + '" data-action="es-status" data-value="completed">ทำแล้ว</button>' +
      '<button type="button" class="chip' + (s.status === 'skipped' ? ' on' : '') + '" data-action="es-status" data-value="skipped">ข้าม</button></div>' +
      '<div class="grid2"><div><div class="field-lbl">น้ำหนัก (kg)</div><input type="text" inputmode="decimal" id="es-weight" value="' + esc(s.weight != null ? fmtNum(s.weight) : '') + '"></div>' +
      '<div><div class="field-lbl">reps</div><input type="text" inputmode="numeric" pattern="[0-9]*" id="es-reps" value="' + esc(s.reps != null ? s.reps : '') + '"></div></div>' +
      '<div class="btn-row"><button type="button" class="btn primary" data-action="es-save">บันทึก</button></div>' +
      '<div class="btn-row"><button type="button" class="btn danger" data-action="es-delete">ลบเซตนี้</button>' +
      '<button type="button" class="btn" data-action="close-sheet">ปิด</button></div>'
    );
  }

  function openSwap(entryId) {
    const w = state.active, entry = findEntry(w, entryId);
    if (!entry) return;
    if (entry.sets.length) {
      openSheet('<h3>เปลี่ยนท่าไม่ได้ตอนนี้</h3><p class="muted">ท่านี้มีเซตที่บันทึกแล้ว ' + entry.sets.length +
        ' เซต ถ้าจะเปลี่ยนท่า ให้แก้/ลบเซตเหล่านั้นก่อน หรือกด “+ เพิ่มท่า” เพื่อจดท่าใหม่แยกต่างหาก ประวัติของสองท่าจะได้ไม่ปนกัน</p>' +
        '<button type="button" class="btn" data-action="close-sheet">เข้าใจแล้ว</button>');
      return;
    }
    const cur = exById(entry.exerciseId);
    const planned = entry.plannedExerciseId ? exById(entry.plannedExerciseId) : null;
    const seen = {};
    seen[entry.exerciseId] = true;
    const subIds = [];
    if (planned && !seen[planned.id]) { subIds.push(planned.id); seen[planned.id] = true; }
    ((cur && cur.subs) || []).concat((planned && planned.subs) || []).forEach(function (id) {
      if (!seen[id] && exById(id) && !exById(id).archived) { subIds.push(id); seen[id] = true; }
    });
    let h = '<h3>เปลี่ยนท่าสำหรับวันนี้</h3><p class="muted small">ไม่แก้แผนหลัก และจะใช้ประวัติของท่าที่เลือกเท่านั้น ไม่ย้ายน้ำหนักข้ามท่า</p>';
    if (subIds.length) {
      h += '<div class="field-lbl">ท่าทดแทน</div>';
      subIds.forEach(function (id) { h += exOption(entryId, exById(id), 'swap-pick'); });
    } else {
      h += '<p class="muted small">ยังไม่มีท่าทดแทนที่ตั้งไว้ (ตั้งได้ในหน้า Exercises ช่วงที่ 2)</p>';
    }
    const others = state.exercises.filter(function (e) { return !e.archived && !seen[e.id]; });
    if (others.length) {
      h += '<div class="field-lbl" style="margin-top:12px">ท่าอื่นทั้งหมด</div>';
      others.forEach(function (e) { h += exOption(entryId, e, 'swap-pick'); });
    }
    h += '<button type="button" class="btn" style="margin-top:12px" data-action="close-sheet">ปิด</button>';
    openSheet(h);
  }

  function exOption(entryId, e, action) {
    return '<button type="button" class="list-btn" data-action="' + action + '" data-entry="' + esc(entryId || '') + '" data-ex="' + esc(e.id) + '">' +
      '<div class="t">' + esc(e.name) + '</div><div class="s">' + esc(e.muscle) + ' · ' + esc(e.equipment) + '</div></button>';
  }

  function openAddEx() {
    let h = '<h3>เพิ่มท่าใน workout นี้</h3>';
    state.exercises.filter(function (e) { return !e.archived; }).forEach(function (e) { h += exOption('', e, 'add-ex-pick'); });
    h += '<button type="button" class="btn" data-action="close-sheet">ปิด</button>';
    openSheet(h);
  }

  /* ---------- การทำงานของปุ่ม ---------- */

  function qIn(entryId, field) {
    return view.querySelector('input[data-entry="' + entryId + '"][data-field="' + field + '"]');
  }

  // อ่านค่าที่พิมพ์/เสนอไว้จากหน้าจอมาเก็บเป็น draft (ยังไม่ใช่ผลจริง)
  function syncDraft(entry) {
    const wEl = qIn(entry.id, 'weight'), rEl = qIn(entry.id, 'reps');
    if (!wEl || !rEl) return;
    const prevKind = entry.draft && entry.draft.kind === 'warmup' ? 'warmup' : 'working';
    entry.draft = {
      kind: prevKind,
      weight: wEl.classList.contains('suggested') ? null : wEl.value,
      reps: rEl.classList.contains('suggested') ? null : rEl.value
    };
  }

  async function confirmSet(entryId, skip) {
    const w = state.active, entry = findEntry(w, entryId);
    if (!entry) return;
    syncDraft(entry);
    const kind = entry.draft && entry.draft.kind === 'warmup' ? 'warmup' : 'working';
    const wEl = qIn(entryId, 'weight'), rEl = qIn(entryId, 'reps');
    let set;
    if (skip) {
      set = { id: S.uid('s'), kind: 'working', status: 'skipped', weight: null, reps: null, at: new Date().toISOString() };
    } else {
      let weight = parseWeight(wEl.value);
      const reps = parseReps(rEl.value);
      if (weight === null && entry.weightMode === 'bodyweight') weight = 0;
      if (weight === null || isNaN(weight)) { toast('ใส่น้ำหนักก่อนกดยืนยัน', { error: true }); wEl.focus(); return; }
      if (isNaN(reps)) { toast('ใส่ reps เป็นตัวเลขเต็ม (1 ขึ้นไป) ก่อนกดยืนยัน', { error: true }); rEl.focus(); return; }
      set = { id: S.uid('s'), kind: kind, status: 'completed', weight: weight, reps: reps, at: new Date().toISOString() };
    }
    const label = skip ? 'ข้ามเซตแล้ว' : 'บันทึกเซตแล้ว: ' + fmtNum(set.weight) + ' kg × ' + set.reps;
    await commitEntryChange(w, entry, label, function () {
      entry.sets.push(set);
      entry.draft = null;
    });
  }

  function bump(entryId, field, dir) {
    const w = state.active, entry = findEntry(w, entryId);
    const ex = entry && exById(entry.exerciseId);
    const input = qIn(entryId, field);
    if (!entry || !input) return;
    let cur = Number(String(input.value).trim().replace(',', '.'));
    if (input.value.trim() === '' || !isFinite(cur)) {
      cur = field === 'reps' && ex && dir > 0 ? Math.max(0, ex.repMin - 1) : 0;
    }
    const step = field === 'weight' ? ((ex && ex.step) || 2.5) : 1;
    let next = +(cur + dir * step).toFixed(2);
    if (next < 0) next = 0;
    if (field === 'reps') next = Math.round(next);
    input.value = fmtNum(next);
    input.classList.remove('suggested');
    syncDraft(entry);
    scheduleSave(w);
  }

  function setKind(entryId, kind) {
    const w = state.active, entry = findEntry(w, entryId);
    if (!entry) return;
    syncDraft(entry);
    entry.draft = entry.draft || { weight: null, reps: null };
    entry.draft.kind = kind;
    if (kind === 'warmup' && entry.draft.weight == null) entry.draft.weight = '';
    if (kind === 'warmup' && entry.draft.reps == null) entry.draft.reps = '';
    scheduleSave(w);
    render();
  }

  async function saveEditedSet() {
    const c = sheetCtx;
    if (!c || c.type !== 'edit') return;
    const w = findWorkout(c.workoutId), entry = findEntry(w, c.entryId);
    const s = entry && entry.sets.find(function (x) { return x.id === c.setId; });
    if (!s) { closeSheet(); return; }
    let weight = null, reps = null;
    if (c.status === 'completed') {
      weight = parseWeight(document.getElementById('es-weight').value);
      reps = parseReps(document.getElementById('es-reps').value);
      if (weight === null && entry.weightMode === 'bodyweight') weight = 0;
      if (weight === null || isNaN(weight)) { toast('ใส่น้ำหนักให้ถูกต้อง', { error: true }); return; }
      if (isNaN(reps)) { toast('ใส่ reps เป็นตัวเลขเต็ม (1 ขึ้นไป)', { error: true }); return; }
    }
    closeSheet();
    await commitEntryChange(w, entry, 'แก้เซตแล้ว', function () {
      s.kind = c.kind;
      s.status = c.status;
      s.weight = weight;
      s.reps = reps;
    });
  }

  async function deleteEditedSet() {
    const c = sheetCtx;
    if (!c) return;
    const w = findWorkout(c.workoutId), entry = findEntry(w, c.entryId);
    if (!entry) { closeSheet(); return; }
    closeSheet();
    await commitEntryChange(w, entry, 'ลบเซตแล้ว', function () {
      entry.sets = entry.sets.filter(function (x) { return x.id !== c.setId; });
    });
  }

  async function swapTo(entryId, exId) {
    const w = state.active, entry = findEntry(w, entryId), ex = exById(exId);
    if (!entry || !ex || entry.sets.length) return;
    const before = clone(entry);
    entry.exerciseId = ex.id;
    entry.exerciseName = ex.name;
    entry.equipment = ex.equipment;
    entry.weightMode = ex.weightMode;
    entry.draft = null;
    entry.target = P.targetForToday(P.findPrevious(state.workouts, entry, w.id));
    closeSheet();
    try { await saveWorkout(w); } catch (e) { Object.assign(entry, before); render(); return; }
    render();
    toast('เปลี่ยนท่าเป็น ' + ex.name + ' เฉพาะวันนี้ (แผนหลักไม่เปลี่ยน)', {
      undo: async function () {
        Object.assign(entry, before);
        try { await saveWorkout(w); } catch (e) { /* แจ้งแล้ว */ }
        render();
      }
    });
  }

  async function addExercise(exId) {
    const w = state.active, ex = exById(exId);
    if (!w || !ex) return;
    const entry = makeEntry(ex, 3, null, w.id);
    w.entries.push(entry);
    closeSheet();
    try { await saveWorkout(w); } catch (e) { w.entries.pop(); render(); return; }
    render();
    toast('เพิ่ม ' + ex.name + ' แล้ว');
  }

  function openFinish() {
    flushSave();
    const w = state.active;
    const done = countCompleted(w);
    const hasDraft = w.entries.some(function (e) { return e.draft && ((e.draft.weight != null && e.draft.weight !== '') || (e.draft.reps != null && e.draft.reps !== '')); });
    if (!done) {
      openSheet('<h3>ยังไม่มีเซตที่บันทึก</h3><p class="muted">ถ้าจบตอนนี้จะไม่มีอะไรเข้าประวัติ ต้องการลบ workout นี้ หรือกลับไปจดต่อ?</p>' +
        '<div class="btn-row"><button type="button" class="btn danger" data-action="discard-confirm">ลบ workout นี้</button>' +
        '<button type="button" class="btn" data-action="close-sheet">กลับไปจดต่อ</button></div>');
      return;
    }
    openSheet('<h3>จบ workout นี้?</h3><p class="muted">บันทึกแล้ว ' + done + ' working sets ใน ' +
      w.entries.filter(function (e) { return P.workingCompleted(e).length; }).length + ' ท่า</p>' +
      (hasDraft ? '<div class="notice">มีค่าที่กรอกไว้แต่ยังไม่กด “ยืนยันเซต” — ค่าเหล่านั้นจะไม่ถูกบันทึกเป็นผลงาน</div>' : '') +
      '<div class="btn-row"><button type="button" class="btn primary" data-action="finish-confirm">จบและเก็บเข้าประวัติ</button>' +
      '<button type="button" class="btn" data-action="close-sheet">กลับไปจดต่อ</button></div>');
  }

  async function finishWorkout() {
    const w = state.active;
    if (!w) return;
    w.entries.forEach(function (e) { e.draft = null; });
    w.status = 'finished';
    w.finishedAt = new Date().toISOString();
    closeSheet();
    try { await saveWorkout(w); } catch (e) { w.status = 'active'; w.finishedAt = null; render(); return; }
    state.active = null;
    state.sub = null;
    render();
    window.scrollTo(0, 0);
    toast('จบ workout แล้ว เก็บเข้าประวัติเรียบร้อย');
  }

  function openDiscard() {
    flushSave();
    const w = state.active;
    const done = countCompleted(w);
    openSheet('<h3>ลบ workout นี้ทิ้ง?</h3><p class="muted">' +
      (done ? 'เซตที่บันทึกไว้ ' + done + ' เซตจะหายไป และกู้คืนไม่ได้' : 'ยังไม่มีเซตที่บันทึก') + '</p>' +
      '<div class="btn-row"><button type="button" class="btn danger" data-action="discard-confirm">ลบ workout นี้</button>' +
      '<button type="button" class="btn" data-action="close-sheet">ไม่ลบ</button></div>');
  }

  async function removeWorkout(id) {
    const w = findWorkout(id);
    if (!w) return;
    closeSheet();
    try { await S.del('workouts', id); } catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, { error: true }); return; }
    state.workouts = state.workouts.filter(function (x) { return x.id !== id; });
    if (state.active && state.active.id === id) state.active = null;
    state.sub = null;
    render();
    window.scrollTo(0, 0);
    toast('ลบ workout แล้ว');
  }

  /* ---------- Export / Import ---------- */

  function backupFileName() { return 'gymlog-backup-' + localDateKey() + '.json'; }

  async function doExport() {
    flushSave();
    let data;
    try { data = await S.exportAll(APP_VERSION); } catch (e) { toast('ส่งออกไม่สำเร็จ: ' + e.message, { error: true }); return false; }
    const json = JSON.stringify(data, null, 2);
    const name = backupFileName();
    let file = null;
    try { file = new File([json], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        await markBackedUp();
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;   // ผู้ใช้ปิดหน้าต่างแชร์
        // ถ้าแชร์ไม่ได้ ลองดาวน์โหลดแทน
      }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    await markBackedUp();
    toast('ส่งออกแล้ว: ' + name);
    return true;
  }

  async function markBackedUp() {
    const iso = new Date().toISOString();
    state.settings.lastBackupAt = iso;
    try { await S.setSetting('lastBackupAt', iso); } catch (e) { /* ไม่สำคัญ */ }
    if (state.tab === 'backup') render();
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(r.error || new Error('อ่านไฟล์ไม่ได้')); };
      r.readAsText(file);
    });
  }

  async function handleImportFile(file) {
    let text, raw;
    try { text = await readFileText(file); } catch (e) { toast('อ่านไฟล์ไม่ได้: ' + e.message, { error: true }); return; }
    try { raw = JSON.parse(text); } catch (e) {
      openSheet('<h3>กู้คืนไม่ได้</h3><p class="muted">ไฟล์นี้ไม่ใช่ JSON ที่อ่านได้</p><button type="button" class="btn" data-action="close-sheet">ปิด</button>');
      return;
    }
    const res = S.validateBackup(raw);
    if (!res.ok) {
      openSheet('<h3>กู้คืนไม่ได้</h3><p class="muted">ไฟล์ไม่ผ่านการตรวจ ข้อมูลเดิมไม่ถูกแตะต้อง</p><ul class="errlist">' +
        res.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' +
        '<button type="button" class="btn" data-action="close-sheet">ปิด</button>');
      return;
    }
    pendingImport = { clean: res.clean, summary: res.summary, fileName: file.name };
    const s = res.summary;
    const curW = state.workouts.length;
    openSheet('<h3>สรุปไฟล์สำรอง</h3>' +
      '<div class="card" style="margin:8px 0">' +
      kv('ไฟล์', esc(file.name)) +
      kv('ส่งออกเมื่อ', esc(fmtDateTime(s.exportedAt))) +
      kv('ท่า', s.exercises) + kv('แผน', s.plans) +
      kv('workout', s.workouts + ' (จบแล้ว ' + s.finishedWorkouts + ')') +
      kv('working sets ที่ทำจริง', s.completedWorkingSets) +
      kv('ช่วงวันที่', s.firstDate ? esc(fmtDate(s.firstDate, true)) + ' – ' + esc(fmtDate(s.lastDate, true)) : '—') +
      '</div>' +
      (res.warnings.length ? '<div class="notice">คำเตือน: ' + esc(res.warnings.slice(0, 3).join(' · ')) + '</div>' : '') +
      '<p class="muted small">ในเครื่องตอนนี้มี ' + state.exercises.length + ' ท่า, ' + state.plans.length + ' แผน, ' + curW + ' workout — เลือกวิธีกู้คืน:</p>' +
      '<button type="button" class="btn" data-action="import-merge">รวมเข้ากับข้อมูลเดิม (เพิ่มเฉพาะที่ยังไม่มี ไม่ทับของเดิม)</button>' +
      '<div style="height:10px"></div>' +
      '<button type="button" class="btn danger" data-action="import-replace-ask">แทนที่ข้อมูลเดิมทั้งหมดด้วยไฟล์นี้</button>' +
      '<div class="btn-row"><button type="button" class="btn ghost" data-action="import-export-first">ส่งออกข้อมูลปัจจุบันก่อน</button>' +
      '<button type="button" class="btn" data-action="import-cancel">ยกเลิก</button></div>');
  }

  function askReplace() {
    const s = pendingImport.summary;
    openSheet('<h3>ยืนยันการแทนที่ข้อมูล</h3><p>ข้อมูลในเครื่องตอนนี้ (' + state.exercises.length + ' ท่า, ' + state.plans.length + ' แผน, ' +
      state.workouts.length + ' workout) จะถูก<b>ลบแล้วแทนที่</b>ด้วยข้อมูลในไฟล์ (' + s.exercises + ' ท่า, ' + s.plans + ' แผน, ' + s.workouts +
      ' workout) กู้คืนข้อมูลเดิมไม่ได้ถ้าไม่ได้ส่งออกไว้</p>' +
      '<div class="btn-row"><button type="button" class="btn danger" data-action="import-replace">แทนที่เลย</button>' +
      '<button type="button" class="btn" data-action="import-cancel">ยกเลิก</button></div>');
  }

  async function reloadAll() {
    flushSave();
    const r = await Promise.all([S.getAll('exercises'), S.getAll('plans'), S.getAll('workouts'), S.getSettings()]);
    state.exercises = r[0]; state.plans = r[1]; state.workouts = r[2]; state.settings = r[3];
    const actives = state.workouts.filter(function (w) { return w.status === 'active'; });
    actives.sort(function (a, b) { return (b.startedAt || '') < (a.startedAt || '') ? -1 : 1; });
    state.active = actives[0] || null;
    state.sub = null;
  }

  async function doImport(mode) {
    if (!pendingImport) return;
    const imp = pendingImport;
    flushSave();
    closeSheet();
    hideToast();
    try {
      if (mode === 'replace') {
        await S.importReplace(imp.clean);
        pendingImport = null;
        await reloadAll();
        state.tab = 'workout';
        if (state.active) state.sub = { name: 'active' };
        render();
        toast('กู้คืนแล้ว: ' + imp.summary.exercises + ' ท่า, ' + imp.summary.plans + ' แผน, ' + imp.summary.workouts + ' workout');
      } else {
        const r = await S.importMerge(imp.clean, { hasLocalActive: !!state.active });
        pendingImport = null;
        await reloadAll();
        render();
        const added = r.added.exercises + r.added.plans + r.added.workouts;
        const skipped = r.skipped.exercises + r.skipped.plans + r.skipped.workouts + r.skippedActive;
        toast('รวมข้อมูลแล้ว: เพิ่ม ' + added + ' รายการ, ข้าม ' + skipped + ' รายการที่มีอยู่แล้ว');
      }
    } catch (e) {
      toast('กู้คืนไม่สำเร็จ ข้อมูลเดิมไม่เปลี่ยน: ' + (e && e.message ? e.message : ''), { error: true });
    }
  }

  /* ---------- อัปเดตแอป (ผู้ใช้กดเอง) ---------- */

  function showUpdateBanner(reg) {
    const b = document.getElementById('update-banner');
    b.innerHTML = '<div class="row"><span>มีเวอร์ชันใหม่ — ข้อมูลที่บันทึกแล้วไม่หาย กดอัปเดตเมื่อสะดวก</span>' +
      '<button type="button" data-action="update-apply">อัปเดตตอนนี้</button></div>';
    b.hidden = false;
    b._reg = reg;
  }

  function applyUpdate() {
    flushSave();
    const b = document.getElementById('update-banner');
    const reg = b._reg || swReg;
    if (reg && reg.waiting) {
      updateRequested = true;
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      location.reload();
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      swReg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    } catch (e) { return; }
    if (swReg.waiting && navigator.serviceWorker.controller) showUpdateBanner(swReg);
    swReg.addEventListener('updatefound', function () {
      const nw = swReg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', function () {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(swReg);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (updateRequested) location.reload();    // รีโหลดเฉพาะเมื่อผู้ใช้กดอัปเดตเอง
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && swReg) swReg.update().catch(function () { });
    });
  }

  async function checkUpdate() {
    if (!swReg) { toast('เบราว์เซอร์นี้ยังไม่ได้เปิดใช้โหมด offline'); return; }
    try { await swReg.update(); } catch (e) { toast('ตรวจไม่ได้ (อาจออฟไลน์อยู่)'); return; }
    await new Promise(function (r) { setTimeout(r, 1500); });
    if (swReg.waiting) { showUpdateBanner(swReg); toast('พบเวอร์ชันใหม่ — กด “อัปเดตตอนนี้” ที่แถบด้านบน'); }
    else if (swReg.installing) toast('กำลังดาวน์โหลดเวอร์ชันใหม่ จะมีแถบแจ้งเมื่อพร้อม');
    else toast('ใช้เวอร์ชันล่าสุดอยู่แล้ว (' + APP_VERSION + ')');
  }

  /* ---------- ตัวจัดการ event ---------- */

  document.addEventListener('click', function (ev) {
    const t = ev.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    const d = t.dataset;
    switch (a) {
      case 'tab':
        state.tab = d.tab; state.sub = null;
        if (d.tab === 'workout' && state.active) state.sub = { name: 'active' };
        render(); window.scrollTo(0, 0); break;
      case 'start-plan': startWorkout(d.plan); break;
      case 'start-free': startWorkout(null); break;
      case 'resume': state.sub = { name: 'active' }; render(); window.scrollTo(0, 0); break;
      case 'back-home': flushSave(); state.sub = null; render(); window.scrollTo(0, 0); break;
      case 'open-detail': state.sub = { name: 'detail', id: d.id }; render(); window.scrollTo(0, 0); break;
      case 'delete-workout':
        openSheet('<h3>ลบ workout นี้ออกจากประวัติ?</h3><p class="muted">ลบแล้วกู้คืนไม่ได้ (ถ้าไม่ได้ส่งออกไว้)</p>' +
          '<div class="btn-row"><button type="button" class="btn danger" data-action="delete-workout-confirm" data-id="' + esc(d.id) + '">ลบ</button>' +
          '<button type="button" class="btn" data-action="close-sheet">ไม่ลบ</button></div>');
        break;
      case 'delete-workout-confirm': removeWorkout(d.id); break;
      case 'confirm-set': confirmSet(d.entry, false); break;
      case 'skip-set': confirmSet(d.entry, true); break;
      case 'bump': bump(d.entry, d.field, Number(d.dir)); break;
      case 'set-kind': setKind(d.entry, d.kind); break;
      case 'more-set': {
        const w = state.active, e = findEntry(w, d.entry);
        if (e) { e.draft = { kind: 'working', weight: null, reps: null }; scheduleSave(w); render(); }
        break;
      }
      case 'edit-set': openEditSet(d.workout, d.entry, d.set); break;
      case 'es-kind':
        if (sheetCtx) { sheetCtx.kind = d.value; sheetRoot.querySelectorAll('[data-action="es-kind"]').forEach(function (b) { b.classList.toggle('on', b.dataset.value === d.value); }); }
        break;
      case 'es-status':
        if (sheetCtx) { sheetCtx.status = d.value; sheetRoot.querySelectorAll('[data-action="es-status"]').forEach(function (b) { b.classList.toggle('on', b.dataset.value === d.value); }); }
        break;
      case 'es-save': saveEditedSet(); break;
      case 'es-delete': deleteEditedSet(); break;
      case 'swap': openSwap(d.entry); break;
      case 'swap-pick': swapTo(d.entry, d.ex); break;
      case 'add-ex': openAddEx(); break;
      case 'add-ex-pick': addExercise(d.ex); break;
      case 'finish': openFinish(); break;
      case 'finish-confirm': finishWorkout(); break;
      case 'discard': openDiscard(); break;
      case 'discard-confirm': removeWorkout(state.active && state.active.id); break;
      case 'close-sheet': closeSheet(); break;
      case 'export': doExport(); break;
      case 'import-pick': document.getElementById('import-file').click(); break;
      case 'import-merge': doImport('merge'); break;
      case 'import-replace-ask': askReplace(); break;
      case 'import-replace': doImport('replace'); break;
      case 'import-export-first': doExport(); break;
      case 'import-cancel': pendingImport = null; closeSheet(); break;
      case 'check-update': checkUpdate(); break;
      case 'update-apply': applyUpdate(); break;
      case 'toast-undo': {
        const fn = toastEl._undo;
        hideToast();
        if (fn) fn();
        break;
      }
      default: break;
    }
  });

  // พิมพ์ในช่องกรอก → เก็บเป็น draft (ยังไม่ใช่ผลงาน) เพื่อให้ปิดแอปแล้วกลับมาไม่หาย
  document.addEventListener('input', function (ev) {
    const t = ev.target;
    if (!t || !t.dataset || !t.dataset.entry || !t.dataset.field || t.tagName !== 'INPUT') return;
    const w = state.active, entry = findEntry(w, t.dataset.entry);
    if (!entry) return;
    t.classList.remove('suggested');
    syncDraft(entry);
    scheduleSave(w);
  });

  document.getElementById('import-file').addEventListener('change', function (ev) {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (f) handleImportFile(f);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('pagehide', flushSave);

  /* ---------- เริ่มต้น ---------- */

  async function boot() {
    try {
      state.settings = await S.init();
      await reloadAll();
    } catch (e) {
      view.innerHTML = '<div class="card"><h3>เปิดฐานข้อมูลไม่ได้</h3><p class="muted">' + esc(e && e.message ? e.message : e) +
        '</p><p class="muted small">ถ้าเปิดใน Private Browsing ให้เปิดใน Safari ปกติ หรือจาก Home Screen</p></div>';
      return;
    }
    if (state.active) state.sub = { name: 'active' };
    render();
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(function (ok) { state.persisted = ok; if (state.tab === 'backup') render(); }).catch(function () { });
    }
    registerServiceWorker();
  }

  boot();

  window.__gymlog = { state: state };   // สำหรับทดสอบ ไม่มีผลต่อผู้ใช้
})();
