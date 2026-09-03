// These get read at a glance, so trade precision for legibility as they grow:
// metre resolution is noise once you are 8,000 km out.
export function formatKm(km) {
  if (km < 10) return `${km.toFixed(2)} km`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString()} km`
}
