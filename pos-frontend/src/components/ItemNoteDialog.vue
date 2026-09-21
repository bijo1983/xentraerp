<script setup lang="ts">
// "How would you like it?" — shown when an item is added. Suggested notes for THIS dish
// (well done, crunchy, deep fried, no onions, ...) come from the server: Claude when an
// API key is configured, otherwise a built-in list. Tap any number of them and/or type
// free text; the result is stored as the line's note and printed on the kitchen ticket.
import { ref, computed, onMounted } from 'vue'
import { api } from '@/lib/api'

const props = defineProps<{ itemCode: string; itemName: string; current: string }>()
const emit = defineEmits<{ (e: 'save', note: string): void; (e: 'cancel'): void }>()

const suggestions = ref<string[]>([])
const source = ref<string>('')
const loading = ref(true)
const chosen = ref<string[]>([])
const free = ref('')

onMounted(async () => {
  // Start from any note already on the line: known suggestions become chips, the rest is free text.
  const parts = props.current.split(',').map((p) => p.trim()).filter(Boolean)
  try {
    const r = await api.call<{ notes: string[]; source: string }>('custom_erp.api.pos_core.get_item_notes', { item_code: props.itemCode })
    suggestions.value = r.notes
    source.value = r.source
  } catch {
    suggestions.value = []
  } finally {
    loading.value = false
  }
  chosen.value = parts.filter((p) => suggestions.value.includes(p))
  free.value = parts.filter((p) => !suggestions.value.includes(p)).join(', ')
})

function toggle(n: string) {
  chosen.value = chosen.value.includes(n) ? chosen.value.filter((x) => x !== n) : [...chosen.value, n]
}
const note = computed(() => [...chosen.value, free.value.trim()].filter(Boolean).join(', ').slice(0, 140))
</script>

<template>
  <div class="modal-back" @click.self="emit('cancel')">
    <div class="modal" style="width: 460px">
      <h3 style="margin: 0 0 2px">{{ itemName }}</h3>
      <p class="sub2" style="margin: 0 0 12px">
        Any special request?
        <span v-if="source === 'AI'" class="pill ok" style="margin-left: 6px">✨ AI suggestions</span>
      </p>
      <p v-if="loading" style="color: var(--text-muted)">Loading suggestions…</p>
      <div v-else class="note-chips">
        <button v-for="n in suggestions" :key="n" class="cat-chip" :class="{ active: chosen.includes(n) }" @click="toggle(n)">{{ n }}</button>
      </div>
      <input v-model="free" class="fld" style="width: 100%; margin-top: 12px" placeholder="Or type your own note…" maxlength="100" @keyup.enter="emit('save', note)" />
      <p v-if="note" class="sub2" style="margin: 8px 0 0">Kitchen will see: <b>{{ note }}</b></p>
      <div class="row" style="margin-top: 14px">
        <button class="btn btn-ghost" style="flex: 1" @click="emit('save', current ? '' : '')">No note</button>
        <button class="btn btn-primary" style="flex: 2" @click="emit('save', note)">{{ note ? 'Add note' : 'Continue' }}</button>
      </div>
    </div>
  </div>
</template>
