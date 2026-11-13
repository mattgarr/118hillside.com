#!/usr/bin/env python3
"""Primary bath r48 (owner 11/13/2026): "the outside corner inside the shower should be tile, and you are missing the shower bench, and
there is a weird artifact above the top bar, this whole ceiling in the bathroom should be one plane also."

1  The outside corner. The jog in the shower's east end (wall W-L2-019 meeting W-L2-032, corner at BIM x -14.86, y -10.73) was drawn
   in the bath's Silver Chain paint with a baseboard on both faces, and the two thin strips of wall W-L2-035 at the shower's east wall
   ends (y -13.77..-13.62 and -10.78..-10.73) were paint with baseboard too. Every one of those faces inside the shower becomes the
   shower's wall tile (tile-pb-wall), floor to ceiling, and the four baseboards inside the shower (TR-0272, TR-0273, TR-0297,
   TR-0298) go. The tile below the old baseboard line is filled in (the tiled faces had a 5-1/4 in notch cut for the baseboard ends).
   Texture coordinates are the packages' own BIM-feet box projection, so the tile runs on from the faces beside it.
2  A built-in bench (assumed: no photo of the real one). Along the shower's east wall, between the south wall and the corner jog:
   15 in deep to the seat's front edge (x -13.98..-12.73), the full 36-1/2 in between the two walls (y -13.77..-10.73), seat 17-1/2 in
   high; the seat is a 1-1/2 in slab standing 3/4 in proud of the bench's face, all in the same wall tile. Element BN-PBATH-48 in the
   tile mesh.
3/4 The ceiling. A skylight well (SK-R01) was cut in the shower ceiling: a 19 x 18 in shaft rising 9 to 14 in to a roof skylight, its
   skylight-glass pane reading from the bathroom as a grey translucent slab over the shower door's top rail, and the shaft as a step in
   the ceiling. The listing has a skylight over the water closet (SK-R02, kept) and none over the shower. The shaft's walls are taken
   out and the hole in the bath ceiling (CL-SP-L2-PBATH) is closed on both faces, so the whole bath ceiling is one plane at 13.57 ft
   (8 ft over the floor). The skylight on the roof (glass, frame, roof cut) is left as it was, for the outside views.

Edits scene.glb in tour/, halloween/ and thanksgiving/ in place and updates each scene.meta.json (glb sha256 and bytes, mesh counts).
The layout ideas' packages are not touched. Idempotent: a package that already has BN-PBATH-48 is left alone.
NOTE: scene.glb comes from the BIM kernel export, which is not in this repository; the same changes belong in that export.
Run after any new export, then doors46.py (which must then report 0 changes on a second run).
Run: python3 tour/bim2/tools/bath48.py      (--check: report only)
"""
import hashlib, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from doors46 import Glb, add_run   # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
SITES = ('tour', 'halloween', 'thanksgiving')
TILE = 'walls|L2|tile-pb-wall'; PAINT = 'walls|L2|paint-int-flat#PAINT-BM-1472-SILVER-CHAIN'; TRIM = 'trim|L2|mdf-primed#paint-trim-semigloss'
FLOORS = 'floors|L2|tile-pb-floor'; CEIL = 'ceilings|L2|gwb-l5#paint-ceiling-flat'; OPEN_PAINT = 'openings|-|paint-ceiling-flat'
BENCH = 'BN-PBATH-48'
FLOOR, CEIL_Z, CEIL_TOP = 5.57, 13.57, 13.61
SHOWER = dict(x0=-19.3, x1=-12.7, y0=-13.8, y1=-10.7)          # the shower floor east of the glass, south of the jog
BASEBOARDS = ('TR-0272', 'TR-0273', 'TR-0297', 'TR-0298')
SKY = 'SK-R01'; SKY_BOX = (-18.03, -16.33, -11.59, -9.95)       # its shaft and ceiling hole, BIM x0 x1 y0 y1
BENCH_D, BENCH_H = 15 / 12, 17.5 / 12
LIP_T, LIP_OUT = 1.5 / 12, 0.75 / 12                            # the seat: a 1-1/2 in tiled slab standing 3/4 in proud of the bench's face


def prim(g, name):
    for p in g.prims:
        if g.J['meshes'][p['mesh']].get('name') == name: return p
    raise KeyError(name)


def run(g, p, el, b=None):
    for r in g.J['meshes'][p['mesh']]['extras'].get('ranges') or []:
        if r[0] == el and (b is None or r[1] == b): return r
    return None


def tris_bim(g, p, r):
    """the run's triangles as BIM (x, y, z) corners (k, 3, 3) and BIM normals (k, 3)"""
    T = p['I'][r[2]:r[2] + r[3]]; t = g.trans(p['mesh']); P = p['V'][:, :3] + t; N = p['V'][:, 3:6]
    return P[T][:, :, [2, 0, 1]], N[T[:, 0]][:, [2, 0, 1]]


def keep_tris(g, p, r, keep):
    """keep only the masked triangles of a run (all False: the run goes)"""
    rs = g.J['meshes'][p['mesh']]['extras']['ranges']; s, c = r[2], r[3]; I = p['I']; k = I[s:s + c][np.asarray(keep, bool)]
    p['I'] = np.concatenate([I[:s], k, I[s + c:]]).astype(np.uint32); d = len(k) - c
    for q in rs:
        if q is not r and q[2] >= s + c: q[2] += d
    r[3] = len(k)
    if not len(k): rs.remove(r)
    g.dirty = True; return c - len(k)


def quads(rects):
    """rects: list of (four BIM corners, BIM normal). Returns glb-frame P, N, T with each triangle wound to face its normal"""
    P, N, T = [], [], []
    for C, n in rects:
        C = np.asarray(C, float); n = np.asarray(n, float); b = len(P)
        for q in C: P.append([q[1], q[2], q[0]]); N.append([n[1], n[2], n[0]])
        for a, bb, c in ((0, 1, 2), (0, 2, 3)):
            if np.cross(C[bb] - C[a], C[c] - C[a]) @ n < 0: bb, c = c, bb
            T.append((b + a, b + bb, b + c))
    return np.array(P, float), np.array(N, float), np.array(T, np.int64)


def fan(loop, z, n):
    """a closed loop of BIM (x, y) points as a fan of triangles about its centroid (the loops here are near-rectangles)"""
    L = np.asarray(loop, float); c = L.mean(0); P = [[c[1], z, c[0]]] + [[q[1], z, q[0]] for q in L]; N = [[0, n, 0]] * len(P); T = []
    for i in range(len(L)):
        a, b = 1 + i, 1 + (i + 1) % len(L)
        va = np.array([L[i][0] - c[0], L[i][1] - c[1]]); vb = np.array([L[(i + 1) % len(L)][0] - c[0], L[(i + 1) % len(L)][1] - c[1]])
        cr = va[0] * vb[1] - va[1] * vb[0]
        if abs(cr) < 1e-9: continue
        T.append((0, a, b) if (cr > 0) == (n > 0) else (0, b, a))
    return np.array(P, float), np.array(N, float), np.array(T, np.int64)


def hole_loop(F, box):
    """the boundary loop of a set of flat triangles (BIM corners) that lies inside box: the ceiling hole's edge"""
    key = lambda q: (round(float(q[0]), 3), round(float(q[1]), 3))
    cnt = {}
    for t in F:
        for i in range(3):
            a, b = key(t[i]), key(t[(i + 1) % 3])
            if a == b: continue
            e = (a, b) if a < b else (b, a); cnt[e] = cnt.get(e, 0) + 1
    x0, x1, y0, y1 = box
    inb = lambda q: x0 <= q[0] <= x1 and y0 <= q[1] <= y1
    E = [e for e, c in cnt.items() if c == 1 and inb(e[0]) and inb(e[1])]
    if not E: return None
    adj = {}
    for a, b in E: adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    start = E[0][0]; loop = [start]; prev = None; cur = start
    while True:
        nx = [q for q in adj[cur] if q != prev]
        if not nx: return None
        prev, cur = cur, nx[0]
        if cur == start: break
        loop.append(cur)
        if len(loop) > len(adj) + 2: return None
    return loop


def patch(g, rep, tag):
    tile = prim(g, TILE)
    if run(g, tile, BENCH): return
    paint = prim(g, PAINT); trim = prim(g, TRIM); ceil = prim(g, CEIL)

    # 1. the corner jog and the east-wall strips: paint faces inside the shower go
    corner = run(g, paint, 'W-L2-019', 'B-1153'); C, Nc = tris_bim(g, paint, corner)
    side = np.abs(Nc[:, 2]) < .5                                       # its vertical faces (the floor/ceiling caps stay)
    xw = float(C[side & (Nc[:, 0] < -.5)][:, :, 0].mean()); ys = float(C[side & (Nc[:, 1] < -.5)][:, :, 1].mean())
    yn = float(C[side & (Nc[:, 0] < -.5)][:, :, 1].max())
    r = run(g, tile, 'W-L2-032', 'B-1287')                             # the tile beyond starts 1/4 in further on, and its foot (the old
    if r:                                                              # baseboard's end) 1/10 in further still: run the corner's face up to both
        S, _ = tris_bim(g, tile, r); low = S[:, :, 2].max(1) < 6.05
        yn = max(yn, float(S[low][:, :, 1].min()) if low.any() else float(S[:, :, 1].min()))
    rep.append((tag, 'corner B-1153: %d painted faces -> tile (x %.3f, y %.3f)' % (keep_tris(g, paint, corner, ~side), xw, ys)))
    strips = []
    for b in ('B-1307', 'B-1311'):
        r = run(g, paint, 'W-L2-035', b); S, Ns = tris_bim(g, paint, r); v = np.abs(Ns[:, 2]) < .5
        strips.append((float(S[v][:, :, 0].mean()), float(S[v][:, :, 1].min()), float(S[v][:, :, 1].max())))
        rep.append((tag, 'east wall %s: %d painted faces -> tile' % (b, keep_tris(g, paint, r, ~v))))
    feet = []                                                          # each baseboard's footprint: the floor's tiled face stops short of it
    for el in BASEBOARDS:
        r = run(g, trim, el)
        if not r: continue
        S, _ = tris_bim(g, trim, r); feet.append((float(S[:, :, 0].min()), float(S[:, :, 0].max()), float(S[:, :, 1].min()), float(S[:, :, 1].max())))
        rep.append((tag, 'baseboard %s: %d triangles removed' % (el, keep_tris(g, trim, r, np.zeros(r[3], bool)))))
    # the floor is laid on into the baseboards' footprints (and the square at the jog's corner between its two returns)
    near = [f for f in feet if f[0] < xw + .1 and f[1] > xw - .2 and f[2] < ys + .1 and f[3] > ys - .2]   # the jog's two returns
    fx0 = min(f[0] for f in near); fy0 = min(f[2] for f in near)
    feet.append((fx0, xw, fy0, ys))
    floor = prim(g, FLOORS)
    add_run(g, floor, 'FL-SP-L2-PBATH', *quads([([(a, c, FLOOR), (b, c, FLOOR), (b, d, FLOOR), (a, d, FLOOR)], (0, 0, 1)) for a, b, c, d in feet]))
    rep.append((tag, 'floor laid into %d baseboard footprints' % len(feet)))
    # the tiled face of the jog (B-1157) had the baseboard's notch: it is drawn again whole, with the corner's return
    r = run(g, tile, 'W-L2-019', 'B-1157'); S, _ = tris_bim(g, tile, r); xe = float(S[:, :, 0].max())
    keep_tris(g, tile, r, np.zeros(r[3], bool))
    R = [([(xw, ys, FLOOR), (xe, ys, FLOOR), (xe, ys, CEIL_Z), (xw, ys, CEIL_Z)], (0, -1, 0)),          # the jog's south face, corner to east wall
         ([(xw, ys, FLOOR), (xw, yn, FLOOR), (xw, yn, CEIL_Z), (xw, ys, CEIL_Z)], (-1, 0, 0))]          # its west face, corner to the tile beyond
    for x, a, b in strips: R.append(([(x, a, FLOOR), (x, b, FLOOR), (x, b, CEIL_Z), (x, a, CEIL_Z)], (-1, 0, 0)))
    xs, y_s = strips[0][0], strips[0][1]
    R.append(([(xs - .075, y_s, FLOOR), (xs, y_s, FLOOR), (xs, y_s, 6.02), (xs - .075, y_s, 6.02)], (0, 1, 0)))   # the south wall's baseboard notch
    add_run(g, tile, 'W-L2-019', *quads(R)); tile_r = g.J['meshes'][tile['mesh']]['extras']['ranges'][-1]; tile_r[1] = 'B-1157'
    rep.append((tag, 'tile: jog faces, east-wall strips and the notch, %d quads' % len(R)))

    # 2. the bench
    bx0 = xs - BENCH_D; top = FLOOR + BENCH_H; bxb = bx0 + LIP_OUT; zl = top - LIP_T
    B = [([(bxb, y_s, FLOOR), (bxb, ys, FLOOR), (bxb, ys, zl), (bxb, y_s, zl)], (-1, 0, 0)),          # the bench's face
         ([(bx0, y_s, zl), (bxb, y_s, zl), (bxb, ys, zl), (bx0, ys, zl)], (0, 0, -1)),                 # under the seat's lip
         ([(bx0, y_s, zl), (bx0, ys, zl), (bx0, ys, top), (bx0, y_s, top)], (-1, 0, 0)),              # the lip's edge
         ([(bx0, y_s, top), (bx0, ys, top), (xs, ys, top), (xs, y_s, top)], (0, 0, 1))]               # the seat
    add_run(g, tile, BENCH, *quads(B))
    rep.append((tag, 'bench %s: x %.2f..%.2f, y %.2f..%.2f, top %.3f (%.1f in deep, %.1f in long, %.1f in high)' % (BENCH, bx0, xs, y_s, ys, top, BENCH_D * 12, (ys - y_s) * 12, BENCH_H * 12)))

    # 3/4. the skylight shaft over the shower: its walls go, the ceiling hole is closed
    n = 0
    for p in g.prims:
        r = run(g, p, SKY); name = g.J['meshes'][p['mesh']].get('name')
        if r and name in (CEIL, OPEN_PAINT): n += keep_tris(g, p, r, np.zeros(r[3], bool))
    cl = run(g, ceil, 'CL-SP-L2-PBATH'); F, Nf = tris_bim(g, ceil, cl)
    x0, x1, y0, y1 = SKY_BOX
    inside = (F[:, :, 0].min(1) >= x0) & (F[:, :, 0].max(1) <= x1) & (F[:, :, 1].min(1) >= y0) & (F[:, :, 1].max(1) <= y1)
    vert = np.abs(Nf[:, 2]) < .5
    n += keep_tris(g, ceil, cl, ~(inside & vert)); cl = run(g, ceil, 'CL-SP-L2-PBATH'); F, Nf = tris_bim(g, ceil, cl)
    for z, s in ((CEIL_Z, -1), (CEIL_TOP, 1)):
        m = (np.abs(F[:, :, 2] - z).max(1) < .005) & (Nf[:, 2] * s > .5)
        loop = hole_loop(F[m], (x0 - .01, x1 + .01, y0 - .01, y1 + .01)); assert loop, ('no hole loop at', z)
        P, N, T = fan(loop, z, s); add_run(g, ceil, 'CL-SP-L2-PBATH', P, N, T)
        rep.append((tag, 'ceiling hole closed at z %.2f: loop of %d points, %d triangles' % (z, len(loop), len(T))))
    rep.append((tag, 'skylight shaft %s: %d triangles removed' % (SKY, n)))


def main():
    check = '--check' in sys.argv; rep = []
    for site in SITES:
        d = os.path.join(ROOT, site, 'bim2'); mp = os.path.join(d, 'scene.meta.json')
        if not os.path.exists(mp): continue
        meta = json.load(open(mp)); gp = os.path.join(d, meta['glb']['file']); g = Glb(gp)
        patch(g, rep, site)
        if not g.dirty or check: continue
        g.save(); cnt = {g.J['meshes'][p['mesh']].get('name'): (len(p['I']), len(p['V'])) for p in g.prims}
        for m in meta.get('meshes', []):
            if m.get('name') in cnt: m['tris'], m['verts'] = int(cnt[m['name']][0]), int(cnt[m['name']][1])
            for p in g.prims:
                if g.J['meshes'][p['mesh']].get('name') == m.get('name'): m['ranges'] = len(g.J['meshes'][p['mesh']]['extras'].get('ranges') or [])
        if meta.get('stats') and meta.get('meshes'):
            meta['stats']['triangles'] = int(sum(m['tris'] for m in meta['meshes']))
            for k, v in meta['stats'].get('byGroup', {}).items(): v['tris'] = int(sum(m['tris'] for m in meta['meshes'] if m.get('group') == k))
        raw = open(gp, 'rb').read(); meta['glb']['sha256'] = hashlib.sha256(raw).hexdigest(); meta['glb']['bytes'] = len(raw)
        open(mp, 'w').write(json.dumps(meta, separators=(',', ':'), ensure_ascii=False))
    for r in rep: print(' | '.join(str(x) for x in r))
    print('%d changes%s' % (len(rep), ' (check only, nothing written)' if check else ''))


if __name__ == '__main__':
    main()
