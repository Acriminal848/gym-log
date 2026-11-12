/* art.js — ภาพประกอบท่า 72 ภาพ (SVG วาดเอง 120×120 ในโฟลเดอร์ art/) + ตัวเชื่อมภาพกับท่า
 *
 * ภาพ: คนเส้นจาง = ท่าเริ่ม, คนเข้ม = ท่าสุดช่วง, ส้ม = กล้ามเนื้อที่ทำงาน, ลูกศร = ทิศทาง (ดูกุญแจใน README)
 *
 * ความปลอดภัยของท่าที่ผู้ใช้สร้างเอง:
 *   — ไม่แก้/ไม่เขียนทับระเบียนท่าที่มีอยู่ ภาพของท่าโปรแกรม PPL (ppl-…) และท่าจากคลัง (lib-…) ผูกที่ id ตอนแสดงผลเท่านั้น
 *   — ท่าที่ผู้ใช้สร้างเองไม่ได้ภาพอัตโนมัติ: ผู้ใช้เลือกเองได้ที่ ท่า → แก้ไขท่า → “เลือกภาพท่า” (เก็บเป็น icon = 'art:<รหัส>' ในระเบียนท่านั้น)
 *   — ท่า PPL/ท่าคลังที่ผู้ใช้เลือกภาพ art:… เองใน icon จะใช้ภาพที่เลือก (icon แบบคนเส้นเดิมไม่ถูกแก้ แค่ไม่ถูกแสดงเมื่อมีภาพชุดนี้)
 */
(function (global) {
  'use strict';
  // [รหัส/ชื่อไฟล์, ชื่อ, กล้ามเนื้อ, อุปกรณ์, วิธีนับน้ำหนัก, repMin, repMax, ขั้นน้ำหนัก]
  const ROWS = [
  [
   "seated-machine-chest-press",
   "Seated Machine Chest Press",
   "อกกลาง",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "flat-dumbbell-bench-press",
   "Flat Dumbbell Bench Press",
   "อกกลาง",
   "ดัมเบล",
   "dumbbell_each",
   8,
   12,
   2
  ],
  [
   "smith-machine-flat-bench-press",
   "Smith Machine Flat Bench Press",
   "อกกลาง",
   "Smith Machine",
   "machine",
   8,
   12,
   5
  ],
  [
   "incline-machine-chest-press",
   "Incline Machine Chest Press",
   "อกบน",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "incline-dumbbell-press",
   "Incline Dumbbell Press",
   "อกบน",
   "ดัมเบล",
   "dumbbell_each",
   8,
   12,
   2
  ],
  [
   "smith-machine-incline-press",
   "Smith Machine Incline Press",
   "อกบน",
   "Smith Machine",
   "machine",
   8,
   12,
   5
  ],
  [
   "pec-deck-machine-chest-fly",
   "Pec Deck / Machine Chest Fly",
   "อกกลาง",
   "เครื่อง",
   "machine",
   10,
   15,
   5
  ],
  [
   "standing-cable-chest-fly",
   "Standing Cable Chest Fly",
   "อกกลาง",
   "สายเคเบิล",
   "cable",
   10,
   15,
   2.5
  ],
  [
   "flat-dumbbell-fly",
   "Flat Dumbbell Fly",
   "อกกลาง",
   "ดัมเบล",
   "dumbbell_each",
   10,
   15,
   2
  ],
  [
   "machine-lateral-raise",
   "Machine Lateral Raise",
   "ไหล่ข้าง",
   "เครื่อง",
   "machine",
   12,
   20,
   5
  ],
  [
   "single-arm-cable-lateral-raise",
   "Single-arm Cable Lateral Raise",
   "ไหล่ข้าง",
   "สายเคเบิล",
   "cable",
   12,
   20,
   2.5
  ],
  [
   "standing-dumbbell-lateral-raise",
   "Standing Dumbbell Lateral Raise",
   "ไหล่ข้าง",
   "ดัมเบล",
   "dumbbell_each",
   12,
   20,
   2
  ],
  [
   "seated-machine-shoulder-press",
   "Seated Machine Shoulder Press",
   "ไหล่หน้า",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "seated-dumbbell-shoulder-press",
   "Seated Dumbbell Shoulder Press",
   "ไหล่หน้า",
   "ดัมเบล",
   "dumbbell_each",
   8,
   12,
   2
  ],
  [
   "smith-machine-seated-shoulder-press",
   "Smith Machine Seated Shoulder Press",
   "ไหล่หน้า",
   "Smith Machine",
   "machine",
   8,
   12,
   5
  ],
  [
   "dumbbell-front-raise",
   "Dumbbell Front Raise",
   "ไหล่หน้า",
   "ดัมเบล",
   "dumbbell_each",
   10,
   15,
   2
  ],
  [
   "cable-rope-triceps-pushdown",
   "Cable Rope Triceps Pushdown",
   "ไตรเซ็ป",
   "สายเคเบิล",
   "cable",
   10,
   15,
   2.5
  ],
  [
   "cable-v-bar-triceps-pushdown",
   "Cable V-bar Triceps Pushdown",
   "ไตรเซ็ป",
   "สายเคเบิล",
   "cable",
   10,
   15,
   2.5
  ],
  [
   "cable-straight-bar-triceps-pushdown",
   "Cable Straight-bar Triceps Pushdown",
   "ไตรเซ็ป",
   "สายเคเบิล",
   "cable",
   10,
   15,
   2.5
  ],
  [
   "cable-rope-overhead-triceps-extension",
   "Cable Rope Overhead Triceps Extension",
   "ไตรเซ็ป",
   "สายเคเบิล",
   "cable",
   10,
   15,
   2.5
  ],
  [
   "single-arm-cable-overhead-extension",
   "Single-arm Cable Overhead Extension",
   "ไตรเซ็ป",
   "สายเคเบิล",
   "cable",
   10,
   15,
   2.5
  ],
  [
   "seated-dumbbell-overhead-triceps-extension",
   "Seated Dumbbell Overhead Triceps Extension",
   "ไตรเซ็ป",
   "ดัมเบล",
   "dumbbell_each",
   10,
   15,
   2
  ],
  [
   "neutral-grip-lat-pulldown",
   "Neutral-grip Lat Pulldown",
   "ปีกหลัง",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "medium-grip-lat-pulldown",
   "Medium-grip Lat Pulldown",
   "ปีกหลัง",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "assisted-pull-up-machine",
   "Assisted Pull-up Machine",
   "ปีกหลัง",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "wide-grip-t-bar-row",
   "Wide-grip T-bar Row",
   "กลางหลัง",
   "เครื่อง",
   "machine",
   10,
   15,
   5
  ],
  [
   "chest-supported-machine-row",
   "Chest-supported Machine Row",
   "กลางหลัง",
   "เครื่อง",
   "machine",
   10,
   15,
   5
  ],
  [
   "wide-grip-seated-cable-row",
   "Wide-grip Seated Cable Row",
   "กลางหลัง",
   "สายเคเบิล",
   "cable",
   10,
   15,
   2.5
  ],
  [
   "incline-bench-chest-supported-dumbbell-row",
   "Incline Bench Chest-supported Dumbbell Row",
   "กลางหลัง",
   "ดัมเบล",
   "dumbbell_each",
   10,
   15,
   2
  ],
  [
   "close-grip-t-bar-row",
   "Close-grip T-bar Row",
   "ปีกหลัง",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "neutral-grip-seated-cable-row",
   "Neutral-grip Seated Cable Row",
   "ปีกหลัง",
   "สายเคเบิล",
   "cable",
   8,
   12,
   2.5
  ],
  [
   "chest-supported-machine-low-row",
   "Chest-supported Machine Low Row",
   "ปีกหลัง",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "seated-single-arm-chest-supported-machine-row",
   "Seated Single-arm Chest-supported Machine Row",
   "ปีกหลัง",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "single-arm-cable-row",
   "Single-arm Cable Row",
   "ปีกหลัง",
   "สายเคเบิล",
   "cable",
   8,
   12,
   2.5
  ],
  [
   "one-arm-dumbbell-row-bench",
   "One-arm Dumbbell Row with Bench Support",
   "ปีกหลัง",
   "ดัมเบล",
   "dumbbell_each",
   8,
   12,
   2
  ],
  [
   "reverse-pec-deck",
   "Reverse Pec Deck",
   "ไหล่หลัง",
   "เครื่อง",
   "machine",
   12,
   20,
   5
  ],
  [
   "chest-supported-dumbbell-rear-delt-fly",
   "Chest-supported Dumbbell Rear-delt Fly",
   "ไหล่หลัง",
   "ดัมเบล",
   "dumbbell_each",
   12,
   20,
   2
  ],
  [
   "cable-reverse-fly",
   "Cable Reverse Fly",
   "ไหล่หลัง",
   "สายเคเบิล",
   "cable",
   12,
   20,
   2.5
  ],
  [
   "machine-preacher-curl",
   "Machine Preacher Curl",
   "ไบเซ็ป",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "cable-curl-ez-straight-bar",
   "Cable Curl — EZ Bar or Straight Bar",
   "ไบเซ็ป",
   "สายเคเบิล",
   "cable",
   8,
   12,
   2.5
  ],
  [
   "seated-dumbbell-supinating-curl",
   "Seated Dumbbell Supinating Curl",
   "ไบเซ็ป",
   "ดัมเบล",
   "dumbbell_each",
   8,
   12,
   2
  ],
  [
   "rope-cable-hammer-curl",
   "Rope Cable Hammer Curl",
   "ไบเซ็ป",
   "สายเคเบิล",
   "cable",
   10,
   15,
   2.5
  ],
  [
   "seated-dumbbell-hammer-curl",
   "Seated Dumbbell Hammer Curl",
   "ไบเซ็ป",
   "ดัมเบล",
   "dumbbell_each",
   10,
   15,
   2
  ],
  [
   "standing-dumbbell-hammer-curl",
   "Standing Dumbbell Hammer Curl",
   "ไบเซ็ป",
   "ดัมเบล",
   "dumbbell_each",
   10,
   15,
   2
  ],
  [
   "45-leg-press",
   "45° Leg Press / Seated Leg Press",
   "ต้นขาหน้า",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "machine-hack-squat",
   "Machine Hack Squat",
   "ต้นขาหน้า",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "smith-machine-squat",
   "Smith Machine Squat",
   "ต้นขาหน้า",
   "Smith Machine",
   "machine",
   8,
   12,
   5
  ],
  [
   "seated-leg-extension",
   "Seated Leg Extension",
   "ต้นขาหน้า",
   "เครื่อง",
   "machine",
   10,
   15,
   5
  ],
  [
   "single-leg-leg-extension",
   "Single-leg Leg Extension",
   "ต้นขาหน้า",
   "เครื่อง",
   "machine",
   10,
   15,
   5
  ],
  [
   "cable-ankle-strap-knee-extension",
   "Cable Ankle-strap Knee Extension",
   "ต้นขาหน้า",
   "สายเคเบิล",
   "cable",
   10,
   15,
   2.5
  ],
  [
   "seated-leg-curl",
   "Seated Leg Curl",
   "ต้นขาหลัง",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "lying-leg-curl",
   "Lying Leg Curl",
   "ต้นขาหลัง",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "standing-single-leg-curl-machine",
   "Standing Single-leg Curl Machine",
   "ต้นขาหลัง",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "stability-ball-leg-curl",
   "Stability-ball Leg Curl",
   "ต้นขาหลัง",
   "น้ำหนักตัว",
   "bodyweight",
   8,
   12,
   2.5
  ],
  [
   "dumbbell-romanian-deadlift",
   "Dumbbell Romanian Deadlift",
   "ต้นขาหลัง",
   "ดัมเบล",
   "dumbbell_each",
   8,
   12,
   2
  ],
  [
   "smith-machine-romanian-deadlift",
   "Smith Machine Romanian Deadlift",
   "ต้นขาหลัง",
   "Smith Machine",
   "machine",
   8,
   12,
   5
  ],
  [
   "45-degree-back-extension",
   "45° Back Extension",
   "ต้นขาหลัง",
   "น้ำหนักตัว",
   "bodyweight",
   8,
   12,
   2.5
  ],
  [
   "machine-hip-thrust-glute-drive",
   "Machine Hip Thrust / Glute Drive",
   "ก้น",
   "เครื่อง",
   "machine",
   8,
   12,
   5
  ],
  [
   "smith-machine-hip-thrust",
   "Smith Machine Hip Thrust",
   "ก้น",
   "Smith Machine",
   "machine",
   8,
   12,
   5
  ],
  [
   "barbell-glute-bridge",
   "Barbell Glute Bridge",
   "ก้น",
   "บาร์เบล",
   "barbell_total",
   8,
   12,
   5
  ],
  [
   "seated-hip-abduction-machine",
   "Seated Hip Abduction Machine",
   "ต้นขาด้านนอก",
   "เครื่อง",
   "machine",
   12,
   20,
   5
  ],
  [
   "standing-cable-hip-abduction",
   "Standing Cable Hip Abduction",
   "ต้นขาด้านนอก",
   "สายเคเบิล",
   "cable",
   12,
   20,
   2.5
  ],
  [
   "side-lying-hip-abduction",
   "Side-lying Hip Abduction",
   "ต้นขาด้านนอก",
   "น้ำหนักตัว",
   "bodyweight",
   12,
   20,
   2.5
  ],
  [
   "seated-hip-adduction-machine",
   "Seated Hip Adduction Machine",
   "ต้นขาด้านใน",
   "เครื่อง",
   "machine",
   12,
   20,
   5
  ],
  [
   "standing-cable-hip-adduction",
   "Standing Cable Hip Adduction",
   "ต้นขาด้านใน",
   "สายเคเบิล",
   "cable",
   12,
   20,
   2.5
  ],
  [
   "side-lying-hip-adduction",
   "Side-lying Hip Adduction",
   "ต้นขาด้านใน",
   "น้ำหนักตัว",
   "bodyweight",
   12,
   20,
   2.5
  ],
  [
   "standing-calf-raise-machine",
   "Standing Calf Raise Machine",
   "น่อง",
   "เครื่อง",
   "machine",
   10,
   20,
   5
  ],
  [
   "calf-press-on-leg-press",
   "Calf Press on Leg Press Machine",
   "น่อง",
   "เครื่อง",
   "machine",
   10,
   20,
   5
  ],
  [
   "seated-calf-raise-machine",
   "Seated Calf Raise Machine",
   "น่อง",
   "เครื่อง",
   "machine",
   10,
   20,
   5
  ],
  [
   "ab-crunch-machine",
   "Ab Crunch Machine",
   "หน้าท้อง",
   "เครื่อง",
   "machine",
   10,
   15,
   5
  ],
  [
   "kneeling-cable-crunch",
   "Kneeling Cable Crunch",
   "หน้าท้อง",
   "สายเคเบิล",
   "cable",
   10,
   15,
   2.5
  ],
  [
   "captains-chair-bent-knee-raise",
   "Captain's Chair Bent-knee Raise",
   "หน้าท้อง",
   "น้ำหนักตัว",
   "bodyweight",
   10,
   15,
   2.5
  ]
];
  // ท่า PPL เดิม → ภาพ
  const PPL_ART = {
 "ppl-incline-chest-press": "incline-machine-chest-press",
 "ppl-smith-incline-press": "smith-machine-incline-press",
 "ppl-flat-chest-press": "seated-machine-chest-press",
 "ppl-flat-chest-press-b": "seated-machine-chest-press",
 "ppl-pec-deck": "pec-deck-machine-chest-fly",
 "ppl-cable-fly": "standing-cable-chest-fly",
 "ppl-lateral-raise-machine": "machine-lateral-raise",
 "ppl-cable-lateral-raise": "single-arm-cable-lateral-raise",
 "ppl-triceps-pushdown": "cable-rope-triceps-pushdown",
 "ppl-ab-crunch-machine": "ab-crunch-machine",
 "ppl-cable-crunch": "kneeling-cable-crunch",
 "ppl-lat-pulldown": "neutral-grip-lat-pulldown",
 "ppl-single-arm-row": "seated-single-arm-chest-supported-machine-row",
 "ppl-seated-cable-row-close": "neutral-grip-seated-cable-row",
 "ppl-tbar-row-close": "close-grip-t-bar-row",
 "ppl-seated-cable-row-wide": "wide-grip-seated-cable-row",
 "ppl-tbar-row-wide": "wide-grip-t-bar-row",
 "ppl-reverse-pec-deck": "reverse-pec-deck",
 "ppl-cable-rear-delt-fly": "cable-reverse-fly",
 "ppl-cable-curl": "cable-curl-ez-straight-bar",
 "ppl-preacher-curl-machine": "machine-preacher-curl",
 "ppl-leg-press": "45-leg-press",
 "ppl-hack-squat": "machine-hack-squat",
 "ppl-seated-leg-curl": "seated-leg-curl",
 "ppl-lying-leg-curl": "lying-leg-curl",
 "ppl-hip-thrust-machine": "machine-hip-thrust-glute-drive",
 "ppl-smith-hip-thrust": "smith-machine-hip-thrust",
 "ppl-leg-extension": "seated-leg-extension",
 "ppl-leg-extension-b": "seated-leg-extension",
 "ppl-calf-raise-machine": "standing-calf-raise-machine",
 "ppl-leg-press-calf-raise": "calf-press-on-leg-press"
};
  // ท่าในคลังเดิม (lib-<รหัส>) ที่ซ้ำกับภาพชุดนี้ → ใช้ภาพนี้ และไม่แสดงซ้ำในรายการคลัง
  const LIB_ALIAS = {
 "Leverage_Chest_Press": "seated-machine-chest-press",
 "Machine_Bench_Press": "seated-machine-chest-press",
 "Leverage_Incline_Chest_Press": "incline-machine-chest-press",
 "Smith_Machine_Bench_Press": "smith-machine-flat-bench-press",
 "Cable_Crossover": "standing-cable-chest-fly",
 "V-Bar_Pulldown": "neutral-grip-lat-pulldown",
 "T-Bar_Row_with_Handle": "close-grip-t-bar-row",
 "Lying_T-Bar_Row": "wide-grip-t-bar-row",
 "Machine_Shoulder_Military_Press": "seated-machine-shoulder-press",
 "Smith_Machine_Overhead_Shoulder_Press": "smith-machine-seated-shoulder-press",
 "Machine_Bicep_Curl": "machine-preacher-curl",
 "Cable_Hammer_Curls_-_Rope_Attachment": "rope-cable-hammer-curl",
 "Triceps_Pushdown_-_Rope_Attachment": "cable-rope-triceps-pushdown",
 "Triceps_Pushdown_-_V-Bar_Attachment": "cable-v-bar-triceps-pushdown",
 "Triceps_Overhead_Extension_with_Rope": "cable-rope-overhead-triceps-extension",
 "Smith_Machine_Squat": "smith-machine-squat",
 "Standing_Leg_Curl": "standing-single-leg-curl-machine",
 "Smith_Machine_Stiff-Legged_Deadlift": "smith-machine-romanian-deadlift",
 "Thigh_Abductor": "seated-hip-abduction-machine",
 "Thigh_Adductor": "seated-hip-adduction-machine",
 "Seated_Calf_Raise": "seated-calf-raise-machine",
 "Calf_Press": "calf-press-on-leg-press"
};
  const COVERED = {"45-leg-press": 1, "ab-crunch-machine": 1, "cable-curl-ez-straight-bar": 1, "cable-reverse-fly": 1, "cable-rope-overhead-triceps-extension": 1, "cable-rope-triceps-pushdown": 1, "cable-v-bar-triceps-pushdown": 1, "calf-press-on-leg-press": 1, "close-grip-t-bar-row": 1, "incline-machine-chest-press": 1, "kneeling-cable-crunch": 1, "lying-leg-curl": 1, "machine-hack-squat": 1, "machine-hip-thrust-glute-drive": 1, "machine-lateral-raise": 1, "machine-preacher-curl": 1, "neutral-grip-lat-pulldown": 1, "neutral-grip-seated-cable-row": 1, "pec-deck-machine-chest-fly": 1, "reverse-pec-deck": 1, "rope-cable-hammer-curl": 1, "seated-calf-raise-machine": 1, "seated-hip-abduction-machine": 1, "seated-hip-adduction-machine": 1, "seated-leg-curl": 1, "seated-leg-extension": 1, "seated-machine-chest-press": 1, "seated-machine-shoulder-press": 1, "seated-single-arm-chest-supported-machine-row": 1, "single-arm-cable-lateral-raise": 1, "smith-machine-flat-bench-press": 1, "smith-machine-hip-thrust": 1, "smith-machine-incline-press": 1, "smith-machine-romanian-deadlift": 1, "smith-machine-seated-shoulder-press": 1, "smith-machine-squat": 1, "standing-cable-chest-fly": 1, "standing-calf-raise-machine": 1, "standing-single-leg-curl-machine": 1, "wide-grip-seated-cable-row": 1, "wide-grip-t-bar-row": 1};       // ภาพที่มีท่าอยู่ในแอปแล้ว (PPL หรือคลังเดิม) → ไม่ลงรายการคลังซ้ำ

  const byId = {};
  ROWS.forEach(function (r) { byId[r[0]] = r; });
  function has(id) { return Object.prototype.hasOwnProperty.call(byId, id); }
  function url(id) { return has(id) ? 'art/' + id + '.svg' : ''; }
  function key(id) { return 'art:' + id; }
  function idOfKey(k) { return typeof k === 'string' && k.indexOf('art:') === 0 && has(k.slice(4)) ? k.slice(4) : null; }
  function entry(r) { return { slug: 'art-' + r[0], id: 'lib-art-' + r[0], artId: r[0], name: r[1], muscle: r[2], equipment: r[3], weightMode: r[4], repMin: r[5], repMax: r[6], step: r[7] }; }
  // รายการท่าใหม่ที่เพิ่มเข้าคลังได้ (เฉพาะภาพที่ยังไม่มีท่าในแอป)
  // ท่าดัมเบลไม่เสนอในคลัง (ตามที่ตกลงกันไว้ว่ายังไม่มีดัมเบล) แต่ภาพยังเลือกให้ท่าของตัวเองได้ในหน้าแก้ไขท่า
  function entries() { return ROWS.filter(function (r) { return !COVERED[r[0]] && r[3] !== 'ดัมเบล'; }).map(entry); }
  // ภาพของท่าในแอป (id) หรือ null — ท่าที่ผู้ใช้สร้างเองได้ภาพจากสิ่งที่เลือกไว้ใน icon เท่านั้น
  function forId(exId) {
    if (typeof exId !== 'string') return null;
    if (Object.prototype.hasOwnProperty.call(PPL_ART, exId)) return PPL_ART[exId];
    if (exId.indexOf('lib-art-') === 0) { const a = exId.slice(8); return has(a) ? a : null; }
    if (exId.indexOf('lib-') === 0) { const s = exId.slice(4); return Object.prototype.hasOwnProperty.call(LIB_ALIAS, s) ? LIB_ALIAS[s] : null; }
    return null;
  }
  // ภาพที่ใช้แสดงของท่า: เลือกเองใน icon (art:…) > ท่า PPL/คลังที่มีภาพตรงกัน > null (ใช้ไอคอนคนเส้นเดิม)
  function forExercise(ex) {
    if (!ex) return null;
    const chosen = idOfKey(ex.icon);
    if (chosen) return chosen;
    return forId(ex.id);
  }
    // ท่า PPL ในแอปใช้ภาพนี้อยู่แล้วหรือไม่ (ถ้าใช่ ท่า free-exercise-db ที่ชื่อซ้ำจะไม่เสนอในคลังอีก)
  const PPL_SET = {}; Object.keys(PPL_ART).forEach(function (k) { PPL_SET[PPL_ART[k]] = 1; });
  function inPpl(artId) { return !!PPL_SET[artId]; }
  const api = { inPpl: inPpl, ROWS: ROWS, has: has, url: url, key: key, idOfKey: idOfKey, entries: entries, forId: forId, forExercise: forExercise, entry: function (id) { return has(id) ? entry(byId[id]) : null; }, count: ROWS.length };
  global.GymArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
