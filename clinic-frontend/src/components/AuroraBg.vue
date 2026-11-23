<template>
  <!-- Soft "aurora" mesh in the XentraERP blues, a faint dot grid and film grain. Decorative only. -->
  <div class="aurora" aria-hidden="true">
    <span class="b b1" /><span class="b b2" /><span class="b b3" /><span class="b b4" />
    <span class="grid" /><span class="grain" />
  </div>
</template>

<style scoped>
.aurora { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; background: linear-gradient(180deg, #f8faff 0%, #eef2fb 100%); }
.b { position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.55; animation: drift 22s ease-in-out infinite alternate; }
.b1 { width: 46vw; height: 46vw; left: -12vw; top: -14vw; background: radial-gradient(circle at 30% 30%, #60a5fa, transparent 65%); }
.b2 { width: 40vw; height: 40vw; right: -10vw; top: -6vw; background: radial-gradient(circle at 60% 40%, #818cf8, transparent 65%); animation-delay: -6s; }
.b3 { width: 36vw; height: 36vw; left: 30vw; top: 18vw; background: radial-gradient(circle, #67e8f9, transparent 65%); opacity: 0.35; animation-delay: -11s; }
.b4 { width: 30vw; height: 30vw; right: 8vw; bottom: -12vw; background: radial-gradient(circle, #c4b5fd, transparent 65%); opacity: 0.4; animation-delay: -16s; }
.grid { position: absolute; inset: 0; background-image: radial-gradient(rgba(15, 23, 42, 0.09) 1px, transparent 1px); background-size: 22px 22px; mask-image: radial-gradient(ellipse at 50% 30%, #000 20%, transparent 75%); -webkit-mask-image: radial-gradient(ellipse at 50% 30%, #000 20%, transparent 75%); }
.grain { position: absolute; inset: -50%; opacity: 0.07; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
@keyframes drift { to { transform: translate3d(4vw, 3vw, 0) scale(1.08); } }
@media (prefers-reduced-motion: reduce) { .b { animation: none; } }
</style>
