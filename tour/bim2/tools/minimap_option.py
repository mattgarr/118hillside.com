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
import build_open4k as K4
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

def make_b5(v):
    """r44 (open4k, "1-open B-flip"): the whole gable box, the old living room (library, bath, hall) and the bedroom's vestibule are redrawn"""
    D, opt = RP.variant_data(v)
    im = base.copy(); W_, H_ = im.size
    def patch(x, y, s=5.0):
        a, b = uv(x - s / 2, y - s / 2), uv(x + s / 2, y + s / 2); return base.crop((int(min(a[0], b[0])), int(min(a[1], b[1])), int(max(a[0], b[0])), int(max(a[1], b[1]))))
    def tiled(tex):
        t = Image.new('RGB', (W_, H_)); tw, th = tex.size
        for i in range(0, W_, tw):
            for j in range(0, H_, th): t.paste(tex, (i, j))
        return t
    OAK, DECK = tiled(patch(30.0, 23.5, 5.0)), tiled(patch(8.0, -6.0, 4.0))
    def paste(tex, g):
        m = Image.new('L', (W_, H_), 0); d = ImageDraw.Draw(m)
        for ext, holes in poly_px(g): d.polygon(ext, fill=255)
        im.paste(tex, mask=m)
    room = Polygon(K4.BOX); FO = K4.FOLD; DK = K4.DECK
    inside = unary_union([room, sbox(-9.53, -0.75, 4.9, 14.32), sbox(4.76, 4.4, 5.3, 14.6), sbox(-9.53, 14.32, -6.6, 18.42), sbox(-6.6, 14.32, 5.3, 17.2), sbox(4.9, 22.1, 5.3, 25.6)])
    clip = inside.buffer(.62)
    paste(OAK, unary_union([inside.buffer(.3), sbox(FO['x0'], 4.2, FO['x1'], 4.9)]))
    deck = sbox(DK['x0'] - .1, DK['y0'], DK['x1'], K4.Y_SO).difference(room.buffer(.45))
    paste(DECK, deck)
    dr = ImageDraw.Draw(im)
    fill(dr, unary_union([sbox(-9.53, 9.59, -1.29, 14.32), sbox(-9.53, 14.32, -6.79, 18.42)]), (226, 220, 208))        # bath and shower tile
    F = [f for f in D['furnishings'] if f.get('storey') == 'L1' and f.get('at')]
    def outl(g, w=1, col=(150, 150, 150)):
        for ext, holes in poly_px(g): dr.line(ext + [ext[0]], fill=col, width=w)
    for f in F:
        if f['render']['kind'] == 'rug2':
            pr = f.get('params') or {}; g = sbox(f['at'][0] - pr['d'] / 2, f['at'][1] - pr['w'] / 2, f['at'][0] + pr['d'] / 2, f['at'][1] + pr['w'] / 2)
            if g.intersects(inside): fill(dr, g, (222, 216, 204)); outl(g, 1, (176, 168, 152))
    for f in F:
        if f['render']['kind'] == 'counterTop':
            for o in (f.get('params') or {}).get('outlines', []): fill(dr, Polygon(o).buffer(0).intersection(clip), (250, 250, 248))
    SZ = {'bedQueen': (5.42, 7.45), 'nightstand': (2.0, 1.5), 'showerGlass': (2.3, .12), 'coffeeTableGlass': (5.0, 3.6), 'woodSideTable': (2.4, 2.4)}
    COL = {'wallOvenStack': (214, 216, 218), 'fridge4Door': (214, 216, 218), 'range36': (214, 216, 218), 'washerFront': (232, 234, 236), 'bedQueen': (240, 238, 232), 'nightstand': (206, 176, 136), 'toilet': (252, 252, 252), 'vanity': (250, 250, 248),
           'diningTable': (196, 160, 118), 'sideboard': (60, 70, 86), 'sofa3': (236, 232, 222), 'armchairBoucle': (236, 232, 222), 'coffeeTableGlass': (205, 214, 216), 'woodSideTable': (206, 176, 136),
           'parsonsChair': (244, 242, 236), 'outdoorLounge': (70, 72, 76), 'outdoorCoffee': (120, 120, 120), 'counterStoolRope': (186, 160, 126)}
    for f in F:
        k = f['render']['kind']; pr = f.get('params') or {}
        if k in ('baseCabinet', 'tallCabinet', 'lowBuiltin', 'wallOvenStack', 'island', 'builtinBookcase', 'fridge4Door', 'range36', 'washerFront', 'vanity', 'toilet', 'bedQueen', 'nightstand'):
            f2 = dict(f)
            if k in SZ: f2['params'] = dict({'w': SZ[k][0], 'd': SZ[k][1]}, **{kk: vv for kk, vv in pr.items() if kk in ('w', 'd')})
            g = RP.foot(f2)
            if not g.intersects(clip.union(sbox(-6.6, 17.0, 5.0, 26.8))): continue
            fill(dr, g, COL.get(k, (250, 250, 248))); outl(g)
        elif k in ('diningTable', 'sideboard', 'sofa3', 'armchairBoucle', 'coffeeTableGlass', 'woodSideTable', 'parsonsChair', 'outdoorLounge', 'outdoorCoffee', 'counterStoolRope'):
            w_, d_ = (SZ.get(k) or RP.LOOSE.get(k, (1.5, 1.5, ''))[:2]) if k != 'counterStoolRope' else (1.4, 1.4)
            f2 = dict(f); f2['params'] = dict({'w': w_, 'd': d_}, **{kk: vv for kk, vv in pr.items() if kk in ('w', 'd')})
            if k == 'counterStoolRope': f2['render'] = dict(f['render'], lib='STAGE')
            g = RP.foot(f2); fill(dr, g, COL[k]); outl(g, 1, (120, 120, 120))
    # the island's sink, the hearth
    isl = [f for f in F if f['render']['kind'] == 'island']
    if isl: x, y = isl[0]['at'][:2]; g = sbox(x - 1.3, y - 1.75, x + 1.3, y - .35); fill(dr, g, (200, 204, 208)); outl(g)
    fp = K4.FP; fill(dr, sbox(B4.X_E - fp['d'], fp['cy'] - fp['w'] / 2, B4.X_E, fp['cy'] + fp['w'] / 2), (205, 205, 205)); fill(dr, sbox(B4.X_E - .6, fp['cy'] - 2.25, B4.X_E - .2, fp['cy'] + 2.25), (40, 40, 40))
    # walls (black) of the option, cut at the openings; windows white
    walls = unary_union([Polygon(c['poly']).buffer(0) for c in D['colliders'] if c['kind'] == 'WALL' and c['element'].startswith('W-') and c['z0'] <= .5 and c['z1'] >= 4 and c.get('storey') == 'L1'])
    wins, doors = [], []
    for o in D['openings']:
        if o.get('storey') != 'L1' or not o.get('center') or o.get('skylight') or o.get('kind') == 'SKYLIGHT' or (o.get('sill') or 0) > 4.2: continue
        ax = np.array(o.get('axis') or [1, 0], float); ax /= np.linalg.norm(ax); nx = np.array([-ax[1], ax[0]]); c = np.array(o['center'][:2]); w = o['width'] / 2; t = (o.get('thickness') or .5) / 2 + .1
        g = Polygon([c - ax * w - nx * t, c + ax * w - nx * t, c + ax * w + nx * t, c - ax * w + nx * t])
        (wins if (o.get('class') == 'IfcWindow') else doors).append(g)
    fill(dr, walls.difference(unary_union(wins + doors)).intersection(clip), (12, 12, 12))
    for g in wins:
        if g.intersects(inside.buffer(.5)): fill(dr, g.intersection(clip), (255, 255, 255)); outl(g.intersection(clip), 1, (90, 90, 90))
    for x0, x1, y in ((-6.05, -3.35, 16.86), (-3.45, -0.75, 16.95)): fill(dr, sbox(x0, y - .05, x1, y + .05), (90, 90, 90))      # closet sliders
    fill(dr, sbox(2.12, 9.62, 2.23, 11.88), (90, 90, 90))                                                                    # laundry closet door, shut
    fill(dr, sbox(2.85, 17.08, 2.95, 19.66), (90, 90, 90))                                                                    # bedroom door, open
    # the folding doors: a thin track line and the folded stack at the west jamb
    dr.line([uv(FO['x0'], 4.6), uv(FO['x1'], 4.6)], fill=(120, 120, 120), width=2)
    X, Y = FO['x0'], 4.60; th = math.radians(85.5); pp = [uv(X, Y)]; pw = (FO['x1'] - FO['x0']) / FO['panels']
    for i in range(FO['panels']):
        X += pw * math.cos(th); Y += -pw * math.sin(th) * (-1 if i % 2 else 1); pp.append(uv(X, Y))
    dr.line(pp, fill=(12, 12, 12), width=4)
    for c in D['colliders']:
        if c['kind'] == 'RAIL' and 'B5' in c['id'] and 'STAIR' not in c['id']: fill(dr, Polygon(c['poly']).buffer(.02), (40, 40, 40))
    out = T + 'floor_main_%s.jpg' % v; im.save(out, quality=88); print('wrote', out, im.size)

def make(v):
    if v == 'open4k': return make_b5(v)
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
    room = Polygon(K4.ROOM2) if v == 'open4k' else Polygon(B4.ROOM); oldk = Polygon([s for s in D['spaces'] if s['id'] == 'SP-L1-KITCHEN'][0]['polygon']).buffer(0)
    inside = unary_union([room, oldk])
    deck = unary_union([Polygon(w['poly']).buffer(0) for w in D['walkable'] if w.get('id') == 'SL-DK-K4']).difference(room.buffer(.45))
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
    # the library wall, the beam's post, and the loose pieces that explain the plan (dining table, piano, sideboard, sofa)
    for f in F:
        k = f['render']['kind']; pr = f.get('params') or {}
        if k == 'libraryWall':
            for a, b, ty in pr.get('bays', []):
                if ty in ('post', 'door'): continue
                g = sbox(f['at'][0], f['at'][1] + a, f['at'][0] + (pr.get('baseD', 1) if ty == 'base' else pr.get('d', 1)), f['at'][1] + b); fill(dr, g, (250, 250, 248))
                for ext, holes in poly_px(g): dr.line(ext + [ext[0]], fill=(150, 150, 150), width=1)
        elif k in ('diningTable', 'pianoUpright', 'sideboard', 'sofa3', 'pianoBench'):
            w_, d_, sh = RP.LOOSE[k]; f2 = dict(f); f2['params'] = dict({'w': w_, 'd': d_}, **{kk: vv for kk, vv in pr.items() if kk in ('w', 'd')}); g = RP.foot(f2)
            fill(dr, g, {'diningTable': (196, 160, 118), 'pianoUpright': (28, 28, 30), 'pianoBench': (40, 40, 42), 'sideboard': (60, 70, 86), 'sofa3': (236, 232, 222)}[k])
            for ext, holes in poly_px(g): dr.line(ext + [ext[0]], fill=(120, 120, 120), width=1)
    if v == 'open4k': fill(dr, sbox(K4.POST[0], K4.POST[2], K4.POST[1], K4.POST[3]), (150, 110, 70))
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
