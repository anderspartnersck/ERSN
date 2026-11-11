/* ER$N — the PAUSE MENU (UI-AUDIT 1110; house law: resume / how to play / settings / quit to title).
   Front-end only. It drives the page through what index.html already wires: #autoBtn (AUTO/PAUSE), #speed, #muteBtn,
   #newBtn, the RULES sheet (#infoBtn → #infoPanel), SFX.music.setVol / SFX.setVol. The engine is not touched, so the
   golden master (scripts/parity.mjs) cannot move. Off with #nomenu in the URL.
   Keys: ESC or P on the trading floor = pause (when no sheet / card / prompt is open — then Esc still closes that first,
   as before) · ENTER on the title = ENTER THE TOWER · ESC on setup / game over = back to the title. */
(function () {
  'use strict';
  if (location.hash.indexOf('nomenu') >= 0) return;
  const $ = s => document.querySelector(s);
  const scr = id => { const s = document.getElementById(id); return !!(s && s.classList.contains('on')); };
  const isOn = id => scr(id);
  const overlayOpen = () => ['prompt', 'sheet', 'flip', 'reveal', 'infoPanel'].some(isOn);
  const autoRunning = () => /PAUSE/.test(($('#autoBtn') || {}).textContent || '');
  const toTitle = () => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 'boot'));

  const css = document.createElement('style');
  css.textContent = `
  #pmenu{position:fixed;inset:0;z-index:9500;display:none;align-items:center;justify-content:center;background:rgba(4,6,11,.8)}
  #pmenu.on{display:flex}
  #pmenu .box{background:linear-gradient(180deg,var(--slate2),var(--slate));border:2px solid var(--gold);border-radius:18px;padding:22px 28px;
    width:min(420px,calc(100% - 32px));max-height:86vh;overflow:auto;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.6)}
  #pmenu h2{margin:0 0 2px;font-family:Georgia,serif;color:var(--gold-lite);letter-spacing:.16em;font-size:24px}
  #pmenu .ss{color:#9aa3b5;font-size:12px;letter-spacing:.08em;margin-bottom:14px}
  #pmenu .col{display:flex;flex-direction:column;gap:12px}
  #pmenu .col button:focus-visible{outline:3px solid var(--cream);outline-offset:3px}
  #pmenu label{display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--ink);border:1px solid #3a4357;border-radius:12px;
    padding:9px 14px;font-size:14px;color:var(--cream);text-align:left}
  #pmenu input[type=range]{flex:1;max-width:170px}
  #pmGear{position:fixed;left:12px;top:12px;z-index:40;display:none}
  #game.on ~ #pmGear{display:block}
  body.attract #pmGear{display:none !important}
  #atBanner{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9400;display:none;padding:10px 22px;border:2px solid var(--gold);
    border-radius:999px;background:rgba(15,18,26,.88);color:var(--cream);font-weight:800;letter-spacing:.14em;font-size:14px;white-space:nowrap}
  #atBanner b{color:var(--gold-lite)} #atBanner span{animation:atb 1.1s steps(2) infinite} @keyframes atb{50%{opacity:.25}}
  body.attract #atBanner{display:block}`;
  document.head.appendChild(css);

  const m = document.createElement('div'); m.id = 'pmenu'; m.innerHTML = '<div class="box"></div>'; document.body.appendChild(m);
  const box = m.querySelector('.box');
  const gear = document.createElement('button'); gear.id = 'pmGear'; gear.className = 'candy sm'; gear.textContent = '☰ MENU';
  gear.title = 'ESC'; gear.onclick = () => open();
  document.getElementById('over').after(gear);
  let wasAuto = false, page = null, sfxVol = 0.6;
  // Q259: launched from COLEMAN'S KEEP (?from=keep) = a QUIT TO ARCADE row that goes back there.
  const FROM_KEEP = new URLSearchParams(location.search).get('from') === 'keep';
  const KEEP_URL = "../../COLEMAN'S KEEP.html";

  // ---- ATTRACT (Q247): idle on the title for ATTRACT_S seconds = a bots-only demo game (window.ERSN_ATTRACT, sound off).
  // Any key / click / pad button = back to the title. It never becomes a real game; game over in the demo = back to the title.
  const ATTRACT_S = +(new URLSearchParams(location.search).get('attract') ?? 30) || 0;   // ?attract=0 = off
  const AT = () => window.ERSN_ATTRACT;
  const banner = document.createElement('div'); banner.id = 'atBanner';
  banner.innerHTML = '<b>ER$N</b> · THE BOTS ARE PLAYING · <span>PRESS ANY KEY</span>';
  document.body.appendChild(banner);
  let idle = 0;
  function attractStart() { if (!AT() || AT().on || location.hash.length > 1) return; AT().start(); document.body.classList.add('attract'); }
  function attractStop() { if (!AT() || !AT().on) return; AT().stop(); document.body.classList.remove('attract'); idle = 0; }
  setInterval(() => {
    if (AT() && AT().on) { if (isOn('over')) attractStop(); return; }
    if (isOn('boot') && !m.classList.contains('on')) { idle += 1; if (ATTRACT_S > 0 && idle >= ATTRACT_S) attractStart(); } else idle = 0;
  }, 1000);
  const wake = e => { idle = 0; if (AT() && AT().on) { e.preventDefault(); e.stopImmediatePropagation(); attractStop(); } };
  window.addEventListener('pointerdown', wake, true);
  (function padWake() { try { const ps = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of ps || []) if (g && g.buttons.some(b => b.pressed)) { idle = 0; if (AT() && AT().on) attractStop(); } } catch (_) {} requestAnimationFrame(padWake); })();

  function render(html, wire) { box.innerHTML = html; wire(); const b = box.querySelector('.col button'); if (b) b.focus(); }
  function main() {
    page = 'main';
    render(`<h2>PAUSED</h2><div class="ss">THE TAPE STOPS · NOBODY MOVES</div><div class="col">
      <button class="candy" data-a="resume">RESUME ▸</button>
      <button class="candy alt" data-a="how">📋 HOW TO PLAY</button>
      <button class="candy alt" data-a="set">SETTINGS</button>
      <button class="candy alt" data-a="new">NEW GAME (setup)</button>
      <button class="candy alt" data-a="title">QUIT TO TITLE</button>${FROM_KEEP ? '<button class="candy alt" data-a="keep">QUIT TO ARCADE</button>' : ''}</div>`, () => {
      const kb = box.querySelector('[data-a=keep]'); if (kb) kb.onclick = () => confirmThen('QUIT TO ARCADE?', 'This game is dropped; back to COLEMAN\'S KEEP.', () => { location.href = KEEP_URL; });
      box.querySelector('[data-a=resume]').onclick = resume;
      box.querySelector('[data-a=how]').onclick = () => $('#infoBtn') && $('#infoBtn').click();
      box.querySelector('[data-a=set]').onclick = settings;
      box.querySelector('[data-a=new]').onclick = () => confirmThen('NEW GAME?', 'This game is dropped; back to the setup.', () => { close(); $('#newBtn').click(); });
      box.querySelector('[data-a=title]').onclick = () => confirmThen('QUIT TO TITLE?', 'This game is dropped.', () => { close(); toTitle(); });
    });
  }
  function confirmThen(t, sub, yes) {
    page = 'confirm';
    render(`<h2>${t}</h2><div class="ss">${sub}</div><div class="col"><button class="candy alt" data-a="no">NO, BACK</button><button class="candy" data-a="yes">YES</button></div>`,
      () => { box.querySelector('[data-a=no]').onclick = main; box.querySelector('[data-a=yes]').onclick = yes; });
  }
  function settings() {
    page = 'settings';
    const sp = $('#speed'), S = window.SFX, mv = S && S.music ? S.music.mvol : 0.3, muted = !!(S && S.muted);
    render(`<h2>SETTINGS</h2><div class="ss">for this visit only · nothing is saved</div><div class="col">
      <label>Turn speed <span style="font-size:11px">SLOW</span><input type="range" id="pmSpd" min="${sp.min}" max="${sp.max}" value="${sp.value}"><span style="font-size:11px">FAST</span></label>
      <label>Music <input type="range" id="pmMus" min="0" max="100" value="${Math.round(mv * 100)}"></label>
      <label>Sound effects <input type="range" id="pmSfx" min="0" max="100" value="${Math.round(sfxVol * 100)}"></label>
      <label>All sound <span><input type="checkbox" id="pmMute"${muted ? '' : ' checked'}> on</span></label>
      <button class="candy" data-a="back">BACK</button></div>`, () => {
      $('#pmSpd').oninput = () => { sp.value = $('#pmSpd').value; sp.dispatchEvent(new Event('input')); sp.dispatchEvent(new Event('change')); };
      $('#pmMus').oninput = () => { if (S && S.music) S.music.setVol($('#pmMus').value / 100); };
      $('#pmSfx').oninput = () => { sfxVol = $('#pmSfx').value / 100; if (S) S.setVol(sfxVol); };
      $('#pmMute').onchange = () => { if (S && !!S.muted === $('#pmMute').checked) $('#muteBtn').click(); };
      box.querySelector('[data-a=back]').onclick = main;
    });
  }
  function open() { if (m.classList.contains('on') || !isOn('game')) return; wasAuto = autoRunning(); if (wasAuto) $('#autoBtn').click(); m.classList.add('on'); main(); }
  function close() { m.classList.remove('on'); page = null; }
  function resume() { close(); if (wasAuto && !autoRunning()) $('#autoBtn').click(); }

  // capture phase: decide BEFORE the page's own Esc handler closes a sheet/prompt (that Esc keeps doing just that)
  document.addEventListener('keydown', e => {
    const k = e.key;
    idle = 0;
    if (AT() && AT().on) { e.preventDefault(); e.stopImmediatePropagation(); attractStop(); return; }
    if (m.classList.contains('on')) {
      if (isOn('infoPanel')) return;                        // the RULES sheet is over the menu: its Esc closes it
      if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); e.stopImmediatePropagation(); page === 'main' ? resume() : main(); }
      else if (k === 'ArrowDown' || k === 'ArrowUp') {
        const bs = [...box.querySelectorAll('.col button')], i = bs.indexOf(document.activeElement);
        bs[(i + (k === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus(); e.preventDefault();
      }
      return;
    }
    if (/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || '') && k !== 'Escape') return;
    if (isOn('game')) {
      if ((k === 'Escape' || k === 'p' || k === 'P') && !overlayOpen()) { e.preventDefault(); open(); }
      return;
    }
    if (k === 'Enter' && isOn('boot')) { e.preventDefault(); $('#bootBtn').click(); }
    else if (k === 'Escape' && (isOn('setup') || isOn('over'))) toTitle();
  }, true);
  window.ERSN_MENU = { open, close, resume };
})();
