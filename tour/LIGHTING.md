# Tour lighting: study and plan (r40)

Owner, 11/11: "maybe you need a comprehensive study of lighting as you do all this? If the lighting is wrong, fix the
lighting instead." This file is that study. It lists every mechanism in `tour/index.html` that makes or changes light, says
whether it is physically motivated or a compensating hack, what it costs on screen, and what r40 did with it.

Line numbers drift; search for the names given.

## 1. Inventory

### 1.1 Direct light

| Mechanism | Where | What it is | Verdict |
|---|---|---|---|
| Sun | `sun` DirectionalLight, `setTOD` (`sunPosition(T.h, T.doy)`) | Real solar position for the time-of-day presets, colour and intensity by sun height. | Physical. Kept. |
| Sun shadow | `fitSunShadow`, `__shadow22` | 2048 map, box fitted to what the camera looks at, refit in 10 ft steps with hysteresis, rotated-disc PCF. | Physical. Kept. |
| `hemi` HemisphereLight | `setTOD`, `lightFrame` | Sky/ground fill (.18 day, .12 dusk); indoors its ground colour became the room's floor bounce (`LIGHT.room.hemiGround`), outdoors brown earth. At dusk .2 outside, .12 inside. | Physically motivated, but switched on the camera's inside/outside state (a one-frame pop). r40: blended by `EXPO_IN`. |
| `amb`, `fill`, `fill2`, `camLight` | scene setup, `setTOD` | Ambient (.04 at dusk), two fill directionals and a camera head-lamp. All 0 by day. | The head-lamp and fills are fakes, but they are already off. Left. |
| `DUSK_LIGHTS` | `lampPts`, chandelier hub (`bim2` lights) | Seven room point lamps (warm 0xffc98a, 38 ft, decay 1.6) plus the chandelier lights, 1.15 at dusk, 0 by day. | Physical (these are the house's lamps). Kept; they now carry the dusk window glow (see 1.5). |
| Under-cabinet, pergola, pool, bar sconces, cable track | fixtures / `PERGOLA26/27` / `bim3BarSconces` / `meta.lights` | Real fixtures, dusk only. | Physical. Kept. |
| Halloween / Thanksgiving lights | `HW.bind`, `TG.light` | Candles, accent lights. Halloween switched indoor and outdoor sets in one frame on the inside/outside state (point lights without shadows shine through walls, so only one side is lit). | The side switch is a hack against light leaking through walls. r40: the two sets cross-fade with `EXPO_IN`. |

### 1.2 Indirect light (image-based)

| Mechanism | Where | What it is | Verdict |
|---|---|---|---|
| Sky environment `ENV_RT` | `rebuildEnvironment` | Equirect sky painted from the sky colours and sun glow, white-balanced, PMREM. | Physical (a stand-in for the sky). Kept as THE outdoor light. |
| Indoor environment `ENV_IN` | `rebuildEnvironment` rule 10, `v29Bounce` at dusk, Halloween / Thanksgiving swap it | A panorama of a white room (ceiling, walls, oak floor band); at dusk lamp-lit. | Physically motivated (bounce light). Kept. |
| Per-room daylight panoramas `LIGHT_ENV` | `lightRoomPano`, `lightApplyRoomEnv` | Each room's own panorama from its BIM windows (solid angle of sky / trees / ground), brightness by window share. | Physical intent, good. Kept. |
| **ONE environment for the whole scene, picked by where the camera is** | `applyEnv`, `lightApplyRoomEnv` | Camera outside: everything, including the rooms seen through the windows, is lit by the sky. Camera inside: everything, including the garden seen through the windows, is lit by the room panorama. | **The root error.** It is why the glass had to be faked (1.5), and every crossing of a door or room boundary swapped the whole scene's light in one frame. r40: two environments, chosen per surface (section 3). |
| Room switching | `lightFrame` (every 10 frames), `bim2CameraZone` | The room panorama followed the camera's room cell; a door opening is in no cell, so a doorway read as "outside" for 2-7 frames, then the next room. | Hack-free in intent but it produced the 10-14/255 one-frame pops the video render measured. r40: room and inside/outside are debounced and crossfaded (section 2). |
| Mirror probes | `glass20Step`, `B3MR` | Box-projected cube captures, one face per frame, recaptured when the state key changes. Light floor .34 in the mirror shader. | Captures are physical. The light floor is a fake against a black disc at grazing angles (the capture sees the exterior through the front glass). Left. |

### 1.3 Exposure, tone, colour

| Mechanism | Where | What it is | Verdict |
|---|---|---|---|
| ACES filmic tone map + `CustomToneMapping` | renderer setup, r16 | Filmic curve, same on desktop and phone. | Physical camera model. Kept. |
| Base exposure | `setTOD`: `.82 + .25 * low` day, 1.25 dusk; `LOOK.outExpo` | By sun height. | Physical (a camera's exposure for the scene). Kept. |
| Indoor exposure `LOOK.inExpo` + `EXPO_IN` | tick | Interiors ~1.2 stops brighter; `EXPO_IN` eased toward the inside state at `dt * 4` per frame (a share of the gap each frame, the biggest step first). | Physical (eye / camera adaptation), but it followed the raw flickering state. r40: driven by the debounced state, eased over 1.6 s (smoothstep), blended in stops. |
| Camera meter | `METER`, `lightMeterMul` | 16x16 readback, centre-weighted mean, highlight protection, target .63 in / .49 out / dusk-in .34; gain eased at `dt * 1.6`. | Physical (auto-exposure). But its target switched at `EXPO_IN = .5`, the ease was a share of the gap per frame with dt clamped to .05 (governor-skipped frames lost time), and each new reading (every 6th frame) kinked it. r40: indoor and outdoor answers both computed and blended in stops by `EXPO_IN`; the gain follows in log space through a critically damped response (tau .45 s, ~2.1 s to 95 %, exact for any frame time, on the real elapsed time). Measured: the same view reached from two different stops settles to the same exposure (0.00-0.12 %). |
| Grade pass | `GRADE_SHADER`, `LOOK.grade` | Contrast .32, saturation 1.06. | Photographic. Kept. |
| Exterior shadow lift `olift` | `lightFrame` | Lifts deep exterior shade (HDR-merged exteriors). | A photographic compensation (real-estate HDR). Kept, blended by `EXPO_IN` (was switched). |
| White balance | r6 `R6WB`, r10 `R10WB` (meter-colour AWB), r11 phone gains, r16 phone grade | Indoor camera white balance, all blended by `EXPO_IN`. | Physical (a camera's AWB). Kept. r10's AWB ease was a fixed step per scene render (several per frame); r40: once a frame on the frame time. |
| Halloween / Thanksgiving grade and meter | `hw22Frame`, TG hooks | Candle-amber indoor grade, fixed exposures in / out. | Mode looks. They switched on the inside state; r40 blends them. |

### 1.4 Darkening that is baked or drawn

| Mechanism | Where | What it is | Verdict |
|---|---|---|---|
| SSAO | composer | Screen-space ambient occlusion. | Physically motivated. Kept. |
| r13 corner bands | `R13` | Multiply decals in interior corners. Faded with `EXPO_IN` (off when the camera is outside). | Baked AO: fine. The camera-side fade was a hack. r40: always on in Tour / Walk. |
| r17 exterior grime / eave bands | `R17` | Multiply decals at the foot and the eaves of exterior walls. Faded with `1 - EXPO_IN`. | Baked AO / weathering: fine. r40: always on. |
| Terrain lift | `r36TerrainLift` | Small emissive lift on the aerial-photo ground by day. | Compensates a near-black photo. Left. |
| Fog | `scene.fog` 2500-70000 ft | Aerial perspective out to Skyline only. | Physical, and too far to touch the house (it was NOT what darkened the front doors). |

### 1.5 Glass (the owner's two complaints)

| Mechanism | Where | What it is | Verdict |
|---|---|---|---|
| glass20 shader | `glassify` (v20) | Fresnel (F0 .04, two panes), absorption, a ground-darkened reflection; alpha = 1 - transmission. | Physical. Kept. |
| `GLASS20.outRatio` .22 | `glass20Frame` | From outside, panes passed only 22 % of the room behind. | **Hack**: compensates the rooms being lit by the open sky (1.2). This is the "dark tinted glass" from the street. r40: removed (transmission is the Fresnel / absorption value from both sides). |
| `LIGHT.glassIn` .6 | `lightFrame` | From inside, 60 % of the garden ("HDR window pull"). | **Hack**: compensates the garden being lit by the room panorama. r40: removed. |
| Covered-porch rule `GLASS21` | `glass20Frame` wrapper | Under a roof (or looking at ground under a roof within 12 ft ahead), 60 % instead of 22 %, switched in one frame. | **Hack** on a hack. The front doors went from dark (street) to lighter (porch). r40 stage 1 eased it over 1 s; stage 2 makes it moot (clear glass everywhere). |
| Door-glass fade by distance | tick `SLIDERS` loop | Glazed door leaves (the steel-and-glass front doors, sliders, garage lites) faded from full at 8 ft to invisible at 3 ft. | **Hack** (v33): the "gets more transparent as we get closer" the owner saw. r40: clear at every distance; only the last foot before the pane fades, so the camera never cuts through a visible pane. |
| Door / window presence by side | tick glass block (`op` .58 outside, .06 inside) | Door glass and the GLOW panes were drawn at 27 % strength from inside. | Hack. r40: full from both sides. |
| Orange glass at dusk | `setTOD` (`M.glass.emissive` 0xff9a3c, .85 / GLOW .7), `GLASS20_U.gEm` (`LOOK.dusk.glowScale`), v29 W1/W2, Halloween .16 / .14 | The panes themselves emit amber light from outside at dusk. | **Fake glow.** r40: `gEm` = 0 with two environments; the rooms behind are lit by their lamps and the lamp-lit indoor panorama and are seen through clear glass. |
| v29 W3 grade tint | `v29GlassFrame`, grade `wIn`/`wK` | At dusk from outside, every pixel seen through glass multiplied by the lamp colour [1, .72, .43]. | **Fake tint** ("it shows as orange"). r40: off. |
| Obscure glass glow | `bim3ObscureFrame` | Frosted panes copied the dusk glass emissive (.55). | Fake. r40: off with two environments. |
| Glass colour 0x14191d / 0xeef2f2 / 0x2a2420 | tick glass block | Base colours. | Not used by the glass20 output (it draws reflection + alpha only). Neutral in effect. |

### 1.6 Time-of-day and special looks

`TOD` presets (morning / midday / golden / dusk) set sun, sky, fog colour, exposure and lamps at once; the Dusk stop changes the
time of day as part of the move (an instant change, noted, not judged, by the light check). Golden hour (`bim3` golden) and the
dusk sky band (rule 8b) are art direction on top of the physical sun position. Holiday dresses (winter decor adds no lights;
Halloween and Thanksgiving have their own lamps, grade and fixed exposure) were left as designed except for the one-frame
inside/outside switches noted above.

## 2. One-frame jumps (the video render's finding)

Measured on main (f90810b) by stepping every tour move at 30 fps with a simulated clock and reading the canvas back at 48x30
each frame; the lighting step is the median per-pixel luma change (a door frame crossing the view moves a minority of pixels).

The causes, in order of size:

1. A doorway is in no BIM space, so `bim2CameraIndoors()` was false for 2-7 frames at every door: environment, glass look,
   hemisphere ground, exterior lift and the meter target all switched out and back (9-24 / 255 at most interior doorways).
2. The room panorama switched in one frame on entering another room cell (8-14 / 255, the living -> kitchen -> great room pops).
3. The covered-porch glass rule switched in one frame under the porch roof.
4. The meter target switched at `EXPO_IN = .5`; `EXPO_IN` itself took 13 % of the gap in its first frame at 30 fps.

r40 stage 1:

- `R40L`: inside/outside must hold .35 s, the room .3 s, before they change (hysteresis); a door opening keeps the room you came
  from. `EXPO_IN` eases over 1.6 s (smoothstep of a linear progress: a reversal turns around without a jump). The covered share
  eases over 1 s. A cut (camera jumps more than 6 ft in a frame), a mode change, a time-of-day change or the loading screen snaps
  everything: the picture changes at once there anyway.
- `R40X`: the environment the page asks for becomes a target; materials see `R40X.out`, a PMREM-sized texture crossfaded from
  the last one. In / out: 1.6 s, with `EXPO_IN`. Room to room: .9 s, longer (up to 2.6 s) the more the two panoramas' measured mean
  brightness differs (a windowless hall next to a bright room); the curve is half linear, half smoothstep. One 768x768 quad per
  frame, only while a fade runs.
- `lightMeterMul`: continuous target, log-space ease on real time.
- navCheck `light`: every move forward and back, drawn at 30 fps on a simulated clock (with short yields so the meter's GPU
  readback lands as it does live). After each frame the move's START view is drawn again with that frame's lighting and read back:
  nothing in it moves, so its change is the lighting change alone (the walking view's own change is reported beside it). Fails a
  step over 1.5 / 255 or an exposure step over .045 stops in one frame; four views must settle to the same exposure from two
  different stops. The quality governor is held at its level during the run (see 4).

## 3. The model now (stage 2)

Principle: light every surface by what actually lights it; let the glass be glass.

- **Two environments, per surface.** `scene.environment` is always the sky (`ENV_RT`). A second environment, `envMapB`, is the
  room (the current room's daylight panorama when inside by day, else the indoor panorama), crossfaded by `R40X`. Every standard
  material picks between them per fragment from `R40M`, a 6-in plan grid of the BIM interior spaces holding up to two height
  intervals of interior air per cell (closed by 1 ft so interior walls and the openings between rooms count as inside, the outer
  walls do not). The test point is 9 in off the surface along its normal, so a wall's room face reads the room and its outer face
  the sky; floors and ceilings read the air above / below them. The shader change is in `THREE.ShaderChunk` (installed before any
  material exists, uniforms through the default `onBeforeCompile` that every material hook chains to): one texture read per
  fragment, the second environment only sampled where it is used. No new pass, no new lights, no per-frame scene work.
- **Glass**: Fresnel and absorption only, the same from both sides and at every distance; it reflects the environment of the side
  the camera is on. No emissive glow, no grade tint, no presence change by side or distance.
- **Dusk**: the windows glow because the rooms behind them are lit (lamps + the lamp-lit indoor panorama) and the glass is clear.
  Measured on main, the meter pulled every dusk interior down to x.28-.35 (about 1.6 stops): the rooms were lit far brighter than
  the dusk exposure, which only the painted glass hid. Through clear glass they burned to white. The room lamps and the lamp-lit
  panorama are now x`R40E.duskIn` (.3) of that, with more of the lamps' own colour in the panorama (`R40E.lampWb` .1, was .7
  white-balanced); the dusk indoor meter may lift .8 stops, so inside the rooms land where they were, and from the street they
  read warm through clear glass.
- **Exposure**: one meter, continuous; the indoor/outdoor difference is eye adaptation over 1.6 s.
- **Decals** (r13 / r17): always on.

`?r40env=0` gives stage 1 only (one environment, the old glass rules, eased); `?r40=0` also turns off the continuity layer.

## 4. Not changed, and why

- Mirror light floor (B3MR) and the terrain lift: they compensate captures / photo textures, not lighting.
- The Dusk stop's time-of-day change is instant by design (a different photo, not a walk).
- Halloween / Thanksgiving fixed exposures: art direction for the decor modes; only their switches were blended.
- No new real-time lights were added for performance; the rooms' existing lamps carry the dusk look.
- The quality governor (`GOV`): on a slow GPU it draws a still camera at a higher quality level ("sharp" frame) and drops back when
  a move starts. That switch changes the picture in one frame at the start of a move (measured 2-3 / 255 in the hidden test pane,
  where the governor sat at level 7 of 1). It is not lighting and was left; the light check holds the governor's level.
- Golden-hour interiors are as bright as before (very white); that is the existing exposure choice, not changed here.

## 5. Measured (r40)

Largest one-frame lighting step per move (/255, 30 fps, the move's start view redrawn each frame with that frame's lighting, no
post-processing, same harness on both builds):

| move | main f90810b | r40 |
|---|---|---|
| living > kitchen | 11.86 | 0.79 |
| kitchen > great | 0.21 | 0.00 |
| great > mainbeds | 10.50 | 0.28 |
| stairs > loft | 18.70 | 0.64 |
| porch > entry | 23.00 | 0.93 |
| lounge > terrace | 11.15 | 0.72 |
| terrace > yard | 0.28 | 0.07 |
| yard > garage | 17.07 | 1.00 |
| kitchen > living | 13.65 | 1.00 |
| mainbeds > great | 12.49 | 0.21 |
| loft > stairs | 14.43 | 0.07 |
| entry > porch | 9.36 | 1.00 |
| terrace > lounge | 15.93 | 0.79 |
| garage > yard | 19.28 | 1.00 |

Real time (requestAnimationFrame, ~55 fps): living > kitchen > great now makes two room changes, each crossfaded; main swapped the
lighting in single frames four times on that walk. porch > entry: one 'in' and one room change, crossfaded; main flipped in / out /
in within 38 frames.

Same view from two histories (4 views): exposure within 0.00-0.12 %.

Phone viewport (375x812 emulated, phone path), median frame time / draw calls, main -> r40: street 25.7 -> 24.7 ms (1399 calls
both), living 25.2 -> 23.8 (1153), great 9.2 -> 10.0 (176), kitchen 27.2 -> 29.7 (1373), primary 12.4 -> 14.5 (354), terrace
19.4 -> 16.9 (586); programs 50 -> 51 (the crossfade quad). Within run-to-run noise; no added draw calls or passes.
