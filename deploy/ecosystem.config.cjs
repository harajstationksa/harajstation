// حراج ستيشن — PM2 process definition
//
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save && pm2 startup     # survive a reboot
//
module.exports = {
  apps: [
    {
      name: "harajstation",
      cwd: "/var/www/harajstation",
      // call Next directly instead of `npm start` — one less process in the tree
      // -H 127.0.0.1: only nginx may reach the app. Exposed on 0.0.0.0 the
      // rate-limiter's IP headers could be forged by hitting :3000 directly.
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",

      // TWO cluster workers: `pm2 reload` becomes zero-downtime (one worker
      // serves while the other restarts). Safe since 2026-07-18 — rate-limit
      // and login-guard counters live in Redis (REDIS_URL in .env); only the
      // page/settings caches stay per-worker, which just means each worker
      // warms its own copy for a few seconds.
      instances: 2,
      exec_mode: "cluster",

      max_memory_restart: "1G",
      env: { NODE_ENV: "production", PORT: "3000" },

      out_file: "/var/log/harajstation/out.log",
      error_file: "/var/log/harajstation/error.log",
      time: true,
    },
  ],
};
