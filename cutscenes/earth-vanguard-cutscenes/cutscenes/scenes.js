/*
 * Earth Vanguard — cutscene script
 * ---------------------------------
 * Edit freely. Each cutscene is a list of SHOTS; each shot has an animated
 * background, an optional illustration (art.js), and lines the player clicks through.
 *
 * SHOT fields
 *   bg     'stars' | 'void' | 'sonar' | 'facility' | 'burn' | 'ocean' | 'polluted' | 'collapse' | 'black'
 *   art    full-screen illustration from art.js:
 *          overseers oppressed standup taken facility underground surface escape recruit
 *          training puffmeet blackhole reef polluted trialeye destroyed window distress return liberation
 *   cam    { from:[scale, x%, y%], to:[scale, x%, y%], dur:ms }  slow camera push/pan on the art
 *   title / sub   big title card
 *   flash / shake  one-shot effects       hold  ms to wait when a shot has no lines
 *   music / sfx    names passed to your onMusic / onSfx callbacks
 *   when   (state) => bool   only play the shot if true
 *
 * LINE fields
 *   text, who (speaker label), style ('terminal' | 'quiet'), sfx, auto (ms auto-advance)
 *   when   (state) => bool
 *   choices [{ text, value, effect(state), reply:[lines] }], id (key in result.choices)
 */

// Placeholder names — change in one place.
const N = {
  HERO: 'Blue Arrow',              // storyline/notes.md: the main character's name
  FRIEND: 'her best friend',
  ENEMY: 'the Overseers',          // the bored advanced civilization (lore leaves it unnamed)
  ORG: 'Earth Vanguard',
  SUBJECT: 'SUBJECT 7',            // the number the Echo minigame uses (Cell 7)
  COMMANDER: 'Commander Kade',     // Commander Maren Kade (ANVIL), who runs Earth Vanguard's carrier in the game
};

window.CUTSCENES = {

  /* ===== PROLOGUE — plays before the Echo minigame ===== */
  intro: [
    { bg: 'stars', art: 'overseers', music: 'theme_dark', cam: { from: [1.0, 0, 0], to: [1.08, 0, 2] }, lines: [
      { text: 'In a vast universe, one civilization rose so far above the rest that nothing could ever challenge it.' },
      { text: 'With unlimited power and nothing left to want, its people grew bored.' },
      { text: 'So they made a game out of everyone else.' },
    ]},
    { bg: 'stars', art: 'overseers', cam: { from: [1.15, 0, 10], to: [1.3, 0, 14] }, lines: [
      { text: 'They staged trials. Rigged wars. Promised salvation to worlds that played along — and harvested the ones that failed.' },
      { text: `We call them ${N.ENEMY}. To them, a dying planet is entertainment.`, style: 'quiet' },
    ]},
    { bg: 'black', art: 'oppressed', cam: { from: [1.0, 0, 0], to: [1.1, 3, 1] },
      lines: [
        { text: `Her world was one of their pieces. Its people lived under the boots of ${N.ENEMY}' enforcers.` },
        { text: `She kept her head down, like everyone else. ${N.FRIEND[0].toUpperCase() + N.FRIEND.slice(1)} stayed close beside her.` },
      ]},
    { bg: 'black', art: 'standup', cam: { from: [1.12, 4, 0], to: [1.02, -1, 0] },
      lines: [
        { text: 'Until the day two guards cornered an old woman in the street.' },
        { who: '???', text: 'Leave her alone.' },
        { text: 'Nobody had ever said that out loud before.', style: 'quiet' },
      ]},
    { bg: 'burn', art: 'taken', shake: true, sfx: 'fire', cam: { from: [1.18, -6, 2], to: [1.04, 3, 0], dur: 14000 },
      lines: [
        { text: 'The regime answered that night.' },
        { text: 'They burned her home to the ground. They dragged her best friend away.' },
        { text: 'And they took her, too.' },
      ]},
    { bg: 'black', art: 'facility', sfx: 'alarm_low', cam: { from: [1.0, 0, 0], to: [1.14, 0, 3], dur: 14000 }, lines: [
      { style: 'terminal', text: `> ${N.SUBJECT} // EXPERIMENTAL WING C\n> STATUS: CONTAINED`, speed: 18 },
      { text: 'No windows. No names. Test after test, in the dark, for years.' },
      { text: 'She stopped counting the days. She never stopped listening.', style: 'quiet' },
    ]},
    { bg: 'black', art: 'underground', flash: true, sfx: 'power_down', cam: { from: [1.0, 0, 0], to: [1.12, -3, 0], dur: 14000 },
      lines: [
        { style: 'terminal', text: '> POWER FAILURE — CONTAINMENT OFFLINE', speed: 18 },
        { text: 'The lights died. The doors slid open.' },
        { text: 'She couldn\'t see a thing. But every sound came back to her — a wall, a ledge, a way out.' },
      ]},
    { bg: 'sonar', title: 'ECHO', sub: 'Follow the sound. Find the way home.', hold: 3500 },
  ],

  /* ===== after Echo is cleared ===== */
  echo_complete: [
    { bg: 'stars', art: 'surface', cam: { from: [1.15, 0, 4], to: [1.0, 0, 0] }, lines: [
      { text: 'Like a lost fish finding its school, she followed the echoes all the way to the surface.' },
      { text: 'For the first time in years: open air.', style: 'quiet' },
    ]},
    { bg: 'stars', art: 'escape', sfx: 'engine', cam: { from: [1.0, 0, 0], to: [1.12, -4, 2] },
      lines: [
        { text: 'She stole a ship and ran — past her burning home, out into the stars.' },
        { text: `She took refuge on a distant world, far from ${N.ENEMY}' reach.` },
      ]},
    { bg: 'stars', art: 'recruit', lines: [
      { text: 'Someone had been listening for her, too.' },
      { who: N.COMMANDER, text: `We protect the worlds ${N.ENEMY} play with. You already know what they do.` },
      { who: N.COMMANDER, text: 'Want to make it stop?' },
    ]},
    { bg: 'black', art: 'training', cam: { from: [1.1, 3, 0], to: [1.0, -1, 0] },
      lines: [
        { text: 'In hiding, she trained. Every day. Every target.' },
        { text: `The escaped experiment became a pilot. Call sign: ${N.HERO}.` },
      ]},
    { bg: 'stars', title: N.ORG.toUpperCase(), sub: 'Two survivors. One purpose.', music: 'theme_hope', hold: 3500 },
  ],

  /* ===== before Mission 1 — meeting Puff =====
     His past is not told here: in Mission 1 a black hole pulls Puff in and the player relives his first trial
     (src/25_puffstory.js), then puff_complete reveals what happened to his planet. */
  puff_intro: [
    { bg: 'stars', art: 'puffmeet', lines: [
      { who: N.COMMANDER, text: `${N.HERO}, meet your new wingmate.` },
      { who: 'Puff', text: '…Hi.' },
      { text: 'A pufferfish from an ocean world. He flies like he has nothing left to lose. He never talks about home.', style: 'quiet' },
      { id: 'puff_first', who: N.HERO, text: '(What do you say?)', choices: [
        { text: '"Where are you from?"', value: 'pushy',
          reply: [{ who: 'Puff', text: 'Far away. …It doesn\'t exist anymore.' }] },
        { text: '"Glad to have you on my wing."', value: 'warm', effect: s => { s.trust = (s.trust || 0) + 1; },
          reply: [{ who: 'Puff', text: '…Yeah. Me too.' }] },
      ]},
    ]},
    { bg: 'stars', title: 'PUFF', sub: 'Mission 1 — First Light', hold: 3500 },
  ],

  /* ===== after Mission 1 is cleared ===== */
  puff_complete: [
    { bg: 'polluted', art: 'polluted', lines: [
      { who: 'Puff', text: 'I passed every trial. I did everything they asked.' },
    ]},
    { bg: 'stars', art: 'destroyed', flash: true, shake: true, sfx: 'explosion', lines: [
      { text: 'It didn\'t matter.' },
      { text: 'They destroyed his planet anyway.' },
    ]},
    { bg: 'stars', art: 'window', lines: [
      { text: 'Puff survived. His home, and everyone he fought for, did not.', style: 'quiet' },
      { who: 'Puff', text: 'They were never going to keep that promise. They never do.' },
      { who: 'Puff', text: 'Thanks for not pushing. Back when we met.', when: s => (s.trust || 0) >= 1 },
      { who: N.HERO, text: 'Then we make sure it never happens to anyone else.' },
      { text: 'Two survivors. The same enemy.', style: 'quiet' },
    ]},
  ],

  /* ===== LEVEL 2 intro — Vanguard (not played yet: the game has no Mission 2) ===== */
  vanguard_intro: [
    { bg: 'stars', art: 'distress', sfx: 'distress', lines: [
      { style: 'terminal', text: '> DISTRESS SIGNAL RECEIVED\n> ORIGIN: [her home system]', speed: 18 },
      { text: 'Coordinates she would know anywhere.' },
    ]},
    { bg: 'stars', art: 'return', music: 'theme_hope', cam: { from: [1.1, 3, 0], to: [1.0, -1, 0], dur: 14000 },
      lines: [
        { text: 'She decides to go back.' },
        { text: `To rescue ${N.FRIEND}. To set her planet free.` },
        { who: 'Puff', text: 'You sure about this?' },
        { who: N.HERO, text: 'They took everything from me once. Not again.' },
      ]},
    { bg: 'stars', title: 'VANGUARD', sub: 'Level 2 — Take back the sky', hold: 3500 },
  ],

  /* ===== after Level 2 (ending stub) ===== */
  vanguard_complete: [
    { bg: 'black', art: 'liberation', music: 'theme_hope', lines: [
      { text: 'The enforcers retreat. For the first time in years, her world sees an open sky.' },
      { text: `But ${N.ENEMY} are still watching.` },
      { text: `And now, so is ${N.ORG}.`, style: 'quiet' },
    ]},
    { bg: 'stars', title: 'TO BE CONTINUED', hold: 4000 },
  ],
};
