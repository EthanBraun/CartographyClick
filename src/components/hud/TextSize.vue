<script setup>
// The one setting there is: how big the HUD's text is drawn. A gear in the
// bottom corner, level with the touch bar, that opens a row of sizes to pick
// from. Touch only -- a desktop has its browser's own zoom within reach, and
// a phone's pinch zooms the globe rather than the page.
import {onBeforeUnmount, onMounted, ref} from 'vue'

const props = defineProps({
  // The scales on offer, smallest first, and the one in use.
  scales: {type: Array, required: true},
  scale: {type: Number, required: true},
  open: {type: Boolean, default: false},
})

const emit = defineEmits(['toggle', 'pick'])

const root = ref(null)

// A tap anywhere outside puts it away, the globe included. The HUD lets
// taps through to the globe, so this is the one way to hear about them.
function onPointerDown(event) {
  if (props.open && !root.value?.contains(event.target)) emit('toggle')
}

onMounted(() => window.addEventListener('pointerdown', onPointerDown))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="text-size">
    <!-- Stays open while sizes are tried, so the prompt at the top can be
         watched changing behind it. -->
    <div v-if="open" class="panel sizes">
      <div class="sizes-label">text size</div>
      <div class="sizes-row">
        <!-- Each button is drawn at the size it picks, so the row is its own
             preview and needs no names. -->
        <button
          v-for="option in scales"
          :key="option"
          type="button"
          :class="{picked: option === scale}"
          :style="{fontSize: 16 * option + 'px'}"
          :aria-label="`text size ${Math.round(option * 100)}%`"
          @click="$emit('pick', option)"
        >
          A
        </button>
      </div>
    </div>
    <button type="button" class="gear" aria-label="settings" @click="$emit('toggle')">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.03 7.03 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7.03 7.03 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* The touch bar's row, in the corner Cesium's credits do not use. */
.text-size {
  position: absolute;
  right: 12px;
  bottom: calc(14px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

/* The touch bar's buttons, round. */
.gear,
.sizes button {
  pointer-events: auto;
  touch-action: manipulation;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.gear {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
}

.gear svg {
  width: 22px;
  height: 22px;
  fill: currentColor;
}

.gear:active,
.sizes button:active {
  background: rgba(70, 70, 70, 0.7);
}

.sizes {
  pointer-events: auto;
}

.sizes-label {
  margin-bottom: 8px;
  font-size: calc(12px * var(--text-scale));
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9aa;
}

.sizes-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.sizes button {
  width: 48px;
  height: 48px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  background: transparent;
  color: #fff;
  font-family: inherit;
  font-weight: 600;
  line-height: 1;
}

.sizes button.picked {
  border-color: #e8c46a;
  color: #e8c46a;
}
</style>
