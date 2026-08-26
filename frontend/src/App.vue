<script setup>
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import Globe from './components/Globe.vue'
import {ROUNDS_PER_GAME, pickRound} from './game/cities'
import {
  GAME_MAX,
  ROUND_MULTIPLIERS,
  greatCircleKm,
  roundPoints,
} from './game/scoring'

// Space and Enter both move things along. F belongs to the globe and is never
// handled here.
const ADVANCE_KEYS = [' ', 'Enter']

const cities = ref(pickRound())
const index = ref(0)
// This round's outcome, or null while the guess is still open.
const result = ref(null)
const scored = ref([])
const over = ref(false)
// Bumped for every new city, restarts included. The globe clears its markers
// off this rather than off the city itself, since two games running back to
// back can legitimately draw the same city and an identity check would miss it.
const round = ref(0)
// Bumped only on a restart. The globe keeps every round's pins for the length
// of a game, so it has to tell a new city from a new game -- `round` moves for
// both.
const game = ref(0)

const city = computed(() => cities.value[index.value])
const revealed = computed(() => result.value !== null)
const multiplier = computed(() => ROUND_MULTIPLIERS[index.value])
const total = computed(() => scored.value.reduce((sum, r) => sum + r.awarded, 0))
// Colours the guess pin: the score itself, read as a 0-1 ramp.
const accuracy = computed(() => (result.value ? result.value.points / 100 : 1))

function onGuess(guess) {
  if (revealed.value) return
  const distanceKm = greatCircleKm(guess, city.value)
  const points = roundPoints(distanceKm)
  result.value = {distanceKm, points, awarded: points * multiplier.value}
  scored.value.push(result.value)
}

function advance() {
  // The last city stays on screen behind the summary, so the game ends without
  // clearing the round that finished it.
  if (over.value) return restart()
  if (!revealed.value) return
  if (index.value >= ROUNDS_PER_GAME - 1) {
    over.value = true
    return
  }
  index.value += 1
  result.value = null
  round.value += 1
}

function restart() {
  game.value += 1
  cities.value = pickRound()
  index.value = 0
  result.value = null
  scored.value = []
  over.value = false
  round.value += 1
}

function onKeyDown(event) {
  if (!ADVANCE_KEYS.includes(event.key)) return
  // Before a guess is in, space does nothing — it must not skip a city.
  if (!revealed.value) return
  event.preventDefault()
  advance()
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
      :target="city"
      @guess="onGuess"
    />

    <div class="hud">
      <header class="panel prompt">
        <div class="meta">
          round {{ index + 1 }} of {{ ROUNDS_PER_GAME }}
          <span class="multiplier">&times;{{ multiplier }}</span>
        </div>
        <h1 class="city">{{ city.name }}</h1>
        <div class="country">{{ city.region }}</div>
        <div v-if="city.note" class="note">{{ city.note }}</div>
      </header>

      <div class="tally">
        <span class="tally-score">{{ total }}</span>
        <span class="tally-max">/ {{ GAME_MAX }}</span>
      </div>

      <footer v-if="!revealed" class="panel aim">
        aim at {{ city.name }} and press <kbd>F</kbd>
      </footer>

      <footer v-else-if="!over" class="panel result">
        <div class="row">
          <span class="label">off by</span>
          <span class="value">{{ formatKm(result.distanceKm) }}</span>
        </div>
        <div class="row">
          <span class="label">points</span>
          <span class="value">
            {{ result.points }}
            <span class="dim">&times;{{ multiplier }} =</span>
            {{ result.awarded }}
          </span>
        </div>
        <div class="hint"><kbd>space</kbd> for the next city</div>
      </footer>

      <div v-if="over" class="panel final">
        <div class="final-label">final score</div>
        <div class="final-score">
          {{ total }}<span class="final-max">/ {{ GAME_MAX }}</span>
        </div>
        <ol class="breakdown">
          <li v-for="(entry, i) in scored" :key="i">
            <span class="breakdown-city">{{ cities[i].name }}</span>
            <span class="breakdown-distance">{{ formatKm(entry.distanceKm) }}</span>
            <span class="breakdown-points">{{ entry.awarded }}</span>
          </li>
        </ol>
        <div class="hint"><kbd>space</kbd> to play again</div>
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
</style>
