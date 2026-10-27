/* ทดสอบกติกา progression และสรุปรายสัปดาห์ ด้วยข้อมูลสมมติ (ไม่ใช่ข้อมูลจริงของใคร)
 * รัน: node tests/unit.test.js
 */
'use strict';
const assert = require('assert');
const P = require('../progression.js');
const SM = require('../summary.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
}

/* ---------- ตัวช่วยสร้างข้อมูลสมมติ ---------- */
let n = 0;
const EX = { repMin: 8, repMax: 12, step: 2.5 };
const BENCH = { exerciseId: 'ex-bench', exerciseName: 'Bench', equipment: 'บาร์เบล', weightMode: 'barbell_total' };

function sets(list, kind) {
  // list: [[weight, reps], ...] หรือ 'skip'
  return list.map(function (x) {
    n++;
    if (x === 'skip') return { id: 's' + n, kind: kind || 'working', status: 'skipped', weight: null, reps: null };
    return { id: 's' + n, kind: kind || 'working', status: 'completed', weight: x[0], reps: x[1] };
  });
}
function session(date, setList, over) {
  over = over || {};
  n++;
  const entry = Object.assign({}, BENCH, { id: 'e' + n, plannedSets: 3, target: null, sets: setList }, over.entry || {});
  return { id: 'w' + n, date: date, status: over.status || 'finished', startedAt: date + 'T08:00:00Z', planName: 'Push', entries: [entry] };
}
const todayEntry = Object.assign({}, BENCH, { plannedSets: 3 });
function suggest(history, ex) { return P.suggestTarget(history, todayEntry, ex || EX, 'current'); }

/* ================= progression ================= */

test('ไม่เคยเล่นท่านี้ → ไม่มีเป้า (ให้ผู้ใช้กรอกน้ำหนักเริ่มต้นเอง)', () => {
  assert.strictEqual(suggest([]), null);
});

test('ยังไม่ถึง ceiling → น้ำหนักเดิม เพิ่ม reps จากค่าต่ำสุด +1', () => {
  const t = suggest([session('2026-10-01', sets([[40, 10], [40, 9], [40, 9]]))]);
  assert.strictEqual(t.kind, 'add_reps'); assert.strictEqual(t.weight, 40); assert.strictEqual(t.reps, 10);
  assert.ok(/10\/9\/9/.test(t.reason) && /เพิ่ม reps/.test(t.reason));
});

test('เพิ่ม reps ไม่เกิน ceiling', () => {
  const t = suggest([session('2026-10-01', sets([[40, 12], [40, 12], [40, 11]]))]);
  assert.strictEqual(t.kind, 'add_reps'); assert.strictEqual(t.reps, 12); assert.strictEqual(t.weight, 40);
});

test('ครบทุกเซตถึง ceiling → เพิ่มน้ำหนัก 1 ขั้น เริ่มที่ขั้นต่ำของช่วง + มีเหตุผลสั้น ๆ', () => {
  const t = suggest([session('2026-10-01', sets([[40, 12], [40, 12], [40, 12]]))]);
  assert.strictEqual(t.kind, 'add_weight'); assert.strictEqual(t.weight, 42.5); assert.strictEqual(t.reps, 8);
  assert.ok(t.reason.indexOf('ครั้งก่อนครบ 12 reps ทุกเซต จึงเสนอเพิ่มน้ำหนัก') === 0, t.reason);
});

test('reps เกิน ceiling ก็นับว่าถึง ceiling', () => {
  const t = suggest([session('2026-10-01', sets([[40, 14], [40, 12], [40, 13]]))]);
  assert.strictEqual(t.kind, 'add_weight');
});

test('step ตามอุปกรณ์จริง (ดัมเบล 2 kg) และทศนิยมไม่เพี้ยน', () => {
  const t = suggest([session('2026-10-01', sets([[17.5, 12], [17.5, 12], [17.5, 12]]))], { repMin: 8, repMax: 12, step: 0.1 + 0.2 });
  assert.strictEqual(t.weight, 17.8);
  const t2 = suggest([session('2026-10-01', sets([[22, 12], [22, 12], [22, 12]]))], { repMin: 8, repMax: 12, step: 2 });
  assert.strictEqual(t2.weight, 24);
});

test('ถึง ceiling แต่จดไม่ครบตามแผน (ข้ามเซต) → ไม่เพิ่มน้ำหนัก และไม่ตีว่าล้มเหลว', () => {
  const t = suggest([session('2026-10-01', sets([[40, 12], [40, 12], 'skip']))]);
  assert.strictEqual(t.kind, 'incomplete'); assert.strictEqual(t.weight, 40); assert.strictEqual(t.reps, 12);
  assert.ok(/2 จาก 3 เซต/.test(t.reason) && /ไม่นับเป็นล้มเหลว/.test(t.reason));
});

test('เซตที่ข้ามไม่ถูกนับเป็น reps = 0 (ไม่ทำให้เข้าเงื่อนไขพลาดขั้นต่ำ)', () => {
  const hist = [
    session('2026-10-08', sets([[40, 10], [40, 10], 'skip'])),
    session('2026-10-01', sets([[40, 10], [40, 10], 'skip']))
  ];
  const t = suggest(hist);
  assert.strictEqual(t.kind, 'add_reps'); assert.strictEqual(t.weight, 40); assert.strictEqual(t.reps, 11);
});

test('warm-up ไม่ถูกนำมาคิด progression', () => {
  const s = sets([[20, 15]], 'warmup').concat(sets([[40, 10], [40, 10], [40, 10]]));
  const t = suggest([session('2026-10-01', s)]);
  assert.strictEqual(t.weight, 40); assert.strictEqual(t.reps, 11);
  const only = suggest([session('2026-10-01', sets([[20, 15], [20, 15]], 'warmup'))]);
  assert.strictEqual(only, null, 'มีแต่ warm-up = ยังไม่เคยเล่นจริง');
});

test('พลาดขั้นต่ำครั้งเดียว → ไม่ลดน้ำหนักทันที (ลองซ้ำ)', () => {
  const t = suggest([session('2026-10-01', sets([[40, 8], [40, 7], [40, 6]]))]);
  assert.strictEqual(t.kind, 'hold'); assert.strictEqual(t.weight, 40); assert.strictEqual(t.reps, 8);
  assert.ok(/ครั้งเดียวยังไม่ลดน้ำหนัก/.test(t.reason));
});

test('พลาดขั้นต่ำที่น้ำหนักเดิมติดกัน 2 ครั้ง → เสนอลด 1 ขั้น', () => {
  const t = suggest([
    session('2026-10-08', sets([[40, 7], [40, 7], [40, 6]])),
    session('2026-10-01', sets([[40, 8], [40, 7], [40, 6]]))
  ]);
  assert.strictEqual(t.kind, 'deload'); assert.strictEqual(t.weight, 37.5); assert.strictEqual(t.reps, 8);
  assert.ok(/ติดกัน 2 ครั้ง/.test(t.reason));
});

test('พลาดขั้นต่ำ แต่ครั้งก่อนหน้านั้นเป็นน้ำหนักอื่น → ยังไม่ลด', () => {
  const t = suggest([
    session('2026-10-08', sets([[42.5, 7], [42.5, 6], [42.5, 6]])),
    session('2026-10-01', sets([[40, 12], [40, 12], [40, 12]]))
  ]);
  assert.strictEqual(t.kind, 'hold'); assert.strictEqual(t.weight, 42.5);
});

test('ครั้งก่อนปกติ แม้ครั้งก่อนหน้าพลาด → ไม่ลด', () => {
  const t = suggest([
    session('2026-10-08', sets([[40, 9], [40, 9], [40, 9]])),
    session('2026-10-01', sets([[40, 6], [40, 6], [40, 6]]))
  ]);
  assert.strictEqual(t.kind, 'add_reps'); assert.strictEqual(t.weight, 40);
});

test('ลดน้ำหนักไม่ติดลบ (น้ำหนักน้อยกว่า step → คงเดิม)', () => {
  const ex = { repMin: 8, repMax: 12, step: 5 };
  const t = suggest([
    session('2026-10-08', sets([[5, 6], [5, 6], [5, 6]])),
    session('2026-10-01', sets([[5, 6], [5, 6], [5, 6]]))
  ], ex);
  assert.ok(t.weight > 0);
  assert.strictEqual(t.kind, 'hold');
});

test('น้ำหนักผสมหลายค่า → เสนอระมัดระวัง ไม่เพิ่มน้ำหนัก และแจ้งข้อจำกัด', () => {
  const t = suggest([session('2026-10-01', sets([[40, 12], [40, 12], [37.5, 12]]))]);
  assert.strictEqual(t.kind, 'mixed'); assert.strictEqual(t.weight, 40); assert.strictEqual(t.reps, 12);
  assert.ok(/หลายค่า/.test(t.reason) && /ไม่เสนอเพิ่มน้ำหนัก/.test(t.reason));
});

test('น้ำหนักผสม จำนวนเท่ากัน → เลือกค่าที่เบากว่า', () => {
  const t = suggest([session('2026-10-01', sets([[40, 10], [42.5, 9], [45, 8]]))]);
  assert.strictEqual(t.kind, 'mixed'); assert.strictEqual(t.weight, 40);
});

test('ต่างอุปกรณ์/วิธีนับ → เทียบไม่ได้ ไม่เสนอตัวเลข', () => {
  const hist = [session('2026-10-01', sets([[40, 12], [40, 12], [40, 12]]), { entry: { equipment: 'Smith machine' } })];
  const t = suggest(hist);
  assert.strictEqual(t.kind, 'incomparable'); assert.strictEqual(t.weight, null); assert.strictEqual(t.reps, null);
  assert.ok(/เทียบน้ำหนักกันไม่ได้/.test(t.reason));
  const hist2 = [session('2026-10-01', sets([[20, 12], [20, 12], [20, 12]]), { entry: { weightMode: 'dumbbell_each' } })];
  assert.strictEqual(suggest(hist2).kind, 'incomparable');
});

test('มีทั้งอุปกรณ์ต่างและตรงกัน → ใช้เฉพาะที่ตรงกัน', () => {
  const hist = [
    session('2026-10-08', sets([[100, 12], [100, 12], [100, 12]]), { entry: { equipment: 'Smith machine' } }),
    session('2026-10-01', sets([[40, 10], [40, 10], [40, 10]]))
  ];
  const t = suggest(hist);
  assert.strictEqual(t.kind, 'add_reps'); assert.strictEqual(t.weight, 40);
});

test('ไม่ย้ายน้ำหนักข้ามท่า', () => {
  const hist = [session('2026-10-01', sets([[40, 12], [40, 12], [40, 12]]), { entry: { exerciseId: 'ex-other', exerciseName: 'Other' } })];
  assert.strictEqual(suggest(hist), null);
});

test('workout ที่ยังไม่จบ (active) ไม่ถูกนำมาคำนวณ', () => {
  const hist = [session('2026-10-08', sets([[60, 12], [60, 12], [60, 12]]), { status: 'active' })];
  assert.strictEqual(suggest(hist), null);
  const hist2 = hist.concat([session('2026-10-01', sets([[40, 10], [40, 10], [40, 10]]))]);
  assert.strictEqual(suggest(hist2).weight, 40);
});

test('คำนวณจากผลจริง ไม่ใช่เป้าที่เคยเสนอ (เป้า 50 แต่ทำจริง 47.5×10 → ต่อจาก 47.5)', () => {
  const s = session('2026-10-01', sets([[47.5, 10], [47.5, 10], [47.5, 10]]), { entry: { target: { weight: 50, reps: 8, reason: 'x' } } });
  const t = suggest([s]);
  assert.strictEqual(t.weight, 47.5); assert.strictEqual(t.reps, 11);
});

test('ต่อให้เป้าที่เสนอไว้เป็นการเพิ่มน้ำหนัก ถ้าไม่ได้ทำจริงก็ไม่ถือว่าทำแล้ว', () => {
  const s = session('2026-10-01', sets([[40, 9], [40, 9], [40, 9]]), { entry: { target: { weight: 42.5, reps: 8, reason: 'x' } } });
  const t = suggest([s]);
  assert.strictEqual(t.weight, 40);
});

test('ใช้ครั้งล่าสุดตามวันที่ (ไม่ใช่ลำดับในอาร์เรย์)', () => {
  const hist = [
    session('2026-09-01', sets([[30, 12], [30, 12], [30, 12]])),
    session('2026-10-08', sets([[40, 10], [40, 10], [40, 10]])),
    session('2026-09-15', sets([[35, 12], [35, 12], [35, 12]]))
  ];
  assert.strictEqual(suggest(hist).weight, 40);
});

test('ท่าน้ำหนักตัว (น้ำหนักเพิ่ม 0) ถึง ceiling → เพิ่มทีละ step', () => {
  const e = Object.assign({}, BENCH, { weightMode: 'bodyweight', equipment: 'น้ำหนักตัว', plannedSets: 3 });
  const h = [session('2026-10-01', sets([[0, 15], [0, 15], [0, 15]]), { entry: { weightMode: 'bodyweight', equipment: 'น้ำหนักตัว' } })];
  const t = P.suggestTarget(h, e, { repMin: 8, repMax: 15, step: 2.5 }, 'current');
  assert.strictEqual(t.kind, 'add_weight'); assert.strictEqual(t.weight, 2.5);
});

test('คำแนะนำเป็นแค่ค่าที่เสนอ: ฟังก์ชันไม่แก้ข้อมูลประวัติ', () => {
  const hist = [session('2026-10-01', sets([[40, 12], [40, 12], [40, 12]]))];
  const before = JSON.stringify(hist);
  suggest(hist);
  assert.strictEqual(JSON.stringify(hist), before);
});

test('findPrevious: ตรงกัน/ต่างอุปกรณ์/ไม่เคยเล่น', () => {
  const a = session('2026-10-01', sets([[40, 10]]));
  assert.strictEqual(P.findPrevious([a], todayEntry, 'x').comparable, true);
  const b = session('2026-10-01', sets([[40, 10]]), { entry: { equipment: 'อื่น' } });
  assert.strictEqual(P.findPrevious([b], todayEntry, 'x').comparable, false);
  assert.strictEqual(P.findPrevious([], todayEntry, 'x'), null);
});

/* ================= summary ================= */

function sw(date, setList, over) { return session(date, setList, over); }

test('weekStart: สัปดาห์เริ่มวันจันทร์ (อาทิตย์ยังอยู่สัปดาห์เดิม)', () => {
  assert.strictEqual(SM.weekStart('2026-10-12'), '2026-10-12');   // จันทร์
  assert.strictEqual(SM.weekStart('2026-10-18'), '2026-10-12');   // อาทิตย์
  assert.strictEqual(SM.weekStart('2026-10-19'), '2026-10-19');   // จันทร์ถัดไป
  assert.strictEqual(SM.weekStart('2026-10-01'), '2026-09-28');   // ข้ามเดือน
  assert.strictEqual(SM.weekStart('2026-01-01'), '2025-12-29');   // ข้ามปี
  assert.strictEqual(SM.weekEnd('2026-10-12'), '2026-10-18');
});

test('ประวัติรายท่า: นับเฉพาะ working sets ที่ทำเสร็จจริง และ volume = Σ น้ำหนัก×reps', () => {
  const s = sets([[20, 15]], 'warmup').concat(sets([[40, 10], [40, 9], 'skip']));
  const h = SM.exerciseHistory([sw('2026-10-01', s)], 'ex-bench');
  assert.strictEqual(h.length, 1);
  const r = h[0].sessions[0];
  assert.strictEqual(r.workingSets, 2); assert.strictEqual(r.volume, 40 * 10 + 40 * 9);
  assert.deepStrictEqual(r.top, { weight: 40, reps: 10 });
});

test('ไม่รวม workout ที่ยังไม่จบ', () => {
  const h = SM.exerciseHistory([sw('2026-10-01', sets([[40, 10]]), { status: 'active' })], 'ex-bench');
  assert.strictEqual(h.length, 0);
  assert.strictEqual(SM.weeklyOverview([sw('2026-10-01', sets([[40, 10]]), { status: 'active' })]).length, 0);
});

test('รายสัปดาห์ต่อท่า: รวมในสัปดาห์เดียวกัน แยกข้ามสัปดาห์ เรียงใหม่→เก่า', () => {
  const hist = [
    sw('2026-10-12', sets([[40, 10], [40, 10]])),   // จันทร์
    sw('2026-10-18', sets([[42.5, 8]])),            // อาทิตย์ (สัปดาห์เดียวกัน)
    sw('2026-10-19', sets([[45, 6]]))               // จันทร์ถัดไป
  ];
  const w = SM.exerciseHistory(hist, 'ex-bench')[0].weeks;
  assert.strictEqual(w.length, 2);
  assert.strictEqual(w[0].weekStart, '2026-10-19'); assert.strictEqual(w[0].workingSets, 1); assert.strictEqual(w[0].volume, 270);
  assert.strictEqual(w[1].weekStart, '2026-10-12'); assert.strictEqual(w[1].sessions, 2);
  assert.strictEqual(w[1].workingSets, 3); assert.strictEqual(w[1].volume, 40 * 10 * 2 + 42.5 * 8);
  assert.deepStrictEqual(w[1].top, { weight: 42.5, reps: 8 });
});

test('ท่าเดียวกันแต่อุปกรณ์ต่างกัน แยกกลุ่ม ไม่รวม volume', () => {
  const hist = [
    sw('2026-10-01', sets([[40, 10]])),
    sw('2026-10-02', sets([[100, 10]]), { entry: { equipment: 'Smith machine' } })
  ];
  const h = SM.exerciseHistory(hist, 'ex-bench');
  assert.strictEqual(h.length, 2);
  assert.deepStrictEqual(h.map(function (g) { return g.sessions[0].volume; }).sort(function (a, b) { return a - b; }), [400, 1000]);
  const wk = SM.weeklyOverview(hist)[0];
  assert.strictEqual(wk.exercises.length, 2, 'สัปดาห์เดียวกันแต่แยกเป็น 2 แถว');
});

test('สรุปรายสัปดาห์ไม่มีผลรวมข้ามท่า', () => {
  const w = sw('2026-10-12', sets([[40, 10]]));
  w.entries.push(Object.assign({}, BENCH, { id: 'e-x', exerciseId: 'ex-row', exerciseName: 'Row', plannedSets: 3, sets: sets([[50, 10]]) }));
  const wk = SM.weeklyOverview([w])[0];
  assert.strictEqual(wk.exercises.length, 2);
  assert.strictEqual(wk.workouts, 1);
  assert.ok(!('volume' in wk) && !('totalVolume' in wk) && !('workingSets' in wk), 'สัปดาห์ต้องไม่มีผลรวมข้ามท่า');
});

test('เซตที่ข้ามทั้งท่า → ท่านั้นไม่โผล่ในสรุป', () => {
  const hist = [sw('2026-10-01', sets(['skip', 'skip']))];
  assert.strictEqual(SM.exerciseIndex(hist).length, 0);
});

test('exerciseIndex: ใช้ชื่อล่าสุดที่เคยจด และนับจำนวนครั้ง', () => {
  const hist = [
    sw('2026-10-01', sets([[40, 10]]), { entry: { exerciseName: 'Bench Old' } }),
    sw('2026-10-08', sets([[40, 10]]), { entry: { exerciseName: 'Bench New' } })
  ];
  const idx = SM.exerciseIndex(hist);
  assert.strictEqual(idx.length, 1); assert.strictEqual(idx[0].name, 'Bench New'); assert.strictEqual(idx[0].sessions, 2);
});


/* ---------- โปรแกรม PPL และการติดตั้งแบบไม่ทำลายข้อมูล ---------- */
const PG = require('../program.js');
const ICONS = require('../icons.js');

test('โปรแกรม PPL: 34 ท่า, 4 แผน, จำนวนท่า/เซตตรงตามตารางที่ผู้ใช้ให้มา', () => {
  const ex = PG.exercises('2026-10-18T00:00:00Z'), pl = PG.plans(0);
  assert.strictEqual(ex.length, 34);
  const sum = function (p) { return p.items.reduce(function (a, i) { return a + i.sets; }, 0); };
  const by = {}; pl.forEach(function (p) { by[p.id] = p; });
  assert.deepStrictEqual([by['ppl-plan-push'].items.length, sum(by['ppl-plan-push'])], [6, 17]);
  assert.deepStrictEqual([by['ppl-plan-pull'].items.length, sum(by['ppl-plan-pull'])], [5, 16]);
  assert.deepStrictEqual([by['ppl-plan-legs'].items.length, sum(by['ppl-plan-legs'])], [7, 21]);
  assert.deepStrictEqual([by['ppl-plan-extra'].items.length, sum(by['ppl-plan-extra'])], [4, 8]);
  assert.deepStrictEqual(by['ppl-plan-push'].items.map(function (i) { return i.sets; }), [3, 3, 2, 3, 4, 2]);
  assert.deepStrictEqual(by['ppl-plan-pull'].items.map(function (i) { return i.sets; }), [3, 3, 3, 3, 4]);
  assert.deepStrictEqual(by['ppl-plan-legs'].items.map(function (i) { return i.sets; }), [3, 3, 3, 3, 4, 3, 2]);
});
test('โปรแกรม PPL: ทุกท่าทางเลือกและทุกท่าในแผนมีอยู่จริง, ชื่อไม่ซ้ำ, ไอคอนมีจริง, ช่วง reps ถูกต้อง', () => {
  const ex = PG.exercises('x'), ids = {}, names = {};
  ex.forEach(function (e) { ids[e.id] = e; assert.ok(!names[e.name.toLowerCase()], 'ชื่อซ้ำ ' + e.name); names[e.name.toLowerCase()] = 1; });
  ex.forEach(function (e) {
    e.subs.forEach(function (s) { assert.ok(ids[s], 'ไม่พบท่าทางเลือก ' + s); assert.notStrictEqual(s, e.id); });
    assert.ok(ICONS.EX_KEYS.indexOf(e.icon) >= 0, 'ไอคอนไม่มี ' + e.icon);
    assert.ok(e.repMin >= 1 && e.repMin <= e.repMax && e.step > 0);
  });
  PG.plans(0).forEach(function (p) { p.items.forEach(function (i) { assert.ok(ids[i.exerciseId]); }); });
  // ท่าทางเลือกตามตาราง
  assert.deepStrictEqual(ids['ppl-incline-chest-press'].subs, ['ppl-smith-incline-press']);
  assert.deepStrictEqual(ids['ppl-single-arm-row'].subs, ['ppl-seated-cable-row-close', 'ppl-tbar-row-close']);
  assert.deepStrictEqual(ids['ppl-cable-curl'].subs, ['ppl-ez-bar-curl', 'ppl-preacher-curl-machine']);
  assert.deepStrictEqual([ids['ppl-lateral-raise-machine'].repMin, ids['ppl-lateral-raise-machine'].repMax], [12, 20]);
  assert.deepStrictEqual([ids['ppl-calf-raise-machine'].repMin, ids['ppl-calf-raise-machine'].repMax], [10, 20]);
});
test('ติดตั้งโปรแกรม: เครื่องใหม่ได้ครบและตั้งธง, ติดตั้งซ้ำไม่ทำอะไร', () => {
  const r = PG.buildInstall({ exercises: [], plans: [], workouts: [], settings: {} }, 1000);
  assert.strictEqual(r.report.addedExercises, 34); assert.strictEqual(r.report.addedPlans, 4);
  assert.ok(r.ops.some(function (o) { return o.store === 'settings' && o.put.key === 'program'; }));
  assert.ok(!r.ops.some(function (o) { return o.put && o.put.key === 'programNotice'; }), 'เครื่องใหม่ไม่ต้องมีประกาศ');
  assert.strictEqual(PG.buildInstall({ exercises: [], plans: [], workouts: [], settings: { program: 'ppl-1' } }, 1), null);
});
test('ติดตั้งโปรแกรมบนข้อมูลเดิม: ตัวอย่างไม่มีประวัติถูกลบ, มีประวัติถูกเก็บเข้าคลัง, ของผู้ใช้ไม่ถูกแตะ', () => {
  const mk = function (id, sample) { return { id: id, name: id, muscle: 'อก', equipment: 'x', repMin: 8, repMax: 12, step: 2.5, weightMode: 'machine', subs: [], archived: false, isSample: sample }; };
  const db = {
    exercises: [mk('seed-a', true), mk('seed-b', true), mk('seed-c', true), mk('mine', false)],
    plans: [{ id: 'seed-plan', name: 'ตัวอย่าง', items: [{ exerciseId: 'seed-a', sets: 3 }], isSample: true },
            { id: 'my-plan', name: 'ของฉัน', items: [{ exerciseId: 'seed-c', sets: 3 }, { exerciseId: 'mine', sets: 3 }], isSample: false }],
    workouts: [{ id: 'w1', status: 'finished', date: '2026-10-01', entries: [{ id: 'e', exerciseId: 'seed-b', plannedExerciseId: 'seed-b', sets: [] }] }],
    settings: { seeded: true, unit: 'kg' }
  };
  const r = PG.buildInstall(db, 5000);
  const del = r.ops.filter(function (o) { return 'del' in o; }).map(function (o) { return o.store + ':' + o.del; }).sort();
  assert.deepStrictEqual(del, ['exercises:seed-a', 'plans:seed-plan']);          // a ไม่มีประวัติ ลบ; แผนตัวอย่างลบ
  const arch = r.ops.filter(function (o) { return o.put && o.put.id === 'seed-b'; });
  assert.strictEqual(arch.length, 1); assert.strictEqual(arch[0].put.archived, true);   // b มีประวัติ เก็บเข้าคลัง
  assert.ok(!r.ops.some(function (o) { return (o.put && (o.put.id === 'seed-c' || o.put.id === 'mine' || o.put.id === 'my-plan')) || o.del === 'seed-c' || o.del === 'mine' || o.del === 'my-plan'; }), 'ของที่ผู้ใช้ใช้อยู่ต้องไม่ถูกแตะ');
  assert.ok(!r.ops.some(function (o) { return o.store === 'workouts'; }), 'ต้องไม่แตะ workout');
  assert.strictEqual(r.report.keptSamples, 1);
  assert.ok(r.ops.some(function (o) { return o.put && o.put.key === 'programNotice'; }));
});
test('ติดตั้งโปรแกรม: ถ้า id ของโปรแกรมมีอยู่แล้ว (ผู้ใช้แก้ไว้) ไม่ทับ', () => {
  const mine = { id: 'ppl-cable-curl', name: 'Cable Curl ของฉัน', repMin: 5, repMax: 8, step: 1, weightMode: 'cable', subs: [], isSample: false };
  const r = PG.buildInstall({ exercises: [mine], plans: [], workouts: [], settings: {} }, 1);
  assert.strictEqual(r.report.addedExercises, 33);
  assert.ok(!r.ops.some(function (o) { return o.put && o.put.id === 'ppl-cable-curl'; }));
});
test('ไอคอน: ทุกแบบวาดได้ (SVG ไม่ว่าง) และมีชื่อกำกับ', () => {
  ICONS.EX_KEYS.forEach(function (k) {
    const svg = ICONS.ex(k, 40);
    assert.ok(svg.indexOf('<path') > 0 || svg.indexOf('<circle') > 0, k);
    assert.ok(ICONS.EX_LABEL[k], 'ไม่มีชื่อ ' + k);
  });
});

/* ================= storage: ฟิลด์ใหม่ของ 1.4 (additive) ================= */
const ST = require('../storage.js');
function backupOf(extra) {
  const data = Object.assign({
    settings: { unit: 'kg' },
    exercises: [{ id: 'ex1', name: 'Test', muscle: 'อก', equipment: 'เครื่อง', repMin: 8, repMax: 12, step: 5, weightMode: 'machine', subs: [], archived: false }],
    plans: [], workouts: []
  }, extra || {});
  return { format: ST.BACKUP_FORMAT, schemaVersion: ST.SCHEMA_VERSION, exportedAt: '2026-01-01T00:00:00Z', appVersion: 'x', data: data };
}
test('ไฟล์สำรองเก่า (ไม่มี restSec / ตั้งค่าใหม่) ยัง validate ผ่านและไม่เติมฟิลด์ใหม่เอง', () => {
  const r = ST.validateBackup(backupOf());
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.strictEqual(r.clean.exercises[0].restSec, undefined);
  assert.deepStrictEqual(Object.keys(r.clean.settings), ['unit']);
});
test('restSec ที่ถูกต้อง (10–900) ถูกเก็บ, ค่านอกช่วง/ไม่ใช่จำนวนเต็มถูกทิ้ง', () => {
  function rs(v) {
    const b = backupOf(); b.data.exercises[0].restSec = v;
    return ST.validateBackup(b).clean.exercises[0].restSec;
  }
  assert.strictEqual(rs(45), 45);
  assert.strictEqual(rs(10), 10);
  assert.strictEqual(rs(900), 900);
  assert.strictEqual(rs(9), undefined);
  assert.strictEqual(rs(901), undefined);
  assert.strictEqual(rs(60.5), undefined);
  assert.strictEqual(rs('60'), undefined);
});
test('ตั้งค่า restSeconds/restAuto/restSound/keepAwake: เก็บเมื่อชนิดถูกต้องเท่านั้น', () => {
  const ok = ST.validateBackup(backupOf({ settings: { unit: 'kg', restSeconds: 120, restAuto: false, restSound: true, keepAwake: false } }));
  assert.deepStrictEqual(ok.clean.settings, { unit: 'kg', restSeconds: 120, restAuto: false, restSound: true, keepAwake: false });
  const bad = ST.validateBackup(backupOf({ settings: { unit: 'kg', restSeconds: 3, restAuto: 'yes', keepAwake: 1 } }));
  assert.deepStrictEqual(bad.clean.settings, { unit: 'kg' });
});

console.log('\n' + passed + '/' + (passed + failed) + ' ผ่าน');
process.exit(failed ? 1 : 0);
