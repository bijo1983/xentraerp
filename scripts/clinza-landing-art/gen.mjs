// Generates the static landing illustrations for CLINZA (flat, faceless editorial style).
import { writeFileSync } from 'node:fs'
const OUT = process.argv[2]

const C = {
  ink: '#1e293b', blue: '#2563eb', indigo: '#4f46e5', cyan: '#06b6d4', sky: '#dbeafe', mist: '#eef2ff',
  coat: '#ffffff', coatS: '#dbe3f0', teal: '#0d9488', tealD: '#0f766e',
}
const SKIN = ['#f3c9a8', '#d69a6f', '#9a6440', '#e8b48f']
const SKIN_D = ['#e0ad8a', '#bf8158', '#7f4f31', '#d39a75']
const HAIR = ['#1e293b', '#3f2a1d', '#5b3a24', '#0f172a']

// A seated or standing person in side view, facing right. (0,0) = hip.
function person(o) {
  const s = SKIN[o.skin ?? 0], sd = SKIN_D[o.skin ?? 0], h = HAIR[o.hair ?? 0]
  const top = o.top, topS = o.topS || shade(top), pants = o.pants || '#334155', shoe = o.shoe || '#0f172a'
  const hand = o.hand || [62, -58], elbow = o.elbow || [16, -48]
  let legs = ''
  if (o.pose === 'stand') {
    legs = `<path d="M-6 0 L-4 150" stroke="${shade(pants)}" stroke-width="28" stroke-linecap="round"/>
      <path d="M8 0 L12 150" stroke="${pants}" stroke-width="28" stroke-linecap="round"/>
      <path d="M-2 162 h34 a10 10 0 0 0 -10 -14 h-26 z" fill="${shoe}"/>`
  } else if (o.pose !== 'none') {
    const k = o.knee || [78, -4], f = o.foot || [80, 92]
    legs = `<path d="M0 -6 L${k[0]} ${k[1]} L${f[0]} ${f[1]}" fill="none" stroke="${pants}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${f[0] - 14} ${f[1] + 2} h40 a12 12 0 0 0 -12 -14 h-28 z" fill="${shoe}"/>`
  }
  const longHair = o.long
    ? `<path d="M-30 -176 C-34 -150 -30 -128 -16 -112 C-6 -120 -6 -140 -4 -152 Z" fill="${h}"/>` : ''
  const bun = o.bun ? `<circle cx="-24" cy="-196" r="13" fill="${h}"/>` : ''
  const torso = `<path d="M-30 4 C-40 -50 -38 -104 -16 -128 L20 -130 C40 -118 46 -70 38 -20 L34 4 Z" fill="${top}"/>
    <path d="M-30 4 C-40 -50 -38 -104 -16 -128 L-4 -129 C-22 -100 -24 -50 -14 4 Z" fill="${topS}"/>`
  let extra = ''
  if (o.coat) {
    extra += `<path d="M14 -128 L30 -122 L22 -70 Z" fill="${o.inner || C.blue}"/>
      <path d="M8 -128 L26 -70" stroke="${C.coatS}" stroke-width="3"/>`
  }
  if (o.steth) {
    extra += `<path d="M2 -130 C-4 -100 8 -86 22 -84 C34 -84 36 -104 30 -126" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="22" cy="-82" r="7" fill="#94a3b8" stroke="${C.ink}" stroke-width="3"/>`
  }
  if (o.badge) extra += `<rect x="-2" y="-96" width="16" height="11" rx="2" fill="${C.blue}"/>`
  const arm = `<path d="M6 -116 L${elbow[0]} ${elbow[1]} L${hand[0]} ${hand[1]}" fill="none" stroke="${o.sleeve || top}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${hand[0] + 6}" cy="${hand[1]}" r="10" fill="${s}"/>`
  const head = `<rect x="-6" y="-152" width="18" height="28" rx="6" fill="${sd}"/>
    <ellipse cx="4" cy="-176" rx="28" ry="31" fill="${s}"/>
    <path d="M30 -180 q8 8 0 14" fill="${s}"/>
    <path d="M-30 -172 C-36 -214 14 -224 34 -190 C24 -198 10 -196 2 -190 C-6 -182 -8 -170 -10 -158 C-22 -154 -28 -162 -30 -172 Z" fill="${h}"/>
    <ellipse cx="-6" cy="-170" rx="6" ry="8" fill="${sd}"/>
    ${o.glasses ? `<path d="M14 -180 h16 v9 h-16 z M-2 -178 h16" fill="none" stroke="${C.ink}" stroke-width="2.5"/>` : ''}
    ${o.mask ? `<path d="M8 -166 C20 -168 32 -166 34 -160 C32 -150 18 -146 8 -148 Z" fill="#bae6fd"/><path d="M8 -162 L-6 -170" stroke="#7dd3fc" stroke-width="2"/>` : ''}`
  const body = `<g transform="rotate(${o.lean || 0})">${torso}${extra}${o.armBehind ? '' : ''}${head}${bun}${longHair}${arm}</g>`
  const g = `<g transform="translate(${o.x} ${o.y}) scale(${(o.flip ? -1 : 1) * (o.scale || 1)} ${o.scale || 1})">${legs}${body}</g>`
  return g
}
function shade(hex, f = 0.82) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f)
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
}
const plant = (x, y, sc = 1, pot = '#ffffff') => `<g transform="translate(${x} ${y}) scale(${sc})">
  <path d="M0 0 C-50 -40 -60 -120 -20 -170 C-10 -110 -6 -60 0 0Z" fill="#10b981"/>
  <path d="M0 0 C40 -50 70 -110 40 -180 C20 -120 10 -60 0 0Z" fill="#059669"/>
  <path d="M0 0 C-10 -60 0 -150 10 -210 C24 -140 14 -60 0 0Z" fill="#34d399"/>
  <path d="M0 0 C-30 -20 -80 -40 -100 -90 C-50 -80 -20 -40 0 0Z" fill="#047857"/>
  <path d="M-38 0 h76 l-10 70 h-56 z" fill="${pot}"/><path d="M-38 0 h76 v10 h-76z" fill="#e2e8f0"/></g>`
const defs = (id) => `<defs>
  <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8eeff"/><stop offset="1" stop-color="#f6f8ff"/></linearGradient>
  <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfdbfe"/><stop offset="1" stop-color="#f0f9ff"/></linearGradient>
  <linearGradient id="${id}fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c7d2fe"/><stop offset="1" stop-color="#a5b4fc"/></linearGradient>
  <linearGradient id="${id}desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e2e8f0"/></linearGradient>
  <radialGradient id="${id}glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
</defs>`
const svg = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"><title>${title}</title>${body}</svg>\n`
const chair = (x, y, flip, col = '#475569') => `<g transform="translate(${x} ${y}) scale(${flip ? -1 : 1} 1)">
  <path d="M-58 -150 C-66 -150 -70 -144 -68 -136 L-52 2 h14 L-48 -140 C-48 -146 -52 -150 -58 -150Z" fill="${col}"/>
  <rect x="-56" y="0" width="120" height="16" rx="8" fill="${col}"/>
  <path d="M0 16 v70 M-40 96 h80" stroke="${shade(col, 0.7)}" stroke-width="8" stroke-linecap="round"/></g>`

// ---------- 1. Consultation (hero, portrait) ----------
{
  const W = 800, H = 960
  const b = `${defs('a')}
  <rect width="${W}" height="${H}" fill="url(#aw)"/>
  <path d="M250 560 V230 a150 150 0 0 1 300 0 V560 Z" fill="#ffffff"/>
  <path d="M266 548 V234 a134 134 0 0 1 268 0 V548 Z" fill="url(#asky)"/>
  <path d="M266 470 C330 420 380 440 430 410 C480 380 510 400 534 390 V548 H266Z" fill="#a7f3d0" opacity=".55"/>
  <path d="M266 510 C320 470 400 490 450 460 C490 440 520 450 534 446 V548 H266Z" fill="#6ee7b7" opacity=".55"/>
  <circle cx="470" cy="250" r="34" fill="#ffffff" opacity=".9"/>
  <path d="M400 100 V548 M266 330 H534" stroke="#ffffff" stroke-width="10"/>
  <rect x="236" y="556" width="328" height="16" rx="6" fill="#ffffff"/>
  <ellipse cx="400" cy="330" rx="330" ry="260" fill="url(#aglow)" opacity=".5"/>
  <rect x="614" y="120" width="120" height="150" rx="10" fill="#ffffff"/>
  <rect x="628" y="134" width="92" height="122" rx="6" fill="${C.mist}"/>
  <path d="M664 164 h20 v22 h22 v20 h-22 v22 h-20 v-22 h-22 v-20 h22z" fill="${C.blue}"/>
  <rect x="70" y="200" width="120" height="10" rx="5" fill="#cbd5e1"/>
  <rect x="84" y="150" width="22" height="50" rx="3" fill="${C.indigo}"/><rect x="110" y="160" width="18" height="40" rx="3" fill="${C.cyan}"/><rect x="132" y="140" width="24" height="60" rx="3" fill="#f59e0b"/>
  <rect y="790" width="${W}" height="170" fill="url(#afl)"/>
  <path d="M0 790 H${W}" stroke="#ffffff" stroke-width="6" opacity=".7"/>
  <ellipse cx="400" cy="900" rx="330" ry="26" fill="#6366f1" opacity=".18"/>
  ${plant(70, 720, 1.1)}
  <g transform="translate(400 800) scale(1.3) translate(-400 -800)">
  ${chair(196, 640, false, '#334155')}
  ${person({ x: 210, y: 640, top: '#f97316', skin: 1, hair: 1, long: true, pants: '#1e3a8a', hand: [150, -66], elbow: [30, -50] })}
  ${chair(604, 640, true, '#334155')}
  ${person({ x: 592, y: 640, flip: true, top: C.coat, topS: C.coatS, coat: true, steth: true, badge: true, skin: 0, hair: 0, pants: '#1e293b', hand: [140, -70], elbow: [24, -54] })}
  <path d="M232 576 h336 a10 10 0 0 1 10 10 v8 h-356 v-8 a10 10 0 0 1 10 -10z" fill="#ffffff"/>
  <rect x="236" y="594" width="328" height="200" fill="url(#adesk)"/>
  <rect x="236" y="594" width="328" height="8" fill="#cbd5e1"/>
  <rect x="380" y="640" width="40" height="6" rx="3" fill="#cbd5e1"/>
  <path d="M446 576 l-26 -98 a6 6 0 0 1 6 -8 h8 l28 106z" fill="#94a3b8"/>
  <path d="M430 576 h66 v-6 h-66z" fill="#64748b"/>
  <rect x="330" y="562" width="60" height="14" rx="3" fill="${C.sky}" transform="rotate(-6 360 570)"/>
  <rect x="512" y="544" width="24" height="32" rx="5" fill="${C.blue}"/><path d="M536 552 a8 8 0 0 1 0 16" fill="none" stroke="${C.blue}" stroke-width="4"/>
  </g>`
  writeFileSync(`${OUT}/consultation.svg`, svg(W, H, 'A doctor in a white coat talking with a patient across a desk in a bright clinic room', b))
}

// ---------- 2. Eye exam (hero, square) ----------
{
  const W = 600, H = 600
  const chart = ['E', 'F P', 'T O Z', 'L P E D', 'P E C F D'].map((t, i) =>
    `<text x="95" y="${66 + i * 26 - (i * i)}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="${30 - i * 5}" fill="#0f172a" letter-spacing="${3 - i * 0.4}">${t}</text>`).join('')
  const b = `${defs('e')}
  <rect width="${W}" height="${H}" fill="url(#ew)"/>
  <circle cx="470" cy="130" r="150" fill="${C.sky}" opacity=".6"/>
  <rect x="40" y="26" width="110" height="146" rx="10" fill="#ffffff"/>
  ${chart}
  <rect x="54" y="156" width="82" height="3" rx="2" fill="#ef4444" opacity=".7"/>
  <rect y="470" width="${W}" height="130" fill="url(#efl)"/>
  <ellipse cx="300" cy="560" rx="240" ry="18" fill="#6366f1" opacity=".18"/>
  ${chair(150, 380, false, '#1e3a8a')}
  ${person({ x: 160, y: 380, top: '#14b8a6', skin: 2, hair: 3, pants: '#334155', hand: [96, -88], elbow: [44, -60], lean: 12, foot: [86, 92] })}
  <rect x="210" y="350" width="190" height="16" rx="6" fill="#ffffff"/>
  <rect x="294" y="366" width="20" height="140" fill="#cbd5e1"/>
  <rect x="254" y="500" width="100" height="14" rx="7" fill="#94a3b8"/>
  <rect x="290" y="216" width="28" height="134" rx="8" fill="#e2e8f0"/>
  <path d="M276 250 h-40 v-40 M276 228 h-30" fill="none" stroke="#94a3b8" stroke-width="7" stroke-linecap="round"/>
  <rect x="296" y="222" width="80" height="26" rx="12" fill="#334155"/>
  <rect x="318" y="208" width="56" height="16" rx="6" fill="#475569"/>
  <circle cx="378" cy="235" r="10" fill="${C.cyan}"/>
  ${chair(470, 380, true, '#1e3a8a')}
  ${person({ x: 460, y: 380, flip: true, top: C.indigo, topS: shade(C.indigo), skin: 3, hair: 2, bun: true, pants: '#1e293b', hand: [52, -150], elbow: [30, -90], lean: 14, glasses: false })}
  <path d="M520 90 l8 -20 l8 20 l20 8 l-20 8 l-8 20 l-8 -20 l-20 -8z" fill="#ffffff" opacity=".9"/>`
  writeFileSync(`${OUT}/eye-exam.svg`, svg(W, H, 'An optometrist examining a patient at a slit lamp, with an eye chart on the wall', b))
}

// ---------- 3. Dental (strip) ----------
{
  const W = 640, H = 440
  const b = `${defs('d')}
  <rect width="${W}" height="${H}" fill="url(#dw)"/>
  <circle cx="110" cy="90" r="120" fill="#cffafe" opacity=".7"/>
  <g transform="translate(70 56)"><path d="M18 0 C6 0 0 10 0 22 C0 40 8 62 14 62 C20 62 20 44 26 44 C32 44 32 62 38 62 C44 62 52 40 52 22 C52 10 46 0 34 0 C30 0 28 3 26 3 C24 3 22 0 18 0Z" fill="#ffffff"/></g>
  <rect y="360" width="${W}" height="80" fill="url(#dfl)"/>
  <ellipse cx="320" cy="400" rx="240" ry="14" fill="#6366f1" opacity=".18"/>
  <path d="M300 0 v50 l110 50" fill="none" stroke="#94a3b8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M392 92 l56 4 l-4 40 l-56 -4z" fill="#e2e8f0"/><path d="M396 130 l44 4" stroke="#fde68a" stroke-width="8" stroke-linecap="round"/>
  <path d="M120 236 h70 v8 h-70z" fill="#cbd5e1"/><path d="M155 244 v114" stroke="#cbd5e1" stroke-width="6"/><path d="M130 358 h50" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
  <path d="M132 236 l6 -14 M150 236 l0 -16 M168 236 l-6 -14" stroke="#64748b" stroke-width="4" stroke-linecap="round"/>
  ${person({ x: 572, y: 300, flip: true, top: C.blue, topS: shade(C.blue), skin: 1, hair: 0, mask: true, pants: '#1e3a8a', hand: [104, -96], elbow: [44, -70], lean: 12, knee: [66, -4], foot: [66, 58] })}
  <rect x="560" y="300" width="22" height="52" fill="#94a3b8"/><rect x="530" y="348" width="80" height="10" rx="5" fill="#64748b"/>
  <path d="M190 330 L230 296 L350 296 L470 216 C486 206 500 214 498 230 C496 238 490 244 482 248 L380 318 H240 L206 340Z" fill="${C.teal}"/>
  <path d="M470 216 C486 206 504 212 504 226 L508 238 L486 250Z" fill="${C.tealD}"/>
  <rect x="290" y="316" width="22" height="44" fill="#94a3b8"/><rect x="240" y="352" width="122" height="12" rx="6" fill="#64748b"/>
  <path d="M330 290 L232 280 L172 314" fill="none" stroke="#1e3a8a" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M150 300 a10 10 0 0 0 0 24 h28 v-24z" fill="#0f172a"/>
  <g transform="translate(332 290) rotate(60)">${person({ x: 0, y: 0, flip: true, top: '#fb7185', skin: 0, hair: 1, pose: 'none', hand: [44, -34], elbow: [22, -48] })}</g>`
  writeFileSync(`${OUT}/dental.svg`, svg(W, H, 'A dentist treating a patient reclined in a dental chair under the examination lamp', b))
}

// ---------- 4. Pediatrics (strip) ----------
{
  const W = 640, H = 440
  const ticks = Array.from({ length: 12 }, (_, i) => `<path d="M96 ${100 + i * 20} h${i % 2 ? 10 : 18}" stroke="#64748b" stroke-width="2"/>`).join('')
  const b = `${defs('p')}
  <rect width="${W}" height="${H}" fill="url(#pw)"/>
  <circle cx="520" cy="80" r="130" fill="#fef3c7" opacity=".8"/>
  <rect x="80" y="90" width="44" height="260" rx="8" fill="#ffffff"/>${ticks}
  <circle cx="470" cy="110" r="26" fill="#fb7185"/><path d="M470 136 q-6 30 6 60" fill="none" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="520" cy="90" r="22" fill="${C.cyan}"/><path d="M520 112 q6 40 -10 84" fill="none" stroke="#94a3b8" stroke-width="2"/>
  <rect y="360" width="${W}" height="80" fill="url(#pfl)"/>
  <ellipse cx="320" cy="410" rx="230" ry="14" fill="#6366f1" opacity=".18"/>
  <rect x="160" y="250" width="200" height="40" rx="12" fill="#ffffff"/><rect x="160" y="250" width="200" height="12" rx="6" fill="${C.sky}"/>
  <rect x="176" y="290" width="14" height="80" fill="#cbd5e1"/><rect x="330" y="290" width="14" height="80" fill="#cbd5e1"/>
  ${person({ x: 270, y: 252, scale: 0.68, top: '#facc15', skin: 3, hair: 2, pants: '#2563eb', shoe: '#ef4444', hand: [70, -60], elbow: [20, -50], knee: [74, -2], foot: [74, 90] })}
  <g transform="translate(220 230)"><circle r="20" fill="#b45309"/><circle cx="-14" cy="-16" r="9" fill="#b45309"/><circle cx="14" cy="-16" r="9" fill="#b45309"/><circle cy="4" r="9" fill="#fcd34d"/><circle cx="0" cy="22" r="18" fill="#b45309"/></g>
  ${person({ x: 470, y: 300, flip: true, top: C.coat, topS: C.coatS, coat: true, steth: true, skin: 1, hair: 1, long: true, inner: C.indigo, pants: '#334155', hand: [110, -100], elbow: [40, -70], lean: 8 })}
  <rect x="460" y="300" width="60" height="14" rx="7" fill="#475569"/><path d="M490 314 v40 M466 358 h48" stroke="#334155" stroke-width="7" stroke-linecap="round"/>`
  writeFileSync(`${OUT}/pediatrics.svg`, svg(W, H, 'A pediatrician listening to a young child with a stethoscope beside a growth chart', b))
}

// ---------- 5. Reception (strip) ----------
{
  const W = 640, H = 440
  const b = `${defs('r')}
  <rect width="${W}" height="${H}" fill="url(#rw)"/>
  <rect x="150" y="40" width="300" height="70" rx="16" fill="#ffffff"/>
  <path d="M182 60 h12 v12 h12 v12 h-12 v12 h-12 v-12 h-12 v-12 h12z" fill="${C.blue}"/>
  <rect x="222" y="62" width="150" height="14" rx="7" fill="#1e293b"/><rect x="222" y="84" width="96" height="10" rx="5" fill="#94a3b8"/>
  <circle cx="560" cy="70" r="30" fill="#ffffff"/><circle cx="560" cy="70" r="30" fill="none" stroke="#cbd5e1" stroke-width="4"/><path d="M560 52 V70 L574 78" fill="none" stroke="#1e293b" stroke-width="4" stroke-linecap="round"/>
  <rect y="360" width="${W}" height="80" fill="url(#rfl)"/>
  <ellipse cx="320" cy="410" rx="260" ry="14" fill="#6366f1" opacity=".18"/>
  ${person({ x: 300, y: 300, top: C.indigo, topS: shade(C.indigo), skin: 2, hair: 0, bun: true, badge: false, pose: 'none', hand: [70, -60], elbow: [22, -46] })}
  <path d="M120 230 h320 v14 h-320z" fill="#ffffff"/>
  <rect x="130" y="244" width="300" height="122" fill="url(#rdesk)"/>
  <rect x="130" y="244" width="300" height="10" fill="#cbd5e1"/>
  <rect x="170" y="290" width="220" height="6" rx="3" fill="${C.sky}"/>
  <path d="M352 230 l-14 -60 h56 l-6 60z" fill="#334155"/>
  ${person({ x: 500, y: 246, scale: 0.86, flip: true, pose: 'stand', top: '#0ea5e9', skin: 0, hair: 1, long: true, pants: '#334155', hand: [52, -14], elbow: [24, -52] })}
  ${plant(70, 290, 0.6)}`
  writeFileSync(`${OUT}/reception.svg`, svg(W, H, 'A receptionist at a clinic front desk welcoming a patient', b))
}
console.log('ok')
