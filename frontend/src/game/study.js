// Study mode: instead of five cities banded by how famous they are, every city
// the pool holds for a set of countries, each asked once.
//
// Which country a city belongs to is answered by the same polygon lookup the
// reveal outlines with, never by reading its label. That is not a shortcut, it
// is the only way the two can agree: a country is picked by pointing at its
// outline on the globe, so the cities it hands back have to be the ones inside
// that outline. Labels could not do it anyway -- they are prose, and the pool
// says "Aberdeen, Scotland", "Unalaska, Alaska" and three different spellings
// of DR Congo. Going through the polygons folds all of that away for free.

import {countryAt, loadBorders} from './borders'
import {ALL_PLACES} from './cities'

// Placing all 618 is around half a second of point-in-polygon, which is a
// visible stall if it lands in one frame -- and it would land in the frame the
// globe is being dragged in, since that is what entering select mode looks
// like. So it goes a slice at a time, yielding between slices: the same work,
// spread thin enough that the globe keeps turning under it.
const SLICE = 20

// code -> {code, name, cities}, or null until the first build settles.
let index = null
let building = null

export function loadCountryIndex() {
  if (index) return Promise.resolve(index)
  if (!building) {
    // A failure is not cached: a dropped borders fetch should cost this attempt
    // at select mode, not every attempt for the rest of the session.
    building = build().catch((error) => {
      building = null
      throw error
    })
  }
  return building
}

async function build() {
  await loadBorders()

  const byCode = new Map()
  for (let i = 0; i < ALL_PLACES.length; i++) {
    const place = ALL_PLACES[i]
    const country = countryAt(place.lat, place.lon)
    // Nothing resolves for a place no polygon claims and no coast is near
    // enough to forgive. That is a handful of mid-ocean islands, and they are
    // simply not studiable by country -- there is no country to pick.
    if (country) {
      const entry = byCode.get(country.code)
      if (entry) entry.cities.push(place)
      else byCode.set(country.code, {...country, cities: [place]})
    }
    if (i % SLICE === SLICE - 1) await nextFrame()
  }

  index = byCode
  return index
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

// How many cities a country would contribute, for the hover readout. Zero both
// for a country the pool skips and for one asked about before the index is
// built -- the caller has the index's own readiness to tell those apart.
export function cityCount(code) {
  return index?.get(code)?.cities.length ?? 0
}

// One run over the selected countries: every city exactly once, shuffled. The
// point of the mode is to see all of them, so nothing is sampled and nothing
// is dropped for sitting too close to something else -- two cities an hour
// apart are two things worth being able to place.
export function studyRun(codes) {
  const cities = []
  for (const code of codes) {
    const entry = index?.get(code)
    if (entry) cities.push(...entry.cities)
  }
  return shuffle(cities)
}

// Fisher-Yates, on a copy: the arrays being drawn from are the index's own.
function shuffle(items) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
