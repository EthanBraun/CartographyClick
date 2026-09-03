// Where the camera stands and how it moves: the screen-to-ground scale that
// pins and the zoom floor are sized from, the easing on the wheel, and the
// flights a round makes -- up for the next city, in on a reveal, out to pick
// countries from.

import * as Cesium from 'cesium'

// Kilometers everywhere, like the scores and the round result, so the scale
// bar and the miss it is read against are in one unit.
export const METERS_PER_KM = 1000

// Advancing to the next city lifts the camera where it stands rather than
// flying it home. Going home sent every round back through the same point off
// West Africa, which read as the globe snapping back rather than the game
// moving on. Nothing leaks by staying put — the next city is drawn
// independently of the last one, so the view you keep says nothing about it.
//
// A fixed height rather than a multiple of the current one, so every round
// opens at the same scale no matter how wide the last reveal had to pull back.
const NEXT_ROUND_HEIGHT = 14_000_000
const NEXT_ROUND_FLIGHT_SECONDS = 1.4

// Whole-globe framing to pick countries from. Far enough out that a country is
// a thing you can point at, and level, since picking is done off shape.
const SELECT_HEIGHT = 20_000_000
const SELECT_FLIGHT_SECONDS = 1.2

// Revealing frames both pins. Cesium puts the camera exactly far enough to fit
// the bounding sphere, which crops to the two pins and nothing else — no
// coastline, no country, nothing to read the miss against. Padding the radius
// pulls the camera back by the same factor and buys that context.
const REVEAL_PADDING = 2
// A bounding sphere around two near-identical points has almost no radius, so
// a good guess would otherwise dive to the zoom floor. This is what actually
// governs how close a *close* guess gets, and padding barely touches it.
const REVEAL_MIN_RADIUS = 90_000
const REVEAL_FLIGHT_SECONDS = 1.6
// Cesium frames a bounding sphere at a 45-degree pitch by default, which swings
// the globe over hard on every reveal. Sit much closer to straight down so the
// result reads as a map you can measure by eye. Not fully overhead, though: the
// pins are cylinders standing on the surface, and from directly above they
// collapse into flat circles and stop reading as pins at all.
const REVEAL_PITCH = Cesium.Math.toRadians(-72)
// North-up. A reveal is for reading a miss, so the compass shouldn't move too.
const REVEAL_HEADING = 0

// Cesium moves the camera by (5 * maximumMovementRatio) of the remaining
// altitude per wheel notch. Near the ground the "remaining" term shrinks and
// eases the zoom on its own; nothing does that at the top, so the outermost
// range gets crossed in a handful of violent jumps. Cap the per-notch step
// explicitly and ease it further the further out we are.
const CESIUM_ZOOM_FACTOR = 5          // matches Cesium's internal constant
const ZOOM_STEP_NEAR = 0.07           // fraction of remaining altitude, close in
const ZOOM_STEP_FAR = 0.02            // ... at full zoom-out
const ZOOM_DAMP_FROM = 3_000_000      // metres; below this, no extra easing

// Closest zoom is defined as "the scale bar's width covers 8 km". Solved at runtime
// from the live canvas size and vertical FOV rather than baked in, since both
// shift with the window.
const MIN_ZOOM_SCALE_KM = 8
// The width ScaleReadout draws its bar at. It lives here rather than with the
// readout because the zoom floor above is solved against it and the two have
// to agree. When the readout goes, bake the metre value applyMinimumZoom
// arrives at into a constant and drop this with it.
export const SCALE_TARGET_PX = 170

// Metres of world per screen pixel at a given distance from the camera.
export function metresPerPixel(viewer, distance) {
  const fovy = viewer.camera.frustum.fovy ?? Cesium.Math.PI_OVER_THREE
  const height = viewer.scene.canvas.clientHeight || 1
  return (2 * distance * Math.tan(fovy / 2)) / height
}

// Distance at which SCALE_TARGET_PX of screen covers `km` of ground.
// Vertical FOV is derived from the horizontal one, so it tracks window shape.
function zoomDistanceForScale(viewer, km) {
  const height = viewer.scene.canvas.clientHeight || 1
  const fovy = viewer.camera.frustum.fovy ?? Cesium.Math.PI_OVER_THREE
  const mpp = (km * METERS_PER_KM) / SCALE_TARGET_PX
  return (mpp * height) / (2 * Math.tan(fovy / 2))
}

// Ease the per-notch zoom step as altitude climbs, interpolated in log space
// so it tracks how zoom actually feels rather than raw metres.
export function updateZoomStep(viewer) {
  if (!viewer || viewer.isDestroyed()) return
  const controller = viewer.scene.screenSpaceCameraController
  const height = Math.max(viewer.camera.positionCartographic.height, ZOOM_DAMP_FROM)
  const span = Math.log(controller.maximumZoomDistance) - Math.log(ZOOM_DAMP_FROM)
  const t =
    span > 0
      ? Cesium.Math.clamp((Math.log(height) - Math.log(ZOOM_DAMP_FROM)) / span, 0, 1)
      : 0
  const step = Cesium.Math.lerp(ZOOM_STEP_NEAR, ZOOM_STEP_FAR, t)
  controller.maximumMovementRatio = step / CESIUM_ZOOM_FACTOR
}

export function applyMinimumZoom(viewer) {
  if (!viewer || viewer.isDestroyed()) return
  const distance = zoomDistanceForScale(viewer, MIN_ZOOM_SCALE_KM)
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = distance
}

// What the camera is aimed at, which after a reveal is not the same as what it
// is standing over — the reveal tilts it, so the two are a good fraction of the
// viewing distance apart. Undefined when the centre of the screen is off the
// globe entirely, i.e. looking past the limb into space.
export function lookAtCartographic(viewer) {
  const canvas = viewer.scene.canvas
  const centre = new Cesium.Cartesian2(
    canvas.clientWidth / 2,
    canvas.clientHeight / 2,
  )
  const ray = viewer.camera.getPickRay(centre)
  const ground = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined
  return Cesium.defined(ground)
    ? Cesium.Cartographic.fromCartesian(ground)
    : undefined
}

// Straight up to `height` and level, holding the ground the camera is aimed at
// under the centre of the screen.
function liftTo(viewer, height, duration) {
  // Aiming at space is rare but possible; standing still beats snapping to an
  // arbitrary point, so fall back to whatever the camera is above.
  const site = lookAtCartographic(viewer) ?? viewer.camera.positionCartographic
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromRadians(
      site.longitude,
      site.latitude,
      height,
    ),
    // The reveal leaves the camera tilted and this undoes it. flyTo would
    // default to exactly this, but the reset is the point of the call, so it
    // says so rather than relying on the default staying put.
    orientation: {heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0},
    duration,
  })
}

// Pull up and level out for the next city, holding the ground the reveal left
// under the centre of the screen.
export function liftForNextRound(viewer) {
  liftTo(viewer, NEXT_ROUND_HEIGHT, NEXT_ROUND_FLIGHT_SECONDS)
}

// Pull out to where countries are things you can point at, holding whatever
// ground was on screen under the middle of it. Opening the mode at the
// altitude a reveal leaves would open it on one valley somewhere.
export function flyToSelect(viewer) {
  liftTo(viewer, SELECT_HEIGHT, SELECT_FLIGHT_SECONDS)
}

// Frame the guess and the answer together. Both sites are {longitude,
// latitude} in radians.
export function flyToReveal(viewer, guess, target) {
  const sphere = Cesium.BoundingSphere.fromPoints([
    Cesium.Cartesian3.fromRadians(guess.longitude, guess.latitude),
    Cesium.Cartesian3.fromRadians(target.longitude, target.latitude),
  ])
  sphere.radius = Math.max(sphere.radius * REVEAL_PADDING, REVEAL_MIN_RADIUS)
  viewer.camera.flyToBoundingSphere(sphere, {
    duration: REVEAL_FLIGHT_SECONDS,
    // Range 0 means "work out the distance from the sphere", which is the
    // framing we already want; only the angle is being overridden here.
    offset: new Cesium.HeadingPitchRange(REVEAL_HEADING, REVEAL_PITCH, 0),
  })
}

// Where the camera stands right now, in a shape restoreView can fly back to.
export function captureView(viewer) {
  const {camera} = viewer
  return {
    destination: Cesium.Cartesian3.clone(camera.positionWC),
    orientation: {heading: camera.heading, pitch: camera.pitch, roll: camera.roll},
  }
}

export function restoreView(viewer, view) {
  viewer.camera.flyTo({...view, duration: SELECT_FLIGHT_SECONDS})
}
