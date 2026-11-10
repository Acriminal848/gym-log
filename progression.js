/* progression.js — การคำนวณล้วน ๆ (ไม่แตะ DOM ไม่แตะฐานข้อมูล)
 *
 * กติกา double progression ที่อธิบายเหตุผลได้ — ใช้ "ผลจริง" ที่จดไว้เท่านั้น
 * (ไม่เคยถือว่าผู้ใช้ทำตามเป้าที่แอปเสนอไว้แล้วโดยอัตโนมัติ)
 *
 *  1. ใช้ประวัติล่าสุดของ "ท่าเดียวกัน + อุปกรณ์/วิธีนับน้ำหนักเดียวกัน" เท่านั้น
 *     ไม่ย้ายน้ำหนักข้ามท่า ถ้าเคยเล่นแต่อุปกรณ์ต่างกัน → แจ้งว่าเทียบไม่ได้ ไม่เสนอตัวเลข
 *  2. นับเฉพาะเซต working ที่ทำเสร็จ — warm-up และเซตที่ข้าม/ไม่ได้จด ไม่นับ
 *     (เซตที่ข้ามไม่ถูกตีเป็น reps = 0 และไม่ถือเป็นความล้มเหลว)
 *  3. ครั้งก่อนใช้น้ำหนักเดียวทุกเซต:
 *     - ครบทุกเซตตามแผนและทุกเซตถึง rep ceiling → เพิ่มน้ำหนัก 1 ขั้น เริ่ม reps ที่ขั้นต่ำของช่วง
 *     - ยังไม่ถึง ceiling → น้ำหนักเดิม เป้า reps = reps ต่ำสุดของครั้งก่อน + 1 (ไม่เกิน ceiling)
 *     - มีเซตต่ำกว่าขั้นต่ำของช่วง: ครั้งเดียวยังไม่ลดน้ำหนัก (ลองซ้ำ),
 *       ถ้าพลาดขั้นต่ำที่น้ำหนักเดิมติดกัน 2 ครั้งล่าสุด → เสนอลด 1 ขั้น
 *     - จดไม่ครบตามแผน (เช่นข้ามเซต) ต่อให้ถึง ceiling ก็ยังไม่เสนอเพิ่มน้ำหนัก
 *  4. (1.7) ครั้งก่อนใช้น้ำหนักหลายค่า → ตัดสินจาก "เซตที่อ่อนสุด" (น้ำหนักต่ำสุด) ใช้น้ำหนักนั้นเท่ากันทุกเซต
 *     แล้วใช้กติกาข้อ 3 กับเซตที่น้ำหนักนั้น (เซตแรกที่หนักกว่าไม่ถือเป็นความก้าวหน้า)
 *     นอกจากนี้มี analyzeSets (เตือนเซตหลังตกแรง) และ stallStatus (ไม่ก้าวหน้า 3 ครั้งติด)
 *  5. ทุกคำแนะนำมีเหตุผลสั้น ๆ และเป็นเพียง "ค่าที่เสนอ" ผู้ใช้เลือกเองว่าจะทำตามหรือไม่
 *
 * เครดิต: กติกาข้อ "ลดน้ำหนักเมื่อพลาดขั้นต่ำติดกัน 2 ครั้ง" และ "เซตที่ข้ามไม่ถือเป็นความล้มเหลว"
 * ได้แนวคิดจากการอ่าน shared/algorithm.js ของ https://github.com/Gman0909/FitnessTrack
 * (MIT License, Copyright (c) 2026 Giuliano Maciocci) — ไม่ได้คัดลอกโค้ดมาใช้ ไฟล์นี้เขียนใหม่ทั้งหมด
 * ตามกติกาของแอปนี้ (ซึ่งต่างจากของเขา: เป้าเดียวต่อท่า, ไม่เทียบด้วย volume)
 */
(function (global) {
  'use strict';

  function norm(s) { return String(s || '').trim().toLowerCase(); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function fmt(n) { return Number.isInteger(n) ? String(n) : String(+Number(n).toFixed(2)); }
  function sameWeight(a, b) { return Math.abs(a - b) < 0.001; }

  function workingCompleted(entry) {
    return (entry.sets || []).filter(function (s) {
      return s.kind === 'working' && s.status === 'completed';
    });
  }

  // น้ำหนัก × reps ของเซต working ที่ทำเสร็จจริงเท่านั้น (ข้าม/warm-up ไม่นับ)
  function volumeLoad(entry) {
    return workingCompleted(entry).reduce(function (sum, s) { return sum + s.weight * s.reps; }, 0);
  }

  function sameBasis(a, b) {
    return norm(a.equipment) === norm(b.equipment) && a.weightMode === b.weightMode;
  }

  function sortNewestFirst(workouts) {
    return workouts.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const sa = a.startedAt || '', sb = b.startedAt || '';
      return sa < sb ? 1 : sa > sb ? -1 : 0;
    });
  }

  // เซสชันที่จบแล้วของท่านี้ที่มีเซต working ทำเสร็จ (ใหม่ → เก่า) แยกว่าอุปกรณ์/วิธีนับตรงกันหรือไม่
  function sessionsOf(workouts, entry, excludeWorkoutId) {
    const same = [], other = [];
    sortNewestFirst(workouts).forEach(function (w) {
      if (w.status !== 'finished' || w.id === excludeWorkoutId) return;
      for (let j = w.entries.length - 1; j >= 0; j--) {
        const e = w.entries[j];
        if (e.exerciseId !== entry.exerciseId) continue;
        const sets = workingCompleted(e);
        if (!sets.length) continue;
        const rec = { workout: w, entry: e, sets: sets };
        (sameBasis(e, entry) ? same : other).push(rec);
        break;   // นับท่าเดียวกันครั้งละ 1 รายการต่อ workout (ตัวล่าสุด)
      }
    });
    return { same: same, other: other };
  }

  /* ผลครั้งก่อนของ "ท่าเดียวกัน" (ตาม exerciseId เท่านั้น ไม่ข้ามไปท่าอื่น)
   * - อุปกรณ์/วิธีนับตรงกัน → comparable: true
   * - เคยเล่นแต่อุปกรณ์/วิธีนับต่างกันเท่านั้น → comparable: false
   * - ไม่เคยเล่น → null */
  function findPrevious(workouts, entry, excludeWorkoutId) {
    const s = sessionsOf(workouts, entry, excludeWorkoutId);
    if (s.same.length) return { workout: s.same[0].workout, entry: s.same[0].entry, comparable: true };
    if (s.other.length) return { workout: s.other[0].workout, entry: s.other[0].entry, comparable: false };
    return null;
  }

  function repsText(sets) { return sets.map(function (s) { return s.reps; }).join('/'); }

  /* เป้าหมายวันนี้ (ค่าที่เสนอ — ยังไม่นับเป็นผลงาน)
   *   workouts: ประวัติทั้งหมด, entry: ท่าที่กำลังจะเล่น (exerciseId/equipment/weightMode/plannedSets)
   *   ex: { repMin, repMax, step } ของท่า
   * คืน null ถ้าไม่เคยเล่นท่านี้ (ให้ผู้ใช้กรอกน้ำหนักเริ่มต้นเอง)
   * คืน { weight, reps, kind, reason, basedOn } โดย weight = null เมื่อไม่มีตัวเลขที่เชื่อถือได้ */
  function suggestTarget(workouts, entry, ex, excludeWorkoutId) {
    const repMin = ex && ex.repMin > 0 ? ex.repMin : 8;
    const repMax = ex && ex.repMax >= repMin ? ex.repMax : Math.max(12, repMin);
    const step = ex && ex.step > 0 ? ex.step : 2.5;

    const s = sessionsOf(workouts, entry, excludeWorkoutId);
    if (!s.same.length) {
      if (!s.other.length) return null;
      const o = s.other[0].entry;
      return {
        weight: null, reps: null, kind: 'incomparable', basedOn: null,
        reason: 'เคยเล่นท่านี้แต่ใช้อุปกรณ์/วิธีนับน้ำหนักต่างกัน (' + (o.equipment || '—') + ') เทียบน้ำหนักกันไม่ได้ จึงไม่เสนอตัวเลข — กรอกน้ำหนักเริ่มต้นเอง'
      };
    }

    const last = s.same[0];
    const sets = last.sets;
    const basedOn = { date: last.workout.date, sets: sets.map(function (x) { return { weight: x.weight, reps: x.reps }; }) };

    // น้ำหนักที่ใช้ในครั้งก่อน
    const distinct = [];
    sets.forEach(function (x) { if (!distinct.some(function (w) { return sameWeight(w, x.weight); })) distinct.push(x.weight); });

    /* ----- น้ำหนักผสมหลายค่า (1.7): ตัดสินจาก "เซตที่อ่อนสุด" ไม่ใช่เซตที่หนักสุด -----
     * เซตแรกหนักแล้วเซตหลังต้องลดน้ำหนักไม่ถือเป็นความก้าวหน้า — ใช้น้ำหนักต่ำสุดที่ทำได้ตลอด
     * เป็นน้ำหนักทำงาน แล้วให้กติกา double progression ทำงานต่อจากนั้นตามปกติ */
    const mixed = distinct.length > 1;
    const W = Math.min.apply(null, distinct);
    const atW = sets.filter(function (x) { return sameWeight(x.weight, W); });
    const reps = atW.map(function (x) { return x.reps; });
    const minReps = Math.min.apply(null, reps);
    const plannedLast = last.entry.plannedSets > 0 ? last.entry.plannedSets : (entry.plannedSets || sets.length);
    const incomplete = sets.length < plannedLast;
    const allAtCeiling = reps.every(function (r) { return r >= repMax; });
    const wTxt = distinct.slice().sort(function (a, b) { return b - a; }).map(fmt).join(' / ');
    const mixTail = ' เซตแรกควรหยุดก่อนสุดแรงราว 1–2 reps เพื่อให้เซตหลังไม่ตก';
    const missedMin = minReps < repMin;

    if (allAtCeiling) {
      /* 1.9: น้ำหนักผสม — เซตที่น้ำหนักทำงาน (เซตอ่อนสุด) ถึงเพดานแค่ “บางเซต” (เช่น 12 kg ทำได้แค่เซตแรก 15 reps แล้วเซตอื่นไปหนัก 18 kg)
       * ยังพิสูจน์ไม่ได้ว่าทำได้ทุกเซต จึงไม่เพิ่มน้ำหนัก — เสนอให้ทำทุกเซตที่น้ำหนักทำงานให้ถึงเพดานก่อน */
      const heavierMissed = sets.some(function (x) { return x.reps < repMax; });   // เซตที่หนักกว่าไม่ถึงเพดาน
      if (mixed && heavierMissed && atW.length < plannedLast) {
        return {
          weight: W, reps: repMax, kind: 'mixed', basedOn: basedOn,
          reason: 'ครั้งก่อนใช้น้ำหนัก ' + wTxt + ' kg น้ำหนักที่ทำได้ ' + repMax + ' reps มีเฉพาะ ' + fmt(W) + ' kg (' + atW.length + ' จาก ' + plannedLast +
            ' เซต) จึงเสนอใช้ ' + fmt(W) + ' kg ทุกเซต เป้า ' + repMax + ' reps ทุกเซต ถึงเป้าแล้วค่อยเพิ่มน้ำหนัก' + mixTail
        };
      }
      if (incomplete) {
        return {
          weight: W, reps: repMax, kind: 'incomplete', basedOn: basedOn,
          reason: 'ครั้งก่อนถึง ' + repMax + ' reps ทุกเซตที่จด แต่จดไว้ ' + sets.length + ' จาก ' + plannedLast +
            ' เซต (เซตที่ข้ามไม่นับเป็นล้มเหลว) จึงยังไม่เสนอเพิ่มน้ำหนัก — ลองทำให้ครบทุกเซตที่ ' + fmt(W) + ' kg'
        };
      }
      return {
        weight: round2(W + step), reps: repMin, kind: 'add_weight', basedOn: basedOn,
        reason: mixed
          ? 'ครั้งก่อนใช้น้ำหนัก ' + wTxt + ' kg เซตที่อ่อนสุด (' + fmt(W) + ' kg) ถึง ' + repMax + ' reps ทุกเซต จึงเสนอเพิ่มเป็น ' +
            fmt(round2(W + step)) + ' kg ทุกเซต แล้วเริ่มที่ ' + repMin + ' reps'
          : 'ครั้งก่อนครบ ' + repMax + ' reps ทุกเซต จึงเสนอเพิ่มน้ำหนัก ' + fmt(step) + ' kg แล้วเริ่มที่ ' + repMin + ' reps'
      };
    }

    if (missedMin && mixed) {
      return {
        weight: W, reps: repMin, kind: 'mixed', basedOn: basedOn,
        reason: 'ครั้งก่อนใช้น้ำหนัก ' + wTxt + ' kg เซตที่อ่อนสุด (' + fmt(W) + ' kg) ทำได้ต่ำกว่า ' + repMin + ' reps จึงเสนอใช้ ' +
          fmt(W) + ' kg ทุกเซตก่อน' + mixTail
      };
    }

    if (missedMin) {
      const prior = s.same[1];
      const priorMissed = !!prior && prior.sets.some(function (x) { return sameWeight(x.weight, W) && x.reps < repMin; });
      if (priorMissed && W - step > 0) {
        return {
          weight: round2(W - step), reps: repMin, kind: 'deload', basedOn: basedOn,
          reason: 'ทำได้ต่ำกว่าขั้นต่ำ ' + repMin + ' reps ที่ ' + fmt(W) + ' kg ติดกัน 2 ครั้ง จึงเสนอลดน้ำหนักลง 1 ขั้น (' + fmt(step) + ' kg)'
        };
      }
      return {
        weight: W, reps: repMin, kind: 'hold', basedOn: basedOn,
        reason: 'ครั้งก่อนบางเซตต่ำกว่าขั้นต่ำ ' + repMin + ' reps (ทำได้ ' + repsText(sets) + ') — ผลตกครั้งเดียวยังไม่ลดน้ำหนัก ลองทำซ้ำที่ ' + fmt(W) + ' kg'
      };
    }

    const target = Math.min(repMax, minReps + 1);
    if (mixed) {
      return {
        weight: W, reps: target, kind: 'mixed', basedOn: basedOn,
        reason: 'ครั้งก่อนใช้น้ำหนัก ' + wTxt + ' kg แอปตัดสินจากเซตที่อ่อนสุด (' + fmt(W) + ' kg × ' + minReps + ' reps) ' +
          'จึงเสนอใช้ ' + fmt(W) + ' kg เท่ากันทุกเซต เป้า ' + target + ' reps แล้วค่อยเพิ่มตามปกติ —' + mixTail
      };
    }
    return {
      weight: W, reps: target, kind: 'add_reps', basedOn: basedOn,
      reason: 'ครั้งก่อนทำได้ ' + repsText(sets) + ' reps ที่ ' + fmt(W) + ' kg ยังไม่ถึง ' + repMax + ' ทุกเซต จึงเสนอเพิ่ม reps เป็น ' + target + ' ที่น้ำหนักเดิม'
    };
  }

  /* ---------- 1.7: วิเคราะห์รูปแบบเซตใน session เดียว (ไม่แตะข้อมูล) ----------
   * ใช้แสดงคำเตือนระหว่างจด และคำแนะนำตอนดูครั้งก่อน เป็นคำแนะนำเท่านั้น ผู้ใช้เลือกเอง
   * - heavyFirst: เซตหลังเบากว่าเซตแรกตั้งแต่ HEAVY_DROP (10%) ขึ้นไป
   * - repDrop: น้ำหนักเท่าเดิมแต่ reps ตกตั้งแต่ 40% และอย่างน้อย 3 reps จากเซตแรก
   *            หรือเซตหลังต่ำกว่าช่วง reps ทั้งที่เซตแรกอยู่ในช่วง
   * (reps ตกบ้างในเซตหลังเป็นเรื่องปกติจากความล้า จึงตั้งเกณฑ์ไว้ที่ตกแรงเท่านั้น) */
  const HEAVY_DROP = 0.10, REP_DROP_FRAC = 0.40, REP_DROP_MIN = 3;
  const TIP = 'ครั้งหน้าลองใช้น้ำหนักเท่ากันทุกเซต และหยุดเซตแรกก่อนสุดแรงราว 1–2 reps';

  function analyzeSets(sets, ex) {
    const repMin = ex && ex.repMin > 0 ? ex.repMin : 8;
    const out = { heavyFirst: false, repDrop: false, warn: false, text: '', short: '' };
    const w = (sets || []).filter(function (x) { return x.kind === 'working' && x.status === 'completed'; });
    if (w.length < 2) return out;
    const f = w[0];
    const later = w.slice(1);
    out.heavyFirst = later.some(function (x) { return x.weight <= f.weight * (1 - HEAVY_DROP) + 1e-9; });
    let worst = null;
    later.forEach(function (x) {
      if (!sameWeight(x.weight, f.weight)) return;
      const drop = f.reps - x.reps;
      const big = drop >= REP_DROP_MIN && x.reps <= f.reps * (1 - REP_DROP_FRAC) + 1e-9;
      const below = x.reps < repMin && f.reps >= repMin;
      if ((big || below) && (!worst || x.reps < worst.reps)) worst = x;
    });
    out.repDrop = !!worst;
    out.warn = out.heavyFirst || out.repDrop;
    if (out.repDrop) {
      out.short = 'reps ตกแรง ' + f.reps + ' → ' + worst.reps + ' · ครั้งหน้าเหลือเซตแรก 1–2 reps';
      out.text = 'reps ตกแรงจากเซตแรก (' + f.reps + ' → ' + worst.reps + ') เซตแรกอาจใกล้สุดแรงเกินไป — ' + TIP;
    } else if (out.heavyFirst) {
      out.short = 'เซตแรกหนักกว่าเซตหลัง · ครั้งหน้าใช้น้ำหนักเท่ากันทุกเซต';
      out.text = 'เซตแรกหนักกว่าเซตหลัง — ' + TIP;
    }
    return out;
  }

  /* เซตที่อ่อนสุด (1.9): น้ำหนักต่ำสุด + reps "ที่น้ำหนักนั้น" เท่านั้น
   * (เซตที่หนักกว่าแล้ว reps ตก เช่น 18 kg × 8 ไม่ลาก reps ต่ำสุดของน้ำหนักทำงานลงมา) */
  function weakest(sets) {
    const wMin = Math.min.apply(null, sets.map(function (x) { return x.weight; }));
    const at = sets.filter(function (x) { return sameWeight(x.weight, wMin); });
    return {
      wMin: wMin,
      rMin: Math.min.apply(null, at.map(function (x) { return x.reps; })),
      rSum: at.reduce(function (n, x) { return n + x.reps; }, 0)
    };
  }

  /* ความก้าวหน้า session ใหม่เทียบ session ก่อนหน้า ตัดสินจาก "เซตที่อ่อนสุด":
   * น้ำหนักต่ำสุดสูงขึ้น = ก้าวหน้า, ต่ำลง = ไม่; เท่ากัน → reps ต่ำสุด (ที่น้ำหนักนั้น) สูงขึ้น หรือเท่ากันแต่ reps รวมมากขึ้น */
  function progressed(a, b) {
    const A = weakest(a), B = weakest(b);
    if (A.wMin > B.wMin + 0.001) return true;
    if (A.wMin < B.wMin - 0.001) return false;
    if (A.rMin !== B.rMin) return A.rMin > B.rMin;
    return A.rSum > B.rSum;
  }

  /* ตัวตัดสินเดียวของทั้งแอป (1.9) — ใช้บนหน้าสรุปหลังจบ
   *  cur/prev: เซต working ที่ทำเสร็จ (ใหม่/ครั้งก่อน, ท่า+อุปกรณ์เดียวกัน); target: entry.target ที่แอปเสนอวันนั้น (หรือ null)
   *  state: 'up' ก้าวหน้า | 'same' ทรงตัว | 'reset' ตั้งหลักใหม่ตามเป้า (น้ำหนักทำงานลดลงแต่ทำครบตามเป้าที่แอปเสนอ) | 'down' ต่ำกว่าครั้งก่อน
   *  onTarget: ทุกเซตถึงน้ำหนัก/reps ที่เสนอ
   *  ไม่ใช้ "น้ำหนักเซตที่หนักที่สุด" ตัดสินอีก — เซตแรกที่หนักเกินแล้วต้องลดไม่ควรทำให้ครั้งต่อไปดูเหมือนถอยหลัง */
  function verdict(cur, prev, target, ex) {
    if (!cur || !cur.length || !prev || !prev.length) return null;
    // reps เกินเพดานของช่วง (repMax) ถือว่าเท่ากับเพดาน — ถึงเพดานแล้วเป้าคือเพิ่มน้ำหนัก ไม่ใช่เพิ่ม reps ต่อ
    const cap = ex && ex.repMax > 0 ? ex.repMax : null;
    if (cap) {
      const lim = function (a) { return a.map(function (x) { return { weight: x.weight, reps: Math.min(x.reps, cap) }; }); };
      cur = lim(cur); prev = lim(prev);
    }
    const C = weakest(cur), Pv = weakest(prev);
    let onTarget = false;
    if (target && target.weight != null && target.reps != null) {
      onTarget = cur.every(function (x) { return x.weight >= target.weight - 0.001 && x.reps >= target.reps; });
    }
    let st = 'same', detail = '';
    if (progressed(cur, prev)) {
      st = 'up';
      detail = C.wMin > Pv.wMin + 0.001
        ? 'น้ำหนักทำงาน ' + fmt(Pv.wMin) + ' → ' + fmt(C.wMin) + ' kg'
        : (C.rMin !== Pv.rMin ? 'เซตอ่อนสุดที่ ' + fmt(C.wMin) + ' kg: ' + Pv.rMin + ' → ' + C.rMin + ' reps' : 'ที่ ' + fmt(C.wMin) + ' kg ทำได้ ' + C.rSum + ' reps รวม (ครั้งก่อน ' + Pv.rSum + ')');
    } else if (C.wMin < Pv.wMin - 0.001 || C.rMin < Pv.rMin || (C.rMin === Pv.rMin && C.rSum < Pv.rSum)) {
      if (onTarget && C.wMin < Pv.wMin - 0.001) { st = 'reset'; detail = 'น้ำหนักทำงาน ' + fmt(Pv.wMin) + ' → ' + fmt(C.wMin) + ' kg · ทำครบตามเป้า'; }
      else {
        st = 'down';
        detail = C.wMin < Pv.wMin - 0.001
          ? 'น้ำหนักทำงาน ' + fmt(Pv.wMin) + ' → ' + fmt(C.wMin) + ' kg'
          : 'เซตอ่อนสุดที่ ' + fmt(C.wMin) + ' kg: ' + Pv.rMin + ' → ' + C.rMin + ' reps';
      }
    }
    return { state: st, onTarget: onTarget, detail: detail, work: C.wMin, prevWork: Pv.wMin };
  }

  /* ---------- ขั้นน้ำหนักของเครื่อง (1.9) ----------
   * เดาจากน้ำหนักที่เคยจดจริง: ผลต่างระหว่างน้ำหนักที่ต่างกัน → ตัวหารร่วมมาก (ละเอียดสุด 0.25)
   * เสนอเฉพาะเมื่อน้ำหนักที่เคยใช้ "ไม่ลงตัวกับขั้นปัจจุบัน" (ขั้นปัจจุบันน่าจะผิด) และได้ค่า 1–25 kg
   * weights: น้ำหนักที่ทำเสร็จของท่า+อุปกรณ์เดียวกัน (ไม่รวม warm-up) */
  function gcdInt(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  function inferStep(weights, currentStep) {
    const q = [];
    (weights || []).forEach(function (w) {
      if (!(w > 0) || !isFinite(w)) return;
      const k = Math.round(w * 4);
      if (Math.abs(k / 4 - w) > 0.001) return;       // น้ำหนักที่ไม่ลงตัว 0.25 → ไม่เอามาเดา
      if (q.indexOf(k) < 0) q.push(k);
    });
    if (q.length < 2) return null;
    q.sort(function (a, b) { return a - b; });
    let g = 0;
    for (let i = 1; i < q.length; i++) g = gcdInt(g, q[i] - q[i - 1]);
    const inferred = g / 4;
    if (inferred < 1 || inferred > 25) return null;
    const cur = currentStep > 0 ? currentStep : 2.5;
    const curQ = Math.round(cur * 4);
    const fits = q.every(function (k, i) { return i === 0 || (k - q[0]) % curQ === 0; });
    if (fits) return null;                           // ขั้นปัจจุบันอธิบายน้ำหนักที่ใช้ได้อยู่แล้ว
    if (Math.abs(inferred - cur) < 0.001) return null;
    return inferred;
  }

  /* น้ำหนักที่เคยทำเสร็จของท่า+อุปกรณ์เดียวกัน (session ล่าสุดก่อน, สูงสุด n session) รวมเซตของ entry ปัจจุบันถ้าส่งมา */
  function weightsOf(workouts, entry, n, excludeWorkoutId) {
    const same = sessionsOf(workouts, entry, excludeWorkoutId).same.slice(0, n > 0 ? n : 6);
    const out = [];
    same.forEach(function (r) { r.sets.forEach(function (x) { out.push(x.weight); }); });
    workingCompleted(entry).forEach(function (x) { out.push(x.weight); });
    return out;
  }

  /* ไม่ก้าวหน้าติดกันกี่ครั้ง (ท่า+อุปกรณ์เดียวกัน, ไม่รวม session ที่ค้าง) — need ครั้งขึ้นไป = stalled */
  function stallStatus(workouts, entry, excludeWorkoutId, need) {
    const n = need > 0 ? need : 3;
    const same = sessionsOf(workouts, entry, excludeWorkoutId).same;
    let streak = 0;
    for (let i = 0; i + 1 < same.length; i++) {
      if (progressed(same[i].sets, same[i + 1].sets)) break;
      streak++;
    }
    return {
      streak: streak, sessions: same.length, stalled: streak >= n,
      text: streak >= n
        ? 'ไม่ก้าวหน้า ' + streak + ' ครั้งติดแล้ว (น้ำหนักต่ำสุดและ reps ไม่ขึ้น) ลองเช็กการนอน/ความเครียด ' +
          'พักเบาลดน้ำหนักราว 10% แล้วไต่ใหม่ หรือเปลี่ยนช่วง reps ของท่านี้'
        : ''
    };
  }

  const api = {
    workingCompleted: workingCompleted,
    volumeLoad: volumeLoad,
    findPrevious: findPrevious,
    suggestTarget: suggestTarget,
    sortNewestFirst: sortNewestFirst,
    sameBasis: sameBasis,
    analyzeSets: analyzeSets,
    progressed: progressed,
    weakest: weakest,
    verdict: verdict,
    inferStep: inferStep,
    weightsOf: weightsOf,
    stallStatus: stallStatus,
    TIP: TIP
  };
  global.GymProgression = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
