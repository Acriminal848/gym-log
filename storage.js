/* storage.js — เก็บข้อมูลใน IndexedDB, สำรอง (export) และกู้คืน (import)
 * ไม่มีการเรียกเครือข่ายใด ๆ ในไฟล์นี้ ข้อมูลทั้งหมดอยู่ในเครื่องผู้ใช้
 */
(function (global) {
  'use strict';

  const DB_NAME = 'gymlog';
  const DB_VERSION = 1;          // เวอร์ชันของ IndexedDB (เปลี่ยนเมื่อเพิ่ม store/index)
  const SCHEMA_VERSION = 1;      // เวอร์ชันโครงข้อมูลที่เขียนลงไฟล์สำรอง
  const BACKUP_FORMAT = 'gymlog-backup';
  const WEIGHT_MODES = ['barbell_total', 'dumbbell_each', 'machine', 'cable', 'bodyweight'];

  /* ---------- ตัวช่วยเล็ก ๆ ---------- */

  function uid(prefix) {
    let r;
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      r = global.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    } else {
      r = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }
    return (prefix || 'id') + '_' + r;
  }

  /* ---------- IndexedDB ---------- */

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('เบราว์เซอร์นี้ไม่รองรับ IndexedDB'));
        return;
      }
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (ev) {
        const db = req.result;
        if (ev.oldVersion < 1) {
          db.createObjectStore('exercises', { keyPath: 'id' });
          db.createObjectStore('plans', { keyPath: 'id' });
          const w = db.createObjectStore('workouts', { keyPath: 'id' });
          w.createIndex('date', 'date');
          w.createIndex('status', 'status');
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        // เวอร์ชันถัดไป: เพิ่ม if (ev.oldVersion < 2) { ... } โดยห้ามลบ store เดิม
      };
      req.onsuccess = function () {
        const db = req.result;
        db.onversionchange = function () { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error('เปิดฐานข้อมูลไม่ได้')); };
      req.onblocked = function () { reject(new Error('ฐานข้อมูลถูกใช้งานอยู่ในแท็บอื่น ปิดแท็บอื่นแล้วลองใหม่')); };
    });
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  // รัน transaction แล้วคืนผลเมื่อ commit เสร็จจริง (ถึงตอนนั้นข้อมูลถึงปลอดภัย)
  // fn(tx) คืน request หรือ array ของ request ได้ ผลลัพธ์จะถูกอ่านหลัง commit
  async function run(storeNames, mode, fn) {
    const db = await openDb();
    return new Promise(function (resolve, reject) {
      let out;
      let tx;
      try {
        tx = db.transaction(storeNames, mode);
      } catch (e) { reject(e); return; }
      tx.oncomplete = function () {
        if (Array.isArray(out)) resolve(out.map(function (r) { return r && r.result; }));
        else resolve(out && typeof out === 'object' && 'result' in out ? out.result : out);
      };
      tx.onerror = function () { reject(tx.error || new Error('บันทึกไม่สำเร็จ')); };
      tx.onabort = function () { reject(tx.error || new Error('การบันทึกถูกยกเลิก')); };
      try {
        out = fn(tx);
      } catch (e) {
        try { tx.abort(); } catch (_) { /* ignore */ }
        reject(e);
      }
    });
  }

  function getAll(store) {
    return run([store], 'readonly', function (tx) { return tx.objectStore(store).getAll(); });
  }
  function get(store, key) {
    return run([store], 'readonly', function (tx) { return tx.objectStore(store).get(key); });
  }
  function put(store, value) {
    return run([store], 'readwrite', function (tx) { tx.objectStore(store).put(value); });
  }
  function del(store, key) {
    return run([store], 'readwrite', function (tx) { tx.objectStore(store).delete(key); });
  }

  async function getSettings() {
    const rows = await getAll('settings');
    const o = {};
    rows.forEach(function (r) { o[r.key] = r.value; });
    return o;
  }
  function setSetting(key, value) {
    return put('settings', { key: key, value: value });
  }

  /* ---------- ข้อมูลตัวอย่าง (ท่า/แผนเท่านั้น ไม่มีประวัติสมมติ) ---------- */

  function seedData() {
    const now = new Date().toISOString();
    function ex(id, name, muscle, equipment, repMin, repMax, step, weightMode, subs) {
      return {
        id: id, name: name, muscle: muscle, equipment: equipment,
        repMin: repMin, repMax: repMax, step: step, weightMode: weightMode,
        subs: subs || [], archived: false, isSample: true, createdAt: now
      };
    }
    const exercises = [
      ex('seed-bench-press', 'Barbell Bench Press', 'อก', 'บาร์เบล', 6, 10, 2.5, 'barbell_total',
        ['seed-incline-db-press', 'seed-chest-press-machine']),
      ex('seed-incline-db-press', 'Incline Dumbbell Press', 'อก', 'ดัมเบล', 8, 12, 2, 'dumbbell_each',
        ['seed-chest-press-machine']),
      ex('seed-chest-press-machine', 'Chest Press Machine', 'อก', 'เครื่อง Chest Press', 10, 15, 5, 'machine',
        ['seed-incline-db-press']),
      ex('seed-shoulder-press', 'Dumbbell Shoulder Press', 'ไหล่', 'ดัมเบล', 8, 12, 2, 'dumbbell_each', []),
      ex('seed-triceps-pushdown', 'Triceps Pushdown', 'ไตรเซ็ป', 'สายเคเบิล', 10, 15, 2.5, 'cable', []),
      ex('seed-lat-pulldown', 'Lat Pulldown', 'หลัง', 'เครื่อง Lat Pulldown', 8, 12, 5, 'machine',
        ['seed-seated-row']),
      ex('seed-seated-row', 'Seated Cable Row', 'หลัง', 'สายเคเบิล', 8, 12, 5, 'cable',
        ['seed-lat-pulldown']),
      ex('seed-db-curl', 'Dumbbell Curl', 'ไบเซ็ป', 'ดัมเบล', 8, 12, 2, 'dumbbell_each', [])
    ];
    const plans = [
      {
        id: 'seed-plan-push', name: 'Push (ตัวอย่าง)', archived: false, isSample: true, createdAt: now,
        items: [
          { exerciseId: 'seed-bench-press', sets: 3 },
          { exerciseId: 'seed-incline-db-press', sets: 3 },
          { exerciseId: 'seed-shoulder-press', sets: 3 },
          { exerciseId: 'seed-triceps-pushdown', sets: 3 }
        ]
      },
      {
        id: 'seed-plan-pull', name: 'Pull (ตัวอย่าง)', archived: false, isSample: true, createdAt: now,
        items: [
          { exerciseId: 'seed-lat-pulldown', sets: 3 },
          { exerciseId: 'seed-seated-row', sets: 3 },
          { exerciseId: 'seed-db-curl', sets: 3 }
        ]
      }
    ];
    return { exercises: exercises, plans: plans };
  }

  async function init() {
    await openDb();
    const s = await getSettings();
    const seed = seedData();
    if (!s.seeded) {
      await run(['exercises', 'plans', 'settings'], 'readwrite', function (tx) {
        seed.exercises.forEach(function (e) { tx.objectStore('exercises').put(e); });
        seed.plans.forEach(function (p) { tx.objectStore('plans').put(p); });
        tx.objectStore('settings').put({ key: 'seeded', value: true });
        tx.objectStore('settings').put({ key: 'unit', value: 'kg' });
      });
    }
    await setSetting('schemaVersion', SCHEMA_VERSION);
    return getSettings();
  }

  /* ---------- Export ---------- */

  async function exportAll(appVersion) {
    const db = await openDb();
    const stores = ['exercises', 'plans', 'workouts', 'settings'];
    const res = await new Promise(function (resolve, reject) {
      const tx = db.transaction(stores, 'readonly');
      const reqs = stores.map(function (n) { return tx.objectStore(n).getAll(); });
      tx.oncomplete = function () { resolve(reqs.map(function (r) { return r.result; })); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('อ่านข้อมูลไม่สำเร็จ')); };
    });
    const settingsObj = {};
    res[3].forEach(function (r) { settingsObj[r.key] = r.value; });
    return {
      format: BACKUP_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: appVersion || null,
      note: 'ไฟล์สำรองข้อมูล Gym Log เก็บเฉพาะในเครื่อง/ไฟล์ของคุณ ไม่ได้ถูกส่งไปที่ใด',
      data: {
        exercises: res[0],
        plans: res[1],
        workouts: res[2],
        settings: { unit: settingsObj.unit || 'kg' }
      }
    };
  }

  /* ---------- ตรวจไฟล์ Import ---------- */

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 200) : ''; }
  function finiteNum(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  function validateBackup(raw) {
    const errors = [];
    const warnings = [];
    function err(m) { if (errors.length < 12) errors.push(m); }

    if (!isObj(raw) || raw.format !== BACKUP_FORMAT) {
      return { ok: false, errors: ['นี่ไม่ใช่ไฟล์สำรองของแอป Gym Log (ไม่พบ format "' + BACKUP_FORMAT + '")'], warnings: [] };
    }
    if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
      return { ok: false, errors: ['ไฟล์สำรองไม่ระบุเวอร์ชันโครงข้อมูล'], warnings: [] };
    }
    if (raw.schemaVersion > SCHEMA_VERSION) {
      return {
        ok: false,
        errors: ['ไฟล์สำรองมาจากแอปเวอร์ชันใหม่กว่า (โครงข้อมูล v' + raw.schemaVersion + ', แอปนี้รองรับถึง v' + SCHEMA_VERSION + ') — อัปเดตแอปก่อน'],
        warnings: []
      };
    }
    const d = raw.data;
    if (!isObj(d) || !Array.isArray(d.exercises) || !Array.isArray(d.plans) || !Array.isArray(d.workouts)) {
      return { ok: false, errors: ['โครงสร้างข้อมูลในไฟล์ไม่ครบ (ต้องมี exercises, plans, workouts)'], warnings: [] };
    }

    // migration จากเวอร์ชันเก่าจะทำที่นี่เมื่อมีโครงข้อมูลใหม่ (ตอนนี้มีเพียง v1)

    const seenEx = {}, seenPlan = {}, seenW = {};
    const exercises = [], plans = [], workouts = [];

    d.exercises.forEach(function (e, i) {
      const tag = 'ท่าที่ ' + (i + 1);
      if (!isObj(e) || typeof e.id !== 'string' || !e.id) { err(tag + ': ไม่มี id'); return; }
      if (seenEx[e.id]) { err(tag + ': id ซ้ำ (' + e.id + ')'); return; }
      seenEx[e.id] = true;
      const name = str(e.name, 120).trim();
      if (!name) { err(tag + ': ไม่มีชื่อท่า'); return; }
      let repMin = Number.isInteger(e.repMin) ? e.repMin : 8;
      let repMax = Number.isInteger(e.repMax) ? e.repMax : 12;
      if (repMin < 1 || repMax > 200 || repMin > repMax) { repMin = 8; repMax = 12; warnings.push(tag + ': ช่วง reps ผิดปกติ ใช้ค่าเริ่มต้น 8–12'); }
      const step = finiteNum(e.step) && e.step > 0 && e.step <= 500 ? e.step : 2.5;
      exercises.push({
        id: e.id, name: name, muscle: str(e.muscle, 60), equipment: str(e.equipment, 80),
        repMin: repMin, repMax: repMax, step: step,
        weightMode: WEIGHT_MODES.indexOf(e.weightMode) >= 0 ? e.weightMode : 'machine',
        subs: Array.isArray(e.subs) ? e.subs.filter(function (x) { return typeof x === 'string'; }).slice(0, 50) : [],
        archived: !!e.archived, isSample: !!e.isSample,
        createdAt: str(e.createdAt, 40) || null
      });
    });

    d.plans.forEach(function (p, i) {
      const tag = 'แผนที่ ' + (i + 1);
      if (!isObj(p) || typeof p.id !== 'string' || !p.id) { err(tag + ': ไม่มี id'); return; }
      if (seenPlan[p.id]) { err(tag + ': id ซ้ำ (' + p.id + ')'); return; }
      seenPlan[p.id] = true;
      const name = str(p.name, 120).trim();
      if (!name) { err(tag + ': ไม่มีชื่อแผน'); return; }
      if (!Array.isArray(p.items)) { err(tag + ': ไม่มีรายการท่า'); return; }
      const items = [];
      p.items.forEach(function (it) {
        if (!isObj(it) || typeof it.exerciseId !== 'string') { err(tag + ': รายการท่าผิดรูปแบบ'); return; }
        const sets = Number.isInteger(it.sets) && it.sets >= 1 && it.sets <= 30 ? it.sets : 3;
        if (!seenEx[it.exerciseId]) warnings.push(tag + ' อ้างถึงท่าที่ไม่มีในไฟล์ (' + it.exerciseId + ')');
        items.push({ exerciseId: it.exerciseId, sets: sets });
      });
      plans.push({ id: p.id, name: name, items: items, archived: !!p.archived, isSample: !!p.isSample, createdAt: str(p.createdAt, 40) || null });
    });

    d.workouts.forEach(function (w, i) {
      const tag = 'workout ที่ ' + (i + 1);
      if (!isObj(w) || typeof w.id !== 'string' || !w.id) { err(tag + ': ไม่มี id'); return; }
      if (seenW[w.id]) { err(tag + ': id ซ้ำ (' + w.id + ')'); return; }
      seenW[w.id] = true;
      if (typeof w.date !== 'string' || !DATE_RE.test(w.date)) { err(tag + ': วันที่ไม่ถูกต้อง'); return; }
      if (w.status !== 'active' && w.status !== 'finished') { err(tag + ': สถานะไม่ถูกต้อง'); return; }
      if (!Array.isArray(w.entries)) { err(tag + ': ไม่มีรายการท่า'); return; }
      let bad = false;
      const entries = w.entries.map(function (en, j) {
        const etag = tag + ' ท่าที่ ' + (j + 1);
        if (!isObj(en) || typeof en.id !== 'string' || typeof en.exerciseId !== 'string' || !Array.isArray(en.sets)) {
          err(etag + ': ผิดรูปแบบ'); bad = true; return null;
        }
        const sets = [];
        en.sets.forEach(function (s, k) {
          const stag = etag + ' เซตที่ ' + (k + 1);
          if (!isObj(s) || typeof s.id !== 'string') { err(stag + ': ผิดรูปแบบ'); bad = true; return; }
          if (s.kind !== 'working' && s.kind !== 'warmup') { err(stag + ': ชนิดเซตไม่ถูกต้อง'); bad = true; return; }
          if (s.status !== 'completed' && s.status !== 'skipped') { err(stag + ': สถานะเซตไม่ถูกต้อง'); bad = true; return; }
          let weight = null, reps = null;
          if (s.status === 'completed') {
            weight = finiteNum(s.weight);
            reps = Number.isInteger(s.reps) ? s.reps : null;
            if (weight === null || weight < 0 || weight > 5000 || reps === null || reps < 1 || reps > 1000) {
              err(stag + ': น้ำหนักหรือ reps ไม่ถูกต้อง'); bad = true; return;
            }
          }
          sets.push({ id: s.id, kind: s.kind, status: s.status, weight: weight, reps: reps, at: str(s.at, 40) || null });
        });
        let target = null;
        if (isObj(en.target)) {
          target = {
            weight: finiteNum(en.target.weight),
            reps: Number.isInteger(en.target.reps) ? en.target.reps : null,
            reason: str(en.target.reason, 300)
          };
        }
        return {
          id: en.id,
          plannedExerciseId: typeof en.plannedExerciseId === 'string' ? en.plannedExerciseId : null,
          plannedExerciseName: str(en.plannedExerciseName, 120) || null,
          exerciseId: en.exerciseId,
          exerciseName: str(en.exerciseName, 120) || en.exerciseId,
          equipment: str(en.equipment, 80),
          weightMode: WEIGHT_MODES.indexOf(en.weightMode) >= 0 ? en.weightMode : 'machine',
          plannedSets: Number.isInteger(en.plannedSets) && en.plannedSets >= 0 && en.plannedSets <= 30 ? en.plannedSets : 3,
          target: target,
          sets: sets,
          draft: null   // ค่าที่ยังไม่ยืนยันไม่ถูกนำเข้า
        };
      });
      if (bad) return;
      workouts.push({
        id: w.id, date: w.date, status: w.status,
        startedAt: str(w.startedAt, 40) || null,
        finishedAt: str(w.finishedAt, 40) || null,
        planId: typeof w.planId === 'string' ? w.planId : null,
        planName: str(w.planName, 120),
        entries: entries
      });
    });

    if (errors.length) return { ok: false, errors: errors, warnings: warnings };

    let completedWorking = 0, first = null, last = null, finished = 0;
    workouts.forEach(function (w) {
      if (w.status === 'finished') finished++;
      if (!first || w.date < first) first = w.date;
      if (!last || w.date > last) last = w.date;
      w.entries.forEach(function (en) {
        en.sets.forEach(function (s) { if (s.kind === 'working' && s.status === 'completed') completedWorking++; });
      });
    });

    return {
      ok: true, errors: [], warnings: warnings,
      summary: {
        exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
        appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : null,
        exercises: exercises.length, plans: plans.length,
        workouts: workouts.length, finishedWorkouts: finished,
        completedWorkingSets: completedWorking,
        firstDate: first, lastDate: last
      },
      clean: {
        exercises: exercises, plans: plans, workouts: workouts,
        settings: { unit: isObj(d.settings) && d.settings.unit === 'kg' ? 'kg' : 'kg' }
      }
    };
  }

  /* ---------- Import ---------- */

  // แทนที่ข้อมูล exercises/plans/workouts ทั้งหมดใน transaction เดียว
  // ถ้าผิดพลาดกลางทาง transaction จะถูก abort และข้อมูลเดิมยังอยู่ครบ
  function importReplace(clean) {
    return run(['exercises', 'plans', 'workouts', 'settings'], 'readwrite', function (tx) {
      ['exercises', 'plans', 'workouts'].forEach(function (name) {
        const st = tx.objectStore(name);
        st.clear();
        clean[name].forEach(function (r) { st.put(r); });
      });
      tx.objectStore('settings').put({ key: 'unit', value: clean.settings.unit });
      tx.objectStore('settings').put({ key: 'seeded', value: true });
    });
  }

  // รวมเข้ากับข้อมูลเดิม: เพิ่มเฉพาะ id ที่ยังไม่มี ไม่ทับของเดิม
  async function importMerge(clean, opts) {
    const hasLocalActive = !!(opts && opts.hasLocalActive);
    const existing = {};
    for (const name of ['exercises', 'plans', 'workouts']) {
      const rows = await getAll(name);
      existing[name] = {};
      rows.forEach(function (r) { existing[name][r.id] = true; });
    }
    const added = { exercises: 0, plans: 0, workouts: 0 };
    const skipped = { exercises: 0, plans: 0, workouts: 0 };
    let skippedActive = 0;
    await run(['exercises', 'plans', 'workouts'], 'readwrite', function (tx) {
      ['exercises', 'plans', 'workouts'].forEach(function (name) {
        const st = tx.objectStore(name);
        clean[name].forEach(function (r) {
          if (existing[name][r.id]) { skipped[name]++; return; }
          if (name === 'workouts' && r.status === 'active' && hasLocalActive) { skippedActive++; return; }
          st.add(r);   // add (ไม่ใช่ put) เพื่อไม่ให้ทับข้อมูลเดิมแม้เกิด race
          added[name]++;
        });
      });
    });
    return { added: added, skipped: skipped, skippedActive: skippedActive };
  }

  const api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    BACKUP_FORMAT: BACKUP_FORMAT,
    WEIGHT_MODES: WEIGHT_MODES,
    uid: uid,
    init: init,
    getAll: getAll, get: get, put: put, del: del,
    getSettings: getSettings, setSetting: setSetting,
    exportAll: exportAll,
    validateBackup: validateBackup,
    importReplace: importReplace,
    importMerge: importMerge,
    seedData: seedData
  };
  global.GymStorage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
