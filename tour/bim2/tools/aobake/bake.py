#!/usr/bin/env python3
"""aobake: baked ambient occlusion for the tour (r50). See README.md in this folder.

    python3 bake.py <scene> --page <export.bin> [--out tour/bim2/ao]

scene: asbuilt | open4k | jan24 | apr24b. Reads the scene's GLBs (never writes them) and the page export made by export_page.js
(the geometry as the page builds it: jog-flattened vertices, an idea's hidden elements, page-built cabinets and counters).
Writes SIDECAR files only, into tour/bim2/ao/:
    <glb stem>.uv.<sha12>.bin     a second UV set (texel units x 16, uint16) per receiving mesh of that GLB, keyed by mesh name and
                                  vertex count, guarded by the GLB's sha256 (content-addressed: a new GLB gets a new file)
    <scene stem>.ao.<hash12>.webp the occlusion atlas, 8-bit, raw visibility (1 = open, 0 = fully occluded) - strength, curve and
                                  floor are applied at draw time
    <scene stem>.ao.json          the small index the page fetches first (no-cache): GLB shas, uv files, atlas, parameters
Layout: base meshes keep the same UV layout in every scene (rows [0, BASE_ROWS) of a 2048-wide atlas); an idea's own meshes are laid
out from row BASE_ROWS. Texels 0-7 in both axes stay white: a mesh with no uv set reads (0, 0) and is never darkened.
"""
import argparse, hashlib, json, math, os, sys, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from glbio import GLB, sha256  # noqa: E402
import pagebin  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
BIM2 = os.path.join(REPO, 'tour/bim2')
SCENES = {'asbuilt': None, 'open4k': 'OS-REMODEL-open4k', 'jan24': 'OS-REMODEL-jan24', 'apr24b': 'OS-REMODEL-apr24b'}

W = 2048                 # atlas width (texels)
BASE_ROWS = 2048         # rows reserved for the base package; idea meshes start here
RES = 8                  # reserved white corner (texels)
PAD = 1                  # gutter on each side of a chart (texels)
TS_IN = 1.6 / 12         # texel size indoors (ft)
TS_OUT = 4.0 / 12        # texel size on outward faces (ft)
RAYS = 96
RLEN = 3.0               # ft
GLEN = 8.0               # ft: how far a ray may travel to find a window / skylight pane
EPS = 0.015              # ft: ray origin offset along the normal
THIN = 0.35 / 12          # ft: strips thinner than this keep only THIN_K of their darkening (they alias into dotted lines)
THIN_K = 0.3
GLASS_K = 2.5            # occlusion is removed in proportion to the share of the hemisphere that sees glazing (x this)
LAYOUT_VERSION = 1
BAKE_VERSION = 1


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- receivers / charts
def is_receiver(e):
    g = e['extras'].get('group', '')
    nm = e['name']
    mat = e['extras'].get('material', '')
    if nm.startswith('leaf|') or g in ('site', 'glass', 'roofs'):
        return False
    if 'glass' in mat:
        return False
    return True


def components(I, nv):
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    nt = len(I)
    rows = np.repeat(np.arange(nt), 3)
    A = coo_matrix((np.ones(3 * nt), (rows, nt + I.ravel())), shape=(nt + nv, nt + nv))
    _, lab = connected_components(A, directed=False)
    return lab[:nt]


def load_spaces(metas):
    """interior spaces of the given scene meta files: (plan polygon, bbox, floor z, ceiling planes [(poly, c, gx, gy)])"""
    out = []
    for path in metas:
        meta = json.load(open(path))
        storeys = {t['id']: t for t in json.load(open(os.path.join(BIM2, 'scene.meta.json')))['storeys']}
        for s in meta.get('spaces', []):
            poly = s.get('polygon') or s.get('poly') or s.get('outline')
            if not poly or len(poly) < 3:
                continue
            if s.get('interior') is False or s.get('exterior') or s.get('openAir'):
                continue
            c = s.get('ceiling') or {}
            if c.get('form') == 'NONE':
                continue
            fz = s.get('floorZ', (s.get('floor') or {}).get('z'))
            if fz is None:
                fz = storeys.get(s.get('storey'), {'elevation': 0})['elevation']
            planes = []
            for pl in c.get('planes') or []:
                q = pl.get('P') or pl.get('plane') or pl
                if 'c' in q:
                    planes.append((np.array(pl['poly'], np.float64) if pl.get('poly') else None, q['c'], q.get('gx', 0) or 0, q.get('gy', 0) or 0))
            P = np.array(poly, np.float64)
            out.append((P, P.min(0), P.max(0), fz, planes))
    return out


def _pip(P, x, y):
    c = np.zeros(len(x), bool)
    for i in range(len(P)):
        xi, yi = P[i]
        xj, yj = P[i - 1]
        c ^= ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
    return c


def inside_any(spaces, X, Y, Z):
    """world points -> bool: in the air of an interior space (plan polygon, floor to its ceiling plane). world X = bim y, Z = bim x"""
    px, py = Z, X
    res = np.zeros(len(X), bool)
    for P, lo, hi, fz, planes in spaces:
        m = (px >= lo[0]) & (px <= hi[0]) & (py >= lo[1]) & (py <= hi[1]) & (Y > fz - 0.3) & ~res
        if not m.any():
            continue
        idx = np.nonzero(m)[0]
        x, y, z = px[idx], py[idx], Y[idx]
        c = _pip(P, x, y)
        top = np.full(len(x), fz + 9.0)
        if planes:
            top[:] = -1e9
            for (pp, cc, gx, gy) in planes:
                inn = _pip(pp, x, y) if pp is not None else np.ones(len(x), bool)
                top = np.where(inn, np.maximum(top, cc + gx * x + gy * y), top)
            top = np.where(top < -1e8, fz + 9.0, top)
        c &= z < top + 0.3
        res[idx[c]] = True
    return res


def min_rect_axes(Q):
    """Q: (n,2) points -> rotation angle giving the smallest bounding box (rotating calipers on the hull)"""
    if len(Q) < 3:
        return 0.0
    try:
        from scipy.spatial import ConvexHull
        H = Q[ConvexHull(Q).vertices]
    except Exception:
        H = Q
    best, ba = None, 0.0
    for i in range(len(H)):
        d = H[(i + 1) % len(H)] - H[i]
        L = math.hypot(*d)
        if L < 1e-9:
            continue
        a = math.atan2(d[1], d[0])
        c, s = math.cos(a), math.sin(a)
        R = H @ np.array([[c, -s], [s, c]])
        ar = np.ptp(R[:, 0]) * np.ptp(R[:, 1])
        if best is None or ar < best - 1e-9:
            best, ba = ar, a
    return ba


_G_layout = {}


def _hidden(ch, entries, extra_occ, G):
    from embreex import rtcore_scene as rtcs
    from embreex.mesh_construction import TriangleMesh
    if 'scene' not in G:
        T = np.concatenate(G['tris'] + ([extra_occ] if extra_occ is not None and len(extra_occ) else []))
        G['scene'] = rtcs.EmbreeScene()
        TriangleMesh(G['scene'], T.astype(np.float32))
        G['HS'] = hammersley(24)
    ent = entries[ch['mesh']]
    P, I = ent['P'], ent['I']
    tri = ch['tris']
    ar = np.linalg.norm(np.cross(P[I[tri, 1]] - P[I[tri, 0]], P[I[tri, 2]] - P[I[tri, 0]]), axis=1)
    pick = tri[np.argsort(-ar)[:6]]
    B = np.array([[1 / 3, 1 / 3, 1 / 3], [.7, .15, .15], [.15, .7, .15], [.15, .15, .7]])
    pts = np.concatenate([(P[I[t]][None] * B[:, :, None]).sum(1) for t in pick])
    n = ch['n']
    tx = np.cross([0.0, 1.0, 0.0], n) if abs(n[1]) < 0.9 else np.cross([1.0, 0.0, 0.0], n)
    tx /= np.linalg.norm(tx)
    bx = np.cross(n, tx)
    HS = G['HS']
    r, ph = np.sqrt(HS[:, 0]), 2 * np.pi * HS[:, 1]
    D = tx[None] * (r * np.cos(ph))[:, None] + bx[None] * (r * np.sin(ph))[:, None] + n[None] * np.sqrt(1 - HS[:, 0])[:, None]
    O = np.repeat(pts + n * EPS, len(D), 0).astype(np.float32)
    DD = np.tile(D, (len(pts), 1)).astype(np.float32)
    t = G['scene'].run(O, DD, dists=np.full(len(O), 1.5, np.float32), query='DISTANCE')
    esc = (t >= 1.5).reshape(len(pts), len(D)).sum(1)
    return bool((esc < 3).all())


def make_layout(glb_path, y0, spaces, tag, extra_occ=None):
    """deterministic UV layout of one GLB's receiving meshes. Returns dict with entries + charts (for the bake)."""
    g = GLB(glb_path)
    entries = []
    for e in g.mesh_entries():
        entries.append(dict(name=e['name'], nverts=e['nverts'], recv=is_receiver(e), uv=None, ranges=e['extras'].get('ranges', []), P=e['pos'], I=e['idx']))
        if not e['name'].startswith('leaf|') and e['extras'].get('group') != 'glass' and 'glass' not in e['extras'].get('material', ''):
            _G_layout.setdefault('tris', []).append(e['pos'][e['idx']])
    L = layout_core(entries, y0, spaces, tag, extra_occ, 'point')
    L.update(sha=sha256(glb_path), file=os.path.basename(glb_path), bytes=g.bytes)
    return L


def layout_core(entries, y0, spaces, tag, extra_occ, curved):
    """charts for the receiving entries (planar connected components; curved ones: 'point' = one texel block, 'vertex' = AO per
    vertex, carried in the uv itself), hidden ones dropped, the rest shelf-packed from row y0"""
    t0 = time.time()
    charts = []
    for ei, ent in enumerate(entries):
        if not ent['recv']:
            continue
        P, I = ent['P'], ent['I']
        fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
        L = np.linalg.norm(fn, axis=1)
        ok = L > 1e-10
        fnu = fn / np.maximum(L, 1e-12)[:, None]
        lab = components(I, len(P))
        # element of each triangle (for skylight wells)
        el = np.empty(len(I), object)
        el[:] = ''
        for r in ent.get('ranges', []):
            el[r[2]:r[2] + r[3]] = r[0]
        order = np.argsort(lab, kind='stable')
        labs = lab[order]
        cuts = np.flatnonzero(np.diff(labs)) + 1
        for grp in np.split(order, cuts):
            tri = grp[ok[grp]]
            if len(tri) == 0:
                continue
            ar = L[tri] / 2
            nmean = (fnu[tri] * ar[:, None]).sum(0)
            nl = np.linalg.norm(nmean)
            if nl < 1e-12:
                continue
            nmean /= nl
            planar = (fnu[tri] @ nmean).min() > 0.999
            vids = np.unique(I[tri])
            cen = P[I[tri]].mean(1)
            # indoors: a centroid 9 in off the face lies in an interior space
            q = cen + fnu[tri] * 0.75
            interior = bool(inside_any(spaces, q[:, 0], q[:, 1], q[:, 2]).any())
            ts = TS_IN if interior else TS_OUT
            ch = dict(mesh=ei, tris=tri, vids=vids, n=nmean, interior=interior, ts=ts, planar=planar,
                      sky=bool(np.any([str(x).startswith('SK-') for x in el[tri]])))
            if planar:
                n = nmean
                up = np.array([0.0, 1.0, 0.0])
                u = np.cross(up, n) if abs(n[1]) < 0.9 else np.array([1.0, 0.0, 0.0]) - n * n[0]
                u /= np.linalg.norm(u)
                v = np.cross(n, u)
                Q = np.stack([P[vids] @ u, P[vids] @ v], 1)
                a = min_rect_axes(Q)
                c, s = math.cos(a), math.sin(a)
                u2, v2 = u * c + v * s, -u * s + v * c
                Q = np.stack([P[vids] @ u2, P[vids] @ v2], 1)
                Q = (Q - Q.min(0)) / ts
                ext = Q.max(0)
                if ext[1] > ext[0]:                 # long side horizontal: shelves pack tighter
                    Q = Q[:, ::-1]
                    ext = ext[::-1]
                ch['local'] = Q
                ch['thin'] = ext[1] * ts < THIN    # a bevel or reveal strip narrower than a pixel at walking distance
                ch['w'] = int(math.ceil(ext[0] + 1e-6)) + 1 + 2 * PAD
                ch['h'] = int(math.ceil(ext[1] + 1e-6)) + 1 + 2 * PAD
            elif curved == 'vertex':
                ch['vertex'] = True
                ch['local'] = np.zeros((len(vids), 2))
                ch['w'] = ch['h'] = 0
            else:
                ch['local'] = np.zeros((len(vids), 2))
                ch['w'] = ch['h'] = 1 + 2 * PAD
            charts.append(ch)
    # charts no one can see (stud faces in a wall cavity, the underside of a floor above a ceiling, faces pressed against another
    # surface): every probe ray from every probe point hits something within 1.5 ft. Probed against this GLB's own geometry
    # (+ extra_occ: the base package with an idea's hidden elements removed), so the layout depends on the GLBs only.
    charts = [c for c in charts if not _hidden(c, entries, extra_occ, _G_layout)]
    _G_layout.clear()
    # shelf packing, tallest first
    order = sorted([k for k in range(len(charts)) if not charts[k].get('vertex')], key=lambda k: (-charts[k]['h'], -charts[k]['w'], k))
    x, y, shelf_h = RES, y0 + RES, 0
    for k in order:
        ch = charts[k]
        if ch['w'] > W - RES:
            raise SystemExit('chart wider than the atlas: %s' % entries[ch['mesh']]['name'])
        if x + ch['w'] > W:
            y += shelf_h
            x, shelf_h = 0, 0
        ch['ox'], ch['oy'] = x, y
        x += ch['w']
        shelf_h = max(shelf_h, ch['h'])
    rows = y + shelf_h - y0
    # per-vertex uv (texel units)
    for ent in entries:
        if ent['recv']:
            ent['uv'] = np.zeros((ent['nverts'], 2), np.float64)
    for ch in charts:
        if ch.get('vertex'):
            ch['uvv'] = ch['local']
            continue
        uvv = ch['local'] + np.array([ch['ox'] + PAD + 0.5, ch['oy'] + PAD + 0.5])
        entries[ch['mesh']]['uv'][ch['vids']] = uvv
        ch['uvv'] = uvv
    area = sum(ch['w'] * ch['h'] for ch in charts)
    log('[layout] %s: %d receiving meshes, %d charts (%d curved), rows %d (+%d), fill %.0f%%, %.1fs' % (
        tag, sum(1 for e in entries if e['recv']), len(charts), sum(1 for c in charts if not c['planar']), rows, y0,
        100.0 * area / max(1, W * rows), time.time() - t0))
    return dict(entries=entries, charts=charts, rows=rows, y0=y0)


def write_uv(layout, outdir, stem, page=False):
    """binary: 'AOUV' u32 version u32 jsonLen json [uint16 pairs]. json: glb sha, entries [name, nverts, off (pairs)]"""
    ents, blobs, off = [], [], 0
    for e in layout['entries']:
        if not e['recv']:
            continue
        q = np.clip(np.round(e['uv'] * 16), 0, 65535).astype('<u2')
        if 'direct' in e:                  # per-vertex AO (curved page pieces): u = 65535, v = AO x 65535
            m = e['direct'] >= 0
            q[m, 0] = 65535
            q[m, 1] = np.clip(np.round(e['direct'][m] * 65535), 0, 65535).astype('<u2')
        n = e['nverts']
        sv = sorted({0, n // 3, (2 * n) // 3, n - 1})
        smp = e['local'] if page else [[int(i)] + [round(float(c), 3) for c in e['P'][i]] for i in sv]
        ents.append([e['name'], n, off, smp])
        blobs.append(q.tobytes())
        off += e['nverts']
    hdr = json.dumps({'format': 'aobake-uv', 'layout': LAYOUT_VERSION, 'glb': layout['file'], 'sha256': layout['sha'], 'page': page, 'y0': layout['y0'],
                      'rows': layout['rows'], 'scale': 16, 'entries': ents}, separators=(',', ':')).encode()
    hdr += b' ' * ((4 - len(hdr) % 4) % 4)
    body = b'AOUV' + np.array([1, len(hdr)], '<u4').tobytes() + hdr + b''.join(blobs)
    import gzip
    body = gzip.compress(body, 9, mtime=0)   # the page inflates it off the main thread (DecompressionStream)
    fn = '%s.uv.%s.bin.gz' % (stem, layout['sha'][:12])
    open(os.path.join(outdir, fn), 'wb').write(body)
    return fn, len(body)


# ---------------------------------------------------------------- sampling texels
def chart_samples(ch, Pw, visible_tri):
    """texels of a chart within 1.6 texels of a visible triangle: (texel x, y, world point, triangle)"""
    uvv, vids = ch['uvv'], ch['vids']
    vmap = {int(v): i for i, v in enumerate(vids)}
    tris = [t for t in ch['tris'] if visible_tri[t]]
    if not tris:
        return None
    if not ch['planar']:
        # one texel: the mean of the component's visible vertices
        T = np.array(tris)
        p = Pw[1][T].reshape(-1, 3).mean(0) if False else None
        return ('point', tris)
    best = {}
    R = 1.6
    for t in tris:
        tv = Pw[1][t]
        a, b, c = (uvv[vmap[int(v)]] for v in tv)
        lo = np.floor(np.minimum(np.minimum(a, b), c) - R - 0.5).astype(int)
        hi = np.ceil(np.maximum(np.maximum(a, b), c) + R - 0.5).astype(int)
        lo = np.maximum(lo, [ch['ox'], ch['oy']])                      # never past the chart's own rectangle (its gutter)
        hi = np.minimum(hi, [ch['ox'] + ch['w'] - 1, ch['oy'] + ch['h'] - 1])
        if (hi < lo).any():
            continue
        xs = np.arange(lo[0], hi[0] + 1)
        ys = np.arange(lo[1], hi[1] + 1)
        X, Y = np.meshgrid(xs + 0.5, ys + 0.5)
        p = np.stack([X.ravel(), Y.ravel()], 1)
        bc, d = closest_bary(p, a, b, c)
        m = d <= R
        if not m.any():
            continue
        for (tx, ty), dd, bb in zip(np.stack([X.ravel()[m] - 0.5, Y.ravel()[m] - 0.5], 1).astype(int), d[m], bc[m]):
            k = (tx, ty)
            o = best.get(k)
            if o is None or dd < o[0]:
                best[k] = (dd, t, bb)
    return ('texels', best)


def closest_bary(p, a, b, c):
    """closest point on triangle abc (2D) to each p: barycentrics (n,3) and distance"""
    v0, v1 = b - a, c - a
    d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
    den = d00 * d11 - d01 * d01
    w = p - a
    if abs(den) < 1e-14:
        # degenerate in uv: nearest vertex
        D = np.stack([np.linalg.norm(p - q, axis=1) for q in (a, b, c)], 1)
        k = D.argmin(1)
        bc = np.zeros((len(p), 3))
        bc[np.arange(len(p)), k] = 1
        return bc, D.min(1)
    d20, d21 = w @ v0, w @ v1
    v = (d11 * d20 - d01 * d21) / den
    ww = (d00 * d21 - d01 * d20) / den
    u = 1 - v - ww
    inside = (u >= 0) & (v >= 0) & (ww >= 0)
    bc = np.stack([u, v, ww], 1)
    dist = np.zeros(len(p))
    out = ~inside
    if out.any():
        q = p[out]
        bestd = np.full(len(q), np.inf)
        bestb = np.zeros((len(q), 3))
        for (A, B, ia, ib) in ((a, b, 0, 1), (b, c, 1, 2), (c, a, 2, 0)):
            e = B - A
            L2 = e @ e
            t = np.clip(((q - A) @ e) / max(L2, 1e-14), 0, 1)
            pt = A + t[:, None] * e
            d = np.linalg.norm(q - pt, axis=1)
            m = d < bestd
            bestd[m] = d[m]
            nb = np.zeros((m.sum(), 3))
            nb[:, ia] = 1 - t[m]
            nb[:, ib] = t[m]
            bestb[m] = nb
        bc[out] = bestb
        dist[out] = bestd
    return bc, dist


# ---------------------------------------------------------------- tracing
def hammersley(n):
    out = np.zeros((n, 2))
    for i in range(n):
        b, r, f = i, 0.0, 0.5
        while b:
            if b & 1:
                r += f
            b >>= 1
            f *= 0.5
        out[i] = ((i + 0.5) / n, r)
    return out


def hash01(x):
    x = (x.astype(np.uint64) * np.uint64(0x9E3779B97F4A7C15)) & np.uint64(0xFFFFFFFFFFFFFFFF)
    x ^= x >> np.uint64(31)
    x = (x * np.uint64(0xBF58476D1CE4E5B9)) & np.uint64(0xFFFFFFFFFFFFFFFF)
    x ^= x >> np.uint64(29)
    return (x & np.uint64(0xFFFFFF)).astype(np.float64) / float(0x1000000)


_G = {}


def _trace_chunk(args):
    s0, s1 = args
    P, N = _G['P'][s0:s1], _G['N'][s0:s1]
    occ_s, gls_s, HS = _G['occ'], _G['gls'], _G['HS']
    n = len(P)
    tx = np.where(np.abs(N[:, :1]) < 0.9, np.stack([np.zeros(n), -N[:, 2], N[:, 1]], 1), np.stack([N[:, 2], np.zeros(n), -N[:, 0]], 1))
    tx /= np.linalg.norm(tx, axis=1, keepdims=True)
    bx = np.cross(N, tx)
    ids = np.arange(s0, s1)
    ou, ov = hash01(ids * 7919 + 17), hash01(ids * 31337 + 91)
    O = (P + N * EPS).astype(np.float32)
    occ = np.zeros(n)
    gl = np.zeros(n)
    for k in range(len(HS)):
        u = (HS[k, 0] + ou) % 1.0
        v = (HS[k, 1] + ov) % 1.0
        r, ph = np.sqrt(u), 2 * np.pi * v
        a, b, c = r * np.cos(ph), r * np.sin(ph), np.sqrt(np.maximum(0, 1 - u))
        D = (tx * a[:, None] + bx * b[:, None] + N * c[:, None]).astype(np.float32)
        t = occ_s.run(O, D, dists=np.full(n, GLEN, np.float32), query='DISTANCE')
        hit = t < RLEN
        f = np.where(hit, 1 - (t / RLEN) ** 2, 0.0)
        occ += f
        if gls_s is not None:
            tg = gls_s.run(O, D, dists=np.full(n, GLEN, np.float32), query='DISTANCE')
            gl += (tg < GLEN) & (tg < t)
    return s0, occ / len(HS), gl / len(HS)


def trace_all(P, N, occ_tris, glass_tris, procs):
    from embreex import rtcore_scene as rtcs
    from embreex.mesh_construction import TriangleMesh
    t0 = time.time()
    so = rtcs.EmbreeScene()
    TriangleMesh(so, occ_tris.astype(np.float32))
    sg = None
    if len(glass_tris):
        sg = rtcs.EmbreeScene()
        TriangleMesh(sg, glass_tris.astype(np.float32))
    _G.update(P=P, N=N, occ=so, gls=sg, HS=hammersley(RAYS))
    n = len(P)
    CH = 20000
    jobs = [(i, min(n, i + CH)) for i in range(0, n, CH)]
    occ = np.zeros(n)
    gl = np.zeros(n)
    done = 0
    if procs > 1:
        import multiprocessing as mp
        ctx = mp.get_context('fork')
        with ctx.Pool(procs) as pool:
            for s0, o, g in pool.imap_unordered(_trace_chunk, jobs):
                occ[s0:s0 + len(o)] = o
                gl[s0:s0 + len(g)] = g
                done += len(o)
                if (done // CH) % 10 == 0:
                    log('  traced %d / %d  %.0fs' % (done, n, time.time() - t0))
    else:
        for j in jobs:
            s0, o, g = _trace_chunk(j)
            occ[s0:s0 + len(o)] = o
            gl[s0:s0 + len(g)] = g
    log('[trace] %d texels x %d rays in %.1fs' % (n, RAYS, time.time() - t0))
    return occ, gl


# ---------------------------------------------------------------- main
def base_tris_for_option(opt):
    """the base package's triangles with the idea's hidden elements removed (meta options[].hide / hideRanges)"""
    meta = json.load(open(os.path.join(BIM2, 'scene.meta.json')))
    o = next(x for x in meta['options'] if x['id'] == opt) if opt else {}
    hide = o.get('hide') or []
    hide = json.loads(hide) if isinstance(hide, str) else hide
    hr = o.get('hideRanges') or []
    hr = json.loads(hr) if isinstance(hr, str) else hr
    H = set(hide) | {h[0] + '|' + str(h[1]) for h in hr}
    out = []
    for e in GLB(os.path.join(BIM2, 'scene.glb')).mesh_entries():
        if e['name'].startswith('leaf|') or e['extras'].get('group') == 'glass' or 'glass' in e['extras'].get('material', ''):
            continue
        keep = np.ones(len(e['idx']), bool)
        for r in e['extras'].get('ranges', []):
            if r[0] in H or (r[1] and (r[0] + '|' + str(r[1])) in H):
                keep[r[2]:r[2] + r[3]] = False
        out.append(e['pos'][e['idx'][keep]])
    return np.concatenate(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene', choices=list(SCENES))
    ap.add_argument('--page', required=True, help='export_page.js output for this scene')
    ap.add_argument('--out', default=os.path.join(BIM2, 'ao'))
    ap.add_argument('--procs', type=int, default=os.cpu_count() or 2)
    ap.add_argument('--format', default='webp', choices=['webp', 'png'])
    ap.add_argument('--overlay', default=None, help='r51: the page export was made with this overlay on (meta overlays[]); write a patch for the scene\'s atlas instead of a new atlas')
    a = ap.parse_args()
    T0 = time.time()
    os.makedirs(a.out, exist_ok=True)
    opt = SCENES[a.scene]
    base_glb = os.path.join(BIM2, 'scene.glb')
    layouts = [make_layout(base_glb, 0, load_spaces([os.path.join(BIM2, 'scene.meta.json')]), 'scene.glb')]
    if layouts[0]['rows'] > BASE_ROWS:
        raise SystemExit('base layout needs %d rows > %d: lower the indoor texel density' % (layouts[0]['rows'], BASE_ROWS))
    if opt:
        og = os.path.join(BIM2, 'scene.opt-%s.glb' % opt)
        sp = load_spaces([os.path.join(BIM2, 'scene.meta.json'), os.path.join(BIM2, 'scene.opt-%s.meta.json' % opt)])
        layouts.append(make_layout(og, BASE_ROWS, sp, os.path.basename(og), extra_occ=base_tris_for_option(opt)))
    page = pagebin.read(a.page)
    if page['scene'] != a.scene:
        raise SystemExit('page export is for %s, not %s' % (page['scene'], a.scene))
    if (page.get('overlay') or None) != a.overlay:
        raise SystemExit('page export overlay %s, asked for %s' % (page.get('overlay'), a.overlay))
    # page geometry per package mesh
    pk = {}
    for m in page['pkg']:
        pk[(m['opt'], m['name'])] = m
    # page-built receivers (cabinets, counters, backsplashes): their own region after the GLB regions, curved parts per vertex
    pents = []
    for m in page.get('pieces', []):
        if not m['vis'] or len(m['idx']) == 0:
            continue
        pents.append(dict(name=m['key'], nverts=m['n'], recv=True, uv=None, ranges=[], P=m['pos'], I=m['idx'], local=m['local'], _page=m))
    _G_layout['tris'] = [base_tris_for_option(opt) if opt else base_tris_for_option(None)] + [e['P'][e['I']] for e in pents]
    yp = int(math.ceil((layouts[-1]['y0'] + layouts[-1]['rows']) / 4.0) * 4) if opt else BASE_ROWS
    sp_all = load_spaces([os.path.join(BIM2, 'scene.meta.json')] + ([os.path.join(BIM2, 'scene.opt-%s.meta.json' % opt)] if opt else []))
    LP = layout_core(pents, yp, sp_all, 'page pieces', None, 'vertex')
    man = hashlib.sha256(json.dumps([[e['name'], e['nverts'], e['local']] for e in pents]).encode()).hexdigest()
    LP.update(sha=man, file='page', bytes=0, page=True)
    for e in pents:
        e['direct'] = np.full(e['nverts'], -1.0)
    layouts.append(LP)
    # ---- sample points
    PTS, NRM, REF = [], [], []     # REF: (layout, chart index, kind, payload)
    t0 = time.time()
    for li, L in enumerate(layouts):
        optid = None if li == 0 else opt
        for ci, ch in enumerate(L['charts']):
            ent = L['entries'][ch['mesh']]
            if L.get('page'):
                m = ent['_page']
                if '_vis' not in ent:
                    ent['_vis'] = np.ones(len(ent['I']), bool)
                if ch.get('vertex'):       # AO per vertex: the vertex, along its area-weighted normal in this component
                    Pp, I = m['pos'], ent['I']
                    fn = np.cross(Pp[I[ch['tris'], 1]] - Pp[I[ch['tris'], 0]], Pp[I[ch['tris'], 2]] - Pp[I[ch['tris'], 0]])
                    vn = np.zeros((len(Pp), 3))
                    for k in range(3):
                        np.add.at(vn, I[ch['tris'], k], fn)
                    vv = ch['vids']
                    nn = vn[vv] / np.maximum(np.linalg.norm(vn[vv], axis=1, keepdims=True), 1e-12)
                    PTS.append(Pp[vv])
                    NRM.append(nn)
                    REF.append((li, ci, 'vertex', vv))
                    continue
            else:
                m = pk.get((optid, ent['name']))
            if m is None or not m['vis'] or m['n'] < ent['nverts']:
                continue
            Pw = m['pos']
            # visible triangles: GLB triangle (a, b, c) present in the page's current index
            if '_vis' not in ent:
                cur = m['idx']
                nv = m['n']
                ok = ~((cur[:, 0] == cur[:, 1]) & (cur[:, 1] == cur[:, 2]))
                keys = set(((cur[ok, 0] * nv + cur[ok, 1]) * nv + cur[ok, 2]).tolist())
                I = ent['I']
                kk = (I[:, 0] * nv + I[:, 1]) * nv + I[:, 2]
                ent['_vis'] = np.array([k in keys for k in kk.tolist()])
            r = chart_samples(ch, (Pw, ent['I']), ent['_vis'])
            if r is None:
                continue
            I = ent['I']
            if r[0] == 'point':
                T = np.array(r[1])
                p = Pw[I[T]].mean(1).mean(0)
                PTS.append(p[None])
                NRM.append(ch['n'][None])
                REF.append((li, ci, 'point', None))
            else:
                best = r[1]
                keys = np.array(list(best.keys()), np.int64)
                tt = np.array([v[1] for v in best.values()])
                bb = np.array([v[2] for v in best.values()])
                p = (Pw[I[tt]] * bb[:, :, None]).sum(1)
                PTS.append(p)
                NRM.append(np.repeat(ch['n'][None], len(p), 0))
                REF.append((li, ci, 'texels', keys))
    for m in (page.get('ovl') or []):            # r51: an overlay's own wall faces: AO per vertex, along the vertex's area-weighted normal
        Pp, I = m['pos'], m['idx']
        fn = np.cross(Pp[I[:, 1]] - Pp[I[:, 0]], Pp[I[:, 2]] - Pp[I[:, 0]])
        vn = np.zeros((len(Pp), 3))
        for k in range(3):
            np.add.at(vn, I[:, k], fn)
        PTS.append(Pp)
        NRM.append(vn / np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12))
        REF.append((-1, m['name'], 'ovl', len(Pp)))
    sizes = [len(x) for x in PTS]
    P = np.concatenate(PTS)
    N = np.concatenate(NRM)
    log('[samples] %d texels in %.1fs' % (len(P), time.time() - t0))
    # ---- occluders
    occ, glass = [], []
    for m in page['pkg']:
        if not m['vis'] or m['idx'] is None:
            continue
        nm = m['name']
        I = m['idx']
        I = I[~((I[:, 0] == I[:, 1]) & (I[:, 1] == I[:, 2]))]
        I = I[I.max(1) < m['n']]
        tri = m['pos'][I]
        parts = nm.split('|')
        grp = parts[0] if len(parts) == 3 else ''
        mat = parts[2] if len(parts) == 3 else ''
        if nm.startswith('leaf|'):
            continue
        if grp == 'glass' or 'glass' in mat:
            glass.append(tri)
            continue
        occ.append(tri)
    keep_po = 0
    for o in page['objs']:
        cat, kind, grp, name = o['cat'], o['kind'] or '', o['group'], o['name'] + ' ' + o['mat']
        if (grp in ('yard', 'ceil', 'roof', 'lowerRoof') and not o.get('ov')) or cat in ('furniture', 'lighting', 'light'):
            continue                                    # (an overlay's own roof is part of the package it stands in for)
        import re
        if re.search(r'mirror|xlight|sconce|r35shade|door28|pocket|hologram|pendant|chandelier', kind + ' ' + name, re.I):
            continue
        occ.append(page['occ'][o['t0']:o['t0'] + o['nt']])
        keep_po += o['nt']
    occ = np.concatenate(occ)
    glass = np.concatenate(glass) if glass else np.zeros((0, 3, 3))
    log('[occluders] %d triangles (%d page-built), glass %d' % (len(occ), keep_po, len(glass)))
    occf, glf = trace_all(P, N, occ, glass, a.procs)
    vis = 1 - occf * (1 - np.clip(glf * GLASS_K, 0, 1))
    # ---- atlas
    H = layouts[-1]['y0'] + layouts[-1]['rows'] if (opt or LP['rows'] > 0) else layouts[0]['rows']
    H = int(math.ceil(H / 4.0) * 4)
    A = np.ones((H, W), np.float64)
    WT = np.zeros((H, W), np.float64)
    o = 0
    OVL = {}
    for (li, ci, kind, keys), n in zip(REF, sizes):
        if kind == 'ovl':
            OVL[ci] = vis[o:o + n]
            o += n
            continue
        ch = layouts[li]['charts'][ci]
        v = vis[o:o + n]
        o += n
        if ch.get('sky'):
            v = np.ones_like(v)
        elif ch.get('thin'):
            v = 1 - (1 - v) * THIN_K
        if kind == 'vertex':
            layouts[li]['entries'][ch['mesh']]['direct'][keys] = v
            continue
        if kind == 'point':
            x0, y0 = ch['ox'], ch['oy']
            A[y0:y0 + ch['h'], x0:x0 + ch['w']] = v[0]
            continue
        A[keys[:, 1], keys[:, 0]] = v
        WT[keys[:, 1], keys[:, 0]] = 1
    # denoise: per chart, a masked 3x3 binomial (twice), only texels of the same chart
    for li, L in enumerate(layouts):
        for ch in L['charts']:
            if not ch['planar'] or ch.get('vertex'):
                continue
            x0, y0, w, h = ch['ox'], ch['oy'], ch['w'], ch['h']
            a_ = A[y0:y0 + h, x0:x0 + w]
            m_ = WT[y0:y0 + h, x0:x0 + w]
            if m_.sum() == 0:
                continue
            for _ in range(2):
                a_ = blur_masked(a_, m_)
            A[y0:y0 + h, x0:x0 + w] = np.where(m_ > 0, a_, A[y0:y0 + h, x0:x0 + w])
    A[:RES, :] = 1
    A[:, :RES] = 1
    img = np.clip(np.round(A * 255), 0, 255).astype(np.uint8)
    if a.overlay:
        # only the charts near what the overlay changes (its meta clearBox, grown by the 3 ft the rays reach)
        meta = json.load(open(os.path.join(BIM2, 'scene.meta.json')))
        bx = [o for o in meta.get('overlays', []) if o['id'] == a.overlay][0]; bx = bx.get('aoBox') or bx['clearBox']   # r52: aoBox for an overlay that clears nothing
        lo = np.array([bx[2], bx[4], bx[0]]) - RLEN - 1; hi = np.array([bx[3], bx[5] + 3, bx[1]]) + RLEN + 1   # world: X = BIM y, Y = z, Z = BIM x
        near = np.zeros(img.shape, bool); o = 0
        for (li, ci, kind, keys), n in zip(REF, sizes):
            if li == 0 and kind != 'vertex':
                q = P[o:o + n]
                if ((q >= lo) & (q <= hi)).all(1).any():
                    ch = layouts[0]['charts'][ci]; near[ch['oy']:ch['oy'] + ch['h'], ch['ox']:ch['ox'] + ch['w']] = True
            o += n
        return write_patch(a, img, layouts, near, OVL)
    from PIL import Image
    im = Image.fromarray(img, 'L')
    import io
    bio = io.BytesIO()
    if a.format == 'webp':
        im.save(bio, 'WEBP', lossless=True, quality=100, method=6)
        ext = 'webp'
    else:
        im.save(bio, 'PNG', optimize=True)
        ext = 'png'
    data = bio.getvalue()
    stem = 'scene' if not opt else 'scene.opt-%s' % opt
    afn = '%s.ao.%s.%s' % (stem, hashlib.sha256(data).hexdigest()[:12], ext)
    open(os.path.join(a.out, afn), 'wb').write(data)
    uvs = []
    for li, L in enumerate(layouts):
        if L.get('page'):
            fn, nb = write_uv(L, a.out, stem + '.ao.page', page=True)
            uvs.append({'page': True, 'sha256': L['sha'], 'file': fn, 'bytes': nb, 'n': len(L['entries'])})
            continue
        st = 'scene' if li == 0 else 'scene.opt-%s' % opt
        fn, nb = write_uv(L, a.out, st)
        uvs.append({'glb': L['file'], 'sha256': L['sha'], 'file': fn, 'bytes': nb, 'option': None if li == 0 else opt})
    idx = {'format': 'aobake', 'version': BAKE_VERSION, 'scene': a.scene, 'option': opt, 'uv': uvs,
           'atlas': {'file': afn, 'w': W, 'h': H, 'bytes': len(data)},
           'params': {'rays': RAYS, 'len': RLEN, 'falloff': '1-(t/len)^2', 'tsIn': round(TS_IN * 12, 3), 'tsOut': round(TS_OUT * 12, 3), 'glassK': GLASS_K, 'store': 'visibility'},
           'baked': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'seconds': round(time.time() - T0, 1)}
    open(os.path.join(a.out, '%s.ao.json' % stem), 'w').write(json.dumps(idx, indent=1))
    # stale files of this scene
    keep = {afn} | {u['file'] for u in uvs}
    for f in os.listdir(a.out):
        if f.startswith(stem + '.ao.') and f != stem + '.ao.json' and f not in keep:
            os.remove(os.path.join(a.out, f))
    log('[done] %s: atlas %dx%d %s %.0f KB, uv %s, %.0fs total' % (a.scene, W, H, afn, len(data) / 1024, ', '.join('%s %.0f KB' % (u['file'], u['bytes'] / 1024) for u in uvs), time.time() - T0))


def write_patch(a, img, layouts, near, OVL):
    """r51: an overlay changes a few charts of the scene's atlas. Written: <scene stem>.ovl-<overlay>.ao.<hash12>.bin.gz - the texels that differ
    from the scene's own atlas (more than 2/255), in rectangles (x aligned to 4), each with its values and a mask; plus <stem>.ovl-<overlay>.ao.json.
    The page writes the masked texels over whichever atlas is bound while the overlay shows (the base package's charts sit at the same place in
    every scene's atlas: they come from the one base uv set), and uploads the atlas afresh when it is turned off."""
    import gzip
    from PIL import Image
    from scipy import ndimage
    stem = 'scene' if not SCENES[a.scene] else 'scene.opt-%s' % SCENES[a.scene]
    idx = json.load(open(os.path.join(a.out, '%s.ao.json' % stem)))
    old = np.array(Image.open(os.path.join(a.out, idx['atlas']['file'])).convert('L'))
    H = min(old.shape[0], img.shape[0], BASE_ROWS)          # the base package's rows only
    d0 = np.abs(img[:H].astype(int) - old[:H].astype(int)) > 2
    d = d0 & near[:H]
    log('[patch] %d texels differ, %d of them on charts near the overlay' % (d0.sum(), d.sum()))
    lab, n = ndimage.label(ndimage.binary_dilation(d, iterations=6))
    rects, blobs, off = [], [], 0
    for sl in ndimage.find_objects(lab):
        y0, y1 = sl[0].start, sl[0].stop
        x0, x1 = sl[1].start // 4 * 4, min(W, -(-sl[1].stop // 4) * 4)
        m = d[y0:y1, x0:x1]
        if not m.any():
            continue
        v = img[y0:y1, x0:x1]
        rects.append([int(x0), int(y0), int(x1 - x0), int(y1 - y0), off])
        blobs += [v.tobytes(), (m.astype(np.uint8) * 255).tobytes()]
        off += 2 * v.size
    data = gzip.compress(b''.join(blobs), 9, mtime=0)
    fn = '%s.ovl-%s.ao.%s.bin.gz' % (stem, a.overlay, hashlib.sha256(data).hexdigest()[:12])
    for f in os.listdir(a.out):
        if f.startswith('%s.ovl-%s.ao.' % (stem, a.overlay)) and f.endswith('.bin.gz') and f != fn:
            os.remove(os.path.join(a.out, f))
    open(os.path.join(a.out, fn), 'wb').write(data)
    base_uv = [u for u in idx['uv'] if not u.get('page') and not u.get('option')][0]
    J = {'format': 'aobake-patch', 'version': BAKE_VERSION, 'scene': a.scene, 'overlay': a.overlay, 'atlas': idx['atlas']['file'], 'uv': base_uv['file'], 'sha256': base_uv['sha256'],
         'file': fn, 'bytes': len(data), 'rects': rects,
         'vertex': [{'mesh': k, 'n': int(len(v)), 'ao': [int(x) for x in np.clip(np.round(v * 255), 0, 255)]} for k, v in OVL.items()], 'texels': int(d.sum()), 'baked': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    open(os.path.join(a.out, '%s.ovl-%s.ao.json' % (stem, a.overlay)), 'w').write(json.dumps(J, indent=1))
    log('[done] patch %s: %d rects, %d texels changed, %.0f KB' % (fn, len(rects), J['texels'], len(data) / 1024))


def blur_masked(a, m):
    k = np.array([1, 2, 1], np.float64)

    def conv(x):
        y = x.copy()
        y[:, 1:-1] = x[:, :-2] * k[0] + x[:, 1:-1] * k[1] + x[:, 2:] * k[2]
        y[:, 0] = x[:, 0] * 2 + x[:, 1] if x.shape[1] > 1 else x[:, 0] * 3
        y[:, -1] = x[:, -1] * 2 + x[:, -2] if x.shape[1] > 1 else x[:, -1] * 3
        z = y.copy()
        z[1:-1] = y[:-2] * k[0] + y[1:-1] * k[1] + y[2:] * k[2]
        z[0] = y[0] * 2 + y[1] if y.shape[0] > 1 else y[0] * 3
        z[-1] = y[-1] * 2 + y[-2] if y.shape[0] > 1 else y[-1] * 3
        return z
    num = conv(a * m)
    den = conv(m)
    return np.where(den > 0, num / np.maximum(den, 1e-12), a)


if __name__ == '__main__':
    main()
