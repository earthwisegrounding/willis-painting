# Willis Painting website

Single-page site built from the Stitch design "Willis Painting - Luxury Redesign".

- `index.html` — the page
- `assets/js/main.js` — mobile menu, color picker, estimate form
- `assets/img/` — images from the Stitch design
- `src/styles.css` + `tailwind.config.js` — compiled into `assets/css/styles.css`

## Run it

```bash
npm install
npm run build   # rebuild CSS after changing classes in index.html
npm run serve   # http://localhost:4321
```

To deploy, upload `index.html` and the `assets/` folder to any static host (Netlify, Vercel, GitHub Pages, cPanel).

## Color picker

The "Preview Architectural Harmony" section repaints the house photo in the browser. `assets/img/exterior-visualizer-mask.png` marks which pixels are stucco (red channel), trim (green) and front door (blue). `exterior-visualizer-light.png` is a smooth lighting map used when a light color goes over a dark surface. `main.js` recolors those pixels while keeping the photo's light and shadow.

"Trim" is the painted metal: roof fascia, entry canopy, shed awning and window headers. The black window frames are factory-finished aluminum and stay as they are. The door is the slab only; its glass panes and the sidelights are left alone.

If you swap in a different house photo, both files have to be remade. `tools/build_mask.py` is the script that built them (it needs Python with numpy, pillow and scipy):

```bash
python tools/build_mask.py assets/img/exterior-visualizer.jpg assets/img/exterior-visualizer-mask.png assets/img/exterior-visualizer-light.png
```

Its shapes and coordinates are measured from this photo.

## Before going live

- The estimate form opens the visitor's email app addressed to `STUDIO_EMAIL` in `assets/js/main.js`. Confirm that address, or connect a form service.
- Portfolio photos are AI-generated from the design; swap in real project photos.
