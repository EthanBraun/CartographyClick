<script setup>
// The ask: which city, how far through the run, and how this one is scored.
defineProps({
  // {name, region, note?}
  city: {type: Object, required: true},
  // Zero-based position in the run.
  index: {type: Number, required: true},
  rounds: {type: Number, required: true},
  studying: {type: Boolean, default: false},
  multiplier: {type: Number, default: 1},
  // In a study run, the round this city would be asked in during a game, as
  // {round, multiplier}. Null in a game.
  tier: {type: Object, default: null},
})
</script>

<template>
  <header class="panel prompt">
    <div class="meta">
      <template v-if="studying">
        city {{ index + 1 }} of {{ rounds }}
        <span class="tag study">study</span>
        <span v-if="tier" class="tag tier" :class="'mult-' + tier.multiplier">
          round {{ tier.round }}
        </span>
      </template>
      <template v-else>
        round {{ index + 1 }} of {{ rounds }}
        <span class="multiplier" :class="'mult-' + multiplier">&times;{{ multiplier }}</span>
      </template>
    </div>
    <h1 class="city">{{ city.name }}</h1>
    <div class="country">{{ city.region }}</div>
    <div v-if="city.note" class="note">{{ city.note }}</div>
  </header>
</template>

<style scoped>
.multiplier {
  margin-left: 6px;
}

/* Says what mode you are in where the multiplier sits in a game, since the two
   are the same question -- how is this city being scored. The round chip
   beside it is hud.css's .tier. */
.tag {
  margin-left: 6px;
}

.study {
  padding: 0 5px;
  border-radius: 3px;
  background: rgba(232, 196, 106, 0.16);
  color: #e8c46a;
}

.city {
  margin: 2px 0 0;
  font-size: 34px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.country {
  font-size: 14px;
  color: #9aa;
}

/* Sovereignty footnote for places that aren't countries. Dimmer than the map
   label above it, because it explains the answer rather than being it. */
.note {
  margin-top: 1px;
  font-size: 11px;
  font-style: italic;
  color: #7b8a8a;
}

/* The pool has names 26 characters long; at 34px one of those is wider than
   a phone. This size puts the longest on two lines and most on one. */
@media (max-width: 640px) {
  .city {
    font-size: 24px;
    line-height: 1.2;
  }

  .country {
    font-size: 13px;
  }
}
</style>
