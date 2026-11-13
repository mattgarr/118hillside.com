#!/usr/bin/env python3
"""Primary bath r48b (owner 11/13/2026): the shower HAS a skylight. bath48.py closed SK-R01's ceiling hole and took its shaft out; this
puts the skylight back, drawn as a proper light well.

Why the old one read as "a grey translucent slab over the door rail": the roof over the bath is a low slope, so the skylight's glass
sits only 1.1 to 1.5 ft over the 8 ft ceiling, and the exported shaft was two pieces that did not line up: a thin double-walled box
in ceiling paint from the ceiling up to the roof's underside (13.6 to 14.4 / 14.8 ft, its top cut to the roof slope, with capping
faces), then a wider lining through the roof (1-1/2 in larger each way) up to the glass, with a ledge between them. From the tour's
stop, looking across the room at a low angle, the glass is entirely hidden behind that ledge, and all you see in the hole is the
shaft's far wall: one flat, evenly lit trapezoid with a slanted top edge that does not follow the hole - it reads as a pale plate
hung in the ceiling. (Checked on a GPU on bda9b9f: hiding the glass, the roof lining or the page's skylight shade leaves it as it
is; a ray through it lands on the shaft's far wall.)

What this draws (BIM feet, z = 0 at the main floor; the bath ceiling is at 13.57):
1  The ceiling hole at SK-R01's own position and size, x -17.97..-16.39, y -11.53..-10.01 (19 x 18 in): bath48's two fill fans in
   CL-SP-L2-PBATH are taken out, and the exporter's one sliver at the hole's north edge is filled so the opening is a clean rectangle.
2  A light well: four flat walls in the ceiling's own paint (mesh ceilings|L2|gwb-l5#paint-ceiling-flat, element SK-R01), each from
   the ceiling plane straight up to the glazing, facing into the well, with square corners and no ledge; nothing below the ceiling.
3  A slim white frame at the top of the well (white trim, element SK-R01): a 1-1/4 in band parallel to the glass, just under it,
   around the glass. The glass, its outside frame and the roof are left as they are.
Idempotent: a package whose ceiling mesh already has an SK-R01 run is left alone. Run after bath48.py.
Edits scene.glb in tour/, halloween/, thanksgiving/ and updates each scene.meta.json (glb sha256 and bytes, mesh counts; nothing else).
NOTE: scene.glb comes from the BIM kernel export, which is not in this repository; the same skylight well belongs in that export.
Run: python3 tour/bim2/tools/bath48b.py      (--check: report only)
"""
import hashlib, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from doors46 import Glb, add_run                                                  # noqa: E402
from bath48 import prim, run, tris_bim, keep_tris, quads, hole_loop, CEIL, TRIM, CEIL_Z   # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
SITES = ('tour', 'halloween', 'thanksgiving')
SKY = 'SK-R01'; GLASS = 'glass|-|skylight-glass'
HOLE = (-17.97, -16.39, -11.53, -10.01)          # the exporter's ceiling hole for SK-R01: x0 x1 y0 y1
FRAME_W, FRAME_GAP = 1.25 / 12, 0.03              # the white frame's width, and how far it sits under the glass


def patch(g, rep, tag):
    ceil = prim(g, CEIL)
    if run(g, ceil, SKY): return
    x0, x1, y0, y1 = HOLE
    # the glass plane, from SK-R01's panes: z = a + b * y (it slopes with the roof, down to the north)
    gp = prim(g, GLASS); r = run(g, gp, SKY); G, _ = tris_bim(g, gp, r); P = G.reshape(-1, 3)
    A =np.c_[np.ones(len(P)), P[:, 1]]; coef, *_ = np.linalg.lstsq(A, P[:, 2], rcond=None)
    zg = lambda y: float(coef[0] + coef[1] * y) - FRAME_GAP
    gx0, gx1, gy0, gy1 = float(P[:, 0].min()), float(P[:, 0].max()), float(P[:, 1].min()), float(P[:, 1].max())
    assert gx0 < x0 + .05 and gx1 > x1 - .05 and gy1 > y1 - .05, ('the glass does not cover the hole', gx0, gx1, gy0, gy1)

    # 1. reopen the hole: bath48's fill triangles lie wholly inside the hole's box
    e = .06; n = 0                                                                 # (bath48 added its fills as further CL-SP-L2-PBATH runs)
    for cl in [q for q in g.J['meshes'][ceil['mesh']]['extras']['ranges'] if q[0] == 'CL-SP-L2-PBATH']:
        F, Nf = tris_bim(g, ceil, cl)
        fill = (F[:, :, 0].min(1) >= x0 - e) & (F[:, :, 0].max(1) <= x1 + e) & (F[:, :, 1].min(1) >= y0 - e) & (F[:, :, 1].max(1) <= y1 + e)
        n += keep_tris(g, ceil, cl, ~fill)
    rep.append((tag, 'ceiling hole reopened: %d fill triangles removed' % n))
    F, Nf = [np.concatenate(v) for v in zip(*[tris_bim(g, ceil, q) for q in g.J['meshes'][ceil['mesh']]['extras']['ranges'] if q[0] == 'CL-SP-L2-PBATH'])]
    m = (np.abs(F[:, :, 2] - CEIL_Z).max(1) < .005) & (Nf[:, 2] < -.5)
    loop = hole_loop(F[m], (x0 - e, x1 + e, y0 - e, y1 + e)); assert loop, 'no hole in the ceiling'
    T = []                                                                         # the hole's edge points off the rectangle: fill them in
    for i, q in enumerate(loop):
        if q[0] < x0 - 1e-3 or q[0] > x1 + 1e-3 or q[1] < y0 - 1e-3 or q[1] > y1 + 1e-3:
            a, b = loop[i - 1], loop[(i + 1) % len(loop)]; T.append([(a[0], a[1], CEIL_Z), (q[0], q[1], CEIL_Z), (b[0], b[1], CEIL_Z)])
    if T:
        Pq = np.array([[p[1], p[2], p[0]] for t in T for p in t], float); Nq = np.tile([0., -1., 0.], (len(Pq), 1)); Tq = np.arange(len(Pq)).reshape(-1, 3)
        for k, t in enumerate(Tq):                                                 # wound to face down
            c = np.cross(Pq[t[1]] - Pq[t[0]], Pq[t[2]] - Pq[t[0]])
            if c[1] > 0: Tq[k] = t[[0, 2, 1]]
        add_run(g, ceil, 'CL-SP-L2-PBATH', Pq, Nq, Tq)
    rep.append((tag, 'hole edge squared: %d sliver(s) filled; hole x %.2f..%.2f, y %.2f..%.2f (%.1f x %.1f in)' % (len(T), x0, x1, y0, y1, (x1 - x0) * 12, (y1 - y0) * 12)))

    # 2. the light well: four walls from the ceiling plane to the frame, facing in
    z = CEIL_Z
    W = [([(x0, y1, z), (x0, y0, z), (x0, y0, zg(y0)), (x0, y1, zg(y1))], (1, 0, 0)),
         ([(x1, y0, z), (x1, y1, z), (x1, y1, zg(y1)), (x1, y0, zg(y0))], (-1, 0, 0)),
         ([(x0, y0, z), (x1, y0, z), (x1, y0, zg(y0)), (x0, y0, zg(y0))], (0, 1, 0)),
         ([(x1, y1, z), (x0, y1, z), (x0, y1, zg(y1)), (x1, y1, zg(y1))], (0, -1, 0))]
    add_run(g, ceil, SKY, *quads(W))
    rep.append((tag, 'light well: 4 walls, %.2f to %.2f ft high (north) and %.2f (south)' % (z, zg(y1), zg(y0))))

    # 3. the white frame under the glass
    w = FRAME_W; ix0, ix1, iy0, iy1 = x0 + w, x1 - w, y0 + w, y1 - w
    h = float(np.hypot(coef[1], 1)); nv = (0.0, float(coef[1]) / h, -1.0 / h)        # facing down into the well, square to the glass
    pt = lambda x, y: (x, y, zg(y) - .002)
    Fr = [([pt(x0, y0), pt(x1, y0), pt(x1, iy0), pt(x0, iy0)], nv), ([pt(x0, iy1), pt(x1, iy1), pt(x1, y1), pt(x0, y1)], nv),
          ([pt(x0, iy0), pt(ix0, iy0), pt(ix0, iy1), pt(x0, iy1)], nv), ([pt(ix1, iy0), pt(x1, iy0), pt(x1, iy1), pt(ix1, iy1)], nv)]
    add_run(g, prim(g, TRIM), SKY, *quads(Fr))
    rep.append((tag, 'white frame: %.2f in band under the glass, glass x %.2f..%.2f, y %.2f..%.2f' % (w * 12, gx0, gx1, gy0, gy1)))


def main():
    check = '--check' in sys.argv; rep = []
    for site in SITES:
        d = os.path.join(ROOT, site, 'bim2'); mp = os.path.join(d, 'scene.meta.json')
        if not os.path.exists(mp): continue
        meta = json.load(open(mp)); gp = os.path.join(d, meta['glb']['file']); g = Glb(gp)
        patch(g, rep, site)
        if not g.dirty or check: continue
        g.save(); cnt = {g.J['meshes'][p['mesh']].get('name'): (len(p['I']), len(p['V']), len(g.J['meshes'][p['mesh']]['extras'].get('ranges') or [])) for p in g.prims}
        for mm in meta.get('meshes', []):
            if mm.get('name') in cnt: mm['tris'], mm['verts'], mm['ranges'] = (int(v) for v in cnt[mm['name']])
        if meta.get('stats') and meta.get('meshes'):
            meta['stats']['triangles'] = int(sum(mm['tris'] for mm in meta['meshes']))
            for k, v in meta['stats'].get('byGroup', {}).items(): v['tris'] = int(sum(mm['tris'] for mm in meta['meshes'] if mm.get('group') == k))
        raw = open(gp, 'rb').read(); meta['glb']['sha256'] = hashlib.sha256(raw).hexdigest(); meta['glb']['bytes'] = len(raw)
        open(mp, 'w').write(json.dumps(meta, separators=(',', ':'), ensure_ascii=False))
    for r in rep: print(' | '.join(str(x) for x in r))
    print('%d changes%s' % (len(rep), ' (check only, nothing written)' if check else ''))


if __name__ == '__main__':
    main()
