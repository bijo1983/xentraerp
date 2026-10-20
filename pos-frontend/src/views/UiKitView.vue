<script setup lang="ts">
// Development-only gallery of every design-system component (route /ui-kit, not in
// production builds). Use it to review states, themes and RTL.
import { ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useToast } from '@/composables/useToast'
import * as Ui from '@/ui'

const ui = useUiStore()
const toast = useToast()
const text = ref('')
const query = ref('')
const pin = ref('')
const chip = ref('all')
const qty = ref(1)
const branch = ref<string | null>(null)
const reg = ref<string | null>(null)
const modal = ref(false)
const confirm = ref(false)
const drawer = ref(false)
</script>

<template>
  <main class="kit">
    <h1>XentraERP POS — UI kit</h1>
    <div class="row">
      <Ui.UiButton size="sm" variant="secondary" @click="ui.setTheme(ui.theme === 'dark' ? 'light' : 'dark')">Toggle theme</Ui.UiButton>
      <Ui.UiButton size="sm" variant="secondary" @click="ui.setLocale(ui.locale === 'ar' ? 'en' : 'ar')">Toggle EN/AR</Ui.UiButton>
    </div>
    <section class="row">
      <Ui.UiButton>Primary</Ui.UiButton><Ui.UiButton variant="secondary">Secondary</Ui.UiButton><Ui.UiButton variant="ghost">Ghost</Ui.UiButton>
      <Ui.UiButton variant="danger">Danger</Ui.UiButton><Ui.UiButton loading>Loading</Ui.UiButton><Ui.UiButton disabled>Disabled</Ui.UiButton>
    </section>
    <section class="grid2">
      <Ui.UiInput v-model="text" label="Input" hint="Helpful hint" />
      <Ui.UiInput v-model="text" label="With error" error="This is required" />
      <Ui.UiPasswordInput v-model="text" label="Password" />
      <Ui.UiSearchField v-model="query" />
    </section>
    <section class="grid2">
      <div><Ui.UiPinDots :length="pin.length" /><Ui.UiNumericKeypad @digit="(d) => (pin += d)" @backspace="pin = pin.slice(0, -1)" /></div>
      <div>
        <Ui.UiCategoryChips v-model="chip" :options="[{ value: 'all', label: 'All', count: 12 }, { value: 'drinks', label: 'Drinks' }, { value: 'mains', label: 'Mains' }]" />
        <div class="row"><Ui.UiProductCard name="Karak tea" :price="0.3" currency="BHD" /><Ui.UiProductCard name="Club sandwich" :price="2.75" currency="BHD" :qty-in-cart="2" /><Ui.UiProductCard name="Water" :price="2" currency="AED" out-of-stock /></div>
        <Ui.UiQuantityControl v-model="qty" :min="1" />
      </div>
    </section>
    <section class="row">
      <Ui.UiStatusBadge tone="success">Available</Ui.UiStatusBadge><Ui.UiStatusBadge tone="warning">Reserved</Ui.UiStatusBadge>
      <Ui.UiStatusBadge tone="danger">Occupied</Ui.UiStatusBadge><Ui.UiStatusBadge tone="info">Bill requested</Ui.UiStatusBadge><Ui.UiStatusBadge>Disabled</Ui.UiStatusBadge>
    </section>
    <section class="grid2">
      <Ui.UiSummaryCard label="Gross sales" value="BHD 1,240.500" hint="Today" tone="primary" />
      <Ui.UiCard title="Totals with VAT"><Ui.UiTotals currency="BHD" :lines="[{ kind: 'subtotal', amount: 10 }, { kind: 'taxable', amount: 10 }, { kind: 'tax', rate: 10, amount: 1 }, { kind: 'gross', amount: 11 }]" /></Ui.UiCard>
    </section>
    <section class="grid2">
      <Ui.UiBranchSelector v-model="branch" :branches="[{ code: 'SEHLA', name: 'Sehla' }, { code: '1001', name: 'Seef Mall' }]" />
      <Ui.UiRegisterSelector v-model="reg" :registers="[{ name: 'Till 1', location_name: 'Sehla', currency: 'BHD' }]" />
    </section>
    <section class="row">
      <Ui.UiBanner tone="info">Info banner</Ui.UiBanner><Ui.UiBanner tone="danger" title="Offline">Selling is paused.</Ui.UiBanner>
    </section>
    <section class="grid2">
      <Ui.UiSkeleton :lines="3" /><Ui.UiEmptyState title="No orders yet" message="Open a table to start." />
      <Ui.UiErrorState kind="error" reference="A1B2C3D4E5F6" retry /><Ui.UiErrorState kind="offline" />
    </section>
    <section class="row">
      <Ui.UiButton @click="modal = true">Modal</Ui.UiButton><Ui.UiButton @click="confirm = true">Confirm</Ui.UiButton><Ui.UiButton @click="drawer = true">Drawer</Ui.UiButton>
      <Ui.UiButton @click="toast.success('Saved')">Toast</Ui.UiButton><Ui.UiButton @click="toast.error('Failed to post', 'A1B2C3')">Error toast</Ui.UiButton>
      <Ui.UiUserMenu name="Aisha Khalid" role="Cashier" :items="[{ key: 'lock', label: 'Lock screen' }, { key: 'out', label: 'Sign out', danger: true }]" />
    </section>
    <Ui.UiModal :open="modal" title="A modal" @close="modal = false">Focus is trapped; Escape closes.</Ui.UiModal>
    <Ui.UiConfirmDialog :open="confirm" title="Void this item?" message="This can't be undone." tone="danger" @confirm="confirm = false" @cancel="confirm = false" />
    <Ui.UiDrawer :open="drawer" title="A drawer" @close="drawer = false">Drawer content</Ui.UiDrawer>
    <Ui.UiToastHost />
  </main>
</template>

<style scoped>
.kit { padding: 24px; display: flex; flex-direction: column; gap: 24px; background: var(--x-bg); color: var(--x-text); min-height: 100dvh; }
.row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
</style>
