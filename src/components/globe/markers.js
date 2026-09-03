// Everything a game leaves standing on the globe: this round's guess pin,
// answer pin, tie-line and border outlines, and the rounds before it. One
// instance per viewer; the globe component drives it and owns nothing of this
// itself.

import * as Cesium from 'cesium'
import {addOutline, destroyOutline, setOutlineShown, stopFilling} from './outlines'
import {TARGET_COLOR, accuracyColor, addLink, addPin} from './pins'

// Revealing also outlines where the answer was: the country in blue, and --
// where the card names one, so the line has something to match -- the state,
// province or prefecture inside it in yellow. Both are off the accuracy ramp
// and off the answer pin's cyan, so an outline never reads as a score.
const COUNTRY_BORDER_COLOR = Cesium.Color.fromHsl(217 / 360, 0.9, 0.58, 0.95)
const REGION_BORDER_COLOR = Cesium.Color.fromHsl(48 / 360, 0.95, 0.55, 0.95)
// The subdivision sits inside the country and shares its coast, so it goes on
// thinner and on top: where the two lines coincide, the more specific one wins.
const COUNTRY_BORDER_WIDTH = 3
const REGION_BORDER_WIDTH = 2

// `accuracy` is read every frame the guess pin is on screen: 1 = dead on,
// 0 = as wrong as it gets.
export function createMarkers(viewer, accuracy) {
  let pin = null
  let targetPin = null
  let link = null
  let countryOutline = null
  let regionOutline = null
  // Pins and links from rounds already played this game. They stay put so the
  // globe accumulates the game as it goes, and the summary at the end has all
  // five guesses and answers standing on it.
  let history = []
  // The guess pin's color, fixed at the moment the answer landed. `accuracy`
  // is back to its 1 default by the time the round is cleared, so reading it
  // then would retire every guess as a perfect one.
  let settledColor = null
  // Guess site, in radians.
  let guess = null

  // Put the guess down, or move it. The pin is created once and reads `guess`
  // every frame, so a second drop walks it rather than stacking another.
  function drop(site) {
    guess = site
    if (!pin) pin = addPin(viewer, () => guess, () => accuracyColor(accuracy()))
  }

  // Put the answer on the globe: a pin on the real city, plus a geodesic back
  // to the guess. Guarded on targetPin so a re-render can't stack duplicates.
  // Returns both sites for the camera to frame, or null when there is nothing
  // to frame -- the answer is already up, or no guess was ever dropped.
  function reveal(target) {
    if (targetPin) return null

    const site = {
      longitude: Cesium.Math.toRadians(target.lon),
      latitude: Cesium.Math.toRadians(target.lat),
    }
    targetPin = addPin(viewer, () => site, () => TARGET_COLOR)
    settledColor = accuracyColor(accuracy())
    if (!guess) return null

    link = addLink(viewer, guess, site)
    return {guess, target: site}
  }

  // Outline the country the answer is in and, where there is one, the
  // subdivision within it. `outline` is what game/borders' outlineFor returns.
  function outline({country, region}) {
    if (countryOutline) return
    countryOutline = addOutline(
      viewer,
      country.rings,
      COUNTRY_BORDER_COLOR,
      COUNTRY_BORDER_WIDTH,
    )
    if (region) {
      regionOutline = addOutline(
        viewer,
        region.rings,
        REGION_BORDER_COLOR,
        REGION_BORDER_WIDTH,
      )
    }
  }

  // Hand this round's markers to the history. The guess pin has to be rebuilt:
  // its site and color are callbacks reading `guess` and `accuracy` every
  // frame, so left as it is it would walk to the next round's pin drop and
  // take that round's score for its color. The answer pin and the link are
  // already fixed and carry over untouched.
  //
  // The link goes with them on purpose. Five guesses and five answers scattered
  // over a globe say nothing about which went with which; the dashes are what
  // makes the pair readable as a round.
  function retire() {
    if (pin) {
      const site = guess
      const color = settledColor ?? accuracyColor(accuracy())
      viewer.entities.remove(pin)
      history.push(addPin(viewer, () => site, () => color))
    }
    if (targetPin) history.push(targetPin)
    if (link) history.push(link)
    pin = null
    targetPin = null
    link = null
    guess = null
    settledColor = null
  }

  // A new game: the round that just finished is thrown away with the rest of
  // the history rather than joining it.
  function clear() {
    for (const entity of [pin, targetPin, link, ...history]) {
      if (entity) viewer.entities.remove(entity)
    }
    pin = null
    targetPin = null
    link = null
    history = []
    guess = null
    settledColor = null
  }

  // The outlines go on every round change, and deliberately: a border left
  // standing is a straight edge on the next city in that country, which is the
  // one hint this game must not hand out. The pins mark where a round
  // happened; an outline would mark where the next one is.
  function clearOutlines() {
    for (const each of [countryOutline, regionOutline]) {
      if (each) destroyOutline(viewer, each)
    }
    countryOutline = null
    regionOutline = null
  }

  // Everything the game has standing on the globe, hidden for the length of
  // select mode. Hidden rather than removed: the paused game still owns these
  // and is going to want them back.
  function show(shown) {
    for (const entity of [pin, targetPin, link, ...history]) {
      if (entity) entity.show = shown
    }
    for (const each of [countryOutline, regionOutline]) {
      if (each) setOutlineShown(each, shown)
    }
  }

  // Before the viewer goes, while its postRender event is still there to
  // detach the outline fills from. The entities go down with the viewer.
  function dispose() {
    stopFilling(countryOutline)
    stopFilling(regionOutline)
  }

  return {
    drop,
    reveal,
    outline,
    retire,
    clear,
    clearOutlines,
    show,
    dispose,
    get guess() {
      return guess
    },
  }
}
