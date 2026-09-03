<script setup>
// The globe as the game sees it. This is the coordinator: it owns the Cesium
// viewer's lifetime and the cursor, turns the parent's props into calls on
// the modules under globe/, and turns what they find into events back up.
// What is drawn, how it is built and where the camera flies all live there.
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import * as Cesium from 'cesium'
import {loadBorders, outlineFor} from '../game/borders'
import {
  applyMinimumZoom,
  captureView,
  flyToReveal,
  flyToSelect,
  liftForNextRound,
  restoreView,
  startFinale,
} from './globe/camera'
import {createMarkers} from './globe/markers'
import ScaleReadout from './globe/ScaleReadout.vue'
import {createSelectMode} from './globe/selectMode'
import {attachTouch} from './globe/touch'
import {createViewer} from './globe/viewer'

// Dragging already means "rotate the globe", so the guess is committed with a
// key instead of a click — the mouse aims, the key drops the pin.
const DROP_KEY = 'f'

const props = defineProps({
  // The city being asked for: {name, country, lat, lon}.
  target: {type: Object, default: null},
  // Flips once the guess is locked in and the answer is on the table.
  revealed: {type: Boolean, default: false},
  // Changes for every new city. Watched instead of `target` because two games
  // back to back can draw the same city, and an identity check would miss it.
  round: {type: Number, default: 0},
  // 1 = dead on, 0 = as wrong as it gets; colors the guess pin.
  accuracy: {type: Number, default: 1},
  // Bumped only when a new game starts. `round` moves for every city, so on
  // its own it cannot tell "next city" from "start over" -- and the two want
  // opposite things from the pins already on the globe.
  game: {type: Number, default: 0},
  // True once the run's last city has been revealed and the score is up. The
  // globe pulls out to the whole planet and turns slowly behind the card.
  over: {type: Boolean, default: false},
  // True while the globe is being used to pick countries instead of to play a
  // round. Select mode reuses all of this -- the same camera, the same F, the
  // same outline builder -- so it is a flag on this component rather than a
  // second one.
  selecting: {type: Boolean, default: false},
  // Country codes picked so far. The parent owns the list; this only draws it,
  // so what is lit on the globe cannot drift from what the HUD says is picked.
  selected: {type: Array, default: () => []},
  // True on a phone or tablet, where there is no cursor to aim with. The aim
  // is the middle of the screen instead, marked with a crosshair, and the
  // globe is dragged under it -- the same gesture the game already has, with
  // the two halves swapped. The commit comes from a button the parent shows in
  // place of the key hints, through commit() below.
  touch: {type: Boolean, default: false},
})

const emit = defineEmits(['guess', 'hover', 'toggle'])

const container = ref(null)
const readout = ref(null)
let viewer = null
// What the game has standing on the globe -- see globe/markers.js.
let markers = null
// The hover and the lit borders while picking -- see globe/selectMode.js.
let select = null
let cursorHandler = null
// Latest cursor position over the canvas, in screen pixels.
let cursor = null
// The middle of the canvas, for aiming by touch. Kept and rewritten in place
// rather than allocated, since it is read every frame.
const center = new Cesium.Cartesian2()
// Everything registered on the window and the scene, torn down together.
let detach = []
// Where the camera stood when select mode opened, to put it back on the way
// out, and which game it opened on -- see leaveSelect() for what that is for.
let savedView = null
let selectedGame = 0
// Stops the finale's lift-and-spin; null while it is not running.
let stopFinale = null
// Stops the climb to the next city's opening height; null while it is not
// running. The climb leaves the globe in the player's hands, so it has to be
// ended by hand whenever something else takes the camera.
let stopLift = null

function live() {
  return viewer !== null && !viewer.isDestroyed()
}

function onKeyDown(event) {
  if (event.key.toLowerCase() !== DROP_KEY) return
  // Holding the key shouldn't machine-gun the pin, and a modifier means the
  // user is reaching for a browser/app shortcut, not guessing.
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return

  event.preventDefault()
  commit()
}

// What F does, and what the touch button for it does: take whatever is under
// the aim. Same gesture either way -- the aim points and this commits. What
// it commits in select mode is a country rather than a guess.
function commit() {
  if (props.selecting) toggleHovered()
  else dropPin()
}

defineExpose({commit})

// Where a commit lands, in screen pixels: under the cursor, or under the
// crosshair when there is no cursor. Null before the mouse has ever crossed
// the canvas.
function aim() {
  if (!props.touch) return cursor
  const {canvas} = viewer.scene
  center.x = canvas.clientWidth / 2
  center.y = canvas.clientHeight / 2
  return center
}

// Whether there is anything to aim at right now, which is when the crosshair
// shows. Not once the answer is up, and not behind the score card.
const aiming = computed(
  () => props.selecting || (props.target !== null && !props.revealed && !props.over),
)

function toggleHovered() {
  if (select.hovered) emit('toggle', select.hovered)
}

function dropPin() {
  if (!live()) return
  // One guess per city — once the answer is showing, the round is closed.
  if (!props.target || props.revealed) return
  const at = aim()
  if (!at) return

  const ray = viewer.camera.getPickRay(at)
  if (!ray) return

  // Picking the globe rather than the depth buffer means a cursor out over
  // space returns nothing, so we simply don't place a pin there.
  const position = viewer.scene.globe.pick(ray, viewer.scene)
  if (!Cesium.defined(position)) return

  const carto = Cesium.Cartographic.fromCartesian(position)
  markers.drop({longitude: carto.longitude, latitude: carto.latitude})

  emit('guess', {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
  })
}

// Put the answer on the globe and frame the miss.
function revealTarget() {
  if (!live() || !props.target) return
  // A quick guess can land while the camera is still climbing from the last
  // round. The reveal owns the camera from here.
  endLift()
  const sites = markers.reveal(props.target)
  if (sites) flyToReveal(viewer, sites.guess, sites.target)
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
  if (!live()) return
  if (props.round !== drawnFor || !props.revealed || !props.target) return

  const outline = outlineFor(props.target)
  if (outline) markers.outline(outline)
}

// Close the round out and pull back to the whole globe. `restarting` marks a
// new game, where the round that just finished is thrown away with the rest of
// the history rather than joining it.
function clearRound(restarting) {
  if (!live()) return
  if (restarting) markers.clear()
  else markers.retire()
  markers.clearOutlines()
  endLift()
  stopLift = liftForNextRound(viewer)
}

function endLift() {
  stopLift?.()
  stopLift = null
}

// ---------------------------------------------------------------------------
// Finale
// ---------------------------------------------------------------------------

// Pull out to the whole globe behind the score card, turning as it goes. The
// pins stay: the last round is still on the planet, just seen from far enough
// away that the game is the thing in view rather than the city.
function beginFinale() {
  if (!live()) return
  endLift()
  endFinale()
  stopFinale = startFinale(viewer)
}

function endFinale() {
  stopFinale?.()
  stopFinale = null
}

// ---------------------------------------------------------------------------
// Select mode
// ---------------------------------------------------------------------------

function enterSelect() {
  endLift()
  endFinale()
  markers.show(false)
  selectedGame = props.game
  savedView = captureView(viewer)
  flyToSelect(viewer)
}

function leaveSelect() {
  select.clear()
  markers.show(true)

  // The camera goes back only if the game it left is the game being returned
  // to. Leaving select mode to start a study run bumps `game`, and a new game
  // opens the way every new game opens -- restoring the paused game's camera
  // there would hand the first city a view of where the last one was.
  const view = savedView
  savedView = null
  if (!view || props.game !== selectedGame) return
  // Back to a finished game is back to its score card, so the finale resumes
  // rather than the camera landing on a globe that has stopped turning.
  if (props.over) beginFinale()
  else restoreView(viewer, view)
}

watch(
  () => props.selecting,
  (selecting) => {
    if (selecting) enterSelect()
    else leaveSelect()
    select.paint()
  },
)

// Joined rather than deep-watched: the parent replaces the array on every
// change, and a list of codes is its own identity.
watch(
  () => props.selected.join(),
  () => select.paint(),
)

watch(
  () => props.revealed,
  (revealed) => {
    if (!revealed) return
    revealTarget()
    revealBorders()
  },
)

// Registered ahead of the round watcher on purpose: a restart drops `over` and
// bumps the counters in one tick, and the spin has to be off before the lift
// for the next city starts, or the two drive the camera at once for a frame.
watch(
  () => props.over,
  (over) => {
    if (over) beginFinale()
    else endFinale()
  },
)

// A new city wipes the board. Advancing bumps `round` and drops `revealed` in
// the same tick, so this runs alongside the watcher above — which is why that
// one only ever acts on the rising edge.
// Watched as a pair rather than as two watchers: a restart moves both counters
// in the same tick, and split across two callbacks whether the finished round
// joined the history or was cleared with it would come down to which watcher
// happened to be registered first.
watch(
  () => [props.game, props.round],
  ([game], [wasGame]) => clearRound(game !== wasGame),
)

onMounted(() => {
  viewer = createViewer(container.value)
  applyMinimumZoom(viewer)
  markers = createMarkers(viewer, () => props.accuracy)
  select = createSelectMode(viewer, {
    selecting: () => props.selecting,
    selected: () => props.selected,
    onHover: (country) => emit('hover', country),
  })

  const {scene} = viewer

  // Cesium reuses the movement object between events, so keep our own copy.
  cursorHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
  cursorHandler.setInputAction((movement) => {
    cursor = Cesium.Cartesian2.clone(movement.endPosition, cursor)
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  const onResize = () => applyMinimumZoom(viewer)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onResize)
  detach = [
    () => window.removeEventListener('keydown', onKeyDown),
    () => window.removeEventListener('resize', onResize),
    attachTouch(viewer),
    scene.postRender.addEventListener(() => select.update(aim())),
  ]
  readout.value.attach(viewer, () => markers.guess)

  // Start the border files downloading now rather than at the first reveal —
  // there is a whole round of aiming to cover the few MB. A failure here is
  // ignored on purpose; revealBorders() retries and copes with going without.
  loadBorders().catch(() => {})
})

onBeforeUnmount(() => {
  endLift()
  endFinale()
  for (const off of detach) off()
  detach = []
  readout.value?.detach()
  if (cursorHandler && !cursorHandler.isDestroyed()) cursorHandler.destroy()
  cursorHandler = null
  // Before the viewer goes, while its postRender event is still there to
  // detach from.
  select?.dispose()
  markers?.dispose()
  if (live()) viewer.destroy()
  viewer = null
  markers = null
  select = null
  cursor = null
  savedView = null
})
</script>

<template>
  <div ref="container" class="globe">
    <!-- TEMPORARY measuring aid -->
    <ScaleReadout ref="readout" :drop-key="DROP_KEY" :selecting="selecting" />
    <div v-if="touch && aiming" class="crosshair" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.globe {
  width: 100%;
  height: 100%;
}

/* The aim, on touch: a ring on the exact pixel a commit picks, open in the
   middle so the ground it is over stays readable. Outlined in dark on both
   sides so it holds against snow and open sea alike. */
.crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  border: 1.5px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.55),
    inset 0 0 0 1px rgba(0, 0, 0, 0.55);
  pointer-events: none;
}

.crosshair::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 4px;
  margin: -2px 0 0 -2px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
}

/* CesiumJS is Apache-2.0, so its logo is optional and we drop it. The text
   credits next to it are ESRI's data attribution and stay put. */
.globe :deep(.cesium-credit-logoContainer) {
  display: none !important;
}
</style>
