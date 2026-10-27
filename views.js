/* views.js — วาดหน้าจอทั้งหมด (คืนสตริง HTML; ไม่มีการเปลี่ยนข้อมูลในไฟล์นี้)
 * การกระทำอยู่ใน app.js ผ่าน data-action
 */
(function () {
  'use strict';

  const GL = window.GL, P = GL.P, SM = GL.SM, I = GL.I, state = GL.state, V = GL.views;
  const esc = GL.esc, fmtNum = GL.fmtNum;

  const KIND_TAG = { add_weight: 'เพิ่มน้ำหนัก', add_reps: 'เพิ่ม reps', hold: 'ลองซ้ำ', deload: 'ลดน้ำหนัก', mixed: 'น้ำหนักเดียวทุกเซต', incomplete: 'ทำให้ครบเซต', incomparable: 'เทียบไม่ได้' };
  const KIND_CAUTION = { deload: true, mixed: true, incomplete: true, incomparable: true };

  function ico(name, size, cls) { return I.ui(name, size, cls); }
  function exTile(ex, cls) {
    const size = cls === 'lg' ? 54 : cls === 'sm' ? 34 : 42;
    return '<span class="tile ' + (cls || '') + '">' + I.ex(GL.iconKeyFor(ex), size) + '</span>';
  }
  function modeLabel(m) { return GL.WEIGHT_MODE_LABEL[m] || m; }
  function modeShort(m) { return GL.WEIGHT_MODE_SHORT[m] || m; }
  function setsLine(sets) { return sets.map(function (s) { return fmtNum(s.weight) + '×' + s.reps; }).join(' · '); }
  function repRange(ex) { return ex ? ex.repMin + '–' + ex.repMax + ' reps' : ''; }
  function kv(k, v) { return '<div class="kv"><span>' + k + '</span><span>' + v + '</span></div>'; }
  GL.kv = kv;

  /* ---------- แถบเมนูล่าง ---------- */
  V.tabs = function () {
    const items = [['home', 'หน้าแรก', 'home'], ['plans', 'แผน', 'plans'], ['exercises', 'ท่า', 'exercises'], ['history', 'ประวัติ', 'history']];
    return items.map(function (t) {
      const on = state.tab === t[0];
      return '<button type="button" data-action="tab" data-tab="' + t[0] + '"' + (on ? ' class="on" aria-current="page"' : '') + '>' + ico(t[2], 24) + '<span>' + t[1] + '</span></button>';
    }).join('');
  };


  /* ---------- 1.5: ส่วนประกอบของหน้าแรก ---------- */
  function shortPlan(name) { return String(name || '').replace(/^\s*PPL\s*[·\-:]\s*/i, ''); }
  const DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
  const DOW_FULL = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

  // 1.8: แผนรายสัปดาห์ — ช่องถัดไป = ช่องแรกของสัปดาห์นี้ที่ยังไม่ได้ทำ (ดู SM.weekProgress)
  function rotationInfo() {
    const slots = GL.weekSlots();
    const prog = SM.weekProgress(slots.map(function (p) { return p.id; }), state.workouts, GL.localDateKey());
    const last = GL.finishedWorkouts().filter(function (w) { return GL.sessionWorkingCount(w) > 0; })[0] || null;
    const idx = prog.next;
    return {
      rot: slots, prog: prog, complete: prog.complete,
      next: idx == null ? null : { plan: slots[idx], index: idx, after: last },
      start: idx != null ? slots[idx] : (slots[0] || null)    // แผนที่ใช้เป็นปุ่มเริ่มในหน้าที่ไม่ใช่หน้าแรก
    };
  }

  function planMeta(p) {
    const exs = p.items.map(function (it) { return { ex: GL.exById(it.exerciseId), sets: it.sets }; }).filter(function (x) { return x.ex && !x.ex.archived; });
    return { exs: exs, total: exs.reduce(function (n, x) { return n + x.sets; }, 0) };
  }

  function todayCard() {
    const info = rotationInfo();
    if (!info.rot.length) {
      return '<section class="today-card"><div class="tc-title">ยังไม่มีแผนให้เริ่ม</div>' +
        '<div class="btn-row"><button type="button" class="btn primary" data-action="plan-new-go">สร้างแผนแรก</button></div></section>';
    }
    if (!info.next) {
      return '<section class="today-card done" aria-label="ครบสัปดาห์นี้"><div class="tc-kicker">' + ico('check', 18) + 'ครบสัปดาห์นี้แล้ว</div>' +
        '<div class="tc-title">ทำครบ ' + info.prog.slots.length + ' ช่อง</div></section>';
    }
    const p = info.next.plan, m = planMeta(p);
    const today = GL.localDateKey();
    const doneToday = GL.finishedWorkouts().some(function (w) { return w.date === today && GL.sessionSetCount(w) > 0; });
    return '<section class="today-card' + (doneToday ? ' done' : '') + '" aria-label="แผนถัดไป">' +
      '<div class="tc-top"><div class="tc-kicker">' + (doneToday ? ico('check', 18) + 'จดวันนี้แล้ว · ถัดไป' : 'ถัดไป') + '</div>' +
      '<button type="button" class="iconbtn quiet" data-action="plan-view" data-plan="' + esc(p.id) + '" aria-label="ดูรายละเอียดแผน ' + esc(p.name) + '">' + ico('list', 22) + '</button></div>' +
      '<div class="tc-title">' + esc(p.name) + '</div>' +
      '<div class="tc-meta">' + m.exs.length + ' ท่า · ' + m.total + ' เซต</div>' +
      '<div class="pc-icons">' + m.exs.slice(0, 7).map(function (x) { return exTile(x.ex, 'sm'); }).join('') + '</div>' +
      '<div class="btn-row"><button type="button" class="btn' + (doneToday ? '' : ' primary') + '" data-action="start-plan" data-plan="' + esc(p.id) + '">เริ่ม ' + esc(shortPlan(p.name)) + '</button></div></section>';
  }

  function weekCard() {
    const info = rotationInfo();
    const strip = SM.weekStrip(state.workouts, GL.localDateKey());
    const goal = Math.max(info.rot.length, 1);
    let h = '<section class="card week-card" aria-label="สัปดาห์นี้"><div class="wk-head"><h3>สัปดาห์นี้</h3><span class="wk-count"><b>' + info.prog.doneCount + '</b>/' + goal + ' ครั้ง</span><button type="button" class="iconbtn quiet wk-edit" data-action="wk-edit" aria-label="ปรับลำดับแผนในสัปดาห์">' + ico('edit', 20) + '</button></div><div class="wk-strip" role="list">';
    strip.days.forEach(function (d, i) {
      const done = d.sessions.length > 0;
      const names = d.sessions.map(function (x) { return shortPlan(x.planName); }).join(', ');
      const label = DOW_FULL[i] + ' ' + GL.fmtShort(d.key) + ': ' + (done ? 'จดแล้ว ' + names : (d.isToday ? 'วันนี้ ยังไม่ได้จด' : (d.isFuture ? 'ยังไม่ถึง' : 'ไม่ได้จด')));
      h += '<div class="wk-day' + (d.isToday ? ' today' : '') + (done ? ' done' : '') + (d.isFuture ? ' future' : '') + '" role="listitem" aria-label="' + esc(label) + '">' +
        '<span class="wk-dow">' + DOW[i] + '</span><span class="wk-dot">' + (done ? ico('check', 18) : '') + '</span>' +
        '<span class="wk-name">' + (done ? esc(names.length > 6 ? names.slice(0, 5) + '…' : names) : '&nbsp;') + '</span></div>';
    });
    return h + '</div></section>';
  }

  function backupRow() {
    const lb = state.settings.lastBackupAt;
    const fin = GL.finishedWorkouts();
    let days = null, since = 0;
    if (lb) {
      days = Math.max(0, Math.round((Date.now() - new Date(lb).getTime()) / 86400000));
      since = fin.filter(function (w) { return (w.finishedAt || w.date) > lb; }).length;
    }
    const nudge = (!lb && fin.length > 0) || (lb && (days > 14 || since >= 5));
    if (!nudge) return '';   // 1.8: แสดงเฉพาะตอนควรเตือน (สำรองได้จากหน้าตั้งค่าเสมอ)
    const text = lb ? 'สำรองล่าสุด ' + esc(GL.fmtShort(GL.localDateKey(new Date(lb)))) + ' (' + (days === 0 ? 'วันนี้' : days + ' วันก่อน') + ')' : 'ยังไม่เคยสำรองข้อมูล';
    return '<section class="backup-row' + (nudge ? ' nudge' : '') + '"><div class="br-txt"><span>' + text + '</span>' +
      (nudge ? '<small>' + (lb && since >= 5 ? 'มี ' + since + ' session ใหม่ที่ยังไม่ได้สำรอง' : 'ข้อมูลอยู่ในเครื่องนี้เท่านั้น ควรสำรองไว้') + '</small>' : '') + '</div>' +
      '<button type="button" class="btn small' + (nudge ? ' primary' : '') + '" data-action="open-backup">' + ico('backup', 20) + 'สำรอง</button></section>';
  }

  /* ---------- หน้าแรก ---------- */
  V.home = function () {
    let h = '<div class="page-title"><h1>Gym Log</h1><button type="button" class="iconbtn quiet" data-action="open-settings" aria-label="ตั้งค่า">' + ico('settings', 24) + '</button></div>' +
      '<p class="sub">' + esc(GL.fmtDate(GL.localDateKey(), true)) + '</p>';

    const note = state.settings.programNotice;
    if (note) {
      const parts = [];
      if (note.removedExercises || note.removedPlans) parts.push('เอาข้อมูลตัวอย่างที่ไม่เคยใช้ออก ' + (note.removedExercises || 0) + ' ท่า ' + (note.removedPlans || 0) + ' แผน');
      if (note.archivedExercises) parts.push('ท่าตัวอย่างที่เคยมีประวัติ ' + note.archivedExercises + ' ท่า ถูกเก็บเข้าคลัง (ประวัติยังอยู่ครบ)');
      h += '<div class="notice"><b>เพิ่มโปรแกรม PPL ให้แล้ว</b><br>' + esc(parts.join(' · ')) +
        '<div style="margin-top:8px"><button type="button" class="btn small" data-action="dismiss-notice">รับทราบ</button></div></div>';
    }

    if (state.active) {
      const w = state.active, n = GL.sessionSetCount(w);
      h += '<section class="session-bar" aria-label="session ที่ค้างอยู่"><div class="sb-kicker">session ที่ค้างอยู่</div>' +
        '<div class="sb-title">' + esc(w.planName) + '</div>' +
        '<div class="sb-meta">เริ่ม ' + esc(GL.fmtDate(w.date)) + ' · ' + (n ? 'จดแล้ว ' + n + ' เซต' : 'ยังไม่มีเซตที่บันทึก') + '</div>' +
        '<div class="btn-row"><button type="button" class="btn primary" data-action="resume">เล่นต่อ</button>' +
        '<button type="button" class="btn" data-action="manage">จัดการ session</button></div></section>';
    }

    if (!state.active) h += todayCard();
    h += weekCard();

    h += '<div class="home-actions"><button type="button" class="btn" data-action="plans-sheet">' + ico('list', 20) + 'แผนอื่น</button>' +
      '<button type="button" class="btn" data-action="start-free">' + ico('plus', 20) + 'จดอิสระ</button></div>';
    h += backupRow();
    return h;
  };

  // แผ่นเลือกแผนอื่น (แทนรายการ “แผนทั้งหมด” บนหน้าแรก)
  V.plansSheet = function () {
    const plans = GL.sortedPlans();
    let h = '<h3>เลือกแผน</h3>';
    if (!plans.length) h += '<p class="muted">ยังไม่มีแผน</p><button type="button" class="btn primary" data-action="plan-new-go">สร้างแผนแรก</button>';
    plans.forEach(function (p) {
      const m = planMeta(p), last = GL.planLastUsed(p.id);
      h += '<button type="button" class="list-btn plan-row" data-action="plan-view" data-plan="' + esc(p.id) + '">' +
        '<div class="lb-main"><div class="t">' + esc(p.name) + '</div>' +
        '<div class="s">' + m.exs.length + ' ท่า · ' + m.total + ' เซต · ' + (last ? 'ล่าสุด ' + esc(GL.fmtShort(last)) : 'ยังไม่เคยเล่น') + '</div></div>' + ico('chevron', 22, 'chev') + '</button>';
    });
    h += '<div class="btn-row"><button type="button" class="btn ghost" data-action="close-sheet">ปิด</button></div>';
    return h;
  };

  /* ---------- ดูแผน (ยังไม่ใช่ workout) ---------- */
  V.planView = function (id) {
    const p = GL.planById(id);
    if (!p) return '<p class="muted">ไม่พบแผนนี้</p><button type="button" class="btn" data-action="home">กลับหน้าแรก</button>';
    const rows = p.items.map(function (it) { return { ex: GL.exById(it.exerciseId), sets: it.sets }; });
    const total = rows.reduce(function (n, x) { return n + (x.ex && !x.ex.archived ? x.sets : 0); }, 0);
    let h = '<div class="topbar"><button type="button" class="back" data-action="home">' + ico('back', 24) + 'หน้าแรก</button>' +
      '<button type="button" class="btn small" data-action="plan-edit-from-view" data-id="' + esc(p.id) + '">' + ico('edit', 20) + 'แก้ไขแผน</button></div>';
    h += '<h1>' + esc(p.name) + '</h1>';
    h += '<p class="sub">' + (p.focus ? esc(p.focus) + ' · ' : '') + rows.length + ' ท่า · ' + total + ' เซต</p>';
    if (p.note) h += '<div class="ex-note">' + ico('info', 18) + '<span>' + esc(p.note) + '</span></div>';
    h += '<p class="hint">ดูรายละเอียดเฉยๆ ยังไม่เริ่มฝึก — จะเริ่มเมื่อกดปุ่มด้านล่าง</p>';
    rows.forEach(function (x, i) {
      const e = x.ex;
      const subs = e ? (e.subs || []).map(GL.exById).filter(function (s) { return s && !s.archived; }) : [];
      h += '<div class="card" style="display:flex;gap:12px;align-items:center">' + exTile(e, 'lg') +
        '<div style="flex:1;min-width:0"><div class="b" style="overflow-wrap:anywhere">' + (i + 1) + '. ' + esc(e ? e.name : '(ไม่พบท่า)') + '</div>' +
        (e ? '<div class="small muted">' + esc(e.equipment || '') + '</div>' +
          '<div class="small"><b>' + x.sets + ' เซต</b> <span class="muted">· ' + esc(repRange(e)) + '</span>' + (e.archived ? ' <span class="tag warn">เก็บเข้าคลัง — จะถูกข้าม</span>' : '') + '</div>' +
          (subs.length ? '<div class="tiny muted">ท่าทางเลือก: ' + esc(subs.map(function (s) { return s.name; }).join(', ')) + '</div>' : '') : '') +
        '</div></div>';
    });
    h += '<div class="sticky-cta"><button type="button" class="btn primary" data-action="start-plan" data-plan="' + esc(p.id) + '">เริ่มฝึกแผนนี้</button></div>';
    return h;
  };

  /* ---------- session: หน้าจดแบบตารางเดียว ---------- */

  function undoStrip() {
    const u = state.undo;
    if (!u) return '';
    return '<div class="undo-strip' + (u.error ? ' error' : '') + (u.fresh ? ' new' : '') + '" role="status"><span>' + esc(u.label) + '</span>' +
      (u.fn ? '<button type="button" data-action="undo">' + ico('undo', 18) + 'ย้อนกลับ</button>' : '') + '</div>';
  }
  V.undoStrip = undoStrip;

  function entryStatus(e) {
    const done = GL.workingRows(e), pend = GL.pendingCount(e);
    return { done: done, pend: pend, complete: pend === 0 && GL.completedAny(e).length > 0 };
  }

  // 1.8: ไม่แสดงบรรทัด “ทั้ง session…” แล้ว (ความคืบหน้าอยู่ที่หัวหน้าจอ) — ช่องนี้ใช้แสดง Undo ชั่วคราวเท่านั้น
  function sessionLine() { return ''; }
  function sessionProgress(w) {
    const done = GL.sessionWorkingCount(w);
    const total = w.entries.reduce(function (n, e) { return n + GL.workingRows(e) + GL.pendingCount(e); }, 0);
    return done + ' / ' + total + ' เซต';
  }

  V.sessionLine = sessionLine;

  V.session = function () {
    const w = state.active;
    if (!w) return V.home();
    if (state.cur >= w.entries.length) state.cur = Math.max(0, w.entries.length - 1);
    if (state.cur < 0) state.cur = 0;
    const n = GL.sessionSetCount(w);
    let h = '<div class="s-head"><button type="button" class="back btn ghost small" style="padding:0 8px 0 2px" data-action="home">' + ico('back', 24) + 'หน้าแรก</button>' +
      '<div class="s-title">' + esc(w.planName) + '<small>' + esc(sessionProgress(w)) + '</small></div>' +
      '<button type="button" class="btn small quiet" data-action="manage">' + ico('more', 20) + 'จัดการ</button></div>';

    if (!w.entries.length) {
      h += '<div class="strip-slot">' + undoStrip() + '</div>';
      h += '<div class="card"><h3>ยังไม่มีท่าใน session นี้</h3><p class="muted">เลือกท่าที่จะเล่นจากคลังท่า</p></div>' +
        '<button type="button" class="btn primary" data-action="add-ex">' + ico('plus', 22) + 'เพิ่มท่า</button>' +
        '<div class="btn-row"><button type="button" class="btn danger" data-action="cancel-session">ยกเลิก session นี้</button></div>';
      return h;
    }

    const total = w.entries.length, i = state.cur, entry = w.entries[i];
    h += '<div class="s-nav"><button type="button" class="iconbtn" data-action="ex-prev" aria-label="ท่าก่อนหน้า"' + (i === 0 ? ' disabled' : '') + '>' + ico('back', 22) + '</button>' +
      '<button type="button" class="pos" data-action="ex-list" aria-label="รายการท่าใน session">ท่า ' + (i + 1) + ' / ' + total + ico('list', 20) + '</button>' +
      '<button type="button" class="iconbtn" data-action="ex-next" aria-label="ท่าถัดไป"' + (i === total - 1 ? ' disabled' : '') + '>' + ico('chevron', 22) + '</button></div>';
    h += '<div class="strip-slot">' + (undoStrip() || sessionLine(w)) + '</div>';
    h += entryBlock(w, entry, i === total - 1);
    return h;
  };

  // แผ่น ⓘ ของเป้าหมาย: เหตุผล + คำแนะนำ + คำอธิบายตัวเลขสีเทา (ที่เดียว ไม่แปะบนหน้าจด)
  V.targetInfoSheet = function (entryId) {
    const w = state.active, entry = w && w.entries.filter(function (e) { return e.id === entryId; })[0];
    if (!entry) return '<p class="muted">ไม่พบท่านี้</p><button type="button" class="btn" data-action="close-sheet">ปิด</button>';
    const ex = GL.exById(entry.exerciseId), t = entry.target;
    const prev = P.findPrevious(state.workouts, entry, w.id);
    let h = '<h3>เป้าหมายวันนี้</h3>';
    h += '<p class="muted small">นับน้ำหนัก: ' + esc(modeLabel(entry.weightMode)) + ' · ' + esc(entry.equipment || 'ไม่ระบุอุปกรณ์') + '</p>';
    if (t && t.weight != null) h += '<p><b>' + esc(fmtNum(t.weight)) + ' kg × ' + esc(t.reps) + ' ทุกเซต</b></p>';
    h += '<p>' + esc(t && t.reason ? t.reason : (prev ? 'ไม่มีตัวเลขที่เสนอสำหรับท่านี้' : 'ยังไม่เคยเล่นท่านี้ จึงไม่มีตัวเลขเสนอ — กรอกน้ำหนักเริ่มต้นเอง')) + '</p>';
    if (prev && prev.comparable) {
      const pa = P.analyzeSets(prev.entry.sets, ex);
      if (pa.warn) h += coachNote('ครั้งก่อน: ' + pa.text);
    }
    h += '<p class="hint">ตัวเลขสีเทาในช่องคือค่าที่เสนอ ยังไม่นับเป็นผลจนกว่าจะกดวงกลมยืนยัน แก้น้ำหนัก/reps ได้เองเสมอ</p>';
    h += '<div class="btn-row"><button type="button" class="btn" data-action="close-sheet">ปิด</button></div>';
    return h;
  };

  function coachNote(text) {
    return '<div class="coach-note">' + ico('info', 18) + '<span>' + esc(text) + '</span></div>';
  }

  function entryBlock(w, entry, isLast) {
    const ex = GL.exById(entry.exerciseId);
    const swapped = entry.plannedExerciseId && entry.plannedExerciseId !== entry.exerciseId;
    const id = esc(entry.id);
    let h = '<section data-entry-card="' + id + '">';

    h += '<div class="ex-head">' + exTile(ex, 'lg') + '<div class="eh-main"><h1>' + esc(entry.exerciseName) + '</h1>' +
      '<div class="meta">' + esc(entry.equipment || 'ไม่ระบุอุปกรณ์') + (ex && ex.muscle ? ' · ' + esc(ex.muscle) : '') + ' · ' + esc(repRange(ex)) + '</div>' +
      (swapped ? '<div style="margin-top:4px"><span class="tag lav">ท่าทางเลือกวันนี้ · แทน ' + esc(entry.plannedExerciseName || '') + '</span></div>' : '') +
      '</div></div>';
    if (ex && ex.note) h += '<div class="ex-note">' + ico('info', 18) + '<span>' + esc(ex.note) + '</span></div>';
    h += '<div class="ex-actions"><button type="button" class="btn quiet" data-action="swap" data-entry="' + id + '">' + ico('swap', 20) + 'เปลี่ยนท่า</button>' +
      '<button type="button" class="btn quiet" data-action="ex-history" data-entry="' + id + '">' + ico('history', 20) + 'ประวัติท่านี้</button>' +
      '<button type="button" class="iconbtn quiet" data-action="entry-menu" data-entry="' + id + '" aria-label="จัดการท่านี้">' + ico('more', 22) + '</button></div>';

    // เป้าหมายวันนี้ (1.8: บรรทัดเดียว — เหตุผล/คำแนะนำอยู่หลังไอคอน ⓘ)
    const prev = P.findPrevious(state.workouts, entry, w.id);
    const t = entry.target;
    h += '<div class="target"><div class="tg-row"><div class="tg-main"><span class="tg-lbl">เป้า</span> ';
    if (t && t.weight != null) {
      h += '<span class="tg-val">' + esc(fmtNum(t.weight)) + ' kg × ' + esc(t.reps) + '</span> <span class="small muted">ทุกเซต</span>';
    } else if (!prev) {
      h += '<span class="tg-none">ท่าใหม่ · กรอกน้ำหนักเอง</span>';
    } else {
      h += '<span class="tg-none">กรอกน้ำหนักเอง</span>';
    }
    h += '</div><button type="button" class="iconbtn quiet tg-info" data-action="target-info" data-entry="' + id + '" aria-label="ดูเหตุผลของเป้าหมาย">' + ico('info', 22) + '</button></div>';
    const tagTxt = t && KIND_TAG[t.kind];
    if (prev) {
      h += '<p class="prevline">ครั้งก่อน ' + esc(GL.fmtShort(prev.workout.date)) + ' · ' + esc(GL.agoLabel(prev.workout.date)) +
        (prev.comparable ? '' : ' · ' + esc(prev.entry.equipment || '—') + ' (เทียบน้ำหนักกันไม่ได้)') +
        (tagTxt ? ' <span class="tag ' + (KIND_CAUTION[t.kind] ? 'warn' : 'mint') + '">' + esc(tagTxt) + '</span>' : '') + '</p>';
    }
    h += '</div>';

    h += setsTable(w, entry, prev, ex);
    const live = P.analyzeSets(entry.sets, ex);
    if (live.warn) h += '<div class="coach-note live" role="status">' + ico('info', 18) + '<span>' + esc(live.short) + '</span></div>';

    const st = entryStatus(entry);
    h += '<div id="carry-slot">' + carryHtml(entry) + '</div>';
    if (st.pend > 0) {
      const sNo = st.done + 1;
      const step = ex && ex.step ? fmtNum(ex.step) : '2.5';
      h += '<div class="adjust" role="group" aria-label="ปรับเซต ' + sNo + '">' +
        '<button type="button" class="btn" data-action="bump" data-entry="' + id + '" data-field="weight" data-dir="-1" aria-label="ลดน้ำหนัก ' + esc(step) + ' กิโลกรัม">' + ico('minus', 18) + esc(step) + ' kg</button>' +
        '<button type="button" class="btn" data-action="bump" data-entry="' + id + '" data-field="weight" data-dir="1" aria-label="เพิ่มน้ำหนัก ' + esc(step) + ' กิโลกรัม">' + ico('plus', 18) + esc(step) + ' kg</button>' +
        '<button type="button" class="btn" data-action="bump" data-entry="' + id + '" data-field="reps" data-dir="-1" aria-label="ลด 1 rep">' + ico('minus', 18) + '1 rep</button>' +
        '<button type="button" class="btn" data-action="bump" data-entry="' + id + '" data-field="reps" data-dir="1" aria-label="เพิ่ม 1 rep">' + ico('plus', 18) + '1 rep</button></div>';
    }
    h += '<div class="mini-row"><button type="button" class="btn" data-action="more-set" data-entry="' + id + '">' + ico('plus', 18) + 'เพิ่มเซต</button>' +
      '<button type="button" class="btn" data-action="add-warmup" data-entry="' + id + '">' + ico('plus', 18) + 'Warm-up</button>' +
      (st.pend > 0 ? '<button type="button" class="btn" data-action="skip-set" data-entry="' + id + '">' + ico('skip', 18) + 'ข้ามเซต ' + (st.done + 1) + '</button>' : '') + '</div>';

    if (st.pend === 0 && GL.completedAny(entry).length) {
      h += '<div class="done-note">' + ico('check', 22) + 'ครบ ' + st.done + ' เซตของท่านี้แล้ว</div>';
      if (!isLast) h += '<div class="sticky-cta"><button type="button" class="btn primary cta-next" data-action="ex-next">ท่าถัดไป' + ico('chevron', 22) + '</button></div>';
      else h += '<div class="sticky-cta"><button type="button" class="btn primary cta-next" data-action="finish">จบและเก็บผลการฝึก</button></div>';
    }
    h += '</section>';
    return h;
  }

  function carryHtml(entry) {
    const c = state.carry;
    if (!c || c.entryId !== entry.id) return '';
    const pend = GL.pendingCount(entry);
    let differs = false;
    for (let p = c.after + 1; p < pend; p++) {
      const d = GL.draftOf(entry, p);
      const wv = GL.parseWeight(d.weight);
      if (wv === null || isNaN(wv) || Math.abs(wv - c.weight) > 0.001) differs = true;
    }
    if (!differs) return '';
    return '<div class="carry"><button type="button" class="btn" data-action="carry-apply" data-entry="' + esc(entry.id) + '">เซตที่เหลือใช้น้ำหนักนี้ (' + esc(fmtNum(c.weight)) + ' kg)</button></div>';
  }
  V.carryHtml = carryHtml;

  function setsTable(w, entry, prev, ex) {
    const id = esc(entry.id);
    const prevSets = prev && prev.comparable ? P.workingCompleted(prev.entry) : [];
    const unit = entry.weightMode === 'dumbbell_each' ? 'kg/ข้าง' : 'kg';
    let h = '<div class="sets" role="group" aria-label="ตารางจดเซต"><div class="st-head"><span></span><span>เซต</span><span class="h-prev">ครั้งก่อน</span><span>น้ำหนัก ' + unit + '</span><span>reps</span></div>';
    let wi = 0;
    entry.sets.forEach(function (s) {
      const ed = 'data-action="edit-set" data-workout="' + esc(w.id) + '" data-entry="' + id + '" data-set="' + esc(s.id) + '"';
      if (s.kind === 'warmup') {
        h += '<div class="st-row warm done"><button type="button" class="cf done" ' + ed + ' aria-label="แก้ warm-up บันทึกแล้ว">' + ico('check', 24) + '</button>' +
          '<span class="st-n">W</span><span class="st-prev">warm-up</span>' +
          '<button type="button" class="st-val" ' + ed + '>' + esc(fmtNum(s.weight)) + '</button><button type="button" class="st-val" ' + ed + '>' + esc(s.reps) + '</button></div>';
        return;
      }
      wi++;
      const pv = prevSets[wi - 1];
      const prevTxt = pv ? fmtNum(pv.weight) + ' × ' + pv.reps : '—';
      if (s.status === 'skipped') {
        h += '<div class="st-row skipped"><button type="button" class="cf skip" ' + ed + ' aria-label="เซต ' + wi + ' ถูกข้าม แตะเพื่อแก้">' + ico('minus', 22) + '</button>' +
          '<span class="st-n">' + wi + '</span><span class="st-prev">' + esc(prevTxt) + '</span><button type="button" class="st-val st-skiptxt" style="grid-column:4 / span 2;font-size:17px" ' + ed + '>ข้ามเซตนี้ · แตะเพื่อแก้</button></div>';
        return;
      }
      h += '<div class="st-row done' + (state.justSet === s.id ? ' just' : '') + '"><button type="button" class="cf done" ' + ed + ' aria-label="เซต ' + wi + ' บันทึกแล้ว แตะเพื่อแก้">' + ico('check', 24) + '</button>' +
        '<span class="st-n">' + wi + '</span><span class="st-prev">' + esc(prevTxt) + '</span>' +
        '<button type="button" class="st-val" ' + ed + '>' + esc(fmtNum(s.weight)) + '</button><button type="button" class="st-val" ' + ed + '>' + esc(s.reps) + '</button></div>';
    });
    const pend = GL.pendingCount(entry);
    let hasSug = false;
    for (let p = 0; p < pend; p++) {
      const no = wi + 1 + p;
      const pv = prevSets[no - 1];
      const prevTxt = pv ? fmtNum(pv.weight) + ' × ' + pv.reps : '—';
      const d = GL.draftOf(entry, p);
      const cur = p === 0;
      if ((!d.weightTouched && d.weight !== '') || (!d.repsTouched && d.reps !== '')) hasSug = true;
      h += '<div class="st-row" data-pending-row="' + p + '"><button type="button" class="cf ' + (cur ? 'cur' : 'later') + '" data-action="confirm-set" data-entry="' + id + '" data-pending="' + p + '"' +
        (cur ? '' : ' aria-disabled="true"') + ' aria-label="' + (cur ? 'ยืนยันเซต ' + no : 'เซต ' + no + ' ยืนยันได้หลังเซตก่อนหน้า') + '"></button>' +
        '<span class="st-n">' + no + '</span><span class="st-prev">' + esc(prevTxt) + '</span>' +
        '<input type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" class="st-in' + (d.weightTouched ? '' : ' sug') + '" data-entry="' + id + '" data-pending="' + p + '" data-field="weight" value="' + esc(d.weight) + '" placeholder="kg" aria-label="น้ำหนัก เซต ' + no + '">' +
        '<input type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" class="st-in' + (d.repsTouched ? '' : ' sug') + '" data-entry="' + id + '" data-pending="' + p + '" data-field="reps" value="' + esc(d.reps) + '" placeholder="reps" aria-label="reps เซต ' + no + '"></div>';
    }
    if (!entry.sets.length && !pend) h += '<p class="muted small" style="padding:8px 0">ไม่มีแถวเซต — กด “เพิ่มเซต”</p>';
    h += '</div>';
    return h;
  }

  /* ---------- แผ่นในหน้า session ---------- */

  V.exListSheet = function () {
    const w = state.active;
    let h = '<h3>ท่าใน session นี้</h3><p class="muted small">แตะเพื่อไปที่ท่านั้น — ข้ามลำดับได้</p>';
    w.entries.forEach(function (e, i) {
      const st = entryStatus(e), ex = GL.exById(e.exerciseId);
      h += '<button type="button" class="list-btn" data-action="ex-go" data-i="' + i + '">' + exTile(ex, 'sm') +
        '<div class="lb-main"><div class="t">' + (i + 1) + '. ' + esc(e.exerciseName) + (i === state.cur ? ' <span class="tag lav">กำลังดู</span>' : '') + '</div>' +
        '<div class="s">' + (st.complete ? 'ครบ ' + st.done + ' เซต' : 'จดแล้ว ' + GL.completedAny(e).length + ' · เหลือ ' + st.pend + ' เซต') + '</div></div>' +
        (st.complete ? ico('check', 22) : ico('chevron', 22, 'chev')) + '</button>';
    });
    h += '<button type="button" class="btn" style="margin-top:8px" data-action="add-ex">' + ico('plus', 20) + 'เพิ่มท่าใน session นี้</button>' +
      '<div class="btn-row"><button type="button" class="btn ghost" data-action="close-sheet">ปิด</button></div>';
    return h;
  };

  V.manageSheet = function (fromHome) {
    const w = state.active, n = GL.sessionSetCount(w);
    const ex = w.entries.filter(function (e) { return GL.completedAny(e).length; }).length;
    let h = '<h3>จัดการ session</h3><div class="card" style="margin:6px 0 10px"><div class="b">' + esc(w.planName) + '</div>' +
      '<div class="small muted">เริ่ม ' + esc(GL.fmtDate(w.date)) + ' · ' + (n ? 'จดแล้ว ' + n + ' เซต ใน ' + ex + ' ท่า' : 'ยังไม่มีเซตที่บันทึก') + '</div></div>';
    h += '<div class="stack"><button type="button" class="btn primary" data-action="resume">เล่นต่อ</button>' +
      '<button type="button" class="btn" data-action="finish">จบและเก็บผลการฝึก</button>' +
      '<button type="button" class="btn danger" data-action="cancel-session">ยกเลิก session นี้</button>' +
      '<button type="button" class="btn ghost" data-action="close-sheet">ปิด</button></div>';
    h += '<p class="hint">' + (n ? '“จบและเก็บผลการฝึก” จะเก็บเฉพาะเซตที่ยืนยันแล้ว · “ยกเลิก” จะทิ้งผลของ session นี้เท่านั้น ประวัติที่จบแล้วไม่เปลี่ยน'
      : 'ยังไม่มีเซตที่บันทึก — การยกเลิกไม่สร้างประวัติ') + '</p>';
    return h;
  };

  V.startConflictSheet = function (planName) {
    const w = state.active, n = GL.sessionSetCount(w);
    return '<h3>มี session ที่จดไว้แล้ว</h3><p class="muted">“' + esc(w.planName) + '” จดแล้ว ' + n + ' เซต — จะเริ่ม “' + esc(planName) + '” ต้องเลือกว่าจะทำอย่างไรกับของเดิม</p>' +
      '<div class="stack"><button type="button" class="btn primary" data-action="conflict-resume">กลับไปเล่นของเดิม</button>' +
      '<button type="button" class="btn" data-action="conflict-keep">เก็บผลเดิมแล้วเริ่มใหม่</button>' +
      '<button type="button" class="btn danger" data-action="conflict-discard">ยกเลิกผลเดิมแล้วเริ่มใหม่</button></div>' +
      '<p class="hint">“เก็บผลเดิม” บันทึกเฉพาะเซตที่ยืนยันแล้วเข้าประวัติ · การปิดหน้าต่างนี้ไม่เปลี่ยนอะไรเลย</p>';
  };
  V.discardConfirmSheet = function (startNext) {
    const w = state.active, n = GL.sessionSetCount(w);
    const ex = w.entries.filter(function (e) { return GL.completedAny(e).length; }).length;
    return '<h3>ทิ้งผลของ session นี้?</h3><p>“' + esc(w.planName) + '” จดไว้ <b>' + n + ' เซต ใน ' + ex + ' ท่า</b> — จะหายไปและกู้คืนไม่ได้</p>' +
      '<p class="hint">เฉพาะ session ที่ค้างนี้เท่านั้น ประวัติที่จบแล้วไม่เปลี่ยน</p>' +
      '<div class="stack"><button type="button" class="btn danger solid" data-action="discard-confirm" data-next="' + (startNext ? '1' : '') + '">' + (startNext ? 'ทิ้งผลเดิมแล้วเริ่มใหม่' : 'ทิ้งผลของ session นี้') + '</button>' +
      '<button type="button" class="btn" data-action="close-sheet">กลับไปเล่นต่อ</button></div>';
  };
  V.finishIncompleteSheet = function () {
    const w = state.active, pend = GL.pendingSetsTotal(w);
    const exs = w.entries.filter(function (e) { return GL.pendingCount(e) > 0; }).length;
    const n = GL.sessionSetCount(w);
    let extra = '';
    if (GL.hasDraftValues(w)) extra = '<div class="notice">มีค่าที่กรอกไว้แต่ยังไม่กดยืนยัน — ค่าเหล่านั้นจะไม่ถูกบันทึกเป็นผลงาน</div>';
    return '<h3>ยังจดไม่ครบ</h3><p>ยังไม่ได้จด <b>' + pend + ' เซต</b> ใน ' + exs + ' ท่า — เซตที่ไม่ได้จดจะไม่ถูกนับเป็นล้มเหลวหรือข้าม</p>' + extra +
      '<div class="stack"><button type="button" class="btn primary" data-action="close-sheet">กลับไปจดต่อ</button>' +
      '<button type="button" class="btn" data-action="finish-confirm">จบโดยเก็บเฉพาะที่บันทึกแล้ว (' + n + ' เซต)</button></div>';
  };

  V.editSetSheet = function (w, entry, s) {
    const c = GL.sheetCtx;
    const isW = s.kind === 'working';
    let idx = 0;
    if (isW) { const at = entry.sets.indexOf(s); entry.sets.forEach(function (x, k) { if (x.kind === 'working' && k <= at) idx++; }); }
    return '<h3>แก้เซต ' + (isW ? idx : 'warm-up') + ' · ' + esc(entry.exerciseName) + '</h3>' +
      '<div class="grid2"><div><div class="field-lbl">น้ำหนัก (kg)</div><input class="field" type="text" inputmode="decimal" id="es-weight" value="' + esc(s.weight != null ? fmtNum(s.weight) : '') + '"></div>' +
      '<div><div class="field-lbl">reps</div><input class="field" type="text" inputmode="numeric" pattern="[0-9]*" id="es-reps" value="' + esc(s.reps != null ? s.reps : '') + '"></div></div>' +
      '<details' + (c && (c.status === 'skipped') ? ' open' : '') + '><summary>ตัวเลือกเพิ่มเติม (ชนิด / ข้าม)</summary>' +
      '<div class="field-lbl">ชนิดเซต</div><div class="chips"><button type="button" class="chip' + (s.kind === 'working' ? ' on' : '') + '" data-action="es-kind" data-value="working">เซตจริง</button>' +
      '<button type="button" class="chip' + (s.kind === 'warmup' ? ' on' : '') + '" data-action="es-kind" data-value="warmup">Warm-up</button></div>' +
      '<div class="field-lbl">สถานะ</div><div class="chips"><button type="button" class="chip' + (s.status === 'completed' ? ' on' : '') + '" data-action="es-status" data-value="completed">ทำแล้ว</button>' +
      '<button type="button" class="chip' + (s.status === 'skipped' ? ' on' : '') + '" data-action="es-status" data-value="skipped">ข้าม</button></div></details>' +
      '<div class="stack" style="margin-top:12px"><button type="button" class="btn primary" data-action="es-save">บันทึกการแก้ไข</button>' +
      '<div class="btn-row" style="margin-top:0"><button type="button" class="btn danger" data-action="es-delete">ลบเซตนี้</button>' +
      '<button type="button" class="btn" data-action="close-sheet">ปิด</button></div></div>' +
      '<p class="hint">เซตหลังจากนี้จะเลื่อนขึ้นถ้าลบ · การแก้ไขมีปุ่ม “ย้อนกลับ” ค้างไว้ให้</p>';
  };

  V.warmupSheet = function (entryId) {
    return '<h3>เพิ่ม warm-up</h3><p class="muted small">warm-up ไม่นับเป็น working set และไม่ใช้คำนวณ progression</p>' +
      '<div class="grid2"><div><div class="field-lbl">น้ำหนัก (kg)</div><input class="field" type="text" inputmode="decimal" id="wu-weight" placeholder="kg"></div>' +
      '<div><div class="field-lbl">reps</div><input class="field" type="text" inputmode="numeric" pattern="[0-9]*" id="wu-reps" placeholder="reps"></div></div>' +
      '<div class="stack" style="margin-top:12px"><button type="button" class="btn primary" data-action="warmup-save" data-entry="' + esc(entryId) + '">บันทึก warm-up</button>' +
      '<button type="button" class="btn" data-action="close-sheet">ปิด</button></div>';
  };

  function pickRow(action, attrs, ex, subText) {
    return '<button type="button" class="list-btn" data-action="' + action + '" ' + attrs + ' data-search="' + esc((ex.name + ' ' + (ex.muscle || '') + ' ' + (ex.equipment || '')).toLowerCase()) + '" data-muscle="' + esc(ex.muscle || '') + '">' +
      exTile(ex, 'sm') + '<div class="lb-main"><div class="t">' + esc(ex.name) + '</div><div class="s">' + esc(subText != null ? subText : (ex.muscle || '') + ' · ' + (ex.equipment || '')) + '</div></div>' + ico('chevron', 20, 'chev') + '</button>';
  }

  // ตัวเลือกท่าแบบค้นหา/กรองหมวด (ใช้ใน เพิ่มท่าในแผน/ในหน้าจด/เลือกจากคลัง)
  V.pickerList = function (action, attrsFor, list, opts) {
    opts = opts || {};
    const muscles = [];
    list.forEach(function (e) { if (e.muscle && muscles.indexOf(e.muscle) < 0) muscles.push(e.muscle); });
    let h = '<div class="search">' + ico('search', 22) + '<input class="field" type="search" id="pick-q" data-filter="pick" placeholder="ค้นหาชื่อท่า" autocomplete="off" aria-label="ค้นหาท่า"></div>';
    if (muscles.length > 1) {
      h += '<div class="chips scroll" id="pick-chips"><button type="button" class="chip on" data-action="pick-muscle" data-v="">ทั้งหมด</button>' +
        muscles.map(function (m) { return '<button type="button" class="chip" data-action="pick-muscle" data-v="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') + '</div>';
    }
    h += '<div id="pick-list">';
    list.forEach(function (e) { h += pickRow(action, attrsFor(e), e, opts.subText ? opts.subText(e) : null); });
    h += '</div><div id="pick-empty" hidden><p class="muted small">ไม่พบท่าที่ตรงกับที่ค้นหา</p>' +
      (opts.createCtx ? '<button type="button" class="btn" data-action="qx-open" data-ctx="' + esc(opts.createCtx) + '"' + (opts.createAttrs || '') + '>' + ico('plus', 20) + 'สร้างเป็นท่าใหม่</button>' : '') + '</div>';
    return h;
  };

  V.addExSheet = function () {
    const list = state.exercises.filter(function (e) { return !e.archived; }).sort(GL.byName);
    return '<h3>เพิ่มท่าใน session นี้</h3><p class="muted small">วางต่อจากท่าที่กำลังดู และพาไปที่ท่านั้นทันที</p>' +
      '<div class="stepper-row"><span class="sr-lbl">จำนวนเซต</span><div class="mini-stepper">' +
      '<button type="button" data-action="add-sets" data-dir="-1" aria-label="ลดจำนวนเซต">' + ico('minus', 18) + '</button>' +
      '<span id="add-sets-val"><b>' + state.addSets + '</b> เซต</span>' +
      '<button type="button" data-action="add-sets" data-dir="1" aria-label="เพิ่มจำนวนเซต">' + ico('plus', 18) + '</button></div></div>' +
      '<button type="button" class="btn primary create-cta" data-action="qx-open" data-ctx="session">' + ico('plus', 20) + 'สร้างท่าใหม่ (ไม่มีในรายการ)</button>' +
      V.pickerList('add-ex-pick', function (e) { return 'data-ex="' + esc(e.id) + '"'; }, list, { createCtx: 'session' }) +
      '<div class="btn-row"><button type="button" class="btn" data-action="close-sheet">ปิด</button></div>';
  };

  V.swapSheet = function (entryId) {
    const w = state.active, entry = GL.findEntry(w, entryId);
    const cur = GL.exById(entry.exerciseId);
    const planned = entry.plannedExerciseId ? GL.exById(entry.plannedExerciseId) : null;
    const ctx = GL.sheetCtx && GL.sheetCtx.type === 'swap' ? GL.sheetCtx : { mode: 'rest' };
    const mode = ctx.mode === 'fix' ? 'fix' : 'rest';
    const seen = {}; seen[entry.exerciseId] = true;
    const subIds = [];
    if (planned && !seen[planned.id]) { subIds.push(planned.id); seen[planned.id] = true; }
    ((cur && cur.subs) || []).concat((planned && planned.subs) || []).forEach(function (id) {
      const e = GL.exById(id);
      if (!seen[id] && e && !e.archived) { subIds.push(id); seen[id] = true; }
    });
    const doneN = GL.completedAny(entry).length, pend = GL.pendingCount(entry);
    const hasSets = doneN > 0;
    const attrsMode = ' data-mode="' + mode + '"';
    let h = '<h3>เปลี่ยนท่า · ' + esc(entry.exerciseName) + '</h3>';
    if (hasSets) {
      h += '<div class="seg mode-seg" role="tablist">' +
        '<button type="button" role="tab" data-action="swap-mode" data-mode="rest" aria-selected="' + (mode === 'rest') + '" class="' + (mode === 'rest' ? 'on' : '') + '">เปลี่ยนเฉพาะเซตที่เหลือ</button>' +
        '<button type="button" role="tab" data-action="swap-mode" data-mode="fix" aria-selected="' + (mode === 'fix') + '" class="' + (mode === 'fix' ? 'on' : '') + '">จดผิดท่า · แก้ที่จดไปแล้ว</button></div>';
      h += mode === 'fix'
        ? '<p class="hint">ย้ายเซตที่จดไว้แล้ว <b>' + doneN + ' เซต</b> (น้ำหนักและ reps เดิมคงอยู่) ไปเป็นท่าที่เลือก — ใช้เมื่อจดลงผิดท่า</p>'
        : '<p class="hint">เซตที่จดไว้ ' + doneN + ' เซตของ “' + esc(entry.exerciseName) + '” คงไว้ตามเดิม · เซตที่เหลือ ' + (pend > 0 ? pend : (entry.plannedSets || 3)) + ' เซตจะไปจดกับท่าที่เลือก (ใช้ประวัติของท่านั้น ไม่ย้ายเป้าหมายข้ามท่า)</p>';
    } else {
      h += '<p><span class="tag lav">เฉพาะวันนี้</span> <span class="muted small">ไม่แก้แผนหลัก</span></p>' +
        '<p class="hint">ใช้ประวัติของท่าที่เลือกเท่านั้น ไม่ย้ายเป้าหมายน้ำหนักจากท่าเดิม</p>';
    }
    function opt(e) {
      const lp = GL.lastPlayed(e.id, e.equipment, e.weightMode);
      const sub = (e.equipment || '') + ' · นับ ' + modeShort(e.weightMode) + ' · ' +
        (lp ? 'เล่นล่าสุด ' + GL.fmtShort(lp.date) + (lp.sameBasis ? '' : ' (คนละอุปกรณ์)') : 'ยังไม่เคยเล่น (ช่องน้ำหนักจะว่าง)');
      return pickRow('swap-pick', 'data-entry="' + esc(entryId) + '" data-ex="' + esc(e.id) + '"' + attrsMode, e, sub);
    }
    h += '<button type="button" class="btn create-cta" data-action="qx-open" data-ctx="swap" data-entry="' + esc(entryId) + '"' + attrsMode + '>' + ico('plus', 20) + 'สร้างท่าใหม่แล้วใช้ท่านั้นเลย</button>';
    if (subIds.length) {
      h += '<div class="field-lbl">ท่าทางเลือกที่ตั้งไว้</div>' + subIds.map(function (id) { return opt(GL.exById(id)); }).join('');
    } else {
      h += '<div class="notice">ท่านี้ยังไม่ได้ตั้งท่าทางเลือกไว้ — เลือกจากคลังท่าด้านล่างได้เลย (ไม่สุ่มแนะนำข้ามกล้ามเนื้อ/เครื่องให้)</div>';
    }
    const others = state.exercises.filter(function (e) { return !e.archived && !seen[e.id]; }).sort(GL.byName);
    if (others.length) {
      h += '<details' + (subIds.length ? '' : ' open') + '><summary>เลือกจากคลังท่าทั้งหมด (' + others.length + ')</summary>' +
        V.pickerList('swap-pick', function (e) { return 'data-entry="' + esc(entryId) + '" data-ex="' + esc(e.id) + '"' + attrsMode; }, others, {
          subText: function (e) { return (e.muscle || '') + ' · ' + (e.equipment || ''); },
          createCtx: 'swap', createAttrs: ' data-entry="' + esc(entryId) + '"' + attrsMode
        }) + '</details>';
    }
    h += '<div class="btn-row"><button type="button" class="btn" data-action="close-sheet">ปิด</button></div>';
    return h;
  };

  V.entrySheet = function (entryId) {
    const entry = GL.findEntry(state.active, entryId);
    const n = GL.completedAny(entry).length;
    return '<h3>จัดการท่านี้</h3><p class="muted small">' + esc(entry.exerciseName) + (n ? ' · จดแล้ว ' + n + ' เซต' : '') + '</p>' +
      '<div class="stack">' +
      '<button type="button" class="btn" data-action="swap" data-entry="' + esc(entryId) + '">' + ico('swap', 20) + 'เปลี่ยนท่า / แก้ท่าที่จดผิด</button>' +
      '<button type="button" class="btn" data-action="add-ex">' + ico('plus', 20) + 'เพิ่มท่าต่อจากท่านี้</button>' +
      '<button type="button" class="btn danger" data-action="entry-remove-ask" data-entry="' + esc(entryId) + '">' + ico('trash', 20) + 'ลบท่านี้ออกจาก session</button>' +
      '<button type="button" class="btn ghost" data-action="close-sheet">ปิด</button></div>';
  };

  V.removeEntrySheet = function (entryId) {
    const entry = GL.findEntry(state.active, entryId);
    const n = GL.completedAny(entry).length;
    return '<h3>ลบ “' + esc(entry.exerciseName) + '” ออกจาก session?</h3>' +
      '<p>ท่านี้จดไว้ <b>' + n + ' เซต</b> — ลบแล้วเซตเหล่านี้จะหายจาก session นี้ (มีปุ่ม “ย้อนกลับ” ให้ทันทีหลังลบ)</p>' +
      '<div class="stack"><button type="button" class="btn danger solid" data-action="entry-remove-confirm" data-entry="' + esc(entryId) + '">ลบท่านี้และเซตที่จดไว้</button>' +
      '<button type="button" class="btn" data-action="swap-fix" data-entry="' + esc(entryId) + '">จดผิดท่า? ย้ายเซตไปเป็นท่าอื่นแทน</button>' +
      '<button type="button" class="btn ghost" data-action="close-sheet">ไม่ลบ</button></div>';
  };

  /* ฟอร์มสร้างท่าแบบเร็ว (ในหน้าจด / ตอนเปลี่ยนท่า / ตอนแก้แผน) — ค่าอื่นตั้งให้ก่อน แก้ละเอียดได้ในแท็บ ท่า */
  V.quickExSheet = function () {
    const c = GL.sheetCtx, q = c.qx;
    const ctxLabel = c.ctx === 'plan' ? 'และเพิ่มเข้าแผนเลย' : (c.ctx === 'swap' ? 'และใช้ท่านี้แทนเลย' : 'และเพิ่มเข้า session เลย');
    return '<h3>สร้างท่าใหม่</h3>' +
      '<div class="field-lbl">ชื่อท่า</div><input class="field" type="text" id="qx-name" data-qx="name" maxlength="120" autocomplete="off" placeholder="เช่น T-Bar Row (Close Grip)" value="' + esc(q.name) + '">' +
      '<div class="field-lbl">กล้ามเนื้อหลัก</div><div class="chips wrap" id="qx-muscles">' +
      GL.muscleOptions().map(function (m) { return '<button type="button" class="chip' + (q.muscle === m ? ' on' : '') + '" data-action="qx-muscle" data-v="' + esc(m) + '" aria-pressed="' + (q.muscle === m) + '">' + esc(m) + '</button>'; }).join('') + '</div>' +
      '<div class="field-lbl">อุปกรณ์</div><div class="chips wrap" id="qx-equips">' +
      GL.QX_EQUIP.map(function (e, i) { return '<button type="button" class="chip' + (q.equipKey === i ? ' on' : '') + '" data-action="qx-equip" data-i="' + i + '" aria-pressed="' + (q.equipKey === i) + '">' + esc(e[0]) + '</button>'; }).join('') + '</div>' +
      '<input class="field" type="text" id="qx-equip-text" data-qx="equipment" maxlength="80" autocomplete="off" placeholder="ชื่อเครื่อง (ไม่บังคับ) เช่น เครื่อง T-Bar" value="' + esc(q.equipment) + '">' +
      '<p class="hint" id="qx-hint">' + esc(GL.qxHint(q)) + '</p>' +
      '<div class="stack" style="margin-top:10px"><button type="button" class="btn primary" data-action="qx-save">สร้างท่า ' + ctxLabel + '</button>' +
      '<button type="button" class="btn ghost" data-action="qx-cancel">ยกเลิก</button></div>';
  };

  /* ---------- ตั้งค่า ---------- */
  function switchRow(key, title, sub) {
    const on = GL.setting(key) !== false;
    return '<div class="switch-row"><div class="sw-txt">' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' +
      '<button type="button" class="switch" role="switch" aria-checked="' + on + '" aria-label="' + esc(title) + '" data-action="set-toggle" data-key="' + key + '"></button></div>';
  }
  V.settings = function () {
    const rest = GL.setting('restSeconds');
    const isPreset = GL.REST_PRESETS.indexOf(rest) >= 0;
    const custom = !!(state.sub && state.sub.customRest) || !isPreset;
    let h = '<div class="topbar"><button type="button" class="back" data-action="home">' + ico('back', 24) + 'หน้าแรก</button></div><h1>ตั้งค่า</h1>';
    h += '<section class="card"><h3>ตัวจับเวลาพัก</h3>' +
      switchRow('restAuto', 'เริ่มนับเวลาพักอัตโนมัติ', 'นับต่อเมื่อกดยืนยันเซต') +
      '<div class="fl">เวลาพักเริ่มต้น</div><div class="rest-presets" role="group" aria-label="เวลาพักเริ่มต้น">' +
      GL.REST_PRESETS.map(function (v) {
        return '<button type="button" class="chip' + (!custom && rest === v ? ' on' : '') + '" data-action="set-rest" data-v="' + v + '" aria-pressed="' + (!custom && rest === v) + '">' + v + ' วินาที</button>';
      }).join('') +
      '<button type="button" class="chip' + (custom ? ' on' : '') + '" data-action="set-rest-custom" aria-pressed="' + custom + '">กำหนดเอง</button></div>';
    if (custom) {
      h += '<div class="rest-custom"><input type="text" id="rest-custom" inputmode="numeric" pattern="[0-9]*" value="' + esc(rest) + '" aria-label="เวลาพักกำหนดเอง (วินาที)"><span class="muted">วินาที (10–900)</span></div>';
    }
    h += '<p class="hint">ตอนพัก กด −15 / +15 ที่แถบจับเวลาได้ · ตั้งเวลาพักเฉพาะบางท่าได้ที่แท็บ ท่า → แก้ไขท่า</p>' +
      switchRow('restSound', 'เสียงเตือนเมื่อพักครบ', 'เสียงสั้น ๆ (เครื่องที่ปิดเสียงจะไม่ดัง)') + '</section>';
    h += '<section class="card"><h3>ประวัติ</h3>' + switchRow('showTargets', 'แสดงเส้นอ้างอิงเซตต่อสัปดาห์', 'ขีดที่ 10 และ 20 เซตต่อกล้ามเนื้อ เป็นแค่เส้นอ้างอิง ไม่ใช่เป้า (ปิดไว้เป็นค่าเริ่มต้น)') + '</section>';
    h += '<section class="card"><h3>หน้าจอ</h3>' + switchRow('keepAwake', 'เปิดจอค้างระหว่างจดเซต', 'กันจอดับตอนพักระหว่างเซต (ใช้แบตเพิ่มเล็กน้อย)') + '</section>';
    h += '<section class="card"><h3>ข้อมูลและแอป</h3><button type="button" class="btn" data-action="open-backup">' + ico('backup', 22) + 'สำรอง / กู้คืนข้อมูล</button>' +
      kv('เวอร์ชันแอป', esc(GL.APP_VERSION)) + '</section>';
    return h;
  };

  V.exHistorySheet = function (entryId) {
    const w = state.active, entry = GL.findEntry(w, entryId);
    const ex = GL.exById(entry.exerciseId);
    const sessions = GL.exerciseSessions(entry.exerciseId, 8);
    const same = sessions.filter(function (r) { return P.sameBasis(r.entry, entry); }).slice(0, 2);
    const other = sessions.filter(function (r) { return !P.sameBasis(r.entry, entry); });
    let h = '<h3>ประวัติ ' + esc(entry.exerciseName) + '</h3><p class="muted small">' + esc(entry.equipment || '') + ' · นับ ' + esc(modeShort(entry.weightMode)) +
      ' · ค่าที่คุณกรอกไว้ในตารางยังอยู่ครบ</p>';
    if (!same.length) h += '<div class="notice">ยังไม่เคยเล่นท่านี้ด้วยอุปกรณ์/วิธีนับนี้</div>';
    same.forEach(function (r) {
      const e = r.entry;
      h += '<div class="card"><div class="b">' + esc(GL.fmtDate(r.workout.date, true)) + ' <span class="muted small">· ' + esc(GL.agoLabel(r.workout.date)) + '</span></div>' +
        '<div class="small muted">' + esc(e.equipment || '') + ' · นับ ' + esc(modeShort(e.weightMode)) + '</div>';
      let k = 0;
      e.sets.forEach(function (s) {
        if (s.status === 'skipped') { if (s.kind === 'working') { k++; h += '<div class="setline"><span class="sl-n">' + k + '</span><span class="sl-txt muted">ข้ามเซตนี้</span></div>'; } return; }
        const label = s.kind === 'warmup' ? 'W' : String(++k);
        h += '<div class="setline"><span class="sl-n">' + label + '</span><span class="sl-txt">' + esc(fmtNum(s.weight)) + ' kg × ' + esc(s.reps) + (s.kind === 'warmup' ? ' <span class="muted small">(warm-up)</span>' : '') + '</span></div>';
      });
      if (e.target && e.target.weight != null) {
        h += '<details><summary>เป้าหมายที่แอปเคยเสนอวันนั้น</summary><p class="small">' + esc(fmtNum(e.target.weight)) + ' kg × ' + esc(e.target.reps) + ' reps' +
          (e.target.reason ? ' — ' + esc(e.target.reason) : '') + '</p><p class="hint">เป็นคำแนะนำ ไม่ใช่ผลที่ทำจริง</p></details>';
      }
      h += '</div>';
    });
    if (other.length) h += '<p class="hint">เคยเล่นท่านี้ด้วยอุปกรณ์/วิธีนับอื่นอีก ' + other.length + ' ครั้ง (ไม่แสดงรวม เพราะน้ำหนักเทียบกันตรง ๆ ไม่ได้ — ดูได้ที่แท็บประวัติ → ท่า)</p>';
    h += '<div class="btn-row"><button type="button" class="btn" data-action="close-sheet">ปิด</button></div>';
    return h;
  };

  /* ---------- จบการฝึก ---------- */
  // ติดนิ่ง 3 ครั้งติด นับรวม session นี้ (ใช้ได้ทั้งหน้าสรุปหลังจบและประวัติท่า)
  function stallNow(w, e) { return P.stallStatus(state.workouts, e, null, 3).stalled; }
  V.done = function (id) {
    const w = GL.findWorkout(id);
    if (!w) return '<p class="muted">ไม่พบ workout</p><button type="button" class="btn" data-action="home">กลับหน้าแรก</button>';
    const exs = w.entries.filter(function (e) { return P.workingCompleted(e).length; });
    let h = '<h1>จบการฝึกแล้ว</h1><p class="sub">' + esc(w.planName) + ' · ' + esc(GL.fmtDate(w.date, true)) + '</p>';
    const dur = SM.durationMin(w);
    h += '<div class="stat-row done-stats"><div class="stat"><span>ระยะเวลา</span><b>' + (dur ? dur : '—') + '</b><small>' + (dur ? 'นาที' : 'ไม่มีข้อมูลเวลา') + '</small></div>' +
      '<div class="stat"><span>เซตที่ทำ</span><b>' + GL.sessionWorkingCount(w) + '</b><small>working sets</small></div>' +
      '<div class="stat"><span>ท่าที่เล่น</span><b>' + exs.length + '</b><small>ท่า</small></div></div>';
    const prs = SM.sessionPRs(state.workouts, w.id);
    if (prs.length) {
      h += '<section class="card pr-card"><h3>สถิติใหม่ ' + prs.length + ' ท่า</h3>' + prs.map(function (x) {
        return '<div class="pr-line"><span class="tag pr">◆ PR</span><span><b>' + esc(x.name) + '</b> ' + (x.kind === 'weight'
          ? esc(fmtNum(x.value)) + ' kg <span class="muted small">(เดิม ' + esc(fmtNum(x.prev)) + ')</span>'
          : '1RM โดยประมาณ ' + esc(fmtNum(x.value)) + ' kg <span class="muted small">(เดิม ' + esc(fmtNum(x.prev)) + ')</span>') + '</span></div>';
      }).join('') + '</section>';
    }
    const mus = SM.sessionMuscles(w, GL.exById);
    if (mus.length) {
      h += '<section class="card"><h3>กล้ามเนื้อที่ได้เซตวันนี้</h3><div class="chips wrap">' + mus.map(function (m) { return '<span class="tag">' + esc(m.muscle) + ' · ' + m.sets + ' เซต</span>'; }).join('') + '</div></section>';
    }
    if (!exs.length) h += '<div class="notice">session นี้มีเฉพาะ warm-up ที่บันทึกไว้ ไม่นับเป็น working set</div>';
    exs.forEach(function (e) {
      const ex = GL.exById(e.exerciseId);
      const prev = P.findPrevious(state.workouts, e, w.id);
      const done = P.workingCompleted(e);
      let note = '';
      if (prev && prev.comparable) {
        const pt = P.workingCompleted(prev.entry);
        const top = Math.max.apply(null, done.map(function (s) { return s.weight; }));
        const ptop = Math.max.apply(null, pt.map(function (s) { return s.weight; }));
        if (top > ptop) note = '<span class="tag mint">น้ำหนักสูงสุดเพิ่มจากครั้งก่อน ' + esc(fmtNum(ptop)) + ' → ' + esc(fmtNum(top)) + ' kg</span>';
        else if (top === ptop) note = '<span class="tag">น้ำหนักเท่าครั้งก่อน</span>';
        else note = '<span class="tag warn">น้ำหนักต่ำกว่าครั้งก่อน (' + esc(fmtNum(ptop)) + ' kg)</span>';
      }
      // 1.8: คำแนะนำจาก 1.7 อยู่ที่นี่ (หลังจบ) ไม่แสดงกลางการจด
      const pa = P.analyzeSets(e.sets, ex);
      h += '<div class="card"><div style="display:flex;gap:12px;align-items:center">' + exTile(ex, 'sm') + '<div style="flex:1;min-width:0"><div class="b">' + esc(e.exerciseName) + '</div>' +
        '<div class="small">' + esc(setsLine(done)) + ' <span class="muted">kg×reps</span></div>' + (note ? '<div style="margin-top:4px">' + note + '</div>' : '') + '</div></div>' +
        (pa.warn ? coachNote(pa.text) : '') + (stallNow(w, e) ? coachNote(P.stallStatus(state.workouts, e, null, 3).text) : '') + '</div>';
    });
    h += '<div class="stack" style="margin-top:14px"><button type="button" class="btn primary" data-action="open-detail" data-id="' + esc(w.id) + '">ดูในประวัติ</button>' +
      '<button type="button" class="btn" data-action="home">กลับหน้าแรก</button></div>';
    return h;
  };

  /* ---------- แผน ---------- */
  // 1.8: ลำดับแผนในสัปดาห์ (ช่อง) — ไม่ผูกกับวัน รีเซ็ตทุกวันจันทร์ ซ้ำแผนได้
  function weekEditor() {
    const slots = GL.weekSlots(), custom = GL.weekIsCustom();
    let h = '<section class="card" id="wk-editor"><h3>ลำดับในสัปดาห์</h3>' +
      '<p class="hint">แผนถัดไป = ช่องแรกที่ยังไม่ได้ทำในสัปดาห์นี้ · เริ่มใหม่ทุกวันจันทร์ ไม่ตามทวงช่องที่ข้าม' + (custom ? '' : ' · ตอนนี้ใช้ค่าเริ่มต้น') + '</p>';
    if (!slots.length) h += '<p class="muted">ยังไม่มีแผน</p>';
    slots.forEach(function (p, i) {
      h += '<div class="slot-row"><span class="slot-n">' + (i + 1) + '</span><span class="slot-t">' + esc(p.name) + '</span><div class="slot-btns">' +
        '<button type="button" class="iconbtn quiet" data-action="wk-up" data-i="' + i + '" aria-label="เลื่อน ' + esc(p.name) + ' ขึ้น"' + (i === 0 ? ' disabled' : '') + '>' + ico('up', 20) + '</button>' +
        '<button type="button" class="iconbtn quiet" data-action="wk-down" data-i="' + i + '" aria-label="เลื่อน ' + esc(p.name) + ' ลง"' + (i === slots.length - 1 ? ' disabled' : '') + '>' + ico('down', 20) + '</button>' +
        '<button type="button" class="iconbtn quiet" data-action="wk-del" data-i="' + i + '" aria-label="ลบช่อง ' + esc(p.name) + '">' + ico('close', 20) + '</button></div></div>';
    });
    h += '<div class="btn-row"><button type="button" class="btn" data-action="wk-add">' + ico('plus', 20) + 'เพิ่มช่อง</button>' +
      (custom ? '<button type="button" class="btn ghost" data-action="wk-reset">คืนค่าเริ่มต้น</button>' : '') + '</div></section>';
    return h;
  }

  V.weekAddSheet = function () {
    let h = '<h3>เพิ่มช่อง</h3><p class="muted small">เลือกแผนที่จะใส่เป็นช่องถัดไปในสัปดาห์ (ซ้ำแผนเดิมได้)</p>';
    GL.sortedPlans().forEach(function (p) {
      h += '<button type="button" class="list-btn" data-action="wk-add-pick" data-plan="' + esc(p.id) + '"><div class="lb-main"><div class="t">' + esc(p.name) + '</div></div>' + ico('plus', 22) + '</button>';
    });
    h += '<div class="btn-row"><button type="button" class="btn ghost" data-action="close-sheet">ปิด</button></div>';
    return h;
  };

  V.plans = function () {
    const plans = GL.sortedPlans();
    let h = '<div class="page-title"><h1>แผน</h1><button type="button" class="btn small primary" data-action="plan-new">' + ico('plus', 20) + 'สร้างแผน</button></div>' +
      weekEditor();
    h += '<h2>แผนทั้งหมด</h2>';
    if (!plans.length) h += '<div class="card muted">ยังไม่มีแผน — กด “สร้างแผน”</div>';
    plans.forEach(function (p) {
      const exs = p.items.map(function (it) { return GL.exById(it.exerciseId); }).filter(Boolean);
      const total = p.items.reduce(function (n, it) { return n + it.sets; }, 0);
      const last = GL.planLastUsed(p.id);
      h += '<div class="card"><button type="button" class="list-btn" style="border:0;padding:0;margin:0;min-height:0;background:transparent" data-action="plan-edit" data-id="' + esc(p.id) + '">' +
        '<div class="lb-main"><div class="t">' + esc(p.name) + (p.isSample ? ' <span class="tag">ตัวอย่าง</span>' : '') + '</div>' +
        '<div class="s">' + (p.focus ? esc(p.focus) + ' · ' : '') + exs.length + ' ท่า · ' + total + ' เซต · ' + (last ? 'ใช้ล่าสุด ' + esc(GL.fmtShort(last)) : 'ยังไม่เคยเล่น') + '</div></div>' + ico('chevron', 22, 'chev') + '</button>' +
        '<div class="pc-icons" style="display:flex;gap:6px;margin:10px 0 2px">' + exs.slice(0, 7).map(function (e) { return exTile(e, 'sm'); }).join('') + '</div>' +
        '<div class="btn-row"><button type="button" class="btn small" data-action="plan-copy" data-id="' + esc(p.id) + '">คัดลอก</button>' +
        '<button type="button" class="btn small" data-action="plan-edit" data-id="' + esc(p.id) + '">' + ico('edit', 20) + 'แก้ไข</button></div></div>';
    });
    return h;
  };

  V.planEdit = function () {
    const d = state.sub.draft, editing = !!d.id;
    let h = '<div class="topbar"><button type="button" class="back" data-action="plan-back">' + ico('back', 24) + 'แผน</button>' +
      '<button type="button" class="btn small primary" data-action="plan-save">บันทึก</button></div>';
    h += '<h1>' + (editing ? 'แก้ไขแผน' : 'สร้างแผนใหม่') + '</h1><div class="form">';
    h += '<label class="fl" for="pf-name">ชื่อวันฝึก</label><input type="text" id="pf-name" data-pf="name" maxlength="120" value="' + esc(d.name) + '" placeholder="เช่น PPL · Push" autocomplete="off">';
    h += '<label class="fl" for="pf-focus">โฟกัส (ไม่บังคับ)</label><input type="text" id="pf-focus" data-pf="focus" maxlength="120" value="' + esc(d.focus || '') + '" placeholder="เช่น อก · ไหล่ข้าง · หลังแขน" autocomplete="off">';
    h += '<label class="fl" for="pf-note">หมายเหตุ (ไม่บังคับ)</label><input type="text" id="pf-note" data-pf="note" maxlength="300" value="' + esc(d.note || '') + '" autocomplete="off">';
    h += '<label class="fl">ท่าตามลำดับ และจำนวน working sets</label>';
    if (!d.items.length) h += '<p class="muted small">ยังไม่มีท่า — กด “เพิ่มท่า”</p>';
    h += '<div class="card" style="padding-top:4px;padding-bottom:4px">';
    d.items.forEach(function (it, i) {
      const e = GL.exById(it.exerciseId);
      h += '<div class="plan-row">' + exTile(e, 'sm') + '<div class="pr-main"><div class="pr-name">' + (i + 1) + '. ' + esc(e ? e.name : '(ไม่พบท่า)') + '</div>' +
        (e && e.archived ? '<span class="tag warn">เก็บเข้าคลัง — จะถูกข้าม</span>' : '<div class="tiny muted">' + esc(e ? (e.equipment || '') : '') + '</div>') + '</div>' +
        '<div class="pr-ctl"><div class="mini-stepper"><button type="button" data-action="pi-sets" data-i="' + i + '" data-dir="-1" aria-label="ลดเซต">' + ico('minus', 18) + '</button>' +
        '<span><b>' + it.sets + '</b> เซต</span><button type="button" data-action="pi-sets" data-i="' + i + '" data-dir="1" aria-label="เพิ่มเซต">' + ico('plus', 18) + '</button></div>' +
        '<div class="iconbtns"><button type="button" class="iconbtn" data-action="pi-up" data-i="' + i + '" aria-label="เลื่อนขึ้น"' + (i === 0 ? ' disabled' : '') + '>' + ico('up', 20) + '</button>' +
        '<button type="button" class="iconbtn" data-action="pi-down" data-i="' + i + '" aria-label="เลื่อนลง"' + (i === d.items.length - 1 ? ' disabled' : '') + '>' + ico('down', 20) + '</button>' +
        '<button type="button" class="iconbtn del" data-action="pi-remove" data-i="' + i + '" aria-label="เอาออก">' + ico('close', 20) + '</button></div></div></div>';
    });
    h += '</div><button type="button" class="btn" style="margin-top:10px" data-action="pi-add">' + ico('plus', 20) + 'เพิ่มท่า</button></div>';
    if (editing) {
      h += '<h2>จัดการ</h2><button type="button" class="btn danger" data-action="plan-delete-ask" data-id="' + esc(d.id) + '">ลบแผนนี้</button>' +
        '<p class="hint">ลบแผนไม่กระทบประวัติที่เคยจดไว้ (ประวัติเก็บชื่อแผนตอนนั้นไว้เอง) · การแก้แผนมีผลกับ workout ใหม่เท่านั้น</p>';
    }
    return h;
  };

  V.planAddExSheet = function () {
    const list = state.exercises.filter(function (e) { return !e.archived; }).sort(GL.byName);
    return '<h3>เลือกท่าเพิ่มในแผน</h3>' +
      '<button type="button" class="btn primary create-cta" data-action="qx-open" data-ctx="plan">' + ico('plus', 20) + 'สร้างท่าใหม่ (ไม่มีในรายการ)</button>' +
      V.pickerList('pi-add-pick', function (e) { return 'data-ex="' + esc(e.id) + '"'; }, list, { createCtx: 'plan' }) +
      '<div class="btn-row"><button type="button" class="btn" data-action="close-sheet">ปิด</button></div>';
  };

  /* ---------- ท่า ---------- */
  function exRow(e) {
    const subs = (e.subs || []).map(GL.exById).filter(function (s) { return s && !s.archived; });
    return '<button type="button" class="list-btn" data-action="ex-edit" data-id="' + esc(e.id) + '">' + exTile(e, '') +
      '<div class="lb-main"><div class="t">' + esc(e.name) + (e.isSample ? ' <span class="tag">ตัวอย่าง</span>' : '') + '</div>' +
      '<div class="s">' + esc(e.muscle || '') + ' · ' + esc(e.equipment || 'ไม่ระบุอุปกรณ์') + ' · ' + esc(repRange(e)) + '</div>' +
      (subs.length ? '<div class="s">ท่าทางเลือก ' + subs.length + ' ท่า</div>' : '') + '</div>' + ico('chevron', 20, 'chev') + '</button>';
  }
  V.exList = function () {
    const q = (state.exQuery || '').trim().toLowerCase();
    const live = state.exercises.filter(function (e) { return !e.archived; }).filter(function (e) {
      if (state.exMuscle && (e.muscle || 'อื่น ๆ') !== state.exMuscle) return false;
      if (!q) return true;
      return (e.name + ' ' + (e.muscle || '') + ' ' + (e.equipment || '')).toLowerCase().indexOf(q) >= 0;
    });
    let h = '';
    if (!live.length) h += '<div class="card muted">ไม่พบท่าที่ตรงกับตัวกรอง</div>';
    GL.groupByMuscle(live).forEach(function (g) {
      h += '<h2>' + esc(g.muscle) + ' · ' + g.items.length + '</h2>' + g.items.map(exRow).join('');
    });
    if (!q && !state.exMuscle) {
      const archived = state.exercises.filter(function (e) { return e.archived; }).sort(GL.byName);
      if (archived.length) {
        h += '<h2>เก็บเข้าคลัง · ' + archived.length + '</h2><p class="hint">ไม่โผล่ในตัวเลือกใหม่ แต่ประวัติยังอยู่ครบ</p>';
        archived.forEach(function (e) {
          h += '<div class="card" style="display:flex;gap:12px;align-items:center">' + exTile(e, 'sm') + '<div style="flex:1;min-width:0"><div class="b">' + esc(e.name) + '</div><div class="small muted">' + esc(e.muscle || '') + ' · ' + esc(e.equipment || '') + '</div></div>' +
            '<button type="button" class="btn small" data-action="ex-unarchive" data-id="' + esc(e.id) + '">นำกลับมาใช้</button></div>';
        });
      }
    }
    return h;
  };
  V.exercises = function () {
    const muscles = [];
    state.exercises.forEach(function (e) { if (!e.archived) { const m = e.muscle || 'อื่น ๆ'; if (muscles.indexOf(m) < 0) muscles.push(m); } });
    muscles.sort(function (a, b) { const o = GL.muscleOptions(); const ia = o.indexOf(a), ib = o.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    let h = '<div class="page-title"><h1>ท่า</h1><button type="button" class="btn small primary" data-action="ex-new">' + ico('plus', 20) + 'เพิ่มท่า</button></div>';
    h += '<div class="search">' + ico('search', 22) + '<input class="field" type="search" id="ex-q" data-filter="exlist" value="' + esc(state.exQuery) + '" placeholder="ค้นหาชื่อท่า / เครื่อง" autocomplete="off" aria-label="ค้นหาท่า"></div>';
    h += '<div class="chips scroll"><button type="button" class="chip' + (!state.exMuscle ? ' on' : '') + '" data-action="ex-muscle" data-v="">ทั้งหมด</button>' +
      muscles.map(function (m) { return '<button type="button" class="chip' + (state.exMuscle === m ? ' on' : '') + '" data-action="ex-muscle" data-v="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') + '</div>';
    h += '<div id="ex-list">' + V.exList() + '</div>';
    return h;
  };

  V.exEdit = function () {
    const st = state.sub, d = st.draft, editing = !!d.id;
    // 1.8: ฟอร์มสองระดับ — พื้นฐาน (ชื่อ/กล้ามเนื้อ/อุปกรณ์) กับ “ตั้งค่าเพิ่มเติม” ที่พับไว้ · ปุ่มบันทึกติดขอบล่าง
    let h = '<div class="topbar"><button type="button" class="back" data-action="ex-back">' + ico('back', 24) + 'ท่า</button></div>';
    h += '<h1>' + (editing ? 'แก้ไขท่า' : 'เพิ่มท่าใหม่') + '</h1><div class="form">';
    h += '<label class="fl" for="ef-name">ชื่อท่า</label><input type="text" id="ef-name" data-ef="name" maxlength="120" value="' + esc(d.name) + '" placeholder="เช่น Leg Press" autocomplete="off" enterkeyhint="done">';
    h += '<label class="fl" for="ef-muscle">กล้ามเนื้อหลัก</label><div class="chips wrap">' + GL.muscleOptions().map(function (m) {
      return '<button type="button" class="chip' + (d.muscle.trim() === m ? ' on' : '') + '" data-action="muscle-pick" data-v="' + esc(m) + '" aria-pressed="' + (d.muscle.trim() === m) + '">' + esc(m) + '</button>';
    }).join('') + '</div><input type="text" id="ef-muscle" data-ef="muscle" maxlength="60" value="' + esc(d.muscle) + '" placeholder="หรือพิมพ์เอง" autocomplete="off" enterkeyhint="done">';
    h += '<label class="fl" for="ef-equipment">อุปกรณ์</label><div class="chips wrap">' + GL.QX_EQUIP.map(function (e, i) {
      const on = d.equipment.trim().toLowerCase() === e[0].toLowerCase();
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-action="ex-equip" data-i="' + i + '" aria-pressed="' + on + '">' + esc(e[0]) + '</button>';
    }).join('') + '</div><input type="text" id="ef-equipment" data-ef="equipment" maxlength="80" value="' + esc(d.equipment) + '" placeholder="หรือพิมพ์ชื่อเครื่อง เช่น เครื่อง T-Bar" autocomplete="off" enterkeyhint="done">';

    const reps = esc(d.repMin) + '–' + esc(d.repMax);
    h += '<button type="button" class="adv-toggle" data-action="ex-adv" aria-expanded="' + (!!st.adv) + '" aria-controls="ex-adv">' +
      '<span class="adv-t">ตั้งค่าเพิ่มเติม</span><span class="adv-s">' + reps + ' reps · +' + esc(d.step) + ' kg · ' + esc(GL.WEIGHT_MODE_SHORT[d.weightMode] || '') + '</span>' + ico('down', 20, 'chev') + '</button>';
    h += '<div id="ex-adv"' + (st.adv ? '' : ' hidden') + '>';
    h += '<label class="fl" for="ef-mode">วิธีนับน้ำหนัก</label><select id="ef-mode" data-ef="weightMode">' + GL.WEIGHT_MODE_ORDER.map(function (m) {
      return '<option value="' + m + '"' + (d.weightMode === m ? ' selected' : '') + '>' + esc(GL.WEIGHT_MODE_LABEL[m]) + '</option>';
    }).join('') + '</select>' +
      '<p class="hint">ใช้ชื่ออุปกรณ์แยกกันเมื่อสเกลน้ำหนักเทียบกันไม่ได้ (ประวัติและเป้าหมายแยกตามอุปกรณ์)</p>';
    h += '<div class="grid2"><div><label class="fl" for="ef-rmin">reps ต่ำสุด</label><input type="text" id="ef-rmin" inputmode="numeric" pattern="[0-9]*" data-ef="repMin" value="' + esc(d.repMin) + '"></div>' +
      '<div><label class="fl" for="ef-rmax">reps สูงสุด</label><input type="text" id="ef-rmax" inputmode="numeric" pattern="[0-9]*" data-ef="repMax" value="' + esc(d.repMax) + '"></div></div>';
    h += '<label class="fl" for="ef-step">น้ำหนักที่เพิ่มได้ต่อขั้น (kg)</label><input type="text" id="ef-step" inputmode="decimal" data-ef="step" value="' + esc(d.step) + '">';
    h += '<label class="fl" for="ef-rest">เวลาพักหลังแต่ละเซต (วินาที)</label><input type="text" id="ef-rest" inputmode="numeric" pattern="[0-9]*" data-ef="restSec" value="' + esc(d.restSec || '') + '" placeholder="เว้นว่าง = ใช้ค่ากลาง ' + GL.setting('restSeconds') + ' วินาที">';
    h += '<label class="fl" for="ef-note">หมายเหตุ (แสดงบนหน้าจด)</label><input type="text" id="ef-note" data-ef="note" maxlength="300" value="' + esc(d.note || '') + '" autocomplete="off">';

    h += '<label class="fl">ภาพการเคลื่อนไหว</label><div class="icon-grid">' + I.EX_KEYS.map(function (k) {
      return '<button type="button" data-action="icon-pick" data-v="' + k + '" class="' + (d.icon === k ? 'on' : '') + '" aria-label="ภาพ ' + esc(I.EX_LABEL[k]) + '"' + (d.icon === k ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + I.ex(k, 40) + '<span>' + esc(I.EX_LABEL[k]) + '</span></button>';
    }).join('') + '</div>';

    const others = state.exercises.filter(function (e) { return !e.archived && e.id !== d.id; });
    h += '<label class="fl">ท่าทางเลือก (ท่าที่ใช้แทนได้)</label>';
    if (!others.length) h += '<p class="muted small">ยังไม่มีท่าอื่นให้เลือก</p>';
    else h += '<div class="search">' + ico('search', 22) + '<input class="field" type="search" id="sub-q" data-filter="subs" placeholder="ค้นหาท่า" autocomplete="off" aria-label="ค้นหาท่าทางเลือก"></div><div id="sub-list">';
    others.sort(GL.byName).forEach(function (e) {
      h += '<label class="check-row" data-search="' + esc((e.name + ' ' + (e.muscle || '') + ' ' + (e.equipment || '')).toLowerCase()) + '"><input type="checkbox" data-ef-sub="' + esc(e.id) + '"' + (d.subs.indexOf(e.id) >= 0 ? ' checked' : '') + '>' +
        '<span class="cr-main">' + esc(e.name) + '<span class="cr-sub">' + esc(e.muscle || '') + ' · ' + esc(e.equipment || '') + '</span></span></label>';
    });
    if (others.length) h += '</div>';
    h += '<p class="hint">ตอนใช้ท่าทางเลือก แอปใช้ประวัติของท่าที่เลือกจริงเท่านั้น ไม่ย้ายน้ำหนักข้ามท่า</p>';
    if (editing && d.hadHistory) {
      h += '<div class="notice">ท่านี้มีประวัติแล้ว ถ้าเปลี่ยนอุปกรณ์หรือวิธีนับน้ำหนัก ประวัติเดิมจะแสดงเป็น “เทียบกันไม่ได้” (ไม่ถูกลบ) การเปลี่ยนชื่อไม่กระทบประวัติ</div>';
    }
    h += '</div>';   // #ex-adv
    h += '<div class="sticky-cta form-cta"><button type="button" class="btn primary" data-action="ex-save">' + (editing ? 'บันทึกการแก้ไข' : 'บันทึกท่า') + '</button></div>';
    h += '</div>';
    if (editing) {
      const used = GL.plansUsing(d.id);
      h += '<h2>จัดการ</h2>';
      if (used.length) h += '<p class="muted small">ท่านี้อยู่ในแผน: ' + esc(used.map(function (p) { return p.name; }).join(', ')) + '</p>';
      if (d.hadHistory) {
        h += '<p class="muted small">ท่านี้มีประวัติ จึงลบไม่ได้ แต่เก็บเข้าคลังได้ (ประวัติยังอยู่ครบ)</p>' +
          '<button type="button" class="btn danger" data-action="ex-archive" data-id="' + esc(d.id) + '">เก็บท่านี้เข้าคลัง</button>';
      } else {
        h += '<button type="button" class="btn danger" data-action="ex-delete-ask" data-id="' + esc(d.id) + '">ลบท่านี้</button>';
      }
    }
    return h;
  };

  /* ---------- ประวัติและความก้าวหน้า ---------- */
  function fmtRange(a, b) {
    const da = GL.parseKey(a), db = GL.parseKey(b);
    const sameYear = da.getFullYear() === db.getFullYear();
    const left = da.toLocaleDateString('th-TH', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
    const right = db.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    return left + ' – ' + right;
  }
  function basisText(g) { return (g.equipment || 'ไม่ระบุอุปกรณ์') + ' · นับน้ำหนัก ' + (GL.WEIGHT_MODE_SHORT[g.weightMode] || g.weightMode); }

  const HIS_MODES = [['overview', 'ภาพรวม'], ['exercises', 'รายท่า'], ['sessions', 'รายครั้ง']];

  function historyEmpty(msg) {
    const info = rotationInfo();
    return '<div class="card empty"><p class="muted">' + esc(msg) + '</p>' +
      (info.start ? '<button type="button" class="btn primary" data-action="start-plan" data-plan="' + esc(info.start.id) + '">เริ่มฝึก ' + esc(shortPlan(info.start.name)) + '</button>'
        : '<button type="button" class="btn primary" data-action="plan-new-go">สร้างแผนแรก</button>') + '</div>';
  }

  V.history = function () {
    let h = '<h1>ประวัติ</h1>';
    h += '<div class="seg" role="tablist">' + HIS_MODES.map(function (m) {
      return '<button type="button" role="tab" data-action="his-mode" data-mode="' + m[0] + '" class="' + (state.hisMode === m[0] ? 'on' : '') + '" aria-selected="' + (state.hisMode === m[0]) + '">' + m[1] + '</button>';
    }).join('') + '</div>';
    const fin = GL.finishedWorkouts();
    if (state.hisMode === 'overview') return h + V.overview();
    if (state.hisMode === 'exercises') {
      const idx = SM.exerciseIndex(state.workouts).sort(function (a, b) { return a.lastDate < b.lastDate ? 1 : -1; });
      if (!idx.length) return h + historyEmpty('ยังไม่มีประวัติ — จบ workout แรกแล้วท่าที่เล่นจะมาอยู่ที่นี่ พร้อมกราฟแนวโน้มน้ำหนัก');
      h += '<p class="hint">แตะท่าเพื่อดูแนวโน้มน้ำหนักและสถิติใหม่ (PR)</p>';
      idx.forEach(function (x) {
        h += '<button type="button" class="list-btn" data-action="sum-open" data-ex="' + esc(x.exerciseId) + '">' + exTile(GL.exById(x.exerciseId), 'sm') +
          '<div class="lb-main"><div class="t">' + esc(x.name) + '</div><div class="s">เล่นแล้ว ' + x.sessions + ' ครั้ง · ล่าสุด ' + esc(GL.fmtDate(x.lastDate, true)) + '</div></div>' + ico('chevron', 20, 'chev') + '</button>';
      });
      return h;
    }
    if (!fin.length) return h + historyEmpty('ยังไม่มีประวัติ — จะมีเมื่อกด “จบและเก็บผลการฝึก” และมีเซตที่ยืนยันแล้วอย่างน้อย 1 เซต');
    fin.slice(0, 80).forEach(function (w) {
      const sets = GL.sessionWorkingCount(w), exs = w.entries.filter(function (e) { return P.workingCompleted(e).length; }).length;
      h += '<button type="button" class="list-btn" data-action="open-detail" data-id="' + esc(w.id) + '"><div class="lb-main"><div class="t">' + esc(w.planName) + '</div>' +
        '<div class="s">' + esc(GL.fmtDate(w.date, true)) + ' · ' + esc(GL.agoLabel(w.date)) + '</div><div class="s">' + exs + ' ท่า · ' + sets + ' working sets</div></div>' + ico('chevron', 20, 'chev') + '</button>';
    });
    return h;
  };

  /* ---------- ภาพรวม: เซตต่อกล้ามเนื้อรายสัปดาห์ + ตารางความสม่ำเสมอ ---------- */
  function weekKeyFor(offset) {
    const d = GL.parseKey(SM.weekStart(GL.localDateKey()));
    d.setDate(d.getDate() + 7 * offset);
    return GL.localDateKey(d);
  }

  V.overview = function () {
    const fin = GL.finishedWorkouts();
    if (!fin.length) return historyEmpty('ยังไม่มีประวัติ — จบ workout แรกแล้วภาพรวมรายสัปดาห์และตารางความสม่ำเสมอจะขึ้นที่นี่');
    const off = Math.max(-104, Math.min(0, state.hisWeek || 0));
    const ws = weekKeyFor(off), we = SM.weekEnd(ws);
    const mw = SM.muscleWeek(state.workouts, GL.exById, ws);
    const info = rotationInfo();
    const order = [];
    info.rot.forEach(function (p) { p.items.forEach(function (it) { const ex = GL.exById(it.exerciseId); if (ex && ex.muscle && order.indexOf(ex.muscle) < 0) order.push(ex.muscle); }); });
    Object.keys(mw).forEach(function (m) { if (order.indexOf(m) < 0) order.push(m); });
    const targets = GL.setting('showTargets') === true;
    const maxSets = Math.max.apply(null, [targets ? 24 : 10].concat(order.map(function (m) { return mw[m] ? mw[m].sets : 0; })));
    const wkSessions = SM.weekStrip(state.workouts, we).sessions;

    let h = '<section class="card ov-card"><div class="ov-nav"><button type="button" class="iconbtn" data-action="his-week" data-d="-1" aria-label="สัปดาห์ก่อนหน้า">' + ico('back', 22) + '</button>' +
      '<div class="ov-title"><b>' + esc(fmtRange(ws, we)) + '</b><span class="muted small">' + (off === 0 ? 'สัปดาห์นี้' : Math.abs(off) + ' สัปดาห์ก่อน') + ' · ' + wkSessions + ' ครั้ง</span></div>' +
      '<button type="button" class="iconbtn" data-action="his-week" data-d="1" aria-label="สัปดาห์ถัดไป"' + (off === 0 ? ' disabled' : '') + '>' + ico('chevron', 22) + '</button></div>';
    h += '<h3>เซตต่อกล้ามเนื้อ</h3>';
    if (!order.length) h += '<p class="muted">ไม่มีกล้ามเนื้อให้แสดง</p>';
    order.forEach(function (m) {
      const x = mw[m] || { sets: 0, sessions: 0 };
      const pct = Math.min(100, Math.round(x.sets / maxSets * 100));
      h += '<div class="mb-row"><div class="mb-head"><span class="mb-name">' + esc(m) + '</span><span class="mb-num"><b>' + x.sets + '</b> เซต' + (x.sessions ? ' · ' + x.sessions + ' ครั้ง' : '') + '</span></div>' +
        '<div class="mb-track" role="img" aria-label="' + esc(m + ' ' + x.sets + ' เซต ' + x.sessions + ' ครั้ง') + '"><i style="width:' + pct + '%"></i>' +
        (targets ? '<s class="mb-mark" style="left:' + Math.round(10 / maxSets * 100) + '%"></s><s class="mb-mark" style="left:' + Math.round(20 / maxSets * 100) + '%"></s>' : '') + '</div></div>';
    });
    h += '<p class="hint">นับ <b>เซตตรง</b> = เซต working ที่ทำเสร็จ ตามกล้ามเนื้อหลักของท่านั้น (ไม่นับผลทางอ้อม เช่น อกช่วยไตรเซ็ป · warm-up และเซตที่ข้ามไม่นับ) ' +
      (targets ? 'เส้นขีดที่ 10 และ 20 เซตเป็นเพียงเส้นอ้างอิงทั่วไป ไม่ใช่เป้าที่ต้องทำให้ถึง' : 'เปิดเส้นอ้างอิงได้ที่ตั้งค่า (ปิดไว้เป็นค่าเริ่มต้น)') + '</p></section>';

    const g = SM.consistencyGrid(state.workouts, GL.localDateKey(), 12);
    const dayN = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
    h += '<section class="card cg-card"><h3>ความสม่ำเสมอ 12 สัปดาห์</h3><p class="muted small">รวม <b style="color:var(--text)">' + g.total + '</b> ครั้ง · เฉลี่ย ' + g.avg + ' ครั้ง/สัปดาห์ · มีการฝึก ' + g.activeWeeks + ' จาก 12 สัปดาห์</p>' +
      '<table class="cg"><caption class="sr-only">จำนวน session ที่จดต่อวัน เรียงจากสัปดาห์เก่าไปใหม่ (ซ้ายไปขวา) แถวคือวันจันทร์ถึงอาทิตย์</caption><thead class="sr-only"><tr><th></th>' +
      g.weeks.map(function (w) { return '<th scope="col">สัปดาห์ ' + esc(GL.fmtShort(w.weekStart)) + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (let d = 0; d < 7; d++) {
      h += '<tr><th scope="row">' + dayN[d] + '</th>';
      g.weeks.forEach(function (w) {
        const c = w.days[d];
        h += '<td class="' + (c.count ? 'on' : '') + (c.isFuture ? ' fut' : '') + (c.isToday ? ' tod' : '') + '" aria-label="' + esc(GL.fmtShort(c.key) + ' ' + dayN[d] + ': ' + (c.isFuture ? 'ยังไม่ถึง' : c.count + ' ครั้ง')) + '">' + (c.count ? c.count : '') + '</td>';
      });
      h += '</tr>';
    }
    h += '</tbody></table><div class="cg-axis"><span>เก่า</span><span>ใหม่</span></div></section>';
    return h;
  };

  V.workoutDetail = function (id) {
    const w = GL.findWorkout(id);
    if (!w || w.status !== 'finished') return '<div class="topbar"><button type="button" class="back" data-action="his-back">' + ico('back', 24) + 'ประวัติ</button></div><p class="muted">ไม่พบ workout นี้</p>';
    let h = '<div class="topbar"><button type="button" class="back" data-action="his-back">' + ico('back', 24) + 'ประวัติ</button></div>';
    h += '<h1>' + esc(w.planName) + '</h1><p class="sub">' + esc(GL.fmtDate(w.date, true)) + ' · ' + esc(GL.agoLabel(w.date)) + '</p>';
    h += undoStrip();
    w.entries.forEach(function (entry) {
      const swapped = entry.plannedExerciseId && entry.plannedExerciseId !== entry.exerciseId;
      const vol = P.volumeLoad(entry), ex = GL.exById(entry.exerciseId);
      h += '<section class="card"><div style="display:flex;gap:12px;align-items:center">' + exTile(ex, 'sm') + '<div style="flex:1;min-width:0"><h3>' + esc(entry.exerciseName) + '</h3>' +
        '<div class="small muted">' + esc(entry.equipment || '') + ' · นับ ' + esc(modeShort(entry.weightMode)) + '</div></div></div>' +
        (swapped ? '<div style="margin-top:6px"><span class="tag lav">ท่าทางเลือก · แทน ' + esc(entry.plannedExerciseName || '') + '</span></div>' : '');
      let wi = 0;
      h += '<div style="margin-top:6px">';
      entry.sets.forEach(function (s) {
        const label = s.kind === 'warmup' ? 'W' : String(++wi);
        const txt = s.status === 'skipped' ? 'ข้ามเซตนี้' : fmtNum(s.weight) + ' kg × ' + s.reps + (s.kind === 'warmup' ? ' (warm-up)' : '');
        h += '<div class="setline"><span class="sl-n">' + label + '</span><span class="sl-txt' + (s.status === 'skipped' ? ' muted' : '') + '">' + esc(txt) + '</span>' +
          '<button type="button" class="btn small" data-action="edit-set" data-workout="' + esc(w.id) + '" data-entry="' + esc(entry.id) + '" data-set="' + esc(s.id) + '">แก้</button></div>';
      });
      h += '</div><p class="muted small">working sets ที่ทำจริง: <b style="color:var(--text)">' + P.workingCompleted(entry).length +
        '</b> · volume load: <b style="color:var(--text)">' + esc(fmtNum(vol)) + '</b> kg×reps (' + esc(modeShort(entry.weightMode)) + ')</p></section>';
    });
    h += '<button type="button" class="btn danger" data-action="delete-workout" data-id="' + esc(w.id) + '">ลบ workout นี้ออกจากประวัติ</button>';
    return h;
  };

  V.sumEx = function (exId) {
    const groups = SM.exerciseHistory(state.workouts, exId);
    const idx = SM.exerciseIndex(state.workouts).filter(function (x) { return x.exerciseId === exId; })[0];
    let h = '<div class="topbar"><button type="button" class="back" data-action="sum-back">' + ico('back', 24) + 'ประวัติ</button></div>';
    h += '<h1>' + esc(idx ? idx.name : 'ท่า') + '</h1>';
    if (!groups.length) return h + '<p class="muted">ไม่มีประวัติที่จบแล้วของท่านี้</p>';
    h += '<div class="seg"><button type="button" class="' + (state.sumView === 'session' ? 'on' : '') + '" data-action="sum-view" data-v="session">รายครั้ง</button>' +
      '<button type="button" class="' + (state.sumView === 'week' ? 'on' : '') + '" data-action="sum-view" data-v="week">รายสัปดาห์</button></div>';
    if (groups.length > 1) h += '<div class="notice">ท่านี้เคยเล่นด้วยอุปกรณ์/วิธีนับน้ำหนักต่างกัน จึงแยกเป็นกลุ่ม ไม่รวมกัน (น้ำหนักเทียบกันตรง ๆ ไม่ได้)</div>';
    const metric = state.trendMetric === 'e1rm' ? 'e1rm' : 'top';
    groups.forEach(function (g) {
      const pts = SM.exerciseTrend(g.sessions, metric);
      const prByWorkout = {};
      pts.forEach(function (p) { if (p.pr) prByWorkout[p.workoutId] = true; });
      const latest = g.sessions[0];
      let best = g.sessions[0].top;
      g.sessions.forEach(function (r) { if (r.top.weight > best.weight || (r.top.weight === best.weight && r.top.reps > best.reps)) best = r.top; });
      const oldest = g.sessions[g.sessions.length - 1];
      h += '<section class="card"><h3>' + esc(g.equipment || 'ไม่ระบุอุปกรณ์') + '</h3><div class="small muted">นับน้ำหนัก: ' + esc(modeLabel(g.weightMode)) + '</div>';
      h += '<div class="stat-row"><div class="stat"><span>ล่าสุด</span><b>' + esc(fmtNum(latest.top.weight)) + '×' + latest.top.reps + '</b><small>เซตหนักสุด</small></div>' +
        '<div class="stat"><span>ดีที่สุด</span><b>' + esc(fmtNum(best.weight)) + '×' + best.reps + '</b><small>เซตหนักสุดที่เคยทำ</small></div>' +
        '<div class="stat"><span>เล่นแล้ว</span><b>' + g.sessions.length + '</b><small>ครั้ง' + (g.sessions.length > 1 ? ' · ' + esc(GL.fmtShort(oldest.date)) + ' →' : '') + '</small></div></div>';
      // 1.8: คำแนะนำจาก 1.7 อยู่ที่หน้านี้ (ไม่แสดงกลางการจด)
      const pseudo = { exerciseId: exId, equipment: g.equipment, weightMode: g.weightMode };
      const stall = P.stallStatus(state.workouts, pseudo, null, 3);
      if (stall.stalled) h += coachNote(stall.text);
      const exObj = GL.exById(exId);
      const lastPat = P.analyzeSets(latest.sets.map(function (x) { return { kind: 'working', status: 'completed', weight: x.weight, reps: x.reps }; }), exObj);
      if (lastPat.warn) h += coachNote('ครั้งล่าสุด: ' + lastPat.text);
      if (pts.length >= 4) {
        h += '<div class="seg metric-seg" role="tablist"><button type="button" role="tab" data-action="trend-metric" data-v="top" aria-selected="' + (metric === 'top') + '" class="' + (metric === 'top' ? 'on' : '') + '">น้ำหนักสูงสุด</button>' +
          '<button type="button" role="tab" data-action="trend-metric" data-v="e1rm" aria-selected="' + (metric === 'e1rm') + '" class="' + (metric === 'e1rm' ? 'on' : '') + '">1RM โดยประมาณ</button></div>';
        h += '<div class="chart-wrap">' + window.GymCharts.line(pts, { unit: 'kg', label: metric === 'top' ? 'น้ำหนักเซตหนักสุดต่อครั้ง' : '1RM โดยประมาณต่อครั้ง', fmtDate: GL.fmtShort }) + '</div>';
        h += '<p class="hint">' + (metric === 'top' ? 'น้ำหนักของเซตที่หนักสุดในแต่ละครั้ง' : '1RM โดยประมาณ (สูตร Epley: น้ำหนัก × (1 + reps/30)) ใช้เทียบแนวโน้มของท่านี้เท่านั้น ไม่แม่นเมื่อ reps สูง') +
          ' · <b>◆ PR</b> = สถิติใหม่ของท่า+อุปกรณ์นี้ (ครั้งแรกที่เล่นไม่นับ)</p>';
      } else {
        h += '<p class="hint">กราฟแนวโน้มจะขึ้นเมื่อเล่นท่านี้ครบ 4 ครั้ง (ตอนนี้ ' + pts.length + ' ครั้ง) — ดูตัวเลขแต่ละครั้งได้ด้านล่าง</p>';
      }
      if (state.sumView === 'week') {
        g.weeks.slice(0, 26).forEach(function (w) {
          h += '<div class="sum-row"><div><b>' + esc(fmtRange(w.weekStart, w.weekEnd)) + '</b><div class="muted tiny">' + w.sessions + ' ครั้ง · เซตหนักสุด ' + esc(fmtNum(w.top.weight)) + '×' + w.top.reps + '</div></div>' +
            '<div class="sum-nums"><div class="b">' + w.workingSets + ' เซต</div><div class="muted small">' + esc(fmtNum(w.volume)) + ' kg×reps</div></div></div>';
        });
      } else {
        g.sessions.slice(0, 60).forEach(function (r) {
          h += '<div class="sum-row"><div><b>' + esc(GL.fmtDate(r.date, true)) + '</b> <span class="muted small">· ' + esc(GL.agoLabel(r.date)) + '</span>' +
            (prByWorkout[r.workoutId] ? ' <span class="tag pr">◆ PR</span>' : '') +
            '<div class="small">' + esc(setsLine(r.sets)) + '</div></div>' +
            '<div class="sum-nums"><div class="b">' + r.workingSets + ' เซต</div><div class="muted small">' + esc(fmtNum(r.volume)) + ' kg×reps</div></div></div>';
        });
      }
      h += '<p class="hint">volume load = น้ำหนัก × reps รวมเฉพาะเซต working ที่ทำเสร็จ (' + esc(GL.WEIGHT_MODE_SHORT[g.weightMode] || '') + ') — ใช้ดูแนวโน้มของท่านี้เท่านั้น ไม่ใช่คะแนนว่ากล้ามโตขึ้น</p></section>';
    });
    return h;
  };

  /* ---------- สำรอง / กู้คืน ---------- */
  V.backup = function () {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const finished = GL.finishedWorkouts().length;
    let h = '<div class="topbar"><button type="button" class="back" data-action="home">' + ico('back', 24) + 'หน้าแรก</button></div><h1>สำรอง / กู้คืนข้อมูล</h1>';
    h += '<div class="notice">ข้อมูลทั้งหมดเก็บ <b>ในเครื่องนี้เท่านั้น</b> และ<b>ไม่ได้สำรองบน cloud อัตโนมัติ</b> ควรกด “ส่งออกข้อมูล” เป็นระยะ แล้วเก็บไฟล์ไว้ที่ Files/iCloud Drive ของคุณ</div>';
    if (!standalone) {
      h += '<div class="notice warn">ตอนนี้เปิดผ่าน Safari ธรรมดา — iPhone อาจล้างข้อมูลเว็บที่ไม่ได้เปิดนาน แนะนำให้ Add to Home Screen แล้วเปิดจากไอคอน</div>';
    }
    h += '<div class="card"><h3>ส่งออก (Export)</h3><p class="muted small">ได้ไฟล์ .json ตั้งชื่อตามวันที่ ที่รวมท่า แผน ประวัติ และการตั้งค่า</p>' +
      '<button type="button" class="btn primary" data-action="export">' + ico('backup', 22) + 'ส่งออกข้อมูล</button></div>';
    h += '<div class="card"><h3>กู้คืน (Import)</h3><p class="muted small">เลือกไฟล์สำรอง แอปจะตรวจไฟล์และแสดงสรุปก่อน จะไม่ทับข้อมูลเดิมถ้าคุณยังไม่ยืนยัน</p>' +
      '<button type="button" class="btn" data-action="import-pick">เลือกไฟล์สำรอง</button></div>';
    h += '<div class="card"><h3>ข้อมูลในเครื่อง</h3>' +
      kv('หน่วยน้ำหนัก', esc(state.settings.unit || 'kg')) +
      kv('สำรองล่าสุด', esc(state.settings.lastBackupAt ? GL.fmtDateTime(state.settings.lastBackupAt) : 'ยังไม่เคยสำรอง')) +
      kv('workout ที่จบแล้ว', finished) +
      kv('เวอร์ชันโครงข้อมูล', 'v' + GL.S.SCHEMA_VERSION) +
      kv('เวอร์ชันแอป', esc(GL.APP_VERSION)) +
      kv('ที่เก็บข้อมูลแบบถาวร', state.persisted === true ? 'ขอสิทธิ์แล้ว' : state.persisted === false ? 'เบราว์เซอร์ยังไม่รับรอง' : 'ไม่ทราบ') + '</div>';
    h += '<div class="card"><h3>อัปเดตแอป</h3><p class="muted small">ถ้ามีเวอร์ชันใหม่ จะมีแถบแจ้งด้านบน แอปไม่รีโหลดเองกลางการจด</p>' +
      '<button type="button" class="btn" data-action="check-update">ตรวจหาเวอร์ชันใหม่</button></div>';
    return h;
  };
})();
