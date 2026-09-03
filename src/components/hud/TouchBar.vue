<script setup>
// The keys, as buttons, for a screen with no keyboard: one row along the
// bottom, within reach of a thumb, holding exactly what the key hints would
// have listed for the same moment of the game. The parent shows this in place
// of those hints; it is the one place a touch can act, the way onKeyDown in
// App.vue is the one place a key can.
defineProps({
  selecting: {type: Boolean, default: false},
  revealed: {type: Boolean, default: false},
  over: {type: Boolean, default: false},
  studying: {type: Boolean, default: false},
  // Select mode: the country under the crosshair, as {code, name} or null,
  // how many cities the pool has for it, and whether it is already picked.
  hovered: {type: Object, default: null},
  hoveredCount: {type: Number, default: 0},
  picked: {type: Boolean, default: false},
  // Cities across the whole selection, and how many countries are in it.
  selectedCities: {type: Number, default: 0},
  chips: {type: Number, default: 0},
})

// Each button names the thing it does rather than the key it stands in for,
// so the parent maps them straight onto the functions the keys call.
defineEmits(['commit', 'advance', 'restart', 'select', 'study', 'back', 'clear'])
</script>

<template>
  <nav class="bar">
    <template v-if="selecting">
      <button
        class="primary"
        :disabled="!hovered || !hoveredCount"
        @click="$emit('commit')"
      >
        <template v-if="!hovered">take a country</template>
        <template v-else-if="picked">remove {{ hovered.name }}</template>
        <template v-else>take {{ hovered.name }}</template>
      </button>
      <button :disabled="!selectedCities" @click="$emit('study')">
        study<template v-if="selectedCities"> {{ selectedCities }} cities</template>
      </button>
      <button v-if="chips" @click="$emit('clear')">clear</button>
      <button @click="$emit('back')">back to the game</button>
    </template>

    <template v-else-if="over">
      <template v-if="studying">
        <button class="primary" @click="$emit('select')">change countries</button>
        <button @click="$emit('study')">run it again</button>
        <button @click="$emit('back')">back to the game</button>
      </template>
      <button v-else class="primary" @click="$emit('restart')">play again</button>
    </template>

    <button v-else-if="revealed" class="primary" @click="$emit('advance')">
      next city
    </button>

    <template v-else>
      <button class="primary" @click="$emit('commit')">drop the pin</button>
      <button @click="$emit('select')">study a country</button>
    </template>
  </nav>
</template>

<style scoped>
/* Sits above the phone's home indicator, where there is one. */
.bar {
  position: absolute;
  right: 12px;
  bottom: calc(14px + env(safe-area-inset-bottom));
  left: 12px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

/* The HUD lets everything through to the globe; the buttons are the one
   exception. touch-action stops a quick second tap from zooming the page. */
.bar button {
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  color: #eee;
  font: inherit;
  font-size: 15px;
  pointer-events: auto;
  touch-action: manipulation;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.bar button:active {
  background: rgba(255, 255, 255, 0.25);
}

.bar button:disabled {
  opacity: 0.45;
}

/* The one thing the moment is mostly for -- the drop, the next city -- reads
   a step brighter than the rest of the row. */
.bar .primary {
  border-color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-weight: 600;
}

.bar .primary:active {
  background: rgba(255, 255, 255, 0.32);
}
</style>
