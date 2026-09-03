// A finger on the globe: what a touchscreen does differently from a mouse,
// and the switch between the two on a screen that has both.
//
// Which input is in charge is whichever was used last: a mouse until a finger
// lands, a finger until the mouse or wheel moves. Not a device check, because
// a laptop with a touchscreen is both, and not a flag dropped when the finger
// lifts, because the flick it leaves behind is still being replayed for a
// second or so and would stop dead the moment the mouse's settings came back.
//
// Three things change while a finger is the input, and change back after.
//
// The zoom cap. The per-notch easing on the wheel is applied by Cesium to
// every input, per frame, and held a pinch to a crawl; see updateZoomStep.
//
// The zoom rate. Fingers can only spread so far, and Cesium's rate has a
// full pinch clearing a fraction of the range a few wheel turns would.
//
// The one-finger drag, which is taken over outright. Cesium's keeps the
// ground under the finger, and that is right up close and wrong from far out.
// At whole-globe height a phone shows the planet three hundred pixels across,
// so keeping a point under the finger turns it a quarter of the way round in
// half a screen -- and faster still toward the limb, where a pixel of finger
// is a long way round the sphere. A mouse never meets this, because a desktop
// draws the globe three times as many pixels wide. This drag turns the globe
// by the ground angle one pixel covers at the middle of the screen, wherever
// the finger is, and never faster than a third of a turn per screen width:
// one to one when close, a heavy globe from far out, which is the feel
// Cesium's own trackball gives a mouse at the same heights. A flick coasts
// and dies away the way Cesium's does.

import * as Cesium from 'cesium'
import {lookAtCartographic, metersPerPixel, updateZoomStep} from './camera'

// Cesium's is 5.
const TOUCH_ZOOM_FACTOR = 8
const MAX_TURN_PER_WIDTH = Cesium.Math.TWO_PI / 3
// A degree of longitude is shorter toward the poles, so a sideways drag
// covers more of them to move the ground the same distance -- up to a floor,
// or the last few degrees to a pole would spin the globe on a twitch.
const MIN_STRETCH = 0.25
// The camera never quite reaches a pole, where its heading stops meaning
// anything.
const POLE = Cesium.Math.PI_OVER_TWO - Cesium.Math.toRadians(0.5)
// Cesium's spin inertia is 0.9 per frame at sixty of them a second; this is
// that, as a rate, so it is the same at any frame rate.
const COAST_DECAY_PER_SECOND = 6.3
const COAST_STOP_PX_PER_SECOND = 30
// A finger that came to rest before lifting was not flicking.
const FLICK_WINDOW_MS = 100
const RADIUS = Cesium.Ellipsoid.WGS84.maximumRadius

// Runs until the returned function is called.
export function attachTouch(viewer) {
  const {scene, camera} = viewer
  const {canvas} = scene
  const controller = scene.screenSpaceCameraController
  const mouseZoomFactor = controller.zoomFactor
  let touching = false
  // Fingers on the canvas by pointer id, each with where it was last seen.
  const fingers = new Map()
  // The finger doing the dragging: where it was last, when, and how fast it
  // was going, smoothed, so the flick is the drag's last stretch rather than
  // its last jitter. Null while no finger is dragging, including through a
  // pinch, which is Cesium's.
  let drag = null
  // A lifted finger's flick, in px/s, while it coasts.
  let coast = null
  let coastedAt = 0

  function setTouching(on) {
    if (touching === on) return
    touching = on
    controller.enableRotate = !on
    controller.zoomFactor = on ? TOUCH_ZOOM_FACTOR : mouseZoomFactor
  }

  function startDrag(id, x, y) {
    drag = {id, x, y, at: performance.now(), vx: 0, vy: 0}
  }

  function onPointerDown(event) {
    coast = null
    if (event.pointerType !== 'touch') {
      setTouching(false)
      return
    }
    setTouching(true)
    fingers.set(event.pointerId, {x: event.clientX, y: event.clientY})
    // One finger drags. A second makes it a pinch, and the drag ends there
    // rather than fighting the zoom over the same frames.
    if (fingers.size === 1) startDrag(event.pointerId, event.clientX, event.clientY)
    else drag = null
  }

  function onPointerMove(event) {
    const finger = fingers.get(event.pointerId)
    if (!finger) return
    finger.x = event.clientX
    finger.y = event.clientY
    if (!drag || drag.id !== event.pointerId) return

    const now = performance.now()
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    const seconds = Math.max(now - drag.at, 1) / 1000
    drag.vx = drag.vx * 0.4 + (dx / seconds) * 0.6
    drag.vy = drag.vy * 0.4 + (dy / seconds) * 0.6
    drag.x = event.clientX
    drag.y = event.clientY
    drag.at = now
    turn(dx, dy)
  }

  function onPointerUp(event) {
    if (!fingers.delete(event.pointerId)) return
    if (drag?.id === event.pointerId) {
      if (performance.now() - drag.at < FLICK_WINDOW_MS) {
        coast = {vx: drag.vx, vy: drag.vy}
        coastedAt = performance.now()
      }
      drag = null
    }
    // A pinch that ends with one finger still down carries on as a drag from
    // wherever that finger is.
    if (!drag && fingers.size === 1) {
      const [[id, finger]] = fingers
      startDrag(id, finger.x, finger.y)
    }
  }

  function onWheel() {
    setTouching(false)
  }

  // Turn the globe by a finger's movement, in screen pixels.
  function turn(dx, dy) {
    // The finale holds the globe still behind the score card, and the hold
    // means a drag too.
    if (viewer.isDestroyed() || !controller.enableInputs) return
    const here = camera.positionCartographic
    // The ground in the middle of the screen, which is what the eye is on.
    // After a reveal the camera is tilted and that ground is well ahead of
    // where the camera stands, so its distance is what the pixel is sized by.
    const aim = lookAtCartographic(viewer)
    const distance = aim
      ? Cesium.Cartesian3.distance(
          camera.positionWC,
          Cesium.Cartesian3.fromRadians(aim.longitude, aim.latitude),
        )
      : here.height
    const perPixel = Math.min(
      metersPerPixel(viewer, distance) / RADIUS,
      MAX_TURN_PER_WIDTH / (canvas.clientWidth || 1),
    )
    const stretch = Math.max(Math.cos(aim?.latitude ?? here.latitude), MIN_STRETCH)
    // Dragging right carries the ground right, which is the camera going
    // west; dragging down carries it down, which is the camera going north.
    camera.setView({
      destination: Cesium.Cartesian3.fromRadians(
        here.longitude - (dx * perPixel) / stretch,
        Cesium.Math.clamp(here.latitude + dy * perPixel, -POLE, POLE),
        here.height,
      ),
      orientation: {heading: camera.heading, pitch: camera.pitch, roll: 0},
    })
  }

  function tick() {
    if (!coast) return
    if (!controller.enableInputs) {
      coast = null
      return
    }
    const now = performance.now()
    const seconds = (now - coastedAt) / 1000
    coastedAt = now
    turn(coast.vx * seconds, coast.vy * seconds)
    const decay = Math.exp(-COAST_DECAY_PER_SECOND * seconds)
    coast.vx *= decay
    coast.vy *= decay
    if (Math.hypot(coast.vx, coast.vy) < COAST_STOP_PX_PER_SECOND) coast = null
  }

  // Down is watched on the canvas, so only a finger on the globe starts a
  // drag; the rest on the window, so a finger that slides off the canvas or
  // lifts over a button still ends it.
  canvas.addEventListener('pointerdown', onPointerDown, {passive: true})
  canvas.addEventListener('wheel', onWheel, {passive: true})
  window.addEventListener('pointermove', onPointerMove, {passive: true})
  window.addEventListener('pointerup', onPointerUp, {passive: true})
  window.addEventListener('pointercancel', onPointerUp, {passive: true})
  const removeTick = scene.preUpdate.addEventListener(tick)
  const removeZoomStep = scene.postRender.addEventListener(() =>
    updateZoomStep(viewer, touching),
  )

  return () => {
    removeTick()
    removeZoomStep()
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('wheel', onWheel)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    if (!viewer.isDestroyed()) setTouching(false)
  }
}
