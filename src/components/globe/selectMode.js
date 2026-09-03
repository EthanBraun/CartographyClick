// The globe as a country picker: which country the cursor is over, and the
// outlines lit for it and for the countries already picked.
//
// Nothing here keeps a list -- the parent owns the selection and hands it back
// through `selected`, so what is lit on the globe and what the HUD says is
// picked are the same fact read twice.

import * as Cesium from 'cesium'
import {countryAt, countryRings} from '../../game/borders'
import {
  addOutline,
  destroyOutline,
  setOutlineColour,
  setOutlineShown,
  stopFilling,
} from './outlines'

// Select mode lights two things and no more: the country under the cursor, and
// the ones already picked. White for the hover, because it is the thing that
// moves and has to be findable the instant it changes; gold for a selection,
// because it has to keep reading while the cursor is somewhere else entirely.
// Both sit off the reveal's blue -- a border you picked must never be mistaken
// for a border that was an answer.
const HOVER_BORDER_COLOUR = Cesium.Color.WHITE.withAlpha(0.95)
const SELECTED_BORDER_COLOUR = Cesium.Color.fromHsl(43 / 360, 0.95, 0.58, 0.95)
const SELECT_BORDER_WIDTH = 3

// Outlines are kept once built rather than dropped when the cursor leaves:
// sweeping back and forth over the same two or three countries is what picking
// a set actually looks like, and rebuilding Canada's 412 rings each way is not
// free. Selected countries never count against this -- they are on screen
// continuously, and evicting one would blank a border being looked at.
const OUTLINE_CACHE_MAX = 16

// `selecting` and `selected` are getters onto the parent's props: whether the
// mode is on, and the country codes picked so far. `onHover` is told each time
// the country under the cursor changes, with null for none.
export function createSelectMode(viewer, {selecting, selected, onHover}) {
  // The country under the cursor, as {code, name}.
  let hovered = null
  // One built outline per country drawn so far, keyed by code. A Map because it
  // is insertion-ordered, which is the whole of the eviction policy below.
  const outlines = new Map()
  // Enough of the last hover lookup to tell whether anything has moved since.
  let hoverCursor = null
  const hoverCamera = new Cesium.Cartesian3()

  // Which country the cursor is over, resolved only when there is a reason to.
  // The lookup is under a millisecond and this runs every frame, which is a
  // millisecond a frame spent on nothing while cursor and camera both sit
  // still. Either one moving can change the answer -- the globe turns under a
  // stationary cursor -- so both are watched.
  function update(cursor) {
    if (viewer.isDestroyed() || !selecting() || !cursor) return

    const eye = viewer.camera.positionWC
    const moved =
      !hoverCursor ||
      !Cesium.Cartesian2.equals(cursor, hoverCursor) ||
      !Cesium.Cartesian3.equalsEpsilon(eye, hoverCamera, Cesium.Math.EPSILON7)
    if (!moved) return
    hoverCursor = Cesium.Cartesian2.clone(cursor, hoverCursor)
    Cesium.Cartesian3.clone(eye, hoverCamera)

    const country = countryUnder(cursor)
    if (country?.code === hovered?.code) return
    hovered = country
    onHover(country)
    paint()
  }

  // Null over space, and null over ocean no coast is near enough to claim --
  // the same forgiveness the reveal gets, which is what lets a country be
  // picked by pointing just off its shore.
  function countryUnder(position) {
    const ray = viewer.camera.getPickRay(position)
    const ground = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined
    if (!Cesium.defined(ground)) return null
    const carto = Cesium.Cartographic.fromCartesian(ground)
    return countryAt(
      Cesium.Math.toDegrees(carto.latitude),
      Cesium.Math.toDegrees(carto.longitude),
    )
  }

  // Light what should be lit and dim what should not, in one pass over the
  // cache. One pass rather than two because the hover and the selection change
  // in the same frame -- F takes the country the cursor is already on -- and
  // painting them separately leaves whichever ran first to be undone by the
  // one that ran second.
  function paint() {
    if (viewer.isDestroyed()) return
    const picked = new Set(selected())

    if (selecting()) {
      for (const code of [...picked, hovered?.code]) {
        if (code) build(code)
      }
    }

    for (const [code, outline] of outlines) {
      const lit = selecting() && (picked.has(code) || code === hovered?.code)
      setOutlineShown(outline, lit)
      // Selected beats hovered: pointing at a country already picked must not
      // make it look unpicked.
      if (lit) {
        setOutlineColour(
          outline,
          picked.has(code) ? SELECTED_BORDER_COLOUR : HOVER_BORDER_COLOUR,
        )
      }
    }

    prune(picked)
  }

  function build(code) {
    const cached = outlines.get(code)
    if (cached) {
      // Re-insert, so the Map orders least-recently-wanted first and the prune
      // below is just a walk from the front.
      outlines.delete(code)
      outlines.set(code, cached)
      return cached
    }

    const rings = countryRings(code)
    if (!rings) return null
    const outline = addOutline(viewer, rings, HOVER_BORDER_COLOUR, SELECT_BORDER_WIDTH)
    outlines.set(code, outline)
    return outline
  }

  function prune(picked) {
    for (const [code, outline] of outlines) {
      if (outlines.size <= OUTLINE_CACHE_MAX) return
      if (picked.has(code) || code === hovered?.code) continue
      destroyOutline(viewer, outline)
      outlines.delete(code)
    }
  }

  // Leaving the mode: forget the hover, tell the parent so, and take every
  // outline down. The cache is not worth keeping across a game.
  function clear() {
    hovered = null
    hoverCursor = null
    onHover(null)
    for (const outline of outlines.values()) destroyOutline(viewer, outline)
    outlines.clear()
  }

  // Before the viewer goes, while its postRender event is still there to
  // detach the outline fills from. The primitives go down with the viewer.
  function dispose() {
    for (const outline of outlines.values()) stopFilling(outline)
    outlines.clear()
  }

  return {
    update,
    paint,
    clear,
    dispose,
    get hovered() {
      return hovered
    },
  }
}
