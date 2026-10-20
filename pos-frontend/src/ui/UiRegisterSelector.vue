<script setup lang="ts">
import { Receipt } from 'lucide-vue-next'
import { computed } from 'vue'
import UiChoiceList from './UiChoiceList.vue'
import { t } from '@/lib/i18n'

export interface RegisterOption { name: string; location_name?: string | null; location?: string | null; currency?: string; company?: string }
const props = defineProps<{ modelValue: string | null; registers: RegisterOption[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
const options = computed(() =>
  props.registers.map((r) => ({ value: r.name, label: r.name, hint: [r.location_name || r.location, r.currency].filter(Boolean).join(' · '), icon: Receipt })),
)
</script>

<template>
  <UiChoiceList :model-value="modelValue" :options="options" :label="t('shell.register')" @update:model-value="emit('update:modelValue', $event)" />
</template>
