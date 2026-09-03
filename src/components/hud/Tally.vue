<script setup>
// Running total, top right.
defineProps({
  total: {type: Number, required: true},
  maxScore: {type: Number, required: true},
})
</script>

<template>
  <div class="tally">
    <span class="tally-score">{{ total }}</span>
    <span class="tally-max">/ {{ maxScore }}</span>
  </div>
</template>

<style scoped>
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
</style>
