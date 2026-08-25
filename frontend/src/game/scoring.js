// Distance-to-points math, reverse-engineered from maptap.gg's own numbers as
// logged in https://shishke.blog/2026/04/14/numbers-maptap-points-system/
//
// The post pins down four boundaries by replaying the NYC tutorial:
//
//   23 km -> 100    24 km -> 99    69 km -> 99    72 km -> 98
//
// plus a floor: a guess out by the antipode scores 0. A single power falloff
// reproduces every one of those, so nothing here is special-cased -- notably
// there is no separate "close enough counts as perfect" radius. 100 is just
// what the curve rounds to inside ~23 km, and the post's observation that the
// curve is smooth across national borders falls out for free.

// Mean Earth radius. The great-circle distance below treats the planet as a
// sphere, which is off by up to ~0.3% against the real ellipsoid -- far inside
// the ~1 km that would move a single point on the curve.
const EARTH_RADIUS_KM = 6371.0088

// The furthest two points on Earth can be: half the circumference. Scoring is
// pinned to this rather than a round 20,000 km so that an antipodal guess
// lands on exactly zero instead of going slightly negative.
const ANTIPODE_KM = Math.PI * EARTH_RADIUS_KM

// Solved from the boundaries above; the whole window that satisfies all four
// is roughly 4.19 to 4.36.
const FALLOFF = 4.25

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
  const remaining = 1 - distanceKm / ANTIPODE_KM
  if (remaining <= 0) return 0
  return Math.round(ROUND_MAX * remaining ** FALLOFF)
}
