<script setup lang="ts">
// Shown after check-in: the token number, and a button to print the slip.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Printer } from 'lucide-vue-next'
import { tokenLabel } from '@/lib/flow'
import type { TokenTicket } from '@/lib/types'
import UiModal from '@/ui/UiModal.vue'
import UiButton from '@/ui/UiButton.vue'

const props = defineProps<{ ticket: TokenTicket | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const router = useRouter()
const href = computed(() => (props.ticket ? router.resolve({ name: 'token', params: { id: props.ticket.name }, query: { auto: '1' } }).href : '#'))

function print() {
  window.open(href.value, 'clinza-token', 'width=420,height=640')
}
</script>

<template>
  <UiModal :open="!!ticket" title="Checked in" size="sm" @close="emit('close')">
    <div v-if="ticket" class="tk">
      <div class="tk__lbl">Token</div>
      <div class="tk__num tabular">{{ tokenLabel(ticket.token) }}</div>
      <div><strong>{{ ticket.patient }}</strong> · {{ ticket.practitioner }}</div>
      <div class="small muted">{{ ticket.ahead ? `${ticket.ahead} ahead in the queue` : 'Next in the queue' }} · sent to triage</div>
    </div>
    <template #footer>
      <UiButton variant="secondary" @click="emit('close')">Done</UiButton>
      <UiButton @click="print"><Printer :size="16" /> Print token</UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.tk { text-align: center; display: flex; flex-direction: column; gap: 6px; padding: 8px 0; }
.tk__lbl { text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; font-weight: 700; color: var(--x-text-muted); }
.tk__num { font-family: var(--x-font-display); font-size: 64px; font-weight: 800; line-height: 1; color: var(--x-primary-text); }
</style>
