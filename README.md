# CartographyClick

A browser clone of the daily geography game at maptap.gg: five cities per
game, click the globe as close to each one as you can.

Vue 3 + Vite, with CesiumJS for the globe and ESRI World Imagery for the
satellite basemap (fetched at runtime, so it needs a network connection).

## Development

    npm install
    npm run dev        # http://localhost:5173

## Building

    npm run build      # static site in dist/
    npm run preview    # serve dist/ locally

The country and subdivision outlines in `public/borders/` are generated from
Natural Earth by `node tools/build-borders.js`; they are committed, so that
only needs re-running when the source or the encoding changes.
