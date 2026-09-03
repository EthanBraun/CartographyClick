<script setup>
// The keys, as buttons, for a screen with no keyboard: one row along the
// bottom, within reach of a thumb, holding exactly what the key hints would
// have listed for the same moment of the game. The parent shows this in place
// of those hints; it is the one place a touch can act, the way onKeyDown in
// App.vue is the one place a key can.
//
// Only a game is playable by touch -- study mode is not offered on a phone --
// so there are three moments, and one button for each.
defineProps({
  revealed: {type: Boolean, default: false},
  // True on the run's last city. Advancing from there brings up the score
  // rather than a city, and `over` only says so once it has happened.
  last: {type: Boolean, default: false},
  over: {type: Boolean, default: false},
})

// Each button names the thing it does rather than the key it stands in for,
// so the parent maps them straight onto the functions the keys call.
defineEmits(['commit', 'advance', 'restart'])
</script>

<template>
  <nav class="bar">
    <button v-if="over" @click="$emit('restart')">play again</button>
    <button v-else-if="revealed" @click="$emit('advance')">
      {{ last ? 'continue' : 'next city' }}
    </button>
    <button v-else @click="$emit('commit')">drop pin</button>
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
  justify-content: center;
}

/* The HUD lets everything through to the globe; the buttons are the one
   exception. touch-action stops a quick second tap from zooming the page. */
.bar button {
  min-height: 44px;
  padding: 0 22px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  pointer-events: auto;
  touch-action: manipulation;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.bar button:active {
  background: rgba(255, 255, 255, 0.32);
}
</style>
