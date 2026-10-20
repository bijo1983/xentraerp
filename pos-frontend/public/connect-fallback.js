// Fallback shown if the Vue app hasn't mounted anything into #app within ~10s — pairs
// with capacitor.config.ts's SplashScreen.launchShowDuration, so a stalled start shows a
// retry button instead of a blank screen. Plain JS (not part of the Vue bundle) so it
// works even if the bundle never loads; a separate file so the CSP allows no inline script.
;(function () {
  var appEl = document.getElementById('app')
  var fallbackEl = document.getElementById('connect-fallback')
  if (!appEl || !fallbackEl) return
  var retry = fallbackEl.querySelector('button')
  if (retry) retry.addEventListener('click', function () { location.reload() })
  var timer = setTimeout(function () {
    if (!appEl.hasChildNodes()) fallbackEl.style.display = 'flex'
  }, 10500)
  new MutationObserver(function () {
    if (appEl.hasChildNodes()) {
      clearTimeout(timer)
      fallbackEl.style.display = 'none'
    }
  }).observe(appEl, { childList: true })
})()
