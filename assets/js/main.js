/* =========================================================================
   הסטודיו של אביה · Aviary's Studio Art
   Generative watercolor scenes, a paintable hero, and a light scroll engine.
   No dependencies.
   ========================================================================= */
(() => {
  'use strict';

  /* ---------- Studio details: edit these ---------- */
  const STUDIO = {
    whatsapp: '972500000000',                    // international format, digits only
    instagram: 'https://www.instagram.com/',     // full profile URL
  };

  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* =======================================================================
     Watercolor engine
     Layered, recursively deformed polygons at low opacity, after the
     classic generative-watercolor technique.
     ======================================================================= */
  const PIG = {
    rose: [236, 132, 168],
    roseDeep: [206, 62, 112],
    apricot: [255, 168, 118],
    naples: [255, 208, 92],
    sage: [138, 194, 128],
    sageDeep: [92, 160, 96],
    cerulean: [118, 178, 228],
    ceruleanDeep: [70, 136, 206],
    lavender: [172, 148, 232],
    clay: [212, 136, 100],
    ink: [44, 35, 64],
    paper: [255, 252, 248],
  };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // Approximately normal, sd ≈ 1
  const gauss = (r) => (r() + r() + r() + r() - 2) * 1.732;

  function ellipsePts(cx, cy, rx, ry, n, r, jitter = .12, rot = 0) {
    const pts = [];
    const off = r() * Math.PI * 2;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      const k = 1 + (r() - .5) * 2 * jitter;
      const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      pts.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return pts;
  }

  // Split long edges so displacement stays proportional everywhere
  function subdivide(pts, maxLen) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen));
      for (let k = 0; k < n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
    }
    return out;
  }

  function deform(pts, depth, v, r) {
    let out = pts;
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (let i = 0; i < out.length; i++) {
        const a = out[i], b = out[(i + 1) % out.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        next.push(a, [(a[0] + b[0]) / 2 + gauss(r) * v * len, (a[1] + b[1]) / 2 + gauss(r) * v * len]);
      }
      out = next;
    }
    return out;
  }

  function tracePoly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  const SOFT = .62; // overall pigment load: lower is paler

  function wash(ctx, pts, color, r, o = {}) {
    const { layers = 26, pre = 2, v = .28, depth = 3, edge = true } = o;
    const alpha = (o.alpha ?? .045) * SOFT;
    const base = deform(pts, pre, v, r);
    ctx.fillStyle = rgba(color, alpha);
    let last = base;
    for (let i = 0; i < layers; i++) {
      last = deform(base, depth, v * .75, r);
      tracePoly(ctx, last);
      ctx.fill();
    }
    if (edge) { // pigment pooling at the rim
      ctx.strokeStyle = rgba(color, alpha * 1.6);
      ctx.lineWidth = 1.1;
      tracePoly(ctx, last);
      ctx.stroke();
    }
  }

  function blob(ctx, cx, cy, rx, ry, color, r, o = {}) {
    wash(ctx, ellipsePts(cx, cy, rx, ry, o.n || 10, r, o.jitter ?? .12, o.rot || 0), color, r, o);
  }

  function catmull(pts, seg) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      for (let s = 0; s < seg; s++) {
        const t = s / seg, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((k) => .5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Dry-brush stroke made of individual bristles
  function brush(ctx, pts, width, color, r, o = {}) {
    const { alpha = .35, bristles = 18, dry = .25 } = o;
    const path = catmull(pts, 16);
    const N = path.length;
    const norms = path.map((p, i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(N - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [-dy / l, dx / l];
    });
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < bristles; k++) {
      const off = ((k + .5) / bristles - .5) * width + gauss(r) * width * .02;
      const start = Math.floor(r() * dry * .25 * N);
      const end = Math.floor(N * (1 - r() * dry));
      ctx.strokeStyle = rgba(color, alpha * (.5 + r() * .5));
      ctx.lineWidth = (width / bristles) * (1.3 + r() * 1.5);
      ctx.beginPath();
      for (let i = start; i < end; i++) {
        const t = i / (N - 1);
        const f = .5 + .5 * Math.sin(Math.PI * clamp(t * 1.1 + .02, 0, 1));
        const x = path[i][0] + norms[i][0] * off * f;
        const y = path[i][1] + norms[i][1] * off * f;
        i === start ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function speckle(ctx, x0, y0, w, h, color, r, count = 40, alpha = .18) {
    ctx.fillStyle = rgba(color, alpha);
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.arc(x0 + r() * w, y0 + r() * h, .6 + r() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function hillPts(W, H, y, amp, freq, r) {
    const pts = [], n = 8, ph = r() * Math.PI * 2;
    for (let i = 0; i <= n; i++) {
      const x = -W * .15 + W * 1.3 * (i / n);
      pts.push([x, y + Math.sin((i / n) * Math.PI * freq + ph) * amp]);
    }
    pts.push([W * 1.15, H * 1.25], [-W * .15, H * 1.25]);
    return subdivide(pts, W * .12);
  }

  function drawBird(ctx, x, y, s, body, wing, flip = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((flip ? -1 : 1) * s / 48, s / 48);
    ctx.translate(-24, -20);
    ctx.fillStyle = rgba(body, .95);
    ctx.beginPath(); ctx.moveTo(36, 21); ctx.lineTo(47, 11.5); ctx.lineTo(44.5, 23); ctx.lineTo(38.5, 27.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(26, 24, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14.5, 14.5, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(PIG.naples, 1);
    ctx.beginPath(); ctx.moveTo(7.4, 12.2); ctx.lineTo(1, 15.8); ctx.lineTo(7.6, 17.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(wing, .95);
    ctx.beginPath(); ctx.moveTo(21, 23.5); ctx.bezierCurveTo(26, 19, 33, 19.5, 37, 24); ctx.bezierCurveTo(32, 29.5, 25, 29, 21, 23.5); ctx.fill();
    ctx.fillStyle = rgba(PIG.paper, 1);
    ctx.beginPath(); ctx.arc(12.4, 13.2, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(PIG.ink, .85); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(24, 33.5); ctx.lineTo(24, 38); ctx.moveTo(29.5, 33); ctx.lineTo(29.5, 38); ctx.stroke();
    ctx.restore();
  }

  function flyingBird(ctx, x, y, s, alpha = .55) {
    ctx.strokeStyle = rgba(PIG.ink, alpha);
    ctx.lineWidth = Math.max(1.2, s * .12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s, y - s * .2);
    ctx.quadraticCurveTo(x - s * .45, y - s * .75, x, y);
    ctx.quadraticCurveTo(x + s * .45, y - s * .75, x + s, y - s * .2);
    ctx.stroke();
  }

  /* =======================================================================
     Scenes. Each draws into a W×H canvas (CSS pixels) with its own seed.
     ======================================================================= */
  const SCENES = {
    hero(ctx, W, H, r) {
      ctx.globalCompositeOperation = 'multiply';
      blob(ctx, W * .5, H * .12, W * .8, H * .22, PIG.cerulean, r, { alpha: .022, layers: 20 });
      blob(ctx, W * .3, H * .36, W * .42, H * .14, PIG.lavender, r, { alpha: .018, layers: 18 });
      ctx.globalCompositeOperation = 'source-over'; // the sun sits on top of the sky instead of mixing into it
      blob(ctx, W * .62, H * .3, W * .2, W * .2, PIG.naples, r, { alpha: .07, jitter: .05 });
      blob(ctx, W * .62, H * .3, W * .11, W * .11, PIG.apricot, r, { alpha: .035, layers: 18, jitter: .05 });
      ctx.globalCompositeOperation = 'multiply';
      wash(ctx, hillPts(W, H, H * .6, H * .045, 1.4, r), PIG.lavender, r, { alpha: .032, v: .2 });
      wash(ctx, hillPts(W, H, H * .72, H * .05, 2.2, r), PIG.sage, r, { alpha: .04, v: .2 });
      wash(ctx, hillPts(W, H, H * .87, H * .03, 1.2, r), PIG.sage, r, { alpha: .028, v: .18, layers: 18 });
      // meadow flowers
      const flowers = [[.14, .9, PIG.rose], [.27, .84, PIG.apricot], [.42, .92, PIG.lavender], [.72, .87, PIG.rose], [.86, .93, PIG.naples]];
      flowers.forEach(([fx, fy, c], i) => {
        const x = W * fx, y = H * fy, s = W * (.03 + (i % 2) * .008);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = rgba(PIG.sageDeep, .7); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y + s * .8); ctx.quadraticCurveTo(x + s * .4, y + s * 2.4, x - s * .1, y + s * 4); ctx.stroke();
        blob(ctx, x, y, s, s * .9, c, r, { alpha: .16, layers: 14, pre: 1 });
        blob(ctx, x, y, s * .32, s * .32, PIG.naples, r, { alpha: .3, layers: 8, pre: 1, edge: false });
        ctx.globalCompositeOperation = 'multiply';
      });
      ctx.globalCompositeOperation = 'source-over';
      flyingBird(ctx, W * .3, H * .2, W * .035);
      flyingBird(ctx, W * .4, H * .15, W * .025, .45);
      flyingBird(ctx, W * .22, H * .27, W * .02, .35);
      speckle(ctx, 0, 0, W, H, PIG.lavender, r, 30, .12);
    },

    weekly(ctx, W, H, r) {
      ctx.globalCompositeOperation = 'multiply';
      blob(ctx, W * .88, H * .12, W * .36, H * .3, PIG.sage, r, { alpha: .05 });
      blob(ctx, W * .1, H * .92, W * .42, H * .32, PIG.cerulean, r, { alpha: .042 });
      blob(ctx, W * .16, H * .16, Math.min(W, H) * .16, Math.min(W, H) * .16, PIG.naples, r, { alpha: .06 });
      blob(ctx, W * .82, H * .86, Math.min(W, H) * .1, Math.min(W, H) * .1, PIG.rose, r, { alpha: .06 });
      brush(ctx, [[W * .06, H * .86], [W * .35, H * .8], [W * .62, H * .88], [W * .94, H * .8]], Math.min(W, H) * .07, PIG.lavender, r, { alpha: .16 });
      speckle(ctx, 0, 0, W, H, PIG.sageDeep, r, 26, .14);
    },

    events(ctx, W, H, r) {
      ctx.globalCompositeOperation = 'multiply';
      blob(ctx, W * .5, H * .62, W * .55, H * .32, PIG.naples, r, { alpha: .022, layers: 18 });
      blob(ctx, W * .92, H * .95, W * .3, H * .25, PIG.apricot, r, { alpha: .04 });
      const cols = [PIG.rose, PIG.naples, PIG.cerulean, PIG.sage, PIG.apricot, PIG.lavender];
      garland(ctx, W, r, [W * -.02, H * .1], [W * .5, H * .44], [W * 1.02, H * .08], 7, cols, 0);
      garland(ctx, W, r, [W * -.02, H * .5], [W * .5, H * .8], [W * 1.02, H * .46], 6, cols, 3);
      // confetti
      for (let i = 0; i < 26; i++) {
        const s = Math.min(W, H) * (.01 + r() * .014);
        blob(ctx, r() * W, H * (.1 + r() * .85), s, s, cols[i % cols.length], r, { alpha: .14, layers: 7, pre: 1, depth: 2, edge: false });
      }
    },

    private(ctx, W, H, r) {
      ctx.globalCompositeOperation = 'multiply';
      const S = Math.min(W, H), R = S * .27, cx = W * .5, cy = H * .5;
      const cols = [PIG.rose, PIG.cerulean, PIG.naples];
      [-90, 30, 150].forEach((deg, i) => {
        const a = deg * Math.PI / 180;
        blob(ctx, cx + Math.cos(a) * R * .62, cy + Math.sin(a) * R * .62, R, R, cols[i], r, { alpha: .038, layers: 28, n: 12, jitter: .05 });
      });
      blob(ctx, W * .1, H * .12, S * .1, S * .1, PIG.lavender, r, { alpha: .05, layers: 14 });
      blob(ctx, W * .9, H * .9, S * .08, S * .08, PIG.sage, r, { alpha: .06, layers: 14 });
      speckle(ctx, 0, 0, W, H, PIG.roseDeep, r, 18, .12);
    },

    't-watercolor'(ctx, W, H, r) {
      ctx.globalCompositeOperation = 'multiply';
      blob(ctx, W * .5, H * .22, W * .55, H * .2, PIG.cerulean, r, { alpha: .045 });
      blob(ctx, W * .38, H * .5, W * .48, H * .18, PIG.lavender, r, { alpha: .045 });
      blob(ctx, W * .62, H * .76, W * .5, H * .2, PIG.rose, r, { alpha: .045 });
      blob(ctx, W * .78, H * .38, W * .1, W * .1, PIG.naples, r, { alpha: .08, layers: 16 });
      blob(ctx, W * .22, H * .84, W * .08, W * .08, PIG.sage, r, { alpha: .08, layers: 16 });
      speckle(ctx, 0, 0, W, H, PIG.ceruleanDeep, r, 40, .16);
    },

    't-acrylic'(ctx, W, H, r) {
      ctx.globalCompositeOperation = 'multiply';
      blob(ctx, W * .5, H * .5, W * .6, H * .55, PIG.naples, r, { alpha: .02, layers: 14 });
      ctx.globalCompositeOperation = 'source-over';
      const B = W * .2;
      brush(ctx, [[W * .05, H * .2], [W * .45, H * .12], [W * .95, H * .24]], B, PIG.ceruleanDeep, r, { alpha: .8, bristles: 30, dry: .15 });
      brush(ctx, [[W * .9, H * .32], [W * .5, H * .46], [W * .08, H * .38]], B, PIG.roseDeep, r, { alpha: .82, bristles: 30, dry: .15 });
      brush(ctx, [[W * .12, H * .6], [W * .55, H * .54], [W * .92, H * .66]], B * .9, PIG.naples, r, { alpha: .9, bristles: 30, dry: .2 });
      brush(ctx, [[W * .85, H * .78], [W * .45, H * .86], [W * .12, H * .8]], B * .85, PIG.sageDeep, r, { alpha: .8, bristles: 28, dry: .2 });
      brush(ctx, [[W * .3, H * .08], [W * .36, H * .5], [W * .28, H * .94]], B * .35, PIG.paper, r, { alpha: .75, bristles: 14, dry: .4 });
    },

    't-clay'(ctx, W, H, r) {
      ctx.globalCompositeOperation = 'multiply';
      blob(ctx, W * .5, H * .95, W * .7, H * .2, PIG.apricot, r, { alpha: .03, layers: 16 });
      blob(ctx, W * .3, H * .2, W * .35, H * .2, PIG.cerulean, r, { alpha: .02, layers: 14 });
      const vessel = (cx, base, h, prof, color, glaze) => {
        const left = [], right = [];
        catmull(prof, 6).forEach(([t, rr]) => { right.push([cx + rr * W, base - h + t * h]); left.push([cx - rr * W, base - h + t * h]); });
        const pts = subdivide(right.concat(left.reverse()), W * .04);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = rgba(PIG.ink, .07);
        ctx.beginPath(); ctx.ellipse(cx, base + 2, prof[prof.length - 1][1] * W * 1.3, h * .05, 0, 0, Math.PI * 2); ctx.fill();
        wash(ctx, pts, color, r, { alpha: .14, layers: 12, v: .012, pre: 1, depth: 2 });
        if (glaze) wash(ctx, pts.slice(0, Math.floor(pts.length * .5)).concat([[cx, base - h * .45]]), glaze, r, { alpha: .05, layers: 8, v: .02, pre: 1, depth: 2, edge: false });
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = rgba(PIG.ink, .5); ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse(cx, base - h, prof[0][1] * W, h * .05, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = rgba(PIG.paper, .55); ctx.lineWidth = W * .014; ctx.lineCap = 'round';
        const pr = (i) => prof[Math.min(i, prof.length - 1)][1];
        ctx.beginPath(); ctx.moveTo(cx + pr(1) * W * .55, base - h * .82); ctx.quadraticCurveTo(cx + pr(2) * W * .7, base - h * .5, cx + pr(3) * W * .5, base - h * .22); ctx.stroke();
      };
      vessel(W * .36, H * .8, H * .5, [[0, .1], [.12, .12], [.42, .2], [.72, .18], [.92, .12], [1, .1]], PIG.clay, PIG.apricot);
      vessel(W * .72, H * .84, H * .24, [[0, .17], [.35, .16], [.7, .12], [1, .08]], PIG.sage, PIG.cerulean);
      vessel(W * .8, H * .54, H * .16, [[0, .07], [.5, .08], [1, .06]], PIG.lavender, null);
    },

    't-collage'(ctx, W, H, r) {
      const pieces = [
        { k: 'rect', x: .3, y: .28, w: .48, h: .34, rot: -.12, c: PIG.cerulean, p: 'stripes' },
        { k: 'circle', x: .68, y: .3, w: .26, c: PIG.naples, p: null },
        { k: 'rect', x: .58, y: .6, w: .5, h: .3, rot: .1, c: PIG.rose, p: 'dots' },
        { k: 'arch', x: .28, y: .72, w: .3, h: .34, rot: -.05, c: PIG.sage, p: null },
        { k: 'circle', x: .22, y: .5, w: .12, c: PIG.lavender, p: 'dots' },
        { k: 'rect', x: .74, y: .86, w: .22, h: .12, rot: -.2, c: PIG.apricot, p: 'stripes' },
      ];
      pieces.forEach((pc) => {
        const cx = pc.x * W, cy = pc.y * H;
        let pts;
        if (pc.k === 'circle') pts = ellipsePts(cx, cy, pc.w * W, pc.w * W, 48, r, .01);
        else if (pc.k === 'arch') {
          const w = pc.w * W, h = pc.h * H; pts = [];
          for (let i = 0; i <= 20; i++) { const a = Math.PI + (i / 20) * Math.PI; pts.push([cx + Math.cos(a) * w / 2, cy - h / 2 + w / 2 + Math.sin(a) * w / 2]); }
          pts.push([cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]);
        } else {
          const w = pc.w * W, h = pc.h * H, c = Math.cos(pc.rot), s = Math.sin(pc.rot);
          pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
        }
        pts = deform(subdivide(pts, W * .03), 2, .02, r);
        ctx.save();
        ctx.shadowColor = rgba(PIG.ink, .2); ctx.shadowBlur = 10; ctx.shadowOffsetY = 4; ctx.shadowOffsetX = -2;
        ctx.fillStyle = rgba(pc.c, 1);
        tracePoly(ctx, pts); ctx.fill();
        ctx.restore();
        if (pc.p) {
          ctx.save(); tracePoly(ctx, pts); ctx.clip();
          if (pc.p === 'dots') {
            ctx.fillStyle = rgba(PIG.paper, .6);
            for (let x = 0; x < W; x += 12) for (let y = 0; y < H; y += 12) { ctx.beginPath(); ctx.arc(x + (y % 24 ? 6 : 0), y, 2.2, 0, Math.PI * 2); ctx.fill(); }
          } else {
            ctx.strokeStyle = rgba(PIG.paper, .5); ctx.lineWidth = 4;
            for (let x = -H; x < W + H; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke(); }
          }
          ctx.restore();
        }
      });
      ctx.strokeStyle = rgba(PIG.ink, .75); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(W * .1, H * .1); ctx.bezierCurveTo(W * .3, H * .02, W * .4, H * .18, W * .55, H * .08); ctx.stroke();
    },

    't-macrame'(ctx, W, H, r) {
      ctx.globalCompositeOperation = 'multiply';
      blob(ctx, W * .5, H * .5, W * .45, H * .42, PIG.lavender, r, { alpha: .025, layers: 16 });
      ctx.globalCompositeOperation = 'source-over';
      const cord = [200, 146, 104], knot = [232, 196, 160];
      const n = 8, top = H * .15, rows = 6, rowH = H * .085;
      const xs = Array.from({ length: n }, (_, i) => W * (.2 + .6 * i / (n - 1)));
      const paths = xs.map((x) => [[x, top]]);
      const knots = [];
      for (let j = 0; j < rows; j++) {
        const y = top + rowH * (j + 1);
        const start = j % 2;
        const inPair = new Set();
        for (let i = start; i + 1 < n; i += 2) {
          const kx = (xs[i] + xs[i + 1]) / 2;
          paths[i].push([kx - W * .012, y]); paths[i + 1].push([kx + W * .012, y]);
          inPair.add(i); inPair.add(i + 1);
          knots.push([kx, y]);
        }
        for (let i = 0; i < n; i++) if (!inPair.has(i)) paths[i].push([xs[i], y]);
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      paths.forEach((p, i) => {
        const last = p[p.length - 1];
        const fx = last[0] + (xs[i] - W / 2) * .12;
        ctx.strokeStyle = rgba(cord, .95); ctx.lineWidth = W * .014;
        ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
        for (let k = 1; k < p.length; k++) ctx.lineTo(p[k][0], p[k][1]);
        ctx.lineTo(fx, H * (.84 + r() * .05));
        ctx.stroke();
        ctx.strokeStyle = rgba(cord, .6); ctx.lineWidth = 1;
        for (let f = -2; f <= 2; f++) { ctx.beginPath(); ctx.moveTo(fx, H * .82); ctx.lineTo(fx + f * 2.4, H * (.88 + r() * .06)); ctx.stroke(); }
      });
      knots.forEach(([x, y]) => {
        ctx.fillStyle = rgba(knot, 1); ctx.strokeStyle = rgba(cord, 1); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(x, y, W * .03, H * .018, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
      ctx.strokeStyle = rgba([150, 104, 78], 1); ctx.lineWidth = W * .035;
      ctx.beginPath(); ctx.moveTo(W * .1, top); ctx.lineTo(W * .9, top); ctx.stroke();
      ctx.strokeStyle = rgba(cord, .8); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(W * .14, top); ctx.quadraticCurveTo(W * .5, H * .02, W * .86, top); ctx.stroke();
    },

    't-embroidery'(ctx, W, H, r) {
      const cx = W * .5, cy = H * .48, R = Math.min(W, H) * .36;
      ctx.globalCompositeOperation = 'multiply';
      blob(ctx, W * .5, H * .9, W * .5, H * .15, PIG.sage, r, { alpha: .03, layers: 14 });
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = rgba([250, 244, 236], 1); ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = rgba(PIG.ink, .05); ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.restore();
      const heart = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'];
      const c = R * .1, ox = cx - c * 4.5, oy = cy - c * 4.6;
      ctx.lineCap = 'round';
      heart.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch !== 'X') return;
        const x = ox + i * c, y = oy + j * c, m = c * .18;
        ctx.strokeStyle = rgba(j < 3 ? PIG.roseDeep : PIG.rose.map((v, k) => v - [10, 40, 30][k]), .95);
        ctx.lineWidth = c * .24;
        ctx.beginPath(); ctx.moveTo(x + m, y + m); ctx.lineTo(x + c - m, y + c - m); ctx.moveTo(x + c - m, y + m); ctx.lineTo(x + m, y + c - m); ctx.stroke();
      }));
      const daisy = (x, y, s, col) => {
        ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = 2;
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * Math.PI * 2;
          ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s, s * .9, s * .4, a, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = rgba(PIG.naples, 1); ctx.beginPath(); ctx.arc(x, y, s * .45, 0, Math.PI * 2); ctx.fill();
      };
      daisy(cx - R * .58, cy + R * .48, R * .1, PIG.lavender);
      daisy(cx + R * .6, cy - R * .5, R * .08, PIG.cerulean);
      ctx.strokeStyle = rgba(PIG.sageDeep, 1); ctx.lineWidth = 2;
      [[-.4, .62, -.6], [-.72, .3, .5], [.42, -.66, 2.2]].forEach(([dx, dy, a]) => {
        ctx.beginPath(); ctx.ellipse(cx + dx * R, cy + dy * R, R * .1, R * .04, a, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.strokeStyle = rgba(PIG.clay, 1); ctx.lineWidth = R * .09;
      ctx.beginPath(); ctx.arc(cx, cy, R + R * .02, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = rgba([170, 104, 76], 1); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, R + R * .065, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba([170, 104, 76], 1);
      ctx.fillRect(cx - R * .07, cy - R - R * .2, R * .14, R * .14);
      ctx.strokeStyle = rgba(PIG.roseDeep, .9); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx + R * .2, cy + R * .55); ctx.bezierCurveTo(cx + R * .9, cy + R * 1.05, cx + R * 1.1, cy + R * .5, cx + R * .95, cy + R * 1.15); ctx.stroke();
      ctx.strokeStyle = rgba([150, 150, 165], 1); ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(cx + R * .95, cy + R * 1.15); ctx.lineTo(cx + R * .7, cy + R * 1.3); ctx.stroke();
    },

    't-print'(ctx, W, H, r) {
      ctx.globalCompositeOperation = 'multiply';
      const cols = [PIG.sageDeep, PIG.cerulean, PIG.rose];
      const nx = 3, ny = 4, cw = W / nx, ch = H / ny;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = cw * (i + .5) + (r() - .5) * 6, y = ch * (j + .5) + (r() - .5) * 6;
        const len = Math.min(cw, ch) * .78, wid = len * .42;
        const rot = ((i + j) % 2 ? .6 : -.6) + (r() - .5) * .2;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.fillStyle = rgba(cols[(i + j * 2) % 3], .78);
        ctx.beginPath(); ctx.moveTo(0, -len / 2);
        ctx.quadraticCurveTo(wid, 0, 0, len / 2); ctx.quadraticCurveTo(-wid, 0, 0, -len / 2); ctx.fill();
        ctx.strokeStyle = rgba(PIG.paper, .85); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0, -len * .4); ctx.lineTo(0, len * .45);
        for (let k = -2; k <= 2; k++) { ctx.moveTo(0, k * len * .12); ctx.lineTo(wid * .32, k * len * .12 - len * .08); ctx.moveTo(0, k * len * .12); ctx.lineTo(-wid * .32, k * len * .12 - len * .08); }
        ctx.stroke();
        ctx.restore();
      }
      // ink texture of a hand-pressed stamp
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      for (let k = 0; k < 900; k++) { ctx.beginPath(); ctx.arc(r() * W, r() * H, .5 + r() * 1.6, 0, Math.PI * 2); ctx.fill(); }
    },

    about(ctx, W, H, r) {
      ctx.globalCompositeOperation = 'multiply';
      blob(ctx, W * .5, H * .16, W * .7, H * .2, PIG.lavender, r, { alpha: .03, layers: 18 });
      blob(ctx, W * .55, H * .44, W * .3, W * .3, PIG.apricot, r, { alpha: .055, jitter: .06 });
      blob(ctx, W * .55, H * .44, W * .19, W * .19, PIG.rose, r, { alpha: .045, layers: 20, jitter: .06 });
      wash(ctx, hillPts(W, H, H * .82, H * .03, 1.6, r), PIG.sage, r, { alpha: .05, v: .2 });
      ctx.globalCompositeOperation = 'source-over';
      brush(ctx, [[W * 1.05, H * .6], [W * .7, H * .64], [W * .42, H * .6], [W * .12, H * .66]], W * .028, [112, 84, 92], r, { alpha: .75, bristles: 10, dry: .08 });
      brush(ctx, [[W * .66, H * .64], [W * .58, H * .72], [W * .5, H * .76]], W * .014, [112, 84, 92], r, { alpha: .7, bristles: 6, dry: .1 });
      ctx.globalCompositeOperation = 'multiply';
      [[.88, .57, -.6], [.78, .66, .5], [.3, .57, -.4], [.2, .7, .6], [.54, .78, .8], [.62, .55, -.8]].forEach(([x, y, a]) => {
        blob(ctx, W * x, H * y, W * .05, W * .022, PIG.sage, r, { alpha: .11, layers: 10, pre: 1, rot: a, jitter: .05 });
      });
      ctx.globalCompositeOperation = 'source-over';
      drawBird(ctx, W * .5, H * .555, W * .26, PIG.lavender, PIG.rose);
      flyingBird(ctx, W * .24, H * .26, W * .04, .5);
      flyingBird(ctx, W * .34, H * .2, W * .028, .4);
    },
  };

  function garland(ctx, W, r, p0, p1, p2, count, cols, offset) {
    const q = (t) => [0, 1].map((k) => (1 - t) * (1 - t) * p0[k] + 2 * (1 - t) * t * p1[k] + t * t * p2[k]);
    const dq = (t) => [0, 1].map((k) => 2 * (1 - t) * (p1[k] - p0[k]) + 2 * t * (p2[k] - p1[k]));
    const fw = W * .085, fh = W * .11;
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count;
      const p = q(t), d = dq(t), l = Math.hypot(d[0], d[1]);
      const ux = d[0] / l, uy = d[1] / l;
      let nx = -uy, ny = ux; if (ny < 0) { nx = -nx; ny = -ny; }
      const tri = [[p[0] - ux * fw / 2, p[1] - uy * fw / 2], [p[0] + ux * fw / 2, p[1] + uy * fw / 2], [p[0] + nx * fh, p[1] + ny * fh]];
      ctx.globalCompositeOperation = 'multiply';
      wash(ctx, subdivide(tri, fw * .3), cols[(i + offset) % cols.length], r, { alpha: .1, layers: 12, v: .06, pre: 1, depth: 2 });
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgba(PIG.ink, .6); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); ctx.stroke();
  }

  /* ---------- Paint the art canvases lazily ---------- */
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function paintScene(cv) {
    const w = Math.round(cv.clientWidth), h = Math.round(cv.clientHeight);
    if (!w || !h) return;
    const key = `${w}x${h}`;
    if (cv.dataset.painted === key) return;
    const d = DPR();
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
    const ctx = cv.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const name = cv.dataset.scene;
    if (SCENES[name]) SCENES[name](ctx, w, h, mulberry32(hashStr(name + (cv.dataset.seed || ''))));
    cv.dataset.painted = key;
  }

  const artCanvases = $$('canvas[data-scene]');
  const queue = [];
  let pumping = false;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 16));
  function pump() {
    if (pumping) return;
    pumping = true;
    const step = () => {
      const cv = queue.shift();
      if (cv) { try { paintScene(cv); } catch (err) { console.error(err); } }
      if (queue.length) idle(step); else pumping = false;
    };
    idle(step);
  }
  function enqueue(cv, urgent) {
    if (urgent) { try { paintScene(cv); } catch (err) { console.error(err); } return; }
    if (!queue.includes(cv)) queue.push(cv);
    pump();
  }
  if ('IntersectionObserver' in window) {
    const artIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) enqueue(en.target); });
    }, { rootMargin: '600px 600px' });
    artCanvases.forEach((cv) => artIO.observe(cv));
  } else {
    artCanvases.forEach((cv) => enqueue(cv));
  }
  // The hero art paints straight away so the first frame is complete
  $$('.hero canvas[data-scene]').forEach((cv) => enqueue(cv, true));

  /* =======================================================================
     Header, menu, contact links
     ======================================================================= */
  const header = $('[data-header]');
  const menuBtn = $('.menu-btn');
  const nav = $('#site-nav');
  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.querySelector('.sr-only').textContent = open ? 'סגירת התפריט' : 'פתיחת התפריט';
    nav.classList.toggle('is-open', open);
  }
  menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });
  document.addEventListener('click', (e) => { if (nav.classList.contains('is-open') && !e.target.closest('.site-header')) setMenu(false); });

  $$('[data-whatsapp]').forEach((a) => { a.href = `https://wa.me/${STUDIO.whatsapp}`; });
  $$('[data-instagram]').forEach((a) => { a.href = STUDIO.instagram; });

  /* =======================================================================
     Hero entrance
     ======================================================================= */
  let loaded = false;
  const markLoaded = () => {
    if (loaded) return;
    loaded = true;
    requestAnimationFrame(() => root.classList.add('is-loaded'));
    setTimeout(() => root.classList.add('is-settled'), 2200);
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(markLoaded);
  setTimeout(markLoaded, 900);

  /* =======================================================================
     Paintable hero
     ======================================================================= */
  const hero = $('.hero');
  const paint = $('.hero__paint');
  const pctx = paint.getContext('2d');
  let brushName = 'rose';
  let paintW = 0, paintH = 0;
  let lastPt = null, pressed = false, lastDab = 0, fading = false;
  let tap = null;

  function sizePaint() {
    const w = hero.clientWidth, h = hero.clientHeight;
    if (w === paintW && h === paintH) return;
    paintW = w; paintH = h;
    const d = DPR();
    paint.width = Math.round(w * d); paint.height = Math.round(h * d);
    pctx.setTransform(d, 0, 0, d, 0, 0);
  }
  sizePaint();

  function dab(x, y, rad, a) {
    const c = PIG[brushName];
    const g = pctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(c, a * .5));
    g.addColorStop(.72, rgba(c, a));
    g.addColorStop(1, rgba(c, 0));
    pctx.fillStyle = g;
    pctx.beginPath(); pctx.arc(x, y, rad, 0, Math.PI * 2); pctx.fill();
    lastDab = performance.now();
    if (!fading) { fading = true; requestAnimationFrame(fade); }
  }
  function strokeTo(p, strong) {
    if (!lastPt) { dab(p.x, p.y, strong ? 26 : 18, strong ? .1 : .035); lastPt = p; return; }
    const dist = Math.hypot(p.x - lastPt.x, p.y - lastPt.y);
    const rad = strong ? clamp(30 - dist * .15, 16, 30) : clamp(28 - dist * .3, 10, 28);
    const n = Math.max(1, Math.ceil(dist / Math.max(2, rad * .3)));
    for (let i = 1; i <= n; i++) {
      dab(lerp(lastPt.x, p.x, i / n), lerp(lastPt.y, p.y, i / n), rad * (.85 + Math.random() * .3), strong ? .085 : .03);
    }
    lastPt = p;
  }
  function splash(x, y) {
    for (let i = 0; i < 6; i++) dab(x + (Math.random() - .5) * 40, y + (Math.random() - .5) * 40, 16 + Math.random() * 26, .12);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 60;
      dab(x + Math.cos(a) * d, y + Math.sin(a) * d, 2 + Math.random() * 5, .35);
    }
  }
  function fade() {
    pctx.save();
    pctx.globalCompositeOperation = 'destination-out';
    pctx.fillStyle = 'rgba(0,0,0,.016)';
    pctx.fillRect(0, 0, paintW, paintH);
    pctx.restore();
    if (performance.now() - lastDab > 9000) { pctx.clearRect(0, 0, paintW, paintH); fading = false; return; }
    requestAnimationFrame(fade);
  }
  const local = (e) => { const b = paint.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const isControl = (t) => t.closest('a, button, input, label, .palette');

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    strokeTo(local(e), pressed);
  });
  hero.addEventListener('pointerleave', () => { lastPt = null; pressed = false; });
  hero.addEventListener('pointerdown', (e) => {
    if (isControl(e.target)) return;
    if (e.pointerType === 'mouse') { e.preventDefault(); pressed = true; lastPt = null; strokeTo(local(e), true); }
    else tap = { ...local(e), t: performance.now(), cx: e.clientX, cy: e.clientY };
  });
  window.addEventListener('pointerup', (e) => {
    pressed = false;
    if (tap && e.pointerType !== 'mouse') {
      if (performance.now() - tap.t < 400 && Math.hypot(e.clientX - tap.cx, e.clientY - tap.cy) < 10) splash(tap.x, tap.y);
      tap = null;
    }
  });
  hero.addEventListener('pointercancel', () => { tap = null; pressed = false; });

  const pans = $$('.pan');
  const cssColor = { rose: '--rose', apricot: '--apricot', naples: '--naples', sage: '--sage', cerulean: '--cerulean', lavender: '--lavender' };
  pans.forEach((pan) => pan.addEventListener('click', () => {
    brushName = pan.dataset.color;
    pans.forEach((p) => p.setAttribute('aria-pressed', String(p === pan)));
    root.style.setProperty('--brush', `var(${cssColor[brushName]})`);
  }));
  $('.palette__clear').addEventListener('click', () => { pctx.clearRect(0, 0, paintW, paintH); lastPt = null; });

  /* =======================================================================
     Reveal on scroll (only for things that start below the fold)
     ======================================================================= */
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.remove('pre'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    const vh = window.innerHeight;
    $$('[data-reveal]').forEach((el) => {
      if (el.getBoundingClientRect().top > vh * .9) { el.classList.add('pre'); io.observe(el); }
    });
  }

  /* =======================================================================
     Scroll engine: progress bar, parallax, stacked cards, drawn path,
     horizontal gallery and ribbons. Layout is measured on resize only.
     ======================================================================= */
  const S = { y: window.scrollY, sy: window.scrollY, last: window.scrollY, v: 0, vh: window.innerHeight, vw: window.innerWidth, docH: 1 };
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };

  const progressBar = $('.progress__bar');
  const progressBird = $('.progress__bird');

  const parallaxEls = reduceMotion ? [] : $$('[data-speed]').map((el) => ({ el, speed: parseFloat(el.dataset.speed), mouse: parseFloat(el.dataset.mouse || 0), base: 0 }));

  const stack = $('.stack');
  const cards = $$('.svc');
  let stackOn = false, cardGeo = [];

  const how = $('.how__steps-wrap');
  const howInk = $('.how__path-ink');
  const howLine = $('.how__line span');
  const steps = $$('.step');
  let howTop = 0, howH = 0;

  const tech = $('.techniques');
  const techTrack = $('.tech__track');
  const techBar = $('.tech__progress span');
  let techPin = false, techTop = 0, techDist = 0;

  const ribbons = $$('.ribbon').map((rb) => ({ el: rb, track: $('.ribbon__track', rb), dir: parseFloat(rb.dataset.dir), x: 0, half: 0, visible: true }));

  function docTop(el) { return el.getBoundingClientRect().top + window.scrollY; }

  function setupRibbons() {
    ribbons.forEach((rb) => {
      const set = $('.ribbon__set', rb.track);
      $$('.ribbon__set[data-clone]', rb.track).forEach((c) => c.remove());
      const setW = set.getBoundingClientRect().width || 1;
      const copies = Math.max(1, Math.ceil((S.vw * 1.25) / setW));
      for (let i = 0; i < copies * 2 - 1; i++) {
        const c = set.cloneNode(true);
        c.dataset.clone = '';
        rb.track.appendChild(c);
      }
      rb.half = setW * copies;
    });
  }

  function measure() {
    S.vh = window.innerHeight; S.vw = window.innerWidth;

    // Horizontal gallery first: it changes the page height below it
    techPin = !reduceMotion && S.vw > 960 && S.vh >= 620;
    tech.classList.toggle('is-native', !techPin);
    if (techPin) {
      tech.style.height = '';
      techTrack.style.transform = '';
      techDist = Math.max(0, techTrack.scrollWidth - S.vw);
      tech.style.height = `${S.vh + techDist}px`;
      techTop = docTop(tech);
    } else {
      tech.style.height = '';
      techTrack.style.transform = '';
    }

    stackOn = !reduceMotion && cards.length > 1 && getComputedStyle(cards[0]).position === 'sticky';
    if (stackOn) {
      const gap = parseFloat(getComputedStyle(stack).rowGap) || 0;
      let y = docTop(stack);
      cardGeo = cards.map((c) => {
        const g = { top: parseFloat(getComputedStyle(c).top) || 0, h: c.offsetHeight, y };
        y += g.h + gap;
        return g;
      });
    } else {
      cards.forEach((c) => { c.style.transform = ''; });
    }

    howTop = docTop(how); howH = how.offsetHeight;

    parallaxEls.forEach((p) => {
      p.el.style.translate = '';
      const b = p.el.getBoundingClientRect();
      p.base = b.top + window.scrollY + b.height / 2;
    });

    S.docH = document.documentElement.scrollHeight;
  }

  function update() {
    const y = window.scrollY;
    S.v = lerp(S.v, y - S.last, .2);
    S.last = y;
    S.sy = reduceMotion ? y : lerp(S.sy, y, .12);
    if (Math.abs(S.sy - y) < .1) S.sy = y;
    mouse.sx = lerp(mouse.sx, mouse.x, .06);
    mouse.sy = lerp(mouse.sy, mouse.y, .06);

    // header + progress
    header.classList.toggle('is-scrolled', y > 12);
    const p = clamp(y / Math.max(1, S.docH - S.vh), 0, 1);
    progressBar.style.transform = `scaleX(${p.toFixed(4)})`;
    progressBird.style.transform = `translateX(${(-p * (S.vw - 26)).toFixed(1)}px)`;

    // parallax (scroll + gentle mouse drift in the hero)
    for (const it of parallaxEls) {
      const d = it.base - (S.sy + S.vh / 2);
      if (Math.abs(d) > S.vh * 1.6) continue;
      const tx = it.mouse * mouse.sx, ty = -d * it.speed + it.mouse * mouse.sy;
      it.el.style.translate = `${tx.toFixed(1)}px ${ty.toFixed(1)}px`;
    }

    // stacked service cards
    if (stackOn) {
      const prog = cardGeo.map((g, i) => {
        const nx = cardGeo[i + 1];
        if (!nx) return 0;
        const nextTop = Math.max(nx.top, nx.y - y);
        return clamp((g.top + g.h - nextTop) / Math.max(1, g.h - (nx.top - g.top)), 0, 1);
      });
      cards.forEach((c, i) => {
        let depth = 0;
        for (let k = i; k < prog.length; k++) depth += prog[k] * (k === i ? 1 : .6);
        const s = 1 - depth * .05;
        const rot = prog[i] * (i % 2 ? 1.4 : -1.4);
        c.style.transform = depth > 0 ? `scale(${s.toFixed(4)}) rotate(${rot.toFixed(3)}deg)` : '';
      });
    }

    // drawn path in "how it works"
    const hp = clamp((S.vh * .82 - (howTop - S.sy)) / (S.vh * .5 + howH * .4), 0, 1);
    howInk.style.strokeDashoffset = (1 - hp).toFixed(4);
    howLine.style.transform = `scaleY(${hp.toFixed(4)})`;
    steps.forEach((st, i) => st.classList.toggle('is-on', hp >= (i / (steps.length - 1)) * .92 + .03));

    // horizontal gallery
    if (techPin) {
      const tp = clamp((S.sy - techTop) / Math.max(1, techDist), 0, 1);
      techTrack.style.transform = `translate3d(${(tp * techDist).toFixed(1)}px,0,0)`;
      techBar.style.transform = `scaleX(${tp.toFixed(4)})`;
    }

    // ribbons
    if (!reduceMotion) {
      for (const rb of ribbons) {
        if (!rb.visible || !rb.half) continue;
        rb.x += rb.dir * (.55 + clamp(Math.abs(S.v), 0, 60) * .22) * (S.v < -1 ? -1 : 1);
        rb.x = ((rb.x % rb.half) + rb.half) % rb.half;
        rb.track.style.transform = `translate3d(${rb.x.toFixed(1)}px,0,0)`;
      }
    }

    requestAnimationFrame(update);
  }

  if ('IntersectionObserver' in window) {
    const rio = new IntersectionObserver((entries) => entries.forEach((en) => {
      const rb = ribbons.find((x) => x.el === en.target);
      if (rb) rb.visible = en.isIntersecting;
    }));
    ribbons.forEach((rb) => rio.observe(rb.el));
  }

  let resizeTimer;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const widthChanged = window.innerWidth !== S.vw;
      sizePaint();
      if (widthChanged) setupRibbons();
      measure();
      artCanvases.forEach((cv) => { if (cv.dataset.painted) enqueue(cv); });
    }, 180);
  }
  window.addEventListener('resize', onResize);
  if ('ResizeObserver' in window) {
    let lastH = 0;
    new ResizeObserver(() => {
      const h = document.body.scrollHeight;
      if (Math.abs(h - lastH) > 40) { lastH = h; onResize(); }
    }).observe(document.body);
  }

  setupRibbons();
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { setupRibbons(); measure(); });
  window.addEventListener('load', measure);
  requestAnimationFrame(update);

  /* =======================================================================
     Pointer niceties: cursor dot, mouse drift, magnetic buttons, card tilt
     ======================================================================= */
  if (finePointer && !reduceMotion) {
    const dot = $('.cursor');
    let cx = -100, cy = -100, tx = -100, ty = -100;
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      mouse.x = (e.clientX / S.vw - .5) * 2;
      mouse.y = (e.clientY / S.vh - .5) * 2;
      dot.classList.add('is-active');
    });
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) dot.classList.remove('is-active'); });
    document.addEventListener('pointerover', (e) => {
      dot.classList.toggle('is-hover', !!e.target.closest('a, button, label, summary, [data-tilt]'));
    });
    (function follow() {
      cx = lerp(cx, tx, .22); cy = lerp(cy, ty, .22);
      dot.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      requestAnimationFrame(follow);
    })();

    $$('.btn').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const b = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', `${((e.clientX - b.left - b.width / 2) * .18).toFixed(1)}px`);
        btn.style.setProperty('--my', `${((e.clientY - b.top - b.height / 2) * .28).toFixed(1)}px`);
      });
      btn.addEventListener('pointerleave', () => { btn.style.setProperty('--mx', '0px'); btn.style.setProperty('--my', '0px'); });
    });

    $$('[data-tilt]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const b = card.getBoundingClientRect();
        const px = (e.clientX - b.left) / b.width - .5, py = (e.clientY - b.top) / b.height - .5;
        card.style.setProperty('--tilt-y', `${(px * 10).toFixed(2)}deg`);
        card.style.setProperty('--tilt-x', `${(-py * 8).toFixed(2)}deg`);
      });
      card.addEventListener('pointerleave', () => { card.style.setProperty('--tilt-x', '0deg'); card.style.setProperty('--tilt-y', '0deg'); });
    });
  }

  /* =======================================================================
     Contact form: composes a WhatsApp message
     ======================================================================= */
  const form = $('#contact-form');
  const sent = $('#sent');
  const TYPE_TEXT = { weekly: 'החוג השבועי', events: 'סדנה לאירוע', private: 'סדנה פרטית' };

  $$('[data-pick]').forEach((a) => a.addEventListener('click', () => {
    const radio = $(`#type-${a.dataset.pick}`);
    if (radio) radio.checked = true;
    if (!sent.hidden) { sent.hidden = true; form.hidden = false; }
  }));

  function showError(input, show) {
    const err = $(`#${input.id}-err`);
    input.setAttribute('aria-invalid', String(show));
    err.hidden = !show;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#f-name'), phone = $('#f-phone'), notes = $('#f-notes');
    const nameOk = name.value.trim().length >= 2;
    const digits = phone.value.replace(/\D/g, '');
    const phoneOk = digits.length >= 9 && digits.length <= 13;
    showError(name, !nameOk);
    showError(phone, !phoneOk);
    if (!nameOk) { name.focus(); return; }
    if (!phoneOk) { phone.focus(); return; }

    const type = (form.querySelector('input[name="type"]:checked') || {}).value || 'weekly';
    const lines = [
      `היי אביה, אני ${name.value.trim()}.`,
      `אשמח לשמוע פרטים על ${TYPE_TEXT[type]}.`,
    ];
    if (notes.value.trim()) lines.push(notes.value.trim());
    lines.push(`הטלפון שלי: ${phone.value.trim()}`);
    const msg = lines.join('\n');
    const url = `https://wa.me/${STUDIO.whatsapp}?text=${encodeURIComponent(msg)}`;

    $('#sent-msg').textContent = msg;
    $('#sent-link').href = url;
    form.hidden = true;
    sent.hidden = false;
    $('#sent-title').focus();
    if (!/^9725?0+$/.test(STUDIO.whatsapp)) window.open(url, '_blank', 'noopener');
  });
  ['#f-name', '#f-phone'].forEach((sel) => $(sel).addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true') showError(e.target, false);
  }));
  $('#sent-edit').addEventListener('click', () => { sent.hidden = true; form.hidden = false; $('#f-name').focus(); });
})();
