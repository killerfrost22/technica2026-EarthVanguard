/* STUB: replaced by progress
   19_progress.js provides: SL.upgrades = [], SL.skillTree = {branches: []}, SL.progress = { playerStats(save, index),
   applyMissionResult(result) -> summary, missionUnlocked(id), mainMissions(), nextMission(), sideUnlocked(id),
   buyUpgrade(id), buySkill(id), equipSkill(i, id) } and SL.skills = { activate(p), update(p, dt), get(id) } as no-ops.
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
    /** A mission is open once every mission in its def.unlock list has been cleared. */
    missionUnlocked(id) {
      const def = SL.missions.has(id) && SL.missions.get(id);
      if (!def) return false;
      return (def.unlock || []).every((req) => !!SL.save.mission(req).done);
    },
    /** The main missions players can pick, in campaign order (no dev or side missions). */
    mainMissions() {
      return SL.missions.ids().filter((id) => !SL.missions.get(id).dev && SL.missions.get(id).kind !== 'side')
        .sort((a, b) => (SL.missions.get(a).order || 0) - (SL.missions.get(b).order || 0));
    },
    /** Where Start goes: the first open main mission not cleared yet, or the first one once all are cleared. */
    nextMission() {
      const ids = SL.progress.mainMissions();
      return ids.find((id) => SL.progress.missionUnlocked(id) && !SL.save.mission(id).done) || ids[0];
    },
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
