import "reflect-metadata";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgres://nexus:nexus_local@127.0.0.1:5437/nexus_test";
if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
  throw new Error("Integration DB name must end with _test");
execFileSync(process.execPath, ["--import", "tsx", "src/migrate.ts"], {
  env: process.env,
  stdio: "pipe",
});
const { db, one, rows, sql, pool } = await import("../src/db.js");
const { bootstrap } = await import("../src/main.js");
const { importBank } = await import("../src/content.js");
const { scanReminders, drainMail } = await import("../src/worker.js");
const { jobs } = await import("../src/jobs.js");
const app = await bootstrap(0),
  url = await app.getUrl(),
  origin = process.env.APP_URL || "http://127.0.0.1:5173";
type Client = { cookie: string; csrf: string; userId: string };
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  client?: Client,
  headers: Record<string, string> = {},
) {
  const res = await fetch(url + "/api/v1" + path, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(client ? { Cookie: client.cookie, "x-csrf-token": client.csrf } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return {
    status: res.status,
    data,
    cookie: res.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
const password = "Nexus-test-password-123!";
async function account() {
  const email = `test-${randomUUID()}@example.test`;
  assert.equal(
    (
      await request("/auth/register", "POST", {
        email,
        password,
        name: "Sinh viên thử nghiệm",
      })
    ).status,
    201,
  );
  assert.equal(
    (await request("/auth/login", "POST", { email, password })).status,
    403,
  );
  const mail = await one(
    sql`SELECT m.body FROM mail_outbox m JOIN users u ON u.email=m.recipient WHERE u.email=${email} ORDER BY m.created_at DESC LIMIT 1`,
  );
  const token = mail!.body.match(/auth\/verify\/([a-f0-9]+)/)[1];
  assert.equal((await request("/auth/verify", "POST", { token })).status, 201);
  assert.equal((await request("/auth/verify", "POST", { token })).status, 400);
  const login = await request("/auth/login", "POST", { email, password });
  assert.equal(login.status, 201);
  return {
    cookie: login.cookie,
    csrf: login.data.csrf,
    userId: login.data.user.id,
    email,
  };
}
after(async () => {
  await app.close();
  await jobs.close();
  await pool.end();
});
test("student lifecycle, ownership, idempotency, templates, reminders, mail, and 50 concurrent reads", async () => {
  const a = await account(),
    b = await account(),
    course = "test-" + randomUUID().slice(0, 8);
  const source = {
    id: "approved",
    title: "Tài liệu duyệt",
    page: 1,
    file: "ds.md",
  };
  const bank: any = {
    course: { id: course, name: "Test course" },
    version: "1",
    demo: false,
    approved: true,
    topics: [
      {
        id: "ds",
        name: "Cấu trúc dữ liệu",
        lesson: "Stack và Queue",
        minutes: 8,
        sections: [["Stack", "Stack dùng LIFO"]],
        source,
      },
    ],
    questions: Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      topic: "ds",
      level: (i % 3) + 1,
      stem: `Câu ${i + 1}`,
      options: ["Đúng", "Sai"],
      answer: 0,
      explanation: "Giải thích đáp án",
      wrong: [null, "Sai vì..."],
      skills: ["stack"],
      source,
    })),
  };
  const sources = new URL(
    "../data/demo-sources/",
    import.meta.url,
  ).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  assert.equal(
    (await importBank(bank, decodeURIComponent(sources), true)).valid,
    true,
  );
  await importBank(bank, decodeURIComponent(sources));
  assert.equal(
    (
      await request(
        "/attempts",
        "POST",
        { courseId: course, count: 2, requestId: randomUUID() },
        a,
        { "x-csrf-token": "wrong" },
      )
    ).status,
    403,
  );
  const creation = {
    courseId: course,
    mode: "adaptive",
    count: 2,
    requestId: randomUUID(),
  };
  let attempt = (await request("/attempts", "POST", creation, a)).data;
  assert.ok(attempt.id, JSON.stringify(attempt));
  assert.equal(attempt.questions[0].answer, undefined);
  assert.equal(
    (await request("/attempts", "POST", creation, a)).data.id,
    attempt.id,
  );
  assert.equal(
    (await request("/attempts", "POST", { ...creation, count: 3 }, a)).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/attempts",
        "POST",
        { ...creation, requestId: randomUUID() },
        a,
      )
    ).status,
    409,
  );
  assert.equal(
    (await request(`/attempts/${attempt.id}`, "GET", undefined, b)).status,
    404,
  );
  assert.equal(
    (await request(`/attempts/${attempt.id}/result`, "GET", undefined, a))
      .status,
    404,
  );
  const command = async (action: string, body: object = {}) => {
    const out = await request(
      `/attempts/${attempt.id}/${action}`,
      "POST",
      { revision: attempt.revision, requestId: randomUUID(), ...body },
      a,
    );
    assert.equal(out.status, 201, JSON.stringify(out.data));
    attempt = out.data;
    return out;
  };
  const first = attempt.ids[0];
  assert.equal(
    (
      await request(
        `/attempts/${attempt.id}/heartbeat`,
        "POST",
        { questionId: first, visible: true },
        a,
      )
    ).status,
    201,
  );
  await command("answer", { questionId: first, selected: 1 });
  const stale = attempt.revision;
  await command("pause");
  assert.equal(
    (
      await request(
        `/attempts/${attempt.id}/resume`,
        "POST",
        { revision: stale, requestId: randomUUID() },
        a,
      )
    ).status,
    409,
  );
  await command("resume");
  await command("next");
  assert.notEqual(attempt.ids[1], first);
  const second = attempt.ids[1];
  await command("answer", { questionId: second, selected: 0, flagged: true });
  await command("navigate", { index: 0 });
  await command("answer", { questionId: first, selected: 0 });
  assert.equal(attempt.ids[1], second);
  const submit = { revision: attempt.revision, requestId: randomUUID() };
  const submissions = await Promise.all([
    request(`/attempts/${attempt.id}/submit`, "POST", submit, a),
    request(`/attempts/${attempt.id}/submit`, "POST", submit, a),
  ]);
  assert.ok(submissions.every((r) => r.status === 201));
  const result = (
    await request(`/attempts/${attempt.id}/result`, "GET", undefined, a)
  ).data;
  assert.equal(result.answers.filter((r: any) => r.correct).length, 2);
  assert.equal(result.answers[0].question.answer, 0);
  assert.equal(
    (
      await request(
        `/attempts/${attempt.id}/answer`,
        "POST",
        {
          revision: attempt.revision,
          requestId: randomUUID(),
          questionId: first,
          selected: 1,
        },
        a,
      )
    ).status,
    409,
  );
  const conv = (
    await request(
      "/conversations",
      "POST",
      {
        courseId: course,
        context: { attemptId: attempt.id, questionId: first },
      },
      a,
    )
  ).data;
  assert.equal(
    (await request(`/conversations/${conv.id}/messages`, "GET", undefined, b))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        `/conversations/${conv.id}/messages`,
        "POST",
        { text: "Giải thích", requestId: randomUUID() },
        a,
      )
    ).status,
    503,
  );
  const fixed = (
    await request(
      "/attempts",
      "POST",
      { courseId: course, mode: "fixed", count: 5, requestId: randomUUID() },
      a,
    )
  ).data;
  await request(
    `/attempts/${fixed.id}/abandon`,
    "POST",
    { revision: fixed.revision, requestId: randomUUID() },
    a,
  );
  await importBank(
    {
      ...bank,
      version: "2",
      questions: [...bank.questions, { ...bank.questions[0], id: 99 }],
    },
    decodeURIComponent(sources),
  );
  const fixed2 = (
    await request(
      "/attempts",
      "POST",
      { courseId: course, mode: "fixed", count: 5, requestId: randomUUID() },
      b,
    )
  ).data;
  assert.equal(fixed2.releaseId, fixed.releaseId);
  assert.equal(fixed2.ids[0], fixed.ids[0]);
  await request(
    `/materials/ds/state?courseId=${course}`,
    "PUT",
    { saved: true, read: true },
    a,
  );
  assert.equal(
    (
      await request(
        `/materials?courseId=${course}&saved=true`,
        "GET",
        undefined,
        a,
      )
    ).data.length,
    1,
  );
  assert.equal(
    (
      await request(
        `/materials?courseId=${course}&saved=true`,
        "GET",
        undefined,
        b,
      )
    ).data.length,
    0,
  );
  const fakeNow = new Date("2026-10-30T12:00:30Z");
  const plan = {
    days: ["T6"],
    reminder: "19:00",
    weekGoal: 3,
    enabled: true,
    email: true,
  };
  assert.equal(
    (await request(`/study-plan?courseId=${course}`, "PUT", plan, a)).status,
    200,
  );
  await scanReminders(fakeNow);
  await scanReminders(fakeNow);
  let notes = await rows(
    sql`SELECT * FROM notifications WHERE user_id=${a.userId}`,
  );
  assert.equal(notes.length, 1);
  await request(
    `/study-plan?courseId=${course}`,
    "PUT",
    { ...plan, enabled: false },
    a,
  );
  await drainMail();
  notes = await rows(
    sql`SELECT * FROM notifications WHERE user_id=${a.userId}`,
  );
  assert.equal(notes[0].email_status, "cancelled");
  assert.ok(
    (
      await rows(
        sql`SELECT status FROM mail_outbox WHERE recipient=${a.email} AND notification_id IS NULL`,
      )
    ).every((m) => m.status === "sent"),
  );
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const day = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now) + "T00:00Z",
  ).getUTCDay();
  const livePlan = {
    ...plan,
    days: [["CN", "T2", "T3", "T4", "T5", "T6", "T7"][day]],
    reminder: parts,
  };
  await request(`/study-plan?courseId=${course}`, "PUT", livePlan, a);
  await scanReminders(now);
  await drainMail(async () => {
    throw new Error("Simulated SMTP outage");
  });
  const failed = await one(
    sql`SELECT m.* FROM mail_outbox m JOIN notifications n ON n.id=m.notification_id WHERE n.user_id=${a.userId} AND m.status='pending'`,
  );
  assert.ok(failed);
  assert.equal(failed!.attempts, 1);
  await db.execute(
    sql`UPDATE mail_outbox SET status='sending',lease_until=now()-interval '1 minute',available_at=now() WHERE id=${failed!.id}`,
  );
  await drainMail();
  assert.equal(
    (await one(sql`SELECT status FROM mail_outbox WHERE id=${failed!.id}`))!
      .status,
    "sent",
  );
  const mailCount = await one(
    sql`SELECT count(*)::int AS n FROM mail_outbox WHERE notification_id IS NOT NULL AND recipient=${a.email}`,
  );
  await scanReminders(now);
  await drainMail();
  assert.equal(
    (await one(
      sql`SELECT count(*)::int AS n FROM mail_outbox WHERE notification_id IS NOT NULL AND recipient=${a.email}`,
    ))!.n,
    mailCount!.n,
  );
  await request("/me", "PATCH", { logging: true }, b);
  const seen = (await request(`/attempts/${fixed2.id}`, "GET", undefined, b))
    .data;
  await request(
    `/attempts/${seen.id}/answer`,
    "POST",
    {
      revision: seen.revision,
      requestId: randomUUID(),
      questionId: seen.ids[0],
      selected: 0,
    },
    b,
  );
  assert.ok(
    await one(
      sql`SELECT id FROM events WHERE user_id=${b.userId} AND type='answer_selected' AND operational=false`,
    ),
  );
  assert.equal(
    (await request("/auth/forgot-password", "POST", { email: a.email })).status,
    201,
  );
  const resetMail = await one(
    sql`SELECT body FROM mail_outbox WHERE recipient=${a.email} AND subject='Đặt lại mật khẩu NEXUS' ORDER BY created_at DESC LIMIT 1`,
  );
  const token = resetMail!.body.match(/auth\/reset\/([a-f0-9]+)/)[1];
  assert.equal(
    (
      await request("/auth/reset-password", "POST", {
        token,
        password: "Changed-test-password-123!",
      })
    ).status,
    201,
  );
  assert.equal((await request("/me", "GET", undefined, a)).status, 401);
  assert.equal(
    (
      await request("/auth/reset-password", "POST", {
        token,
        password: "Changed-test-password-123!",
      })
    ).status,
    400,
  );
  const renewed = await request("/auth/login", "POST", {
    email: a.email,
    password: "Changed-test-password-123!",
  });
  a.cookie = renewed.cookie;
  a.csrf = renewed.data.csrf;
  const out = await request("/export?format=csv", "GET", undefined, a);
  assert.match(out.data, /sessionId/);
  const start = performance.now(),
    times: number[] = [];
  const loads = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const t = performance.now();
      const r = await request(
        `/progress?courseId=${course}`,
        "GET",
        undefined,
        a,
      );
      times.push(performance.now() - t);
      return r;
    }),
  );
  assert.ok(loads.every((r) => r.status === 200));
  times.sort((a, b) => a - b);
  console.log(
    `50 concurrent progress requests: p95=${Math.round(times[47])}ms total=${Math.round(performance.now() - start)}ms`,
  );
  assert.ok(
    times[47] < 1000,
    "p95 must be under 1 second on local test environment",
  );
});
