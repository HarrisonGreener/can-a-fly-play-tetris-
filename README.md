# Can a fly play Tetris?

**I gave a fruit fly a controller.**

The fly's brain here is **318 real neurons and 13,620 real connections** cut from a fully mapped fruit-fly central nervous system. Its eyes watch the board, signals travel through the real wiring, and four groups of the fly's own command neurons press the buttons. Nothing is trained or tuned to play well. It plays badly, and that's the point.

▶ **Play it:** https://harrygreener01-cloud.github.io/can-a-fly-play-tetris-/

## What you're looking at

- **The fly at its desk.** A pixel fruit fly holding a controller. It reacts every time its brain presses a button, and its wings buzz on DROP.
- **The board.** A standard falling-block game. The faint blue glow over each column shows how strongly the fly's eyes are reacting to it.
- **Live brain (side panel).** Every neuron in the slice, drawn at its real position in the fly's brain. Dots flash when a neuron fires, and lines show signals travelling along its strongest connections. Hover a neuron to see what it is, or click it to poke it.
- **Button meters.** How unusually active each button group is right now. Whichever crosses the line first presses its button.

## How it works

| Stage | Neurons | What happens |
|---|---|---|
| Eyes | 60 × **LC4 / LPLC2**: looming detectors, the cells that tell a fly something is about to hit it | The left eye watches columns 1–5, the right eye 6–10. Falling blocks loom harder as they get lower, and tall stacks loom too. |
| Middle brain | 240 cells: the strongest real paths from those eyes to the command neurons | Leaky integrate-and-fire model, 0.1 ms steps. Every weight is a real synapse count, with excitatory or inhibitory sign taken from the cell's neurotransmitter. |
| Buttons | 18 **descending neurons** | LEFT = turn-left cells (DNa02/DNa11/DNg13 L) · RIGHT = turn-right cells (same, R) · ROTATE = walk-forward cells (DNp09/DNg100/DNg97) · DROP = escape cells (DNp01 giant fibre, MDN) |

Every 120 ms of brain time, each button group's firing rate is compared with its own recent average. The most unusually active group above the threshold presses its button.

**Honest caveats:** the wiring is real, but how the board becomes eye input and how neurons become buttons is my design. The slice is cut out of a much bigger brain, so it's missing most of its context. This is a toy, not a neuroscience result.

## Run it locally

No build step and no install. Download the repo and open `index.html` in a browser. Or:

```sh
python -m http.server 8000   # then open http://localhost:8000
```

## Files

```
index.html, style.css     the page
js/brain.js               spiking neuron simulation (LIF)
js/interface.js           board → eyes, button neurons → controller
js/tetris.js              the game
js/views.js               board, live brain map, pixel fly scene
js/main.js                main loop and UI
data/brain-slice.js       the 318-neuron slice (generated)
tools/make_slice.py       rebuilds the slice from the full connectome
tools/download_full_dataset.sh   fetches the full MaleCNS dataset (~1.1 GB)
```

To rebuild the slice, clone [Xenova/fruit-fly-simulation](https://huggingface.co/spaces/Xenova/fruit-fly-simulation) (with Git LFS installed) and run:

```sh
pip install numpy
python tools/make_slice.py path/to/fruit-fly-simulation/dist/data
```

## Credits

- **Connectome:** [MaleCNS v1.0](https://male-cns.janelia.org/), by FlyEM / HHMI Janelia, University of Cambridge, MRC LMB and Google Research. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The slice in `data/` is a subset of this dataset.
- **Preprocessed data and LIF reference implementation:** [Xenova/fruit-fly-simulation](https://huggingface.co/spaces/Xenova/fruit-fly-simulation) (application code MIT).
- **Neuron model and parameters:** Shiu et al., *A Drosophila computational brain model reveals sensorimotor processing*, [Nature 2024](https://www.nature.com/articles/s41586-024-07763-9).
- **Fonts:** Press Start 2P and VT323 (SIL Open Font License), via Google Fonts.

Tetris® is a trademark of The Tetris Company. This is an unaffiliated, non-commercial fan project.

## Licence

Code: MIT (see `LICENSE`). Connectome data: CC BY 4.0, credited above.
