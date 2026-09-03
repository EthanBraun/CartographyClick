// Builds public/borders/{countries,regions}.json, the outlines the
// reveal draws around the target's country and subdivision.
//
//   node tools/build-borders.js
//
// Source is Natural Earth 1:10m admin-0 and admin-1 (public domain), taken
// from nvkelso/natural-earth-vector. 10m rather than 50m because 50m has no
// feature at all for the small countries this game keeps asking for -- Monaco,
// Macau, Tuvalu, Nauru, Grenada -- and ships subdivisions for only nine
// countries, where 10m ships them for every one.
//
// Raw, that is 53 MB of GeoJSON. Three passes bring it to ~4 MB:
//
//   Every property but name / country code / subdivision type is dropped.
//   Natural Earth carries about 130 fields per feature, nearly all of them
//   language variants and rendering hints.
//
//   Coordinates are quantized to 1e-4 degrees (~11 m) and Douglas-Peucker'd at
//   SIMPLIFY_DEG. That tolerance is set against how close the reveal camera
//   ever gets: it frames a sphere of at least REVEAL_MIN_RADIUS, which works
//   out around 200 m per screen pixel, so a 550 m deviation is under 3 px in
//   the tightest reveal the game can produce and invisible in a normal one.
//
//   Rings are delta-encoded and packed into printable ASCII, the same scheme
//   Google's encoded polylines use. Coordinates dominate the file, and a
//   vertex costs about 4 characters this way against 18 as JSON numbers.
//
// The result loads as JSON and stays encoded until a round actually needs a
// feature -- see src/game/borders.js, which holds the matching
// decoder. Keep the two in step: PRECISION and the encoding are shared.

const fs = require('fs')
const path = require('path')

const NE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'
const SOURCES = {
  countries: 'ne_10m_admin_0_countries.geojson',
  regions: 'ne_10m_admin_1_states_provinces.geojson',
}

const OUT_DIR = path.join(__dirname, '..', 'public', 'borders')
const CACHE_DIR = path.join(__dirname, '.cache')

// 1e-4 degrees, ~11 m at the equator. Well under the source's own accuracy, so
// quantizing costs nothing and shortens every delta.
const PRECISION = 1e4
// Douglas-Peucker tolerance, in degrees. ~550 m.
const SIMPLIFY_DEG = 0.005
// Rings smaller than this across are left alone: a 2 km islet has no detail to
// spare, and for Tuvalu or Nauru that islet *is* the border being drawn.
const SMALL_RING_DEG = 0.05

// ---------------------------------------------------------------------------

async function fetchSource(file) {
  const cached = path.join(CACHE_DIR, file)
  if (fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, 'utf8'))

  process.stderr.write(`fetching ${file}\n`)
  const res = await fetch(`${NE}/${file}`)
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  const text = await res.text()
  fs.mkdirSync(CACHE_DIR, {recursive: true})
  fs.writeFileSync(cached, text)
  return JSON.parse(text)
}

// Standard Douglas-Peucker, distance measured in raw degrees. Longitude
// degrees shrink towards the poles, so this simplifies high-latitude coasts a
// little harder than equatorial ones -- which is the right way round, since
// those are also the ones drawn at the most exaggerated size.
function simplify(points, tolerance) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [from, to] = stack.pop()
    if (to - from < 2) continue

    const ax = points[from][0]
    const ay = points[from][1]
    const dx = points[to][0] - ax
    const dy = points[to][1] - ay
    const span = dx * dx + dy * dy

    let worst = -1
    let at = -1
    for (let i = from + 1; i < to; i++) {
      const px = points[i][0]
      const py = points[i][1]
      let distance
      if (span === 0) {
        distance = Math.hypot(px - ax, py - ay)
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / span
        t = t < 0 ? 0 : t > 1 ? 1 : t
        distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      }
      if (distance > worst) {
        worst = distance
        at = i
      }
    }

    if (worst > tolerance) {
      keep[at] = 1
      stack.push([from, at], [at, to])
    }
  }

  return points.filter((_, i) => keep[i])
}

// Quantize, drop points the grid has collapsed onto their neighbor, then
// simplify. Collapsing first matters: Cesium rejects a polyline with repeated
// consecutive positions, and rounding is what creates them.
function prepareRing(ring) {
  const grid = []
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * PRECISION) / PRECISION
    const y = Math.round(lat * PRECISION) / PRECISION
    const last = grid[grid.length - 1]
    if (last && last[0] === x && last[1] === y) continue
    grid.push([x, y])
  }
  if (grid.length < 4) return null

  let minX = 180
  let minY = 90
  let maxX = -180
  let maxY = -90
  for (const [x, y] of grid) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const small = Math.max(maxX - minX, maxY - minY) < SMALL_RING_DEG
  const thinned = small ? grid : simplify(grid, SIMPLIFY_DEG)
  return thinned.length >= 4 ? thinned : grid
}

// Zig-zag the delta so negatives stay short, then emit it five bits at a time,
// low bits first, with 0x20 flagging "another chunk follows" and +63 lifting
// every byte into printable ASCII that JSON never has to escape.
function encodeValue(delta) {
  let n = delta < 0 ? ~(delta << 1) : delta << 1
  let out = ''
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
    n >>= 5
  }
  return out + String.fromCharCode(n + 63)
}

function encodeRing(ring) {
  let out = ''
  let x = 0
  let y = 0
  for (const point of ring) {
    const nx = Math.round(point[0] * PRECISION)
    const ny = Math.round(point[1] * PRECISION)
    out += encodeValue(nx - x) + encodeValue(ny - y)
    x = nx
    y = ny
  }
  return out
}

// A feature becomes {b: bounding box, p: [polygon, ...]}, where a polygon is
// [outer ring, hole, ...] and a ring is one encoded string. The box is what
// lookup filters on, so nothing has to be decoded until a round wants it.
function encodeFeature(geometry) {
  if (!geometry) return null
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates

  const out = []
  let minX = 180
  let minY = 90
  let maxX = -180
  let maxY = -90

  for (const polygon of polygons) {
    const rings = []
    for (const ring of polygon) {
      const prepared = prepareRing(ring)
      if (!prepared) continue
      rings.push(encodeRing(prepared))
      for (const [x, y] of prepared) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    if (rings.length) out.push(rings)
  }

  if (!out.length) return null
  return {b: [minX, minY, maxX, maxY], p: out}
}

// Natural Earth is inconsistent about field case between layers, so read each
// name through its list of spellings.
function firstOf(properties, ...keys) {
  for (const key of keys) {
    const value = properties[key]
    if (value != null && value !== '') return value
  }
  return null
}

// Natural Earth ships a handful of admin-0 features that are a legal status
// rather than a place: land one state leases from another, and the strip
// between two ceasefire lines. A city standing on one is not "in" it the way it
// is in a country -- Guantanamo Bay is in Cuba, Nicosia is in Cyprus -- but
// each is the smallest feature containing the point, and the lookup takes the
// smallest. Dropping them here is what lets it answer with the country.
function isPlace(p) {
  const name = String(firstOf(p, 'NAME_EN', 'NAME', 'name') ?? '')
  // Baikonur and Guantanamo Bay. Both record their landlord as sovereign.
  if (firstOf(p, 'TYPE', 'type') === 'Lease') return false
  // The UN buffer zone across Cyprus, which Nicosia sits astride.
  if (/buffer zone/i.test(name)) return false
  return true
}

// A hole in a country is there to make room for another one -- Lesotho inside
// South Africa, San Marino inside Italy. Dropping the features above leaves
// some holes with nothing left to make room for, and a hole with nothing in it
// is a stray ring drawn across a country that also swallows every point landing
// inside it. Those get filled back in.
//
// Only those, though: the test is "was this hole made for a feature we just
// dropped", not "is anything inside it now". The second question gets Madha
// wrong -- an Omani exclave in the UAE which itself contains Nahwa, a UAE
// counter-exclave -- because a point in Nahwa is inside no feature but the UAE
// that owns the hole, and the hole would be filled over a real border.
function withoutOrphanHoles(feature, dropped) {
  const geometry = feature.geometry
  if (!geometry) return geometry
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates

  let filled = 0
  const out = polygons.map((polygon) => {
    const rings = [polygon[0]]
    for (let i = 1; i < polygon.length; i++) {
      if (vacated(polygon[i], dropped)) filled++
      else rings.push(polygon[i])
    }
    return rings
  })
  if (!filled) return geometry

  process.stderr.write(
    `  filled ${filled} orphan hole(s) in ${firstOf(feature.properties, 'NAME_EN', 'NAME')}
`,
  )
  return geometry.type === 'Polygon'
    ? {type: 'Polygon', coordinates: out[0]}
    : {type: 'MultiPolygon', coordinates: out}
}

// Was this hole cut for one of the features that just got dropped?
function vacated(ring, dropped) {
  const point = interiorPoint(ring)
  // A ring whose average falls outside itself is too odd to judge; leave it be.
  if (!point) return false
  return dropped.some((f) => containsPoint(f.geometry, point[0], point[1]))
}

// The average of a ring's vertices, which for these roughly convex holes lands
// inside. Verified rather than assumed, since a crescent's would not.
function interiorPoint(ring) {
  // GeoJSON repeats the first vertex as the last; leave it out of the average.
  const n = ring.length - 1
  if (n < 3) return null
  let x = 0
  let y = 0
  for (let i = 0; i < n; i++) {
    x += ring[i][0]
    y += ring[i][1]
  }
  x /= n
  y /= n
  return inRing(ring, x, y) ? [x, y] : null
}

function containsPoint(geometry, x, y) {
  if (!geometry) return false
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const polygon of polygons) {
    if (!inRing(polygon[0], x, y)) continue
    let hole = false
    for (let i = 1; i < polygon.length && !hole; i++) {
      hole = inRing(polygon[i], x, y)
    }
    if (!hole) return true
  }
  return false
}

// Even-odd crossing count, on [lon, lat] pairs.
function inRing(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

async function build(file, describe, {keep = () => true, mendHoles = false} = {}) {
  const source = await fetchSource(file)
  const kept = source.features.filter((f) => keep(f.properties))
  const dropped = source.features.filter((f) => !keep(f.properties))
  if (dropped.length) {
    const names = dropped.map((f) => firstOf(f.properties, 'NAME_EN', 'NAME', 'name'))
    process.stderr.write(`  dropped from ${file}: ${names.join(', ')}
`)
  }

  const features = []
  for (const feature of kept) {
    const geometry = encodeFeature(
      mendHoles ? withoutOrphanHoles(feature, dropped) : feature.geometry,
    )
    if (!geometry) continue
    features.push({...describe(feature.properties), ...geometry})
  }
  return features
}

async function main() {
  const countries = await build(
    SOURCES.countries,
    (p) => ({
      n: firstOf(p, 'NAME_EN', 'NAME', 'name'),
      // ISO 3166-1 alpha-3, which is how a subdivision names its country.
      a: firstOf(p, 'ADM0_A3', 'adm0_a3'),
    }),
    {keep: isPlace, mendHoles: true},
  )

  const shipped = new Set(countries.map((c) => c.a))
  const regions = await build(
    SOURCES.regions,
    (p) => ({
      n: firstOf(p, 'name_en', 'name'),
      a: firstOf(p, 'adm0_a3'),
      // "State", "Province", "Oblast" -- shown next to the subdivision's name.
      t: firstOf(p, 'type_en', 'type'),
    }),
    // Subdivisions are only ever reached through their country, so one whose
    // country is no longer shipped can never be looked up.
    {keep: (p) => shipped.has(firstOf(p, 'adm0_a3'))},
  )

  fs.mkdirSync(OUT_DIR, {recursive: true})
  for (const [name, features] of [
    ['countries', countries],
    ['regions', regions],
  ]) {
    const target = path.join(OUT_DIR, `${name}.json`)
    fs.writeFileSync(target, JSON.stringify(features))
    const mb = (fs.statSync(target).size / 1e6).toFixed(2)
    process.stderr.write(`${name}.json  ${features.length} features  ${mb} MB\n`)
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`)
  process.exit(1)
})
