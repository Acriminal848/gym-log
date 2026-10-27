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

/* ================= summary: หน้าแรก (1.5) ================= */
const PLANS = [{ id: 'p-push', items: [{ exerciseId: 'a' }, { exerciseId: 'b' }] }, { id: 'p-pull', items: [{ exerciseId: 'c' }] },
  { id: 'p-legs', items: [{ exerciseId: 'd' }, { exerciseId: 'a' }] }, { id: 'ppl-plan-extra', items: [{ exerciseId: 'e' }] }, { id: 'p-old', archived: true, items: [] }];
const EXMAP = { a: { id: 'a', muscle: 'อก' }, b: { id: 'b', muscle: 'ไตรเซ็ป' }, c: { id: 'c', muscle: 'หลัง' }, d: { id: 'd', muscle: 'ต้นขาหน้า' }, e: { id: 'e', muscle: 'ไหล่หลัง' } };
const exById = function (id) { return EXMAP[id] || null; };
function wk(date, planId, exIds, sets) {
  n++;
  return { id: 'w' + n, date: date, status: 'finished', planId: planId, planName: planId, entries: exIds.map(function (id) { n++; return { id: 'e' + n, exerciseId: id, sets: sets || sets === 0 ? sets : [] }; }) };
}
function ws(k) { return [].concat.apply([], new Array(k).fill(0).map(function () { return [{ kind: 'working', status: 'completed', weight: 50, reps: 10 }]; })); }
test('วงจร: ไม่รวมวันเสริมและแผนที่เก็บ, ตัวถัดไปต่อจากครั้งล่าสุดและวนกลับ', () => {
  const rot = SM.rotationPlans(PLANS);
  assert.deepStrictEqual(rot.map(function (p) { return p.id; }), ['p-push', 'p-pull', 'p-legs']);
  assert.strictEqual(SM.nextInRotation(rot, []).plan.id, 'p-push');
  assert.strictEqual(SM.nextInRotation(rot, [{ planId: 'p-push' }]).plan.id, 'p-pull');
  assert.strictEqual(SM.nextInRotation(rot, [{ planId: 'p-legs' }, { planId: 'p-pull' }]).plan.id, 'p-push');
  assert.strictEqual(SM.nextInRotation(rot, [{ planId: 'ppl-plan-extra' }, { planId: 'p-pull' }]).plan.id, 'p-legs', 'วันเสริมไม่ขยับวงจร');
  assert.strictEqual(SM.nextInRotation(rot, [{ planId: 'deleted' }]).plan.id, 'p-push');
  assert.strictEqual(SM.nextInRotation([], []), null);
});
test('แถบสัปดาห์: จันทร์–อาทิตย์, นับเฉพาะ session ที่จบและมีเซตจริง', () => {
  // 2026-10-28 เป็นวันพุธ → สัปดาห์ 26 ต.ค. – 1 พ.ย.
  const list = [wk('2026-10-26', 'p-push', ['a'], ws(3)), wk('2026-10-27', 'p-pull', ['c'], ws(0)), wk('2026-10-25', 'p-legs', ['d'], ws(3)),
    Object.assign(wk('2026-10-28', 'p-legs', ['d'], ws(2)), { status: 'active' })];
  const r = SM.weekStrip(list, '2026-10-28');
  assert.strictEqual(r.weekStart, '2026-10-26');
  assert.strictEqual(r.days.length, 7);
  assert.strictEqual(r.days[0].key, '2026-10-26');
  assert.strictEqual(r.days[6].key, '2026-11-01');
  assert.strictEqual(r.sessions, 1, 'ว่างเปล่า/ค้างอยู่/สัปดาห์ก่อน ไม่นับ');
  assert.strictEqual(r.days[0].sessions.length, 1);
  assert.ok(r.days[2].isToday && !r.days[2].isFuture && r.days[3].isFuture);
});
test('เซตต่อกล้ามเนื้อในสัปดาห์: นับเซตตรงตามกล้ามเนื้อหลักของท่า, ท่าที่ถูกลบข้าม', () => {
  const list = [wk('2026-10-26', 'p-push', ['a', 'b'], ws(3)), wk('2026-10-27', 'p-legs', ['d', 'a', 'zzz'], ws(2)), wk('2026-10-20', 'p-pull', ['c'], ws(5))];
  const m = SM.muscleSets(list, exById, '2026-10-26');
  assert.deepStrictEqual(m, { 'อก': 5, 'ไตรเซ็ป': 3, 'ต้นขาหน้า': 2 });
});
test('กล้ามเนื้อที่ยังไม่ได้เล่นสัปดาห์นี้: เฉพาะที่วงจรครอบคลุม (ไม่รวมวันเสริม) และเรียงตามแผน', () => {
  const rot = SM.rotationPlans(PLANS);
  assert.deepStrictEqual(SM.untrainedMuscles(rot, exById, { 'อก': 5 }), ['ไตรเซ็ป', 'หลัง', 'ต้นขาหน้า']);
  assert.deepStrictEqual(SM.untrainedMuscles(rot, exById, { 'อก': 1, 'ไตรเซ็ป': 1, 'หลัง': 1, 'ต้นขาหน้า': 1 }), []);
});

/* ================= summary: ประวัติแบบภาพรวม (1.6) ================= */
function sess(date, planId, entries, over) {
  n++;
  return Object.assign({ id: 'w' + n, date: date, status: 'finished', planId: planId, planName: planId, startedAt: date + 'T08:00:00Z', finishedAt: date + 'T08:50:00Z',
    entries: entries.map(function (x) { n++; return { id: 'e' + n, exerciseId: x[0], exerciseName: x[0], equipment: 'เครื่อง', weightMode: 'machine', sets: x[1].map(function (p) { n++; return { id: 's' + n, kind: 'working', status: 'completed', weight: p[0], reps: p[1] }; }) }; }) }, over || {});
}
test('1RM โดยประมาณ (Epley) ปัดทศนิยม 2 ตำแหน่ง', () => {
  assert.strictEqual(SM.e1rm(100, 10), 133.33);
  assert.strictEqual(SM.e1rm(60, 1), 62);
});
test('muscleWeek: เซตและจำนวนครั้งที่ฝึกต่อกล้ามเนื้อ (นับ session ละ 1 ต่อกล้ามเนื้อ)', () => {
  const list = [sess('2026-10-26', 'x', [['a', [[50, 10], [50, 9]]], ['b', [[20, 12]]], ['a', [[40, 10]]]]), sess('2026-10-28', 'y', [['a', [[50, 10]]]]), sess('2026-10-20', 'z', [['a', [[50, 10]]]])];
  const m = SM.muscleWeek(list, exById, '2026-10-26');
  assert.deepStrictEqual(m['อก'], { sets: 4, sessions: 2 });
  assert.deepStrictEqual(m['ไตรเซ็ป'], { sets: 1, sessions: 1 });
  assert.strictEqual(m['หลัง'], undefined);
});
test('แนวโน้มรายท่า: เก่า→ใหม่, PR เมื่อทำลายสถิติเดิมเท่านั้น (ครั้งแรกไม่ใช่ PR, เท่าเดิมไม่ใช่ PR)', () => {
  const rows = [['2026-03-01', [[50, 10]]], ['2026-03-08', [[55, 8]]], ['2026-03-15', [[55, 9]]], ['2026-03-22', [[52.5, 12]]], ['2026-03-29', [[60, 6]]]].map(function (x) {
    return { workoutId: 'w' + x[0], date: x[0], sets: x[1].map(function (p) { return { weight: p[0], reps: p[1] }; }), top: { weight: x[1][0][0], reps: x[1][0][1] } };
  });
  const top = SM.exerciseTrend(rows.slice().reverse(), 'top');
  assert.deepStrictEqual(top.map(function (p) { return p.value; }), [50, 55, 55, 52.5, 60]);
  assert.deepStrictEqual(top.map(function (p) { return p.pr; }), [false, true, false, false, true]);
  const e = SM.exerciseTrend(rows.slice().reverse(), 'e1rm');
  assert.deepStrictEqual(e.map(function (p) { return p.value; }), [66.67, 69.67, 71.5, 73.5, 72]);
  assert.deepStrictEqual(e.map(function (p) { return p.pr; }), [false, true, true, true, false], '52.5×12 ให้ 1RM สูงกว่า 60×6 จึงเป็น PR ของ 1RM ทั้งที่น้ำหนักลดลง');
});
test('ตารางความสม่ำเสมอ 12 สัปดาห์: เก่า→ใหม่ จันทร์–อาทิตย์ นับเฉพาะ session ที่มีเซตจริง', () => {
  const list = [sess('2026-10-26', 'x', [['a', [[50, 10]]]]), sess('2026-10-26', 'y', [['b', [[20, 12]]]]), sess('2026-10-27', 'z', [['a', []]]),
    sess('2026-08-10', 'x', [['a', [[50, 10]]]]), sess('2026-01-01', 'x', [['a', [[50, 10]]]])];
  const g = SM.consistencyGrid(list, '2026-10-28', 12);
  assert.strictEqual(g.weeks.length, 12);
  assert.strictEqual(g.weeks[11].weekStart, '2026-10-26');
  assert.strictEqual(g.weeks[0].weekStart, '2026-08-10');
  assert.strictEqual(g.weeks[11].days[0].count, 2);
  assert.strictEqual(g.weeks[11].days[1].count, 0, 'session ไม่มีเซตไม่นับ');
  assert.strictEqual(g.weeks[0].days[0].count, 1, 'สัปดาห์แรกของหน้าต่างนับ');
  assert.strictEqual(g.total, 3, 'ก่อนหน้าต่าง 12 สัปดาห์ไม่นับ');
  assert.strictEqual(g.activeWeeks, 2);
  assert.ok(g.weeks[11].days[2].isToday && g.weeks[11].days[3].isFuture);
});
test('PR ของ session: เทียบเฉพาะท่า+อุปกรณ์เดียวกันที่จบก่อนหน้า, ครั้งแรกไม่ใช่ PR, น้ำหนักเท่าเดิมแต่ reps มากขึ้นนับเป็น 1RM PR', () => {
  const a = sess('2026-10-01', 'x', [['a', [[50, 10], [50, 8]]]]);
  const b = sess('2026-10-08', 'x', [['a', [[50, 12]]]]);
  const c = sess('2026-10-15', 'x', [['a', [[55, 6]]]]);
  const d = sess('2026-10-22', 'x', [['a', [[45, 10]]], ['b', [[20, 10]]]]);
  const all = [a, b, c, d];
  assert.deepStrictEqual(SM.sessionPRs(all, a.id), [], 'ครั้งแรกไม่ใช่ PR');
  const rb = SM.sessionPRs(all, b.id);
  assert.strictEqual(rb.length, 1); assert.strictEqual(rb[0].kind, 'e1rm');
  const rc = SM.sessionPRs(all, c.id);
  assert.strictEqual(rc[0].kind, 'weight'); assert.strictEqual(rc[0].value, 55); assert.strictEqual(rc[0].prev, 50);
  assert.deepStrictEqual(SM.sessionPRs(all, d.id), []);
  const other = Object.assign({}, c, { entries: c.entries.map(function (e) { return Object.assign({}, e, { weightMode: 'cable' }); }) });
  assert.deepStrictEqual(SM.sessionPRs([a, b, other], other.id), [], 'อุปกรณ์/วิธีนับต่างกันไม่เทียบกัน');
});
test('ระยะเวลา session และกล้ามเนื้อที่ได้เซตใน session', () => {
  assert.strictEqual(SM.durationMin({ startedAt: '2026-10-01T08:00:00Z', finishedAt: '2026-10-01T08:52:30Z' }), 53);
  assert.strictEqual(SM.durationMin({ startedAt: '2026-10-01T08:00:00Z', finishedAt: '2026-10-02T08:00:00Z' }), null, 'ข้ามวันถือว่าไม่น่าเชื่อถือ');
  assert.strictEqual(SM.durationMin({ startedAt: '2026-10-01T08:00:00Z' }), null);
  const w = sess('2026-10-01', 'x', [['a', [[50, 10], [50, 9]]], ['b', [[20, 12]]], ['c', []]]);
  assert.deepStrictEqual(SM.sessionMuscles(w, exById), [{ muscle: 'อก', sets: 2 }, { muscle: 'ไตรเซ็ป', sets: 1 }]);
});

/* ================= 1.6: ย้ายข้อมูลชื่อกล้ามเนื้อ + กราฟ ================= */
const CH = require('../charts.js');
function oldEx(id, muscle) { return { id: id, name: id, muscle: muscle, equipment: 'เครื่อง', repMin: 8, repMax: 12, step: 5, weightMode: 'machine', subs: [], archived: false }; }
test('ย้ายชื่อกล้ามเนื้อ: แตะเฉพาะท่า PPL ที่ยังเป็นค่าเดิม, เก็บค่าเดิมไว้ก่อน, ไม่แตะท่าผู้ใช้/ที่ผู้ใช้แก้เอง', () => {
  const exs = [oldEx('ppl-cable-lateral-raise', 'ไหล่'), oldEx('ppl-reverse-pec-deck', 'ไหล่'), oldEx('ppl-hack-squat', 'ขา'), oldEx('ppl-seated-leg-curl', 'ขา'),
    oldEx('ppl-leg-press', 'ขาของฉัน'), oldEx('user-1', 'ขา'), oldEx('ppl-cable-curl', 'ไบเซ็ป')];
  const r = PG.buildMuscleSplit({ exercises: exs, settings: {} });
  assert.strictEqual(r.changed, 4);
  const put = {}; r.ops.filter(function (o) { return o.store === 'exercises'; }).forEach(function (o) { put[o.put.id] = o.put; });
  assert.deepStrictEqual(Object.keys(put).sort(), ['ppl-cable-lateral-raise', 'ppl-hack-squat', 'ppl-reverse-pec-deck', 'ppl-seated-leg-curl']);
  assert.strictEqual(put['ppl-cable-lateral-raise'].muscle, 'ไหล่ข้าง');
  assert.strictEqual(put['ppl-reverse-pec-deck'].muscle, 'ไหล่หลัง');
  assert.strictEqual(put['ppl-hack-squat'].muscle, 'ต้นขาหน้า');
  assert.strictEqual(put['ppl-seated-leg-curl'].muscle, 'ต้นขาหลัง');
  assert.strictEqual(exs[0].muscle, 'ไหล่', 'ไม่แก้ object เดิมในหน่วยความจำ');
  const bk = r.ops.find(function (o) { return o.store === 'settings' && o.put.key === 'muscleSplitBackup'; }).put.value;
  assert.strictEqual(bk.length, 4);
  assert.ok(bk.some(function (b) { return b.id === 'ppl-hack-squat' && b.muscle === 'ขา'; }));
  assert.ok(r.ops.some(function (o) { return o.store === 'settings' && o.put.key === 'muscleSplit'; }));
  assert.ok(!r.ops.some(function (o) { return o.store === 'workouts'; }), 'ไม่แตะประวัติ');
  Object.keys(put).forEach(function (id) { const o = exs.find(function (e) { return e.id === id; }); const c = Object.assign({}, put[id], { muscle: o.muscle }); assert.deepStrictEqual(c, o, 'ฟิลด์อื่นเหมือนเดิม ' + id); });
});
test('ย้ายชื่อกล้ามเนื้อ: ทำซ้ำได้ปลอดภัย (มีธงแล้วไม่ทำ, force แล้วไม่มีอะไรให้แก้ก็ไม่เขียนท่า)', () => {
  assert.strictEqual(PG.buildMuscleSplit({ exercises: [oldEx('ppl-hack-squat', 'ขา')], settings: { muscleSplit: 'v1' } }), null);
  const r = PG.buildMuscleSplit({ exercises: [oldEx('ppl-hack-squat', 'ต้นขาหน้า')], settings: { muscleSplit: 'v1' } }, true);
  assert.strictEqual(r.changed, 0);
  assert.ok(!r.ops.some(function (o) { return o.store === 'exercises'; }));
  assert.ok(!r.ops.some(function (o) { return o.put && o.put.key === 'muscleSplitBackup'; }), 'ไม่เขียนทับสำรองเดิมด้วยค่าว่าง');
});
test('ติดตั้งเครื่องใหม่: ท่า PPL ใช้ชื่อกล้ามเนื้อแบบแยกแล้ว และไม่มีท่าไหนเหลือ “ไหล่”/“ขา” เดี่ยว ๆ', () => {
  const ms = PG.exercises(new Date().toISOString()).map(function (e) { return e.muscle; });
  assert.ok(ms.indexOf('ไหล่') < 0 && ms.indexOf('ขา') < 0);
  ['ไหล่ข้าง', 'ไหล่หลัง', 'ต้นขาหน้า', 'ต้นขาหลัง'].forEach(function (m) { assert.ok(ms.indexOf(m) >= 0, m); });
});
test('กราฟเส้น: ต้องมี ≥2 จุด, PR เป็นรูปเพชรมีตัวอักษร PR, มี aria-label สรุป, ค่าเท่ากันหมดก็วาดได้', () => {
  assert.strictEqual(CH.line([{ date: '2026-03-01', value: 50 }]), '');
  const svg = CH.line([{ date: '2026-03-01', value: 50 }, { date: '2026-03-08', value: 55, pr: true }, { date: '2026-03-15', value: 55 }, { date: '2026-03-29', value: 60, pr: true }], { unit: 'kg', label: 'ทดสอบ', fmtDate: function (k) { return k.slice(5); } });
  assert.ok(/role="img"/.test(svg) && /aria-label="ทดสอบ: จาก 50 เป็น 60 kg ใน 4 ครั้ง · สถิติใหม่ 2 ครั้ง"/.test(svg), svg.slice(0, 300));
  assert.strictEqual((svg.match(/class="ch-pr"/g) || []).length, 2);
  assert.strictEqual((svg.match(/class="ch-dot"/g) || []).length, 2);
  assert.strictEqual((svg.match(/>PR</g) || []).length, 2);
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
  const flat = CH.line([{ date: '2026-03-01', value: 50 }, { date: '2026-03-08', value: 50 }]);
  assert.ok(flat && !/NaN/.test(flat));
  const same = CH.line([{ date: '2026-03-01', value: 50 }, { date: '2026-03-01', value: 52 }]);
  assert.ok(!/NaN/.test(same), 'วันที่ซ้ำกันไม่ทำให้ตำแหน่ง X เป็น NaN');
});

console.log('\n' + passed + '/' + (passed + failed) + ' ผ่าน');
process.exit(failed ? 1 : 0);
