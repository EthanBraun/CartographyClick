// Which country -- and which state, province or oblast -- a target sits in,
// and the outline to draw around it.
//
// Data is public.borders.{countries,regions}.json, built by tools/build-borders.js
// from Natural Earth 1:10m. That script is the other half of the encoding
// below; the two have to move together.
//
// Both files stay as fetched: a feature is a bounding box plus its rings as
// encoded strings, and nothing is decoded until a lookup narrows the field to
// a handful of candidates. Loading is therefore just a JSON parse, and the
// ~845,000 vertices in the pair never all exist as numbers at once.

import {continentOf} from './continents'

const PRECISION = 1e4

// Roughly, at the equator. Only used to put the fallback below in units that
// mean something; the error it forgives is a coastline generalization, not a
// measurement.
const KM_PER_DEGREE = 111.32

// Coordinates are the city's; the outline is a 1:10m generalization of a
// coastline. Those disagree, and they disagree most for exactly the places
// this game likes: Miami, Venice, Copenhagen and Nuuk all sit in open water on
// a 1:10m map. So a point no polygon contains is given to the nearest border
// within this distance rather than dropped.
//
// Wide enough for a generalized coastline (the worst in the pool is a few km),
// narrow enough that a genuinely mid-ocean point still resolves to nothing.
const OFFSHORE_LIMIT_KM = 75

let loading = null
let countries = null
let regions = null
// adm0_a3 -> that country's subdivisions, built once on load.
let regionsByCountry = null

export function loadBorders() {
  // A rejection is deliberately not cached: one dropped request should cost a
  // round its outlines, not the whole game.
  if (!loading) {
    loading = fetchBorders().catch((error) => {
      loading = null
      throw error
    })
  }
  return loading
}

async function fetchBorders() {
  // Relative to the document, which is what vite.config.js's `base: './'` asks
  // for everything else, so the same build works at the root of the dev
  // server and under a GitHub Pages subpath.
  const [loadedCountries, loadedRegions] = await Promise.all([
    fetch('borders/countries.json').then((r) => r.json()),
    fetch('borders/regions.json').then((r) => r.json()),
  ])

  countries = loadedCountries
  regions = loadedRegions
  regionsByCountry = new Map()
  for (const region of regions) {
    const siblings = regionsByCountry.get(region.a)
    if (siblings) siblings.push(region)
    else regionsByCountry.set(region.a, [region])
  }
}

// The country containing a place, and its subdivision where the place is one
// the game names a subdivision for, each as {name, type, rings}. `rings` is a
// flat [lon, lat, ...] per ring, outer rings and holes alike -- an enclave's
// edge is as much of a border as a coast. Null for either if nothing resolves,
// and null overall until loadBorders() has settled.
//
// Answered from the coordinates rather than from what the place says it is,
// which resolves all 618 in the pool and gets 617 right. The exception is the
// class of thing you would expect: Goma's coordinates sit about a kilometer
// east of where a 1:10m map draws the DRC/Rwanda line through it, so its
// outline is Rwanda's. Only a name-to-polygon table would fix that, and one
// border town is not worth maintaining one.
export function outlineFor({lat, lon, region}) {
  if (!countries) return null

  const country = locate(countries, lat, lon)
  if (!country) return null

  return {
    country: describe(country),
    region: namesSubdivision(region) ? subdivisionOf(country, lat, lon) : null,
  }
}

// The country a point falls in, as {code, name}, or null where nothing
// resolves -- open ocean, or a call made before loadBorders() has settled.
// Deliberately the same lookup the reveal outlines with, so what a hover names
// and what the globe draws around it cannot disagree.
export function countryAt(lat, lon) {
  if (!countries) return null
  const feature = locate(countries, lat, lon)
  return feature ? {code: feature.a, name: countryName(feature.n)} : null
}

// What a guess has in common with its target: 'country' for a tap inside the
// target's own country, 'continent' for one on the same continent, and null
// for anything else -- open ocean, another continent, or a guess made before
// loadBorders() has settled. The scoring floors pay for the first two.
//
// Both ends go through the polygons, the target included, so the two answers
// come from one map: a tap in Guadeloupe for a Paris target is France on both
// sides, whatever the pool calls Basse-Terre. The continent is read off the
// polygon's name, which is why game/continents lists Natural Earth's names.
export function sharedGround(guess, target) {
  const tapped = countryAt(guess.lat, guess.lon)
  const home = countryAt(target.lat, target.lon)
  if (!tapped || !home) return null
  if (tapped.code === home.code) return 'country'
  const continent = continentOf(tapped.name)
  return continent && continent === continentOf(home.name) ? 'continent' : null
}

// How far from a country's main landmass another piece of it can be and still
// be framed with it. Keeps Corsica with France and Hokkaido with Honshu, and
// leaves Guadeloupe, Hawaii, Easter Island and Svalbard to their own views.
const CLUSTER_KM = 2000

// The ground a study run opens each of a country's cities over: the country's
// largest landmass and the rest of it within CLUSTER_KM, as [west, south,
// east, north] in degrees. West may exceed east where the ground crosses the
// antimeridian, which is how Cesium's Rectangle reads it. Null before
// loadBorders() has settled or off any country.
//
// Not the feature's own box: France's runs from Guadeloupe to Réunion and
// Russia's the whole way round, so framing that would frame an ocean. And
// built from the country, not from the city, deliberately: the same view for
// every city of a country tells the player nothing about which island this
// one is on, which framing the city's own landmass would.
export function countryExtentAt(lat, lon) {
  if (!countries) return null
  const feature = locate(countries, lat, lon)
  if (!feature) return null

  const boxes = feature.p.map((polygon) => ringBox(decodeRing(polygon[0])))
  const main = boxes.reduce((a, b) => (b.area > a.area ? b : a))
  const home = center(main)
  const extent = {west: main.west, south: main.south, east: main.east, north: main.north}
  for (const box of boxes) {
    if (box === main || spanKm(home, center(box)) > CLUSTER_KM) continue
    // Measured the short way round from the main landmass, so New Zealand's
    // Chatham Islands at -176 join the South Island at 170 as 184 and not as
    // the whole world in between.
    const turn = center(box).lon - home.lon
    const shift = turn > 180 ? -360 : turn < -180 ? 360 : 0
    extent.west = Math.min(extent.west, box.west + shift)
    extent.east = Math.max(extent.east, box.east + shift)
    extent.south = Math.min(extent.south, box.south)
    extent.north = Math.max(extent.north, box.north)
  }
  // Back into -180..180. Where the ground crosses the antimeridian the east
  // edge comes round to below the west one, which is Cesium's own notation.
  const wrap = (x) => ((((x + 180) % 360) + 360) % 360) - 180
  return [wrap(extent.west), extent.south, wrap(extent.east), extent.north]
}

// A ring's bounding box, read in whichever longitude frame makes it narrower:
// a ring across the antimeridian spans 170..190 and not -180..180.
function ringBox(ring) {
  const box = (shift) => {
    let west = Infinity
    let east = -Infinity
    let south = Infinity
    let north = -Infinity
    for (let i = 0; i < ring.length; i += 2) {
      const x = shift && ring[i] < 0 ? ring[i] + 360 : ring[i]
      west = Math.min(west, x)
      east = Math.max(east, x)
      south = Math.min(south, ring[i + 1])
      north = Math.max(north, ring[i + 1])
    }
    const midLat = ((south + north) / 2) * (Math.PI / 180)
    return {
      west, east, south, north,
      area: (east - west) * Math.cos(midLat) * (north - south),
    }
  }
  const plain = box(false)
  const wrapped = box(true)
  return wrapped.east - wrapped.west < plain.east - plain.west ? wrapped : plain
}

// A box's middle, in degrees.
function center(box) {
  return {lat: (box.south + box.north) / 2, lon: (box.west + box.east) / 2}
}

// Great-circle distance between two {lat, lon} in degrees, in km.
function spanKm(p, q) {
  const rad = Math.PI / 180
  const R = 6371.0088
  const dLat = (q.lat - p.lat) * rad
  const dLon = (q.lon - p.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Decoded rings for one country, flat [lon, lat, ...] apiece. Kept apart from
// countryAt because a hover happens every time the cursor crosses a border and
// has no business decoding Canada's 412 rings to answer "which country".
export function countryRings(code) {
  const feature = countries?.find((f) => f.a === code)
  return feature ? feature.p.flat().map(decodeRing) : null
}

// Natural Earth writes a handful of names out in full. That is right for a
// data file and wrong for a line of HUD read at a glance, so the long forms
// are shortened to what the rest of the game calls them. Everything not listed
// is already the short name.
const SHORT_NAMES = new Map([
  ["People's Republic of China", 'China'],
  ['United States of America', 'United States'],
  ['Democratic Republic of the Congo', 'DR Congo'],
  ['Republic of the Congo', 'Congo'],
  ['Czech Republic', 'Czechia'],
  ['Federated States of Micronesia', 'Micronesia'],
  ['United States Virgin Islands', 'US Virgin Islands'],
])

function countryName(name) {
  return SHORT_NAMES.get(name) ?? name
}

// Natural Earth has subdivisions for every country, but the game only claims
// one for some: the reveal panel says "New York, United States" and plain
// "France". Outlining Ile-de-France under a card that says France asserts a
// division the game never made, and asserts it in the same yellow that
// elsewhere means "this is the state you were told". So the outline follows
// the label -- a subdivision is drawn exactly where one was named.
//
// In practice that is the ten countries whose places carry a state, province,
// oblast or prefecture -- the US, Canada, Mexico, Brazil, Argentina, Russia,
// China, India, Indonesia, Australia -- plus the island territories labeled
// the same way, Madeira, Svalbard, Zanzibar, Penang. Deriving it from the
// label rather than listing those keeps the two from drifting: a place
// relabeled in cities.js takes its outline with it.
function namesSubdivision(label) {
  return typeof label === 'string' && label.includes(', ')
}

function subdivisionOf(country, lat, lon) {
  const siblings = regionsByCountry?.get(country.a)
  // One subdivision means the country is its own only subdivision -- Monaco,
  // Singapore, Vatican City. Drawing it would just trace the blue line in
  // yellow.
  if (!siblings || siblings.length < 2) return null

  const region = locate(siblings, lat, lon)
  return region ? describe(region) : null
}

function describe(feature) {
  return {
    name: feature.n,
    type: feature.t ?? null,
    rings: feature.p.flat().map(decodeRing),
  }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

function locate(features, lat, lon) {
  let best = null
  let bestArea = Infinity

  for (const feature of features) {
    if (!inBox(feature.b, lat, lon, 0)) continue
    if (!contains(feature, lat, lon)) continue
    // Overlaps are real: a microstate's polygon sits inside the country
    // around it wherever that country's outline was not cut to fit. The
    // smaller feature is the specific answer, so it wins.
    const area = (feature.b[2] - feature.b[0]) * (feature.b[3] - feature.b[1])
    if (area < bestArea) {
      best = feature
      bestArea = area
    }
  }
  if (best) return best

  return nearest(features, lat, lon)
}

// Nothing contained the point, so take the closest border within
// OFFSHORE_LIMIT_KM. Distance is measured to the ring segments themselves, not
// to a centroid -- what is being forgiven is a point that fell just outside an
// edge, and Russia's centroid is 4,000 km from Kaliningrad.
function nearest(features, lat, lon) {
  const margin = OFFSHORE_LIMIT_KM / KM_PER_DEGREE
  // Longitude degrees converge with latitude; without this a point off
  // northern Greenland measures far too close to everything east and west.
  const lonScale = Math.max(Math.cos((lat * Math.PI) / 180), 0.01)

  let best = null
  let bestDistance = margin

  for (const feature of features) {
    if (!inBox(feature.b, lat, lon, margin)) continue
    for (const polygon of feature.p) {
      for (const encoded of polygon) {
        const distance = distanceToRing(decodeRing(encoded), lat, lon, lonScale)
        if (distance < bestDistance) {
          bestDistance = distance
          best = feature
        }
      }
    }
  }

  return best
}

function inBox(box, lat, lon, margin) {
  return (
    lon >= box[0] - margin &&
    lon <= box[2] + margin &&
    lat >= box[1] - margin &&
    lat <= box[3] + margin
  )
}

// First ring of a polygon is its outer boundary and the rest are holes, so a
// point inside a hole is outside the polygon.
function contains(feature, lat, lon) {
  for (const polygon of feature.p) {
    if (!inRing(decodeRing(polygon[0]), lat, lon)) continue
    let hole = false
    for (let i = 1; i < polygon.length && !hole; i++) {
      hole = inRing(decodeRing(polygon[i]), lat, lon)
    }
    if (!hole) return true
  }
  return false
}

// Even-odd crossing count. `ring` is flat [lon, lat, ...].
function inRing(ring, lat, lon) {
  let inside = false
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]
    const yi = ring[i + 1]
    const xj = ring[j]
    const yj = ring[j + 1]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// Degrees, with longitude scaled so the result is comparable to a distance.
function distanceToRing(ring, lat, lon, lonScale) {
  let best = Infinity
  for (let i = 0; i < ring.length - 2; i += 2) {
    const ax = (ring[i] - lon) * lonScale
    const ay = ring[i + 1] - lat
    const bx = (ring[i + 2] - lon) * lonScale
    const by = ring[i + 3] - lat

    const dx = bx - ax
    const dy = by - ay
    const span = dx * dx + dy * dy

    let t = span === 0 ? 0 : -(ax * dx + ay * dy) / span
    t = t < 0 ? 0 : t > 1 ? 1 : t

    const distance = Math.hypot(ax + t * dx, ay + t * dy)
    if (distance < best) best = distance
  }
  return best
}

// ---------------------------------------------------------------------------
// Decoding -- mirrors the encoder in tools/build-borders.js
// ---------------------------------------------------------------------------

// Deltas, zig-zagged and packed five bits to a character. Returns a flat
// [lon, lat, ...], which is the shape Cesium's fromDegreesArray wants anyway.
function decodeRing(text) {
  const out = []
  let at = 0
  let x = 0
  let y = 0

  while (at < text.length) {
    let shift = 0
    let bits = 0
    let byte
    do {
      byte = text.charCodeAt(at++) - 63
      bits |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    x += bits & 1 ? ~(bits >> 1) : bits >> 1

    shift = 0
    bits = 0
    do {
      byte = text.charCodeAt(at++) - 63
      bits |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    y += bits & 1 ? ~(bits >> 1) : bits >> 1

    out.push(x / PRECISION, y / PRECISION)
  }

  return out
}
