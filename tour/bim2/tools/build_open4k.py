#!/usr/bin/env python3
"""Concept r44 "Open kitchen and great room" (option OS-REMODEL-open4k, legacyId open4k): the owner's pick, "1-open B-flip".

The whole original gable (31 ft 4 x 27 ft 3 inside) becomes one vaulted great room under a clear-span ridge beam:
  - living at the street end: a gas hearth centred on the street gable under the ridge, two matching windows either side of it,
    two 8-ft sofas facing each other across a coffee table;
  - an L-shaped kitchen at the west end: range on the north wall between two counter-height windows, a tall wall of pantry, ovens and
    fridge on the west gable wall, an 8-ft island with the sink and four stools;
  - dining between them: a table for eight (ten with leaves) on the kitchen's axis, a sideboard on the west wall;
  - 14-ft folding glass doors on the south wall, centred on the table, onto the porch and about 9 ft of new deck; the east part of the
    old picture window stays as fixed glass;
  - outside the gable: the back bedroom keeps one closet, the other closet becomes its vestibule; a 3/4 bath across the north end of the
    old living room with its shower in the old laundry closet; a short hall with a stacked washer and dryer; the rest of the old living
    room is a library that you pass through on arrival, entering the great room at its south-west corner.

Illustrative idea. Not designed or reviewed by an architect or engineer. See tour/CONCEPT-4BR.md.
Run: python3 tour/bim2/tools/build_open4k.py   (needs numpy, shapely >= 2.1; reads build_open4.py's helpers)
"""
import hashlib, json, math, os, sys
import numpy as np
import shapely
from shapely.geometry import Polygon, box as sbox
from shapely.ops import unary_union
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_open4 as B
from build_open4 import (ceil_z, RIDGE_Y, APEX, PITCH, C_S, C_N, X_E, Y_S, Y_N, X_EO, GREAT, LABEL, PAINT, TRIM_EXT, Out, read_glb, element_tris, plane_face, prism_sides, union_faces, fill_holes, mitre)

B2 = B.B2
OPT_ID, LEGACY = 'OS-REMODEL-open4k', 'open4k'
GLB_OUT, META_OUT = 'scene.opt-%s.glb' % OPT_ID, 'scene.opt-%s.meta.json' % OPT_ID
X_LW, X_WW = 5.2776, 4.9024          # the west gable wall: room face, living-room / bedroom face
Y_SO, Y_NO = 4.404, 32.487           # south and north walls, outer faces
BOX = [(X_LW, Y_S), (X_E, Y_S), (X_E, Y_N), (X_LW, Y_N)]
ROOM2 = BOX; SKY = []                # names the drawing tools read
KB_W, KB_D = 0.5625, 2.0             # ridge beam as drawn: 6-3/4 x 24 in, a 31-ft clear span (an engineer sizes it); no post
KB_Y0, KB_Y1, KB_Z0 = RIDGE_Y - KB_W / 2, RIDGE_Y + KB_W / 2, APEX - KB_D
POST = (X_LW, X_LW, KB_Y0, KB_Y1)    # no post (kept for the drawing tools)
DECK = dict(x0=15.675, x1=24.6, y0=-4.0, z=0.0, skirt=-4.8)
STAIR_Y = (-9.937, 0.0)
FOLD = dict(x0=8.7, x1=22.9, head=7.6, panels=6)                     # folding glass doors, stacking at the west jamb
FIXW = dict(x0=23.7, x1=32.4895, sill=1.6833, head=7.6)             # the east part of the old picture window, fixed glass
NWIN = [(11.2, 2.6, 3.5, 6.9), (19.6, 2.6, 3.5, 6.9), (30.5, 5.0, 2.7, 7.0)]   # north wall windows: centre x, width, sill, head
EWIN = [(12.5, 4.2, 2.6875, 7.0), (24.4, 4.2, 2.6875, 7.0)]         # street gable windows either side of the hearth: centre y, width, sill, head
FP = dict(cy=RIDGE_Y, w=6.0, d=1.0, box=(4.5, 1.5, 3.0), mantel=4.25)
PASS = (5.2, 9.0, 7.6)               # the way in from the library through the west gable wall: y0, y1, head
DOOR_H = 6.7812
REMOVED_SPACES = ['SP-L1-BED2', 'SP-L1-BED2-CLOSET', 'SP-L1-BED3', 'SP-L1-BED3-CLOSET', 'SP-L1-KITCHEN']
REMOVED_WALLS = ['W-L1-%03d' % i for i in (5, 7, 8, 9, 10, 13, 14, 15, 16, 18, 19, 33, 34, 37, 41, 42, 43, 44, 45, 46, 47, 48)]
REBUILT = ['W-L1-002', 'W-L1-020', 'W-L1-021', 'W-L1-049', 'W-L1-050', 'W-L1-051', 'SL-DK-FRONT', 'ST-FRONT', 'RL-FRONT-STAIR', 'RL-FRONT-DECK']
REMOVED_OPENINGS = ['D-L1-%02d' % i for i in range(1, 14)] + ['WN-L1-%02d' % i for i in (2, 3, 4, 5, 7, 8, 9, 11)]
REMOVED_MISC = ['FX-JLH-L1-BED2', 'FX-JLH-L1-BED3', 'FX-JLH-L1-HALL', 'SL-L1-STORE-BED2'] + [p + s for p in ('CL-SP-L1-', 'FL-SP-L1-') for s in ('GREAT', 'BED2', 'BED2-CLOSET', 'BED3', 'BED3-CLOSET', 'KITCHEN', 'HALL', 'BATH')]
OLD_WIN = {'WN-L1-02': (1, 9.49, 5.98, 3.32, 7.3, 4.6), 'WN-L1-03': (1, 25.36, 14.25, 1.68, 7.6, 4.6), 'WN-L1-08': (1, 18.964, 6.27, 1.65, 6.67, 32.29), 'WN-L1-09': (1, 12.25, 1.42, 3.42, 6.25, 32.29),
           'WN-L1-11': (1, 7.9, 5.0, 5.73, 7.23, 32.29), 'WN-L1-04': (0, 13.57, 6.27, 1.48, 6.5, 36.79), 'WN-L1-05': (0, 21.02, 3.81, 2.69, 7.0, 36.79), 'WN-L1-07': (0, 26.83, 3.81, 2.69, 7.0, 36.79)}   # plane axis, centre, width, sill, head, plane
zl = lambda x: 10.2201 + 0.2548 * x if x <= -2.28 else 9.0527 - 0.2572 * x        # old living room ceiling (ridge runs north-south)
zw = lambda y: 6.0299 + 0.41 * y if y < 15.7375 else 18.9347 - 0.41 * y           # back-bedroom wing ceiling
zg = lambda y: ceil_z(y) + 0.164                                                  # top of the west gable wall (under the roof deck)

def build():
    J, meshes = read_glb(os.path.join(B2, 'scene.glb')); meta = json.load(open(os.path.join(B2, 'scene.meta.json')))
    E = element_tris(meshes); O = Out(); rep = {}; hide_ranges = []; colliders = []
    bnd = meta['boundaries'] if isinstance(meta['boundaries'], dict) else {b['id']: b['space'] for b in meta['boundaries']}
    bbox = {el: (np.concatenate([t['v'] for t in ts]).min(0), np.concatenate([t['v'] for t in ts]).max(0)) for el, ts in E.items()}
    # ---- trims that go: everything inside the gable box, those on the removed walls outside it, those of the removed windows
    gone_fp = unary_union([sbox(-6.65, 14.27, 4.95, 14.75), sbox(-6.47, 16.69, 4.95, 17.16), sbox(4.85, 4.35, 5.33, 14.56), sbox(4.85, 22.17, 5.33, 25.61)]).buffer(0.3)
    trims = []
    for el, (lo, hi) in bbox.items():
        if not el.startswith('TR-') or hi[2] < -0.5 or lo[2] > 14: continue
        c = (lo + hi) / 2
        if X_LW + 0.02 < c[0] < X_E - 0.02 and Y_S + 0.02 < c[1] < Y_N - 0.02: trims.append(el); continue
        if gone_fp.contains(shapely.Point(c[0], c[1])) and c[2] < 9: trims.append(el); continue
        for ax, cc, w, s, h, pl in OLD_WIN.values():
            if abs(c[ax] - pl) < 0.9 and abs(c[1 - ax] - cc) < w / 2 + 0.7 and s - 0.7 < c[2] < h + 0.7: trims.append(el); break
    hide = sorted(set(REMOVED_WALLS + REBUILT + REMOVED_OPENINGS + REMOVED_MISC + trims) & set(E)); rep['trims_hidden'] = len(trims)

    def quad(el, grp, st, mat, q, n):
        O.tri(grp, st, mat, el, None, [q[0], q[1], q[2]], n); O.tri(grp, st, mat, el, None, [q[0], q[2], q[3]], n)
    def boxel(el, grp, st, mat, x0, y0, z0, x1, y1, z1, faces='xXyYzZ'):
        Q = {'x': ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)), 'X': ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
             'y': ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)), 'Y': ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
             'z': ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)), 'Z': ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1))}
        for f in faces: quad(el, grp, st, mat, *Q[f])
    def wall_box(el, x0, y0, x1, y1, z0, top, mat=PAINT, faces='xXyY', mats=None):
        """a wall piece whose top follows the ceiling: top(x, y) -> z. mats: per-face material override"""
        mats = mats or {}
        for f, (a, b_, fixed, nrm) in {'x': (y0, y1, x0, (-1, 0, 0)), 'X': (y0, y1, x1, (1, 0, 0)), 'y': (x0, x1, y0, (0, -1, 0)), 'Y': (x0, x1, y1, (0, 1, 0))}.items():
            if f not in faces: continue
            n = max(1, int(math.ceil((b_ - a) / 0.8))); us = [a + (b_ - a) * i / n for i in range(n + 1)]
            to3 = (lambda u, z, fx=fixed: (fx, u, z)) if f in 'xX' else (lambda u, z, fy=fixed: (u, fy, z))
            tz = [top(fixed, u) if f in 'xX' else top(u, fixed) for u in us]
            if min(tz) <= z0 + 1e-3: continue
            plane_face(O, el, None, 'walls', 'L1', mats.get(f, mat), Polygon([(us[0], z0), (us[-1], z0)] + [(u, z) for u, z in zip(us[::-1], tz[::-1])]), to3, nrm)
        if z0 > 0.01: boxel(el, 'walls', 'L1', mat, x0, y0, z0, x1, y1, z0 + 0.001, faces='z')
    def wall_run(el, axis, c0, c1, a0, a1, top, openings=(), mat=PAINT, collide=True):
        """an axis-aligned partition: axis 'x' runs east-west from a0 to a1 with its faces at y = c0, c1; openings = [(u0, u1, head)]"""
        cuts = sorted(openings); segs = []; u = a0
        for (u0, u1, hd) in cuts:
            if u0 > u + 1e-3: segs.append((u, u0, 0.0))
            segs.append((u0, u1, hd)); u = u1
        if a1 > u + 1e-3: segs.append((u, a1, 0.0))
        for k, (s0, s1, z0) in enumerate(segs):
            r = (s0, c0, s1, c1) if axis == 'x' else (c0, s0, c1, s1)
            ends = ('xX' if axis == 'x' else 'yY'); side = ('yY' if axis == 'x' else 'xX')
            wall_box(el, r[0], r[1], r[2], r[3], z0, top, mat, faces=side + ends)
            if z0 == 0.0 and collide: colliders.append({'id': '%s#%d' % (el, len([c for c in colliders if c['element'] == el])), 'element': el, 'kind': 'WALL', 'poly': [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], 'z0': 0, 'z1': 8.0, 'storey': 'L1', 'exterior': False})
    def window(el, axis, u0, u1, z0, z1, inner, outer, sign_out):
        """a fixed window in a rebuilt wall: black frame, glass, exterior trim. axis 1: wall plane y = const; sign_out: outward normal sign"""
        mid = (inner + outer) / 2; to3 = (lambda v: (lambda u, z: (u, v, z))) if axis == 1 else (lambda v: (lambda u, z: (v, u, z)))
        nrm = (lambda s: (0, s, 0)) if axis == 1 else (lambda s: (s, 0, 0))
        ro = sbox(u0, z0, u1, z1); ring = ro.difference(mitre(ro, -0.16)); glass = mitre(ro, -0.16)
        cen = to3(mid)((u0 + u1) / 2, (z0 + z1) / 2)
        for pl, s in ((mid - 0.1 * sign_out, -sign_out), (mid + 0.1 * sign_out, sign_out)): plane_face(O, el, None, 'openings', 'L1', 'window-frame', ring, to3(pl), nrm(s))
        prism_sides(O, el, None, 'openings', 'L1', 'window-frame', glass.exterior, to3(mid - 0.1 * sign_out), to3(mid + 0.1 * sign_out), inward_center=cen, outward=False)
        plane_face(O, el, None, 'glass', 'L1', 'glass', glass, to3(mid - 0.01), nrm(-sign_out)); plane_face(O, el, None, 'glass', 'L1', 'glass', glass, to3(mid + 0.01), nrm(sign_out))
        tr = mitre(ro, B.TRIM_W).difference(ro); po = outer + B.TRIM_T * sign_out
        plane_face(O, el, None, 'trim', '-', TRIM_EXT, tr, to3(po), nrm(sign_out))
        prism_sides(O, el, None, 'trim', '-', TRIM_EXT, mitre(ro, B.TRIM_W).exterior, to3(outer), to3(po), inward_center=to3(po)((u0 + u1) / 2, (z0 + z1) / 2))
    def ext_wall(els, dst, axis, inner, outer, sign_in, face, fills, cuts):
        """an exterior wall re-made: its room face new (face less the cuts), its siding with the old window holes filled and the new
        ones cut, everything else as built. axis: the plane's axis (1: y = const). fills / cuts: rectangles in (along, z)"""
        ua = 1 - axis; T = sum((E[e] for e in els if e in E), []); lo, hi = min(inner, outer), max(inner, outer)
        cutu = unary_union(cuts) if cuts else Polygon(); groups = {}; to3 = (lambda v: (lambda u, z: (u, v, z))) if axis == 1 else (lambda v: (lambda u, z: (v, u, z)))
        nin = [0, 0, 0]; nin[axis] = sign_in
        for t in T:
            c = t['v'].mean(0); n = t['n']; pc = c[axis]
            if n[axis] * sign_in > 0.9 and abs(pc - inner) < 0.07 and t['v'][:, 2].min() > -0.07 and face.buffer(0.2).contains(shapely.Point(c[ua], c[2])): continue
            if n[axis] * sign_in < -0.9 and abs(pc - outer) < 0.25 and t['material'].startswith('hardie'): groups.setdefault((t['material'], round(float(pc), 2)), []).append(t); continue
            if lo + 0.02 < pc < hi - 0.02 and (any(r.buffer(0.15).contains(shapely.Point(c[ua], c[2])) for r in fills) or cutu.buffer(0.15).contains(shapely.Point(c[ua], c[2]))): continue
            O.tri(t['group'], t['storey'], t['material'], dst, t['boundary'] and ('B5-' + t['boundary']), t['v'], t['n'])
        plane_face(O, dst, 'B-B5-' + dst[-1] + 'I', 'walls', 'L1', PAINT, face.difference(cutu), to3(inner), tuple(nin))
        for (mat, pr), ts in groups.items():
            po = float(np.mean([p[axis] for t in ts for p in t['v']])); uu = union_faces(ts, ua, 2)
            uu = fill_holes(uu, only=[r.buffer(0.6) for r in fills]).difference(cutu)
            plane_face(O, dst, None, 'walls', 'L1', mat, uu, to3(po), tuple(-a for a in nin))
        for r in cuts:
            cen = to3((inner + outer) / 2)(r.centroid.x, r.centroid.y)
            prism_sides(O, dst, None, 'walls', 'L1', PAINT, r.exterior, to3(inner), to3((inner + outer) / 2), inward_center=cen, outward=False)
            prism_sides(O, dst, None, 'trim', '-', TRIM_EXT, r.exterior, to3((inner + outer) / 2), to3(outer), inward_center=cen, outward=False)
    rect = lambda c, w, s, h: sbox(c - w / 2, s, c + w / 2, h)
    oldr = lambda k, pad=0.35: rect(OLD_WIN[k][1], OLD_WIN[k][2] + 2 * pad, OLD_WIN[k][3] - pad, OLD_WIN[k][4] + pad)

    # ---- one oak floor and one vault over the whole gable box; the ridge beam, clear span
    room = Polygon(BOX); floor = unary_union([room, sbox(FOLD['x0'], Y_SO, FOLD['x1'], Y_S), sbox(X_WW, PASS[0], X_LW, PASS[1])])
    plane_face(O, 'FL-SP-L1-B5', None, 'floors', 'L1', 'oak-red-lauzon-vela', floor, lambda x, y: (x, y, 0.0), (0, 0, 1))
    plane_face(O, 'FL-SP-L1-B5', None, 'floors', 'L1', 'oak-red-lauzon-vela', floor, lambda x, y: (x, y, -0.062), (0, 0, -1))
    strips = unary_union([sbox(-6.6, 14.32, X_WW, 14.70), sbox(-6.42, 16.74, X_WW, 17.11), sbox(X_WW, 9.0, X_LW, 14.51), sbox(X_WW, 22.22, X_LW, 25.5555), sbox(X_WW, 4.404, X_LW, PASS[0])])
    plane_face(O, 'FL-B5-PATCH', None, 'floors', 'L1', 'oak-red-lauzon-vela', strips, lambda x, y: (x, y, 0.0), (0, 0, 1))
    for part, nrm in ((room.intersection(sbox(0, 0, 60, RIDGE_Y)), (0, PITCH, -1)), (room.intersection(sbox(0, RIDGE_Y, 60, 60)), (0, -PITCH, -1))):
        plane_face(O, 'CL-SP-L1-B5', None, 'ceilings', 'L1', 'gwb-l5#paint-ceiling-flat', part, lambda x, y: (x, y, ceil_z(y)), nrm)
        plane_face(O, 'CL-SP-L1-B5', None, 'ceilings', 'L1', 'gwb-l5#paint-ceiling-flat', part, lambda x, y: (x, y, ceil_z(y) + 0.042), tuple(-a for a in nrm))
    sec = Polygon([(KB_Y0, KB_Z0), (KB_Y1, KB_Z0), (KB_Y1, ceil_z(KB_Y1) - 0.004), (RIDGE_Y, APEX - 0.004), (KB_Y0, ceil_z(KB_Y0) - 0.004)])
    prism_sides(O, 'BM-L1-B5', None, 'ceilings', 'L1', 'fir-beam', sec.exterior, lambda y, z: (X_LW + 0.002, y, z), lambda y, z: (X_E - 0.002, y, z), inward_center=(20, RIDGE_Y, APEX - KB_D / 2))
    # bath and shower floors: tile over the old oak
    tile = unary_union([sbox(-9.53, 9.59, -1.29, 14.32), sbox(-9.53, 14.32, -6.79, 18.42), sbox(-9.14, 14.32, -6.8, 14.70)])
    plane_face(O, 'FL-B5-BATH', None, 'floors', 'L1', 'stone-tile-24', tile, lambda x, y: (x, y, 0.014), (0, 0, 1))

    # ---- the south wall: folding glass doors centred on the table, the east part of the picture window kept as fixed glass
    fold = sbox(FOLD['x0'], 0.0, FOLD['x1'], FOLD['head']); fixw = sbox(FIXW['x0'], FIXW['sill'], FIXW['x1'], FIXW['head'])
    ext_wall(['W-L1-002'], 'W-L1-B5S', 1, Y_S, Y_SO, 1, sbox(X_LW, 0, 32.4895, ceil_z(Y_S)), [oldr('WN-L1-02'), oldr('WN-L1-03')], [fold, fixw])
    window('WN-L1-B5S', 1, FIXW['x0'], FIXW['x1'], FIXW['sill'], FIXW['head'], Y_S, Y_SO, -1)
    plane_face(O, 'D-L1-B5F', None, 'openings', 'L1', 'steel-black', sbox(FOLD['x0'], 4.45, FOLD['x1'], 4.75), lambda x, y: (x, y, 0.012), (0, 0, 1))   # threshold track
    colliders += [{'id': 'W-L1-B5S#%d' % i, 'element': 'W-L1-B5S', 'kind': 'WALL', 'poly': [[a, 4.40], [b_, 4.40], [b_, 4.81], [a, 4.81]], 'z0': -5.2, 'z1': 8.16, 'storey': 'L1', 'exterior': True} for i, (a, b_) in enumerate(((4.9, FOLD['x0']), (FOLD['x1'], 32.49)))]
    # ---- the north wall: the old bedroom and bath windows go; two counter-height kitchen windows and one in the living area
    ncuts = [rect(c, w, s, h) for c, w, s, h in NWIN]
    ext_wall(['W-L1-020', 'W-L1-021'], 'W-L1-B5N', 1, Y_N, Y_NO, -1, sbox(5.2176, 0, X_E, ceil_z(Y_N)), [oldr('WN-L1-08'), oldr('WN-L1-09'), oldr('WN-L1-11')], ncuts)
    for i, (c, w, s, h) in enumerate(NWIN): window('WN-L1-B5N%d' % (i + 1), 1, c - w / 2, c + w / 2, s, h, Y_N, Y_NO, 1)
    # ---- the street gable: the three low windows go; two matching windows either side of the hearth
    ecuts = [rect(c, w, s, h) for c, w, s, h in EWIN]
    eface = Polygon([(Y_S, 0), (Y_N, 0), (Y_N, ceil_z(Y_N)), (RIDGE_Y, APEX), (Y_S, ceil_z(Y_S))])
    ext_wall(['W-L1-049', 'W-L1-050', 'W-L1-051'], 'W-L1-B5E', 0, X_E, X_EO, -1, eface, [oldr('WN-L1-04'), oldr('WN-L1-05'), oldr('WN-L1-07')], ecuts)
    for i, (c, w, s, h) in enumerate(EWIN): window('WN-L1-B5E%d' % (i + 1), 0, c - w / 2, c + w / 2, s, h, X_E, X_EO, 1)
    # ---- the west side of the box north of the bedroom (the old bath's tiled walls): repainted to the vault
    for el in ('W-L1-032', 'W-L1-038'):
        xs = []
        for t in E.get(el, []):
            if t['boundary'] and bnd.get(t['boundary']) == 'SP-L1-BATH':
                if [el, t['boundary']] not in hide_ranges: hide_ranges.append([el, t['boundary']])
                if t['n'][0] > 0.9: xs.append(t['v'][:, 0].mean())
        if xs:
            lo, hi = bbox[el]; y0, y1 = max(lo[1], 25.5555), min(hi[1], Y_N); x = float(np.median(xs))
            plane_face(O, 'W-L1-B5P', None, 'walls', 'L1', PAINT, Polygon([(y0, 0), (y1, 0), (y1, ceil_z(y1)), (y0, ceil_z(y0))]), lambda y, z, x=x: (x + 0.014, y, z), (1, 0, 0))   # a hair proud of the old wall's studs, which show above the old 8-ft ceiling
    plane_face(O, 'W-L1-B5P', None, 'walls', 'L1', PAINT, Polygon([(22.0293, 0), (22.22, 0), (22.22, ceil_z(22.22)), (22.0293, ceil_z(22.0293))]), lambda y, z: (X_LW, y, z), (1, 0, 0))

    # ---- the west gable wall: the two old doors close up; a 3 ft 10 way in from the library at its south end
    wall_run('W-L1-B5W', 'y', X_WW, X_LW, 4.404, 14.51, lambda x, y: zg(y), openings=[(PASS[0], PASS[1], PASS[2])])
    wall_run('W-L1-B5V', 'y', X_WW, X_LW, 22.22, 25.5555, lambda x, y: zg(y))
    ext = Polygon([(22.4, 9.08), (25.37, 9.08), (25.37, zg(25.37) - 0.03), (22.4, zg(22.4) - 0.03)])
    plane_face(O, 'W-L1-B5V', None, 'walls', 'L1', 'hardie-lap#paint-ext-body', ext, lambda y, z: (X_WW - 0.004, y, z), (-1, 0, 0))   # above the wing roof it is an outside wall
    # ---- outside the gable: library, hall, bath, vestibule, bedroom
    wall_run('W-L1-B5A', 'x', 9.21, 9.59, -9.53, X_WW, lambda x, y: zl(x) + 0.03, openings=[(-0.7, 1.95, DOOR_H)])                     # library / bath and hall
    # the laundry closet in the hall's south-east corner: stacked washer and dryer behind a closed door, 36 in of hall left beside it
    wall_run('W-L1-B5L', 'x', 11.9, 12.2, 2.1, X_WW, lambda x, y: zl(x) + 0.03)
    wall_run('W-L1-B5M', 'y', 2.1, 2.25, 9.59, 11.9, lambda x, y: zl(x) + 0.03, openings=[(9.67, 11.82, DOOR_H)], collide=False)
    boxel('D-L1-B5L', 'openings', 'L1', 'door-panel-field', 2.14, 9.68, 0.04, 2.21, 11.81, DOOR_H - 0.03, faces='xXyYZ')
    boxel('D-L1-B5L', 'openings', 'L1', 'steel-black', 2.10, 9.86, 3.0, 2.14, 9.92, 3.45, faces='xyYzZ')
    colliders.append({'id': 'FX-B5-LAUNDRY#0', 'element': 'FX-B5-LAUNDRY', 'kind': 'WALL', 'poly': [[2.1, 9.59], [2.25, 9.59], [2.25, 11.9], [2.1, 11.9]], 'z0': 0, 'z1': 8.0, 'storey': 'L1', 'exterior': False})
    wall_run('W-L1-B5B', 'y', -1.29, -0.91, 9.59, 14.32, lambda x, y: zl(x) + 0.03, openings=[(9.95, 12.45, DOOR_H)])                  # bath / hall
    wall_run('W-L1-B5C', 'x', 14.32, 14.70, -6.6, X_WW, lambda x, y: max(zl(x), zw(14.7)) + 0.03, openings=[(0.1, 2.9, DOOR_H)])      # hall / vestibule and closet
    wall_run('W-L1-B5D', 'x', 16.78, 17.08, -6.41, X_WW, lambda x, y: zw(y) + 0.03, openings=[(-6.1, -0.7, DOOR_H), (0.27, 2.93, DOOR_H)])   # closet and vestibule / bedroom
    for i, (x0, x1, y) in enumerate(((-6.05, -3.35, 16.86), (-3.45, -0.75, 16.95))):          # the closet's two sliding doors
        boxel('D-L1-B5C', 'openings', 'L1', 'door-panel-field', x0, y - 0.04, 0.04, x1, y + 0.04, DOOR_H - 0.04, faces='xXyYZ')
    boxel('D-L1-B5B', 'openings', 'L1', 'door-panel-field', 2.85, 17.08, 0.04, 2.93, 19.66, DOOR_H - 0.04, faces='xXyYZ')            # the bedroom door, standing open
    # baseboards in the great room (square, as built height) where no cabinet or opening stands
    bb = E['TR-0201'][0]
    for i, (x0, y0, x1, y1) in enumerate(((X_LW, Y_S, FOLD['x0'], Y_S + 0.06), (FOLD['x1'], Y_S, X_E, Y_S + 0.06), (X_E - 0.06, Y_S, X_E, FP['cy'] - 3.0), (X_E - 0.06, FP['cy'] + 3.0, X_E, Y_N), (21.5, Y_N - 0.06, X_E, Y_N),
                                         (X_LW, 9.0, X_LW + 0.06, 11.0), (X_LW, 19.5, X_LW + 0.06, 21.0))):
        boxel('TR-B5-BB%d' % i, bb['group'], bb['storey'], bb['material'], x0, y0, 0.0, x1, y1, 0.44, faces='xXyYZ')

    # ---- the hearth on the street gable: plaster breast floor to vault, black firebox behind glass, fir mantel; vent cap outside
    fy0, fy1, fx = FP['cy'] - FP['w'] / 2, FP['cy'] + FP['w'] / 2, X_E - FP['d']; bw, bz0, bz1 = FP['box']; by0, by1 = FP['cy'] - bw / 2, FP['cy'] + bw / 2
    n = 12; ys = [fy0 + (fy1 - fy0) * i / n for i in range(n + 1)]
    front = Polygon([(fy0, 0), (fy1, 0)] + [(y, ceil_z(y) - 0.003) for y in ys[::-1]]).difference(sbox(by0, bz0, by1, bz1))
    plane_face(O, 'FP-L1-B5', None, 'walls', 'L1', PAINT, front, lambda y, z: (fx, y, z), (-1, 0, 0))
    for y, s in ((fy0, -1), (fy1, 1)): quad('FP-L1-B5', 'walls', 'L1', PAINT, [(fx, y, 0), (X_E, y, 0), (X_E, y, ceil_z(y) - 0.003), (fx, y, ceil_z(y) - 0.003)], (0, s, 0))
    inset = 0.75
    plane_face(O, 'FP-L1-B5', None, 'openings', 'L1', 'steel-black', sbox(by0, bz0, by1, bz1), lambda y, z: (fx + inset, y, z), (-1, 0, 0))
    prism_sides(O, 'FP-L1-B5', None, 'openings', 'L1', 'steel-black', sbox(by0, bz0, by1, bz1).exterior, lambda y, z: (fx, y, z), lambda y, z: (fx + inset, y, z), inward_center=(fx + .4, FP['cy'], (bz0 + bz1) / 2), outward=False)
    plane_face(O, 'FP-L1-B5', None, 'glass', 'L1', 'glass', sbox(by0 + .02, bz0 + .02, by1 - .02, bz1 - .02), lambda y, z: (fx + 0.06, y, z), (-1, 0, 0))
    plane_face(O, 'FP-L1-B5', None, 'openings', 'L1', 'steel-black', sbox(fx - 1.2, fy0 - 0.25, fx, fy1 + 0.25), lambda x, y: (x, y, 0.004), (0, 0, 1))   # hearth plate
    boxel('FP-L1-B5', 'ceilings', 'L1', 'fir-beam', fx - 0.55, fy0 - 0.3, FP['mantel'], fx, fy1 + 0.3, FP['mantel'] + 0.5, faces='xyYzZ')
    boxel('FP-L1-B5', 'trim', '-', 'steel-black', X_EO, FP['cy'] - 0.6, 5.0, X_EO + 0.35, FP['cy'] + 0.6, 6.2, faces='XyYzZ')
    colliders.append({'id': 'FP-L1-B5#0', 'element': 'FP-L1-B5', 'kind': 'WALL', 'poly': [[fx, fy0], [X_E, fy0], [X_E, fy1], [fx, fy1]], 'z0': 0, 'z1': 8.0, 'storey': 'L1', 'exterior': False})

    # ---- the deck: the porch deck carried about 9 ft east along the folding doors, the steps narrowed, cable rail on the new edges
    dk = E['SL-DK-FRONT']
    for t in dk:
        c = t['v'].mean(0)
        if abs(c[0] - DECK['x0']) < 0.08 and abs(t['n'][0]) > 0.9 and c[1] > DECK['y0'] - 0.1: continue
        O.tri(t['group'], t['storey'], t['material'], 'SL-DK-B5', None, t['v'], t['n'])
    top = [t for t in dk if t['n'][2] > 0.9]; deck_mat = top[0]['material']
    dpoly = unary_union([sbox(DECK['x0'], DECK['y0'], DECK['x1'], Y_SO), sbox(5.32, 3.95, DECK['x0'], Y_SO)])
    plane_face(O, 'SL-DK-B5', None, 'site', 'L1', deck_mat, dpoly, lambda x, y: (x, y, DECK['z']), (0, 0, 1))
    for a, b_ in (((DECK['x0'], DECK['y0']), (DECK['x1'], DECK['y0'])), ((DECK['x1'], DECK['y0']), (DECK['x1'], Y_SO))):
        q = [(a[0], a[1], DECK['z']), (b_[0], b_[1], DECK['z']), (b_[0], b_[1], DECK['skirt']), (a[0], a[1], DECK['skirt'])]
        nn = np.cross(np.subtract(q[1], q[0]), np.subtract(q[3], q[0])); nn = nn / np.linalg.norm(nn)
        if np.dot(nn, np.subtract((20, 0, -2), np.mean(q, 0))) > 0: nn = -nn
        quad('SL-DK-B5', 'site', 'L1', 'deck-skirt', q, nn)
    s0, s1 = STAIR_Y; sy = lambda y: s0 + (y - s0) * (DECK['y0'] - s0) / (s1 - s0)
    for t in E['ST-FRONT']: O.tri(t['group'], t['storey'], t['material'], 'ST-FRONT-B5', None, np.array([(p[0], sy(p[1]), p[2]) for p in t['v']]), t['n'])
    for t in E['RL-FRONT-STAIR']: O.tri(t['group'], t['storey'], t['material'], 'RL-FRONT-STAIR-B5', None, np.array([(p[0], p[1] + DECK['y0'], p[2]) for p in t['v']]), t['n'])
    R = E['RL-FRONT-DECK']; RV = np.concatenate([t['v'] for t in R]); ry0, ry1 = RV[:, 1].min(), RV[:, 1].max(); rx = (RV[:, 0].min() + RV[:, 0].max()) / 2; L = ry1 - ry0
    def rail_run(el, a, b_):
        dx, dy = b_[0] - a[0], b_[1] - a[1]; Ln = math.hypot(dx, dy); k_ = max(1, round(Ln / L)); ang = math.atan2(dy, dx) - math.pi / 2; ca, sa = math.cos(ang), math.sin(ang)
        for k in range(k_):
            s = Ln / k_; f = s / L; ox, oy = a[0] + dx / Ln * s * k, a[1] + dy / Ln * s * k
            for t in R:
                v = np.array([(ox + (p[0] - rx) * ca - (p[1] - ry0) * f * sa, oy + (p[0] - rx) * sa + (p[1] - ry0) * f * ca, p[2]) for p in t['v']])
                O.tri(t['group'], t['storey'], t['material'], el, None, v, np.array([t['n'][0] * ca - t['n'][1] * sa, t['n'][0] * sa + t['n'][1] * ca, t['n'][2]]))
    rail_run('RL-DECK-B5S', (19.88, DECK['y0']), (DECK['x1'] - 0.15, DECK['y0'])); rail_run('RL-DECK-B5E', (DECK['x1'] - 0.15, DECK['y0']), (DECK['x1'] - 0.15, 4.0))

    O.write(os.path.join(B2, GLB_OUT))
    rep['meshes'] = len(O.M); rep['tris'] = sum(len(m['idx']) for m in O.M.values())
    elements = sorted(set(r[0] for m in O.M.values() for r in m['ranges'])); bounds = sorted(set(r[1] for m in O.M.values() for r in m['ranges'] if r[1]))
    return meta, hide, hide_ranges, elements, bounds, colliders, rep

def option_data(meta, elements, bounds, new_col):
    D = {'format': 'bim2-scene-meta-option', 'source': {'builder': 'tour/bim2/tools/build_open4k.py', 'options': {'OS-REMODEL': LEGACY}, 'note': LABEL}}
    P2 = lambda pts: [list(p) for p in pts]; room = Polygon(BOX)
    vault = lambda poly: {'form': 'VAULT_ROOF', 'height': None, 'planes': [
        {'poly': P2(poly.intersection(sbox(-60, -60, 60, RIDGE_Y)).exterior.coords[:-1]), 'holes': [], 'P': {'c': C_S, 'gx': 0, 'gy': PITCH}},
        {'poly': P2(poly.intersection(sbox(-60, RIDGE_Y, 60, 60)).exterior.coords[:-1]), 'holes': [], 'P': {'c': C_N, 'gx': 0, 'gy': -PITCH}}]}
    liv = lambda poly: {'form': 'VAULT_GABLE', 'height': None, 'planes': [pl for pl in (
        {'poly': P2(poly.intersection(sbox(-60, -60, -2.28, 60)).exterior.coords[:-1]) if poly.bounds[0] < -2.28 else None, 'holes': [], 'P': {'c': 10.2201, 'gx': 0.2548, 'gy': 0}},
        {'poly': P2(poly.intersection(sbox(-2.28, -60, 60, 60)).exterior.coords[:-1]) if poly.bounds[2] > -2.28 else None, 'holes': [], 'P': {'c': 9.0527, 'gx': -0.2572, 'gy': 0}}) if pl['poly']]}
    NEW = {'SP-L1-LIVING': ('Library', Polygon([(-9.5298, -0.7477), (4.7564, -0.7477), (4.7564, 4.4041), (X_WW, 4.4041), (X_WW, 9.21), (-9.5298, 9.21)]), liv),
           'SP-L1-BATH': ('Bath', sbox(-9.5298, 9.59, -1.29, 14.3208), liv), 'SP-L1-HALL': ('Hall', sbox(-0.91, 9.59, X_WW, 14.3208), liv), GREAT: ('Kitchen, dining & living', room, vault)}
    RENAME = {'SP-L1-LAUNDRY-CLOSET': 'Shower', 'SP-L1-HALL-CLOSET': 'Bedroom vestibule'}
    sp = []
    for s in meta['spaces']:
        if s['id'] in REMOVED_SPACES: continue
        if s['id'] in NEW:
            nm, poly, cf = NEW[s['id']]; s = json.loads(json.dumps(s)); s['name'] = nm; s['polygon'] = P2(poly.exterior.coords[:-1]); s['ceiling'] = cf(poly)
        elif s['id'] in RENAME: s = dict(s, name=RENAME[s['id']])
        sp.append(s)
    D['spaces'] = sp
    rm_el = set(REMOVED_WALLS + REMOVED_OPENINGS + ['SL-L1-STORE-BED2']); rm_fl = set('FL-SP-L1-' + s for s in ('GREAT', 'BED2', 'BED2-CLOSET', 'BED3', 'BED3-CLOSET', 'KITCHEN', 'HALL', 'BATH'))
    wk = [w for w in meta['walkable'] if w['id'] not in rm_fl and w['id'] != 'SL-DK-FRONT' and w.get('element') not in rm_el and w.get('opening') not in rm_el and w.get('element') != 'ST-FRONT']
    fl = lambda i, poly, space, kind='FLOOR', ext=False: {'id': i, 'element': i, 'kind': kind, 'space': space, 'storey': 'L1', 'poly': P2(poly), 'holes': [], 'z': 0, 'exterior': ext}
    wk += [fl('FL-SP-L1-B5', BOX, GREAT), fl('FL-B5-W1', [(X_WW - .1, 4.404), (X_LW + .1, 4.404), (X_LW + .1, 26.67), (X_WW - .1, 26.67)], GREAT), fl('FL-B5-W2', [(-6.6, 14.2), (X_WW, 14.2), (X_WW, 14.8), (-6.6, 14.8)], 'SP-L1-HALL'),
           fl('FL-B5-W3', [(-6.42, 16.6), (X_WW, 16.6), (X_WW, 17.2), (-6.42, 17.2)], 'SP-L1-BED1'), fl('FL-B5-W4', [(-9.53, 14.2), (-6.6, 14.2), (-6.6, 14.8), (-9.53, 14.8)], 'SP-L1-BATH'),
           {'id': 'TH-D-L1-B5F', 'element': 'D-L1-B5F', 'kind': 'THRESHOLD', 'opening': 'D-L1-B5F', 'storey': 'L1', 'poly': [[FOLD['x0'], Y_SO], [FOLD['x1'], Y_SO], [FOLD['x1'], Y_S], [FOLD['x0'], Y_S]], 'z': 0, 'exterior': False},
           {'id': 'SL-DK-B5', 'element': 'SL-DK-B5', 'kind': 'DECK', 'poly': [[2.85, -10.087], [DECK['x0'], -10.087], [DECK['x0'], DECK['y0']], [DECK['x1'], DECK['y0']], [DECK['x1'], Y_SO], [2.85, Y_SO]], 'z': 0, 'storey': 'L1', 'exterior': True}]
    s0, s1 = STAIR_Y; sy = lambda y: s0 + (y - s0) * (DECK['y0'] - s0) / (s1 - s0)
    for w in meta['walkable']:
        if w.get('element') == 'ST-FRONT': w = json.loads(json.dumps(w)); w['poly'] = [[p[0], round(sy(p[1]), 4)] for p in w['poly']]; w['id'] += '-B5'; w['element'] = 'ST-FRONT-B5'; wk.append(w)
    D['walkable'] = wk
    col = []
    for c in meta['colliders']:
        el = c.get('element')
        if el in rm_el or el in ('RL-FRONT-DECK', 'W-L1-002'): continue
        if el == 'RL-FRONT-STAIR': c = json.loads(json.dumps(c)); c['poly'] = [[p[0], p[1] + DECK['y0']] for p in c['poly']]; c['element'] = 'RL-FRONT-STAIR-B5'; c['id'] = c['id'].replace('RL-FRONT-STAIR', 'RL-FRONT-STAIR-B5')
        col.append(c)
    for i, (a, b_) in enumerate((((19.88, DECK['y0'] - .1), (DECK['x1'], DECK['y0'] + .1)), ((DECK['x1'] - .25, DECK['y0']), (DECK['x1'] + .05, Y_SO)))):
        col.append({'id': 'RL-DECK-B5#%d' % i, 'element': 'RL-DECK-B5', 'kind': 'RAIL', 'poly': [[a[0], a[1]], [b_[0], a[1]], [b_[0], b_[1]], [a[0], b_[1]]], 'z0': 0, 'z1': 3.1, 'storey': 'L1', 'exterior': True})
    D['colliders'] = col + new_col
    base = {o['id']: o for o in meta['openings']}; ops = []
    for o in meta['openings']:
        if o['id'] in REMOVED_OPENINGS: continue
        o = json.loads(json.dumps(o))
        for k in ('A', 'B'):
            if (o.get('spaces') or {}).get(k) in REMOVED_SPACES: o['spaces'][k] = GREAT
        ops.append(o)
    def win(i, src, host, c, w, s, h, ax, nrm, space=GREAT):
        o = json.loads(json.dumps(base[src])); o.update({'id': i, 'type': 'WN-FIXED (concept)', 'host': host, 'center': c, 'width': w, 'sill': s, 'head': h, 'centerZ': (s + h) / 2, 'axis': ax, 'normal': nrm, 'spaces': {'A': 'EXTERIOR', 'B': space}}); return o
    for i, (c, w, s, h) in enumerate(NWIN): ops.append(win('WN-L1-B5N%d' % (i + 1), 'WN-L1-08', 'W-L1-B5N', [c, 32.2875], w, s, h, [1, 0], [0, 1]))
    for i, (c, w, s, h) in enumerate(EWIN): ops.append(win('WN-L1-B5E%d' % (i + 1), 'WN-L1-05', 'W-L1-B5E', [36.7855, c], w, s, h, [0, -1], [1, 0]))
    ops.append(win('WN-L1-B5S', 'WN-L1-03', 'W-L1-B5S', [(FIXW['x0'] + FIXW['x1']) / 2, 4.6046], FIXW['x1'] - FIXW['x0'], FIXW['sill'], FIXW['head'], [-1, 0], [0, -1]))
    ops.append({'id': 'D-L1-B5F', 'class': 'IfcDoor', 'type': 'DT-EXT-FOLDING-GLASS (concept, NanaWall-style)', 'host': 'W-L1-B5S', 'storey': 'L1', 'center': [(FOLD['x0'] + FOLD['x1']) / 2, 4.6046], 'sill': 0, 'head': FOLD['head'],
                'width': FOLD['x1'] - FOLD['x0'], 'spaces': {'A': 'EXTERIOR', 'B': GREAT}, 'axis': [-1, 0], 'normal': [0, -1], 'thickness': 0.4011, 'exterior': True, 'glazed': 1,
                'leaf': {'kind': 'FOLD', 'panels': FOLD['panels'], 'stack': 'west', 'state': 'open', 'plane': 4.60, 'frame': 'steel-black'}, 'leaves': []})
    def cased(i, host, c, w, ax, nrm, a, b_, head=DOOR_H, leaf=None):
        o = json.loads(json.dumps(base['OP-L1-01'])); o.update({'id': i, 'host': host, 'center': c, 'width': w, 'head': head, 'centerZ': head / 2, 'axis': ax, 'normal': nrm, 'thickness': 0.38, 'spaces': {'A': a, 'B': b_}}); o.pop('s', None)
        if leaf: o['leaf'] = leaf; o['leaves'] = [leaf]; o['class'] = 'IfcDoor'
        return o
    ops += [cased('OP-L1-B5W', 'W-L1-B5W', [5.09, (PASS[0] + PASS[1]) / 2], PASS[1] - PASS[0], [0, 1], [1, 0], 'SP-L1-LIVING', GREAT, PASS[2]),
            cased('OP-L1-B5A', 'W-L1-B5A', [0.625, 9.4], 2.65, [1, 0], [0, 1], 'SP-L1-LIVING', 'SP-L1-HALL', leaf={'kind': 'POCKET', 'hingeEnd': 'END'}),
            cased('OP-L1-B5B', 'W-L1-B5B', [-1.1, 11.2], 2.5, [0, 1], [1, 0], 'SP-L1-BATH', 'SP-L1-HALL', leaf={'kind': 'POCKET', 'hingeEnd': 'END'}),
            cased('OP-L1-B5C', 'W-L1-B5C', [1.5, 14.51], 2.8, [1, 0], [0, 1], 'SP-L1-HALL', 'SP-L1-HALL-CLOSET'),
            cased('OP-L1-B5S', 'W-L1-004', [-7.97, 14.51], 2.33, [1, 0], [0, 1], 'SP-L1-BATH', 'SP-L1-LAUNDRY-CLOSET'),
            cased('OP-L1-B5D', 'W-L1-B5D', [1.6, 16.93], 2.66, [1, 0], [0, 1], 'SP-L1-HALL-CLOSET', 'SP-L1-BED1', leaf={'kind': 'SWING', 'hinge': [[2.93, 17.08, 0.04], [2.93, 17.08, 6.7]], 'swingSide': 'B', 'swing': 'B', 'angle': 88}),
            cased('OP-L1-B5E', 'W-L1-B5D', [-3.4, 16.93], 5.4, [1, 0], [0, 1], 'SP-L1-BED1-CLOSET', 'SP-L1-BED1', leaf={'kind': 'BYPASS'})]
    D['openings'] = ops
    gone = ('FX-grab-h', 'FX-mirror-09', 'FX-showerSys-h', 'FX-toilet-10', 'FX-tubAlcove-11', 'FX-vanity-09', 'FX-washerFront-LIV', 'FX-JLH-L1-BED2', 'FX-JLH-L1-BED3', 'FX-JLH-L1-HALL')
    D['furnishings'] = [f for f in meta['furnishings'] if not f['id'].startswith('KX-') and f['id'] not in gone] + fixtures() + staging()
    dead = set(REMOVED_SPACES) | {'SP-L1-GREAT', 'SP-L1-HALL', 'SP-L1-BATH'}
    D['lights'] = [l for l in meta['lights'] if l.get('space') not in dead] + new_cans(meta)
    D['boundaries'] = {b: GREAT for b in bounds}
    cut = {e: GREAT for e in elements}
    for e in elements:
        if e in ('BM-L1-B5', 'SL-DK-B5', 'ST-FRONT-B5', 'RL-FRONT-STAIR-B5', 'RL-DECK-B5S', 'RL-DECK-B5E', 'W-L1-B5W', 'W-L1-B5V', 'FL-B5-PATCH'): cut[e] = '@L1'
        elif e in ('W-L1-B5A', 'W-L1-B5B', 'FL-B5-BATH', 'W-L1-B5L', 'W-L1-B5M', 'D-L1-B5L'): cut[e] = 'SP-L1-BATH'
        elif e in ('W-L1-B5C', 'W-L1-B5D', 'D-L1-B5C', 'D-L1-B5B'): cut[e] = 'SP-L1-BED1'
    for b in bounds: cut[b] = GREAT
    D['cut'] = cut
    return D

PEND = [(13.8, 13.0), (15.8, 13.0), (17.8, 13.0), (13.8, 24.25), (17.8, 24.25)]
def new_cans(meta):
    t = next(l for l in meta['lights'] if l['id'] == 'LF-L1-139'); out = []; k = 0
    for x in (8.4, 13.4, 18.6, 23.8, 29.0, 34.0):
        for y in (7.3, 11.2, 15.2, 21.7, 25.7, 29.6):
            if any(abs(x - px) < 1.2 and abs(y - py) < 2.0 for px, py in PEND) or (x > 33 and 15 < y < 22): continue
            k += 1; out.append(dict(t, id='LF-L1-B5-%02d' % k, at=[x, y, round(ceil_z(y), 4)], ceilingZ=round(ceil_z(y), 4), space=GREAT))
    return out

def fixtures():
    """kitchen, bath and laundry fixtures, in the house's own cabinetry (white raised-panel shaker, satin nickel, Brittanicca quartz)"""
    F = []; CAB = {'counter': None, 'faucet': False, 'hw': 'satinNickel', 'pull': 'bar', 'sink': False, 'style': 'raised'}; N = Y_N; NF = N - 2.08; W = X_LW
    def add(kind, lib, at, rot, params, space=GREAT, z=0):
        F.append({'id': 'KX-B5-%02d' % (len(F) + 1), 'type': 'FXT-' + kind, 'render': {'kind': kind, 'lib': lib}, 'at': [round(at[0], 3), round(at[1], 3), z], 'rot': rot, 'space': space, 'storey': 'L1', 'params': params, 'footprint': None})
    # the tall wall on the west gable, south to north: pantry, wall ovens (shown as a tall cabinet), fridge, then counter into the corner
    add('tallCabinet', 'FIX', (W, 22.25), 0, dict(CAB, d=2.08, h=8, w=2.5, pull='knob'))
    add('wallOvenStack', 'BUILTIN', (W, 24.75), 0, {'w': 2.5, 'd': 2.08, 'h': 8})
    add('fridge4Door', 'BUILTIN', (W, 27.5), 0, {'d': 2.5, 'dispenser': True, 'h': 5.9, 'w': 3})
    add('upperCabinet', 'FIX', (W, 27.5), 0, dict(CAB, d=2, h=1.9, mountY=6.1, w=3, pull='knob'))
    add('baseCabinet', 'FIX', (W, 29.96), 0, dict(CAB, w=1.92))
    # the north wall, west to east: corner, drawers, the 36-in range and hood between the two windows, drawers
    add('baseCabinet', 'FIX', (W + 1.04, N), 270, dict(CAB, w=2.08))
    add('baseCabinet', 'FIX', (8.52, N), 270, dict(CAB, w=2.32, doors='drawers'))
    add('baseCabinet', 'FIX', (10.84, N), 270, dict(CAB, w=2.32))
    add('baseCabinet', 'FIX', (13.15, N), 270, dict(CAB, w=2.3, doors='drawers'))
    add('range36', 'FIX', (15.8, N), 270, {'w': 3})
    add('hoodChimney', 'FIX', (15.8, N), 270, {'mountY': 6.0, 'toCeiling': 8.0, 'w': 3.5})
    add('baseCabinet', 'FIX', (18.35, N), 270, dict(CAB, w=2.1, doors='drawers'))
    add('baseCabinet', 'FIX', (20.45, N), 270, dict(CAB, w=2.1))
    add('upperCabinet', 'FIX', (8.6, N), 270, dict(CAB, h=3.5, mountY=4.5, w=2.4, pull='knob', led=True))
    add('counterTop', 'BUILTIN', (13.0, N - 1.04), 0, {'mat': 'brittanicca', 'mountY': 2.896, 'outlines': [[[W, 29.0], [W + 2.08, 29.0], [W + 2.08, NF], [21.5, NF], [21.5, N], [W, N]]], 'holes': [[[14.3, NF], [17.3, NF], [17.3, N], [14.3, N]]], 'splash': 0.33, 't': 0.104})
    # the island: 8 ft x 3 ft 6, sink and dishwasher on the working (north) side, four stools on the dining side
    add('island', 'FIX', (15.8, 26.0), 270, dict(CAB, w=8.0, d=3.5, seatingSide='front', overhang=1.25, counter='quartz', cabDepth=2, sink=True))
    for x in (12.9, 14.85, 16.8, 18.75): add('counterStoolRope', 'BUILTIN', (x, 21.8), 90, None)
    # the 3/4 bath: vanity and mirror on the library wall, toilet on the north wall, shower in the old laundry closet
    add('vanity', 'FIX', (-7.45, 9.59), 90, {'basin': 'rect', 'faucetFinish': 'nickelBrushed', 'hw': 'nickelBrushed', 'sinks': 1, 'splash': 0, 'top': 'marble', 'w': 3.7}, 'SP-L1-BATH')
    add('mirror', 'FIX', (-7.45, 9.59), 90, {'w': 3.2, 'h': 2.75, 'mountY': 4.6}, 'SP-L1-BATH')
    add('toilet', 'FIX', (-3.6, 14.32), 270, None, 'SP-L1-BATH')
    add('showerSystem', 'BUILTIN', (-8.1, 18.42), 270, {'armY': 6.75, 'bar': True, 'finish': 'nickelBrushed', 'grab': 0, 'head': 'round'}, 'SP-L1-LAUNDRY-CLOSET')
    add('showerGlass', 'FIX', (-7.97, 14.70), 270, {'w': 2.3, 'h': 6.6, 'door': True, 'doorW': 2.2, 'finish': 'chrome'}, 'SP-L1-BATH')
    # the back bedroom: a queen bed on the north wall, as on the plan
    add('bedQueen', 'FIX', (-1.6, 26.67), 270, None, 'SP-L1-BED1')
    add('nightstand', 'FIX', (-5.2, 26.67), 270, None, 'SP-L1-BED1'); add('nightstand', 'FIX', (2.0, 26.67), 270, None, 'SP-L1-BED1')
    # the hall: stacked washer and dryer
    add('washerFront', 'FIX', (X_WW + 0.3, 10.75), 180, {'stacked': True}, 'SP-L1-HALL')
    return F

def staging():
    F = []
    def add(kind, at, rot, params=None, lib='STAGE', key=None, on=None, dx=0, dz=0, back=False, z=0, space=GREAT):
        f = {'id': 'FX-B5-%02d' % (len(F) + 1), 'type': 'FXT-' + kind, 'render': {'kind': kind, 'lib': lib}, 'at': [round(at[0], 3), round(at[1], 3), z], 'rot': rot, 'space': space, 'storey': 'L1', 'params': params or None, 'footprint': None}
        if key: f['stageKey'] = key
        if on: f['stageOn'] = on; f['stageDx'] = dx; f['stageDz'] = dz
        if back: f['stageBack'] = True
        F.append(f); return f
    BK = {'counter': None, 'crown': False, 'd': 1, 'density': 0.85, 'doorsPerBox': 2, 'fill': 'books', 'h': 3, 'lights': False, 'shelfD': 1, 'shelfMat': 'maple', 'shelfT': 0.125, 'sidePanels': True}
    # living at the street end: two 8-ft sofas facing each other across the hearth's axis, a glass coffee table, a rug
    add('rug2', (29.7, RIDGE_Y), 0, {'w': 11.9, 'd': 9.6, 'pattern': 'checker'})
    for y, r, k in ((23.6, 270, 'sn'), (13.3, 90, 'ss')):
        add('sofa3', (29.6, y), r, {'w': 8.0, 'fabric': 'linenCream', 'pillows': False}, key=k)
        add('pillows', (0, 0), r, {'mountY': 1.42, 'lean': -.3, 'items': [['pillowSlate', -2.6, 1.45, 1.45, .12], ['pillowCream', -1.2, 1.45, 1.45, -.05], ['pillowGreyLinen', 1.2, 1.45, 1.45, -.1], ['pillowSlate', 2.6, 1.45, 1.45, -.12]]}, on=k).update({'stageZ': .95})
    add('coffeeTableGlass', (29.6, RIDGE_Y), 90, {'w': 5.0, 'd': 3.6, 'h': 1.4}, key='ct')
    add('orchid', (0, 0), 90, {'h': 1.9, 'potDia': 1.2, 'bowl': True, 'stems': 4, 'seed': 5}, on='ct', dx=-.8)
    add('books', (0, 0), 90, {'n': 3}, on='ct', dx=1.3, dz=.4)
    add('builtinBookcase', (26.25, Y_N), 270, dict(BK, boxes=1, levels=[5, 6.25, 7.5], seed=5, w=3.3), lib='BUILTIN')
    add('builtinBookcase', (34.75, Y_N), 270, dict(BK, boxes=1, levels=[5, 6.25, 7.5], seed=9, w=3.3), lib='BUILTIN')
    # dining on the kitchen's axis: an oak table for eight (ten with its leaves), three globes; the sideboard on the west wall
    add('diningTable', (15.8, 13.0), 90, {'w': 8.0, 'd': 3.5}, key='dt')
    add('bowl', (0, 0), 90, {'dia': 1.55, 'h': 1.0}, on='dt')
    for ox in (-2.667, 0.0, 2.667): add('parsonsChair', (15.8 + ox, 10.55), 90); add('parsonsChair', (15.8 + ox, 15.45), 270)
    add('parsonsChair', (11.1, 13.0), 0); add('parsonsChair', (20.5, 13.0), 180)
    for px, py in PEND: add('pendantGlobe', (px, py), 0, {'dia': 0.95, 'drop': round(ceil_z(py) - 6.9, 3), 'finish': 'blackMetal', 'cord': 'rod'}, z=round(ceil_z(py), 3))
    add('sideboard', (X_LW, 15.25), 0, {'w': 8.5, 'd': 1.6}, key='sb', back=True)
    add('lamp', (0, 0), 0, {'h': 2.2}, on='sb', dx=-3.0); add('vase2', (0, 0), 0, {'h': 1.0}, on='sb', dx=2.6)
    add('art', (X_LW, 15.25), 0, {'w': 4.6, 'h': 2.6, 'mountY': 5.6, 'style': 'blots', 'seed': 7}, back=True)
    # the library: a wall of shelves, two reading chairs, a round table, a rug
    add('builtinBookcase', (-5.1, 9.21), 270, dict(BK, boxes=3, levels=[4.2, 5.4, 6.6], seed=21, w=8.4), lib='BUILTIN', space='SP-L1-LIVING')
    add('rug2', (-5.3, 3.85), 0, {'w': 7.1, 'd': 6.6, 'pattern': 'sisal'}, space='SP-L1-LIVING')
    add('armchairBoucle', (-6.6, 2.1), 0, {'fabric': 'fabricLight'}, space='SP-L1-LIVING'); add('armchairBoucle', (-6.6, 5.6), 0, {'fabric': 'fabricLight'}, space='SP-L1-LIVING')
    add('woodSideTable', (-3.6, 3.85), 0, {'dia': 2.4, 'h': 1.85}, key='lt', space='SP-L1-LIVING'); add('books', (0, 0), 0, {'n': 3}, on='lt'); add('lamp', (0, 0), 0, {'h': 1.9, 'shadeDia': 1.0}, on='lt', dx=.5, dz=-.4)
    # the deck: kept light, two lounge chairs and a low table off to the east side, clear floor in front of the open doors
    add('outdoorLounge', (22.3, -2.2), 90, {}); add('outdoorLounge', (22.3, 1.9), 270, {}); add('outdoorCoffee', (22.3, -0.15), 0, {'w': 2.2, 'd': 1.5}); add('plantPot', (23.9, -3.3), 0)
    return F

CARD = {'name': 'Open kitchen and great room', 'short': 'Illustrative idea', 'beds': 4, 'bedrooms': 4, 'baths': 3, 'office': True, 'label': LABEL,
        'description': 'The whole original gable becomes one vaulted great room under a clear-span ridge beam: living around a gas hearth at the street end, an L-shaped kitchen with an island at the other, a table for eight (ten with leaves) between them at 14-ft folding glass doors to the porch and a new deck. The old living room becomes a library on the way in, with a new bath beside the back bedroom. 4 bedrooms, 3 baths, plus office.',
        'note': 'Concept r44 (owner pick "1-open B-flip", 11/12/2026): the front and middle bedrooms, the hall bath, the hall and the old kitchen all come out of the original gable; hearth on the street gable; L kitchen on the north and west walls; folding glass doors centred on the table; a 3/4 bath, hall with stacked washer and dryer and a library in the old living room; back bedroom entered through a vestibule. Status: illustrative, not designed or reviewed by an architect or engineer.',
        'status': 'illustrative', 'source': 'concept r44 (tour/CONCEPT-4BR.md)', 'pageExtras': True}

def register(hide, hide_ranges, sha):
    path = os.path.join(B2, 'scene.meta.json'); meta = json.load(open(path))
    e = {'id': OPT_ID, 'legacyId': LEGACY, 'set': 'OS-REMODEL'}; e.update(CARD)
    e.update({'hide': hide, 'hideRanges': hide_ranges, 'glb': GLB_OUT, 'sha256': sha, 'remap': [], 'meta': META_OUT,
              'region': [[-10.5, -1.4], [5.4, -1.4], [5.4, 4.4], [37.0, 4.4], [37.0, 32.5], [5.0, 32.5], [5.0, 27.1], [-7.0, 27.1], [-7.0, 18.85], [-9.95, 18.85]],
              'clearRegion': [[-9.7, -0.9], [5.0, -0.9], [5.0, 4.3], [8.9, 4.3], [8.9, 3.9], [22.7, 3.9], [22.7, 4.3], [36.9, 4.3], [36.9, 32.3], [5.1, 32.3], [5.1, 16.9], [-6.5, 16.9], [-6.5, 18.6], [-9.7, 18.6]],
              'walkStart': {'at': [1.0, -3.6], 'look': [20.0, 12.0]},
              # entry -> library -> great room; round the island; out through the folding doors; hall, vestibule, bedroom, bath; walls that must still stop a walker
              'walkTests': [[[0.0, -3.0], [2.5, 5.5], 'open'], [[2.5, 6.8], [9.0, 7.0], 'open'], [[9.0, 7.0], [26.0, 8.0], 'open'], [[10.0, 20.0], [10.0, 28.0], 'open'], [[10.5, 28.2], [21.0, 28.2], 'open'], [[21.2, 28.0], [21.2, 20.0], 'open'],
                            [[15.8, 7.5], [15.8, 0.0], 'open'], [[23.0, 16.0], [23.0, 30.0], 'open'], [[24.0, 20.0], [34.0, 26.5], 'open'], [[20.0, 25.0], [26.0, 25.0], 'open'],
                            [[0.6, 7.5], [0.6, 12.6], 'open'], [[0.6, 12.6], [1.5, 15.8], 'open'], [[0.6, 11.0], [4.0, 11.0], 'wall'], [[3.5, 13.2], [3.5, 10.5], 'wall'], [[1.6, 15.8], [1.6, 19.5], 'open'], [[0.5, 11.2], [-4.0, 11.2], 'open'], [[-7.97, 13.0], [-7.97, 16.5], 'open'],
                            [[8.0, 12.0], [3.0, 12.0], 'wall'], [[8.0, 24.0], [3.0, 24.0], 'wall'], [[-4.0, 7.0], [-4.0, 11.5], 'wall'], [[21.5, -1.0], [27.0, -1.0], 'wall'], [[30.0, 8.0], [30.0, 2.0], 'wall'], [[30.0, 18.4], [38.0, 18.4], 'wall']],
              'labels': [{'name': 'Kitchen', 'at': [15.8, 28.0]}, {'name': 'Dining', 'at': [15.8, 8.2]}, {'name': 'Living', 'at': [29.6, 27.6]}, {'name': 'Library', 'at': [-0.3, 6.6]}, {'name': 'Deck', 'at': [20.5, -2.6]},
                         {'name': 'Bedroom', 'at': [-1.6, 21.5]}, {'name': 'Bath', 'at': [-5.2, 12.2]}],
              # viewpoints, world frame [north, up, east]
              'views': {'foyer': {'pos': [-4.0, 5.0, -3.0], 'look': [20.7, 4.7, 9.0]},
                        'arrival': {'pos': [6.9, 5.0, 1.9], 'look': [10.5, 4.6, 24.0]},
                        'entry': {'pos': [7.0, 5.0, 6.6], 'look': [15.5, 4.8, 30.0]},
                        'hearth': {'pos': [17.6, 5.0, 21.6], 'look': [18.45, 4.6, 36.0]},
                        'fromtable': {'pos': [16.3, 5.0, 9.6], 'look': [18.45, 4.5, 36.0]},
                        'kitchen': {'pos': [18.6, 5.0, 25.2], 'look': [27.0, 4.2, 9.0]},
                        'dining': {'pos': [19.0, 5.0, 22.4], 'look': [3.0, 3.4, 13.0]},
                        'island': {'pos': [29.0, 5.0, 22.8], 'look': [14.0, 4.0, 13.0]},
                        'living': {'pos': [18.45, 5.0, 22.4], 'look': [18.45, 4.4, 36.0]},
                        'library': {'pos': [0.6, 5.0, 2.6], 'look': [8.5, 4.2, -6.0]},
                        'bedroom': {'pos': [17.7, 5.0, 1.6], 'look': [23.5, 3.2, -2.6]},
                        'bath': {'pos': [10.7, 5.0, -2.6], 'look': [14.4, 3.6, -8.4]},
                        'hall': {'pos': [8.2, 5.0, 0.5], 'look': [16.5, 4.2, 1.9]},
                        'deck': {'pos': [-2.6, 5.0, 19.0], 'look': [13.0, 4.4, 15.8]},
                        'driveway': {'pos': [-14.0, 1.0, 34.0], 'look': [2.0, 1.4, 18.0]},
                        'street': {'pos': [18.4, 1.6, 52.0], 'look': [18.4, 6.0, 30.0]},
                        'aerial': {'pos': [-12.0, 62.0, 52.0], 'look': [14.0, 0.0, 14.0]}}})
    meta['options'] = [o for o in meta['options'] if o['id'] != OPT_ID] + [e]
    open(path, 'w').write(json.dumps(meta, separators=(',', ':'), ensure_ascii=False))

def main():
    meta, hide, hide_ranges, elements, bounds, colliders, rep = build()
    D = option_data(meta, elements, bounds, colliders)
    json.dump(D, open(os.path.join(B2, META_OUT), 'w'), separators=(',', ':'))
    raw = open(os.path.join(B2, GLB_OUT), 'rb').read(); register(hide, hide_ranges, hashlib.sha256(raw).hexdigest())
    print(json.dumps(rep)); print('hide', len(hide), 'bytes', len(raw), 'colliders+', len(colliders))

if __name__ == '__main__':
    main()
