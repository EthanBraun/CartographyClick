<script setup>
import {onBeforeUnmount, onMounted, ref} from 'vue'
import * as Cesium from 'cesium'

// ESRI's public World Imagery service: Google-Earth-style satellite basemap
// with a full tile pyramid, so zooming pulls in progressively finer LoD.
const IMAGERY_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'

// Raw satellite imagery renders hot against a dark UI; knock it back a little.
// 1.0 is the untouched basemap.
const IMAGERY_BRIGHTNESS = 0.82

// Dragging already means "rotate the globe", so the guess is committed with a
// key instead of a click — the mouse aims, the key drops the pin.
const DROP_KEY = 'f'

// The pin is a cylinder along the surface normal, so it reads as a spike
// standing off the globe and stays legible as the planet rotates under it.
//
// Sizing is a floor, not a fixed size. Its true size is a 2-mile radius, which
// is what you get at close zoom. Held at that world size it would fall to a
// fraction of a pixel at globe view, so once 2 miles shrinks past
// PIN_MIN_RADIUS_PX on screen the pin starts growing in world terms to hold
// that apparent width — i.e. it scales up as you zoom out. Length is always
// tied to radius, so the proportions never change.
const METRES_PER_MILE = 1609.344

const PIN_RADIUS_MILES = 2
const PIN_RADIUS = PIN_RADIUS_MILES * METRES_PER_MILE
const PIN_MIN_RADIUS_PX = 8
// Holding a constant pixel size forever means the pin grows relative to the
// globe as the globe shrinks away. Past this camera distance — the altitude
// the app opens at, i.e. a natural whole-globe framing — the pin stops growing
// and from there shrinks with everything else.
const PIN_GROWTH_CEILING = 22_000_000
const PIN_ASPECT = 6                 // length = 6 x radius
// Let the imagery read through the pin rather than punching a solid hole in it.
const PIN_OPACITY = 0.7

// Accuracy ramp endpoints. Kelly green sits around 101 deg rather than a pure
// 120 deg green, and is darker and less saturated than a primary.
const HUE_PERFECT = 101
const HUE_WORST = 0
const RAMP_SATURATION = 0.78
const RAMP_LIGHTNESS = 0.41

// Cesium moves the camera by (5 * maximumMovementRatio) of the remaining
// altitude per wheel notch. Near the ground the "remaining" term shrinks and
// eases the zoom on its own; nothing does that at the top, so the outermost
// range gets crossed in a handful of violent jumps. Cap the per-notch step
// explicitly and ease it further the further out we are.
const CESIUM_ZOOM_FACTOR = 5          // matches Cesium's internal constant
const ZOOM_STEP_NEAR = 0.07           // fraction of remaining altitude, close in
const ZOOM_STEP_FAR = 0.02            // ... at full zoom-out
const ZOOM_DAMP_FROM = 3_000_000      // metres; below this, no extra easing

// Closest zoom is defined as "the scale bar reads 5 miles". Solved at runtime
// from the live canvas size and vertical FOV rather than baked in, since both
// shift with the window. NOTE: depends on SCALE_TARGET_PX in the temporary
// block below — bake the resulting metre value in when that block goes.
const MIN_ZOOM_SCALE_MILES = 5

const emit = defineEmits(['guess'])

const container = ref(null)
let viewer = null
let pin = null
// Guess site in radians, and how close it landed. Until targets exist every
// guess is scored perfect, so the pin sits at the green end of the ramp.
let guess = null
let guessAccuracy = 1
let cursorHandler = null
let removeReadout = null
let removeZoomStep = null
// Latest cursor position over the canvas, in screen pixels.
let cursor = null

function onKeyDown(event) {
  if (event.key.toLowerCase() !== DROP_KEY) return
  // Holding the key shouldn't machine-gun the pin, and a modifier means the
  // user is reaching for a browser/app shortcut, not guessing.
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return

  event.preventDefault()
  dropPin()
}

function dropPin() {
  if (!viewer || viewer.isDestroyed() || !cursor) return

  const ray = viewer.camera.getPickRay(cursor)
  if (!ray) return

  // Picking the globe rather than the depth buffer means a cursor out over
  // space returns nothing, so we simply don't place a pin there.
  const position = viewer.scene.globe.pick(ray, viewer.scene)
  if (!Cesium.defined(position)) return

  const carto = Cesium.Cartographic.fromCartesian(position)
  guess = {longitude: carto.longitude, latitude: carto.latitude}
  if (!pin) pin = addPin(() => guess, () => accuracyColour(guessAccuracy))

  emit('guess', {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
  })
}

// 1 = dead on, 0 = as wrong as it gets. Interpolating the hue rather than RGB
// runs green -> yellow -> red, where a straight RGB lerp would sag through mud.
function accuracyColour(accuracy) {
  const t = Cesium.Math.clamp(accuracy, 0, 1)
  const hue = HUE_WORST + (HUE_PERFECT - HUE_WORST) * t
  return Cesium.Color.fromHsl(
    hue / 360,
    RAMP_SATURATION,
    RAMP_LIGHTNESS,
    PIN_OPACITY,
  )
}

// Metres of world per screen pixel at a given distance from the camera.
function metresPerPixel(distance) {
  const fovy = viewer.camera.frustum.fovy ?? Cesium.Math.PI_OVER_THREE
  const height = viewer.scene.canvas.clientHeight || 1
  return (2 * distance * Math.tan(fovy / 2)) / height
}

// True 2-mile radius up close; from the point where that would shrink below
// PIN_MIN_RADIUS_PX on screen, it grows instead of vanishing.
function pinRadius(position) {
  const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, position)
  const growth = Math.min(distance, PIN_GROWTH_CEILING)
  return Math.max(PIN_RADIUS, PIN_MIN_RADIUS_PX * metresPerPixel(growth))
}

// ---------------------------------------------------------------------------
// TEMPORARY: scale bar + pin dimension readout, for eyeballing how thick the
// pin should actually be. Delete this block and its markup once settled.
// ---------------------------------------------------------------------------
const NICE_MILES = [
  0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000,
]
const SCALE_TARGET_PX = 170

const scaleBarPx = ref(0)
const scaleLabel = ref('')
const pinDiameterLabel = ref('drop a pin with F')
const pinLengthLabel = ref('')
const altitudeLabel = ref('')
const minZoomLabel = ref('')

function formatMiles(miles) {
  if (miles >= 100) return `${Math.round(miles)} mi`
  if (miles >= 10) return `${miles.toFixed(1)} mi`
  if (miles >= 1) return `${miles.toFixed(2)} mi`
  return `${miles.toFixed(3)} mi`
}

// Distance at which SCALE_TARGET_PX of screen covers `miles` of ground.
// Vertical FOV is derived from the horizontal one, so it tracks window shape.
function zoomDistanceForScale(miles) {
  const height = viewer.scene.canvas.clientHeight || 1
  const fovy = viewer.camera.frustum.fovy ?? Cesium.Math.PI_OVER_THREE
  const mpp = (miles * METRES_PER_MILE) / SCALE_TARGET_PX
  return (mpp * height) / (2 * Math.tan(fovy / 2))
}

// Ease the per-notch zoom step as altitude climbs, interpolated in log space
// so it tracks how zoom actually feels rather than raw metres.
function updateZoomStep() {
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

function applyMinimumZoom() {
  if (!viewer || viewer.isDestroyed()) return
  const distance = zoomDistanceForScale(MIN_ZOOM_SCALE_MILES)
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = distance
  minZoomLabel.value = formatMiles(distance / METRES_PER_MILE)
}

function updateReadout() {
  if (!viewer || viewer.isDestroyed()) return
  const canvas = viewer.scene.canvas

  // Sample at screen centre so the bar describes the ground you're looking at.
  const centre = new Cesium.Cartesian2(
    canvas.clientWidth / 2,
    canvas.clientHeight / 2,
  )
  const ray = viewer.camera.getPickRay(centre)
  const ground = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined
  // Off-globe (looking at space): fall back to altitude so the bar still reads.
  const distance = Cesium.defined(ground)
    ? Cesium.Cartesian3.distance(viewer.camera.positionWC, ground)
    : viewer.camera.positionCartographic.height

  const altitude = formatMiles(
    viewer.camera.positionCartographic.height / METRES_PER_MILE,
  )
  if (altitude !== altitudeLabel.value) altitudeLabel.value = altitude

  const mpp = metresPerPixel(distance)
  const spanMiles = (SCALE_TARGET_PX * mpp) / METRES_PER_MILE
  const nice =
    [...NICE_MILES].reverse().find((m) => m <= spanMiles) ?? NICE_MILES[0]

  const px = Math.round((nice * METRES_PER_MILE) / mpp)
  if (px !== scaleBarPx.value) scaleBarPx.value = px
  const label = formatMiles(nice)
  if (label !== scaleLabel.value) scaleLabel.value = label

  if (!guess) return
  const surface = Cesium.Cartesian3.fromRadians(guess.longitude, guess.latitude, 0)
  const radius = pinRadius(surface)
  const diameter = formatMiles((radius * 2) / METRES_PER_MILE)
  const lengthText = formatMiles((radius * PIN_ASPECT) / METRES_PER_MILE)
  if (diameter !== pinDiameterLabel.value) pinDiameterLabel.value = diameter
  if (lengthText !== pinLengthLabel.value) pinLengthLabel.value = lengthText
}

// `siteFn` returns {longitude, latitude} in radians; `colourFn` returns a Color.
// Both are read every frame, so a pin can move and recolour after scoring.
function addPin(siteFn, colourFn) {
  const surface = new Cesium.Cartesian3()
  const radiusAt = () => {
    const site = siteFn()
    Cesium.Cartesian3.fromRadians(site.longitude, site.latitude, 0, undefined, surface)
    return pinRadius(surface)
  }
  const lengthAt = () => radiusAt() * PIN_ASPECT

  return viewer.entities.add({
    // A cylinder's axis follows the local up vector, which on the ellipsoid is
    // the surface normal. Centring it at half its length stands it on the
    // ground rather than burying half of it.
    position: new Cesium.CallbackProperty(() => {
      const site = siteFn()
      return Cesium.Cartesian3.fromRadians(
        site.longitude,
        site.latitude,
        lengthAt() / 2,
      )
    }, false),
    cylinder: {
      length: new Cesium.CallbackProperty(lengthAt, false),
      topRadius: new Cesium.CallbackProperty(radiusAt, false),
      bottomRadius: new Cesium.CallbackProperty(radiusAt, false),
      material: new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(colourFn, false),
      ),
    },
  })
}

onMounted(() => {
  const imagery = Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromUrl(IMAGERY_URL, {
      enablePickFeatures: false,
    }),
  )
  imagery.brightness = IMAGERY_BRIGHTNESS

  viewer = new Cesium.Viewer(container.value, {
    baseLayer: imagery,
    // Strip the stock widgets — this is a game view, not a GIS console.
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    vrButton: false,
  })

  const {scene, camera} = viewer

  scene.backgroundColor = Cesium.Color.BLACK
  scene.globe.enableLighting = false
  scene.globe.showGroundAtmosphere = true
  scene.highDynamicRange = false
  // Nothing is ever below the surface, so let the globe swallow the terrain
  // depth test and keep the horizon clean.
  scene.globe.depthTestAgainstTerrain = true

  const controller = scene.screenSpaceCameraController
  applyMinimumZoom()
  controller.maximumZoomDistance = 40_000_000   // a bit past whole-earth view
  controller.enableTilt = true
  controller.enableLook = false

  camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(0, 20, 22_000_000),
  })

  // Cesium reuses the movement object between events, so keep our own copy.
  cursorHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
  cursorHandler.setInputAction((movement) => {
    cursor = Cesium.Cartesian2.clone(movement.endPosition, cursor)
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', applyMinimumZoom)
  removeZoomStep = scene.postRender.addEventListener(updateZoomStep)
  removeReadout = scene.postRender.addEventListener(updateReadout)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', applyMinimumZoom)
  if (removeReadout) removeReadout()
  removeReadout = null
  if (removeZoomStep) removeZoomStep()
  removeZoomStep = null
  if (cursorHandler && !cursorHandler.isDestroyed()) cursorHandler.destroy()
  cursorHandler = null
  if (viewer && !viewer.isDestroyed()) viewer.destroy()
  viewer = null
  pin = null
  guess = null
  cursor = null
})
</script>

<template>
  <div ref="container" class="globe">
    <!-- TEMPORARY measuring aid -->
    <div class="scale">
      <div class="scale-row">
        <div class="scale-bar" :style="{width: scaleBarPx + 'px'}"></div>
        <span>{{ scaleLabel }}</span>
      </div>
      <div class="scale-pin">
        alt {{ altitudeLabel }} &middot; floor {{ minZoomLabel }}
      </div>
      <div class="scale-pin">
        pin &#8960; {{ pinDiameterLabel }}
        <template v-if="pinLengthLabel"> &middot; length {{ pinLengthLabel }}</template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.globe {
  width: 100%;
  height: 100%;
}

/* TEMPORARY measuring aid */
.scale {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 1;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #eee;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  pointer-events: none;
}

.scale-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scale-bar {
  height: 7px;
  border: 1px solid #eee;
  border-top: none;
}

.scale-pin {
  margin-top: 4px;
  color: #9ad;
}

/* CesiumJS is Apache-2.0, so its logo is optional and we drop it. The text
   credits next to it are ESRI's data attribution and stay put. */
.globe :deep(.cesium-credit-logoContainer) {
  display: none !important;
}
</style>
