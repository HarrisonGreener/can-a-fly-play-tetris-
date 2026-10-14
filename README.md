# Can a fly play Tetris?

**A real fruit fly, at an old box computer, in a white concrete bunker.**

The fly's brain is **318 real neurons and 13,620 real connections** cut from a fully mapped fruit-fly central nervous system. Its body is an anatomically accurate 3D fly reconstructed from microscope scans. Its eyes watch the falling blocks, signals travel through the real wiring, and its own command neurons decide which arrow key its front legs tap. Nothing is trained or tuned to play well. It plays badly, and that's the point.

▶ **Watch it play:** https://harrisongreener.github.io/can-a-fly-play-tetris-/

## What you're looking at

- **The scene.** A stark white room with long strip lights and a black desk. A beige box PC shows the game live on its CRT. The camera drifts slowly between shots; drag to look around, or switch to *Screen* or *Free* mode.
- **The fly.** The NeuroMechFly v2 body on its measured skeleton. Its front legs are posed with inverse kinematics: they rest on ← and →, tap whichever key the brain picks, and the key goes down. When it gets bored it rubs its front legs together like a real fly, and its wings flick when it drops.
- **Live brain (corner panel).** Every neuron in the slice, drawn at its real position in the brain. Neurons flash red when they fire, and lines show signals running along their strongest connections. Hover a neuron to see what it is, or click it to poke it.
- **Key meters.** How unusually active each key's neurons are right now. Whichever crosses the line presses its key.

## How it works

| Stage | Neurons | What happens |
|---|---|---|
| Eyes | 60 × **LC4 / LPLC2**: looming detectors, the cells that tell a fly something is about to hit it | The left eye watches the left half of the board and the right eye the right half. Falling blocks loom harder as they get lower, and tall stacks loom too. |
| Middle brain | 240 cells: the strongest real paths from those eyes to the command neurons | Leaky integrate-and-fire model, 0.1 ms steps. Every weight is a real synapse count, signed by the cell's neurotransmitter. |
| Keys | 18 **descending neurons** | ← = turn-left cells (DNa02/DNa11/DNg13 L) · → = turn-right cells (same, R) · ↑ rotate = walk-forward cells (DNp09/DNg100/DNg97) · ↓ drop = escape cells (DNp01 giant fibre, MDN) |

Every 120 ms of brain time, each key group's firing rate is compared with its own recent average. The most unusually active group above the threshold presses its key.

**Honest caveats:** the wiring and the body are real. How the board becomes eye input, how neurons become keys, and how the legs move are my design. The slice is cut out of a much bigger brain, so it's missing most of its context. This is a toy, not a neuroscience result.

## Run it locally

No build step and no install. Open `index.html` in a browser; it needs an internet connection the first time, to load three.js from a CDN. Or serve the folder:

```sh
python -m http.server 8000   # then open http://localhost:8000
```

## Files

```
index.html, style.css        the page
js/brain.js                  spiking neuron simulation (LIF)
js/interface.js              board → eyes, key neurons → keyboard
js/tetris.js                 the game
js/fly3d.js                  3D fly: meshes, skeleton, surface shading, leg IK
js/world.js                  the room, desk, computer, keyboard, lights, camera
js/views.js                  CRT screen drawing, live brain map
js/main.js                   main loop and HUD
data/brain-slice.js          the 318-neuron slice (generated)
data/fly-body.js             the packed NeuroMechFly body (generated)
tools/make_slice.py          rebuilds the brain slice from the full connectome
tools/pack_fly.py            packs the fly meshes and skeleton for the web
tools/download_full_dataset.sh   fetches the full MaleCNS dataset (~1.1 GB)
licenses/                    third-party licences and notices
```

Both data files are built from a clone of [Xenova/fruit-fly-simulation](https://huggingface.co/spaces/Xenova/fruit-fly-simulation) (made with Git LFS installed):

```sh
pip install numpy
python tools/make_slice.py path/to/fruit-fly-simulation/dist/data
```

## Credits

- **Connectome:** [MaleCNS v1.0](https://male-cns.janelia.org/), by FlyEM / HHMI Janelia, University of Cambridge, MRC LMB and Google Research. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `data/brain-slice.js` is a subset of this dataset.
- **Fly body:** NeuroMechFly v2 meshes and skeleton from [NeLy-EPFL/flygym](https://github.com/NeLy-EPFL/flygym), Apache-2.0. Wang-Chen et al., *NeuroMechFly v2*, Nature Methods 2024, https://doi.org/10.1038/s41592-024-02497-y. See `licenses/NeuroMechFly-NOTICE.txt`.
- **Preprocessing, forward kinematics, surface shading, LIF reference:** adapted from [Xenova/fruit-fly-simulation](https://huggingface.co/spaces/Xenova/fruit-fly-simulation) (MIT).
- **Neuron model and parameters:** Shiu et al., *A Drosophila computational brain model reveals sensorimotor processing*, [Nature 2024](https://www.nature.com/articles/s41586-024-07763-9).
- **Rendering:** [three.js](https://threejs.org) (MIT). **Fonts:** Space Grotesk and IBM Plex Mono (SIL OFL), via Google Fonts.

Tetris® is a trademark of The Tetris Company. This is an unaffiliated, non-commercial fan project.

## Licence

Code: MIT (see `LICENSE`). Connectome data: CC BY 4.0. Fly body: Apache-2.0. Details in `licenses/`.
