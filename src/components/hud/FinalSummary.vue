<script setup>
// The centre panel once a run is over: the score, every round under it, and
// what to do next.
import {formatKm} from './format'

defineProps({
  studying: {type: Boolean, default: false},
  // Whole-number share of maxScore, pinned so only a flawless run reads 100.
  percent: {type: Number, required: true},
  total: {type: Number, required: true},
  maxScore: {type: Number, required: true},
  // One {distanceKm, points, awarded} per round played, in order.
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
