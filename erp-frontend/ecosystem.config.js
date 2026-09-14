// pm2 process definition for erp-frontend, added 2026-09-14 after finding
// the running "xentraerp" pm2 process had no restart backoff at all:
// investigation showed 8,533 of its ~9,951 lifetime restarts were an
// EADDRINUSE crash loop (a manual `pkill next-server` + `nohup npm start`
// racing pm2's own auto-restart for port 8083 — see CLAUDE.md). With no
// restart_delay/backoff/max_restarts, that loop ran at ~50 restarts/minute
// for hours (2026-09-03) before anyone noticed. This file exists so
// `pm2 restart xentraerp` (or a reboot/resurrect) always applies the same
// backoff, instead of depending on whatever one-off `pm2 start` flags were
// used the first time.
module.exports = {
  apps: [
    {
      name: 'xentraerp',
      cwd: __dirname,
      script: 'npm',
      args: 'start -- -p 8083',
      interpreter: '/root/.nvm/versions/node/v18.20.8/bin/node',
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000,
      exp_backoff_restart_delay: 200,
      max_restarts: 15,
      min_uptime: '10s',
    },
  ],
};
