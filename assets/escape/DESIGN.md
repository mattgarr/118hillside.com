# Locked In at Hillside: three levels

Design for Easy (kept), Medium and Hard. Written before the code; revised after a critical pass (see "Review and revisions" at the end).

The house is the game. Every lock in every level is opened by something the real house does: the sun moving through its large windows and skylights, its sliding and pocket doors, its shades, the rainbow film on a downstairs window, the hidden door under the stairs. Each level walks the player through more of it.

---

## 1. What we took from great puzzle games

| Source | What makes it work | What we took |
|---|---|---|
| **The Room** series | You handle mechanisms. Every box has a satisfying physical action, and the action itself is the reveal. | Every solve is a physical act on the house: slide a door, lower a shade, drag the sun. No abstract "use item" menus. The lowered kitchen shade turning into a shadow screen is the purest example. |
| **Myst / Riven** | The place is the puzzle. You learn the island by looking; clues are architecture, not notes. | The clues are in the real rooms: a floor plan of the bedroom wing you match against the real hall; tracing paper drawings of each floor that only make sense once you know how the floors stack; the stairwell as the alignment mark. |
| **Return of the Obra Dinn / Outer Wilds** | Knowledge is the key. Nothing in your pockets changes; what you *know* opens doors. | The time of day is knowledge. Nugget tells you "noon"; Admiral tells you "the moment the sun reached my window". You don't pick anything up; you set the sun because you know when. The Hard strongbox asks for the order of the day, which only exists in your head. |
| **Professor Layton** | Warm, character-led puzzles. Each puzzle is a small favour for someone with a personality. | Each pet's puzzle comes from who they are: the goldfish who won't sit in direct sun, the hamster who sleeps all day, the shy rabbit who needs it dark, the tortoise who only moves when the sun does, the old dog who naps in sunbeams, the parrot who repeats the last thing she heard. |
| **Exit / Unlock boxed games** | Layered clue chains, and a final meta-puzzle that uses earlier answers in a way you didn't expect. | Medium's final lock uses all four pets' numbers in an order you only learn from the last pet. Hard's strongbox shows the sun's arc with four slots: the digits go in the order of the day, a rule Snowball drew on his very first note. |
| **Good real-world rooms** | Strong theme, one big aha per puzzle, parallel tracks so a group can split up, minimal and fair red herrings, a reveal at the end. | Medium and Hard have parallel tracks on different floors (a family can split: one upstairs, one down). One aha per puzzle. Red herrings are limited to things that are honestly there (closets with coats in them). Each level ends on a story reveal and a cinematic of the house. |

Rules we hold to: no pixel hunting (everything you can act on wears a gold ring), no outside knowledge (every rule you need is drawn or said in the game), no guessing (each answer is unique and checkable), no tiny text (clues are big drawings; the notebook shows each one full width on a phone).

---

## 2. The house as a puzzle box (inventory)

Read from the model (`tour/bim2/scene.meta.json`, `window.HILLSIDE`, `DOOR28`, `BL35`, `R28W`) and the tour stops. Sun directions are from `HILLSIDE.sunPosition` with the model's plan rotation (46.14 degrees).

| Feature | In the model | Behaviour we rely on |
|---|---|---|
| Great-room picture window `WN-L1-03` | 14 ft wide, two roller shades (light filtering) | Sun from about 11 AM to sunset. A big light patch that sweeps across the sitting area as the sun drops. |
| Kitchen sink window `WN-L1-02` | Roller shade, light filtering | Sun from early afternoon in summer. Lowered, the shade is a translucent screen: anything taped to the glass throws a shadow on it. |
| Front iron-and-glass doors `D-LG-02` | Glass in an iron grid (two mullions, two transoms) | Low morning sun throws a three-by-three grid of light across the whole entry floor. Low raking light shows dusty paw prints. |
| Back iron-and-glass doors `D-L0-11` | Same grid | Late sun. Used in Easy. |
| Kitchen pocket door `R28-POCKET` | Slides into the wall | Easy's clue hangs on its kitchen face, hidden while it is open. |
| Bedroom closets `D-L1-07`, `D-L1-09` | Three sliding doors on three tracks | Open together; the closet behind is a hiding place. |
| Front bedroom pocket door `D-L1-08` | Opens off the dining area | Makes the front bedroom recognisable on a drawn plan. |
| Honeycomb shades (every other window) | `BL35` items, blackout in bedrooms | Lower to darken a bedroom. |
| Skylights `SK-R01..R12` | Each with a shade | In midsummer the office skylights put two bright squares on the floor and desk around midday. |
| Rainbow film `WN-L0-03` | Every pane of lower bedroom 1's back window | Evening sun through it throws colour into the room. |
| Primary stacking doors `D-L2-01` | Faces the balcony and the western hills | Strong sunset light deep across the primary bedroom floor. |
| Primary bath | Two mirrors over the vanity, glass shower | Backwards writing on the shower glass reads true in the mirror. |
| Loft window seat | Cushion under the loft windows | A hiding place. |
| Lower-level lounge | TV, refreshment counter with beverage cooler, stacking doors to the terrace, **hidden door under the stairs** `D-L0-05` | Medium's party fridge and TV; Hard's hidden room. |
| Terrace | Paver stone, pergola, outdoor kitchen, smoker, heritage oak | Mabel's warm paving. Hard's final scene. |
| Balcony | Faces west to the hills | Hard's last light of the day. |

Not used, and why: the lazy Susan and the glass-front cabinets are not in the model, so a puzzle there could not be seen. The garage has no fair mechanism (its window and door give no readable light) and is mentioned on the finish card instead. The oak's real shadow outdoors depends on the engine's shadow settings on phones, so Mabel's puzzle uses the hour, not a drawn shadow.

---

## 3. The levels at a glance

| | Easy: Pop the Cork | Medium: The Missing Treat Tin | Hard: The Sunset Heist |
|---|---|---|---|
| Time | 3 to 6 min | 12 to 20 min | 25 to 40 min |
| Floors | Main | Main and lower | All three, and outside |
| Day | An October afternoon | A July afternoon into dusk | Midsummer, sunrise to sunset |
| Sun slider | 7 AM to 7 PM | 7 AM to 9 PM | 6 AM to 9 PM |
| Puzzles | 2 | 5 | 10 |
| Final lock | 3 digits | 4 digits, order from a clue | 4 digits, order from the day |
| Who it suits | First go, younger players | A family, two floors to split | Sharp teens and adults |

All three share the same controls: drag to look, white circles to walk, gold rings to look closer, the sun slider, the map (tap a place to go there), Snowball's hint button, and from Medium up a notebook that keeps every clue you've found at full size.

---

## 4. Easy: Pop the Cork (kept, leak fixed)

**Plot.** Snowball has locked the evening's champagne in the drinks fridge at the coffee bar and drawn one clue. Reveal: the fridge opens at dusk, the house lights come on, and the doorbell rings.

**Puzzles.**
1. *The drawing on the pocket door.* Slide the kitchen pocket door shut; Snowball's drawing is taped to its kitchen face. Aha: the clue was on the door you walked through.
2. *The light on the floor.* Make the house match the drawing: raise the great-room shades, put the sun at four o'clock, and the card strips on the window write 3 2 7 on the floor (the tracing-paper strips let light through). Aha: the paper on the window looks like nonsense; only the sun can tell card from tracing paper.

**The leak and the fix.** A play-tester found that dragging the sun to 4 PM showed the digits on the floor before the drawing was found. Now the great-room roller shades start fully down (Snowball pulled them for his nap), so no light reaches the floor and the paper is hidden behind them. The drawing now shows the shades rolled up, and the gold ring that raises them only appears once you have seen the drawing. The validator checks that the light on the floor needs `sawDrawing`.

**Polish.** The light on the floor now follows the real shade position. Progress persists across reload.

---

## 5. Medium: The Missing Treat Tin

### Plot

*Hook.* A July afternoon. Snowball's treat tin has gone from the kitchen counter, leaving a ring in the crumbs. Snowball is outraged and appoints you his assistant. Four suspects, all acting strangely: Biscuit is asleep with a guilty look, Clover is hiding somewhere, Pepper keeps shouting "SURPRISE" and then saying nothing, and Nugget won't wake up.

*Escalation.* Each suspect, once you get them to talk, turns out to be holding a number and a little drawing with a party hat or a ribbon on it. Snowball reads it as evidence of a gang. The last suspect, Nugget, has the plan: the lounge drinks fridge downstairs, and the order of the four numbers.

*Reveal.* The party fridge opens at dusk: the treat tin with a bow on it. The lounge TV lights up with "Happy birthday, Snowball", and all four "suspects" are there. It was never a theft. They hid the tin so he wouldn't eat the party early, and every clue was an invitation. Snowball: "I knew. Obviously. I'm only crying because of the dust." The "SURPRISE" Pepper kept blurting was the giveaway all along.

### Cast and places
Snowball (hints, follows you). Biscuit (great room; won't do stairs). Clover (front bedroom closet; shy, counts by thumping). Pepper (lower-level bedroom with the rainbow film). Nugget (lower-level bedroom with the skylights; sleeps all day). Places: entry, living room, kitchen, great room, bedroom hall, front, middle and back bedrooms, stairs, bonus lounge, lower hall, lower bedrooms 1 and 2.

### Dependency graph

```
                start (kitchen, case note)
        /             |                 |                 \
  M1 Biscuit      M2 Clover          M3 Pepper          M4 Nugget
  raise shades    find map (fridge)  go downstairs      go downstairs
  sun to his bed  match the plan     sun to the film    make it dusk
  -> digit 6      open the closet    -> digit 9         -> digit 2 + ORDER
                  count thumps -> 4                     + "the lounge fridge"
        \             |                 |                 /
                   M5 Party fridge (lounge): 4 9 6 2
```
M1 to M4 can be done in any order and split between people. M4 is the multi-step chain whose output (the order) the final needs. Target 15 minutes; 12 for a quick adult, 20 for a family taking it slowly.

### Puzzles

**M1. Biscuit's sunbeam (great room)**
- *Sees:* Biscuit asleep on his bed in the sitting area, the room dim with both big shades down. Snowball's case note: "Biscuit naps in the sun. Somebody pulled the shades."
- *Notices:* no sun can reach him with the shades down; once they're up, the patch of light on the floor moves as the sun moves.
- *Deduction:* raise the shades, then drag the sun until the light reaches his bed (late afternoon, from about 5:15 PM).
- *Answer:* he wakes, stretches and gets off the bed. He was lying on six dog biscuits laid out as a big **6** (with a party hat drawn on the paper under them).
- *Unique and fair:* one bed, one figure. The biscuits are big and drawn on a large card; the notebook keeps it.
- *Hints:* 1 "Dogs nap in the sun. Biscuit can't find any." 2 "Raise the shades on the big windows, then drag the sun until the light reaches his bed." 3 "Late afternoon. Go to five thirty." (and Snowball nudges the slider there).
- *Mis-solve / brute force:* the digit is under him until he wakes. Waking needs the shades up and light actually on the bed, which the game computes from the real sun.

**M2. Clover's hiding place (bedroom wing)**
- *Sees:* a drawing held to the kitchen fridge by a magnet: a plan of a bedroom wing with three bedrooms, a hall, a bath and a dining table, and a carrot drawn on one closet. Signed with a rabbit foot.
- *Notices:* the marked bedroom is the one that opens off the dining table, not the hall.
- *Deduction:* that is the front bedroom, through the pocket door by the dining area. Open its closet (three sliding doors).
- *Answer:* Clover, behind the coats, with a carrot tied in ribbon. She thumps her foot four times (four big THUMPs on screen, and the sound). Snowball: "Rabbits count with their feet." **4**.
- *Unique and fair:* only one room on the plan opens off the dining table. The other closets open too, with funny lines ("Shirts. No rabbit."), so the map is the honest way in.
- *Hints:* 1 "Clover drew where she's hiding. Look on the kitchen fridge." 2 "Her plan has a dining table on it. Which bedroom opens straight off the dining table?" 3 "The front bedroom, through the pocket door by the table. Open its closet."
- *Brute force:* the closets have rings only after the plan has been read, and Clover is only behind the right one.

**M3. Pepper's rainbow (lower-level bedroom 1)**
- *Sees:* Pepper on the bed, yelling "SURPRISE! ... No. Nothing. NO RAINBOW, NO TALKING." The back window is covered in rainbow film, with strips of paper stuck on it in a boxy figure.
- *Notices:* the film only throws colour when the sun is on it, and that is only in the evening.
- *Deduction:* drag the sun into the evening (about 6:30 to 7:45 PM in July).
- *Answer:* rainbow light pours across the room and the paper strips leave a **9** in it. Pepper: "RAINBOW! NINE! NINE! SURPRI... no."
- *Unique and fair:* card and tracing paper in the same boxy shapes, so the figure on the glass reads as an 8 to anyone who doesn't use the light; only the light shows which strips are card. That is the Easy trick, now in colour.
- *Hints:* 1 "Pepper wants a rainbow. That window makes them, but only when the sun's on it." 2 "That window gets the evening sun. Drag the sun later." 3 "Seven o'clock. Then look at the floor."
- *Brute force:* the light only shows the figure once Pepper has asked for her rainbow.

**M4. Nugget's bedtime (lower-level bedroom 2)**
- *Sees:* Nugget fast asleep in a nest of bedding on the console under the skylights. Snowball: "Nugget sleeps all day. He's useless till dark."
- *Notices:* you control when dark is.
- *Deduction:* drag the sun past sunset.
- *Answer:* Nugget wakes, stretches and scurries off to the window to watch for the moon. He was sleeping on his card: four faces in a row (Clover, Pepper, Biscuit, Nugget) with sunflower seeds in the shape of a **2** under his own face, and a drawing of the lounge drinks fridge with balloons.
- *Unique and fair:* the card is the order. It is drawn big, and the notebook shows it next to your digits.
- *Hints:* 1 "He only gets up at night." 2 "You've got the sun. Put it away." 3 "Drag the sun past sunset, to nine o'clock."
- *Brute force:* the card is under him until he wakes.

**M5. The party fridge (lounge)**
- *Sees:* the beverage cooler under the TV with a keypad lock: four plain boxes. Nothing on the lock says which number goes where; that is Nugget's card.
- *Deduction:* put each pet's number in Nugget's order: Clover 4, Pepper 9, Biscuit 6, Nugget 2.
- *Answer:* **4962**.
- *Unique:* one card, one order.
- *Hints:* 1 "Four suspects, four numbers. Nugget knows the order." 2 "Read Nugget's card left to right and use each pet's number." 3 "Four, nine, six, two."
- *Brute force:* without Nugget's card you are missing one digit and the order: 240 possibilities. After three wrong tries the keypad pauses for 20 seconds.

---

## 6. Hard: The Sunset Heist

### Plot

*Hook.* The longest day of the year, 6:45 in the morning. Snowball's note: "Today is the longest day of the year, which makes it the best day for a heist. By sunset I will have stolen everyone's favourite thing and locked them in my strongbox, in a place you'll never find. Everybody saw a bit of what I did. None of them will just tell you. Here's my day, if it helps." Under it, a drawing of the sun's arc with four paw prints along it.

*Escalation.* The witnesses each lost something (Biscuit his ball, Admiral his castle, Pepper her red feather, Clover her carrot, Mabel her strawberry) and each saw Snowball at one moment of the day. At each moment he left a number written in light, which only shows at that hour. He also tore his own map into three sheets of tracing paper and hid one on each floor. Upstairs, he wrote backwards on the shower glass, because he thinks it's funny.

*Reveal.* The three sheets, stacked, show an X on the lounge wall under the stairs: the hidden door. Behind it, the strongbox, its lock drawn as the same sun arc from his first note. Open it, and everyone's favourite thing is inside, cleaned and wrapped, with a note: "Not a heist. A lost and found. You're welcome." Cut to the terrace at sunset: every animal with its thing back, the pergola lights coming on, and Snowball on the warm paving next to Mabel. The paw prints on his first note were the plan all along.

### Cast and places
Snowball (hints, his notes). Biscuit (entry). Admiral (kitchen counter by the sink window). Clover (middle bedroom closet). Pepper (skylit office). Mabel (terrace). Places across all three floors and outside: entry, living room, kitchen, great room, bedroom hall, middle bedroom, stairs, loft, primary hall, primary bath, primary bedroom, balcony, bonus lounge, skylit office, terrace.

### Dependency graph

```
start (entry, 6:45 AM, the sun-arc note)
 |
 |-- H1 Biscuit (entry) ------- morning prints -> 7 [morning] -------------\
 |-- H2 Admiral (kitchen) ----- shade + sun -> shadow 3 [afternoon] -------\
 |-- H3 Pepper (office) ------- "HIGHEST" -> skylight on desk -> 5 [midday] -> H10 strongbox
 |-- H6 sunset note (primary) - sun at sunset -> 8 [sunset] --------------/   (order of the day)
 |                                                                          ^
 |-- H4 mirror (primary bath) -> H5 window seat (loft) -> upper sheet --\   |
 |-- H7 Clover (middle bedroom): shade down -> main sheet --------------- H8+H9 stack the sheets
 |-- H8 Mabel (terrace): move the sun -> lower sheet --------------------/   -> X under the stairs
                                                                             -> hidden door
```
Two big tracks that can be split (digits, sheets), each with sub-tracks on every floor. Chains: H4 to H5; H8 sheets to H9 stack to H10 door; all four digits plus the arc rule to the strongbox. Target 30 minutes.

### Puzzles

**H1. Biscuit's sunny squares (entry, morning)**
- *Sees:* Biscuit lying by the front doors. "He went past me first thing. Sun was coming in the front doors. Didn't wipe his paws."
- *Notices:* the front doors' iron grid throws squares of light across the floor in the early morning, and low raking light shows dust.
- *Deduction:* drag the sun to early morning (about 7 to 9 AM) and look at the floor.
- *Answer:* dusty paw prints show up inside the squares of light, walking a big **7** across the entry. Recorded as "first thing in the morning".
- *Unique and fair:* the prints only show in raking light; they are big (each about a foot) and the figure spans the floor.
- *Hints:* 1 "Biscuit says the sun was coming in the front doors. When does it do that?" 2 "Early morning, low sun. Then look at the floor, not the doors." 3 "Seven thirty. The prints make a number."
- *Brute force:* the prints are drawn only after Biscuit's line has been heard.

**H2. Admiral's shadow show (kitchen)**
- *Sees:* Admiral's bowl on the counter by the sink window. Bits of card and tracing paper are taped to the glass. When the sun is on the window: "Direct sun. I shan't speak." In shade: "The cat came this afternoon and taped rubbish to my window. Lower the shade and see. I'd rather not."
- *Notices:* a lowered light-filtering shade is a screen, and the sun throws the card's shadows onto it.
- *Deduction:* lower the roller shade, then put the sun on the window (afternoon).
- *Answer:* the shadows of the card strips on the glowing shade make a **3**. Admiral, in the shade now: "Most agreeable." Recorded as "afternoon".
- *Unique and fair:* tracing paper strips throw no shadow, so only the card counts; the shape is big and fills the shade.
- *Hints:* 1 "Admiral hates the sun. Give him some shade." 2 "With the shade down, the sun shines through it. Whatever's on the glass makes a shadow." 3 "Shade down, then any time in the afternoon. Read the shadow."
- *Brute force:* the shadow only appears with the shade down and the sun on the glass, and only after Admiral has spoken.

**H3. Pepper in the office (skylit office, lower level)**
- *Sees:* Pepper on the desk chair: "SUN ON THE DESK! SUN ON THE DESK! HIGHEST! HIGHEST!" She repeats the last thing she heard, which was Snowball.
- *Notices:* the office has two skylights; their squares of sun cross the floor during the day.
- *Deduction:* when the sun is highest, the skylight square lands on the desk.
- *Answer:* around 1 PM the light from the skylight with paper on it lands on the desk and shows a **5**. Recorded as "when the sun was highest".
- *Unique and fair:* one desk, one skylight with paper. The square is only on the desk for about an hour.
- *Hints:* 1 "Pepper repeats whatever she heard last. That was me." 2 "Sun on the desk, when the sun's highest. The light comes from the skylights." 3 "One o'clock. Look at the desk."
- *Brute force:* drawn only after Pepper's line.

**H4. Backwards on the glass (primary bath)**
- *Sees:* big letters soaped on the shower glass: TAES WODNIW, written backwards.
- *Notices:* it's backwards. There's a mirror opposite.
- *Deduction:* look in the mirror over the vanity.
- *Answer:* the mirror reads **WINDOW SEAT**.
- *Unique and fair:* two big words, no other window seat in the house.
- *Hints:* 1 "I wrote that. It's not wrong, you're looking at it wrong." 2 "Read it in the mirror." 3 "Window seat. There's one in the loft."
- *Brute force:* the cushion ring in the loft appears after the mirror has been read.

**H5. The window seat (loft)**
- *Sees:* the loft window seat with its cushion.
- *Deduction:* lift the cushion.
- *Answer:* a sheet of tracing paper: the upper floor in pencil, with the stairs, and a single slanted stroke near them. Snowball's note: "One per floor. Obviously."
- *Hints:* 1 "The mirror said where." 2 "The loft, at the top of the stairs." 3 "Lift the cushion on the window seat."

**H6. The last job (primary bedroom, sunset)**
- *Sees:* Snowball's note taped to the stacking doors to the balcony: "Last job of the day." A drawing of the sun touching the hills. Paper strips on the door glass.
- *Deduction:* drag the sun down to sunset (about 7:45 to 8:15 PM in June).
- *Answer:* the low sun pours through the doors and the strips leave an **8** across the floor. Recorded as "sunset".
- *Hints:* 1 "My note says when." 2 "The sun going down behind the hills. Drag it late." 3 "Eight o'clock. Look at the floor."
- *Brute force:* drawn only after the note has been read.

**H7. Clover in the dark (middle bedroom)**
- *Sees:* the closet with three doors. Open it: Clover pressed into the back corner. "Too bright." She won't come out.
- *Notices:* the bedroom shade is blackout.
- *Deduction:* lower the shade.
- *Answer:* in the dim room Clover hops out and leaves the main-floor sheet of tracing paper (with the stairs and a slanted stroke).
- *Hints:* 1 "Clover's shy, and it's very bright in there." 2 "Bedroom shades block the light." 3 "Lower the shade on the big window."
- *Brute force:* she only leaves the sheet once the shade is down after you've met her.

**H8. Mabel's warm paving (terrace)**
- *Sees:* Mabel on the warm paving by the pergola, sitting on something papery. "Warm. Staying." She won't be moved.
- *Notices:* she says she'll move when the sun does.
- *Deduction:* change the time until her spot is out of the sun (late afternoon, when the house shades that corner).
- *Answer:* she plods off to a sunny patch. Underneath: the lower-floor sheet, with the lounge outlined and a small circle on its back wall.
- *Hints:* 1 "Mabel goes wherever it's warm. Right now that's on my sheet." 2 "Make her spot go cold. You've got the sun." 3 "Late afternoon, after four. She'll move."

**H9. Three floors, one map (notebook)**
- *Sees:* three sheets of tracing paper, each a different floor, each with the stairs, each with a stroke or a circle near the stairs that means nothing alone.
- *Notices:* tracing paper is see-through; every sheet has the same stairs.
- *Deduction:* lay them on top of each other, lined up by the stairs.
- *Answer:* the two strokes cross into an X inside the circle, on the lounge wall under the stairs.
- *The aha that reframes:* three scribbles you collected separately were one map all along, and the stairs (the one thing in the house that runs through all three floors) are what lines them up.
- *Hints:* 1 "Tracing paper is see-through for a reason." 2 "Put the sheets on top of each other in your notebook." 3 "X marks the lounge wall under the stairs."
- *Brute force:* the panel's ring appears only after the stack.

**H10. The hidden door and the strongbox (lounge)**
- *Sees:* a panel in the lounge wall under the stairs with no handle. Pushed, it swings open (the house's real hidden door). Inside: the strongbox. Its lock is drawn as the sun's arc, sunrise to sunset, with four boxes along it.
- *Notices:* it's the same arc as on Snowball's first note.
- *Deduction:* put each number where the sun was when you read it: morning 7, highest 5, afternoon 3, sunset 8.
- *Answer:* **7538**.
- *Unique:* four sightings, four distinct times; the notebook records the time phrase with each number.
- *Hints:* 1 "My first note. Look at it again." 2 "The boxes are on the sun's path. Each number goes where the sun was when you found it." 3 "Morning, highest, afternoon, sunset: seven, five, three, eight."
- *Brute force:* with all four digits but no order there are 24 tries; the box pauses after every three wrong. Missing a digit means 240 or more.

---

## 7. State machine and the validator

Each level's logic is data (`assets/escape/logic.js`) that both the game and the validator read: **steps** (an action the player can take, with `needs` flags and `gives` flags), **parts** (the knowledge each lock needs, each tied to the clue flag that must come first), **locks** (answer, parts, attempt limits), **goals** (objective lines with their done flag and three hint tiers). The game uses the same `needs` to decide which rings and buttons exist, so the validator checks the real gates.

`node assets/escape/check.js` walks every reachable state of each level and proves:
1. Every step and goal is reachable from the start.
2. Every lock's parts are all known in some reachable state before the lock opens, and the lock's answer can be built from them.
3. No part is known in any state that lacks its clue flag (no sequence leaks), including Easy's 4 PM light.
4. Codes are unique across levels, not trivial (no 1234, no repeats like 1111), and the search space without the clues is at least 24 with attempt pauses, and at least 240 without the last piece.
5. Every goal has three hint tiers; every step that is ever the next thing to do has a goal pointing at it.

---

## 8. Review and revisions

Read as a demanding escape-room designer, then as a ten-year-old.

**Cut or changed:**
- *Dragging tracing sheets to align them (Hard H9).* Fiddly with a finger on a phone and it adds nothing once you've had the idea. Now the notebook lays them together, lined up by the stairs, when you ask it to. The aha is the idea, not the dragging.
- *A colour-order lock for Pepper.* Rainbow order is outside knowledge. Pepper's number now comes from the light like Easy, in colour.
- *A sound-only clue (count the squeaks).* Not fair with the sound off. Clover's thumps are shown as four big words as well as heard.
- *The oak's shadow as a sundial for Mabel.* Engine shadows outdoors vary by device. Mabel moves with the hour instead.
- *A TV channel puzzle in the lounge.* It was a puzzle about a TV, not about the house. The TV stays as the Medium reveal.
- *Letter locks.* Hard for younger players to type on a phone; the one word clue (the mirror) only tells you where to go.
- *Reading "left to right" in Medium.* Nugget's card gives the order instead; the keypad has plain boxes so nothing contradicts it.
- *Easy's leak.* Fixed with the shades (section 4).

**Checked for a ten-year-old:**
- Every clue is a picture or a few big words. The notebook shows each one full width.
- Each objective line says what to do next in plain words, and the map can take you anywhere.
- The number of things on the go at once in Hard is high, so the objective line names the next thing for the floor you're on, and Snowball's hint follows where you are.
- The twist in Medium is set up from the first minute (Pepper's "SURPRISE"), so it lands as "oh!" and not "huh?".

**Checked for a demanding designer:**
- One aha per puzzle, and none repeat within a level. Easy's light trick comes back once in each harder level, each time with a new turn (colour in Medium; a shadow screen, raking light, a skylight and sunset in Hard).
- The meta in Hard uses something from the very first screen.
- Parallel tracks: Medium splits by floor; Hard splits into digits and sheets, both spread over every floor.
- Red herrings are only real things (other closets, other windows), never fake clues.

## 9. As built (what changed in the build and the playtests)

The sections above are the design as it was signed off. The build moved some things once the clues were in the real model and played by hand at desktop and phone size. Where this section and the sections above disagree, this section is right.

**Easy.** As designed. The floor light only shows the 327 once the drawing has been seen and the shades are up, and the validator proves it.

**Medium (July, day 200).**
- Pepper is in the lower-level bedroom 2 (`lbed2`), and the rainbow film is on the bottom panes of its window (`WN-L0-07`). The 9 reads from about 5:15 to 5:45 PM, not 6:30 to 7:45.
- Biscuit wakes when the real sun patch reaches his bed, which with both shades up is about 5:15 to 5:45 PM.
- Nugget sleeps in a nest on the cube shelf in the skylit office, not in a bedroom. He wakes at dusk (8:45 PM or later).
- Clover's plan is drawn from the real floor plan polygons and hangs on the coffee bar's fridge. The other closet with three doors (middle bedroom) is the honest red herring.
- Code 4962 (Clover 4, Pepper 9, Biscuit 6, Nugget 2). Three wrong tries pause the keypad for 20 seconds.

**Hard (midsummer, day 172).**
- Read windows, as tuned in play: paw prints 8:30 to 10:15 AM (7); the skylight square on the desk 2:00 to about 2:45 PM (5); Admiral's shadow 4:15 to 5:45 PM (3); the sunset floor at half past seven and a quarter to eight (8). Outside those hours the figure is on the wrong spot or pulled out of shape, so the sheet says so instead of crediting a number.
- Admiral's 3 is a cut-out hanging outside the kitchen window on a string, not paper on the glass, so the shade can be lowered over it. It reads straight from the lowered shade's own close look.
- The prints are drawn as dust on the entry floor that fades in only while the morning sun is on it, as well as being cut out of the light. On a bright phone screen the cut-out alone was too faint.
- Clover is in the middle bedroom closet and comes out when its blackout honeycomb shade (`WN-L1-08`) is lowered. Mabel sits on the pergola paving and moves to cooler paving after 4 PM, leaving the lower-level sheet.
- The mirror step uses the real bathroom mirror's reflection; a matching overlay sits on it in the close look so phones without the reflection still read WINDOW SEAT. The notebook always has the words.
- The stacked sheets are composed with the pencil first and the red marks on top, and cropped round the stairs, so the X inside the circle is big on a phone.
- The start note says the numbers are written in light and shows the day as an arc with four paws (morning, early afternoon, late afternoon, sunset). The strongbox face is the same arc. Code 7538.

**Interface changes from play.** Look rings stay next to what they mark (they used to be pushed far away to avoid labels). The notebook's clue cards had collided with the tour's own `.card` style and collapsed; they are now `.clue`. On phones the toast sits mid-screen, the sun slider follows a sheet that grows or shrinks, and the arc lock has its own Delete.
