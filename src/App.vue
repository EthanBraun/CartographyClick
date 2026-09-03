<script setup>
// The game itself: which run is being played, where it is up to, and what the
// keys do. The globe draws it and the HUD panels read it; both are told what
// they need through props and hand back events.
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import Globe from './components/Globe.vue'
import AimHint from './components/hud/AimHint.vue'
import FinalSummary from './components/hud/FinalSummary.vue'
import PickerPanel from './components/hud/PickerPanel.vue'
import RoundPrompt from './components/hud/RoundPrompt.vue'
import RoundResult from './components/hud/RoundResult.vue'
import Tally from './components/hud/Tally.vue'
import './components/hud/hud.css'
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
// Colors the guess pin: the score itself, read as a 0-1 ramp.
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
  // The multiplier is kept on the entry rather than re-derived: awarded / points
  // is undefined on a zero-point round, and the summary shows it either way.
  const m = multiplier.value
  run.value.result = {distanceKm, points, multiplier: m, awarded: points * m}
  run.value.scored.push(run.value.result)
}

function advance() {
  // The last round stays on the globe behind the summary, so a run ends
  // without clearing it; the globe pulls out and turns instead, off `over`.
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

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="app">
    <Globe
      :accuracy="accuracy"
      :game="game"
      :over="run.over"
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
      <PickerPanel
        v-if="selecting"
        :chips="chips"
        :hovered="hovered"
        :hovered-count="hoveredCount"
        :indexed="indexed"
        :selected-cities="selectedCities"
      />
      <RoundPrompt
        v-else-if="city"
        :city="city"
        :index="run.index"
        :multiplier="multiplier"
        :rounds="rounds"
        :studying="studying"
      />

      <Tally v-if="!selecting" :max-score="maxScore" :total="total" />

      <AimHint v-if="selecting || !revealed" :city="city" :selecting="selecting" />
      <RoundResult v-else-if="!run.over" :multiplier="multiplier" :result="result" />

      <FinalSummary
        v-if="run.over && !selecting"
        :cities="cities"
        :max-score="maxScore"
        :percent="percent"
        :scored="run.scored"
        :studying="studying"
        :total="total"
      />
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
</style>
