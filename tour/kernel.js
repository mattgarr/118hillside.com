/* =====================================================================================
   118 Hillside geometry kernel: builds watertight solids from hillside.bim.json with Manifold.
   BIM frame: feet, x = east, y = north, z = up.

   Rules (every element follows from these; nothing is placed by hand):
   - A roof is a set of planar slabs. Any part of a roof that lies under another roof's underside
     (in that roof's attic) is removed -> valleys, dormers, roofs dying into other roofs.
   - No roof passes through a room (rooms are kept clear up to 7 ft above the floor).
   - Walls are solids, unioned per storey. Walls whose plate matches a roof's plate rise to that roof's
     underside (gable ends, vaults); every roof slab is subtracted from every wall (nothing pokes through).
   - Doors, windows and glazed gables are cut out of the walls.
   - Skylights cut shafts through roofs and flat ceilings.
   - Floors are the union of the floor slabs plus the ground under the walls; baseboards are the band of
     free floor next to a wall, minus doorways.
   ===================================================================================================== */
export function createKernel(W) {
  const { Manifold, CrossSection } = W;
  const ZLO = -30, ZHI = 60, ROOF_TH = 0.38, LOW_TH = 0.25, ROOM_CLEAR = 7.0;

  const cs = pts => new CrossSection([pts], 'NonZero');
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const prism = (pts, z0, z1) => Manifold.extrude(cs(pts), Math.max(1e-3, z1 - z0)).translate([0, 0, z0]);
  const box = (x0, y0, z0, x1, y1, z1) => Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
  const U = list => list.length ? (list.length === 1 ? list[0] : Manifold.union(list)) : null;
  const sub = (a, b) => (a && b) ? a.subtract(b) : a;
  // plane z = c + gx*x + gy*y
  const keepAbove = (m, P, d = 0) => { const L = Math.hypot(P.gx, P.gy, 1); return m.trimByPlane([-P.gx / L, -P.gy / L, 1 / L], (P.c + d) / L); };
  const keepBelow = (m, P, d = 0) => { const L = Math.hypot(P.gx, P.gy, 1); return m.trimByPlane([P.gx / L, P.gy / L, -1 / L], -(P.c + d) / L); };
  const zAt = (P, x, y) => P.c + P.gx * x + P.gy * y;
  const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };

  function prepare(bim) {
    const E = bim.elements, by = k => E.filter(e => e.ifc === k);
    const walls = by('IfcWall'), spaces = by('IfcSpace');
    const roofsG = E.filter(e => e.ifc === 'IfcRoof' && e.rect && e.predefined === 'GABLE_ROOF');
    const sheds = E.filter(e => e.ifc === 'IfcRoof' && e.rect && e.predefined === 'SHED_ROOF');
    const lows = E.filter(e => e.ifc === 'IfcRoof' && e.outline);
    const skylights = E.filter(e => e.predefined === 'SKYLIGHT');
    const slabs = E.filter(e => e.ifc === 'IfcSlab' && e.predefined === 'FLOOR');
    const ceilings = by('IfcCovering');
    const roofs = [];   // {id, kind, pieces:[{poly, P, th}], plate, group, top, frame, ends:[]}

    /* ---- gable roofs ---- */
    const gInfo = {};
    for (const r of roofsG) {
      const o = r.options || {}, [x0, y0, x1, y1] = r.rect, EW = r.ridge === 'EW';
      const s0 = EW ? x0 : y0, s1 = EW ? x1 : y1, t0 = EW ? y0 : x0, t1 = EW ? y1 : x1, tc = (t0 + t1) / 2, hw = (t1 - t0) / 2, p = r.pitch;
      const XY = (s, t) => EW ? [s, t] : [t, s];
      const ov = r.overhang, ovS = o.ovS || [ov, ov], sA = s0 - ovS[0], sB = s1 + ovS[1];
      gInfo[r.id] = { EW, s0, s1, t0, t1, tc, hw, p, plate: r.plate, ridge: r.plate + hw * p, sA, sB };
    }
    for (const r of roofsG) {
      const o = r.options || {}, g = gInfo[r.id], { EW, s0, s1, t0, t1, tc, hw, p, sA, sB } = g, ov = r.overhang;
      const XY = (s, t) => EW ? [s, t] : [t, s];
      const pieces = [];
      for (const side of [-1, 1]) {
        let te = side < 0 ? t0 - ov : t1 + ov;
        if (o.tClip) te = side < 0 ? Math.max(te, o.tClip[0]) : Math.min(te, o.tClip[1]);
        const c = r.plate + hw * p + side * p * tc, P = EW ? { c, gx: 0, gy: -side * p } : { c, gx: -side * p, gy: 0 };
        const spans = [];
        if (o.step && side > 0) { const stT = o.step[0], stS = o.step[1]; spans.push([sA, stS - ov, stT + ov], [stS - ov, sB, te]); }
        else spans.push([sA, sB, te]);
        if (o.extend && (o.extend.side || 1) === side && gInfo[o.extend.into]) {
          const gd = gInfo[o.extend.into]; const sEnd = gd.tc + (gd.tc < sA ? -.35 : .35);   // carried past s0 to just over the other roof's ridge (the other roof's shadow trims it)
          spans.push(sEnd < sA ? [sEnd, sA, te] : [sB, sEnd, te]);
        }
        spans.forEach(([a, b, tt], k) => { const ta = Math.min(tc, tt), tb = Math.max(tc, tt);
          pieces.push({ poly: [XY(a, ta), XY(b, ta), XY(b, tb), XY(a, tb)], P, th: ROOF_TH, ext: !!(o.extend && k === spans.length - 1 && gInfo[o.extend.into] && (o.extend.side || 1) === side) }); });
      }
      const ends = [];
      for (const [sEnd, dir] of [[s0, -1], [s1, 1]]) if (!(o.noEnd || []).includes(dir)) ends.push({ s: sEnd, dir, glazed: (o.gableWindows || []).includes(dir), style: (o.gableStyle || {})[String(dir)] || null, mat: (o.endMats && o.endMats[String(dir)]) || o.endMat || 'siding' });
      if (o.extend && gInfo[o.extend.into]) { const gd = gInfo[o.extend.into]; ends.push({ s: gd.tc, dir: gd.tc < s0 ? -1 : 1, ext: true, side: o.extend.side || 1, mat: 'siding' }); }
      roofs.push({ id: r.id, kind: 'gable', pieces, plate: r.plate, group: 'roof', top: 'roof', frame: { type: 'gable', EW, tc, sl: Math.hypot(1, p) }, ends, g, r });
    }
    /* ---- shed dormers ---- */
    for (const sh of sheds) {
      const gd = gInfo[sh.into]; if (!gd) continue;
      const [x0, y0, x1, y1] = sh.rect, lowN = sh.low === 'N', sp = sh.pitch, base = sh.base, ov = sh.overhang || .8, rk = .45;
      const tOut = lowN ? y1 : y0, P = lowN ? { c: base + sp * y1, gx: 0, gy: -sp } : { c: base - sp * y0, gx: 0, gy: sp };
      const yE = lowN ? tOut + ov : tOut - ov, yIn = gd.tc;                                // run into the main roof up to its ridge
      const ya = Math.min(yE, yIn), yb = Math.max(yE, yIn);
      // v22 vault22 V2: rake overhangs only beyond the host eave line; inside it the dormer spans between its side walls' inside faces
      let pcs = [{ poly: rect(x0 - rk, ya, x1 + rk, yb), P, th: ROOF_TH }];
      const yH = gd.EW ? (lowN ? gd.t1 : gd.t0) : null;
      if (yH !== null && yH > ya + .05 && yH < yb - .05) {
        const yo = (yH + yE) / 2, sideIn = (xe, dir) => { let best = xe;   // dir +1: west rake (inside face = wall's max x)
          for (const w of walls) { const b = bbox(w.footprint); if (w.z1 < base - .7 || b[0] > xe + .02 || b[2] < xe + .02 * dir || b[1] > yo || b[3] < yo) continue;
            if (!(b[0] <= xe + .02 * dir && b[2] >= xe + .02 * dir)) continue; const f = dir > 0 ? b[2] : b[0]; if (Math.abs(f - xe) < 1.2) best = dir > 0 ? Math.max(best, f) : Math.min(best, f); }
          return best; };
        const xi0 = sideIn(x0, 1), xi1 = sideIn(x1, -1), oa = lowN ? yH : ya, ob = lowN ? yb : yH, ia = lowN ? ya : yH, ib = lowN ? yH : yb;
        pcs = [{ poly: rect(x0 - rk, oa, x1 + rk, ob), P, th: ROOF_TH }, { poly: rect(xi0, ia, xi1, ib), P, th: ROOF_TH }]; sh.__v22 = { xi0, xi1, ia, ib, P }; }
      roofs.push({ id: sh.id, kind: 'shed', pieces: pcs, plate: base, group: 'roof', top: 'roof', v22in: sh.__v22 || null,
        frame: { type: 'shed', axis: 'y', sl: Math.hypot(1, sp) }, ends: [], cheeks: { x0, x1, ya, yb, P }, r: sh });
    }
    /* ---- lower roofs (flat membrane or 3:12 sheds), eaves only on edges that face outdoors ---- */
    const wallFP = walls.map(w => ({ w, pts: w.footprint, b: bbox(w.footprint) }));
    const inWall = (x, y, z) => wallFP.some(({ w, pts, b }) => z >= w.z0 - .05 && z <= w.z1 + .05 && x > b[0] && x < b[2] && y > b[1] && y < b[3] && inPoly(pts, x, y));
    // open-air decks (exterior LANDING slabs on an upper storey): a lower roof dies into the deck's parapet (no eave/rake overhang on that edge)
    const openDecks = E.filter(e => e.ifc === 'IfcSlab' && e.predefined === 'LANDING' && e.rect && !e.interior && e.z > 4);
    const upperFloors = slabs.filter(s => s.z > 4).map(s => s.outline).concat(openDecks.map(d => rect(Math.min(d.rect[0], d.rect[2]), Math.min(d.rect[1], d.rect[3]), Math.max(d.rect[0], d.rect[2]), Math.max(d.rect[1], d.rect[3]))));
    for (const r of lows) {
      let pts = r.outline.map(q => q.slice()); let A = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; A += a[0] * b[1] - b[0] * a[1]; }
      if (A < 0) pts.reverse();
      const n = pts.length, Y = r.base, flat = r.predefined === 'FLAT_ROOF', p = r.pitch || 0, bb = bbox(pts);
      const LL = r.lowLine;
      const P = flat ? { c: Y, gx: 0, gy: 0 } :
        r.low === 'S' ? { c: Y - p * (LL ?? bb[1]), gx: 0, gy: p } : r.low === 'N' ? { c: Y + p * (LL ?? bb[3]), gx: 0, gy: -p } :
        r.low === 'W' ? { c: Y - p * (LL ?? bb[0]), gx: p, gy: 0 } : { c: Y + p * (LL ?? bb[2]), gx: -p, gy: 0 };
      const N = [], off = [];
      for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1, nx = ey / L, ny = -ex / L; N.push([nx, ny]);
        const abut = [.15, .5, .85].some(t => { const px = a[0] + ex * t + nx * .45, py = a[1] + ey * t + ny * .45;
          return inWall(px, py, Y + 1) || inWall(px, py, Y + 2.5) || upperFloors.some(f => inPoly(f, px, py)); });
        off.push(abut ? 0 : (flat ? .5 : .9)); }
      const Q = [];
      for (let i = 0; i < n; i++) { const j = (i - 1 + n) % n, [ax, ay] = N[j], [bx, by2] = N[i], pa = pts[j], pb = pts[i];
        const ca = ax * pa[0] + ay * pa[1] + off[j], cb = bx * pb[0] + by2 * pb[1] + off[i], det = ax * by2 - ay * bx;
        Q.push(Math.abs(det) < 1e-6 ? [pb[0] + bx * off[i], pb[1] + by2 * off[i]] : [(ca * by2 - cb * ay) / det, (ax * cb - bx * ca) / det]); }
      roofs.push({ id: r.id, kind: 'low', pieces: [{ poly: Q, P, th: LOW_TH }], plate: Y, group: 'lowerRoof', top: (flat || r.material === 'roof-membrane') ? 'membrane' : 'roof',
        frame: { type: 'low', axis: (r.low === 'W' || r.low === 'E') ? 'x' : 'y', sl: Math.hypot(1, p) }, ends: [], r });
    }
    /* ---- solids per roof ---- */
    for (const R of roofs) {
      const slabs2 = [], shadows = [], attics = [], cutters = [];
      for (const pc of R.pieces) {
        const zs = pc.poly.map(([x, y]) => zAt(pc.P, x, y)), zmin = Math.min(...zs), zmax = Math.max(...zs);
        const pr = prism(pc.poly, Math.min(zmin, R.plate) - 2.5, zmax + pc.th + 1);
        slabs2.push(keepBelow(keepAbove(pr, pc.P), pc.P, pc.th));
        const sh = keepBelow(prism(pc.poly, R.plate - 2, zmax + 1), pc.P); shadows.push(sh); if (!pc.ext) cutters.push(sh);   // a roof carried past a wall dies into others without cutting them
        // v21 ext21b rule (BIM options.rakeUnder = [end dirs]): past that gable END wall the roof is only a thin rake overhang, so in that
        // band it cuts other roofs by its own slab only - a roof that runs into the gable wall passes under the rake to the wall.
        if (R.kind === 'gable' && R.g && !pc.ext && cutters[cutters.length - 1] === sh && R.r && R.r.options && R.r.options.rakeUnder) { const g = R.g, BIG = 500;
          for (const dir of R.r.options.rakeUnder) { const a0 = dir < 0 ? g.sA - .01 : g.s1, a1 = dir < 0 ? g.s0 : g.sB + .01; if (a1 - a0 < .02) continue;
            const end = g.EW ? box(a0, -BIG, ZLO, a1, BIG, ZHI) : box(-BIG, a0, ZLO, BIG, a1, ZHI);
            const thin = keepBelow(keepAbove(pr, pc.P), pc.P, pc.th).intersect(end);
            cutters[cutters.length - 1] = cutters[cutters.length - 1].subtract(end).add(thin); } }
        attics.push(keepBelow(prism(pc.poly, R.plate - .7, zmax + 1), pc.P));
      }
      R.slab = U(slabs2); R.shadow = U(shadows); R.attic = U(attics); R.cutter = U(cutters);
    }
    /* ---- rooms and shafts ---- */
    const roomVol = U(spaces.map(s => prism(s.outline, s.floor + .05, s.floor + ROOM_CLEAR)));
    // a skylight shaft goes through its own roof only (and the flat ceiling directly under it, for low roofs)
    const shafts = skylights.map(k => { const hx = k.size[0] / 2, hy = k.size[1] / 2, R = roofs.find(r => r.id === k.roof), zb = (R ? R.plate : 3.5) - 1.5;
      return { k, zb, solid: box(k.at[0] - hx, k.at[1] - hy, zb, k.at[0] + hx, k.at[1] + hy, ZHI) }; });
    const shaftAll = U(shafts.map(s => s.solid));
    // rule: no roof, eave or overhang may enter the open-air volume of a deck (deck structure up to 7.5 ft of headroom)
    const deckAir = U(openDecks.map(d => box(Math.min(d.rect[0], d.rect[2]), Math.min(d.rect[1], d.rect[3]), d.z - .9, Math.max(d.rect[0], d.rect[2]), Math.max(d.rect[1], d.rect[3]), d.z + 7.5)));
    /* ---- final roofs ---- */
    for (const R of roofs) {
      const others = U(roofs.filter(o2 => o2 !== R && o2.cutter).map(o2 => o2.cutter)); R._oth = others;   // v22 vault22 V1: reused below
      let m = sub(sub(sub(R.slab, others), roomVol), shaftAll); if (deckAir) m = sub(m, deckAir);
      const cuts = ((R.r && R.r.options && R.r.options.cuts) || []).map(c => box(c[0], c[1], ZLO, c[2], c[3], ZHI));     // explicit cut-outs (e.g. over the stair hall)
      if (cuts.length) m = sub(m, U(cuts));
      if (R.kind === 'shed' && R.v22in) { const v = R.v22in, H = roofs.find(o => o.id === R.r.into);   // v22 vault22 V2b: the dormer's cheeks
        if (H) { m = sub(m, H.slab);   // V1b: inside the host the host's slab wins (no buried sliver of dormer slab inside the vault's slab)
          const top = U(H.pieces.map(pc => { const zs = pc.poly.map(([x, y]) => zAt(pc.P, x, y)); return keepAbove(prism(pc.poly, Math.min(...zs) - 1, ZHI), pc.P, pc.th - .01); }));
          for (const [a, b] of [[v.xi0 - .35, v.xi0], [v.xi1, v.xi1 + .35]]) { const c = keepBelow(prism(rect(a, v.ia, b, v.ib), R.plate - .01, ZHI), v.P).intersect(top);
            if (c && !c.isEmpty()) m = m.add(c); } } }
      R.final = m.asOriginal(); R.oid = R.final.originalID();
    }
    return { bim, walls, spaces, slabs, ceilings, roofs, roomVol, shafts, shaftAll, gInfo, inWall };
  }

  /* gable infills (end walls above the plate that no wall supplies, e.g. where a roof is carried past a wall)
     and glazed-gable cut-outs */
  function gableParts(ctx, storeyOf) {
    const infill = { L1: [], L2: [] }, glaze = { L1: [], L2: [] }, panes = [];
    for (const R of ctx.roofs) { if (R.kind !== 'gable') continue; const g = R.g, st = storeyOf(R.plate);
      for (const e of R.ends) {
        const XY = (s, t) => g.EW ? [s, t] : [t, s], T = .4, sa = e.dir < 0 ? e.s : e.s - T, sb = sa + T;
        let tA = g.t0, tB = g.t1; if (e.ext) { tA = e.side > 0 ? g.tc : g.t0; tB = e.side > 0 ? g.t1 : g.tc; }
        R._oth = R._oth || U(ctx.roofs.filter(o => o !== R && o.cutter).map(o => o.cutter));
        const slice = sub(R.attic.intersect(prism([XY(sa, tA - 1), XY(sb, tA - 1), XY(sb, tB + 1), XY(sa, tB + 1)], ZLO, ZHI)), R._oth);
        if (slice && !slice.isEmpty()) infill[st].push(slice);
        if (e.glazed) {
          const ys = g.plate + (e.style && e.style.style === 'pair' ? (e.style.sill || .75) : .45), m = .42, pitch = g.p;
          const yR = t => g.plate + (g.hw - Math.abs(t - g.tc)) * pitch;
          let polys = [];
          if (e.style && e.style.style === 'pair') { const h = e.style.half, tL = g.tc - h, tR = g.tc + h;
            polys = [[[tL, ys], [g.tc - .09, ys], [g.tc - .09, yR(g.tc) - m - .05], [tL, yR(tL) - m]], [[g.tc + .09, ys], [tR, ys], [tR, yR(tR) - m], [g.tc + .09, yR(g.tc) - m - .05]]]; }
          else { const half = g.hw - (ys + m - g.plate) / pitch, tL = g.tc - half, tR = g.tc + half, apex = g.plate + g.hw * pitch - m;
            const tm = [tL, g.tc - half * .48, g.tc, g.tc + half * .48, tR], zT = t => Math.min(apex, yR(t) - m);
            for (let i = 0; i < 4; i++) { const a = tm[i] + (i ? .09 : 0), b = tm[i + 1] - (i < 3 ? .09 : 0); if (b - a > .2) polys.push([[a, ys], [b, ys], [b, Math.max(ys + .05, zT(b))], [a, Math.max(ys + .05, zT(a))]]); } }
          for (const pl of polys) {   // pl in (t, z); cut through the end wall
            const shape = Manifold.extrude(cs(pl), 3).translate([0, 0, -1.5]);   // extruded along local z = s
            // local (t, z, s) -> BIM (x, y, z)
            // local (t, height, s) -> BIM; column-major 4x4
            const placed = shape.transform(g.EW ? [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, e.s, 0, 0, 1] : [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, e.s, 0, 1]);
            glaze[st].push(placed); panes.push({ roof: R.id, s: e.s, dir: e.dir, EW: g.EW, poly: pl });
          }
        }
      }
    }
    return { infill, glaze, panes };
  }

  /* walls of one storey (+ infills), unioned, topped to the roofs, openings cut */
  const atticFor = (ctx, z1) => { ctx._at = ctx._at || {}; const k = z1.toFixed(2);
    if (!(k in ctx._at)) ctx._at[k] = U(ctx.roofs.filter(r => Math.abs(r.plate - z1) < .7).map(r => r.attic)); return ctx._at[k]; };
  /* region above the roofs a wall of plate z1 belongs to (roofs at or above its level): such walls never stand above them */
  const aboveFor = (ctx, z1) => { ctx._ab = ctx._ab || {}; const k = z1.toFixed(2);
    // v22 vault22 V1: a roof bounds walls only where it exists - a dormer's above-region is cut by the other roofs' cutters (as its
    // slab is), every other roof's by the dormers' cutters
    const abv = r => r._abv || (r._abv = sub(U(r.pieces.map(pc => { const zs = pc.poly.map(([x, y]) => zAt(pc.P, x, y));
      return keepAbove(prism(pc.poly, Math.min(...zs) - 1, ZHI), pc.P, pc.th); })), r.kind === 'shed' ? (r._oth || null) : ctx._shc));
    if (ctx._shc === undefined) ctx._shc = U(ctx.roofs.filter(r => r.kind === 'shed' && r.cutter).map(r => r.cutter));   // dormers' cutters
    if (!(k in ctx._ab)) ctx._ab[k] = U(ctx.roofs.filter(r => z1 <= r.plate + .7).map(abv).filter(m => m && !m.isEmpty()));
    return ctx._ab[k]; };
  function buildWalls(ctx, walls, openings, storey, extra) {
    const roofsAll = ctx._roofsAll || (ctx._roofsAll = U(ctx.roofs.map(r => r.final)));
    const solids = [];
    for (const w of walls) {
      let m = prism(w.footprint, w.z0, w.z1);
      if (w.topToRoof !== false) { const at = atticFor(ctx, w.z1);
        if (at) m = m.add(prism(w.footprint, w.z1 - .01, ZHI).intersect(at)); }
      m = sub(m, aboveFor(ctx, w.z1));
      if (w.topToRoof !== false) for (const sh of ctx.shafts) {   // v22 vault22 V4: up the skylight shaft to the roof top
        const R = ctx.roofs.find(r => r.id === sh.k.roof), pc = R && (R.pieces.find(q => inPoly(q.poly, sh.k.at[0], sh.k.at[1])) || R.pieces[0]); if (!pc) continue;
        const b = bbox(w.footprint), hx = sh.k.size[0] / 2 - .01, hy = sh.k.size[1] / 2 - .01, X0 = sh.k.at[0] - hx, X1 = sh.k.at[0] + hx, Y0 = sh.k.at[1] - hy, Y1 = sh.k.at[1] + hy;
        if (b[0] >= X1 || b[2] <= X0 || b[1] >= Y1 || b[3] <= Y0) continue;
        const up = keepBelow(prism(w.footprint, w.z1 - .01, ZHI).intersect(box(X0, Y0, ZLO, X1, Y1, ZHI)), pc.P, pc.th);
        if (up && !up.isEmpty()) m = m.add(up); }
      solids.push(m);
    }
    // each opening sits in a wall body: same thickness and height as the walls at its jambs (cut below)
    for (const o of openings) {
      const hz = Math.abs(o.axis[0]) > .5, hw = o.width / 2, [cx, cy] = o.center;
      const a0 = (hz ? cx : cy) - hw, a1 = (hz ? cx : cy) + hw, cc = hz ? cy : cx;
      let f0 = 1e9, f1 = -1e9, z0 = 1e9, z1 = -1e9, toRoof = false;
      for (const w of walls) { const b = bbox(w.footprint), wa0 = hz ? b[0] : b[1], wa1 = hz ? b[2] : b[3], wc0 = hz ? b[1] : b[0], wc1 = hz ? b[3] : b[2];
        if (wc1 - wc0 > 1.6 || cc < wc0 - .3 || cc > wc1 + .3) continue;
        if (wa1 - wa0 < wc1 - wc0 - 1e-6) continue;   // v22 concept22 O1: a partition running across the opening line is not a jamb wall
        if (Math.abs(wa1 - a0) < .2 || Math.abs(wa0 - a1) < .2 || (wa0 < a0 + .05 && wa1 > a1 - .05)) { f0 = Math.min(f0, wc0); f1 = Math.max(f1, wc1); z0 = Math.min(z0, w.z0); z1 = Math.max(z1, w.z1); toRoof = toRoof || w.topToRoof !== false; } }
      if (f1 <= f0) { f0 = cc - o.wallThickness / 2; f1 = cc + o.wallThickness / 2; z0 = Math.min(o.sill, o.sill - 1); z1 = o.head + .5; }
      o.__body = [f0, f1];   // v22 concept22 O2: the cut spans the body
      const fp = hz ? rect(a0, f0, a1, f1) : rect(f0, a0, f1, a1);
      let m = prism(fp, z0, z1);
      if (toRoof) { const at = atticFor(ctx, z1); if (at) m = m.add(prism(fp, z1 - .01, ZHI).intersect(at)); }
      m = sub(m, aboveFor(ctx, z1));
      solids.push(m);
    }
    for (const x of (extra || [])) solids.push(x);
    let all = U(solids); if (!all) return null;
    const cuts = openings.map(o => { const hw = o.width / 2, ht = o.wallThickness / 2 + .2, [cx, cy] = o.center, hz = Math.abs(o.axis[0]) > .5, cc = hz ? cy : cx;
      const c0 = Math.min(cc - ht, o.__body ? o.__body[0] - .05 : 1e9), c1 = Math.max(cc + ht, o.__body ? o.__body[1] + .05 : -1e9); delete o.__body;   // v22 concept22 O2
      const r = hz ? [cx - hw, c0, cx + hw, c1] : [c0, cy - hw, c1, cy + hw];
      return box(r[0], r[1], o.sill, r[2], r[3], o.head); });
    all = sub(all, U(cuts)); all = sub(all, roofsAll);
    // (walls are trimmed to the roofs of their own level as they are built)
    return all;
  }

  function buildCeilings(ctx) {
    const out = [];
    for (const c of ctx.ceilings) { if (c.kind !== 'flat') continue;
      let m = prism(c.outline, c.z - .06, c.z); m = sub(m, ctx.shaftAll); if (m && !m.isEmpty()) out.push(m); }
    // shaft linings between a flat ceiling and the roof above it
    const lin = [];
    for (const { k, zb } of ctx.shafts) { const c = ctx.ceilings.find(c2 => c2.kind === 'flat' && c2.z > zb && inPoly(c2.outline, k.at[0], k.at[1])); if (!c) continue;
      const R = ctx.roofs.find(r => r.id === k.roof); const pcs = R ? R.pieces.filter(pc => inPoly(pc.poly, k.at[0], k.at[1])) : [], top = R ? Math.max(...(pcs.length ? pcs : R.pieces).map(pc => zAt(pc.P, k.at[0], k.at[1]))) + .05 : c.z + 1;   // v21 ext21: the slope the skylight sits in (a gable's other plane runs above it)
      const hx = k.size[0] / 2, hy = k.size[1] / 2, t = .05;
      lin.push(box(k.at[0] - hx - t, k.at[1] - hy - t, c.z - .06, k.at[0] + hx + t, k.at[1] + hy + t, top).subtract(box(k.at[0] - hx, k.at[1] - hy, c.z - 1, k.at[0] + hx, k.at[1] + hy, top + 1))); }
    return { ceil: U(out), lining: U(lin) };
  }

  /* floors: slabs by finish at each level, and ground under the walls of that level */
  function buildFloors(ctx, wallsAtLevel) {
    const levels = {};
    for (const s of ctx.slabs) (levels[s.z.toFixed(2)] = levels[s.z.toFixed(2)] || []).push(s);
    const out = [];
    for (const [zk, list] of Object.entries(levels)) { const z = +zk, th = z > 4 ? .9 : .3;
      const byFin = {}; for (const s of list) (byFin[s.finish || 'oak'] = byFin[s.finish || 'oak'] || []).push(s.outline);
      const base = Object.keys(byFin).sort((a, b) => byFin[b].length - byFin[a].length)[0];
      let under = null;
      const wl = wallsAtLevel(z); if (wl.length) under = wl.map(w => cs(w.footprint)).reduce((a, b) => a.add(b));
      for (const [fin, outs] of Object.entries(byFin)) {
        let c = outs.map(cs).reduce((a, b) => a.add(b));
        if (fin === base && under) { const all = list.map(s => cs(s.outline)).reduce((a, b) => a.add(b)); c = c.add(under.intersect(all.offset(.7, 'Miter'))); }
        if (fin !== base) c = c.offset(-.005, 'Miter');
        out.push({ z, fin, solid: Manifold.extrude(c, th).translate([0, 0, z - th + (fin === base ? 0 : .004)]) });
      }
    }
    return out;
  }

  /* baseboards (v20 trim, photos p62 / p74 / p24 / p59 / x07): a 5-1/4" painted flat board with a small cove + bead cap, swept along
     every wall run of the free floor.  The profile is a stack of floor-plan offset bands, so outside corners are mitred and inside
     corners close tight by construction.  Rules:
     - only inside rooms, on finished floors (no baseboard on concrete - the garage);
     - none across a door/cased opening: it dies into the casing leg, i.e. it stops at the casing's outer edge
       (BB.reach past the rough opening = Craftsman leg 4-1/4" - 3/4" jamb + 3/16" reveal; steel glass units have drywall returns
       and no casing, so it stops at the opening);
     - none behind floor-standing cabinets, counters, built-ins, vanities, tubs and appliances (their plan footprints are stops). */
  const BB = { prof: [[0, 4.625, .5625], [4.625, 4.78, .625], [4.78, 4.9, .6875], [4.9, 5.02, .75], [5.02, 5.14, .8125], [5.14, 5.25, .6875]],   // [y0, y1, depth] inches
    reach: (4.25 - .75 + .1875) / 12, noCasing: /^D-[ABD]$|^D-E$/,
    stopKinds: { baseCabinet: 2, tallCabinet: 2, dishwasher: 2.16, fridgeFrenchDoor: 2.75, fridge: 2.5, rangeSlideIn30: 2.08, range: 2.08, vanity: 1.75,
      tubAlcove: 2.5, beverageCooler: 2.15, builtinBookcase: 1, finishedPanel: .1, washerFront: 0, dryerFront: 0 } };
  function baseStops(ctx, z) {
    const out = [], E = (ctx.bim && ctx.bim.elements) || [];
    for (const e of E) { if (!e.at || !e.kind || Math.abs((e.at[2] || 0) - z) > .3) continue; const o = e.opts || {};
      if (e.kind === 'counterTop') { for (const ol of (o.outlines || [])) out.push(cs(ol)); continue; }
      if (e.kind === 'showerGlass') {   // the stall is the side of the screen whose back wall is nearer (marched along the screen normal)
        const r = (e.rot || 0) * Math.PI / 180, fx = Math.cos(r), fy = Math.sin(r), sx = -fy, sy = fx, w = (o.w || 3) / 2 + .1;
        // three rays across the screen (a ray through a window gap still meets wall on the others); a wall right behind the
        // screen (< .5 ft, the screen is fixed to it) is not the stall's back wall
        const hit = sg => Math.min(...[-.4, 0, .4].map(k => { for (let d = .1; d < 7; d += .1) { const x = e.at[0] + fx * d * sg + sx * k * w * 2, y = e.at[1] + fy * d * sg + sy * k * w * 2;
          if (ctx.walls.some(wl => wl.z0 <= z + .1 && wl.z1 >= z + .5 && inPoly(wl.footprint, x, y))) return d; } return 99; }));
        // a wall within .7 ft of the screen is the wall it is fixed to (the WC partition), so the stall is on the other side
        let dp = hit(1), dn = hit(-1); if (dp < .7 && dn >= .7) dp = 99; else if (dn < .7 && dp >= .7) dn = 99;
        const sg = dp <= dn ? 1 : -1, d = Math.min(dp, dn) + .3; if (d > 7) continue;
        out.push(cs([[-w, 0], [w, 0], [w, d * sg], [-w, d * sg]].map(([a, b]) => [e.at[0] + sx * a + fx * b, e.at[1] + sy * a + fy * b]))); continue; }
      const d0 = BB.stopKinds[e.kind]; if (d0 === undefined || !d0) continue;
      const w = o.w || 2, d = o.d || d0, r = (e.rot || 0) * Math.PI / 180, fx = Math.cos(r), fy = Math.sin(r), sx = -fy, sy = fx;
      // 'at' is the back-centre of the fixture; the stop reaches 0.3 ft behind it so it always covers the band at the wall face
      out.push(cs([[-w / 2, -.3], [w / 2, -.3], [w / 2, d], [-w / 2, d]].map(([a, b]) => [e.at[0] + sx * a + fx * b, e.at[1] + sy * a + fy * b]))); }
    return out;
  }
  // interior landings (stair hall, quarter / midway landings) are floors for the baseboard pass; storage decks are not
  const interiorLandings = ctx => ((ctx.bim && ctx.bim.elements) || []).filter(e => e.ifc === 'IfcSlab' && e.predefined === 'LANDING' && e.interior && !e.storage && e.outline && e.outline.length > 2);
  function buildBaseboards(ctx, z, walls, openings) {
    const lands = interiorLandings(ctx).filter(e => Math.abs(e.z - z) < .05);
    const slabs = ctx.slabs.filter(s => Math.abs(s.z - z) < .05 && s.finish !== 'concrete').concat(lands); if (!slabs.length) return null;
    const fl = slabs.map(s => cs(s.outline)).reduce((a, b) => a.add(b));
    const wl = walls.filter(w => w.z0 <= z + .1 && w.z1 >= z + .5); if (!wl.length) return null;
    // an opening whose sill is above the floor has wall under it, so the baseboard runs straight past (no notch)
    const orect = o => { const hw = o.width / 2 + .02, ht = o.wallThickness / 2, [cx, cy] = o.center;
      return Math.abs(o.axis[0]) > .5 ? rect(cx - hw, cy - ht, cx + hw, cy + ht) : rect(cx - ht, cy - hw, cx + ht, cy + hw); };
    const sills = openings.filter(o => o.sill > z + .5 && o.head <= z + 9.5 && o.center && o.width);   // v22 int22 K1: this level's openings only
    let wc = wl.map(w => cs(w.footprint)).reduce((a, b) => a.add(b));
    if (sills.length) wc = wc.add(sills.map(o => cs(orect(o))).reduce((a, b) => a.add(b)));
    const free = fl.subtract(wc);
    let mask = wc.offset(.12, 'Miter');
    // only inside rooms: never on an outside face where a slab edge pokes past the wall
    const sp = (ctx.spaces || []).filter(q => q.outline && q.outline.length > 2);
    const inside = sp.map(q => q.outline).concat(lands.map(e => e.outline));      // rooms + interior landings
    if (inside.length) mask = mask.intersect(inside.map(cs).reduce((a, b) => a.add(b)).offset(.35, 'Miter'));
    const doors = openings.filter(o => o.sill <= z + .5 && o.head > z + 2).map(o => { const hw = o.width / 2 + ((BB.noCasing.test(o.type || '') || o.trim === 'drywall-return') ? .02 : BB.reach)   /* v22 int22 K2 */, ht = o.wallThickness / 2 + .3, [cx, cy] = o.center;
      return cs(Math.abs(o.axis[0]) > .5 ? rect(cx - hw, cy - ht, cx + hw, cy + ht) : rect(cx - ht, cy - hw, cx + ht, cy + hw)); });
    const stops = doors.concat(baseStops(ctx, z));
    if (stops.length) mask = mask.subtract(stops.reduce((a, b) => a.add(b)));
    const parts = [];
    for (const [y0, y1, dp] of BB.prof) { const t = dp / 12, band = free.subtract(free.offset(-t, 'Miter')).intersect(mask);
      if (!band.isEmpty()) parts.push(Manifold.extrude(band, (y1 - y0) / 12).translate([0, 0, z + y0 / 12])); }
    if (!parts.length) return null;
    const m = U(parts); return m.isEmpty() ? null : m;
  }

  /* mesh -> triangle list, split at the given heights (dollhouse cut, foundation line), long triangles subdivided */
  function triangles(m, cutZ = [], maxEdge = 0) {
    if (!m || m.isEmpty()) return { pos: new Float32Array(0), nrm: new Float32Array(0), oid: new Int32Array(0) };
    const mesh = m.getMesh(), vp = mesh.vertProperties, np = mesh.numProp, tv = mesh.triVerts;
    const runOid = mesh.runOriginalID, runIdx = mesh.runIndex;
    const P = [], N = [], O = [];
    const pushTri = (a, b, c, n, oid) => {
      if (maxEdge > 0) { const e = [dist(a, b), dist(b, c), dist(c, a)], k = e.indexOf(Math.max(...e));
        if (e[k] > maxEdge) { const v = [a, b, c], p0 = v[k], p1 = v[(k + 1) % 3], p2 = v[(k + 2) % 3], mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
          pushTri(p0, mid, p2, n, oid); pushTri(mid, p1, p2, n, oid); return; } }
      P.push(...a, ...b, ...c); N.push(...n); O.push(oid); };
    const clip = (poly, z, keepBelow) => { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length];
        const ia = keepBelow ? a[2] <= z : a[2] >= z, ib = keepBelow ? b[2] <= z : b[2] >= z;
        if (ia) out.push(a); if (ia !== ib) { const t = (z - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z]); } } return out; };
    let ri = 0;
    for (let t = 0; t < tv.length / 3; t++) {
      while (ri + 1 < runIdx.length && t * 3 >= runIdx[ri + 1]) ri++;
      const oid = runOid[ri];
      const v = [0, 1, 2].map(k => { const i = tv[t * 3 + k] * np; return [vp[i], vp[i + 1], vp[i + 2]]; });
      const u = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], w = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
      let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const L = Math.hypot(...n); if (L < 1e-9) continue; n = n.map(q => q / L);
      let polys = [v];
      for (const z of cutZ) { const nx = []; for (const pl of polys) { const lo = clip(pl, z, true), hi = clip(pl, z, false); if (lo.length >= 3) nx.push(lo); if (hi.length >= 3) nx.push(hi); } polys = nx; }
      for (const pl of polys) for (let k = 1; k < pl.length - 1; k++) pushTri(pl[0], pl[k], pl[k + 1], n, oid);
    }
    return { pos: Float32Array.from(P), nrm: Float32Array.from(N), oid: Int32Array.from(O) };
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function bbox(pts) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }

  /* ---- whole scene: shared parts once, main-level walls + baseboards once per design variant ---- */
  const FOUND_TOP = -4.35, CUT_L1 = 8.02, CUT_L2 = 13.6;
  const isOpen = e => (e.ifc === 'IfcWindow' || e.ifc === 'IfcDoor' || e.ifc === 'IfcOpeningElement') && e.predefined !== 'SKYLIGHT' && e.center;
  function sceneBase(bim) {
    const ctx = prepare(bim), storeyOf = plate => plate > 12 ? 'L2' : 'L1', gp = gableParts(ctx, storeyOf);
    const swap = new Set((bim.designOptions || []).flatMap(d => d.removes));
    ctx.gp = gp; ctx.swap = swap;
    const E = bim.elements, opens = E.filter(isOpen);
    const L2w = ctx.walls.filter(w => w.storey === 'L2');
    let wl2 = buildWalls(ctx, L2w, opens.filter(o => o.storey === 'L2'), 'L2', gp.infill.L2);
    if (wl2 && gp.glaze.L2.length) wl2 = wl2.subtract(Manifold.union(gp.glaze.L2));
    const ce = buildCeilings(ctx);
    const allWallsForFloors = z => ctx.walls.filter(w => w.z0 <= z + .1 && w.z1 >= z + .5);
    const floors = buildFloors(ctx, allWallsForFloors).map(f => ({ z: f.z, fin: f.fin, tris: triangles(f.solid) }));
    const base = {};
    // every finished floor level except the main level (built per design variant), incl. interior landing levels
    const levels = [...new Set(ctx.slabs.map(s => +s.z.toFixed(3)).concat(interiorLandings(ctx).map(e => +e.z.toFixed(3))))].filter(z => Math.abs(z) > .05);
    for (const z of levels) { const b = buildBaseboards(ctx, z, ctx.walls, opens); if (b) base[z] = triangles(b); }
    const out = {
      wallsL2: triangles(wl2, [CUT_L2], 0),
      roofs: ctx.roofs.map(R => ({ id: R.id, oid: R.oid, kind: R.kind, group: R.group, top: R.top, frame: R.frame, plate: R.plate,
        tris: triangles(R.final, [], 0), pieces: R.pieces.map(pc => ({ poly: pc.poly, P: pc.P, th: pc.th, ext: !!pc.ext })),
        shakeEnds: (R.ends || []).filter(e => e.mat === 'shake').map(e => ({ s: e.s, EW: R.g.EW, t0: R.g.t0, t1: R.g.t1, plate: R.plate })) })),
      ceil: triangles(ce.ceil), lining: triangles(ce.lining), floors, baseboards: base, panes: gp.panes,
      gInfo: ctx.gInfo };
    return { ctx, out };
  }
  function sceneVariant(ctx, def) {
    const bim = ctx.bim, E = bim.elements, rm = new Set(def ? def.removes : []);
    const keep = e => !ctx.swap.has(e.id) || !rm.has(e.id);
    const els = E.filter(e => e.ifc === 'IfcWall' && e.storey === 'L1' && keep(e)).concat(def ? def.elements.filter(e => e.ifc === 'IfcWall') : []);
    const ops = E.filter(e => isOpen(e) && e.storey === 'L1' && keep(e)).concat(def ? def.elements.filter(isOpen) : []);
    let w1 = buildWalls(ctx, els, ops, 'L1', ctx.gp.infill.L1);
    if (w1 && ctx.gp.glaze.L1.length) w1 = w1.subtract(Manifold.union(ctx.gp.glaze.L1));
    const b0 = buildBaseboards(ctx, 0, els, ops);
    return { wallsL1: triangles(w1, [FOUND_TOP, CUT_L1], 0), baseboards: b0 ? triangles(b0) : null };
  }
  function buildScene(bim) {
    const { ctx, out } = sceneBase(bim);
    out.variants = { asbuilt: sceneVariant(ctx, null) };
    for (const d of (bim.designOptions || [])) out.variants[d.id] = sceneVariant(ctx, d);
    return { ctx, out };
  }

  return { prepare, gableParts, buildWalls, buildCeilings, buildFloors, buildBaseboards, triangles, inPoly, zAt, buildScene, sceneVariant };
}
