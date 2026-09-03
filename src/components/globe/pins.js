// The pins a round stands on the globe -- the guess, the answer -- and the
// line drawn between them on a reveal.

import * as Cesium from 'cesium'
import {METRES_PER_MILE, metresPerPixel} from './camera'
import {UNCLAMPED_HEIGHT} from './outlines'
import {HOME_HEIGHT} from './viewer'

// The pin is a cylinder along the surface normal, so it reads as a spike
// standing off the globe and stays legible as the planet rotates under it.
//
// Sizing is a floor, not a fixed size. Its true size is a 2-mile radius, which
// is what you get at close zoom. Held at that world size it would fall to a
// fraction of a pixel at globe view, so once 2 miles shrinks past
// PIN_MIN_RADIUS_PX on screen the pin starts growing in world terms to hold
// that apparent width — i.e. it scales up as you zoom out. Length is always
// tied to radius, so the proportions never change.
const PIN_RADIUS_MILES = 2
const PIN_RADIUS = PIN_RADIUS_MILES * METRES_PER_MILE
const PIN_MIN_RADIUS_PX = 8
// Holding a constant pixel size forever means the pin grows relative to the
// globe as the globe shrinks away. Past the home altitude the pin stops
// growing and from there shrinks with everything else.
const PIN_GROWTH_CEILING = HOME_HEIGHT
export const PIN_ASPECT = 6          // length = 6 x radius
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
export const TARGET_COLOUR = Cesium.Color.fromHsl(189 / 360, 0.82, 0.52, PIN_OPACITY)

// Geodesic tie-line from the guess to the answer, so a miss reads as a
// direction rather than just a number.
const LINK_WIDTH = 2
const LINK_DASH = 14
const LINK_COLOUR = Cesium.Color.WHITE.withAlpha(0.75)

// 1 = dead on, 0 = as wrong as it gets. Interpolating the hue rather than RGB
// runs green -> yellow -> red, where a straight RGB lerp would sag through mud.
export function accuracyColour(accuracy) {
  const t = Cesium.Math.clamp(accuracy, 0, 1)
  const hue = HUE_WORST + (HUE_PERFECT - HUE_WORST) * t
  return Cesium.Color.fromHsl(
    hue / 360,
    RAMP_SATURATION,
    RAMP_LIGHTNESS,
    PIN_OPACITY,
  )
}

// True 2-mile radius up close; from the point where that would shrink below
// PIN_MIN_RADIUS_PX on screen, it grows instead of vanishing.
export function pinRadius(viewer, position) {
  const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, position)
  const growth = Math.min(distance, PIN_GROWTH_CEILING)
  return Math.max(PIN_RADIUS, PIN_MIN_RADIUS_PX * metresPerPixel(viewer, growth))
}

// `siteFn` returns {longitude, latitude} in radians; `colourFn` returns a Color.
// Both are read every frame, so a pin can move and recolour after scoring.
export function addPin(viewer, siteFn, colourFn) {
  const surface = new Cesium.Cartesian3()
  const radiusAt = () => {
    const site = siteFn()
    Cesium.Cartesian3.fromRadians(site.longitude, site.latitude, 0, undefined, surface)
    return pinRadius(viewer, surface)
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

// The dashed geodesic from one site to the other, both in radians.
export function addLink(viewer, from, to) {
  const clamped = Cesium.GroundPolylinePrimitive.isSupported(viewer.scene)
  const height = clamped ? 0 : UNCLAMPED_HEIGHT
  return viewer.entities.add({
    polyline: {
      positions: [
        Cesium.Cartesian3.fromRadians(from.longitude, from.latitude, height),
        Cesium.Cartesian3.fromRadians(to.longitude, to.latitude, height),
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
}
