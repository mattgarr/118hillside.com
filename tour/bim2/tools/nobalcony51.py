#!/usr/bin/env python3
"""Design option r51: the primary bedroom without the balcony (owner 11/18/2026: "abandon the balcony and just put standard windows (three
of them) at the same sill and top height to replace the existing sliding door ... a simple option rather than a whole new concept or floor
plan. And make the whole sloped roof in that area standard."; then: "sills at the same height as the other windows, heads the same too").

Not a layout idea (those replace the main level and only one shows at a time): an overlay that works on top of whichever layout is on.
It writes tour/bim2/scene.nobalcony51.glb and registers it in tour/bim2/scene.meta.json `overlays[]`:
  hide       as-built elements the overlay removes (the stacking doors D-L2-01 with their lining, threshold and casings inside and out,
             the deck SL-DK-BALC, the three low walls round it W-L2-P01..P03 with their caps and corner boards)
  glb        what it adds, in the house's own materials (the page maps them as it maps scene.glb):
             - the wall where the doors stood: lap siding outside, the bedroom's paint inside, the baseboard run through
             - three windows, each one casement of the bedroom's own north window (WN-L2-05, the 2024 wing's white Andersen pair, 2 x 2
               lites) taken as a single unit 2 ft wide, at that window's sill (8.695) and head (12.695): its frame, glass and jamb lining,
               its flat casing with head cap, stool and apron inside, its trim outside
             - the lower roof carried across where the deck was: the same plane, shingles and underside as the roof on each side
  colliders  the new wall (world frame boxes are built by the page from these BIM-frame records)
  floorsOff  walkable records that stop holding a walker while it shows
Every number comes from the model (scene.glb / scene.meta.json); nothing else in the repository changes.
Run: python3 tour/bim2/tools/nobalcony51.py          (safe to run again: it rebuilds the GLB and replaces its own overlays[] entry)
"""
import hashlib, json, os, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import doors46 as D46
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
import shapely

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
B2 = os.path.join(ROOT, 'tour', 'bim2')
OV_ID = 'nobalcony51'
GLB_OUT = 'scene.nobalcony51.glb'

HIDE = ['D-L2-01', 'SL-DK-BALC', 'W-L2-P01', 'W-L2-P02', 'W-L2-P03', 'TR-0304', 'TR-0305', 'TR-0306', 'TR-0867', 'TR-0868', 'TR-0869', 'TR-0870',
        'TR-0536', 'TR-0537', 'TR-0538', 'TR-0539', 'TR-0540', 'TR-0541', 'TR-0542', 'TR-0543']
SRC_WIN = 'WN-L2-05'                                   # the primary bedroom's north window: a pair of casements
SRC_TRIM = ['TR-0796', 'TR-0797', 'TR-0798', 'TR-0799',   # its outside trim: head, legs, sill
            'TR-0800', 'TR-0801', 'TR-0802', 'TR-0803', 'TR-0804', 'TR-0961', 'TR-0020']   # inside: casing, head cap, frieze, legs, stool, apron
PAINT = 'paint-int-flat#PAINT-SW-6241-ALEUTIAN'
SIDING = 'hardie-lap#paint-ext-body'
STUD = 'stud-2x6'
TRIM = 'mdf-primed#paint-trim-semigloss'
SHINGLE = 'comp-shingle-arch'
SOFFIT = 'soffit'
UNIT_W = 2.0                                           # rough opening of each new window (ft); the source casement's is 2.853


def elem(g, el):
    out = []
    for p in g.prims:
        me = g.J['meshes'][p['mesh']]; ex = me.get('extras', {}); nx = g.J['nodes'][g.node_of[p['mesh']]].get('extras', {})
        mat = ex.get('material') or nx.get('material'); t = g.trans(p['mesh'])
        for r in ex.get('ranges') or []:
            if r[0] != el: continue
            tri = p['I'][r[2]:r[2] + r[3]]
            W = p['V'][tri.ravel(), :3].astype(float) + t
            out.append(dict(mat=mat, group=ex.get('group') or nx.get('group'), storey=ex.get('storey') or nx.get('storey'), bnd=r[1],
                            B=W[:, [2, 0, 1]].reshape(-1, 3, 3), NB=p['V'][tri.ravel(), 3:6].astype(float)[:, [2, 0, 1]].reshape(-1, 3, 3)))
    assert out, el
    return out


# ------------------------------------------------------------------ the single unit, cut from the pair (north-wall frame, BIM feet)
def clip_tri(P, N, c):
    """keep the part of triangle P (3x3) with x <= c; returns a list of (P, N) triangles"""
    poly = list(zip(P, N)); out = []
    for i in range(3):
        a, na = poly[i]; b, nb = poly[(i + 1) % 3]
        ia, ib = a[0] <= c + 1e-9, b[0] <= c + 1e-9
        if ia: out.append((a, na))
        if ia != ib:
            t = (c - a[0]) / (b[0] - a[0]); q = a + t * (b - a); q[0] = c; out.append((q, na + t * (nb - na)))
    if len(out) < 3: return []
    return [(np.array([out[0][0], out[k][0], out[k + 1][0]]), np.array([out[0][1], out[k][1], out[k + 1][1]])) for k in range(1, len(out) - 1)]


def unit_pieces(g):
    W = elem(g, SRC_WIN)
    gl = [e for e in W if e['mat'] == 'glass'][0]['B'].reshape(-1, 3)[:, 0]
    xs = np.unique(np.round(gl, 4))                     # pane edges: the left unit's two panes meet its vertical bar at its centre
    c = float((xs[1] + xs[2]) / 2)                      # -34.3345
    lin = [e for e in W if e['mat'] == 'paint-trim-semigloss'][0]['B'].reshape(-1, 3)
    x_left = float(lin[:, 0].min())                     # the rough opening's left side (jamb lining)
    shift = (2 * (c - x_left) - UNIT_W) / 2             # taken out of each half, inside the panes (no member stands there)
    x_cut = float((xs[0] + xs[1]) / 2)
    cu = c - shift                                      # the new unit's centre
    pieces = []
    src = [(SRC_WIN, e) for e in W] + [(t, e) for t in SRC_TRIM for e in elem(g, t)]
    for name, e in src:
        T = []
        for P, N in zip(e['B'], e['NB']):
            for q, n in clip_tri(P.copy(), N.copy(), c):
                q = q.copy(); q[q[:, 0] > x_cut + 1e-6, 0] -= shift
                T.append((q, n))
                m = q.copy(); m[:, 0] = 2 * cu - m[:, 0]; mn = n.copy(); mn[:, 0] = -mn[:, 0]
                T.append((m[[0, 2, 1]], mn[[0, 2, 1]]))
        if T:
            pieces.append(dict(src=name, mat=e['mat'], group=e['group'], storey=e['storey'], P=np.array([t[0] for t in T]), N=np.array([t[1] for t in T])))
    rough = (x_left - cu, -(x_left - cu))
    return pieces, cu, rough, shift


# ------------------------------------------------------------------ mesh accumulation (world frame for the GLB: X = BIM y, Y = z, Z = BIM x)
class Acc:
    def __init__(self): self.m = {}
    def add(self, group, storey, mat, el, P, N):
        """P, N: (n, 3, 3) BIM frame"""
        k = (group, storey, mat); d = self.m.setdefault(k, {'P': [], 'N': [], 'ranges': [], 'n': 0})
        n = len(P); d['P'].append(np.asarray(P, float)); d['N'].append(np.asarray(N, float))
        if d['ranges'] and d['ranges'][-1][0] == el: d['ranges'][-1][3] += n
        else: d['ranges'].append([el, None, d['n'], n])
        d['n'] += n


def quad(a, b, c, d, n):
    """two triangles a b c, a c d (counter-clockwise seen from the side n points to)"""
    P = np.array([[a, b, c], [a, c, d]], float); nn = np.tile(np.asarray(n, float), (2, 3, 1))
    f = np.cross(P[0, 1] - P[0, 0], P[0, 2] - P[0, 0])
    if np.dot(f, n) < 0: P = P[:, [0, 2, 1]]
    return P, nn


def wall_face(x, y0, y1, z0, z1, holes, n):
    """the rectangle y0..y1 x z0..z1 in the plane BIM x = const, less rectangular holes [(ya, yb, za, zb)], as quads"""
    zs = sorted({z0, z1} | {h[2] for h in holes} | {h[3] for h in holes})
    out = []
    for za, zb in zip(zs[:-1], zs[1:]):
        cut = sorted([(h[0], h[1]) for h in holes if h[2] <= za + 1e-9 and h[3] >= zb - 1e-9])
        ys = [y0]
        for a, b in cut: ys += [a, b]
        ys.append(y1)
        for i in range(0, len(ys), 2):
            if ys[i + 1] - ys[i] < 1e-6: continue
            out.append(quad([x, ys[i], za], [x, ys[i + 1], za], [x, ys[i + 1], zb], [x, ys[i], zb], n))
    return out


def roof_gap(g):
    """the part of the deck's rectangle no roof covers: the polygon the carried-across roof fills"""
    tris = []
    for el in ('RF-L02', 'RF-L03', 'RF-L05'):
        for e in elem(g, el):
            if e['mat'] != SHINGLE: continue
            for P, N in zip(e['B'], e['NB']):
                if N[0, 2] < .5: continue
                t = Polygon(P[:, :2])
                if t.area > 1e-7: tris.append(t.buffer(0))
    cover = unary_union(tris)
    R = box(-46.30, -22.70, -40.358, -12.70)
    gap = R.difference(cover)
    parts = [p for p in getattr(gap, 'geoms', [gap]) if p.area > 1e-3]
    return parts, cover


def main():
    g = D46.Glb(os.path.join(B2, 'scene.glb'))
    meta = json.load(open(os.path.join(B2, 'scene.meta.json')))
    op = {o['id']: o for o in meta['openings']}
    door = op['D-L2-01']; win = op[SRC_WIN]
    A = Acc(); rep = {}

    # the wall faces: from the door's own lining and the wall's faces
    lin = [e for e in elem(g, 'D-L2-01') if e['mat'] == PAINT][0]['B'].reshape(-1, 3)
    yA, yB = float(lin[:, 1].min()), float(lin[:, 1].max())         # -22.056 .. -13.306
    zHead = float(door['head'])                                    # 13.57
    X_IN, X_OUT = -39.796, -40.358                                 # the wall's paint face and siding face (W-L2-022)
    wi = [e for e in elem(g, 'W-L2-022') if e['mat'] == PAINT][0]['B'].reshape(-1, 3)
    X_IN = float(np.round(np.median(wi[:, 0]), 4))
    sid = [e for e in elem(g, 'W-L2-022') if e['mat'] == SIDING]
    X_OUT = float(min(e['B'][:, :, 0].min() for e in sid))

    # the three windows, centred on the door opening, solid wall between and at the ends
    pieces, cu, rough, shift = unit_pieces(g)
    sill, head = float(win['sill']), float(win['head'])            # 8.695 / 12.695: the bedroom's north window
    mid = (yA + yB) / 2; end = .125; pitch = ((yB - yA) - 2 * end - UNIT_W) / 2
    centres = [mid - pitch, mid, mid + pitch]
    # north wall (BIM x along, y out) -> west wall (BIM y along, -x out): X = -y + k, Y = x - cu + cy
    k = X_IN + (-8.7845)                                           # the north wall's paint face is y = -8.7845
    for i, cy in enumerate(centres):
        el = 'NB51-WN-%d' % (i + 1)
        for p in pieces:
            P = p['P']; Q = np.empty_like(P); Q[..., 0] = -P[..., 1] + k; Q[..., 1] = P[..., 0] - cu + cy; Q[..., 2] = P[..., 2]
            N = p['N']; M = np.empty_like(N); M[..., 0] = -N[..., 1]; M[..., 1] = N[..., 0]; M[..., 2] = N[..., 2]
            elp = el if p['src'] == SRC_WIN else el + '-' + p['src']
            A.add(p['group'], p['storey'], p['mat'], elp, Q, M)
    holes = [(cy - UNIT_W / 2, cy + UNIT_W / 2, sill, head) for cy in centres]
    # each face fills what the wall's own face leaves open around the doors: the opening, and the strips the kernel left bare under the
    # doors' casings (the wall face stops at a casing's edge), less the three rough openings
    def fill(mat, x, region, n):
        T = [Polygon(P[:, [1, 2]]) for e in elem(g, 'W-L2-022') + elem(g, 'W-L2-023') if e['mat'] == mat for P in e['B'] if np.all(np.abs(P[:, 0] - x) < .006)]
        # slivers (under 3/8 in across) along the old opening's edges carry the old lining's shading as a dark line: the new face covers
        # them too, standing 1/20 in proud of the wall so it is drawn over them
        alt = lambda t: 2 * t.area / max(np.hypot(*np.diff(np.array(t.exterior.coords), axis=0).T))
        U = unary_union([t.buffer(2e-4) for t in T if t.area > 1e-9 and alt(t) > .03])
        x = x + .004 * n[0]
        F = region.difference(U)
        for (ya, yb, za, zb) in holes: F = F.difference(box(ya, za, yb, zb))
        out = 0
        for poly in getattr(F, 'geoms', [F]):
            if poly.area < 1e-5: continue
            for t in shapely.constrained_delaunay_triangles(poly).geoms:
                c = np.array(t.exterior.coords)[:3]
                if Polygon(c).area < 1e-9: continue
                P, N = np.array([[x, a, b] for a, b in c]), np.tile(np.asarray(n, float), (3, 1))
                if np.dot(np.cross(P[1] - P[0], P[2] - P[0]), n) < 0: P = P[[0, 2, 1]]
                A.add('walls', 'L2', mat, 'NB51-WALL', P[None], N[None]); out += Polygon(c).area
        return round(out, 3)
    rep['siding_ft2'] = fill(SIDING, X_OUT, box(-22.40, 5.345, -12.95, 14.0), [-1, 0, 0])
    rep['paint_ft2'] = fill(PAINT, X_IN, box(-22.60, 5.51, -12.80, 14.10), [1, 0, 0])
    for (ya, yb, za, zb) in holes:          # the rough openings' sides (behind the lining and the frame)
        for P, N in [quad([X_IN, ya, za], [X_OUT, ya, za], [X_OUT, ya, zb], [X_IN, ya, zb], [0, 1, 0]),
                     quad([X_IN, yb, za], [X_OUT, yb, za], [X_OUT, yb, zb], [X_IN, yb, zb], [0, -1, 0]),
                     quad([X_IN, ya, za], [X_OUT, ya, za], [X_OUT, yb, za], [X_IN, yb, za], [0, 0, 1]),
                     quad([X_IN, ya, zb], [X_OUT, ya, zb], [X_OUT, yb, zb], [X_IN, yb, zb], [0, 0, -1])]:
            A.add('walls', 'L2', STUD, 'NB51-WALL', P, N)
    # the baseboard, run through where the door stood: the profile of TR-0275, from its end to the start of TR-0276
    bL = elem(g, 'TR-0275')[0]['B'].reshape(-1, 3); bR = elem(g, 'TR-0276')[0]['B'].reshape(-1, 3)
    y0b, y1b = float(bL[:, 1].max()) - .005, float(bR[:, 1].min())
    prof = [(-39.7955, 5.57), (-39.7486, 5.57), (-39.7486, 5.9554), (-39.7434, 5.9683), (-39.733, 5.9783), (-39.7278, 5.9983), (-39.733, 6.0029), (-39.7382, 6.0075), (-39.7955, 6.0075)]
    for (xa, za), (xb, zb) in zip(prof[:-1], prof[1:]):
        n = np.array([zb - za, 0, -(xb - xa)]); n = n / np.linalg.norm(n)     # the profile runs counter-clockwise (x into the room, z up)
        if n[2] < -.5: continue                                               # its underside sits on the floor
        P, N = quad([xa, y0b, za], [xb, y0b, zb], [xb, y1b, zb], [xa, y1b, za], n)
        A.add('trim', 'L2', TRIM, 'NB51-BASE', P, N)

    # the roof carried across: the same plane as RF-L02 / L03 / L05 (top 18.14525 + 0.25 x, underside 17.89525 + 0.25 x)
    parts, cover = roof_gap(g)
    top = lambda x: 18.14525 + .25 * x; und = lambda x: 17.89525 + .25 * x
    nt = np.array([-.25, 0, 1.0]); nt /= np.linalg.norm(nt)
    area = 0
    for poly in parts:
        area += poly.area
        T = shapely.constrained_delaunay_triangles(poly)
        for t in T.geoms:
            c = np.array(t.exterior.coords)[:3]
            if Polygon(c).area < 1e-8: continue
            P = np.array([[x, y, top(x)] for x, y in c]); U = np.array([[x, y, und(x)] for x, y in c])
            if np.dot(np.cross(P[1] - P[0], P[2] - P[0]), nt) < 0: P = P[[0, 2, 1]]; U = U[[0, 2, 1]]
            A.add('roofs', 'L1', SHINGLE, 'NB51-ROOF', P[None], np.tile(nt, (1, 3, 1)))
            A.add('roofs', 'L1', SOFFIT, 'NB51-ROOF', U[None][:, [0, 2, 1]], np.tile(-nt, (1, 3, 1)))
    rep['roof_ft2'] = round(area, 3); rep['roof_parts'] = len(parts)
    rep['roof_at_wall'] = round(top(X_OUT), 4)

    # ------------------------------------------------------------------ GLB
    J = {'asset': {'version': '2.0', 'generator': 'tour/bim2/tools/nobalcony51.py (r51)'}, 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
         'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': [{'byteLength': 0}]}
    bin_ = bytearray(); mats = {}
    def view(arr, target):
        while len(bin_) % 4: bin_.append(0)
        o = len(bin_); b = np.ascontiguousarray(arr).tobytes(); bin_.extend(b)
        J['bufferViews'].append({'buffer': 0, 'byteOffset': o, 'byteLength': len(b), 'target': target}); return len(J['bufferViews']) - 1
    for (group, storey, mat), d in sorted(A.m.items(), key=lambda kv: tuple(str(x) for x in kv[0])):
        Pb = np.concatenate(d['P']).reshape(-1, 3); Nb = np.concatenate(d['N']).reshape(-1, 3)
        Nb = Nb / np.maximum(np.linalg.norm(Nb, axis=1, keepdims=True), 1e-12)
        Pw = Pb[:, [1, 2, 0]].astype(np.float32); Nw = Nb[:, [1, 2, 0]].astype(np.float32)
        U = D46.uv_box(Pw, Nw).astype(np.float32); I = np.arange(len(Pw), dtype=np.uint32)
        if mat not in mats:
            J['materials'].append({'name': mat, 'extras': {'bim2Material': mat}, 'pbrMetallicRoughness': {'roughnessFactor': .8, 'metallicFactor': 0}}); mats[mat] = len(J['materials']) - 1
        acc = []
        for arr, typ, ct, tg in ((Pw, 'VEC3', 5126, 34962), (Nw, 'VEC3', 5126, 34962), (U, 'VEC2', 5126, 34962), (I, 'SCALAR', 5125, 34963)):
            a = {'bufferView': view(arr, tg), 'componentType': ct, 'count': int(len(arr)), 'type': typ}
            if typ == 'VEC3' and len(acc) == 0: a['min'] = [float(v) for v in Pw.min(0)]; a['max'] = [float(v) for v in Pw.max(0)]
            J['accessors'].append(a); acc.append(len(J['accessors']) - 1)
        name = '%s|%s|%s' % (group, storey or '-', mat); ex = {'group': group, 'storey': storey, 'material': mat}
        J['meshes'].append({'name': name, 'extras': dict(ex, ranges=d['ranges'], overlay=OV_ID),
                            'primitives': [{'attributes': {'POSITION': acc[0], 'NORMAL': acc[1], 'TEXCOORD_0': acc[2]}, 'indices': acc[3], 'material': mats[mat], 'mode': 4}]})
        J['nodes'].append({'name': name, 'extras': dict(ex, overlay=OV_ID), 'mesh': len(J['meshes']) - 1}); J['scenes'][0]['nodes'].append(len(J['nodes']) - 1)
    while len(bin_) % 4: bin_.append(0)
    J['buffers'][0]['byteLength'] = len(bin_)
    js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    glb = bytearray(b'glTF') + struct.pack('<II', 2, 0) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(bin_)) + b'BIN\x00' + bin_
    struct.pack_into('<I', glb, 8, len(glb))
    open(os.path.join(B2, GLB_OUT), 'wb').write(glb)
    sha = hashlib.sha256(glb).hexdigest()

    # ------------------------------------------------------------------ register
    entry = {'id': OV_ID, 'name': 'Primary bedroom without the balcony', 'status': 'illustrative', 'storey': 'L2', 'glb': GLB_OUT, 'sha256': sha, 'bytes': len(glb),
             'hide': HIDE,
             # the new wall stops a walker (BIM frame: x0, x1, y0, y1, z0, z1)
             'colliders': [{'id': 'NB51-WALL#0', 'element': 'NB51-WALL', 'kind': 'WALL', 'poly': [[X_OUT, yA], [X_IN, yA], [X_IN, yB], [X_OUT, yB]], 'z0': 5.34, 'z1': zHead, 'storey': 'L2', 'exterior': True}],
             'floorsOff': ['SL-DK-BALC'],
             # loose page-built pieces standing on the deck or on its wall (chairs, stool, lights) hide while it shows
             'clearBox': [-46.4, -40.15, -22.8, -12.6, 5.3, 12.6],
             'windows': [{'id': 'NB51-WN-%d' % (i + 1), 'center': [round(X_OUT + (X_IN - X_OUT) / 2, 4), round(cy, 4)], 'width': UNIT_W, 'sill': sill, 'head': head,
                          'like': SRC_WIN} for i, cy in enumerate(centres)],
             'note': 'r51: the stacking doors become a wall with three casement windows (one unit of WN-L2-05 each, %.2f ft rough, sill %.3f, head %.3f); the lower roof plane is carried across the deck.' % (UNIT_W, sill, head)}
    meta['overlays'] = [o for o in meta.get('overlays', []) if o.get('id') != OV_ID] + [entry]
    open(os.path.join(B2, 'scene.meta.json'), 'w').write(json.dumps(meta, separators=(',', ':'), ensure_ascii=False))
    rep.update({'glb': GLB_OUT, 'bytes': len(glb), 'sha256': sha[:12], 'meshes': len(J['meshes']), 'tris': int(sum(d['n'] for d in A.m.values())),
                'opening': [round(yA, 4), round(yB, 4)], 'centres': [round(c, 4) for c in centres], 'unit_w': UNIT_W, 'pane_cut_each_half': round(shift, 4),
                'wall_between_rough': round(pitch - UNIT_W, 4), 'end_wall': end, 'sill': sill, 'head': head,
                'sill_above_roof_in': round((sill - top(X_OUT)) * 12, 2), 'faces': [X_IN, X_OUT]})
    print(json.dumps(rep))


if __name__ == '__main__':
    main()
