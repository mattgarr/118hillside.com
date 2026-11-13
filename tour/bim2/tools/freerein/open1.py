"""Concept 1 with the whole gable box open: three variants (sketches only).
usage: python3 tour/bim2/tools/freerein/open1.py <out-dir>"""
import sys, os, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fr import Plan, RIDGE
from concepts import XW, DOOR
from PIL import Image, ImageDraw, ImageFont

DROP = ('WN-L1-03', 'WN-L1-08', 'WN-L1-09', 'WN-L1-11')

def kitchen_dining(p):
    """concept 1's axis, unchanged: range, island, table, folding wall, deck"""
    p.tall(17.69, 30.0, 20.2, 32.09, 'PAN'); p.app(20.2, 29.6, 23.2, 32.09, 'REF'); p.counter(23.2, 30.0, 31.1, 32.09); p.range_(25.65, 29.95, 28.65, 32.09)
    p.tall(31.1, 30.0, 33.6, 32.09, 'OVENS'); p.tall(33.6, 30.0, 36.59, 32.09, 'PAN'); p.uppers(25.4, 31.0, 28.9, 32.09)
    p.win(24.4, 2.2, 'h', 32.29); p.win(29.9, 2.2, 'h', 32.29)
    p.counter(22.15, 22.5, 32.15, 26.0, 'island'); p.sink(24.2, 24.1, 26.9, 25.7, True); p.dw(27.1, 24.0, 29.1, 26.0); p.text(30.6, 24.2, 'ISLAND 10 FT', 6.5)
    p.stools([(23.85, 21.8), (26.05, 21.8), (28.25, 21.8), (30.45, 21.8)])
    p.dining(27.15, 13.0, 'h', 8.0, 3.5, 3, leaf=10.0)
    p.fold(20.0, 34.3); p.otable(27.15, -0.5)
    p.room(27.15, 28.0, 'KITCHEN'); p.room(27.15, 7.6, 'DINING')
    p.room(27.15, 13.45, 'SEATS 8: 96 x 42 IN', small=True); p.room(27.15, 12.55, '10 WITH LEAVES', small=True)
    p.note(33.6, -2.6, 'DECK'); p.note(27.15, 3.65, 'FOLDING GLASS WALL')
    p.dim(22.6, 4.81, 22.6, 9.65); p.dim(22.75, 16.35, 22.75, 21.2); p.dim(24.4, 26.0, 24.4, 30.0); p.dim(32.75, 14.5, 36.59, 14.5)
    p.ridge(5.28, 36.59, posts=[(17.5, RIDGE)], lab=29.5)
    p.room(-2.3, -5.6, 'ENTRY FOYER', 90); p.room(9.0, -7.3, 'FRONT PORCH', small=True)

def wing(p):
    """outside the gable box: the back bedroom as built (one closet), a vestibule in the old hall closet, a 3/4 bath across the north end
    of the old living room with its shower in the old laundry closet, and a stacked washer and dryer"""
    p.wall(XW, 4.6, XW, 5.2); p.wall(XW, 9.0, XW, 26.67)
    p.wall(-6.6, 14.32, -6.6, 18.6); p.wall(-9.53, 14.51, 4.9, 14.51); p.door(-7.97, 14.51, 2.33, 'h', kind='cased'); p.door(1.5, 14.51, 2.8, 'h', kind='cased')
    p.wall(-6.41, 16.93, 4.9, 16.93, .3); p.door(-3.4, 16.93, 5.4, 'h', kind='slide', t=.3); p.wall(-0.33, 14.7, -0.33, 16.93, .3)
    p.closet(-6.3, 14.75, -0.5, 16.75, None); p.room(-3.4, 15.35, 'CLOSET', small=True)
    p.door(1.6, 16.93, 2.67, 'h', 'hi', 1, t=.3)
    p.bed(-1.6, 23.22, 270); p.room(-1.6, 18.5, 'BEDROOM', '11\'-5" x 9\'-7"')
    p.shower(-9.45, 14.75, -6.8, 18.35)
    p.wall(-1.1, 9.4, -1.1, 14.32); p.door(-1.1, 11.2, 2.5, 'v', 'hi', kind='pocket')
    p.vanity(-9.3, 9.6, -5.6, 11.35); p.toilet(-3.6, 14.3, 270); p.room(-6.6, 12.6, 'BATH', small=True)
    p.wd(2.55, 11.8, 4.85, 14.2); p.room(1.0, 12.0, 'HALL', small=True)

def den(p):
    p.wall(-9.53, 9.4, 4.9, 9.4); p.door(1.6, 9.4, 2.8, 'h', 'hi', kind='pocket')
    p.shelves(-9.3, 8.2, -0.6, 9.21); p.rug(-8.6, 0.3, -2.0, 7.4)
    p.chair(-6.6, 2.1, 0); p.chair(-6.6, 5.6, 0); p.rtable(-3.6, 3.85, 2.4, 'side table')
    p.room(-0.3, 6.6, 'LIBRARY', "14'-5\" x 9'-11\"")
    p.way([DOOR, (-1.0, -3.6), (2.0, 1.5), (3.4, 6.8), (9.5, 7.2), (19.5, 7.6)])

def north_hearth(p):
    p.fireplace(11.4, 31.59, 270, 6.0, 1.0); p.win(6.8, 2.2, 'h', 32.29); p.win(16.0, 2.2, 'h', 32.29)
    p.rug(6.3, 22.3, 16.6, 29.6)
    p.sectional(11.4, 24.4, 90, w=9.0, d=7.0, side='R'); p.table(11.3, 25.5, 15.3, 28.0, 'coffee table')
    p.table(7.6, 19.3, 15.2, 20.5, 'console')
    p.builtin(6.5, 4.81, 12.5, 6.4, 'WINDOW SEAT'); p.piano(6.35, 13.5, 0)
    p.room(11.4, 16.6, 'LIVING')
    p.dim(10.7, 24.1, 10.7, 31.09, None, -1); p.dim(15.9, 21.6, 22.15, 21.6, None, -1)

def a():
    p = Plan('1-open A. The hall and the north hearth', '4 bedrooms. The whole gable is one room: concept 1\'s kitchen axis, with a fireside sectional in the north-west; bath and bedroom move outside the gable', deck=(36.6, -4.0), drop=DROP)
    wing(p); den(p); kitchen_dining(p); north_hearth(p)
    p.room(17.2, 10.6, 'GREAT ROOM', "31'-4\" x 27'-3\", 855 SF")
    return p

def b():
    p = Plan('1-open B. Two axes', '4 bedrooms. A hearth on the west gable under the ridge with two sofas on its axis; the kitchen axis crosses it at the table', deck=(36.6, -4.0), drop=DROP)
    wing(p); den(p); kitchen_dining(p)
    p.fireplace(5.78, RIDGE, 0, 6.0, 1.0, lab=False); p.text(6.6, 22.1, 'GAS FIRE', 6)
    p.rug(7.4, 12.5, 17.0, 24.4)
    p.sofa(12.3, 23.6, 270, 8.0); p.sofa(12.3, 13.3, 90, 8.0); p.table(9.8, 16.65, 14.8, 20.25, 'coffee table')
    p.shelves(5.5, 31.09, 8.7, 32.09); p.shelves(14.1, 31.09, 17.3, 32.09); p.win(11.4, 5.0, 'h', 32.29); p.piano(6.35, 28.3, 0)
    p.builtin(6.5, 4.81, 12.5, 6.4, 'WINDOW SEAT')
    p.room(12.3, 27.6, 'LIVING'); p.room(11.0, 9.9, 'GREAT ROOM', "31'-4\" x 27'-3\", 855 SF")
    p.dim(16.3, 23.4, 22.15, 23.4, None, -1); p.dim(15.6, 4.81, 15.6, 11.7)
    return p

def c():
    p = Plan('1-open C. Open gable, five bedrooms', '5 bedrooms, at a price: the old living room becomes an entry gallery and a small second bedroom, and the foyer opening narrows to 3 ft', deck=(36.6, -4.0), drop=DROP + ('OP-L1-01',))
    wing(p); kitchen_dining(p); north_hearth(p)
    p.gap(-0.9, -1.4, 2.14, -0.6)
    p.wall(-9.53, 9.4, -1.1, 9.4); p.wall(-1.1, -0.75, -1.1, 9.4); p.door(-1.1, 1.3, 2.67, 'v', 'lo', -1)
    p.bed(-7.05, 9.21 - 3.25, 270, 'full', 0); p.tall(-3.1, 4.0, -1.3, 9.2, 'WARD')
    p.room(-5.6, 0.9, 'BEDROOM', "8'-2\" x 9'-11\"")
    p.room(1.9, 4.6, 'GALLERY', small=True)
    p.way([DOOR, (0.8, -3.6), (1.2, 1.5), (3.0, 6.8), (9.5, 7.2), (19.5, 7.6)])
    p.room(17.2, 10.6, 'GREAT ROOM', "31'-4\" x 27'-3\", 855 SF")
    return p

W = [25, 20, 15, 15, 15, 10]
SC = {'freerein-1-open-A': ('1-open A. North hearth', '4 BR: whole gable open, fireside sectional north-west', [5, 5, 5, 5, 4, 4]),
      'freerein-1-open-B': ('1-open B. Two axes', '4 BR: hearth on the west gable under the ridge, two sofas', [5, 5, 5, 5, 5, 4]),
      'freerein-1-open-C': ('1-open C. Five bedrooms', '5 BR: small second bedroom and a 3-ft entry gallery', [4, 5, 5, 5, 4, 3]),
      'freerein-1': ('Concept 1. The kitchen hall', '5 BR: for comparison', [5, 4, 5, 5, 5, 4]),
      'bench-jan24': ("Benchmark: architect's Jan 2024", '5 BR: the plan to beat', [4, 4, 4, 4, 3, 3])}
tot = lambda k: sum(x * y for x, y in zip(SC[k][2], W)) / 100.0
if __name__ == '__main__':
    O = sys.argv[1].rstrip('/') + '/'
    for n, f in (('freerein-1-open-A', a), ('freerein-1-open-B', b), ('freerein-1-open-C', c)):
        p = f(); print(n); p.check(); open(O + n + '.svg', 'w').write(p.svg()); subprocess.check_call(['rsvg-convert', '-z', '2', O + n + '.svg', '-o', O + n + '@2x.png'])
    fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 38); fr_ = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 26)
    tw, th, band = 1352, 1040, 130; order = list(SC)
    sheet = Image.new('RGB', (tw * 3, (th + band) * 2), 'white'); dr = ImageDraw.Draw(sheet)
    for i, k in enumerate(order):
        im = Image.open(O + k + '@2x.png').convert('RGB').crop((0, 250, 2704, 2330)).resize((tw, th), Image.LANCZOS); x, y = (i % 3) * tw, (i // 3) * (th + band)
        sheet.paste(im, (x, y + band)); dr.rectangle([x, y, x + tw - 1, y + band - 1], fill=(20, 20, 20) if 'open' in k else (70, 70, 70))
        dr.text((x + 24, y + 14), SC[k][0], fill='white', font=fb); t = '%.2f / 5' % tot(k); dr.text((x + tw - 24 - dr.textlength(t, font=fb), y + 14), t, fill='white', font=fb)
        dr.text((x + 24, y + 76), SC[k][1], fill=(225, 225, 225), font=fr_)
    sheet.save(O + 'freerein-1-open-sheet@2x.png'); print({k: tot(k) for k in order})
