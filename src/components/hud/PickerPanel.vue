<script setup>
// The top panel while countries are being picked: what the cursor is on, what
// has been taken so far, and the keys.
defineProps({
  // False until the city-to-country index is built; the panel says so.
  indexed: {type: Boolean, default: false},
  // The country under the cursor, as {code, name}, or null.
  hovered: {type: Object, default: null},
  // How many cities the pool holds for it.
  hoveredCount: {type: Number, default: 0},
  // The selection, each as {code, name, count}.
  chips: {type: Array, default: () => []},
  // Cities across the whole selection.
  selectedCities: {type: Number, default: 0},
})
</script>

<template>
  <header class="panel prompt picker">
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
</template>

<style scoped>
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
   to recognize the other. */
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

/* On a phone the prompt slot is already a strip pinned to both edges, so the
   width above would fight it; and the strip reads left-aligned, so the chips
   line up with the text over them rather than centering under it. */
@media (max-width: 640px) {
  .picker {
    width: auto;
  }

  .hovered {
    font-size: 19px;
  }

  .chips {
    justify-content: flex-start;
  }
}
</style>
