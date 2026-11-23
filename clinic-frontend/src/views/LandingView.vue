<script setup lang="ts">
// Public landing page of clinza.xentraerp.com. Signed-in users never see it (the router sends them
// to their dashboard); "Start free" goes to /signup, which registers the clinic in XentraERP.
import {
  Activity, ArrowRight, Baby, BadgeCheck, Building2, CalendarCheck2, Ear, Eye, FileText, Flower2, Globe2,
  HeartPulse, Pill, QrCode, Receipt, ShieldCheck, Smile, Sparkles, Stethoscope, Users, Zap,
} from 'lucide-vue-next'
import AuroraBg from '@/components/AuroraBg.vue'
import ClinzaMark from '@/components/ClinzaMark.vue'
import HeroVisual from '@/components/HeroVisual.vue'

const SPECIALTIES = [
  { icon: Stethoscope, label: 'General practice' }, { icon: Smile, label: 'Dental' }, { icon: Sparkles, label: 'Dermatology & aesthetics' },
  { icon: Eye, label: 'Ophthalmology' }, { icon: Activity, label: 'Physiotherapy' }, { icon: Baby, label: 'Pediatrics' },
  { icon: Flower2, label: "Women's health" }, { icon: Ear, label: 'ENT' }, { icon: HeartPulse, label: 'Cardiology' },
  { icon: Building2, label: 'Multispecialty' },
]
const STEPS = [
  { n: '1', title: 'Sign up in a minute', text: 'Verify your email with a code or continue with Google. No card, no password to invent.' },
  { n: '2', title: 'Pick your specialty', text: 'Charting templates, visit types, services and tax are set up for your clinic type and country.' },
  { n: '3', title: 'See patients today', text: 'Book, chart, prescribe and bill. Invoices post straight to your XentraERP accounts.' },
]
</script>

<template>
  <div class="lp">
    <AuroraBg />
    <header class="lp__nav">
      <RouterLink to="/" class="lp__brand"><ClinzaMark :size="30" /><span>CLINZA</span></RouterLink>
      <nav class="lp__links">
        <a href="#features">Features</a><a href="#specialties">Specialties</a><a href="#compliance">Compliance</a>
      </nav>
      <div class="lp__auth">
        <RouterLink to="/sign-in" class="lp__ghost">Sign in</RouterLink>
        <RouterLink to="/signup" class="lp__cta sm">Start free</RouterLink>
      </div>
    </header>

    <section class="lp__hero">
      <div class="lp__copy">
        <span class="lp__pill"><Zap :size="14" /> Clinic software on XentraERP</span>
        <h1>Run your clinic,<br /><span class="grad">not your paperwork.</span></h1>
        <p class="lp__lead">Appointments, specialty charting, prescriptions, insurance claims and tax-ready invoices in one calm workspace. Built for clinics in the GCC, India and Europe.</p>
        <div class="lp__actions">
          <RouterLink to="/signup" class="lp__cta">Start your free month <ArrowRight :size="18" /></RouterLink>
          <RouterLink to="/sign-in" class="lp__ghost lg">I already have a clinic</RouterLink>
        </div>
        <ul class="lp__trust">
          <li><BadgeCheck :size="16" /> No card needed</li>
          <li><Users :size="16" /> Unlimited staff during your trial</li>
        </ul>
      </div>
      <HeroVisual />
    </section>

    <section id="specialties" class="lp__spec">
      <p class="lp__eyebrow">Set up for your specialty from day one</p>
      <div class="lp__chips">
        <span v-for="s in SPECIALTIES" :key="s.label" class="lp__chip"><component :is="s.icon" :size="16" /> {{ s.label }}</span>
      </div>
    </section>

    <section id="features" class="lp__section">
      <h2>Everything a clinic does, <span class="grad">in one place</span></h2>
      <div class="bento">
        <article class="tile wide">
          <CalendarCheck2 :size="22" class="ic" />
          <h3>Scheduling that fits the day</h3>
          <p>A calendar per practitioner with your visit types and lengths. Check patients in, start visits and see who's waiting at a glance.</p>
        </article>
        <article class="tile tall accent">
          <Smile :size="22" class="ic" />
          <h3>Charting that looks like the patient</h3>
          <p>A real tooth chart with surfaces, both eyes with the fundus, growth, antenatal, physio and more. Pick the templates your specialty uses.</p>
        </article>
        <article class="tile">
          <Pill :size="22" class="ic" />
          <h3>Prescriptions</h3>
          <p>Generic names, dose and duration, printed to your country's format.</p>
        </article>
        <article class="tile">
          <ShieldCheck :size="22" class="ic" />
          <h3>Insurance & claims</h3>
          <p>Policies, co-pay, the insurer's share invoiced separately and a claim opened for you.</p>
        </article>
        <article class="tile full">
          <Receipt :size="22" class="ic" />
          <h3>Billing that lands in your accounts</h3>
          <p>Every bill is a real XentraERP invoice, posted to your ledger with the right tax. Payments, outstanding balances and reports come with it.</p>
        </article>
      </div>
    </section>

    <section id="compliance" class="lp__section">
      <h2>Tax-ready where you practise</h2>
      <div class="comp">
        <div class="comp__c"><QrCode :size="20" /><h3>GCC VAT</h3><p>Saudi Arabia 15% with the ZATCA QR code, UAE, Bahrain, Oman, Qatar and Kuwait, with Arabic on invoices.</p></div>
        <div class="comp__c"><FileText :size="20" /><h3>India GST</h3><p>Exempt healthcare, CGST/SGST or IGST by state, Bill of Supply and GSTIN checks.</p></div>
        <div class="comp__c"><Globe2 :size="20" /><h3>Europe VAT</h3><p>Medical exemption under Article 132 with the right note on every invoice.</p></div>
      </div>
    </section>

    <section class="lp__section">
      <h2>Up and running in three steps</h2>
      <ol class="steps">
        <li v-for="s in STEPS" :key="s.n"><span class="steps__n">{{ s.n }}</span><h3>{{ s.title }}</h3><p>{{ s.text }}</p></li>
      </ol>
    </section>

    <section class="lp__final">
      <h2>Your clinic, ready this afternoon.</h2>
      <p>One month free with every feature. Keep your data when you continue.</p>
      <RouterLink to="/signup" class="lp__cta light">Create your clinic <ArrowRight :size="18" /></RouterLink>
    </section>

    <footer class="lp__foot">
      <span class="lp__brand small"><ClinzaMark :size="20" /> CLINZA</span>
      <span>Part of XentraERP</span>
    </footer>
  </div>
</template>

<style scoped>
.lp { position: relative; min-height: 100vh; overflow-x: hidden; color: #0f172a; font-family: var(--x-font-sans); }
.lp > *:not(.aurora) { position: relative; z-index: 1; }
.lp__nav { display: flex; align-items: center; gap: 24px; max-width: 1200px; margin: 0 auto; padding: 18px 24px; }
.lp__brand { display: inline-flex; align-items: center; gap: 10px; font-family: var(--x-font-display); font-weight: 800; letter-spacing: 0.04em; color: #0f172a; text-decoration: none; font-size: 18px; }
.lp__brand.small { font-size: 14px; gap: 8px; }
.lp__links { display: flex; gap: 22px; margin-inline-start: 18px; }
.lp__links a { color: #475569; text-decoration: none; font-size: 14.5px; font-weight: 500; }
.lp__links a:hover { color: #0f172a; }
.lp__auth { margin-inline-start: auto; display: flex; gap: 10px; align-items: center; }
.lp__ghost { color: #0f172a; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 9px 14px; border-radius: 12px; }
.lp__ghost:hover { background: rgba(255, 255, 255, 0.7); }
.lp__ghost.lg { padding: 14px 20px; border: 1px solid rgba(15, 23, 42, 0.12); background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(8px); font-size: 15.5px; }
.lp__cta { display: inline-flex; align-items: center; gap: 8px; padding: 14px 22px; border-radius: 14px; font-weight: 700; font-size: 15.5px; color: #fff; text-decoration: none; background: linear-gradient(135deg, #2563eb, #4f46e5); box-shadow: 0 14px 30px -12px rgba(37, 99, 235, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.25); transition: transform 0.15s, box-shadow 0.15s; }
.lp__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 36px -12px rgba(37, 99, 235, 0.75); }
.lp__cta.sm { padding: 9px 16px; font-size: 14px; border-radius: 12px; }
.lp__cta.light { background: #fff; color: #1d4ed8; box-shadow: 0 14px 30px -12px rgba(0, 0, 0, 0.35); }
.lp__hero { max-width: 1200px; margin: 0 auto; padding: 48px 24px 40px; display: grid; grid-template-columns: 1fr 1.05fr; gap: 48px; align-items: center; }
.lp__pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 99px; font-size: 13px; font-weight: 600; color: #1d4ed8; background: rgba(255, 255, 255, 0.75); border: 1px solid rgba(37, 99, 235, 0.18); }
h1 { font-family: var(--x-font-display); font-size: clamp(38px, 5.2vw, 64px); line-height: 1.04; letter-spacing: -0.035em; margin: 18px 0 18px; font-weight: 800; }
.grad { background: linear-gradient(100deg, #2563eb 0%, #4f46e5 45%, #06b6d4 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lp__lead { font-size: 18px; line-height: 1.6; color: #475569; max-width: 520px; margin: 0 0 26px; }
.lp__actions { display: flex; flex-wrap: wrap; gap: 12px; }
.lp__trust { list-style: none; padding: 0; margin: 22px 0 0; display: flex; flex-wrap: wrap; gap: 18px; color: #475569; font-size: 14px; }
.lp__trust li { display: inline-flex; align-items: center; gap: 6px; }
.lp__trust svg { color: #10b981; }
.lp__spec { max-width: 1200px; margin: 0 auto; padding: 24px 24px 8px; text-align: center; }
.lp__eyebrow { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: #64748b; margin: 0 0 14px; }
.lp__chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.lp__chip { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 99px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(15, 23, 42, 0.07); font-size: 14px; font-weight: 500; backdrop-filter: blur(8px); }
.lp__chip svg { color: #2563eb; }
.lp__section { max-width: 1200px; margin: 0 auto; padding: 64px 24px 8px; }
h2 { font-family: var(--x-font-display); font-size: clamp(28px, 3.4vw, 40px); letter-spacing: -0.03em; line-height: 1.12; margin: 0 0 28px; text-align: center; font-weight: 800; }
.bento { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: minmax(170px, auto); gap: 16px; }
.tile { padding: 24px; border-radius: 22px; background: rgba(255, 255, 255, 0.78); border: 1px solid rgba(255, 255, 255, 0.95); box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04), 0 20px 40px -28px rgba(30, 41, 99, 0.3); backdrop-filter: blur(12px); }
.tile.wide { grid-column: span 2; }
.tile.full { grid-column: 1 / -1; }
.tile.tall { grid-row: span 2; }
.tile.accent { background: linear-gradient(160deg, #1d4ed8, #4338ca); color: #fff; border-color: transparent; }
.tile.accent p { color: rgba(255, 255, 255, 0.85); }
.tile.accent .ic { color: #fff; background: rgba(255, 255, 255, 0.16); }
.tile h3 { font-family: var(--x-font-display); font-size: 19px; margin: 14px 0 8px; letter-spacing: -0.01em; }
.tile p { margin: 0; color: #475569; line-height: 1.55; font-size: 15px; }
.ic { width: 42px; height: 42px; padding: 10px; border-radius: 12px; color: #2563eb; background: #eff6ff; }
.comp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.comp__c { padding: 22px; border-radius: 20px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(15, 23, 42, 0.06); }
.comp__c svg { color: #4f46e5; }
.comp__c h3 { font-family: var(--x-font-display); margin: 10px 0 6px; font-size: 18px; }
.comp__c p { margin: 0; color: #475569; font-size: 14.5px; line-height: 1.55; }
.steps { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.steps li { padding: 22px; border-radius: 20px; background: rgba(255, 255, 255, 0.6); border: 1px dashed rgba(37, 99, 235, 0.3); }
.steps__n { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #2563eb, #4f46e5); }
.steps h3 { font-family: var(--x-font-display); margin: 14px 0 6px; font-size: 18px; }
.steps p { margin: 0; color: #475569; font-size: 14.5px; line-height: 1.55; }
.lp__final { max-width: 1152px; margin: 72px auto 0; padding: 56px 24px; border-radius: 28px; text-align: center; color: #fff; background: radial-gradient(120% 140% at 0% 0%, #4f46e5 0%, #2563eb 45%, #0e7490 100%); box-shadow: 0 40px 80px -40px rgba(37, 99, 235, 0.8); }
.lp__final h2 { color: #fff; margin-bottom: 10px; }
.lp__final p { margin: 0 0 24px; color: rgba(255, 255, 255, 0.85); font-size: 17px; }
.lp__foot { max-width: 1200px; margin: 0 auto; padding: 36px 24px 40px; display: flex; justify-content: space-between; color: #64748b; font-size: 13.5px; }
@media (max-width: 960px) {
  .lp__hero { grid-template-columns: 1fr; padding-top: 24px; }
  .lp__links { display: none; }
  .bento, .comp, .steps { grid-template-columns: 1fr; }
  .tile.wide, .tile.full { grid-column: auto; }
  .tile.tall { grid-row: auto; }
  .lp__final { margin-inline: 16px; }
}
@media (max-width: 520px) {
  .lp__nav { padding: 14px 16px; }
  .lp__ghost:not(.lg) { display: none; }
  .lp__hero, .lp__section, .lp__spec { padding-inline: 16px; }
  .lp__lead { font-size: 16.5px; }
}
</style>
