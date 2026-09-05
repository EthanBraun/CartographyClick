<script setup>
// The footer once a guess is in: how far off, and what that paid.
import {formatKm} from './format'

defineProps({
  // {distanceKm, raw, ground, points, multiplier, awarded}
  result: {type: Object, required: true},
  multiplier: {type: Number, default: 1},
})
</script>

<template>
  <footer class="panel footer result">
    <div class="row">
      <span class="label">off by</span>
      <span class="value">{{ formatKm(result.distanceKm) }}</span>
    </div>
    <!-- Only when the floor actually moved the score: a tap in the right
         country that was close anyway earned its points on distance, and
         saying "right country" under it would read as a consolation. -->
    <div v-if="result.points > result.raw" class="row">
      <span class="label">{{ result.ground === 'country' ? 'right country' : 'right continent' }}</span>
      <span class="value lift">+{{ result.points - result.raw }}</span>
    </div>
    <div class="row">
      <span class="label">points</span>
      <span class="value">
        {{ result.points }}
        <template v-if="multiplier > 1">
          <span :class="'mult-' + multiplier">&times;{{ multiplier }}</span>
          <span class="dim">=</span>
          {{ result.awarded }}
        </template>
      </span>
    </div>
    <div class="hint">
      <kbd>space</kbd> for the next city
    </div>
  </footer>
</template>

<style scoped>
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

/* The same muted green as a x1 multiplier: a tier, not a verdict. */
.lift {
  color: #9ccf8f;
}
</style>
