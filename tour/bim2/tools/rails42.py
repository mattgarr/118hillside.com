#!/usr/bin/env python3
"""Guard rails to 42 in (owner 11/12/2026: "all the house's railings are 42 in").

The model's level guards were exported at 36 to 37 in (decks 3.1 ft, the loft and stair-opening guards 3.0 ft). This raises each one
to a 42-in top: posts get taller, the top rail keeps its thickness and lands at 3.5 ft, and the 11 cables are respaced evenly below
it (3 in on centre becomes 3.44 in outside and 3.375 in inside, so every opening stays under the 4-in sphere rule without another
cable). Sloped stair rails are left as they are: their tops sit 36 to 37 in above the nosing line (34 in for the wall handrails),
inside the 34 to 38 in handrail range. hillside.bim.json, which states each rail's height, gets the same 3.5.

It edits vertex positions in place in every GLB that carries one of these elements (the house model and the layout ideas' packages,
in tour/, halloween/ and thanksgiving/), then updates each scene.meta.json: the model's and the options' sha256, and the rail
colliders' tops. The triangle layout does not change. Idempotent: a guard already 3.5 ft high is left alone.

NOTE: scene.glb comes from the BIM kernel export, which is not in this repository. The same 42-in rule has to go into that export,
or the next one brings the 37-in guards back. Until then, run this after any new export.
Run: python3 tour/bim2/tools/rails42.py     (then python3 tour/bim2/tools/build_open4k.py, which copies the deck guard module)
"""
import hashlib, json, os, struct, sys
import numpy as np
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
GUARDS = ('RL-FRONT-DECK', 'RL-REAR-DECK', 'RL-LOFT', 'RL-STRIP')        # level guards; the RL-*-STAIR / RL-STAIR-* handrails stay
TOP = 3.5
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

def fix_glb(path, report):
    b = bytearray(open(path, 'rb').read()); L = struct.unpack('<I', b[12:16])[0]; J = json.loads(bytes(b[20:20 + L]))
    off = 20 + L; L2 = struct.unpack('<I', b[off:off + 4])[0]; bin0 = off + 8; changed = False
    def view(i, dt):
        a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; n = NC[a['type']]; st = bv.get('byteStride') or n * np.dtype(dt).itemsize
        return a, bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0), st, n
    prims = []
    for nd in J['nodes']:
        if 'mesh' not in nd: continue
        me = J['meshes'][nd['mesh']]; ex = dict(nd.get('extras', {})); ex.update(me.get('extras', {}))
        for p in me['primitives']:
            if any(r[0] in GUARDS for r in ex.get('ranges', [])): prims.append((p, ex))
    # pass 1: each guard's base and height (world up = component 1), per plan cell so that separate runs of one element keep their own base
    V = {}
    for p, ex in prims:
        a, o, st, n = view(p['attributes']['POSITION'], np.float32); ia = J['accessors'][p['indices']]; it = {5123: np.uint16, 5125: np.uint32}[ia['componentType']]
        _, io, _, _ = view(p['indices'], it); idx = np.frombuffer(bytes(b[io:io + ia['count'] * np.dtype(it).itemsize]), dtype=it).reshape(-1, 3)
        used_by = {}
        for el, bd, s, c in ex.get('ranges', []):
            for v in np.unique(idx[s:s + c]): used_by.setdefault(int(v), set()).add(el)
        pos = lambda v: struct.unpack_from('<3f', b, o + st * int(v))
        for el, bd, s, c in ex.get('ranges', []):
            if el not in GUARDS: continue
            vs = set(int(v) for v in np.unique(idx[s:s + c])); shared = [v for v in vs if used_by[v] != {el}]
            if shared:
                # a post that the guard shares with the stair rail beside it (the two elements' posts coincide and their vertices are
                # welded): the whole of that post goes up with the guard. Its connected piece of the other element is found through the
                # index buffer; anything bigger than a post in plan is refused.
                par = {}
                def find(x):
                    while par.setdefault(x, x) != x: par[x] = par[par[x]]; x = par[x]
                    return x
                others = [r for r in ex.get('ranges', []) if r[0] != el and any(r[0] in used_by[v] for v in shared)]
                for el2, bd2, s2, c2 in others:
                    for t in idx[s2:s2 + c2]:
                        r0 = find(int(t[0]))
                        for v in t[1:]: par[find(int(v))] = r0
                roots = set(find(v) for v in shared); comp = [v for v in par if find(v) in roots]
                P = np.array([pos(v) for v in comp]); ext = max(P[:, 0].max() - P[:, 0].min(), P[:, 2].max() - P[:, 2].min())
                assert ext < 0.6, ('shared piece is not a post', el, ext)
                vs |= set(comp); report.append((path, el, 'shares a post with ' + ','.join(sorted(set(r[0] for r in others))) + ' (%d vertices)' % len(comp)))
            V.setdefault(el, []).append((p, o, st, np.array(sorted(vs))))
    for el, parts in V.items():
        ys = np.concatenate([[struct.unpack_from('<3f', b, o + st * int(v))[1] for v in vs] for p, o, st, vs in parts]); z0, z1 = float(ys.min()), float(ys.max()); H = z1 - z0
        # (a shared post is as tall as the guard, so it does not change these)
        if abs(H - TOP) < 0.02: report.append((path, el, 'already %.2f' % H)); continue
        assert 2.8 < H < 3.3, (el, H)
        # The module, measured from the walking surface (the geometry starts 0.005 below it): 11 cables at 3 in on centre, the top one
        # at 2.75 ft, then the top rail: underside 3.04 and top 3.1 outside (black steel), underside 2.875 and top 3.0 inside (oak cap).
        # The top rail keeps its thickness and goes to 3.5; the 11 cables are respaced evenly in the 12 gaps below it, so no opening
        # is wider than the pitch: 3.44 in outside, 3.375 in inside (under the 4-in sphere rule, no cable added).
        zb = z0 + 0.005; Hn = round(H - 0.005, 1); under = {3.1: 3.04, 3.0: 2.875}[Hn]; under2 = TOP - (Hn - under); k1 = (11 * under2 / 12) / 2.75; brk = 2.78
        def lift(u):
            if u <= 0: return u
            if u <= brk: return u * k1
            if u <= under: return brk * k1 + (u - brk) * (under2 - brk * k1) / (under - brk)
            return u + (under2 - under)
        for p, o, st, vs in parts:
            for v in vs:
                x, y, z = struct.unpack_from('<3f', b, o + st * int(v)); struct.pack_into('<3f', b, o + st * int(v), x, zb + lift(y - zb), z)
            a = J['accessors'][p['attributes']['POSITION']]; n_ = a['count']
            P = np.array([struct.unpack_from('<3f', b, o + st * i) for i in range(n_)]); a['min'] = [float(v) for v in P.min(0)]; a['max'] = [float(v) for v in P.max(0)]
        report.append((path, el, '%.2f -> %.2f ft' % (H, TOP))); changed = True
    if not changed: return False
    js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4); binc = bytes(b[off:off + 8 + L2])
    out = bytearray(b[:12]) + struct.pack('<I', len(js)) + b'JSON' + js + binc + bytes(b[off + 8 + L2:])
    struct.pack_into('<I', out, 8, len(out)); open(path, 'wb').write(out); return True

def main():
    report = []
    for site in ('tour', 'halloween', 'thanksgiving'):
        d = os.path.join(ROOT, site, 'bim2'); mp = os.path.join(d, 'scene.meta.json')
        if not os.path.exists(mp): continue
        meta = json.load(open(mp)); files = [meta['glb']['file']] + [o['glb'] for o in meta.get('options', [])]
        for f in files:
            if os.path.exists(os.path.join(d, f)): fix_glb(os.path.join(d, f), report)
        raw = open(os.path.join(d, meta['glb']['file']), 'rb').read(); meta['glb']['sha256'] = hashlib.sha256(raw).hexdigest(); meta['glb']['bytes'] = len(raw)
        def tops(cols):
            for c in cols or []:
                if c.get('element') in GUARDS and c.get('kind') == 'RAIL' and c.get('z1') is not None and abs((c['z1'] - c.get('z0', 0)) - TOP) > 0.02 and 2.8 < c['z1'] - c.get('z0', 0) < 3.3: c['z1'] = round(c.get('z0', 0) + TOP, 4)
        tops(meta.get('colliders'))
        for o in meta.get('options', []):
            p = os.path.join(d, o['glb'])
            if os.path.exists(p): o['sha256'] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
            mp2 = os.path.join(d, o.get('meta') or '')
            if o.get('meta') and os.path.exists(mp2):
                D = json.load(open(mp2)); tops(D.get('colliders')); open(mp2, 'w').write(json.dumps(D, separators=(',', ':')))
        open(mp, 'w').write(json.dumps(meta, separators=(',', ':'), ensure_ascii=False))
        # the BIM description the page still reads (decorations and labels take a rail's height from it): same 42 in, edited as text so
        # the file's layout is untouched
        import re
        bp = os.path.join(ROOT, site, 'bim', 'hillside.bim.json')
        if os.path.exists(bp):
            t = open(bp).read(); n = 0
            for el in GUARDS:
                m = re.search(r'"id":\s*"%s"' % el, t); assert m, el
                e0 = t.rfind('{', 0, m.start()); e1 = t.find('}', m.end()); blk = t[e0:e1]
                blk2, k = re.subn(r'("height":\s*)3\.[01]0*(?![0-9])', lambda q: q.group(1) + '3.5', blk)
                if k: t = t[:e0] + blk2 + t[e1:]; n += k
            if n: open(bp, 'w').write(t); report.append((bp, 'height 3.5 on %d guards' % n))
    for r in report: print(*r)

if __name__ == '__main__':
    main()
