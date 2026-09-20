<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

type Step = 'tenant' | 'pin'
const step = ref<Step>('tenant')
const tenantCode = ref('')
const pin = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

const pinDots = computed(() => Array.from({ length: 6 }, (_, i) => i < pin.value.length))

async function submitTenant() {
  error.value = null
  loading.value = true
  try {
    await auth.lookupTenant(tenantCode.value.trim())
    step.value = 'pin'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not find that organization code'
  } finally {
    loading.value = false
  }
}

function digit(d: string) {
  if (pin.value.length >= 8) return
  error.value = null
  pin.value += d
}
function backspace() {
  pin.value = pin.value.slice(0, -1)
}
function backToTenant() {
  step.value = 'tenant'
  pin.value = ''
  error.value = null
}

async function submitPin() {
  error.value = null
  loading.value = true
  try {
    await auth.pinLogin(pin.value)
    router.push(auth.posProfile ? '/terminal' : '/registers')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Incorrect PIN'
    pin.value = ''
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="signin">
    <div class="signin-card">
      <div class="signin-mark">
        <div class="glyph">X</div>
        <div class="word">Xentra<span>ERP</span> POS</div>
      </div>

      <div class="signin-steps">
        <div class="step" :class="step === 'pin' ? 'done' : 'current'">
          <span class="bullet">{{ step === 'pin' ? '✓' : '1' }}</span> Organization
        </div>
        <div class="line" />
        <div class="step" :class="step === 'pin' ? 'current' : ''">
          <span class="bullet">2</span> PIN
        </div>
      </div>

      <h2 v-if="step === 'tenant'">Sign in to your register</h2>
      <h2 v-else>{{ auth.orgName }}</h2>
      <p class="sub">
        {{ step === 'tenant' ? 'Enter your organization code' : 'Enter your staff PIN to start your shift' }}
      </p>

      <div v-if="error" class="error-box">{{ error }}</div>

      <form v-if="step === 'tenant'" @submit.prevent="submitTenant">
        <input
          v-model="tenantCode"
          type="text"
          class="field"
          placeholder="Organization code"
          autofocus
          required
        />
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Checking…' : 'Continue' }}
        </button>
      </form>

      <div v-else>
        <div class="pin-dots">
          <i v-for="(filled, i) in pinDots" :key="i" :class="{ filled }" />
        </div>
        <div class="keypad">
          <button v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']" :key="d" type="button" @click="digit(d)">
            {{ d }}
          </button>
          <button type="button" class="aux" @click="backToTenant">Back</button>
          <button type="button" @click="digit('0')">0</button>
          <button type="button" class="aux" @click="backspace">⌫</button>
        </div>
        <button type="button" class="btn btn-primary" :disabled="loading || pin.length < 4" @click="submitPin">
          {{ loading ? 'Signing in…' : 'Sign In' }}
        </button>
      </div>
    </div>
  </div>
</template>
