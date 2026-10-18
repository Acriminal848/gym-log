/* progression.js — การคำนวณล้วน ๆ (ไม่แตะ DOM ไม่แตะฐานข้อมูล)
 *
 * ช่วงที่ 1: มีเฉพาะการหา "ผลครั้งก่อน" ของท่าเดียวกัน และเป้าหมายตั้งต้นแบบง่าย
 * (ใช้ชุดแรกของครั้งก่อน) — ยังไม่มีกติกา double progression
 * ช่วงที่ 3 จะเพิ่มกติกา progression ในไฟล์นี้
 *
 * หมายเหตุ: ยังไม่ได้ตรวจโค้ดหรือ license ของโปรเจกต์ FitnessTrack
 * ไม่มีโค้ดจากโปรเจกต์นั้นอยู่ในไฟล์นี้
 */
(function (global) {
  'use strict';

  function norm(s) { return String(s || '').trim().toLowerCase(); }

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

  /* หาผลครั้งก่อนของ "ท่าเดียวกัน" (ตาม exerciseId เท่านั้น ไม่ข้ามไปท่าอื่น)
   * - ใช้เฉพาะ workout ที่จบแล้ว และมีเซต working ที่ทำเสร็จอย่างน้อย 1 เซต
   * - ถ้าอุปกรณ์/วิธีนับน้ำหนักตรงกัน → comparable: true
   * - ถ้าเคยเล่นแต่ใช้อุปกรณ์/วิธีนับต่างกัน → comparable: false (เทียบน้ำหนักไม่ได้)
   * - ไม่เคยเล่น → null
   */
  function findPrevious(workouts, entry, excludeWorkoutId) {
    const sorted = sortNewestFirst(workouts);
    let mismatch = null;
    for (let i = 0; i < sorted.length; i++) {
      const w = sorted[i];
      if (w.status !== 'finished' || w.id === excludeWorkoutId) continue;
      for (let j = w.entries.length - 1; j >= 0; j--) {
        const e = w.entries[j];
        if (e.exerciseId !== entry.exerciseId) continue;
        if (!workingCompleted(e).length) continue;
        if (sameBasis(e, entry)) return { workout: w, entry: e, comparable: true };
        if (!mismatch) mismatch = { workout: w, entry: e, comparable: false };
      }
    }
    return mismatch;
  }

  /* เป้าหมายตั้งต้นของช่วงที่ 1: ใช้เซต working เซตแรกของครั้งก่อน
   * เป็น "ค่าที่เสนอ" เท่านั้น ไม่ใช่การแนะนำเพิ่มน้ำหนัก และไม่นับเป็นผลงาน */
  function targetForToday(prev) {
    if (!prev) return null;
    if (!prev.comparable) {
      return {
        weight: null, reps: null,
        reason: 'ครั้งก่อนใช้อุปกรณ์หรือวิธีนับน้ำหนักต่างกัน เทียบกันไม่ได้ — กรอกน้ำหนักเอง'
      };
    }
    const first = workingCompleted(prev.entry)[0];
    return {
      weight: first.weight, reps: first.reps,
      reason: 'ตั้งต้นจากเซตแรกของครั้งก่อน (ยังไม่ใช่คำแนะนำเพิ่มน้ำหนัก)'
    };
  }

  const api = {
    workingCompleted: workingCompleted,
    volumeLoad: volumeLoad,
    findPrevious: findPrevious,
    targetForToday: targetForToday,
    sortNewestFirst: sortNewestFirst
  };
  global.GymProgression = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
