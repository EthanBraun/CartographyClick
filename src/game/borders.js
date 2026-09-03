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

const PRECISION = 1e4

// Roughly, at the equator. Only used to put the fallback below in units that
// mean something; the error it forgives is a coastline generalisation, not a
// measurement.
const KM_PER_DEGREE = 111.32

// Coordinates are the city's; the outline is a 1:10m generalisation of a
// coastline. Those disagree, and they disagree most for exactly the places
// this game likes: Miami, Venice, Copenhagen and Nuuk all sit in open water on
// a 1:10m map. So a point no polygon contains is given to the nearest border
// within this distance rather than dropped.
//
// Wide enough for a generalised coastline (the worst in the pool is a few km),
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
// class of thing you would expect: Goma's coordinates sit about a kilometre
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
  ['Turkish Republic of Northern Cyprus', 'Northern Cyprus'],
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
// China, India, Indonesia, Australia -- plus the island territories labelled
// the same way, Madeira, Svalbard, Zanzibar, Penang. Deriving it from the
// label rather than listing those keeps the two from drifting: a place
// relabelled in cities.js takes its outline with it.
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
