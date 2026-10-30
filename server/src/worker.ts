import "reflect-metadata";
import { Worker } from "bullmq";
import nodemailer from "nodemailer";
import { randomUUID, createHash } from "node:crypto";
import { db, one, rows, sql } from "./db.js";
import { jobs, redisConnection } from "./jobs.js";
import { config } from "./config.js";
import { upcoming } from "./domain.js";
import { getRecommendations } from "./student.js";
import { indexRelease } from "./ai.js";
const transport = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE === "true",
  auth: config.SMTP_USER
    ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
    : undefined,
  connectionTimeout: 15000,
  socketTimeout: 30000,
});
export async function scanReminders(now = new Date()) {
  const plans = await rows(
    sql`SELECT p.*,u.email,u.verified FROM study_plans p JOIN users u ON u.id=p.user_id WHERE (p.data->>'enabled')::boolean=true`,
  );
  for (const p of plans) {
    const recs = await getRecommendations(p.user_id, p.course_id);
    for (const d of upcoming(p.data, now, true).filter(
      (d) => d.at <= now && now.getTime() - d.at.getTime() <= 7200000,
    )) {
      await db.transaction(async (tx) => {
        const current = await one(
          sql`SELECT revision,data FROM study_plans WHERE user_id=${p.user_id} AND course_id=${p.course_id} FOR UPDATE`,
          tx,
        );
        if (current?.revision !== p.revision || !current?.data.enabled) return;
        const key = `${p.user_id}:${p.course_id}:${p.revision}:${d.date}:${p.data.reminder}`;
        const title = "Đến giờ ôn tập cùng NEXUS",
          body = `15 phút ôn tập${recs[0] ? ": " + recs[0].title : ""}. ${recs[0]?.reason || ""}`;
        const n = await one(
          sql`INSERT INTO notifications(id,user_id,course_id,occurrence_key,title,body,due_at,plan_revision,email_status)
          VALUES (${randomUUID()},${p.user_id},${p.course_id},${key},${title},${body},${d.at.toISOString()},${p.revision},${p.data.email && p.verified ? "pending" : "disabled"}) ON CONFLICT(occurrence_key) DO NOTHING RETURNING id`,
          tx,
        );
        if (n && p.data.email && p.verified)
          await tx.execute(
            sql`INSERT INTO mail_outbox(id,recipient,subject,body,notification_id) VALUES (${randomUUID()},${p.email},${title},${body + "\n" + config.APP_URL},${n.id})`,
          );
      });
    }
  }
}
export async function drainMail(sendMail = transport.sendMail.bind(transport)) {
  for (let i = 0; i < 100; i++) {
    const mail = await db.transaction(async (tx) =>
      one(
        sql`UPDATE mail_outbox SET status='sending',lease_until=now()+interval '2 minutes',attempts=attempts+1
      WHERE id=(SELECT id FROM mail_outbox WHERE (status='pending' OR (status='sending' AND lease_until<now())) AND available_at<=now() AND attempts<6 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
        tx,
      ),
    );
    if (!mail) break;
    try {
      if (mail.notification_id) {
        const n = await one(
          sql`SELECT n.*,p.revision,p.data FROM notifications n JOIN study_plans p ON p.user_id=n.user_id AND p.course_id=n.course_id WHERE n.id=${mail.notification_id}`,
        );
        if (
          !n ||
          !n.data.enabled ||
          !n.data.email ||
          n.revision !== n.plan_revision ||
          Date.now() - new Date(n.due_at).getTime() > 7200000
        ) {
          await db.execute(
            sql`UPDATE mail_outbox SET status='cancelled',body='' WHERE id=${mail.id}`,
          );
          await db.execute(
            sql`UPDATE notifications SET email_status='cancelled' WHERE id=${mail.notification_id}`,
          );
          continue;
        }
      }
      await sendMail({
        from: config.MAIL_FROM,
        to: mail.recipient,
        subject: mail.subject,
        text: mail.body,
        messageId: `<${mail.id}@nexus>`,
      });
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE mail_outbox SET status='sent',sent_at=now(),body='',lease_until=null WHERE id=${mail.id}`,
        );
        if (mail.notification_id)
          await tx.execute(
            sql`UPDATE notifications SET email_status='sent',email_attempts=${mail.attempts} WHERE id=${mail.notification_id}`,
          );
      });
    } catch (error) {
      await db.execute(
        sql`UPDATE mail_outbox SET status=${mail.attempts >= 6 ? "failed" : "pending"},available_at=now()+${Math.min(3600, 30 * 2 ** mail.attempts)}*interval '1 second',lease_until=null WHERE id=${mail.id}`,
      );
      if (mail.notification_id)
        await db.execute(
          sql`UPDATE notifications SET email_status=${mail.attempts >= 6 ? "failed" : "retrying"},email_attempts=${mail.attempts} WHERE id=${mail.notification_id}`,
        );
      console.error(
        "SMTP failed",
        mail.id,
        error instanceof Error ? error.name : "Error",
      );
    }
  }
}
export async function tick() {
  await scanReminders();
  await drainMail();
  await db.execute(sql`DELETE FROM auth_sessions WHERE expires_at<now()`);
  await db.execute(sql`DELETE FROM auth_tokens WHERE expires_at<now()`);
  await db.execute(sql`DELETE FROM rate_limits WHERE expires_at<now()`);
  if (config.AI_GATEWAY_API_KEY) {
    const missing = await rows(
      sql`SELECT b.id FROM bank_releases b WHERE NOT EXISTS(SELECT 1 FROM document_chunks c WHERE c.release_id=b.id AND model=${config.AI_EMBEDDING_MODEL} AND index_version=${config.AI_INDEX_VERSION})`,
    );
    const fingerprint = createHash("sha256")
      .update(config.AI_EMBEDDING_MODEL + ":" + config.AI_INDEX_VERSION)
      .digest("hex")
      .slice(0, 16);
    for (const r of missing) {
      const jobId = `index-${r.id}-${fingerprint}`;
      const previous = await jobs.getJob(jobId);
      if (previous && (await previous.getState()) === "failed")
        await previous.retry();
      else if (!previous)
        await jobs.add("index", { releaseId: r.id }, { jobId });
    }
  }
}
export async function startWorker() {
  await jobs.upsertJobScheduler(
    "minute",
    { every: 60000 },
    { name: "tick", data: {} },
  );
  const worker = new Worker(
    "nexus",
    async (job) =>
      job.name === "index" ? indexRelease(job.data.releaseId) : tick(),
    { connection: redisConnection, concurrency: 1 },
  );
  worker.on("failed", (job, error) =>
    console.error("Job failed", job?.name, error.name),
  );
  await jobs.add("tick", {});
  const stop = async () => {
    await worker.close();
    await jobs.close();
    process.exit(0);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  console.log("NEXUS worker ready");
  return worker;
}
if (process.argv[1]?.replaceAll("\\", "/").match(/\/worker\.(ts|js)$/))
  await startWorker();
