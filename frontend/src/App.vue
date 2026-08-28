<script setup>
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import Globe from './components/Globe.vue'
import {pickRound} from './game/cities'
import {cityCount, loadCountryIndex, studyRun} from './game/study'
import {
  GAME_MAX,
  ROUND_MAX,
  ROUND_MULTIPLIERS,
  greatCircleKm,
  roundPoints,
} from './game/scoring'

// Space and Enter both move things along -- the next city, the next game, and
// the run a selection has been built up into. F belongs to the globe and is
// never handled here.
const ADVANCE_KEYS = [' ', 'Enter']
// C for clear. A letter next to F rather than an erase key across the board,
// since picking countries is done with one hand on the mouse and the other
// where F is.
const CLEAR_KEY = 'c'
// Picking countries is a mode you hold, not a menu you open, so it gets a key
// of its own -- and one nothing else in the game wants.
const SELECT_KEY = '`'

// Two things get played: a game, which is five cities banded by how known they
// are and scored on the round multipliers, and a study run, which is every
// city the pool has for a set of countries, scored flat. They are the same
// shape on purpose -- everything from the guess down treats them identically,
// and only the two lines that build one know which is which.
function newRun(cities, kind) {
  return {kind, cities, index: 0, result: null, scored: [], over: false}
}

const run = ref(newRun(pickRound(), 'game'))
// The game set aside while countries are being picked or studied. Held as the
// object it already was, so going back to it is going back to it and not to a
// copy of what it looked like.
const held = ref(null)

const selecting = ref(false)
// Countries picked, as {code, name}. Outlives the run it starts: studying a
// set, seeing the score and studying the same set again is the whole loop, and
// it should not cost a re-pick.
const selection = ref([])
const hovered = ref(null)
// The city-to-country index is half a second of point-in-polygon, so select
// mode opens before it is ready and says so.
const indexed = ref(false)

// Bumped for every new city, restarts included. The globe clears its markers
// off this rather than off the city itself, since two games running back to
// back can legitimately draw the same city and an identity check would miss it.
const round = ref(0)
// Bumped only when a run is swapped out. The globe keeps every round's pins for
// the length of one, so it has to tell a new city from a new run -- `round`
// moves for both.
const game = ref(0)

const cities = computed(() => run.value.cities)
const city = computed(() => cities.value[run.value.index] ?? null)
const result = computed(() => run.value.result)
const revealed = computed(() => result.value !== null)
const studying = computed(() => run.value.kind === 'study')
const rounds = computed(() => cities.value.length)
// A study run is flat. The 1-1-2-3-3 weighting says which of five difficulty
// bands a city was drawn from, and one country's cities are not banded --
// weighting them would be inventing a difficulty the run does not have.
const multiplier = computed(() =>
  studying.value ? 1 : ROUND_MULTIPLIERS[run.value.index],
)
const maxScore = computed(() =>
  studying.value ? rounds.value * ROUND_MAX : GAME_MAX,
)
const total = computed(() =>
  run.value.scored.reduce((sum, entry) => sum + entry.awarded, 0),
)
// What a study run is scored out of depends on how many cities its countries
// came to, so the raw total compares a run to nothing -- not to the last run,
// not to a different set. The percentage does, which is why it is the headline
// and the total it came from is the footnote. A game needs none of this: it is
// always out of 1000, so its score is already a percentage wearing a hat.
const percent = computed(() => {
  const share = (total.value / maxScore.value) * 100
  // Both ends are pinned rather than rounded. 797 of 800 is not a perfect run
  // and must not be allowed to say it is, and 3 of 800 is not a blank one --
  // rounding reads the middle correctly and lies at exactly the two values
  // anyone would take literally. Only a run that dropped nothing shows 100,
  // and only one that scored nothing shows 0.
  if (share >= 100) return 100
  if (share <= 0) return 0
  return Math.min(99, Math.max(1, Math.round(share)))
})
// Colours the guess pin: the score itself, read as a 0-1 ramp.
const accuracy = computed(() => (result.value ? result.value.points / 100 : 1))

// All three read the index, so all three are computed off `indexed` as well --
// it is a plain module-level Map, and without that dependency a hover resolved
// before the build finished would keep reporting the zero it got then.
const hoveredCount = computed(() =>
  indexed.value && hovered.value ? cityCount(hovered.value.code) : 0,
)
const chips = computed(() =>
  indexed.value
    ? selection.value.map((country) => ({...country, count: cityCount(country.code)}))
    : [],
)
const selectedCities = computed(() =>
  chips.value.reduce((sum, chip) => sum + chip.count, 0),
)

function onGuess(guess) {
  if (revealed.value) return
  const distanceKm = greatCircleKm(guess, city.value)
  const points = roundPoints(distanceKm)
  run.value.result = {distanceKm, points, awarded: points * multiplier.value}
  run.value.scored.push(run.value.result)
}

function advance() {
  // The last city stays on screen behind the summary, so a run ends without
  // clearing the round that finished it.
  if (!revealed.value) return
  if (run.value.index >= rounds.value - 1) {
    run.value.over = true
    return
  }
  run.value.index += 1
  run.value.result = null
  round.value += 1
}

function restart() {
  swapRun(newRun(pickRound(), 'game'))
}

// Every run change goes through here: a new run means a globe with nothing of
// the old one left on it, which is what the game counter buys.
function swapRun(next) {
  game.value += 1
  run.value = next
  round.value += 1
}

// ---------------------------------------------------------------------------
// Selecting countries
// ---------------------------------------------------------------------------

function toggleSelect() {
  if (selecting.value) resumeGame()
  else enterSelect()
}

function enterSelect() {
  // Only a game is worth holding. Entering from a study run leaves whatever
  // game was already held exactly where it is -- a run is scratch work, and
  // backing out of one returns to the game it interrupted, not to it.
  if (run.value.kind === 'game') held.value = run.value
  hovered.value = null
  selecting.value = true
  loadCountryIndex()
    .then(() => {
      indexed.value = true
    })
    // No borders, no countries to point at. The panel keeps saying it is
    // reading them, which is true -- it will try again the next time the mode
    // is opened.
    .catch(() => {})
}

function resumeGame() {
  selecting.value = false
  hovered.value = null

  const paused = held.value
  held.value = null
  // Nothing was ever held, or it is already the run on screen: select mode was
  // opened and closed over the top of a game, which is the cheap case -- the
  // globe kept everything and there is nothing to put back.
  if (!paused || paused === run.value) return

  // A study run has used the globe since, so what is standing on it belongs to
  // that run. Swapping clears it. The held game keeps its city and its score
  // exactly; the pins it had already put down do not come back, which is the
  // one thing the two modes sharing a globe costs.
  swapRun(paused)
}

function startStudy() {
  if (!selectedCities.value) return
  selecting.value = false
  hovered.value = null
  swapRun(newRun(studyRun(selection.value.map((country) => country.code)), 'study'))
}

function onHover(country) {
  hovered.value = country
}

// Starting over on a set, without leaving the mode and without unpicking a
// dozen countries one at a time.
function clearSelection() {
  selection.value = []
}

function onToggle(country) {
  // A country the pool has nothing for cannot be studied, and letting it into
  // the list would buy an empty chip and a run that skips it. The hover line
  // has already said as much.
  if (!indexed.value || !cityCount(country.code)) return
  const picked = selection.value.some((other) => other.code === country.code)
  selection.value = picked
    ? selection.value.filter((other) => other.code !== country.code)
    : [...selection.value, country]
}

// ---------------------------------------------------------------------------

function onKeyDown(event) {
  if (event.key === SELECT_KEY) {
    event.preventDefault()
    return toggleSelect()
  }
  if (selecting.value) return onSelectKey(event)
  if (run.value.over) return onSummaryKey(event)
  // Before a guess is in, space does nothing — it must not skip a city.
  if (!revealed.value || !ADVANCE_KEYS.includes(event.key)) return
  event.preventDefault()
  advance()
}

function onSelectKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    return resumeGame()
  }
  if (event.key.toLowerCase() === CLEAR_KEY) {
    event.preventDefault()
    return clearSelection()
  }
  if (!ADVANCE_KEYS.includes(event.key)) return
  event.preventDefault()
  startStudy()
}

// A game ends one way -- play another. A study run ends three, because all
// three are things you would want next: the same countries again, a different
// set, or out. The panel lists all three rather than making anyone guess.
function onSummaryKey(event) {
  if (ADVANCE_KEYS.includes(event.key)) {
    event.preventDefault()
    return studying.value ? enterSelect() : restart()
  }
  if (!studying.value) return
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault()
    return startStudy()
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    resumeGame()
  }
}

// These get read at a glance, so trade precision for legibility as they grow:
// metre resolution is noise once you are 8,000 km out.
function formatKm(km) {
  if (km < 10) return `${km.toFixed(2)} km`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString()} km`
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="app">
    <Globe
      :accuracy="accuracy"
      :game="game"
      :revealed="revealed"
      :round="round"
      :selected="selection.map((country) => country.code)"
      :selecting="selecting"
      :target="city"
      @guess="onGuess"
      @hover="onHover"
      @toggle="onToggle"
    />

    <div class="hud">
      <header v-if="selecting" class="panel prompt picker">
        <div class="meta">study a country</div>

        <div class="hovered">
          <template v-if="!indexed">reading borders&hellip;</template>
          <template v-else-if="!hovered">point at a country</template>
          <template v-else>
            {{ hovered.name }}
            <span class="hovered-count" :class="{none: !hoveredCount}">
              {{ hoveredCount ? `${hoveredCount} cities` : 'no cities in the pool' }}
            </span>
          </template>
        </div>

        <div v-if="chips.length" class="chips">
          <span v-for="chip in chips" :key="chip.code" class="chip">
            {{ chip.name }}<span class="chip-count">{{ chip.count }}</span>
          </span>
        </div>
        <div v-else class="chips-empty">nothing picked yet</div>

        <div class="hint">
          <kbd>F</kbd> toggle &middot;
          <kbd>space</kbd>
          <template v-if="selectedCities">study {{ selectedCities }} cities</template>
          <template v-else>study</template>
          <template v-if="chips.length"> &middot; <kbd>C</kbd> clear</template>
          &middot; <kbd>`</kbd> back to the game
        </div>
      </header>

      <header v-else-if="city" class="panel prompt">
        <div class="meta">
          <template v-if="studying">
            city {{ run.index + 1 }} of {{ rounds }}
            <span class="tag">study</span>
          </template>
          <template v-else>
            round {{ run.index + 1 }} of {{ rounds }}
            <span class="multiplier">&times;{{ multiplier }}</span>
          </template>
        </div>
        <h1 class="city">{{ city.name }}</h1>
        <div class="country">{{ city.region }}</div>
        <div v-if="city.note" class="note">{{ city.note }}</div>
      </header>

      <div v-if="!selecting" class="tally">
        <span class="tally-score">{{ total }}</span>
        <span class="tally-max">/ {{ maxScore }}</span>
      </div>

      <footer v-if="selecting" class="panel aim">
        the globe is the picker &mdash; hover a country and take it with
        <kbd>F</kbd>
      </footer>

      <footer v-else-if="!revealed" class="panel aim">
        aim at {{ city.name }} and press <kbd>F</kbd>
        <div class="aside"><kbd>`</kbd> study a country instead</div>
      </footer>

      <footer v-else-if="!run.over" class="panel result">
        <div class="row">
          <span class="label">off by</span>
          <span class="value">{{ formatKm(result.distanceKm) }}</span>
        </div>
        <div class="row">
          <span class="label">points</span>
          <span class="value">
            {{ result.points }}
            <template v-if="multiplier > 1">
              <span class="dim">&times;{{ multiplier }} =</span>
              {{ result.awarded }}
            </template>
          </span>
        </div>
        <div class="hint">
          <kbd>space</kbd> for the next city
        </div>
      </footer>

      <div v-if="run.over && !selecting" class="panel final" :class="{long: studying}">
        <div class="final-label">{{ studying ? 'study run' : 'final score' }}</div>
        <div class="final-score">
          <template v-if="studying">{{ percent }}<span class="final-max">%</span></template>
          <template v-else>{{ total }}<span class="final-max">/ {{ maxScore }}</span></template>
        </div>
        <div v-if="studying" class="final-raw">{{ total }} / {{ maxScore }}</div>
        <ol class="breakdown">
          <li v-for="(entry, i) in run.scored" :key="i">
            <span class="breakdown-city">{{ cities[i].name }}</span>
            <span class="breakdown-distance">{{ formatKm(entry.distanceKm) }}</span>
            <span class="breakdown-points">{{ entry.awarded }}</span>
          </li>
        </ol>
        <div v-if="studying" class="hint">
          <kbd>space</kbd> change countries &middot;
          <kbd>R</kbd> run it again &middot;
          <kbd>esc</kbd> back to the game
        </div>
        <div v-else class="hint"><kbd>space</kbd> to play again</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  height: 100%;
}

/* The globe owns every drag, click and wheel event underneath, so nothing in
   the HUD may intercept them. */
.hud {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.panel {
  padding: 12px 18px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.6);
}

kbd {
  padding: 1px 5px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 4px;
  font: inherit;
  font-size: 0.9em;
}

/* --- the ask ------------------------------------------------------------- */

/* The ask rides over whatever imagery the round happens to land on, and a
   text-shadow alone loses to snow, salt flats and cloud. It takes the same
   panel as the footers instead -- the two are read in the same glance, so
   backing only one of them would read as an accident. */
.prompt {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
}

.meta {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9aa;
}

.multiplier {
  margin-left: 6px;
  color: #e8c46a;
}

.city {
  margin: 2px 0 0;
  font-size: 34px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.country {
  font-size: 14px;
  color: #9aa;
}

/* Sovereignty footnote for places that aren't countries. Dimmer than the map
   label above it, because it explains the answer rather than being it. */
.note {
  margin-top: 1px;
  font-size: 11px;
  font-style: italic;
  color: #7b8a8a;
}

/* --- running total ------------------------------------------------------- */

.tally {
  position: absolute;
  top: 18px;
  right: 18px;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
}

.tally-score {
  font-size: 28px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tally-max {
  margin-left: 3px;
  font-size: 14px;
  color: #9aa;
}

/* --- round outcome ------------------------------------------------------- */

.aim,
.result {
  position: absolute;
  bottom: 26px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
}

.aim {
  color: #cdd;
  font-size: 14px;
}

.result {
  min-width: 230px;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 22px;
  font-size: 15px;
  line-height: 1.7;
}

.label {
  color: #9aa;
}

.value {
  font-variant-numeric: tabular-nums;
}

.dim {
  color: #9aa;
}

.hint {
  margin-top: 8px;
  font-size: 12px;
  color: #8a9;
}

/* --- game over ----------------------------------------------------------- */

.final {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-width: 300px;
  padding: 22px 26px;
  text-align: center;
  background: rgba(0, 0, 0, 0.78);
}

.final-label {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9aa;
}

.final-score {
  font-size: 46px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.final-max {
  margin-left: 4px;
  font-size: 16px;
  font-weight: 400;
  color: #9aa;
}

/* The points behind the percentage above. Kept because the breakdown under it
   is in points and the two should add up, but muted -- it is the working, not
   the answer. */
.final-raw {
  margin-top: 2px;
  font-size: 13px;
  color: #9aa;
  font-variant-numeric: tabular-nums;
}

.breakdown {
  margin: 14px 0 4px;
  padding: 0;
  list-style: none;
  font-size: 14px;
}

.breakdown li {
  display: grid;
  grid-template-columns: 1fr auto 52px;
  gap: 14px;
  padding: 3px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.breakdown-city {
  text-align: left;
}

.breakdown-distance {
  color: #9aa;
  font-variant-numeric: tabular-nums;
}

.breakdown-points {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* --- picking countries --------------------------------------------------- */

/* Wider than the round prompt because it holds a list that grows, and capped
   so a long selection wraps into lines rather than pushing the panel off both
   edges of the screen. */
.picker {
  width: min(640px, calc(100vw - 32px));
}

.hovered {
  margin: 3px 0 1px;
  font-size: 22px;
  font-weight: 600;
}

/* The count is the whole reason to hover a country, so it reads as part of the
   name rather than as a footnote under it. */
.hovered-count {
  margin-left: 8px;
  font-size: 13px;
  font-weight: 400;
  color: #e8c46a;
}

.hovered-count.none {
  color: #7b8a8a;
  font-style: italic;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin: 8px 0 2px;
}

/* Gold to match the outline a selected country is drawn in on the globe: the
   chip and the border are the same fact, and picking one up should be enough
   to recognise the other. */
.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 9px;
  border: 1px solid rgba(232, 196, 106, 0.45);
  border-radius: 999px;
  font-size: 13px;
  color: #f0dca8;
}

.chip-count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: #9aa;
}

.chips-empty {
  margin: 8px 0 2px;
  font-size: 13px;
  font-style: italic;
  color: #7b8a8a;
}

/* Says what mode you are in where the multiplier sits in a game, since the two
   are the same question -- how is this city being scored. */
.tag {
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 3px;
  background: rgba(232, 196, 106, 0.16);
  color: #e8c46a;
}

/* The one hint that has to be visible without being asked for: a mode on a key
   nobody presses by accident is a mode nobody finds. */
.aside {
  margin-top: 5px;
  font-size: 12px;
  color: #8a9;
}

/* A study run can be thirty cities, and the breakdown lists all of them.
   Scrolling it is worth a panel that takes the mouse -- the globe underneath
   has nothing left to do by then. */
.final.long {
  max-height: 70vh;
  overflow-y: auto;
  pointer-events: auto;
}
</style>
