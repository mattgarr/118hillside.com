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
