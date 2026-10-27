/* program.js — โปรแกรมฝึก PPL ของผู้ใช้ (ท่า + แผนที่พร้อมใช้) และตัวช่วยติดตั้งแบบไม่ทำลายข้อมูลเดิม
 *
 * - ชื่อท่าใช้ชื่อสากลที่คนเล่นเวทเรียกกัน (ภาษาอังกฤษ) ไอคอนวาดเองใน icons.js
 * - ท่าทางเลือก (subs) ตามตารางที่ผู้ใช้ให้มา ทุกท่าทางเลือกเป็นท่าในคลังของตัวเอง (มีประวัติแยก)
 * - ตัวเลขเซตอยู่ในแผน, ช่วง reps อยู่ที่ตัวท่า (แผนเดียวกันใช้ช่วง reps ของท่านั้นร่วมกัน)
 * - ไม่มีประวัติการฝึกใดอยู่ในไฟล์นี้ (ไม่มีข้อมูลสมมติของการฝึกจริง)
 *
 * buildInstall() เป็นฟังก์ชันล้วน ๆ ทดสอบด้วย node ได้ คืนรายการเขียนให้ storage.batch ทำใน transaction เดียว
 */
(function (global) {
  'use strict';

  const PROGRAM_ID = 'ppl-1';

  const SIDE_NOTE = 'ทำทีละข้าง — 1 เซตในตาราง = ครบทั้งสองข้าง จดน้ำหนักและ reps เป็นค่าต่อข้าง';

  // [id, ชื่อ, หมวด, อุปกรณ์, repMin, repMax, step, weightMode, icon, subs[], note]
  const EX = [
    // Push
    ['ppl-incline-chest-press', 'Incline Chest Press (Machine)', 'อก', 'เครื่อง', 8, 12, 5, 'machine', 'incline_press', ['ppl-smith-incline-press']],
    ['ppl-smith-incline-press', 'Smith Machine Incline Press', 'อก', 'Smith Machine', 8, 12, 5, 'machine', 'incline_press', []],
    ['ppl-flat-chest-press', 'Flat Chest Press (Machine)', 'อก', 'เครื่อง', 8, 12, 5, 'machine', 'chest_press', ['ppl-flat-chest-press-b']],
    ['ppl-flat-chest-press-b', 'Flat Chest Press (Other Machine)', 'อก', 'เครื่องอื่น', 8, 12, 5, 'machine', 'chest_press', []],
    ['ppl-pec-deck', 'Pec Deck Fly', 'อก', 'เครื่อง', 10, 15, 5, 'machine', 'pec_fly', ['ppl-cable-fly']],
    ['ppl-cable-fly', 'Cable Fly', 'อก', 'สายเคเบิล', 10, 15, 2.5, 'cable', 'cable_fly', []],
    ['ppl-lateral-raise-machine', 'Lateral Raise (Machine)', 'ไหล่ข้าง', 'เครื่อง', 12, 20, 2.5, 'machine', 'lateral_raise', ['ppl-cable-lateral-raise']],
    ['ppl-cable-lateral-raise', 'Cable Lateral Raise', 'ไหล่ข้าง', 'สายเคเบิล', 12, 20, 2.5, 'cable', 'cable_lateral', []],
    ['ppl-triceps-pushdown', 'Triceps Pushdown (Cable)', 'ไตรเซ็ป', 'สายเคเบิล', 10, 15, 2.5, 'cable', 'pushdown', ['ppl-triceps-extension-machine']],
    ['ppl-triceps-extension-machine', 'Triceps Extension (Machine)', 'ไตรเซ็ป', 'เครื่อง', 10, 15, 5, 'machine', 'pushdown', []],
    ['ppl-ab-crunch-machine', 'Ab Crunch (Machine)', 'หน้าท้อง', 'เครื่อง', 10, 15, 5, 'machine', 'crunch', ['ppl-cable-crunch']],
    ['ppl-cable-crunch', 'Cable Crunch', 'หน้าท้อง', 'สายเคเบิล', 10, 15, 2.5, 'cable', 'cable_crunch', []],
    // Pull
    ['ppl-lat-pulldown', 'Lat Pulldown', 'หลัง', 'เครื่อง', 8, 12, 5, 'machine', 'lat_pulldown', ['ppl-single-arm-high-row']],
    ['ppl-single-arm-high-row', 'Single-Arm High Row (Machine)', 'หลัง', 'เครื่อง', 8, 12, 5, 'machine', 'lat_pulldown', [], SIDE_NOTE],
    ['ppl-single-arm-row', 'Single-Arm Row (Machine)', 'หลัง', 'เครื่อง', 8, 12, 5, 'machine', 'one_arm_row', ['ppl-seated-cable-row-close', 'ppl-tbar-row-close'], SIDE_NOTE],
    ['ppl-seated-cable-row-close', 'Seated Cable Row (Close Grip)', 'หลัง', 'สายเคเบิล', 8, 12, 5, 'cable', 'cable_row', []],
    ['ppl-tbar-row-close', 'T-Bar Row (Close Grip)', 'หลัง', 'เครื่อง T-Bar', 8, 12, 5, 'machine', 'tbar_row', []],
    ['ppl-seated-cable-row-wide', 'Seated Cable Row (Wide Grip)', 'หลัง', 'สายเคเบิล', 10, 15, 5, 'cable', 'cable_row', ['ppl-tbar-row-wide']],
    ['ppl-tbar-row-wide', 'Chest-Supported T-Bar Row (Wide Grip)', 'หลัง', 'เครื่อง T-Bar', 10, 15, 5, 'machine', 'tbar_row', []],
    ['ppl-reverse-pec-deck', 'Reverse Pec Deck', 'ไหล่หลัง', 'เครื่อง', 12, 20, 5, 'machine', 'rear_fly', ['ppl-cable-rear-delt-fly']],
    ['ppl-cable-rear-delt-fly', 'Cable Rear Delt Fly', 'ไหล่หลัง', 'สายเคเบิล', 12, 20, 2.5, 'cable', 'rear_fly', []],
    ['ppl-cable-curl', 'Cable Curl', 'ไบเซ็ป', 'สายเคเบิล', 8, 15, 2.5, 'cable', 'curl', ['ppl-ez-bar-curl', 'ppl-preacher-curl-machine']],
    ['ppl-ez-bar-curl', 'EZ-Bar Curl', 'ไบเซ็ป', 'EZ-bar', 8, 15, 2.5, 'barbell_total', 'bar_curl', []],
    ['ppl-preacher-curl-machine', 'Preacher Curl (Machine)', 'ไบเซ็ป', 'เครื่อง', 8, 15, 5, 'machine', 'preacher', []],
    // Legs
    ['ppl-leg-press', 'Leg Press', 'ต้นขาหน้า', 'เครื่อง', 8, 12, 10, 'machine', 'leg_press', ['ppl-hack-squat'], 'ถ้ามีอาการชาหรือร้าวลงขา ให้หยุดท่านี้'],
    ['ppl-hack-squat', 'Hack Squat', 'ต้นขาหน้า', 'เครื่อง', 8, 12, 10, 'machine', 'hack_squat', []],
    ['ppl-seated-leg-curl', 'Seated Leg Curl', 'ต้นขาหลัง', 'เครื่อง', 10, 15, 5, 'machine', 'leg_curl', ['ppl-lying-leg-curl']],
    ['ppl-lying-leg-curl', 'Lying Leg Curl', 'ต้นขาหลัง', 'เครื่อง', 10, 15, 5, 'machine', 'lying_curl', []],
    ['ppl-hip-thrust-machine', 'Hip Thrust (Machine)', 'ก้น', 'เครื่อง', 8, 12, 10, 'machine', 'hip_thrust', ['ppl-smith-hip-thrust']],
    ['ppl-smith-hip-thrust', 'Smith Machine Hip Thrust', 'ก้น', 'Smith Machine', 8, 12, 5, 'machine', 'hip_thrust', []],
    ['ppl-leg-extension', 'Leg Extension', 'ต้นขาหน้า', 'เครื่อง', 10, 15, 5, 'machine', 'leg_extension', ['ppl-leg-extension-b']],
    ['ppl-leg-extension-b', 'Leg Extension (Other Machine)', 'ต้นขาหน้า', 'เครื่องอื่น', 10, 15, 5, 'machine', 'leg_extension', []],
    ['ppl-calf-raise-machine', 'Calf Raise (Machine)', 'น่อง', 'เครื่อง', 10, 20, 5, 'machine', 'calf_raise', ['ppl-leg-press-calf-raise']],
    ['ppl-leg-press-calf-raise', 'Leg Press Calf Raise', 'น่อง', 'เครื่อง Leg Press', 10, 20, 10, 'machine', 'calf_raise', []]
  ];

  // [id, ชื่อแผน, โฟกัส, หมายเหตุ, [[exerciseId, sets], ...]]
  const PLANS = [
    ['ppl-plan-push', 'PPL · Push', 'อก · ไหล่ข้าง · หลังแขน · ท้อง', '', [
      ['ppl-incline-chest-press', 3], ['ppl-flat-chest-press', 3], ['ppl-pec-deck', 2],
      ['ppl-lateral-raise-machine', 3], ['ppl-triceps-pushdown', 4], ['ppl-ab-crunch-machine', 2]
    ]],
    ['ppl-plan-pull', 'PPL · Pull', 'หลัง · ไหล่หลัง · หน้าแขน', 'ท่าทีละข้าง ทำ 3 เซตต่อข้าง', [
      ['ppl-lat-pulldown', 3], ['ppl-single-arm-row', 3], ['ppl-seated-cable-row-wide', 3],
      ['ppl-reverse-pec-deck', 3], ['ppl-cable-curl', 4]
    ]],
    ['ppl-plan-legs', 'PPL · Legs', 'ขา · ก้น · น่อง · ท้อง · ไหล่ข้าง', 'ถ้า Leg Press ชาหรือร้าวลงขา ให้หยุดท่านั้น', [
      ['ppl-leg-press', 3], ['ppl-seated-leg-curl', 3], ['ppl-hip-thrust-machine', 3],
      ['ppl-leg-extension', 3], ['ppl-calf-raise-machine', 4], ['ppl-ab-crunch-machine', 3],
      ['ppl-lateral-raise-machine', 2]
    ]],
    ['ppl-plan-extra', 'PPL · วันเสริม', 'ไหล่ข้าง · ไหล่หลัง · แขน', 'ประมาณ 2 สัปดาห์ต่อครั้ง ห่างจาก Push/Pull อย่างน้อย 48 ชั่วโมง ข้ามได้ถ้าล้า', [
      ['ppl-lateral-raise-machine', 2], ['ppl-reverse-pec-deck', 2], ['ppl-cable-curl', 2], ['ppl-triceps-pushdown', 2]
    ]]
  ];

  function exercises(nowIso) {
    return EX.map(function (r) {
      const e = {
        id: r[0], name: r[1], muscle: r[2], equipment: r[3],
        repMin: r[4], repMax: r[5], step: r[6], weightMode: r[7], icon: r[8],
        subs: r[9].slice(), archived: false, isSample: false, createdAt: nowIso
      };
      if (r[10]) e.note = r[10];
      return e;
    });
  }

  function plans(baseMs) {
    return PLANS.map(function (r, i) {
      const p = {
        id: r[0], name: r[1], focus: r[2],
        items: r[4].map(function (x) { return { exerciseId: x[0], sets: x[1] }; }),
        archived: false, isSample: false,
        createdAt: new Date(baseMs + i).toISOString()
      };
      if (r[3]) p.note = r[3];
      return p;
    });
  }

  /* ติดตั้งโปรแกรม:
   *  - เพิ่มท่า/แผนของโปรแกรม (ถ้า id นั้นยังไม่มี — ของเดิมไม่ถูกทับ)
   *  - จัดการข้อมูลตัวอย่างเดิมจากเวอร์ชัน 1.0–1.2 (isSample และผู้ใช้ไม่เคยแก้):
   *      ถูกแผนของผู้ใช้/ท่าอื่นอ้างอยู่ → คงไว้ | เคยมีประวัติ → เก็บเข้าคลัง | ไม่มีประวัติ → ลบ
   *      แผนตัวอย่าง → ลบ (ประวัติเก็บชื่อแผนไว้เองอยู่แล้ว)
   *  - ไม่แตะ workout ใด ๆ
   * db = { exercises, plans, workouts, settings } ; คืน null ถ้าติดตั้งแล้ว
   */
  function buildInstall(db, nowMs) {
    if (db.settings && db.settings.program === PROGRAM_ID) return null;
    const nowIso = new Date(nowMs).toISOString();
    const haveEx = {}, havePlan = {};
    db.exercises.forEach(function (e) { haveEx[e.id] = e; });
    db.plans.forEach(function (p) { havePlan[p.id] = p; });

    const ops = [];
    const report = { addedExercises: 0, addedPlans: 0, removedExercises: 0, archivedExercises: 0, removedPlans: 0, keptSamples: 0 };

    // ข้อมูลตัวอย่างเดิม
    const sampleEx = db.exercises.filter(function (e) { return e.isSample; });
    const samplePlans = db.plans.filter(function (p) { return p.isSample; });
    const userPlans = db.plans.filter(function (p) { return !p.isSample; });
    const userEx = db.exercises.filter(function (e) { return !e.isSample; });
    const removedIds = {};
    sampleEx.forEach(function (e) {
      const usedByUserPlan = userPlans.some(function (p) { return p.items.some(function (it) { return it.exerciseId === e.id; }); });
      const usedByUserSub = userEx.some(function (u) { return (u.subs || []).indexOf(e.id) >= 0; });
      if (usedByUserPlan || usedByUserSub) { report.keptSamples++; return; }
      const hasHistory = db.workouts.some(function (w) {
        return w.entries.some(function (en) { return en.exerciseId === e.id || en.plannedExerciseId === e.id; });
      });
      if (hasHistory) {
        if (!e.archived) { const a = JSON.parse(JSON.stringify(e)); a.archived = true; ops.push({ store: 'exercises', put: a }); report.archivedExercises++; }
      } else {
        ops.push({ store: 'exercises', del: e.id }); removedIds[e.id] = true; report.removedExercises++;
      }
    });
    samplePlans.forEach(function (p) { ops.push({ store: 'plans', del: p.id }); report.removedPlans++; });

    exercises(nowIso).forEach(function (e) {
      if (haveEx[e.id]) return;
      ops.push({ store: 'exercises', put: e }); report.addedExercises++;
    });
    plans(nowMs).forEach(function (p) {
      if (havePlan[p.id]) return;
      ops.push({ store: 'plans', put: p }); report.addedPlans++;
    });
    if (report.removedExercises || report.archivedExercises || report.removedPlans) {
      ops.push({ store: 'settings', put: { key: 'programNotice', value: report } });   // แสดงครั้งเดียวที่หน้าแรก
    }
    ops.push({ store: 'settings', put: { key: 'program', value: PROGRAM_ID } });
    ops.push({ store: 'settings', put: { key: 'seeded', value: true } });
    ops.push({ store: 'settings', put: { key: 'unit', value: (db.settings && db.settings.unit) || 'kg' } });
    return { ops: ops, report: report };
  }


  /* ---------- 1.6: แยกชื่อกล้ามเนื้อ (ไหล่ → ไหล่ข้าง/ไหล่หลัง · ขา → ต้นขาหน้า/ต้นขาหลัง) ----------
   * ย้ายข้อมูลแบบไม่ทำลาย:
   *  - แตะเฉพาะ “ท่าที่โปรแกรม PPL ติดตั้งให้” (รหัส ppl-*) ที่ชื่อกล้ามเนื้อยังเป็นค่าเดิมของโปรแกรมเท่านั้น
   *    ท่าที่คุณสร้างเอง หรือท่าที่คุณแก้ชื่อกล้ามเนื้อเองแล้ว ไม่ถูกแตะ
   *  - เก็บค่าเดิมไว้ก่อนใน settings คีย์ muscleSplitBackup (ใช้ย้อนกลับได้) แล้วค่อยแก้ ทั้งหมดอยู่ใน transaction เดียว
   *  - ทำครั้งเดียว (ธง muscleSplit; หลังกู้คืนไฟล์สำรองเก่าจะรันอีกครั้งแบบ force) และทำซ้ำได้ปลอดภัย (ไม่มีอะไรให้แก้ก็ไม่เขียนอะไร นอกจากธง)
   *  - ประวัติการฝึก (workouts) ไม่ถูกแตะเลย: ในประวัติไม่ได้เก็บชื่อกล้ามเนื้อ ระบบดูจากท่าปัจจุบัน
   */
  const MUSCLE_SPLIT = {
    'ppl-lateral-raise-machine': ['ไหล่', 'ไหล่ข้าง'],
    'ppl-cable-lateral-raise': ['ไหล่', 'ไหล่ข้าง'],
    'ppl-reverse-pec-deck': ['ไหล่', 'ไหล่หลัง'],
    'ppl-cable-rear-delt-fly': ['ไหล่', 'ไหล่หลัง'],
    'ppl-leg-press': ['ขา', 'ต้นขาหน้า'],
    'ppl-hack-squat': ['ขา', 'ต้นขาหน้า'],
    'ppl-leg-extension': ['ขา', 'ต้นขาหน้า'],
    'ppl-leg-extension-b': ['ขา', 'ต้นขาหน้า'],
    'ppl-seated-leg-curl': ['ขา', 'ต้นขาหลัง'],
    'ppl-lying-leg-curl': ['ขา', 'ต้นขาหลัง']
  };

  function buildMuscleSplit(db, force) {
    if (!force && db.settings && db.settings.muscleSplit) return null;
    const ops = [], backup = [];
    db.exercises.forEach(function (e) {
      const m = MUSCLE_SPLIT[e.id];
      if (!m || e.muscle !== m[0]) return;
      const c = JSON.parse(JSON.stringify(e)); c.muscle = m[1];
      ops.push({ store: 'exercises', put: c });
      backup.push({ id: e.id, muscle: e.muscle });
    });
    if (backup.length) ops.push({ store: 'settings', put: { key: 'muscleSplitBackup', value: backup } });
    ops.push({ store: 'settings', put: { key: 'muscleSplit', value: 'v1' } });
    return { ops: ops, changed: backup.length };
  }

  const api = { PROGRAM_ID: PROGRAM_ID, exercises: exercises, plans: plans, buildInstall: buildInstall, buildMuscleSplit: buildMuscleSplit, MUSCLE_SPLIT: MUSCLE_SPLIT };
  global.GymProgram = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
