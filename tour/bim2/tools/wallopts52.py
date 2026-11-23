#!/usr/bin/env python3
"""Design options r52: the primary bedroom's west wall, four ways (and the wall as built).

  w1  "Windows, balcony removed"        tools/nobalcony51.py, unchanged (overlay nobalcony51, scene.nobalcony51.glb)
  w2  "Tall windows, balcony removed"   w1 with the windows' head at the top of the door opening: sill 37 1/2 in, head 96 in above the floor,
                                        no wall above them, the same three joined casements 2 lites wide and 3 high, the roof carried across
  d1  "6'-8\" door on a curb"           the balcony stays; the three-panel sliding door stands on a 5 1/2 in curb, head 85 1/2 in above the floor
  d2  "7'-0\" door on a curb"           the same, head 89 1/2 in above the floor

Each is an overlay package like r51's: tour/bim2/scene.<key>.glb and an entry in tour/bim2/scene.meta.json `overlays[]` (hide, glb, sha256,
colliders, floorsOff, clearBox, windows; for the doors `keepLeaves` (the loader leaves the door's own leaves drawn) and `leafMap` (the page moves
the foot and the head of each leaf: z below lo rises by a, z above hi moves by b, straight in between)). Only one overlay shows at a time.

w2 is w1's group made a lite taller: the unit is cut at the middle of its horizontal bar, a third lite (the upper lite's lower half and its mirror
image) goes in, and every lite then loses the same height so the head lands on the door opening's.
d1 / d2 move the door's own geometry (frame, lining, casings; the leaves on the page) by the same rule, and add the curb under it (painted face with the
baseboard run across and a cap inside, siding outside) and the wall above it (paint inside, siding outside).
Run: python3 tour/bim2/tools/wallopts52.py [w2 d1 d2]      (safe to run again)
"""
import hashlib, json, os, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import doors46 as D46
import nobalcony51 as NB
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
import shapely

B2 = NB.B2
PAINT, SIDING, STUD, TRIM, SHINGLE, SOFFIT = NB.PAINT, NB.SIDING, NB.STUD, NB.TRIM, NB.SHINGLE, NB.SOFFIT
IN = 1 / 12
VARIANTS = {
    'w2': dict(id='wall52-w2', glb='scene.w2.glb', kind='W', name='Tall windows, balcony removed', el='W252', head_in=96.0),
    'd1': dict(id='wall52-d1', glb='scene.d1.glb', kind='D', name='6\'-8" door on a curb', el='D152', curb_in=5.5, head_in=85.5),
    'd2': dict(id='wall52-d2', glb='scene.d2.glb', kind='D', name='7\'-0" door on a curb', el='D252', curb_in=5.5, head_in=89.5),
}
DOOR = 'D-L2-01'
CASING = ['TR-0536', 'TR-0537', 'TR-0538', 'TR-0539', 'TR-0540', 'TR-0541', 'TR-0542', 'TR-0543']   # the door's casing: outside head and legs, inside head (three parts) and legs


def elem_leaf(g, el):
    """NB.elem, with whether each part belongs to an operable leaf (the page draws those itself)"""
    out = []
    for p in g.prims:
        me = g.J['meshes'][p['mesh']]; ex = me.get('extras', {}); nx = g.J['nodes'][g.node_of[p['mesh']]].get('extras', {})
        mat = ex.get('material') or nx.get('material'); t = g.trans(p['mesh'])
        for r in ex.get('ranges') or []:
            if r[0] != el: continue
            tri = p['I'][r[2]:r[2] + r[3]]
            W = p['V'][tri.ravel(), :3].astype(float) + t
            out.append(dict(mat=mat, group=ex.get('group') or nx.get('group'), storey=ex.get('storey') or nx.get('storey'), leaf=bool(ex.get('leaf') or nx.get('leaf')),
                            B=W[:, [2, 0, 1]].reshape(-1, 3, 3), NB=p['V'][tri.ravel(), 3:6].astype(float)[:, [2, 0, 1]].reshape(-1, 3, 3)))
    return out


def clip_ax(P, N, lo, hi, ax):
    """the part of triangle P (3x3) with lo <= P[ax] <= hi: a list of (P, N) triangles"""
    poly = list(zip(P.astype(float), N.astype(float)))
    for c, sg in ((hi, 1), (lo, -1)):
        out = []
        for i in range(len(poly)):
            a, na = poly[i]; b, nb = poly[(i + 1) % len(poly)]
            ia, ib = sg * a[ax] <= sg * c + 1e-9, sg * b[ax] <= sg * c + 1e-9
            if ia: out.append((a, na))
            if ia != ib:
                t = (c - a[ax]) / (b[ax] - a[ax]); q = a + t * (b - a); q[ax] = c; out.append((q, na + t * (nb - na)))
        poly = out
        if len(poly) < 3: return []
    return [(np.array([poly[0][0], poly[k][0], poly[k + 1][0]]), np.array([poly[0][1], poly[k][1], poly[k + 1][1]])) for k in range(1, len(poly) - 1)
            if np.linalg.norm(np.cross(poly[k][0] - poly[0][0], poly[k + 1][0] - poly[0][0])) > 1e-10]


def taller(pieces, sill, head, new_head):
    """the group with one more lite in its height (2 x 3 lites a sash), its head at new_head. Pieces in the north-wall frame (z up)."""
    gz = np.unique(np.round(np.concatenate([p['P'][..., 2].ravel() for p in pieces if p['mat'] == 'glass']), 4))
    lo_p, bar0, bar1, hi_p = float(gz[0]), float(gz[len(gz) // 2 - 1]), float(gz[len(gz) // 2]), float(gz[-1])   # 9.028 | 10.664 10.726 | 12.362
    zc = (bar0 + bar1) / 2; zq = (bar1 + hi_p) / 2; add = 2 * (zq - zc)                                        # the bar's middle; the upper lite's middle
    out = []
    for p in pieces:
        T = []
        for P, N in zip(p['P'], p['N']):
            T += clip_ax(P, N, -1e9, zc, 2)
            for q, n in clip_ax(P, N, zc, 1e9, 2):
                q = q.copy(); q[:, 2] += add; T.append((q, n))
            for q, n in clip_ax(P, N, zc, zq, 2):
                T.append((q, n))
                m = q.copy(); m[:, 2] = 2 * zq - m[:, 2]; mn = n.copy(); mn[:, 2] = -mn[:, 2]; T.append((m[[0, 2, 1]], mn[[0, 2, 1]]))
        if T: out.append(dict(p, P=np.array([t[0] for t in T]), N=np.array([t[1] for t in T])))
    d = (head + add - new_head) / 3                                    # each lite loses this much
    assert 0 <= d < (hi_p - bar1) * .5, d
    cuts = [(lo_p + bar0) / 2 + .1, zq + .1, zq + add / 2 + (hi_p - bar1) / 2 + .1 - (zq - bar1) + (zq - bar1)]
    cuts[2] = bar1 + add + (hi_p - bar1) / 2 + .1
    for p in out:
        Z = p['P'][..., 2]; sh = np.zeros_like(Z)
        for c in cuts: sh -= np.where(Z > c, d, 0)
        p['P'][..., 2] = Z + sh
    return out, dict(lite_h_in=round((hi_p - bar1 - d) * 12, 2), added=round(add, 4), each_lite_less=round(d, 4))


def zmap(lo, hi, a, b):
    """z below lo rises by a, z above hi moves by b, straight in between"""
    s = (hi + b - lo - a) / (hi - lo)
    return lambda Z: np.where(Z <= lo, Z + a, np.where(Z >= hi, Z + b, lo + a + (Z - lo) * s))


def boxq(x0, x1, y0, y1, z0, z1, skip=()):
    """the six faces of a box as (P, N) quads; skip: faces to leave out, of '-x +x -y +y -z +z'"""
    F = {'-x': ([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]), '+x': ([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]),
         '-y': ([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]), '+y': ([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]),
         '-z': ([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]), '+z': ([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1])}
    return [NB.quad(*F[k]) for k in F if k not in skip]


def build(key):
    V = VARIANTS[key]; EL = V['el']; W_ = V['kind'] == 'W'
    g = D46.Glb(os.path.join(B2, 'scene.glb'))
    meta = json.load(open(os.path.join(B2, 'scene.meta.json')))
    op = {o['id']: o for o in meta['openings']}
    door = op[DOOR]; win = op[NB.SRC_WIN]
    elem = lambda el: NB.elem(g, el)
    A = NB.Acc(); rep = {'variant': key}
    FLOOR = float(door['sill'])                                    # 5.57: the storey datum the heights are measured from
    lin = [e for e in elem(DOOR) if e['mat'] == PAINT][0]['B'].reshape(-1, 3)
    yA, yB = float(lin[:, 1].min()), float(lin[:, 1].max())
    zHead = float(door['head'])                                    # 13.57
    wi = [e for e in elem('W-L2-022') if e['mat'] == PAINT][0]['B'].reshape(-1, 3)
    X_IN = float(np.round(np.median(wi[:, 0]), 4))
    X_OUT = float(min(e['B'][:, :, 0].min() for e in elem('W-L2-022') if e['mat'] == SIDING))
    ro = (float(door['center'][1]) - door['width'] / 2, float(door['center'][1]) + door['width'] / 2)
    mid = (ro[0] + ro[1]) / 2
    entry = {'id': V['id'], 'key': key, 'name': V['name'], 'status': 'illustrative', 'storey': 'L2', 'glb': V['glb']}

    if W_:
        pieces, cu, gw, pitch = NB.group_pieces(g, 3)
        if gw > ro[1] - ro[0] - 2 * .0625: pieces, cu, gw, pitch = NB.group_pieces(g, 3, fit=ro[1] - ro[0] - 2 * .0625)
        sill = float(win['sill']); head = FLOOR + V['head_in'] * IN
        pieces, r2 = taller(pieces, sill, float(win['head']), head); rep.update(r2)
        k = X_IN + (-8.7845)
        for p in pieces:
            P = p['P']; Q = np.empty_like(P); Q[..., 0] = -P[..., 1] + k; Q[..., 1] = P[..., 0] - cu + mid; Q[..., 2] = P[..., 2]
            N = p['N']; M = np.empty_like(N); M[..., 0] = -N[..., 1]; M[..., 1] = N[..., 0]; M[..., 2] = N[..., 2]
            A.add(p['group'], p['storey'], p['mat'], EL + '-WN' if p['src'] == NB.SRC_WIN else EL + '-WN-' + p['src'], Q, M)
        holes = [(mid - gw / 2, mid + gw / 2, sill, head)]
        rep['window'] = dict(width_in=round(gw * 12, 2), sill_in=round((sill - FLOOR) * 12, 2), head_in=round((head - FLOOR) * 12, 2), height_in=round((head - sill) * 12, 2))
        hide = list(NB.HIDE)
    else:
        a = V['curb_in'] * IN; head = FLOOR + V['head_in'] * IN; b = head - zHead
        LO, HI = FLOOR + .38, zHead - .47                              # inside the leaves' glass: the rails and the frame's head keep their size
        f = zmap(LO, HI, a, b)
        for e in elem_leaf(g, DOOR):
            if e['leaf'] or e['mat'].startswith('oak'): continue      # the leaves stay the page's own (they slide); the floor's threshold strip goes under the curb
            P = e['B'].copy(); P[..., 2] = f(P[..., 2]); A.add(e['group'], e['storey'], e['mat'], EL + '-DOOR', P, e['NB'])
        # the casings: the heads come down with the door's head; the legs keep their feet (floor inside, deck outside) and end at the new head
        f0 = zmap(LO, HI, 0, b)
        for t in CASING:
            for e in elem(t):
                P = e['B'].copy(); P[..., 2] = f0(P[..., 2]); A.add(e['group'], e['storey'], e['mat'], EL + '-' + t, P, e['NB'])
        legs = [elem(t)[0]['B'].reshape(-1, 3) for t in ('TR-0542', 'TR-0543')]
        yLa, yLb = float(legs[0][:, 1].max()), float(legs[1][:, 1].min())     # the inside legs' inner edges: the cap's nose and the baseboard run between them
        curb = float(f(np.array([FLOOR + .005]))[0])                   # the finished floor (5.575) + the curb: the foot of the frame
        holes = [(ro[0], ro[1], curb, head)]
        # the curb: a cap on top, from the door's frame to a nose past the baseboard; the faces come from fill() below
        xF = -40.0663
        fr = [e for e in elem_leaf(g, DOOR) if not e['leaf'] and e['mat'] == 'window-frame']
        if fr: xF = float(max(e['B'][..., 0].max() for e in fr))
        capT = .0625; nose = .11
        for P, N in boxq(xF, X_IN, yA, yB, curb - capT, curb, skip=('-z', '-x', '+x')) + boxq(X_IN, X_IN + nose, yLa, yLb, curb - capT, curb, skip=('-x',)):
            A.add('trim', 'L2', TRIM, EL + '-CAP', P, N)
        # the sill under the leaves, on top of the curb, out to the siding's face (the door as built has the floor's own strip there)
        for P, N in boxq(X_OUT - .02, xF, yA, yB, curb - capT, curb, skip=('-z', '+x')):
            A.add('openings', 'L2', 'window-frame', EL + '-SILL', P, N)
        rep['door'] = dict(curb_in=round((curb - FLOOR - .005) * 12, 2), head_in=round((head - FLOOR) * 12, 2), leaf_h_in=round((float(f(np.array([13.3617]))[0]) - float(f(np.array([FLOOR]))[0])) * 12, 2))
        hide = [DOOR] + CASING
        entry['keepLeaves'] = [DOOR]
        entry['leafMap'] = {'id': DOOR, 'z0': FLOOR, 'lo': LO, 'hi': HI, 'a': a, 'b': b}
        entry['door'] = {'id': DOOR, 'sill': round(curb, 4), 'head': round(head, 4)}

    def fill(mat, x, region, n):
        T = [Polygon(P[:, [1, 2]]) for e in elem('W-L2-022') + elem('W-L2-023') if e['mat'] == mat for P in e['B'] if np.all(np.abs(P[:, 0] - x) < .006)]
        alt = lambda t: 2 * t.area / max(np.hypot(*np.diff(np.array(t.exterior.coords), axis=0).T))
        U = unary_union([t.buffer(2e-4) for t in T if t.area > 1e-9 and alt(t) > .03]).buffer(-6e-4)
        x = x + .004 * n[0]
        F = region.difference(U)
        for (ya, yb, za, zb) in holes: F = F.difference(box(ya, za, yb, zb))
        out = 0
        cov = []
        for (grp_, st_, mat_), d in A.m.items():
            if mat_ not in (TRIM, 'hardie-trim#paint-ext-trim'): continue
            for P in np.concatenate(d['P']):
                if np.all(np.abs(P[:, 0] - (x - .004 * n[0])) < .012) and Polygon(P[:, [1, 2]]).area > 1e-7: cov.append(Polygon(P[:, [1, 2]]).buffer(1e-4))
        if n[0] > 0: cov.append(box(-24.8, 5.0, -10.7, 6.0075))                   # the baseboard inside
        elif W_: cov.append(box(-24.8, 5.0, -10.7, 8.0557))                      # outside, the roof against the wall
        else: cov.append(box(-24.8, 5.0, -10.7, 5.565))                         # outside, the deck against the wall
        C = unary_union(cov)
        # r52: two narrow rings round what covers the face (1 1/2 in and 4 in out), so the dark of a covered vertex fades within an inch or two,
        # as the baked atlas does beside it (it used to run on to the next 6 in grid line: a dark band over the baseboard that stopped at the patch's ends)
        C1, C2 = C.buffer(.125, join_style=2), C.buffer(.34, join_style=2)
        pieces_ = [F.intersection(C), F.intersection(C1).difference(C), F.intersection(C2).difference(C1), F.difference(C2)]
        cells = [q.intersection(box(y, z, y + .5, z + .5)) for q in pieces_ for y in np.arange(-23.0, -12.0, .5) for z in np.arange(5.0, 14.5, .5)]
        for poly in [q for c in cells for q in getattr(c, 'geoms', [c]) if q.geom_type == 'Polygon']:
            if poly.area < 1e-5: continue
            for t in shapely.constrained_delaunay_triangles(poly).geoms:
                c = np.array(t.exterior.coords)[:3]
                if Polygon(c).area < 1e-9: continue
                P, N = np.array([[x, a_, b_] for a_, b_ in c]), np.tile(np.asarray(n, float), (3, 1))
                if np.dot(np.cross(P[1] - P[0], P[2] - P[0]), n) < 0: P = P[[0, 2, 1]]
                A.add('walls', 'L2', mat, EL + '-WALL', P[None], N[None]); out += Polygon(c).area
        return round(out, 3)
    if W_:
        rep['siding_ft2'] = fill(SIDING, X_OUT, box(-22.75, 5.345, -12.65, 14.0), [-1, 0, 0])
        rep['paint_ft2'] = fill(PAINT, X_IN, box(-22.60, 5.51, -12.80, 14.10), [1, 0, 0])
    else:
        rep['siding_ft2'] = fill(SIDING, X_OUT, box(-22.20, 5.345, -13.20, 14.0), [-1, 0, 0])      # the opening and what the casings covered
        rep['paint_ft2'] = fill(PAINT, X_IN, box(-22.60, 5.51, -12.80, 14.10), [1, 0, 0])
    if W_:
        for (ya, yb, za, zb) in holes:
            for P, N in [NB.quad([X_IN, ya, za], [X_OUT, ya, za], [X_OUT, ya, zb], [X_IN, ya, zb], [0, 1, 0]),
                         NB.quad([X_IN, yb, za], [X_OUT, yb, za], [X_OUT, yb, zb], [X_IN, yb, zb], [0, -1, 0]),
                         NB.quad([X_IN, ya, za], [X_OUT, ya, za], [X_OUT, yb, za], [X_IN, yb, za], [0, 0, 1]),
                         NB.quad([X_IN, ya, zb], [X_OUT, ya, zb], [X_OUT, yb, zb], [X_IN, yb, zb], [0, 0, -1])]:
                A.add('walls', 'L2', STUD, EL + '-WALL', P, N)
    # the baseboard, run through (across the curb's face for the doors): the profile of TR-0275
    bL = elem('TR-0275')[0]['B'].reshape(-1, 3); bR = elem('TR-0276')[0]['B'].reshape(-1, 3)
    y0b, y1b = float(bL[:, 1].max()) - .005, float(bR[:, 1].min())
    if not W_: y0b, y1b = yLa, yLb
    prof = [(-39.7955, 5.57), (-39.7486, 5.57), (-39.7486, 5.9554), (-39.7434, 5.9683), (-39.733, 5.9783), (-39.7278, 5.9983), (-39.733, 6.0029), (-39.7382, 6.0075), (-39.7955, 6.0075)]
    for (xa, za), (xb, zb) in zip(prof[:-1], prof[1:]):
        n = np.array([zb - za, 0, -(xb - xa)]); n = n / np.linalg.norm(n)
        if n[2] < -.5: continue
        P, N = NB.quad([xa, y0b, za], [xb, y0b, zb], [xb, y1b, zb], [xa, y1b, za], n)
        A.add('trim', 'L2', TRIM, EL + '-BASE', P, N)

    if W_:   # the roof carried across, exactly as r51
        parts, cover = NB.roof_gap(g)
        top = lambda x: 18.14525 + .004 + .25 * x; und = lambda x: 17.89525 - .004 + .25 * x
        parts = [p.buffer(.004, join_style=2).intersection(box(-46.40, -22.80, -40.358, -12.60)) for p in parts]
        nt = np.array([-.25, 0, 1.0]); nt /= np.linalg.norm(nt); area = 0
        for poly in parts:
            area += poly.area
            for t in shapely.constrained_delaunay_triangles(poly).geoms:
                c = np.array(t.exterior.coords)[:3]
                if Polygon(c).area < 1e-8: continue
                P = np.array([[x, y, top(x)] for x, y in c]); U = np.array([[x, y, und(x)] for x, y in c])
                if np.dot(np.cross(P[1] - P[0], P[2] - P[0]), nt) < 0: P = P[[0, 2, 1]]; U = U[[0, 2, 1]]
                A.add('roofs', 'L1', SHINGLE, EL + '-ROOF', P[None], np.tile(nt, (1, 3, 1)))
                A.add('roofs', 'L1', SOFFIT, EL + '-ROOF', U[None][:, [0, 2, 1]], np.tile(-nt, (1, 3, 1)))
        rep['roof_ft2'] = round(area, 3)

    # ------------------------------------------------------------------ GLB (as r51)
    J = {'asset': {'version': '2.0', 'generator': 'tour/bim2/tools/wallopts52.py (r52)'}, 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
         'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': [{'byteLength': 0}]}
    bin_ = bytearray(); mats = {}
    def view(arr, target):
        while len(bin_) % 4: bin_.append(0)
        o = len(bin_); bb = np.ascontiguousarray(arr).tobytes(); bin_.extend(bb)
        J['bufferViews'].append({'buffer': 0, 'byteOffset': o, 'byteLength': len(bb), 'target': target}); return len(J['bufferViews']) - 1
    for (group, storey, mat), d in sorted(A.m.items(), key=lambda kv: tuple(str(x) for x in kv[0])):
        Pb = np.concatenate(d['P']).reshape(-1, 3); Nb = np.concatenate(d['N']).reshape(-1, 3)
        Nb = Nb / np.maximum(np.linalg.norm(Nb, axis=1, keepdims=True), 1e-12)
        Pw = Pb[:, [1, 2, 0]].astype(np.float32); Nw = Nb[:, [1, 2, 0]].astype(np.float32)
        U = D46.uv_box(Pw, Nw).astype(np.float32)
        kk = np.round(np.concatenate([Pw, Nw * 8], 1), 4)
        _, first, inv = np.unique(kk, axis=0, return_index=True, return_inverse=True)
        Pw, Nw, U, I = Pw[first], Nw[first], U[first], inv.reshape(-1).astype(np.uint32)
        if mat not in mats:
            J['materials'].append({'name': mat, 'extras': {'bim2Material': mat}, 'pbrMetallicRoughness': {'roughnessFactor': .8, 'metallicFactor': 0}}); mats[mat] = len(J['materials']) - 1
        acc = []
        for arr, typ, ct, tg in ((Pw, 'VEC3', 5126, 34962), (Nw, 'VEC3', 5126, 34962), (U, 'VEC2', 5126, 34962), (I, 'SCALAR', 5125, 34963)):
            ac = {'bufferView': view(arr, tg), 'componentType': ct, 'count': int(len(arr)), 'type': typ}
            if typ == 'VEC3' and len(acc) == 0: ac['min'] = [float(v) for v in Pw.min(0)]; ac['max'] = [float(v) for v in Pw.max(0)]
            J['accessors'].append(ac); acc.append(len(J['accessors']) - 1)
        name = '%s|%s|%s' % (group, storey or '-', mat); ex = {'group': group, 'storey': storey, 'material': mat}
        J['meshes'].append({'name': name, 'extras': dict(ex, ranges=d['ranges'], overlay=V['id']),
                            'primitives': [{'attributes': {'POSITION': acc[0], 'NORMAL': acc[1], 'TEXCOORD_0': acc[2]}, 'indices': acc[3], 'material': mats[mat], 'mode': 4}]})
        J['nodes'].append({'name': name, 'extras': dict(ex, overlay=V['id']), 'mesh': len(J['meshes']) - 1}); J['scenes'][0]['nodes'].append(len(J['nodes']) - 1)
    while len(bin_) % 4: bin_.append(0)
    J['buffers'][0]['byteLength'] = len(bin_)
    js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    glb = bytearray(b'glTF') + struct.pack('<II', 2, 0) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(bin_)) + b'BIN\x00' + bin_
    struct.pack_into('<I', glb, 8, len(glb))
    open(os.path.join(B2, V['glb']), 'wb').write(glb)
    sha = hashlib.sha256(glb).hexdigest()

    entry.update({'sha256': sha, 'bytes': len(glb), 'hide': hide})
    if W_:
        entry.update({'colliders': [{'id': EL + '-WALL#0', 'element': EL + '-WALL', 'kind': 'WALL', 'poly': [[X_OUT, yA], [X_IN, yA], [X_IN, yB], [X_OUT, yB]], 'z0': 5.34, 'z1': zHead, 'storey': 'L2', 'exterior': True}],
                      'floorsOff': ['SL-DK-BALC'], 'aoPatch': V['id'], 'clearBox': [-46.4, -40.15, -22.8, -12.6, 5.3, 12.6],
                      'windows': [{'id': EL + '-WN', 'center': [round(X_OUT + (X_IN - X_OUT) / 2, 4), round(mid, 4)], 'width': round(gw, 4), 'units': 3, 'sill': sill, 'head': round(head, 4),
                                   'normal': [-1, 0], 'axis': [0, 1], 'thickness': round(X_IN - X_OUT, 4), 'like': NB.SRC_WIN}],
                      'note': 'r52: as nobalcony51, the group of three casements %.3f ft rough overall, sill %.3f, head %.3f (the door opening\'s head), 2 x 3 lites a sash.' % (gw, sill, head)})
    else:
        entry.update({'colliders': [], 'floorsOff': [], 'aoPatch': V['id'], 'aoBox': [X_OUT - 1.0, X_IN + 1.0, yA - 1.0, yB + 1.0, 5.3, 14.2],
                      'note': 'r52: the stacking doors on a %.1f in curb, head %.1f in above the floor (%.3f); the wall above and the curb below; the balcony as built.' % (V['curb_in'], V['head_in'], head)})
    meta['overlays'] = [o for o in meta.get('overlays', []) if o.get('id') != V['id']] + [entry]
    open(os.path.join(B2, 'scene.meta.json'), 'w').write(json.dumps(meta, separators=(',', ':'), ensure_ascii=False))
    rep.update({'glb': V['glb'], 'bytes': len(glb), 'sha256': sha[:12], 'meshes': len(J['meshes']), 'tris': int(sum(d['n'] for d in A.m.values()))})
    print(json.dumps(rep))


if __name__ == '__main__':
    for k in ([a for a in sys.argv[1:] if a in VARIANTS] or list(VARIANTS)): build(k)
