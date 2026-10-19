<script setup lang="ts">
import { computed } from 'vue'
import UiChoiceList from './UiChoiceList.vue'
import { t } from '@/lib/i18n'

export interface BranchOption { code: string; name: string; hint?: string }
const props = defineProps<{ modelValue: string | null; branches: BranchOption[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
const options = computed(() => props.branches.map((b) => ({ value: b.code, label: b.name, hint: b.hint || b.code, icon: '⌂' })))
</script>

<template>
  <UiChoiceList :model-value="modelValue" :options="options" :label="t('shell.branch')" @update:model-value="emit('update:modelValue', $event)" />
</template>
