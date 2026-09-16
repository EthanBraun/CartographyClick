// These get read at a glance, so trade precision for legibility as they grow:
// meter resolution is noise once you are 8,000 km out.
export function formatKm(km) {
  if (km < 10) return `${km.toFixed(2)} km`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString()} km`
}

// "1 city", "12 cities": the count with its noun, for the picker's readouts.
export function formatCities(count) {
  return `${count} ${count === 1 ? 'city' : 'cities'}`
}
