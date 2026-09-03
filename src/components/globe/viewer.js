// Building the globe: ESRI imagery on a Cesium viewer with every stock widget
// stripped, set up for a game rather than a GIS console. Nothing here moves
// the camera after the opening view -- that is camera.js.

import * as Cesium from 'cesium'

// ESRI's public World Imagery service: Google-Earth-style satellite basemap
// with a full tile pyramid, so zooming pulls in progressively finer LoD.
const IMAGERY_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'

// Raw satellite imagery renders hot against a dark UI; knock it back a little.
// 1.0 is the untouched basemap.
const IMAGERY_BRIGHTNESS = 0.82

// The opening view only: a neutral whole-globe framing to start a game from.
const HOME_LON = 0
const HOME_LAT = 20
export const HOME_HEIGHT = 22_000_000

// A bit past whole-earth view.
const MAX_ZOOM_DISTANCE = 40_000_000

export function createViewer(container) {
  const imagery = Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromUrl(IMAGERY_URL, {
      enablePickFeatures: false,
    }),
  )
  imagery.brightness = IMAGERY_BRIGHTNESS

  const viewer = new Cesium.Viewer(container, {
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
  controller.maximumZoomDistance = MAX_ZOOM_DISTANCE
  controller.enableTilt = true
  controller.enableLook = false

  camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(HOME_LON, HOME_LAT, HOME_HEIGHT),
  })

  return viewer
}
