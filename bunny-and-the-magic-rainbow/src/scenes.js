/* =============================================================================
 *  Bunny and the Magic Rainbow — the six scenes (choreography)
 *  CARTOON.render(ctx, t)  draws the frame at time t (seconds, 0..120) at 1920x1080.
 *  Timings match story/story.json (dialogue + sfx), which build_audio.py turns into
 *  the soundtrack and src/timeline.js (lip-sync + subtitles).
 * ========================================================================== */
(function (G) {
  "use strict";
  const K = G.CARTOON_ENGINE;
  const { W, H, TAU, clamp, lerp, prog, E, track, hopY, rng, RAINBOW } = K;
  const TL = G.TIMELINE || { lines: [], fps: 30, duration: 120 };
  const GROUND = 865;

  // ------------------------------------------------------------------ dialogue helpers
  function talk(who, t) {
    for (const L of TL.lines) {
      if (t < L.t || t >= L.t + L.dur) continue;
      if (!L.members.includes(who)) continue;
      const i = Math.floor((t - L.t) * TL.fps);
      const a = +L.env[i] || 0, b = +L.env[i + 1] || 0;
      return (a * 0.6 + b * 0.4) / 9;
    }
    return 0;
  }
  const speaking = (who, t) => talk(who, t) > 0 || TL.lines.some((L) => L.members.includes(who) && t >= L.t && t < L.t + L.dur);

  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, u) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], u))).join(",")})`;
  }
  /** x position from keys + whether walking */
  function mover(t, keys) {
    const x = track(t, keys);
    const v = Math.abs(track(t + 0.03, keys) - track(t - 0.03, keys)) / 0.06;
    return { x, walking: v > 25, dir: Math.sign(track(t + 0.03, keys) - track(t - 0.03, keys)) };
  }
  const hopCycle = (t, t0, t1, period, h) => (t > t0 && t < t1 ? hopY((t - t0) % period, 0, period, h) : 0);
  const wave = (t, base = 2.5) => base + 0.4 * Math.sin(t * 11);

  // ------------------------------------------------------------------ props
  function drawKite(c, x, y, s, t, rot = 0, tailDir = 1) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    // tail
    c.beginPath(); c.moveTo(0, 60);
    for (let i = 1; i <= 6; i++) c.lineTo(Math.sin(t * 6 + i) * 14 * tailDir, 60 + i * 22);
    c.strokeStyle = "#7A5C3E"; c.lineWidth = 3; c.stroke();
    for (let i = 1; i <= 3; i++) {
      const bx = Math.sin(t * 6 + i * 2) * 14 * tailDir, by = 60 + i * 44;
      c.fillStyle = i % 2 ? "#FF9F43" : "#FF5A5F";
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - 12, by - 8); c.lineTo(bx - 12, by + 8); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 12, by - 8); c.lineTo(bx + 12, by + 8); c.closePath(); c.fill();
    }
    // body
    c.beginPath(); c.moveTo(0, -60); c.lineTo(42, 0); c.lineTo(0, 60); c.lineTo(-42, 0); c.closePath();
    c.fillStyle = "#FF9F43"; c.fill();
    c.beginPath(); c.moveTo(0, -60); c.lineTo(42, 0); c.lineTo(-42, 0); c.closePath(); c.fillStyle = "#FF5A5F"; c.fill();
    c.beginPath(); c.moveTo(0, -60); c.lineTo(42, 0); c.lineTo(0, 60); c.lineTo(-42, 0); c.closePath();
    c.strokeStyle = K.C.outline; c.lineWidth = 5; c.lineJoin = "round"; c.stroke();
    c.beginPath(); c.moveTo(0, -60); c.lineTo(0, 60); c.moveTo(-42, 0); c.lineTo(42, 0); c.lineWidth = 3; c.stroke();
    // face
    K.ell(c, -12, 12, 4, 6, K.C.eye); K.ell(c, 12, 12, 4, 6, K.C.eye);
    c.beginPath(); c.arc(0, 20, 9, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = 3; c.stroke();
    c.restore();
  }
  function drawCan(c, x, y, rot, s = 1) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    c.beginPath(); c.moveTo(30, -10); c.lineTo(86, -44); c.lineTo(92, -36); c.lineTo(36, 8); c.closePath();
    c.fillStyle = "#3A7BD5"; c.fill(); c.strokeStyle = K.C.outline; c.lineWidth = 4; c.stroke();
    K.ell(c, 92, -42, 9, 13, "#3A7BD5", K.C.outline, 4, -0.9);
    K.rrect(c, -38, -36, 76, 62, 14); c.fillStyle = "#4D96FF"; c.fill(); c.stroke();
    c.beginPath(); c.arc(-6, -36, 26, Math.PI, TAU); c.lineWidth = 8; c.strokeStyle = K.C.outline; c.stroke();
    c.lineWidth = 5; c.strokeStyle = "#4D96FF"; c.stroke();
    K.heart(c, 0, -2, 0.7, "#FFD1E3");
    c.restore();
  }
  function drawSunflower(c, x, baseY, h, droop, t, seed, glow = 0) {
    const hx = x + Math.sin(droop * 1.1) * h * 0.3 + Math.sin(t * 1.6 + seed) * 6 * (1 - droop);
    const hy = baseY - h + droop * h * 0.28;
    c.save(); c.lineCap = "round";
    c.beginPath(); c.moveTo(x, baseY); c.quadraticCurveTo(x - 10, baseY - h * 0.55, hx, hy);
    c.strokeStyle = "#3E8E4A"; c.lineWidth = 16; c.stroke(); c.strokeStyle = "#5DBB63"; c.lineWidth = 10; c.stroke();
    for (const [k, sx] of [[0.35, -1], [0.55, 1]]) {
      const lx = x - 6, ly = baseY - h * k;
      c.save(); c.translate(lx, ly); c.rotate(sx * (0.9 + droop * 0.5));
      K.ell(c, 0, -34, 18, 36, "#5DBB63", "#3E8E4A", 4); c.restore();
    }
    c.translate(hx, hy); c.rotate(droop * 1.05 + Math.sin(t * 2 + seed) * 0.04);
    if (glow > 0) {
      const g = c.createRadialGradient(0, 0, 30, 0, 0, 200);
      g.addColorStop(0, `rgba(255,240,150,${0.8 * glow})`); g.addColorStop(1, "rgba(255,240,150,0)");
      c.fillStyle = g; c.fillRect(-200, -200, 400, 400);
    }
    const petal = mix("#FFD23F", "#D9A93A", droop);
    for (let i = 0; i < 16; i++) {
      c.save(); c.rotate((i / 16) * TAU); K.ell(c, 0, -62, 16, 30 + (1 - droop) * 4, petal, "#E39B1B", 3); c.restore();
    }
    K.circ(c, 0, 0, 44, "#8B5A2B", "#5E3A1A", 4);
    const r = rng(seed);
    for (let i = 0; i < 14; i++) K.circ(c, (r() - 0.5) * 60, (r() - 0.5) * 60, 3, "rgba(60,30,10,.45)");
    // face
    if (droop > 0.5) {
      for (const sx of [-1, 1]) { c.beginPath(); c.lineWidth = 5; c.strokeStyle = "#2D1A0A"; c.arc(sx * 15, -6, 8, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
      c.beginPath(); c.moveTo(-10, 18); c.lineTo(10, 18); c.stroke();
    } else {
      const b = K.blinkAt(t, seed);
      for (const sx of [-1, 1]) { K.ell(c, sx * 15, -8, 6, 8 * (1 - b * 0.9), "#2D1A0A"); K.circ(c, sx * 15 - 2, -11, 2.5, "#fff"); }
      K.ell(c, -26, 8, 7, 4, "rgba(255,120,140,.6)"); K.ell(c, 26, 8, 7, 4, "rgba(255,120,140,.6)");
      c.beginPath(); c.arc(0, 6, 14, 0.12 * Math.PI, 0.88 * Math.PI); c.lineWidth = 5; c.strokeStyle = "#2D1A0A"; c.stroke();
    }
    c.restore();
  }
  function lilyPad(c, x, y, s = 1, t = 0, seed = 0) {
    c.save(); c.translate(x, y); c.scale(s, s * 0.42);
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 90, 0.25, TAU - 0.15); c.closePath();
    c.fillStyle = "#4FB35E"; c.fill(); c.strokeStyle = "#2F7A3B"; c.lineWidth = 7; c.stroke();
    c.beginPath(); c.arc(0, 0, 60, 0.6, 2.2); c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 8; c.stroke();
    c.restore();
  }
  function berry(c, x, y, r = 22) {
    K.circ(c, x, y, r, "#8E44AD", "#5B2C6F", 4);
    K.circ(c, x - r * 0.35, y - r * 0.35, r * 0.28, "rgba(255,255,255,.6)");
    c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x + 6, y - r - 12, x + 14, y - r - 10);
    c.strokeStyle = "#3E8E4A"; c.lineWidth = 4; c.stroke();
  }
  function basket(c, x, y, n, glow = 0, t = 0) {
    c.save(); c.translate(x, y);
    if (glow > 0) {
      const g = c.createRadialGradient(0, -40, 10, 0, -40, 220);
      g.addColorStop(0, `rgba(200,150,255,${0.85 * glow})`); g.addColorStop(1, "rgba(200,150,255,0)");
      c.fillStyle = g; c.fillRect(-220, -260, 440, 440);
    }
    const pos = [[-30, -62], [10, -66], [44, -60], [-10, -80], [26, -84]];
    for (let i = 0; i < n; i++) berry(c, pos[i][0], pos[i][1], 20);
    c.beginPath(); c.moveTo(-80, -60); c.lineTo(80, -60); c.lineTo(62, 0); c.lineTo(-62, 0); c.closePath();
    c.fillStyle = "#D99A4E"; c.fill(); c.strokeStyle = "#8A5A2B"; c.lineWidth = 6; c.lineJoin = "round"; c.stroke();
    c.strokeStyle = "rgba(138,90,43,.6)"; c.lineWidth = 4;
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 28, -58); c.lineTo(i * 22, -2); c.stroke(); }
    c.beginPath(); c.moveTo(-76, -36); c.lineTo(76, -36); c.stroke();
    c.beginPath(); c.arc(0, -60, 70, Math.PI * 1.05, Math.PI * 1.95); c.strokeStyle = "#8A5A2B"; c.lineWidth = 9; c.stroke();
    c.restore();
  }
  function mushroom(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    K.rrect(c, -16, -50, 32, 50, 12); c.fillStyle = "#FFF4E0"; c.fill(); c.strokeStyle = K.C.outline; c.lineWidth = 4; c.stroke();
    c.beginPath(); c.arc(0, -46, 52, Math.PI, TAU); c.closePath(); c.fillStyle = "#FF5A5F"; c.fill(); c.stroke();
    for (const [dx, dy, r] of [[-26, -66, 9], [8, -80, 11], [30, -58, 7]]) K.circ(c, dx, dy, r, "#fff");
    c.restore();
  }
  function fence(c, y, x0, x1) {
    c.save(); c.fillStyle = "#F4E1C1"; c.strokeStyle = "#B08A5A"; c.lineWidth = 4;
    K.rrect(c, x0, y - 70, x1 - x0, 14, 6); c.fill(); c.stroke();
    K.rrect(c, x0, y - 36, x1 - x0, 14, 6); c.fill(); c.stroke();
    for (let x = x0 + 10; x < x1; x += 70) {
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 90); c.lineTo(x + 13, y - 104); c.lineTo(x + 26, y - 90); c.lineTo(x + 26, y); c.closePath();
      c.fill(); c.stroke();
    }
    c.restore();
  }
  function confetti(c, t, t0, n = 140) {
    if (t < t0) return;
    const r = rng(77);
    for (let i = 0; i < n; i++) {
      const x0 = r() * W, y0 = -40 - r() * 500, sp = 160 + r() * 220, rot = r() * TAU, col = RAINBOW[i % 6];
      const y = y0 + (t - t0) * sp;
      if (y > H + 40) continue;
      const x = x0 + Math.sin((t - t0) * 2 + i) * 40;
      c.save(); c.translate(x, y); c.rotate(rot + (t - t0) * 4); c.scale(1, Math.abs(Math.sin((t - t0) * 6 + i)) + 0.2);
      c.fillStyle = col; c.fillRect(-9, -5, 18, 10); c.restore();
    }
  }
  function floatingHearts(c, t, t0, n = 12) {
    if (t < t0) return;
    const r = rng(31);
    for (let i = 0; i < n; i++) {
      const x = 120 + r() * (W - 240), st = t0 + r() * 3, sp = 90 + r() * 80;
      const u = t - st; if (u < 0) continue;
      const y = H - 120 - u * sp; if (y < -50) continue;
      c.save(); c.globalAlpha = clamp(1 - (H - 120 - y) / 900);
      K.heart(c, x + Math.sin(u * 2 + i) * 30, y, 1.3 + r(), ["#FF6FA8", "#FF9DB5", "#FF5A5F"][i % 3]); c.restore();
    }
  }
  function ripple(c, x, y, t, t0, max = 140) {
    const u = (t - t0) / 1.2; if (u < 0 || u > 1) return;
    for (const k of [0, 0.25]) {
      const v = u - k; if (v < 0) continue;
      K.ell(c, x, y, max * v, max * v * 0.3, null, `rgba(255,255,255,${0.8 * (1 - v)})`, 5);
    }
  }
  function dizzyStars(c, x, y, t) {
    for (let i = 0; i < 4; i++) {
      const a = t * 5 + (i * TAU) / 4;
      K.star(c, x + Math.cos(a) * 80, y + Math.sin(a) * 22, 16, t * 3, 5, 0.5);
      c.fillStyle = "#FFD93D"; c.fill(); c.strokeStyle = "#E39B1B"; c.lineWidth = 3; c.stroke();
    }
  }

  // ------------------------------------------------------------------ backgrounds (shared)
  function homeHill(c, t, dayU, sunY, sunMood, wink, rbFills, rbAlpha, rbPaint, rbWob) {
    K.sky(c, mix("#FFC9A8", "#7CC6F6", dayU), mix("#FFE9C7", "#E4F6FF", dayU));
    K.sun(c, 1560, sunY, 95, t, sunMood, wink);
    K.rainbow(c, 960, 900, 760, 36, rbFills, rbAlpha, rbPaint, rbWob);
    K.cloud(c, ((180 + t * 14) % 2400) - 200, 170, 0.9, t, true, 1);
    K.cloud(c, ((1100 + t * 10) % 2400) - 200, 300, 0.7, t, true, 2);
    K.cloud(c, ((1900 + t * 12) % 2400) - 200, 130, 0.6, t, false, 3);
    K.hill(c, [[-100, 640], [300, 560], [700, 650], [1100, 580], [1500, 640], [2020, 560]], "#7FCB7A", "#A8E39C");
    for (const [x, s, sd] of [[180, 0.75, 1], [1240, 0.65, 2], [1760, 0.8, 3]]) K.tree(c, x, 700, s, t, "#6DCB78", "#4FA85C", sd, sd === 3);
    K.hill(c, [[-100, 800], [400, 770], [900, 800], [1400, 780], [2020, 800]], "#5DBB63", "#8FD685");
    // burrow mound
    c.save();
    K.ell(c, 560, 870, 250, 170, "#6CC56E", "#4FA85C", 6);
    c.beginPath(); c.ellipse(560, 870, 250, 170, 0, Math.PI, TAU); c.clip();
    K.grassTufts(c, 720, t, 5, 12, "#4FA85C");
    c.restore();
    K.circ(c, 560, 800, 74, "#5A3D2A", "#4A3020", 6);
    const doorOpen = clamp(prog(t, 4.95, 5.25) * (t < 20 ? 1 : 0)) || (t >= 20 ? 1 : 0);
    const dw = lerp(1, 0.12, E.out(doorOpen));
    c.save(); c.translate(560 - 74 + 74 * dw, 800); c.scale(dw, 1);
    K.circ(c, 0, 0, 72, "#C98B5A", "#7A4F2E", 6);
    c.strokeStyle = "#A9713F"; c.lineWidth = 5;
    for (const dx of [-30, 0, 30]) { c.beginPath(); c.moveTo(dx, -62); c.lineTo(dx, 62); c.stroke(); }
    K.circ(c, 40, 6, 8, "#FFD23F", "#7A4F2E", 3);
    c.restore();
    K.circ(c, 690, 750, 28, "#BDE7FF", "#7A4F2E", 6); // window
    c.beginPath(); c.moveTo(690, 722); c.lineTo(690, 778); c.moveTo(662, 750); c.lineTo(718, 750); c.strokeStyle = "#7A4F2E"; c.lineWidth = 4; c.stroke();
    mushroom(c, 330, 880, 1); mushroom(c, 395, 890, 0.6);
  }
  function foregroundFlowers(c, t, seed, y0 = 930) {
    const r = rng(seed);
    for (let i = 0; i < 22; i++) {
      const x = r() * W, y = y0 + r() * 120;
      K.flower(c, x, y, 0.9 + r() * 0.5, t, ["#FF6FA8", "#FFD93D", "#9B5DE5", "#FF9F43", "#4D96FF", "#FFFFFF"][i % 6], i);
    }
  }
  function ground(c, y, col1, col2) {
    const g = c.createLinearGradient(0, y - 40, 0, H);
    g.addColorStop(0, col1); g.addColorStop(1, col2);
    c.fillStyle = g; c.fillRect(-400, y - 40, W + 800, H - y + 600);
  }

  // ================================================================== SCENE 1 — Good morning! (0–20)
  function scene1(c, t) {
    const dayU = E.inOut(prog(t, 1.5, 7));
    const sunY = track(t, [[2.4, 780], [6.6, 210, E.out]]);
    const sunMood = t < 7.2 ? "sleepy" : "happy";
    const wink = t > 9.9 && t < 10.6 ? 1 : 0;
    const drain = prog(t, 13.0, 13.55);
    const fills = [0, 1, 2, 3, 4, 5].map(() => 1 - drain);
    const wob = t > 11.8 && t < 13.05 ? Math.sin((t - 11.8) * 30) * 0.5 * prog(t, 11.8, 12.3) : 0;
    const rbA = lerp(1, 0.75, drain);

    // camera zoom on "Oh no!"
    const z = track(t, [[13.7, 1], [14.3, 1.16], [16.9, 1.16], [17.4, 1]]);
    c.save();
    c.translate(820, 700); c.scale(z, z); c.translate(-820, -700);
    homeHill(c, t, dayU, sunY, sunMood, wink, fills, rbA, null, wob);
    // shimmer on the rainbow before it vanishes
    if (t < 12) K.twinkleField(c, t, 4, 14, 260, 200, 1400, 400);

    // birds
    for (let i = 0; i < 3; i++) {
      const bx = -120 + (t - 3 - i * 0.35) * 420, by = 330 + i * 40 + Math.sin(t * 3 + i) * 14;
      if (t > 3 && bx < W + 100) K.smallBird(c, bx, by, 0.9, t, i);
    }
    // butterflies
    if (t > 6) {
      K.butterfly(c, 1080 + 240 * Math.sin(t * 0.7), 640 + 70 * Math.sin(t * 1.9), 1.1, t, "#FF9DB5", 1);
      K.butterfly(c, 300 + 160 * Math.sin(t * 0.9 + 2), 560 + 60 * Math.sin(t * 1.5), 0.9, t, "#9B5DE5", 2);
    }

    // ---- Bobo
    if (t >= 5.0) {
      let x, y, s = 1, sq = 1, expr = "happy", armL, armR, look = [0, 0], earUp = 0, face = 1, walking = false, walk = 0;
      const tk = talk("bobo", t);
      if (t < 5.75) { // jump out of the door
        const u = prog(t, 5.0, 5.75);
        x = lerp(560, 820, u); y = lerp(830, GROUND, u) - 4 * 170 * u * (1 - u); s = lerp(0.8, 1, u); sq = 1.08;
        armL = armR = 2.4;
      } else {
        x = 820; y = GROUND;
        sq = 1 - 0.14 * Math.sin(Math.PI * prog(t, 5.75, 6.0));
        if (t > 6.0 && t < 7.7) { // big stretch + yawn
          const u = Math.sin(Math.PI * prog(t, 6.0, 7.7));
          armL = armR = lerp(0.3, 2.9, u); sq = 1 + 0.1 * u; expr = "sleepy";
        }
        if (t > 8.2 && t < 11) { armR = wave(t); look = [0.6, -0.6]; }
        if (t >= 11 && t < 13) { look = [0, -1]; }
        if (t >= 11.8 && t < 13) expr = "o";
        if (t >= 13 && t < 14.3) { expr = "surprised"; earUp = 1; look = [0, -1]; }
        if (t >= 14.1 && t < 14.6) y -= hopY(t, 14.1, 0.45, 70);
        if (t >= 14.3 && t < 17.1) { expr = "worried"; armL = armR = 2.75; earUp = 0.5; look = [0, -0.6]; }
        if (t >= 17.1 && t < 17.6) { expr = "determined"; armR = 3.0; }
        if (t >= 17.6) { // hop away
          x = track(t, [[17.6, 820], [19.9, 2200, E.in]]);
          y = GROUND - hopCycle(t, 17.6, 25, 0.7, 95);
          expr = "happy"; armL = armR = 1.6;
        }
      }
      let e2 = expr;
      if (expr === "sleepy") {} // yawn mouth handled via talk
      K.drawBobo(c, { x, y, s, sq, t, face, expr: e2, talk: expr === "sleepy" ? 0.85 * Math.sin(Math.PI * prog(t, 6.2, 7.5)) : tk, armL, armR, look, earUp, walking, walk, ground: GROUND });
    }
    // stars fly away
    if (t > 12.95 && t < 14.6) {
      const ends = [[-200, 120], [260, -220], [820, -260], [1240, -260], [2120, -60], [2160, 360]];
      for (let i = 0; i < 6; i++) {
        const R = 760 - i * 36, a = Math.PI + ((i + 0.5) / 6) * Math.PI;
        const sx = 960 + Math.cos(a) * R, sy = 900 + Math.sin(a) * R;
        const u = E.in(prog(t, 13.0 + i * 0.05, 14.3 + i * 0.05));
        const cx = (sx + ends[i][0]) / 2, cy = Math.min(sy, ends[i][1]) - 200;
        const x = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cx + u * u * ends[i][0];
        const y = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cy + u * u * ends[i][1];
        for (let k = 1; k <= 4; k++) { c.globalAlpha = 0.18 * (5 - k) / 4; K.circ(c, x - (x - sx) * 0.04 * k, y - (y - sy) * 0.04 * k, 20, RAINBOW[i]); }
        c.globalAlpha = 1;
        K.colorStar(c, x, y, 38, RAINBOW[i], t, t * 3);
      }
      K.sparkles(c, 960, 300, t, 13.0, 16, 380, "#FFFFFF", 9);
    }
    foregroundFlowers(c, t, 11);
    c.restore();
  }

  // ================================================================== SCENE 2 — Mimi & the kite (20–40)
  const slopeY = (x) => (x < 470 ? 470 + (GROUND - 470) * E.inOut(clamp((x + 140) / 610)) : GROUND);
  function scene2(c, t) {
    K.sky(c, "#74C3F5", "#E6F7FF");
    K.sun(c, 1700, 150, 70, t, "happy");
    K.cloud(c, ((600 + t * 12) % 2400) - 200, 200, 0.8, t, true, 4);
    K.cloud(c, ((1500 + t * 9) % 2400) - 200, 120, 0.6, t, false, 5);
    K.hill(c, [[-100, 700], [500, 640], [1000, 700], [1500, 630], [2020, 690]], "#86D07E", "#B2E8A6");
    for (const [x, s, sd] of [[860, 0.55, 3], [1020, 0.45, 4]]) K.tree(c, x, 720, s, t, "#79D282", "#5DBB63", sd);
    ground(c, GROUND, "#7DD072", "#5BB653");
    // the slope Mimi rolls down
    c.beginPath(); c.moveTo(-200, H); c.lineTo(-200, slopeY(-140));
    for (let x = -140; x <= 700; x += 20) c.lineTo(x, slopeY(x));
    c.lineTo(700, H); c.closePath();
    const g = c.createLinearGradient(0, 460, 0, H); g.addColorStop(0, "#9BE08F"); g.addColorStop(1, "#5BB653"); c.fillStyle = g; c.fill();
    K.grassTufts(c, 900, t, 21, 26);
    for (let i = 0; i < 6; i++) K.flower(c, 40 + i * 70, slopeY(40 + i * 70) + 20, 0.8, t, ["#FF6FA8", "#FFD93D", "#9B5DE5"][i % 3], i);

    // big tree (+ rustle shake)
    const shake = t > 34.5 && t < 35.3 ? Math.sin(t * 60) * 7 : 0;
    // branch for Pip
    c.save(); c.lineCap = "round";
    c.beginPath(); c.moveTo(1500, 640); c.quadraticCurveTo(1580, 600, 1700, 590);
    c.strokeStyle = "#6E4A30"; c.lineWidth = 26; c.stroke(); c.strokeStyle = "#9C6B45"; c.lineWidth = 18; c.stroke(); c.restore();
    K.tree(c, 1450 + shake, 880, 1.6, t, "#5CC46E", "#46A85A", 7, true);

    // ---- kite
    const kiteFree = t >= 35.1, pipHas = t >= 36.2;
    // ---- Bobo
    const bx = mover(t, [[20, -150], [21.2, 560, E.out], [29.4, 560], [29.8, 560], [31.3, 560], [32.9, 1060], [33.9, 1060]]);
    let bX = bx.x, bY = GROUND, bArmL, bArmR, bExpr = "happy", bFace = 1, bLook = [0, 0], bSq = 1;
    if (t < 21.2) bY -= hopCycle(t, 20, 21.2, 0.6, 80);
    if (t >= 21.0 && t < 30.4) bFace = -1;
    if (t >= 21.0 && t < 23.2) bExpr = "o";
    if (t >= 23.2 && t < 23.5) bExpr = "surprised";
    if (t >= 25.6 && t < 27.6) bArmR = wave(t);  // facing left -> wave with far arm
    if (t >= 28.7 && t < 29.4) { bY -= hopY(t, 28.8, 0.5, 70); bArmL = bArmR = 2.6; }
    if (t >= 29.5 && t < 30.3) { bArmL = track(t, [[29.5, 0.3], [29.85, 2.5, E.out]]); bExpr = "laugh"; }
    if (t >= 30.4 && t < 31.3) { bLook = [0.8, -0.8]; bExpr = "o"; }
    if (t >= 33.9 && t < 35.4) { // jump onto Mimi's head
      const u = prog(t, 33.9, 34.4);
      bX = lerp(1060, 1180, u); bY = lerp(GROUND, GROUND - 262, u) - 4 * 120 * u * (1 - u);
      if (t >= 34.4) { bX = 1180 + Math.sin(t * 9) * 4; bY = GROUND - 262 + Math.sin(t * 9) * 2; bArmL = 2.4; bArmR = 2.75; bSq = 1.06; bLook = [0.8, -1]; bExpr = t > 35.1 ? "laugh" : "determined"; }
      else { bArmL = bArmR = 2.2; }
    }
    if (t >= 35.4 && t < 40) { // hop down with the kite
      const u = prog(t, 35.4, 35.9);
      bX = lerp(1180, 1020, u); bY = lerp(GROUND - 262, GROUND, u) - 4 * 80 * u * (1 - u);
      if (t >= 35.9) { bX = 1020; bY = GROUND; }
      bArmR = t < 36.2 ? 2.4 : 0.3;
      if (t > 36.2) bLook = [-0.6, -0.8];
      if (t >= 37.9 && t < 39.3) { bY -= hopY(t, 37.95, 0.55, 90); bArmL = bArmR = 2.8; bExpr = "laugh"; }
      if (t >= 39.1) { bX = track(t, [[39.1, 1020], [40, 1600]]); }
    }
    // ---- Mimi
    let mX, mY = GROUND, mRot = 0, mSit = 0, mExpr = "happy", mArmL, mArmR, mFace = 1, mSq = 1, mLook = [0, 0], mWalk = false;
    if (t < 21.6) { mX = -400; }
    else if (t < 23.15) { // roll down the slope
      mX = track(t, [[21.6, -160], [23.15, 330, E.in]]); mY = slopeY(mX) + 10; mRot = (mX + 160) / 80; mSq = 0.85; mExpr = "laugh"; mArmL = mArmR = 2.2;
    } else {
      mX = mover(t, [[23.15, 330], [29.45, 330], [29.85, 380], [31.2, 380], [32.9, 1180]]).x;
      mWalk = (t > 29.45 && t < 29.85) || (t > 31.2 && t < 32.9);
      if (t < 24.9) { mSit = 1; mSq = 1 - 0.15 * Math.sin(Math.PI * prog(t, 23.15, 23.4)); }
      else if (t < 25.2) mSit = 1 - prog(t, 24.9, 25.2);
      mExpr = t < 23.6 ? "dizzy" : t < 25.4 ? "laugh" : "happy";
      if (t >= 28.7 && t < 29.4) { mY -= hopY(t, 28.8, 0.5, 60); mArmL = mArmR = 2.6; mExpr = "laugh"; }
      if (t >= 29.5 && t < 30.3) { mArmR = track(t, [[29.5, 0.3], [29.85, 2.5, E.out]]); mExpr = "laugh"; }
      if (t >= 30.4 && t < 31.2) mLook = [0.8, -0.8];
      if (t >= 32.9 && t < 33.9) { mArmL = mArmR = 1.3; mFace = -1; }
      if (t >= 33.9 && t < 35.5) { mExpr = "grin"; mArmL = mArmR = 2.9; mRot = Math.sin(t * 9) * 0.04; mSq = 0.96; }
      if (t >= 37.9 && t < 39.3) { mY -= hopY(t, 37.95, 0.55, 70); mArmL = mArmR = 2.8; mExpr = "laugh"; }
      if (t >= 39.1) { mX = track(t, [[39.1, 1180], [40, 1800]]); mWalk = true; }
    }
    // draw order: Mimi (back) then Bobo when stacked
    const walkPh = t * 13;
    const kitePaw = () => [bX + 46 + Math.sin(2.75) * 54, bY - 128 + Math.cos(2.75) * 54];
    K.drawMimi(c, { x: mX, y: mY, t, face: mFace, rot: mRot, sit: mSit, sq: mSq, expr: mExpr, talk: talk("mimi", t), armL: mArmL, armR: mArmR, look: mLook, walking: mWalk, walk: walkPh, ground: t > 23.1 ? GROUND : null });
    if (t >= 23.15 && t < 24.6) dizzyStars(c, mX, GROUND - 330 + 40, t);
    K.drawBobo(c, { x: bX, y: bY, t, face: bFace, expr: bExpr, talk: talk("bobo", t), armL: bArmL, armR: bArmR, look: bLook, sq: bSq, walking: bx.walking && t > 21.2, walk: walkPh, ground: t > 33.9 && t < 35.9 ? null : GROUND });
    K.sparkles(c, 478, 670, t, 29.9, 12, 150, "#FFD93D", 3);
    if (t >= 29.85 && t < 30.4) { c.save(); c.globalAlpha = 1 - prog(t, 29.85, 30.4); K.outlinedText(c, "High five!", 480, 520, 64, "#FF6FA8"); c.restore(); }

    // ---- Pip + kite
    let pX = 1640, pY = 556, pFly = false, pFace = -1;
    if (t >= 35.6 && t < 36.3) { const u = E.inOut(prog(t, 35.6, 36.2)); pX = lerp(1640, 1150, u); pY = lerp(556, 520, u) - 60 * Math.sin(Math.PI * u); pFly = true; }
    if (t >= 36.3) { const u = E.inOut(prog(t, 36.3, 39.6)); pX = lerp(1150, -200, u) + Math.sin(u * 7) * 60; pY = lerp(520, 150, E.out(prog(t, 36.3, 37.6))); pFly = true; }
    if (t < 35.6) pY += -Math.abs(Math.sin(t * 5)) * (t > 30.4 && t < 32.5 ? 14 : 4);
    let kX = 1255, kY = 380, kRot = 0.3 + Math.sin(t * 2) * 0.05;
    if (kiteFree && !pipHas) { [kX, kY] = kitePaw(); kY -= 70; kRot = 0.1; if (t >= 35.9) { kX = 1020 + 46 + Math.sin(2.4) * 54; kY = GROUND - 128 + Math.cos(2.4) * 54 - 70; } }
    if (pipHas) { kX = pX + 160; kY = pY + 120 + Math.sin(t * 3) * 10; kRot = -0.4 + Math.sin(t * 3) * 0.15; }
    if (pipHas) { c.beginPath(); c.moveTo(pX + 10, pY + 30); c.quadraticCurveTo(pX + 80, pY + 140, kX, kY + 40); c.strokeStyle = "rgba(90,70,60,.8)"; c.lineWidth = 3; c.stroke(); }
    drawKite(c, kX, kY, 0.9, t, kRot);
    K.drawPip(c, { x: pX, y: pY, t, face: pFace, flying: pFly, talk: talk("pip", t) });
    if (t > 30.4 && t < 32.5) { // Pip points at the kite: little arrow sparkles
      for (let i = 0; i < 3; i++) { const u = ((t * 1.5 + i / 3) % 1); c.globalAlpha = 1 - u; K.star(c, lerp(1580, 1320, u), lerp(530, 400, u), 10, 0, 4, 0.4); c.fillStyle = "#FFF"; c.fill(); }
      c.globalAlpha = 1;
    }
    K.sparkles(c, 1255, 380, t, 35.1, 12, 170, "#FFD93D", 5);
    foregroundFlowers(c, t, 12, 950);
  }

  // ================================================================== SCENE 3 — Thirsty sunflowers (40–60)
  const SF = [[1060, 300], [1230, 340], [1400, 320], [1570, 360], [1740, 420]];
  const GROW = [47.9, 48.5, 49.1, 49.7, 50.3];
  function sunflowerHead(i, t) {
    const [x, h] = SF[i];
    const d = 1 - E.elastic(prog(t, GROW[i], GROW[i] + 0.9));
    return [x + Math.sin(d * 1.1) * h * 0.3, 880 - h + d * h * 0.28];
  }
  function scene3(c, t) {
    K.sky(c, "#8FD3FF", "#FFF4CC");
    K.sun(c, 1780, 130, 72, t, "happy");
    K.cloud(c, ((900 + t * 11) % 2400) - 200, 180, 0.7, t, true, 6);
    K.hill(c, [[-100, 660], [600, 620], [1200, 670], [2020, 610]], "#BFE38A", "#E6F5A9");
    // crop stripes
    c.save(); c.globalAlpha = 0.25; c.strokeStyle = "#9CCB5A"; c.lineWidth = 6;
    for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(-100, 690 + i * 24); c.quadraticCurveTo(960, 650 + i * 26, 2020, 690 + i * 24); c.stroke(); }
    c.restore();
    // background mini sunflowers
    for (let i = 0; i < 14; i++) { const x = 80 + i * 140; K.circ(c, x, 700 + (i % 2) * 12, 14, "#FFD23F", "#E39B1B", 3); K.circ(c, x, 700 + (i % 2) * 12, 6, "#8B5A2B"); }
    fence(c, 790, -20, 1940);
    ground(c, 840, "#8BD47A", "#62B957");
    K.grassTufts(c, 860, t, 31, 26);

    // sunflowers
    for (let i = 0; i < 5; i++) {
      const [x, h] = SF[i];
      const d = 1 - E.elastic(prog(t, GROW[i], GROW[i] + 0.9));
      const glow = i === 4 ? Math.max(0, Math.sin(Math.PI * prog(t, 50.9, 52.0))) : 0;
      drawSunflower(c, x, 880, h * (i === 4 ? lerp(1, 1.06, prog(t, 50.9, 51.3)) : 1), d, t, 40 + i, glow);
    }
    // ---- Bizzy
    let zX, zY, zFace = -1, zRot = 0;
    if (t < 40.4) { zX = 2200; zY = 300; }
    else if (t < 43.2) {
      const u = prog(t, 40.4, 43.2);
      zX = lerp(2050, 820, E.out(u)) + 130 * Math.sin(u * TAU * 1.5) * (1 - u);
      zY = 500 + 130 * Math.cos(u * TAU * 1.5) * (1 - u) - 60 * (1 - u); zRot = Math.sin(u * TAU * 1.5) * 0.4 * (1 - u);
    } else if (t < 52.6) {
      const u = E.inOut(prog(t, 44.2, 45.4));
      zX = lerp(820, 940, u); zY = lerp(500, 360, u) + Math.sin(t * 4) * 12;
      if (t > 46) zFace = 1;
    } else if (t < 54.6) {
      const u = prog(t, 52.6, 54.6), a = u * TAU * 1.5;
      zX = 1360 + 330 * Math.sin(a); zY = 330 + 70 * Math.sin(2 * a); zFace = Math.cos(a) > 0 ? 1 : -1; zRot = Math.sin(a) * 0.25;
    } else { zX = 1360 + Math.sin(t * 1.5) * 30; zY = 300 + Math.sin(t * 4) * 12; zFace = -1; }
    if (t > 52.6 && t < 56) for (let i = 0; i < 3; i++) { const u = ((t - 52.6) * 0.8 + i / 3) % 1; c.globalAlpha = 1 - u; K.heart(c, zX + (i - 1) * 40, zY - 60 - u * 120, 1.2, "#FF6FA8"); c.globalAlpha = 1; }

    // ---- Mimi with watering can
    const mm = mover(t, [[40, -250], [41.8, 380, E.out], [46.6, 380], [47.3, 840]]);
    let mX = mm.x, mY = GROUND, mArmL, mArmR = 0.9, mExpr = "happy", mLook = [0, 0], mFace = 1;
    const canOn = t >= 44.8;
    const pour = t >= 47.4 && t < 50.8 ? Math.sin(Math.PI * prog(t, 47.4, 50.8)) : 0;
    if (t > 41.3 && t < 44.1) { mLook = [1, -0.4]; mExpr = "o"; }
    if (t >= 44.8 && t < 45.9) { mArmR = 2.3; mY -= hopY(t, 44.85, 0.4, 40); }
    if (t >= 54.8) { mY -= hopCycle(t, 54.9, 58.2, 0.8, 50); mArmL = 2.7; mArmR = 2.0; mExpr = "laugh"; }
    if (t >= 58.2) { mX = track(t, [[58.2, 840], [60, 2100]]); }
    const canScale = canOn ? E.back(prog(t, 44.8, 45.1)) : 0;
    K.drawMimi(c, {
      x: mX, y: mY, t, face: mFace, expr: mExpr, talk: talk("mimi", t), armL: mArmL, armR: mArmR, look: mLook,
      walking: mm.walking || t >= 58.2, walk: t * 13, ground: GROUND,
      hold: canOn ? (cc, px, py) => drawCan(cc, px + 30, py - 10, -0.1 - pour * 0.65, canScale) : null,
    });
    // water stream
    if (pour > 0.05) {
      const sx = mX + 60 + Math.sin(mArmR) * 58 + 30 + 85, sy = mY - 134 + Math.cos(mArmR) * 58 - 10 - 20;
      const tau = t - 47.4, idx = clamp(Math.floor((tau + 0.2) / 0.6), 0, 4);
      const [tx, ty] = sunflowerHead(idx, t);
      for (let k = 0; k < 18; k++) {
        const u = ((t * 2.2 + k / 18) % 1);
        const x = lerp(sx, tx, u), y = lerp(sy, ty - 40, u) - Math.sin(Math.PI * u) * 160;
        K.ell(c, x, y, 7, 10, "rgba(120,190,255,.85)", "rgba(255,255,255,.8)", 2);
      }
      for (let k = 0; k < 5; k++) { const u = ((t * 1.8 + k / 5) % 1); K.circ(c, tx + (k - 2) * 18, ty - 40 + u * 90, 5, `rgba(120,190,255,${1 - u})`); }
    }
    // ---- Bobo
    const bm = mover(t, [[40, -100], [41.8, 560, E.out], [46.5, 560], [47.3, 640]]);
    let bX = bm.x, bY = GROUND, bArmL, bArmR, bExpr = "happy", bLook = [0, 0];
    if (t > 41.3 && t < 44.1) { bLook = [1, -0.5]; bExpr = "o"; }
    if (t >= 46.3 && t < 47.0) { bArmR = 2.9; bY -= hopY(t, 46.35, 0.5, 60); bExpr = "determined"; }
    for (const g of GROW) if (t >= g && t < g + 0.45) { bY -= hopY(t, g, 0.45, 55); bArmL = bArmR = 2.6; bExpr = "laugh"; }
    if (t >= 50.9 && t < 52.4) { bExpr = "surprised"; bLook = [1, -1]; }
    if (t >= 54.8) { bY -= hopCycle(t, 55.3, 58.2, 0.8, 60); bArmL = 2.2; bArmR = 2.7; bExpr = "laugh"; }
    if (t >= 58.2) { bX = track(t, [[58.2, 640], [60, 1900]]); }
    K.drawBobo(c, { x: bX, y: bY, t, face: 1, expr: bExpr, talk: talk("bobo", t), armL: bArmL, armR: bArmR, look: bLook, walking: bm.walking || t >= 58.2, walk: t * 13, ground: GROUND });

    K.drawBizzy(c, { x: zX, y: zY, t, face: zFace, rot: zRot, talk: talk("bizzy", t) });
    if (t > 41.3 && t < 44.1) { // Bizzy points at the flowers
      for (let i = 0; i < 3; i++) { const u = ((t * 1.4 + i / 3) % 1); c.globalAlpha = 1 - u; K.star(c, lerp(900, 1240, u), lerp(470, 560, u), 10, 0, 4, 0.4); c.fillStyle = "#FFF"; c.fill(); }
      c.globalAlpha = 1;
    }
    for (let i = 0; i < 5; i++) K.sparkles(c, ...sunflowerHead(i, t), t, GROW[i] + 0.1, 8, 110, "#FFE066", 50 + i);
    foregroundFlowers(c, t, 13, 960);
  }

  // ================================================================== SCENE 4 — Hoppy's pond (60–80)
  const PADS = [[720, 860], [960, 885], [1200, 860], [1460, 885], [1700, 860]];
  function scene4(c, t) {
    K.sky(c, "#7FCBF7", "#E3F6FF");
    K.cloud(c, ((300 + t * 12) % 2400) - 200, 160, 0.85, t, true, 7);
    K.cloud(c, ((1300 + t * 8) % 2400) - 200, 260, 0.6, t, false, 8);
    K.hill(c, [[-100, 640], [400, 600], [900, 650], [1400, 590], [2020, 640]], "#7FCB7A", "#A8E39C");
    for (let i = 0; i < 8; i++) K.tree(c, 120 + i * 250, 720, 0.5 + (i % 3) * 0.08, t, i % 2 ? "#6DCB78" : "#5CBF6A", "#46A85A", i);
    ground(c, 780, "#86D57A", "#5BB653");
    // pond
    const pg = c.createLinearGradient(0, 720, 0, 1040);
    pg.addColorStop(0, "#7FD3FF"); pg.addColorStop(1, "#3E9BE0");
    K.ell(c, 1180, 880, 720, 150, "#5BB653");
    K.ell(c, 1180, 880, 700, 136, pg, "#2F86C9", 6);
    c.save(); c.beginPath(); c.ellipse(1180, 880, 700, 136, 0, 0, TAU); c.clip();
    c.strokeStyle = "rgba(255,255,255,.45)"; c.lineWidth = 5; c.lineCap = "round";
    for (let i = 0; i < 14; i++) {
      const x = 520 + ((i * 197 + t * 40) % 1300), y = 790 + (i % 5) * 42;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 50, y); c.stroke();
    }
    c.restore();
    // cattails & rocks
    for (const [x, h] of [[500, 160], [530, 200], [1860, 180], [1890, 140]]) {
      c.strokeStyle = "#4FA85C"; c.lineWidth = 7; c.beginPath(); c.moveTo(x, 880); c.quadraticCurveTo(x + 10, 880 - h / 2, x + Math.sin(t * 1.5 + x) * 8, 880 - h); c.stroke();
      K.ell(c, x + Math.sin(t * 1.5 + x) * 8, 880 - h + 20, 10, 26, "#8B5A2B", "#5E3A1A", 3);
    }
    K.ell(c, 430, 900, 60, 34, "#B8B8C8", "#7A7A90", 5); K.ell(c, 1920, 920, 70, 40, "#B8B8C8", "#7A7A90", 5);

    // ---- lily pads (pad 0 flies onto Mimi's head at the splash)
    const HOPS = [66.0, 67.2, 68.4];
    for (let i = 0; i < 5; i++) {
      if (i === 0 && t >= 71.2) continue;
      let dy = 0;
      HOPS.forEach((h, k) => { if (k === i && t > h + 0.5) dy += Math.sin((t - h - 0.5) * 14) * 8 * Math.exp(-(t - h - 0.5) * 4); });
      lilyPad(c, PADS[i][0], PADS[i][1] + dy, 1, t, i);
      if (i === 1 || i === 3) K.flower(c, PADS[i][0] + 50, PADS[i][1] - 4 + dy, 0.6, t, "#FF9DB5", i);
    }
    HOPS.forEach((h, k) => ripple(c, PADS[k][0], PADS[k][1], t, h + 0.5));
    ripple(c, 720, 880, t, 71.2, 260);
    ripple(c, 1460, 885, t, 60.95, 120);

    // ---- Hoppy
    let hX = 1460, hY = 885, hRot = 0, hSq = 1, hExpr = "happy";
    if (t < 60.95) { const u = prog(t, 60.45, 60.95); hX = lerp(1700, 1460, u); hY = lerp(860, 885, u) - 4 * 110 * u * (1 - u); }
    if (t > 74.6 && t < 75.5) { hY -= hopY(t, 74.6, 0.9, 190); hRot = -TAU * E.inOut(prog(t, 74.65, 75.4)); }
    if (t > 66 && t < 69.2) hSq = 1 + 0.06 * Math.sin(t * 16);
    if (t >= 71.3 && t < 72) hExpr = "o";
    if (t >= 72 || (t >= 66 && t < 69.2)) hExpr = "laugh";
    K.shadow(c, hX, 885, 60, 885 - hY);
    K.drawHoppy(c, { x: hX, y: hY, t, face: -1, rot: hRot, sq: hSq, expr: hExpr, talk: talk("hoppy", t), s: 1.05 });

    // ---- Bobo: walk in, then hop across 3 pads
    const bm = mover(t, [[60, -100], [61.4, 330, E.out]]);
    let bX = bm.x, bY = GROUND, bArmL, bArmR, bExpr = "happy", bFace = 1, bLook = [0, 0];
    if (t >= 64 && t < 65.4) { bY -= hopY(t, 64.4, 0.45, 50); bArmR = 2.8; }
    const from = [[330, GROUND], PADS[0], PADS[1]];
    for (let k = 0; k < 3; k++) {
      const h = HOPS[k];
      if (t >= h) {
        const u = prog(t, h, h + 0.5);
        bX = lerp(from[k][0], PADS[k][0], u); bY = lerp(from[k][1], PADS[k][1], u) - 4 * 150 * u * (1 - u);
        if (u < 1) { bArmL = bArmR = 2.5; bExpr = "laugh"; }
      }
    }
    if (t >= 69.0) bFace = -1;
    if (t >= 71.2 && t < 71.9) { bExpr = "surprised"; }
    if (t >= 71.9) { bExpr = "laugh"; bArmL = 1.2 + Math.sin(t * 8) * 0.3; bArmR = 1.2 + Math.sin(t * 8 + 1) * 0.3; }
    if (t >= 76.9) { bY -= hopCycle(t, 77, 80, 0.7, 30); }
    K.drawBobo(c, { x: bX, y: bY, t, face: bFace, expr: bExpr, talk: talk("bobo", t), armL: bArmL, armR: bArmR, look: bLook, walking: bm.walking, walk: t * 13, ground: bY <= GROUND + 30 && t < 66 ? GROUND : null });

    // ---- Mimi: walk in, jump, SPLASH
    const mm = mover(t, [[60, -260], [61.4, 170, E.out], [66.2, 170], [66.9, 360]]);
    let mX = mm.x, mY = GROUND, mArmL, mArmR, mExpr = "happy", inWater = false, mRot = 0;
    if (t >= 69.5 && t < 70.5) { mArmL = mArmR = 2.6; mY -= hopY(t, 69.6, 0.4, 30); }
    if (t >= 70.5 && t < 71.2) {
      const u = prog(t, 70.5, 71.2);
      mX = lerp(360, 720, u); mY = lerp(GROUND, 860, u) - 4 * 230 * u * (1 - u); mArmL = mArmR = 2.8; mExpr = "laugh"; mRot = Math.sin(u * Math.PI) * 0.15;
    }
    if (t >= 71.2) {
      inWater = true; mX = 720;
      mY = 940 + Math.sin((t - 71.2) * 9) * 10 * Math.exp(-(t - 71.2) * 2) + Math.sin(t * 2) * 3;
      mExpr = t < 71.6 ? "surprised" : "laugh";
      mArmL = 1.7 + Math.sin(t * 10) * 0.5; mArmR = 1.7 + Math.sin(t * 10 + 2) * 0.5;
    }
    const hat = t >= 71.2 ? (cc, hx, hy) => {
      const u = E.out(prog(t, 71.2, 71.6));
      cc.save(); cc.translate(lerp(0, hx, u), lerp(260, hy + 14, u)); cc.rotate(-0.15);
      lilyPad(cc, 0, 0, 0.95, t, 9); cc.restore();
    } : null;
    if (inWater) {
      c.save(); c.beginPath(); c.rect(0, 0, W, 868); c.clip();
      K.drawMimi(c, { x: mX, y: mY, t, expr: mExpr, talk: talk("mimi", t), armL: mArmL, armR: mArmR, hat });
      c.restore();
      K.ell(c, 720, 868, 110, 22, null, "rgba(255,255,255,.85)", 6);
    } else {
      K.drawMimi(c, { x: mX, y: mY, t, rot: mRot, expr: mExpr, talk: talk("mimi", t), armL: mArmL, armR: mArmR, walking: mm.walking, walk: t * 13, ground: t < 70.5 ? GROUND : null });
    }
    // splash droplets
    if (t >= 71.2 && t < 72.6) {
      const r = rng(12), u = t - 71.2;
      for (let i = 0; i < 46; i++) {
        const a = -Math.PI / 2 + (r() - 0.5) * 2.4, sp = 500 + r() * 700;
        const x = 720 + Math.cos(a) * sp * u, y = 860 + Math.sin(a) * sp * u + 900 * u * u;
        if (y < 900) K.ell(c, x, y, 9, 13, "rgba(140,205,255,.9)", "rgba(255,255,255,.9)", 2);
      }
    }
    for (let k = 0; k < 9; k++) { const t0 = 72 + k * 0.8; if (t > t0 && t < t0 + 0.6) { const r = rng(100 + k), u = t - t0; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 2; const sp = 250 + r() * 200; K.circ(c, 720 + Math.cos(a) * sp * u + (k % 2 ? 60 : -60), 860 + Math.sin(a) * sp * u + 900 * u * u, 7, "rgba(140,205,255,.85)"); } } }

    // big numbers 1 2 3
    HOPS.forEach((h, k) => K.bigNumber(c, k + 1, PADS[k][0], 480, t, h + 0.2));
    if (t >= 71.1 && t < 72.1) { c.save(); c.globalAlpha = 1 - prog(t, 71.7, 72.1); const s = E.back(prog(t, 71.1, 71.4)); c.translate(720, 560); c.scale(s, s); K.outlinedText(c, "SPLASH!", 0, 0, 110, "#4D96FF", "#fff", 18); c.restore(); }
    foregroundFlowers(c, t, 14, 1000);
  }

  // ================================================================== SCENE 5 — Nutty's berries (80–100)
  const BERRIES = [[930, 885], [1530, 890], [990, 900], [1590, 880], [1320, 905]];
  const BASKET = [1240, 885];
  const COUNT = [87.8, 88.8, 89.8, 90.8, 91.8];
  function scene5(c, t) {
    K.sky(c, "#8ED1F8", "#E8F8FF");
    K.cloud(c, ((500 + t * 10) % 2400) - 200, 140, 0.7, t, true, 10);
    K.hill(c, [[-100, 650], [500, 610], [1100, 660], [2020, 600]], "#6FBF6C", "#98DA8C");
    for (let i = 0; i < 10; i++) K.tree(c, 40 + i * 205, 760, 0.75 + (i % 3) * 0.12, t, ["#5CBF6A", "#6DCB78", "#4FB35E"][i % 3], "#3E8E4A", 20 + i, i === 2);
    // berry bushes
    for (const [x, y, s] of [[260, 800, 1], [700, 790, 0.8], [1700, 800, 1.1]]) {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.beginPath(); for (const [dx, dy, r] of [[-70, 0, 60], [0, -30, 75], [70, 0, 60]]) { c.moveTo(dx + r, dy); c.arc(dx, dy, r, 0, TAU); }
      c.fillStyle = "#3FA45A"; c.fill(); c.strokeStyle = "#2E7D45"; c.lineWidth = 5; c.stroke();
      const r = rng(x); for (let i = 0; i < 9; i++) berry(c, (r() - 0.5) * 200, -40 + (r() - 0.3) * 80, 13);
      c.restore();
    }
    ground(c, 820, "#8FD47E", "#5DB656");
    // dirt path
    c.beginPath(); c.moveTo(-100, 900); c.quadraticCurveTo(960, 830, 2020, 900); c.lineTo(2020, 1000); c.quadraticCurveTo(960, 930, -100, 1000); c.closePath();
    c.fillStyle = "rgba(230,200,150,.55)"; c.fill();
    K.ell(c, 1760, 905, 22, 12, "#A8A8B8", "#7A7A90", 3); // the pebble
    K.grassTufts(c, 860, t, 41, 22);

    // ---- Nutty
    let nX, nY = GROUND, nRot = 0, nSit = 0, nExpr = "happy", nWalk = false, nTail = 0;
    if (t < 80.5) nX = 2150;
    else if (t < 81.0) { nX = lerp(2150, 1760, prog(t, 80.5, 81.0)); nWalk = true; }
    else if (t < 81.5) { const u = prog(t, 81.0, 81.5); nX = lerp(1760, 1690, u); nRot = -Math.sin(Math.PI * u) * 1.1; nY -= hopY(t, 81.0, 0.5, 60); nExpr = "surprised"; }
    else { nX = 1690; nSit = t < 93.6 ? 1 : 1 - prog(t, 93.6, 93.9); nExpr = t < 84 ? "o" : "happy"; }
    if (t >= 82.3 && t < 83.8) nExpr = "laugh";
    if (t >= 94.0) { nY -= hopCycle(t, 94.1, 97, 0.6, 40); nTail = 1; nExpr = "laugh"; }
    if (t >= 87.5 && t < 93) nTail = 0.5;
    const nCarry = t < 81.15;
    K.shadow(c, nX, GROUND, 60, GROUND - nY);
    K.drawNutty(c, { x: nX, y: nY, t, face: -1, rot: nRot, sit: nSit, expr: nExpr, talk: talk("nutty", t), walking: nWalk, walk: t * 18, tailWag: nTail, armR: nCarry ? 1.6 : (t > 94 ? 2.6 : 0.4), s: 1.15 });

    // ---- basket & berries
    let bkX = BASKET[0], bkY = BASKET[1], bkRot = 0;
    if (nCarry) { bkX = nX - 60; bkY = GROUND - 70; }
    else if (t < 81.7) { const u = prog(t, 81.15, 81.7); bkX = lerp(1700, BASKET[0], u); bkY = lerp(GROUND - 70, BASKET[1], u) - 4 * 260 * u * (1 - u); bkRot = -u * TAU; }
    const inBasket = t < 81.2 ? 5 : COUNT.filter((ct) => t >= ct).length;
    const glow = Math.max(0, Math.sin(Math.PI * prog(t, 92.4, 93.8)));
    c.save(); c.translate(bkX, bkY); c.rotate(bkRot); basket(c, 0, 0, inBasket, glow, t); c.restore();
    // scattered berries
    for (let i = 0; i < 5; i++) {
      if (t < 81.25) continue;
      const land = 81.45 + i * 0.18;
      let x, y;
      if (t < land) { const u = prog(t, 81.25, land); x = lerp(1600, BERRIES[i][0], u); y = lerp(700, BERRIES[i][1], u) - 4 * 220 * u * (1 - u); }
      else { x = BERRIES[i][0]; y = BERRIES[i][1] - hopY(t, land, 0.3, 26); }
      const ct = COUNT[i];
      if (t >= ct) continue;
      if (t > ct - 0.5) { const u = E.inOut(prog(t, ct - 0.5, ct)); x = lerp(BERRIES[i][0], BASKET[0], u); y = lerp(BERRIES[i][1], BASKET[1] - 80, u) - Math.sin(Math.PI * u) * 230; }
      berry(c, x, y, 22);
    }

    // ---- Mimi
    const mm = mover(t, [[80, -260], [81.3, 420, E.out], [85.8, 420], [87.3, 1050]]);
    let mX = mm.x, mY = GROUND, mArmL, mArmR, mExpr = "happy", mFace = 1, mSq = 1, mLook = [0, 0];
    if (t >= 81 && t < 82.4) { mExpr = "surprised"; mLook = [1, 0]; }
    if (t >= 98.3) { mX = track(t, [[98.3, 1050], [100, 2150]]); }
    // ---- Bobo
    const bm = mover(t, [[80, -120], [81.3, 600, E.out], [85.8, 600], [87.4, 1440]]);
    let bX = bm.x, bY = GROUND, bArmL, bArmR, bExpr = "happy", bFace = 1, bSq = 1, bLook = [0, 0];
    if (t >= 81 && t < 82.4) { bExpr = "surprised"; bLook = [1, 0]; }
    if (t >= 84.4 && t < 86) { bArmR = 2.9; bExpr = "determined"; }
    if (t >= 87.4) bFace = -1;
    const picker = [0, 1, 0, 1, 2];
    COUNT.forEach((ct, i) => {
      if (t > ct - 0.75 && t < ct - 0.2) {
        const bend = Math.sin(Math.PI * prog(t, ct - 0.75, ct - 0.2));
        if (picker[i] !== 1) { mSq = 1 - 0.12 * bend; mArmR = lerp(0.3, 0.9, bend); }
        if (picker[i] !== 0) { bSq = 1 - 0.12 * bend; bArmL = lerp(0.3, 0.9, bend); }
      }
      if (t >= ct - 0.2 && t < ct + 0.5) {
        if (picker[i] !== 1) { mArmL = mArmR = 2.6; mExpr = "laugh"; mY -= hopY(t, ct - 0.1, 0.45, 35); }
        if (picker[i] !== 0) { bArmL = bArmR = 2.6; bExpr = "laugh"; bY -= hopY(t, ct - 0.1, 0.45, 40); }
      }
    });
    if (t >= 92.8 && t < 94) { bExpr = mExpr = "surprised"; bLook = [-1, -1]; mLook = [1, -1]; }
    if (t >= 96.6 && t < 98.4) { bArmR = wave(t, 2.6); bArmL = 2.6; bExpr = "laugh"; bY -= hopY(t, 96.7, 0.5, 60); }
    if (t >= 98.3) { bFace = 1; bX = track(t, [[98.3, 1440], [100, 2250]]); }
    K.drawMimi(c, { x: mX, y: mY, t, face: mFace, expr: mExpr, talk: talk("mimi", t), armL: mArmL, armR: mArmR, sq: mSq, look: mLook, walking: mm.walking || t >= 98.3, walk: t * 13, ground: GROUND });
    K.drawBobo(c, { x: bX, y: bY, t, face: bFace, expr: bExpr, talk: talk("bobo", t), armL: bArmL, armR: bArmR, sq: bSq, look: bLook, walking: bm.walking || t >= 98.3, walk: t * 13, ground: GROUND });

    COUNT.forEach((ct, i) => { K.bigNumber(c, i + 1, BASKET[0], 520, t, ct); K.sparkles(c, BASKET[0], BASKET[1] - 80, t, ct, 6, 90, "#C9A0FF", 60 + i); });
    if (t >= 81.0 && t < 82.2) { c.save(); c.globalAlpha = 1 - prog(t, 81.8, 82.2); const s = E.back(prog(t, 81.0, 81.3)); c.translate(1690, 560); c.scale(s, s); K.outlinedText(c, "Oopsie!", 0, 0, 90, "#9B5DE5", "#fff", 16); c.restore(); }
    foregroundFlowers(c, t, 15, 990);
  }

  // ================================================================== SCENE 6 — The rainbow returns (100–120)
  function scene6(c, t) {
    const paint = [0, 1, 2, 3, 4, 5].map((i) => E.inOut(prog(t, 109.35 + i * 0.16, 110.0 + i * 0.16)));
    const fills = paint.map((p) => (p > 0 ? 1 : 0));
    const z = track(t, [[108.4, 1.07], [109.6, 1.0]]);
    c.save(); c.translate(960, 700); c.scale(z, z); c.translate(-960, -700);
    homeHill(c, t, 1, 210, t > 110.6 ? "big" : "happy", 0, fills, 1, paint.map((p) => (p > 0 ? p : 1)), 0);
    if (t > 110.6) K.twinkleField(c, t, 8, 26, 160, 120, 1600, 520);
    // butterflies
    K.butterfly(c, 1300 + 200 * Math.sin(t * 0.8), 520 + 60 * Math.sin(t * 2), 1.0, t, "#FFD93D", 3);
    K.butterfly(c, 420 + 140 * Math.sin(t * 0.9 + 1), 600 + 50 * Math.sin(t * 1.7), 0.9, t, "#FF9DB5", 4);

    const party = t >= 110.6;
    const beatHop = (ofs, h) => (party && t < 116 ? hopY((t + ofs) % 0.5, 0, 0.5, h) : 0);
    const cheer = t >= 108.0 && t < 110.6;
    const bye = t >= 115.9;

    // Hoppy
    let hX = mover(t, [[101.7, -120], [102.7, 700]]).x;
    let hY = GROUND - (t > 101.7 && t < 102.7 ? hopCycle(t, 101.7, 102.7, 0.5, 90) : 0) - beatHop(0.25, 40);
    if (t > 110.85 && t < 111.6) hY -= hopY(t, 110.9, 0.6, 120);
    K.shadow(c, hX, GROUND, 60, GROUND - hY);
    K.drawHoppy(c, { x: hX, y: hY, t, face: 1, talk: talk("hoppy", t), expr: party || cheer ? "laugh" : "happy" });
    // Nutty
    const nm = mover(t, [[102.3, 2150], [103.1, 1470, E.out]]);
    let nY = GROUND - beatHop(0.1, 40);
    if (t > 110.85 && t < 111.6) nY -= hopY(t, 110.95, 0.6, 110);
    K.shadow(c, nm.x, GROUND, 60, GROUND - nY);
    K.drawNutty(c, { x: nm.x, y: nY, t, face: -1, walking: nm.walking, walk: t * 18, talk: talk("nutty", t), expr: party || cheer ? "laugh" : "happy", armR: cheer || party ? 2.6 + (bye ? Math.sin(t * 11) * 0.4 : 0) : 0.4, tailWag: party ? 1 : 0, s: 1.1 });
    // Mimi
    const mm = mover(t, [[100, -300], [101.5, 1215, E.out]]);
    let mY = GROUND - beatHop(0.2, 50), mArmL, mArmR, mExpr = "happy", mFace = 1, mLook = [0, 0];
    if (t >= 103 && t < 105.8) { mFace = -1; }
    const counting = t >= 105.9 && t < 108.0;
    if (counting) { const k = clamp(Math.floor((t - 105.9) / 0.62), 0, 2); mArmL = 0.6 + k * 0.6; mArmR = 0.6 + k * 0.6; }
    if (cheer) { mArmL = mArmR = 2.9; mExpr = "laugh"; mLook = [0, -1]; }
    if (t > 110.85 && t < 111.6) mY -= hopY(t, 110.85, 0.6, 140);
    if (party) { mArmL = 2.4 + Math.sin(t * 6) * 0.3; mArmR = 2.4 - Math.sin(t * 6) * 0.3; mExpr = "laugh"; }
    if (bye) { mArmR = 2.0; mArmL = wave(t, 2.6); mExpr = "happy"; }
    K.drawMimi(c, { x: mm.x, y: mY, t, face: mFace, expr: mExpr, talk: talk("mimi", t), armL: mArmL, armR: mArmR, look: mLook, walking: mm.walking, walk: t * 14, ground: GROUND });
    // Bobo
    const bm = mover(t, [[100, -150], [101.4, 960, E.out]]);
    let bY = GROUND - beatHop(0, 60), bArmL, bArmR, bExpr = "happy", bFace = 1, bLook = [0, 0];
    if (t >= 103.1 && t < 105.6) { bArmR = track(t, [[103.1, 0.4], [103.6, 2.2], [104.6, 1.4], [105.4, 2.2]]); bArmL = 1.6; }
    if (counting) { const k = clamp(Math.floor((t - 105.9) / 0.62), 0, 2); bArmL = bArmR = 0.6 + k * 0.6; }
    if (cheer) { bArmL = bArmR = 2.9; bExpr = "laugh"; bLook = [0, -1]; }
    if (t > 110.85 && t < 111.6) bY -= hopY(t, 110.85, 0.6, 160);
    if (t > 111.65 && t < 112.3) bY -= hopY(t, 111.7, 0.55, 110);
    if (party) { bArmL = 2.4 - Math.sin(t * 6) * 0.3; bArmR = 2.4 + Math.sin(t * 6) * 0.3; bExpr = "laugh"; }
    if (bye) { bArmR = wave(t, 2.6); bArmL = 0.5; bExpr = "happy"; }
    if (t >= 109 && t < 110.6) bExpr = "surprised";
    K.drawBobo(c, { x: bm.x, y: bY, t, face: bFace, expr: bExpr, talk: talk("bobo", t), armL: bArmL, armR: bArmR, look: bLook, walking: bm.walking, walk: t * 14, ground: GROUND });
    // Pip & Bizzy
    let pX = track(t, [[100.6, -150], [101.6, 790, E.out]]), pY = track(t, [[100.6, 160], [101.6, 470, E.out]]) + Math.sin(t * 3) * 14;
    K.drawPip(c, { x: pX, y: pY, t, face: 1, flying: true, talk: talk("pip", t), s: 1.1 });
    let zX = track(t, [[100.9, 2100], [101.9, 1660, E.out]]), zY = track(t, [[100.9, 260], [101.9, 520, E.out]]) + Math.sin(t * 4) * 14;
    K.drawBizzy(c, { x: zX, y: zY, t, face: -1, talk: talk("bizzy", t), rot: party ? Math.sin(t * 6) * 0.2 : 0 });

    // counting numbers in the sky
    for (let k = 0; k < 3; k++) K.bigNumber(c, k + 1, 830 + k * 260, 330, t, 105.95 + k * 0.62);
    // stars leave the meter and paint the rainbow
    if (t >= 108.95 && t < 109.9) {
      for (let i = 0; i < 6; i++) {
        const u = E.inOut(prog(t, 109.0 + i * 0.05, 109.45 + i * 0.05));
        const [sx, sy] = hudSlot(i), R = 760 - i * 36;
        const ex = 960 - R + 10, ey = 900 - 10;
        const x = lerp(sx, ex, u), y = lerp(sy, ey, u) - Math.sin(Math.PI * u) * 120;
        if (paint[i] <= 0.02) K.colorStar(c, x, y, lerp(18, 34, u), RAINBOW[i], t, t * 4);
      }
    }
    for (let i = 0; i < 6; i++) if (paint[i] > 0 && paint[i] < 1) {
      const R = 760 - i * 36, a = Math.PI + Math.PI * paint[i];
      K.colorStar(c, 960 + Math.cos(a) * R, 900 + Math.sin(a) * R, 30, RAINBOW[i], t, t * 6);
    }
    K.sparkles(c, 960, 260, t, 110.6, 22, 520, "#FFFFFF", 21);
    confetti(c, t, 110.6);
    floatingHearts(c, t, 111.5);
    foregroundFlowers(c, t, 11);
    c.restore();
  }

  // ================================================================== overlays
  const HUD = { x: 168, y: 150, R: 98, bw: 15 };
  function hudSlot(i) { return [HUD.x, HUD.y - (HUD.R - i * HUD.bw)]; }
  // colour stars found during the story (screen coords)
  const FOUND = [
    { i: 0, pop: 35.15, fly: 35.55, arrive: 36.1, from: [1235, 360] },
    { i: 1, pop: 35.45, fly: 36.0, arrive: 36.6, from: [1290, 410] },
    { i: 2, pop: 51.25, fly: 51.75, arrive: 52.3, from: [1760, 470] },
    { i: 4, pop: 72.4, fly: 72.8, arrive: 73.3, from: [820, 850] },
    { i: 3, pop: 73.0, fly: 73.4, arrive: 73.9, from: [720, 600] },
    { i: 5, pop: 92.9, fly: 93.3, arrive: 93.8, from: [1240, 790] },
  ];
  function drawHud(c, t) {
    const a = clamp(prog(t, 13.8, 14.4)) * (1 - prog(t, 109.0, 109.6));
    if (a <= 0) return;
    c.save(); c.globalAlpha = a;
    K.rrect(c, 40, 30, 256, 150, 34); c.fillStyle = "rgba(255,255,255,.88)"; c.fill();
    c.strokeStyle = "#C9B8F0"; c.lineWidth = 5; c.stroke();
    const fills = [0, 0, 0, 0, 0, 0];
    let pulse = 0;
    for (const f of FOUND) if (t >= f.arrive) { fills[f.i] = 1; pulse = Math.max(pulse, 1 - (t - f.arrive) / 0.5); }
    const full = fills.every((v) => v);
    const sc = 1 + 0.12 * Math.max(0, pulse) + (full && t > 96 ? 0.04 * Math.sin(t * 8) : 0);
    c.translate(HUD.x, HUD.y - 30); c.scale(sc, sc); c.translate(-HUD.x, -(HUD.y - 30));
    K.rainbow(c, HUD.x, HUD.y, HUD.R, HUD.bw, fills, 1, null, 0, "rgba(205,196,228,1)");
    // little cloud ends
    K.cloud(c, HUD.x - HUD.R + 38, HUD.y + 6, 0.32, t, false); K.cloud(c, HUD.x + HUD.R - 38, HUD.y + 6, 0.32, t, false);
    c.restore();
    // stars in flight
    for (const f of FOUND) {
      if (t < f.pop || t >= f.arrive) continue;
      let x, y, r;
      if (t < f.fly) { const u = prog(t, f.pop, f.fly); x = f.from[0]; y = f.from[1] - 70 * E.out(u); r = 44 * E.back(clamp(u * 1.6)); }
      else {
        const u = E.inOut(prog(t, f.fly, f.arrive));
        const [sx, sy] = [f.from[0], f.from[1] - 70], [ex, ey] = hudSlot(f.i);
        const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 160;
        x = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cx + u * u * ex;
        y = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cy + u * u * ey;
        r = lerp(44, 20, u);
      }
      K.colorStar(c, x, y, r, RAINBOW[f.i], t, t * 3);
    }
    for (const f of FOUND) K.sparkles(c, ...hudSlot(f.i), t, f.arrive, 8, 60, RAINBOW[f.i], 70 + f.i);
  }

  function titleCard(c, t) {
    if (t > 3.9) return;
    const a = 1 - prog(t, 3.3, 3.9);
    const s = E.back(prog(t, 0.1, 0.8)) * (1 + 0.25 * prog(t, 3.3, 3.9));
    c.save(); c.globalAlpha = a;
    c.translate(960, 400); c.scale(s, s);
    const g = c.createRadialGradient(0, 0, 50, 0, 0, 700); g.addColorStop(0, "rgba(255,255,255,.75)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(-900, -400, 1800, 800);
    K.outlinedText(c, "Bunny and the", 0, -120, 92, "#7A5CC7", "#fff", 18);
    const word = "Magic Rainbow";
    c.font = `600 168px ${K.FONT}`;
    const widths = [...word].map((ch) => c.measureText(ch).width);
    let x = -widths.reduce((p, q) => p + q, 0) / 2;
    [...word].forEach((ch, i) => {
      const y = 50 - Math.abs(Math.sin(t * 4 + i * 0.5)) * 22;
      K.outlinedText(c, ch, x + widths[i] / 2, y, 168, RAINBOW[i % 6], "#fff", 22);
      x += widths[i];
    });
    c.restore();
  }
  function endCard(c, t) {
    if (t < 117.4) return;
    const s = E.back(prog(t, 117.4, 118.1));
    c.save(); c.translate(960, 270); c.scale(s, s);
    const word = "The End";
    c.font = `600 190px ${K.FONT}`;
    const widths = [...word].map((ch) => c.measureText(ch).width);
    let x = -widths.reduce((p, q) => p + q, 0) / 2;
    [...word].forEach((ch, i) => {
      const y = -Math.abs(Math.sin(t * 4 + i * 0.6)) * 20;
      K.outlinedText(c, ch, x + widths[i] / 2, y, 190, RAINBOW[i % 6], "#fff", 24);
      x += widths[i];
    });
    K.outlinedText(c, "Helping friends makes the world brighter!", 0, 150, 58, "#7A5CC7", "#fff", 14);
    for (const sx of [-1, 1]) K.heart(c, sx * 470, -10 + Math.sin(t * 5) * 8, 2.4, "#FF6FA8");
    c.restore();
  }
  function transitions(c, t) {
    for (const b of [20, 40, 60, 80, 100]) {
      const d = Math.abs(t - b);
      if (d < 0.38) {
        const a = 1 - d / 0.38;
        c.save(); c.globalAlpha = E.inOut(a); c.fillStyle = "#FFFDF6"; c.fillRect(0, 0, W, H);
        const r = rng(b);
        for (let i = 0; i < 18; i++) { K.star(c, r() * W, r() * H, 20 + r() * 30, t * 2, 5, 0.5); c.fillStyle = RAINBOW[i % 6]; c.fill(); }
        c.restore();
      }
    }
    if (t < 0.25) { c.save(); c.globalAlpha = 1 - t / 0.25; c.fillStyle = "#FFFDF6"; c.fillRect(0, 0, W, H); c.restore(); }
  }
  const NAME_COL = { narrator: "#7A5CC7", bobo: "#1FA99C", mimi: "#B5703F", pip: "#2F86D6", bizzy: "#D9A400", hoppy: "#3E9B4F", nutty: "#E07A2A", all: "#FF5A5F", "bobo+mimi": "#E0569A" };
  function subtitles(c, t) {
    let L = null;
    for (const l of TL.lines) if (t >= l.t - 0.05 && t < l.t + Math.max(l.dur + 0.4, 1.1)) L = l;
    if (!L || L.id === "s1_title") return;
    const pop = E.back(prog(t, L.t - 0.05, L.t + 0.15));
    c.save();
    c.font = `600 56px ${K.FONT}`;
    const tw = c.measureText(L.text).width;
    const bw = Math.min(1760, tw + 90), bh = 98, bx = 960 - bw / 2, by = 958;
    c.translate(960, by + bh / 2); c.scale(lerp(0.85, 1, pop), lerp(0.85, 1, pop)); c.translate(-960, -(by + bh / 2));
    K.rrect(c, bx, by, bw, bh, 40); c.fillStyle = "rgba(255,255,255,.93)"; c.fill();
    c.strokeStyle = NAME_COL[L.who] || "#7A5CC7"; c.lineWidth = 6; c.stroke();
    c.fillStyle = "#3B2F55"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(L.text, 960, by + bh / 2 + 3, 1700);
    // name chip
    c.font = `600 36px ${K.FONT}`;
    const nw = c.measureText(L.name).width + 44;
    K.rrect(c, bx + 34, by - 30, nw, 52, 26); c.fillStyle = NAME_COL[L.who] || "#7A5CC7"; c.fill();
    c.fillStyle = "#fff"; c.fillText(L.name, bx + 34 + nw / 2, by - 3);
    c.restore();
  }

  const SCENES = [scene1, scene2, scene3, scene4, scene5, scene6];
  const SCENE_TITLES = ["Good Morning, Forest!", "Mimi and the Stuck Kite", "Thirsty Sunflowers", "Hoppy's Pond", "Nutty's Berries", "The Rainbow Returns"];

  function render(c, t, opts = {}) {
    t = clamp(t, 0, TL.duration - 1e-3);
    const si = Math.min(5, Math.floor(t / 20));
    c.save();
    c.lineJoin = "round"; c.lineCap = "round";
    SCENES[si](c, t);
    drawHud(c, t);
    titleCard(c, t);
    endCard(c, t);
    transitions(c, t);
    if (opts.subtitles !== false) subtitles(c, t);
    c.restore();
  }

  G.CARTOON = { render, duration: TL.duration, fps: TL.fps, W, H, SCENE_TITLES, timeline: TL };
})(window);
