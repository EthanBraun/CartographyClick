<script setup>
// TEMPORARY: scale bar + pin dimension readout, for eyeballing how thick the
// pin should actually be. Delete this file and its use in Globe.vue once
// settled -- and see the note on SCALE_TARGET_PX in camera.js, which is the
// one thing outside this file that exists for it.
import {onBeforeUnmount, ref} from 'vue'
import * as Cesium from 'cesium'
import {METERS_PER_KM, SCALE_TARGET_PX, metresPerPixel} from './camera'
import {PIN_ASPECT, pinRadius} from './pins'
// The same formatter the round result uses, so the bar and the miss it is
// read against agree on unit and precision.
import {formatKm} from '../hud/format'

const NICE_KM = [
  0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
]

const props = defineProps({
  // The key that drops a pin, for the hint shown while there is no pin yet.
  dropKey: {type: String, required: true},
  // In select mode the pin is hidden and the line below it says what the key
  // does there instead.
  selecting: {type: Boolean, default: false},
})

const scaleBarPx = ref(0)
const scaleLabel = ref('')
const altitudeLabel = ref('')
const minZoomLabel = ref('')
// Empty until a pin is down.
const pinDiameterLabel = ref('')
const pinLengthLabel = ref('')

let viewer = null
let getGuess = null
let removeReadout = null

// The globe builds its viewer after this has mounted, so it hands the viewer
// over rather than passing it down. `guess` returns the pin site in radians,
// or null while there is no pin.
function attach(target, guess) {
  viewer = target
  getGuess = guess
  removeReadout = viewer.scene.postRender.addEventListener(update)
}

// Called before the viewer is destroyed, while its postRender event is still
// there to detach from.
function detach() {
  if (removeReadout) removeReadout()
  removeReadout = null
  viewer = null
  getGuess = null
}

defineExpose({attach, detach})

function update() {
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

  const altitude = formatKm(viewer.camera.positionCartographic.height / METERS_PER_KM)
  if (altitude !== altitudeLabel.value) altitudeLabel.value = altitude

  const floor = viewer.scene.screenSpaceCameraController.minimumZoomDistance
  const minZoom = formatKm(floor / METERS_PER_KM)
  if (minZoom !== minZoomLabel.value) minZoomLabel.value = minZoom

  const mpp = metresPerPixel(viewer, distance)
  const spanKm = (SCALE_TARGET_PX * mpp) / METERS_PER_KM
  const nice = [...NICE_KM].reverse().find((k) => k <= spanKm) ?? NICE_KM[0]

  const px = Math.round((nice * METERS_PER_KM) / mpp)
  if (px !== scaleBarPx.value) scaleBarPx.value = px
  const label = formatKm(nice)
  if (label !== scaleLabel.value) scaleLabel.value = label

  const guess = getGuess()
  if (!guess) {
    if (pinDiameterLabel.value) pinDiameterLabel.value = ''
    if (pinLengthLabel.value) pinLengthLabel.value = ''
    return
  }
  const surface = Cesium.Cartesian3.fromRadians(guess.longitude, guess.latitude, 0)
  const radius = pinRadius(viewer, surface)
  const diameter = formatKm((radius * 2) / METERS_PER_KM)
  const lengthText = formatKm((radius * PIN_ASPECT) / METERS_PER_KM)
  if (diameter !== pinDiameterLabel.value) pinDiameterLabel.value = diameter
  if (lengthText !== pinLengthLabel.value) pinLengthLabel.value = lengthText
}

onBeforeUnmount(detach)
</script>

<template>
  <div class="scale">
    <div class="scale-row">
      <div class="scale-bar" :style="{width: scaleBarPx + 'px'}"></div>
      <span>{{ scaleLabel }}</span>
    </div>
    <div class="scale-pin">
      alt {{ altitudeLabel }} &middot; floor {{ minZoomLabel }}
    </div>
    <div class="scale-pin">
      pin &#8960;
      <template v-if="selecting">pick a country with {{ dropKey.toUpperCase() }}</template>
      <template v-else-if="!pinDiameterLabel">drop a pin with {{ dropKey.toUpperCase() }}</template>
      <template v-else>{{ pinDiameterLabel }} &middot; length {{ pinLengthLabel }}</template>
    </div>
  </div>
</template>

<style scoped>
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
</style>
