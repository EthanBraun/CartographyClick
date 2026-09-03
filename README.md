# CartographyClick

A browser clone of the daily geography game at maptap.gg: five cities per
game, click the globe as close to each one as you can.

Vue 3 + Vite, with CesiumJS for the globe and ESRI World Imagery for the
satellite basemap (fetched at runtime, so it needs a network connection).

## Layout

    src/
      game/              rules and data, no Vue and no Cesium: cities, scoring,
                         borders lookup, study-run index
      App.vue            the game state machine and the keys; owns every ref
      components/
        hud/             one prop-driven component per HUD panel, each with its
                         own CSS; hud.css holds what they share
        Globe.vue        coordinator: owns the Cesium viewer's lifetime and the
                         cursor, wires the modules below to props and events
        globe/           plain modules that take the viewer: how it is built,
                         where the camera goes, pins, outlines, the round's
                         markers, select mode. ScaleReadout.vue is a temporary
                         measuring aid and is deletable on its own.

State flows down as props and comes back as events. Neither the HUD panels
nor the globe modules keep game state of their own.

## Development

    npm install
    npm run dev        # http://localhost:5173

## Building

    npm run build      # static site in dist/
    npm run preview    # serve dist/ locally

The country and subdivision outlines in `public/borders/` are generated from
Natural Earth by `node tools/build-borders.js`; they are committed, so that
only needs re-running when the source or the encoding changes.
