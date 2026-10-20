<script setup lang="ts">
// A product / category picture: the item's own image when it has one, otherwise a tinted
// food or retail illustration picked from its name and group (lib/itemArt.ts).
import { computed, ref, watch } from 'vue'
import { itemArt } from '@/lib/itemArt'

const props = withDefaults(defineProps<{ name: string; group?: string | null; image?: string | null; size?: number | string; rounded?: string }>(), {
  group: null,
  image: null,
  size: 34,
  rounded: 'var(--x-radius-md)',
})
const art = computed(() => itemArt(props.name, props.group))
const broken = ref(false)
watch(() => props.image, () => (broken.value = false))
</script>

<template>
  <span class="x-art" :class="`x-art--${art.tone}`" :style="{ borderRadius: rounded }" aria-hidden="true">
    <img v-if="image && !broken" :src="image" alt="" loading="lazy" decoding="async" @error="broken = true" />
    <component :is="art.icon" v-else :size="size" :stroke-width="1.6" />
  </span>
</template>

<style scoped>
.x-art { position: relative; display: grid; place-items: center; overflow: hidden; width: 100%; height: 100%; background: var(--art-bg); color: var(--art-fg); }
.x-art::after { content: ''; position: absolute; inset: 0; background: radial-gradient(120% 90% at 20% 0%, rgba(255, 255, 255, 0.55), transparent 60%); pointer-events: none; }
.x-art img { width: 100%; height: 100%; object-fit: cover; }
.x-art img + * { display: none; }
.x-art :deep(svg) { position: relative; z-index: 1; filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.08)); }
</style>
