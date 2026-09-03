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

/* On a phone the prompt is a strip across the top, and the total sits in its
   corner on the line the round number is on. The offsets are the strip's
   own (12px in from the edge, 10px of padding) plus a little, and the
   strip's first line keeps 96px clear for it: see .meta in hud.css. */
@media (max-width: 640px) {
  .tally {
    top: 21px;
    right: 26px;
    text-shadow: none;
  }

  .tally-score {
    font-size: 17px;
  }

  .tally-max {
    font-size: 12px;
  }
}
</style>
