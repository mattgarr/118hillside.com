#!/usr/bin/env python3
"""Small main-level plan images for the Floor plans menu (r45): one per layout, drawn the same way from the layout's own data
(scene.meta.json for the house as built, scene.opt-<id>.meta.json for each idea): rooms filled by kind, walls from the wall colliders,
decks pale grey. The street is at the bottom, as in the menu's old sketches. Writes tour/plan_<legacyId>.jpg (448 px square).
Run: python3 tour/bim2/tools/plan_thumbs.py      (needs Pillow, shapely)"""
import json, os, re
from PIL import Image, ImageDraw
from shapely.geometry import Polygon
from shapely.ops import unary_union
B2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); TOUR = os.path.join(B2, '..')
X0, X1, Y0, Y1 = -11.5, 38.5, -11.5, 34.5         # plan feet: x east (street), y north
S, PAD, SS = 448, 14, 3                            # output size, margin, supersampling
BG, WALL, ROOM, BED, BATH, CLOS, DECK = (239, 236, 228), (52, 50, 46), (250, 247, 240), (232, 207, 165), (190, 211, 220), (226, 224, 214), (214, 212, 204)

def draw(meta, out):
    k = (S - 2 * PAD) * SS / max(X1 - X0, Y1 - Y0); ox = (S * SS - (Y1 - Y0) * k) / 2; oy = (S * SS - (X1 - X0) * k) / 2
    P = lambda p: (ox + (p[1] - Y0) * k, oy + (p[0] - X0) * k)          # north to the right, the street (east) at the bottom
    im = Image.new('RGB', (S * SS, S * SS), BG); d = ImageDraw.Draw(im)
    for w in meta.get('walkable', []):
        if w.get('kind') == 'DECK' and w.get('storey', 'L1') == 'L1' and w.get('poly'): d.polygon([P(p) for p in w['poly']], fill=DECK)
    rooms = [s for s in meta['spaces'] if s.get('storey') == 'L1' and s.get('interior') is not False and len(s.get('polygon') or []) > 2]
    for s in rooms:
        n = (s.get('name') or '').strip()
        c = CLOS if re.search(r'closet|stairs|storage', n, re.I) else BED if re.search(r'bedroom$', n, re.I) else BATH if re.search(r'\bbath$|shower', n, re.I) else ROOM
        d.polygon([P(p) for p in s['polygon']], fill=c)
    walls = [Polygon(c['poly']) for c in meta.get('colliders', []) if c.get('kind') == 'WALL' and c.get('storey', 'L1') == 'L1' and c.get('z0', 0) < 1 and c.get('z1', 9) > 3 and len(c.get('poly') or []) > 2]
    region = Polygon([(X0, Y0), (X1, Y0), (X1, Y1), (X0, Y1)])
    for g in walls:
        g = g.intersection(region)
        for q in (g.geoms if hasattr(g, 'geoms') else [g]):
            if q.geom_type == 'Polygon' and not q.is_empty: d.polygon([P(p) for p in q.exterior.coords], fill=WALL)
    im = im.resize((S, S), Image.LANCZOS); im.save(out, quality=88, optimize=True); return out

def main():
    base = json.load(open(os.path.join(B2, 'scene.meta.json')))
    print(draw(base, os.path.join(TOUR, 'plan_asbuilt.jpg')))
    for o in base.get('options', []):
        if not o.get('meta'): continue
        D = json.load(open(os.path.join(B2, o['meta']))); D.setdefault('walkable', base.get('walkable', []))
        print(draw(D, os.path.join(TOUR, 'plan_%s.jpg' % o['legacyId'])))

if __name__ == '__main__':
    main()
