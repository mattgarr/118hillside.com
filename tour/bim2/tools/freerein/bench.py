"""The benchmarks (as built, the architect's jan24 and apr24b), drawn from the model's own data with the same symbols as the concepts."""
import json, math
from shapely.geometry import Polygon
from fr import Plan, BASE, B2

def _fp(f):
    fp = f.get('footprint')
    if not fp: return None
    xs = [p[0] for p in fp]; ys = [p[1] for p in fp]
    return min(xs), min(ys), max(xs), max(ys)

def furnish(p, D, asbuilt=False):
    F = [f for f in D['furnishings'] if f.get('storey') == 'L1' and f.get('at')]
    stools = []
    for f in F:
        k = f['render']['kind']; pr = f.get('params') or {}; b = _fp(f); rot = f.get('rot') or 0
        if k == 'counterTop':
            for o in pr.get('outlines', []): p.poly(Polygon(o).buffer(0), '#f4f4f4', .9, '#222')
            continue
        if k in ('counterStoolRope',): stools.append((f['at'][0], f['at'][1])); continue
        if b is None: continue
        x0, y0, x1, y1 = b; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        w, d = ((y1 - y0), (x1 - x0)) if abs(math.cos(math.radians(rot))) > .5 else ((x1 - x0), (y1 - y0))
        if k == 'rug': p.rug(x0, y0, x1, y1)
        elif k == 'sofa3': p.sofa(cx, cy, rot, w, d)
        elif k == 'armchairBoucle':
            g = Polygon(f['footprint']); c = g.centroid; p.chair(c.x, c.y, rot, 2.8, 2.7)
        elif k == 'sideTable': p.rtable(cx, cy, pr.get('dia') or 1.5)
        elif k in ('consoleTable',): p.tv(cx, cy, rot, w, d)
        elif k == 'diningTable': p.table(x0, y0, x1, y1, 'dining table', True, .9)
        elif k == 'diningChair': p.dchair(cx, cy, rot)
        elif k == 'barStool': stools.append((cx, cy))
        elif k == 'bedQueen': p.bed(cx, cy, rot, 'queen', 0)
        elif k in ('nightstand',): p.table(x0, y0, x1, y1, 'nightstand', True, .6)
        elif k == 'dresser': p.builtin(x0, y0, x1, y1, None, 'dresser')
        elif k == 'desk':
            p.table(x0, y0, x1, y1, 'desk', True)
        elif k == 'officeChair': p.poly(Polygon(f['footprint']).buffer(-.35).buffer(.3), '#fff', .6, '#555')
        elif k == 'exerciseBike': p.builtin(x0, y0, x1, y1, 'BIKE', 'bike')
        elif k in ('baseCabinet', 'island'):
            p.counter(x0, y0, x1, y1)
            if pr.get('sink'):
                if k == 'island': p.sink(cx - 1.4, cy - .8, cx + 1.4, cy + .8, True)
                else: p.sink(cx - .9 if (x1 - x0) < (y1 - y0) else cx - 1.3, cy - 1.3 if (x1 - x0) < (y1 - y0) else cy - .9, cx + .9 if (x1 - x0) < (y1 - y0) else cx + 1.3, cy + 1.3 if (x1 - x0) < (y1 - y0) else cy + .9)
            if k == 'island': p.text(cx, cy + (1.2 if pr.get('sink') else 0), 'ISLAND', 7)
        elif k == 'tallCabinet': p.tall(x0, y0, x1, y1, 'PAN' if x1 < 24.5 else 'WARD')
        elif k in ('fridgeFrenchDoor', 'fridge4Door'): p.app(x0, y0, x1, y1, 'REF')
        elif k in ('range36', 'rangeSlideIn30'): p.range_(x0, y0, x1, y1)
        elif k == 'dishwasher': p.app(x0, y0, x1, y1, 'DW')
        elif k == 'beverageCooler': p.app(x0, y0, x1, y1, '')
        elif k == 'builtinBookcase': p.shelves(x0, y0, x1, y1)
        elif k == 'vanity': p.vanity(x0, y0, x1, y1)
        elif k == 'toilet':
            r_ = math.radians(rot); p.toilet(cx - math.cos(r_) * (x1 - x0) / 2 * abs(math.cos(r_)) - 0, cy - math.sin(r_) * (y1 - y0) / 2 * abs(math.sin(r_)), rot)
        elif k == 'tubAlcove': p.tub(x0, y0, x1, y1)
        elif k == 'showerGlass': pass
        elif k == 'washerFront': p.wd(x0, y0, x1, y1)
    p.stools(stools)

def asbuilt():
    p = Plan('As built: 6 bedrooms', 'Three bedrooms, one bath and a closed kitchen under the original gable; living room by the entry', deck='base', base=BASE,
             label='Drawn from the 3D model of the house as it is. Not to scale; verify all dimensions.')
    furnish(p, BASE, True)
    for (x, y, n, sf) in ((9.4, 29.3, 'HALL BATH', 55), (-1.0, 22.3, 'BEDROOM', 110), (19.0, 27.0, 'BEDROOM', 110), (30.5, 23.5, 'BEDROOM', 150), (-2.3, 7.0, 'LIVING ROOM', 215),
                          (26.5, 11.0, 'DINING & SITTING', 260), (9.4, 13.4, 'KITCHEN', 175), (-2.3, -5.6, 'ENTRY FOYER', 90)):
        p.room(x, y, n, sf)
    for (x, y, n) in ((9.4, 23.8, 'HALL'), (18.9, 19.6, 'CL'), (30.4, 31.0, 'CL'), (-3.4, 15.7, 'CL'), (2.4, 15.7, 'CL'), (9.0, -4.5, 'FRONT PORCH')): p.room(x, y, n, small=True)
    p.way([(1.5, -5.7), (-2.3, -4.0), (-2.3, 2.0), (2.5, 12.6), (7.5, 12.6), (12.0, 14.5), (17.5, 13.0), (24.0, 11.0)])
    return p

def jan24():
    D = json.load(open(B2 + 'scene.opt-OS-REMODEL-jan24.meta.json'))
    p = Plan("Benchmark: the architect's Jan 2024 open plan (5 bedrooms)", 'Kitchen in the old back bedroom; dining and family room in the west of the gable; two bedrooms and a new bath at the street end', deck='base', base=D,
             label="The architect's Jan 2024 concept (unapproved), redrawn from the 3D model in the same style. Not to scale; verify all dimensions.")
    furnish(p, D)
    # the shower in the new bath (the model has only its glass)
    p.shower(34.2, 15.67, 36.55, 20.67, glass=((34.2, 15.67), (34.2, 20.67)))
    for (x, y, n, sf) in ((-1.5, 22.3, 'KITCHEN', 175), (21.6, 8.2, 'DINING', 230), (17.2, 18.0, 'FAMILY ROOM', 225), (-2.3, 7.4, 'SITTING / GAMES', 215), (30.9, 27.6, 'BEDROOM', 130), (30.3, 11.6, 'BEDROOM', 125), (-2.3, -5.6, 'ENTRY FOYER', 90)):
        p.room(x, y, n, sf)
    for (x, y, n) in ((6.6, 29.4, 'PANTRY'), (31.0, 19.2, 'BATH'), (26.2, 18.6, 'HALL'), (9.0, -4.5, 'FRONT PORCH'), (14.5, 5.95, 'CREDENZA'), (23.3, 25.65, 'TV')): p.room(x, y, n, small=True)
    p.way([(1.5, -5.7), (-2.3, -4.0), (-2.3, 3.0), (3.5, 11.5), (8.5, 16.0), (11.0, 18.5), (12.2, 25.6)])
    return p

def apr24b():
    D = json.load(open(B2 + 'scene.opt-OS-REMODEL-apr24b.meta.json'))
    p = Plan("Benchmark: the architect's Apr 2024 semi-open plan (6 bedrooms)", 'Kitchen and dining open along the south side around a 13-ft island; family room, three bedrooms and the hall bath keep their own rooms', deck='base', base=D,
             label="The architect's Apr 2024 concept, Plan 'B' (unapproved), redrawn from the 3D model in the same style. Not to scale; verify all dimensions.")
    furnish(p, D)
    for (x, y, n, sf) in ((9.4, 13.6, 'KITCHEN', 265), (30.4, 15.3, 'DINING', 165), (-2.2, 1.6, 'FAMILY ROOM', 240), (-1.0, 21.0, 'BEDROOM / OFFICE', 110), (19.0, 30.6, 'BEDROOM', 110), (32.0, 21.6, 'BEDROOM', 135), (-2.3, -5.6, 'ENTRY FOYER', 90)):
        p.room(x, y, n, sf)
    for (x, y, n) in ((9.4, 23.9, 'HALL'), (9.0, 29.4, 'BATH'), (18.9, 19.6, 'CL'), (30.4, 31.0, 'CL'), (9.0, -4.5, 'FRONT PORCH')): p.room(x, y, n, small=True)
    p.way([(1.5, -5.7), (-2.3, -4.0), (-2.3, 2.0), (3.0, 7.0), (8.0, 7.0), (25.0, 7.0), (27.0, 10.4)])
    return p
