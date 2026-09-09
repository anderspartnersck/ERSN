/* ER$N sound layer — maps game events to the music/*.mp3 clips. Presentation only.
   Audio is gesture-gated by the browser; the boot button counts as the unlock. Lazy-loaded,
   clones nodes so overlapping plays work, and swallows autoplay rejections (clean console). */
(function (global) {
  'use strict';
  const DIR = 'music/';
  const FILE = {
    roll:'DIE ROLL', move:'MOVE PAWN', door:'MARKET DOOR', marketLoop:'market loop',
    drawSEC:'SEC KNOCK', drawMarket:'MARKET CARD', drawAdvMarket:'ADVANCED MARKET',
    playAsset:'ASSET PLAYED TO LINEUP', playAdvAsset:'EXPANSION ANDERS ASSET PLAY TO LINEUP',
    lounge:'ENTER THE LOUNGE', loungeWin:'THE EXECUTIVE LOUNGE',
    golden1:'GOLDEN STAIRCASE PT 1', golden2:'GOLDEN STAIRCASE PT 2', golden3:'GOLDEN STAIRCASE PT 3',
    burnout:'BURNOUT', shadow:'SHADOW SEC', secImmunity:'ANDERS SEC IMMUNITY',
    trustFail:'WHY ASK ROLL FAIL', select:'SELECT', makeSel:'MAKE SELECTION',
    move1:'SELECT - move', move2:'SELECT - move 2', sel3:'SELECT3', sel4:'SELECT4',
    bomb:'BOMB', killscreen:'KILLSCREEN', drop:'DROP',
  };
  // VARIATION SETS — several takes of the same one-shot. Cycling them stops a repeated action
  // (every move, every menu tap) from sounding like the identical sample fired over and over.
  // Round-robin rather than random, so a run of moves never repeats a take back-to-back.
  // These clips were level-matched in the LEVEL pass below and then never wired up.
  const VARIANTS = { move: ['move', 'move1', 'move2'], select: ['select', 'sel3', 'sel4'] };
  const vturn = {};
  function variantOf(key) {
    const set = VARIANTS[key]; if (!set) return key;
    return set[(vturn[key] = ((vturn[key] || 0) + 1) % set.length)];
  }
  const cache = {};
  let muted = false, vol = 0.6;
  // ---- levels pass (peak/RMS measured per clip via afconvert+numpy; see scripts/measure_levels.py) ----
  // Per-clip trims that pull the HOT clips down to a ~-13 dBFS reference so they sit together and the
  // per-call emphasis (the v arg) reads consistently. Clips already at/under reference are 1 (omitted);
  // volume can only attenuate, so quiet clips can't be lifted here — they're already near their ceiling.
  const LEVEL = {
    shadow: 0.46,   // SHADOW SEC was the hottest clip (-6.2 dB RMS) — biggest trim
    move2: 0.59, door: 0.64, burnout: 0.71, roll: 0.72, sel3: 0.72,
    drawSEC: 0.82, makeSel: 0.84, sel4: 0.84, trustFail: 0.86,
    drawMarket: 0.93, move: 0.94,
  };
  function base(key) {
    const f = FILE[key]; if (!f) return null;
    if (!cache[key]) { const a = new Audio(DIR + encodeURIComponent(f) + '.mp3'); a.preload = 'auto'; cache[key] = a; }
    return cache[key];
  }
  // Looping background music bed — its own quiet volume so SFX one-shots read over it,
  // but it honors the same global mute. Started on the boot gesture (autoplay-safe).
  const MUSIC = {
    bedKey: null, node: null, mvol: 0.3,
    start(key) {
      if (this.bedKey === key && this.node && !this.node.paused) return;
      const f = FILE[key]; if (!f) return;
      this.stop();
      try {
        const a = new Audio(DIR + encodeURIComponent(f) + '.mp3');
        a.loop = true; a.preload = 'auto'; a.volume = muted ? 0 : this.mvol;
        this.node = a; this.bedKey = key;
        const p = a.play(); if (p && p.catch) p.catch(() => {});
      } catch (e) {}
    },
    stop() { if (this._ramp) { clearInterval(this._ramp); this._ramp = null; } if (this.node) { try { this.node.pause(); } catch (e) {} this.node = null; this.bedKey = null; } },
    setVol(x) { this.mvol = Math.max(0, Math.min(1, x)); this.apply(); },
    apply() { if (this._ramp) { clearInterval(this._ramp); this._ramp = null; } if (this.node) this.node.volume = muted ? 0 : this.mvol; },
    // sidechain duck — dip the bed under a big one-shot, then ramp it back up over ms (the "peak" pass)
    duck(to, ms) {
      if (!this.node || muted) return;
      if (this._ramp) { clearInterval(this._ramp); this._ramp = null; }
      const tgt = this.mvol, from = Math.max(0, Math.min(this.mvol, to == null ? this.mvol * 0.25 : to));
      try { this.node.volume = from; } catch (e) {}
      const dur = ms == null ? 1500 : ms, t0 = (global.performance && performance.now) ? performance.now() : 0;
      this._ramp = setInterval(() => {
        if (!this.node || muted) { clearInterval(this._ramp); this._ramp = null; return; }
        const now = (global.performance && performance.now) ? performance.now() : t0 + dur;
        const k = Math.min(1, (now - t0) / dur);
        try { this.node.volume = from + (tgt - from) * k; } catch (e) {}
        if (k >= 1) { clearInterval(this._ramp); this._ramp = null; }
      }, 45);
    },
  };
  let actx = null;
  const SFX = {
    // synthesized falling-bomb HIGH WHISTLE (descending sine sweep) — no asset, gesture-gated
    whistle(ms) {
      if (muted) return;
      try {
        actx = actx || new (global.AudioContext || global.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        const t = actx.currentTime, dur = (ms || 700) / 1000;
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(2200, t); o.frequency.exponentialRampToValueAtTime(420, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.03);
      } catch (e) {}
    },
    play(key, v) {
      if (muted) return;
      key = variantOf(key);            // round-robin the takes for keys that have them
      const b = base(key); if (!b) return;
      const lvl = (v == null ? vol : v) * (LEVEL[key] || 1);
      try { const a = b.cloneNode(); a.volume = Math.max(0, Math.min(1, lvl)); const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    },
    music: MUSIC,
    get muted() { return muted; },
    set muted(m) { muted = m; MUSIC.apply(); },
    toggle() { muted = !muted; MUSIC.apply(); return muted; },
    setVol(x) { vol = Math.max(0, Math.min(1, x)); },
    unlock() { /* called on first gesture; a play() right after a click is enough to unlock */ },
  };
  global.SFX = SFX;
})(window);
