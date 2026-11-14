#!/usr/bin/env python3
"""Siding r49 (owner 11/14/2026, the open plan: "I am seeing exterior siding inside").

In the layout ideas the walls of the original house that come out leave their upper storey's gable infill behind (W-L2-*: a wall from the
old wall plate, 7.78 ft, up into the roof). The kernel export clads both of its faces in the house's exterior lap siding (Hardie lap) and
leaves its framing bare above that, so where the infill now stands over an open room the room shows planked siding and studs. Other
interior faces carry the same exterior finish where a 2024 wall was compiled as an outside wall. This tool patches the shipped packages in
place (tour/, halloween/, thanksgiving/) and is safe to run again:

  1  repaint. Every triangle in an exterior finish (Hardie lap or shingle, Hardie trim, painted fascia) that faces into an interior room of
     the idea below that room's ceiling becomes that room's own wall paint (the paint the room's other walls have). Bare framing (stud-2x4,
     stud-2x6) facing a room on the same elements gets the same where the element is the idea's own (not in scene.glb). The triangles move, with their element and boundary, into the paint mesh of the same
     storey (same material and mesh as the room's walls, so they light, section and repaint like every other wall). What sits above a
     room's ceiling (inside the roof) is left as it is.
  2  apr24b: the gable infill over the old living-room wall (W-L2-C01) hangs in the middle of the family room: the room is the same on both
     sides and its vault runs straight through. The part over the room is removed (up to the face of the infill that does stand, W-L2-C02,
     over the family room / kitchen wall); the room's ceiling is closed across the strip it leaves (the room's own two vault planes,
     the ceiling's own board thickness); the cut end of what stays gets a painted end. Its collider is cut back the same way.
  3  jan24: the kitchen's two vaults (the old wing's and the main roof's) meet at x = 4.82 with a step of up to 2.2 ft. Nothing closed the
     step: the wing roof's fascia and the roof undersides showed through it, and past them the sky. A painted face closes it, 1/8 in
     proud of the fascia.

Run: python3 tour/bim2/tools/siding49.py      then   python3 tour/bim2/tools/doors46.py   (both report 0 changes on a second run)
"""
import hashlib, json, os, re, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import doors46 as D46

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
SITES = ('tour', 'halloween', 'thanksgiving')
IDEAS = ('jan24', 'apr24b', 'open4k')
EXT = re.compile(r'\|(hardie-lap|hardie-shingle|hardie-trim|fascia-painted)')
FRAMING = re.compile(r'\|stud-2x[46]$')
PAINT_RX = re.compile(r'^walls\|[^|]+\|(paint-int-[^|]+)$')
CEIL = 'gwb-l5#paint-ceiling-flat'
DEFAULT_PAINT = 'paint-int-flat#PAINT-BM-1472-SILVER-CHAIN'


def W2B(P): return np.asarray(P, float)[..., [2, 0, 1]]           # package world (X = BIM y, Y = z, Z = BIM x) -> BIM
def B2W(P): return np.asarray(P, float)[..., [1, 2, 0]]


def inpoly(poly, x, y):
    c = False; n = len(poly)
    for i in range(n):
        x0, y0 = poly[i]; x1, y1 = poly[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0): c = not c
    return c


class Rooms:
    """the idea's interior spaces: where a point is, and the ceiling over it"""
    def __init__(self, meta):
        self.S = [s for s in meta['spaces'] if s.get('interior') and not s.get('openAir')]
    def ceiling(self, s, x, y):
        zs = [p['P']['c'] + p['P']['gx'] * x + p['P']['gy'] * y for p in s['ceiling'].get('planes', []) if inpoly(p['poly'], x, y)]
        if zs: return min(zs)
        zs = [p['P']['c'] + p['P']['gx'] * x + p['P']['gy'] * y for p in s['ceiling'].get('planes', [])]
        return max(zs) if zs else None
    def at(self, x, y, z):
        """the space a point is in, under its ceiling (z: the height that has to be under it)"""
        for s in self.S:
            if not inpoly(s['polygon'], x, y) or z < s['floorZ'] - .05: continue
            c = self.ceiling(s, x, y)
            if c is not None and z > c - .01: continue
            return s['id']
        return None


def tri_rooms(R, B):
    """the rooms a triangle (BIM, 3x3) faces into: sample points on the face, stepped out along its normal"""
    n = np.cross(B[1] - B[0], B[2] - B[0]); a = np.linalg.norm(n)
    if a < 1e-7: return set()
    n /= a; c = B.mean(0); out = set()
    for q in [c] + [c + .7 * (v - c) for v in B] + [c + .45 * (B[i] + B[(i + 1) % 3] - 2 * c) for i in range(3)]:
        for d in (.05, .3):
            o = q + n * d; s = R.at(o[0], o[1], q[2] if abs(n[2]) < .7 else o[2])
            if s: out.add(s)
    return out


def runs(g, rx):
    for p in g.prims:
        me = g.J['meshes'][p['mesh']]; name = me.get('name', '')
        if not rx.search(name): continue
        for r in me.get('extras', {}).get('ranges', []):
            if r[3]: yield p, me, r


def world(g, p, tri): return p['V'][tri, :3].astype(float) + g.trans(p['mesh'])


def room_paints(g, R):
    """each room's wall paint: the paint (by area) of the wall faces that face into it"""
    acc = {}
    for p, me, r in runs(g, PAINT_RX):
        mat = PAINT_RX.search(me['name']).group(1)
        for t in p['I'][r[2]:r[2] + r[3]]:
            B = W2B(world(g, p, t)); a = np.linalg.norm(np.cross(B[1] - B[0], B[2] - B[0])) / 2
            if a < .05: continue
            n = np.cross(B[1] - B[0], B[2] - B[0]); n /= np.linalg.norm(n)
            if abs(n[2]) > .3: continue
            c = B.mean(0) + n * .3; s = R.at(c[0], c[1], B.mean(0)[2])
            if s: acc.setdefault(s, {}); acc[s][mat] = acc[s].get(mat, 0) + a
    return {s: max(d, key=d.get) for s, d in acc.items()}


def ensure_material(g, name, src):
    if any(m.get('name') == name for m in g.J['materials']): return
    m = next(m for m in src.J['materials'] if m.get('name') == name); g.J['materials'].append(json.loads(json.dumps(m))); g.dirty = True


def mesh_for(g, group, storey, mat):
    name = '%s|%s|%s' % (group, storey, mat)
    for p in g.prims:
        me = g.J['meshes'][p['mesh']]
        if me.get('name') == name and not me.get('extras', {}).get('leaf'): return p
    return g.add_mesh(name, {'group': group, 'storey': storey, 'material': mat}, mat)


def take(g, p, r, keep_mask):
    """drop the triangles of run r not in keep_mask (bool per triangle of the run)"""
    tri = p['I'][r[2]:r[2] + r[3]]; P = world(g, p, tri.ravel()).reshape(-1, 3); N = p['V'][tri.ravel(), 3:6].astype(float)
    k = np.repeat(keep_mask, 3); T = np.arange(k.sum()).reshape(-1, 3)
    D46.replace_run(g, p, r, P[k], N[k], T)


def put(g, group, storey, mat, el, bnd, P, N, T):
    q = mesh_for(g, group, storey, mat); D46.add_run(g, q, el, P, N, T); q_r = g.J['meshes'][q['mesh']]['extras']['ranges'][-1]; q_r[1] = bnd


# ------------------------------------------------------------------------------------------------ 1 repaint
def repaint(g, R, paints, idea, rep, skip_els=()):
    hits = []                                                       # (prim, run, triangle mask, room per triangle)
    sided = set()
    for p, me, r in list(runs(g, EXT)):
        if r[0] in skip_els or me['name'].split('|')[1] == '-': continue      # roof-edge trim (no storey) stays: it is outside or above a ceiling
        tri = p['I'][r[2]:r[2] + r[3]]; rooms = [tri_rooms(R, W2B(world(g, p, t))) for t in tri]
        m = np.array([bool(x) for x in rooms])
        if m.any(): hits.append((p, me, r, m, rooms)); sided.add(r[0])
    for p, me, r in list(runs(g, FRAMING)):
        if r[0] not in sided or r[0] in BASE_ELS: continue                  # the idea's own walls only; the house's framing is as built
        tri = p['I'][r[2]:r[2] + r[3]]; rooms = [tri_rooms(R, W2B(world(g, p, t))) for t in tri]
        m = np.array([bool(x) for x in rooms])
        if m.any(): hits.append((p, me, r, m, rooms))
    for p, me, r, m, rooms in hits:
        storey = me['name'].split('|')[1]; src = me['name'].split('|')[2]; tri = p['I'][r[2]:r[2] + r[3]]; area = {}; by = {}
        for i in np.nonzero(m)[0]:
            rm = sorted(rooms[i])[0]; mat = paints.get(rm, DEFAULT_PAINT); by.setdefault(mat, []).append(i)
            B = W2B(world(g, p, tri[i])); area[rm] = area.get(rm, 0) + np.linalg.norm(np.cross(B[1] - B[0], B[2] - B[0])) / 2
        for mat, ids in by.items():
            ids = np.array(ids); P = world(g, p, tri[ids].ravel()).reshape(-1, 3); N = p['V'][tri[ids].ravel(), 3:6].astype(float)
            ensure_material(g, mat, BASE[0]); put(g, 'walls', storey, mat, r[0], r[1], P, N, np.arange(len(P)).reshape(-1, 3))
        take(g, p, r, ~m)
        rep.append((idea, r[0], r[1] or '-', '%s -> %s' % (src, ' / '.join(sorted(m_.split('#')[-1] for m_ in by))),
                    '%d triangles, %s' % (m.sum(), ', '.join('%s %.1f sq ft' % (k, v) for k, v in sorted(area.items())))))


# ------------------------------------------------------------------------------------------------ geometry helpers
def clip(poly, ax, val, keep_hi):
    """clip a polygon of (P, N) vertices (BIM) by the plane coordinate[ax] = val"""
    out = []; n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]; da = a[0][ax] - val; db = b[0][ax] - val
        ina = da >= -1e-9 if keep_hi else da <= 1e-9; inb = db >= -1e-9 if keep_hi else db <= 1e-9
        if ina: out.append(a)
        if ina != inb and abs(da - db) > 1e-12:
            t = da / (da - db); out.append((a[0] + (b[0] - a[0]) * t, a[1]))
    return out


class Mesher:
    def __init__(self): self.P = []; self.N = []; self.T = []
    def face(self, pts, n):
        """a convex planar face (BIM) with outward normal n (BIM); stored in package world coordinates"""
        P = [B2W(np.array(q, float)) for q in pts]; nw = B2W(np.array(n, float)); nw /= np.linalg.norm(nw); b = len(self.P)
        for q in P: self.P.append(q); self.N.append(nw)
        for i in range(1, len(P) - 1):
            t = [b, b + i, b + i + 1]
            if np.cross(P[i] - P[0], P[i + 1] - P[0]) @ nw < 0: t = [b, b + i + 1, b + i]
            self.T.append(t)
    def arrays(self): return np.array(self.P), np.array(self.N), np.array(self.T, dtype=np.int64)


def has_el(g, el):
    return any(r[0] == el for p in g.prims for r in g.J['meshes'][p['mesh']].get('extras', {}).get('ranges', []))


# ------------------------------------------------------------------------------------------------ 2 apr24b: the infill over the family room
C01, XC, YS, YN, ZB = 'W-L2-C01', 4.9024, 14.3209, 14.6959, 7.775
VAULT = lambda x: 10.2201 + 0.2548 * x if x <= -2.28 else 9.0676 - 0.2507 * x        # the family room's two vault planes (meta SP-L1-LIVING)


def drop_infill(g, meta, paints, rep):
    """remove W-L2-C01 west of the face of W-L2-C02 (x < XC), close the family room's ceiling over the strip, give the cut a painted end"""
    cut = 0; area = 0.0
    for p in g.prims:
        me = g.J['meshes'][p['mesh']]
        for r in list(me.get('extras', {}).get('ranges', [])):
            if r[0] != C01 or not r[3]: continue
            tri = p['I'][r[2]:r[2] + r[3]]; W = world(g, p, tri.ravel()).reshape(-1, 3, 3); Nn = p['V'][tri.ravel(), 3:6].astype(float).reshape(-1, 3, 3)
            B = W2B(W)
            if B[:, :, 0].min() >= XC - 1e-4: continue
            KP, KN = [], []
            for b, nw in zip(B, Nn):
                if b[:, 0].min() >= XC - 1e-4: poly = [(q, nn) for q, nn in zip(b, nw)]
                else:
                    a0 = np.linalg.norm(np.cross(b[1] - b[0], b[2] - b[0])) / 2; poly = clip([(q, nn) for q, nn in zip(b, nw)], 0, XC, True)
                    area += a0 - (polyarea(poly) if len(poly) >= 3 else 0); cut += 1
                for i in range(1, len(poly) - 1):
                    for v in (poly[0], poly[i], poly[i + 1]): KP.append(B2W(v[0])); KN.append(v[1])
            KP = np.array(KP).reshape(-1, 3); KN = np.array(KN).reshape(-1, 3); T = np.arange(len(KP)).reshape(-1, 3)
            # drop slivers the clip leaves on the cut plane
            if len(T):
                g3 = np.cross(KP[T[:, 1]] - KP[T[:, 0]], KP[T[:, 2]] - KP[T[:, 0]]); ok = np.linalg.norm(g3, axis=1) > 1e-7; T = T[ok]
                if len(T): u = np.unique(T); m = {v: i for i, v in enumerate(u)}; KP = KP[u]; KN = KN[u]; T = np.vectorize(m.get)(T)
            D46.replace_run(g, p, r, KP, KN, T if len(T) else np.zeros((0, 3), int))
    if not cut: return False
    pm = paints.get('SP-L1-LIVING', DEFAULT_PAINT)
    # the family room's ceiling across the strip: its two vault planes, the ceiling's own 1/2 in board (bottom and top), to the wall faces
    xs = [-9.5298, -2.28, XC]; M = Mesher(); TH = 0.04
    for x0, x1 in zip(xs, xs[1:]):
        M.face([(x0, YS, VAULT(x0)), (x1, YS, VAULT(x1)), (x1, YN, VAULT(x1)), (x0, YN, VAULT(x0))], ((0.2548 if x1 <= -2.28 else -0.2507), 0, -1))
        M.face([(x0, YS, VAULT(x0) + TH), (x1, YS, VAULT(x1) + TH), (x1, YN, VAULT(x1) + TH), (x0, YN, VAULT(x0) + TH)], ((-0.2548 if x1 <= -2.28 else 0.2507), 0, 1))
    P, N, T = M.arrays(); put(g, 'ceilings', 'L1', CEIL, 'CL-SP-L1-LIVING', None, P, N, T)
    # the cut end of the stub that stays (W-L2-C02's corner): drywall from the infill's foot to above the vault
    E = Mesher(); E.face([(XC, YS, ZB), (XC, YN, ZB), (XC, YN, VAULT(XC) + .3), (XC, YS, VAULT(XC) + .3)], (-1, 0, 0))
    P, N, T = E.arrays(); ensure_material(g, pm, BASE[0]); put(g, 'walls', 'L2', pm, C01, None, P, N, T)
    for c in meta['colliders']:
        if c['element'] == C01: c['poly'] = [[XC, YS], [5.2776, YS], [5.2776, YN], [XC, YN]]
    rep.append(('apr24b', C01, '-', 'removed over the family room (x < %.2f)' % XC, '%d triangles cut, %.1f sq ft; ceiling closed over %.2f x %.2f ft; painted end' % (cut, area, XC + 9.5298, YN - YS)))
    return True


def polyarea(poly):
    P = np.array([q[0] for q in poly]); a = 0.0
    for i in range(1, len(P) - 1): a += np.linalg.norm(np.cross(P[i] - P[0], P[i + 1] - P[0])) / 2
    return a


# ------------------------------------------------------------------------------------------------ 3 jan24: the step between the kitchen's vaults
STEP = 'W-L1-S49K'


def kitchen_step(g, paints, rep):
    if has_el(g, STEP): return
    X = 4.8194 + 1 / 96                                    # 1/8 in proud of the wing roof's fascia, which lies in the step
    lo = lambda y: 6.0299 + 0.41 * y if y < 15.7375 else 18.9347 - 0.41 * y      # the wing vault (x < 4.82)
    hi = lambda y: 6.0299 + 0.41 * y if y < 18.446 else 21.1556 - 0.41 * y       # the main vault (x > 4.82)
    Y0, Y1, YK = 15.7375, 26.6698, 18.446
    M = Mesher(); M.face([(X, Y0, lo(Y0) - .005), (X, Y1, lo(Y1) - .005), (X, Y1, hi(Y1) + .05), (X, YK, hi(YK) + .05), (X, Y0, hi(Y0) + .05)], (1, 0, 0))
    pm = paints.get('SP-L1-A-KITCHEN', DEFAULT_PAINT); P, N, T = M.arrays(); put(g, 'walls', 'L1', pm, STEP, None, P, N, T)
    rep.append(('jan24', STEP, '-', 'kitchen: the step between the two vaults closed (%s)' % pm.split('#')[-1], 'x %.3f, y %.2f..%.2f, up to %.2f ft' % (X, Y0, Y1, hi(YK) - lo(YK))))


# ------------------------------------------------------------------------------------------------ main
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
BASE = []; BASE_ELS = set()


def main():
    rep = []; d0 = os.path.join(ROOT, 'tour', 'bim2'); BASE.append(D46.Glb(os.path.join(d0, 'scene.glb')))
    BASE_ELS.update(r[0] for p in BASE[0].prims for r in BASE[0].J['meshes'][p['mesh']].get('extras', {}).get('ranges', []))
    for v in IDEAS:
        gp = os.path.join(d0, 'scene.opt-OS-REMODEL-%s.glb' % v); mp = os.path.join(d0, 'scene.opt-OS-REMODEL-%s.meta.json' % v)
        if not os.path.exists(gp): continue
        g = D46.Glb(gp); meta = json.load(open(mp)); R = Rooms(meta); paints = room_paints(g, R); m0 = json.dumps(meta)
        if v == 'apr24b': drop_infill(g, meta, paints, rep)
        if v == 'jan24': kitchen_step(g, paints, rep)
        repaint(g, R, paints, v, rep)
        if g.dirty: g.save()
        if json.dumps(meta) != m0: open(mp, 'w').write(json.dumps(meta, separators=(',', ':'), ensure_ascii=False))
    for site in SITES:
        d = os.path.join(ROOT, site, 'bim2'); mp = os.path.join(d, 'scene.meta.json')
        if not os.path.exists(mp): continue
        if site != 'tour':
            for v in IDEAS:
                for ext in ('glb', 'meta.json'):
                    s, t = os.path.join(d0, 'scene.opt-OS-REMODEL-%s.%s' % (v, ext)), os.path.join(d, 'scene.opt-OS-REMODEL-%s.%s' % (v, ext))
                    if os.path.exists(t) and open(s, 'rb').read() != open(t, 'rb').read(): open(t, 'wb').write(open(s, 'rb').read())
        raw = open(mp).read(); meta = json.loads(raw)
        for o in meta.get('options', []):
            p = os.path.join(d, o['glb'])
            if os.path.exists(p): o['sha256'] = sha(p)
        new = json.dumps(meta, separators=(',', ':'), ensure_ascii=False)
        if raw != new: open(mp, 'w').write(new)
    for r in rep: print(' | '.join(str(x) for x in r))
    print('%d changes' % len(rep))


if __name__ == '__main__':
    main()
