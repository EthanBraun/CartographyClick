<script setup>
// The globe as the game sees it. This is the coordinator: it owns the Cesium
// viewer's lifetime and the cursor, turns the parent's props into calls on
// the modules under globe/, and turns what they find into events back up.
// What is drawn, how it is built and where the camera flies all live there.
import {onBeforeUnmount, onMounted, ref, watch} from 'vue'
import * as Cesium from 'cesium'
import {loadBorders, outlineFor} from '../game/borders'
import {
  applyMinimumZoom,
  captureView,
  flyToReveal,
  flyToSelect,
  liftForNextRound,
  restoreView,
  updateZoomStep,
} from './globe/camera'
import {createMarkers} from './globe/markers'
import ScaleReadout from './globe/ScaleReadout.vue'
import {createSelectMode} from './globe/selectMode'
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
  // 1 = dead on, 0 = as wrong as it gets; colours the guess pin.
  accuracy: {type: Number, default: 1},
  // Bumped only when a new game starts. `round` moves for every city, so on
  // its own it cannot tell "next city" from "start over" -- and the two want
  // opposite things from the pins already on the globe.
  game: {type: Number, default: 0},
  // True while the globe is being used to pick countries instead of to play a
  // round. Select mode reuses all of this -- the same camera, the same F, the
  // same outline builder -- so it is a flag on this component rather than a
  // second one.
  selecting: {type: Boolean, default: false},
  // Country codes picked so far. The parent owns the list; this only draws it,
  // so what is lit on the globe cannot drift from what the HUD says is picked.
  selected: {type: Array, default: () => []},
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
// Everything registered on the window and the scene, torn down together.
let detach = []
// Where the camera stood when select mode opened, to put it back on the way
// out, and which game it opened on -- see leaveSelect() for what that is for.
let savedView = null
let selectedGame = 0

function live() {
  return viewer !== null && !viewer.isDestroyed()
}

function onKeyDown(event) {
  if (event.key.toLowerCase() !== DROP_KEY) return
  // Holding the key shouldn't machine-gun the pin, and a modifier means the
  // user is reaching for a browser/app shortcut, not guessing.
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return

  event.preventDefault()
  // Same gesture either way -- the mouse aims and F commits. What it commits
  // in select mode is a country rather than a guess.
  if (props.selecting) toggleHovered()
  else dropPin()
}

function toggleHovered() {
  if (select.hovered) emit('toggle', select.hovered)
}

function dropPin() {
  if (!live() || !cursor) return
  // One guess per city — once the answer is showing, the round is closed.
  if (!props.target || props.revealed) return

  const ray = viewer.camera.getPickRay(cursor)
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
  liftForNextRound(viewer)
}

// ---------------------------------------------------------------------------
// Select mode
// ---------------------------------------------------------------------------

function enterSelect() {
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
  if (view && props.game === selectedGame) restoreView(viewer, view)
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
    scene.postRender.addEventListener(() => updateZoomStep(viewer)),
    scene.postRender.addEventListener(() => select.update(cursor)),
  ]
  readout.value.attach(viewer, () => markers.guess)

  // Start the border files downloading now rather than at the first reveal —
  // there is a whole round of aiming to cover the few MB. A failure here is
  // ignored on purpose; revealBorders() retries and copes with going without.
  loadBorders().catch(() => {})
})

onBeforeUnmount(() => {
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
  </div>
</template>

<style scoped>
.globe {
  width: 100%;
  height: 100%;
}

/* CesiumJS is Apache-2.0, so its logo is optional and we drop it. The text
   credits next to it are ESRI's data attribution and stay put. */
.globe :deep(.cesium-credit-logoContainer) {
  display: none !important;
}
</style>
