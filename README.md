# Courtyard house planner and Studio

Two tools in one page:

- **Planner**: the original courtyard house planner. Choose a size, rooms, roof and structure, and get a 3D model, floor plan, cost estimate, services layers and A3 drawings for approval. Unchanged.
- **Studio**: a parametric 2D and 3D design tool for engineers and architects. Draw walls, doors, windows, columns, beams, footings, stairs and roofs. Rooms come from the walls. Add levels, named parameters and expressions, a preliminary structural frame with load takedown, schedules, quantities and design checks. Export DXF drawings and print-ready STL, 3MF and OBJ files for 3D printing.

It runs in a browser, as a Windows program (Electron) and as an Android app (Capacitor). Studio is built for desktop in this first step.

## Using Studio

Open the page and press **Studio** at the top. Press **Keys** inside Studio for the shortcut list.

- Draw: Wall, Room walls (a closed rectangle), Split wall. Type a length while drawing (`12'6"`, `3.5`, `1200mm`) and press Enter. For a wall you can type `length<angle`.
- Snaps: grid, endpoint, midpoint, crossing, centre, perpendicular, nearest, ortho (F8 or hold Shift) and polar tracking.
- Edit: click to select, drag a box, drag grips to stretch walls (joined walls follow), Move, Copy, Rotate and Mirror in the Properties tab.
- Parameters: name a value once (`wallOut`, `storey`) and use `=wallOut/2` in any length field.
- Levels: add floors, each with its own height and optional floor slab. The level below shows as a faint underlay.
- Engineering: Generate frame, Size footings from loads, and read column loads and suggested sections in Schedules. These are first estimates for the structural engineer to check.
- 3D: standard views, orthographic or perspective, shaded with edges, wireframe or x-ray, level filters and a section cut.
- 3D printing: Print tab. Choose the scale, printer bed and parts. Walls are merged into one closed solid per level with the openings cut through. Export STL, STL per part (zip), 3MF with colours, or OBJ.
- Import from planner brings the planner layout into Studio.

## Build and test

```
npm install
npm run build        # dist/courtyard_house_planner.html (single file) and www/ (Electron, Android)
npm test             # Studio unit and page tests
npm run test:legacy  # the original planner's regression scripts, against the built page
```

The source is in `src/`. See `docs/ARCHITECTURE.md` for the module map.

## Putting it on GitHub

Every file in the zip ends in `.txt`, except the JSON files and the workflow. When you push, `.github/workflows/build.yml`:

1. Reads `rename-map.json` and gives each file its real name, then commits the renamed files back.
2. Runs the build and all tests.
3. Builds the single-file web app, the Windows installer and the Android APK.

Steps: unzip, create an empty repository, upload everything including the hidden `.github` folder (or use git), open the **Actions** tab, and download the files under **Artifacts** when the run finishes. To build only one target use **Run workflow** and pick it.

If the workflow does not start, GitHub only runs workflow files ending in `.yml`. Create `.github/workflows/build.yml` in the web page and paste the text from `docs/build.yml.txt`.

## Install

- Windows: run the setup or portable file. SmartScreen warns about unsigned programs. Choose More info, then Run anyway.
- Android: copy `app-debug.apk` to the phone and allow installs from this source. It is debug-signed, for your own use.

## Claude review (optional, Planner)

Open **Review with Claude**, then **API settings**, paste your Anthropic API key and press Save. The key stays on your device and is only sent to api.anthropic.com.

## Limits worth knowing

- Studio structure and print checks are preliminary. They guide the design and do not replace an engineer's design or a slicer's own repair step.
- Saving a file from a published preview page may be blocked by the browser sandbox. Use the installed app or open the file locally.
- Planner roofs with a courtyard hole import into Studio as four rectangular roof wings.

## New in this version

- **RCC roof**: Roof tool type "RCC flat roof", or Project > Levels > "RCC roof slab on top of this level" (follows any wall outline, with parapet). Counted in quantities and column loads.
- **3D**: Pop out into its own window; edit in 3D (Move, Wall, Door, Window, Paint modes; blue dots stretch, orange block sets height); Light menu (sunny, golden hour, overcast, night, time of day, shadows); Picture saves a PNG.
- **Colours and materials**: Materials drawer or Project > Colours and materials. Drag swatches onto walls (face you drop on is painted; Alt = both faces). Import SketchUp `.skm` or images, or drop them on the 3D view.
- **Plan view**: Rotate menu, Alt-drag, `[` `]` to turn, `\` to reset. Tilt shows walls as blocks.
- **Levels**: ▲ ▼ reorder floors, Copy above/below, Add basement, Delete.
