<script setup>
// The footer before anything has been committed: what F does right now.
defineProps({
  selecting: {type: Boolean, default: false},
  // The city being aimed at. Unused while selecting.
  city: {type: Object, default: null},
})
</script>

<template>
  <footer v-if="selecting" class="panel footer aim">
    the globe is the picker &mdash; hover a country and take it with
    <kbd>F</kbd>
  </footer>

  <footer v-else class="panel footer aim">
    aim at {{ city.name }} and press <kbd>F</kbd>
    <div class="aside"><kbd>`</kbd> study a country instead</div>
  </footer>
</template>

<style scoped>
.aim {
  color: #cdd;
  font-size: calc(14px * var(--text-scale));
}

/* The one hint that has to be visible without being asked for: a mode on a key
   nobody presses by accident is a mode nobody finds. */
.aside {
  margin-top: 5px;
  font-size: calc(12px * var(--text-scale));
  color: #8a9;
}
</style>
