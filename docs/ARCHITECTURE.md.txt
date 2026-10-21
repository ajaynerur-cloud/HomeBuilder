# Architecture

## Layout

```
src/
  index.template.html     page shell with {{CSS}}, {{THREE}}, {{LEGACY_JS}}, {{STUDIO_JS}}
  legacy/NN-*.js          the original planner, split into ordered parts and joined inside one closure
  styles/                 legacy.css (planner), shell.css (tabs), studio.css
  studio/                 Studio as ES modules, bundled with esbuild
  vendor/three.min.js     Three.js r128 (CDN in the web build, local in www/)
scripts/build.mjs         joins everything into dist/ and www/
tests/                    node:test suites; tests/legacy holds the planner's own scripts
```

The planner is not rewritten. `scripts/build.mjs` joins `src/legacy/*.js` in file-name order and wraps them in the same closure as before. The built script is byte-identical to the old single file.

## Studio modules

```
core/     units.js (ft-in, mm, m), params.js (named parameters, safe expressions), store.js (project, undo, selection), emitter.js
model/    schema.js (project shape), resolve.js (expressions -> numbers), generators.js (add objects)
          walls.js (mitred joints, footprints), rooms.js (planar faces from walls), solids.js (3D solids, watertight)
          structure.js (frame, load takedown, sections, footings), quantities.js, checks.js, transform.js, symbols.js
view2d/   snap.js, hit.js, render2d.js, tools.js, view2d.js
view3d/   view3d.js (Three.js scene, orbit, section, picking)
io/       meshio.js (STL, OBJ, 3MF), zip.js, print.js (scale, thicken, base plate, checks), dxf.js, project.js,
          importPlanner.js, download.js
ui/       studio.js (layout and glue), panels.js, fields.js, dom.js
main.js   adds the Planner / Studio switch
```

## Conventions

- Plan coordinates: x east, y north, z up, in feet. Three.js gets (x, z, -y), which is a rotation, so winding is kept.
- Every edit goes through `store.transact(label, fn)`. It snapshots, so undo and redo always work. Pass `{coalesce: key}` to merge a stream of edits (typing, dragging) into one undo step.
- Fields that can hold an expression are stored raw (`12.5`, `"230mm"`, `"=wallOut/2"`). `resolveModel(project)` turns them into numbers. Everything after that (drawing, solids, schedules, checks) reads the resolved model.
- Walls are centre-lines with thickness. Footprints are mitred where two walls meet. Rooms are the closed faces of the wall graph, and their clear area is the face minus the wall footprints.
- Solids are built in stacked bands. Each band has its own plan shape, so door and window openings are cut where they exist. A conform pass removes T-junctions, so the mesh is closed for slicers.

## Adding things

- A new object type: add its array to `schema.js` (`KINDS`, `PREFIX`), a resolver in `resolve.js`, a solid in `solids.js`, drawing in `render2d.js`, a hit test in `hit.js`, and property fields in `ui/fields.js`.
- A new tool: add an object to `view2d/tools.js` with `down`, `move`, `key` and `draw`, then list it in `ui/studio.js` (`TOOLS`) and `TOOL_KEYS`.
- A new export: write an encoder in `io/`, then add a button in `ui/panels.js` or the Export menu in `ui/studio.js`.
- A new check: add it to `model/checks.js`. It appears in the Checks tab.

## Tests

- `npm test` covers units, expressions, store, geometry and booleans, watertight solids and volumes, mitred joints, rooms, structure, quantities, checks, transforms, STL/3MF/zip, DXF, print preparation, the planner importer, snaps, hit testing, the plan renderer on a mock canvas, the 3D view with a stub renderer, and the whole page in jsdom (opening Studio, drawing with pointer events, every panel and export).
- `npm run test:legacy` runs the planner's own regression scripts against the built page.

## Next steps for Studio

Section and elevation drawings from the model, pen and touch input, a wall-type library (layers and materials), stair landings and multi-flight stairs, roof from the wall outline, site plan with plot boundary and setback checks, IFC export, and reinforcement schedules.
