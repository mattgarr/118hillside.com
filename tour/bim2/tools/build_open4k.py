#!/usr/bin/env python3
"""Concept r42b "Open kitchen and great room" (option OS-REMODEL-open4k, legacyId open4k): the second 4-bedroom idea.

Same opening-up as "Open great room" (build_open4.py: the front and middle main-level bedrooms come out, one cathedral room under
the original gable with an exposed fir ridge beam), arranged the way the owner's own great room works:
  - the kitchen at the far, street end of the long room, a destination rather than a path: cabinet run on the street gable with the
    sink under a window like today's kitchen window, a return on the north wall with the range and a chimney hood, a 12-ft island
    facing back into the room with its stools on the room side;
  - the street gable mostly solid (privacy): the kitchen window plus the high glazed gable of the first concept;
  - the 14-1/4 ft picture window toward the driveway becomes a 14.4-ft folding glass wall (NanaWall-style) onto an extended front deck,
    level with the floor, with the same decking, skirt and cable railing as the porch; the porch steps narrow to make room;
  - living in the middle, anchored on the north wall by a gas fireplace (direct vent through that wall) between built-ins, where the
    middle bedroom's window was; dining by the folding glass wall;
  - the old kitchen is taken out (r43, owner): no cabinets, counters or appliances; the oak floor runs through;
  - v2 (r43f, owner: "a random bit of wall and a vestigial door ... extend that beam a little bit longer and open all of that up"):
    every wall that only served the removed rooms goes too: the wall between the old kitchen / bedroom hall and the middle bedroom
    (W-L1-041/042/043) with its door (D-L1-06), and the two pieces of wall between the old kitchen and the hall (W-L1-014/015).
    The hall's flat ceiling comes out, so the vault runs from the street gable to the original west gable wall, and the ridge beam
    runs the whole 31 ft with it, onto a post against that wall. The hall bath and the west bedroom open straight off the room;
  - that west end becomes the library: the west gable wall is shelved floor to vault (the living-room door passes through the
    books), with a rolling ladder, a deep window seat at the south window, two reading chairs and an upright piano between the
    window seat and the folding glass wall;
  - the kitchen's work triangle (v2): the fridge stands at the room end of the range wall, the range 5 ft from it, and the island
    has a prep sink at that end; the sink under the window and the dishwasher are the clean-up side;
  - five skylight wells along the vault: two over the island, one over the dining table, one over the living area, one over the
    library where the hall was.

Illustrative idea. Not designed or reviewed by an architect or engineer. See tour/CONCEPT-4BR.md.
Run: python3 tour/bim2/tools/build_open4k.py   (needs numpy, shapely >= 2.1; reads build_open4.py's helpers)
"""
import hashlib, json, math, os, sys
import numpy as np
import shapely, shapely.affinity
from shapely.geometry import Polygon, box as sbox
from shapely.ops import unary_union
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_open4 as B
from build_open4 import (ceil_z, RIDGE_Y, APEX, PITCH, C_S, C_N, X_KIT, Y_KIT, X_W, X_E, Y_S, Y_N, X_EO, ROOM, GREAT, LABEL, PAINT, CLOSET_PAINT,
                         TRIM_EXT, TRIM_INT, Out, read_glb, element_tris, plane_face, prism_sides, ring_center3, union_faces, fill_holes, mitre, tris2d)

B2 = B.B2
OPT_ID, LEGACY = 'OS-REMODEL-open4k', 'open4k'
GLB_OUT, META_OUT = 'scene.opt-%s.glb' % OPT_ID, 'scene.opt-%s.meta.json' % OPT_ID
Y_SO = 4.404                         # south wall outer face
DECK = dict(x0=15.675, x1=33.6, y0=-4.0, y1=Y_SO, z=0.0, skirt=-4.8)
X_OK = 5.2775                      # the old kitchen's west wall, interior face (r43)
NANA = dict(x0=18.0, x1=32.4, head=7.6, panels=6)
STAIR_Y = (-9.937, 0.0)               # the porch steps today (plan y), narrowed to end at the deck's south edge
KWIN_SRC, KWIN_CX = 'WN-L1-02', 9.486  # today's kitchen window over the sink, copied onto the street gable over the new sink
KWIN_TRIMS = ['TR-0695', 'TR-0696', 'TR-0697', 'TR-0698', 'TR-0951']
FP = dict(cx=19.3, w=6.0, d=1.2, box=(4.5, 1.5, 3.0), mantel=4.25)   # fireplace on the north wall where the middle bedroom's window was
SKY = [(27.5, 30.0, 13.0, 16.0), (27.5, 30.0, 21.0, 24.0), (16.5, 19.0, 7.2, 10.2), (17.0, 19.5, 24.6, 27.6), (8.9, 11.4, 20.3, 23.3)]   # plan rectangles (x0, x1, y0, y1); the fifth is over the library, where the hall was (v2)
# v2: the library end. The room now runs west to the original west gable wall and north to the hall bath's wall.
X_LW = 5.2776                        # the west gable wall (W-L1-033 to 037), room face
Y_HB = 25.3679                       # the hall bath's south wall (W-L1-016), room face
X_BW = 13.5479                       # west face of the removed hall / bedroom wall = west face of the bath's east wall
Y_BC = 25.5555                       # where the bath's east wall (W-L1-044) starts
LIB = 'SP-L1-KITCHEN'                # the old kitchen's space id is kept (the page's tour room), renamed 'Library'
ROOM2 = [(X_LW, Y_S), (X_E, Y_S), (X_E, Y_N), (X_W, Y_N), (X_W, Y_HB), (X_LW, Y_HB)]
LIBPOLY = [(X_LW, Y_S), (X_KIT, Y_S), (X_KIT, Y_KIT), (X_W, Y_KIT), (X_W, Y_HB), (X_LW, Y_HB)]
KB_W, KB_D = 0.5625, 2.0             # ridge beam as drawn: 6-3/4 in x 24 in (a 31-ft clear span; an engineer sizes it)
KB_Y0, KB_Y1, KB_Z0 = RIDGE_Y - KB_W / 2, RIDGE_Y + KB_W / 2, APEX - KB_D
POST = (X_LW, X_LW + 1.04, KB_Y0, KB_Y1)   # the beam's west post, against the west gable wall (x0, x1, y0, y1)
REMOVED_WALLS2 = ['W-L1-014', 'W-L1-015', 'W-L1-041', 'W-L1-042', 'W-L1-043']
REMOVED_MISC2 = ['CL-SP-L1-HALL', 'CL-SP-L1-KITCHEN', 'FL-SP-L1-HALL', 'FL-SP-L1-KITCHEN']
REMOVED_SPACES2 = ['SP-L1-HALL']
# the library wall's bays along the west wall, south to north (plan y): the bay beside the window seat, two with cabinets, the
# living-room door, two more, the ridge post, two more (the last stops short of the bedroom door's casing)
LIB_Y0, LIB_Y1 = 4.86, 22.19
# the dining table (v2, owner: the house's only place to dine): an extending oak table, 8 ft x 3 ft 6 in for eight every day (three a
# side and the two ends), 10 ft with its leaf in for ten. It is staged at 8 ft; the leaf takes it west, toward the library, so the
# kitchen end never moves: 3 ft 6 in or more stays clear between any dining chair and the island and its stools.
DINE = dict(x=17.7, y=11.2, w=8.0, d=3.5, ext=10.0, pend=(15.5, 17.7, 19.9))
REMOVED_TRIMS = (B.REMOVED_TRIMS + ['TR-0011', 'TR-0952', 'TR-0167', 'TR-0016', 'TR-0957'] + ['TR-%04d' % i for i in range(699, 708)] + ['TR-%04d' % i for i in range(744, 753)]
                 + ['TR-%04d' % i for i in list(range(192, 200)) + [225, 232, 233, 234, 236, 237] + list(range(475, 484))])   # v2: the removed hall walls' baseboards, D-L1-06's casings
REMOVED_OPENINGS = B.REMOVED_OPENINGS + ['WN-L1-03', 'WN-L1-08', 'D-L1-06']
REBUILT = B.REBUILT_WALLS + ['W-L1-020', 'W-L1-002', 'RF-MAIN', 'SL-DK-FRONT', 'ST-FRONT', 'RL-FRONT-STAIR', 'RL-FRONT-DECK']
REMOVED_FURN = B.REMOVED_FURN + ['KX-09', 'KX-11', 'KX-COUNTER']
REMOVED_LIGHTS = B.REMOVED_LIGHTS + ['LF-L1-%d' % i for i in [126, 133, 134, 135, 139, 140, 141, 142, 143, 144, 145, 146, 147, 176, 177]]   # 176, 177: the hall's (its flat ceiling goes)

def build():
    J, meshes = read_glb(os.path.join(B2, 'scene.glb'))
    meta = json.load(open(os.path.join(B2, 'scene.meta.json')))
    E = element_tris(meshes); O = Out(); rep = {}
    ob = {o['id']: o for o in meta['openings']}
    hide = sorted(set(B.REMOVED_WALLS + REMOVED_WALLS2 + REBUILT + REMOVED_OPENINGS + B.REMOVED_MISC + REMOVED_MISC2 + REMOVED_TRIMS) & set(E))
    hide_ranges = []
    room = Polygon(ROOM2)   # v2: one floor and one vault from the west gable wall to the street gable
    # ---- floor, ceiling (with skylight holes), ridge beam, kitchen-alcove wall patch: as in the first concept
    nana_sill = sbox(NANA['x0'], Y_SO, NANA['x1'], Y_S)            # the floor runs out through the opening to the deck
    floor = unary_union([room, nana_sill])
    plane_face(O, 'FL-SP-L1-OPEN4K', None, 'floors', 'L1', 'oak-red-lauzon-vela', floor, lambda x, y: (x, y, 0.0), (0, 0, 1))
    plane_face(O, 'FL-SP-L1-OPEN4K', None, 'floors', 'L1', 'oak-red-lauzon-vela', floor, lambda x, y: (x, y, -0.062), (0, 0, -1))
    holes = unary_union([sbox(*[s[0], s[2], s[1], s[3]]) for s in SKY])
    south = room.intersection(sbox(0, 0, 60, RIDGE_Y)).difference(holes); north = room.intersection(sbox(0, RIDGE_Y, 60, 60)).difference(holes)
    for part, nrm in ((south, (0, PITCH, -1)), (north, (0, -PITCH, -1))):
        plane_face(O, 'CL-SP-L1-OPEN4K', None, 'ceilings', 'L1', 'gwb-l5#paint-ceiling-flat', part, lambda x, y: (x, y, ceil_z(y)), nrm)
        plane_face(O, 'CL-SP-L1-OPEN4K', None, 'ceilings', 'L1', 'gwb-l5#paint-ceiling-flat', part, lambda x, y: (x, y, ceil_z(y) + 0.042), tuple(-a for a in nrm))
    # the ridge beam, west gable wall to street gable, and its west post (v2)
    sec = Polygon([(KB_Y0, KB_Z0), (KB_Y1, KB_Z0), (KB_Y1, ceil_z(KB_Y1) - 0.004), (RIDGE_Y, APEX - 0.004), (KB_Y0, ceil_z(KB_Y0) - 0.004)])
    for x, nx in ((X_LW + 0.002, -1), (X_E - 0.002, 1)):
        plane_face(O, 'BM-L1-OPEN4K', None, 'ceilings', 'L1', 'fir-beam', sec, lambda y, z, x=x: (x, y, z), (nx, 0, 0))
    prism_sides(O, 'BM-L1-OPEN4K', None, 'ceilings', 'L1', 'fir-beam', sec.exterior, lambda y, z: (X_LW + 0.002, y, z), lambda y, z: (X_E - 0.002, y, z), inward_center=(25, RIDGE_Y, APEX - KB_D / 2))
    def boxel(el, group, storey, mat, x0, y0, z0, x1, y1, z1, faces='xXyYzZ'):
        """an axis-aligned box; faces: which of its six sides to make (x = the face at x0 looking -x, X = at x1 looking +x, ...)"""
        Q = {'x': ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)), 'X': ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
             'y': ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)), 'Y': ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
             'z': ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)), 'Z': ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1))}
        for f in faces:
            q, n = Q[f]; O.tri(group, storey, mat, el, None, [q[0], q[1], q[2]], n); O.tri(group, storey, mat, el, None, [q[0], q[2], q[3]], n)
    boxel('PT-L1-K5W', 'walls', 'L1', 'fir-beam', POST[0], POST[2], 0.0, POST[1], POST[3], KB_Z0, faces='XyY')
    # wall faces the removed walls leave bare (v2). West gable wall: the strip where the hall's south wall met it, and its face above
    # the old 8-ft hall ceiling. Bath south wall: its face above that ceiling. The bath's south-east corner: the end of the removed wall.
    plane_face(O, 'W-L1-K5P', 'B-K5-W01', 'walls', 'L1', PAINT, Polygon([(22.0293, 0), (22.4046, 0), (22.4046, ceil_z(22.4046)), (22.0293, ceil_z(22.0293))]), lambda y, z: (X_LW, y, z), (1, 0, 0))
    plane_face(O, 'W-L1-K5P', 'B-K5-W02', 'walls', 'L1', PAINT, Polygon([(22.4046, 8.0), (Y_HB, 8.0), (Y_HB, ceil_z(Y_HB)), (22.4046, ceil_z(22.4046))]), lambda y, z: (X_LW, y, z), (1, 0, 0))
    plane_face(O, 'W-L1-K5P', 'B-K5-N01', 'walls', 'L1', PAINT, unary_union([sbox(X_LW, 8.0, X_BW, ceil_z(Y_HB)), sbox(X_BW, 0.0, X_W, ceil_z(Y_HB))]), lambda x, z: (x, Y_HB, z), (0, -1, 0))
    plane_face(O, 'W-L1-K5P', 'B-K5-E01', 'walls', 'L1', PAINT, Polygon([(Y_HB, 0), (Y_BC, 0), (Y_BC, ceil_z(Y_BC)), (Y_HB, ceil_z(Y_HB))]), lambda y, z: (X_W, y, z), (1, 0, 0))

    def copy_el(src, dst, fx, fn, keep=lambda t: True, scale=None):
        n = 0
        for t in E.get(src, []):
            if not keep(t): continue
            O.tri(t['group'], t['storey'], t['material'], dst, t['boundary'] and ('K4-' + t['boundary']), np.array([fx(p) for p in t['v']]), fn(t['n'])); n += 1
        return n
    def cut_wall(els, dst, plane_axis, inner_val, inner_sign, outer_val, outer_sign, fill_rects, cut_in, cut_out, inner_top, u_axis, extra_in=None, recolor=True):
        """copy a wall's triangles; its room face and siding are re-made: old window holes filled, new holes cut"""
        T = sum((E[e] for e in els), []); inner, outer, keep = [], {}, []
        for t in T:
            c = t['v'].mean(0); n = t['n']
            if n[plane_axis] * inner_sign > 0.9 and abs(c[plane_axis] - inner_val) < 0.06 and t['material'].startswith('paint-int') and -0.1 < c[2] <= inner_top(c) + 0.06:
                inner.append(t); continue
            if n[plane_axis] * outer_sign > 0.9 and abs(c[plane_axis] - outer_val) < 0.03 and t['material'] in ('hardie-lap#paint-ext-body', 'hardie-shingle#paint-ext-body'):
                outer.setdefault((t['material'], round(float(c[plane_axis]), 2), None), []).append(t); continue   # one face per material and plane, so a hole across two walls closes
            if any(r.contains(shapely.Point(c[u_axis], c[2])) for r in fill_rects) and min(inner_val, outer_val) + 0.03 < c[plane_axis] < max(inner_val, outer_val) - 0.03:
                continue
            keep.append(t)
        for t in keep: O.tri(t['group'], t['storey'], t['material'], dst, t['boundary'] and ('K4-' + t['boundary']), t['v'], t['n'])
        to3 = (lambda val: (lambda u, z: (u, val, z))) if plane_axis == 1 else (lambda val: (lambda u, z: (val, u, z)))
        nin = [0, 0, 0]; nin[plane_axis] = inner_sign; nout = [0, 0, 0]; nout[plane_axis] = outer_sign
        u = union_faces(inner, u_axis, 2)
        if extra_in is not None: u = unary_union([u, extra_in])
        u = fill_holes(u, only=fill_rects).difference(cut_in)
        plane_face(O, dst, 'B-K4-' + dst[-3:] + 'I', 'walls', 'L1', PAINT, u, to3(inner_val), tuple(nin))
        for (mat, vr, bd), ts in outer.items():
            vo = float(np.mean([p[plane_axis] for t in ts for p in t['v']])); uu = union_faces(ts, u_axis, 2)
            if not any(uu.intersects(g) for g in list(fill_rects) + [cut_out]):
                for t in ts: O.tri(t['group'], t['storey'], t['material'], dst, t['boundary'] and ('K4-' + t['boundary']), t['v'], t['n'])
                continue
            uu = fill_holes(uu, only=fill_rects).difference(cut_out)
            plane_face(O, dst, bd and ('K4-' + bd), 'walls', 'L1', mat, uu, to3(vo), tuple(nout))
        return len(inner), len(outer), len(keep)
    # ---- the street gable: kitchen window over the sink + the high glazed gable (no picture window)
    g_x = lambda p: (41.39 - p[1], RIDGE_Y + (p[0] - KWIN_CX), p[2]); g_n = lambda n: np.array([-n[1], n[0], n[2]])
    rep['kwin'] = copy_el(KWIN_SRC, 'WN-L1-K4A', g_x, g_n)
    for i, tr in enumerate(KWIN_TRIMS): copy_el(tr, 'TR-K4-A%02d' % i, g_x, g_n)
    kw = ob[KWIN_SRC]; kin = sbox(RIDGE_Y - kw['width'] / 2, kw['sill'], RIDGE_Y + kw['width'] / 2, kw['head'])
    kb = [E[t] for t in ['TR-0695', 'TR-0696', 'TR-0697', 'TR-0698']]; vs = np.concatenate([np.array([q['v'] for q in ts]).reshape(-1, 3) for ts in kb])
    kout = sbox(RIDGE_Y + (vs[:, 0].min() - KWIN_CX), vs[:, 2].min(), RIDGE_Y + (vs[:, 0].max() - KWIN_CX), vs[:, 2].max())
    rep['kwin_reveal'] = copy_el('W-L1-002', 'W-L1-K4E', g_x, g_n, keep=lambda t: 4.43 < t['v'].mean(0)[1] < 4.78 and sbox(6.5, 3.3, 12.48, 7.3).contains(shapely.Point(t['v'].mean(0)[0], t['v'].mean(0)[2])))
    gable_ro = [Polygon([(a, B.GABLE_SILL), (b, B.GABLE_SILL), (b, ceil_z(b) - B.GABLE_TOPGAP), (a, ceil_z(a) - B.GABLE_TOPGAP)]) for a, b in B.GABLE_PANES]
    gable_trim_out = unary_union([mitre(p, B.TRIM_W) for p in gable_ro])
    old_rects = [sbox(10.21, 1.26, 16.93, 6.72), sbox(18.89, 2.47, 23.15, 7.22), sbox(24.70, 2.47, 28.96, 7.22)]
    EW = sum((E[w] for w in ('W-L1-049', 'W-L1-050', 'W-L1-051')), [])
    inner, outer, keep_t = [], {}, []
    for t in EW:
        c = t['v'].mean(0); n = t['n']
        if n[0] < -0.9 and c[0] < 36.7 and -0.1 < c[2] and all(p[2] <= ceil_z(p[1]) + 0.06 for p in t['v']) and Y_S - .01 < c[1] < Y_N + .01: inner.append(t); continue
        if n[0] > 0.9 and c[0] > 36.95 and t['material'] in ('hardie-lap#paint-ext-body', 'hardie-shingle#paint-ext-body'):
            outer.setdefault((t['material'], round(float(c[0]), 2), t['boundary']), []).append(t); continue
        if 36.6 < c[0] < 36.97 and any(r.contains(shapely.Point(c[1], c[2])) for r in old_rects): continue
        keep_t.append(t)
    for t in keep_t: O.tri(t['group'], t['storey'], t['material'], 'W-L1-K4E', t['boundary'] and ('K4-' + t['boundary']), t['v'], t['n'])
    face = Polygon([(Y_S, 0), (Y_N, 0), (Y_N, ceil_z(Y_N)), (RIDGE_Y, APEX), (Y_S, ceil_z(Y_S))]).difference(kin).difference(unary_union(gable_ro))
    plane_face(O, 'W-L1-K4E', 'B-K4-E01', 'walls', 'L1', PAINT, face, lambda y, z: (X_E, y, z), (-1, 0, 0))
    for (mat, xr, bd), ts in outer.items():
        xo = float(np.mean([p[0] for t in ts for p in t['v']])); u = union_faces(ts, 1, 2)
        if not any(u.intersects(g) for g in old_rects + [kout, gable_trim_out]):
            for t in ts: O.tri(t['group'], t['storey'], t['material'], 'W-L1-K4E', t['boundary'] and ('K4-' + t['boundary']), t['v'], t['n'])
            continue
        u = fill_holes(u, only=old_rects).difference(kout).difference(gable_trim_out)
        plane_face(O, 'W-L1-K4E', bd and ('K4-' + bd), 'walls', 'L1', mat, u, lambda y, z, xo=xo: (xo, y, z), (1, 0, 0))
    FR_IN, FR_OUT = 36.70, 36.90
    for i, ro in enumerate(gable_ro):
        el = 'WN-L1-K4G%d' % (i + 1); cen = ring_center3(ro.exterior, lambda y, z: (36.8, y, z))
        prism_sides(O, el, None, 'openings', 'L1', PAINT, ro.exterior, lambda y, z: (X_E, y, z), lambda y, z: (FR_IN, y, z), inward_center=cen, outward=False)
        prism_sides(O, el, None, 'trim', '-', TRIM_EXT, ro.exterior, lambda y, z: (FR_OUT, y, z), lambda y, z: (X_EO + B.TRIM_T, y, z), inward_center=cen, outward=False)
        ring = ro.difference(mitre(ro, -0.16)); glass = mitre(ro, -0.16)
        plane_face(O, el, None, 'openings', 'L1', 'window-frame', ring, lambda y, z: (FR_IN, y, z), (-1, 0, 0))
        plane_face(O, el, None, 'openings', 'L1', 'window-frame', ring, lambda y, z: (FR_OUT, y, z), (1, 0, 0))
        prism_sides(O, el, None, 'openings', 'L1', 'window-frame', glass.exterior, lambda y, z: (FR_IN, y, z), lambda y, z: (FR_OUT, y, z), inward_center=cen, outward=False)
        plane_face(O, el, None, 'glass', 'L1', 'glass', glass, lambda y, z: (36.79, y, z), (-1, 0, 0))
        plane_face(O, el, None, 'glass', 'L1', 'glass', glass, lambda y, z: (36.81, y, z), (1, 0, 0))
    plane_face(O, 'TR-K4-G01', None, 'trim', '-', TRIM_EXT, gable_trim_out.difference(unary_union(gable_ro)), lambda y, z: (X_EO + B.TRIM_T, y, z), (1, 0, 0))
    for p in (gable_trim_out.geoms if hasattr(gable_trim_out, 'geoms') else [gable_trim_out]):
        prism_sides(O, 'TR-K4-G01', None, 'trim', '-', TRIM_EXT, p.exterior, lambda y, z: (X_EO, y, z), lambda y, z: (X_EO + B.TRIM_T, y, z), inward_center=ring_center3(p.exterior, lambda y, z: (37, y, z)))

    # ---- the north wall: the middle bedroom's window filled (the fireplace stands there), the closet paint repainted
    w8 = ob['WN-L1-08']; w8r = sbox(w8['center'][0] - 3.4, 1.2, w8['center'][0] + 3.4, 7.2)
    rep['north'] = cut_wall(['W-L1-021', 'W-L1-020'], 'W-L1-K4N', 1, Y_N, -1, 32.487, 1, [w8r], Polygon(), Polygon(), lambda c: 8.05, 0,
                            extra_in=sbox(23.95, 0, 24.35, ceil_z(Y_N)))
    # ---- the south wall: the picture window becomes a folding glass wall to the deck
    w3 = ob['WN-L1-03']; w3r = sbox(w3['center'][0] - w3['width'] / 2 - 0.4, 1.2, w3['center'][0] + w3['width'] / 2 + 0.4, 8.0)
    nana = sbox(NANA['x0'], 0.0, NANA['x1'], NANA['head']); nana_out = mitre(nana, B.TRIM_W).intersection(sbox(0, 0.0, 99, 99))
    rep['south'] = cut_wall(['W-L1-002'], 'W-L1-K4S', 1, Y_S, 1, Y_SO, -1, [w3r], nana, nana_out, lambda c: 8.2, 0)
    # returns, head and jamb trim of the big opening (the panels themselves are the page's: they fold)
    ring = Polygon([(NANA['x0'], 0), (NANA['x1'], 0), (NANA['x1'], NANA['head']), (NANA['x0'], NANA['head'])])
    cen = (25.0, 4.6, 3.0)
    for a, b_, mat, grp_, st in ((Y_S, 4.62, PAINT, 'openings', 'L1'), (4.62, Y_SO - B.TRIM_T, 'steel-black', 'openings', 'L1')):
        pts = [(NANA['x0'], 0), (NANA['x0'], NANA['head']), (NANA['x1'], NANA['head']), (NANA['x1'], 0)]
        for (u0, v0), (u1, v1) in zip(pts[:-1], pts[1:]):
            q = [(u0, a, v0), (u1, a, v1), (u1, b_, v1), (u0, b_, v0)]; n = np.cross(np.subtract(q[1], q[0]), np.subtract(q[3], q[0])); n = n / np.linalg.norm(n)
            if np.dot(n, np.subtract(cen, np.mean(q, 0))) < 0: n = -n
            O.tri(grp_, st, mat, 'D-L1-K4F', None, [q[0], q[1], q[2]], n); O.tri(grp_, st, mat, 'D-L1-K4F', None, [q[0], q[2], q[3]], n)
    tr = nana_out.difference(nana)
    plane_face(O, 'TR-K4-F01', None, 'trim', '-', TRIM_EXT, tr, lambda x, z: (x, Y_SO - B.TRIM_T, z), (0, -1, 0))
    prism_sides(O, 'TR-K4-F01', None, 'trim', '-', TRIM_EXT, nana_out.exterior, lambda x, z: (x, Y_SO, z), lambda x, z: (x, Y_SO - B.TRIM_T, z), inward_center=(25, 4.4, 3.8))
    # threshold track under the panels
    for x0, x1, y0, y1 in ((NANA['x0'], NANA['x1'], 4.45, 4.75),):
        plane_face(O, 'D-L1-K4F', None, 'openings', 'L1', 'steel-black', sbox(x0, y0, x1, y1), lambda x, y: (x, y, 0.012), (0, 0, 1))

    # ---- the deck: the porch deck carried along the great room, the steps narrowed, cable railing on the new edges
    dk = E['SL-DK-FRONT']
    for t in dk:   # the porch deck as built, its east skirt dropped where the new deck continues
        c = t['v'].mean(0)
        if abs(c[0] - DECK['x0']) < 0.08 and abs(t['n'][0]) > 0.9 and c[1] > DECK['y0'] - 0.1: continue
        O.tri(t['group'], t['storey'], t['material'], 'SL-DK-K4', t['boundary'] and ('K4-' + t['boundary']), t['v'], t['n'])
    dpoly = sbox(DECK['x0'], DECK['y0'], DECK['x1'], Y_SO)
    top = [t for t in dk if t['n'][2] > 0.9]; deck_mat = top[0]['material']; skirt_mat = 'deck-skirt'
    plane_face(O, 'SL-DK-K4', None, 'site', 'L1', deck_mat, dpoly, lambda x, y: (x, y, DECK['z']), (0, 0, 1))
    for (a, b_) in (((DECK['x0'], DECK['y0']), (DECK['x1'], DECK['y0'])), ((DECK['x1'], DECK['y0']), (DECK['x1'], Y_SO))):
        q = [(a[0], a[1], DECK['z']), (b_[0], b_[1], DECK['z']), (b_[0], b_[1], DECK['skirt']), (a[0], a[1], DECK['skirt'])]
        n = np.cross(np.subtract(q[1], q[0]), np.subtract(q[3], q[0])); n = n / np.linalg.norm(n)
        if np.dot(n, np.subtract((24, 0, -2), np.mean(q, 0))) > 0: n = -n
        O.tri('site', 'L1', skirt_mat, 'SL-DK-K4', None, [q[0], q[1], q[2]], n); O.tri('site', 'L1', skirt_mat, 'SL-DK-K4', None, [q[0], q[2], q[3]], n)
    # steps: the same treads and rail, the run narrowed from 10 ft to 6 ft (they now start at the deck's south edge)
    s0, s1 = STAIR_Y; ns0, ns1 = s0, DECK['y0']; sy = lambda y: ns0 + (y - s0) * (ns1 - ns0) / (s1 - s0)
    rep['stairs'] = copy_el('ST-FRONT', 'ST-FRONT-K4', lambda p: (p[0], sy(p[1]), p[2]), lambda n: np.array(n))
    copy_el('RL-FRONT-STAIR', 'RL-FRONT-STAIR-K4', lambda p: (p[0], p[1] + DECK['y0'], p[2]), lambda n: np.array(n))
    # cable railing: the porch's own rail section, repeated along the deck's south and east edges
    R = E['RL-FRONT-DECK']; RV = np.concatenate([t['v'] for t in R]); ry0, ry1 = RV[:, 1].min(), RV[:, 1].max(); rx = (RV[:, 0].min() + RV[:, 0].max()) / 2; L = ry1 - ry0
    def rail_run(el, a, b_):
        dx, dy = b_[0] - a[0], b_[1] - a[1]; Ln = math.hypot(dx, dy); n = max(1, round(Ln / L)); ang = math.atan2(dy, dx) - math.pi / 2
        ca, sa = math.cos(ang), math.sin(ang)
        for k in range(n):
            s = Ln / n; f = s / L; ox, oy = a[0] + dx / Ln * s * k, a[1] + dy / Ln * s * k
            def fx(p, ox=ox, oy=oy, f=f):
                lx, ly = p[0] - rx, (p[1] - ry0) * f; return (ox + lx * ca - ly * sa, oy + lx * sa + ly * ca, p[2])
            fn = lambda nn: np.array([nn[0] * ca - nn[1] * sa, nn[0] * sa + nn[1] * ca, nn[2]])
            for t in R: O.tri(t['group'], t['storey'], t['material'], el, None, np.array([fx(p) for p in t['v']]), fn(t['n']))
    rail_run('RL-DECK-K4S', (19.88, DECK['y0']), (DECK['x1'] - 0.15, DECK['y0']))
    rail_run('RL-DECK-K4E', (DECK['x1'] - 0.15, DECK['y0']), (DECK['x1'] - 0.15, 4.0))

    # ---- fireplace: plaster surround from floor to the sloped ceiling, black firebox and glass, fir mantel beam; vent cap outside
    fx0, fx1, fy = FP['cx'] - FP['w'] / 2, FP['cx'] + FP['w'] / 2, Y_N - FP['d']
    bw, bz0, bz1 = FP['box']; bx0, bx1 = FP['cx'] - bw / 2, FP['cx'] + bw / 2
    front = Polygon([(fx0, 0), (fx1, 0), (fx1, ceil_z(fy) - 0.003), (fx0, ceil_z(fy) - 0.003)]).difference(sbox(bx0, bz0, bx1, bz1))
    plane_face(O, 'FP-L1-K4', None, 'walls', 'L1', PAINT, front, lambda x, z: (x, fy, z), (0, -1, 0))
    for x, s in ((fx0, -1), (fx1, 1)):
        side = Polygon([(fy, 0), (Y_N, 0), (Y_N, ceil_z(Y_N) - 0.003), (fy, ceil_z(fy) - 0.003)])
        plane_face(O, 'FP-L1-K4', None, 'walls', 'L1', PAINT, side, lambda y, z, x=x: (x, y, z), (s, 0, 0))
    inset = 0.9
    for poly, to3, n in ((sbox(bx0, bz0, bx1, bz1), lambda x, z: (x, fy + inset, z), (0, -1, 0)),):
        plane_face(O, 'FP-L1-K4', None, 'openings', 'L1', 'steel-black', poly, to3, n)
    box_ring = Polygon([(bx0, bz0), (bx1, bz0), (bx1, bz1), (bx0, bz1)])
    prism_sides(O, 'FP-L1-K4', None, 'openings', 'L1', 'steel-black', box_ring.exterior, lambda x, z: (x, fy, z), lambda x, z: (x, fy + inset, z), inward_center=(FP['cx'], fy + .4, (bz0 + bz1) / 2), outward=False)
    plane_face(O, 'FP-L1-K4', None, 'glass', 'L1', 'glass', sbox(bx0 + .02, bz0 + .02, bx1 - .02, bz1 - .02), lambda x, z: (x, fy + 0.06, z), (0, -1, 0))
    # embers / burner glow strip and a dark hearth plate
    plane_face(O, 'FP-L1-K4', None, 'openings', 'L1', 'steel-black', sbox(fx0 - 0.25, fy - 1.2, fx1 + 0.25, fy), lambda x, y: (x, y, 0.004), (0, 0, 1))
    mz0, mz1 = FP['mantel'], FP['mantel'] + 0.5
    mb = [(fx0 - 0.3, fy - 0.55), (fx1 + 0.3, fy - 0.55), (fx1 + 0.3, fy), (fx0 - 0.3, fy)]
    plane_face(O, 'FP-L1-K4', None, 'ceilings', 'L1', 'fir-beam', Polygon(mb), lambda x, y: (x, y, mz1), (0, 0, 1))
    plane_face(O, 'FP-L1-K4', None, 'ceilings', 'L1', 'fir-beam', Polygon(mb), lambda x, y: (x, y, mz0), (0, 0, -1))
    prism_sides(O, 'FP-L1-K4', None, 'ceilings', 'L1', 'fir-beam', Polygon(mb).exterior, lambda x, y: (x, y, mz0), lambda x, y: (x, y, mz1), inward_center=(FP['cx'], fy - .27, (mz0 + mz1) / 2))
    vc = sbox(FP['cx'] - 0.6, 5.0, FP['cx'] + 0.6, 6.2)
    plane_face(O, 'FP-L1-K4', None, 'trim', '-', 'steel-black', vc, lambda x, z: (x, 32.487 + 0.35, z), (0, 1, 0))
    prism_sides(O, 'FP-L1-K4', None, 'trim', '-', 'steel-black', vc.exterior, lambda x, z: (x, 32.487, z), lambda x, z: (x, 32.487 + 0.35, z), inward_center=(FP['cx'], 32.6, 5.6))

    # ---- skylight wells: the roof is re-made with the openings cut, drywall wells from the ceiling up through the roof, curbs + glass
    RF = E['RF-MAIN']; sk_plan = unary_union([sbox(s[0], s[2], s[1], s[3]) for s in SKY]); nr = 0
    for t in RF:
        v = t['v']; c = v.mean(0); P = Polygon(v[:, :2])
        if abs(t['n'][2]) > 0.5 and P.area > 1e-6 and P.intersects(sk_plan):
            A = np.c_[np.ones(3), v[:, 0], v[:, 1]]
            try: co = np.linalg.solve(A, v[:, 2])
            except Exception: co = None
            if co is not None:
                rest = P.difference(sk_plan)
                plane_face(O, 'RF-MAIN-K4', t['boundary'] and ('K4-' + t['boundary']), t['group'], t['storey'], t['material'], rest, lambda x, y, co=co: (x, y, co[0] + co[1] * x + co[2] * y), t['n']); nr += 1; continue
        O.tri(t['group'], t['storey'], t['material'], 'RF-MAIN-K4', t['boundary'] and ('K4-' + t['boundary']), v, t['n'])
    rep['roof_cut'] = nr
    for i, (x0, x1, y0, y1) in enumerate(SKY):
        el = 'SK-L1-K4%d' % (i + 1); curb = 0.45
        ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        for (ax, ay), (bx, by) in zip(ring, ring[1:] + ring[:1]):
            q = [(ax, ay, ceil_z(ay)), (bx, by, ceil_z(by)), (bx, by, ROOF_TOP(by) + curb), (ax, ay, ROOF_TOP(ay) + curb)]
            n = np.cross(np.subtract(q[1], q[0]), np.subtract(q[3], q[0])); n = n / np.linalg.norm(n)
            if np.dot(n, np.subtract(((x0 + x1) / 2, (y0 + y1) / 2, 0), np.mean(q, 0))[:2].tolist() + [0]) < 0: n = -n
            O.tri('ceilings', 'L1', 'gwb-l5#paint-ceiling-flat', el, None, [q[0], q[1], q[2]], n); O.tri('ceilings', 'L1', 'gwb-l5#paint-ceiling-flat', el, None, [q[0], q[2], q[3]], n)
            qo = [(ax, ay, ROOF_TOP(ay)), (bx, by, ROOF_TOP(by)), (bx, by, ROOF_TOP(by) + curb), (ax, ay, ROOF_TOP(ay) + curb)]
            O.tri('roofs', 'L1', 'skylight-frame', el, None, [qo[0], qo[1], qo[2]], -n); O.tri('roofs', 'L1', 'skylight-frame', el, None, [qo[0], qo[2], qo[3]], -n)
        gz = lambda x, y: (x, y, ROOF_TOP(y) + curb)
        plane_face(O, el, None, 'roofs', 'L1', 'skylight-frame', sbox(x0, y0, x1, y1).difference(sbox(x0 + .2, y0 + .2, x1 - .2, y1 - .2)), gz, (0, -PITCH if y0 < RIDGE_Y else PITCH, 1))
        plane_face(O, el, None, 'glass', '-', 'skylight-glass', sbox(x0 + .2, y0 + .2, x1 - .2, y1 - .2), lambda x, y: (x, y, ROOF_TOP(y) + curb - 0.02), (0, -PITCH if y0 < RIDGE_Y else PITCH, 1))
        plane_face(O, el, None, 'glass', '-', 'skylight-glass', sbox(x0 + .2, y0 + .2, x1 - .2, y1 - .2), lambda x, y: (x, y, ROOF_TOP(y) + curb - 0.04), (0, PITCH if y0 < RIDGE_Y else -PITCH, -1))

    # ---- baseboards: as in the first concept, the north one stops at the fireplace, the south one at the opening
    def stretch(src, dst, axis, a0, a1):
        ts = E[src]; vals = np.concatenate([t['v'][:, axis] for t in ts]); lo, hi = vals.min(), vals.max()
        for t in ts:
            v = t['v'].copy(); v[:, axis] = np.where(np.abs(v[:, axis] - lo) < np.abs(v[:, axis] - hi), a0 + (v[:, axis] - lo), a1 - (hi - v[:, axis]))
            O.tri(t['group'], t['storey'], t['material'], dst, None, v, t['n'])
    stretch('TR-0250', 'TR-K4-BB1', 1, 4.852, Y_N)
    stretch('TR-0211', 'TR-K4-BB2', 0, 15.82, fx0)
    stretch('TR-0211', 'TR-K4-BB4', 0, fx1, X_E)
    stretch('TR-0167', 'TR-K4-BB5', 0, 16.10, NANA['x0'])
    stretch('TR-0167', 'TR-K5-BB6', 0, 13.05, 16.12)       # v2: the south wall behind the piano
    bb = E['TR-0201'][0]                                    # v2: square baseboard pieces at the new wall faces
    for i, (x0, y0, x1, y1) in enumerate(((X_LW, 22.0, X_LW + 0.07, 22.41), (X_BW, Y_HB - 0.07, X_W + 0.07, Y_HB), (X_W, Y_HB - 0.07, X_W + 0.07, 25.58))):
        boxel('TR-K5-BB%d' % (i + 7), bb['group'], bb['storey'], bb['material'], x0, y0, 0.0, x1, y1, 0.44, faces='xXyYZ')

    O.write(os.path.join(B2, GLB_OUT))
    rep['meshes'] = len(O.M); rep['tris'] = sum(len(m['idx']) for m in O.M.values())
    elements = sorted(set(r[0] for m in O.M.values() for r in m['ranges'])); bounds = sorted(set(r[1] for m in O.M.values() for r in m['ranges'] if r[1]))
    return meta, hide, hide_ranges, elements, bounds, rep

def option_data(meta, elements, bounds):
    D = B.option_data(meta, elements, bounds)                    # the first concept's data: spaces, walkable, colliders, openings...
    D['source'] = {'builder': 'tour/bim2/tools/build_open4k.py', 'options': {'OS-REMODEL': LEGACY}, 'note': LABEL}
    sp = []
    for s in D['spaces']:
        if s['id'] in REMOVED_SPACES2: continue                    # v2: the bedroom hall is part of the library now
        if s['id'] == GREAT: s['name'] = 'Kitchen, living & dining'
        if s['id'] == LIB:                                         # r43: the old kitchen; v2: with the hall, vaulted through
            s = json.loads(json.dumps(s)); s['name'] = 'Library'; s['polygon'] = [list(q) for q in LIBPOLY]; lp = Polygon(LIBPOLY)
            s['ceiling'] = {'form': 'VAULT_ROOF', 'height': None, 'planes': [
                {'poly': [list(q) for q in lp.intersection(sbox(0, 0, 60, RIDGE_Y)).exterior.coords[:-1]], 'holes': [], 'P': {'c': C_S, 'gx': 0, 'gy': PITCH}},
                {'poly': [list(q) for q in lp.intersection(sbox(0, RIDGE_Y, 60, 60)).exterior.coords[:-1]], 'holes': [], 'P': {'c': C_N, 'gx': 0, 'gy': -PITCH}}]}
        sp.append(s)
    D['spaces'] = sp
    # walkable: the deck and the narrowed steps; the floor out through the folding wall
    wk = [w for w in D['walkable'] if w['id'] not in ('SL-DK-FRONT', 'FL-SP-L1-OPEN4', 'FL-SP-L1-KITCHEN', 'FL-SP-L1-HALL') and w.get('element') != 'ST-FRONT' and w.get('opening') not in REMOVED_OPENINGS]
    wk.append({'id': 'FL-SP-L1-OPEN4K', 'element': 'FL-SP-L1-OPEN4K', 'kind': 'FLOOR', 'space': GREAT, 'storey': 'L1', 'poly': [list(p) for p in ROOM2], 'holes': [], 'z': 0, 'exterior': False})
    wk.append({'id': 'TH-D-L1-K4F', 'element': 'D-L1-K4F', 'kind': 'THRESHOLD', 'opening': 'D-L1-K4F', 'storey': 'L1', 'poly': [[NANA['x0'], Y_SO], [NANA['x1'], Y_SO], [NANA['x1'], Y_S], [NANA['x0'], Y_S]], 'z': 0, 'exterior': False})
    wk.append({'id': 'SL-DK-K4', 'element': 'SL-DK-K4', 'kind': 'DECK',   # a new id: the page keys walkable floors by id, so a reused id keeps only the as-built deck
                'poly': [[2.85, -10.087], [DECK['x0'], -10.087], [DECK['x0'], DECK['y0']], [DECK['x1'], DECK['y0']], [DECK['x1'], Y_SO], [2.85, Y_SO]], 'z': 0, 'storey': 'L1', 'exterior': True})
    s0, s1 = STAIR_Y; sy = lambda y: s0 + (y - s0) * (DECK['y0'] - s0) / (s1 - s0)
    for w in meta['walkable']:
        if w.get('element') == 'ST-FRONT':
            w = json.loads(json.dumps(w)); w['poly'] = [[p[0], round(sy(p[1]), 4)] for p in w['poly']]; w['id'] = w['id'] + '-K4'; w['element'] = 'ST-FRONT-K4'; wk.append(w)
    D['walkable'] = wk
    # colliders: the south wall split around the opening (the page adds the panels' own); the porch rail moves; new rails
    # (the page keys colliders by element: a changed collider must carry a new element id, or the as-built one keeps colliding)
    col = []
    for c in D['colliders']:
        if c.get('element') == 'RL-FRONT-DECK': continue
        if c.get('element') in REMOVED_WALLS2: continue             # v2: the hall walls (their door's own collider is the page's: REMOVED_OPENINGS)
        if c.get('element') == 'RL-FRONT-STAIR':
            c = json.loads(json.dumps(c)); c['poly'] = [[p[0], p[1] + DECK['y0']] for p in c['poly']]
            c['element'] = 'RL-FRONT-STAIR-K4'; c['id'] = c['id'].replace('RL-FRONT-STAIR', 'RL-FRONT-STAIR-K4')
        if c.get('element') == 'W-L1-002':
            for i, (a, b_) in enumerate(((4.91, NANA['x0']), (NANA['x1'], 32.49))):
                d = json.loads(json.dumps(c)); d['id'] = 'W-L1-K4S#%d' % i; d['element'] = 'W-L1-K4S'; d['poly'] = [[a, 4.40], [b_, 4.40], [b_, 4.81], [a, 4.81]]; col.append(d)
            continue
        col.append(c)
    for i, (a, b_) in enumerate((((19.88, DECK['y0'] - .1), (DECK['x1'], DECK['y0'] + .1)), ((DECK['x1'] - .25, DECK['y0']), (DECK['x1'] + .05, Y_SO)))):
        col.append({'id': 'RL-DECK-K4#%d' % i, 'element': 'RL-DECK-K4', 'kind': 'RAIL', 'poly': [[a[0], a[1]], [b_[0], a[1]], [b_[0], b_[1]], [a[0], b_[1]]], 'z0': 0, 'z1': 3.1, 'storey': 'L1', 'exterior': True})
    # v2: the bath's south-east corner (the end of the removed wall, rebuilt as part of the bath's walls) and the beam's west post
    col.append({'id': 'W-L1-K5C#0', 'element': 'W-L1-K5C', 'kind': 'WALL', 'poly': [[X_BW, Y_HB], [X_W, Y_HB], [X_W, Y_BC], [X_BW, Y_BC]], 'z0': 0, 'z1': round(ceil_z(Y_HB), 4), 'storey': 'L1', 'exterior': False})
    col.append({'id': 'PT-L1-K5W#0', 'element': 'PT-L1-K5W', 'kind': 'WALL', 'poly': [[POST[0], POST[2]], [POST[1], POST[2]], [POST[1], POST[3]], [POST[0], POST[3]]], 'z0': 0, 'z1': round(KB_Z0, 4), 'storey': 'L1', 'exterior': False})
    D['colliders'] = col
    # openings: no picture window, no north window, the folding glass wall (leaf kind FOLD: the page builds and folds its panels), skylights
    ops = [o for o in D['openings'] if o['id'] not in ('WN-L1-O4A', 'WN-L1-O4B', 'WN-L1-03', 'WN-L1-08', 'D-L1-06') and not o['id'].startswith('WN-L1-O4G')]
    for o in ops:                                                   # v2: the bedroom's and the bath's doors open onto the library
        if o['id'] == 'D-L1-02':                                    # the bath door becomes a pocket door sliding east into its wall: no leaf standing open toward the room
            end = 'END' if (o.get('axis') or [1, 0])[0] > 0 else 'START'
            o['type'] = 'DT-INT-POCKET (concept)'; o['leaf'] = dict(o.get('leaf') or {}, kind='POCKET', hingeEnd=end); o['leaves'] = [dict(l, kind='POCKET', hingeEnd=end) for l in (o.get('leaves') or [])]
        for k in ('A', 'B'):
            if (o.get('spaces') or {}).get(k) in REMOVED_SPACES2: o['spaces'][k] = LIB
    base = {o['id']: o for o in meta['openings']}
    kw = json.loads(json.dumps(base[KWIN_SRC])); kw.update({'id': 'WN-L1-K4A', 'host': 'W-L1-K4E', 'center': [36.7855, RIDGE_Y], 'axis': [0, -1], 'normal': [1, 0], 'spaces': {'A': 'EXTERIOR', 'B': GREAT}})
    ops.append(kw)
    for i, (a, b_) in enumerate(B.GABLE_PANES):
        head = max(ceil_z(a), ceil_z(b_)) - B.GABLE_TOPGAP
        ops.append({'id': 'WN-L1-K4G%d' % (i + 1), 'class': 'IfcWindow', 'type': 'WN-GABLE-FIXED (concept)', 'host': 'W-L1-K4E', 'storey': 'L1', 'center': [36.7855, (a + b_) / 2], 'sill': B.GABLE_SILL,
                    'head': round(head, 4), 'width': round(b_ - a, 4), 'spaces': {'A': 'EXTERIOR', 'B': GREAT}, 'axis': [0, -1], 'normal': [1, 0], 'thickness': 0.4011, 'exterior': True, 'glazed': 1, 'leaf': None, 'leaves': [], 'shape': 'sloped-top'})
    ops.append({'id': 'D-L1-K4F', 'class': 'IfcDoor', 'type': 'DT-EXT-FOLDING-GLASS (concept, NanaWall-style)', 'host': 'W-L1-K4S', 'storey': 'L1', 'center': [(NANA['x0'] + NANA['x1']) / 2, 4.6046],
                'sill': 0, 'head': NANA['head'], 'width': NANA['x1'] - NANA['x0'], 'spaces': {'A': 'EXTERIOR', 'B': GREAT}, 'axis': [-1, 0], 'normal': [0, -1], 'thickness': 0.4011, 'exterior': True, 'glazed': 1,
                'leaf': {'kind': 'FOLD', 'panels': NANA['panels'], 'stack': 'east', 'state': 'open', 'plane': 4.60, 'frame': 'steel-black'}, 'leaves': []})
    for i, (x0, x1, y0, y1) in enumerate(SKY):
        ops.append({'id': 'SK-L1-K4%d' % (i + 1), 'class': 'IfcWindow', 'type': 'SKYLIGHT (concept)', 'kind': 'SKYLIGHT', 'host': 'RF-MAIN-K4', 'storey': 'L1', 'center': [(x0 + x1) / 2, (y0 + y1) / 2],
                    'width': x1 - x0, 'sill': ceil_z(y0), 'head': ceil_z(y1), 'spaces': {'A': 'EXTERIOR', 'B': LIB if x1 < X_W else GREAT}, 'exterior': True, 'glazed': 1, 'skylight': True})
    D['openings'] = ops
    D['furnishings'] = [f for f in meta['furnishings'] if f['id'] not in REMOVED_FURN and not f['id'].startswith('KX-')] + kitchen() + staging()   # r43: no old kitchen
    D['lights'] = [l for l in meta['lights'] if l['id'] not in REMOVED_LIGHTS] + new_cans(meta)
    D['boundaries'] = {b: (LIB if b.startswith('B-K5-') else GREAT) for b in bounds}
    cut = {e: GREAT for e in elements}
    for e in elements:
        if e in ('W-L1-K5P', 'PT-L1-K5W') or e.startswith('TR-K5-'): cut[e] = LIB
    for e in ('BM-L1-OPEN4K', 'RF-MAIN-K4', 'SL-DK-K4', 'ST-FRONT-K4', 'RL-FRONT-STAIR-K4', 'RL-DECK-K4S', 'RL-DECK-K4E'): cut[e] = '@L1'
    for b in bounds: cut[b] = D['boundaries'][b]
    D['cut'] = cut
    return D

def new_cans(meta):
    t = next(l for l in meta['lights'] if l['id'] == 'LF-L1-139'); out = []; k = 0
    sk = [sbox(s[0] - .6, s[2] - .6, s[1] + .6, s[3] + .6) for s in SKY]
    for x in (15.48, 20.67, 25.85, 31.04):
        for y in (7.27, 11.16, 15.24, 21.65, 25.73, 29.62):
            if x == 15.48 and y < Y_KIT: continue
            if any(b.contains(shapely.Point(x, y)) for b in sk): continue
            if 33.9 < x and 29 < y: continue
            if any(abs(x - px) < 1.0 and abs(y - DINE['y']) < 1.0 for px in DINE['pend']): continue   # a pendant hangs there
            k += 1; out.append(dict(t, id='LF-L1-K4-%02d' % k, at=[x, y, round(ceil_z(y), 4)], ceilingZ=round(ceil_z(y), 4), space=GREAT))
    for x in (6.9, 12.9):                                           # v2: over the old hall, by the bedroom and bath doors
        k += 1; out.append(dict(t, id='LF-L1-K4-%02d' % k, at=[x, 24.2, round(ceil_z(24.2), 4)], ceilingZ=round(ceil_z(24.2), 4), space=LIB))
    return out

def kitchen():
    """the new kitchen at the street end, in the house's own cabinetry (white raised-panel shaker, satin nickel, Brittanicca quartz)"""
    F = []; CAB = {'counter': None, 'faucet': False, 'hw': 'satinNickel', 'pull': 'bar', 'sink': False, 'style': 'raised'}
    def add(kind, lib, at, rot, params):
        F.append({'id': 'KX-K4-%02d' % (len(F) + 1), 'type': 'FXT-' + kind, 'render': {'kind': kind, 'lib': lib}, 'at': [round(at[0], 3), round(at[1], 3), 0], 'rot': rot, 'space': GREAT, 'storey': 'L1', 'params': params, 'footprint': None})
    E = X_E; N = Y_N; NF = N - 2.08                      # NF: the north run's counter front
    # v2 work triangle: the fridge stands at the room end of the range wall (a drink is fetched without crossing the cook), the range
    # 5 ft from it, and the island has a prep sink at that end: fridge, prep sink and range are each 5 to 6-1/2 ft apart. The sink
    # under the window and the dishwasher on the gable wall are the clean-up side.
    # street-gable run (backs on the gable, facing west), south to north: two tall pantry cabinets, drawers, the sink under the
    # window, dishwasher, drawers, cabinets into the corner
    add('tallCabinet', 'FIX', (E, 6.1), 180, dict(CAB, d=2, h=8, w=2.5, pull='knob'))
    add('tallCabinet', 'FIX', (E, 8.6), 180, dict(CAB, d=2, h=8, w=2.5, pull='knob', hinge='right'))
    add('baseCabinet', 'FIX', (E, 11.35), 180, dict(CAB, w=3.0, doors='drawers'))
    add('baseCabinet', 'FIX', (E, 14.15), 180, dict(CAB, w=2.6))
    add('baseCabinet', 'FIX', (E, 16.2), 180, dict(CAB, w=1.5))
    add('baseCabinet', 'FIX', (E, RIDGE_Y), 180, dict(CAB, w=3.0, doors='sink', pull='knob'))
    add('sinkUndermount', 'FIX', (E - 0.38, RIDGE_Y), 180, {'d': 1.5, 'mountY': 2.896, 'w': 2.5})
    add('faucetKitchen', 'FIX', (E - 0.22, RIDGE_Y), 180, {'mountY': 3})
    add('dishwasher', 'FIX', (E, 20.946), 180, {'w': 2})
    add('baseCabinet', 'FIX', (E, 23.446), 180, dict(CAB, w=3.0, doors='drawers'))
    add('baseCabinet', 'FIX', (E, 25.948), 180, dict(CAB, w=2.0))
    add('baseCabinet', 'FIX', (E, 28.475), 180, dict(CAB, w=3.05))
    add('upperCabinet', 'FIX', (E, 12.35), 180, dict(CAB, h=3.5, mountY=4.5, w=5.0, pull='knob', led=True))
    add('upperCabinet', 'FIX', (E, 24.5), 180, dict(CAB, h=3.5, mountY=4.5, w=4.8, pull='knob', led=True))
    add('upperCabinet', 'FIX', (E, 28.45), 180, dict(CAB, h=3.5, mountY=4.5, w=3.1, pull='knob', led=True))
    # north wall (facing south), west to east: the 36-in fridge at the room end, drawers, the 36-in range with a chimney hood,
    # a cabinet, the corner cabinet
    add('fridge4Door', 'BUILTIN', (26.5, N), 270, {'d': 2.5, 'dispenser': True, 'h': 5.9, 'w': 3})
    add('upperCabinet', 'FIX', (26.5, N), 270, dict(CAB, d=2, h=1.9, mountY=6.1, w=3, pull='knob'))
    add('finishedPanel', 'BUILTIN', (25.0, N - 1.25), 180, {'w': 2.5, 'h': 8.0, 'panels': 1})   # the fridge's side toward the living area: a full-height panelled end
    add('baseCabinet', 'FIX', (29.0, N), 270, dict(CAB, w=2.0, doors='drawers'))
    add('range36', 'FIX', (31.5, N), 270, {'w': 3})
    add('hoodChimney', 'FIX', (31.5, N), 270, {'mountY': 6.0, 'toCeiling': 8.0, 'w': 3.5})
    add('baseCabinet', 'FIX', (33.75, N), 270, dict(CAB, w=1.5))
    add('baseCabinet', 'FIX', (E - 1.0425, N), 270, dict(CAB, w=2.085))
    add('upperCabinet', 'FIX', (28.875, N), 270, dict(CAB, h=3.5, mountY=4.5, w=1.75, pull='knob', led=True))
    add('upperCabinet', 'FIX', (34.9, N), 270, dict(CAB, h=3.5, mountY=4.5, w=3.3, pull='knob', led=True))
    # counters: quartz on the gable run from the pantries into the corner, and on the north run from the fridge to the corner
    sink_hole = [[E - 1.65, RIDGE_Y - 1.2], [E - 0.35, RIDGE_Y - 1.2], [E - 0.35, RIDGE_Y + 1.2], [E - 1.65, RIDGE_Y + 1.2]]
    add('counterTop', 'BUILTIN', (E - 1.04, 18.4), 0, {'mat': 'brittanicca', 'mountY': 2.896, 'outlines': [[[E - 2.08, 9.85], [E, 9.85], [E, NF], [E - 2.08, NF]]],
        'holes': [sink_hole], 'splash': 0.33, 't': 0.104})
    add('counterTop', 'BUILTIN', (32.3, N - 1.04), 0, {'mat': 'brittanicca', 'mountY': 2.896, 'outlines': [[[28.0, NF], [E, NF], [E, N], [28.0, N]]],
        'holes': [[[30.0, NF], [33.0, NF], [33.0, N], [30.0, N]]], 'splash': 0.33, 't': 0.104})
    # the island: 12 ft x 4.5 ft, working side to the kitchen, four stools on the room side
    add('island', 'FIX', (31.0, 19.5), 180, dict(CAB, w=12.0, d=4.5, seatingSide='front', overhang=1.25, counter='quartz', cabDepth=2, sink=True, sinkEnd=-1))   # v2: a prep sink at the north end, by the range and the fridge
    for y in (16.6, 19.0, 21.4, 23.8):                             # clear of the dining table's chairs
        add('counterStoolRope', 'BUILTIN', (25.75, y), 0, None)
    return F

def staging():
    F = []
    def add(kind, at, rot, params=None, lib='STAGE', key=None, on=None, dx=0, dz=0, back=False, z=0):
        f = {'id': 'FX-K4-%02d' % (len(F) + 1), 'type': 'FXT-' + kind, 'render': {'kind': kind, 'lib': lib}, 'at': [round(at[0], 3), round(at[1], 3), z], 'rot': rot, 'space': GREAT, 'storey': 'L1', 'params': params or None, 'footprint': None}
        if key: f['stageKey'] = key
        if on: f['stageOn'] = on; f['stageDx'] = dx; f['stageDz'] = dz
        if back: f['stageBack'] = True
        F.append(f); return f
    # island: a footed bowl, two opal globes from the ridge beam
    for x in (27.6, 30.0):
        add('pendantGlobe', (x, RIDGE_Y), 0, {'dia': 1.05, 'drop': round(KB_Z0 - 6.95, 3), 'finish': 'blackMetal', 'cord': 'rod'}, z=KB_Z0)
    # living, anchored on the fireplace: a cream sofa facing it, a woven ottoman, a boucle chair on the kitchen side, built-ins either
    # side of the fire; the upright piano stands on the bath's wall (an inside wall, away from the sun and the folding wall), so the
    # room's music is by the fire and the pianist is part of the group
    cx = FP['cx']
    add('rug2', (cx + 0.4, 25.85), 0, {'w': 7.3, 'd': 7.6, 'pattern': 'checker'})
    add('sofa3', (cx, 22.3), 90, {'w': 7.0, 'fabric': 'linenCream', 'pillows': False}, key='sofa')   # 7 ft from the fire; the way from the bedroom and bath passes behind it
    add('pillows', (0, 0), 90, {'mountY': 1.42, 'lean': -.3, 'items': [['pillowSlate', -2.1, 1.45, 1.45, .12], ['pillowCream', -0.8, 1.45, 1.45, -.05], ['pillowGreyLinen', 0.9, 1.45, 1.45, -.1], ['pillowSlate', 2.1, 1.45, 1.45, -.12]]}, on='sofa').update({'stageZ': .95})
    add('ottomanRound', (cx + 0.9, 26.3), 0, {}, key='ot')
    add('orchid', (0, 0), 0, {'h': 1.7, 'stems': 3, 'seed': 4}, on='ot', dx=-.35)
    add('books', (0, 0), 0, {'n': 3}, on='ot', dx=.6, dz=.3)
    add('armchairBoucle', (23.6, 26.9), 180, {'fabric': 'fabricLight'})
    add('pianoUpright', (X_W, 28.05), 0, {}, back=True)
    add('pianoBench', (X_W + 3.3, 28.05), 0, {})
    add('art', (X_W, 28.05), 0, {'w': 3.4, 'h': 2.2, 'mountY': 6.5, 'style': 'brush', 'seed': 4}, back=True)
    add('builtinBookcase', (cx - FP['w'] / 2 - 1.2, Y_N), 270, {'boxes': 1, 'counter': None, 'crown': False, 'd': 1, 'density': 0.85, 'doorsPerBox': 2, 'fill': 'books', 'h': 3, 'levels': [5, 6.25], 'lights': False, 'seed': 5, 'shelfD': 1, 'shelfMat': 'maple', 'shelfT': 0.125, 'sidePanels': True, 'w': 2.3}, lib='BUILTIN')
    add('builtinBookcase', (cx + FP['w'] / 2 + 1.3, Y_N), 270, {'boxes': 1, 'counter': None, 'crown': False, 'd': 1, 'density': 0.85, 'doorsPerBox': 2, 'fill': 'books', 'h': 3, 'levels': [5, 6.25], 'lights': False, 'seed': 9, 'shelfD': 1, 'shelfMat': 'maple', 'shelfT': 0.125, 'sidePanels': True, 'w': 2.5}, lib='BUILTIN')
    # dining along the west half of the folding glass wall, next to the library wall's cabinets (they are its sideboard): the
    # extending oak table at its everyday 8 ft, three chairs a side and one at each end, three globes from the vault. 3 ft behind the
    # chairs on the glass side, 6 ft on the room side; the east half of the glass wall stays clear as the way out to the deck.
    dx0, dy0 = DINE['x'], DINE['y']
    add('diningTable', (dx0, dy0), 90, {'w': DINE['w'], 'd': DINE['d'], 'extW': DINE['ext'], 'extToward': 'west'}, key='dt')
    add('bowl', (0, 0), 90, {'dia': 1.55, 'h': 1.0}, on='dt')
    for ox in (-2.5, 0.0, 2.5):
        add('parsonsChair', (dx0 + ox, dy0 - DINE['d'] / 2 - 0.75), 90); add('parsonsChair', (dx0 + ox, dy0 + DINE['d'] / 2 + 0.75), 270)
    add('parsonsChair', (dx0 - DINE['w'] / 2 - 0.8, dy0), 0); add('parsonsChair', (dx0 + DINE['w'] / 2 + 0.8, dy0), 180)
    for px in DINE['pend']:
        add('pendantGlobe', (px, dy0), 0, {'dia': 0.95, 'drop': round(ceil_z(dy0) - 6.9, 3), 'finish': 'blackMetal', 'cord': 'rod'}, z=round(ceil_z(dy0), 3))
    add('art', (15.4, Y_S), 90, {'w': 3.6, 'h': 2.4, 'mountY': 5.6, 'style': 'blots', 'seed': 7}, back=True)
    # the library (v2): the old kitchen and the bedroom hall, open to the great room under the vault. The west gable wall is shelved
    # floor to vault, the living-room door passing through the books, with a rolling ladder; the ridge beam lands on a post in the
    # middle of it. A deep window seat fills the south window; an upright piano stands between the window seat and the folding glass
    # wall; two reading chairs sit in front of the tall bays, under the new skylight, looking down the room at the fire.
    lc = (LIB_Y0 + LIB_Y1) / 2
    add('libraryWall', (X_OK, lc), 0, {'w': round(LIB_Y1 - LIB_Y0, 3), 'd': 1.0, 'baseD': 1.33, 'baseH': 3.0, 'ridge': round(RIDGE_Y - lc, 3), 'apex': round(APEX - 0.02, 3), 'pitch': PITCH,
        'bays': [[round(a - lc, 3), round(b_ - lc, 3), t] for a, b_, t in LIB_BAYS], 'doorH': 7.3, 'seatH': 1.95, 'rail': 8.0, 'railFrom': round(7.36 - lc, 3), 'ladderX': round(20.75 - lc, 3), 'seed': 21}, lib='BUILTIN')
    WS = 9.55                                                   # the window seat: from the library wall to the window's east casing
    add('windowSeat', (WS, Y_S), 90, {'w': 6.5, 'd': 2.5}, key='seat', back=True)
    add('seatCushion', (0, 0), 90, {'w': 6.4, 'd': 2.45, 'fabric': 'seatGrey'}, on='seat')
    add('pillows', (0, 0), 90, {'mountY': 1.42, 'lean': -.3, 'items': [['pillowCream', -2.4, 1.4, 1.4, .08], ['pillowSlate', -1.2, 1.4, 1.4, -.05], ['pillowGreyLinen', 2.3, 1.4, 1.4, .1]]}, on='seat').update({'stageZ': .05})
    add('books', (0, 0), 90, {'n': 3}, on='seat', dx=1.0, dz=.3)
    add('throwBlanket', (0, 0), 90, {'w': 1.1}, on='seat', dx=-0.4, dz=.7)
    add('rug2', (10.8, 19.0), 0, {'w': 6.4, 'd': 4.8, 'pattern': 'sisal'})
    add('armchairBoucle', (10.6, 17.15), 15, {'fabric': 'fabricLight'})
    add('armchairBoucle', (10.6, 20.9), 345, {'fabric': 'fabricLight'})
    add('drumTable', (10.1, 19.0), 0, {'dia': 1.4, 'h': 1.75}, key='dr')
    add('lamp', (0, 0), 0, {'h': 1.9, 'shadeDia': 1.0}, on='dr')
    add('art', (12.1, Y_HB), 270, {'w': 2.2, 'h': 2.8, 'mountY': 5.0, 'style': 'swirl', 'seed': 12}, back=True)
    # deck: outdoor dining for six, two lounge chairs and a low table, planters at the rail for privacy from the driveway
    add('outdoorDiningTable', (21.0, -0.6), 90, {'w': 7.0, 'd': 3.4}, key='odt')
    for dx in (-2.3, 0.0, 2.3):
        add('outdoorChair', (21.0 + dx, -2.45), 90); add('outdoorChair', (21.0 + dx, 1.25), 270)
    add('outdoorLounge', (27.6, -2.3), 90, {})
    add('outdoorLounge', (27.6, 2.3), 270, {})
    add('outdoorCoffee', (27.6, 0.0), 0, {'w': 2.6, 'd': 1.6})
    for x, y in ((32.95, -3.25), (32.95, -1.3), (16.5, 3.4)):
        add('plantPot', (x, y), 0)
    return F

CARD = {'name': 'Open kitchen and great room', 'short': 'Illustrative idea', 'beds': 4, 'bedrooms': 4, 'baths': 3, 'office': True, 'label': LABEL,
        'description': 'The two bedrooms, the old kitchen and the hall open into one vaulted great room: the kitchen at the street end, a fireplace, skylights, a folding glass wall to a new front deck, and a library wall with a window seat at the other end, a piano by the fire, and a dining table for eight that extends to seat ten. 4 bedrooms, 3 baths, plus office.',
        'note': 'Concept r42b (owner idea, 11/12/2026): as "Open great room", but the kitchen moves to the street end (island facing the room), the old kitchen is taken out (r43); the walls and the door that only served the removed rooms come out too, the ridge beam runs on to the west gable wall, and that end becomes a library: shelves floor to vault with a rolling ladder, a window seat, reading chairs; a piano by the fireplace; dining for eight, ten with the table extended (r43f), the picture window becomes a folding glass wall onto an extended front deck, a gas fireplace on the north wall, five skylight wells. Status: illustrative, not designed or reviewed by an architect or engineer.',
        'status': 'illustrative', 'source': 'concept r42b (tour/CONCEPT-4BR.md)', 'pageExtras': True,
        'restShut': ['D-L1-02']}   # the bath door rests shut while this plan shows (it opens on a tap or as a walker reaches it)

def register(hide, hide_ranges, sha):
    path = os.path.join(B2, 'scene.meta.json'); meta = json.load(open(path))
    e = {'id': OPT_ID, 'legacyId': LEGACY, 'set': 'OS-REMODEL'}; e.update(CARD)
    e.update({'hide': hide, 'hideRanges': hide_ranges, 'glb': GLB_OUT, 'sha256': sha, 'remap': [], 'meta': META_OUT,
              'region': [[-10.5, -1.4], [5.4, -1.4], [5.4, 4.4], [37.0, 4.4], [37.0, 32.5], [5.0, 32.5], [5.0, 27.1], [-7.0, 27.1], [-7.0, 18.85], [-9.95, 18.85]],
              'clearRegion': [[X_OK + 0.05, Y_S - 0.3], [37.3, Y_S - 0.3], [37.3, Y_N + 0.3], [X_W + 0.05, Y_N + 0.3], [X_W + 0.05, Y_HB - 0.1], [X_OK + 0.05, Y_HB - 0.1]],   # v2: the old kitchen and the hall too
              'walkStart': {'at': [8.0, 12.7], 'look': [36.0, 18.4]},
              # v2: the removed hall walls' lines are free to cross (the stub, the old door's wall, the two pieces by the hall);
              # the bath's walls, the street side of the deck and the west gable wall still stop a walker
              'walkTests': [[[27.5, 6.0], [27.5, 11.0], 'open'], [[19.0, 15.0], [19.0, 21.0], 'open'], [[23.0, 21.5], [23.0, 26.0], 'open'],
                            [[25.0, 6.5], [25.0, 0.0], 'open'], [[30.0, -1.0], [35.5, -1.0], 'wall'],
                            [[16.5, 19.6], [11.5, 19.6], 'open'], [[16.5, 21.6], [11.5, 21.6], 'open'], [[16.5, 24.0], [11.5, 24.0], 'open'], [[14.6, 17.9], [12.6, 17.9], 'open'],
                            [[7.2, 20.5], [7.2, 24.3], 'open'], [[12.3, 20.5], [12.3, 24.3], 'open'], [[9.5, 20.5], [9.5, 24.3], 'open'], [[6.2, 23.9], [16.0, 23.0], 'open'],
                            [[20.0, 28.0], [12.0, 28.0], 'wall'], [[11.8, 23.5], [11.8, 27.5], 'wall'], [[13.2, 24.2], [14.2, 26.2], 'wall'], [[8.0, 18.0], [3.5, 18.0], 'wall']],
              'labels': [{'name': 'Kitchen', 'at': [31.5, 19.0]}, {'name': 'Living', 'at': [19.6, 26.2]}, {'name': 'Dining', 'at': [17.7, 11.2]},
                         {'name': 'Library', 'at': [9.8, 16.0]}, {'name': 'Deck', 'at': [25.5, 0.0]}, {'name': 'Bedroom', 'at': [-0.8, 21.5]}, {'name': 'Bath', 'at': [9.4, 29.2]}],
              # viewpoints, world frame [north, up, east]
              'views': {'foyer': {'pos': [-4.0, 5.0, -3.0], 'look': [20.7, 4.7, 9.0]},
                        'entry': {'pos': [12.7, 5.0, 7.4], 'look': [18.6, 5.0, 36.6]},
                        'library': {'pos': [15.6, 5.0, 18.2], 'look': [17.6, 5.4, 5.3]},
                        'windowseat': {'pos': [15.6, 5.0, 13.6], 'look': [4.8, 3.2, 9.0]},
                        'hall': {'pos': [23.9, 5.0, 6.7], 'look': [15.5, 4.6, 26.0]},
                        'kitchen': {'pos': [18.45, 5.0, 32.8], 'look': [18.45, 5.6, 5.3]},
                        'kitchenrun': {'pos': [16.4, 5.0, 21.5], 'look': [30.5, 4.0, 33.5]},
                        'living': {'pos': [19.2, 5.0, 24.0], 'look': [29.5, 4.2, 17.6]},
                        'dining': {'pos': [17.0, 5.0, 23.6], 'look': [9.5, 3.2, 14.5]},
                        'deck': {'pos': [-3.4, 5.0, 25.4], 'look': [16.0, 4.4, 24.2]},
                        'driveway': {'pos': [-14.0, 1.0, 40.0], 'look': [2.0, 1.4, 24.0]},
                        'street': {'pos': [18.4, 1.6, 52.0], 'look': [18.4, 6.0, 30.0]},
                        'aerial': {'pos': [-12.0, 62.0, 52.0], 'look': [18.4, 0.0, 22.0]}}})
    meta['options'] = [o for o in meta['options'] if o['id'] != OPT_ID] + [e]
    open(path, 'w').write(json.dumps(meta, separators=(',', ':'), ensure_ascii=False))

def main():
    meta, hide, hide_ranges, elements, bounds, rep = build()
    D = option_data(meta, elements, bounds)
    json.dump(D, open(os.path.join(B2, META_OUT), 'w'), separators=(',', ':'))
    raw = open(os.path.join(B2, GLB_OUT), 'rb').read(); register(hide, hide_ranges, hashlib.sha256(raw).hexdigest())
    print(json.dumps(rep)); print('hide', len(hide), 'bytes', len(raw))

if __name__ == '__main__':
    main()
