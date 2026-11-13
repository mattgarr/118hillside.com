#!/usr/bin/env python3
"""Ideas r47 (owner 11/13/2026: the 5- and 6-bedroom plans "look pretty good already"; polish them, then turn their guided tours on).

The two 2024 layout ideas, "Open plan" (jan24, 5 bedrooms) and "Semi-open plan" (apr24b, 6 bedrooms), come from a kernel export that is
not in this repository. This tool patches the shipped packages in place (tour/, halloween/, thanksgiving/) and is safe to run again:

  meta (scene.opt-OS-REMODEL-<idea>.meta.json)
    - the kitchens are rebuilt in the house's own finish: raised-panel doors with satin nickel pulls and knobs (the export drew plain
      shaker fronts with tall black bars), a built-in refrigerator in a panelled column with a cabinet over it, wall cabinets to one top
      line with a light rail and a scribe or crown, quartz counters with a full backsplash, a pot filler and a range-back slab, rope stools
    - jan24: a real bath (marble-top vanity, lit mirror, toilet, a glass shower with a nickel shower set and a towel bar); the
      street-side room furnished as a bedroom (it was an office); every bedroom gets a made bed, nightstands with lamps, a rug and a
      dresser or wardrobe
    - apr24b: the exercise bike leaves the front bedroom; the back bedroom gets a bed (it was an office); the same bedroom set throughout
    - the loose furniture is staged like the rest of the house (rows with render.lib 'STAGE', see OPT42 in tour/index.html)
  scene.meta.json options[] (each site)
    - pageExtras, the card ("Illustrative idea", stats, description), room outlines (rooms) so a walk names the room you are in
    - every option sha256
  GLB (scene.opt-OS-REMODEL-<idea>.glb)
    - jan24: the stacked washer and dryer get a closet front: a wall to the vault with a cased opening and a pair of sliding doors
      (drawn as slabs; doors46.py makes them the house's three-panel leaves with finger pulls); subway tile on the three shower walls
    - apr24b: the back bedroom gets a door (it opened straight onto the hall): wall returns, a header, lining, casings and a leaf
      standing open, with satin nickel knobs
  hillside.bim.json (each site): the ideas' room labels ("Pantry wall" -> "Pantry") and card text

Run: python3 tour/bim2/tools/ideas47.py      then   python3 tour/bim2/tools/doors46.py   (it must report 0 changes on a second run)
"""
import hashlib, json, math, os, re, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import doors46 as D46

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
SITES = ('tour', 'halloween', 'thanksgiving')
IN = 1 / 12
PAINT = 'paint-int-flat#PAINT-BM-1472-SILVER-CHAIN'
TRIM = 'mdf-primed#paint-trim-semigloss'
LINING = 'mdf-primed'
LEAF = 'paint-trim-semigloss'
FIELD = 'door-panel-field'
TILE = 'tile-subway'
NICKEL = 'nickel-brushed'
MARK47 = 'ideas47'

# ------------------------------------------------------------------------------------------------ furnishings
CAB = {'counter': None, 'faucet': False, 'hw': 'satinNickel', 'pull': 'bar', 'sink': False, 'style': 'raised'}
UP = dict(CAB, pull='knob', contents=False)
NS = {'w': 1.6, 'legs': False, 'finish': 'cabinetOak', 'hw': 'blackMetal', 'pull': 'bar'}
BED = {'upholstery': 'linenCream', 'channels': False, 'shamMat': 'linenWhite', 'accentMat': 'linenWhite', 'throwBlanket': False}
PILLOWS = [['pillowSlate', -2.6, 1.45, 1.45, .12], ['pillowCream', -1.2, 1.45, 1.45, -.05], ['pillowGreyLinen', 1.2, 1.45, 1.45, -.1], ['pillowSlate', 2.6, 1.45, 1.45, -.12]]


class Rows:
    def __init__(self, prefix):
        self.p = prefix; self.F = []
    def add(self, kind, at, rot, params=None, lib='FIX', space=None, z=0, key=None, on=None, dx=0, dz=0, back=False, sz=None):
        f = {'id': '%s%02d' % (self.p, len(self.F) + 1), 'type': 'FXT-' + kind, 'render': {'kind': kind, 'lib': lib}, 'at': [round(at[0], 4), round(at[1], 4), z], 'rot': rot,
             'space': space, 'storey': 'L1', 'params': params or None, 'footprint': None}
        if key: f['stageKey'] = key
        if on: f['stageOn'] = on; f['stageDx'] = dx; f['stageDz'] = dz
        if sz is not None: f['stageZ'] = sz
        if back: f['stageBack'] = True
        self.F.append(f); return f
    def st(self, kind, at, rot, params=None, **k):
        return self.add(kind, at, rot, params, lib='STAGE', **k)
    def bed(self, c, rot, space, wall, ns=(True, True), mat='scarfArrow', white=False, nsw=1.6, rug=True, nsat=None):
        """a made queen bed, centre c, foot toward rot; headboard on the wall at `wall` (plan coordinate along the facing axis)"""
        f = {0: (1, 0), 90: (0, 1), 180: (-1, 0), 270: (0, -1)}[rot]; r = (f[1], -f[0]); k = 'b%d%d' % (round(c[0]), round(c[1]))
        P = lambda a, b: (c[0] + f[0] * a + r[0] * b, c[1] + f[1] * a + r[1] * b)
        if rug: self.st('rug2', P(1.2, 0), rot, {'w': 6.0, 'd': 8.0, 'pattern': 'creamWool'}, space=space)
        self.st('bedQueen', c, rot, dict(BED, upholstery='linenWhite' if white else 'linenCream'), space=space, key=k)
        self.st('bedRunner', (0, 0), rot, {'w': 5.5, 'd': 2.3, 'drop': .95, 'mountY': 2.0, 'mat': mat}, on=k, sz=4.2)
        back = c[0] - f[0] * 3.725 if f[0] else c[1] - f[1] * 3.725      # the headboard line
        for i, (side, ok) in enumerate(zip((-1, 1), ns)):
            if not ok: continue
            off = (nsat[i] if nsat else 2.71 + nsw / 2 + .05)
            a = abs(back - (c[0] if f[0] else c[1])) - .75
            q = P(-a, side * off); kk = k + ('L' if side < 0 else 'R')
            self.st('nightstand', q, rot, dict(NS, w=nsw), space=space, key=kk)
            self.st('tableLamp', (0, 0), rot, {'h': 2.1}, on=kk)
    def sofa(self, c, rot, w, space, key):
        self.st('sofa3', c, rot, {'w': w, 'fabric': 'linenCream', 'pillows': False}, space=space, key=key)
        self.st('pillows', (0, 0), rot, {'mountY': 1.42, 'lean': -.3, 'items': PILLOWS}, on=key, sz=.95)


def counter(R, outline, space, holes=None, **k):
    p = {'mat': 'brittanicca', 'mountY': 2.896, 'outlines': [[[round(x, 4), round(y, 4)] for x, y in outline]], 't': 0.104}
    if holes: p['holes'] = [[[round(x, 4), round(y, 4)] for x, y in h] for h in holes]
    p.update(k); cx = sum(q[0] for q in outline) / len(outline); cy = sum(q[1] for q in outline) / len(outline)
    return R.add('counterTop', (cx, cy), 0, p, lib='BUILTIN', space=space)


def ceil_jan_kitchen(y):            # the jan24 kitchen's vault (its space's ceiling planes)
    return 6.0299 + 0.41 * y if y < 15.7375 else 18.9347 - 0.41 * y


def jan24_rows():
    R = Rows('FX-A47-'); K = 'SP-L1-A-KITCHEN'
    W0, N0, WC = -6.5298, 26.6698, -6.4099                 # west wall (old back bedroom), north wall, the fridge column's wall (laundry side)
    # -- the fridge column on the west wall: a finished end, a tray cabinet, the refrigerator with a cabinet over it, a finished side
    R.add('finishedPanel', (WC + 1.18, 14.86), 270, {'w': 2.36, 'h': 7.95, 'panels': 1}, lib='BUILTIN', space=K)
    R.add('tallCabinet', (WC, 15.31), 0, dict(CAB, pull='knob', w=0.9, d=2.3, h=7.95), space=K)
    R.add('fridge4Door', (WC, 17.26), 0, {'w': 3.0, 'd': 2.35, 'h': 5.9, 'dispenser': False}, lib='BUILTIN', space=K)
    R.add('upperCabinet', (WC, 17.26), 0, dict(UP, w=3.0, d=2.3, mountY=5.95, h=2.0), space=K)
    R.add('finishedPanel', (WC + 1.18, 18.76), 90, {'w': 2.36, 'h': 7.95, 'panels': 1}, lib='BUILTIN', space=K)
    # -- the sink wall under the west window
    R.add('dishwasher', (W0, 19.82), 0, {'w': 2.0}, space=K)
    R.add('baseCabinet', (W0, 22.32), 0, dict(CAB, w=3.0, doors='sink', pull='knob'), space=K)
    R.add('sinkUndermount', (W0 + 0.38, 22.32), 0, {'w': 2.5, 'd': 1.5, 'mountY': 2.896}, space=K)
    R.add('faucetKitchen', (W0 + 0.22, 22.32), 0, {'mountY': 3}, space=K)
    R.add('baseCabinet', (W0, 25.245), 0, dict(CAB, w=2.85, doors='drawers'), space=K)
    # -- the range wall (north)
    for x, w, d in ((-3.5675, 1.765, 'drawers'), (-1.685, 2.0, 'doors'), (3.315, 2.0, 'doors'), (5.1975, 1.765, 'drawers')):
        R.add('baseCabinet', (x, N0), 270, dict(CAB, w=w, doors=d), space=K)
    R.add('range36', (0.815, N0), 270, {'w': 3.0}, space=K)
    R.add('hoodChimney', (0.815, N0), 270, {'w': 3.0, 'mountY': 6.0, 'toCeiling': 8.42}, space=K)
    R.add('potFiller', (-0.235, N0 - 0.06), 270, {'mountY': 4.95}, lib='BUILTIN', space=K)
    for x, w in ((-5.5575, 1.945), (-3.61, 1.95), (-1.66, 1.95), (3.315, 2.0), (5.1975, 1.765)):
        R.add('upperCabinet', (x, N0), 270, dict(UP, w=w, mountY=4.5, h=3.45, led=True, glass=False), space=K)
    for x, w in ((-3.6075, 5.845), (4.1975, 3.765)):
        R.add('lightRail', (x, N0), 270, {'w': w, 'd': 13 * IN, 'mountY': 4.4}, lib='BUILTIN', space=K)
        R.add('scribeFill', (x, N0), 270, {'w': w, 'd': 13 * IN, 'mountY': 7.95, 'h': 0.5}, lib='BUILTIN', space=K)
    sink = [(W0 + 0.38 + .0125, 22.32 - 1.2375), (W0 + 0.38 + 1.4875, 22.32 - 1.2375), (W0 + 0.38 + 1.4875, 22.32 + 1.2375), (W0 + 0.38 + .0125, 22.32 + 1.2375)]
    counter(R, [(W0, 18.82), (-4.45, 18.82), (-4.45, 24.59), (-0.685, 24.59), (-0.685, N0), (W0, N0)], K, holes=[sink])
    counter(R, [(2.315, 24.59), (6.08, 24.59), (6.08, N0), (2.315, N0)], K)
    counter(R, [(-0.685, N0 - .05), (2.315, N0 - .05), (2.315, N0), (-0.685, N0)], K, mountY=3.0, t=3.0, noSplash=True)
    # -- the island (working side to the range, stools on the sitting-room side) and three globes over it
    R.add('island', (3.12, 16.62), 90, dict(CAB, w=8.25, d=4.4, overhang=1.2, seatingSide='back', counter='quartz', cabDepth=2), space=K)
    for x in (0.17, 2.14, 4.11, 6.08): R.add('counterStoolRope', (x, 15.55), 90, None, lib='BUILTIN', space=K)
    for x in (0.62, 3.12, 5.62):
        z = ceil_jan_kitchen(18.82); R.st('pendantGlobe', (x, 18.82), 0, {'dia': 0.95, 'drop': round(z - 6.95, 3), 'finish': 'blackMetal', 'cord': 'rod'}, z=round(z, 3), space=K)
    # -- the pantry: tall cabinets in the house's finish
    for y, w in ((26.23, 2.2), (28.43, 2.2), (30.63, 2.2)):
        R.add('tallCabinet', (9.88, y), 180, dict(CAB, pull='knob', w=w, d=2.0, h=7.95), space='SP-L1-A-PANTRY')
    # -- sitting room (the old living room): a sofa facing the west windows, two chairs, a game table
    L = 'SP-L1-LIVING'
    R.st('rug2', (-3.6, 7.3), 0, {'w': 10.0, 'd': 8.4, 'pattern': 'sisal'}, space=L)
    R.sofa((0.55, 7.3), 180, 7.6, L, 'ls')
    R.st('coffeeTableGlass', (-3.3, 7.3), 180, {'w': 4.4, 'd': 2.3, 'h': 1.4}, space=L, key='lc')
    R.st('gameTray', (0, 0), 180, {}, on='lc', dx=-0.8); R.st('books', (0, 0), 180, {'n': 3}, on='lc', dx=1.2, dz=.3)
    R.st('armchairBoucle', (-7.25, 4.6), 0, {'fabric': 'fabricLight'}, space=L); R.st('armchairBoucle', (-7.25, 10.0), 0, {'fabric': 'fabricLight'}, space=L)
    R.st('woodSideTable', (-7.7, 7.3), 0, {'dia': 1.8, 'h': 1.9}, space=L, key='lt'); R.st('lamp', (0, 0), 0, {'h': 1.9, 'shadeDia': 1.0}, on='lt')
    # -- dining: glass table, eight parsons chairs, three globes; a sideboard under the south window
    Dn = 'SP-L1-A-DINING'; cx, cy = 14.73, 11.9
    R.st('diningTableGlass', (cx, cy), 90, {'w': 7.6, 'd': 3.4}, space=Dn, key='dt'); R.st('vase', (0, 0), 90, {'h': .7, 'dia': 1.3}, on='dt')
    for t in (-2.533, 0.0, 2.533): R.st('parsonsChair', (cx + t, cy - 2.25), 90, space=Dn); R.st('parsonsChair', (cx + t, cy + 2.25), 270, space=Dn)
    R.st('parsonsChair', (cx - 4.35, cy), 0, space=Dn); R.st('parsonsChair', (cx + 4.35, cy), 180, space=Dn)
    for t in (-2.533, 0.0, 2.533):
        z = 6.0299 + 0.41 * cy; R.st('pendantGlobe', (cx + t, cy), 0, {'dia': 0.95, 'drop': round(z - 6.9, 3), 'finish': 'blackMetal', 'cord': 'rod'}, z=round(z, 3), space=Dn)
    R.st('sideboard', (9.49, 4.81), 90, {'w': 6.0, 'd': 1.6}, space=Dn, key='sb', back=True)
    R.st('lamp', (0, 0), 90, {'h': 2.2}, on='sb', dx=-2.0); R.st('vase2', (0, 0), 90, {'h': 1.0}, on='sb', dx=1.9)
    # -- family room: two sofas across a glass table, the TV on the east wall
    Fm = 'SP-L1-A-FAMILY'
    R.st('rug2', (17.2, 25.6), 90, {'w': 9.0, 'd': 10.0, 'pattern': 'checker'}, space=Fm)
    R.sofa((17.1, 30.45), 270, 7.0, Fm, 'fn'); R.sofa((17.1, 20.75), 90, 7.0, Fm, 'fs')
    R.st('coffeeTableGlass', (17.1, 25.6), 90, {'w': 4.4, 'd': 2.3, 'h': 1.4}, space=Fm, key='fc')
    R.st('orchid', (0, 0), 90, {'h': 1.6}, on='fc', dx=-.9); R.st('books', (0, 0), 90, {'n': 3}, on='fc', dx=1.1, dz=.3)
    for x, kk in ((12.75, 'f1'), (21.45, 'f2')):
        R.st('woodSideTable', (x, 30.6), 270, {'dia': 1.8, 'h': 1.9}, space=Fm, key=kk); R.st('lamp', (0, 0), 270, {'h': 1.9, 'shadeDia': 1.0}, on=kk)
    R.add('consoleTable', (24.03, 25.65), 180, {'w': 6.5}, space=Fm); R.add('tvWall', (24.03, 25.65), 180, {'size': 65}, space=Fm)
    R.st('art', (10.42, 28.4), 0, {'w': 3.0, 'h': 3.6, 'mountY': 4.4, 'style': 'blots', 'seed': 3}, space=Fm, back=True)
    # -- hall
    R.st('art', (27.77, 16.85), 180, {'w': 1.6, 'h': 2.2, 'mountY': 4.6, 'style': 'marks', 'seed': 6, 'mat': .3}, space='SP-L1-A-HALL', back=True)
    # -- the new bath: vanity and lit mirror on the south wall, toilet, a glass shower across the east end
    B = 'SP-L1-A-BATH'
    R.add('vanity', (30.03, 15.646), 90, {'w': 3.5, 'basin': 'rect', 'faucetFinish': 'nickelBrushed', 'hw': 'nickelBrushed', 'sinks': 1, 'splash': 0, 'top': 'marble'}, space=B)
    R.add('mirror', (30.03, 15.646), 90, {'w': 3.0, 'h': 2.75, 'mountY': 4.6, 'frame': 'none', 'cabinet': 0.4, 'ledEdges': 'left', 'panels': 1}, space=B)
    R.add('toilet', (32.6, 15.646), 90, None, space=B)
    R.add('showerGlass', (33.9, 18.17), 0, {'w': 5.0, 'h': 6.6, 'door': True, 'doorW': 2.2, 'finish': 'nickelBrushed'}, space=B)
    R.add('showerSystem', (35.25, 20.66), 270, {'armY': 6.75, 'bar': True, 'finish': 'nickelBrushed', 'grab': 0, 'head': 'round'}, lib='BUILTIN', space=B)
    R.add('towelBar', (31.6, 20.69), 270, {'w': 2.0, 'mountY': 4.0, 'finish': 'nickelBrushed'}, space=B)
    # -- the front (street, south) bedroom: bed on the north wall, a wardrobe wall to the west
    S = 'SP-L1-A-OFFICE'
    R.bed((32.16, 15.104 - 3.725), 270, S, 15.104, nsat=(3.56, 3.56), mat='scarfArrow')
    R.st('art', (32.16, 15.104), 270, {'w': 3.6, 'h': 2.0, 'mountY': 5.2, 'style': 'marks', 'seed': 4, 'mat': .3}, space=S, back=True)
    for y in (6.0, 8.2, 10.4): R.add('tallCabinet', (24.571, y), 0, dict(CAB, pull='knob', w=2.2, d=2.0, h=7.85), space=S)
    R.add('finishedPanel', (24.571 + 1.03, 11.5), 90, {'w': 2.06, 'h': 7.85, 'panels': 1}, lib='BUILTIN', space=S)
    # -- the north bedroom: bed on the north wall, dresser opposite, the wardrobe wall to the west
    N = 'SP-L1-A-AUPAIR'
    R.bed((31.7, 32.0868 - 3.725), 270, N, 32.0868, nsat=(3.7, 3.7), mat='scarfOgee', white=True)
    R.st('dresser', (31.7, 21.231 + 0.835), 90, {'w': 5.0, 'finish': 'cabinetOak', 'hw': 'blackMetal', 'pull': 'bar'}, space=N, key='dr')
    R.st('vase2', (0, 0), 90, {'h': 1.0}, on='dr', dx=1.6); R.st('books', (0, 0), 90, {'n': 2}, on='dr', dx=-1.5)
    R.st('art', (31.7, 21.231), 90, {'w': 3.2, 'h': 2.4, 'mountY': 4.3, 'style': 'grid', 'seed': 9}, space=N, back=True)
    for y in (26.0, 28.3, 30.6): R.add('tallCabinet', (24.571, y), 0, dict(CAB, pull='knob', w=2.3, d=2.0, h=7.95), space=N)
    R.add('finishedPanel', (24.571 + 1.03, 24.85), 270, {'w': 2.06, 'h': 7.95, 'panels': 1}, lib='BUILTIN', space=N)
    return R.F


def apr24b_rows():
    R = Rows('FX-C47-'); K = 'SP-L1-C-KITCHEN'; S0 = 18.2623
    # -- the range wall: a built-in refrigerator column at the pantry end, wall cabinets to one top line under a crown
    R.add('finishedPanel', (13.6078, S0 - 1.18), 180, {'w': 2.36, 'h': 7.95, 'panels': 1}, lib='BUILTIN', space=K)
    R.add('fridge4Door', (15.11, S0), 270, {'w': 3.0, 'd': 2.35, 'h': 5.9, 'dispenser': False}, lib='BUILTIN', space=K)
    R.add('upperCabinet', (15.11, S0), 270, dict(UP, w=3.0, d=2.3, mountY=5.95, h=2.0), space=K)
    R.add('finishedPanel', (16.61, S0 - 1.18), 0, {'w': 2.36, 'h': 7.95, 'panels': 1}, lib='BUILTIN', space=K)
    R.add('cabinetCrown', (15.14, S0), 270, {'w': 3.12, 'd': 2.36, 'mountY': 7.95, 'endL': True, 'endR': True}, lib='BUILTIN', space=K)
    R.add('baseCabinet', (17.585, S0), 270, dict(CAB, w=1.83, doors='drawers'), space=K)
    R.add('range36', (20.0, S0), 270, {'w': 3.0}, space=K)
    R.add('hoodChimney', (20.0, S0), 270, {'w': 3.0, 'mountY': 6.0, 'toCeiling': 13.55}, space=K)
    R.add('potFiller', (18.95, S0 - 0.06), 270, {'mountY': 4.95}, lib='BUILTIN', space=K)
    R.add('baseCabinet', (22.73, S0), 270, dict(CAB, w=2.46, doors='doors'), space=K)
    R.add('finishedPanel', (23.96, S0 - 1.04), 0, {'w': 2.08, 'h': 2.896, 'panels': 1}, lib='BUILTIN', space=K)
    for x, w, er in ((17.585, 1.83, False), (22.73, 2.46, True)):
        R.add('upperCabinet', (x, S0), 270, dict(UP, w=w, mountY=4.5, h=3.45, led=True, glass=False), space=K)
        R.add('lightRail', (x, S0), 270, {'w': w, 'd': 13 * IN, 'mountY': 4.4}, lib='BUILTIN', space=K)
        R.add('cabinetCrown', (x, S0), 270, {'w': w, 'd': 13 * IN, 'mountY': 7.95, 'endL': False, 'endR': er}, lib='BUILTIN', space=K)
    R.add('endPanel', (23.96, S0 - 0.54), 0, {'w': 13 * IN, 'h': 3.45, 'mountY': 4.5}, lib='BUILTIN', space=K)
    counter(R, [(16.67, S0 - 2.08), (18.5, S0 - 2.08), (18.5, S0), (17.585, S0), (16.67, S0)], K)
    counter(R, [(21.5, S0 - 2.08), (24.02, S0 - 2.08), (24.02, S0), (21.5, S0)], K)
    counter(R, [(18.5, S0 - .05), (21.5, S0 - .05), (21.5, S0), (18.5, S0)], K, mountY=3.0, t=3.0, noSplash=True)
    # -- the 13-ft island and six rope stools, three globes over it
    R.add('island', (17.64, 9.67), 90, dict(CAB, w=13.1, d=3.0, overhang=1.0, seatingSide='back', sink=True, counter='quartz', cabDepth=2), space=K)
    for i in range(6): R.add('counterStoolRope', (12.5 + 2.08 * i, 8.45), 90, None, lib='BUILTIN', space=K)
    for x in (13.6, 17.64, 21.7):
        z = 6.0299 + 0.41 * 11.17; R.st('pendantGlobe', (x, 11.17), 0, {'dia': 0.95, 'drop': round(z - 6.95, 3), 'finish': 'blackMetal', 'cord': 'rod'}, z=round(z, 3), space=K)
    # -- the pantry: tall cabinets either side of the way through to the bedroom hall, under a crown
    for y, w in ((16.9, 1.95), (18.9, 1.95), (20.85, 1.95)): R.add('tallCabinet', (5.2776, y), 0, dict(CAB, pull='knob', w=w, d=2.0, h=7.95), space=K)
    for y, w in ((19.2, 1.75), (20.95, 1.75)): R.add('tallCabinet', (13.548, y), 180, dict(CAB, pull='knob', w=w, d=2.0, h=7.95), space=K)
    R.add('cabinetCrown', (5.2776, 18.875), 0, {'w': 5.9, 'd': 2.0, 'mountY': 7.95, 'endL': True, 'endR': True}, lib='BUILTIN', space=K)
    R.add('cabinetCrown', (13.548, 20.075), 180, {'w': 3.5, 'd': 2.0, 'mountY': 7.95, 'endL': True, 'endR': True}, lib='BUILTIN', space=K)
    R.add('finishedPanel', (13.548 - 1.03, 18.325), 270, {'w': 2.06, 'h': 7.95, 'panels': 1}, lib='BUILTIN', space=K)
    # -- dining: a buffet on the north wall, glass table for six, three globes
    Dn = 'SP-L1-C-DINING'
    R.add('finishedPanel', (28.46, S0 - 1.04), 180, {'w': 2.08, 'h': 2.896, 'panels': 1}, lib='BUILTIN', space=Dn)
    for i, d in enumerate(('doors', 'drawers', 'drawers', 'doors')): R.add('baseCabinet', (28.46 + 1.0325 + 2.065 * i, S0), 270, dict(CAB, w=2.065, doors=d), space=Dn)
    counter(R, [(28.4, S0 - 2.08), (36.5905, S0 - 2.08), (36.5905, S0), (28.4, S0)], Dn)
    R.st('art', (32.5, S0), 270, {'w': 4.6, 'h': 3.1, 'mountY': 4.8, 'style': 'blots', 'seed': 3}, space=Dn, back=True)
    cx, cy = 29.95, 10.42
    R.st('diningTableGlass', (cx, cy), 0, {'w': 6.6, 'd': 3.3}, space=Dn, key='dt'); R.st('vase', (0, 0), 0, {'h': .7, 'dia': 1.3}, on='dt')
    for t in (-2.2, 0.0, 2.2): R.st('parsonsChair', (cx - 2.2, cy + t), 0, space=Dn); R.st('parsonsChair', (cx + 2.2, cy + t), 180, space=Dn)
    for t in (-2.2, 0.0, 2.2):
        z = 6.0299 + 0.41 * (cy + t); R.st('pendantGlobe', (cx, cy + t), 0, {'dia': 0.95, 'drop': round(z - 6.9, 3), 'finish': 'blackMetal', 'cord': 'rod'}, z=round(z, 3), space=Dn)
    # -- family room (the old living room): sofa on the west wall, two chairs, the TV on the north wall
    L = 'SP-L1-LIVING'
    R.st('rug2', (-3.2, 7.5), 0, {'w': 10.0, 'd': 8.4, 'pattern': 'sisal'}, space=L)
    R.sofa((-7.9, 7.5), 0, 8.4, L, 'ls')
    R.st('coffeeTableGlass', (-3.6, 7.5), 0, {'w': 4.4, 'd': 2.3, 'h': 1.4}, space=L, key='lc')
    R.st('orchid', (0, 0), 0, {'h': 1.6}, on='lc', dx=-.9); R.st('books', (0, 0), 0, {'n': 3}, on='lc', dx=1.1, dz=.3)
    R.st('armchairBoucle', (1.2, 4.7), 180, {'fabric': 'fabricLight'}, space=L); R.st('armchairBoucle', (1.2, 10.3), 180, {'fabric': 'fabricLight'}, space=L)
    for y, kk in ((2.4, 'l1'), (12.6, 'l2')):
        R.st('woodSideTable', (-8.4, y), 0, {'dia': 1.8, 'h': 1.9}, space=L, key=kk); R.st('lamp', (0, 0), 0, {'h': 1.9, 'shadeDia': 1.0}, on=kk)
    R.add('consoleTable', (-2.25, 16.654), 270, {'w': 7}, space=L); R.add('tvWall', (-2.25, 16.654), 270, {'size': 65}, space=L)
    # -- hall
    R.st('art', (13.548, 23.9), 180, {'w': 1.6, 'h': 2.2, 'mountY': 4.6, 'style': 'marks', 'seed': 6, 'mat': .3}, space='SP-L1-C-HALL', back=True)
    # -- back bedroom (it was an office): bed on the north wall, a dresser under the west window
    Bk = 'SP-L1-C-OFFICE'
    R.bed((-0.8, 26.6698 - 3.725), 270, Bk, 26.6698, nsat=(3.6, 3.6), mat='scarfOgee', white=True)
    R.st('art', (-0.8, 26.6698), 270, {'w': 3.4, 'h': 2.0, 'mountY': 5.0, 'style': 'marks', 'seed': 2, 'mat': .3}, space=Bk, back=True)
    R.st('dresser', (-6.4099 + 0.835, 21.75), 0, {'w': 4.5, 'finish': 'cabinetOak', 'hw': 'blackMetal', 'pull': 'bar'}, space=Bk, key='bd')
    R.st('vase2', (0, 0), 0, {'h': 1.0}, on='bd', dx=1.4); R.st('books', (0, 0), 0, {'n': 2}, on='bd', dx=-1.3)
    # -- middle bedroom: bed on the east wall, dresser on the west wall
    M = 'SP-L1-C-AUPAIR'
    R.bed((23.9648 - 3.725, 26.5), 180, M, 23.9648, nsat=(3.7, 3.7), mat='scarfArrow')
    R.st('art', (23.9648, 26.5), 180, {'w': 3.6, 'h': 2.0, 'mountY': 5.2, 'style': 'marks', 'seed': 8, 'mat': .3}, space=M, back=True)
    R.st('dresser', (13.9232 + 0.835, 28.2), 0, {'w': 5.0, 'finish': 'cabinetOak', 'hw': 'blackMetal', 'pull': 'bar'}, space=M, key='md')
    R.st('vase2', (0, 0), 0, {'h': 1.0}, on='md', dx=1.6); R.st('books', (0, 0), 0, {'n': 2}, on='md', dx=-1.5)
    # -- front bedroom (no exercise bike): bed on the south wall between the door and the windows, a reading chair
    Fr = 'SP-L1-C-GYM'
    R.bed((32.1, 18.6376 + 3.725), 90, Fr, 18.6376, nsat=(3.55, 3.55), mat='scarfArrow')
    R.st('art', (32.1, 18.6376), 90, {'w': 3.6, 'h': 2.0, 'mountY': 5.2, 'style': 'marks', 'seed': 4, 'mat': .3}, space=Fr, back=True)
    R.st('armchairBoucle', (26.2, 27.3), 315, {'fabric': 'fabricLight'}, space=Fr)
    return R.F


KEEP = {'jan24': lambda f: not f['id'].startswith('FX-A-') and not f['id'].startswith('FX-A47-'),
        'apr24b': lambda f: not f['id'].startswith('FX-C-') and not f['id'].startswith('FX-C47-')}
ROWS = {'jan24': jan24_rows, 'apr24b': apr24b_rows}

# room outlines (plan feet): a walk names the room it stands in; `stop` = the house's stop whose place the idea's stops take
ROOMS = {
    'jan24': [
        {'name': 'Sitting room', 'stop': 'living', 'poly': [[-9.53, -0.75], [4.76, -0.75], [4.76, 4.40], [5.09, 4.40], [5.09, 14.80], [-6.42, 14.80], [-6.42, 14.32], [-9.53, 14.32]]},
        {'name': 'Laundry', 'stop': 'living', 'poly': [[-9.53, 14.32], [-6.42, 14.32], [-6.42, 18.42], [-9.53, 18.42]]},
        {'name': 'Kitchen', 'stop': 'backbed', 'poly': [[-6.42, 14.80], [8.90, 14.80], [8.90, 24.79], [6.08, 24.79], [6.08, 26.67], [-6.53, 26.67], [-6.53, 18.82], [-6.42, 18.82]]},
        {'name': 'Pantry', 'stop': 'middlebed', 'poly': [[6.08, 24.79], [10.42, 24.79], [10.42, 32.09], [5.22, 32.09], [5.22, 26.67], [6.08, 26.67]]},
        {'name': 'Dining', 'stop': 'great', 'poly': [[5.09, 4.81], [24.03, 4.81], [24.03, 17.0], [8.90, 17.0], [8.90, 14.80], [5.09, 14.80]]},
        {'name': 'Family room', 'stop': 'middlebed', 'poly': [[8.90, 17.0], [24.03, 17.0], [24.03, 32.09], [10.42, 32.09], [10.42, 24.79], [8.90, 24.79]]},
        {'name': 'Hall', 'stop': 'hallbath', 'poly': [[24.03, 15.65], [27.77, 15.65], [27.77, 20.69], [24.03, 20.69]]},
        {'name': 'Bath', 'stop': 'hallbath', 'poly': [[27.77, 15.65], [36.59, 15.65], [36.59, 20.69], [27.77, 20.69]]},
        {'name': 'Bedroom', 'stop': 'mainbeds', 'poly': [[24.57, 20.69], [36.59, 20.69], [36.59, 32.09], [24.57, 32.09]]},
        {'name': 'Bedroom', 'stop': 'mainbeds', 'poly': [[24.57, 4.81], [36.59, 4.81], [36.59, 15.65], [24.57, 15.65]]}],
    'apr24b': [
        {'name': 'Family room', 'stop': 'living', 'poly': [[-9.53, -0.75], [4.76, -0.75], [4.76, 4.40], [5.09, 4.40], [5.09, 15.58], [4.90, 15.58], [4.90, 16.65], [-9.53, 16.65]]},
        {'name': 'Bedroom', 'stop': 'backbed', 'poly': [[-6.53, 16.65], [5.28, 16.65], [5.28, 26.67], [-6.53, 26.67]]},
        {'name': 'Pantry', 'stop': 'kitchen', 'poly': [[5.28, 18.26], [13.55, 18.26], [13.55, 21.95], [5.28, 21.95]]},
        {'name': 'Kitchen', 'stop': 'kitchen', 'poly': [[5.09, 4.81], [24.20, 4.81], [24.20, 18.26], [5.09, 18.26]]},
        {'name': 'Dining', 'stop': 'great', 'poly': [[24.20, 4.81], [36.59, 4.81], [36.59, 18.26], [24.20, 18.26]]},
        {'name': 'Hall', 'stop': 'hallbath', 'poly': [[5.28, 21.95], [13.55, 21.95], [13.55, 25.56], [5.28, 25.56]]},
        {'name': 'Hall bath', 'stop': 'hallbath', 'poly': [[5.22, 25.56], [13.55, 25.56], [13.55, 32.09], [5.22, 32.09]]},
        {'name': 'Bedroom', 'stop': 'middlebed', 'poly': [[13.55, 18.26], [24.15, 18.26], [24.15, 32.09], [13.55, 32.09]]},
        {'name': 'Bedroom', 'stop': 'mainbeds', 'poly': [[24.15, 18.26], [36.59, 18.26], [36.59, 32.09], [24.15, 32.09]]}],
}
CARD = {
    'jan24': {'short': 'Illustrative idea', 'label': 'Illustrative idea.', 'status': 'illustrative', 'pageExtras': True,
              'stats': [['Family room', '15 × 15 ft'], ['Kitchen island', '8 ft'], ['Dining table', 'Seats 8']],
              'description': 'Kitchen, dining and family room in one open space, with the kitchen at the back of the house and a sitting room in the old living room. A new bath sits between two bedrooms at the street end.'},
    'apr24b': {'short': 'Illustrative idea', 'label': 'Illustrative idea.', 'status': 'illustrative', 'pageExtras': True,
               'stats': [['Kitchen island', '13 ft'], ['Counter stools', '6'], ['Dining table', 'Seats 6']],
               'description': 'The kitchen opens to the dining room around a 13-ft island, with a pantry beside it. The family room, the hall bath and the three main-level bedrooms keep rooms of their own.'},
}
LABELS = {'apr24b': {'Pantry wall': 'Pantry'}, 'jan24': {'Sitting / games': 'Sitting room'}}


# ------------------------------------------------------------------------------------------------ geometry
def Wp(x, y, z):                     # BIM plan (x east, y north, z up) -> package world (X = BIM y, Y = z, Z = BIM x)
    return np.array([y, z, x], float)


class Mesher:
    def __init__(self):
        self.P = []; self.N = []; self.T = []
    def face(self, pts, n):
        """a convex planar face (BIM points, counter-clockwise or not) with outward normal n (BIM)"""
        P = [Wp(*p) for p in pts]; nw = Wp(*n); nw = nw / np.linalg.norm(nw); b = len(self.P)
        for q in P: self.P.append(q); self.N.append(nw)
        for i in range(1, len(P) - 1):
            t = [b, b + i, b + i + 1]
            if np.cross(P[i] - P[0], P[i + 1] - P[0]) @ nw < 0: t = [b, b + i + 1, b + i]
            self.T.append(t)
    def box(self, x0, y0, z0, x1, y1, z1, faces='xXyYzZ'):
        if 'x' in faces: self.face([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0))
        if 'X' in faces: self.face([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0))
        if 'y' in faces: self.face([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0))
        if 'Y' in faces: self.face([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0))
        if 'z' in faces: self.face([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1))
        if 'Z' in faces: self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1))
    def arrays(self):
        return np.array(self.P), np.array(self.N), np.array(self.T, dtype=np.int64)


def ensure_material(g, name, src):
    J = g.J
    if any(m.get('name') == name for m in J['materials']): return
    m = next(m for m in src.J['materials'] if m.get('name') == name); J['materials'].append(json.loads(json.dumps(m))); g.dirty = True


def mesh_for(g, group, storey, mat):
    name = '%s|%s|%s' % (group, storey, mat)
    for p in g.prims:
        if g.J['meshes'][p['mesh']].get('name') == name and not g.J['meshes'][p['mesh']].get('extras', {}).get('leaf'): return p
    return g.add_mesh(name, {'group': group, 'storey': storey, 'material': mat}, mat)


def has_el(g, el):
    return any(r[0] == el for p in g.prims for r in g.J['meshes'][p['mesh']].get('extras', {}).get('ranges', []))


def put(g, el, group, mat, M, storey='L1'):
    P, N, T = M.arrays(); p = mesh_for(g, group, storey, mat); D46.add_run(g, p, el, P, N, T)


def slab_leaves(g, el, slabs):
    """door leaves drawn as slabs, one run per material (doors46.py's do_box_leaves makes each the house's three-panel leaf, a sliding
    pair with finger pulls)"""
    M = Mesher(); F = Mesher()
    for x0, y0, z0, x1, y1, z1 in slabs:
        M.box(x0, y0, z0, x1, y1, z1); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; F.box(cx - .1, cy - .01, z0 + 1, cx + .1, cy + .01, z0 + 1.2)
    put(g, el, 'openings', LEAF, M); put(g, el, 'openings', FIELD, F)


def laundry_front(g, rep):
    """jan24: the stacked washer and dryer stood open to the sitting room. A wall across the closet front (the sitting room's vault on
    its south face, the closet's on its north), a cased 2'-6" opening and a pair of sliding doors."""
    el, de = 'W-L1-A47L', 'D-L1-A47L'
    if has_el(g, el): rep.append(('jan24', el, 'already there')); return []
    XA, XB, YS, YN = -9.535, -6.42, 14.32, 14.80; OA, OB, H = -9.23, -6.71, 6.7812
    zs = lambda x: 10.2201 + 0.2548 * x                 # the sitting room's vault over the south face
    zn = 6.0299 + 0.41 * YN                              # the closet's ceiling at its south edge
    M = Mesher()
    for a, b in ((XA, OA), (OB, XB)): M.face([(a, YS, 0), (b, YS, 0), (b, YS, zs(b)), (a, YS, zs(a))], (0, -1, 0))
    M.face([(OA, YS, H), (OB, YS, H), (OB, YS, zs(OB)), (OA, YS, zs(OA))], (0, -1, 0))
    for a, b in ((XA, OA), (OB, XB)): M.face([(a, YN, 0), (b, YN, 0), (b, YN, zn), (a, YN, zn)], (0, 1, 0))
    M.face([(OA, YN, H), (OB, YN, H), (OB, YN, zn), (OA, YN, zn)], (0, 1, 0))
    M.face([(XA, YS, zs(XA)), (XB, YS, zs(XB)), (XB, YN, zn)], (0, -0.9, 1)); M.face([(XA, YS, zs(XA)), (XB, YN, zn), (XA, YN, zn)], (0, -0.9, 1))
    M.face([(XB, YS, 0), (XB, YN, 0), (XB, YN, zn), (XB, YS, zs(XB))], (1, 0, 0))
    put(g, el, 'walls', PAINT, M)
    Ln = Mesher(); Ln.box(OA - .001, YS, 0, OA + .0625, YN, H, faces='X'); Ln.box(OB - .0625, YS, 0, OB + .001, YN, H, faces='x'); Ln.box(OA, YS, H - .0625, OB, YN, H + .001, faces='z')
    Ln.box(OA, YS, H - .0625, OA + .0625, YN, H, faces='z'); put(g, el, 'openings', LINING, Ln)
    # casing on the sitting-room face (3-1/2 in, the house's), legs to the floor
    C = Mesher(); cw, ct = 0.29, 0.06
    C.box(OA - cw, YS - ct, 0, OA, YS, H + cw, faces='xXyZ'); C.box(OB, YS - ct, 0, OB + cw, YS, H + cw, faces='xXyZ'); C.box(OA, YS - ct, H, OB, YS, H + cw, faces='yZz')
    put(g, el, 'trim', TRIM, C)
    # the sliding pair: 1-3/8 in leaves on two tracks, lapping 1 in at the middle, shut
    lw = (OB - OA - 2 * .0625 + 1 * IN) / 2; t = 0.1146; a0 = OA + .0625; b0 = OB - .0625
    slab_leaves(g, de, [(a0, YS + 0.215, 0.031, a0 + lw, YS + 0.215 + t, H - .07), (b0 - lw, YS + 0.06, 0.031, b0, YS + 0.06 + t, H - .07)])
    rep.append(('jan24', el, 'closet front: wall, cased opening %.2f ft, two sliding leaves %.2f ft' % (OB - OA, lw)))
    cols = [{'id': el + '#0', 'element': el, 'kind': 'WALL', 'poly': [[XA, YS], [OA, YS], [OA, YN], [XA, YN]], 'z0': 0, 'z1': 8.0, 'storey': 'L1', 'exterior': False},
            {'id': el + '#1', 'element': el, 'kind': 'WALL', 'poly': [[OB, YS], [XB, YS], [XB, YN], [OB, YN]], 'z0': 0, 'z1': 8.0, 'storey': 'L1', 'exterior': False},
            {'id': de + '#0', 'element': de, 'kind': 'WALL', 'poly': [[OA, YS], [OB, YS], [OB, YN], [OA, YN]], 'z0': 0, 'z1': H, 'storey': 'L1', 'exterior': False}]
    return cols


def shower_tile(g, rep):
    """jan24: subway tile on the shower's three walls, to 7 ft, stopping at the window's casing"""
    el = 'TL-L1-A47S'
    if has_el(g, el): rep.append(('jan24', el, 'already there')); return
    X0, XE, YS, YN, Z1, t = 33.9, 36.5905, 15.646, 20.689, 7.0, 0.03
    wy0, wy1, wz0 = 17.24 - 0.30, 19.49 + 0.30, 4.0 - 0.36            # WN-L1-A07 with its casing and apron
    M = Mesher(); xe = XE - t
    for a, b, z0, z1 in ((YS, wy0, 0, Z1), (wy1, YN, 0, Z1), (wy0, wy1, 0, wz0)): M.face([(xe, a, z0), (xe, b, z0), (xe, b, z1), (xe, a, z1)], (-1, 0, 0))
    M.face([(xe, wy0, wz0), (XE, wy0, wz0), (XE, wy1, wz0), (xe, wy1, wz0)], (0, 0, 1))
    M.face([(xe, wy0, wz0), (XE, wy0, wz0), (XE, wy0, Z1), (xe, wy0, Z1)], (0, 1, 0)); M.face([(xe, wy1, wz0), (XE, wy1, wz0), (XE, wy1, Z1), (xe, wy1, Z1)], (0, -1, 0))
    for a, b in ((YS, wy0), (wy1, YN)): M.face([(xe, a, Z1), (XE, a, Z1), (XE, b, Z1), (xe, b, Z1)], (0, 0, 1))
    for y, sg in ((YS + t, 1), (YN - t, -1)):
        M.face([(X0, y, 0), (xe, y, 0), (xe, y, Z1), (X0, y, Z1)], (0, sg, 0))
        y0, y1 = (YS, YS + t) if sg > 0 else (YN - t, YN)
        M.face([(X0, y0, Z1), (xe, y0, Z1), (xe, y1, Z1), (X0, y1, Z1)], (0, 0, 1)); M.face([(X0, y0, 0), (X0, y1, 0), (X0, y1, Z1), (X0, y0, Z1)], (-1, 0, 0))
    put(g, el, 'walls', TILE, M); rep.append(('jan24', el, 'subway tile on three shower walls to 7 ft'))


def back_bedroom_door(g, src, rep):
    """apr24b: the back bedroom opened straight onto the hall (a 2.9-ft gap, no door). Wall returns, a header to each ceiling, lining,
    casings on both faces and a 2'-4" leaf standing open against... the room, with the house's knobs."""
    el, de = 'W-L1-C47D', 'D-L1-C47D'
    if has_el(g, el): rep.append(('apr24b', el, 'already there')); return []
    for m in (PAINT, TRIM, LINING, LEAF, FIELD, NICKEL): ensure_material(g, m, src)
    XW, XE, YA, YB, H = 4.9024, 5.2776, 22.4879, 25.3678, 6.7812
    DA, DB = 22.74, 25.12                                  # the rough opening (2.38 ft)
    zw = lambda y: 18.9347 - 0.41 * y; ze = lambda y: 21.1556 - 0.41 * y
    M = Mesher()
    for a, b in ((YA, DA), (DB, YB)):
        M.face([(XW, a, 0), (XW, b, 0), (XW, b, zw(b)), (XW, a, zw(a))], (-1, 0, 0)); M.face([(XE, a, 0), (XE, b, 0), (XE, b, ze(b)), (XE, a, ze(a))], (1, 0, 0))
    M.face([(XW, DA, H), (XW, DB, H), (XW, DB, zw(DB)), (XW, DA, zw(DA))], (-1, 0, 0)); M.face([(XE, DA, H), (XE, DB, H), (XE, DB, ze(DB)), (XE, DA, ze(DA))], (1, 0, 0))
    M.face([(XW, YA, zw(YA)), (XE, YA, ze(YA)), (XE, YB, ze(YB)), (XW, YB, zw(YB))], (-.4, 0, 1))
    put(g, el, 'walls', PAINT, M)
    Ln = Mesher(); Ln.box(XW, DA - .001, 0, XE, DA + .0625, H, faces='Y'); Ln.box(XW, DB - .0625, 0, XE, DB + .001, H, faces='y'); Ln.box(XW, DA, H - .0625, XE, DB, H + .001, faces='z')
    put(g, el, 'openings', LINING, Ln)
    C = Mesher(); cw, ct = 0.24, 0.06
    for x, sg in ((XW, -1), (XE, 1)):
        x0, x1 = (x - ct, x) if sg < 0 else (x, x + ct); f = 'x' if sg < 0 else 'X'
        C.box(x0, DA - cw, 0, x1, DA, H + cw, faces=f + 'yYZ'); C.box(x0, DB, 0, x1, DB + cw, H + cw, faces=f + 'yYZ'); C.box(x0, DA, H, x1, DB, H + cw, faces=f + 'Zz')
    put(g, el, 'trim', TRIM, C)
    # the leaf: 2'-4" x 1-3/8", hinged at the south jamb on the bedroom face, standing open 90 degrees into the room
    lw, t, hx, hy = DB - DA - 2 * .0625 - .02, 0.1146, XW + 0.02, DA + .0625 + .01
    slab_leaves(g, de, [(hx - lw, hy, 0.031, hx, hy + t, H - .07)])
    pn, _ = D46.nickel_prim(g, de, None, 'L1'); Ps, Ns, Ts = [], [], []; n0 = 0
    for yf, sg in ((hy, -1), (hy + t, 1)):
        kp, kn, kt = D46.knob(Wp(hx - lw + 0.198, yf, 3.0), np.array([sg, 0.0, 0.0])); Ps.append(kp); Ns.append(kn); Ts.append(kt + n0); n0 += len(kp)
    D46.add_run(g, pn, de, np.concatenate(Ps), np.concatenate(Ns), np.concatenate(Ts)); g.J['meshes'][pn['mesh']]['extras'].setdefault('hardware', {})[de] = D46.MARK
    rep.append(('apr24b', el, 'back bedroom door: opening %.2f ft, leaf %.2f ft standing open, knobs' % (DB - DA, lw)))
    return [{'id': el + '#0', 'element': el, 'kind': 'WALL', 'poly': [[XW, YA], [XE, YA], [XE, DA], [XW, DA]], 'z0': 0, 'z1': 8.0, 'storey': 'L1', 'exterior': False},
            {'id': el + '#1', 'element': el, 'kind': 'WALL', 'poly': [[XW, DB], [XE, DB], [XE, YB], [XW, YB]], 'z0': 0, 'z1': 8.0, 'storey': 'L1', 'exterior': False},
            {'id': de + '#0', 'element': de, 'kind': 'WALL', 'poly': [[hx - lw, hy], [hx, hy], [hx, hy + t], [hx - lw, hy + t]], 'z0': 0, 'z1': H, 'storey': 'L1', 'exterior': False}]


def pantry_wall_paint(g, rep):
    """jan24: the pantry's west wall kept the old hall bath's subway tile (W-L1-032, to 4.5 ft); a pantry wall is painted"""
    for p in list(g.prims):
        me = g.J['meshes'][p['mesh']]
        if me.get('name') != 'walls|L1|tile-subway': continue
        for r in list(me['extras'].get('ranges', [])):
            if r[0] != 'W-L1-032' or r[3] == 0: continue
            tri = p['I'][r[2]:r[2] + r[3]]; P = p['V'][:, :3].astype(float) + g.trans(p['mesh']); N = p['V'][:, 3:6].astype(float)
            vs = np.unique(tri); idx = {v: i for i, v in enumerate(vs)}; P2 = P[vs]; N2 = N[vs]; T2 = np.vectorize(idx.get)(tri)
            q = mesh_for(g, 'walls', 'L1', PAINT); D46.add_run(g, q, 'W-L1-032', P2, N2, T2)
            D46.replace_run(g, p, r, np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 3), int))
            rep.append(('jan24', 'W-L1-032', 'pantry wall: subway tile (%d triangles) painted' % len(tri)))


# ------------------------------------------------------------------------------------------------ main
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def main():
    rep = []; d0 = os.path.join(ROOT, 'tour', 'bim2'); base = D46.Glb(os.path.join(d0, 'scene.glb'))
    new_cols = {}
    # 1. GLB (tour), then copied to the holiday sites
    for v in ('jan24', 'apr24b'):
        gp = os.path.join(d0, 'scene.opt-OS-REMODEL-%s.glb' % v); g = D46.Glb(gp); cols = []
        if v == 'jan24':
            for m in (PAINT, TRIM, LINING, LEAF, FIELD, TILE): ensure_material(g, m, base)
            cols += laundry_front(g, rep); shower_tile(g, rep); pantry_wall_paint(g, rep)
        else:
            cols += back_bedroom_door(g, base, rep)
        if g.dirty: g.save()
        new_cols[v] = cols
    # 2. option metas (tour), then copied
    for v in ('jan24', 'apr24b'):
        mp = os.path.join(d0, 'scene.opt-OS-REMODEL-%s.meta.json' % v); M = json.load(open(mp))
        M['furnishings'] = [f for f in M['furnishings'] if KEEP[v](f)] + ROWS[v]()
        have = {c['id'] for c in M['colliders']}
        M['colliders'] += [c for c in new_cols[v] if c['id'] not in have]
        open(mp, 'w').write(json.dumps(M, separators=(',', ':'), ensure_ascii=False))
    # 3. copies, scene.meta options, labels
    for site in SITES:
        d = os.path.join(ROOT, site, 'bim2'); mp = os.path.join(d, 'scene.meta.json')
        if not os.path.exists(mp): continue
        if site != 'tour':
            for v in ('jan24', 'apr24b'):
                for ext in ('glb', 'meta.json'):
                    s, t = os.path.join(d0, 'scene.opt-OS-REMODEL-%s.%s' % (v, ext)), os.path.join(d, 'scene.opt-OS-REMODEL-%s.%s' % (v, ext))
                    if os.path.exists(t) and open(s, 'rb').read() != open(t, 'rb').read(): open(t, 'wb').write(open(s, 'rb').read())
        meta = json.load(open(mp))
        for o in meta.get('options', []):
            v = o.get('legacyId')
            if v in CARD:
                o.update(CARD[v]); o['rooms'] = ROOMS[v]
            p = os.path.join(d, o['glb'])
            if os.path.exists(p): o['sha256'] = sha(p)
        new = json.dumps(meta, separators=(',', ':'), ensure_ascii=False)
        if open(mp).read() != new: open(mp, 'w').write(new)
        bp = os.path.join(ROOT, site, 'bim', 'hillside.bim.json')
        if os.path.exists(bp):
            t = open(bp).read(); t0 = t
            for v, mp_ in LABELS.items():
                for a, b in mp_.items(): t = re.sub(r'("id":\s*"%s-L\d+",\s*"ifc":\s*"IfcAnnotation",\s*"kind":\s*"roomLabel",\s*"name":\s*)"%s"' % (v, re.escape(a)), lambda q: q.group(1) + '"%s"' % b, t)
            for v in CARD:
                t = re.sub(r'("id":\s*"%s",\s*"name":\s*"[^"]*",\s*"short":\s*"[^"]*",[^{}]*?"description":\s*)"[^"]*"' % v, lambda q, v=v: q.group(1) + json.dumps(CARD[v]['description'], ensure_ascii=False), t)
            if t != t0: open(bp, 'w').write(t); rep.append((site, 'hillside.bim.json', 'labels and card text'))
    for r in rep: print(' | '.join(str(x) for x in r))


if __name__ == '__main__':
    main()
