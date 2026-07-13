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
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",

      // ONE instance, on purpose. The rate limiter (src/lib/rate-limit.ts) keeps
      // its counters in memory, so a second worker would silently double every
      // anti-spam limit. Put the buckets in Redis before switching to cluster.
      instances: 1,
      exec_mode: "fork",

      max_memory_restart: "1G",
      env: { NODE_ENV: "production", PORT: "3000" },

      out_file: "/var/log/harajstation/out.log",
      error_file: "/var/log/harajstation/error.log",
      time: true,
    },
  ],
};
