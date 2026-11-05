/* =============================================================================
 *  Bunny and the Magic Rainbow — drawing engine
 *  Pure, deterministic drawing helpers: every function draws from (time, params)
 *  so any frame can be rendered at any moment (needed for seeking + MP4 export).
 * ========================================================================== */
(function (G) {
  "use strict";
  const W = 1920, H = 1080;
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ math
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    lin: (t) => t,
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    elastic: (t) => (t === 0 || t === 1) ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1,
  };
  /** keyframe track: keys = [[t, v], [t, v, easeFn], ...] (ease applies to the segment ending at that key) */
  function track(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, ez] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const u = (ez || E.inOut)(prog(t, t0, t1));
        return lerp(v0, v1, u);
      }
    }
    return keys[keys.length - 1][1];
  }
  /** parabolic hop: 0 -> h -> 0 over [t0, t0+d] */
  const hopY = (t, t0, d, h) => { const u = (t - t0) / d; return u > 0 && u < 1 ? 4 * h * u * (1 - u) : 0; };
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const blinkAt = (t, seed = 0) => { // 0 open .. 1 closed
    const period = 3.1 + (seed % 3) * 0.45;
    const ph = (t + seed * 1.37) % period;
    return ph < 0.16 ? Math.sin((ph / 0.16) * Math.PI) : 0;
  };

  // ------------------------------------------------------------------ palette
  const RAINBOW = ["#FF5A5F", "#FF9F43", "#FFD93D", "#6BCB77", "#4D96FF", "#9B5DE5"];
  const C = {
    outline: "#4A3B5C",
    bobo: { fur: "#FBF8FF", shade: "#E4DCF3", ear: "#FFB3C7", line: "#5B4B7A", scarf: "#2EC4B6", scarf2: "#CBF3F0" },
    mimi: { fur: "#C68A5A", shade: "#A9713F", muzzle: "#F3D7B6", ear: "#F2AE96", line: "#5A3A26", bow: "#FF6FA8" },
    cheek: "#FF9DB5", nose: "#FF7FA3", eye: "#2D2440", tongue: "#FF6B8A", mouth: "#7A2E45",
  };

  // ------------------------------------------------------------------ shape helpers
  function ell(c, x, y, rx, ry, fill, stroke, lw, rot = 0) {
    c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  function circ(c, x, y, r, fill, stroke, lw) { ell(c, x, y, r, r, fill, stroke, lw); }
  function rrect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function limb(c, x1, y1, x2, y2, w, fill, line) {
    c.lineCap = "round";
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = line; c.lineWidth = w + 10; c.stroke();
    c.strokeStyle = fill; c.lineWidth = w; c.stroke();
  }
  function star(c, x, y, r, rot = 0, points = 5, inner = 0.5) {
    c.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 ? r * inner : r;
      const a = rot + (i * Math.PI) / points - Math.PI / 2;
      i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }
  function heart(c, x, y, s, fill) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(0, 8);
    c.bezierCurveTo(-22, -8, -12, -28, 0, -16); c.bezierCurveTo(12, -28, 22, -8, 0, 8);
    c.fillStyle = fill; c.fill(); c.restore();
  }
  function shadow(c, x, y, w, lift = 0) {
    const k = clamp(1 - lift / 400, 0.4, 1);
    ell(c, x, y, w * k, w * 0.2 * k, `rgba(40,30,70,${0.16 * k})`);
  }

  // ------------------------------------------------------------------ faces
  /** expr: happy | closed | laugh | surprised | worried | sleepy | dizzy | determined | o */
  function eyes(c, x, y, gap, size, expr, blink, t, look = [0, 0]) {
    const lx = look[0] * size * 0.25, ly = look[1] * size * 0.25;
    for (const sx of [-1, 1]) {
      const ex = x + sx * gap, ey = y;
      c.save();
      if (expr === "laugh" || expr === "closed") {
        c.beginPath(); c.lineCap = "round"; c.lineWidth = size * 0.32; c.strokeStyle = C.eye;
        c.arc(ex, ey + size * 0.25, size * 0.7, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      } else if (expr === "dizzy") {
        c.beginPath(); c.lineWidth = size * 0.22; c.strokeStyle = C.eye;
        for (let a = 0; a < TAU * 2.2; a += 0.2) {
          const r = (a / (TAU * 2.2)) * size * 0.95;
          const px = ex + Math.cos(a + t * 9 * sx) * r, py = ey + Math.sin(a + t * 9 * sx) * r;
          a ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.stroke();
      } else {
        const big = expr === "surprised" ? 1.25 : 1;
        let ry = size * 1.18 * big * (1 - blink * 0.92);
        if (expr === "sleepy") ry *= 0.35;
        ell(c, ex, ey, size * 0.92 * big, ry, C.eye);
        if (ry > size * 0.4) {
          circ(c, ex + lx - size * 0.28, ey + ly - size * 0.42 * big, size * 0.36 * big, "#fff");
          circ(c, ex + lx + size * 0.3, ey + ly + size * 0.25, size * 0.16 * big, "rgba(255,255,255,.9)");
        }
        if (expr === "sleepy") { // heavy lids
          c.beginPath(); c.lineWidth = size * 0.2; c.strokeStyle = C.eye; c.lineCap = "round";
          c.moveTo(ex - size, ey - ry * 0.3); c.lineTo(ex + size, ey - ry * 0.3); c.stroke();
        }
      }
      // brows
      if (expr === "surprised" || expr === "worried" || expr === "determined") {
        c.beginPath(); c.lineCap = "round"; c.lineWidth = size * 0.28; c.strokeStyle = C.eye;
        const by = ey - size * (expr === "surprised" ? 2.3 : 1.85);
        const inX = ex - sx * size * 0.8, outX = ex + sx * size * 0.8;
        let inY = by, outY = by;
        if (expr === "worried") { inY = by - size * 0.5; outY = by + size * 0.3; }
        if (expr === "determined") { inY = by + size * 0.4; outY = by - size * 0.3; }
        c.moveTo(inX, inY);
        c.quadraticCurveTo(ex, Math.min(inY, outY) - size * (expr === "surprised" ? 0.6 : 0.2), outX, outY);
        c.stroke();
      }
      c.restore();
    }
  }
  /** mouth: talk 0..1 opens the mouth (lip-sync) */
  function mouth(c, x, y, w, expr, talk) {
    c.save(); c.lineCap = "round"; c.lineJoin = "round";
    if (talk > 0.06 || expr === "grin" || expr === "laugh" || expr === "surprised" || expr === "o") {
      let h = w * (0.22 + 0.75 * talk);
      let ww = w;
      if (expr === "grin" || expr === "laugh") h = Math.max(h, w * 0.65);
      if (expr === "surprised" || expr === "o") { ww = w * 0.55; h = Math.max(h, w * 0.6); }
      c.beginPath();
      if (expr === "surprised" || expr === "o") c.ellipse(x, y + h * 0.3, ww * 0.5, h * 0.5, 0, 0, TAU);
      else { c.moveTo(x - ww / 2, y); c.quadraticCurveTo(x, y + h * 1.6, x + ww / 2, y); c.quadraticCurveTo(x, y + h * 0.25, x - ww / 2, y); }
      c.fillStyle = C.mouth; c.fill();
      c.save(); c.clip();
      ell(c, x, y + h * 1.0, ww * 0.32, h * 0.45, C.tongue);
      c.restore();
      c.strokeStyle = C.eye; c.lineWidth = w * 0.09; c.stroke();
    } else if (expr === "worried") {
      c.beginPath(); c.moveTo(x - w * 0.35, y + w * 0.15); c.quadraticCurveTo(x, y - w * 0.12, x + w * 0.35, y + w * 0.15);
      c.strokeStyle = C.eye; c.lineWidth = w * 0.1; c.stroke();
    } else if (expr === "sleepy") {
      ell(c, x, y + w * 0.1, w * 0.18, w * 0.12, C.mouth, C.eye, w * 0.07);
    } else { // happy smile
      c.beginPath(); c.moveTo(x - w * 0.45, y); c.quadraticCurveTo(x, y + w * 0.5, x + w * 0.45, y);
      c.strokeStyle = C.eye; c.lineWidth = w * 0.1; c.stroke();
    }
    c.restore();
  }

  // ------------------------------------------------------------------ BOBO the bunny
  /**
   * o: {x, y (feet), s, face(1|-1), t, walk (phase rad), walking, sq (squash), rot,
   *     armL, armR (rad: 0 down, ~2.6 up), expr, talk, look:[x,y], earUp(0..1), sit(0..1), lift, ground}
   */
  function drawBobo(c, o) {
    const t = o.t || 0, f = o.face || 1, P = C.bobo, L = P.line, lw = 6;
    const ph = o.walk || 0, walking = !!o.walking;
    const bob = walking ? -Math.abs(Math.sin(ph)) * 10 : Math.sin(t * 2.4) * 2.2;
    const sit = o.sit || 0;
    if (o.ground != null) shadow(c, o.x, o.ground, 72 * (o.s || 1), o.ground - o.y);
    c.save();
    c.translate(o.x, o.y);
    if (o.rot) c.rotate(o.rot);
    const s = o.s || 1, sq = o.sq || 1;
    c.scale(s * (1 + (1 - sq) * 0.7), s * sq);
    c.lineJoin = "round";
    const by = bob + sit * 38;
    // tail
    for (const [dx, dy, r] of [[0, 0, 22], [-8, -10, 14], [8, 8, 12]])
      circ(c, -f * 60 + dx, -78 + by + dy, r, P.fur, L, lw);
    // feet
    const fl = walking ? Math.max(0, Math.sin(ph)) * 18 : 0, fr = walking ? Math.max(0, -Math.sin(ph)) * 18 : 0;
    ell(c, -30 + f * 8, -12 - fl + sit * 4, 32, 16, P.fur, L, lw);
    ell(c, 30 + f * 8, -12 - fr + sit * 4, 32, 16, P.fur, L, lw);
    // body
    ell(c, 0, -88 + by, 62, 70, P.fur, L, lw);
    ell(c, f * 8, -76 + by, 36, 44, "#FFFFFF");
    // arms
    const sh = -128 + by;
    const aL = o.armL != null ? o.armL : 0.25 + Math.sin(t * 2.4) * 0.05;
    const aR = o.armR != null ? o.armR : 0.25 + Math.sin(t * 2.4 + 1) * 0.05;
    for (const [sx, a] of [[-1, aL], [1, aR]]) {
      const x1 = sx * 46, x2 = x1 + sx * Math.sin(a) * 54, y2 = sh + Math.cos(a) * 54;
      limb(c, x1, sh, x2, y2, 24, P.fur, L);
      circ(c, x2, y2, 15, P.fur, L, 5);
    }
    // scarf
    c.save();
    rrect(c, -50, -160 + by, 100, 26, 13); c.fillStyle = P.scarf; c.fill(); c.strokeStyle = L; c.lineWidth = 5; c.stroke();
    c.beginPath(); c.moveTo(-f * 22, -140 + by);
    const fl2 = Math.sin(t * 6) * 6;
    c.quadraticCurveTo(-f * 34, -112 + by, -f * (30 + fl2), -96 + by);
    c.lineTo(-f * (12 + fl2 * 0.5), -100 + by); c.quadraticCurveTo(-f * 14, -120 + by, -f * 6, -140 + by); c.closePath();
    c.fillStyle = P.scarf; c.fill(); c.stroke();
    for (let i = -2; i <= 2; i++) { c.fillStyle = P.scarf2; c.fillRect(i * 20 - 4, -156 + by, 7, 18); }
    c.restore();
    // ears (behind head)
    const hy = -214 + by, hx = f * 4;
    const earUp = o.earUp || 0;
    const sway = Math.sin(t * 3.1) * 0.06 + (walking ? Math.sin(ph) * 0.1 : 0) + (o.earFlop || 0);
    for (const sx of [-1, 1]) {
      const base = sx * 0.2 * (1 - earUp) + sx * sway * (1 - earUp * 0.7);
      c.save(); c.translate(hx + sx * 30, hy - 62); c.rotate(base);
      ell(c, 0, -62, 25, 72, P.fur, L, lw);
      ell(c, 0, -58, 12, 52, P.ear);
      c.restore();
    }
    // head
    circ(c, hx, hy, 82, P.fur, L, lw);
    // tufts
    c.beginPath(); c.moveTo(hx - 14, hy - 80); c.quadraticCurveTo(hx - 4, hy - 104, hx + 6, hy - 80);
    c.quadraticCurveTo(hx + 14, hy - 98, hx + 20, hy - 78); c.fillStyle = P.fur; c.fill(); c.strokeStyle = L; c.lineWidth = 5; c.stroke();
    // face
    const look = o.look || [0, 0];
    const fx = hx + f * 12 + look[0] * 6, fy = hy + 6 + look[1] * 6;
    ell(c, fx - 52, fy + 26, 17, 10, C.cheek + "AA");
    ell(c, fx + 52, fy + 26, 17, 10, C.cheek + "AA");
    eyes(c, fx, fy - 12, 30, 13, o.expr || "happy", blinkAt(t, 1), t, look);
    // nose
    c.beginPath(); c.moveTo(fx - 9, fy + 12); c.quadraticCurveTo(fx, fy + 6, fx + 9, fy + 12); c.quadraticCurveTo(fx, fy + 24, fx - 9, fy + 12);
    c.fillStyle = C.nose; c.fill();
    // whiskers
    c.strokeStyle = "rgba(91,75,122,.55)"; c.lineWidth = 3; c.lineCap = "round";
    for (const sx of [-1, 1]) for (const k of [-1, 1]) {
      c.beginPath(); c.moveTo(fx + sx * 34, fy + 18 + k * 4); c.lineTo(fx + sx * 66, fy + 14 + k * 10); c.stroke();
    }
    let mexpr = o.expr || "happy";
    mouth(c, fx, fy + 34, 30, mexpr === "happy" || mexpr === "determined" ? "happy" : mexpr, o.talk || 0);
    c.restore();
  }

  // ------------------------------------------------------------------ MIMI the baby bear
  function drawMimi(c, o) {
    const t = o.t || 0, f = o.face || 1, P = C.mimi, L = P.line, lw = 6;
    const ph = o.walk || 0, walking = !!o.walking;
    const bob = walking ? -Math.abs(Math.sin(ph)) * 9 : Math.sin(t * 2.1 + 1) * 2.2;
    const sit = o.sit || 0;
    if (o.ground != null) shadow(c, o.x, o.ground, 88 * (o.s || 1), o.ground - o.y);
    c.save();
    c.translate(o.x, o.y);
    const s = o.s || 1, sq = o.sq || 1;
    if (o.rot) { c.translate(0, -150 * s); c.rotate(o.rot); c.translate(0, 150 * s); }
    c.scale(s * (1 + (1 - sq) * 0.7), s * sq);
    c.lineJoin = "round";
    const by = bob + sit * 40;
    // legs/feet
    const fl = walking ? Math.max(0, Math.sin(ph)) * 16 : 0, fr = walking ? Math.max(0, -Math.sin(ph)) * 16 : 0;
    if (sit > 0.5) {
      ell(c, -48, -26 + sit * 6, 30, 26, P.fur, L, lw); ell(c, 48, -26 + sit * 6, 30, 26, P.fur, L, lw);
      ell(c, -50, -22 + sit * 6, 16, 14, P.muzzle); ell(c, 50, -22 + sit * 6, 16, 14, P.muzzle);
    } else {
      ell(c, -36 + f * 6, -16 - fl, 34, 20, P.fur, L, lw);
      ell(c, 36 + f * 6, -16 - fr, 34, 20, P.fur, L, lw);
    }
    // body
    ell(c, 0, -92 + by, 80, 80, P.fur, L, lw);
    ell(c, f * 6, -80 + by, 50, 52, P.muzzle);
    // arms
    const sh = -134 + by;
    const aL = o.armL != null ? o.armL : 0.3 + Math.sin(t * 2.1) * 0.05;
    const aR = o.armR != null ? o.armR : 0.3 + Math.sin(t * 2.1 + 1) * 0.05;
    for (const [sx, a] of [[-1, aL], [1, aR]]) {
      const x1 = sx * 60, x2 = x1 + sx * Math.sin(a) * 58, y2 = sh + Math.cos(a) * 58;
      limb(c, x1, sh, x2, y2, 30, P.fur, L);
      circ(c, x2, y2, 18, P.fur, L, 5);
    }
    if (o.hold) o.hold(c, 60 + Math.sin(aR) * 58, sh + Math.cos(aR) * 58);
    // head
    const hy = -214 + by, hx = f * 4;
    for (const sx of [-1, 1]) {
      circ(c, hx + sx * 62, hy - 58, 30, P.fur, L, lw);
      circ(c, hx + sx * 62, hy - 58, 16, P.ear);
    }
    circ(c, hx, hy, 86, P.fur, L, lw);
    // bow
    const bx = hx + 52, byy = hy - 78;
    c.save(); c.translate(bx, byy); c.rotate(0.3 + Math.sin(t * 3) * 0.05);
    for (const sx of [-1, 1]) {
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(sx * 34, -26, sx * 36, 0); c.quadraticCurveTo(sx * 34, 26, 0, 0);
      c.fillStyle = P.bow; c.fill(); c.strokeStyle = L; c.lineWidth = 4; c.stroke();
    }
    circ(c, 0, 0, 9, P.bow, L, 4);
    c.restore();
    if (o.hat) o.hat(c, hx, hy - 80);
    // face
    const look = o.look || [0, 0];
    const fx = hx + f * 10 + look[0] * 6, fy = hy + 4 + look[1] * 6;
    ell(c, fx, fy + 34, 44, 34, P.muzzle, L, 4);
    ell(c, fx - 56, fy + 14, 16, 10, C.cheek + "AA");
    ell(c, fx + 56, fy + 14, 16, 10, C.cheek + "AA");
    eyes(c, fx, fy - 14, 32, 12, o.expr || "happy", blinkAt(t, 2), t, look);
    ell(c, fx, fy + 18, 14, 10, "#4A2E22");
    circ(c, fx - 4, fy + 15, 3.5, "rgba(255,255,255,.8)");
    mouth(c, fx, fy + 38, 28, (o.expr === "determined" ? "happy" : o.expr) || "happy", o.talk || 0);
    c.restore();
  }

  // ------------------------------------------------------------------ friends
  function drawPip(c, o) { // little blue bird
    const t = o.t || 0, f = o.face || 1, s = o.s || 1;
    c.save(); c.translate(o.x, o.y); c.scale(s * f, s);
    const flap = o.flying ? Math.sin(t * 28) : Math.sin(t * 3) * 0.15;
    // tail
    c.beginPath(); c.moveTo(-40, -10); c.lineTo(-78, -30); c.lineTo(-72, 0); c.closePath();
    c.fillStyle = "#3A8FD6"; c.fill(); c.strokeStyle = C.outline; c.lineWidth = 5; c.stroke();
    ell(c, 0, 0, 52, 44, "#5DB7F0", C.outline, 5);
    ell(c, 8, 12, 30, 24, "#CDEBFF");
    // wing
    c.save(); c.translate(-6, -4); c.rotate(-0.4 - flap * 0.9);
    ell(c, -18, 0, 30, 16, "#3A8FD6", C.outline, 5); c.restore();
    // beak
    c.beginPath(); c.moveTo(44, -8); c.lineTo(70 + (o.talk || 0) * 4, -2); c.lineTo(44, 2 + (o.talk || 0) * 14); c.closePath();
    c.fillStyle = "#FFB238"; c.fill(); c.strokeStyle = C.outline; c.lineWidth = 4; c.stroke();
    // eye & cheek
    c.save(); c.scale(f, 1);
    c.restore();
    const bl = blinkAt(t, 3);
    ell(c, 22, -14, 7, 9 * (1 - bl * 0.9), C.eye);
    circ(c, 20, -17, 3, "#fff");
    ell(c, 30, 4, 8, 5, C.cheek + "AA");
    // tuft
    c.beginPath(); c.moveTo(0, -42); c.quadraticCurveTo(6, -62, 16, -56); c.quadraticCurveTo(8, -50, 6, -42);
    c.fillStyle = "#5DB7F0"; c.fill(); c.strokeStyle = C.outline; c.lineWidth = 4; c.stroke();
    if (!o.flying) for (const dx of [-10, 10]) { c.strokeStyle = "#FFB238"; c.lineWidth = 5; c.beginPath(); c.moveTo(dx, 40); c.lineTo(dx, 54); c.stroke(); }
    c.restore();
  }

  function drawBizzy(c, o) { // bee
    const t = o.t || 0, f = o.face || 1, s = o.s || 1;
    c.save(); c.translate(o.x, o.y); if (o.rot) c.rotate(o.rot); c.scale(s * f, s);
    // wings
    const fl = Math.sin(t * 60) * 0.35;
    for (const [dx, a] of [[-8, -0.5 + fl], [10, -0.2 - fl]]) {
      c.save(); c.translate(dx, -36); c.rotate(a);
      ell(c, 0, -26, 20, 32, "rgba(220,245,255,.75)", "rgba(74,59,92,.7)", 4); c.restore();
    }
    // body
    c.save(); ell(c, 0, 0, 56, 42, "#FFD23F", C.outline, 5);
    c.beginPath(); c.ellipse(0, 0, 56, 42, 0, 0, TAU); c.clip();
    c.fillStyle = "#3B2F2F"; c.fillRect(-28, -50, 16, 100); c.fillRect(-2, -50, 16, 100);
    c.restore();
    ell(c, 0, 0, 56, 42, null, C.outline, 5);
    // stinger (tiny, round)
    c.beginPath(); c.moveTo(-54, -4); c.lineTo(-68, 2); c.lineTo(-54, 8); c.fillStyle = "#3B2F2F"; c.fill();
    // head
    circ(c, 52, -14, 30, "#FFE27A", C.outline, 5);
    for (const dx of [0, 14]) {
      c.beginPath(); c.moveTo(50 + dx, -40); c.quadraticCurveTo(52 + dx, -66, 66 + dx, -70);
      c.strokeStyle = C.outline; c.lineWidth = 4; c.stroke(); circ(c, 66 + dx, -70, 6, "#3B2F2F");
    }
    const bl = blinkAt(t, 4);
    ell(c, 58, -20, 6, 8 * (1 - bl * 0.9), C.eye); circ(c, 56, -23, 2.5, "#fff");
    ell(c, 68, -6, 7, 4, C.cheek + "CC");
    mouth(c, 62, -4, 16, o.expr || "happy", o.talk || 0);
    c.restore();
  }

  function drawHoppy(c, o) { // frog
    const t = o.t || 0, f = o.face || 1, s = o.s || 1;
    c.save(); c.translate(o.x, o.y); if (o.rot) { c.translate(0, -60 * s); c.rotate(o.rot); c.translate(0, 60 * s); }
    c.scale(s * f * (1 + (1 - (o.sq || 1)) * 0.6), s * (o.sq || 1));
    const g = "#6BCB77", g2 = "#4FA85C";
    // back legs
    for (const sx of [-1, 1]) ell(c, sx * 46, -22, 34, 22, g2, C.outline, 5);
    ell(c, 0, -48, 70, 50, g, C.outline, 5);
    ell(c, 0, -36, 44, 30, "#D8F5C8");
    for (const sx of [-1, 1]) ell(c, sx * 34, -4, 22, 9, g2, C.outline, 4);
    // eyes on top
    for (const sx of [-1, 1]) {
      circ(c, sx * 30, -98, 26, g, C.outline, 5);
      const bl = blinkAt(t, 5);
      const laugh = o.expr === "laugh";
      if (laugh) { c.beginPath(); c.lineWidth = 5; c.strokeStyle = C.eye; c.arc(sx * 30, -94, 11, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
      else { ell(c, sx * 30 + 3, -98, 12, 14 * (1 - bl * 0.9), C.eye); circ(c, sx * 30, -103, 4.5, "#fff"); }
    }
    ell(c, -46, -64, 12, 7, C.cheek + "AA"); ell(c, 46, -64, 12, 7, C.cheek + "AA");
    mouth(c, 0, -66, 58, o.expr === "laugh" ? "grin" : "happy", o.talk || 0);
    c.restore();
  }

  function drawNutty(c, o) { // squirrel
    const t = o.t || 0, f = o.face || 1, s = o.s || 1;
    const fur = "#E98A3D", fur2 = "#C96A22", belly = "#FFE0BF";
    c.save(); c.translate(o.x, o.y); if (o.rot) { c.translate(0, -80 * s); c.rotate(o.rot); c.translate(0, 80 * s); }
    c.scale(s * f, s * (o.sq || 1));
    const ph = o.walk || 0, walking = !!o.walking;
    const bob = walking ? -Math.abs(Math.sin(ph)) * 8 : 0;
    const sit = o.sit || 0;
    // tail (big curl)
    c.save(); c.translate(-40, -60 + bob); c.rotate(Math.sin(t * 4) * 0.08 + (o.tailWag || 0) * Math.sin(t * 14) * 0.15);
    c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(-110, 20, -120, -150, -40, -170); c.bezierCurveTo(20, -180, 30, -110, -10, -100);
    c.bezierCurveTo(-50, -90, -40, -40, 10, -30); c.closePath();
    c.fillStyle = fur; c.fill(); c.strokeStyle = C.outline; c.lineWidth = 5; c.stroke();
    c.beginPath(); c.moveTo(-70, -60); c.bezierCurveTo(-85, -120, -50, -150, -30, -150);
    c.strokeStyle = "#FFB877"; c.lineWidth = 8; c.lineCap = "round"; c.stroke();
    c.restore();
    const fl = walking ? Math.max(0, Math.sin(ph)) * 14 : 0, fr = walking ? Math.max(0, -Math.sin(ph)) * 14 : 0;
    ell(c, -18, -10 - fl, 22, 12, fur2, C.outline, 5); ell(c, 26, -10 - fr, 22, 12, fur2, C.outline, 5);
    ell(c, 0, -60 + bob + sit * 16, 40, 50, fur, C.outline, 5);
    ell(c, 6, -52 + bob + sit * 16, 24, 34, belly);
    const hy = -130 + bob + sit * 16;
    for (const sx of [-1, 1]) {
      c.beginPath(); c.moveTo(sx * 22 + 6, hy - 30); c.lineTo(sx * 34 + 6, hy - 66); c.lineTo(sx * 6 + 6, hy - 40); c.closePath();
      c.fillStyle = fur; c.fill(); c.strokeStyle = C.outline; c.lineWidth = 5; c.stroke();
    }
    circ(c, 6, hy, 46, fur, C.outline, 5);
    ell(c, 16, hy + 14, 26, 20, belly);
    eyes(c, 16, hy - 8, 18, 8, o.expr || "happy", blinkAt(t, 6), t);
    circ(c, 18, hy + 8, 6, "#5A3A26");
    ell(c, -14, hy + 12, 9, 6, C.cheek + "AA"); ell(c, 44, hy + 12, 9, 6, C.cheek + "AA");
    mouth(c, 18, hy + 20, 16, o.expr || "happy", o.talk || 0);
    // arms
    const aR = o.armR != null ? o.armR : 0.4;
    limb(c, 22, -80 + bob + sit * 16, 22 + Math.sin(aR) * 30, -80 + bob + sit * 16 + Math.cos(aR) * 30, 14, fur, C.outline);
    c.restore();
  }

  // ------------------------------------------------------------------ nature
  function sky(c, top, bot) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    c.fillStyle = g; c.fillRect(-400, -400, W + 800, H + 800);
  }
  function sun(c, x, y, r, t, mood = "happy", wink = 0) {
    c.save(); c.translate(x, y);
    // rays
    c.save(); c.rotate(t * 0.25);
    for (let i = 0; i < 12; i++) {
      c.rotate(TAU / 12);
      c.beginPath(); c.moveTo(-14, -r - 14); c.lineTo(0, -r - 52 - Math.sin(t * 3 + i) * 8); c.lineTo(14, -r - 14); c.closePath();
      c.fillStyle = "#FFC93C"; c.fill();
    }
    c.restore();
    const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    g.addColorStop(0, "#FFF4A8"); g.addColorStop(1, "#FFD23F");
    circ(c, 0, 0, r, g, "#F4A62A", 6);
    const fy = 0;
    if (mood === "sleepy") {
      for (const sx of [-1, 1]) { c.beginPath(); c.lineWidth = 6; c.strokeStyle = "#B5651D"; c.arc(sx * r * 0.33, -r * 0.08, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    } else {
      for (const sx of [-1, 1]) {
        if (sx === 1 && wink > 0.5) { c.beginPath(); c.lineWidth = 6; c.strokeStyle = "#B5651D"; c.arc(sx * r * 0.33, -r * 0.05, r * 0.13, 1.1 * Math.PI, 1.9 * Math.PI); c.stroke(); }
        else ell(c, sx * r * 0.33, -r * 0.12, r * 0.09, r * 0.13 * (1 - blinkAt(t, 7) * 0.9), "#7A3E12");
      }
    }
    ell(c, -r * 0.55, r * 0.18, r * 0.14, r * 0.08, "rgba(255,120,120,.45)");
    ell(c, r * 0.55, r * 0.18, r * 0.14, r * 0.08, "rgba(255,120,120,.45)");
    c.beginPath(); c.lineWidth = 6; c.strokeStyle = "#B5651D"; c.lineCap = "round";
    if (mood === "sleepy") { c.ellipse(0, r * 0.32, r * 0.12, r * 0.08 + Math.sin(t * 2) * 3, 0, 0, TAU); c.stroke(); }
    else { c.arc(0, r * 0.1, r * (mood === "big" ? 0.42 : 0.32), 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    c.restore();
  }
  function cloud(c, x, y, s, t, face = true, seed = 0) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath();
    for (const [dx, dy, r] of [[-90, 10, 55], [-35, -30, 70], [40, -20, 62], [95, 12, 50], [0, 20, 60]]) { c.moveTo(dx + r, dy); c.arc(dx, dy, r, 0, TAU); }
    c.fillStyle = "#FFFFFF"; c.shadowColor = "rgba(120,140,200,.25)"; c.shadowBlur = 0; c.fill();
    c.restore();
    if (face) {
      c.save(); c.translate(x, y); c.scale(s, s);
      const b = blinkAt(t, seed + 9);
      ell(c, -24, 4, 7, 9 * (1 - b * 0.9), "#7C8AB8"); ell(c, 24, 4, 7, 9 * (1 - b * 0.9), "#7C8AB8");
      ell(c, -44, 22, 11, 6, "rgba(255,160,190,.5)"); ell(c, 44, 22, 11, 6, "rgba(255,160,190,.5)");
      c.beginPath(); c.arc(0, 16, 12, 0.15 * Math.PI, 0.85 * Math.PI); c.strokeStyle = "#7C8AB8"; c.lineWidth = 4; c.stroke();
      c.restore();
    }
  }
  function hill(c, pts, fill, top) {
    // pts: polygon top edge as smooth curve [[x,y]...], closed to bottom
    c.beginPath(); c.moveTo(pts[0][0], H + 50); c.lineTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      c.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    const last = pts[pts.length - 1];
    c.lineTo(last[0], last[1]); c.lineTo(last[0], H + 50); c.closePath();
    if (top) { const g = c.createLinearGradient(0, Math.min(...pts.map((p) => p[1])), 0, H); g.addColorStop(0, top); g.addColorStop(1, fill); c.fillStyle = g; }
    else c.fillStyle = fill;
    c.fill();
  }
  function tree(c, x, y, s, t, col = "#5CC46E", col2 = "#46A85A", seed = 0, face = false) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(-22, 0); c.quadraticCurveTo(-14, -120, -18, -200); c.lineTo(18, -200); c.quadraticCurveTo(14, -120, 26, 0); c.closePath();
    c.fillStyle = "#9C6B45"; c.fill(); c.strokeStyle = "#6E4A30"; c.lineWidth = 5; c.stroke();
    const sw = Math.sin(t * 1.3 + seed) * 4;
    c.beginPath();
    for (const [dx, dy, r] of [[0, -300, 110], [-80, -240, 80], [80, -240, 80], [-50, -340, 70], [55, -350, 72]]) { c.moveTo(dx + sw + r, dy); c.arc(dx + sw, dy, r, 0, TAU); }
    c.fillStyle = col; c.fill(); c.strokeStyle = col2; c.lineWidth = 6; c.stroke();
    c.beginPath();
    for (const [dx, dy, r] of [[0, -300, 100], [-80, -240, 70], [80, -240, 70], [-50, -340, 60], [55, -350, 62]]) { c.moveTo(dx + sw + r, dy); c.arc(dx + sw, dy, r, 0, TAU); }
    c.fillStyle = col; c.fill();
    circ(c, -40 + sw, -330, 26, "rgba(255,255,255,.18)");
    if (face) {
      const b = blinkAt(t, seed + 11);
      ell(c, -26 + sw, -280, 8, 11 * (1 - b * 0.9), "#2E6B3A"); ell(c, 26 + sw, -280, 8, 11 * (1 - b * 0.9), "#2E6B3A");
      c.beginPath(); c.arc(sw, -262, 14, 0.15 * Math.PI, 0.85 * Math.PI); c.strokeStyle = "#2E6B3A"; c.lineWidth = 5; c.stroke();
    }
    c.restore();
  }
  function flower(c, x, y, s, t, col, seed = 0) {
    const sw = Math.sin(t * 2 + seed) * 0.12;
    c.save(); c.translate(x, y); c.rotate(sw * 0.4); c.scale(s, s);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(6, -30, 0, -60); c.strokeStyle = "#4FA85C"; c.lineWidth = 6; c.stroke();
    ell(c, 10, -26, 12, 6, "#6BCB77", null, 0, -0.5);
    c.translate(0, -62); c.rotate(sw);
    for (let i = 0; i < 5; i++) { c.rotate(TAU / 5); ell(c, 0, -16, 11, 15, col); }
    circ(c, 0, 0, 10, "#FFE066", "#F4A62A", 3);
    c.restore();
  }
  function butterfly(c, x, y, s, t, col, seed = 0) {
    const fl = Math.abs(Math.sin(t * 14 + seed));
    c.save(); c.translate(x, y); c.scale(s, s); c.rotate(Math.sin(t * 2 + seed) * 0.2);
    for (const sx of [-1, 1]) {
      c.save(); c.scale(sx * (0.25 + 0.75 * fl), 1);
      ell(c, 18, -10, 20, 16, col, C.outline, 3); ell(c, 14, 12, 13, 11, col, C.outline, 3);
      circ(c, 20, -12, 5, "rgba(255,255,255,.7)");
      c.restore();
    }
    ell(c, 0, 0, 4, 18, C.outline);
    c.beginPath(); c.moveTo(-2, -16); c.lineTo(-8, -28); c.moveTo(2, -16); c.lineTo(8, -28); c.strokeStyle = C.outline; c.lineWidth = 2; c.stroke();
    c.restore();
  }
  function grassTufts(c, y0, t, seed, n = 40, col = "#4FA85C") {
    const r = rng(seed);
    c.strokeStyle = col; c.lineWidth = 5; c.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = y0 + r() * (H - y0);
      const sw = Math.sin(t * 2 + i) * 3;
      c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x - 12 + sw, y - 18); c.moveTo(x, y); c.lineTo(x + sw, y - 24); c.moveTo(x + 8, y); c.lineTo(x + 12 + sw, y - 16); c.stroke();
    }
  }
  function smallBird(c, x, y, s, t, seed = 0) {
    const fl = Math.sin(t * 16 + seed);
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(-26, -fl * 12); c.quadraticCurveTo(-12, -16, 0, 0); c.quadraticCurveTo(12, -16, 26, -fl * 12);
    c.strokeStyle = "#6A5A8A"; c.lineWidth = 5; c.lineCap = "round"; c.stroke(); c.restore();
  }

  // ------------------------------------------------------------------ rainbow
  /** fills: array(6) 0..1 (0 = grey ghost, 1 = full colour). paint: array(6) 0..1 how much of the arc is drawn */
  function rainbow(c, cx, cy, R, bw, fills, alpha = 1, paint = null, wob = 0, ghost = "rgba(225,225,238,.55)") {
    c.save(); c.globalAlpha = alpha; c.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const r = R - i * bw;
      const p = paint ? paint[i] : 1;
      c.beginPath(); c.arc(cx, cy, r + Math.sin(wob * 20 + i) * wob * 14, Math.PI, Math.PI + Math.PI * Math.max(0.001, p));
      c.strokeStyle = ghost; c.lineWidth = bw + 1;
      if (fills[i] < 1) c.stroke();
      if (fills[i] > 0) { c.globalAlpha = alpha * fills[i]; c.strokeStyle = RAINBOW[i]; c.stroke(); c.globalAlpha = alpha; }
    }
    c.restore();
  }
  /** cute colour-star with a face */
  function colorStar(c, x, y, r, col, t, rot = 0) {
    c.save();
    const g = c.createRadialGradient(x, y, r * 0.2, x, y, r * 2.2);
    g.addColorStop(0, col + "AA"); g.addColorStop(1, col + "00");
    c.fillStyle = g; c.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    star(c, x, y, r, rot, 5, 0.55); c.fillStyle = col; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = r * 0.12; c.lineJoin = "round"; c.stroke();
    const k = r / 40;
    ell(c, x - 9 * k, y - 2 * k, 3.5 * k, 5 * k, C.eye); ell(c, x + 9 * k, y - 2 * k, 3.5 * k, 5 * k, C.eye);
    c.beginPath(); c.arc(x, y + 5 * k, 6 * k, 0.15 * Math.PI, 0.85 * Math.PI); c.strokeStyle = C.eye; c.lineWidth = 2.5 * k; c.stroke();
    c.restore();
  }
  function sparkles(c, x, y, t, t0, n = 10, spread = 160, col = "#FFF6A5", seed = 1) {
    const u = (t - t0) / 0.9;
    if (u < 0 || u > 1) return;
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.5, d = spread * E.out(u) * (0.6 + r() * 0.5);
      c.save(); c.globalAlpha = 1 - u;
      star(c, x + Math.cos(a) * d, y + Math.sin(a) * d, 14 * (1 - u * 0.5), u * 4, 4, 0.4);
      c.fillStyle = i % 2 ? col : "#FFFFFF"; c.fill(); c.restore();
    }
  }
  function twinkleField(c, t, seed, n, x0, y0, w, h, col = "#FFFFFF") {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * w, y = y0 + r() * h, ph = r() * TAU;
      const a = Math.max(0, Math.sin(t * 3 + ph));
      c.save(); c.globalAlpha = a; star(c, x, y, 6 + 8 * a, 0, 4, 0.35); c.fillStyle = col; c.fill(); c.restore();
    }
  }

  // ------------------------------------------------------------------ text
  const FONT = "Fredoka, 'Baloo 2', 'Comic Sans MS', 'Trebuchet MS', sans-serif";
  function outlinedText(c, txt, x, y, size, fill, stroke = "#fff", sw = 14, align = "center") {
    c.save(); c.font = `600 ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = "middle"; c.lineJoin = "round";
    c.strokeStyle = stroke; c.lineWidth = sw; c.strokeText(txt, x, y);
    c.fillStyle = fill; c.fillText(txt, x, y); c.restore();
  }
  function bigNumber(c, n, x, y, t, t0) {
    const u = (t - t0);
    if (u < 0 || u > 1.15) return;
    const sc = E.back(clamp(u / 0.3)) * (u > 0.85 ? 1 - (u - 0.85) / 0.3 : 1);
    c.save(); c.translate(x, y - u * 40); c.scale(sc, sc);
    circ(c, 0, 0, 70, "#FFFFFF", RAINBOW[(n - 1) % 6], 10);
    outlinedText(c, String(n), 0, 4, 96, RAINBOW[(n - 1) % 6], "#fff", 0);
    c.restore();
  }

  G.CARTOON_ENGINE = {
    W, H, TAU, clamp, lerp, prog, E, track, hopY, rng, blinkAt, RAINBOW, C,
    ell, circ, rrect, limb, star, heart, shadow, eyes, mouth,
    drawBobo, drawMimi, drawPip, drawBizzy, drawHoppy, drawNutty,
    sky, sun, cloud, hill, tree, flower, butterfly, grassTufts, smallBird,
    rainbow, colorStar, sparkles, twinkleField, outlinedText, bigNumber, FONT,
  };
})(window);
