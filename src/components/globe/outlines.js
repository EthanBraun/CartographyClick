// Borders as Cesium primitives: a country or subdivision outline is a handful
// of batched polyline primitives that fill in over a few frames, and can be
// recolored, hidden and torn down as a unit.

import * as Cesium from 'cesium'

// Only used where the scene can't clamp a polyline to the ground: a line laid
// exactly on the ellipsoid z-fights with it, and a few km of lift is invisible
// at the range a reveal actually gets viewed from.
export const UNCLAMPED_HEIGHT = 4000

// An outline arrives a few rings at a time (see addOutline). The first chunk is
// a single ring because that one ring is most of what there is to recognize,
// and later chunks grow by this factor so the number of batches stays
// logarithmic in the ring count -- six for Canada's 412, not 412.
const OUTLINE_FIRST_CHUNK = 1
const OUTLINE_CHUNK_GROWTH = 4

// `rings` are flat [lon, lat, ...] arrays. They go into a handful of primitives
// rather than one each: Canada's outline is 412 rings, and batching keeps that
// a few draw calls instead of 412 the scene has to walk every frame.
//
// A handful rather than one, though. A primitive draws nothing until every
// instance in it is ready, so a single batch of 412 makes the whole outline
// wait on the last islet -- which is the pause the reveal used to open with.
// Biggest ring first, the shape lands in the first chunk (that ring alone is
// 61% of Russia's line and a third of the USA's) and the islands fill in
// behind it.
//
// Each chunk waits on the one before being ready rather than on a timer, so
// the fill paces itself to the machine: quick enough and it reads as an
// instant draw, slow enough and it reads as a deliberate sweep. Either beats a
// stall. It does mean the last islet lands later than one batch would have
// managed -- that is the trade, and it buys the first ring landing far sooner.
export function addOutline(viewer, rings, color, width) {
  const clamped = Cesium.GroundPolylinePrimitive.isSupported(viewer.scene)
  // Vertex count stands in for how much of the outline a ring accounts for.
  const ordered = [...rings].sort((a, b) => b.length - a.length)
  // Color and visibility live on the outline, not only in the primitives it
  // has built so far: an outline is still filling long after it is first
  // painted, and a chunk built at that point has to come out matching what is
  // already on screen rather than the arguments this was called with.
  const outline = {primitives: [], stop: null, color, show: true}

  let drawn = 0
  let size = OUTLINE_FIRST_CHUNK

  const drawChunk = () => {
    const chunk = ordered.slice(drawn, drawn + size)
    drawn += chunk.length
    size *= OUTLINE_CHUNK_GROWTH

    const primitive = viewer.scene.primitives.add(
      buildOutline(chunk, outline.color, width, clamped),
    )
    primitive.show = outline.show
    outline.primitives.push(primitive)
    if (drawn >= ordered.length) return

    // Polled rather than awaited: readyPromise is gone in this Cesium, and
    // postRender is already where the rest of the globe watches the scene.
    outline.stop = viewer.scene.postRender.addEventListener(() => {
      if (!primitive.ready) return
      stopFilling(outline)
      drawChunk()
    })
  }

  drawChunk()
  return outline
}

// One chunk of rings, as a primitive that has not been added to the scene yet.
function buildOutline(rings, color, width, clamped) {
  const appearance = new Cesium.PolylineMaterialAppearance({
    material: Cesium.Material.fromType('Color', {color}),
  })

  const geometryInstances = rings.map(
    (ring) =>
      new Cesium.GeometryInstance({
        geometry: clamped
          ? new Cesium.GroundPolylineGeometry({
              positions: Cesium.Cartesian3.fromDegreesArray(ring),
              width,
              // A border is drawn as straight lines in lat/lon, and
              // simplification leaves the long straight ones as a single
              // segment — the US/Canada border along the 49th parallel is two
              // points. Drawn as a geodesic that segment bows some 30 km north
              // of the parallel it is supposed to be.
              arcType: Cesium.ArcType.RHUMB,
            })
          : new Cesium.PolylineGeometry({
              positions: Cesium.Cartesian3.fromDegreesArrayHeights(
                lift(ring, UNCLAMPED_HEIGHT),
              ),
              width,
              arcType: Cesium.ArcType.RHUMB,
              vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
            }),
      }),
  )

  const Outline = clamped ? Cesium.GroundPolylinePrimitive : Cesium.Primitive
  return new Outline({geometryInstances, appearance})
}

// Chunk scheduling hangs off a postRender listener, so dropping an outline has
// to take the listener with it -- otherwise the next chunk lands on the next
// round's globe. Null-safe, since it is also the last thing called on outlines
// that may never have been built.
export function stopFilling(outline) {
  if (!outline || !outline.stop) return
  outline.stop()
  outline.stop = null
}

// Repaint an outline where it stands. Cesium holds an appearance's color as a
// shader uniform, so this is one uniform write per primitive rather than a
// rebuild -- which is what makes sweeping the cursor across a continent cheap.
export function setOutlineColor(outline, color) {
  if (outline.color === color) return
  outline.color = color
  for (const primitive of outline.primitives) {
    primitive.appearance.material.uniforms.color = color
  }
}

export function setOutlineShown(outline, show) {
  if (outline.show === show) return
  outline.show = show
  for (const primitive of outline.primitives) primitive.show = show
}

// Primitives live on the scene rather than in the entity collection, so they
// need removing by hand. `remove` destroys them, which is what we want.
export function destroyOutline(viewer, outline) {
  stopFilling(outline)
  for (const primitive of outline.primitives) {
    viewer.scene.primitives.remove(primitive)
  }
}

// Flat [lon, lat, ...] to flat [lon, lat, height, ...].
function lift(ring, height) {
  const out = []
  for (let i = 0; i < ring.length; i += 2) out.push(ring[i], ring[i + 1], height)
  return out
}
