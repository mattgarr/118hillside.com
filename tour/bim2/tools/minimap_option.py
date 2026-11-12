"""The minimap's plan image for an option (tour/floor_main_<v>.jpg): floor_main.jpg with the remodelled area redrawn in the same style
(wood floor, black walls, white cabinetry), from the option's own data. World frame of the image: u = plan y, v = plan x (MODEL.texExtent.main)."""
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from shapely.geometry import Polygon, box as sbox, Point
from shapely.ops import unary_union
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_open4 as B4
import plan_svg as RP
T = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..') + '/'
EXT = [-35.075, -51.493, 33.582, 39.552]          # world x0 (plan y), z0 (plan x), x1, z1
base = Image.open(T + 'floor_main.jpg').convert('RGB'); Wd, Ht = base.size
SU, SV = Wd / (EXT[2] - EXT[0]), Ht / (EXT[3] - EXT[1])
def uv(x, y): return ((y - EXT[0]) * SU, (x - EXT[1]) * SV)
def poly_px(g):
    out = []
    for p in ([g] if g.geom_type == 'Polygon' else list(getattr(g, 'geoms', []))):
        if p.geom_type == 'Polygon' and not p.is_empty: out.append(([uv(x, y) for x, y in p.exterior.coords], [[uv(x, y) for x, y in r.coords] for r in p.interiors]))
    return out
def fill(draw, g, col):
    for ext, holes in poly_px(g):
        draw.polygon(ext, fill=col)
        for h in holes: draw.polygon(h, fill=None)

def make(v):
    D, opt = RP.variant_data(v)
    im = base.copy(); W_, H_ = im.size
    # textures sampled from the house's own plan: a clean oak patch (front bedroom) and the porch decking
    def patch(x, y, s=5.0):
        a, b = uv(x - s / 2, y - s / 2), uv(x + s / 2, y + s / 2); return base.crop((int(min(a[0], b[0])), int(min(a[1], b[1])), int(max(a[0], b[0])), int(max(a[1], b[1]))))
    oak = patch(30.0, 23.5, 5.0); deckp = patch(8.0, -6.0, 4.0)
    def tiled(tex):
        t = Image.new('RGB', (W_, H_)); tw, th = tex.size
        for i in range(0, W_, tw):
            for j in range(0, H_, th): t.paste(tex, (i, j))
        return t
    OAK, DECK = tiled(oak), tiled(deckp)
    # the area that changes: the old kitchen, the great room (with the two bedrooms), the new deck
    room = Polygon(B4.ROOM); oldk = Polygon([s for s in D['spaces'] if s['id'] == 'SP-L1-KITCHEN'][0]['polygon']).buffer(0)
    inside = unary_union([room, oldk])
    deck = unary_union([Polygon(w['poly']).buffer(0) for w in D['walkable'] if w.get('id') == 'SL-DK-K4']).difference(Polygon(B4.ROOM).buffer(.45))
    region = unary_union([inside.buffer(.62), deck.buffer(.3)])
    mask = Image.new('L', (W_, H_), 0); md = ImageDraw.Draw(mask)
    for ext, holes in poly_px(region): md.polygon(ext, fill=255)
    # white ground, then floor and deck
    m2 = Image.new('L', (W_, H_), 0); d2 = ImageDraw.Draw(m2)
    for ext, holes in poly_px(unary_union([inside.buffer(.3), sbox(18.0, 4.2, 32.4, 4.9)])): d2.polygon(ext, fill=255)   # the floor runs out through the folding wall
    im.paste(OAK, mask=m2)
    m3 = Image.new('L', (W_, H_), 0); d3 = ImageDraw.Draw(m3)
    for ext, holes in poly_px(deck): d3.polygon(ext, fill=255)
    im.paste(DECK, mask=m3)
    dr = ImageDraw.Draw(im)
    # cabinetry and fixed pieces: white like the house's own kitchen, appliances light grey
    F = [f for f in D['furnishings'] if f.get('storey') == 'L1' and f.get('at')]
    for f in F:
        k = f['render']['kind']
        if k == 'counterTop':
            for o in (f.get('params') or {}).get('outlines', []): fill(dr, Polygon(o).buffer(0).intersection(region), (250, 250, 248))
    for f in F:
        k = f['render']['kind']
        if k in ('baseCabinet', 'tallCabinet', 'island', 'builtinBookcase', 'windowSeat', 'fridge4Door', 'range36', 'dishwasher'):
            g = RP.foot(f)
            if not g.intersects(region): continue
            col = (250, 250, 248) if k not in ('fridge4Door', 'range36') else (214, 216, 218)
            fill(dr, g, col)
            for ext, holes in poly_px(g): dr.line(ext + [ext[0]], fill=(150, 150, 150), width=1)
    # fireplace
    fill(dr, sbox(16.3, B4.Y_N - 1.2, 22.3, B4.Y_N), (205, 205, 205)); fill(dr, sbox(17.05, B4.Y_N - .55, 21.55, B4.Y_N - .15), (40, 40, 40))
    # walls (black) of the option, cut at the openings; windows white, doors open
    walls = unary_union([Polygon(c['poly']).buffer(0) for c in D['colliders'] if c['kind'] == 'WALL' and c['element'].startswith('W-') and c['z0'] <= .5 and c['z1'] >= 4 and c.get('storey') == 'L1'])
    wins, doors = [], []
    for o in D['openings']:
        if o.get('storey') != 'L1' or not o.get('center') or o.get('skylight') or o.get('kind') == 'SKYLIGHT' or (o.get('sill') or 0) > 4.2: continue
        ax = np.array(o.get('axis') or [1, 0], float); ax /= np.linalg.norm(ax); nx = np.array([-ax[1], ax[0]]); c = np.array(o['center'][:2]); w = o['width'] / 2; t = (o.get('thickness') or .5) / 2 + .1
        g = Polygon([c - ax * w - nx * t, c + ax * w - nx * t, c + ax * w + nx * t, c - ax * w + nx * t])
        (wins if (o.get('class') == 'IfcWindow') else doors).append(g)
    wcut = walls.difference(unary_union(wins + doors)).intersection(inside.buffer(.62))
    fill(dr, wcut, (12, 12, 12))
    for g in wins:
        if g.intersects(inside): fill(dr, g.intersection(inside.buffer(.62)), (255, 255, 255))
    # the folding glass wall: the folded stack at the east jamb, a thin track line
    a, b = uv(18.0, 4.6), uv(32.4, 4.6); dr.line([a, b], fill=(120, 120, 120), width=2)
    X, Y = 32.4, 4.60; th = math.radians(85.5); pp = [uv(X, Y)]
    for i in range(6):
        X += -2.4 * math.cos(th); Y += -2.4 * math.sin(th) * (-1 if i % 2 else 1); pp.append(uv(X, Y))
    dr.line(pp, fill=(12, 12, 12), width=4)
    # deck rails
    for c in D['colliders']:
        if c['kind'] == 'RAIL' and 'K4' in c['id']: fill(dr, Polygon(c['poly']).buffer(.05), (40, 40, 40))
    im = im.filter(ImageFilter.SMOOTH) if False else im
    out = T + 'floor_main_%s.jpg' % v; im.save(out, quality=88); print('wrote', out, im.size)

if __name__ == '__main__':
    make(sys.argv[1] if len(sys.argv) > 1 else 'open4k')
