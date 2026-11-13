#!/usr/bin/env python3
"""Doors r46 (owner 11/13/2026): knobs, and doors that shut.

1  "House has satin nickel doorknobs not levers." Every interior door's lever set (a square rose, a spindle and a lever arm on each face,
   brushed nickel) becomes a round knob on a round rose: 2-1/2 in rose, 2-1/4 in knob, 2-1/2 in off the face, at the lever's own centre
   (36 in above the foot of the leaf, 2-3/8 in backset), on both faces. The iron-and-glass entry doors and the outside sliders keep their
   own hardware (black, a different material); pocket and sliding closet leaves have no knob to change.

2  "Make sure all pocket and closet doors actually close all the way; I see a bunch of little gaps when closed."
   - sliding closet doors (BYPASS): n panels of the catalogue width lapping 1 in do not fill the opening; shut, the last panel stood 2-1/8 in
     (closets) or 1-1/8 in (the upper cabinets) short of its jamb. Each panel is made that much wider (under 2.5 %) and the panels respaced, so
     the set runs jamb to jamb with the same 1/8 in reveal at both ends. The page did this at run time for the house's own doors only; the
     layout ideas' closets are drawn fixed and showed the slot.
   - pocket doors: a leaf modelled open (in its pocket) now states how far it travels to shut (meta leaf "travel": to the middle of its
     opening), and which end its pocket is on is taken from where the leaf stands. D-L2-03 named the wrong end, so "Close the door" slid it
     further into the wall. (The page slid every pocket leaf its width less 3 in, which left a 3 in slot at the strike jamb.)
   - the foot of every interior leaf: 7/16 in clear of the floor becomes 1/8 in.

It edits the shipped packages in place, in tour/, halloween/ and thanksgiving/: scene.glb and each layout idea's GLB, then every
scene.meta.json (glb sha256 and bytes, option sha256, mesh counts, the door leaves). Safe to run again: hardware already changed is
marked in the mesh's extras, and the closing fixes measure the geometry first.

NOTE: scene.glb comes from the BIM kernel export, which is not in this repository; the same rules have to go into that export. Until
then run this after any new export, and after build_open4k.py (which still draws its one bedroom door with a box lever).
Run: python3 tour/bim2/tools/doors46.py          (--check: report only, write nothing)
"""
import hashlib, json, math, os, struct, sys
import numpy as np
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
SITES = ('tour', 'halloween', 'thanksgiving')
IN = 1 / 12
NICKEL = 'nickel-brushed'
LEAF_MATS = ('paint-trim-semigloss', 'door-panel-field')
FOOT = 0.125 * IN                 # the reveal under a shut leaf
LINING = 0.0625                   # the jamb lining (3/4 in) inside the rough opening the meta gives
FLOOR = 0.005                     # the finished floor stands this far above the storey datum in the model
# the knob, as (radius, height off the face) in inches: a round rose with a bevelled rim, a neck, a slightly flattened ball.
# Each list is one smooth surface; where two lists meet there is a crease.
KNOB = [[(1.25, 0.0), (1.25, 0.10)], [(1.25, 0.10), (1.12, 0.28)], [(1.12, 0.28), (0.42, 0.36)],
        [(0.42, 0.36), (0.30, 0.60), (0.30, 1.10), (0.62, 1.32), (0.90, 1.52), (1.08, 1.75), (1.12, 1.95), (1.06, 2.20), (0.86, 2.40), (0.50, 2.53), (0.0, 2.57)]]
SEG = 16
MARK = 'knob-r46'


class Glb:
    """a bim2 package. Each primitive has POSITION, NORMAL, TEXCOORD_0 (float) and uint32 indices; the kernel's packages interleave the three
    in one 32-byte vertex block per primitive, build_open4k.py's keep one buffer view per accessor. Both are read and written back as they were."""
    def __init__(self, path):
        self.path = path; b = open(path, 'rb').read(); assert b[:4] == b'glTF'
        L = struct.unpack('<I', b[12:16])[0]; self.J = J = json.loads(b[20:20 + L]); off = 20 + L; L2 = struct.unpack('<I', b[off:off + 4])[0]; self.bin = b[off + 8:off + 8 + L2]
        self.tail = b[off + 8 + L2:]; self.dirty = False; self.prims = []; A = J['accessors']; BV = J['bufferViews']; self.role = {}
        def read(i, n):
            a = A[i]; bv = BV[a['bufferView']]; assert a['componentType'] == 5126; o = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride') or 4 * n
            raw = np.frombuffer(self.bin, dtype=np.uint8, count=st * (a['count'] - 1) + 4 * n, offset=o) if a['count'] else np.zeros(0, np.uint8)
            return np.lib.stride_tricks.as_strided(raw, shape=(a['count'], 4 * n), strides=(st, 1)).copy().view('<f4').reshape(a['count'], n)
        for mi, me in enumerate(J['meshes']):
            for q in me['primitives']:
                at = q['attributes']; assert set(at) == {'POSITION', 'NORMAL', 'TEXCOORD_0'}, at; ai = A[q['indices']]; assert ai['componentType'] == 5125
                V = np.concatenate([read(at['POSITION'], 3), read(at['NORMAL'], 3), read(at['TEXCOORD_0'], 2)], 1)
                bi = BV[ai['bufferView']]; I = np.frombuffer(self.bin, dtype='<u4', count=ai['count'], offset=bi.get('byteOffset', 0) + ai.get('byteOffset', 0)).reshape(-1, 3).copy()
                p = {'mesh': mi, 'q': q, 'V': V, 'I': I}; self.prims.append(p)
                for name, k in (('POSITION', 'P'), ('NORMAL', 'N'), ('TEXCOORD_0', 'U')): assert at[name] not in self.role; self.role[at[name]] = (p, k)
                assert q['indices'] not in self.role; self.role[q['indices']] = (p, 'I')
        assert len(self.role) == len(A), 'an accessor no primitive uses'
        self.node_of = {}
        for ni, n in enumerate(J['nodes']):
            if 'mesh' in n: self.node_of[n['mesh']] = ni
        self.parent = {}
        for ni, n in enumerate(J['nodes']):
            for c in n.get('children', []): self.parent[c] = ni

    def trans(self, mi):
        """world translation of a mesh's node (the leaf nodes are the only ones that have one)"""
        t = np.zeros(3); ni = self.node_of.get(mi)
        while ni is not None:
            t += np.array(self.J['nodes'][ni].get('translation', [0, 0, 0]), float); ni = self.parent.get(ni)
        return t

    def save(self):
        J = self.J; A = J['accessors']; BV = J['bufferViews']; out = bytearray(); by_bv = {}; COL = {'P': slice(0, 3), 'N': slice(3, 6), 'U': slice(6, 8)}
        for i, a in enumerate(A): by_bv.setdefault(a['bufferView'], []).append(i)
        for k, bv in enumerate(BV):
            use = sorted(by_bv.get(k, []), key=lambda i: A[i].get('byteOffset', 0)); assert use, 'bufferView %d has no accessor' % k
            while len(out) % 4: out.append(0)
            start = len(out)
            if bv.get('byteStride'):                                         # one primitive's interleaved vertex block
                assert bv['byteStride'] == 32 and len(use) == 3 and len({id(self.role[i][0]) for i in use}) == 1 and [self.role[i][1] for i in use] == ['P', 'N', 'U']
                p = self.role[use[0]][0]; out += np.ascontiguousarray(p['V'], dtype='<f4').tobytes()
                for i in use: A[i]['count'] = len(p['V'])
            else:
                for i in use:
                    p, r = self.role[i]; A[i]['byteOffset'] = len(out) - start
                    if r == 'I': A[i]['count'] = int(p['I'].size); out += np.ascontiguousarray(p['I'], dtype='<u4').tobytes()
                    else: A[i]['count'] = len(p['V']); out += np.ascontiguousarray(p['V'][:, COL[r]], dtype='<f4').tobytes()
            bv['byteOffset'] = start; bv['byteLength'] = len(out) - start
        for i, a in enumerate(A):
            p, r = self.role[i]
            if r == 'P': a['min'] = [float(v) for v in p['V'][:, :3].min(0)]; a['max'] = [float(v) for v in p['V'][:, :3].max(0)]
        while len(out) % 4: out.append(0)
        J['buffers'][0]['byteLength'] = len(out); self.bin = bytes(out)
        js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
        g = bytearray(b'glTF') + struct.pack('<II', 2, 0) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(out)) + b'BIN\x00' + out + self.tail
        struct.pack_into('<I', g, 8, len(g)); open(self.path, 'wb').write(g)

    def pieces(self):
        """every run of triangles that belongs to a door element: (prim, element, first triangle, count, material, leaf key or None)"""
        for p in self.prims:
            me = self.J['meshes'][p['mesh']]; ex = me.get('extras', {}); n = self.J['nodes'][self.node_of[p['mesh']]]; nx = n.get('extras', {})
            mat = ex.get('material') or nx.get('material') or ''; leaf = ex.get('leaf') or nx.get('leaf'); rs = ex.get('ranges') or []
            assert sum(r[3] for r in rs) == len(p['I']) or not rs, (me.get('name'), sum(r[3] for r in rs), len(p['I']))
            for r in rs:
                if str(r[0]).startswith('D-'): yield p, r[0], r[2], r[3], mat, leaf, r


def uv_box(P, N):
    """the packages' TEXCOORD_0: a box projection in BIM feet (world X = BIM y, Y = BIM z, Z = BIM x)"""
    a = np.abs(N).argmax(1); U = np.zeros((len(P), 2), np.float32)
    U[a == 0] = P[a == 0][:, [2, 1]]; U[a == 1] = P[a == 1][:, [2, 0]]; U[a == 2] = P[a == 2][:, [0, 1]]; return U


def knob(C, d):
    """one knob: centre C on the door face, pointing out along the unit vector d (level). Returns positions, normals, triangles."""
    up = np.array([0.0, 1.0, 0.0]); e2 = np.cross(d, up); P = []; Nn = []; T = []
    th = np.arange(SEG) * 2 * math.pi / SEG; ring = np.outer(np.cos(th), up) + np.outer(np.sin(th), e2)
    for prof in KNOB:
        pr = np.array(prof, float) * IN; seg = np.diff(pr, axis=0); sn = np.stack([seg[:, 1], -seg[:, 0]], 1); sn /= np.linalg.norm(sn, axis=1)[:, None]
        vn = np.zeros_like(pr); vn[:-1] += sn; vn[1:] += sn; vn /= np.linalg.norm(vn, axis=1)[:, None]; base = len(P)
        for (r, h), (nr, nh) in zip(pr, vn):
            for k in range(SEG): P.append(C + d * h + ring[k] * r); Nn.append(d * nh + ring[k] * nr)
        for i in range(len(pr) - 1):
            for k in range(SEG):
                a, b = base + i * SEG + k, base + i * SEG + (k + 1) % SEG; c, e = a + SEG, b + SEG
                if pr[i][0] > 1e-9: T.append((a, b, e))
                if pr[i + 1][0] > 1e-9: T.append((a, e, c))
    P = np.array(P); Nn = np.array(Nn); Nn /= np.linalg.norm(Nn, axis=1)[:, None]; T = np.array(T)
    g = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    if (g * Nn[T[:, 0]]).sum() < 0: T = T[:, ::-1]
    return P, Nn, T


def lever_frames(P, tri, el=''):
    """where a lever set sits: for each face of the leaf, the centre of its rose on the face plane and the outward direction.
    P: world positions (n, 3); tri: the set's triangles. The rose is the plate the full height of the set, flat on the face."""
    a, b, c = P[tri[:, 0]], P[tri[:, 1]], P[tri[:, 2]]; g = np.cross(b - a, c - a); h = g[:, [0, 2]]; M = h.T @ h   # area-squared weighted: the big flat faces decide
    w, v = np.linalg.eigh(M); n2 = v[:, -1]; n = np.array([n2[0], 0.0, n2[1]]); n /= np.linalg.norm(n); t = np.array([-n[2], 0.0, n[0]])
    vs = np.unique(tri); Q = P[vs]; pn = Q @ n; mid = (pn.min() + pn.max()) / 2; out = []
    for sgn in (-1, 1):
        k = (pn - mid) * sgn > 0; assert k.any(); q = Q[k]; y0, y1 = q[:, 1].min(), q[:, 1].max(); rose = q[(q[:, 1] < y0 + 1e-3) | (q[:, 1] > y1 - 1e-3)]
        f = (q @ n * sgn).min() * sgn; tc = ((rose @ t).min() + (rose @ t).max()) / 2      # the face: where the set meets the leaf
        out.append((n * f + t * tc + np.array([0, (y0 + y1) / 2, 0]), n * sgn, y1 - y0, (rose @ t).max() - (rose @ t).min()))
    th = abs((out[1][0] - out[0][0]) @ n); assert 0.07 < th < 0.22, ('leaf thickness from the lever set', el, th)
    return out, th


def replace_run(g, p, r, P, N, T, keep=False):
    """swap one element's run of triangles in a primitive for new geometry (world positions), dropping the vertices nothing uses any more.
    keep: add the new triangles to the run instead"""
    me = g.J['meshes'][p['mesh']]; rs = me['extras']['ranges']; s, c = r[2], r[3]; t0 = g.trans(p['mesh']); V = p['V']; I = p['I']; nv = len(V)
    Pl = (P - t0).astype(np.float32); Vn = np.concatenate([Pl, N.astype(np.float32), uv_box(P, N)], 1); old = I[s:s + c] if keep else I[:0]
    I2 = np.concatenate([I[:s], old, T.astype(np.uint32) + nv, I[s + c:]]); V2 = np.concatenate([V, Vn]); used = np.zeros(len(V2), bool); used[I2.ravel()] = True
    rm = np.cumsum(used) - 1; p['V'] = V2[used]; p['I'] = rm[I2].astype(np.uint32); n1 = len(old) + len(T)
    for q in rs:
        if q is not r and q[2] >= s + c: q[2] += n1 - c
    r[3] = n1; g.dirty = True


def is_interior(o):
    return o is None or (not o.get('exterior') and str(o.get('type', '')).startswith('DT-INT'))


def do_knobs(g, O, rep):
    for p, el, s, c, mat, leaf, r in list(g.pieces()):
        if mat != NICKEL or not is_interior(O.get(el)): continue
        me = g.J['meshes'][p['mesh']]; hw = me['extras'].setdefault('hardware', {})
        if hw.get(el) == MARK: continue
        s, c = r[2], r[3]                                                    # (live: an earlier swap in this mesh moved the later runs)
        P = p['V'][:, :3].astype(float) + g.trans(p['mesh']); tri = p['I'][s:s + c]; fr, th = lever_frames(P, tri, el)
        Ps, Ns, Ts = [], [], []; n0 = 0
        for C, d, hgt, wid in fr:
            kp, kn, kt = knob(C, d); Ps.append(kp); Ns.append(kn); Ts.append(kt + n0); n0 += len(kp)
        replace_run(g, p, r, np.concatenate(Ps), np.concatenate(Ns), np.concatenate(Ts)); hw[el] = MARK
        # the kernel leaves the leaf's face open under the old square rose (the plate sat flush on it); a round rose does not cover the corners.
        # Where the leaf has that square hole, its face is made whole again (the leaf's own paint).
        holes = 0
        for C, d, hgt, wid in fr:
            t = np.array([-d[2], 0.0, d[0]]); up = np.array([0.0, 1.0, 0.0])
            for p2, el2, s2, c2, mat2, leaf2, r2 in g.pieces():
                if el2 != el or mat2 not in LEAF_MATS: continue
                tri = p2['I'][r2[2]:r2[2] + r2[3]]; W = p2['V'][:, :3].astype(float) + g.trans(p2['mesh'])
                a, b, c3 = W[tri[:, 0]], W[tri[:, 1]], W[tri[:, 2]]; nn = np.cross(b - a, c3 - a); nl = np.linalg.norm(nn, axis=1); ok = nl > 1e-12; nn[ok] /= nl[ok][:, None]
                face = tri[ok & (np.abs((a - C) @ d) < 1e-3) & ((nn @ d) > 0.99)]          # the leaf's triangles in this face
                if not len(face): continue
                vs = np.unique(face); X = np.stack([(W[vs] - C) @ t, (W[vs] - C) @ up], 1); k = (np.abs(X[:, 0]) < wid / 2 + 2e-3) & (np.abs(X[:, 1]) < hgt / 2 + 2e-3)
                if k.sum() < 4: continue                                                 # no edge of the face inside the rose: it is whole here
                x0, x1, y0, y1 = X[k, 0].min(), X[k, 0].max(), X[k, 1].min(), X[k, 1].max(); mid = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
                if x1 - x0 < 0.01 or y1 - y0 < 0.01: continue
                def covered(pt):
                    for q in face:
                        A = np.stack([(W[q] - C) @ t, (W[q] - C) @ up], 1); v0 = A[1] - A[0]; v1 = A[2] - A[0]; v2 = pt - A[0]; den = v0[0] * v1[1] - v1[0] * v0[1]
                        if abs(den) < 1e-12: continue
                        u = (v2[0] * v1[1] - v1[0] * v2[1]) / den; v = (v0[0] * v2[1] - v2[0] * v0[1]) / den
                        if u >= -1e-6 and v >= -1e-6 and u + v <= 1 + 1e-6: return True
                    return False
                if covered(mid): continue
                Q = np.array([C + t * x + up * y for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]); T2 = np.array([[0, 1, 2], [0, 2, 3]])
                if np.cross(Q[1] - Q[0], Q[2] - Q[0]) @ d < 0: T2 = T2[:, ::-1]
                replace_run(g, p2, r2, Q, np.tile(d, (4, 1)), T2, keep=True); holes += 1; break
        rep.append((os.path.relpath(g.path, ROOT), el, 'lever -> knob', 'centre %.2f ft up, leaf %.2f in thick, %d -> %d triangles, %d face openings under the old rose closed' % (fr[0][0][1] - (O.get(el) or {}).get('sill', 0), th * 12, c, r[3], holes)))


def frame(o):
    ax = np.array(o.get('axis') or [1, 0], float); nr = np.array(o.get('normal') or [0, 1], float); c = np.array(o['center'], float)
    axw = np.array([ax[1], 0.0, ax[0]]); nw = np.array([nr[1], 0.0, nr[0]]); cw = np.array([c[1], 0.0, c[0]])       # world X = BIM y, Z = BIM x
    return axw, nw, cw


def do_foot(g, O, sill_of, rep):
    """the foot of an interior leaf: 1/8 in over the floor"""
    done = {}
    for p, el, s, c, mat, leaf, r in g.pieces():
        o = O.get(el)
        if mat not in LEAF_MATS or not is_interior(o): continue
        sill = o['sill'] if o else sill_of(g.J['nodes'][g.node_of[p['mesh']]].get('extras', {}).get('storey'))
        t0 = g.trans(p['mesh']); vs = np.unique(p['I'][s:s + c]); y = p['V'][vs, 1].astype(float) + t0[1]; b = y.min() - sill
        if not (0.03 < b < 0.05): continue
        k = vs[np.abs(y - y.min()) < 0.004]; new = sill + FLOOR + FOOT; p['V'][k, 1] = np.float32(new - t0[1]); g.dirty = True; done[el] = (b - FLOOR, FOOT)
    for el, (a, b) in sorted(done.items()): rep.append((os.path.relpath(g.path, ROOT), el, 'foot of the leaf', '%.2f in -> %.2f in over the floor' % (a * 12, b * 12)))


def weld_groups(P, tri):
    key = {}; ids = np.array([key.setdefault(tuple(np.round(q, 4)), len(key)) for q in P]); par = list(range(len(key)))
    def find(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    for t in tri:
        a = find(ids[t[0]])
        for v in t[1:]: par[find(ids[v])] = a
    return np.array([find(i) for i in ids])


def do_bypass(g, O, rep, moves):
    """sliding closet panels fill their opening jamb to jamb. moves[(door, k)] = (shift along the axis in BIM x, y; new width)"""
    by = {}
    for p, el, s, c, mat, leaf, r in g.pieces():
        o = O.get(el)
        if o and mat in LEAF_MATS + ('jlh-white', 'jlh-honey') and (o.get('leaves') or [{}])[0].get('kind') == 'BYPASS': by.setdefault(el, []).append((p, s, c, mat, leaf))
    for el, parts in sorted(by.items()):
        o = O[el]; axw, nw, cw = frame(o); W = o['width']; panels = []      # panels: [lo, hi, [(prim, vertex ids)], leaf key]
        for p, s, c, mat, leaf in parts:
            if mat == 'door-panel-field': continue
            t0 = g.trans(p['mesh']); vs = np.unique(p['I'][s:s + c]); Pw = p['V'][vs, :3].astype(float) + t0; a = (Pw - cw) @ axw
            if leaf: panels.append([a.min(), a.max(), [(p, vs)], leaf, (Pw - cw) @ nw])
            else:
                grp = weld_groups(Pw, np.searchsorted(vs, p['I'][s:s + c]))
                for gid in np.unique(grp): k = grp == gid; panels.append([a[k].min(), a[k].max(), [(p, vs[k])], None, ((Pw - cw) @ nw)[k]])
        panels.sort(key=lambda q: q[0]); n = len(panels)
        if n < 2: continue
        for p, s, c, mat, leaf in parts:                                     # the recessed fields ride with the panel they sit in
            if mat != 'door-panel-field': continue
            t0 = g.trans(p['mesh']); tri = p['I'][s:s + c]; vs = np.unique(tri); Pw = p['V'][vs, :3].astype(float) + t0; a = (Pw - cw) @ axw; dd = (Pw - cw) @ nw
            grp = weld_groups(Pw, np.searchsorted(vs, tri))
            for gid in np.unique(grp):
                k = grp == gid; am = (a[k].min() + a[k].max()) / 2; dm = dd[k].mean()
                best = min(panels, key=lambda q: (0 if (q[3] == leaf if leaf else (q[0] - 1e-3 <= am <= q[1] + 1e-3 and q[4].min() - 1e-3 <= dm <= q[4].max() + 1e-3)) else 1, abs((q[0] + q[1]) / 2 - am))); best[2].append((p, vs[k]))
        lo0 = panels[0][0]; j = lo0 + W / 2; hiN = panels[-1][1]; gap = W / 2 - j - hiN; w = panels[0][1] - panels[0][0]; ov = panels[0][1] - panels[1][0]
        if gap < 0.004 or not (-0.01 < j < 0.3) or any(abs((q[1] - q[0]) - w) > 0.01 for q in panels) or not (0 < ov < 0.2):
            if gap >= 0.004: rep.append((os.path.relpath(g.path, ROOT), el, 'sliding panels NOT changed', 'gap %.2f in, jamb %.3f, overlap %.3f' % (gap * 12, j, ov)))
            continue
        ws = (W - 2 * j + (n - 1) * ov) / n; f = ws / w; assert 1 < f < 1.06, (el, f)
        for i, q in enumerate(panels):
            lo_new = lo0 + i * (ws - ov)
            for p, vs in q[2]:
                t0 = g.trans(p['mesh']); Pw = p['V'][vs, :3].astype(float) + t0; a = (Pw - cw) @ axw; Pw = Pw + np.outer(lo_new + (a - q[0]) * f - a, axw)
                p['_new'] = p.get('_new', {}); p['_new'][tuple(vs.tolist())] = Pw
            if q[3]:                                                         # a leaf of its own: its node (the leaf's low end) moves with it
                ni = g.parent[g.node_of[q[2][0][0]['mesh']]]; nd = g.J['nodes'][ni]; sh = lo_new - q[0]; tr = np.array(nd['translation'], float) + axw * sh; nd['translation'] = [float(v) for v in tr]
                dk = q[3].split('|'); moves[(dk[1], int(dk[2]))] = (float(axw[2] * sh), float(axw[0] * sh), float(ws))
            else: moves[(el, i)] = (float(axw[2] * (lo_new - q[0])), float(axw[0] * (lo_new - q[0])), float(ws))
        for q in panels:                                                     # write back, against the (moved) node
            for p, vs in q[2]:
                t0 = g.trans(p['mesh']); p['V'][vs, :3] = (p['_new'].pop(tuple(vs.tolist())) - t0).astype(np.float32)
        g.dirty = True
        rep.append((os.path.relpath(g.path, ROOT), el, 'sliding panels', '%d panels %.2f -> %.2f in wide; shut, the far jamb %.2f in -> %.2f in' % (n, w * 12, ws * 12, (gap + j - LINING) * 12, (j - LINING) * 12)))


def leaf_range(g, node_name, o):
    """a leaf's extent along its opening (authored pose), from its own meshes"""
    axw, nw, cw = frame(o); lo, hi = 1e9, -1e9
    for ni, n in enumerate(g.J['nodes']):
        if n.get('name') != node_name: continue
        for ch in n.get('children', []):
            cn = g.J['nodes'][ch]
            if cn.get('extras', {}).get('material') == NICKEL: continue
            for p in g.prims:
                if p['mesh'] == cn['mesh']: a = (p['V'][:, :3].astype(float) + g.trans(p['mesh']) - cw) @ axw; lo = min(lo, a.min()); hi = max(hi, a.max())
    return (lo, hi) if hi > lo else None


def wall_tris(g):
    T = []
    for p in g.prims:
        if str(g.J['meshes'][p['mesh']].get('name', '')).startswith('walls|'): T.append(p['V'][:, :3].astype(float)[p['I']])
    return np.concatenate(T) if T else np.zeros((0, 3, 3))


def in_wall(T, o, d, reach=0.45):
    """is the point (world) inside a wall: a wall face within reach both ways along the level direction d"""
    def cast(dr):
        lo = np.minimum(o, o + dr * reach) - 1e-6; hi = np.maximum(o, o + dr * reach) + 1e-6; t = T[np.all(T.max(1) >= lo, 1) & np.all(T.min(1) <= hi, 1)]
        if not len(t): return False
        e1 = t[:, 1] - t[:, 0]; e2 = t[:, 2] - t[:, 0]; h = np.cross(dr, e2); a = (e1 * h).sum(1); ok = np.abs(a) > 1e-12; a = np.where(ok, a, 1)
        s = o - t[:, 0]; u = (s * h).sum(1) / a; qv = np.cross(s, e1); v = (qv @ dr) / a; tt = (e2 * qv).sum(1) / a
        return bool((ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (tt > 1e-4) & (tt <= reach)).any())
    return cast(d) and cast(-d)


def pocket_meta(g, O, rep):
    """which end a pocket leaf's pocket is on, and for a leaf modelled open how far it travels to shut. Returns {door: leaf fields}.
    A leaf modelled open stands in its pocket: that end is the pocket. A leaf modelled shut: the end with a wall to slide into."""
    out = {}; T = None
    for el, o in O.items():
        L = o.get('leaves') or []
        if not L or L[0].get('kind') != 'POCKET' or 'node' not in L[0]: continue
        lf = L[0]; r = leaf_range(g, lf['node'], o)
        if not r: continue
        name = os.path.relpath(g.path, ROOT); strike = o['width'] / 2 - LINING; dr = 1 if lf.get('hingeEnd') == 'END' else -1; w = r[1] - r[0]
        if (lf.get('openFraction') or 0) < 0.5:
            if T is None: T = wall_tris(g)
            axw, nw, cw = frame(o); y = (o['sill'] + o['head']) / 2; ok = {}
            for sg in (-1, 1): ok[sg] = all(in_wall(T, cw + axw * sg * (o['width'] / 2 + q) + np.array([0, y, 0]), nw) for q in (0.5, w * 0.5, w - 0.6))
            if not ok[dr] and ok[-dr]:
                out[el] = {'hingeEnd': 'END' if dr < 0 else 'START'}
                rep.append((name, el, 'pocket door', 'the meta named the wrong pocket end (%s): opened, the leaf slid out across the room; the wall it slides into is at the other end' % lf.get('hingeEnd')))
            continue
        cen = (r[0] + r[1]) / 2; sg = 1 if cen > 0 else -1; end = 'END' if sg > 0 else 'START'; out[el] = {'hingeEnd': end, 'travel': round(abs(cen), 4)}
        if lf.get('hingeEnd') == end and abs((lf.get('travel') or 0) - abs(cen)) < 1e-3: continue
        # before: the page slid the leaf its width less 3 in, toward the end the meta named
        d0 = lf.get('travel') or max(0.5, (lf.get('w') or o['width']) - 0.25); lead = (r[0] if sg > 0 else r[1]) - dr * d0; g0 = (lead + strike) if sg > 0 else (strike - lead)
        rep.append((name, el, 'pocket door', ('shut, %.2f in short of the strike jamb' % (g0 * 12) if dr == sg else 'the meta named the wrong pocket end (%s): shut, it slid further into the wall' % lf.get('hingeEnd'))
                    + ' -> travels %.3f ft to the middle of the opening, %.2f in reveal at each jamb' % (abs(cen), (strike - w / 2) * 12)))
    return out


def apply_leaves(openings, moves, pockets):
    ch = False
    for o in openings or []:
        for k, lf in enumerate(o.get('leaves') or []):
            mv = moves.get((o['id'], k))
            if mv and lf.get('hinge') and abs((lf.get('w') or 0) - mv[2]) > 1e-6:
                for h in lf['hinge']: h[0] = round(h[0] + mv[0], 5); h[1] = round(h[1] + mv[1], 5)
                lf['w'] = round(mv[2], 5); ch = True
                if o.get('leaf') and o['leaf'].get('node') == lf.get('node') and o['leaf'].get('hinge'): o['leaf']['hinge'] = lf['hinge']
            pk = pockets.get(o['id'])
            if pk and lf.get('kind') == 'POCKET' and any(lf.get(a) != b for a, b in pk.items()): lf.update(pk); ch = True
    return ch


def main():
    check = '--check' in sys.argv; rep = []
    for site in SITES:
        d = os.path.join(ROOT, site, 'bim2'); mp = os.path.join(d, 'scene.meta.json')
        if not os.path.exists(mp): continue
        meta = json.load(open(mp)); st = {s['id']: s['elevation'] for s in meta.get('storeys', [])}; sill_of = lambda s: st.get(s, 0.0)
        base_O = {o['id']: o for o in meta.get('openings', [])}; moves = {}; pockets = {}; metas = {mp: meta}
        files = [(meta['glb']['file'], None)] + [(o['glb'], o.get('meta')) for o in meta.get('options', [])]
        for f, mf in files:
            gp = os.path.join(d, f)
            if not os.path.exists(gp): continue
            g = Glb(gp); O = dict(base_O)
            if mf and os.path.exists(os.path.join(d, mf)):
                D = metas.setdefault(os.path.join(d, mf), json.load(open(os.path.join(d, mf)))); O.update({o['id']: o for o in D.get('openings', [])})
            do_knobs(g, O, rep); do_foot(g, O, sill_of, rep); do_bypass(g, O, rep, moves)
            if not mf: pockets.update(pocket_meta(g, O, rep))
            if g.dirty and not check: g.save()
            if not mf and g.dirty:                                           # the base model's own mesh list and counts
                cnt = {}
                for p in g.prims: cnt[g.J['meshes'][p['mesh']].get('name')] = (len(p['I']), len(p['V']))
                for m in meta.get('meshes', []):
                    if m.get('name') in cnt: m['tris'], m['verts'] = int(cnt[m['name']][0]), int(cnt[m['name']][1])
                if meta.get('stats') and meta.get('meshes'):
                    meta['stats']['triangles'] = int(sum(m['tris'] for m in meta['meshes']))
                    for k, v in meta['stats'].get('byGroup', {}).items(): v['tris'] = int(sum(m['tris'] for m in meta['meshes'] if m.get('group') == k))
        if check: continue
        for path, D in metas.items(): apply_leaves(D.get('openings'), moves, pockets)
        raw = open(os.path.join(d, meta['glb']['file']), 'rb').read(); meta['glb']['sha256'] = hashlib.sha256(raw).hexdigest(); meta['glb']['bytes'] = len(raw)
        for o in meta.get('options', []):
            p = os.path.join(d, o['glb'])
            if os.path.exists(p): o['sha256'] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
        for path, D in metas.items():
            new = json.dumps(D, separators=(',', ':'), ensure_ascii=False)
            if not os.path.exists(path) or open(path).read() != new: open(path, 'w').write(new)
    for r in rep: print(' | '.join(str(x) for x in r))
    print('%d changes%s' % (len(rep), ' (check only, nothing written)' if check else ''))


if __name__ == '__main__':
    main()
