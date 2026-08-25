// Distance-to-points math, taken from maptap.gg's own calculateScore() in
// https://maptap.gg/js/location-detection.js rather than inferred:
//
//   const maxDistance = 16250
//   if (distance >= maxDistance) return distance < 16750 ? 0.01 : 0
//   return Math.exp(-(distance / maxDistance) * 3.5)
//
// This replaced a power falloff fitted to the four boundaries the scoring post
// logged (23 km -> 100, 24 -> 99, 69 -> 99, 72 -> 98). That fit reproduced all
// four exactly and was still wrong: two very different curves pass through the
// same four points when they all sit inside the first 72 km. It drifted badly
// further out -- at 8000 km it paid 11 where the real game pays 18.
//
// Note the falloff is pinned to 16,250 km, not to the antipode: everything
// past 16,750 km scores a flat 0, so the furthest quarter of the planet is one
// dead zone rather than a taper.

// Mean Earth radius. The great-circle distance below treats the planet as a
// sphere, which is off by up to ~0.3% against the real ellipsoid -- far inside
// the ~1 km that would move a single point on the curve.
const EARTH_RADIUS_KM = 6371.0088

const FALLOFF_KM = 16_250
const FALLOFF_RATE = 3.5
// Between these two the real game pays a token 0.01 rather than dropping
// straight to nothing.
const ZERO_KM = 16_750
const CONSOLATION = 0.01

// Five cities, weighted 1-1-2-3-3, so a flawless game is exactly 1000.
export const ROUND_MULTIPLIERS = [1, 1, 2, 3, 3]
export const ROUND_MAX = 100
export const GAME_MAX = ROUND_MULTIPLIERS.reduce((total, m) => total + m * ROUND_MAX, 0)

// Haversine rather than the spherical law of cosines: the two agree everywhere
// except at small separations, which is precisely where this game is decided.
export function greatCircleKm(a, b) {
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLon = (b.lon - a.lon) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// 0-100 for one round, before its multiplier.
export function roundPoints(distanceKm) {
  if (distanceKm >= FALLOFF_KM) {
    return Math.round(ROUND_MAX * (distanceKm < ZERO_KM ? CONSOLATION : 0))
  }
  return Math.round(ROUND_MAX * Math.exp(-(distanceKm / FALLOFF_KM) * FALLOFF_RATE))
}
