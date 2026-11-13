"""Free-rein main-level sketch plans for 118 Hillside (design sketches only; nothing here touches the 3D model).
A small plan renderer in the style of tools/plan_svg.py: black poche walls from the model's own exterior shell, new partitions,
and furniture drawn at true size. Coordinates are the model's plan frame in feet (x east toward the street, y north)."""
import json, math, os
from shapely.geometry import Polygon, Point, box
from shapely.ops import unary_union
from shapely import affinity

B2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..') + '/'
BASE = json.load(open(B2 + 'scene.meta.json'))
K4 = json.load(open(B2 + 'scene.opt-OS-REMODEL-open4k.meta.json'))
LABEL = 'Illustrative idea. Not designed or reviewed by an architect or engineer. Not to scale; verify all dimensions.'

S = 22.0
X0, X1, Y0, Y1 = -14.5, 41.5, -13.0, 35.5
M_L, M_T = 60, 120
W = int((X1 - X0) * S + 2 * M_L); H = int((Y1 - Y0) * S + M_T + 130)
def P(x, y): return ((x - X0) * S + M_L, (Y1 - y) * S + M_T)
def pts(c): return ' '.join('%.1f,%.1f' % P(x, y) for x, y in c)
def path_of(g):
    out = []
    polys = [g] if g.geom_type == 'Polygon' else list(getattr(g, 'geoms', []))
    for p in polys:
        if p.is_empty or p.geom_type != 'Polygon': continue
        for ring in [p.exterior] + list(p.interiors):
            out.append('M' + ' L'.join('%.1f %.1f' % P(x, y) for x, y in ring.coords) + 'Z')
    return ' '.join(out)
def ftin(v):
    t = round(v * 12); f, i = divmod(t, 12); return "%d'-%d\"" % (f, i)
def esc(s): return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

# ---- the old house: fixed shell and the free interior
RX0, RX1, RY0, RY1 = 5.28, 36.59, 4.81, 32.09          # the original gable box (interior faces)
RIDGE = 18.45
FREE = unary_union([box(-9.53, -0.75, 4.9, 14.32),                    # old living room
                    box(-6.53, 14.32, 5.3, 26.67), box(-9.53, 14.32, -6.53, 18.42),   # back-bedroom wing and laundry closet
                    box(5.225, 4.81, 36.585, 32.09), box(4.9, 4.81, 5.3, 26.67)])     # the gable box and the wall to the living room
T = 0.38                                                                # partition thickness

def shell(D):
    """walls cut at 4 ft, as plan_svg does it"""
    sp = [s for s in D['spaces'] if s.get('storey') == 'L1' and s.get('polygon')]
    zone = unary_union([Polygon(s['polygon']).buffer(0) for s in sp]).buffer(0.9)
    walls = []
    for c in D['colliders']:
        if c['kind'] != 'WALL' or not c['element'].startswith('W-'): continue
        if not (c['z0'] <= 0.5 and c['z1'] >= 4): continue
        g = Polygon(c['poly']).buffer(0)
        if c.get('storey') != 'L1' and not g.intersects(zone): continue
        if c.get('storey') != 'L1' and g.intersection(zone).area < 0.5 * g.area: continue
        walls.append(g)
    return unary_union(walls).buffer(0.01).buffer(-0.01), zone

class Plan:
    def __init__(self, title, sub, deck='k4', base=None, drop=(), label=LABEL):
        self.title, self.sub, self.label = title, sub, label
        self.D = base or BASE
        self.own = base is None                     # a free-rein concept (shell from the house, partitions drawn here)
        self.deck = deck
        self.walls = []; self.cuts = []; self.under = []; self.items = []; self.over = []; self.txt = []
        self.reg = []                               # (name, geom, wall_ok) for the clearance check
        self.drop = set(drop); self.xops = []       # base openings dropped / exterior openings added
        self.rooms = []
    # ---------- construction
    def wall(self, x0, y0, x1, y1, t=T):
        if abs(x1 - x0) < 1e-6: g = box(x0 - t / 2, min(y0, y1), x0 + t / 2, max(y0, y1))
        elif abs(y1 - y0) < 1e-6: g = box(min(x0, x1), y0 - t / 2, max(x0, x1), y0 + t / 2)
        else: g = box(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
        self.walls.append(g); return g
    def L(self, a, b, sw=.8, col='#111', dash='', layer=None):
        (layer if layer is not None else self.items).append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%s"%s/>' % (*P(*a), *P(*b), col, sw, (' stroke-dasharray="%s"' % dash) if dash else ''))
    def poly(self, g, fill='#fff', sw=.7, col='#333', dash='', layer=None, op=None):
        (layer if layer is not None else self.items).append('<path d="%s" fill="%s" stroke="%s" stroke-width="%s"%s%s/>' % (path_of(g), fill, col, sw, (' stroke-dasharray="%s"' % dash) if dash else '', (' fill-opacity="%s"' % op) if op else ''))
    def circ(self, x, y, r, fill='#fff', sw=.7, col='#333', layer=None):
        px, py = P(x, y); (layer if layer is not None else self.items).append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" stroke="%s" stroke-width="%s"/>' % (px, py, r * S, fill, col, sw))
    def text(self, x, y, s, size=7.5, col='#333', bold=False, anchor='middle', rot=0, ls=.3):
        px, py = P(x, y)
        tr = ' transform="rotate(%d %.1f %.1f)"' % (rot, px, py) if rot else ''
        self.txt.append('<text x="%.1f" y="%.1f" font-size="%s" fill="%s" text-anchor="%s" letter-spacing="%s"%s%s>%s</text>' % (px, py + size / 3, size, col, anchor, ls, ' font-weight="600"' if bold else '', tr, esc(s)))
    def room(self, x, y, name, sf=None, small=False):
        lines = name.split('|')
        px, py = P(x, y)
        if small:
            self.txt.append('<text x="%.1f" y="%.1f" font-size="8.5" fill="#333" text-anchor="middle" letter-spacing=".4">%s</text>' % (px, py + 3, esc(name))); return
        for i, ln in enumerate(lines):
            self.txt.append('<text x="%.1f" y="%.1f" font-size="11" font-weight="600" fill="#111" text-anchor="middle" letter-spacing=".6">%s</text>' % (px, py + i * 13, esc(ln)))
        if sf: self.txt.append('<text x="%.1f" y="%.1f" font-size="9.5" fill="#333" text-anchor="middle">%s</text>' % (px, py + len(lines) * 13, esc(sf if isinstance(sf, str) else '%d SF' % (round(sf / 5) * 5))))
    def note(self, x, y, s, size=8.5): self.text(x, y, s, size, '#333', True, ls=.5)
    def dim(self, x0, y0, x1, y1, txt=None, side=1, col='#666'):
        """a light clearance dimension between two points (axis-aligned)"""
        d = math.hypot(x1 - x0, y1 - y0); txt = txt or ftin(d)
        self.L((x0, y0), (x1, y1), .5, col, layer=self.over)
        vert = abs(x1 - x0) < 1e-6
        for (x, y) in ((x0, y0), (x1, y1)):
            a, b = P(x, y); self.over.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width=".8"/>' % (a - 3, b + 3, a + 3, b - 3, col))
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        px, py = P(mx, my)
        if vert:
            px += -5 * side
            self.over.append('<text x="%.1f" y="%.1f" font-size="7.5" fill="#444" text-anchor="middle" transform="rotate(-90 %.1f %.1f)" paint-order="stroke" stroke="#fff" stroke-width="2.5">%s</text>' % (px, py, px, py, esc(txt)))
        else:
            self.over.append('<text x="%.1f" y="%.1f" font-size="7.5" fill="#444" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="2.5">%s</text>' % (px, py - 4 * side + (7 if side < 0 else 0), esc(txt)))
    def way(self, coords):
        """the way in from the entry: a light dotted line with an arrow head"""
        self.over.append('<polyline points="%s" fill="none" stroke="#888" stroke-width="1.1" stroke-dasharray="1.5 4" stroke-linecap="round"/>' % pts(coords))
        (ax, ay), (bx, by) = coords[-2], coords[-1]; th = math.atan2(by - ay, bx - ax)
        tip = [(bx, by), (bx - .7 * math.cos(th - .4), by - .7 * math.sin(th - .4)), (bx - .7 * math.cos(th + .4), by - .7 * math.sin(th + .4))]
        self.over.append('<polygon points="%s" fill="#888"/>' % pts(tip))
    # ---------- openings
    def door(self, cx, cy, w=2.67, o='h', hinge='lo', swing=1, kind='swing', t=T):
        """o='h': the wall runs east-west. hinge 'lo'/'hi' = the west/south or east/north jamb. swing +1 = toward north/east."""
        if o == 'h': a, b = (cx - w / 2, cy), (cx + w / 2, cy); n = (0, 1); self.cuts.append(box(a[0], cy - t / 2 - .15, b[0], cy + t / 2 + .15))
        else: a, b = (cx, cy - w / 2), (cx, cy + w / 2); n = (1, 0); self.cuts.append(box(cx - t / 2 - .15, a[1], cx + t / 2 + .15, b[1]))
        for p in (a, b): self.L((p[0] - n[0] * t / 2, p[1] - n[1] * t / 2), (p[0] + n[0] * t / 2, p[1] + n[1] * t / 2), .9, layer=self.over)
        if kind == 'cased': return
        if kind == 'pocket':
            h, e = (a, b) if hinge == 'lo' else (b, a); ux, uy = (e[0] - h[0]) / w, (e[1] - h[1]) / w
            self.L(h, (h[0] + ux * w * .45, h[1] + uy * w * .45), 1.6, layer=self.over); self.L((h[0] - ux * w * .55, h[1] - uy * w * .55), h, .8, '#fff', '3 2', layer=self.over); return
        if kind in ('slide', 'bifold'):
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); k = .08 * swing
            self.L((a[0] + n[0] * k, a[1] + n[1] * k), (m[0] + n[0] * k + (b[0] - a[0]) * .04, m[1] + n[1] * k + (b[1] - a[1]) * .04), 1.3, layer=self.over)
            self.L((m[0] - n[0] * k - (b[0] - a[0]) * .04, m[1] - n[1] * k - (b[1] - a[1]) * .04), (b[0] - n[0] * k, b[1] - n[1] * k), 1.3, layer=self.over); return
        h, e = (a, b) if hinge == 'lo' else (b, a)
        tip = (h[0] + n[0] * swing * w, h[1] + n[1] * swing * w)
        self.L(h, tip, 1.3, layer=self.over)
        p1, p2 = P(*e), P(*tip)
        cr = (e[0] - h[0]) * (tip[1] - h[1]) - (e[1] - h[1]) * (tip[0] - h[0])
        self.over.append('<path d="M%.1f %.1f A%.1f %.1f 0 0 %d %.1f %.1f" fill="none" stroke="#111" stroke-width=".6"/>' % (*p1, w * S, w * S, 0 if cr > 0 else 1, *p2))
        self.reg.append(('door swing', Polygon([h, e, tip]).buffer(0), True))
    def gap(self, x0, y0, x1, y1):
        """a plain opening cut through walls (new or fixed)"""
        self.cuts.append(box(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)))
    def win(self, c, w, o, wall_c, t=.41):
        """a new window in an exterior wall. o='h': wall runs east-west at y=wall_c, window centred at x=c"""
        self.xops.append(('win', c, w, o, wall_c, t))
    def fold(self, x0, x1, y=4.6, stack='east', panels=6):
        self.xops.append(('fold', x0, x1, y, stack, panels))
    def slider(self, x0, x1, y=4.6):
        self.xops.append(('slider', x0, x1, y))
    def infill(self, x0, y0, x1, y1):
        """close an existing exterior opening"""
        self.walls.append(box(x0, y0, x1, y1))
    # ---------- placing things: a local frame (a across, b from the back to the front); rot = the way it faces, degrees from east
    def fr(self, cx, cy, rot, w, d):
        r = math.radians(rot); u = (math.cos(r), math.sin(r)); v = (-u[1], u[0])
        ox, oy = cx - v[0] * w / 2 - u[0] * d / 2, cy - v[1] * w / 2 - u[1] * d / 2
        def pt(a, b): return (ox + v[0] * a + u[0] * b, oy + v[1] * a + u[1] * b)
        def rect(a0, b0, a1, b1, rnd=0):
            g = Polygon([pt(a0, b0), pt(a1, b0), pt(a1, b1), pt(a0, b1)])
            return g.buffer(-rnd).buffer(rnd) if rnd else g
        return pt, rect
    def add(self, name, g, wall_ok=False): self.reg.append((name, g, wall_ok))
    # ---------- furniture (light line, true size)
    FC = '#555'
    def sofa(self, cx, cy, rot, w=7.5, d=3.2, seats=3, name='sofa', wall_ok=False):
        pt, r = self.fr(cx, cy, rot, w, d); self.add(name, r(0, 0, w, d), wall_ok)
        self.poly(r(0, 0, w, d, .25), '#fff', .8, self.FC)
        self.poly(r(.12, .12, w - .12, .75, .1), '#fff', .5, self.FC)                    # back
        for a0 in (.12, w - .62): self.poly(r(a0, .75, a0 + .5, d - .15, .1), '#fff', .5, self.FC)   # arms
        sw_ = (w - 1.24) / seats
        for i in range(seats): self.poly(r(.62 + i * sw_, .75, .62 + (i + 1) * sw_, d - .12, .12), '#fff', .5, self.FC)
    def sectional(self, cx, cy, rot, w=10.0, d=7.5, side='L', sd=3.2, name='sectional', wall_ok=False):
        """an L: the main run is w long across the back; the return comes forward at the left ('L') or right end, d deep in all"""
        pt, r = self.fr(cx, cy, rot, w, d)
        a0, a1 = (0, sd) if side == 'L' else (w - sd, w)
        g = unary_union([r(0, 0, w, sd), r(a0, 0, a1, d)]); self.add(name, g, wall_ok)
        self.poly(g.buffer(-.25).buffer(.25), '#fff', .8, self.FC)
        self.poly(r(.12, .12, w - .12, .75, .1), '#fff', .5, self.FC)                    # back of the main run
        if side == 'L': self.poly(r(.12, .75, .75, d - .12, .1), '#fff', .5, self.FC); self.poly(r(w - .62, .75, w - .12, sd - .15, .1), '#fff', .5, self.FC)
        else: self.poly(r(w - .75, .75, w - .12, d - .12, .1), '#fff', .5, self.FC); self.poly(r(.12, .75, .62, sd - .15, .1), '#fff', .5, self.FC)
        # seat cushions: main run, then the return
        m0, m1 = (sd, w - .62) if side == 'L' else (.62, w - sd)
        n = max(1, round((m1 - m0) / 2.4)); cw = (m1 - m0) / n
        for i in range(n): self.poly(r(m0 + i * cw, .75, m0 + (i + 1) * cw, sd - .12, .12), '#fff', .5, self.FC)
        c0, c1 = (.75, sd) if side == 'L' else (w - sd, w - .75)
        self.poly(r(c0, .75, c1, sd - .12 + .12, .12), '#fff', .5, self.FC)              # corner seat
        n2 = max(1, round((d - sd) / 2.6)); ch = (d - sd - .12) / n2
        for i in range(n2): self.poly(r(c0, sd + i * ch, c1, sd + (i + 1) * ch, .12), '#fff', .5, self.FC)
    def chair(self, cx, cy, rot, w=2.7, d=2.7, name='armchair', wall_ok=False):
        pt, r = self.fr(cx, cy, rot, w, d); self.add(name, r(0, 0, w, d), wall_ok)
        self.poly(r(0, 0, w, d, .3), '#fff', .8, self.FC); self.poly(r(.1, .1, w - .1, .6, .1), '#fff', .5, self.FC)
        for a0 in (.1, w - .5): self.poly(r(a0, .6, a0 + .4, d - .15, .1), '#fff', .5, self.FC)
        self.poly(r(.5, .6, w - .5, d - .1, .15), '#fff', .5, self.FC)
    def table(self, x0, y0, x1, y1, name='table', wall_ok=False, sw=.8, lab=None):
        g = box(x0, y0, x1, y1); self.add(name, g, wall_ok); self.poly(g, '#fff', sw, self.FC)
        if lab: self.text((x0 + x1) / 2, (y0 + y1) / 2, lab, 6.5)
    def rtable(self, x, y, dia, name='round table', wall_ok=False):
        self.add(name, Point(x, y).buffer(dia / 2), wall_ok); self.circ(x, y, dia / 2, '#fff', .8, self.FC)
    def rug(self, x0, y0, x1, y1):
        self.poly(box(x0, y0, x1, y1), '#f6f6f4', .6, '#999', layer=self.under); self.poly(box(x0 + .25, y0 + .25, x1 - .25, y1 - .25), 'none', .4, '#aaa', '2 2', layer=self.under)
    def dchair(self, cx, cy, rot, name='dining chair'):
        pt, r = self.fr(cx, cy, rot, 1.5, 1.6); self.add(name, r(0, 0, 1.5, 1.6), True)
        self.poly(r(0, 0, 1.5, 1.6, .2), '#fff', .6, self.FC); self.poly(r(.1, .08, 1.4, .4, .08), '#fff', .45, self.FC)
    def dining(self, cx, cy, o='h', L=8.0, Wd=3.5, n=3, ends=True, leaf=None, leaf_dir=0, name='dining table'):
        """o='h': the long side runs east-west. chairs stand 1.6 ft deep, pulled to the table edge. leaf_dir: -1/+1 = which end the leaf goes in at, 0 = both"""
        hx, hy = (L / 2, Wd / 2) if o == 'h' else (Wd / 2, L / 2)
        if leaf:
            ex = leaf - L
            for sg in ((-1, 1) if leaf_dir == 0 else (leaf_dir,)):
                e = ex / 2 if leaf_dir == 0 else ex
                if o == 'h': g = box(cx + sg * hx, cy - hy, cx + sg * (hx + e), cy + hy) if sg > 0 else box(cx - hx - e, cy - hy, cx - hx, cy + hy); cc = (cx + sg * (hx + e + .9), cy); rr = 180 if sg > 0 else 0
                else: g = box(cx - hx, cy + sg * hy, cx + hx, cy + sg * (hy + e)) if sg > 0 else box(cx - hx, cy - hy - e, cx + hx, cy - hy); cc = (cx, cy + sg * (hy + e + .9)); rr = 270 if sg > 0 else 90
                self.poly(g, 'none', .7, '#555', '4 3')
                if ends:
                    pt, r = self.fr(cc[0], cc[1], rr, 1.5, 1.6); self.poly(r(0, 0, 1.5, 1.6, .2), 'none', .6, '#777', '3 2')
        g = box(cx - hx, cy - hy, cx + hx, cy + hy); self.add(name, g.buffer(1.6) if False else g, True)
        step = L / n
        for i in range(n):
            k = -L / 2 + step * (i + .5)
            if o == 'h': self.dchair(cx + k, cy + hy + .7, 270); self.dchair(cx + k, cy - hy - .7, 90)
            else: self.dchair(cx + hx + .7, cy + k, 180); self.dchair(cx - hx - .7, cy + k, 0)
        if ends:
            if o == 'h': self.dchair(cx + hx + .7, cy, 180); self.dchair(cx - hx - .7, cy, 0)
            else: self.dchair(cx, cy + hy + .7, 270); self.dchair(cx, cy - hy - .7, 90)
        self.poly(g, '#fff', .9, '#333')
    def rdining(self, cx, cy, dia=6.0, n=8, name='round dining table'):
        for i in range(n):
            a = 2 * math.pi * i / n + math.pi / n; r_ = dia / 2 + .7
            self.dchair(cx + r_ * math.cos(a), cy + r_ * math.sin(a), math.degrees(a) + 180)
        self.add(name, Point(cx, cy).buffer(dia / 2), True); self.circ(cx, cy, dia / 2, '#fff', .9, '#333')
    def bed(self, cx, cy, rot, size='queen', stands=2, name='bed'):
        """rot = the way the foot points. cx, cy = the centre of the mattress and headboard footprint"""
        w, d = {'queen': (5.0, 6.9), 'king': (6.33, 6.9), 'full': (4.5, 6.5), 'twin': (3.25, 6.5)}[size]
        pt, r = self.fr(cx, cy, rot, w, d); self.add(name, r(0, 0, w, d), True)
        self.poly(r(0, 0, w, d), '#fff', .8, self.FC); self.poly(r(0, 0, w, .25), '#ddd', .6, self.FC)
        pw = (w - .6) / 2 if size not in ('twin',) else w - .5
        for i in range(1 if size == 'twin' else 2): self.poly(r(.2 + i * (pw + .2), .45, .2 + i * (pw + .2) + pw, 1.95, .15), '#fff', .5, self.FC)
        self.L(pt(0, 2.5), pt(w, 2.5), .5, self.FC); self.L(pt(0, 2.9), pt(w, 2.9), .4, '#999')
        for i in range(stands):
            a0 = -1.85 if i == 0 else w + .15
            g = r(a0, 0, a0 + 1.7, 1.5); self.add('nightstand', g, True); self.poly(g, '#fff', .6, self.FC)
    def closet(self, x0, y0, x1, y1, lab='CL'):
        if (x1 - x0) > (y1 - y0): self.L((x0 + .2, (y0 + y1) / 2), (x1 - .2, (y0 + y1) / 2), .5, '#777', '6 3')
        else: self.L(((x0 + x1) / 2, y0 + .2), ((x0 + x1) / 2, y1 - .2), .5, '#777', '6 3')
        if lab: self.room((x0 + x1) / 2, (y0 + y1) / 2 - .5, lab, small=True)
    def shelves(self, x0, y0, x1, y1, name='bookshelves'):
        g = box(x0, y0, x1, y1); self.add(name, g, True); self.poly(g, '#fff', .8, '#333')
        n = max(1, round(max(x1 - x0, y1 - y0) / 2.6))
        for i in range(n):
            if (x1 - x0) > (y1 - y0): a = x0 + (x1 - x0) * i / n; b = x0 + (x1 - x0) * (i + 1) / n; self.L((a, y0), (b, y1), .4, '#888'); self.L((b, y0), (b, y1), .4, '#888')
            else: a = y0 + (y1 - y0) * i / n; b = y0 + (y1 - y0) * (i + 1) / n; self.L((x0, a), (x1, b), .4, '#888'); self.L((x0, b), (x1, b), .4, '#888')
    def builtin(self, x0, y0, x1, y1, lab=None, name='built-in', size=6.5):
        g = box(x0, y0, x1, y1); self.add(name, g, True); self.poly(g, '#fff', .8, '#333')
        if lab: self.text((x0 + x1) / 2, (y0 + y1) / 2, lab, size)
    def fireplace(self, cx, cy, rot, w=6.0, d=1.0, fb=4.0, lab=True, tv=False):
        """cx, cy = centre of the chimney breast; rot = the way the fire faces"""
        pt, r = self.fr(cx, cy, rot, w, d); self.add('fireplace', r(0, 0, w, d), True)
        self.poly(r(0, 0, w, d), '#e6e6e6', .9, '#222'); self.poly(r((w - fb) / 2, d - .5, (w + fb) / 2, d - .12), '#555', .5, '#222')
        self.poly(r(-.3, d, w + .3, d + 1.2), 'none', .6, '#555', '3 2')
        if tv: self.poly(r((w - 4.6) / 2, .12, (w + 4.6) / 2, .3), '#111', .4, '#111')
        if lab: x, y = pt(w / 2, d + .65); self.text(x, y, 'GAS FIRE', 6, rot=0 if abs(math.sin(math.radians(rot))) > .5 else -90)
    def tv(self, cx, cy, rot, w=7.0, d=1.5, name='media console'):
        pt, r = self.fr(cx, cy, rot, w, d); self.add(name, r(0, 0, w, d), True)
        self.poly(r(0, 0, w, d), '#fff', .8, '#333'); self.poly(r((w - 4.8) / 2, .1, (w + 4.8) / 2, .28), '#111', .4, '#111')
    def piano(self, cx, cy, rot):
        pt, r = self.fr(cx, cy, rot, 4.95, 2.05); self.add('piano', r(0, 0, 4.95, 2.05), True)
        self.poly(r(0, 0, 4.95, 2.05), '#fff', .9, '#222'); self.poly(r(.2, 1.3, 4.75, 1.97), '#fff', .5, '#444')
        x, y = pt(2.475, .65); self.text(x, y, 'PIANO', 6.5)
        g = r(1.2, 2.6, 3.75, 3.75); self.add('piano bench', g, True); self.poly(g, '#fff', .6, self.FC)
    def desk(self, cx, cy, rot, w=4.5, d=2.0):
        pt, r = self.fr(cx, cy, rot, w, d); self.add('desk', r(0, 0, w, d), True); self.poly(r(0, 0, w, d), '#fff', .8, self.FC)
        g = r(w / 2 - .9, d + .3, w / 2 + .9, d + 2.0, .3); self.add('desk chair', g, True); self.poly(g, '#fff', .6, self.FC)
    # ---------- kitchen
    def counter(self, x0, y0, x1, y1, name='counter'):
        g = box(x0, y0, x1, y1); self.add(name, g, True); self.poly(g, '#f4f4f4', .9, '#222'); return g
    def app(self, x0, y0, x1, y1, lab, name=None, fill='#fff'):
        g = box(x0, y0, x1, y1); self.add(name or lab, g, True); self.poly(g, fill, 1.0, '#222'); self.text((x0 + x1) / 2, (y0 + y1) / 2, lab, 6.5)
    def tall(self, x0, y0, x1, y1, lab='PAN'):
        g = box(x0, y0, x1, y1); self.add('tall cabinet', g, True); self.poly(g, '#fff', .9, '#222'); self.L((x0, y0), (x1, y1), .4, '#999'); self.text((x0 + x1) / 2, (y0 + y1) / 2, lab, 6.5)
    def range_(self, x0, y0, x1, y1):
        g = box(x0, y0, x1, y1); self.add('range', g, True); self.poly(g, '#fff', 1.0, '#222')
        for fx in (.28, .72):
            for fy in (.28, .72): self.circ(x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy, .27, 'none', .6, '#333')
    def sink(self, x0, y0, x1, y1, double=False):
        g = box(x0, y0, x1, y1).buffer(-.1, join_style=1); self.poly(g, '#fff', .8, '#222')
        if double:
            if (x1 - x0) > (y1 - y0): self.L(((x0 + x1) / 2, y0 + .1), ((x0 + x1) / 2, y1 - .1), .6, '#222')
            else: self.L((x0 + .1, (y0 + y1) / 2), (x1 - .1, (y0 + y1) / 2), .6, '#222')
    def dw(self, x0, y0, x1, y1): self.poly(box(x0, y0, x1, y1), 'none', .6, '#555', '3 2'); self.text((x0 + x1) / 2, (y0 + y1) / 2, 'DW', 6)
    def uppers(self, x0, y0, x1, y1): self.poly(box(x0, y0, x1, y1), 'none', .6, '#555', '4 2', layer=self.over)
    def stools(self, pts_, name='stool'):
        for (x, y) in pts_: self.add(name, Point(x, y).buffer(.6), True); self.circ(x, y, .6, '#fff', .7, self.FC)
    # ---------- bath
    def toilet(self, cx, cy, rot):
        """cx, cy = centre of the back of the tank on the wall; rot = the way it faces"""
        r_ = math.radians(rot); u = (math.cos(r_), math.sin(r_))
        pt, r = self.fr(cx + u[0] * 1.2, cy + u[1] * 1.2, rot, 1.6, 2.4); self.add('toilet', r(0, 0, 1.6, 2.4), True)
        self.poly(r(0, 0, 1.6, .7), '#fff', .8, '#333')
        g = Point(0, 0).buffer(1); g = affinity.scale(g, .62, .85); c = pt(.8, 1.55); g = affinity.rotate(g, rot - 90, origin=(0, 0)); g = affinity.translate(g, c[0], c[1]); self.poly(g, '#fff', .8, '#333')
    def vanity(self, x0, y0, x1, y1, basins=1):
        g = box(x0, y0, x1, y1); self.add('vanity', g, True); self.poly(g, '#fff', .8, '#333')
        horiz = (x1 - x0) > (y1 - y0)
        for i in range(basins):
            f = (i + .5) / basins
            cx, cy = (x0 + (x1 - x0) * f, (y0 + y1) / 2) if horiz else ((x0 + x1) / 2, y0 + (y1 - y0) * f)
            px, py = P(cx, cy); self.items.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="none" stroke="#333" stroke-width=".6"/>' % (px, py, (.62 if horiz else .45) * S, (.45 if horiz else .62) * S))
    def tub(self, x0, y0, x1, y1):
        g = box(x0, y0, x1, y1); self.add('tub', g, True); self.poly(g, '#fff', .9, '#333'); self.poly(g.buffer(-.3, join_style=1), 'none', .6, '#333')
    def shower(self, x0, y0, x1, y1, glass=None):
        g = box(x0, y0, x1, y1); self.add('shower', g, True); self.poly(g, '#fafafa', .7, '#333'); self.L((x0, y0), (x1, y1), .4, '#aaa'); self.L((x0, y1), (x1, y0), .4, '#aaa')
        self.circ((x0 + x1) / 2, (y0 + y1) / 2, .15, '#fff', .5, '#555')
        if glass: self.L(glass[0], glass[1], 1.4, '#111')
        self.text((x0 + x1) / 2, (y0 + y1) / 2 - .55, 'SHOWER', 5.5)
    def wd(self, x0, y0, x1, y1, lab='W/D'):
        g = box(x0, y0, x1, y1); self.add('washer/dryer', g, True); self.poly(g, '#fff', .8, '#333'); self.circ((x0 + x1) / 2, (y0 + y1) / 2, min(x1 - x0, y1 - y0) * .3, 'none', .5, '#555'); self.text((x0 + x1) / 2, y0 - .0 + (y1 - y0) * .5, lab, 5.5)
    def ridge(self, x0, x1, posts=(), lab=True, y=RIDGE):
        for yy in (y - .3, y + .3): self.L((x0, yy), (x1, yy), .8, '#444', '10 4 2 4', layer=self.over)
        for (px, py) in posts: self.poly(box(px - .3, py - .3, px + .3, py + .3), '#111', .6, '#111', layer=self.over)
        if lab: self.text(x0 + .5 if isinstance(lab, bool) else lab, y - .85, 'RIDGE BEAM ABOVE', 6.5, '#444', anchor='start')
    # ---------- outdoor furniture on the deck
    def otable(self, cx, cy, o='h', L=7.0, Wd=3.3):
        hx, hy = (L / 2, Wd / 2) if o == 'h' else (Wd / 2, L / 2)
        for i in range(3):
            k = -L / 2 + L / 3 * (i + .5)
            for sg in (1, -1):
                g = box(cx + k - .8, cy + sg * (hy + .9) - .8, cx + k + .8, cy + sg * (hy + .9) + .8) if o == 'h' else box(cx + sg * (hx + .9) - .8, cy + k - .8, cx + sg * (hx + .9) + .8, cy + k + .8)
                self.poly(g.buffer(-.2).buffer(.2), '#fff', .6, '#777')
        self.poly(box(cx - hx, cy - hy, cx + hx, cy + hy), '#fff', .7, '#555')
    def olounge(self, cx, cy, rot):
        pt, r = self.fr(cx, cy, rot, 2.6, 2.8); self.poly(r(0, 0, 2.6, 2.8, .25), '#fff', .6, '#777'); self.poly(r(.1, .1, 2.5, .6, .1), '#fff', .45, '#777')

    # ---------- check
    def check(self, quiet=False):
        """overlaps, and loose furniture closer than 18 in to a wall"""
        wall = self.wallgeom()
        out = []
        loose = [(n, g) for (n, g, ok) in self.reg if not ok]
        every = [(n, g) for (n, g, ok) in self.reg if n != 'door swing']
        for i, (n, g) in enumerate(every):
            if g.intersects(wall) and g.intersection(wall).area > .02: out.append('IN WALL: %s at %s' % (n, [round(v, 1) for v in g.bounds]))
            for (m, h) in every[i + 1:]:
                if g.intersection(h).area > .05 and not ('dining chair' in (n, m) and ('table' in n + m)) and not ('counter' in (n, m) or 'island' in (n, m)): out.append('OVERLAP: %s / %s at %s' % (n, m, [round(v, 1) for v in g.intersection(h).bounds]))
        for (n, g) in loose:
            d = g.distance(wall)
            if d < 1.5: out.append('NEAR WALL %.2f ft: %s at %s' % (d, n, [round(v, 1) for v in g.bounds]))
        for (n, g, ok) in self.reg:
            if n == 'door swing':
                for (m, h) in every:
                    if g.intersection(h).area > .05: out.append('DOOR SWING hits %s at %s' % (m, [round(v, 1) for v in g.intersection(h).bounds]))
        if not quiet:
            for o in out: print('   ', o)
        return out
    def clear(self, a, b):
        ga = [g for (n, g, ok) in self.reg if n == a]; gb = [g for (n, g, ok) in self.reg if n == b]
        return min(x.distance(y) for x in ga for y in gb)
    def wallgeom(self):
        if self.own:
            w0, _ = shell(BASE); w = w0.difference(FREE)
            w = unary_union([w] + self.walls)
        else:
            w, _ = shell(self.D)
        return w
    # ---------- output
    def svg(self):
        D = self.D; A_ = []; A = A_.append
        wall = self.wallgeom()
        ops = []
        src = BASE if self.own else D
        _, zone = shell(src)
        for o in src['openings']:
            if not o.get('center') or o.get('kind') == 'SKYLIGHT' or o.get('skylight'): continue
            sill, head = o.get('sill', 0), o.get('head', 7)
            if o.get('storey') != 'L1' and not (-0.2 <= sill <= 0.3 and Point(o['center'][:2]).within(zone)): continue
            if sill > 4.2 or head < 4: continue
            if o['id'] in self.drop: continue
            if self.own and Point(o['center'][:2]).within(FREE.buffer(-.05)) and o['id'] != 'OP-L1-01': continue   # old interior doors
            ops.append(o)
        cuts = list(self.cuts)
        import numpy as np
        for o in ops:
            ax = np.array(o.get('axis') or [1, 0], float); ax /= np.linalg.norm(ax); nx = np.array([-ax[1], ax[0]])
            c = np.array(o['center'][:2], float); w = o['width'] / 2; t = (o.get('thickness') or .5) / 2 + .12
            cuts.append(Polygon([c - ax * w - nx * t, c + ax * w - nx * t, c + ax * w + nx * t, c - ax * w + nx * t]))
        for x in self.xops:
            if x[0] == 'win':
                _, c, w, o, wc, t = x; cuts.append(box(c - w / 2, wc - t / 2 - .12, c + w / 2, wc + t / 2 + .12) if o == 'h' else box(wc - t / 2 - .12, c - w / 2, wc + t / 2 + .12, c + w / 2))
            elif x[0] in ('fold', 'slider'): cuts.append(box(x[1], x[3] - .35, x[2], x[3] + .35) if x[0] == 'fold' else box(x[1], x[3] - .35, x[2], x[3] + .35))
        # infills come back after the cuts of dropped openings are gone (dropped openings are simply not cut)
        wall_cut = wall.difference(unary_union(cuts)) if cuts else wall
        A('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="Inter, Helvetica, Arial, sans-serif">' % (W, H, W, H))
        A('<rect width="100%" height="100%" fill="#fff"/>')
        cx0, cy0 = P(X0 + .3, Y1 - .6); cx1, cy1 = P(X1 - .3, Y0 + .4)
        A('<clipPath id="cut"><rect x="%.1f" y="%.1f" width="%.1f" height="%.1f"/></clipPath><g clip-path="url(#cut)">' % (cx0, cy0, cx1 - cx0, cy1 - cy0))
        A('<defs><pattern id="deck" width="%.1f" height="%.1f" patternUnits="userSpaceOnUse"><path d="M0 %.1f H%.1f" stroke="#9a9a9a" stroke-width=".5"/></pattern></defs>' % (S, S * .5, S * .5 - .3, S))
        # decks, steps, rails
        E = K4 if self.deck == 'k4' else BASE
        decks = [Polygon(w['poly']).buffer(0) for w in E['walkable'] if w.get('kind') == 'DECK' and w.get('storey') == 'L1']
        if isinstance(self.deck, tuple): decks.append(box(15.4, self.deck[1], self.deck[0], 4.4)); decks.append(box(5.32, 3.9, self.deck[0], 4.4))
        for w in E['walkable']:
            if (w.get('element') or '') in ('SL-DK-LAND',): decks.append(Polygon(w['poly']).buffer(0))
        dk = unary_union(decks).difference(wall.buffer(.02))
        A('<path d="%s" fill="url(#deck)" stroke="#333" stroke-width="1"/>' % path_of(dk))
        for w in E['walkable']:
            el = w.get('element') or ''
            if w.get('kind') == 'TREAD' and any(el.startswith(p) for p in ('ST-FRONT', 'ST-REAR', 'ST-UP', 'ST-DN')):
                pl = w['poly']
                if isinstance(self.deck, tuple) and el.startswith('ST-FRONT'): pl = [(x, min(y, self.deck[1])) for (x, y) in [(q[0], q[1]) for q in pl]]
                A('<polygon points="%s" fill="#fff" stroke="#333" stroke-width=".8"%s/>' % (pts([(q[0], q[1]) for q in pl]), ' stroke-dasharray="3 2"' if el.startswith('ST-DN') else ''))
        for c in E['colliders']:
            if c['kind'] == 'RAIL':
                if isinstance(self.deck, tuple) and c.get('element', '').startswith('RL-FRONT'): continue
                g = Polygon(c['poly']).buffer(0)
                if g.intersects(zone.buffer(12)): A('<path d="%s" fill="#fff" stroke="#333" stroke-width=".8"/>' % path_of(g))
        if isinstance(self.deck, tuple):
            dx, dy = self.deck
            for g in (box(19.88, dy - .1, dx, dy + .1), box(dx - .15, dy, dx + .15, 4.4), box(15.68, dy - .1, 19.8, dy + .1)): A('<path d="%s" fill="#fff" stroke="#333" stroke-width=".8"/>' % path_of(g))
        # floors
        sp = [s for s in src['spaces'] if s.get('storey') == 'L1' and s.get('polygon')]
        floor = unary_union([Polygon(s['polygon']).buffer(0) for s in sp] + ([FREE] if self.own else []))
        A('<path d="%s" fill="#fff" stroke="none"/>' % path_of(floor))
        for s_ in self.under: A(s_)
        for s_ in self.items: A(s_)
        A('<path d="%s" fill="#111" fill-rule="evenodd" stroke="#111" stroke-width=".6"/>' % path_of(wall_cut))
        for o in ops: A(self.opening_svg(o, src))
        for x in self.xops: A(self.xop_svg(x))
        for s_ in self.over: A(s_)
        for s_ in self.txt: A(s_)
        A('</g>')
        bx0, by0, bx1, by1 = shell(BASE)[0].bounds
        dim_h(A, bx0, bx1, by1 + 2.0, ftin(bx1 - bx0)); dim_v(A, RY0 - .41, RY1 + .4, bx1 + 2.0, ftin(RY1 - RY0 + .81))
        dim_h(A, RX0, RX1, by1 + .95, ftin(RX1 - RX0) + ' inside the original gable', small=True)
        A('<text x="%d" y="44" font-size="22" font-weight="700" fill="#111">%s</text>' % (M_L, esc(self.title)))
        A('<text x="%d" y="70" font-size="13" fill="#333">%s</text>' % (M_L, esc(self.sub)))
        A('<line x1="%d" y1="86" x2="%d" y2="86" stroke="#111" stroke-width="1"/>' % (M_L, W - M_L))
        north(A, W - M_L - 30, 40); scale_bar(A, M_L, H - 92)
        A('<text x="%d" y="%d" font-size="11.5" fill="#111" font-weight="600">%s</text>' % (M_L, H - 40, esc(self.label)))
        A('<text x="%d" y="%d" font-size="9.5" fill="#555">118 Hillside Drive, Woodside, CA &#183; Main level &#183; Street (Hillside Drive) to the east &#183; Dashed: above the cut (upper cabinets, ridge beam), a table leaf, or below (lower stair) &#183; Dotted: the way in from the entry &#183; Furniture at true size</text>' % (M_L, H - 22))
        A('</svg>')
        return '\n'.join(A_)
    def xop_svg(self, x):
        out = []
        Ln = lambda p, q, sw=.8, dash='', col='#111': out.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%s"%s/>' % (*P(*p), *P(*q), col, sw, (' stroke-dasharray="%s"' % dash) if dash else ''))
        if x[0] == 'win':
            _, c, w, o, wc, t = x; t2 = t / 2
            if o == 'h':
                for k in (-t2, t2): Ln((c - w / 2, wc + k), (c + w / 2, wc + k), .7)
                Ln((c - w / 2, wc), (c + w / 2, wc), 1.1)
                for p in (c - w / 2, c + w / 2): Ln((p, wc - t2), (p, wc + t2), .9)
            else:
                for k in (-t2, t2): Ln((wc + k, c - w / 2), (wc + k, c + w / 2), .7)
                Ln((wc, c - w / 2), (wc, c + w / 2), 1.1)
                for p in (c - w / 2, c + w / 2): Ln((wc - t2, p), (wc + t2, p), .9)
        elif x[0] == 'fold':
            _, x0, x1, y, stack, n = x; p = (x1 - x0) / n; th = math.radians(85.5); X = x1 if stack == 'east' else x0; sx = -1 if stack == 'east' else 1; yP = y
            pp = [(X, yP)]
            for i in range(n):
                X, yP = X + p * sx * math.cos(th), yP - p * math.sin(th) * (-1 if i % 2 else 1); pp.append((X, yP))
            out.append('<polyline points="%s" fill="none" stroke="#111" stroke-width="2.2" stroke-linejoin="miter"/>' % pts(pp))
            Ln((x0, y), (x1, y), .6, '6 3', '#333')
            for p_ in (x0, x1): Ln((p_, y - .2), (p_, y + .2), .9)
        elif x[0] == 'slider':
            _, x0, x1, y = x; m = (x0 + x1) / 2
            for k in (-.2, .2): Ln((x0, y + k), (x1, y + k), .7)
            Ln((x0, y + .07), (m + .15, y + .07), 1.6); Ln((m - .15, y - .07), (x1, y - .07), 1.6)
            for p_ in (x0, x1): Ln((p_, y - .2), (p_, y + .2), .9)
        return '\n'.join(out)
    def opening_svg(self, o, D):
        import numpy as np
        ax = np.array(o.get('axis') or [1, 0], float); ax /= np.linalg.norm(ax); nx = np.array([-ax[1], ax[0]])
        c = np.array(o['center'][:2], float); w = o['width'] / 2; t = (o.get('thickness') or .5) / 2
        a, b = c - ax * w, c + ax * w; out = []
        Ln = lambda p, q, sw=.8, dash='', col='#111': out.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%s"%s/>' % (*P(*p), *P(*q), col, sw, (' stroke-dasharray="%s"' % dash) if dash else ''))
        cls = o.get('class') or o.get('cls')
        if cls == 'IfcWindow':
            for k in (-t, t): Ln(a + nx * k, b + nx * k, .7)
            Ln(a, b, 1.1)
            for p in (a, b): Ln(p - nx * t, p + nx * t, .9)
            return '\n'.join(out)
        leaf = (o.get('leaves') or [None])[0] or o.get('leaf') or {}
        kind = leaf.get('kind') if isinstance(leaf, dict) else None
        for p in (a, b): Ln(p - nx * t, p + nx * t, .9)
        if kind == 'POCKET':
            hs = leaf.get('hingeEnd', 'START'); d = -ax if hs == 'START' else ax
            p0 = (a if hs == 'START' else b); Ln(p0, p0 + d * o['width'] * .95, .9, '4 2'); return '\n'.join(out)
        if kind == 'BYPASS':
            Ln(a + nx * .08, c + ax * .2 + nx * .08, 1.4); Ln(c - ax * .2 - nx * .08, b - nx * .08, 1.4); return '\n'.join(out)
        if kind == 'SWING' or (cls == 'IfcDoor' and kind is None and o.get('storey') == 'L1'):
            hinge = (leaf.get('hinge') or [[*a, 0]])[0][:2] if isinstance(leaf, dict) else list(a)
            h = np.array(hinge, float); other = b if np.linalg.norm(h - a) < np.linalg.norm(h - b) else a
            side = leaf.get('swingSide', 'A') if isinstance(leaf, dict) else 'A'
            sid = (o.get('spaces') or {}).get(side); sgn = 1.0
            spc = next((s for s in D['spaces'] if s['id'] == sid and s.get('polygon')), None)
            if spc is not None: sgn = 1.0 if Polygon(spc['polygon']).buffer(0).contains(Point(*(c + nx * 1.0))) else -1.0
            r = np.linalg.norm(other - h); open_end = h + nx * sgn * r
            Ln(h, open_end, 1.3)
            sweep = 1 if np.cross(np.append(other - h, 0), np.append(open_end - h, 0))[2] < 0 else 0
            p1, p2 = P(*other), P(*open_end)
            out.append('<path d="M%.1f %.1f A%.1f %.1f 0 0 %d %.1f %.1f" fill="none" stroke="#111" stroke-width=".6"/>' % (*p1, r * S, r * S, sweep, *p2))
            return '\n'.join(out)
        if cls == 'IfcDoor':
            for k in (-t, t): Ln(a + nx * k, b + nx * k, .7)
            Ln(a, b, 1.1)
        return '\n'.join(out)

def dim_h(A, x0, x1, y, txt, small=False):
    a, b = P(x0, y), P(x1, y)
    A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#111" stroke-width=".6"/>' % (a[0], a[1], b[0], b[1]))
    for p in (a, b): A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#111" stroke-width="1"/>' % (p[0] - 4, p[1] + 4, p[0] + 4, p[1] - 4))
    A('<text x="%.1f" y="%.1f" font-size="%s" fill="#111" text-anchor="middle">%s</text>' % ((a[0] + b[0]) / 2, a[1] - 4, 9 if small else 10.5, esc(txt)))
def dim_v(A, y0, y1, x, txt, small=False):
    a, b = P(x, y0), P(x, y1)
    A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#111" stroke-width=".6"/>' % (a[0], a[1], b[0], b[1]))
    for p in (a, b): A('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#111" stroke-width="1"/>' % (p[0] - 4, p[1] + 4, p[0] + 4, p[1] - 4))
    cx, cy = a[0] + 12, (a[1] + b[1]) / 2
    A('<text x="%.1f" y="%.1f" font-size="%s" fill="#111" text-anchor="middle" transform="rotate(-90 %.1f %.1f)">%s</text>' % (cx, cy, 9 if small else 10.5, cx, cy, esc(txt)))
def north(A, x, y):
    A('<g transform="translate(%d %d)"><circle r="16" fill="none" stroke="#111" stroke-width="1"/><path d="M0 -14 L6 8 L0 4 L-6 8 Z" fill="#111"/>'
      '<text y="-20" font-size="11" font-weight="700" text-anchor="middle" fill="#111">N</text></g>' % (x, y))
def scale_bar(A, x, y):
    for i, (a, b) in enumerate([(0, 4), (4, 8), (8, 16)]):
        A('<rect x="%.1f" y="%d" width="%.1f" height="6" fill="%s" stroke="#111" stroke-width=".8"/>' % (x + a * S, y, (b - a) * S, '#111' if i % 2 == 0 else '#fff'))
    for v in (0, 4, 8, 16): A('<text x="%.1f" y="%d" font-size="9" text-anchor="middle" fill="#111">%d</text>' % (x + v * S, y + 18, v))
    A('<text x="%.1f" y="%d" font-size="9" fill="#111">FEET (approximate)</text>' % (x + 16 * S + 10, y + 7))
