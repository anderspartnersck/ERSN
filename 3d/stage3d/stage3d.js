/* ER$N — HYSCORE GATEWAY EDITION · 3D STAGE (LAB, 2026-10-24). PURE PRESENTATION.
   The engine, rules and golden master are untouched: this file only listens to the screen changes the
   page already makes (show('boot'|'setup'|'game'|'over')), the start/boot buttons and endGame, and draws
   the 3D PIPELINE renders behind / over the existing UI.
     boot   : the atrium (attract_hall, ping-pong) -> ENTER THE TOWER = the atrium push + the 3D dynamite
     setup  : the RESERVED table with the Blender boxes on it (walk-up drift, ping-pong); START lifts the sign
     start  : JUICE wash (core) / dynamite (expansion), as today -> TAKE YOUR SEAT -> board-matched cut -> THE BOARD
     play   : the board-on-table still plate; the game's own board canvas is laid onto the painted board with
              ONE CSS matrix3d (refs/registration.json plate_homography); clicks go back through the inverse;
              pawns are the glossy Blender pawns (idle + 12-drawing hop) drawn at H(u,v), upright, depth-scaled
     end    : collapse = rise off the board -> hole-matched cut -> the crane into the $90M hole -> black;
              a Lounge win = the push up the golden staircases toward the tower, then the TRUST wash
   Toggle: ?stage=3d (or #stage3d) starts it on; the 3 key (or the badge) flips it live. */
(function (global) {
  'use strict';
  const qs = location.search + ' ' + location.hash;
  // THE 3D EDITION (Pages 3d.html, cut by tools/make_lab_page.py --pages): the art lives under STAGE3D_ROOT, the stage is ON
  // unless ?stage=2d, and the options are the shipped defaults (the lab's panel only with ?opts)
  const ROOT = global.STAGE3D_ROOT || '', EDITION = !!global.STAGE3D_EDITION, PANEL = !EDITION || /[?&#]opts\b/i.test(qs);
  const S3 = global.STAGE3D = {
    on: EDITION ? !/stage=2d/i.test(qs) : /stage=3d|stage3d/i.test(qs), edition: EDITION,
    ready: false, man: null, screen: 'intro', fallback: [], stats: { draws: 0, pawnDraws: 0 },
  };
  const CAP = /seed=\d+|at=\d+/.test(qs);
  /* ---- OPTIONS: every open Joe call is a toggle (the panel under the badge; ?fit=2x3&view=close&... or
     remembered per viewer). Defaults = what the first lab shipped, except FX (upright is the fix asked for). ---- */
  // 10/25 THE REAL BOARDS: BOARD = every board Joe painted, built as a physical object (blender/boards.py); 'auto' = the board
  // the rules give this game (CLASSIC = the print: the CORE board, core or expansion alike; BENCHMARK = the setup picker's board).
  // ART: built (the lit print/plaque) | original (Joe's art exactly, unlit, same footprint) | plaque (round 2: a PLATE inset, FIT applies)
  const BOARD_KEYS = ['core', 'gold', 'ruby', 'emerald', 'onyx', 'silver', 'eventhorizon', 'blueprint', 'distortion', 'distortion2', 'distortion3', 'juiceflux', 'juiceflows', 'trustcheck', 'feed'];
  const OPT_DEF = { board: ['auto'].concat(BOARD_KEYS), art: ['built', 'original', 'plaque'], tele: ['auto', 'on', 'off'], anim: ['on', 'off'],
    plate: ['gold', 'emerald', 'ruby', 'onyx', 'silver'], fit: ['inset', '2x3'], cam: ['table', 'close'],
    fx: ['upright', 'flat'], lounge: ['tower', 'stairs'], verdict: ['black', 'leaders'] };
  const OPT_LABEL = { board: 'BOARD', art: 'ART', tele: 'TELEPORTER', anim: 'STAIRS/DOOR FX', plate: 'PLATE (plaque art)', fit: 'BOARD FIT (plaque art)', cam: 'CAMERA', fx: 'CARDS/DIE/LIFT', lounge: 'LOUNGE WIN', verdict: 'VERDICT' };
  const OPT_HELP = { auto: 'the board the rules give this game', built: 'Joe\'s board as a real object, lit', original: 'Joe\'s art exactly, unlit', plaque: 'round 2: a plate inset on the painted board',
    on: 'on', off: 'off', inset: '2:3 plate inset in the square-solved board', '2x3': 'board re-solved as 2:3, plate fills it',
    table: 'the painting\'s own camera', close: 'raised + 1.5x lens: bigger spaces', upright: 'standing on the table', flat: 'drawn flat on the board (first lab)',
    tower: 'push over the hole to the tower', stairs: 'up the staircase to the EXECUTIVE LOUNGE sign', black: 'scoreboard over black', leaders: 'on the painted TOWER LEADERS board' };
  const opt = S3.opt = { board: 'auto', art: 'built', tele: 'auto', anim: 'on', plate: 'gold', fit: 'inset', cam: 'table', fx: 'upright', lounge: 'tower', verdict: 'black' };
  if (PANEL) try { Object.assign(opt, JSON.parse(localStorage.getItem('ersn3d.opts') || '{}')); } catch (e) {}
  if (PANEL) for (const k in OPT_DEF) { const m = qs.match(new RegExp('[?&#]' + k + '=([a-z0-9]+)', 'i')); if (m && OPT_DEF[k].includes(m[1].toLowerCase())) opt[k] = m[1].toLowerCase(); }
  for (const k in OPT_DEF) if (!OPT_DEF[k].includes(opt[k])) opt[k] = OPT_DEF[k][0];
  const plateName = () => { const L = global.__lab, b = L && L.S && L.S.board; return (b && /^plate-/.test(b)) ? b.slice(6) : opt.plate; };
  const plaque = () => opt.art === 'plaque';
  const camKey = () => (plaque() ? opt.fit : '2x3') + '_' + opt.cam;   // NB 'cam', not 'view': ?view=table is the page's own widescreen prototype
  // the board for THIS game: the option, or (auto) the rules' board - CLASSIC is the print (the CORE board, with or without
  // the expansion: the expansion box adds cards, not a board); BENCHMARK (digital) plays the board picked at setup
  const FILE2KEY = f => { const B = S3.man && S3.man.boards; if (!B) return null; for (const k in B) if (B[k].game_file === f) return k; return null; };
  const boardKey = () => { if (opt.board !== 'auto') return opt.board; const L = global.__lab, S = L && L.S;
    if (!S || S.edition === 'classic') return 'core'; return FILE2KEY(S.board) || 'core'; };
  S3.boardKey = boardKey;
  const curHold = () => { const H = S3.man && S3.man.holds; if (!H) return S3.man && S3.man.hold;
    return (!plaque() && H[camKey() + '_' + boardKey() + '_' + opt.art]) || H[(plaque() ? opt.fit : 'inset') + '_' + opt.cam + '_' + plateName()] || S3.man.hold; };
  const curPawns = () => (S3.man && S3.man.pawnsets && S3.man.pawnsets[camKey()]) || (S3.man && S3.man.pawns);
  const curDice = () => (S3.man && S3.man.dicesets && S3.man.dicesets[camKey()]) || null;
  const loungeSeq = () => (opt.lounge === 'stairs' && S3.man && S3.man.seqs.lounge_set) ? 'lounge_set' : 'lounge';
  S3.upright = () => S3.on && opt.fx === 'upright';
  const _nul = document.createElement('canvas'); _nul.width = _nul.height = 1; S3.nulctx = _nul.getContext('2d');            // deterministic capture: every transition lands on its last frame
  const $ = s => document.querySelector(s);
  const now = () => performance.now();
  const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  /* ---------------- art: per-screen preload (decoded before it is needed) + release ---------------- */
  const seqs = {};                                   // name -> {imgs:[], ready:Promise, ok:bool}
  const single = {};                                 // hold / pawns / dynamite atlases
  function loadImg(src) {
    return new Promise(res => { const i = new Image(); i.decoding = 'async'; i.onload = () => { (i.decode ? i.decode() : Promise.resolve()).then(() => res(i), () => res(i)); }; i.onerror = () => res(null); i.src = src; });
  }
  function want(name) {
    if (!S3.man) return Promise.resolve(false);
    if (seqs[name]) return seqs[name].ready;
    const m = S3.man.seqs[name]; const s = seqs[name] = { imgs: [], ok: false };
    s.ready = Promise.all(Array.from({ length: m.n }, (_, i) => loadImg(m.dir + String(i).padStart(4, '0') + '.webp')))
      .then(a => { s.imgs = a; s.ok = a.every(Boolean); if (!s.ok) S3.fallback.push(name); return s.ok; });
    return s.ready;
  }
  function release(name) { delete seqs[name]; }
  function wantSingle(src) { if (!src) return Promise.resolve(null); if (!single[src]) single[src] = loadImg(src).then(i => (single['img:' + src] = i)); return single[src]; }
  const imgOf = src => src && single['img:' + src];
  const wantPlay = () => Promise.all([wantSingle(curHold().src), wantSingle(curPawns().src), wantSingle((curDice() || {}).src)].concat(wantBoardFX()));
  const PRELOAD = {                                  // what each screen needs NEXT (loaded while it is up)
    intro: ['hall', 'push'], boot: ['hall', 'push', 'reserved'], setup: ['reserved', 'seat'],
    game: ['collapse', 'lounge'], over: ['reserved'],
  };
  const gameSeqs = () => ['collapse', loungeSeq()].concat(opt.verdict === 'leaders' ? ['leaders'] : []);
  const KEEP = { intro: ['hall', 'push'], boot: ['hall', 'push', 'reserved'], setup: ['reserved', 'seat', 'push'],
    game: ['seat', 'collapse', 'lounge', 'lounge_set', 'leaders'], over: ['collapse', 'lounge', 'lounge_set', 'leaders', 'reserved'] };
  function preloadFor(id) {
    if (!S3.man) return;
    // critical first (the play-view plate + pawns, the dynamite), then the sequences ONE AT A TIME in the order
    // the screen needs them, so a 100-frame preload never queues ahead of what is about to be drawn
    const crit = [];
    if (id === 'setup' || id === 'game') crit.push(wantPlay());
    if (id === 'boot' || id === 'setup') wantDyn();
    (id === 'game' ? gameSeqs() : (PRELOAD[id] || [])).reduce((p, n) => p.then(() => want(n)), Promise.all(crit));
    const keep = new Set(KEEP[id] || []); Object.keys(seqs).forEach(k => { if (!keep.has(k)) release(k); });
  }

  /* ---------------- the stage canvas (behind every screen) ---------------- */
  let cv, ctx, pcv, pctx, badge, raf = 0, dirty = true;
  let shot = null;                                   // {name, from, to, fps, mode, t0, onEnd, rectA, rectB, tween}
  let still = null;                                  // 'hold' | {name, i} | 'black'
  let fadeFrom = null;                               // {img, t0}: dissolve a sequence's last frame into the hold
  function setupDom() {
    cv = document.createElement('canvas'); cv.id = 's3stage'; document.body.insertBefore(cv, document.body.firstChild);
    ctx = cv.getContext('2d');
    badge = document.createElement('div'); badge.id = 's3badge'; if (EDITION) badge.className = 'ed'; document.body.appendChild(badge);   // the edition's badge sits bottom-left: top-left is the game's MENU button
    badge.onclick = () => S3.toggle();
    if (PANEL) { panel = document.createElement('div'); panel.id = 's3opts'; document.body.appendChild(panel); }
    paintBadge();
    addEventListener('resize', () => { dirty = true; });
    addEventListener('keydown', e => { if (e.key === '3' && !e.metaKey && !e.ctrlKey && !e.altKey) S3.toggle(); });
  }
  function paintBadge() {
    if (!badge) return;
    badge.innerHTML = EDITION ? (S3.on ? '<b>3D</b> <span>press 3 for 2D</span>' : '<b>2D</b> <span>press 3 for 3D</span>')
      : S3.on ? '<b>3D STAGE</b> · LAB <span>press 3 for today</span>' : '<b>TODAY</b> · 2D <span>press 3 for the 3D stage</span>';
    badge.classList.toggle('on', S3.on); paintPanel();
  }
  function fitStage() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.min(2400, Math.round(innerWidth * dpr)), h = Math.min(1600, Math.round(innerHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; dirty = true; }
    return dpr;
  }
  // image rects in CSS px of the viewport
  const ASPECT = 1.5;
  function coverRect() { const vw = innerWidth, vh = innerHeight; let w = vw, h = vw / ASPECT; if (h < vh) { h = vh; w = vh * ASPECT; } return { x: (vw - w) / 2, y: (vh - h) / 2, w, h }; }
  function paneRect() { const bw = $('#boardwrap'); const r = bw && bw.getBoundingClientRect(); return r && r.width > 10 ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: innerWidth, h: innerHeight }; }
  // THE PLAY VIEW: the board (black + gold border) framed big in the board pane, image still covering the pane
  function holdRect() {
    const p = paneRect(), m = S3.man && curHold(); if (!m) return coverRect();
    const bc = m.board_corners, bx0 = Math.min(...bc.map(c => c[0])), bx1 = Math.max(...bc.map(c => c[0])),
      by0 = Math.min(...bc.map(c => c[1])), by1 = Math.max(...bc.map(c => c[1]));
    const pc = m.plate_corners, px0 = Math.min(...pc.map(c => c[0])), px1 = Math.max(...pc.map(c => c[0])),
      py0 = Math.min(...pc.map(c => c[1])), py1 = Math.max(...pc.map(c => c[1]));
    let w = Math.min(p.w * 0.96 / (bx1 - bx0), p.h * 0.86 * ASPECT / (by1 - by0));
    w = Math.max(w, p.w, p.h * ASPECT);                    // never leave the pane uncovered...
    // ...unless that would crop the PLATE (the spaces): the painted board's border may crop, the play surface may not
    const fitP = Math.min(p.w * 0.97 / (px1 - px0), p.h * 0.95 * ASPECT / (py1 - py0));
    if (w > fitP) w = fitP;
    const h = w / ASPECT, cx = (px0 + px1) / 2, cy = (py0 + py1) / 2;
    let x = p.x + p.w / 2 - cx * w, y = p.y + p.h * 0.50 - cy * h;
    if (w >= p.w) x = Math.min(p.x, Math.max(p.x + p.w - w, x));
    if (h >= p.h) y = Math.min(p.y, Math.max(p.y + p.h - h, y)); else y = p.y;   // a letterbox only ever opens below the table, never over the room
    return { x, y, w, h };
  }
  S3._dbg = () => ({ single: Object.keys(single), holdImg: !!imgOf(curHold() && curHold().src), pawnsImg: !!imgOf(curPawns() && curPawns().src), still, shot: shot && shot.name, seqs: Object.keys(seqs), dirty, raf });
  S3._curHold = () => curHold(); S3._camKey = () => camKey(); S3._plate = () => plateName();
  S3._rects = { holdRect: () => holdRect(), paneRect: () => paneRect(), coverRect: () => coverRect() };   // for the gates
  const lerpR = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });

  function play(name, opt) {
    const m = S3.man && S3.man.seqs[name], s = seqs[name];
    opt = opt || {};
    if (!m || !s || !s.ok || CAP) {                    // not decoded (or capture): never strand the game — land on the end
      const end = () => opt.onEnd && opt.onEnd();
      if (opt.onFrame) opt.onFrame(opt.to != null ? opt.to : (m ? m.n - 1 : 0));
      if (m && s && s.ok) still = { name, i: opt.to != null ? opt.to : m.n - 1 };
      dirty = true; setTimeout(end, 0); return 0;
    }
    const from = opt.from || 0, to = opt.to != null ? opt.to : m.n - 1, fps = opt.fps || m.fps;
    shot = { name, from, to, fps, mode: opt.mode || 'once', t0: now(), onEnd: opt.onEnd, onFrame: opt.onFrame,
      rectA: opt.rectA, rectB: opt.rectB, tweenMs: opt.tweenMs || 0, tweenAt: opt.tweenAt || 0, last: -1, fadeHold: !!opt.fadeHold };
    still = null; dirty = true; kick();
    return Math.abs(to - from + 1) / fps * 1000;
  }
  // the (fractional) drawing at time t: ON-TWOS sequences dissolve between neighbouring drawings (blend)
  function posOf(sh, t) {
    const n = Math.abs(sh.to - sh.from) + 1, f = Math.max(0, (t - sh.t0) / 1000 * sh.fps);
    if (sh.mode === 'pingpong') { const L = Math.max(1, 2 * n - 2), p = n > 1 ? f % L : 0; return sh.from + (p < n - 1 ? p : L - p); }
    if (sh.mode === 'loop') return sh.from + (f % n);
    return Math.min(sh.to, sh.from + f);
  }
  const frameOf = (sh, t) => Math.floor(posOf(sh, t));
  function drawImgRect(img, r, dpr, alpha) {
    if (!img) return; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.drawImage(img, r.x * dpr, r.y * dpr, r.w * dpr, r.h * dpr); ctx.globalAlpha = 1;
  }
  function tick() {
    raf = 0; if (!S3.on) return;
    const dpr = fitStage(), t = now();
    let need = !!shot || dirty;
    if (shot) {
      const s = seqs[shot.name], blend = S3.man.seqs[shot.name].blend, pos = posOf(shot, t), i = Math.floor(pos);
      if (i !== shot.last || dirty || blend) {
        if (i !== shot.last && shot.onFrame) shot.onFrame(i);
        shot.last = i;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
        let r = coverRect();
        if (shot.rectA && shot.rectB) { const k = shot.tweenMs ? ease((t - shot.t0 - shot.tweenAt) / shot.tweenMs) : 1; r = lerpR(shot.rectA(), shot.rectB(), k); }
        drawImgRect(s && s.imgs[i], r, dpr); S3.stats.draws++;
        if (shot.fadeHold) { const a = 1 - (t - shot.t0) / 450, im = imgOf(curHold().src); if (a > 0 && im) drawImgRect(im, r, dpr, a); }
        const fr = pos - i, j = Math.min(s.imgs.length - 1, i + 1);
        if (blend && fr > 0.02 && j !== i) { drawImgRect(s.imgs[j], r, dpr, fr); S3.stats.draws++; }
      } else if (shot.rectA && shot.tweenMs) {         // a rect tween keeps redrawing between frames
        const k = ease((t - shot.t0 - shot.tweenAt) / shot.tweenMs);
        if (k > 0 && k < 1) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); drawImgRect(s && s.imgs[i], lerpR(shot.rectA(), shot.rectB(), k), dpr); S3.stats.draws++; }
      }
      const done = shot.mode === 'once' && i >= shot.to && (!shot.tweenMs || t - shot.t0 - shot.tweenAt >= shot.tweenMs);
      dirty = false;                                   // BEFORE onEnd: it may ask for a redraw (the seat -> hold dissolve did, and was lost)
      if (done) { const cb = shot.onEnd; still = { name: shot.name, i: shot.to, rect: shot.rectB }; shot = null; if (cb) cb(); if (dirty) need = true; }
    } else if (dirty) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
      let fading = false;
      if (still === 'hold') { const im = imgOf(curHold().src); if (im) drawImgRect(im, holdRect(), dpr); else need = true;
        // the transition's last frame (always the inset/table/gold board) dissolves into the chosen hold
        if (fadeFrom && im) { const a = 1 - (t - fadeFrom.t0) / 600; if (a > 0) { drawImgRect(fadeFrom.img, holdRect(), dpr, a); fading = true; } else fadeFrom = null; } }
      else if (still && still.name && seqs[still.name] && seqs[still.name].ok) drawImgRect(seqs[still.name].imgs[still.i], still.rect ? still.rect() : coverRect(), dpr);
      S3.stats.draws++; dirty = fading || (still === 'hold' && !imgOf(curHold().src)); if (fading) need = true;
    }
    if (screenIs('game') && board) layoutBoard();
    if (need || shot) kick();
  }
  function kick() { if (!raf && S3.on) raf = requestAnimationFrame(tick); }
  const screenIs = id => { const e = document.getElementById(id); return e && e.classList.contains('on'); };

  /* ---------------- THE PLAY VIEW: the board canvas through the homography ---------------- */
  const BUF_W = 900, BUF_H = 1350;                  // the plate canvas (2:3, LAYOUTS.plate space); boardRect() = all of it
  let board = null, wrap = null, Hs = null, Hinv = null, lastKey = '';
  function mul(A, B) { const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j]; return C; }
  function inv3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  const apply = (M, x, y) => { const w = M[2][0] * x + M[2][1] * y + M[2][2]; return [(M[0][0] * x + M[0][1] * y + M[0][2]) / w, (M[1][0] * x + M[1][1] * y + M[1][2]) / w, w]; };
  S3.fitBoard = function (canvas, wrapEl) {            // called by the page's fitCanvas() while the 3D stage is on
    board = canvas; wrap = wrapEl;
    if (canvas.width !== BUF_W) canvas.width = BUF_W; if (canvas.height !== BUF_H) canvas.height = BUF_H;
    canvas.style.width = BUF_W + 'px'; canvas.style.height = BUF_H + 'px';
    layoutBoard();
  };
  function layoutBoard() {
    if (!board || !S3.man) return;
    const p = paneRect(), r = holdRect(), key = [p.x, p.y, p.w, p.h, r.x, r.y, r.w].map(v => v.toFixed(1)).join() + camKey() + plateName();
    if (key === lastKey) return; lastKey = key;
    const T = [[r.w, 0, r.x - p.x], [0, r.h, r.y - p.y], [0, 0, 1]];      // frame fraction -> pane px
    const Hp = curHold().plate_homography;                              // plate (u,v) -> frame fraction
    Hs = mul(mul(T, Hp), [[1 / BUF_W, 0, 0], [0, 1 / BUF_H, 0], [0, 0, 1]]);  // canvas px -> pane px
    const n = Hs[2][2], M = Hs.map(row => row.map(v => v / n)); Hinv = inv3(M);
    board.style.transform = `matrix3d(${M[0][0]},${M[1][0]},0,${M[2][0]},${M[0][1]},${M[1][1]},0,${M[2][1]},0,0,1,0,${M[0][2]},${M[1][2]},0,1)`;
    dirty = true; kick();
    if (pcv) { const dpr = Math.min(2, devicePixelRatio || 1); pcv.width = Math.round(p.w * dpr); pcv.height = Math.round(p.h * dpr); }
  }
  S3.clientToCanvas = function (cx, cy) {              // a click on the painted board -> the plate canvas px it landed on
    const p = paneRect(); if (!Hinv) return { x: -1e6, y: -1e6 };
    const q = apply(Hinv, cx - p.x, cy - p.y); return { x: q[0], y: q[1] };
  };
  S3.canvasToClient = function (x, y) { const p = paneRect(); if (!Hs) return null; const q = apply(Hs, x, y); return { x: q[0] + p.x, y: q[1] + p.y }; };

  /* ---------------- THE PAWNS: Joe's shapes, glossy Blender plastic, hop drawings ---------------- */
  const PAWN_ROW = { benny: 0, wu: 1, mark: 2, claudia: 3, danny: 4, vonda: 5 };
  let queue = [];
  S3.pawn = function (p, gx, gy, o) { queue.push({ p, gx, gy, o }); };
  function ensurePawnCanvas() {
    if (pcv || !board) return;
    pcv = document.createElement('canvas'); pcv.id = 's3pawns'; board.parentNode.insertBefore(pcv, board.nextSibling);
    pctx = pcv.getContext('2d'); lastKey = '';
  }
  S3.afterBoard = function () {                       // called right after the page's drawBoard()
    ensurePawnCanvas(); const items = queue; queue = [];
    if (!pctx || !S3.man || !Hs) return;
    const pm = curPawns(), at = imgOf(pm.src), dpr = pcv.width / Math.max(1, paneRect().w);
    pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pcv.width, pcv.height);
    if (!at) { wantPlay(); return; }
    const r = holdRect(), Hp = curHold().plate_homography, spot = curHold().pawn_spot || pm.spot, wSpot = apply(Hp, spot[0], spot[1])[2];
    const pr = paneRect();
    // plate canvas px -> pane px, plus k = sprite px per frame px at that depth, S = pane px per canvas px there
    const P = (x, y) => { const f = apply(Hp, x / BUF_W, y / BUF_H), z = wSpot / f[2];
      return { x: r.x - pr.x + f[0] * r.w, y: r.y - pr.y + f[1] * r.h, k: (r.w / pm.ref_frame_w) * z, S: plateS * z }; };
    const a0 = apply(Hp, 0, spot[1]), a1 = apply(Hp, 1, spot[1]), plateS = Math.abs(a1[0] - a0[0]) * r.w / BUF_W;
    const T = now();
    drawBoardFX(T); drawTeleporters(P, T);
    const drawn = items.map(it => {
      let gx = it.gx, gy = it.gy, rise = 0, o = it.o;
      // the SPIRAL LIFT, upright: the rider stays on its pad and RISES up the beam instead of sliding along the plate
      if (S3.upright() && o.lift && fxState && fxState.LIFT) { const [CH, AS] = fxState.LIFT, lt = T - o.lift.start;
        if (lt >= CH && lt < CH + AS) { const e = ease((lt - CH) / AS); gx = o.lift.px; gy = o.lift.py; rise = e; } }
      const q = P(gx, gy);
      return { it, x: q.x, y: q.y, k: q.k, S: q.S, rise };
    }).sort((a, b) => a.y - b.y);
    const [cw, ch] = pm.cell;
    for (const d of drawn) {
      const o = d.it.o, row = PAWN_ROW[(d.it.p.name || '').split(' ')[0].toLowerCase()];
      if (row == null) continue;
      const cell = o.hop > 0.001 ? Math.min(12, 1 + Math.floor((1 - o.hop) * 12)) : 0;
      const k = d.k * (1 - 0.82 * (o.bk || 0)), air = o.air || 0;
      pctx.save(); pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.globalAlpha = Math.max(0, Math.min(1, o.la == null ? 1 : o.la));
      // contact shadow on the board: shrinks + fades as the pawn leaves the plate
      pctx.fillStyle = 'rgba(0,0,0,' + (0.42 * (1 - 0.6 * air)) + ')';
      pctx.beginPath(); pctx.ellipse(d.x, d.y + 2 * k, cw * 0.30 * k * (1 - 0.35 * air), cw * 0.11 * k * (1 - 0.35 * air), 0, 0, 7); pctx.fill();
      pctx.translate(d.x, d.y - d.rise * BUF_W * 0.30 * d.S);
      const lean = (o.burned ? 0.2 : (o.lean || 0)) + (o.spin || 0);
      if (lean) pctx.rotate(lean);
      const sq = o.burned ? 0.16 : (o.sq || 0); pctx.scale(1 + sq * 0.5, 1 - sq * 0.5);
      if (o.burned) pctx.filter = 'brightness(0.55) saturate(0.6)';
      pctx.drawImage(at, cell * cw, row * ch, cw, ch, -pm.anchor[0] * k, -pm.anchor[1] * k, cw * k, ch * k);
      pctx.restore(); S3.stats.pawnDraws++;
    }
    if (S3.upright() && fxState) { pctx.save(); pctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawUpright(fxState, P, T); pctx.restore(); }
  };

  /* ---------------- THE REAL BOARDS' OWN ANIMATIONS (render-only, 10/25) ----------------
     on the printed surface, drawn as RGBA light (alpha = its brightness, ~screen over the plate) into the board canvas (its 900x1350 px = the whole art, laid on the table by the
     homography): the CORE board's GOLDEN STAIRCASE (light climbs both painted flights, a loop) and every board's TO MARKET door
     passage (fires when the page's doorFX does: a pawn going through the door; CORE: in at the left door, out at the right).
     Standing on the board: the SPIRAL LIFT (Joe's teleporter) on each Golden-Staircase space of a futuristic board. */
  const curAnims = () => (S3.man && S3.man.board_anims && !plaque() && S3.man.board_anims[boardKey()]) || null;
  const teleOn = () => { if (opt.tele === 'off' || plaque()) return false; if (opt.tele === 'on') return true;
    const B = S3.man && S3.man.boards && S3.man.boards[boardKey()]; return !!(B && B.futuristic); };
  function wantBoardFX() {
    const a = curAnims(), out = [];
    if (a) { if (a.staircase) out.push(wantSingle(a.staircase.src)); if (a.door) for (const k in a.door) out.push(wantSingle(a.door[k].src)); }
    if (S3.man && S3.man.teleporter) out.push(wantSingle(S3.man.teleporter.src));
    return out;
  }
  function cell(c, m, img, i, x, y, w, h) { const [cw, ch] = m.cell, cx = (i % m.cols) * cw, cy = Math.floor(i / m.cols) * ch; c.drawImage(img, cx, cy, cw, ch, x, y, w, h); }
  function drawBoardFX(T) {
    const a = curAnims(); if (!a || opt.anim === 'off' || !board) return;
    const c = board.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over';   // RGBA light: ~screen over the plate
    const st = a.staircase, si = st && imgOf(st.src);
    if (si) { const i = CAP ? 6 : Math.floor(T / 1000 * st.fps) % st.n, [x, y, w, h] = st.rect_canvas; cell(c, st, si, i, x, y, w, h); }
    const d = fxState && fxState.door;
    if (d && a.door) { const k = (fxState.now - d.start) / 1100;
      for (const nm in a.door) { const m = a.door[nm], im = imgOf(m.src); if (!im) continue;
        const kk = (k - (m.start || 0)) / (1 - (m.start || 0) * 0.5); if (kk < 0 || kk >= 1) continue;
        const [x, y, w, h] = m.rect_canvas; cell(c, m, im, Math.min(m.n - 1, Math.floor(kk * m.n)), x, y, w, h); } }
    c.restore();
  }
  function drawTeleporters(P, T) {
    const tm = S3.man && S3.man.teleporter, im = tm && imgOf(tm.src), B = S3.man && S3.man.boards && S3.man.boards[boardKey()];
    if (!im || !B || !teleOn()) return;
    const i = CAP ? 0 : Math.floor(T / 1000 * tm.fps) % tm.n;
    const L = global.__lab, ex = L && L.exits ? L.exits() : null;   // the rules' staircases (normalised board uv), not the painted pair
    const spots = (ex && ex.length) ? ex.map(n => [n.x, n.y]) : B.staircases;
    const pts = spots.map(([u, v]) => ({ u, v, q: P(u * BUF_W, v * BUF_H) })).sort((a, b) => a.q.y - b.q.y);
    pctx.save(); const dpr = pcv.width / Math.max(1, paneRect().w); pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const { q } of pts) { const k = (0.13 * BUF_W * q.S) / tm.pad_px, [cw, ch] = tm.cell;
      pctx.drawImage(im, i * cw, 0, cw, ch, q.x - tm.anchor[0] * k, q.y - tm.anchor[1] * k, cw * k, ch * k); S3.stats.teleDraws = (S3.stats.teleDraws || 0) + 1; }
    pctx.restore();
  }

  /* ---------------- THE GAME'S FLOURISHES, STANDING UP ON THE TABLE (opt.fx === 'upright') ----------------
     The page still runs every flourish's own clock (drawDrawAnim/drawDieFX/... draw into a 1x1 null context,
     so their lifecycles - drawAnim=null, showDie(v), vortex kicks - are untouched); this draws the SAME state
     upright in screen space at H(u,v), sized by depth. Cards rise and turn; the die is the Blender die, rolled on
     the table; the lift is a standing column of light; sparks and coins fly UP; the chevron and the toss label stand. */
  let fxState = null; const sparkSeen = new WeakSet(); let sparks = [];
  S3.fx = st => { fxState = st; };
  S3._fxDoor = () => fxState && fxState.door ? { start: fxState.door.start, now: fxState.now } : null;
  function cardRect(c, x0, y0, w, h, rad) { c.beginPath(); c.moveTo(x0 + rad, y0); c.arcTo(x0 + w, y0, x0 + w, y0 + h, rad); c.arcTo(x0 + w, y0 + h, x0, y0 + h, rad); c.arcTo(x0, y0 + h, x0, y0, rad); c.arcTo(x0, y0, x0 + w, y0, rad); c.closePath(); }
  function drawCard(c, img, cx, cy, w, h, sx, alpha, glow) {
    const ww = Math.max(1, Math.abs(sx) * w), x0 = cx - ww / 2, y0 = cy - h / 2, rad = h * 0.06;
    c.save(); c.globalAlpha = alpha;
    c.shadowColor = glow ? 'rgba(246,201,120,' + glow + ')' : 'rgba(0,0,0,.55)'; c.shadowBlur = h * 0.18; c.shadowOffsetY = glow ? 0 : h * 0.05;
    c.fillStyle = sx >= 0 ? '#1a1d27' : '#f2ead6'; cardRect(c, x0, y0, ww, h, rad); c.fill(); c.restore();
    c.save(); c.globalAlpha = alpha; if (img) { cardRect(c, x0, y0, ww, h, rad); c.clip(); c.drawImage(img, x0, y0, ww, h); }
    c.restore(); c.save(); c.globalAlpha = alpha; c.strokeStyle = 'rgba(246,201,120,.6)'; c.lineWidth = Math.max(1, h * 0.012); cardRect(c, x0, y0, ww, h, rad); c.stroke(); c.restore();
  }
  const DECK_KEY = d => { d = String(d || '').toUpperCase().replace(/^ADV/, '').replace(/^SHADOW/, ''); return d === 'ASSET' || d === 'MARKET' || d === 'SEC' ? d : 'MARKET'; };
  function drawUpright(st, P, T) {
    const c = pctx, BW = BUF_W, now_ = st.now, H0 = P(st.hole.x, st.hole.y);
    const shadow = (q, rx, a) => { c.fillStyle = 'rgba(0,0,0,' + a + ')'; c.beginPath(); c.ellipse(q.x, q.y, rx, rx * 0.36, 0, 0, 7); c.fill(); };
    // ---- the SPIRAL LIFT: a standing column of gold light on the pad, the painted spiral upright, motes rising ----
    if (st.liftFX && st.liftImgs && st.liftImgs[0]) { const L = st.liftFX, k = now_ - L.start, [CH, AS, SE] = st.LIFT, q = P(L.x, L.y);
      const w = BW * 0.17 * q.S, colH = BW * 0.36 * q.S; c.save(); c.globalCompositeOperation = 'lighter';
      const img = st.liftImgs[Math.min(st.liftImgs.length - 1, k < CH ? Math.floor(k / CH * 5) : 4)], ih = img ? w * img.height / img.width : 0;
      const a = k < CH ? 0.45 + 0.55 * k / CH : k < CH + AS ? 0.9 : Math.max(0, 1 - (k - CH - AS) / SE);
      const g = c.createLinearGradient(0, q.y, 0, q.y - colH); g.addColorStop(0, 'rgba(255,214,120,0.38)'); g.addColorStop(0.7, 'rgba(255,226,150,0.12)'); g.addColorStop(1, 'rgba(255,235,170,0)');
      c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.ellipse(q.x, q.y, w * 0.24, w * 0.08, 0, 0, 7); c.fill(); c.fillRect(q.x - w * 0.24, q.y - colH, w * 0.48, colH);
      if (img) c.drawImage(img, q.x - w / 2, q.y - ih + ih * 0.12, w, ih);
      for (let i = 0; i < 9; i++) { const ph = ((now_ / 900) + i / 9) % 1; c.globalAlpha = a * (1 - ph) * 0.9; c.fillStyle = 'rgba(255,230,160,1)';
        c.beginPath(); c.arc(q.x + Math.sin(ph * 9 + i * 2.4) * w * 0.16, q.y - ph * colH, Math.max(1, 3 * q.S * (1 - ph * 0.5)), 0, 7); c.fill(); }
      c.restore(); }
    // ---- the juice, upright: a shimmering column over the hole while the hole is hot / eating juice ----
    if (st.juice > 12) { const a = Math.min(0.5, (st.juice - 12) / 120), w = st.hole.r * H0.S * 1.1, hgt = BW * 0.16 * H0.S;
      c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 4; i++) { const ph = ((now_ / 1400) + i / 4) % 1;
        c.globalAlpha = a * (1 - ph); c.strokeStyle = 'rgba(243,170,70,1)'; c.lineWidth = Math.max(1, 2 * H0.S);
        c.beginPath(); c.ellipse(H0.x, H0.y - ph * hgt, w * (1 - ph * 0.6), w * 0.34 * (1 - ph * 0.6), 0, 0, 7); c.stroke(); } c.restore(); }
    // ---- the DIE: the Blender die tumbling across the table from the roller's pawn, resting on its value, then the hole takes it ----
    const dice = curDice(), dimg = dice && imgOf(dice.src);
    if (st.dieFX && dimg) { const D = 1900, t = (now_ - st.dieFX.start) / D, sp = st.active || { x: st.hole.x, y: st.hole.y + BW * 0.3 };
      const dx = st.hole.x - sp.x, dy = st.hole.y - sp.y, dist = Math.hypot(dx, dy) || 1, stop = Math.max(0.15, 1 - st.hole.r * 1.6 / dist);
      const land = { x: sp.x + dx * stop, y: sp.y + dy * stop };
      let gx, gy, cell, alpha = 1, scl = 1;
      if (t < 0.5) { const k = t / 0.5, e = 1 - (1 - k) * (1 - k); gx = sp.x + (land.x - sp.x) * e; gy = sp.y + (land.y - sp.y) * e; cell = Math.min(11, Math.floor(k * 12)); }
      else if (t < 0.78) { gx = land.x; gy = land.y; cell = 12; }
      else { const k = (t - 0.78) / 0.22, e = k * k; gx = land.x + (st.hole.x - land.x) * e; gy = land.y + (st.hole.y - land.y) * e; cell = 12; scl = 1 - 0.9 * e; alpha = 1 - k; }
      const q = P(gx, gy), [cw, ch] = dice.cell, row = Math.max(0, Math.min(5, (st.dieFX.value | 0) - 1)), k = q.k * scl;
      c.save(); c.globalAlpha = alpha; shadow(q, cw * 0.22 * k, 0.4); c.drawImage(dimg, cell * cw, row * ch, cw, ch, q.x - dice.anchor[0] * k, q.y - dice.anchor[1] * k, cw * k, ch * k); c.restore(); }
    // ---- a DRAWN card: lifts off its pile, stands up, rises and TURNS to show its face ----
    if (st.drawAnim) { const a = st.drawAnim, t = (now_ - a.start) / 1700, dn = st.decks && st.decks[DECK_KEY(a.deck)] || { x: 0.5, y: 0.95 };
      const q0 = P(dn.x * BW, dn.y * BUF_H), q1 = P(BW * 0.30, BUF_H * 0.40), fly = Math.min(1, t / 0.55), e = 1 - Math.pow(1 - fly, 2.4);
      const S = q0.S + (q1.S - q0.S) * e, x = q0.x + (q1.x - q0.x) * e, y = q0.y + (q1.y - q0.y) * e - (BW * 0.10 + BW * 0.22 * e) * S;
      const h = (BW * 0.16 + BW * 0.20 * e) * S, w = h * 0.66, fp = Math.min(1, Math.max(0, (t - 0.12) / 0.5)), sx = Math.cos(fp * Math.PI);
      if (t < 1) { shadow({ x: q0.x + (q1.x - q0.x) * e, y: q0.y + (q1.y - q0.y) * e }, w * 0.5, 0.35 * (1 - e * 0.6)); drawCard(c, sx >= 0 ? a.back : a.front, x, y, w, h, sx, t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.14) : 1); } }
    // ---- a PLAYED card: flung UP off the player's pawn, arcs over and spirals down into the $90M hole ----
    if (st.cardFX && st.cardFX.art) { const t = (now_ - st.cardFX.start) / 1500, sp = st.active || st.hole, q0 = P(sp.x, sp.y);
      let x, y, scl = 1, rot = 0, glow = 0;
      if (t < 0.28) { const k = t / 0.28, e = k * k; x = q0.x + (H0.x - q0.x) * e * 0.7; y = q0.y - BW * 0.12 * q0.S + (H0.y - q0.y) * e * 0.7 - Math.sin(k * Math.PI) * BW * 0.12 * q0.S; scl = 1 + 0.1 * Math.sin(k * Math.PI); rot = e * 0.4; }
      else if (t < 0.82) { const k = (t - 0.28) / 0.54, e = k * k, rad = BW * 0.10 * H0.S * (1 - e), ang = e * 7.5; x = H0.x + Math.cos(ang) * rad; y = H0.y - BW * 0.06 * H0.S * (1 - e) + Math.sin(ang) * rad * 0.36; scl = 1 - 0.85 * e; rot = e * 7; glow = e * 0.5; }
      else { const k = (t - 0.82) / 0.18; x = H0.x; y = H0.y; scl = Math.max(0, 0.14 * (1 - k)); glow = 0.6 * (1 - k); }
      if (t < 1) { const h = BW * 0.16 * q0.S * scl; c.save(); c.translate(x, y); c.rotate(rot); drawCard(c, st.cardFX.art, 0, 0, h * 0.66, h, -1, 1, glow); c.restore(); } }
    // ---- landing sparks + bribe coins fly UP off the table ----
    for (const s of (st.sparks || [])) if (!sparkSeen.has(s)) { sparkSeen.add(s); const q = P(s.x, s.y);
      sparks.push({ x: q.x, y: q.y, vx: s.vx * q.S * 0.9, vy: -(1.8 + Math.abs(s.vy)) * q.S * 1.2, g: 0.32 * q.S, age: 0, life: s.life, hue: s.hue, w: Math.max(0.6, 1.6 * q.S) }); }
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    sparks = sparks.filter(p => { p.age += 1 / 60; const k = p.age / p.life; if (k >= 1) return false; p.vy += p.g; p.x += p.vx; p.y += p.vy;
      c.strokeStyle = `hsla(${p.hue},100%,${62 + 18 * (1 - k)}%,${1 - k})`; c.lineWidth = p.w * (1 - k * 0.4); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.8, p.y - p.vy * 0.8); c.stroke(); return true; });
    c.restore();
    if (st.coinFX && st.coinImg) for (const cf of st.coinFX) { const k = (now_ - cf.start) / 1000; if (k >= 1) continue; const q = P(cf.x, cf.y);
      const rise = BW * (cf.spend ? 0.08 + k * 0.14 : 0.14 * Math.sin(k * Math.PI * 0.7)) * q.S, fade = cf.spend ? 1 - k : (k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45);
      const w = BW * 0.06 * q.S, h = w * st.coinImg.height / st.coinImg.width, flip = Math.cos(now_ / 85 + cf.start * 0.7);
      c.save(); c.globalAlpha = Math.max(0, fade); c.translate(q.x, q.y - BW * 0.08 * q.S - rise); c.scale(Math.max(0.14, Math.abs(flip)), 1); c.drawImage(st.coinImg, -w / 2, -h / 2, w, h); c.restore(); }
    // ---- the cursor chevron + TOSS THE DIE, standing ----
    if (st.cursor) { const q = P(st.cursor.x, st.cursor.y), s_ = BW * 0.03 * q.S, y = q.y - BW * 0.11 * q.S - Math.abs(Math.sin(now_ / 260)) * BW * 0.02 * q.S;
      c.save(); c.fillStyle = '#f0cf7a'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = s_ * 0.14; c.beginPath(); c.moveTo(q.x, y + s_); c.lineTo(q.x - s_ * 0.7, y - s_ * 0.4); c.lineTo(q.x + s_ * 0.7, y - s_ * 0.4); c.closePath(); c.fill(); c.stroke(); c.restore(); }
    if (st.toss) { const pz = 0.5 + 0.5 * Math.sin(now_ / 300), fs = Math.max(12, BW * 0.05 * H0.S);
      c.save(); c.textAlign = 'center'; c.font = '800 ' + Math.round(fs) + 'px Georgia,serif'; c.lineWidth = fs * 0.16; c.strokeStyle = 'rgba(8,6,2,.85)';
      const y = H0.y - st.hole.r * H0.S * 0.5 - BW * 0.07 * H0.S; c.strokeText('TOSS THE DIE ▸', H0.x, y); c.fillStyle = 'rgba(246,201,120,' + (0.7 + 0.3 * pz) + ')'; c.fillText('TOSS THE DIE ▸', H0.x, y); c.restore(); }
  }

  /* ---------------- THE 3D DYNAMITE (replaces FX.dynamite's canvas drawing; reveal() at the flash) ---------------- */
  let dyn = null;
  function wantDyn() {
    if (dyn || !S3.man) return;
    dyn = { ok: false };
    fetch(S3.man.dynamite.atlas).then(r => r.json()).then(a => {
      dyn.atlas = a;
      return Promise.all([loadImg(S3.man.dynamite.dir + a.stick.atlas), loadImg(S3.man.dynamite.dir + a.blast.atlas)]);
    }).then(([s, b]) => { dyn.stick = s; dyn.blast = b; dyn.ok = !!(s && b); }).catch(() => {});
  }
  function dynamite3d(reveal) {
    let done = false; const finish = () => { if (!done) { done = true; reveal && reveal(); } };
    const fc = document.getElementById('fxcanvas'); if (!fc) { finish(); return; }
    const c = fc.getContext('2d'); fc.width = fc.clientWidth || innerWidth; fc.height = fc.clientHeight || innerHeight; fc.style.display = 'block';
    try { global.SFX && SFX.whistle(540); } catch (e) {}
    const W = fc.width, H = fc.height, cx = W * 0.5, cy = H * 0.46, A = dyn.atlas;
    const THROW = 540, FUSE = 460, CELL = 1000 / A.fps_drawings, NB = A.blast.cells.length, tBlow = THROW + FUSE, tEnd = tBlow + NB * CELL + 160;
    const t0 = now(); let boomed = false;
    const blit = (img, rc, x, y, w, rot) => { c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.drawImage(img, rc[0], rc[1], rc[2], rc[3], -w / 2, -w / 2 * rc[3] / rc[2], w, w * rc[3] / rc[2]); c.restore(); };
    function frame(tn) {
      const t = Math.max(0, tn - t0); c.clearRect(0, 0, W, H);   // rAF stamps can predate t0
      if (t < tBlow) {                                 // the stick: the code keeps the fall path; the cells carry the tumble
        const sw = 0.24 * Math.min(W, H);
        if (t < THROW) { const p = (t / THROW) ** 2, y = -H * 0.30 + (cy + H * 0.30) * p; const k = Math.min(A.stick.drop.length - 1, Math.floor(t / THROW * A.stick.drop.length));
          blit(dyn.stick, A.stick.cells[A.stick.drop[k]], cx, y, sw); }
        else { const k = Math.floor((t - THROW) / CELL) % A.stick.fuse_loop.length, fp = (t - THROW) / FUSE;
          blit(dyn.stick, A.stick.cells[A.stick.fuse_loop[k]], cx + Math.sin(t / 55) * 4, cy + Math.sin(t / 80) * 3, sw * (1 + fp * fp * 0.12)); }
      } else {
        if (!boomed) { boomed = true; try { global.SFX && (SFX.play('bomb', 0.95), SFX.play('burnout', 0.5)); global.SFX && SFX.music && SFX.music.duck(0.05, 1700); } catch (e) {} }
        const bt = t - tBlow, k = Math.min(NB - 1, Math.floor(bt / CELL)), shake = bt < 130 ? 15 * (1 - bt / 130) : 0;
        if (bt < 130) { const a = 1 - bt / 130; const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.35);   // the small flash bloom (kept)
          g.addColorStop(0, `rgba(255,255,255,${0.8 * a})`); g.addColorStop(0.3, `rgba(255,236,206,${0.35 * a})`); g.addColorStop(1, 'rgba(255,200,140,0)');
          c.fillStyle = g; c.fillRect(0, 0, W, H); }
        const fade = t > tEnd - 160 ? Math.max(0, (tEnd - t) / 160) : 1;
        c.globalAlpha = fade;
        blit(dyn.blast, A.blast.cells[k], cx + (shake ? (Math.random() * 2 - 1) * shake : 0), cy + (shake ? (Math.random() * 2 - 1) * shake : 0), 0.85 * Math.min(W, H));
        c.globalAlpha = 1;
        if (k >= 1) finish();                          // reveal at cell 1, the flash peak
      }
      if (t > tEnd) { fc.style.display = 'none'; c.clearRect(0, 0, W, H); finish(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function hookFX() {
    if (!global.FX || FX.__s3) return;
    const orig = FX.dynamite; FX.__s3 = true; FX.__origDynamite = orig;
    FX.dynamite = reveal => (S3.on && dyn && dyn.ok && !CAP) ? dynamite3d(reveal) : orig(reveal);
  }

  /* ---------------- the screen flow ---------------- */
  S3.onShow = function (id) {
    S3.screen = id; if (!S3.on) return;
    preloadFor(id);
    document.body.classList.toggle('s3-over', id === 'over');
    if (id === 'boot') {
      const L = global.__lab; if (L && S3.prevBoard) { L.setBoard(S3.prevBoard); S3.prevBoard = null; }
      if (shot && shot.name !== 'push') shot = null;   // a crane / seat left over from the attract or a quit never strands the title
      document.body.classList.remove('s3-intro', 's3-outro', 's3-lift', 's3-leaders'); S3.pendingSeat = false;
      want('hall').then(() => { if (S3.screen === 'boot' && !shot) play('hall', { mode: 'pingpong' }); });
    }
    if (id === 'setup') {
      document.body.classList.remove('s3-lift');
      want('reserved').then(() => { if (S3.screen === 'setup') { const m = S3.man.seqs.reserved; play('reserved', { from: m.hold[0], to: m.hold[1], mode: 'pingpong', fps: 9 }); } });
    }
    if (id === 'game') {
      if (S3.pendingSeat) { S3.pendingSeat = false; seatIntro(); }
      else { still = 'hold'; shot = null; dirty = true; kick(); }
    }
    if (id === 'over') { if (!S3.endShown) { still = 'black'; dirty = true; } S3.endShown = false; kick(); }
  };
  function seatIntro() {
    document.body.classList.add('s3-intro');
    const go = () => {
      play('seat', { rectA: coverRect, rectB: holdRect, tweenMs: 650, tweenAt: (S3.man.seqs.seat.n / S3.man.seqs.seat.fps) * 1000 - 150,
        onEnd: () => { const sq = seqs.seat; fadeFrom = sq && sq.ok ? { img: sq.imgs[sq.imgs.length - 1], t0: now() } : null;
          still = 'hold'; dirty = true; kick(); document.body.classList.remove('s3-intro'); } });
    };
    Promise.all([want('seat'), wantPlay()]).then(go);
  }
  // ENTER THE TOWER: the atrium push, the 3D dynamite falling in as it lands on the pedestal board
  S3.enterTower = function (go) {
    want('push').then(ok => {
      const dur = play('push', {});
      const fire = () => (global.FX ? FX.dynamite(go) : go());
      if (!ok || CAP) fire(); else setTimeout(fire, Math.max(0, dur - 1000));   // flash ~ the push's last frame
    });
  };
  // START: the RESERVED sign lifts; the wash/dynamite floods while it is still rising (it covers the patch)
  S3.takeSeat = function (expansion, startGame) {
    const m = S3.man.seqs.reserved; document.body.classList.add('s3-lift');
    S3.pendingSeat = true;
    let fired = false;
    const fire = () => { if (fired) return; fired = true;
      if (expansion && global.FX) FX.dynamite(startGame); else if (global.FX) FX.wipe('juice', startGame); else startGame(); };
    const lead = expansion ? 15 : 7;                 // dynamite flashes ~1 s after it is thrown, the wash at ~0.4 s
    const dur = play('reserved', { from: m.lift[0], to: m.lift[1], fps: 15, onFrame: i => { if (i >= m.lift[1] - lead) fire(); }, onEnd: fire });
    if (!dur) fire();
  };
  S3.gameFile = () => plaque() ? 'plate-' + plateName() : (S3.man && S3.man.boards && S3.man.boards[boardKey()] ? S3.man.boards[boardKey()].game_file : 'coreprint');
  S3.beforeStart = function () {
    const L = global.__lab, f = S3.gameFile();
    if (L && L.S.board !== f) { if (S3.prevBoard == null) S3.prevBoard = L.S.board; L.setBoard(f); }
    const b = document.getElementById('board'); if (b) { b.width = BUF_W; b.height = BUF_H; }   // seat the pawns in plate space from the first frame
  };
  // endGame: the collapse crane / the Lounge push, then the verdict. Returns how long to wait before show('over')
  S3.overDelay = function (game) {
    // Only an actual Lounge victory gets the Lounge push. A scored timeout
    // goes straight to the existing verdict; it is neither a Lounge win nor a collapse.
    const collapsed = !!(game && game.collapsed) || /^\s*COLLAPSE/i.test((game && game.end_reason) || '');
    const win = !collapsed && !!(game && game.winner) && game.end_reason === 'Victory conditions met';
    if(!collapsed && !win){
      document.body.classList.remove('s3-leaders', 's3-outro');
      S3.endShown = true; shot = null; still = 'black'; dirty = true; kick(); return 700;
    }
    const name = win ? loungeSeq() : 'collapse', m = S3.man.seqs[name], s = seqs[name];
    const lead_ = opt.verdict === 'leaders' && seqs.leaders && seqs.leaders.ok && !CAP;   // the verdict on the painted TOWER LEADERS board
    document.body.classList.toggle('s3-leaders', !!lead_);
    S3.endShown = true;
    document.body.classList.add('s3-outro');
    const back = () => document.body.classList.remove('s3-outro');
    if (!s || !s.ok || CAP) { still = 'black'; dirty = true; kick(); setTimeout(back, 900); return 900; }
    const lead = 700;                                // the board UI fades, then the camera moves
    const LM = S3.man.seqs.leaders, ldur = lead_ ? (LM.n / LM.fps) * 1000 : 0;
    const toLeaders = () => { if (lead_) play('leaders', { mode: 'once' }); };
    setTimeout(() => {
      play(name, { rectA: holdRect, rectB: coverRect, tweenMs: 700, fadeHold: true,
        onEnd: () => { if (win && global.FX) FX.wipe('trust', toLeaders); else if (lead_ && global.FX) FX.wipe('hype', toLeaders); else toLeaders(); } });
    }, lead);
    const dur = lead + (m.n / m.fps) * 1000 + (win ? 410 : 300) + (lead_ ? 410 + ldur : 0);
    setTimeout(back, dur + 50);
    return dur;
  };

  /* ---------------- on / off ---------------- */
  S3.toggle = function () {
    S3.on = !S3.on; document.body.classList.toggle('s3d', S3.on); paintBadge();
    const L = global.__lab;
    if (S3.on) {
      ensureMan().then(() => {
        preloadFor(S3.screen); S3.onShow(S3.screen === 'game' ? 'game' : S3.screen);
        if (S3.screen === 'game' && L) { S3.beforeStart(); L.relayout(); }
      });
    } else {
      shot = null; still = null; queue = []; lastKey = '';
      if (board) { board.style.transform = ''; }
      if (pctx) pctx.clearRect(0, 0, pcv.width, pcv.height);
      document.body.classList.remove('s3-intro', 's3-outro', 's3-lift', 's3-over');
      if (L && S3.screen === 'game') { if (S3.prevBoard) { L.setBoard(S3.prevBoard); S3.prevBoard = null; } L.relayout(); }
    }
  };
  // the OPTIONS panel (under the badge): click a row to cycle; remembered per viewer
  let panel = null;
  function paintPanel() {
    if (!panel) return; panel.style.display = S3.on ? '' : 'none';
    panel.innerHTML = Object.keys(OPT_DEF).map(k => { const v = k === 'plate' ? plateName() : (k === 'board' && opt.board === 'auto') ? 'auto: ' + boardKey() : opt[k];
      return `<div class="row" data-k="${k}"><b>${OPT_LABEL[k]}</b> <span>${v.toUpperCase()}</span>${OPT_HELP[v] ? `<i>${OPT_HELP[v]}</i>` : ''}</div>`; }).join('');
    panel.querySelectorAll('.row').forEach(el => el.onclick = e => { e.stopPropagation(); S3.setOpt(el.dataset.k); });
  }
  S3.setOpt = function (k, v) {
    const L = global.__lab, list = OPT_DEF[k], cur = k === 'plate' ? plateName() : opt[k];
    opt[k] = v || list[(list.indexOf(cur) + 1) % list.length];
    if (k === 'plate' && L && (S3.screen === 'game' || S3.screen === 'setup')) L.setBoard('plate-' + opt.plate);
    if ((k === 'board' || k === 'art') && L && S3.screen === 'game') { S3.beforeStart(); L.relayout(); }
    try { localStorage.setItem('ersn3d.opts', JSON.stringify(opt)); } catch (e) {}
    lastKey = ''; dirty = true; preloadFor(S3.screen); wantPlay().then(() => { lastKey = ''; dirty = true; kick(); }); kick(); paintPanel();
  };
  let manP = null;
  function ensureMan() {
    const rooted = v => typeof v === 'string' ? (/^art\//.test(v) ? ROOT + v : v) : Array.isArray(v) ? v.map(rooted)
      : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rooted(x)])) : v;
    if (!manP) manP = fetch(ROOT + 'art/manifest.json').then(r => r.json()).then(m => { S3.man = ROOT ? rooted(m) : m; S3.ready = true; return m; })
      .catch(e => { console.warn('3D stage: no art/manifest.json — staying 2D', e); S3.on = false; document.body.classList.remove('s3d'); paintBadge(); });
    return manP;
  }
  function boot() {
    setupDom(); hookFX();
    if (S3.on) { document.body.classList.add('s3d'); ensureMan().then(() => { preloadFor(S3.screen); S3.onShow(S3.screen); }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
