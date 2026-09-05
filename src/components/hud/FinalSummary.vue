<script setup>
// The center panel once a run is over: the score, every round under it, and
// what to do next.
import {formatKm} from './format'

defineProps({
  studying: {type: Boolean, default: false},
  // Whole-number share of maxScore, pinned so only a flawless run reads 100.
  percent: {type: Number, required: true},
  total: {type: Number, required: true},
  maxScore: {type: Number, required: true},
  // One {distanceKm, raw, ground, points, multiplier, awarded} per round
  // played, in order.
  scored: {type: Array, required: true},
  // The run's cities, in the same order.
  cities: {type: Array, required: true},
})
</script>

<template>
  <div class="panel final" :class="{long: studying}">
    <div class="final-label">{{ studying ? 'study run' : 'final score' }}</div>
    <div class="final-score">
      <template v-if="studying">{{ percent }}<span class="final-max">%</span></template>
      <template v-else>{{ total }}<span class="final-max">/ {{ maxScore }}</span></template>
    </div>
    <div v-if="studying" class="final-raw">{{ total }} / {{ maxScore }}</div>
    <ol class="breakdown">
      <li v-for="(entry, i) in scored" :key="i">
        <span class="breakdown-city">
          {{ cities[i].name }}
          <span class="breakdown-region">{{ cities[i].region }}</span>
        </span>
        <span class="breakdown-distance">
          {{ formatKm(entry.distanceKm) }}
          <!-- Same test as the round footer: shown only where the floor paid. -->
          <span v-if="entry.points > entry.raw" class="breakdown-ground">
            {{ entry.ground === 'country' ? 'right country' : 'right continent' }}
          </span>
        </span>
        <!-- A study run is flat, so the working would be "82 x1" thirty times. -->
        <span v-if="!studying" class="breakdown-working">
          {{ entry.points }}<span class="mult" :class="'mult-' + entry.multiplier">&times;{{ entry.multiplier }}</span>
        </span>
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
</template>

<style scoped>
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

/* A study run can be thirty cities, and the breakdown lists all of them.
   Scrolling it is worth a panel that takes the mouse -- the globe underneath
   has nothing left to do by then. */
.final.long {
  max-height: 70vh;
  overflow-y: auto;
  pointer-events: auto;
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
  grid-template-columns: 1fr auto auto 52px;
  align-items: center;
  gap: 14px;
  padding: 3px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.breakdown-city {
  text-align: left;
}

/* The country under the name, as the prompt had it. The row is taller for it,
   which is fine at five rows and tolerable at thirty, since a study run's card
   already scrolls. Kept clear of the name's line so a long name and a long
   country -- "Simpson Bay, Sint Maarten" -- never share one. */
.breakdown-region {
  display: block;
  font-size: 12px;
  color: #9aa;
}

.breakdown-distance {
  color: #9aa;
  font-variant-numeric: tabular-nums;
}

/* Sits on the region's line, so a floored row is two lines like every other
   and the points beside it are the floored ones without saying so twice. */
.breakdown-ground {
  display: block;
  font-size: 12px;
  color: #9ccf8f;
}

/* The 0-100 score and its multiplier, so the awarded column reads as a
   product rather than a mystery. */
.breakdown-working {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.mult {
  margin-left: 3px;
}

.breakdown-points {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* On a phone the card sits well in from the edges, so it reads as a card over
   the globe and not as a sheet laid across it, and is capped so a wider
   phone gets the same card with more globe round it. Its height is what is
   left between the prompt strip above and the buttons below. Even a game's
   five rows can run past that in landscape, so every card scrolls here, not
   just a study run's, which is why it takes the pointer on a phone
   regardless. Both selectors, or the study run's own cap above would outrank
   this one. The breakdown's columns close up to fit four of them in 300px. */
@media (max-width: 640px) {
  .final,
  .final.long {
    width: min(calc(100vw - 64px), 340px);
    min-width: 0;
    max-height: calc(100vh - 200px);
    max-height: calc(100dvh - 200px);
    padding: 16px 14px;
    overflow-y: auto;
    pointer-events: auto;
    touch-action: pan-y;
  }

  .final-score {
    font-size: 40px;
  }

  .breakdown {
    font-size: 13px;
  }

  .breakdown li {
    grid-template-columns: 1fr auto auto 44px;
    gap: 8px;
  }
}
</style>
