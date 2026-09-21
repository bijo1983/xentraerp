<script setup lang="ts">
import { onMounted } from 'vue'
import { hideNativeSplash } from '@/lib/native'

onMounted(() => {
  hideNativeSplash()
})
</script>

<template>
  <router-view />
</template>
