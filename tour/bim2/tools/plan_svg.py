"""Architect-style main-level plans of 118 Hillside, drawn from the model's own data (scene.meta.json and an option's meta / glb).
usage: python3 tour/bim2/tools/plan_svg.py <out-dir>  ->  plan-asbuilt.svg, plan-open4k-v2.svg (PNGs: rsvg-convert -z 2)"""
import json, math, sys, os
import numpy as np
from shapely.geometry import Polygon, LineString, Point, box as sbox
from shapely.ops import unary_union
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_open4 as B4
import build_open4k as K4
B2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
OUT = (sys.argv[1] if len(sys.argv) > 1 else '.') + '/'
BASE = json.load(open(B2 + 'scene.meta.json'))
LABEL = 'Illustrative idea. Not designed or reviewed by an architect or engineer. Not to scale; verify all dimensions.'

S = 20.0                       # px per ft
X0, X1, Y0, Y1 = -16.5, 41.0, -24.5, 36.5     # drawing window (plan ft): x east, y north
M_L, M_T = 60, 120             # margins (title on top)
W = int((X1 - X0) * S + 2 * M_L); H = int((Y1 - Y0) * S + M_T + 150)
def P(x, y): return ((x - X0) * S + M_L, (Y1 - y) * S + M_T)
def pts(coords): return ' '.join('%.1f,%.1f' % P(x, y) for x, y in coords)
def path_of(geom):
    out = []
    polys = [geom] if geom.geom_type == 'Polygon' else list(getattr(geom, 'geoms', []))
    for p in polys:
        if p.is_empty or p.geom_type != 'Polygon': continue
        for ring in [p.exterior] + list(p.interiors):
            c = list(ring.coords); out.append('M' + ' L'.join('%.1f %.1f' % P(x, y) for x, y in c) + 'Z')
    return ' '.join(out)
def ftin(v):
    t = round(v * 12); f, i = divmod(t, 12); return "%d'-%d\"" % (f, i)

def variant_data(v):
    if v == 'asbuilt':
        D = BASE; opt = None
    else:
        opt = next(o for o in BASE['options'] if o.get('legacyId') == v)
        D = json.load(open(B2 + opt['meta']))
    return D, opt

def main_spaces(D):
    return [s for s in D['spaces'] if s.get('storey') == 'L1' and s.get('polygon')]

def plan(v, title, subtitle):
    D, opt = variant_data(v)
    sp = main_spaces(D)
    zone = unary_union([Polygon(s['polygon']).buffer(0) for s in sp]).buffer(0.9)
    # ---- walls cut at 4 ft: main-level walls and the walls around the main-level rooms
    walls = []
    for c in D['colliders']:
        if c['kind'] != 'WALL' or not c['element'].startswith('W-'): continue
        if not (c['z0'] <= 0.5 and c['z1'] >= 4): continue
        g = Polygon(c['poly']).buffer(0)
        if c.get('storey') != 'L1' and not g.intersects(zone): continue
        if c.get('storey') != 'L1' and g.intersection(zone).area < 0.5 * g.area: continue
        walls.append(g)
    wall = unary_union(walls).buffer(0.01).buffer(-0.01)
    # ---- openings at this level (doors and windows that cut the 4 ft plane, or doors at the floor)
    ops = []
    for o in D['openings']:
        if not o.get('center') or o.get('kind') == 'SKYLIGHT' or o.get('skylight'): continue
        sill, head = o.get('sill', 0), o.get('head', 7)
        if o.get('storey') != 'L1' and not (-0.2 <= sill <= 0.3 and Point(o['center']).within(zone)): continue
        if sill > 4.2 or head < 4: continue
        ops.append(o)
    cuts = []
    for o in ops:
        ax = np.array(o.get('axis') or [1, 0], float); ax /= np.linalg.norm(ax); nx = np.array([-ax[1], ax[0]])
        c = np.array(o['center'][:2], float); w = o['width'] / 2; t = (o.get('thickness') or .5) / 2 + .12
        cuts.append(Polygon([c - ax * w - nx * t, c + ax * w - nx * t, c + ax * w + nx * t, c - ax * w + nx * t]))
    wall_cut = wall.difference(unary_union(cuts)) if cuts else wall
    svg = []
    A = svg.append
    A('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="Inter, Helvetica, Arial, sans-serif">' % (W, H, W, H))
    A('<rect width="100%" height="100%" fill="#fff"/>')
    cx0, cy0 = P(X0 + .5, Y1 - 1.0); cx1, cy1 = P(X1 - .5, -20.6)
    A('<clipPath id="cut"><rect x="%.1f" y="%.1f" width="%.1f" height="%.1f"/></clipPath><g clip-path="url(#cut)">' % (cx0, cy0, cx1 - cx0, cy1 - cy0))
    A('<defs><pattern id="deck" width="%.1f" height="%.1f" patternUnits="userSpaceOnUse"><path d="M0 %.1f H%.1f" stroke="#9a9a9a" stroke-width=".5"/></pattern>'
      '<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V6" stroke="#bbb" stroke-width=".6"/></pattern></defs>' % (S, S * .5, S * .5 - .3, S))
    # ---- decks, landings and steps (exterior)
    decks = [Polygon(w['poly']).buffer(0) for w in D['walkable'] if w.get('kind') == 'DECK' and w.get('storey') == 'L1']
    for w in D['walkable']:
        if (w.get('element') or '') in ('SL-DK-LAND',): decks.append(Polygon(w['poly']).buffer(0))
    dk = unary_union(decks).difference(wall.buffer(.02))
    A('<path d="%s" fill="url(#deck)" stroke="#333" stroke-width="1"/>' % path_of(dk))
    treads = [w for w in D['walkable'] if w.get('kind') in ('TREAD',) and any((w.get('element') or '').startswith(p) for p in ('ST-FRONT', 'ST-REAR', 'ST-UP', 'ST-DN'))]
    for w in treads:
        dash = ' stroke-dasharray="3 2"' if (w.get('element') or '').startswith('ST-DN') else ''
        A('<polygon points="%s" fill="#fff" stroke="#333" stroke-width=".8"%s/>' % (pts(w['poly']), dash))
    # rails
    for c in D['colliders']:
        if c['kind'] == 'RAIL':
            g = Polygon(c['poly']).buffer(0)
            if g.intersects(zone.buffer(12)): A('<path d="%s" fill="#fff" stroke="#333" stroke-width=".8"/>' % path_of(g))
    # ---- floors (white) and spaces
    floor = unary_union([Polygon(s['polygon']).buffer(0) for s in sp])
    A('<path d="%s" fill="#fff" stroke="none"/>' % path_of(floor))
    # ---- vault, ridge beam, skylights (above the cut: dashed)
    if v == 'open4k':
        room = Polygon(B4.ROOM)
        for yy in (K4.KB_Y0, K4.KB_Y1):
            A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#444" stroke-width=".8" stroke-dasharray="10 4 2 4"/>' % (*P(K4.POST[1], yy), *P(B4.X_E, yy)))
        x, y = P(14.3, B4.RIDGE_Y - .75); A('<text x="%.1f" y="%.1f" font-size="8" fill="#444" letter-spacing=".4">CLEAR-SPAN RIDGE BEAM ABOVE, 31 FT (ENGINEER) &#183; VAULTED CEILING</text>' % (x, y))
        for (a, b, c0, c1) in (K4.SKY if SKY is None else SKY):
            A('<polygon points="%s" fill="none" stroke="#444" stroke-width=".8" stroke-dasharray="5 3"/>' % pts([(a, c0), (b, c0), (b, c1), (a, c1)]))
            x, y = P((a + b) / 2, (c0 + c1) / 2); A('<text x="%.1f" y="%.1f" font-size="7" fill="#555" text-anchor="middle">SKY</text>' % (x, y + 2.5))
    # ---- fixtures
    fx = fixtures(D, v)
    for f in fx: A(f)
    # ---- walls (poche) and openings
    A('<path d="%s" fill="#111" fill-rule="evenodd" stroke="#111" stroke-width=".6"/>' % path_of(wall_cut))
    for o in ops: A(opening_svg(o, D))
    # ---- room labels
    for s in sp:
        g = Polygon(s['polygon']).buffer(0); name = s['name']
        if name.lower() in ('closet', 'hall closet', 'laundry closet'): lab = {'closet': 'CL', 'hall closet': 'CL', 'laundry closet': 'LAUN'}[name.lower()]; big = False
        else: lab = name.upper(); big = True
        c = label_point(s, g, v)
        x, y = P(*c)
        if big:
            lines = wrap(lab, 16)
            for i, ln in enumerate(lines):
                A('<text x="%.1f" y="%.1f" font-size="11" font-weight="600" fill="#111" text-anchor="middle" letter-spacing=".6">%s</text>' % (x, y + i * 13, esc(ln)))
            A('<text x="%.1f" y="%.1f" font-size="9.5" fill="#333" text-anchor="middle">%d SF</text>' % (x, y + len(lines) * 13, round(g.area / 5) * 5))
        else:
            A('<text x="%.1f" y="%.1f" font-size="8.5" fill="#333" text-anchor="middle" letter-spacing=".4">%s</text>' % (x, y + 3, lab))
    for name, at in extra_labels(v):
        x, y = P(*at); A('<text x="%.1f" y="%.1f" font-size="9.5" font-weight="600" fill="#333" text-anchor="middle" letter-spacing=".5">%s</text>' % (x, y, name))
    A('</g>')
    # ---- overall dimensions (main-level walls)
    bx0, by0, bx1, by1 = wall.bounds
    dim_h(A, bx0, bx1, by1 + 2.4, ftin(bx1 - bx0))
    dim_v(A, by0, by1, bx1 + 2.4, ftin(by1 - by0))
    if v == 'open4k':
        dim_h(A, K4.X_LW, B4.X_E, by1 + 1.2, ftin(B4.X_E - K4.X_LW) + ' west gable to street gable (interior)', small=True)
        dim_v(A, B4.Y_S, B4.Y_N, bx1 + 1.2, ftin(B4.Y_N - B4.Y_S), small=True)
    # ---- title, north arrow, scale bar, label
    A('<text x="%d" y="44" font-size="22" font-weight="700" fill="#111">%s</text>' % (M_L, esc(title)))
    A('<text x="%d" y="70" font-size="13" fill="#333">%s</text>' % (M_L, esc(subtitle)))
    A('<line x1="%d" y1="86" x2="%d" y2="86" stroke="#111" stroke-width="1"/>' % (M_L, W - M_L))
    north(A, W - M_L - 30, 40)
    scale_bar(A, M_L, H - 92)
    for i, ln in enumerate(([LABEL] if v != 'asbuilt' else ['Drawn from the 3D model of the house as it is. Not to scale; verify all dimensions.'])):
        A('<text x="%d" y="%d" font-size="11.5" fill="#111" font-weight="%s">%s</text>' % (M_L, H - 40 + i * 15, '600' if v != 'asbuilt' else '400', esc(ln)))
    A('<text x="%d" y="%d" font-size="9.5" fill="#555">118 Hillside Drive, Woodside, CA &#183; Main level &#183; Street (Hillside Drive) to the east &#183; Dashed: above the cut (upper cabinets, skylights, ridge beam) or below (lower stair) &#183; Garage and lower level not shown</text>' % (M_L, H - 22))
    A('</svg>')
    return '\n'.join(svg)

def esc(s): return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
def wrap(s, n):
    words, lines, cur = s.split(), [], ''
    for w in words:
        if cur and len(cur) + 1 + len(w) > n: lines.append(cur); cur = w
        else: cur = (cur + ' ' + w).strip()
    if cur: lines.append(cur)
    return lines

LABEL_AT = {('open4k', 'SP-L1-GREAT'): (21.0, 16.4), ('open4k', 'SP-L1-KITCHEN'): (10.3, 13.2), ('asbuilt', 'SP-L1-KITCHEN'): (9.6, 11.6),
            ('asbuilt', 'SP-L1-GREAT'): (25.0, 11.0), ('asbuilt', 'SP-L1-BED3'): (30.0, 23.0), ('asbuilt', 'SP-L1-BED2'): (19.0, 26.5),
            ('asbuilt', 'SP-L1-HALL'): (9.4, 23.4), ('open4k', 'SP-L1-HALL'): (9.4, 23.4), ('asbuilt', 'SP-L1-BATH'): (9.4, 29.3), ('open4k', 'SP-L1-BATH'): (9.4, 29.3),
            ('asbuilt', 'SP-L1-LIVING'): (-2.3, 7.0), ('open4k', 'SP-L1-LIVING'): (-2.3, 7.0), ('asbuilt', 'SP-L1-BED1'): (-1.0, 21.5), ('open4k', 'SP-L1-BED1'): (-1.0, 21.5)}
def label_point(s, g, v):
    if (v, s['id']) in LABEL_AT: return LABEL_AT[(v, s['id'])]
    c = g.representative_point(); return (c.x, c.y)
def extra_labels(v):
    if v == 'open4k':
        return [('KITCHEN', (33.0, 27.2)), ('LIVING', (19.3, 21.0)), ('DINING: 8 SEATED', (17.7, 11.55)), ('10 WITH LEAF (DASHED)', (17.7, 10.75)), ('DECK', (25.5, -3.2)), ('FOLDING GLASS WALL', (25.2, 3.6)), ('PREP SINK', (28.6, 22.9)), ('POCKET DOOR', (8.65, 24.55))]
    return [('FRONT PORCH', (9.0, -4.5))] if v == 'asbuilt' else []

def opening_svg(o, D):
    ax = np.array(o.get('axis') or [1, 0], float); ax /= np.linalg.norm(ax); nx = np.array([-ax[1], ax[0]])
    c = np.array(o['center'][:2], float); w = o['width'] / 2; t = (o.get('thickness') or .5) / 2
    a, b = c - ax * w, c + ax * w; out = []
    L = lambda p, q, sw=.8, dash='', col='#111': out.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%s"%s/>' % (*P(*p), *P(*q), col, sw, (' stroke-dasharray="%s"' % dash) if dash else ''))
    cls = o.get('class') or o.get('cls')
    if cls == 'IfcWindow':
        for k in (-t, t): L(a + nx * k, b + nx * k, .7)
        L(a, b, 1.1)                                        # glass
        for p in (a, b): L(p - nx * t, p + nx * t, .9)      # jambs
        return '\n'.join(out)
    leaf = (o.get('leaves') or [None])[0] or o.get('leaf') or {}
    kind = leaf.get('kind') if isinstance(leaf, dict) else None
    for p in (a, b): L(p - nx * t, p + nx * t, .9)
    if kind == 'FOLD':
        n = leaf.get('panels', 6); p = o['width'] / n; th = math.radians(85.5); yP = leaf.get('plane', c[1]); X = max(a[0], b[0]) if leaf.get('stack') != 'west' else min(a[0], b[0])
        sx = -1 if leaf.get('stack') != 'west' else 1; outd = -1
        pts_ = [(X, yP)]
        for i in range(n):
            dx, dy = sx * math.cos(th), outd * math.sin(th) * (-1 if i % 2 else 1); X, yP = X + p * dx, yP + p * dy; pts_.append((X, yP))
        out.append('<polyline points="%s" fill="none" stroke="#111" stroke-width="2.2" stroke-linejoin="miter"/>' % pts(pts_))
        L(a, b, .6, '6 3', '#333')                          # track
        # the swing of the folding stack (quarter arcs, light)
        return '\n'.join(out)
    if kind == 'POCKET':
        hs = leaf.get('hingeEnd', 'START'); d = -ax if hs == 'START' else ax
        p0 = (a if hs == 'START' else b); L(p0, p0 + d * o['width'] * .95, .9, '4 2')
        return '\n'.join(out)
    if kind == 'BYPASS':
        L(a + nx * .08, c + ax * .2 + nx * .08, 1.4); L(c - ax * .2 - nx * .08, b - nx * .08, 1.4)
        return '\n'.join(out)
    if kind == 'SWING' or (cls == 'IfcDoor' and kind is None):
        hinge = (leaf.get('hinge') or [[*a, 0]])[0][:2] if isinstance(leaf, dict) else list(a)
        h = np.array(hinge, float); other = b if np.linalg.norm(h - a) < np.linalg.norm(h - b) else a
        side = leaf.get('swingSide', 'A') if isinstance(leaf, dict) else 'A'
        sid = (o.get('spaces') or {}).get(side)
        sgn = 1.0
        spc = next((s for s in D['spaces'] if s['id'] == sid and s.get('polygon')), None)
        if spc is not None:
            sgn = 1.0 if Polygon(spc['polygon']).buffer(0).contains(Point(*(c + nx * 1.0))) else -1.0
        elif (o.get('normal')):
            sgn = 1.0 if np.dot(np.array(o['normal'][:2]), nx) > 0 else -1.0
        r = np.linalg.norm(other - h); open_end = h + nx * sgn * r
        L(h, open_end, 1.3)
        sweep = 1 if np.cross(np.append(other - h, 0), np.append(open_end - h, 0))[2] < 0 else 0
        p1, p2 = P(*other), P(*open_end)
        out.append('<path d="M%.1f %.1f A%.1f %.1f 0 0 %d %.1f %.1f" fill="none" stroke="#111" stroke-width=".6"/>' % (*p1, r * S, r * S, sweep, *p2))
        return '\n'.join(out)
    # a door without a leaf record: glazed (the entry's door and sidelights) or a cased opening
    if cls == 'IfcDoor':
        for k in (-t, t): L(a + nx * k, b + nx * k, .7)
        L(a, b, 1.1)
    return '\n'.join(out)

KSIZE = {'baseCabinet': (3, 2), 'tallCabinet': (2.5, 2), 'upperCabinet': (3, 1.1), 'fridge4Door': (3, 2.5), 'dishwasher': (2, 2), 'rangeSlideIn30': (2.5, 2.08),
         'range36': (3, 2.4), 'sinkUndermount': (2.5, 1.5), 'beverageCooler': (2, 2), 'island': (7, 3.3), 'builtinBookcase': (3, 1), 'vanity': (3, 1.75),
         'toilet': (1.26, 2.42), 'tubAlcove': (6.136, 2.5), 'washerFront': (2.25, 2.7), 'windowSeat': (5.9, 1.9), 'sideboard': (5.5, 1.6)}
def foot(f):
    k = f['render']['kind']; pr = dict(f.get('params') or {}); pr.update((f['render'].get('opts') or {}))
    if f.get('footprint'): return Polygon(f['footprint'])
    w, d = KSIZE.get(k, (2, 2)); w = pr.get('w', w); d = pr.get('d', d)
    th = math.radians(f.get('rot') or 0); fwd = np.array([math.cos(th), math.sin(th)]); side = np.array([-fwd[1], fwd[0]])
    a = np.array(f['at'][:2], float)
    if f['render'].get('lib') == 'STAGE' and not f.get('stageBack'): a = a - fwd * d / 2
    return Polygon([a - side * w / 2, a + side * w / 2, a + side * w / 2 + fwd * d, a - side * w / 2 + fwd * d])

def fixtures(D, v):
    out = []; A = out.append
    F = [f for f in D['furnishings'] if f.get('storey') == 'L1' and f.get('at')]
    def poly(g, fill='#fff', sw=.8, dash='', col='#222'):
        A('<path d="%s" fill="%s" stroke="%s" stroke-width="%s"%s/>' % (path_of(g), fill, col, sw, (' stroke-dasharray="%s"' % dash) if dash else ''))
    def text(at, s, size=7.5):
        x, y = P(*at); A('<text x="%.1f" y="%.1f" font-size="%s" fill="#333" text-anchor="middle" letter-spacing=".3">%s</text>' % (x, y + size / 3, size, s))
    # counters first (outline polygons with their cut-outs)
    for f in F:
        if f['render']['kind'] == 'counterTop':
            pr = f.get('params') or {}
            for o in pr.get('outlines', []): poly(Polygon(o).buffer(0), '#f4f4f4', .9)
    for f in F:
        k = f['render']['kind']; pr = f.get('params') or {}
        if k in ('counterTop', 'faucetKitchen', 'finishedPanel', 'mirror', 'showerSystem', 'downspout', 'hoodGlassCanopy', 'upperMicrowave', 'closetSystem', 'counterStoolRope'): continue
        if k == 'libraryWall':                                   # the wall of books: each bay, the doorway through it, the rail and the ladder
            x0 = f['at'][0]; yc = f['at'][1]; d = pr.get('d', 1); bd = pr.get('baseD', d)
            for a, b, ty in pr.get('bays', []):
                if ty == 'post': continue
                if ty == 'door': poly(sbox(x0, yc + a, x0 + d, yc + b), 'none', .6, '4 2', '#555'); continue
                dd = bd if ty == 'base' else d; g = sbox(x0, yc + a, x0 + dd, yc + b); poly(g, '#fff', .8)
                A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#777" stroke-width=".4"/>' % (*P(x0, yc + a), *P(x0 + dd, yc + b)))
            if pr.get('ladderX') is not None:
                ly = yc + pr['ladderX']; lz = x0 + d + .22; poly(sbox(lz, ly - .75, lz + pr.get('ladderRun', 1.9), ly + .75), 'none', .6, '2 2', '#555')
                text((lz + .95, ly - 1.05), 'LADDER', 6)
            A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#555" stroke-width=".7"/>' % (*P(x0 + d + .22, yc + pr.get('railFrom', -pr['w'] / 2)), *P(x0 + d + .22, yc + pr['w'] / 2 - .08)))
            continue
        if k in LOOSE:                                           # loose furniture, drawn light
            w_, d_, shape = LOOSE[k]; f2 = dict(f); f2['params'] = dict({'w': w_, 'd': d_}, **{kk: vv for kk, vv in pr.items() if kk in ('w', 'd')}); g = foot(f2)
            if shape == 'round': x, y = P(g.centroid.x, g.centroid.y); A('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#fff" stroke="#888" stroke-width=".6"/>' % (x, y, (pr.get('dia') or w_) / 2 * S))
            else: poly(g.buffer(-.12).buffer(.12) if shape == 'soft' else g, '#fff', .9 if k == 'pianoUpright' else .6, '', '#222' if k == 'pianoUpright' else '#888')
            if k == 'diningTable' and pr.get('extW'):          # the table with its leaf in (dashed), and where the end chair goes then
                ex = pr['extW'] - pr['w']; th = math.radians(f.get('rot') or 0); sd = np.array([-math.sin(th), math.cos(th)]); a0 = np.array(f['at'][:2], float)
                for sg, e in (((-1, ex / 2), (1, ex / 2)) if pr.get('extBoth') else ((pr.get('extSign', 1 if abs(sd[0]) > .5 and sd[0] * -1 > 0 else -1 if abs(sd[0]) > .5 else 1), ex),)):
                    u = sd * sg; n_ = np.array([-u[1], u[0]]); p0 = a0 + u * pr['w'] / 2; p1 = p0 + u * e
                    poly(Polygon([p0 - n_ * pr['d'] / 2, p1 - n_ * pr['d'] / 2, p1 + n_ * pr['d'] / 2, p0 + n_ * pr['d'] / 2]), 'none', .7, '4 3', '#555')
                    c0 = p1 + u * .9
                    if not pr.get('extNoChair'): poly(Polygon([c0 - u * .75 - n_ * .75, c0 + u * .75 - n_ * .75, c0 + u * .75 + n_ * .75, c0 - u * .75 + n_ * .75]).buffer(-.12).buffer(.12), 'none', .6, '3 2', '#777')
            if k == 'pianoUpright':
                th = math.radians(f.get('rot') or 0); fwd = np.array([math.cos(th), math.sin(th)]); side = np.array([-fwd[1], fwd[0]]); a0 = np.array(f['at'][:2], float)
                poly(Polygon([a0 - side * (w_ / 2 - .2) + fwd * 1.3, a0 + side * (w_ / 2 - .2) + fwd * 1.3, a0 + side * (w_ / 2 - .2) + fwd * (d_ - .08), a0 - side * (w_ / 2 - .2) + fwd * (d_ - .08)]), '#fff', .5, '', '#444')
                text(tuple(a0 + fwd * .65), 'PIANO', 6.5)
            continue
        if f['render'].get('lib') == 'STAGE' and k not in ('windowSeat',): continue
        g = foot(f); c = g.centroid
        if k == 'upperCabinet': poly(g, 'none', .6, '4 2', '#555'); continue
        if k == 'hoodChimney': continue
        if k == 'sinkUndermount':
            poly(g.buffer(-.12, join_style=1), '#fff', .8); continue
        if k in ('baseCabinet', 'tallCabinet', 'dishwasher', 'beverageCooler'):
            poly(g, 'none' if k == 'baseCabinet' else '#fff', .6 if k == 'baseCabinet' else .8)
            if k == 'tallCabinet': text((c.x, c.y), 'PAN', 6.5)
            if k == 'dishwasher': text((c.x, c.y), 'DW', 6.5)
            continue
        if k in ('fridge4Door',): poly(g, '#fff', 1.0); text((c.x, c.y), 'REF', 7); continue
        if k in ('rangeSlideIn30', 'range36'):
            poly(g, '#fff', 1.0); minx, miny, maxx, maxy = g.bounds
            for fx_ in (.3, .7):
                for fy_ in (.3, .7):
                    x, y = P(minx + (maxx - minx) * fx_, miny + (maxy - miny) * fy_); A('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="#333" stroke-width=".6"/>' % (x, y, .28 * S))
            continue
        if k == 'island':
            poly(g, '#f4f4f4', 1.0); text((c.x, c.y), 'ISLAND', 7.5)
            if pr.get('sink') and pr.get('sinkEnd'):             # the prep sink in its end cabinet (rot 180: the -x end is north)
                sy = f['at'][1] - pr['sinkEnd'] * (pr['w'] / 2 - pr.get('sinkInset', 1.27)) * (1 if (f.get('rot') or 0) == 180 else -1); poly(sbox(f['at'][0] - 1.78, sy - .8, f['at'][0] - .48, sy + .8).buffer(-.1, join_style=1), '#fff', .8)
            continue
        if k == 'builtinBookcase': poly(g, '#fff', .8); g2 = g.buffer(-.15); poly(g2, 'none', .4, '', '#777'); continue
        if k == 'windowSeat': poly(g, '#fff', .9); text((c.x, c.y), 'WINDOW SEAT', 7); continue
        if k == 'vanity': poly(g, '#fff', .8); x, y = P(c.x + .1, c.y); A('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="none" stroke="#333" stroke-width=".6"/>' % (x, y, .45 * S, .6 * S)); continue
        if k == 'toilet':
            minx, miny, maxx, maxy = g.bounds; poly(sbox(minx, miny + .2, minx + .7, maxy - .2), '#fff', .8)
            x, y = P((minx + .7 + maxx) / 2, (miny + maxy) / 2); A('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#fff" stroke="#333" stroke-width=".8"/>' % (x, y, (maxx - minx - .7) / 2 * S, .55 * S)); continue
        if k == 'tubAlcove': poly(g, '#fff', .9); poly(g.buffer(-.3, join_style=1), 'none', .6); continue
        if k == 'washerFront': poly(g, '#fff', .8); continue
        poly(g, 'none', .5)
    # island stools (room side)
    for f in F:
        if f['render']['kind'] == 'counterStoolRope' and v != 'asbuilt':
            x, y = P(f['at'][0] + .0, f['at'][1]); A('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#fff" stroke="#555" stroke-width=".6"/>' % (x, y, .6 * S))
    # fireplace (from the option's glb element: its footprint inside the room) and the ridge beam's west post
    for fn in EXTRA: A(fn(P))                                # sketch overlays (concept studies)
    if v == 'open4k' and SHOW_FP:
        fp = K4.FP; fy0, fy1 = fp['cy'] - fp['w'] / 2, fp['cy'] + fp['w'] / 2          # r44: the hearth on the street gable, no post
        poly(sbox(B4.X_E - fp['d'], fy0, B4.X_E, fy1), '#e9e9e9', 1.0)
        poly(sbox(B4.X_E - .55, fp['cy'] - fp['box'][0] / 2, B4.X_E - .15, fp['cy'] + fp['box'][0] / 2), '#555', .6)
        poly(sbox(B4.X_E - fp['d'] - 1.2, fy0 - .25, B4.X_E - fp['d'], fy1 + .25), 'none', .6, '3 2')
        text((B4.X_E - fp['d'] - 2.6, fp['cy'] + 3.6), 'GAS FIRE', 6.5)
    return out
B4_FP = dict(cx=19.3, w=6.0, d=1.2)
SHOW_FP = True; EXTRA = []; SKY = None
# loose furniture shown on a concept plan: kind -> (width, depth, outline)
LOOSE = {'rug2': (8.0, 10.0, 'rect'), 'sofa3': (7.5, 3.2, 'soft'), 'armchairBoucle': (2.8, 2.7, 'soft'), 'diningTableGlass': (7.0, 3.4, 'rect'), 'diningTable': (7.0, 3.5, 'rect'), 'sideboard': (4.0, 1.6, 'rect'), 'parsonsChair': (1.5, 1.7, 'soft'), 'ottomanRound': (2.6, 2.6, 'round'),
         'drumTable': (1.4, 1.4, 'round'), 'pianoUpright': (4.95, 2.05, 'rect'), 'pianoBench': (2.6, 1.15, 'rect'), 'outdoorDiningTable': (7.0, 3.4, 'rect'), 'outdoorChair': (1.8, 1.9, 'soft'),
         'outdoorLounge': (2.6, 2.8, 'soft'), 'outdoorCoffee': (2.6, 1.6, 'rect')}

def dim_h(A, x0, x1, y, txt, small=False):
    a, b = P(x0, y), P(x1, y); sw = .6
    A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#111" stroke-width="%s"/>' % (a[0], a[1], b[0], b[1], sw))
    for p in (a, b): A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#111" stroke-width="1"/>' % (p[0] - 4, p[1] + 4, p[0] + 4, p[1] - 4))
    A('<text x="%.1f" y="%.1f" font-size="%s" fill="#111" text-anchor="middle">%s</text>' % ((a[0] + b[0]) / 2, a[1] - 4, 9 if small else 10.5, esc(txt)))
def dim_v(A, y0, y1, x, txt, small=False):
    a, b = P(x, y0), P(x, y1)
    A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#111" stroke-width=".6"/>' % (a[0], a[1], b[0], b[1]))
    for p in (a, b): A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#111" stroke-width="1"/>' % (p[0] - 4, p[1] + 4, p[0] + 4, p[1] - 4))
    cx, cy = a[0] + 4, (a[1] + b[1]) / 2
    A('<text x="%.1f" y="%.1f" font-size="%s" fill="#111" text-anchor="middle" transform="rotate(-90 %.1f %.1f)">%s</text>' % (cx + 8, cy, 9 if small else 10.5, cx + 8, cy, esc(txt)))
def north(A, x, y):
    A('<g transform="translate(%d %d)"><circle r="16" fill="none" stroke="#111" stroke-width="1"/><path d="M0 -14 L6 8 L0 4 L-6 8 Z" fill="#111"/>'
      '<text y="-20" font-size="11" font-weight="700" text-anchor="middle" fill="#111">N</text></g>' % (x, y))
def scale_bar(A, x, y):
    for i, (a, b) in enumerate([(0, 4), (4, 8), (8, 16)]):
        A('<rect x="%.1f" y="%d" width="%.1f" height="6" fill="%s" stroke="#111" stroke-width=".8"/>' % (x + a * S, y, (b - a) * S, '#111' if i % 2 == 0 else '#fff'))
    for v in (0, 4, 8, 16): A('<text x="%.1f" y="%d" font-size="9" text-anchor="middle" fill="#111">%d</text>' % (x + v * S, y + 18, v))
    A('<text x="%.1f" y="%d" font-size="9" fill="#111">FEET (approximate)</text>' % (x + 16 * S + 10, y + 7))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    jobs = [('asbuilt', 'Main level, as built', 'The house: 6 bedrooms, 3 baths, plus office · main level shown, as it is today'),
            ('open4k', 'Main level, "Open kitchen and great room"', 'The house: 4 bedrooms, 3 baths, plus office · main level shown: hearth at the street end, L-shaped kitchen at the west end, one vault under a clear-span beam')]
    for v, t, st in jobs:
        name = 'plan-%s.svg' % ('open4k-v2' if v == 'open4k' else v)
        s = plan(v, t, st.replace('&#183;', '·')); open(OUT + name, 'w').write(s); print('wrote', OUT + name, len(s))
