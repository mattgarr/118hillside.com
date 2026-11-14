# aobake: baked ambient occlusion for the tour (r50)

Soft corner and contact shading for the house, ray traced offline and drawn by the page as a multiplier on diffuse light.
Nothing here modifies a GLB or a `scene.meta.json`: the output is sidecar files in `tour/bim2/ao/`.

## Re-bake (one command per scene)

Run from the repo root. Each scene is two steps: export the geometry as the page builds it (headless Chromium, no drawing,
about 30 s), then bake (about 2 min on 2 CPUs).

```sh
pip install embreex numpy scipy pillow --break-system-packages   # once
B=tour/bim2/tools/aobake; C=/tmp/aobake; mkdir -p $C
for s in asbuilt open4k jan24 apr24b; do
  node $B/export_page.js $s $C/$s.page.bin && python3 $B/bake.py $s --page $C/$s.page.bin
done
```

One scene, e.g. after an idea's GLB changes (the siding branch, r49, changed jan24 and apr24b; they were baked after it landed):

```sh
node tour/bim2/tools/aobake/export_page.js jan24 /tmp/aobake/jan24.page.bin && python3 tour/bim2/tools/aobake/bake.py jan24 --page /tmp/aobake/jan24.page.bin
```

Then commit `tour/bim2/ao/` (the bake removes that scene's superseded atlas and page-uv files; a base uv file named for an old
GLB sha can be deleted by hand once no index names it).

When to re-bake:
- `scene.glb` changed: every scene (the base uv layout and every atlas depend on it).
- An idea's GLB or its meta (hide list) changed: that idea.
- Page-built cabinets / counters / built-ins moved or changed (fixtures.js, builtins.js, the furnishings in the meta): the scenes
  that show them. A stale page piece is detected per mesh (key, vertex count, sampled local positions) and simply left unshaded.

`export_page.js` needs Playwright (`/opt/npm-tools` in the agent container, or on NODE_PATH) and either network for the three.js
CDN files or `THREE_DIR=<a three@0.128.0 package dir>`.

## What is baked

- Receivers: every package mesh except glass, door leaves (they swing), roofs and site; plus the page-built fixed pieces
  (`R50.pieces()` in index.html: kitchen/bath/laundry/built-in fixtures, counters and backsplashes; never staged furniture).
- Charts: each connected planar component is one chart (no vertex is ever split: the page's own geometry is used as is).
  Indoor faces 1.6 in per texel, outward faces 4 in. Faces that nothing can see (stud faces in a cavity, pressed against another
  surface) are dropped. Curved page-built parts (eased cabinet edges, rounded fronts) carry their AO per vertex in the uv itself
  (u = 65535, v = AO).
- Rays: 96 cosine-weighted per texel, 3 ft, falloff 1-(t/3)^2 (the preview's), glass never occludes. Occluders: the package
  meshes as the page shows them (jog-flattened, an idea's removed elements gone) and page-built fixed pieces; not staged furniture
  (it keeps its V33C contact shadows), lamps, shades, door leaves, yard and landscape.
- Windows and skylights: rays that reach a pane (within 8 ft, before any occluder) count as open sky, and the occlusion is reduced
  by 2.5 x the share of the hemisphere that sees glazing, so reveals, sills and skylight wells stay light. Skylight elements
  (`SK-*`) are never darkened. Strips under 0.35 in wide keep 30 % of their darkening (they alias into dotted lines otherwise).
- Stored: raw visibility (1 = open), 8-bit, lightly denoised (masked 3x3 binomial twice inside each chart). Strength, curve, floor
  and the warm tint are applied at draw time (`R50.K` in index.html).

## Files (tour/bim2/ao/)

- `<scene>.ao.json` - the index the page fetches with `cache: 'no-cache'`: the uv sets with the GLB sha256 each was made for,
  the atlas file and size, the parameters, bake time.
- `scene.uv.<sha12>.bin.gz` (and `scene.opt-<id>.uv.<sha12>.bin.gz`) - the uv set of one GLB, content-addressed by its sha.
- `<scene>.ao.page.uv.<hash12>.bin.gz` - the page-built pieces' uv set for that scene.
- `<scene>.ao.<hash12>.webp` - the atlas (2048 wide; rows 0-2047 the base package, then the idea's own meshes, then the page
  pieces). Lossless WebP.

The page refuses a whole set whose GLB sha differs from the bytes it loaded (and checks sampled vertex positions per mesh), so a
stale sidecar falls back to the look without baked shading; it is never misapplied.
