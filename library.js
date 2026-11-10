/* library.js — คลังท่าสำเร็จรูป (เฉพาะ machine / Smith / cable และบาร์เบลที่ระดับ beginner · ยังไม่มีดัมเบล)
 *
 * ที่มา: free-exercise-db (https://github.com/yuhonas/free-exercise-db) ประกาศเป็น Unlicense (สาธารณสมบัติ)
 *   — ใช้รูปจากแหล่งเดียวนี้เท่านั้น ท่าที่ไม่มีรูปในคลังนี้จะไม่แสดงรูป (ไม่ไปหยิบรูปจากที่อื่นมาปน)
 *   — รูปย่อเป็น 360×240 JPEG อยู่ใน lib/<รหัส>/0.jpg และ 1.jpg (ท่าเริ่ม / ท่าสุดช่วง) ไม่ได้ใส่ใน cache ล่วงหน้า แต่เก็บเมื่อเปิดดูครั้งแรก
 *
 * ความปลอดภัยของท่าที่ผู้ใช้สร้างเอง:
 *   — ท่าจากคลังไม่อยู่ในฐานข้อมูลจนกว่าจะกด “เพิ่ม” แล้วจึงสร้างระเบียนใหม่ id = 'lib-<รหัส>' (ไม่ชนกับ id ของท่าผู้ใช้/ท่า PPL)
 *   — ไม่เคยเขียนทับ/แก้/ลบระเบียนที่มีอยู่ ถ้ามีท่าชื่อคล้ายกัน แอปแค่ถามว่าจะ “ใช้ท่าเดิมของคุณ” ไหม
 *   — รูปผูกกับ id (lib-… หรือ ppl-… ที่ระบุใน PPL_PHOTO) ไม่เก็บอะไรเพิ่มในข้อมูลท่า จึงไม่มีฟิลด์ใหม่ในฐานข้อมูล
 */
(function (global) {
  'use strict';
  // [รหัส, ชื่อ, กล้ามเนื้อ (หมวดย่อยหรือหมวดใหญ่), ชื่ออุปกรณ์, วิธีนับน้ำหนัก, repMin, repMax, ขั้นน้ำหนัก]
  const ROWS = [["Leverage_Chest_Press", "Chest Press (Plate-Loaded)", "อกกลาง", "เครื่อง", "machine", 8, 12, 5],
    ["Leverage_Incline_Chest_Press", "Incline Chest Press (Plate-Loaded)", "อกบน", "เครื่อง", "machine", 8, 12, 5],
    ["Leverage_Decline_Chest_Press", "Decline Chest Press (Machine)", "อกล่าง", "เครื่อง", "machine", 8, 12, 5],
    ["Machine_Bench_Press", "Machine Bench Press", "อกกลาง", "เครื่อง", "machine", 8, 12, 5],
    ["Cable_Crossover", "Cable Crossover", "อกกลาง", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Low_Cable_Crossover", "Low Cable Crossover", "อกบน", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Cable_Chest_Press", "Cable Chest Press", "อกกลาง", "สายเคเบิล", "cable", 8, 12, 2.5],
    ["Incline_Cable_Chest_Press", "Incline Cable Chest Press", "อกบน", "สายเคเบิล", "cable", 8, 12, 2.5],
    ["Smith_Machine_Bench_Press", "Smith Machine Bench Press", "อกกลาง", "Smith Machine", "machine", 8, 12, 5],
    ["Decline_Smith_Press", "Smith Machine Decline Press", "อกล่าง", "Smith Machine", "machine", 8, 12, 5],
    ["Barbell_Bench_Press_-_Medium_Grip", "Barbell Bench Press", "อกกลาง", "บาร์เบล", "barbell_total", 6, 10, 2.5],
    ["Barbell_Incline_Bench_Press_-_Medium_Grip", "Barbell Incline Bench Press", "อกบน", "บาร์เบล", "barbell_total", 6, 10, 2.5],
    ["Close-Grip_Front_Lat_Pulldown", "Close-Grip Lat Pulldown", "ปีกหลัง", "สายเคเบิล", "cable", 8, 12, 2.5],
    ["Underhand_Cable_Pulldowns", "Underhand Lat Pulldown", "ปีกหลัง", "สายเคเบิล", "cable", 8, 12, 2.5],
    ["V-Bar_Pulldown", "V-Bar Pulldown", "ปีกหลัง", "สายเคเบิล", "cable", 8, 12, 2.5],
    ["Straight-Arm_Pulldown", "Straight-Arm Pulldown", "ปีกหลัง", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["One_Arm_Lat_Pulldown", "One-Arm Lat Pulldown", "ปีกหลัง", "สายเคเบิล", "cable", 8, 12, 2.5],
    ["Leverage_High_Row", "High Row (Plate-Loaded)", "กลางหลัง", "เครื่อง", "machine", 8, 12, 5],
    ["Leverage_Iso_Row", "Iso Row (Plate-Loaded)", "กลางหลัง", "เครื่อง", "machine", 8, 12, 5],
    ["Lying_T-Bar_Row", "Chest-Supported T-Bar Row (Machine)", "กลางหลัง", "เครื่อง", "machine", 8, 12, 5],
    ["Smith_Machine_Bent_Over_Row", "Smith Machine Bent-Over Row", "กลางหลัง", "Smith Machine", "machine", 8, 12, 5],
    ["T-Bar_Row_with_Handle", "T-Bar Row", "กลางหลัง", "บาร์เบล", "barbell_total", 8, 12, 2.5],
    ["Bent_Over_Barbell_Row", "Bent-Over Barbell Row", "กลางหลัง", "บาร์เบล", "barbell_total", 6, 10, 2.5],
    ["Leverage_Shrug", "Shrug (Machine)", "บ่า", "เครื่อง", "machine", 10, 15, 5],
    ["Cable_Shrugs", "Cable Shrug", "บ่า", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Barbell_Shrug", "Barbell Shrug", "บ่า", "บาร์เบล", "barbell_total", 8, 12, 2.5],
    ["Machine_Shoulder_Military_Press", "Shoulder Press (Machine)", "ไหล่หน้า", "เครื่อง", "machine", 8, 12, 5],
    ["Leverage_Shoulder_Press", "Shoulder Press (Plate-Loaded)", "ไหล่หน้า", "เครื่อง", "machine", 8, 12, 5],
    ["Smith_Machine_Overhead_Shoulder_Press", "Smith Machine Shoulder Press", "ไหล่หน้า", "Smith Machine", "machine", 8, 12, 5],
    ["Seated_Cable_Shoulder_Press", "Seated Cable Shoulder Press", "ไหล่หน้า", "สายเคเบิล", "cable", 8, 12, 2.5],
    ["Standing_Military_Press", "Barbell Overhead Press", "ไหล่หน้า", "บาร์เบล", "barbell_total", 6, 10, 2.5],
    ["Cable_Seated_Lateral_Raise", "Seated Cable Lateral Raise", "ไหล่ข้าง", "สายเคเบิล", "cable", 12, 20, 2.5],
    ["Standing_Low-Pulley_Deltoid_Raise", "Low-Pulley Lateral Raise", "ไหล่ข้าง", "สายเคเบิล", "cable", 12, 20, 2.5],
    ["Front_Cable_Raise", "Cable Front Raise", "ไหล่หน้า", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Cable_Rope_Rear-Delt_Rows", "Cable Rope Rear-Delt Row", "ไหล่หลัง", "สายเคเบิล", "cable", 12, 20, 2.5],
    ["Face_Pull", "Face Pull", "ไหล่หลัง", "สายเคเบิล", "cable", 12, 20, 2.5],
    ["Upright_Barbell_Row", "Upright Barbell Row", "ไหล่ข้าง", "บาร์เบล", "barbell_total", 8, 12, 2.5],
    ["Machine_Bicep_Curl", "Biceps Curl (Machine)", "ไบเซ็ป", "เครื่อง", "machine", 8, 15, 5],
    ["Cable_Hammer_Curls_-_Rope_Attachment", "Cable Hammer Curl (Rope)", "ไบเซ็ป", "สายเคเบิล", "cable", 8, 15, 2.5],
    ["Cable_Preacher_Curl", "Cable Preacher Curl", "ไบเซ็ป", "สายเคเบิล", "cable", 8, 15, 2.5],
    ["High_Cable_Curls", "High Cable Curl", "ไบเซ็ป", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Reverse_Cable_Curl", "Reverse Cable Curl", "ปลายแขน", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Barbell_Curl", "Barbell Curl", "ไบเซ็ป", "บาร์เบล", "barbell_total", 8, 12, 2.5],
    ["Preacher_Curl", "Barbell Preacher Curl", "ไบเซ็ป", "บาร์เบล", "barbell_total", 8, 12, 2.5],
    ["Triceps_Pushdown_-_Rope_Attachment", "Triceps Pushdown (Rope)", "ไตรเซ็ป", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Triceps_Pushdown_-_V-Bar_Attachment", "Triceps Pushdown (V-Bar)", "ไตรเซ็ป", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Reverse_Grip_Triceps_Pushdown", "Reverse-Grip Triceps Pushdown", "ไตรเซ็ป", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Triceps_Overhead_Extension_with_Rope", "Overhead Triceps Extension (Rope)", "ไตรเซ็ป", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Cable_Lying_Triceps_Extension", "Cable Lying Triceps Extension", "ไตรเซ็ป", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Dip_Machine", "Dip (Machine)", "ไตรเซ็ป", "เครื่อง", "machine", 8, 12, 5],
    ["Smith_Machine_Close-Grip_Bench_Press", "Smith Machine Close-Grip Bench Press", "ไตรเซ็ป", "Smith Machine", "machine", 8, 12, 5],
    ["Close-Grip_Barbell_Bench_Press", "Close-Grip Barbell Bench Press", "ไตรเซ็ป", "บาร์เบล", "barbell_total", 6, 10, 2.5],
    ["Smith_Machine_Squat", "Smith Machine Squat", "ต้นขาหน้า", "Smith Machine", "machine", 8, 12, 5],
    ["Barbell_Squat", "Barbell Squat", "ต้นขาหน้า", "บาร์เบล", "barbell_total", 5, 10, 2.5],
    ["Standing_Leg_Curl", "Standing Leg Curl", "ต้นขาหลัง", "เครื่อง", "machine", 10, 15, 5],
    ["Smith_Machine_Stiff-Legged_Deadlift", "Smith Machine Romanian Deadlift", "ต้นขาหลัง", "Smith Machine", "machine", 8, 12, 5],
    ["Pull_Through", "Cable Pull-Through", "ก้น", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["One-Legged_Cable_Kickback", "Cable Glute Kickback", "ก้น", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Thigh_Abductor", "Hip Abduction (Machine)", "ต้นขาด้านนอก", "เครื่อง", "machine", 12, 20, 5],
    ["Thigh_Adductor", "Hip Adduction (Machine)", "ต้นขาด้านใน", "เครื่อง", "machine", 12, 20, 5],
    ["Seated_Calf_Raise", "Seated Calf Raise", "น่อง", "เครื่อง", "machine", 10, 20, 5],
    ["Calf_Press", "Calf Press (Machine)", "น่อง", "เครื่อง", "machine", 10, 20, 5],
    ["Smith_Machine_Calf_Raise", "Smith Machine Calf Raise", "น่อง", "Smith Machine", "machine", 10, 20, 5],
    ["Cable_Reverse_Crunch", "Cable Reverse Crunch", "หน้าท้อง", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Pallof_Press", "Pallof Press", "หน้าท้อง", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Standing_Cable_Wood_Chop", "Cable Wood Chop", "หน้าท้อง", "สายเคเบิล", "cable", 10, 15, 2.5],
    ["Cable_Wrist_Curl", "Cable Wrist Curl", "ปลายแขน", "สายเคเบิล", "cable", 12, 20, 2.5],
    ["Seated_Palm-Up_Barbell_Wrist_Curl", "Barbell Wrist Curl", "ปลายแขน", "บาร์เบล", "barbell_total", 12, 20, 2.5]];
  // ท่า PPL เดิมที่มีท่าเดียวกันในคลัง → ใช้รูปของคลังเป็นรูปประกอบ (ไม่เพิ่มเป็นท่าใหม่)
  const PPL_PHOTO = {
  "ppl-pec-deck": "Butterfly",
  "ppl-smith-incline-press": "Smith_Machine_Incline_Bench_Press",
  "ppl-lat-pulldown": "Wide-Grip_Lat_Pulldown",
  "ppl-seated-cable-row-close": "Seated_Cable_Rows",
  "ppl-reverse-pec-deck": "Reverse_Machine_Flyes",
  "ppl-cable-rear-delt-fly": "Cable_Rear_Delt_Fly",
  "ppl-preacher-curl-machine": "Machine_Preacher_Curls",
  "ppl-cable-curl": "Standing_Biceps_Cable_Curl",
  "ppl-triceps-pushdown": "Triceps_Pushdown",
  "ppl-triceps-extension-machine": "Machine_Triceps_Extension",
  "ppl-leg-press": "Leg_Press",
  "ppl-hack-squat": "Hack_Squat",
  "ppl-leg-extension": "Leg_Extensions",
  "ppl-seated-leg-curl": "Seated_Leg_Curl",
  "ppl-lying-leg-curl": "Lying_Leg_Curls",
  "ppl-calf-raise-machine": "Standing_Calf_Raises",
  "ppl-leg-press-calf-raise": "Calf_Press_On_The_Leg_Press_Machine",
  "ppl-ab-crunch-machine": "Ab_Crunch_Machine",
  "ppl-cable-crunch": "Cable_Crunch"
};

  const SRC = { name: 'free-exercise-db', url: 'https://github.com/yuhonas/free-exercise-db', license: 'Unlicense (สาธารณสมบัติ)' };

  function entries() {
    return ROWS.map(function (r) { return { slug: r[0], id: 'lib-' + r[0], name: r[1], muscle: r[2], equipment: r[3], weightMode: r[4], repMin: r[5], repMax: r[6], step: r[7] }; });
  }
  function bySlug(slug) { const l = entries(); for (let i = 0; i < l.length; i++) if (l[i].slug === slug) return l[i]; return null; }
  // รหัสรูปของท่า (id ของท่าในแอป) หรือ null ถ้าไม่มีรูปในคลัง
  function photoSlug(exId) {
    if (typeof exId !== 'string') return null;
    if (exId.indexOf('lib-') === 0) { const s = exId.slice(4); return ROWS.some(function (r) { return r[0] === s; }) ? s : null; }
    return Object.prototype.hasOwnProperty.call(PPL_PHOTO, exId) ? PPL_PHOTO[exId] : null;
  }
  function photoUrls(exId) { const s = photoSlug(exId); return s ? ['lib/' + s + '/0.jpg', 'lib/' + s + '/1.jpg'] : null; }

  const STOP = { machine: 1, the: 1, a: 1, of: 1, and: 1, with: 1, plate: 1, loaded: 1, '(': 1 };
  function tokens(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9ก-๙]+/g, ' ').split(' ').filter(function (t) { return t && !STOP[t]; });
  }
  // ชื่อคล้ายกันพอจะถามผู้ใช้ว่า “ใช้ท่าเดิมไหม”: ชุดคำเท่ากัน / อันหนึ่งอยู่ในอีกอัน (≥ 2 คำ) / Jaccard ≥ 0.6
  function nameSimilar(a, b) {
    const A = tokens(a), B = tokens(b);
    if (!A.length || !B.length) return false;
    const sa = new Set(A), sb = new Set(B);
    let inter = 0; sa.forEach(function (t) { if (sb.has(t)) inter++; });
    const uni = sa.size + sb.size - inter;
    if (inter === sa.size && inter === sb.size) return true;
    const small = Math.min(sa.size, sb.size);
    if (small >= 2 && inter === small) return true;
    return uni > 0 && inter / uni >= 0.6;
  }
  // ท่าของผู้ใช้ (ที่ไม่ใช่ท่าที่มาจากคลังนี้) ที่ชื่อคล้ายกับท่าในคลัง
  function similar(entry, exercises) {
    return (exercises || []).filter(function (e) { return e && !e.archived && String(e.id).indexOf('lib-') !== 0 && nameSimilar(e.name, entry.name); });
  }
  // ระเบียนท่าใหม่ (ยังไม่เขียนลงฐานข้อมูล — ผู้เรียกเป็นคนเขียน)
  function toExercise(entry, nowIso, icon) {
    const e = { id: entry.id, name: entry.name, muscle: entry.muscle, equipment: entry.equipment, repMin: entry.repMin, repMax: entry.repMax, step: entry.step,
      weightMode: entry.weightMode, icon: icon || '', subs: [], archived: false, isSample: false, createdAt: nowIso };
    return e;
  }

  const api = { entries: entries, bySlug: bySlug, photoSlug: photoSlug, photoUrls: photoUrls, nameSimilar: nameSimilar, similar: similar, toExercise: toExercise, SRC: SRC, count: ROWS.length };
  global.GymLibrary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
