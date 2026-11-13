"""Five free-rein concepts for the main level of the original house (sketches only). Plan frame in feet: x east, y north."""
from fr import Plan, RX0, RX1, RY0, RY1, RIDGE

XW = 5.09          # centre line of the wall between the old living room / back bedroom and the gable box
DOOR = (2.4, -5.7)  # the front door (east wall of the foyer)

# ---------------------------------------------------------------- shared pieces
def laundry(p, lr_wall=True):
    """the laundry closet stays where it is, with its pocket door to the old living room"""
    p.wall(-6.6, 14.32, -6.6, 18.6)
    p.wall(-9.53, 14.51, -6.41, 14.51); p.door(-7.97, 14.51, 2.33, 'h', 'lo', kind='pocket')
    p.wd(-9.3, 15.4, -6.95, 18.2); p.room(-8.1, 14.95, 'LAUN', small=True)
    p.room(-2.3, -5.6, 'ENTRY FOYER', 90); p.room(9.0, -7.3, 'FRONT PORCH', small=True)

def back_bedroom(p, door_y=23.9, bed=True):
    """the back bedroom as built: its two closets, its window, its door to the bedroom hall"""
    p.wall(-6.41, 14.51, 4.9, 14.51)                                   # wall to the old living room
    p.wall(-6.41, 16.93, 4.9, 16.93, .3); p.door(-0.75, 16.93, 10.0, 'h', kind='slide', t=.3)
    p.closet(-6.3, 14.75, 4.8, 16.75, None); p.room(-0.75, 15.35, 'CLOSETS', small=True)
    p.door(XW, door_y, 2.67, 'v', 'lo', -1)
    if bed: p.bed(-1.2, 23.22, 270)
    p.room(-1.0, 18.9, 'BEDROOM', '11\'-5" x 9\'-7"')

def hall_bath_asbuilt(p, hall_door=True):
    """the hall bath and bedroom hall exactly as built (nothing wet moves)"""
    p.wall(5.28, 22.22, 8.15, 22.22); p.wall(10.86, 22.22, 13.74, 22.22)
    if hall_door: p.door(9.5, 22.22, 2.71, 'h', 'lo', kind='pocket')
    p.wall(5.28, 25.56, 13.74, 25.56); p.door(8.65, 25.56, 2.67, 'h', 'lo', 1)
    p.tub(11.0, 25.81, 13.5, 31.95); p.toilet(5.3, 30.55, 0); p.vanity(5.3, 25.81, 7.05, 28.81)
    p.room(9.0, 29.4, 'BATH', small=True); p.room(9.5, 23.75, 'HALL', small=True)

def middle_bedroom(p, south=18.53):
    """the middle bedroom as built, with its closet under the ridge"""
    p.wall(13.74, south - .19, 13.74, 22.44); p.wall(13.74, 25.34, 13.74, 32.09); p.door(13.74, 23.89, 2.9, 'v', 'lo', 1)
    p.wall(13.92, 20.81, 23.96, 20.81, .3); p.door(18.93, 20.81, 9.0, 'h', kind='slide', t=.3); p.closet(14.0, 18.8, 23.9, 20.6)
    p.bed(23.96 - 3.45, 27.0, 180)
    p.room(19.6, 22.3, 'BEDROOM', '10\'-0" x 11\'-1"')

def lr_opening(p, y0=5.3, y1=11.3, north_to=26.67):
    p.wall(XW, 4.6, XW, y0); p.wall(XW, y1, XW, north_to)

def lr_living(p, name='LIVING ROOM'):
    """the old living room as the living room: a 9 1/2 ft sectional on the window, facing a media wall; the way in passes behind it"""
    p.rug(-8.7, 4.3, 2.1, 12.0)
    p.sectional(-3.25, 6.5, 90, w=9.5, d=7.0, side='R')
    p.table(-3.3, 7.7, 1.1, 10.2, 'coffee table')
    p.tv(-1.6, 13.72, 270, 7.5, 1.2)
    p.room(-2.3, 1.5, name, 215)
    p.dim(1.35, 6.2, 1.35, 13.12, None, -1)          # sofa front to the media wall
    p.dim(-2.3, -0.75, -2.3, 3.0, None, -1) if False else None

# ---------------------------------------------------------------- 1. THE KITCHEN HALL
def c1():
    p = Plan('1. The kitchen hall', '5 bedrooms. The street end of the gable becomes one vaulted kitchen-and-dining hall on a single axis: range, island, table, glass wall, deck',
             deck=(36.6, -4.0), drop=('WN-L1-03', 'WN-L1-08', 'WN-L1-09', 'WN-L1-11'))
    laundry(p); back_bedroom(p, door_y=18.95)
    lr_opening(p); lr_living(p)
    # the private corner: hall, bath, second bedroom
    p.wall(5.28, 14.4, 17.69, 14.4); p.wall(17.5, 14.21, 17.5, 32.09); p.wall(8.9, 14.4, 8.9, 21.3); p.wall(5.28, 21.3, 17.5, 21.3)
    p.door(7.0, 14.4, 2.8, 'h', 'lo', kind='pocket'); p.door(7.0, 21.3, 2.5, 'h', 'hi', 1); p.door(8.9, 17.4, 2.5, 'v', 'hi', kind='pocket')
    p.shower(14.0, 14.59, 17.31, 21.11, glass=((14.0, 14.59), (14.0, 18.6))); p.toilet(12.35, 14.59, 90); p.vanity(9.5, 19.36, 13.5, 21.11)
    p.room(11.3, 18.2, 'BATH', small=True); p.room(7.0, 15.6, 'HALL', small=True)
    p.wall(15.3, 21.49, 15.3, 32.09, .3); p.door(15.3, 26.8, 8.6, 'v', kind='slide', t=.3); p.closet(15.5, 21.6, 17.25, 32.0)
    p.win(10.3, 5.0, 'h', 32.29); p.bed(5.28 + 3.45, 27.7, 0)
    p.room(12.0, 23.0, 'BEDROOM', '10\'-0" x 10\'-7"')
    # library gallery
    p.builtin(6.5, 4.81, 12.5, 6.4, 'WINDOW SEAT'); p.shelves(9.6, 13.2, 17.3, 14.21)
    p.room(11.4, 10.3, 'LIBRARY GALLERY', 115)
    # kitchen on the north wall
    p.tall(17.69, 30.0, 20.2, 32.09, 'PAN'); p.app(20.2, 29.6, 23.2, 32.09, 'REF'); p.counter(23.2, 30.0, 31.1, 32.09); p.range_(25.65, 29.95, 28.65, 32.09)
    p.tall(31.1, 30.0, 33.6, 32.09, 'OVENS'); p.tall(33.6, 30.0, 36.59, 32.09, 'PAN'); p.uppers(25.4, 31.0, 28.9, 32.09)
    p.win(24.4, 2.2, 'h', 32.29); p.win(29.9, 2.2, 'h', 32.29)
    p.counter(22.15, 22.5, 32.15, 26.0, 'island'); p.sink(24.2, 24.1, 26.9, 25.7, True); p.dw(27.1, 24.0, 29.1, 26.0); p.text(30.6, 24.2, 'ISLAND 10 FT', 6.5)
    p.stools([(23.85, 21.8), (26.05, 21.8), (28.25, 21.8), (30.45, 21.8)])
    p.dining(27.15, 13.0, 'h', 8.0, 3.5, 3, leaf=10.0)
    p.fold(20.0, 34.3); p.otable(27.15, -0.5)
    p.ridge(17.69, 36.59, posts=[(17.5, RIDGE)], lab=31.0)
    p.room(27.15, 28.0, 'KITCHEN'); p.room(27.15, 7.6, 'DINING HALL', "18'-11\" x 27'-3\" hall, 515 SF")
    p.room(27.15, 13.45, 'SEATS 8: 96 x 42 IN', small=True); p.room(27.15, 12.55, '10 WITH LEAVES', small=True)
    p.note(33.6, -2.6, 'DECK'); p.note(27.15, 3.65, 'FOLDING GLASS WALL')
    p.dim(22.6, 4.81, 22.6, 9.65); p.dim(22.75, 16.35, 22.75, 21.2); p.dim(24.4, 26.0, 24.4, 30.0); p.dim(32.75, 14.5, 36.59, 14.5); p.dim(17.69, 23.6, 22.15, 23.6)
    p.way([DOOR, (-1.0, -3.6), (2.9, 0.5), (3.3, 8.3), (10.0, 8.6), (19.5, 8.3)])
    return p

# ---------------------------------------------------------------- 2. THE LONG ROOM (keeps six bedrooms)
def c2():
    p = Plan('2. The long room', '6 bedrooms kept. Kitchen at the street end of one 45-ft line: living room, table at the glass doors, island, range',
             deck=(25.6, -4.0), drop=('WN-L1-02', 'WN-L1-03', 'WN-L1-04'))
    laundry(p); back_bedroom(p)
    lr_opening(p, north_to=22.57); p.wall(XW, 25.24, XW, 26.67); lr_living(p)
    hall_bath_asbuilt(p); middle_bedroom(p)
    p.wall(13.55, 18.53, 36.59, 18.53)                               # one wall under the ridge
    p.wall(24.15, 18.53, 24.15, 32.09)
    p.wall(24.34, 29.74, 36.59, 29.74, .3); p.door(30.3, 29.74, 9.0, 'h', kind='slide', t=.3); p.closet(24.4, 29.95, 36.5, 32.0)
    p.door(26.0, 18.53, 2.67, 'h', 'lo', 1); p.bed(36.58 - 3.45, 24.6, 180)
    p.room(27.6, 27.6, 'BEDROOM', '12\'-3" x 10\'-10"')
    # the alcove by the bedroom hall
    p.shelves(5.28, 18.5, 6.3, 22.0); p.shelves(12.5, 18.72, 13.55, 22.0); p.room(9.5, 20.3, 'BOOKS', small=True)
    # kitchen on the street gable
    p.tall(34.5, 4.81, 36.59, 7.81, 'PAN'); p.counter(34.5, 7.81, 36.59, 15.34); p.range_(34.2, 10.08, 36.59, 13.08); p.app(34.1, 15.34, 36.59, 18.34, 'REF')
    p.uppers(35.4, 9.8, 36.59, 13.4); p.win(8.9, 2.0, 'v', 36.79); p.win(14.25, 2.0, 'v', 36.79)
    p.counter(27.0, 8.1, 30.5, 15.1, 'island'); p.sink(28.7, 12.3, 30.2, 14.7); p.dw(28.5, 10.1, 30.5, 12.1); p.text(27.75, 9.0, 'ISLAND', 6.5)
    p.stools([(26.25, 9.6), (26.25, 11.6), (26.25, 13.6)])
    p.dining(16.4, 11.3, 'h', 8.0, 3.5, 3, leaf=10.0, leaf_dir=-1)
    p.fold(9.9, 22.9, stack='west'); p.win(28.0, 8.5, 'h', 4.6); p.otable(16.4, -0.5); p.builtin(5.28, 12.0, 6.9, 17.9, None, 'sideboard'); p.text(6.1, 14.95, 'SIDEBOARD', 6.5, rot=-90)
    p.room(32.4, 6.6, 'KITCHEN'); p.room(20.6, 17.0, 'KITCHEN & DINING', "31'-4\" x 13'-6\", 420 SF")
    p.room(16.4, 11.75, 'SEATS 8: 96 x 42 IN', small=True); p.room(16.4, 10.85, '10 WITH LEAF', small=True)
    p.note(22.6, -2.6, 'DECK'); p.note(16.4, 3.65, 'FOLDING GLASS DOORS, 13 FT'); p.text(30.5, 19.3, 'RIDGE ABOVE THIS WALL', 6.5, '#444')
    p.dim(21.2, 4.81, 21.2, 7.95); p.dim(25.3, 14.65 - .0, 25.3, 18.34) if False else None; p.dim(12.2, 14.65, 12.2, 18.34); p.dim(22.0, 8.7, 25.65, 8.7); p.dim(30.5, 9.0, 34.5, 9.0)
    p.way([DOOR, (-1.0, -3.6), (2.9, 0.5), (3.3, 8.3), (8.6, 8.6), (10.2, 15.6), (14.6, 16.6)])
    return p

# ---------------------------------------------------------------- 3. ROOMS IN SEQUENCE
def c3():
    p = Plan('3. Rooms in sequence', '5 bedrooms. A dining hall at the entry with the kitchen beside it; a long fireside living room under the ridge, open to the deck',
             deck='k4', drop=('WN-L1-03',))
    # kitchen in the old back bedroom
    laundry(p)
    lr_opening(p, 5.3, 13.0)
    p.counter(-6.53, 18.9, -4.45, 26.67); p.counter(-4.45, 24.6, 1.9, 26.67); p.sink(-6.2, 20.5, -4.75, 23.0); p.dw(-6.53, 18.9, -4.45, 20.4)
    p.range_(-3.1, 24.3, -0.1, 26.67); p.uppers(-6.53, 25.5, -3.4, 26.67); p.uppers(0.2, 25.5, 1.9, 26.67); p.uppers(-3.4, 25.3, 0.2, 26.67)
    p.app(1.9, 24.17, 4.9, 26.67, 'REF'); p.door(XW, 20.85, 2.5, 'v', kind='cased')
    p.counter(-2.4, 16.2, 4.9, 19.6, 'island'); p.text(1.25, 17.9, 'SERVING COUNTER', 6.5)
    p.room(-1.0, 22.2, 'KITCHEN', 150)
    p.rdining(-2.5, 6.9, 6.0, 8); p.rug(-7.6, 1.8, 2.6, 12.0)
    p.room(-2.5, 0.8, 'DINING HALL', 215); p.room(-2.5, 6.9, '72 IN ROUND: SEATS 8', small=True)
    # the north side as built: hall bath, two bedrooms
    hall_bath_asbuilt(p); middle_bedroom(p)
    p.wall(13.55, 18.53, 24.34, 18.53); p.wall(24.15, 17.24, 24.15, 32.09); p.wall(23.96, 17.24, 36.59, 17.24); p.door(33.03, 17.24, 2.75, 'h', 'lo', kind='pocket')
    p.wall(24.34, 29.74, 36.59, 29.74, .3); p.door(30.3, 29.74, 9.0, 'h', kind='slide', t=.3); p.closet(24.4, 29.95, 36.5, 32.0)
    p.bed(36.58 - 3.45, 24.0, 180); p.room(27.4, 27.6, 'BEDROOM', '12\'-3" x 12\'-1"')
    p.shelves(12.5, 18.72, 13.55, 22.0); p.builtin(6.5, 4.81, 12.5, 6.4, 'WINDOW SEAT')
    # living room under the ridge
    p.fireplace(18.95, 17.84, 270, 6.0, 1.0)
    p.rug(13.5, 9.4, 28.3, 16.2)
    p.sectional(18.95, 11.4, 90, w=9.5, d=7.0, side='R'); p.table(18.9, 12.6, 23.3, 15.1, 'coffee table')
    p.chair(26.2, 9.9, 180); p.chair(26.2, 14.1, 180); p.rtable(26.4, 12.0, 1.4, 'side table')
    p.rdining(32.6, 10.3, 4.0, 4, 'games table'); p.room(32.6, 13.9, 'GAMES TABLE', small=True)
    p.fold(18.24, 32.5); p.otable(25.3, -0.5)
    p.room(9.3, 13.2, 'LIVING ROOM', "31'-4\" x 13'-6\", 420 SF")
    p.note(31.6, -2.6, 'DECK'); p.note(25.3, 3.65, 'FOLDING GLASS WALL')
    p.dim(16.6, 4.81, 16.6, 7.9); p.dim(24.2, 11.1, 24.2, 17.34, None, -1); p.dim(-6.41, 17.6, -2.4, 17.6); p.dim(1.0, 19.6, 1.0, 24.6); p.dim(2.1, 6.9, 4.9, 6.9); p.way([(1.5, 21.1), (7.6, 21.1), (9.2, 17.6)])
    p.way([DOOR, (-1.0, -3.6), (2.9, 0.5), (3.6, 8.5), (9.0, 8.0), (14.0, 6.4), (24.5, 6.3)])
    return p

# ---------------------------------------------------------------- 4. THE ARCHITECT'S PLAN, TURNED TO THE SUN
def c4():
    p = Plan("4. The architect's plan, turned to the sun", "5 bedrooms. Jan 2024's kitchen and bedrooms kept; living moves to the south side with doors to the porch, dining moves next to the kitchen",
             deck=(24.3, -4.0), drop=('WN-L1-02', 'WN-L1-03', 'WN-L1-04', 'WN-L1-05', 'WN-L1-07', 'WN-L1-08', 'WN-L1-09', 'WN-L1-11'))
    laundry(p)
    p.wall(XW, 4.6, XW, 7.5)
    # street-end bedrooms and bath, as the architect drew them
    p.wall(24.3, 4.81, 24.3, 16.08, .54); p.wall(24.3, 18.5, 24.3, 32.09, .54)
    p.wall(24.57, 15.38, 36.59, 15.38, .54); p.door(26.01, 15.38, 2.82, 'h', 'hi', -1, t=.54)
    p.wall(24.57, 20.96, 36.59, 20.96, .54); p.door(26.16, 20.96, 2.52, 'h', 'hi', 1, t=.54)
    p.wall(28.04, 15.38, 28.04, 20.96, .54); p.door(28.04, 19.2, 2.25, 'v', 'lo', 1, t=.54)
    p.win(33.73, 5.25, 'h', 4.6); p.win(6.53, 2.59, 'v', 36.79); p.win(26.93, 5.35, 'v', 36.79); p.win(18.36, 2.25, 'v', 36.79); p.win(17.18, 5.75, 'h', 32.29)
    p.vanity(28.31, 15.67, 31.8, 17.42); p.toilet(32.65, 15.65, 90); p.shower(34.2, 15.67, 36.55, 20.67, glass=((34.2, 15.67), (34.2, 18.4)))
    p.room(30.8, 19.3, 'BATH', small=True); p.room(26.2, 18.2, 'HALL', small=True)
    p.bed(31.7, 32.09 - 3.45, 270); p.tall(24.6, 24.85, 26.6, 31.75, 'WARD'); p.room(31.7, 23.0, 'BEDROOM', '12\'-0" x 10\'-10"')
    p.bed(29.6, 4.81 + 3.45, 90); p.tall(34.9, 9.0, 36.5, 14.9, 'WARD'); p.room(29.6, 13.9, 'BEDROOM', '12\'-0" x 10\'-3"')
    # pantry in the old bath, kitchen in the old back bedroom
    p.wall(10.15, 24.79, 10.15, 32.09, .54); p.wall(6.08, 24.98, 10.42, 24.98); p.door(8.25, 24.98, 2.5, 'h', 'lo', kind='pocket'); p.wall(6.35, 24.79, 6.35, 27.07, .54); p.wall(5.09, 27.07, 6.62, 27.07)
    p.tall(7.9, 25.2, 9.88, 31.9, ''); p.room(6.6, 29.6, 'PANTRY', small=True)
    p.counter(-6.53, 18.9, -4.31, 26.67); p.counter(-4.31, 24.45, 6.05, 26.67); p.range_(-0.88, 24.05, 2.62, 26.67); p.sink(-6.2, 19.6, -4.7, 22.2); p.dw(-6.53, 22.5, -4.31, 24.5)
    p.uppers(-4.4, 25.5, -1.1, 26.67); p.uppers(2.85, 25.5, 6.05, 26.67); p.uppers(-1.1, 25.3, 2.85, 26.67)
    p.app(-6.2, 15.25, -3.45, 18.75, 'REF'); p.counter(-1.0, 16.62, 7.25, 21.02, 'island'); p.text(3.1, 18.8, 'ISLAND', 7)
    p.stools([(-0.2, 15.85), (1.75, 15.85), (3.7, 15.85), (5.65, 15.85)])
    p.room(-1.5, 22.9, 'KITCHEN', 175)
    # dining next to the kitchen
    p.dining(17.2, 24.9, 'v', 8.0, 3.5, 3, leaf=10.0, leaf_dir=-1)
    p.room(12.4, 30.6, 'DINING', "13'-7\" x 13'-6\""); p.room(17.2, 26.6, 'SEATS 8', small=True); p.room(17.2, 25.7, '96 x 42 IN', small=True); p.room(17.2, 22.6, '10 WITH', small=True); p.room(17.2, 21.8, 'LEAF', small=True)
    # living on the south side
    p.fireplace(23.53, 11.05, 180, 6.0, 1.0, tv=True)
    p.rug(11.0, 6.0, 21.6, 16.2)
    p.sectional(15.95, 11.05, 0, w=8.5, d=8.3, side='R'); p.table(16.5, 7.4, 19.0, 10.9, 'coffee table')
    p.table(10.35, 7.4, 11.5, 14.7, 'console')
    p.slider(6.5, 18.5); p.otable(12.5, -0.5)
    p.ridge(8.9, 24.03, posts=[(8.9, RIDGE)], lab=9.6)
    p.room(8.3, 6.9, 'LIVING', "18'-9\" x 12'-2\"")
    p.rdining(-4.4, 6.9, 4.5, 4, 'breakfast table'); p.rug(-8.2, 3.1, -0.6, 10.7); p.room(-2.3, 1.5, 'MORNING ROOM', 215)
    p.note(20.6, -2.6, 'DECK'); p.note(12.5, 3.65, 'GLASS DOORS TO THE PORCH, 12 FT')
    p.dim(15.0, 6.35, 23.03, 6.35, None, -1); p.dim(5.28, 11.6, 10.35, 11.6); p.dim(7.25, 22.6, 14.65, 22.6); p.dim(20.55, 28.5, 24.03, 28.5)
    p.way([DOOR, (-1.0, -3.6), (-0.5, 1.0), (3.5, 9.8), (8.0, 10.8), (9.0, 16.0), (11.5, 20.5)])
    return p

# ---------------------------------------------------------------- 5. THE WRAP
def c5():
    p = Plan('5. The wrap', '5 bedrooms. Only the front bedroom and the old kitchen come out: a fireside living room and table along the glass, the kitchen tucked round the corner',
             deck='k4', drop=('WN-L1-03',))
    laundry(p); back_bedroom(p)
    lr_opening(p, north_to=22.57); p.wall(XW, 25.24, XW, 26.67)
    hall_bath_asbuilt(p); middle_bedroom(p)
    p.wall(13.55, 18.53, 24.34, 18.53); p.wall(24.15, 18.34, 24.15, 32.09)
    # library in the old living room
    p.shelves(-6.2, 13.3, 4.9, 14.32); p.rug(-8.4, 2.9, 1.6, 11.7)
    p.chair(-6.2, 5.3, 0); p.chair(-6.2, 9.3, 0); p.chair(-0.6, 5.3, 180); p.chair(-0.6, 9.3, 180); p.rtable(-3.4, 7.3, 3.3, 'coffee table')
    p.room(-2.3, 1.3, 'LIBRARY', 215)
    # living under the ridge
    p.fireplace(18.9, 17.84, 270, 6.0, 1.0)
    p.rug(13.5, 9.4, 24.3, 16.2)
    p.sectional(18.9, 11.4, 90, w=9.5, d=7.0, side='R'); p.table(18.85, 12.6, 23.25, 15.1, 'coffee table')
    p.builtin(6.5, 4.81, 12.5, 6.4, 'WINDOW SEAT')
    p.shelves(5.28, 19.0, 6.3, 22.0); p.shelves(12.5, 18.72, 13.55, 22.0)
    # dining at the glass, kitchen round the corner
    p.dining(30.4, 12.2, 'v', 8.0, 3.5, 3, leaf=10.0, leaf_dir=-1)
    p.app(24.34, 29.6, 27.34, 32.09, 'REF'); p.counter(27.34, 30.0, 34.6, 32.09); p.range_(29.5, 29.95, 32.5, 32.09); p.tall(34.6, 30.0, 36.59, 32.09, 'PAN')
    p.uppers(27.34, 31.0, 29.3, 32.09); p.uppers(32.7, 31.0, 34.6, 32.09); p.uppers(29.3, 30.8, 32.7, 32.09)
    p.counter(27.6, 22.5, 33.6, 26.0, 'island'); p.sink(28.1, 24.1, 30.5, 25.7, True); p.dw(30.7, 24.0, 32.7, 26.0); p.text(30.6, 23.2, 'ISLAND', 6.5)
    p.stools([(28.8, 21.8), (30.6, 21.8), (32.4, 21.8)])
    p.fold(18.24, 32.5, stack='west'); p.otable(24.0, -0.5)
    p.ridge(24.34, 36.59, posts=[(24.15, RIDGE)], lab=False)
    p.room(30.5, 28.0, 'KITCHEN', 170); p.room(9.3, 13.4, 'LIVING & DINING', "31'-4\" x 13'-6\", 420 SF")
    p.room(34.9, 16.9, 'SEATS 8', small=True); p.room(34.9, 16.1, '10 WITH LEAF', small=True)
    p.note(31.0, -2.6, 'DECK'); p.note(24.0, 3.65, 'FOLDING GLASS WALL')
    p.dim(16.6, 4.81, 16.6, 7.9); p.dim(24.0, 11.1, 24.0, 17.34, None, -1); p.dim(23.65, 8.7, 27.05, 8.7); p.dim(26.2, 17.8, 26.2, 21.2); p.dim(34.3, 26.0, 34.3, 30.0); p.dim(0.75, 7.3, 4.9, 7.3)
    p.way([DOOR, (-1.0, -3.6), (2.9, 0.5), (3.4, 8.3), (9.0, 7.6), (16.0, 6.3), (24.0, 6.6), (25.4, 14.0)])
    return p

ALL = [c1, c2, c3, c4, c5]
