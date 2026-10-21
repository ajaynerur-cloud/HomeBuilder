# Third-party components

## OpenCascade Technology (via replicad-opencascadejs) — LGPL-2.1
Ductile Part uses the OpenCascade exact-surface CAD kernel, compiled to WebAssembly by the
`replicad-opencascadejs` package (LGPL-2.1-only, https://github.com/sgenoud/replicad).
The kernel is shipped as a separate, unmodified binary (gzip + base64 inside the page, or as
`node_modules/replicad-opencascadejs/dist/replicad_single.wasm` in the source tree) and is loaded
at run time, so it can be replaced with any compatible build. Its source and licence are available
from the projects above and from https://dev.opencascade.org.

## replicad — MIT
High-level modelling API over OpenCascade (https://github.com/sgenoud/replicad).

## three.js — MIT, earcut — ISC, polygon-clipping — MIT
