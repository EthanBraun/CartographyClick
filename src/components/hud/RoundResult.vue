<script setup>
// The footer once a guess is in: how far off, and what that paid.
import {formatKm} from './format'

defineProps({
  // {distanceKm, points, multiplier, awarded}
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
</style>
