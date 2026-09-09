/* CASTLE KILLSCREEN cold-open ident (~10s). The red CK marquee lights up; the lit dynamite
   (assets/fx/dynamite.png) drops onto the peak, bounces down the castle's stepped battlements to
   the base, the fuse burns, and it BLOWS the logo. Subtle Golden Staircase bed + a boom from the
   project SFX. Sprites stolen from the sibling games (CK logo ← SUCK UP, dynamite ← the Expansion).
   Pure presentation; skippable; falls through to onDone so boot is never stranded. */
(function (global) {
  'use strict';
  let cv, ctx, logo = null, dyno = null, raf = 0, skipBound = false;
  // step corners down the RIGHT battlement, normalized to the logo's drawn rect (auto-detected)
  const WP = [[0.50, 0.123], [0.691, 0.294], [0.789, 0.437], [0.882, 0.567], [0.85, 0.93]];
  const DROP = 1200, SEG = 1050, BOUNCE_END = DROP + SEG * (WP.length - 1), BLOW = 8700, END = 10000;
  const rand = (a, b) => a + (b - a) * Math.random();
  const easeIn = t => t * t, easeOut = t => 1 - (1 - t) * (1 - t);

  function ensure() {
    cv = document.getElementById('introcv'); if (!cv) return false; ctx = cv.getContext('2d');
    if (!logo) { logo = new Image(); logo.src = 'assets/logo/castle-killscreen.png'; }
    if (!dyno) { dyno = new Image(); dyno.src = 'assets/fx/dynamite.png'; }
    return true;
  }
  function fit() { cv.width = cv.clientWidth || window.innerWidth; cv.height = cv.clientHeight || window.innerHeight; }

  function play(onDone) {
    let done = false; const finish = () => { if (done) return; done = true; cv && (cv.style.display = 'none'); if (raf) cancelAnimationFrame(raf); onDone && onDone(); };
    if (!ensure()) { finish(); return; }
    fit(); cv.style.display = 'block';
    const W = cv.width, H = cv.height;
    const aspect = (logo.naturalWidth / logo.naturalHeight) || 1.353;
    const lw = Math.min(W * 0.60, H * 0.56 * aspect), lh = lw / aspect;
    const lx = (W - lw) / 2, ly = H * 0.46 - lh / 2;
    const P = (xn, yn) => [lx + xn * lw, ly + yn * lh];
    const wp = WP.map(p => P(p[0], p[1]));
    const t0 = (global.performance && performance.now) ? performance.now() : 0;
    const sparks = []; let blown = false, lastBounce = -1;
    try { global.SFX && SFX.play('golden1', 0.32); } catch (e) {}   // subtle bed

    if (!skipBound) {
      const skip = () => finish();
      window.addEventListener('keydown', skip, { once: true });
      cv.addEventListener('click', skip, { once: true });
      skipBound = true;
    }

    function dynState(t) {
      if (t < DROP) { const p = easeIn(t / DROP); return { x: wp[0][0], y: (ly - lh * 0.42) + (wp[0][1] - (ly - lh * 0.42)) * p, rot: (1 - p) * 6, s: 1 }; }
      if (t < BOUNCE_END) { const k = Math.floor((t - DROP) / SEG), p = ((t - DROP) % SEG) / SEG;
        const A = wp[k], B = wp[k + 1]; const x = A[0] + (B[0] - A[0]) * p;
        const y = A[1] + (B[1] - A[1]) * p - Math.sin(p * Math.PI) * lh * 0.13;
        return { x, y, rot: Math.sin(t / 120) * 0.5 + (t - DROP) / 600, s: 1, bounceK: k, bp: p };
      }
      const last = wp[wp.length - 1]; return { x: last[0], y: last[1] + Math.sin(t / 70) * 2, rot: Math.sin(t / 140) * 0.06, s: 1 + (t > BLOW ? 0 : easeIn(Math.min(1, (t - BOUNCE_END) / (BLOW - BOUNCE_END))) * 0.08) };
    }
    function drawDyno(d) {
      const w = lw * 0.12, h = w * ((dyno.naturalHeight / dyno.naturalWidth) || 0.95);
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.scale(d.s, d.s);
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = w * 0.1; ctx.shadowOffsetY = h * 0.06;
      if (dyno.complete) ctx.drawImage(dyno, -w / 2, -h / 2, w, h);
      ctx.restore();
      return { fx: d.x + Math.cos(d.rot - 1.0) * w * 0.34, fy: d.y + Math.sin(d.rot - 1.0) * w * 0.34 };
    }

    function frame(now) {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      // dark crimson backdrop
      const bg = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.08, W / 2, H * 0.5, W * 0.8);
      bg.addColorStop(0, '#1a0606'); bg.addColorStop(1, '#070304'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      let shake = 0;
      if (t >= BLOW) { const ft = t - BLOW; if (ft < 180) { const k = 1 - ft / 180; shake = 16 * k; ctx.fillStyle = `rgba(255,${(200 + 55 * k) | 0},${(150 * k) | 0},${0.9 * k + 0.05})`; ctx.fillRect(0, 0, W, H); } }
      ctx.save(); if (shake) ctx.translate(rand(-shake, shake), rand(-shake, shake));

      // CK marquee — red neon glow, lights up over the first 1.2s, blows at BLOW
      if (logo.complete) {
        const fadeIn = Math.min(1, t / 900);
        let alpha = fadeIn, logoScale = 1;
        if (t >= BLOW) { const k = Math.min(1, (t - BLOW) / 900); alpha = 1 - k; logoScale = 1 + k * 0.18; }
        ctx.save(); ctx.globalAlpha = Math.max(0, alpha);
        const pulse = 0.6 + 0.4 * Math.sin(now / 240);
        ctx.shadowColor = `rgba(229,60,30,${0.7 * pulse * (t >= BLOW ? 0 : 1) + 0.15})`; ctx.shadowBlur = lw * 0.04;
        const dw = lw * logoScale, dh = lh * logoScale;
        ctx.drawImage(logo, lx - (dw - lw) / 2, ly - (dh - lh) / 2, dw, dh);
        ctx.restore();
      }

      // the dynamite (until it blows)
      if (t < BLOW + 40) {
        const d = dynState(t); const tip = drawDyno(d);
        // bounce tick + thud spark on each new step landing
        // fire on EVERY new step (no bp window — that gate skipped bounces when a frame landed late)
        if (d.bounceK != null && d.bounceK !== lastBounce) { lastBounce = d.bounceK; try { global.SFX && SFX.play('move', 0.4); } catch (e) {} for (let i = 0; i < 10; i++) { const a = rand(0, 6.283), sp = rand(1, 4); sparks.push({ x: tip.fx, y: d.y, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a) * sp), age: 0, life: 0.4, hue: rand(40, 54) }); } }
        // fuse sparks (hotter as the fuse burns down near the end)
        const rate = t > BOUNCE_END ? 4 : 1;
        for (let i = 0; i < rate; i++) sparks.push({ x: tip.fx, y: tip.fy, vx: rand(-1.5, 1.5), vy: -rand(1, 3.5), age: 0, life: rand(0.2, 0.5), hue: rand(44, 56) });
      }

      // BLOW — detonation
      if (t >= BLOW && !blown) { blown = true;
        for (let i = 0; i < 200; i++) { const a = rand(0, 6.283), sp = rand(5, 34); const c = wp[wp.length - 1]; sparks.push({ x: c[0], y: c[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(0, 8), age: 0, life: rand(0.5, 1.1), hue: rand(16, 52) }); }
        try { global.SFX && (SFX.play('burnout', 0.95), SFX.play('shadow', 0.5)); } catch (e) {}
      }
      // shockwave
      if (t >= BLOW) { const c = wp[wp.length - 1], pr = Math.min(1, (t - BLOW) / 520);
        ctx.beginPath(); ctx.arc(c[0], c[1], pr * Math.max(W, H) * 0.6, 0, 7); ctx.strokeStyle = `rgba(255,180,90,${(1 - pr) * 0.5})`; ctx.lineWidth = (1 - pr) * 24 + 2; ctx.stroke(); }

      // sparks
      for (const s of sparks) { s.age += 1 / 60; const k = s.age / s.life; if (k >= 1) continue; s.vy += 0.45; s.x += s.vx; s.y += s.vy;
        ctx.strokeStyle = `hsla(${s.hue},100%,${62 + 18 * (1 - k)}%,${1 - k})`; ctx.lineWidth = lw * 0.003 * (1 - k * 0.4) + 0.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.7, s.y - s.vy * 0.7); ctx.stroke(); }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].age >= sparks[i].life) sparks.splice(i, 1);

      ctx.restore();
      if (t >= END) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }
  global.Intro = { play };
})(window);
