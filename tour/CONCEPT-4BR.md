# Open great room, 4 bedrooms: a third floor-plan concept

**Illustrative idea. Not designed or reviewed by an architect or engineer.**

Owner's brief (11/12): a third concept where the whole great-room area opens up and two main-level bedrooms go instead of one,
so the house becomes 4 bedrooms; keep the bedroom farthest from the street in the old part of the house, open the exposure to the
street with a lot of light, and make it a really nice open plan. "If it's a bad idea, tell me."

This note is the design study (written before building it). Coordinates are the model's plan frame in feet: x runs east toward
the street, y runs north, the main floor is z = 0.

## What is there today (from the model, `bim2/scene.meta.json`)

The original 1950s house is one gable, ridge running east-west at y = 18.45, 4.9-in-12 pitch, plate at 8 ft, ridge about 13.6 ft
inside. Its east end is a gable wall that faces Hillside Drive. Every room under it already has a vaulted ceiling that follows the
roof.

| Room | Plan box (x, y) | Notes |
|---|---|---|
| Kitchen | 5.3–16.1, 4.8–18.3 (+ alcove to y 22) | peninsula with three counter stools facing east |
| Dining & sitting (great room) | 16.1–36.6, 4.8–17.2 | 14¼-ft picture window south, twin window east, built-in sideboard on the north wall |
| Front bedroom (model BED3) | 24.3–36.6, 17.4–29.5 + closet to 32.1 | pocket door off the great room, two windows to the street |
| Middle bedroom (BED2) | 13.9–24.0, 21.0–32.1 + closet 18.7–20.6 | door from the bedroom hall, one window north |
| Back bedroom (BED1) | −6.5–4.9, 17.1–26.7 | door from the west end of the bedroom hall |
| Hall bath | 5.2–13.5, 25.6–32.1 | door from the hall |

The front and middle bedrooms sit between the great room and the north wall, under the same roof. They are the right two to take
out: the back bedroom is on the other side of the kitchen alcove and the hall, next to the living room, so removing it would not
add to the great room at all. Removing the middle and back bedrooms instead would leave the front bedroom blocking the street side,
which is the side the owner wants opened. So the version asked for is also the version that works.

## The layout

```
             north wall (y 32.1)   [WN-08]        [new window, like WN-08]
  +----------+---------------------------------------------------------+
  | hall     |   reading / play corner          lounge behind sofa     |
  | bath     |                                                         |
  |  (kept)  |      dining table under the ridge    living, two sofas  |  east gable wall
  +--D-06----+   ======= exposed fir ridge beam ===================    |  = new window wall
  | hall     |   [table 8 ft]                       facing, rug       |  + glazed gable
  | (kept) kitchen alcove (kept)                                      |  (toward the street)
  +----------+                                                         |
  | kitchen (as built)  stools |                                       |
  |                            |   south band: chairs by the big       |
  |                            |   picture window (kept)               |
  +----------------------------+---------------------------------------+
                         south wall (y 4.8), 14¼-ft picture window
```

### Walls that come out
- Great room / front bedroom wall with its pocket door (W-L1-008, W-L1-009, D-L1-08).
- Great room / middle-bedroom-closet wall with the built-in sideboard and shelves on it (W-L1-010).
- Middle bedroom / its closet (W-L1-013, closet doors D-L1-07 and D-L1-13, the closet system and its storage shelf).
- Front bedroom / its closet (W-L1-018, W-L1-019, D-L1-09, closet system).
- The wall between the two bedrooms (W-L1-045 to W-L1-048).

### What stays
- All exterior walls and the roof, except the street gable wall, which gets new glass (below).
- The kitchen exactly as built, including the alcove and the wall behind the beverage cooler and microwave (W-L1-041 to W-L1-043).
- The bedroom hall, the hall bath and its plumbing wall (W-L1-044), untouched.
- The back bedroom, its door from the hall (D-L1-01) and its closet. The bath stays on the same hall, so the back bedroom and
  bath work as a small guest suite.
- The door from the hall into the old middle bedroom (D-L1-06) stays where it is: it becomes a second door from the bedroom hall
  into the big room, so the hall can be closed off from the living space.

### New glass toward the street
The east wall is the gable end of the original house and faces the street. It gets:
- A picture window the same as the 14¼-ft one in the dining area today (same sill 1′8″, head 7′7″), centered under the ridge, in
  place of the great room's twin window and the front bedroom's two windows.
- Glazed gable above it: two sloped-top fixed windows that follow the roof, one each side of a center post under the ridge beam.
  The gable over the front porch already has windows that follow its roof line, so it reads as part of the same house.
- On the north wall, a second window like the one in the middle bedroom today (6′3″ twin), in the old front-bedroom closet's
  wall, so the far corner is not dark.

That roughly doubles the glass on the street side (about 125 sq ft against about 65 today) and puts daylight in the new room from
three sides. Doors to a front terrace were considered and left out: the street side is about 3 ft above grade with no deck, so it
would need a new deck and steps, and a fixed window wall is the more believable first step.

### Room zones
The open space is about 22½ ft east-west by 27⅓ ft north-south (roughly 590 sq ft), plus the kitchen (about 175 sq ft).
- **Kitchen** (west): as built, with the peninsula and its stools.
- **Dining** (middle): an 8-ft table on the room's center line, under the ridge beam, seating eight, lined up with the new
  window so the view runs kitchen → table → street glass.
- **Living** (east, at the new glass): two sofas facing each other across a coffee table on that same axis, the window wall and
  glazed gable at the end, on a large rug. This keeps the window as the focal point without turning anyone's back to it.
- **South band** (by the existing big picture window): two lounge chairs, a side table, plants.
- **North band** (the old bedrooms' back half): a reading and play corner by the north windows, and a console behind the sofa.

### Circulation
From the foyer you go straight through the living room and the kitchen's pocket door, past the peninsula, and into the big room
along its south side (the kitchen opening is about 3½ ft clear of the stools). Nothing blocks the line from the kitchen to the
street glass. The bedroom hall is reached two ways: through the kitchen alcove, as today, and through D-L1-06 from the big room.

### Ceiling and structure
The two bedrooms' ceilings, the closets' ceilings and the great room's ceiling are the same two roof planes, so they become one
continuous cathedral ceiling, 8 ft at the side walls and about 13.6 ft at the ridge. The ridge is centered over the new room.

Honest structural note: the walls being removed (especially the bedroom/bedroom wall at x ≈ 24 and the walls right under the
ridge) are likely carrying the ridge today. Taking them out needs a structural ridge beam from the kitchen wall to the street
gable, about 23 ft, with posts down to footings at both ends. The concept shows it honestly, as an exposed fir ridge beam in the
same wood as the living room's ceiling beams, and the glazed gable has a center post where that beam lands. The 14¼-ft window
under that post needs an engineered header. None of this is unusual, but it has to be sized by an engineer.

### Lighting
The old rooms' recessed lights are replaced by a regular grid that follows the new room, kept clear of the ridge beam.

### Staging
Same style as the rest of the staged house: light oak floors, white and oat upholstery, a glass-and-black dining table with white
parsons chairs, boucle lounge chairs, a checker/diamond wool rug, black-and-white art, orchids and books.

## Honest assessment

**Is it attractive?** Yes. The original house is one simple gable, and this is the plan that gable wants: one big vaulted room
with the ridge down the middle, glass at the gable end facing the street, the kitchen open to it. It would feel very different
from the house today: brighter, taller, and much more of an entertaining house.

**What it trades.** Two bedrooms for one large living space: 6 bedrooms become 4 (plus the lower-level office), still 3 full baths.
At this price in Woodside, bedroom count matters a lot to value and to the pool of buyers, and a 6-bedroom house is rarer than a
house with a big great room. So this is not a recommendation to remodel before selling. It is a way to show buyers how flexible
the house is: a family that wants bedrooms keeps the house as it is; a buyer who wants space can see what is possible.

**What could make it implausible.**
- Structure: the ridge beam, its posts and footings, and the header under the gable post need an engineer. The concept shows a
  plausible answer, not a designed one.
- The built-in sideboard and shelves on the great room's north wall go with that wall.
- More glass toward the street means less privacy at night and more heat in summer: the window wall would want shades, and the
  Title 24 energy calculation would need to allow the extra glazing.
- A 600-sq-ft hard-surfaced room is lively acoustically: rugs and upholstered furniture matter.
- The street gable wall is rebuilt with a large opening, so this is a permitted remodel, not a weekend project.

**Verdict.** Not a bad idea. It is the best version of the open plan this house can have, and it is worth showing as a third
option next to "As built" and the 5-bedroom open plan. It should be presented as an illustration of flexibility, not as the plan
the house is sold with.

## Model notes (how it is built)

- A design option in the same system as the two 2024 concepts: `bim2/scene.opt-OS-REMODEL-open4.glb` and its `.meta.json`,
  listed in `bim2/scene.meta.json` `options[]` with its metadata (`beds`, `baths`, `office`, `short`, `description`, `label`).
- Built by `bim2/tools/build_open4.py` from the as-built package: it hides the removed elements by their exact triangle ranges
  (the option's `hide` list) and writes the new floor, ceiling, wall patches, baseboards, the rebuilt street gable wall with its
  new windows (copied from the house's own window units), the ridge beam, and the option's spaces, walkable floors, colliders,
  openings, furnishings and lights.
- The option entry sets `pageExtras: true`, which turns on the page support added for it (block `OPT42` in `tour/index.html`,
  next to the other design-option code): its staged furniture (rows with `render.lib: 'STAGE'`, in the house's staging style),
  its own downlight grid in place of the old rooms' (and the front bedroom's fan hidden), the removed doors' and closet doors'
  walk colliders switched off, and loose house pieces left in its `clearRegion` hidden. Options without the flag (the two 2024
  concepts) are untouched.
- Viewpoints for the concept live in the option entry (`views`): foyer, kitchen, window, street, backbed, northeast, aerial.
  QA hook (with `?qa=1` or from the console): `__IDEA42.plans()`, `await __IDEA42.set('open4')`,
  `await __IDEA42.view('kitchen', 'open4')` (or `..., 'asbuilt'` for the same view of the house today), and
  `__TOUR.navCheck({only: 'ideas'})`, which walks the concept: every viewpoint standable, a floor grid over the new room, the
  removed walls' lines free to cross, the street, north and bath walls still solid (`walkTests`).
- To rebuild after the as-built package changes: `python3 tour/bim2/tools/build_open4.py` (needs numpy and shapely 2.1+).

---

# Second version: "Open kitchen and great room" (4 bedrooms)

**Illustrative idea. Not designed or reviewed by an architect or engineer.**

## The layout in the model now (r44): the owner's pick, "1-open B-flip"

After some fifteen scored sketch layouts (kitchen at the street end, in the middle, with and without a fireplace, L-shaped
kitchens), the owner picked the plan called "1-open B-flip" on 11/12/2026 and then changed three things: no post under the
ridge ("We will do a big beam"), lighter furniture on the deck, and the deck floor left clear in front of the doors. This is
what `bim2/tools/build_open4k.py` builds. The plan drawing it follows is the designer's `bim2/tools/freerein/open1.py`
(`bflip()` and `wing()`, branch freerein-r44); the numbers below are in the model's plan frame (feet, x east toward the
street, y north).

### What it is

- **One room.** The whole original gable, 31 ft 4 x 27 ft 3 inside (x 5.28 to 36.59, y 4.81 to 32.09, about 855 sq ft), is a
  single vaulted great room. Everything that stood inside it comes out: the front and middle bedrooms and their closets, the
  hall bath, the hall, and the old kitchen.
- **Living at the street end.** A gas hearth is centred on the street gable, under the ridge (plaster breast 6 ft wide, a
  4 ft 6 linear firebox, a fir mantel). Two 8-ft sofas face each other across a coffee table on a rug, about 7 ft apart seat front
  to seat front, so the group reads from the hearth and from the table. The gable's three low windows become two matching
  4 ft 2 windows, one either side of the hearth. Bookshelves stand on the north wall either side of a 5-ft window.
- **Kitchen at the west end, L-shaped.** The range (36 in, chimney hood) is on the north wall between two counter-height
  windows. The west gable wall is the tall wall: pantry, wall ovens, fridge. An 8-ft x 3 ft 6 island carries the sink and
  dishwasher on its working side and four stools on the dining side. Sink to range is one step across a 4-ft aisle; the
  fridge is at the end of the same aisle, reachable from the room without crossing the cook.
- **Dining between them.** A table for eight (8 ft x 3 ft 6; ten with its leaves) sits on the kitchen's axis, parallel to the
  island, with an 8 ft 6 sideboard on the west wall. This is the house's only dining place, so it is sized as one.
- **Folding glass doors, moved west.** A 14-ft, six-panel folding door (x 8.7 to 22.9) is centred on the table and stacks at
  its west jamb. It opens to the porch and to about 9 ft of new deck (to x 24.6, 8 ft 5 deep, cable rail). The east part of
  the old picture window stays as fixed glass (x 23.7 to 32.5) beside the sofas.
- **Outside the gable.** The back bedroom stays (11 ft 5 x 9 ft 7) with one closet; the other closet becomes its vestibule, so
  the bedroom door no longer opens off the main room. A new 3/4 bath runs across the north end of the old living room, with
  the shower in the old laundry closet. A short hall between them has a laundry closet (stacked washer and dryer behind a door) in its corner, with 36 in of hall left beside it. The rest of the old
  living room is a 14 ft 5 x 9 ft 11 library: a wall of shelves, two reading chairs, a round table.
- **Arrival.** From the front door you pass through the library and enter the great room at its south-west corner, through
  a 3 ft 10 cased opening in the west gable wall, then walk along the glass past the table. The first view is the long
  diagonal to the hearth.

4 bedrooms (this one, two upstairs, one below), 3 baths, plus the office.

### Why this one

- The room is used along its length the way people move through it: arrive at the table, cook at one end, sit by the fire
  at the other. Nothing has to be walked around to get anywhere.
- The kitchen is at the quiet, inner end with two full walls for storage, so the street end, the one with the long view
  down the room, is the sitting area and the hearth.
- The table sits at the doors. With the panels folded, dinner is half outside.
- Bedroom and bath traffic goes through the library and hall, not through the great room.

### Clearances (checked against the NKBA guidelines and common dining rules)

| | in the model | rule of thumb |
|---|---|---|
| island to north counter (work aisle) | 4 ft 0 | 42 in one cook, 48 in two |
| island to tall wall | 4 ft 5 (4 ft 0 at the fridge) | 42 in |
| behind the island stools to the table chairs | 4 ft 10 | 44 in to walk behind seated diners |
| table to the folding doors | 6 ft 5 from the table edge, 4 ft 10 behind the chairs | 36 in minimum, 48 in for a route |
| table to the sideboard | 4 ft 11 from the table end, about 3 ft 5 behind the end chair | 36 to 48 in |
| table end to the living rug | 5 ft 1 (about 3 ft 7 behind the end chair) | 36 in |
| sofa to sofa (seat fronts) | about 7 ft 4, coffee table between | conversation within 10 ft |
| sofa ends to the hearth | about 2 ft (not a route) | side clearance only |
| hall beside the laundry closet | 3 ft 0 | 36 in |

### Structure: a big beam and no post

The ridge is carried by one clear-span beam over the full 31 ft 4, bearing on the west and street gable walls. The model
draws it as a 6-3/4 x 24 in glulam (a steel-and-wood flitch or box beam would be the alternative). At this span the beam,
its bearing, the posts inside the two gable walls and the footings under them are all an engineer's design; the size shown
is a placeholder, not a calculation. Removing the bearing walls of two bedrooms and the hall, cutting a 14-ft opening in
the south wall (it needs its own header and probably a moment or shear solution for that wall), moving windows in two
exterior walls and adding a fireplace vent are all permit work.

### Honest notes: where the model differs from the drawn plan, and what is weak

- The old living room's big west window runs past the new library/bath wall, which meets it at a mullion. A real project
  would reframe or split that window.
- The oven column (drawer, wall oven, built-in microwave, cabinet above) is a simple stand-in drawn for this concept.
- The island sink is centred on the island (the plan has it a little west with the dishwasher beside it).
- The closet doors, the laundry closet door (shut) and the bedroom door (standing open) are drawn fixed; the two pocket
  doors are drawn open. They do not operate in the tour.
- The plan drew the washer and dryer open to the hall with about 29 in beside them. The model moves them to a closet in
  the hall's south-east corner and slides the library door 1 ft west, which leaves 36 in. The cost is 4 in of library
  shelving and a 32-in door instead of a 34-in one.
- No high gable glass and no skylights in this version; daylight is the folding doors, the fixed window and the five
  new windows.
- The deck carries two lounge chairs and a low table off to the east; the floor in front of the open doors is clear.
- Cost drivers, roughly in order: the beam and its supports, the folding doors and south-wall structure, the kitchen
  (new plumbing and gas at the west end, though it is close to the existing bath's lines), the new bath, the fireplace.

### How it is built in the model

`python3 tour/bim2/tools/build_open4k.py` writes `bim2/scene.opt-OS-REMODEL-open4k.glb` and its meta, and registers the
option in `bim2/scene.meta.json` (hide list, sha256, views, walk tests, labels). Changed walls, floors and colliders carry
new element ids (`...-B5...`), because the page matches colliders by element id. The folding door is the opening
`D-L1-B5F` (`leaf.kind: 'FOLD'`, stack west), driven by the page's FOLD42. The minimap is `floor_main_open4k.jpg`
(`bim2/tools/minimap_option.py open4k`).

---

# Earlier studies of this concept (superseded by the layout above)

The notes from here down record the first two passes at the same shell: the kitchen at the street end with the living area
in the middle (r42, r43), and the "v2" library-wall version (r43f). They are kept for the reasoning; none of it is what the
model shows now.


## Where the kitchen goes: three options

The room is about 22.7 ft east-west (x 13.9 to 36.6) by 27.3 ft north-south (y 4.8 to 32.1), entered at its west end from the old
kitchen. The ridge runs down its middle, east-west.

**A. Kitchen at the street end (east gable wall).** The east wall is the room's short end wall, so the kitchen gets a full 27-ft
wall: pantry, fridge, sink under a window, dishwasher, then a return on the north wall with the range and a chimney hood. The
island runs north-south, parallel to that end wall, with its stools on the west face looking down the room. Living sits in the
middle on the north wall around a fireplace, dining at the west end along the south glass.
- For: exactly the owner's pattern. Everyone arrives at the dining end and walks toward the kitchen, never through it: the path
  from the foyer to the living area, the deck or the bedroom hall never passes the stove or the sink. The cook faces the whole
  room. A solid street wall suits a kitchen (cabinets want wall, not glass), so the privacy refinement and the kitchen agree.
- Against: the sink, dishwasher and range all move about 20 to 30 ft east, so new drain, vent, water and gas runs, a new hood
  duct and new circuits. Ordinary work if there is access under the floor, but not cheap. The old kitchen is left over; it is
  taken out entirely and the space reused (see "The old kitchen, reused" below).

**B. Kitchen enlarged in place (west end).** Keep the sink and plumbing where they are, take out the peninsula and push the
kitchen about 8 ft east into the great room with a long island under the ridge.
- For: cheapest; no plumbing moves; the old kitchen's window and cabinets are reused.
- Against: the kitchen stays at the entry end, so every trip from the foyer to the great room, the bedroom hall or the deck goes
  through the kitchen's work aisle, which is the circulation problem the owner wanted solved. The island would sit across the
  room's only entrance, living would end up at the street end, where the owner now wants a solid wall, and the cook would face
  the back of the sofa. The kitchen gets bigger but the room does not get a heart.

**C. Kitchen along the north long wall, in the middle.** A galley on the north wall with an island parallel to it, living at the
street end, dining at the west end.
- For: shorter plumbing runs (the hall bath's wet wall is at the west end of the north wall); the kitchen is central.
- Against: it takes the only long solid wall, so the fireplace and built-ins have nowhere to go; the living area ends up at the
  street end against a mostly solid gable; and the island sits on the main path between the entry and the living area.

**Recommendation: A**, and that is what is built. It is the only one of the three that matches the owner's pattern, keeps
circulation out of the kitchen, and puts each zone against the wall that suits it (kitchen: solid end wall; living: fireplace
wall; dining: glass and deck). B is the budget version and is not worth it here because it leaves the main problem in place.

## The layout as built in the model

```
                 north wall (y 32.1)
  +---------+--------------------------------------------------------+
  | hall    |  [bk] [ gas fireplace ] [bk]   [cab][range+hood][cab][c]|
  | bath    |     sofa  rug  chairs          ________________  fridge |  east gable wall (street):
  | (kept)  |  - - - - - fir ridge beam - - -| island 12 ft |  drawers|  kitchen window over the
  +--D-06---+                                |  4 stools -> |  sink   |  sink, high gable glass
  | hall    |   dining for six               |______________|  window |  above
  | (kept)  |   (glass table)                                   drawers|
  +---------+                                                   pantry |
  | old kitchen: reading nook at its window, otherwise open floor     |
  +-------------------[====== 14.4-ft folding glass wall ======]-------+
                     deck, level with the floor, 8.4 ft deep    stack folds out here
                 outdoor dining for six      lounge chairs     planters
```

- **Kitchen** (x about 26.5 to 36.6): on the east wall, south to north, two tall pantry cabinets, drawers, the sink centered on
  the ridge under a copy of today's kitchen window, the dishwasher, more drawers, and the 36-in four-door fridge at the north end
  by the corner; uppers either side of the window and over the fridge. On the north wall, a 36-in range with a chimney hood
  between drawers and uppers, and a corner cabinet. A 12 ft by 4½ ft island parallel to the east
  wall, with four counter stools on its west side facing down the room, and globe pendants hung from the ridge beam. White shaker
  cabinets and white quartz, as in the house's kitchen. Aisles: about 3½ ft between the island and the east run, about 4½ ft from
  the island to the range.
- **Living** (middle, north side): a 6-ft-wide gas fireplace on the north wall where the middle bedroom's window was, with a fir
  mantel at 4¼ ft, built-in bookcases either side, a sofa facing it across a rug, an ottoman and two armchairs.
- **Dining** (west, south side): first a 7-ft glass table for six; in v2 an extending oak table for eight, ten with the leaf in (see above).
- **Old kitchen**: taken out entirely and reused as a reading nook (below).
- **Skylights**: four 2½ ft by 3 ft skylights in wells through the vault: two over the island, one over the dining table, one
  over the living area.

### The old kitchen, reused: first pass, replaced by the v2 library above (r43, owner: "that counter / cabinets should be removed to use for other purposes")
Every cabinet, counter, the peninsula, the sink, the range slot, the fridge alcove's tower and all appliances come out; its walls,
window and doors stay, and the oak floor (already one continuous floor under the cabinets) runs through. The space is about 10.8
by 13.5 ft plus the alcove to the bedroom hall.

What it became: **a reading nook at its south window, the rest left open.** A built-in window seat runs under the window
(8.3 ft, cushion and pillows), with built-in bookcases on the south wall at the great-room end and on the west wall, a boucle
reading chair with a drum table and lamp, a sisal rug and a basket. A sideboard with art stands on the west wall north of the
living-room door.

Why this and not the other uses:
- The room is the crossing of three routes: the living-room pocket door (west), the great room (east, wide open) and the bedroom
  hall (the alcove to the north). Anything in its middle sits in a walkway. The south window wall is the one place out of all
  three paths, and it has the room's daylight.
- **Dining for 8** here would need about 11 by 14 ft clear around the table, which is the whole room, right across the routes,
  and it would take dining away from the folding glass wall and the deck, where indoor-outdoor dining is the point of the plan.
- **A walk-in pantry** would close off the window and bring back a kitchen at the wrong end of the house; the new kitchen's two
  tall pantry cabinets do that job where the cooking is.
- **Just open floor** wastes the light; a window seat costs almost no floor and gives the plan a quiet corner, which a big open
  room otherwise lacks.

### Kitchen storage and work triangle (r43 check)
With the old kitchen gone, all kitchen storage is at the street end: about 15 ft of base cabinets on the gable wall (with the sink
base) besides the dishwasher, 8½ ft on the north wall including a corner cabinet, the island's 12 ft of cabinets on its working side, about 19 ft of uppers, and two
full-height pantry cabinets (5 ft). That is more than the old kitchen had, and enough for a kitchen this size.

The fridge moved from the south end of the gable wall to its north end, by the corner, next to the range. The work triangle is
now about 4¾ ft fridge to range, 10 ft fridge to sink and 12½ ft sink to range (about 27 ft in all, with the island as the prep
surface between sink and range), instead of a fridge about 20 ft from the range.

### Street gable (mostly solid)
The street wall keeps its siding. It gets a window over the sink (a copy of the house's own kitchen window, about 6 ft wide) and
above it the high glazed gable of the first version (four fixed panes following the roof, sill at about 8½ ft). From the street
that is far less glass than the first version; from inside, the high glass shows sky and treetops rather than the street, and
the room is not on display at night.

### South wall: folding glass wall and deck
- A 14.4-ft opening in the south wall (x 18.0 to 32.4, 7 ft 7 in high), in place of today's 14¼-ft picture window and the wall
  next to it, with a six-panel folding glass wall in black frames (NanaWall-style). In the tour it is operable: click or tap a
  panel to fold it open or shut. It starts open; the panels stack at the east jamb and swing out onto the deck, one panel
  (2.4 ft) deep.
- The porch deck is carried east along the great room, 8.4 ft deep (to y = −4.0) and to x = 33.6, so the folded stack lands on
  the deck. The floor runs straight out through a flush sill. Same composite decking, skirt and cable railing as the porch; the
  porch steps stay, shortened to start at the new deck's edge.
- Staging on the deck: an outdoor dining table for six by the dining area, two lounge chairs with a low table, and planters along
  the east rail.
- Privacy: the deck faces the driveway. The planters are a start; a hedge or a row of columnar shrubs along the driveway side,
  outside the rail, would screen the deck and the glass from the drive. Night-time privacy would want shades or a screen built
  into the head of the folding wall.

## Honest assessment of the second version

**Is it better than the first?** As a room, yes. The first version is a beautiful open volume with the old kitchen kept off to one
side; this one gives that volume a center (the island), a focal wall (the fireplace) and a reason to open up (the deck). It is
the plan in the owner's reference photo, and it puts the glass on the long south side, in the sun, where the first version spent
it on the street. Circulation is cleaner too: you never walk through the kitchen.

**What it costs.** Much more than the first version: a relocated kitchen (plumbing, gas, venting, electrical), a gas fireplace,
four skylights, a large structural opening, a premium folding door system and a new deck. It is a whole-floor remodel, not an
opening-up.

**What could make it implausible, and what an engineer and the county would need.**
- **The 14.4-ft opening.** The south wall is an eave wall carrying the rafters, so it needs an engineered header (glulam, LVL or
  steel) sized for the roof load and for very small deflection, because folding panels bind if the head sags (makers typically
  ask for about ¼ in or less). If that wall is part of the house's lateral bracing, taking out 14 ft of it may need a steel moment
  frame or new shear walls elsewhere. Both are routine for an engineer; neither is optional.
- **Ridge beam and posts**, as in the first version.
- **Deck**: a new permitted deck with footings, a flashed ledger, guards at least 36 in high and a sill that drains (a
  floor-level threshold facing weather needs a drained track and a slight slope away).
- **Fireplace**: a direct-vent gas unit through the north wall (a vent cap is shown outside) and a gas line.
- **Skylights**: wells need headers between the rafters, and skylight area counts against the Title 24 energy budget along with
  the folding wall.
- **Kitchen**: the fridge now sits at the north end of the gable run, by the range (r43); the sink-to-range leg (about 12½ ft) is
  still on the long side, with the island in between as the prep surface.
- **Bedrooms**: the same trade as the first version, 6 bedrooms become 4, and everything said above about bedroom count and value
  applies equally.

**Verdict.** Of the two 4-bedroom versions, this is the stronger idea and the one to show if only one is shown. It should still be
presented the same way: an illustration of what the house could become for a buyer who wants an entertaining house, not a
recommendation to remodel before selling.

## Model notes (second version)

- `bim2/scene.opt-OS-REMODEL-open4k.glb` and `.meta.json`, built by `bim2/tools/build_open4k.py` (which imports the first
  version's builder for the shared shell) and listed in `scene.meta.json` `options[]` as `open4k`, the fifth card in the floor
  plan picker.
- The folding wall is an opening with `leaf: {kind: 'FOLD', panels: 6, stack: 'east', state: 'open', plane: 4.60}`. The page
  builds and animates its panels (block `FOLD42`, after `OPT42` in `tour/index.html`), with a walk collider across the opening
  while it is shut and one where the folded stack stands. QA: `FOLD42.items`, `fold42Toggle(FOLD42.items[0])`.
- Viewpoints: foyer, entry, kitchen, kitchenrun, living, nook (the old kitchen from the great room), hallside (the old kitchen from
  the hall alcove), deck, driveway, street, aerial (`await __IDEA42.view('nook', 'open4k')`).
- The option drops every as-built `KX-` furnishing (the old kitchen) and its `clearRegion` covers the old kitchen, so loose pieces the
  page built there hide too; the old kitchen's space is renamed 'Reading nook'.
- Builder rule learned here: the page matches an option's colliders to the house's by element id and its walkable floors by id.
  A collider or floor the option changes must carry a new id (`W-L1-K4S`, `RL-FRONT-STAIR-K4`, `SL-DK-K4`, `ST-FRONT#n-K4`);
  reusing the as-built id keeps the as-built one (the old south wall blocked the opening, and only the old porch was walkable).
- QA: `FOLD42.walk([25, -1], [25, 8])` is null with the wall open and stops at y ≈ 3.75 with it shut (`FOLD42.set(0)`).
- Rebuild: `python3 tour/bim2/tools/build_open4k.py` (after `build_open4.py` if the as-built package changed).

