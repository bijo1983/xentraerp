<script setup lang="ts">
// Hero picture for the landing page: two static clinic illustrations (public/landing/, see CREDITS.md)
// with a couple of glass "stat" chips. Deliberately no app UI here; the product shows in the features.
import { BadgeCheck, QrCode, Stethoscope } from 'lucide-vue-next'
</script>

<template>
  <div class="lhv">
    <figure class="lhv__ph main">
      <img src="/landing/consultation.svg" alt="A doctor in a white coat talking with a patient across a desk in a bright clinic room" width="800" height="960" fetchpriority="high" />
    </figure>
    <figure class="lhv__ph small">
      <img src="/landing/eye-exam.svg" alt="An optometrist examining a patient at a slit lamp, with an eye chart on the wall" width="600" height="600" loading="lazy" />
    </figure>
    <div class="lhv__chip c1"><span class="ico"><QrCode :size="16" /></span><div><b>ZATCA-ready invoices</b><small>VAT and GST, set up for you</small></div></div>
    <div class="lhv__chip c2"><span class="ico ok"><BadgeCheck :size="16" /></span><div><b>Claims opened for you</b><small>Insurer share billed separately</small></div></div>
    <div class="lhv__chip c3"><span class="ico in"><Stethoscope :size="16" /></span><b>10 specialties</b></div>
  </div>
</template>

<style scoped>
.lhv { position: relative; width: 100%; max-width: 560px; margin-inline: auto; padding: 8px 0 48px 56px; }
.lhv__ph { margin: 0; overflow: hidden; background: #eef2ff; box-shadow: 0 40px 80px -30px rgba(30, 41, 99, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.9); }
.lhv__ph img { display: block; width: 100%; height: 100%; object-fit: cover; }
.main { aspect-ratio: 5 / 5.6; border-radius: 36px; }
.main img { object-position: 50% 70%; }
.small { position: absolute; left: 0; bottom: 0; width: 46%; aspect-ratio: 1; border-radius: 28px; border: 6px solid rgba(255, 255, 255, 0.95); }
.lhv__chip { position: absolute; display: flex; align-items: center; gap: 10px; padding: 10px 14px 10px 10px; border-radius: 16px; font-size: 13px; color: #0f172a; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(255, 255, 255, 0.95); box-shadow: 0 18px 40px -16px rgba(30, 41, 99, 0.45); backdrop-filter: blur(14px) saturate(1.4); -webkit-backdrop-filter: blur(14px) saturate(1.4); animation: lhv-float 7s ease-in-out infinite; white-space: nowrap; }
.lhv__chip b { display: block; font-weight: 700; }
.lhv__chip small { display: block; color: #64748b; font-size: 11.5px; margin-top: 1px; }
.ico { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; color: #fff; background: linear-gradient(135deg, #2563eb, #4f46e5); flex: none; }
.ico.ok { background: linear-gradient(135deg, #10b981, #0d9488); }
.ico.in { background: linear-gradient(135deg, #06b6d4, #2563eb); width: 28px; height: 28px; border-radius: 9px; }
.c1 { right: -14px; top: 9%; }
.c2 { right: 4%; bottom: 14%; animation-delay: -3.5s; }
.c3 { left: 18px; top: 6%; padding: 7px 12px 7px 7px; animation-delay: -1.8s; }
@keyframes lhv-float { 50% { transform: translateY(-8px); } }
@media (prefers-reduced-motion: reduce) { .lhv__chip { animation: none; } }
@media (max-width: 960px) { .lhv { max-width: 520px; } }
@media (max-width: 520px) {
  .lhv { padding: 4px 0 36px 28px; }
  .main { border-radius: 28px; }
  .small { width: 44%; border-radius: 22px; border-width: 4px; }
  .lhv__chip { font-size: 12px; padding: 8px 10px 8px 8px; gap: 8px; }
  .lhv__chip small { display: none; }
  .ico { width: 26px; height: 26px; border-radius: 8px; }
  .c1 { right: -4px; top: 5%; }
  .c2 { right: -4px; bottom: 10%; }
  .c3 { display: none; }
}
</style>
