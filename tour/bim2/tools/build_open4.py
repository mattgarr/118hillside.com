#!/usr/bin/env python3
"""Concept r42 "Open great room, 4 bedrooms" (option OS-REMODEL-open4, legacyId open4).

Builds the option package next to the as-built one, in the same shape as the two 2024 concepts:
  bim2/scene.opt-OS-REMODEL-open4.glb        the option's own meshes (page groups '<group>@open4')
  bim2/scene.opt-OS-REMODEL-open4.meta.json  the option's run-time data (spaces, walkable, colliders, openings, furnishings,
                                             lights, boundaries, cut) = the as-built data with this layout's changes
and registers it in bim2/scene.meta.json options[] (hide list, glb hash, the card metadata).

Illustrative idea. Not designed or reviewed by an architect or engineer. See tour/CONCEPT-4BR.md.

What it does (BIM plan feet: x east toward the street, y north, z up; the GLB is world X = y, Y = z, Z = x):
  - hides the front and middle bedrooms' walls, doors, closets, floors and ceilings and the great room's floor and ceiling
    by their exact triangle ranges (option hide list), and the street gable wall and the north wall, which it rebuilds;
  - one oak floor and one cathedral ceiling over the whole room (the roof's two planes, ridge at y = 18.446);
  - an exposed fir ridge beam from the kitchen wall to the street gable;
  - the street gable wall rebuilt with a copy of the dining area's 14-1/4 ft picture window centred under the ridge and four
    sloped-top gable windows above it, two each side of the post the beam lands on;
  - the north wall rebuilt with a copy of the middle bedroom's twin window in the old front-bedroom closet;
  - wall patches where the removed walls met the kept ones, the closet paint repainted, continuous baseboards.

Needs python3 with numpy and shapely >= 2.1. Run: python3 tour/bim2/tools/build_open4.py [--register-only]
"""
import hashlib, json, math, os, struct, sys
import numpy as np
import shapely
import shapely.affinity
from shapely.geometry import Polygon, MultiPolygon, box as sbox
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
B2 = os.path.dirname(HERE)
OPT_ID, LEGACY = 'OS-REMODEL-open4', 'open4'
GLB_OUT, META_OUT = 'scene.opt-%s.glb' % OPT_ID, 'scene.opt-%s.meta.json' % OPT_ID
GREAT = 'SP-L1-GREAT'
LABEL = 'Illustrative idea. Not designed or reviewed by an architect or engineer.'

# ---------------------------------------------------------------- the layout (plan feet) ----------------------------------------
RIDGE_Y, PITCH, C_S, C_N = 18.446, 0.41, 6.0299, 21.1556
def ceil_z(y): return C_S + PITCH * y if y <= RIDGE_Y else C_N - PITCH * y
APEX = ceil_z(RIDGE_Y)
X_KIT, Y_KIT = 16.0999, 18.3428                    # kitchen's east edge / north edge of its east part
X_W, X_E, Y_S, Y_N = 13.9232, 36.585, 4.8052, 32.0868   # interior faces: kitchen-alcove wall, street gable, south, north
X_EO = 36.986                                       # street gable outer face
ROOM = [(X_KIT, Y_S), (X_E, Y_S), (X_E, Y_N), (X_W, Y_N), (X_W, Y_KIT), (X_KIT, Y_KIT)]

REMOVED_SPACES = ['SP-L1-BED2', 'SP-L1-BED2-CLOSET', 'SP-L1-BED3', 'SP-L1-BED3-CLOSET']
REMOVED_WALLS = ['W-L1-008', 'W-L1-009', 'W-L1-010', 'W-L1-013', 'W-L1-018', 'W-L1-019', 'W-L1-045', 'W-L1-046', 'W-L1-047', 'W-L1-048']
REBUILT_WALLS = ['W-L1-049', 'W-L1-050', 'W-L1-051', 'W-L1-021']
REMOVED_OPENINGS = ['D-L1-07', 'D-L1-08', 'D-L1-09', 'D-L1-13', 'WN-L1-04', 'WN-L1-05', 'WN-L1-07']
REMOVED_MISC = ['FX-JLH-L1-BED2', 'FX-JLH-L1-BED3', 'SL-L1-STORE-BED2',
                'CL-SP-L1-GREAT', 'CL-SP-L1-BED2', 'CL-SP-L1-BED2-CLOSET', 'CL-SP-L1-BED3', 'CL-SP-L1-BED3-CLOSET',
                'FL-SP-L1-GREAT', 'FL-SP-L1-BED2', 'FL-SP-L1-BED2-CLOSET', 'FL-SP-L1-BED3', 'FL-SP-L1-BED3-CLOSET']
# trims: baseboards on removed walls or re-run, casings / stools / aprons of removed doors and windows
REMOVED_TRIMS = ['TR-%04d' % i for i in list(range(179, 186)) + list(range(188, 192)) + list(range(205, 209)) + [210, 211, 235, 238]
                 + list(range(240, 251)) + [12, 13, 15] + list(range(484, 514)) + list(range(532, 536))
                 + list(range(708, 726)) + list(range(735, 744)) + [953, 954, 956]]
REMOVED_FURN = ['KX-BICT', 'KX-BUILTIN']          # the built-in sideboard + shelves stood on the removed great-room wall
REMOVED_LIGHTS = ['LF-L1-%d' % i for i in [120, 121, 122, 123, 124, 125, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172]] + ['LF-L1-FAN-BED3']

# new street-gable openings
PIC_SRC, PIC_SRC_CX = 'WN-L1-03', 25.361           # the dining area's picture window, copied onto the gable
PIC_TRIMS = ['TR-0011', 'TR-0699', 'TR-0700', 'TR-0701', 'TR-0702', 'TR-0703', 'TR-0704', 'TR-0705', 'TR-0706', 'TR-0707', 'TR-0952']
NWIN_SRC, NWIN_DX = 'WN-L1-08', 30.5 - 18.964      # the middle bedroom's twin window, copied along the north wall
NWIN_TRIMS = ['TR-0016'] + ['TR-%04d' % i for i in range(744, 753)] + ['TR-0957']
GABLE_SILL, GABLE_TOPGAP = 8.55, 0.5
GABLE_PANES = [(11.40, 14.55), (15.05, 18.196), (18.696, 21.842), (22.342, 25.492)]
TRIM_W, TRIM_T = 0.25, 0.06
BEAM_Y0, BEAM_Y1, BEAM_Z0 = RIDGE_Y - 0.23, RIDGE_Y + 0.23, 12.40

PAINT = 'paint-int-flat#PAINT-BM-1472-SILVER-CHAIN'
CLOSET_PAINT = 'paint-int-flat#PAINT-SW-7757-HRW-FLAT'
TRIM_INT, TRIM_EXT = 'mdf-primed#paint-trim-semigloss', 'hardie-trim#paint-ext-trim'

# ---------------------------------------------------------------- GLB in --------------------------------------------------------
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def read_glb(path):
    b = open(path, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + L])
    off = 20 + L; L2 = struct.unpack('<I', b[off:off + 4])[0]; BIN = b[off + 8:off + 8 + L2]
    def acc(i):
        a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; n = NC[a['type']]; dt = CT[a['componentType']]
        st = bv.get('byteStride'); o = bv.get('byteOffset', 0) + a.get('byteOffset', 0); isz = n * np.dtype(dt).itemsize
        if st and st != isz:
            raw = np.frombuffer(BIN, dtype=np.uint8, count=st * (a['count'] - 1) + isz, offset=o)
            return np.lib.stride_tricks.as_strided(raw, shape=(a['count'], isz), strides=(st, 1)).copy().view(dt).reshape(a['count'], n)
        arr = np.frombuffer(BIN, dtype=dt, count=a['count'] * n, offset=o)
        return arr.reshape(a['count'], n) if n > 1 else arr
    out = []
    for nd in J['nodes']:
        if 'mesh' not in nd: continue
        me = J['meshes'][nd['mesh']]; ex = dict(nd.get('extras', {})); ex.update(me.get('extras', {}))
        for p in me['primitives']:
            A = p['attributes']
            out.append(dict(name=nd['name'], ex=ex, pos=acc(A['POSITION']).astype(np.float64), nor=acc(A['NORMAL']).astype(np.float64),
                            uv=acc(A['TEXCOORD_0']).astype(np.float64), idx=acc(p['indices']).astype(np.int64).reshape(-1, 3),
                            mat=J['materials'][p['material']]))
    return J, out

def element_tris(meshes):
    """element id -> list of triangles {v: 3x3 BIM coords, n: normal (BIM), group, storey, material, boundary}"""
    E = {}
    for m in meshes:
        ex = m['ex']; P = m['pos']; N = m['nor']
        for el, bd, s, c in ex.get('ranges', []):
            for t in m['idx'][s:s + c]:
                w = P[t]; bim = np.stack([w[:, 2], w[:, 0], w[:, 1]], 1)
                nw = N[t].mean(0); nb = np.array([nw[2], nw[0], nw[1]])
                E.setdefault(el, []).append(dict(v=bim, n=nb, group=ex['group'], storey=ex['storey'], material=ex['material'], boundary=bd))
    return E

# ---------------------------------------------------------------- mesh accumulator / GLB out ---------------------------------------
class Out:
    def __init__(self): self.M = {}           # (group, storey, material) -> {pos, nor, uv, idx, ranges, cur}
    def tri(self, group, storey, material, el, bd, v, n):
        """one triangle in BIM coords (3x3), facing n (BIM). Winding is fixed so the front face looks along n."""
        v = np.asarray(v, float); n = np.asarray(n, float); n = n / (np.linalg.norm(n) or 1)
        if np.dot(np.cross(v[1] - v[0], v[2] - v[0]), n) < 0: v = v[[0, 2, 1]]
        if np.linalg.norm(np.cross(v[1] - v[0], v[2] - v[0])) < 1e-9: return
        k = (group, storey, material); m = self.M.setdefault(k, dict(pos=[], nor=[], uv=[], idx=[], ranges=[]))
        key = (el, bd)
        if not m['ranges'] or m['ranges'][-1][0:2] != [el, bd]: m['ranges'].append([el, bd, len(m['idx']), 0])
        m['ranges'][-1][3] += 1
        base = len(m['pos'])
        wn = np.array([n[1], n[2], n[0]])
        for p in v:
            w = np.array([p[1], p[2], p[0]]); m['pos'].append(w); m['nor'].append(wn); m['uv'].append(uvbox(w, wn))
        m['idx'].append([base, base + 1, base + 2])
    def write(self, path):
        nodes, meshes, mats, accs, views = [], [], [], [], []
        blob = bytearray()
        def add(arr, comp, typ, target, mm=False):
            a = np.ascontiguousarray(arr); off = len(blob); blob.extend(a.tobytes())
            while len(blob) % 4: blob.append(0)
            views.append({'buffer': 0, 'byteOffset': off, 'byteLength': a.nbytes, 'target': target})
            d = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(a.shape[0]), 'type': typ}
            if mm: d['min'] = a.min(0).tolist(); d['max'] = a.max(0).tolist()
            accs.append(d); return len(accs) - 1
        for (g, st, mat), m in sorted(self.M.items(), key=lambda kv: tuple(str(a) for a in kv[0])):
            if not m['idx']: continue
            P = np.array(m['pos'], np.float32); N = np.array(m['nor'], np.float32); U = np.array(m['uv'], np.float32)
            I = np.array(m['idx'], np.uint32).reshape(-1)
            ip = add(P, 5126, 'VEC3', 34962, True); inn = add(N, 5126, 'VEC3', 34962); iu = add(U, 5126, 'VEC2', 34962); ii = add(I, 5125, 'SCALAR', 34963)
            mats.append({'name': mat, 'extras': {'bim2Material': mat}, 'pbrMetallicRoughness': {'roughnessFactor': 0.8, 'metallicFactor': 0}})
            ex = {'ranges': [[r[0], r[1], r[2], r[3]] for r in m['ranges']], 'group': g, 'storey': st, 'material': mat}
            meshes.append({'name': '%s|%s|%s' % (g, st, mat), 'extras': ex, 'primitives': [{'attributes': {'POSITION': ip, 'NORMAL': inn, 'TEXCOORD_0': iu}, 'mode': 4, 'material': len(mats) - 1, 'indices': ii}]})
            nodes.append({'name': '%s|%s|%s' % (g, st, mat), 'extras': {'group': g, 'storey': st, 'material': mat}, 'mesh': len(meshes) - 1})
        J = {'asset': {'generator': 'tour/bim2/tools/build_open4.py (concept r42)', 'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}],
             'nodes': nodes, 'meshes': meshes, 'materials': mats, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
        js = json.dumps(J, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
        open(path, 'wb').write(out); return out

def uvbox(w, wn):
    """TEXCOORD_0 = BIM-frame feet box projection, as the kernel writes it (world X = bim y, Y = z, Z = bim x)"""
    a = int(np.argmax(np.abs(wn)))
    if a == 1: return [w[2], w[0]]      # floors, ceilings, caps: (bim x, bim y)
    if a == 2: return [w[0], w[1]]      # faces looking east / west: (bim y, z)
    return [w[2], w[1]]                 # faces looking north / south: (bim x, z)

# ---------------------------------------------------------------- geometry helpers --------------------------------------------------
def tris2d(poly):
    """constrained triangulation of a shapely (Multi)Polygon -> list of 2D triangles"""
    out = []
    for p in (poly.geoms if hasattr(poly, 'geoms') else [poly]):
        if p.is_empty or p.area < 1e-6: continue
        for t in shapely.constrained_delaunay_triangles(p).geoms:
            c = list(t.exterior.coords)[:3]
            if Polygon(c).area > 1e-7: out.append(c)
    return out

def plane_face(O, el, bd, group, storey, mat, poly, to3d, n):
    for t in tris2d(poly): O.tri(group, storey, mat, el, bd, [to3d(*p) for p in t], n)

def prism_sides(O, el, bd, group, storey, mat, ring, to3d_a, to3d_b, inward_center=None, outward=True):
    """side quads along a 2D ring between two parallel planes; normals point away from (outward) or toward the ring's inside"""
    pts = list(ring.coords)
    for (u0, v0), (u1, v1) in zip(pts[:-1], pts[1:]):
        if math.hypot(u1 - u0, v1 - v0) < 1e-6: continue
        a0, a1, b0, b1 = to3d_a(u0, v0), to3d_a(u1, v1), to3d_b(u0, v0), to3d_b(u1, v1)
        e = np.array(a1) - np.array(a0); d = np.array(b0) - np.array(a0); n = np.cross(e, d); n = n / (np.linalg.norm(n) or 1)
        mid = (np.array(a0) + np.array(a1)) / 2
        ref = np.array(inward_center) if inward_center is not None else None
        if ref is not None and np.dot(n, mid - ref) < 0: n = -n
        if not outward: n = -n
        O.tri(group, storey, mat, el, bd, [a0, a1, b1], n); O.tri(group, storey, mat, el, bd, [a0, b1, b0], n)

def ring_center3(ring, to3d):
    c = Polygon(ring).centroid; return to3d(c.x, c.y)

def tri_poly2d(v, iu, iv): return Polygon([(p[iu], p[iv]) for p in v])

def union_faces(tris, iu, iv):
    ps = [tri_poly2d(t['v'], iu, iv).buffer(0) for t in tris]
    ps = [p for p in ps if p.area > 1e-8]
    return unary_union(ps).buffer(1e-4, join_style=2).buffer(-1e-4, join_style=2) if ps else Polygon()

def fill_holes(poly, only=None):
    """drop interior rings (old window holes); with only=[shapely geoms], drop only the holes that touch one of them"""
    out = []
    for p in (poly.geoms if hasattr(poly, 'geoms') else [poly]):
        keep = [r for r in p.interiors if only is not None and not any(Polygon(r).intersects(g) for g in only)]
        out.append(Polygon(p.exterior, keep))
    return unary_union(out)

def mitre(p, d): return p.buffer(d, join_style=2, mitre_limit=10)

# ---------------------------------------------------------------- build ------------------------------------------------------------
def build():
    J, meshes = read_glb(os.path.join(B2, 'scene.glb'))
    meta = json.load(open(os.path.join(B2, 'scene.meta.json')))
    E = element_tris(meshes)
    O = Out()
    hide = set(REMOVED_WALLS + REBUILT_WALLS + REMOVED_OPENINGS + REMOVED_MISC + REMOVED_TRIMS)
    missing = sorted(h for h in hide if h not in E)
    if missing: print('note: not in the as-built package (skipped):', missing)
    hide = sorted(h for h in hide if h in E)
    hide_ranges = []
    report = {}

    # -- floor (one oak floor over the whole room, the removed walls' footprints included)
    room = Polygon(ROOM)
    f2 = lambda x, y: (x, y, 0.0); fb = lambda x, y: (x, y, -0.062)
    plane_face(O, 'FL-SP-L1-OPEN4', None, 'floors', 'L1', 'oak-red-lauzon-vela', room, f2, (0, 0, 1))
    plane_face(O, 'FL-SP-L1-OPEN4', None, 'floors', 'L1', 'oak-red-lauzon-vela', room, fb, (0, 0, -1))

    # -- ceiling: the roof's two planes, one drywall slab (0.042 thick like the kernel's), split at the ridge
    south = room.intersection(sbox(0, 0, 60, RIDGE_Y)); north = room.intersection(sbox(0, RIDGE_Y, 60, 60))
    for part, nrm in ((south, (0, -PITCH, -1)), (north, (0, PITCH, -1))):
        plane_face(O, 'CL-SP-L1-OPEN4', None, 'ceilings', 'L1', 'gwb-l5#paint-ceiling-flat', part, lambda x, y: (x, y, ceil_z(y)), nrm)
        plane_face(O, 'CL-SP-L1-OPEN4', None, 'ceilings', 'L1', 'gwb-l5#paint-ceiling-flat', part, lambda x, y: (x, y, ceil_z(y) + 0.042), tuple(-a for a in nrm))

    # -- ridge beam: fir, 5.5 in wide, its top tucked under the two ceiling planes
    sec = Polygon([(BEAM_Y0, BEAM_Z0), (BEAM_Y1, BEAM_Z0), (BEAM_Y1, ceil_z(BEAM_Y1) - 0.004), (RIDGE_Y, APEX - 0.004), (BEAM_Y0, ceil_z(BEAM_Y0) - 0.004)])
    for x, nx in ((X_W + 0.002, -1), (X_E - 0.002, 1)):
        plane_face(O, 'BM-L1-OPEN4', None, 'ceilings', 'L1', 'fir-beam', sec, lambda y, z, x=x: (x, y, z), (nx, 0, 0))
    prism_sides(O, 'BM-L1-OPEN4', None, 'ceilings', 'L1', 'fir-beam', sec.exterior, lambda y, z: (X_W + 0.002, y, z), lambda y, z: (X_E - 0.002, y, z), inward_center=(25, RIDGE_Y, 12.9))

    # -- the kitchen-alcove wall's room face where the middle bedroom's closet and the great-room wall met it (x = 13.92)
    patch = Polygon([(Y_KIT, 0), (21.0, 0), (21.0, ceil_z(21.0)), (RIDGE_Y, APEX), (Y_KIT, ceil_z(Y_KIT))])
    plane_face(O, 'W-L1-042', 'B-O4-001', 'walls', 'L1', PAINT, patch, lambda y, z: (X_W, y, z), (1, 0, 0))
    for t in E.get('W-L1-042', []):        # the closet paint on that face goes (its range is hidden)
        if t['material'] == CLOSET_PAINT and t['boundary'] and ['W-L1-042', t['boundary']] not in hide_ranges: hide_ranges.append(['W-L1-042', t['boundary']])

    # -- copies of the house's own window units
    def copy_el(src, dst, fx, fn, keep=lambda t: True, mat=None):
        n = 0
        for t in E.get(src, []):
            if not keep(t): continue
            v = np.array([fx(p) for p in t['v']]); nn = fn(t['n'])
            O.tri(t['group'], t['storey'], mat or t['material'], dst, t['boundary'] and ('O4-' + t['boundary']), v, nn); n += 1
        return n
    # south wall -> street gable: rotate +90 deg about z, interior faces 4.805 -> 36.585, window centre x 25.361 -> y = ridge
    g_x = lambda p: (41.39 - p[1], RIDGE_Y + (p[0] - PIC_SRC_CX), p[2])
    g_n = lambda n: np.array([-n[1], n[0], n[2]])
    report['picture'] = copy_el(PIC_SRC, 'WN-L1-O4A', g_x, g_n)
    for i, tr in enumerate(PIC_TRIMS): copy_el(tr, 'TR-O4-A%02d' % i, g_x, g_n)
    # north window: the same wall, 11.5 ft east
    n_x = lambda p: (p[0] + NWIN_DX, p[1], p[2]); n_n = lambda n: np.array(n)
    report['north'] = copy_el(NWIN_SRC, 'WN-L1-O4B', n_x, n_n)
    for i, tr in enumerate(NWIN_TRIMS): copy_el(tr, 'TR-O4-B%02d' % i, n_x, n_n)

    # holes: the source walls' own openings around the copied windows, read from the source walls' faces
    def wall_holes(wall, axis_u, axis_v, plane_axis, plane_val, nsign, near):
        ts = [t for t in E[wall] if abs(t['v'][:, plane_axis].mean() - plane_val) < 0.02 and t['n'][plane_axis] * nsign > 0.9]
        u = union_faces(ts, axis_u, axis_v); holes = []
        for p in (u.geoms if hasattr(u, 'geoms') else [u]):
            for r in p.interiors:
                h = Polygon(r)
                if h.intersects(near): holes.append(h)
        return unary_union(holes) if holes else Polygon()
    # the source openings as built: the room face is cut at the opening (centre +- width / 2, sill to head), the siding at the
    # outer edge of the exterior casing (as the kernel cuts WN-L1-04/05/07)
    ob = {o['id']: o for o in meta['openings']}
    def o_rect(o, axis):
        c = o['center'][axis]; return sbox(c - o['width'] / 2, o['sill'], c + o['width'] / 2, o['head'])
    def trim_rect(ids, axis):
        b = [E[t] for t in ids if t in E]; vs = np.concatenate([np.array([q['v'] for q in ts]).reshape(-1, 3) for ts in b])
        return sbox(vs[:, axis].min(), vs[:, 2].min(), vs[:, axis].max(), vs[:, 2].max())
    pic_in = o_rect(ob[PIC_SRC], 0)
    pic_out = trim_rect(['TR-0699', 'TR-0700', 'TR-0701', 'TR-0702'], 0)
    sx = lambda g: shapely.affinity.translate(g, RIDGE_Y - PIC_SRC_CX, 0)   # (x, z) on the south wall -> (y, z) on the gable
    pic_in, pic_out = sx(pic_in), sx(pic_out)
    report['pic_in'] = [round(a, 3) for a in pic_in.bounds]; report['pic_out'] = [round(a, 3) for a in pic_out.bounds]
    # the south wall's reveal faces of that opening, copied with the window
    def in_band(t, lo, hi, axis, rect, iu, iv):
        c = t['v'].mean(0); return lo + 0.02 < c[axis] < hi - 0.02 and rect.contains(shapely.Point(c[iu], c[iv]))
    report['pic_reveal'] = copy_el('W-L1-002', 'W-L1-O4E', g_x, g_n, keep=lambda t: in_band(t, 4.404, 4.805, 1, sbox(PIC_SRC_CX - 7.3, 1.5, PIC_SRC_CX + 7.3, 7.8), 0, 2))

    nw_in = shapely.affinity.translate(o_rect(ob[NWIN_SRC], 0), NWIN_DX, 0)
    nw_out = shapely.affinity.translate(trim_rect(['TR-0744', 'TR-0745', 'TR-0746', 'TR-0747'], 0), NWIN_DX, 0)
    report['nw_in'] = [round(a, 3) for a in nw_in.bounds]; report['nw_out'] = [round(a, 3) for a in nw_out.bounds]
    report['nw_reveal'] = copy_el('W-L1-021', 'W-L1-O4N', n_x, n_n, keep=lambda t: in_band(t, 32.0868, 32.487, 1, sbox(18.964 - 3.2, 1.5, 18.964 + 3.2, 6.8), 0, 2))

    # -- the street gable wall (W-L1-049/050/051 rebuilt as one element)
    gable_ro = [Polygon([(a, GABLE_SILL), (b, GABLE_SILL), (b, ceil_z(b) - GABLE_TOPGAP), (a, ceil_z(a) - GABLE_TOPGAP)]) for a, b in GABLE_PANES]
    gable_trim_out = unary_union([mitre(p, TRIM_W) for p in gable_ro])
    old_rects = [sbox(10.26 - .05, 1.31 - .05, 16.88 + .05, 6.67 + .05), sbox(18.94 - .05, 2.52 - .05, 23.10 + .05, 7.17 + .05), sbox(24.75 - .05, 2.52 - .05, 28.91 + .05, 7.17 + .05)]
    EW = sum((E[w] for w in ('W-L1-049', 'W-L1-050', 'W-L1-051')), [])
    inner, outer, keep_t = [], {}, []
    for t in EW:
        c = t['v'].mean(0); n = t['n']
        if n[0] < -0.9 and c[0] < 36.7 and -0.1 < c[2] and all(p[2] <= ceil_z(p[1]) + 0.06 for p in t['v']) and Y_S - .01 < c[1] < Y_N + .01:
            inner.append(t); continue                                  # the room face: regenerated
        if n[0] > 0.9 and c[0] > 36.95 and t['material'] in ('hardie-lap#paint-ext-body', 'hardie-shingle#paint-ext-body'):
            outer.setdefault((t['material'], round(float(c[0]), 2), t['boundary']), []).append(t); continue
        if 36.6 < c[0] < 36.97 and any(r.contains(shapely.Point(c[1], c[2])) for r in old_rects):
            continue                                                   # an old window's reveal
        keep_t.append(t)
    report['gable'] = {'inner_dropped': len(inner), 'outer_groups': len(outer), 'kept': len(keep_t)}
    for t in keep_t:
        O.tri(t['group'], t['storey'], t['material'], 'W-L1-O4E', t['boundary'] and ('O4-' + t['boundary']), t['v'], t['n'])
    # room face: the whole gable (ceiling line on top) less the picture window and the gable windows
    face = Polygon([(Y_S, 0), (Y_N, 0), (Y_N, ceil_z(Y_N)), (RIDGE_Y, APEX), (Y_S, ceil_z(Y_S))]).difference(pic_in).difference(unary_union(gable_ro))
    plane_face(O, 'W-L1-O4E', 'B-O4-E01', 'walls', 'L1', PAINT, face, lambda y, z: (X_E, y, z), (-1, 0, 0))
    # siding: old holes filled, new holes cut (the picture window's siding hole is the copied one, the gable's is the trim outline)
    olds = [r for r in old_rects]
    for (mat, xo, bd), ts in outer.items():
        u = union_faces(ts, 1, 2)
        u = fill_holes(u, only=olds).difference(pic_out).difference(gable_trim_out)
        plane_face(O, 'W-L1-O4E', bd and ('O4-' + bd), 'walls', 'L1', mat, u, lambda y, z, xo=xo: (xo, y, z), (1, 0, 0))
    # gable windows: drywall return, frame, glass, exterior return and trim (like the house's other gable windows: no inside casing)
    FR_IN, FR_OUT, FR_W = 36.70, 36.90, 0.16
    for i, ro in enumerate(gable_ro):
        el = 'WN-L1-O4G%d' % (i + 1); cen = ring_center3(ro.exterior, lambda y, z: (36.8, y, z))
        prism_sides(O, el, None, 'openings', 'L1', PAINT, ro.exterior, lambda y, z: (X_E, y, z), lambda y, z: (FR_IN, y, z), inward_center=cen, outward=False)
        prism_sides(O, el, None, 'trim', '-', TRIM_EXT, ro.exterior, lambda y, z: (FR_OUT, y, z), lambda y, z: (X_EO + TRIM_T, y, z), inward_center=cen, outward=False)
        ring = ro.difference(mitre(ro, -FR_W)); glass = mitre(ro, -FR_W)
        plane_face(O, el, None, 'openings', 'L1', 'window-frame', ring, lambda y, z: (FR_IN, y, z), (-1, 0, 0))
        plane_face(O, el, None, 'openings', 'L1', 'window-frame', ring, lambda y, z: (FR_OUT, y, z), (1, 0, 0))
        prism_sides(O, el, None, 'openings', 'L1', 'window-frame', glass.exterior, lambda y, z: (FR_IN, y, z), lambda y, z: (FR_OUT, y, z), inward_center=cen, outward=False)
        plane_face(O, el, None, 'glass', 'L1', 'glass', glass, lambda y, z: (36.79, y, z), (-1, 0, 0))
        plane_face(O, el, None, 'glass', 'L1', 'glass', glass, lambda y, z: (36.81, y, z), (1, 0, 0))
    trims = gable_trim_out.difference(unary_union(gable_ro))
    plane_face(O, 'TR-O4-G01', None, 'trim', '-', TRIM_EXT, trims, lambda y, z: (X_EO + TRIM_T, y, z), (1, 0, 0))
    for p in (gable_trim_out.geoms if hasattr(gable_trim_out, 'geoms') else [gable_trim_out]):
        prism_sides(O, 'TR-O4-G01', None, 'trim', '-', TRIM_EXT, p.exterior, lambda y, z: (X_EO, y, z), lambda y, z: (X_EO + TRIM_T, y, z), inward_center=ring_center3(p.exterior, lambda y, z: (37, y, z)))

    # -- the north wall (W-L1-021) rebuilt: closet paint repainted, the old partition's strip filled, a second window cut
    NW = E['W-L1-021']; nin, nout, nkeep = [], {}, []
    for t in NW:
        c = t['v'].mean(0); n = t['n']
        if n[1] < -0.9 and abs(c[1] - Y_N) < 0.03 and t['material'].startswith('paint-int') and 0 <= c[2] <= 8.05: nin.append(t); continue
        if n[1] > 0.9 and c[1] > 32.45 and t['material'] == 'hardie-lap#paint-ext-body' and c[0] > 24.5:
            nout.setdefault((t['material'], round(float(c[1]), 3), t['boundary']), []).append(t); continue
        nkeep.append(t)
    for t in nkeep: O.tri(t['group'], t['storey'], t['material'], 'W-L1-O4N', t['boundary'] and ('O4-' + t['boundary']), t['v'], t['n'])
    u = unary_union([union_faces(nin, 0, 2), sbox(23.95, 0, 24.35, ceil_z(Y_N))]).difference(nw_in)
    plane_face(O, 'W-L1-O4N', 'B-O4-N01', 'walls', 'L1', PAINT, u, lambda x, z: (x, Y_N, z), (0, -1, 0))
    for (mat, yo, bd), ts in nout.items():
        uu = union_faces(ts, 0, 2).difference(nw_out)
        plane_face(O, 'W-L1-O4N', bd and ('O4-' + bd), 'walls', 'L1', mat, uu, lambda x, z, yo=yo: (x, yo, z), (0, 1, 0))
    report['north_wall'] = {'inner': len(nin), 'outer_groups': len(nout), 'kept': len(nkeep)}

    # -- baseboards, stretched from the house's own runs
    def stretch(src, dst, axis, a0, a1):
        ts = E[src]; vals = np.concatenate([t['v'][:, axis] for t in ts]); lo, hi = vals.min(), vals.max()
        for t in ts:
            v = t['v'].copy(); v[:, axis] = np.where(np.abs(v[:, axis] - lo) < np.abs(v[:, axis] - hi), a0 + (v[:, axis] - lo), a1 - (hi - v[:, axis]))
            O.tri(t['group'], t['storey'], t['material'], dst, None, v, t['n'])
    stretch('TR-0250', 'TR-O4-BB1', 1, 4.852, Y_N)          # street gable, corner to corner
    stretch('TR-0211', 'TR-O4-BB2', 0, 15.82, X_E)          # north wall
    stretch('TR-0238', 'TR-O4-BB3', 1, 18.35, 22.20)        # kitchen-alcove wall, up to the hall door's casing

    O.write(os.path.join(B2, GLB_OUT))
    report['meshes'] = len(O.M); report['tris'] = sum(len(m['idx']) for m in O.M.values())
    elements = sorted(set(r[0] for m in O.M.values() for r in m['ranges']))
    bounds = sorted(set(r[1] for m in O.M.values() for r in m['ranges'] if r[1]))
    return meta, hide, hide_ranges, elements, bounds, report

# ---------------------------------------------------------------- option run-time data ----------------------------------------------
def option_data(meta, elements, bounds):
    room_poly = [list(p) for p in ROOM]
    D = {'format': 'bim2-scene-meta-option', 'source': {'builder': 'tour/bim2/tools/build_open4.py', 'options': {'OS-REMODEL': LEGACY}, 'note': LABEL}}
    sp = []
    for s in meta['spaces']:
        if s['id'] in REMOVED_SPACES: continue
        if s['id'] == GREAT:
            s = json.loads(json.dumps(s)); s['name'] = 'Living, dining & sitting'; s['polygon'] = room_poly
            s['ceiling'] = {'form': 'VAULT_ROOF', 'height': None, 'planes': [
                {'poly': [list(p) for p in Polygon(ROOM).intersection(sbox(0, 0, 60, RIDGE_Y)).exterior.coords[:-1]], 'holes': [], 'P': {'c': C_S, 'gx': 0, 'gy': PITCH}},
                {'poly': [list(p) for p in Polygon(ROOM).intersection(sbox(0, RIDGE_Y, 60, 60)).exterior.coords[:-1]], 'holes': [], 'P': {'c': C_N, 'gx': 0, 'gy': -PITCH}}]}
        sp.append(s)
    D['spaces'] = sp
    rm_el = set(REMOVED_WALLS + REMOVED_OPENINGS + ['SL-L1-STORE-BED2'])
    wk = [w for w in meta['walkable'] if w.get('space') not in REMOVED_SPACES and w['id'] != 'FL-SP-L1-GREAT' and w.get('element') not in rm_el and w.get('opening') not in rm_el]
    wk.append({'id': 'FL-SP-L1-OPEN4', 'element': 'FL-SP-L1-OPEN4', 'kind': 'FLOOR', 'space': GREAT, 'storey': 'L1', 'poly': room_poly, 'holes': [], 'z': 0, 'exterior': False})
    D['walkable'] = wk
    D['colliders'] = [c for c in meta['colliders'] if c.get('element') not in rm_el]
    ops = []
    for o in meta['openings']:
        if o['id'] in REMOVED_OPENINGS: continue
        o = json.loads(json.dumps(o)); sps = o.get('spaces') or {}
        for k in ('A', 'B'):
            if sps.get(k) in REMOVED_SPACES: sps[k] = GREAT
        ops.append(o)
    base = {o['id']: o for o in meta['openings']}
    pic = json.loads(json.dumps(base[PIC_SRC])); pic.update({'id': 'WN-L1-O4A', 'host': 'W-L1-O4E', 'center': [36.7855, RIDGE_Y], 'axis': [0, -1], 'normal': [1, 0], 'spaces': {'A': 'EXTERIOR', 'B': GREAT}})
    nw = json.loads(json.dumps(base[NWIN_SRC])); nw.update({'id': 'WN-L1-O4B', 'host': 'W-L1-O4N', 'center': [base[NWIN_SRC]['center'][0] + NWIN_DX, base[NWIN_SRC]['center'][1]], 'spaces': {'A': 'EXTERIOR', 'B': GREAT}})
    ops += [pic, nw]
    for i, (a, b) in enumerate(GABLE_PANES):
        top = min(ceil_z(a), ceil_z(b)) - GABLE_TOPGAP; head = max(ceil_z(a), ceil_z(b)) - GABLE_TOPGAP
        ops.append({'id': 'WN-L1-O4G%d' % (i + 1), 'class': 'IfcWindow', 'type': 'WN-GABLE-FIXED (concept)', 'host': 'W-L1-O4E', 'storey': 'L1', 'center': [36.7855, (a + b) / 2],
                    'sill': GABLE_SILL, 'head': round(head, 4), 'width': round(b - a, 4), 'spaces': {'A': 'EXTERIOR', 'B': GREAT}, 'axis': [0, -1], 'normal': [1, 0],
                    'thickness': 0.4011, 'exterior': True, 'glazed': 1, 'leaf': None, 'leaves': [], 'shape': 'sloped-top', 'centerZ': round((GABLE_SILL + top) / 2, 4)})
    D['openings'] = ops
    D['furnishings'] = [f for f in meta['furnishings'] if f['id'] not in REMOVED_FURN] + staging()
    D['lights'] = [l for l in meta['lights'] if l['id'] not in REMOVED_LIGHTS] + new_cans(meta)
    # dollhouse section maps for the option's own meshes: every new / copied face belongs to the open room, the beam to the storey
    D['boundaries'] = {b: GREAT for b in bounds}
    cut = {e: GREAT for e in elements}; cut['BM-L1-OPEN4'] = '@L1'
    for b in bounds: cut[b] = GREAT
    D['cut'] = cut
    return D

def new_cans(meta):
    """the old rooms' downlights are replaced by a grid that follows the new room, mirrored about the ridge and clear of the beam"""
    t = next(l for l in meta['lights'] if l['id'] == 'LF-L1-139')
    out, k = [], 0
    rows = [21.65, 25.73, 29.62]                       # the great room's rows (7.27, 11.16, 15.24) mirrored about the ridge
    for x in (15.48, 20.67, 25.85, 31.04):
        for y in rows:
            k += 1; out.append(dict(t, id='LF-L1-O4-%02d' % k, at=[x, y, round(ceil_z(y), 4)], ceilingZ=round(ceil_z(y), 4), space=GREAT))
    for y in (20.87, 24.06, 27.02, 30.05):             # the wall-wash column along the street glass, mirrored
        k += 1; out.append(dict(t, id='LF-L1-O4-%02d' % k, at=[34.57, y, round(ceil_z(y), 4)], ceilingZ=round(ceil_z(y), 4), space=GREAT))
    return out

def staging():
    """furniture in the house's staging style, built by the page's option stager (lib STAGE: staging.js, falling back to fixtures.js).
    at = the centre of the piece's footprint on the floor (at[2] = height for hung pieces); rot: 0 faces east, 90 north, 180 west, 270 south;
    stageBack: the point is on the wall behind it; stageOn: decor sitting on the piece with that stageKey. lib BUILTIN: anchored on its wall."""
    F = []
    def add(kind, at, rot, params=None, lib='STAGE', key=None, on=None, dx=0, dz=0, back=False, z=0):
        f = {'id': 'FX-O4-%02d' % (len(F) + 1), 'type': 'FXT-' + kind, 'render': {'kind': kind, 'lib': lib}, 'at': [round(at[0], 3), round(at[1], 3), z], 'rot': rot,
             'space': GREAT, 'storey': 'L1', 'params': params or None, 'footprint': None}
        if key: f['stageKey'] = key
        if on: f['stageOn'] = on; f['stageDx'] = dx; f['stageDz'] = dz
        if back: f['stageBack'] = True
        F.append(f); return f
    Y = RIDGE_Y
    # living, at the street glass: two cream sofas facing each other across the room's axis, glass coffee table, checker rug,
    # consoles behind the sofas
    add('rug2', (31.6, Y), 0, {'w': 13.0, 'd': 9.4, 'pattern': 'checker'})
    for sy, r in ((-1, 90), (1, 270)):
        add('sofa3', (31.6, Y + sy * 4.75), r, {'w': 7.0, 'fabric': 'linenCream', 'pillows': False}, key='sofa%d' % sy)
        add('pillows', (0, 0), r, {'mountY': 1.42, 'lean': -.3, 'items': [['pillowSlate', -2.0, 1.45, 1.45, .12], ['pillowCream', -.7, 1.45, 1.45, -.05], ['pillowGreyLinen', .6, 1.45, 1.45, -.1], ['pillowSlate', 2.0, 1.45, 1.45, -.12]]}, on='sofa%d' % sy, dz=0, )
        F[-1]['stageZ'] = .95
        add('consoleTable', (31.6, Y + sy * 7.05), 270 if sy < 0 else 90, {'w': 6.0}, key='con%d' % sy)
        add('lamp', (0, 0), 0, {'style': 'drum', 'h': 2.35, 'shadeDia': 1.3, 'shadeH': .85}, on='con%d' % sy, dx=-2.0)
        add('books', (0, 0), 0, {'n': 3}, on='con%d' % sy, dx=1.4)
    add('coffeeTableGlass', (31.6, Y), 90, {'w': 4.4, 'd': 2.3, 'h': 1.4}, key='ct')
    add('orchid', (0, 0), 90, {'h': 1.9, 'potDia': 1.2, 'bowl': True, 'stems': 4, 'seed': 5}, on='ct', dx=-.6)
    add('vase2', (0, 0), 90, {'style': 'ribbed', 'h': 1.05, 'dia': .42, 'n': 2, 'gap': .08, 'mat': 'ceramicMatte'}, on='ct', dx=.8, dz=-.2)
    add('books', (0, 0), 90, {'n': 2}, on='ct', dx=1.5, dz=.35)
    # dining under the ridge beam: glass table on black steel, eight white parsons chairs, footed bowl, three opal globes from the beam
    add('diningTableGlass', (22.3, Y), 90, {'w': 8.0, 'd': 3.4}, key='dt')
    add('bowl', (0, 0), 90, {'dia': 1.55, 'h': 1.0}, on='dt')
    for dx in (-2.6, 0.0, 2.6):
        add('parsonsChair', (22.3 + dx, Y - 2.3), 90)
        add('parsonsChair', (22.3 + dx, Y + 2.3), 270)
    add('parsonsChair', (17.55, Y), 0); add('parsonsChair', (27.05, Y), 180)
    for dx in (-2.4, 0.0, 2.4):
        add('pendantGlobe', (22.3 + dx, Y), 0, {'dia': 1.05, 'drop': 5.45, 'finish': 'blackMetal', 'cord': 'rod'}, z=BEAM_Z0)
    # south band, by the big picture window: two boucle chairs facing each other over a wood side table
    add('armchairBoucle', (20.7, 7.6), 0, {'fabric': 'fabricLight'})
    add('armchairBoucle', (25.1, 7.6), 180, {'fabric': 'fabricLight'})
    add('woodSideTable', (22.9, 7.4), 0, {'dia': 1.9, 'h': 1.85}, key='st')
    add('books', (0, 0), 0, {'n': 3}, on='st')
    add('plantPot', (35.5, 6.0), 0)
    # north band: the house's built-in (white cabinets, quartz top, maple shelves) moved onto the hall-bath wall; a reading corner
    add('builtinBookcase', (X_W, 28.83), 0, {'boxes': 2, 'counter': None, 'crown': False, 'd': 1, 'density': 0.85, 'doorsPerBox': 2, 'fill': 'books', 'h': 3,
        'levels': [5, 6.25, 7.5], 'lights': False, 'seed': 11, 'shelfD': 1, 'shelfMat': 'maple', 'shelfT': 0.125, 'sidePanels': False, 'w': 6.0}, lib='BUILTIN')
    add('counterTop', (X_W + 0.54, 28.83), 0, {'mat': 'brittanicca', 'mountY': 2.896, 'noSplash': True, 't': 0.104,
        'outlines': [[[X_W + 0.016, 25.83], [X_W + 1.099, 25.83], [X_W + 1.099, 31.83], [X_W + 0.016, 31.83]]]}, lib='BUILTIN')
    add('rug2', (19.2, 28.4), 0, {'w': 8.0, 'd': 6.6, 'pattern': 'sisal'})
    add('armchairBoucle', (17.6, 29.7), 300, {'fabric': 'fabricLight'})
    add('armchairBoucle', (20.9, 29.7), 240, {'fabric': 'fabricLight'})
    add('ottomanRound', (19.25, 27.4), 0, {}, key='ot')
    add('vase2', (0, 0), 0, {'style': 'cylinder', 'h': 1.15, 'dia': .42, 'n': 2, 'gap': .06, 'mat': 'ceramicSpeckle'}, on='ot', dx=.3)
    add('art', (24.75, Y_N), 270, {'w': 2.6, 'h': 3.2, 'mountY': 5.2, 'style': 'blots', 'seed': 8, 'fw': .05}, back=True)
    add('bench', (30.5, Y_N - 0.95), 270, {'w': 4.4, 'fabric': 'pillowGreyLinen', 'legs': 'woodDark'})
    add('plantPot', (35.5, 31.0), 0)
    return F

# ---------------------------------------------------------------- register ----------------------------------------------------------
CARD = {
    'name': 'Open great room', 'short': 'Illustrative idea', 'beds': 4, 'bedrooms': 4, 'baths': 3, 'office': True, 'label': LABEL,
    'description': 'The front and middle main-level bedrooms open into the great room: one vaulted living, dining and kitchen space with new glass toward the street. 4 bedrooms, 3 baths, plus office.',
    'note': 'Concept r42 (owner idea, 11/12/2026): remove the front and middle main-level bedrooms, keep the back bedroom and the hall bath; one cathedral room under the original gable with an exposed ridge beam; a 14-1/4 ft picture window and glazed gable on the street wall, a second north window. Status: illustrative, not designed or reviewed by an architect or engineer.',
    'status': 'illustrative', 'source': 'concept r42 (tour/CONCEPT-4BR.md)',
}
EXISTING_FACTS = {'OS-REMODEL-jan24': {'beds': 5, 'bedrooms': 5, 'baths': 3, 'office': True}, 'OS-REMODEL-apr24b': {'beds': 6, 'bedrooms': 6, 'baths': 3, 'office': True}}
AS_BUILT = {'name': 'As built', 'beds': 6, 'bedrooms': 6, 'baths': 3, 'office': True, 'description': 'The house as it stands: six bedrooms (three on the main level, two on the lower level, the primary suite upstairs), three full baths and the skylit office.'}

def register(hide, hide_ranges, glb_sha):
    path = os.path.join(B2, 'scene.meta.json'); txt = open(path).read(); meta = json.loads(txt)
    entry = {'id': OPT_ID, 'legacyId': LEGACY, 'set': 'OS-REMODEL'}
    entry.update(CARD)
    entry.update({'hide': hide, 'hideRanges': hide_ranges, 'glb': GLB_OUT, 'sha256': glb_sha, 'remap': [], 'meta': META_OUT,
                  'region': [[-10.5, -1.4], [5.4, -1.4], [5.4, 4.4], [37.0, 4.4], [37.0, 32.5], [5.0, 32.5], [5.0, 27.1], [-7.0, 27.1], [-7.0, 18.85], [-9.95, 18.85]],
                  'clearRegion': [[X_KIT + 0.6, Y_S - 0.3], [37.3, Y_S - 0.3], [37.3, Y_N + 0.3], [X_W + 0.05, Y_N + 0.3], [X_W + 0.05, Y_KIT - 0.9], [X_KIT + 0.6, Y_KIT - 0.9]],
                  'walkStart': {'at': [10.6, 15.6], 'look': [36.0, 18.4]},
                  'walkTests': [[[27.5, 12.5], [27.5, 27.0], 'open'], [[19.0, 15.0], [19.0, 26.0], 'open'], [[20.0, 24.0], [28.0, 24.0], 'open'],
                                [[33.0, 27.0], [33.0, 31.2], 'open'], [[33.0, 14.0], [33.0, 20.0], 'open'],
                                [[30.0, 20.0], [38.5, 20.0], 'wall'], [[30.0, 28.0], [30.0, 34.0], 'wall'], [[18.0, 28.0], [10.0, 28.0], 'wall']],
                  'labels': [{'name': 'Living', 'at': [32.0, 18.4]}, {'name': 'Dining', 'at': [22.3, 18.4]}, {'name': 'Kitchen', 'at': [10.0, 12.0]},
                             {'name': 'Reading corner', 'at': [19.0, 28.6]}, {'name': 'Bedroom', 'at': [-0.8, 21.5]}, {'name': 'Bath', 'at': [9.4, 29.2]}],
                  'views': {
                      'foyer': {'pos': [-5.5, 5.0, -2.3], 'look': [16.0, 4.6, 26.0]},
                      'kitchen': {'pos': [12.4, 5.0, 9.6], 'look': [18.6, 5.6, 36.6]},
                      'street': {'pos': [18.4, 2.6, 52.0], 'look': [18.4, 6.4, 30.0]},
                      'backbed': {'pos': [23.9, 5.0, 4.6], 'look': [17.0, 5.8, 30.0]},
                      'reading': {'pos': [29.8, 5.0, 33.6], 'look': [12.0, 5.2, 18.0]},
                      'aerial': {'pos': [-12.0, 62.0, 52.0], 'look': [18.4, 0.0, 22.0]}}})
    opts = [o for o in meta['options'] if o['id'] != OPT_ID]
    for o in opts:
        for k, v in EXISTING_FACTS.get(o['id'], {}).items(): o[k] = v
    meta['options'] = opts + [entry]
    meta['asBuilt'] = AS_BUILT
    open(path, 'w').write(json.dumps(meta, separators=(',', ':'), ensure_ascii=False))

def main():
    if '--register-only' in sys.argv:
        raw = open(os.path.join(B2, GLB_OUT), 'rb').read(); m = json.load(open(os.path.join(B2, 'scene.meta.json')))
        old = next((o for o in m['options'] if o['id'] == OPT_ID), None)
        if not old: sys.exit('no previous registration to keep the hide list from; run a full build')
        register(old['hide'], old.get('hideRanges', []), hashlib.sha256(raw).hexdigest()); print('registered'); return
    meta, hide, hide_ranges, elements, bounds, report = build()
    D = option_data(meta, elements, bounds)
    json.dump(D, open(os.path.join(B2, META_OUT), 'w'), separators=(',', ':'))
    raw = open(os.path.join(B2, GLB_OUT), 'rb').read()
    register(hide, hide_ranges, hashlib.sha256(raw).hexdigest())
    print(json.dumps(report, indent=1)); print('hide', len(hide), 'hideRanges', hide_ranges, 'glb bytes', len(raw))

if __name__ == '__main__':
    main()
