/* 27_devtools.js (devtools)
   Provides: SL.devtools = { open(), close(), toggle() } and the developer panel: a small floating panel for testing
   the story without playing all of it.
   Open it with the ` (backquote) key, or add ?dev=1 to the URL (that also shows a DEV button, for touch screens).
   - Jump to: Prologue, Echo, After Echo, Mission 1, After Mission 1 (SL.cutscenes.jump: rewrites the story flags as if
     everything before that point had been played, then goes there).
   - Skip now: the cutscene, Echo, Puff's memory, to the boss, or win the mission. Each button is enabled only when
     that thing is running.
   - Skip minigames (remembered in this browser): the story passes through Echo and Puff's memory without playing them.
   - God mode, and Reset story (every cutscene unseen, Echo not escaped, Puff's memory and trust cleared).
   Works over cutscenes (the panel sits above them and the key is caught first). */
(function (SL) {
  'use strict';

  const DBG = SL.debug;
  const STORE = 'ev.devtools';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; }
  }
  function save(o) {
    try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) { /* storage blocked: keep it for this visit */ }
  }
  const prefs = load();
  DBG.skipMinigames = !!prefs.skipMinigames;

  let root = null, timer = 0, devBtn = null;
  const buttons = [];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function section(title) {
    const s = el('div', 'ev-dev__sec');
    s.appendChild(el('div', 'ev-dev__label', title));
    const row = el('div', 'ev-dev__row');
    s.appendChild(row);
    root.appendChild(s);
    return row;
  }
  /** A button that runs fn; enabled() (optional) is re-checked while the panel is open. */
  function button(row, text, fn, enabled) {
    const b = el('button', 'ev-dev__btn', text);
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.disabled) return;
      try { fn(); } catch (err) { console.error('[SL.devtools] ' + text + ' failed:', err); }
      refresh();
    });
    row.appendChild(b);
    buttons.push({ b, enabled });
    return b;
  }
  function toggle(row, text, get, set) {
    const lab = el('label', 'ev-dev__toggle');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = get();
    box.addEventListener('change', () => set(box.checked));
    lab.append(box, document.createTextNode(' ' + text));
    row.appendChild(lab);
  }

  const inMission = () => SL.game.state === 'mission' && !!SL.game.session && !SL.game.session.result;
  const cutscenePlaying = () => !!(window.Cutscene && window.Cutscene.isPlaying());

  function build() {
    root = el('div', 'ev-dev');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Developer panel');
    const head = el('div', 'ev-dev__head');
    head.appendChild(el('strong', '', 'Developer'));
    head.appendChild(el('span', 'ev-dev__hint', '` to close'));
    root.appendChild(head);

    const jump = section('Jump to');
    for (const st of (SL.cutscenes && SL.cutscenes.stages) || []) button(jump, st.label, () => SL.cutscenes.jump(st.id));

    const skip = section('Skip now');
    button(skip, 'Skip cutscene', () => window.Cutscene.skip(), cutscenePlaying);
    button(skip, 'Skip Echo', () => SL.echo.skip(), () => !cutscenePlaying() && SL.ui.current === 'echo');
    button(skip, 'Skip Puff\'s memory', () => SL.puffStory.skipMemory(),
      () => !!(SL.puffStory && SL.puffStory.state === 'inside' && !SL.puffStory.memoryDone));
    button(skip, 'Skip to boss', () => SL.game.skipToBoss(), () => inMission() && !SL.game.session.bossSeen);
    button(skip, 'Win mission', () => {
      if (SL.puffStory && SL.puffStory.skipMemory) SL.puffStory.skipMemory();
      SL.game.completeMission();
    }, inMission);

    const opts = section('Options');
    toggle(opts, 'Skip minigames', () => DBG.skipMinigames, (v) => {
      DBG.skipMinigames = v;
      prefs.skipMinigames = v;
      save(prefs);
    });
    toggle(opts, 'God mode', () => !!DBG.god, (v) => { DBG.god = v; });

    const reset = section('Save');
    button(reset, 'Reset story', () => {
      SL.cutscenes.resetStory();
      if (window.Cutscene && window.Cutscene.isPlaying()) window.Cutscene.skip();
      SL.game.toMenu('title');
    });

    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(root);
  }

  function refresh() {
    for (const { b, enabled } of buttons) {
      let on = true;
      try { on = !enabled || !!enabled(); } catch (e) { on = false; }
      b.disabled = !on;
    }
  }

  function open() {
    if (!root) build();
    root.hidden = false;
    refresh();
    clearInterval(timer);
    timer = setInterval(refresh, 300);
  }
  function close() {
    if (root) root.hidden = true;
    clearInterval(timer);
  }
  function toggleOpen() { if (root && !root.hidden) close(); else open(); }

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' || e.repeat) return;
    e.preventDefault();
    e.stopPropagation();
    toggleOpen();
  }, true);

  SL.onBoot(() => {
    const P = DBG.params || {};
    if (P.dev === '1' || P.dev === 'true') {
      devBtn = el('button', 'ev-dev-fab', 'DEV');
      devBtn.type = 'button';
      devBtn.addEventListener('click', toggleOpen);
      devBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      document.body.appendChild(devBtn);
      open();
    }
  });

  SL.devtools = { open, close, toggle: toggleOpen };
})(window.SL);
