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
//
// The globe stays in the player's hands through the climb: see
// liftForNextRound for why the lift is not a flight.
//
// Flight times throughout are on the slow side for a camera move. Pulling
// out is the part that feels violent when it is quick -- the ground rushes
// away -- so the lifts get the most time and the reveal, which has a far
// shorter way to go, a little less.
const NEXT_ROUND_HEIGHT = 14_000_000
const NEXT_ROUND_FLIGHT_SECONDS = 2.4

// Whole-globe framing to pick countries from. Far enough out that a country is
// a thing you can point at, and level, since picking is done off shape.
const SELECT_HEIGHT = 20_000_000
const SELECT_FLIGHT_SECONDS = 2.0

// The final score sits over the whole globe, turning slowly. The same framing
// as select mode, since both want the planet as an object rather than a place,
// and a much slower flight because nothing is waiting on the far side of it,
// and because the climb, the slide to the equator and the spin all run at
// once: quick, the three together read as a lurch. One turn every three
// minutes: enough to read as alive, slow enough that nothing on it is hard to
// look at.
const FINALE_HEIGHT = SELECT_HEIGHT
const FINALE_FLIGHT_SECONDS = 7
const FINALE_SPIN_RADIANS_PER_SECOND = Cesium.Math.TWO_PI / 180
// The climb also slides the camera to the equator, so the turn that follows
// is about the pole with the equator level across the middle of the screen,
// the way a globe on a stand turns. Ending over the last city instead would
// leave the planet turning under a camera parked off-axis, which reads as the
// camera orbiting at a tilt rather than the world going round.
const FINALE_LATITUDE = 0

// Revealing frames both pins. Cesium puts the camera exactly far enough to fit
// the bounding sphere, which crops to the two pins and nothing else — no
// coastline, no country, nothing to read the miss against. Padding the radius
// pulls the camera back by the same factor and buys that context.
const REVEAL_PADDING = 2
// A bounding sphere around two near-identical points has almost no radius, so
// a good guess would otherwise dive to the zoom floor. This is what actually
// governs how close a *close* guess gets, and padding barely touches it.
const REVEAL_MIN_RADIUS = 90_000
const REVEAL_FLIGHT_SECONDS = 2.4
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
const ZOOM_DAMP_FROM = 3_000_000      // meters; below this, no extra easing

// Closest zoom is defined as "the scale bar's width covers 8 km". Solved at runtime
// from the live canvas size and vertical FOV rather than baked in, since both
// shift with the window.
const MIN_ZOOM_SCALE_KM = 8
// The width ScaleReadout draws its bar at. It lives here rather than with the
// readout because the zoom floor above is solved against it and the two have
// to agree. When the readout goes, bake the meter value applyMinimumZoom
// arrives at into a constant and drop this with it.
export const SCALE_TARGET_PX = 170

// Meters of world per screen pixel at a given distance from the camera.
export function metersPerPixel(viewer, distance) {
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
// so it tracks how zoom actually feels rather than raw meters.
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
// viewing distance apart. Undefined when the center of the screen is off the
// globe entirely, i.e. looking past the limb into space.
export function lookAtCartographic(viewer) {
  const canvas = viewer.scene.canvas
  const center = new Cesium.Cartesian2(
    canvas.clientWidth / 2,
    canvas.clientHeight / 2,
  )
  const ray = viewer.camera.getPickRay(center)
  const ground = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined
  return Cesium.defined(ground)
    ? Cesium.Cartographic.fromCartesian(ground)
    : undefined
}

// Straight up to `height` and level, holding the ground the camera is aimed at
// under the center of the screen.
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
// under the center of the screen. Runs until it tops out or the returned
// function is called, whichever is first.
//
// Not a flyTo. A flight owns the whole camera, so a drag during it is undone
// on the next frame and the globe feels stuck for as long as the climb lasts.
// Driving only the height from a per-frame update leaves longitude and
// latitude to the camera controller, so the planet can be flicked and spin
// under a camera that is still on its way up -- which is a nice thing to be
// able to do while the next city comes in.
//
// The climb's own turning -- bringing the aimed ground under the center and
// levelling off -- is applied as a delta per frame on top of wherever the
// controller has put the camera, rather than as a position, so the two add up
// instead of fighting. Height is the one thing set outright, so the lift
// lands exactly where every round opens. That also means a wheel would be
// undone every frame, so the wheel ends the lift instead: a player zooming is
// taking the camera, and gets it.
export function liftForNextRound(viewer) {
  const {scene, camera} = viewer
  const {canvas} = scene
  // A reveal flight still in the air would fight the climb; this one wins.
  camera.cancelFlight()

  const here = camera.positionCartographic
  const aim = lookAtCartographic(viewer) ?? here
  const fromHeight = here.height
  // Shortest way round, so a heading of 359 degrees eases to north through one
  // degree and not through the whole compass.
  const turnLon = Cesium.Math.negativePiToPi(aim.longitude - here.longitude)
  const turnLat = aim.latitude - here.latitude
  const turnHeading = Cesium.Math.negativePiToPi(0 - camera.heading)
  const turnPitch = -Cesium.Math.PI_OVER_TWO - camera.pitch
  const lerp = Cesium.Math.lerp
  const began = performance.now()
  // How much of the turn has been handed out so far, so each frame applies
  // only the slice since the last one.
  let dealt = 0

  const tick = () => {
    const seconds = (performance.now() - began) / 1000
    const t = Cesium.EasingFunction.QUINTIC_IN_OUT(
      Math.min(1, seconds / NEXT_ROUND_FLIGHT_SECONDS),
    )
    const slice = t - dealt
    dealt = t
    const now = camera.positionCartographic
    camera.setView({
      destination: Cesium.Cartesian3.fromRadians(
        now.longitude + turnLon * slice,
        // A flick over the pole plus the slice could nudge past it, which
        // fromRadians does not take kindly to.
        Cesium.Math.clamp(
          now.latitude + turnLat * slice,
          -Cesium.Math.PI_OVER_TWO,
          Cesium.Math.PI_OVER_TWO,
        ),
        // Eased in log space so the climb looks even, as in the finale.
        Math.exp(lerp(Math.log(fromHeight), Math.log(NEXT_ROUND_HEIGHT), t)),
      ),
      orientation: {
        heading: camera.heading + turnHeading * slice,
        pitch: camera.pitch + turnPitch * slice,
        roll: 0,
      },
    })
    if (t >= 1) stop()
  }
  const removeTick = scene.preUpdate.addEventListener(tick)
  // Safe to call more than once: it stops itself on landing, the wheel stops
  // it, and the owner stops it, and any of them may come later than another.
  const stop = () => {
    removeTick()
    canvas.removeEventListener('wheel', stop)
  }
  canvas.addEventListener('wheel', stop, {passive: true})
  return stop
}

// Pull out to where countries are things you can point at, holding whatever
// ground was on screen under the middle of it. Opening the mode at the
// altitude a reveal leaves would open it on one valley somewhere.
export function flyToSelect(viewer) {
  liftTo(viewer, SELECT_HEIGHT, SELECT_FLIGHT_SECONDS)
}

// The final score's camera move: out to the whole globe and over to the
// equator, levelling off, with the planet already turning under the climb and
// carrying on once it tops out. Runs until the returned function is called.
//
// Not a flyTo. A flight owns the camera for as long as it runs, so a turn could
// only begin once it landed, and the seam showed. Driving the lift and the
// turn from one per-frame update makes them a single motion instead. The
// turn is a drift in longitude, which keeps the camera's latitude and its
// north-up heading, so it reads as the planet turning rather than the camera
// wandering.
//
// The globe is locked while it runs. The score card is the thing on screen
// and the planet is its backdrop; a drag that stopped the turn or a wheel that
// zoomed in on it would only break the picture, with nothing to be gained from
// the view it got. The lock lifts when the returned function is called.
export function startFinale(viewer) {
  const {scene, camera} = viewer
  const controller = scene.screenSpaceCameraController
  // The reveal's flight may still be in the air if the score came up quickly.
  // Two things setting the camera every frame would fight; this one wins.
  camera.cancelFlight()
  controller.enableInputs = false

  const here = camera.positionCartographic
  // Hold the ground under the middle of the screen in longitude through the
  // climb, like the other lifts; latitude slides to the equator instead. Aiming
  // at space is rare but possible; standing put beats snapping to an
  // arbitrary point.
  const aim = lookAtCartographic(viewer) ?? here
  const from = {
    lon: here.longitude,
    lat: here.latitude,
    height: here.height,
    heading: camera.heading,
    pitch: camera.pitch,
  }
  // Shortest way round for the angles, so a heading of 359 degrees eases to
  // north through one degree and not through the whole compass.
  const turnLon = Cesium.Math.negativePiToPi(aim.longitude - from.lon)
  const turnHeading = Cesium.Math.negativePiToPi(0 - from.heading)
  const turnPitch = -Cesium.Math.PI_OVER_TWO - from.pitch
  const lerp = Cesium.Math.lerp
  const began = performance.now()

  const tick = () => {
    const seconds = (performance.now() - began) / 1000
    // The same easing Cesium's own flights use, so this one feels like them.
    const t = Cesium.EasingFunction.QUINTIC_IN_OUT(
      Math.min(1, seconds / FINALE_FLIGHT_SECONDS),
    )
    // Westward, the way Cesium's rotate about the pole with a positive angle
    // went, so the direction settled on earlier is kept.
    const spun = FINALE_SPIN_RADIANS_PER_SECOND * seconds
    camera.setView({
      destination: Cesium.Cartesian3.fromRadians(
        from.lon + turnLon * t - spun,
        lerp(from.lat, FINALE_LATITUDE, t),
        // Height eased in log space, so the climb looks even. Eased linearly
        // it would clear most of the distance while the city was still
        // legible and then crawl through the last stretch of empty space.
        Math.exp(lerp(Math.log(from.height), Math.log(FINALE_HEIGHT), t)),
      ),
      orientation: {
        heading: from.heading + turnHeading * t,
        pitch: from.pitch + turnPitch * t,
        roll: 0,
      },
    })
  }
  const removeTick = scene.preUpdate.addEventListener(tick)
  // Safe to call more than once; the owner may stop it again on the way out.
  return () => {
    removeTick()
    if (!viewer.isDestroyed()) controller.enableInputs = true
  }
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
