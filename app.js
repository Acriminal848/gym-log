/* app.js — การกระทำของผู้ใช้ (session, จดเซต, แผน, ท่า, สำรอง/กู้คืน), เหตุการณ์ และการเริ่มต้นแอป
 * วาดหน้าอยู่ใน views.js, ตัวช่วยกลางอยู่ใน core.js
 */
(function () {
  'use strict';

  const GL = window.GL, S = GL.S, P = GL.P, PG = GL.PG, state = GL.state, V = GL.views;
  const esc = GL.esc, fmtNum = GL.fmtNum, clone = GL.clone;   // APP_VERSION อยู่ใน core.js (ต้องตรงกับ VERSION ใน sw.js)

  const view = document.getElementById('view');
  const tabsEl = document.getElementById('tabs');
  const toastEl = document.getElementById('toast');
  let pendingImport = null, pendingNav = null, swReg = null, updateRequested = false;

  /* ---------- วาดหน้า ---------- */

  function pageHtml() {
    const sub = state.sub;
    switch (state.tab) {
      case 'home':
        if (sub && sub.name === 'session' && state.active) return V.session();
        if (sub && sub.name === 'plan-view') return V.planView(sub.id);
        if (sub && sub.name === 'done') return V.done(sub.id);
        if (sub && sub.name === 'backup') return V.backup();
        return V.home();
      case 'plans': return sub && sub.name === 'plan-edit' ? V.planEdit() : V.plans();
      case 'exercises': return sub && sub.name === 'ex-edit' ? V.exEdit() : V.exercises();
      case 'history':
        if (sub && sub.name === 'detail') return V.workoutDetail(sub.id);
        if (sub && sub.name === 'sum-ex') return V.sumEx(sub.id);
        return V.history();
      default: return V.home();
    }
  }

  function render() {
    const y = window.scrollY;
    tabsEl.innerHTML = V.tabs();
    view.innerHTML = pageHtml();
    window.scrollTo(0, y);
  }
  GL.render = render;

  function top() { window.scrollTo(0, 0); }
  function inSession() { return state.tab === 'home' && state.sub && state.sub.name === 'session'; }

  // เปลี่ยนหน้า/แท็บ — ตรวจฟอร์มที่ยังไม่บันทึกก่อน และไม่แตะ session ที่ค้าง
  function nav(tab, sub) {
    guardDirty(function () {
      if (inSession()) { GL.flushSave(); }
      GL.clearUndo(); state.carry = null;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      state.tab = tab; state.sub = sub || null;
      render(); top();
    });
  }

  function guardDirty(fn) {
    const s = state.sub;
    if (s && s.dirty && (s.name === 'plan-edit' || s.name === 'ex-edit')) {
      pendingNav = fn;
      GL.openSheet('<h3>ทิ้งการแก้ไขที่ยังไม่บันทึก?</h3><p class="muted">สิ่งที่แก้ไว้ในหน้านี้จะหายไป</p>' +
        '<div class="stack"><button type="button" class="btn danger" data-action="discard-edit">ทิ้งการแก้ไข</button>' +
        '<button type="button" class="btn" data-action="keep-edit">กลับไปแก้ต่อ</button></div>');
      return;
    }
    fn();
  }

  /* ---------- session: เริ่ม / เล่นต่อ / จบ / ยกเลิก ---------- */

  function firstIncomplete(w) {
    for (let i = 0; i < w.entries.length; i++) if (GL.pendingCount(w.entries[i]) > 0) return i;
    return Math.max(0, w.entries.length - 1);
  }

  // สร้าง snapshot ของแผนเป็น session ใหม่ (ยังไม่เขียนลงฐานข้อมูล)
  function buildSession(planId) {
    const plan = planId ? GL.planById(planId) : null;
    const now = new Date();
    const w = {
      id: S.uid('w'), date: GL.localDateKey(now), status: 'active',
      startedAt: now.toISOString(), finishedAt: null,
      planId: plan ? plan.id : null,
      planName: plan ? plan.name : 'เลือกท่าเอง',
      entries: []
    };
    let skipped = 0;
    if (plan) {
      plan.items.forEach(function (it) {
        const ex = GL.exById(it.exerciseId);
        if (ex && !ex.archived) w.entries.push(GL.makeEntry(ex, it.sets, ex, w.id));
        else skipped++;
      });
    }
    return { w: w, skipped: skipped };
  }

  async function startSession(planId, mode) {
    GL.hideToast();
    // mode: undefined (ไม่มี session เดิม) | 'replace-empty' | 'keep' | 'discard'
    const old = state.active;
    const built = buildSession(planId);
    const ops = [];
    let fin = null;
    if (old) {
      if (mode === 'keep' && GL.hasData(old)) { fin = GL.finalized(old); ops.push({ store: 'workouts', put: fin }); }
      else ops.push({ store: 'workouts', del: old.id });
    }
    ops.push({ store: 'workouts', put: built.w });
    try { await S.batch(ops); }
    catch (e) { GL.toast('เริ่มไม่สำเร็จ: ' + (e && e.message ? e.message : 'บันทึกไม่ได้'), { error: true }); return; }
    if (old) {
      state.workouts = state.workouts.filter(function (x) { return x.id !== old.id; });
      if (fin) state.workouts.push(fin);
    }
    state.workouts.push(built.w);
    state.active = built.w;
    state.cur = 0;
    GL.closeSheet(); GL.clearUndo(); state.carry = null;
    state.tab = 'home'; state.sub = { name: 'session' };
    render(); top();
    if (built.skipped) GL.toast('ข้าม ' + built.skipped + ' ท่าในแผนที่ถูกเก็บเข้าคลัง/ไม่พบ');
    else if (old && mode === 'replace-empty') GL.toast('แทนที่ session เปล่าเดิมแล้ว (ไม่มีประวัติเกิดขึ้น)');
  }

  function requestStart(planId) {
    const old = state.active;
    if (!old) return startSession(planId);
    if (!GL.hasData(old)) return startSession(planId, 'replace-empty');
    const plan = planId ? GL.planById(planId) : null;
    state.pendingStart = planId || null;
    GL.openSheet(V.startConflictSheet(plan ? plan.name : 'เลือกท่าเอง'));
  }

  async function removeActiveRecord() {
    const w = state.active;
    if (!w) return true;
    try { await S.del('workouts', w.id); }
    catch (e) { GL.toast('ลบไม่สำเร็จ: ' + (e && e.message ? e.message : ''), { error: true }); return false; }
    state.workouts = state.workouts.filter(function (x) { return x.id !== w.id; });
    state.active = null; state.cur = 0; GL.clearUndo(); state.carry = null;
    return true;
  }

  async function cancelSession() {
    GL.flushSave();
    const w = state.active;
    if (!w) { GL.closeSheet(); return; }
    if (!GL.hasData(w)) {
      GL.closeSheet();
      if (await removeActiveRecord()) { state.tab = 'home'; state.sub = null; render(); top(); GL.toast('ยกเลิก session แล้ว — ไม่มีประวัติเกิดขึ้น'); }
      return;
    }
    GL.openSheet(V.discardConfirmSheet(false));
  }

  async function discardConfirm(next) {
    GL.closeSheet();
    if (next) { await startSession(state.pendingStart, 'discard'); return; }
    if (await removeActiveRecord()) { state.tab = 'home'; state.sub = null; render(); top(); GL.toast('ทิ้งผลของ session แล้ว ประวัติที่จบแล้วไม่เปลี่ยน'); }
  }

  function finishRequest() {
    GL.flushSave();
    const w = state.active;
    if (!w) { GL.closeSheet(); return; }
    GL.closeSheet();
    if (!GL.hasData(w)) {   // ไม่มีเซตที่ยืนยัน → ไม่สร้างประวัติเปล่า
      removeActiveRecord().then(function (ok) {
        if (!ok) return;
        state.tab = 'home'; state.sub = null; render(); top();
        GL.toast('ยังไม่มีเซตที่บันทึก จึงไม่เพิ่มประวัติการฝึก');
      });
      return;
    }
    if (GL.pendingSetsTotal(w) > 0) { GL.openSheet(V.finishIncompleteSheet()); return; }
    finishWorkout();
  }

  async function finishWorkout() {
    const w = state.active;
    GL.closeSheet();
    if (!w) return;
    if (!GL.hasData(w)) { finishRequest(); return; }
    const fin = GL.finalized(w);
    try { await S.put('workouts', fin); }
    catch (e) { GL.toast('บันทึกไม่สำเร็จ ลองอีกครั้ง: ' + (e && e.message ? e.message : ''), { error: true }); return; }
    const i = state.workouts.findIndex(function (x) { return x.id === w.id; });
    if (i >= 0) state.workouts[i] = fin; else state.workouts.push(fin);
    state.active = null; state.cur = 0; GL.clearUndo(); state.carry = null;
    state.lastFinishedId = fin.id;
    state.tab = 'home'; state.sub = { name: 'done', id: fin.id };
    render(); top();
  }

  /* ---------- จดเซต ---------- */

  function activeEntry(entryId) { return GL.findEntry(state.active, entryId); }
  function qIn(entryId, p, field) {
    return view.querySelector('input[data-entry="' + entryId + '"][data-pending="' + p + '"][data-field="' + field + '"]');
  }
  function snapEntry(e) { return { sets: clone(e.sets), drafts: clone(e.drafts || []), plannedSets: e.plannedSets }; }
  function restoreEntry(e, s) { e.sets = clone(s.sets); e.drafts = clone(s.drafts); e.plannedSets = s.plannedSets; }

  function stripHtmlOnly() {
    const slot = view.querySelector('.strip-slot');
    if (slot) slot.innerHTML = V.undoStrip();
  }
  function dropUndo() {
    if (state.undo && !state.undo.error) { GL.clearUndo(); const w = state.active; const slot = view.querySelector('.strip-slot'); if (slot && w) slot.innerHTML = V.sessionLine(w); }
  }
  function flagError(el, msg) {
    if (el) { el.classList.add('bad'); el.focus(); }
    GL.setUndo({ label: msg, error: true });
    stripHtmlOnly();
  }

  // แก้ sets ของท่าหนึ่งแล้วบันทึกทันที พร้อมแถบ "ย้อนกลับ" ค้างไว้จนมีการกระทำถัดไป
  async function commit(w, entry, label, mutator) {
    const snap = snapEntry(entry);
    mutator();
    try { await GL.saveWorkout(w); }
    catch (e) {
      restoreEntry(entry, snap);
      GL.setUndo({ label: 'บันทึกไม่สำเร็จ ลองอีกครั้ง — ค่าที่กรอกยังอยู่', error: true });
      render();
      return false;
    }
    GL.setUndo({
      label: label,
      fn: async function () {
        restoreEntry(entry, snap);
        try { await GL.saveWorkout(w); } catch (e) { /* ถ้าไม่สำเร็จจะเห็นตอนโหลดใหม่ */ }
        GL.clearUndo(); render();
      }
    });
    render();
    return true;
  }

  async function confirmSet(entryId, p) {
    if (state.busy) return;
    GL.hideToast();
    const w = state.active, entry = activeEntry(entryId);
    if (!entry) return;
    if (Number(p) !== 0) { flagError(null, 'ยืนยันเซตก่อนหน้าก่อน (หรือกด “ข้ามเซต”)'); return; }
    if (GL.pendingCount(entry) === 0) return;
    const wEl = qIn(entryId, 0, 'weight'), rEl = qIn(entryId, 0, 'reps');
    if (!wEl || !rEl) return;
    let weight = GL.parseWeight(wEl.value);
    const reps = GL.parseReps(rEl.value);
    if (weight === null && entry.weightMode === 'bodyweight') weight = 0;
    if (weight === null || isNaN(weight)) { flagError(wEl, 'ใส่น้ำหนักก่อนกดยืนยัน (ตัวเลข เช่น 62.5)'); return; }
    if (isNaN(reps)) { flagError(rEl, 'ใส่ reps เป็นตัวเลขเต็ม 1 ขึ้นไป ก่อนกดยืนยัน'); return; }
    state.busy = true;
    try {
      const no = GL.workingRows(entry) + 1;
      const set = { id: S.uid('s'), kind: 'working', status: 'completed', weight: weight, reps: reps, at: new Date().toISOString() };
      const ok = await commit(w, entry, 'บันทึกเซต ' + no + ' แล้ว: ' + fmtNum(weight) + ' kg × ' + reps, function () {
        entry.sets.push(set);
        if (entry.drafts && entry.drafts.length) entry.drafts.shift();
      });
      if (ok) {
        state.carry = { entryId: entryId, weight: weight, after: -1 };
        const slot = document.getElementById('carry-slot');
        if (slot) slot.innerHTML = V.carryHtml(entry);
      }
    } finally { state.busy = false; }
  }

  async function skipSet(entryId) {
    if (state.busy) return;
    const w = state.active, entry = activeEntry(entryId);
    if (!entry || GL.pendingCount(entry) === 0) return;
    state.busy = true;
    try {
      const no = GL.workingRows(entry) + 1;
      await commit(w, entry, 'ข้ามเซต ' + no + ' แล้ว (ไม่นับเป็นล้มเหลว)', function () {
        entry.sets.push({ id: S.uid('s'), kind: 'working', status: 'skipped', weight: null, reps: null, at: new Date().toISOString() });
        if (entry.drafts && entry.drafts.length) entry.drafts.shift();
      });
      state.carry = null;
    } finally { state.busy = false; }
  }

  async function moreSet(entryId) {
    const w = state.active, entry = activeEntry(entryId);
    if (!entry) return;
    await commit(w, entry, 'เพิ่มเซตแล้ว (ตอนนี้ ' + ((entry.plannedSets || 0) + 1) + ' เซต)', function () { entry.plannedSets = (entry.plannedSets || 0) + 1; });
  }

  function openWarmup(entryId) {
    GL.openSheet(V.warmupSheet(entryId));
  }
  async function saveWarmup(entryId) {
    const w = state.active, entry = activeEntry(entryId);
    if (!entry) return;
    const wEl = document.getElementById('wu-weight'), rEl = document.getElementById('wu-reps');
    let weight = GL.parseWeight(wEl.value);
    const reps = GL.parseReps(rEl.value);
    if (weight === null && entry.weightMode === 'bodyweight') weight = 0;
    if (weight === null || isNaN(weight)) { GL.toast('ใส่น้ำหนัก warm-up เป็นตัวเลข', { error: true }); wEl.focus(); return; }
    if (isNaN(reps)) { GL.toast('ใส่ reps เป็นตัวเลขเต็ม 1 ขึ้นไป', { error: true }); rEl.focus(); return; }
    GL.closeSheet();
    await commit(w, entry, 'บันทึก warm-up แล้ว: ' + fmtNum(weight) + ' kg × ' + reps, function () {
      let at = entry.sets.findIndex(function (s) { return s.kind === 'working'; });
      if (at < 0) at = entry.sets.length;
      entry.sets.splice(at, 0, { id: S.uid('s'), kind: 'warmup', status: 'completed', weight: weight, reps: reps, at: new Date().toISOString() });
    });
  }

  function bump(entryId, field, dir) {
    const w = state.active, entry = activeEntry(entryId);
    if (!entry || GL.pendingCount(entry) === 0) return;
    const ex = GL.exById(entry.exerciseId);
    const input = qIn(entryId, 0, field);
    if (!input) return;
    let cur = Number(String(input.value).trim().replace(',', '.'));
    if (input.value.trim() === '' || !isFinite(cur)) cur = field === 'reps' && ex && dir > 0 ? Math.max(0, ex.repMin - 1) : 0;
    const step = field === 'weight' ? ((ex && ex.step) || 2.5) : 1;
    let next = +(cur + dir * step).toFixed(2);
    if (next < 0) next = 0;
    if (field === 'reps') next = Math.round(next);
    input.value = fmtNum(next);
    input.classList.remove('sug', 'bad');
    GL.setDraft(entry, 0, field, input.value);
    GL.scheduleSave(w);
    dropUndo();
    if (field === 'weight') { state.carry = { entryId: entryId, weight: next, after: 0 }; const slot = document.getElementById('carry-slot'); if (slot) slot.innerHTML = V.carryHtml(entry); }
  }

  function carryApply(entryId) {
    const w = state.active, entry = activeEntry(entryId), c = state.carry;
    if (!entry || !c || c.entryId !== entryId) return;
    const pend = GL.pendingCount(entry);
    for (let p = c.after + 1; p < pend; p++) GL.setDraft(entry, p, 'weight', fmtNum(c.weight));
    state.carry = null;
    GL.scheduleSave(w);
    dropUndo();
    render();
  }

  /* ----- แก้เซตที่บันทึกแล้ว (ทั้งใน session และประวัติ) ----- */

  function openEditSet(workoutId, entryId, setId) {
    const w = GL.findWorkout(workoutId), entry = GL.findEntry(w, entryId);
    const s = entry && entry.sets.find(function (x) { return x.id === setId; });
    if (!s) return;
    GL.sheetCtx = { type: 'edit', workoutId: workoutId, entryId: entryId, setId: setId, kind: s.kind, status: s.status };
    GL.openSheet(V.editSetSheet(w, entry, s));
  }

  async function saveEditedSet() {
    const c = GL.sheetCtx;
    if (!c || c.type !== 'edit') return;
    const w = GL.findWorkout(c.workoutId), entry = GL.findEntry(w, c.entryId);
    const s = entry && entry.sets.find(function (x) { return x.id === c.setId; });
    if (!s) { GL.closeSheet(); return; }
    let weight = null, reps = null;
    if (c.status === 'completed') {
      weight = GL.parseWeight(document.getElementById('es-weight').value);
      reps = GL.parseReps(document.getElementById('es-reps').value);
      if (weight === null && entry.weightMode === 'bodyweight') weight = 0;
      if (weight === null || isNaN(weight)) { GL.toast('ใส่น้ำหนักให้ถูกต้อง', { error: true }); return; }
      if (isNaN(reps)) { GL.toast('ใส่ reps เป็นตัวเลขเต็ม (1 ขึ้นไป)', { error: true }); return; }
    }
    GL.closeSheet();
    await commit(w, entry, 'แก้เซตแล้ว', function () { s.kind = c.kind; s.status = c.status; s.weight = weight; s.reps = reps; });
  }

  async function deleteEditedSet() {
    const c = GL.sheetCtx;
    if (!c) return;
    const w = GL.findWorkout(c.workoutId), entry = GL.findEntry(w, c.entryId);
    if (!entry) { GL.closeSheet(); return; }
    GL.closeSheet();
    await commit(w, entry, 'ลบเซตแล้ว', function () { entry.sets = entry.sets.filter(function (x) { return x.id !== c.setId; }); });
  }

  /* ----- ท่าทางเลือก (เฉพาะวันนี้) / เพิ่มท่า ----- */

  async function swapTo(entryId, exId) {
    const w = state.active, entry = activeEntry(entryId), ex = GL.exById(exId);
    if (!entry || !ex || ex.id === entry.exerciseId) { GL.closeSheet(); return; }
    const beforeEntries = clone(w.entries), beforeCur = state.cur;
    const hadSets = GL.completedAny(entry).length > 0;
    if (!hadSets) {
      entry.exerciseId = ex.id; entry.exerciseName = ex.name; entry.equipment = ex.equipment; entry.weightMode = ex.weightMode;
      entry.drafts = []; entry.draft = null;
      entry.target = GL.slimTarget(P.suggestTarget(state.workouts, entry, ex, w.id));
    } else {
      // เก็บผลของท่าเดิมไว้ และเปิดท่าใหม่สำหรับเซตที่เหลือ (ไม่แปลงชื่อผลเก่าเป็นท่าใหม่)
      const pend = GL.pendingCount(entry);
      const remaining = pend > 0 ? pend : (entry.plannedSets || 3);
      const planned = entry.plannedExerciseId ? { id: entry.plannedExerciseId, name: entry.plannedExerciseName } : { id: entry.exerciseId, name: entry.exerciseName };
      entry.plannedSets = GL.workingRows(entry);
      entry.drafts = [];
      const ne = GL.makeEntry(ex, remaining, planned, w.id);
      const at = w.entries.indexOf(entry);
      w.entries.splice(at + 1, 0, ne);
      state.cur = at + 1;
    }
    GL.closeSheet();
    try { await GL.saveWorkout(w); }
    catch (e) { w.entries = beforeEntries; state.cur = beforeCur; GL.setUndo({ label: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', error: true }); render(); return; }
    GL.setUndo({
      label: 'เปลี่ยนเป็น ' + ex.name + ' เฉพาะวันนี้ (แผนหลักไม่เปลี่ยน)',
      fn: async function () { w.entries = beforeEntries; state.cur = beforeCur; try { await GL.saveWorkout(w); } catch (e) { /* ignore */ } GL.clearUndo(); render(); }
    });
    state.carry = null;
    render(); top();
  }

  async function addExercise(exId) {
    const w = state.active, ex = GL.exById(exId);
    if (!w || !ex) return;
    const entry = GL.makeEntry(ex, 3, null, w.id);
    w.entries.push(entry);
    GL.closeSheet();
    try { await GL.saveWorkout(w); } catch (e) { w.entries.pop(); GL.setUndo({ label: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', error: true }); render(); return; }
    state.cur = w.entries.length - 1;
    GL.setUndo({ label: 'เพิ่ม ' + ex.name + ' ใน session แล้ว', fn: async function () { w.entries = w.entries.filter(function (e) { return e.id !== entry.id; }); state.cur = Math.max(0, w.entries.length - 1); try { await GL.saveWorkout(w); } catch (e) { /* ignore */ } GL.clearUndo(); render(); } });
    render(); top();
  }

  function goEntry(i) {
    const w = state.active;
    if (!w) return;
    i = Math.max(0, Math.min(w.entries.length - 1, i));
    if (i === state.cur) return;
    state.cur = i; GL.clearUndo(); state.carry = null;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    render(); top();
  }

  /* ---------- ท่า (Exercises) ---------- */

  function newExDraft() {
    return { id: null, name: '', muscle: '', equipment: '', repMin: '8', repMax: '12', step: '2.5', weightMode: 'machine', subs: [], icon: '', note: '', hadHistory: false };
  }
  function exToDraft(e) {
    return {
      id: e.id, name: e.name, muscle: e.muscle || '', equipment: e.equipment || '',
      repMin: String(e.repMin), repMax: String(e.repMax), step: fmtNum(e.step), weightMode: e.weightMode,
      subs: (e.subs || []).slice(), icon: e.icon || '', note: e.note || '', hadHistory: GL.exerciseHasHistory(e.id)
    };
  }

  async function saveExercise() {
    const s = state.sub;
    if (!s || s.name !== 'ex-edit') return;
    const d = s.draft;
    const bad = function (msg) { GL.toast(msg, { error: true }); };
    const name = d.name.trim();
    if (!name) return bad('ใส่ชื่อท่าก่อน');
    const lower = name.toLowerCase();
    if (state.exercises.some(function (e) { return e.id !== d.id && String(e.name).trim().toLowerCase() === lower; })) {
      return bad('มีท่าชื่อ “' + name + '” อยู่แล้ว (รวมท่าที่เก็บเข้าคลัง)');
    }
    const repMin = GL.parseReps(d.repMin), repMax = GL.parseReps(d.repMax);
    if (isNaN(repMin) || isNaN(repMax)) return bad('ช่วง reps ต้องเป็นเลขเต็ม 1 ขึ้นไป');
    if (repMin > repMax || repMax > 100) return bad('reps ต่ำสุดต้องไม่เกิน reps สูงสุด (และไม่เกิน 100)');
    const step = GL.parseWeight(d.step);
    if (step === null || isNaN(step) || step <= 0 || step > 500) return bad('น้ำหนักที่เพิ่มต่อขั้นต้องมากกว่า 0');
    if (GL.WEIGHT_MODE_ORDER.indexOf(d.weightMode) < 0) return bad('เลือกวิธีนับน้ำหนัก');

    const existing = d.id ? GL.exById(d.id) : null;
    const id = d.id || S.uid('ex');
    const rec = {
      id: id, name: name,
      muscle: d.muscle.trim().slice(0, 60) || 'อื่น ๆ',
      equipment: d.equipment.trim().slice(0, 80),
      repMin: repMin, repMax: repMax, step: step, weightMode: d.weightMode,
      subs: d.subs.filter(function (x) { return x !== id && GL.exById(x); }),
      archived: existing ? !!existing.archived : false,
      isSample: false,
      createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString()
    };
    if (d.icon && GL.I.EX_KEYS.indexOf(d.icon) >= 0) rec.icon = d.icon;
    if (d.note && d.note.trim()) rec.note = d.note.trim().slice(0, 300);
    try { await S.put('exercises', rec); } catch (e) { return bad('บันทึกไม่สำเร็จ: ' + (e && e.message ? e.message : '')); }
    if (existing) {
      Object.keys(existing).forEach(function (k) { delete existing[k]; });
      Object.assign(existing, rec);
    } else state.exercises.push(rec);
    state.sub = null;
    render(); top();
    GL.toast('บันทึกท่า “' + name + '” แล้ว');
  }

  async function setExerciseArchived(id, flag) {
    const ex = GL.exById(id);
    if (!ex) return;
    const prev = ex.archived;
    ex.archived = flag;
    try { await S.put('exercises', ex); } catch (e) { ex.archived = prev; GL.toast('บันทึกไม่สำเร็จ', { error: true }); return; }
    state.sub = null;
    render(); top();
    if (flag) {
      const used = GL.plansUsing(id);
      GL.toast('เก็บ “' + ex.name + '” เข้าคลังแล้ว' + (used.length ? ' — อยู่ในแผน ' + used.map(function (p) { return p.name; }).join(', ') + ' จะถูกข้ามตอนเริ่ม' : ''));
    } else GL.toast('นำ “' + ex.name + '” กลับมาใช้แล้ว');
  }

  async function deleteExercise(id) {
    const ex = GL.exById(id);
    GL.closeSheet();
    if (!ex) return;
    if (GL.exerciseHasHistory(id)) { GL.toast('ท่านี้มีประวัติแล้ว ลบไม่ได้ — เก็บเข้าคลังแทน', { error: true }); return; }
    const ops = [{ store: 'exercises', del: id }];
    const newPlans = [], newExs = [];
    state.plans.forEach(function (p) {
      if (p.items.some(function (it) { return it.exerciseId === id; })) {
        const np = clone(p); np.items = np.items.filter(function (it) { return it.exerciseId !== id; });
        newPlans.push(np); ops.push({ store: 'plans', put: np });
      }
    });
    state.exercises.forEach(function (e) {
      if (e.id !== id && (e.subs || []).indexOf(id) >= 0) {
        const ne = clone(e); ne.subs = ne.subs.filter(function (x) { return x !== id; });
        newExs.push(ne); ops.push({ store: 'exercises', put: ne });
      }
    });
    try { await S.batch(ops); } catch (e) { GL.toast('ลบไม่สำเร็จ: ' + (e && e.message ? e.message : ''), { error: true }); return; }
    state.exercises = state.exercises.filter(function (e) { return e.id !== id; });
    newExs.forEach(function (ne) { const i = state.exercises.findIndex(function (e) { return e.id === ne.id; }); if (i >= 0) state.exercises[i] = ne; });
    newPlans.forEach(function (np) { const i = state.plans.findIndex(function (p) { return p.id === np.id; }); if (i >= 0) state.plans[i] = np; });
    state.sub = null;
    render(); top();
    GL.toast('ลบ “' + ex.name + '” แล้ว (เอาออกจากแผนและรายการท่าทางเลือกด้วย)');
  }

  /* ---------- แผน (Plans) ---------- */

  function planDraft(p) {
    return { id: p ? p.id : null, name: p ? p.name : '', focus: p ? (p.focus || '') : '', note: p ? (p.note || '') : '', items: p ? clone(p.items) : [] };
  }

  async function savePlan() {
    const s = state.sub;
    if (!s || s.name !== 'plan-edit') return;
    const d = s.draft;
    const name = d.name.trim();
    if (!name) { GL.toast('ใส่ชื่อวันฝึกก่อน', { error: true }); return; }
    if (!d.items.length) { GL.toast('เพิ่มท่าอย่างน้อย 1 ท่า', { error: true }); return; }
    const existing = d.id ? GL.planById(d.id) : null;
    const rec = {
      id: d.id || S.uid('p'), name: name.slice(0, 120),
      items: d.items.map(function (it) { return { exerciseId: it.exerciseId, sets: it.sets }; }),
      archived: false, isSample: false,
      createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString()
    };
    if (d.focus && d.focus.trim()) rec.focus = d.focus.trim().slice(0, 120);
    if (d.note && d.note.trim()) rec.note = d.note.trim().slice(0, 300);
    try { await S.put('plans', rec); } catch (e) { GL.toast('บันทึกไม่สำเร็จ: ' + (e && e.message ? e.message : ''), { error: true }); return; }
    if (existing) { Object.keys(existing).forEach(function (k) { delete existing[k]; }); Object.assign(existing, rec); } else state.plans.push(rec);
    state.sub = null;
    render(); top();
    GL.toast('บันทึกแผน “' + rec.name + '” แล้ว (มีผลกับ workout ใหม่)');
  }

  async function copyPlan(id) {
    const p = GL.planById(id);
    if (!p) return;
    const rec = clone(p);
    rec.id = S.uid('p'); rec.name = (p.name + ' (คัดลอก)').slice(0, 120); rec.isSample = false; rec.createdAt = new Date().toISOString();
    try { await S.put('plans', rec); } catch (e) { GL.toast('คัดลอกไม่สำเร็จ', { error: true }); return; }
    state.plans.push(rec);
    render();
    GL.toast('คัดลอกเป็น “' + rec.name + '” แล้ว');
  }

  async function deletePlan(id) {
    const p = GL.planById(id);
    GL.closeSheet();
    if (!p) return;
    try { await S.del('plans', id); } catch (e) { GL.toast('ลบไม่สำเร็จ', { error: true }); return; }
    state.plans = state.plans.filter(function (x) { return x.id !== id; });
    state.sub = null;
    render(); top();
    GL.toast('ลบแผน “' + p.name + '” แล้ว (ประวัติไม่หาย)');
  }

  /* ---------- ลบ workout ในประวัติ ---------- */
  async function removeWorkout(id) {
    const w = GL.findWorkout(id);
    GL.closeSheet();
    if (!w || w.status !== 'finished') return;
    try { await S.del('workouts', id); } catch (e) { GL.toast('ลบไม่สำเร็จ: ' + e.message, { error: true }); return; }
    state.workouts = state.workouts.filter(function (x) { return x.id !== id; });
    state.sub = null; GL.clearUndo();
    render(); top();
    GL.toast('ลบ workout ออกจากประวัติแล้ว');
  }

  /* ---------- Export / Import ---------- */

  function backupFileName() { return 'gymlog-backup-' + GL.localDateKey() + '.json'; }

  async function doExport() {
    GL.flushSave();
    let data;
    try { data = await S.exportAll(GL.APP_VERSION); } catch (e) { GL.toast('ส่งออกไม่สำเร็จ: ' + e.message, { error: true }); return false; }
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
      }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    await markBackedUp();
    GL.toast('ส่งออกแล้ว: ' + name);
    return true;
  }

  async function markBackedUp() {
    const iso = new Date().toISOString();
    state.settings.lastBackupAt = iso;
    try { await S.setSetting('lastBackupAt', iso); } catch (e) { /* ไม่สำคัญ */ }
    render();
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
    try { text = await readFileText(file); } catch (e) { GL.toast('อ่านไฟล์ไม่ได้: ' + e.message, { error: true }); return; }
    try { raw = JSON.parse(text); } catch (e) {
      GL.openSheet('<h3>กู้คืนไม่ได้</h3><p class="muted">ไฟล์นี้ไม่ใช่ JSON ที่อ่านได้ ข้อมูลเดิมไม่ถูกแตะต้อง ลองเลือกไฟล์ .json ที่ส่งออกจากแอปนี้</p><button type="button" class="btn" data-action="close-sheet">ปิด</button>');
      return;
    }
    const res = S.validateBackup(raw);
    if (!res.ok) {
      GL.openSheet('<h3>กู้คืนไม่ได้</h3><p class="muted">ไฟล์ไม่ผ่านการตรวจ ข้อมูลเดิมไม่ถูกแตะต้อง</p><ul class="errlist">' +
        res.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' +
        '<button type="button" class="btn" data-action="close-sheet">ปิด</button>');
      return;
    }
    pendingImport = { clean: res.clean, summary: res.summary, fileName: file.name };
    const s = res.summary;
    GL.openSheet('<h3>สรุปไฟล์สำรอง</h3>' +
      '<div class="card" style="margin:8px 0">' +
      GL.kv('ไฟล์', esc(file.name)) + GL.kv('ส่งออกเมื่อ', esc(GL.fmtDateTime(s.exportedAt))) +
      GL.kv('ท่า', s.exercises) + GL.kv('แผน', s.plans) +
      GL.kv('workout', s.workouts + ' (จบแล้ว ' + s.finishedWorkouts + ')') +
      GL.kv('working sets ที่ทำจริง', s.completedWorkingSets) +
      GL.kv('ช่วงวันที่', s.firstDate ? esc(GL.fmtDate(s.firstDate, true)) + ' – ' + esc(GL.fmtDate(s.lastDate, true)) : '—') + '</div>' +
      (res.warnings.length ? '<div class="notice warn">คำเตือน: ' + esc(res.warnings.slice(0, 3).join(' · ')) + '</div>' : '') +
      '<p class="muted small">ในเครื่องตอนนี้มี ' + state.exercises.length + ' ท่า, ' + state.plans.length + ' แผน, ' + GL.finishedWorkouts().length + ' workout ที่จบแล้ว — เลือกวิธีกู้คืน:</p>' +
      '<div class="stack"><button type="button" class="btn primary" data-action="import-merge">รวมเข้ากับข้อมูลเดิม (เพิ่มเฉพาะที่ยังไม่มี ไม่ทับของเดิม)</button>' +
      '<button type="button" class="btn danger" data-action="import-replace-ask">แทนที่ข้อมูลเดิมทั้งหมดด้วยไฟล์นี้</button>' +
      '<button type="button" class="btn" data-action="import-export-first">สำรองข้อมูลปัจจุบันก่อน</button>' +
      '<button type="button" class="btn ghost" data-action="import-cancel">ยกเลิก</button></div>');
  }

  function askReplace() {
    const s = pendingImport.summary;
    GL.openSheet('<h3>ยืนยันการแทนที่ข้อมูล</h3><p>ข้อมูลในเครื่องตอนนี้ (' + state.exercises.length + ' ท่า, ' + state.plans.length + ' แผน, ' +
      GL.finishedWorkouts().length + ' workout ที่จบแล้ว' + (state.active ? ' และ session ที่ค้างอยู่' : '') + ') จะถูก<b>ลบแล้วแทนที่</b>ด้วยข้อมูลในไฟล์ (' + s.exercises + ' ท่า, ' + s.plans + ' แผน, ' + s.workouts +
      ' workout) กู้คืนข้อมูลเดิมไม่ได้ถ้าไม่ได้สำรองไว้</p>' +
      '<div class="stack"><button type="button" class="btn danger solid" data-action="import-replace">แทนที่เลย</button>' +
      '<button type="button" class="btn" data-action="import-cancel">ยกเลิก</button></div>');
  }

  async function reloadAll() {
    GL.flushSave();
    const r = await Promise.all([S.getAll('exercises'), S.getAll('plans'), S.getAll('workouts'), S.getSettings()]);
    state.exercises = r[0]; state.plans = r[1]; state.workouts = r[2]; state.settings = r[3];
    const actives = state.workouts.filter(function (w) { return w.status === 'active'; });
    actives.sort(function (a, b) { return (b.startedAt || '') < (a.startedAt || '') ? -1 : 1; });
    state.active = actives[0] || null;
    state.sub = null;
    state.cur = state.active ? firstIncomplete(state.active) : 0;
    // ค่าที่ยังไม่ยืนยันของ session จากเวอร์ชันเก่า (draft เดี่ยว) ไม่ย้ายมา
    if (state.active) state.active.entries.forEach(function (e) { if (!Array.isArray(e.drafts)) e.drafts = []; });
  }

  async function doImport(mode) {
    if (!pendingImport) return;
    const imp = pendingImport;
    GL.flushSave();
    GL.closeSheet(); GL.hideToast();
    try {
      if (mode === 'replace') {
        await S.importReplace(imp.clean);
        pendingImport = null;
        await reloadAll();
        state.tab = 'home'; state.sub = null; GL.clearUndo();
        render(); top();
        GL.toast('กู้คืนแล้ว: ' + imp.summary.exercises + ' ท่า, ' + imp.summary.plans + ' แผน, ' + imp.summary.workouts + ' workout');
      } else {
        const r = await S.importMerge(imp.clean, { hasLocalActive: !!state.active });
        pendingImport = null;
        const keepActive = state.active, keepCur = state.cur;
        await reloadAll();
        if (keepActive) { state.active = GL.findWorkout(keepActive.id) || state.active; state.cur = keepCur; }
        render();
        const added = r.added.exercises + r.added.plans + r.added.workouts;
        const skipped = r.skipped.exercises + r.skipped.plans + r.skipped.workouts + r.skippedActive;
        GL.toast('รวมข้อมูลแล้ว: เพิ่ม ' + added + ' รายการ, ข้าม ' + skipped + ' รายการที่มีอยู่แล้ว');
      }
    } catch (e) {
      GL.toast('กู้คืนไม่สำเร็จ ข้อมูลเดิมไม่เปลี่ยน: ' + (e && e.message ? e.message : ''), { error: true });
    }
  }

  /* ---------- อัปเดตแอป (ผู้ใช้กดเอง) ---------- */

  function showUpdateBanner(reg) {
    const b = document.getElementById('update-banner');
    b.innerHTML = '<div class="row"><span>มีเวอร์ชันใหม่ — ข้อมูลที่บันทึกแล้วไม่หาย กดอัปเดตเมื่อสะดวก</span>' +
      '<button type="button" data-action="update-apply">อัปเดตตอนนี้</button></div>';
    b.hidden = false; b._reg = reg;
  }
  function applyUpdate() {
    GL.flushSave();
    const b = document.getElementById('update-banner');
    const reg = b._reg || swReg;
    if (reg && reg.waiting) { updateRequested = true; reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }
    else location.reload();
  }
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try { swReg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }); } catch (e) { return; }
    if (!swReg) return;
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
    if (!swReg) { GL.toast('เบราว์เซอร์นี้ยังไม่ได้เปิดใช้โหมด offline'); return; }
    try { await swReg.update(); } catch (e) { GL.toast('ตรวจไม่ได้ (อาจออฟไลน์อยู่)'); return; }
    await new Promise(function (r) { setTimeout(r, 1500); });
    if (swReg.waiting) { showUpdateBanner(swReg); GL.toast('พบเวอร์ชันใหม่ — กด “อัปเดตตอนนี้” ที่แถบด้านบน'); }
    else if (swReg.installing) GL.toast('กำลังดาวน์โหลดเวอร์ชันใหม่ จะมีแถบแจ้งเมื่อพร้อม');
    else GL.toast('ใช้เวอร์ชันล่าสุดอยู่แล้ว (' + GL.APP_VERSION + ')');
  }

  /* ---------- ตัวกรองรายการ (ค้นหา / หมวด) ---------- */

  function applyPickFilter(root) {
    const q = ((root.querySelector('#pick-q') || {}).value || '').trim().toLowerCase();
    const chip = root.querySelector('#pick-chips .chip.on');
    const m = chip ? chip.dataset.v : '';
    let shown = 0;
    root.querySelectorAll('#pick-list .list-btn').forEach(function (b) {
      const ok = (!q || b.dataset.search.indexOf(q) >= 0) && (!m || b.dataset.muscle === m);
      b.hidden = !ok; if (ok) shown++;
    });
    const empty = root.querySelector('#pick-empty');
    if (empty) empty.hidden = shown > 0;
  }

  /* ---------- เหตุการณ์ ---------- */

  document.addEventListener('click', function (ev) {
    const t = ev.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action, d = t.dataset;
    switch (a) {
      case 'tab': nav(d.tab, null); break;
      case 'home': nav('home', null); break;
      case 'plan-view': nav('home', { name: 'plan-view', id: d.plan }); break;
      case 'start-plan': requestStart(d.plan); break;
      case 'start-free': requestStart(null); break;
      case 'resume': GL.closeSheet(); nav('home', { name: 'session' }); break;
      case 'manage': GL.openSheet(V.manageSheet()); break;
      case 'cancel-session': cancelSession(); break;
      case 'discard-confirm': discardConfirm(!!d.next); break;
      case 'finish': finishRequest(); break;
      case 'finish-confirm': finishWorkout(); break;
      case 'conflict-resume': GL.closeSheet(); nav('home', { name: 'session' }); break;
      case 'conflict-keep': startSession(state.pendingStart, 'keep'); break;
      case 'conflict-discard': GL.openSheet(V.discardConfirmSheet(true)); break;
      case 'open-backup': nav('home', { name: 'backup' }); break;
      case 'dismiss-notice':
        delete state.settings.programNotice;
        S.del('settings', 'programNotice').catch(function () { });
        render(); break;

      case 'ex-prev': goEntry(state.cur - 1); break;
      case 'ex-next': goEntry(state.cur + 1); break;
      case 'ex-go': GL.closeSheet(); goEntry(Number(d.i)); break;
      case 'ex-list': if (state.active) GL.openSheet(V.exListSheet()); break;
      case 'confirm-set': confirmSet(d.entry, d.pending); break;
      case 'skip-set': skipSet(d.entry); break;
      case 'more-set': moreSet(d.entry); break;
      case 'add-warmup': openWarmup(d.entry); break;
      case 'warmup-save': saveWarmup(d.entry); break;
      case 'bump': bump(d.entry, d.field, Number(d.dir)); break;
      case 'carry-apply': carryApply(d.entry); break;
      case 'undo': { const u = state.undo; if (u && u.fn) u.fn(); break; }
      case 'edit-set': openEditSet(d.workout, d.entry, d.set); break;
      case 'es-kind':
        if (GL.sheetCtx) { GL.sheetCtx.kind = d.value; document.querySelectorAll('#sheet-root [data-action="es-kind"]').forEach(function (b) { b.classList.toggle('on', b.dataset.value === d.value); }); }
        break;
      case 'es-status':
        if (GL.sheetCtx) { GL.sheetCtx.status = d.value; document.querySelectorAll('#sheet-root [data-action="es-status"]').forEach(function (b) { b.classList.toggle('on', b.dataset.value === d.value); }); }
        break;
      case 'es-save': saveEditedSet(); break;
      case 'es-delete': deleteEditedSet(); break;
      case 'swap': GL.openSheet(V.swapSheet(d.entry)); break;
      case 'swap-pick': swapTo(d.entry, d.ex); break;
      case 'ex-history': GL.openSheet(V.exHistorySheet(d.entry)); break;
      case 'add-ex': GL.openSheet(V.addExSheet()); break;
      case 'add-ex-pick': addExercise(d.ex); break;
      case 'pick-muscle': {
        const root = t.closest('.sheet') || document;
        root.querySelectorAll('#pick-chips .chip').forEach(function (c) { c.classList.toggle('on', c === t); });
        applyPickFilter(root);
        break;
      }
      case 'close-sheet': GL.closeSheet(); break;

      case 'open-detail': nav('history', { name: 'detail', id: d.id }); break;
      case 'his-back': nav('history', null); break;
      case 'his-mode': state.hisMode = d.mode; render(); break;
      case 'delete-workout':
        GL.openSheet('<h3>ลบ workout นี้ออกจากประวัติ?</h3><p class="muted">ลบแล้วกู้คืนไม่ได้ (ถ้าไม่ได้สำรองไว้)</p>' +
          '<div class="stack"><button type="button" class="btn danger solid" data-action="delete-workout-confirm" data-id="' + esc(d.id) + '">ลบ</button>' +
          '<button type="button" class="btn" data-action="close-sheet">ไม่ลบ</button></div>');
        break;
      case 'delete-workout-confirm': removeWorkout(d.id); break;
      case 'sum-view': state.sumView = d.v; render(); break;
      case 'sum-open': nav('history', { name: 'sum-ex', id: d.ex }); break;
      case 'sum-back': nav('history', null); break;

      case 'export': doExport(); break;
      case 'import-pick': document.getElementById('import-file').click(); break;
      case 'import-merge': doImport('merge'); break;
      case 'import-replace-ask': askReplace(); break;
      case 'import-replace': doImport('replace'); break;
      case 'import-export-first': doExport(); break;
      case 'import-cancel': pendingImport = null; GL.closeSheet(); break;
      case 'check-update': checkUpdate(); break;
      case 'update-apply': applyUpdate(); break;
      case 'toast-undo': { const fn = toastEl._undo; GL.hideToast(); if (fn) fn(); break; }
      case 'kb-done': if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); break;

      case 'discard-edit': { GL.closeSheet(); const fn = pendingNav; pendingNav = null; state.sub = null; if (fn) fn(); break; }
      case 'keep-edit': pendingNav = null; GL.closeSheet(); break;

      case 'ex-new': state.sub = { name: 'ex-edit', draft: newExDraft(), dirty: false }; render(); top(); break;
      case 'ex-edit': { const e = GL.exById(d.id); if (e) { state.sub = { name: 'ex-edit', draft: exToDraft(e), dirty: false }; render(); top(); } break; }
      case 'ex-back': guardDirty(function () { state.sub = null; render(); top(); }); break;
      case 'ex-save': saveExercise(); break;
      case 'ex-muscle': state.exMuscle = d.v; render(); break;
      case 'muscle-pick': if (state.sub && state.sub.draft) { state.sub.draft.muscle = d.v; state.sub.dirty = true; render(); } break;
      case 'icon-pick': if (state.sub && state.sub.draft) { state.sub.draft.icon = d.v; state.sub.dirty = true; render(); } break;
      case 'ex-archive': setExerciseArchived(d.id, true); break;
      case 'ex-unarchive': setExerciseArchived(d.id, false); break;
      case 'ex-delete-ask': {
        const e = GL.exById(d.id), used = GL.plansUsing(d.id);
        GL.openSheet('<h3>ลบท่า “' + esc(e ? e.name : '') + '” ?</h3><p class="muted">ท่านี้ยังไม่มีประวัติ จึงลบได้ ' +
          (used.length ? 'จะถูกเอาออกจากแผน ' + esc(used.map(function (p) { return p.name; }).join(', ')) + ' ด้วย' : '') + ' และกู้คืนไม่ได้</p>' +
          '<div class="stack"><button type="button" class="btn danger solid" data-action="ex-delete" data-id="' + esc(d.id) + '">ลบ</button>' +
          '<button type="button" class="btn" data-action="close-sheet">ไม่ลบ</button></div>');
        break;
      }
      case 'ex-delete': deleteExercise(d.id); break;

      case 'plan-new': state.sub = { name: 'plan-edit', draft: planDraft(null), dirty: false }; render(); top(); break;
      case 'plan-new-go': nav('plans', { name: 'plan-edit', draft: planDraft(null), dirty: false }); break;
      case 'plan-edit': { const p = GL.planById(d.id); if (p) { state.sub = { name: 'plan-edit', draft: planDraft(p), dirty: false }; render(); top(); } break; }
      case 'plan-edit-from-view': { const p = GL.planById(d.id); if (p) nav('plans', { name: 'plan-edit', draft: planDraft(p), dirty: false }); break; }
      case 'plan-back': guardDirty(function () { state.sub = null; render(); top(); }); break;
      case 'plan-save': savePlan(); break;
      case 'plan-copy': copyPlan(d.id); break;
      case 'plan-delete-ask': {
        const p = GL.planById(d.id);
        GL.openSheet('<h3>ลบแผน “' + esc(p ? p.name : '') + '” ?</h3><p class="muted">ประวัติที่เคยจดไม่หาย แต่แผนนี้จะกู้คืนไม่ได้</p>' +
          '<div class="stack"><button type="button" class="btn danger solid" data-action="plan-delete" data-id="' + esc(d.id) + '">ลบ</button>' +
          '<button type="button" class="btn" data-action="close-sheet">ไม่ลบ</button></div>');
        break;
      }
      case 'plan-delete': deletePlan(d.id); break;
      case 'pi-add': GL.openSheet(V.planAddExSheet()); break;
      case 'pi-add-pick':
        if (state.sub && state.sub.draft) { state.sub.draft.items.push({ exerciseId: d.ex, sets: 3 }); state.sub.dirty = true; }
        GL.closeSheet(); render(); break;
      case 'pi-sets': case 'pi-up': case 'pi-down': case 'pi-remove': {
        if (!state.sub || !state.sub.draft) break;
        const items = state.sub.draft.items, i = Number(d.i);
        if (a === 'pi-sets') items[i].sets = Math.min(20, Math.max(1, items[i].sets + Number(d.dir)));
        else if (a === 'pi-up' && i > 0) { const x = items[i]; items[i] = items[i - 1]; items[i - 1] = x; }
        else if (a === 'pi-down' && i < items.length - 1) { const x = items[i]; items[i] = items[i + 1]; items[i + 1] = x; }
        else if (a === 'pi-remove') items.splice(i, 1);
        state.sub.dirty = true;
        render();
        break;
      }
      default: break;
    }
  });

  // พิมพ์ในช่องตาราง → เก็บเป็น draft (ยังไม่ใช่ผลจริง) ให้ปิดแอปแล้วกลับมาไม่หาย
  document.addEventListener('input', function (ev) {
    const t = ev.target;
    if (!t || !t.dataset) return;
    if (t.dataset.entry && t.dataset.field && t.tagName === 'INPUT' && t.classList.contains('st-in')) {
      const w = state.active, entry = activeEntry(t.dataset.entry);
      if (!entry) return;
      t.classList.remove('sug', 'bad');
      GL.setDraft(entry, Number(t.dataset.pending), t.dataset.field, t.value);
      GL.scheduleSave(w);
      dropUndo();
      return;
    }
    if (t.dataset.filter === 'pick') { applyPickFilter(t.closest('.sheet') || document); return; }
    if (t.dataset.filter === 'exlist') {
      state.exQuery = t.value;
      const box = document.getElementById('ex-list');
      if (box) box.innerHTML = V.exList();
      return;
    }
    if (t.dataset.filter === 'subs') {
      const q = t.value.trim().toLowerCase();
      document.querySelectorAll('#sub-list .check-row').forEach(function (r) { r.hidden = !!q && r.dataset.search.indexOf(q) < 0; });
      return;
    }
    onFormInput(ev);
  });
  document.addEventListener('change', function (ev) {
    const t = ev.target;
    if (t && t.dataset && t.dataset.entry && t.dataset.field === 'weight' && t.classList.contains('st-in')) {
      const entry = activeEntry(t.dataset.entry);
      const v = GL.parseWeight(t.value);
      if (!entry) return;
      state.carry = v === null || isNaN(v) ? null : { entryId: entry.id, weight: v, after: Number(t.dataset.pending) };
      const slot = document.getElementById('carry-slot');
      if (slot) slot.innerHTML = V.carryHtml(entry);
      return;
    }
    onFormInput(ev);
  });

  // ฟอร์มแก้ท่า/แผน: เก็บค่าที่พิมพ์ไว้ใน draft (ยังไม่บันทึกจริงจนกด “บันทึก”)
  function onFormInput(ev) {
    const t = ev.target;
    if (!t || !t.dataset || !state.sub || !state.sub.draft) return;
    const d = state.sub.draft;
    if (t.dataset.ef) { d[t.dataset.ef] = t.value; state.sub.dirty = true; }
    else if (t.dataset.pf) { d[t.dataset.pf] = t.value; state.sub.dirty = true; }
    else if (t.dataset.efSub) {
      const id = t.dataset.efSub, at = d.subs.indexOf(id);
      if (t.checked && at < 0) d.subs.push(id);
      if (!t.checked && at >= 0) d.subs.splice(at, 1);
      state.sub.dirty = true;
    }
  }

  // Enter/Done บนแป้นพิมพ์ = ปิดแป้นพิมพ์เท่านั้น ไม่ยืนยันเซต
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target && ev.target.tagName === 'INPUT' && ev.target.type !== 'checkbox') {
      ev.preventDefault();
      ev.target.blur();
    }
  });

  /* ---------- แป้นพิมพ์: ปุ่ม "เสร็จ" ตามตำแหน่งของ visualViewport ---------- */
  const kbBar = document.getElementById('kb-bar');
  function updateKb() {
    const vv = window.visualViewport;
    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
    const ae = document.activeElement;
    const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT') && ae.type !== 'checkbox';
    kbBar.classList.toggle('on', !!typing && kb > 80);
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateKb);
    window.visualViewport.addEventListener('scroll', updateKb);
  }
  kbBar.addEventListener('pointerdown', function (e) { e.preventDefault(); });
  document.addEventListener('focusin', function (ev) {
    const t = ev.target;
    if (t && t.classList && t.classList.contains('st-in')) {
      setTimeout(function () { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ } }, 250);
      if (t.select) { try { t.select(); } catch (e) { /* ignore */ } }
    }
    updateKb();
  });
  document.addEventListener('focusout', function () { setTimeout(updateKb, 60); });

  document.getElementById('import-file').addEventListener('change', function (ev) {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (f) handleImportFile(f);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') GL.flushSave();
  });
  window.addEventListener('pagehide', GL.flushSave);

  /* ---------- เริ่มต้น ---------- */

  async function ensureProgram() {
    const res = PG.buildInstall({ exercises: state.exercises, plans: state.plans, workouts: state.workouts, settings: state.settings }, Date.now());
    if (!res) return;
    try { await S.batch(res.ops); } catch (e) { return; }   // ถ้าไม่สำเร็จ จะลองใหม่ตอนเปิดครั้งถัดไป
    await reloadAll();
  }

  async function boot() {
    try {
      state.settings = await S.init();
      await reloadAll();
      await ensureProgram();
    } catch (e) {
      view.innerHTML = '<div class="card"><h3>เปิดฐานข้อมูลไม่ได้</h3><p class="muted">' + esc(e && e.message ? e.message : e) +
        '</p><p class="muted small">ถ้าเปิดใน Private Browsing ให้เปิดใน Safari ปกติ หรือจาก Home Screen</p></div>';
      return;
    }
    state.tab = 'home'; state.sub = null;     // เปิดแอปที่หน้าแรกเสมอ — session ที่ค้างแสดงเป็นแถบ "เล่นต่อ"
    render();
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(function (ok) { state.persisted = ok; }).catch(function () { });
    }
    registerServiceWorker();
  }

  boot();

  window.__gymlog = { state: state, GL: GL };   // สำหรับทดสอบ ไม่มีผลต่อผู้ใช้
})();
