/* STUB: replaced by progress
   19_progress.js provides: SL.upgrades = [], SL.skillTree = {branches: []}, SL.progress = { playerStats(save, index),
   applyMissionResult(result) -> summary, missionUnlocked(id), sideUnlocked(id), buyUpgrade(id), buySkill(id),
   equipSkill(i, id) } and SL.skills = { activate(p), update(p, dt), get(id) } as no-ops.
   playerStats returns the core defaults; applyMissionResult banks result.creditsKept (21_game.js already
   recorded the mission's done / best / rank / plays and the lifetime stats in the save). */
(function (SL) {
  'use strict';

  SL.upgrades = SL.upgrades || [];
  SL.skillTree = SL.skillTree || { branches: [] };

  SL.progress = {
    playerStats() { return SL.player.defaultStats(); },
    applyMissionResult(result) {
      const save = SL.save.data;
      const credits = Math.max(0, Math.round(result.creditsKept || 0));
      save.credits += credits;
      return { credits, bonus: 0, total: save.credits, sp: 0, unlocked: [], skill: null };
    },
    missionUnlocked(id) { return !!SL.missions.has(id); },
    sideUnlocked(id) { return !!(SL.save.data.flags && SL.save.data.flags['unlock_' + id]); },
    buyUpgrade() { return false; },
    buySkill() { return false; },
    equipSkill(i, id) {
      const eq = SL.save.data.skills.equipped;
      if (i !== 0 && i !== 1) return false;
      eq[i] = id || null;
      SL.save.commit();
      return true;
    },
  };

  SL.skills = {
    activate() { return false; },
    update() {},
    get() { return null; },
  };
})(window.SL = window.SL || {});
