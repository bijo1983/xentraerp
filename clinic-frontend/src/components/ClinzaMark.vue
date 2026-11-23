<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 32 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" role="img" aria-label="CLINZA">
    <defs>
      <linearGradient id="clinza-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2563eb" />
        <stop offset="1" stop-color="#4f46e5" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="16" fill="url(#clinza-g)" />
    <path d="M27 14h10v13h13v10H37v13H27V37H14V27h13z" fill="#fff" />
  </svg>
</template>
