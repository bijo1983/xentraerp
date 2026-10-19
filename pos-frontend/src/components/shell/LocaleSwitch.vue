<script setup lang="ts">
import { LOCALES, t } from '@/lib/i18n'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <label class="lsw">
    <span class="x-sr-only">{{ t('shell.language') }}</span>
    <select :value="ui.locale" :aria-label="t('shell.language')" @change="ui.setLocale(($event.target as HTMLSelectElement).value as 'en' | 'ar')">
      <option v-for="l in LOCALES" :key="l.code" :value="l.code" :lang="l.code">{{ l.label }}</option>
    </select>
  </label>
</template>

<style scoped>
.lsw select { min-height: 40px; border-radius: var(--x-radius-full); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); padding: 0 var(--x-space-3); font: inherit; font-size: var(--x-text-sm); }
</style>
