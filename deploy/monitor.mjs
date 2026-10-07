// Run from the release with --env-file; never print credentials or raw errors.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import nodemailer from "nodemailer";
const stateFile = "/var/lib/harajstation/ops-health.json";
(async () => {
  const problems = [];
  let previous = {};
  try {
    previous = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {}
  try {
    const response = await fetch("http://127.0.0.1:3000/api/ops/health", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(15000),
    });
    const health = await response.json().catch(() => null);
    if (response.status === 401) problems.push("health_unauthorized");
    else if (!health) problems.push("application_unreachable");
    else {
      if (health.recentErrors) problems.push("recent_server_errors");
      if (health.staleJobs?.length) problems.push("stale_jobs");
      if (health.failedJobs) problems.push("failed_background_jobs");
      if (health.queueDelayed) problems.push("queue_delayed");
      if (!health.redis) problems.push("redis_unavailable");
      if (!response.ok && !problems.length)
        problems.push("application_unreachable");
    }
  } catch {
    problems.push("application_unreachable");
  }
  let backupAgeHours = null;
  try {
    const newest = fs
      .readdirSync("/var/backups/harajstation")
      .filter((n) => /^haraj-.*\.tar\.gz\.age$/.test(n))
      .sort()
      .at(-1);
    if (newest)
      backupAgeHours =
        (Date.now() -
          fs.statSync(`/var/backups/harajstation/${newest}`).mtimeMs) /
        3600000;
    if (backupAgeHours === null || backupAgeHours > 26)
      problems.push("backup_older_than_26_hours");
  } catch {
    problems.push("backup_unavailable");
  }
  let offsiteAgeHours = null;
  try {
    const receipt = JSON.parse(
      fs.readFileSync("/var/backups/harajstation/offsite-health.json", "utf8"),
    );
    if(receipt.ok === false)problems.push("offsite_backup_failed");
    offsiteAgeHours =
      (Date.now() - new Date(receipt.checkedAt).getTime()) / 3600000;
    if (!Number.isFinite(offsiteAgeHours) || offsiteAgeHours > 26)
      problems.push("offsite_backup_older_than_26_hours");
  } catch {
    problems.push("offsite_backup_unverified");
  }
  for (const service of ["nginx", "cron", "redis-server"]) {
    try {
      execFileSync("systemctl", ["is-active", "--quiet", service]);
    } catch {
      problems.push(`${service}_inactive`);
    }
  }
  let smtpCheckedAt = previous.smtpCheckedAt || 0;
  let smtpOk = previous.smtpOk || false;
  if (Date.now() - smtpCheckedAt > 15 * 60000) {
    smtpCheckedAt = Date.now();
    let transport;
    try {
      if (
        !process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS
      )
        throw new Error("unconfigured");
      const port = Number(process.env.SMTP_PORT || 587);
      transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });
      await transport.verify();
      smtpOk = true;
    } catch {
      smtpOk = false;
    } finally {
      transport?.close();
    }
  }
  if (!smtpOk) problems.push("smtp_connection_failed");
  const state = {
    checkedAt: new Date().toISOString(),
    ok: problems.length === 0,
    problems,
    backupAgeHours,
    offsiteAgeHours,
    smtpCheckedAt,
    smtpOk,
  };
  fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state), { mode: 0o640 });
  fs.renameSync(`${stateFile}.tmp`, stateFile);
  if (JSON.stringify(problems) !== JSON.stringify(previous.problems)) {
    // Private system journal alerts are actionable and also visible in /admin/operations.
    execFileSync("logger", [
      "-p",
      problems.length ? "daemon.err" : "daemon.notice",
      "-t",
      "haraj-monitor",
      JSON.stringify({ ok: state.ok, problems }),
    ]);
  }
  console.log(JSON.stringify(state));
  process.exitCode = state.ok ? 0 : 1;
})().catch(() => {
  console.error("monitor_failed");
  process.exitCode = 1;
});
