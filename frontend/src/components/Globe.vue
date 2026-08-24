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

const container = ref(null)
let viewer = null

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
  controller.minimumZoomDistance = 800          // ~city-block altitude
  controller.maximumZoomDistance = 40_000_000   // a bit past whole-earth view
  controller.enableTilt = true
  controller.enableLook = false

  camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(0, 20, 22_000_000),
  })
})

onBeforeUnmount(() => {
  if (viewer && !viewer.isDestroyed()) viewer.destroy()
  viewer = null
})
</script>

<template>
  <div ref="container" class="globe"></div>
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
