/* ER$N transition FX — the EXPANSION dynamite throw + procedural detonation.
   Pure presentation. Sparks/smoke are rendered procedurally (the ONE-TIMER FX_*.png sheets are
   labelled catalogs, not blittable frames). Honors the global SFX mute via the boom + bed duck.

   FX.dynamite(reveal): throw the stick in, burn the fuse, blow the screen up, and call reveal()
   at the flash peak so the next screen is unveiled under the blast. Falls back to reveal() if the
   canvas/sprite is missing so a game start never gets stranded. */
(function (global) {
  'use strict';
  let cv, ctx, sprite = null, spriteOK = false, raf = 0;
  const rand = (a, b) => a + (b - a) * Math.random();

  function ensure() {
    cv = document.getElementById('fxcanvas');
    if (!cv) return false;
    ctx = cv.getContext('2d');
    if (!sprite) { sprite = new Image(); sprite.onload = () => { spriteOK = true; }; sprite.src = 'assets/fx/dynamite.png'; }
    return true;
  }
  function fit() { cv.width = cv.clientWidth || window.innerWidth; cv.height = cv.clientHeight || window.innerHeight; }
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const easeIn = t => t * t;

  function dynamite(reveal) {
    let done = false; const finish = () => { if (!done) { done = true; reveal && reveal(); } };
    if (!ensure()) { finish(); return; }
    fit(); cv.style.display = 'block';
    try { global.SFX && SFX.whistle(540); } catch (e) {}   // high whistle as it drops from mid-screen
    const W = cv.width, H = cv.height, cx = W * 0.5, cy = H * 0.46;
    const t0 = (global.performance && performance.now) ? performance.now() : 0;
    const THROW = 540, FUSE = 460, FLASH = 130, SETTLE = 900;
    const tBlow = THROW + FUSE, tEnd = tBlow + FLASH + SETTLE;
    const sparks = [], smoke = [], debris = [];
    let exploded = false;

    function blow() {
      // PARTICLE-FORWARD blast: lots of fast sparks, mostly amber embers with a white-hot core
      // fraction (less pure-yellow), thrown wide. The light bloom is deliberately small (see flash).
      for (let i = 0; i < 300; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(6, 46), hot = (i % 5 === 0);
        sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(0, 8),
          age: 0, life: rand(0.40, 1.15), sz: rand(1.2, 4.4),
          hue: rand(12, 38), sat: hot ? 30 : 100, lum: hot ? 96 : 62 });
      }
      // chunky tumbling fragments — reads as a PARTICLE explosion (matter thrown out), not just light
      for (let i = 0; i < 16; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(7, 26);
        debris.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(2, 9),
          age: 0, life: rand(0.7, 1.25), s: rand(3, 7), rot: rand(0, 6.28), vr: rand(-12, 12) });
      }
      for (let i = 0; i < 34; i++) {
        smoke.push({ x: cx + rand(-34, 34), y: cy + rand(-34, 34), r: rand(18, 56),
          vr: rand(26, 70), vy: -rand(8, 42), age: 0, life: rand(0.6, 1.05) });
      }
      try { global.SFX && (SFX.play('bomb', 0.95), SFX.play('burnout', 0.5)); global.SFX && SFX.music && SFX.music.duck(0.05, 1700); } catch (e) {}
    }

    function emitFuse(x, y) {
      for (let i = 0; i < 3; i++) {
        sparks.push({ x, y, vx: rand(-2, 2), vy: -rand(1, 4), age: 0, life: rand(0.2, 0.45),
          sz: rand(1, 2.4), hue: rand(40, 56) });
      }
    }

    function drawSprite(x, y, rot, scl) {
      if (!spriteOK) return;
      const w = Math.min(W, H) * 0.20 * scl, h = w * (sprite.height / sprite.width);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = w * 0.08; ctx.shadowOffsetY = h * 0.05;
      ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
      ctx.restore();
      return { fx: x + Math.cos(rot - 1.0) * w * 0.34, fy: y + Math.sin(rot - 1.0) * w * 0.34 }; // ~fuse tip
    }

    function frame(now) {
      const t = now - t0, dt = 1 / 60;
      ctx.clearRect(0, 0, W, H);
      let shake = 0;
      if (t >= tBlow) {
        if (!exploded) { exploded = true; blow(); }
        const ft = t - tBlow;
        if (ft < FLASH) { const k = 1 - ft / FLASH; shake = 15 * k;
          // SMALL light bloom: a tight white-hot core that fades to nothing — NOT a flat yellow screen wash.
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.5);
          g.addColorStop(0, `rgba(255,255,255,${0.82 * k})`);
          g.addColorStop(0.16, `rgba(255,242,214,${0.5 * k})`);
          g.addColorStop(0.46, `rgba(255,205,150,${0.14 * k})`);
          g.addColorStop(1, 'rgba(255,190,130,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = `rgba(246,249,255,${0.16 * k})`; ctx.fillRect(0, 0, W, H); // faint cool lift, no yellow
        }
        if (ft > FLASH * 0.35) finish(); // unveil the board under the blast
      }
      ctx.save();
      if (shake) ctx.translate(rand(-shake, shake), rand(-shake, shake));

      // --- shockwave: a bright white-hot leading ring + a wide cooler body + a faint inner echo ---
      if (exploded) { const ft = t - tBlow, maxR = Math.max(W, H);
        const p1 = Math.min(1, ft / 300);   // fast bright leading edge
        ctx.beginPath(); ctx.arc(cx, cy, p1 * maxR * 0.64, 0, 7);
        ctx.strokeStyle = `rgba(245,250,255,${(1 - p1) * 0.85})`; ctx.lineWidth = (1 - p1) * 7 + 1; ctx.stroke();
        const p2 = Math.min(1, ft / 560);    // wide body (cool amber, not pure yellow)
        ctx.beginPath(); ctx.arc(cx, cy, p2 * maxR * 0.56, 0, 7);
        ctx.strokeStyle = `rgba(255,205,150,${(1 - p2) * 0.42})`; ctx.lineWidth = (1 - p2) * 22 + 2; ctx.stroke();
        const p3 = Math.min(1, ft / 440);    // inner echo
        ctx.beginPath(); ctx.arc(cx, cy, p3 * maxR * 0.34, 0, 7);
        ctx.strokeStyle = `rgba(255,236,212,${(1 - p3) * 0.3})`; ctx.lineWidth = (1 - p3) * 6 + 1; ctx.stroke(); }

      // --- smoke ---
      for (const s of smoke) { s.age += dt; const k = s.age / s.life; if (k >= 1) continue;
        s.r += s.vr * dt; s.y += s.vy * dt;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7);
        ctx.fillStyle = `rgba(${40 - 20 * k | 0},${34 - 16 * k | 0},${30 - 14 * k | 0},${0.4 * (1 - k)})`; ctx.fill(); }

      // --- the stick: DROP from mid-screen top (straight down, accelerating), then a wobbling lit fuse ---
      if (t < tBlow) {
        let x, y, rot, scl = 1;
        if (t < THROW) { const p = easeIn(t / THROW);   // gravity: slow then fast
          x = cx + Math.sin(t / 40) * W * 0.004;        // tiny wobble as it falls
          y = (-H * 0.30) + (cy - (-H * 0.30)) * p;      // mid-screen top → center
          rot = (1 - p) * Math.PI * 3;
        } else { const fp = (t - THROW) / FUSE;
          x = cx + Math.sin(t / 55) * 4; y = cy + Math.sin(t / 80) * 3;
          rot = Math.sin(t / 90) * 0.05; scl = 1 + easeIn(fp) * 0.12; // tense swell
        }
        const tip = drawSprite(x, y, rot, scl);
        if (t >= THROW && tip) emitFuse(tip.fx, tip.fy);
      }

      // --- tumbling debris fragments (matter thrown out) ---
      for (const d of debris) { d.age += dt; const k = d.age / d.life; if (k >= 1) continue;
        d.vy += 30 * dt; d.vx *= 0.99; d.x += d.vx; d.y += d.vy; d.rot += d.vr * dt;
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
        ctx.fillStyle = `rgba(28,24,22,${0.92 * (1 - k)})`; ctx.fillRect(-d.s / 2, -d.s / 2, d.s, d.s);
        ctx.fillStyle = `rgba(255,150,70,${0.5 * (1 - k)})`; ctx.fillRect(-d.s / 2, -d.s / 2, d.s, d.s * 0.34); // hot edge
        ctx.restore(); }

      // --- sparks (drawn as streaks; white-hot core + amber embers, longer for the fast ones) ---
      for (const s of sparks) { s.age += dt; const k = s.age / s.life; if (k >= 1) continue;
        s.vy += 17 * dt; s.vx *= 0.985; s.x += s.vx; s.y += s.vy;
        ctx.strokeStyle = `hsla(${s.hue},${s.sat}%,${Math.min(99, s.lum + 14 * (1 - k))}%,${1 - k})`;
        ctx.lineWidth = s.sz * (1 - k * 0.5); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.9, s.y - s.vy * 0.9); ctx.stroke(); }

      ctx.restore();
      if (t > tEnd) { cv.style.display = 'none'; ctx.clearRect(0, 0, W, H); finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  // debug: render ONE deterministic explosion frame at age seconds (for static capture/QA)
  function still(age) {
    if (!ensure()) return; fit(); cv.style.display = 'block';
    const W = cv.width, H = cv.height, cx = W * 0.5, cy = H * 0.46, dt = 1 / 60;
    let seed = 22222; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    ctx.clearRect(0, 0, W, H);
    const FLASH = 0.11;
    if (age < FLASH) { const k = 1 - age / FLASH;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.5);
      g.addColorStop(0, `rgba(255,255,255,${0.82 * k})`);
      g.addColorStop(0.16, `rgba(255,242,214,${0.5 * k})`);
      g.addColorStop(0.46, `rgba(255,205,150,${0.14 * k})`);
      g.addColorStop(1, 'rgba(255,190,130,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(246,249,255,${0.16 * k})`; ctx.fillRect(0, 0, W, H); }
    const maxR = Math.max(W, H);
    const p1 = Math.min(1, age / 0.30); ctx.beginPath(); ctx.arc(cx, cy, p1 * maxR * 0.64, 0, 7);
    ctx.strokeStyle = `rgba(245,250,255,${(1 - p1) * 0.85})`; ctx.lineWidth = (1 - p1) * 7 + 1; ctx.stroke();
    const p2 = Math.min(1, age / 0.56); ctx.beginPath(); ctx.arc(cx, cy, p2 * maxR * 0.56, 0, 7);
    ctx.strokeStyle = `rgba(255,205,150,${(1 - p2) * 0.42})`; ctx.lineWidth = (1 - p2) * 22 + 2; ctx.stroke();
    const p3 = Math.min(1, age / 0.44); ctx.beginPath(); ctx.arc(cx, cy, p3 * maxR * 0.34, 0, 7);
    ctx.strokeStyle = `rgba(255,236,212,${(1 - p3) * 0.3})`; ctx.lineWidth = (1 - p3) * 6 + 1; ctx.stroke();
    const steps = Math.max(1, Math.round(age / dt));
    for (let i = 0; i < 34; i++) { const sx = cx + (r() * 68 - 34), sy = cy + (r() * 68 - 34); const rr0 = 18 + r() * 38, vr = 26 + r() * 44, vy = -(8 + r() * 34), life = 0.6 + r() * 0.45; const k = age / life; if (k >= 1) continue; ctx.beginPath(); ctx.arc(sx, cy + vy * age, rr0 + vr * age, 0, 7); ctx.fillStyle = `rgba(${(40 - 20 * k) | 0},${(34 - 16 * k) | 0},${(30 - 14 * k) | 0},${0.4 * (1 - k)})`; ctx.fill(); }
    for (let i = 0; i < 16; i++) { const a = r() * 6.283, sp = 7 + r() * 19; let vx = Math.cos(a) * sp, vy = Math.sin(a) * sp - (2 + r() * 7); const life = 0.7 + r() * 0.55, s = 3 + r() * 4, vr = (r() * 24 - 12); let x = cx, y = cy, rot = r() * 6.28; for (let st = 0; st < steps; st++) { vy += 30 * dt; vx *= 0.99; x += vx; y += vy; rot += vr * dt; } const k = age / life; if (k >= 1) continue; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = `rgba(28,24,22,${0.92 * (1 - k)})`; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.fillStyle = `rgba(255,150,70,${0.5 * (1 - k)})`; ctx.fillRect(-s / 2, -s / 2, s, s * 0.34); ctx.restore(); }
    for (let i = 0; i < 300; i++) { const a = r() * 6.283, sp = 6 + r() * 40; let vx = Math.cos(a) * sp, vy = Math.sin(a) * sp - r() * 8; const life = 0.40 + r() * 0.75, hue = 12 + r() * 26, hot = (i % 5 === 0), sat = hot ? 30 : 100, lum = hot ? 96 : 62, sz = 1.2 + r() * 3.2; let x = cx, y = cy; for (let s = 0; s < steps; s++) { vy += 17 * dt; vx *= 0.985; x += vx; y += vy; } const k = age / life; if (k >= 1) continue; ctx.strokeStyle = `hsla(${hue},${sat}%,${Math.min(99, lum + 14 * (1 - k))}%,${1 - k})`; ctx.lineWidth = sz * (1 - k * 0.5); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 0.9, y - vy * 0.9); ctx.stroke(); }
  }

  // colored WASH-FLOW wipe — a liquid sweep of Juice(orange) / Hype(green) / Trust(white) that floods
  // down the screen, unveils the next view at the peak, then drains off. reveal() fires mid-wash.
  const WIPE_COL = { juice: '243,160,46', hype: '69,201,126', trust: '238,241,242' };
  function wipe(key, reveal) {
    let done = false; const finish = () => { if (!done) { done = true; reveal && reveal(); } };
    if (!ensure()) { finish(); return; }
    fit(); cv.style.display = 'block';
    const W = cv.width, H = cv.height, C = WIPE_COL[key] || WIPE_COL.juice;
    const t0 = (global.performance && performance.now) ? performance.now() : 0, DUR = 820;
    try { global.SFX && SFX.play(key === 'trust' ? 'select' : 'drawMarket', 0.45); } catch (e) {}
    let raf2 = 0;
    function frame(now) {
      const t = (now - t0) / DUR; ctx.clearRect(0, 0, W, H);
      // the wash front flows downward; the band thickens to full cover at the midpoint, then drains
      const front = (-0.35 + t * 1.7) * H;                 // leading edge travels top→past bottom
      const g = ctx.createLinearGradient(0, front - H * 0.7, 0, front + H * 0.15);
      const a = t < 0.5 ? (t / 0.5) : (1 - (t - 0.5) / 0.5);  // 0→1→0 overall opacity
      g.addColorStop(0, `rgba(${C},0)`); g.addColorStop(0.65, `rgba(${C},${0.97 * a})`); g.addColorStop(1, `rgba(${C},${0.55 * a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // a brighter flowing streak for the "liquid" read
      ctx.fillStyle = `rgba(255,255,255,${0.10 * a})`; ctx.fillRect(0, front - H * 0.06, W, H * 0.05);
      if (t >= 0.5) finish();
      if (t >= 1) { cv.style.display = 'none'; ctx.clearRect(0, 0, W, H); finish(); return; }
      raf2 = requestAnimationFrame(frame);
    }
    raf2 = requestAnimationFrame(frame);
  }

  global.FX = { dynamite, still, wipe };
})(window);
