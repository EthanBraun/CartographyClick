<script setup>
import {onBeforeUnmount, onMounted, ref, watch} from 'vue'
import * as Cesium from 'cesium'
import {loadBorders, outlineFor} from '../game/borders'

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

// The opening view only: a neutral whole-globe framing to start a game from.
const HOME_LON = 0
const HOME_LAT = 20
const HOME_HEIGHT = 22_000_000

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
// globe as the globe shrinks away. Past the home altitude the pin stops
// growing and from there shrinks with everything else.
const PIN_GROWTH_CEILING = HOME_HEIGHT
const PIN_ASPECT = 6                 // length = 6 x radius
// Let the imagery read through the pin rather than punching a solid hole in it.
const PIN_OPACITY = 0.7

// Accuracy ramp endpoints. Kelly green sits around 101 deg rather than a pure
// 120 deg green, and is darker and less saturated than a primary.
const HUE_PERFECT = 101
const HUE_WORST = 0
const RAMP_SATURATION = 0.78
const RAMP_LIGHTNESS = 0.41

// The answer pin has to read as "the city was here", never as a score, so it
// sits off the accuracy ramp entirely — cyan is nowhere on a green-to-red run.
const TARGET_COLOUR = Cesium.Color.fromHsl(189 / 360, 0.82, 0.52, PIN_OPACITY)

// Geodesic tie-line from the guess to the answer, so a miss reads as a
// direction rather than just a number.
const LINK_WIDTH = 2
const LINK_DASH = 14
const LINK_COLOUR = Cesium.Color.WHITE.withAlpha(0.75)
// Only used where the scene can't clamp a polyline to the ground: a line laid
// exactly on the ellipsoid z-fights with it, and a few km of lift is invisible
// at the range a reveal actually gets viewed from.
const LINK_FALLBACK_HEIGHT = 4000

// Revealing also outlines where the answer was: the country in blue, and --
// where the card names one, so the line has something to match -- the state,
// province or prefecture inside it in yellow. Both are off the accuracy ramp
// and off the answer pin's cyan, so an outline never reads as a score.
const COUNTRY_BORDER_COLOUR = Cesium.Color.fromHsl(217 / 360, 0.9, 0.58, 0.95)
const REGION_BORDER_COLOUR = Cesium.Color.fromHsl(48 / 360, 0.95, 0.55, 0.95)
// The subdivision sits inside the country and shares its coast, so it goes on
// thinner and on top: where the two lines coincide, the more specific one wins.
const COUNTRY_BORDER_WIDTH = 3
const REGION_BORDER_WIDTH = 2

// An outline arrives a few rings at a time (see addOutline). The first chunk is
// a single ring because that one ring is most of what there is to recognise,
// and later chunks grow by this factor so the number of batches stays
// logarithmic in the ring count -- six for Canada's 412, not 412.
const OUTLINE_FIRST_CHUNK = 1
const OUTLINE_CHUNK_GROWTH = 4

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

// Closest zoom is defined as "the scale bar reads 5 miles". Solved at runtime
// from the live canvas size and vertical FOV rather than baked in, since both
// shift with the window. NOTE: depends on SCALE_TARGET_PX in the temporary
// block below — bake the resulting metre value in when that block goes.
const MIN_ZOOM_SCALE_MILES = 5

const props = defineProps({
  // The city being asked for: {name, country, lat, lon}.
  target: {type: Object, default: null},
  // Flips once the guess is locked in and the answer is on the table.
  revealed: {type: Boolean, default: false},
  // Changes for every new city. Watched instead of `target` because two games
  // back to back can draw the same city, and an identity check would miss it.
  round: {type: Number, default: 0},
  // 1 = dead on, 0 = as wrong as it gets; colours the guess pin.
  accuracy: {type: Number, default: 1},
})

const emit = defineEmits(['guess'])

const container = ref(null)
let viewer = null
let pin = null
let targetPin = null
let link = null
let countryOutline = null
let regionOutline = null
// Guess site, in radians.
let guess = null
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
  // One guess per city — once the answer is showing, the round is closed.
  if (!props.target || props.revealed) return

  const ray = viewer.camera.getPickRay(cursor)
  if (!ray) return

  // Picking the globe rather than the depth buffer means a cursor out over
  // space returns nothing, so we simply don't place a pin there.
  const position = viewer.scene.globe.pick(ray, viewer.scene)
  if (!Cesium.defined(position)) return

  const carto = Cesium.Cartographic.fromCartesian(position)
  guess = {longitude: carto.longitude, latitude: carto.latitude}
  if (!pin) pin = addPin(() => guess, () => accuracyColour(props.accuracy))

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
const DROP_HINT = `drop a pin with ${DROP_KEY.toUpperCase()}`
const pinDiameterLabel = ref(DROP_HINT)
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

// Put the answer on the globe: a pin on the real city, plus a geodesic back to
// the guess. Guarded on targetPin so a re-render can't stack duplicates.
function revealTarget() {
  if (!viewer || viewer.isDestroyed() || !props.target || targetPin) return

  const site = {
    longitude: Cesium.Math.toRadians(props.target.lon),
    latitude: Cesium.Math.toRadians(props.target.lat),
  }
  targetPin = addPin(() => site, () => TARGET_COLOUR)
  if (!guess) return

  const clamped = Cesium.GroundPolylinePrimitive.isSupported(viewer.scene)
  const height = clamped ? 0 : LINK_FALLBACK_HEIGHT
  link = viewer.entities.add({
    polyline: {
      positions: [
        Cesium.Cartesian3.fromRadians(guess.longitude, guess.latitude, height),
        Cesium.Cartesian3.fromRadians(site.longitude, site.latitude, height),
      ],
      // Straight through the earth is not a distance anyone reads; a geodesic
      // is the line the score was actually measured along.
      arcType: Cesium.ArcType.GEODESIC,
      clampToGround: clamped,
      width: LINK_WIDTH,
      material: new Cesium.PolylineDashMaterialProperty({
        color: LINK_COLOUR,
        dashLength: LINK_DASH,
      }),
    },
  })

  const sphere = Cesium.BoundingSphere.fromPoints([
    Cesium.Cartesian3.fromRadians(guess.longitude, guess.latitude),
    Cesium.Cartesian3.fromRadians(site.longitude, site.latitude),
  ])
  sphere.radius = Math.max(sphere.radius * REVEAL_PADDING, REVEAL_MIN_RADIUS)
  viewer.camera.flyToBoundingSphere(sphere, {
    duration: REVEAL_FLIGHT_SECONDS,
    // Range 0 means "work out the distance from the sphere", which is the
    // framing we already want; only the angle is being overridden here.
    offset: new Cesium.HeadingPitchRange(REVEAL_HEADING, REVEAL_PITCH, 0),
  })
}

// Outline the country the answer is in, and the subdivision within it. The
// data is fetched once and the lookup costs a millisecond or two, so this can
// land a frame or two behind the pins — hence the round check on the far side
// of the await, which stops a slow load from dropping last city's border onto
// the next one.
async function revealBorders() {
  const drawnFor = props.round
  try {
    await loadBorders()
  } catch {
    // No network, no outlines. The reveal still reads without them.
    return
  }
  if (!viewer || viewer.isDestroyed()) return
  if (props.round !== drawnFor || !props.revealed || !props.target) return
  if (countryOutline) return

  const outline = outlineFor(props.target)
  if (!outline) return

  countryOutline = addOutline(
    outline.country.rings,
    COUNTRY_BORDER_COLOUR,
    COUNTRY_BORDER_WIDTH,
  )
  if (outline.region) {
    regionOutline = addOutline(
      outline.region.rings,
      REGION_BORDER_COLOUR,
      REGION_BORDER_WIDTH,
    )
  }
}

// `rings` are flat [lon, lat, ...] arrays. They go into a handful of primitives
// rather than one each: Canada's outline is 412 rings, and batching keeps that
// a few draw calls instead of 412 the scene has to walk every frame.
//
// A handful rather than one, though. A primitive draws nothing until every
// instance in it is ready, so a single batch of 412 makes the whole outline
// wait on the last islet -- which is the pause the reveal used to open with.
// Biggest ring first, the shape lands in the first chunk (that ring alone is
// 61% of Russia's line and a third of the USA's) and the islands fill in
// behind it.
//
// Each chunk waits on the one before being ready rather than on a timer, so
// the fill paces itself to the machine: quick enough and it reads as an
// instant draw, slow enough and it reads as a deliberate sweep. Either beats a
// stall. It does mean the last islet lands later than one batch would have
// managed -- that is the trade, and it buys the first ring landing far sooner.
function addOutline(rings, colour, width) {
  const clamped = Cesium.GroundPolylinePrimitive.isSupported(viewer.scene)
  // Vertex count stands in for how much of the outline a ring accounts for.
  const ordered = [...rings].sort((a, b) => b.length - a.length)
  const outline = {primitives: [], stop: null}

  let drawn = 0
  let size = OUTLINE_FIRST_CHUNK

  const drawChunk = () => {
    const chunk = ordered.slice(drawn, drawn + size)
    drawn += chunk.length
    size *= OUTLINE_CHUNK_GROWTH

    const primitive = viewer.scene.primitives.add(
      buildOutline(chunk, colour, width, clamped),
    )
    outline.primitives.push(primitive)
    if (drawn >= ordered.length) return

    // Polled rather than awaited: readyPromise is gone in this Cesium, and
    // postRender is already where the rest of this component watches the scene.
    outline.stop = viewer.scene.postRender.addEventListener(() => {
      if (!primitive.ready) return
      stopFilling(outline)
      drawChunk()
    })
  }

  drawChunk()
  return outline
}

// One chunk of rings, as a primitive that has not been added to the scene yet.
function buildOutline(rings, colour, width, clamped) {
  const appearance = new Cesium.PolylineMaterialAppearance({
    material: Cesium.Material.fromType('Color', {color: colour}),
  })

  const geometryInstances = rings.map(
    (ring) =>
      new Cesium.GeometryInstance({
        geometry: clamped
          ? new Cesium.GroundPolylineGeometry({
              positions: Cesium.Cartesian3.fromDegreesArray(ring),
              width,
              // A border is drawn as straight lines in lat/lon, and
              // simplification leaves the long straight ones as a single
              // segment — the US/Canada border along the 49th parallel is two
              // points. Drawn as a geodesic that segment bows some 30 km north
              // of the parallel it is supposed to be.
              arcType: Cesium.ArcType.RHUMB,
            })
          : new Cesium.PolylineGeometry({
              positions: Cesium.Cartesian3.fromDegreesArrayHeights(
                lift(ring, LINK_FALLBACK_HEIGHT),
              ),
              width,
              arcType: Cesium.ArcType.RHUMB,
              vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
            }),
      }),
  )

  const Outline = clamped ? Cesium.GroundPolylinePrimitive : Cesium.Primitive
  return new Outline({geometryInstances, appearance})
}

// Chunk scheduling hangs off a postRender listener, so dropping an outline has
// to take the listener with it -- otherwise the next chunk lands on the next
// round's globe.
function stopFilling(outline) {
  if (!outline || !outline.stop) return
  outline.stop()
  outline.stop = null
}

// Flat [lon, lat, ...] to flat [lon, lat, height, ...].
function lift(ring, height) {
  const out = []
  for (let i = 0; i < ring.length; i += 2) out.push(ring[i], ring[i + 1], height)
  return out
}

// Clear the round's markers and pull back out to the whole globe, so the next
// city starts from the same blank slate every time.
function clearRound() {
  if (!viewer || viewer.isDestroyed()) return

  for (const entity of [pin, targetPin, link]) {
    if (entity) viewer.entities.remove(entity)
  }
  pin = null
  targetPin = null
  link = null
  clearOutlines()
  guess = null
  pinDiameterLabel.value = DROP_HINT
  pinLengthLabel.value = ''

  liftForNextRound()
}

// Primitives live on the scene rather than in the entity collection, so they
// need removing by hand. `remove` destroys them, which is what we want.
function clearOutlines() {
  for (const outline of [countryOutline, regionOutline]) {
    if (!outline) continue
    stopFilling(outline)
    for (const primitive of outline.primitives) {
      viewer.scene.primitives.remove(primitive)
    }
  }
  countryOutline = null
  regionOutline = null
}

// What the camera is aimed at, which after a reveal is not the same as what it
// is standing over — the reveal tilts it, so the two are a good fraction of the
// viewing distance apart. Undefined when the centre of the screen is off the
// globe entirely, i.e. looking past the limb into space.
function lookAtCartographic() {
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

// Pull up and level out for the next city, holding the ground the reveal left
// under the centre of the screen.
function liftForNextRound() {
  // Aiming at space is rare but possible; standing still beats snapping to an
  // arbitrary point, so fall back to whatever the camera is above.
  const site = lookAtCartographic() ?? viewer.camera.positionCartographic
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromRadians(
      site.longitude,
      site.latitude,
      NEXT_ROUND_HEIGHT,
    ),
    // The reveal leaves the camera tilted and this undoes it. flyTo would
    // default to exactly this, but the reset is the point of the call, so it
    // says so rather than relying on the default staying put.
    orientation: {heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0},
    duration: NEXT_ROUND_FLIGHT_SECONDS,
  })
}

watch(
  () => props.revealed,
  (revealed) => {
    if (!revealed) return
    revealTarget()
    revealBorders()
  },
)

// A new city wipes the board. Advancing bumps `round` and drops `revealed` in
// the same tick, so this runs alongside the watcher above — which is why that
// one only ever acts on the rising edge.
watch(() => props.round, clearRound)

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
    destination: Cesium.Cartesian3.fromDegrees(HOME_LON, HOME_LAT, HOME_HEIGHT),
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

  // Start the border files downloading now rather than at the first reveal —
  // there is a whole round of aiming to cover the few MB. A failure here is
  // ignored on purpose; revealBorders() retries and copes with going without.
  loadBorders().catch(() => {})
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
  // Before the viewer goes, while its postRender event is still there to
  // detach from.
  stopFilling(countryOutline)
  stopFilling(regionOutline)
  if (viewer && !viewer.isDestroyed()) viewer.destroy()
  viewer = null
  pin = null
  targetPin = null
  link = null
  countryOutline = null
  regionOutline = null
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
