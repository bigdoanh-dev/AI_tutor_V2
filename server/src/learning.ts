import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, one, rows, sql, json, type Executor } from "./db.js";
import { latestBank } from "./content.js";
import {
  chooseQuestion,
  publicQuestion,
  weekKey,
  topicStats,
  algorithmVersion,
  type Bank,
  type AttemptData,
  type Answer,
} from "./domain.js";
import { digest } from "./auth.js";
export const createAttemptSchema = z
  .object({
    courseId: z.string().default("cntt"),
    mode: z.enum(["adaptive", "fixed"]).default("adaptive"),
    topic: z.string().default(""),
    count: z.number().int().min(1).max(10).default(5),
    pool: z
      .array(z.number().int().positive())
      .max(200)
      .nullable()
      .default(null),
    requestId: z.uuid(),
  })
  .strict();
export const commandSchema = z
  .object({
    requestId: z.uuid(),
    revision: z.number().int().positive(),
    questionId: z.number().int().positive().optional(),
    selected: z.number().int().min(0).max(7).optional(),
    flagged: z.boolean().optional(),
    index: z.number().int().min(0).optional(),
  })
  .strict();
export async function history(
  user: string,
  course: string,
  executor: Executor = db,
) {
  const records = await rows(
    sql`SELECT * FROM attempts WHERE user_id=${user} AND course_id=${course} AND status='submitted' ORDER BY submitted_at,id`,
    executor,
  );
  return records.map((r) => ({
    id: r.id,
    at: r.submitted_at,
    mode: r.mode,
    topic: r.data.topic,
    answers: r.data.result.map((a: Answer) => ({
      ...a,
      sessionId: r.id,
    })) as Answer[],
    elapsedMs: r.data.elapsedMs,
    releaseId: r.release_id,
    algorithmVersion: r.algorithm_version,
  }));
}
export function recommendations(bank: Bank, answers: Answer[], read: string[]) {
  return topicStats(bank, answers)
    .sort((a, b) => {
      const priority = (t: ReturnType<typeof topicStats>[number]) =>
        t.total ? (t.accuracy! < 80 ? 0 : 2) : 1;
      return (
        priority(a) - priority(b) ||
        (a.accuracy ?? 50) - (b.accuracy ?? 50) ||
        Number(read.includes(a.id)) - Number(read.includes(b.id)) ||
        a.id.localeCompare(b.id)
      );
    })
    .map((t) => ({
      materialId: t.id,
      topicId: t.id,
      title: t.lesson,
      accuracy: t.accuracy,
      reason: t.total
        ? `${t.accuracy}% đúng trong ${t.recent} lượt gần nhất`
        : "Chủ đề chưa được đánh giá",
      read: read.includes(t.id),
    }));
}
export async function event(
  user: string,
  course: string,
  type: string,
  data: unknown,
  attempt: string | null = null,
  executor: Executor = db,
) {
  await executor.execute(
    sql`INSERT INTO events(id,user_id,course_id,attempt_id,type,data,operational) VALUES (${randomUUID()},${user},${course},${attempt},${type},${json(data)},true)`,
  );
}
export function serializeAttempt(a: any, bank: Bank) {
  const d = a.data as AttemptData;
  return {
    ...d,
    result: undefined,
    fixedOrder: undefined,
    decisions: undefined,
    id: a.id,
    mode: a.mode,
    revision: a.revision,
    status: a.status,
    courseId: a.course_id,
    releaseId: a.release_id,
    algorithmVersion: a.algorithm_version,
    questions: d.ids.map((id) =>
      publicQuestion(bank.questions.find((q) => q.id === id)!),
    ),
  };
}
export async function ownedAttempt(user: string, id: string) {
  z.uuid().parse(id);
  const a = await one(
    sql`SELECT a.*,b.data AS bank FROM attempts a JOIN bank_releases b ON b.id=a.release_id WHERE a.id=${id} AND a.user_id=${user}`,
  );
  if (!a) throw new NotFoundException();
  return a;
}
export async function createAttempt(user: string, raw: unknown) {
  const b = createAttemptSchema.parse(raw);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${user + ":" + b.courseId},0))`,
    );
    const replay = await one(
      sql`SELECT a.*,r.data AS bank FROM attempts a JOIN bank_releases r ON r.id=a.release_id WHERE a.user_id=${user} AND request_id=${b.requestId}`,
      tx,
    );
    if (replay) {
      if (
        replay.creation_hash &&
        replay.creation_hash !== digest(JSON.stringify(b))
      )
        throw new ConflictException("Mã yêu cầu đã dùng với cấu hình bài khác");
      return serializeAttempt(replay, replay.bank);
    }
    const active = await one(
      sql`SELECT id FROM attempts WHERE user_id=${user} AND course_id=${b.courseId} AND status='active'`,
      tx,
    );
    if (active)
      throw new ConflictException({
        message: "Bạn có bài đang làm. Hãy tiếp tục hoặc bỏ bài cũ.",
        attemptId: active.id,
      });
    let release = await latestBank(b.courseId),
      bank: Bank = release.data;
    let eligible = bank.questions.filter(
      (q) =>
        (!b.topic || q.topic === b.topic) && (!b.pool || b.pool.includes(q.id)),
    );
    let template: any;
    const d: AttemptData = {
      topic: b.topic,
      count: Math.min(b.count, eligible.length),
      pool: b.pool,
      ids: [],
      index: 0,
      answers: {},
      flagged: [],
      elapsedMs: 0,
      responseMs: {},
      decisions: [],
      paused: false,
    };
    if (b.mode === "fixed") {
      if (b.pool)
        throw new BadRequestException("Luyện lại chỉ hỗ trợ chế độ thích ứng");
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${b.courseId + weekKey() + b.topic + b.count},1))`,
      );
      template = await one(
        sql`SELECT t.*,r.data AS bank FROM weekly_templates t JOIN bank_releases r ON r.id=t.release_id WHERE t.course_id=${b.courseId} AND week=${weekKey()} AND topic=${b.topic} AND requested_count=${b.count}`,
        tx,
      );
      if (template) {
        bank = template.bank;
        release = { ...release, id: template.release_id };
      } else {
        if (!eligible.length)
          throw new BadRequestException("Chưa có câu hỏi phù hợp");
        eligible.sort((a, b) => a.id - b.id);
        const offset =
          Math.floor(new Date(weekKey() + "T00:00Z").getTime() / 604800000) %
          eligible.length;
        const ids = [...eligible.slice(offset), ...eligible.slice(0, offset)]
          .slice(0, d.count)
          .map((q) => q.id);
        template = { id: randomUUID(), question_ids: ids };
        await tx.execute(
          sql`INSERT INTO weekly_templates(id,course_id,week,topic,requested_count,release_id,question_ids) VALUES (${template.id},${b.courseId},${weekKey()},${b.topic},${b.count},${release.id},${json(ids)})`,
        );
      }
      d.fixedOrder = template.question_ids;
      d.count = template.question_ids.length;
    }
    if (!d.count) throw new BadRequestException("Chưa có câu hỏi phù hợp");
    const past = (await history(user, b.courseId, tx)).flatMap(
      (s) => s.answers,
    );
    const chosen = chooseQuestion(bank, d, past, b.mode)!;
    d.ids.push(chosen.q.id);
    d.decisions.push({ questionId: chosen.q.id, reason: chosen.reason });
    const a = await one(
      sql`INSERT INTO attempts(id,user_id,course_id,release_id,template_id,mode,algorithm_version,request_id,creation_hash,data,heartbeat_at)
      VALUES (${randomUUID()},${user},${b.courseId},${release.id},${template?.id || null},${b.mode},${algorithmVersion},${b.requestId},${digest(JSON.stringify(b))},${json(d)},now()) RETURNING *`,
      tx,
    );
    await event(
      user,
      b.courseId,
      "quiz_started",
      {
        mode: b.mode,
        releaseId: release.id,
        algorithmVersion,
        firstDecision: d.decisions[0],
      },
      a!.id,
      tx,
    );
    return serializeAttempt(a, bank);
  });
}
export async function commandAttempt(
  user: string,
  id: string,
  action: string,
  raw: unknown,
) {
  z.uuid().parse(id);
  const b = commandSchema.parse(raw);
  const hash = digest(JSON.stringify({ action, ...b }));
  return db.transaction(async (tx) => {
    const a = await one(
      sql`SELECT a.*,r.data AS bank FROM attempts a JOIN bank_releases r ON r.id=a.release_id WHERE a.id=${id} AND a.user_id=${user} FOR UPDATE OF a`,
      tx,
    );
    if (!a) throw new NotFoundException();
    const used = await one(
      sql`SELECT body_hash FROM attempt_commands WHERE attempt_id=${id} AND request_id=${b.requestId}`,
      tx,
    );
    if (used) {
      if (used.body_hash !== hash)
        throw new ConflictException("Mã yêu cầu đã dùng cho thao tác khác");
      return serializeAttempt(a, a.bank);
    }
    if (action === "submit" && a.status === "submitted")
      return serializeAttempt(a, a.bank);
    if (a.status !== "active") throw new ConflictException("Bài đã kết thúc");
    if (b.revision !== a.revision)
      throw new ConflictException(
        "Bài đã thay đổi trên thiết bị khác. Hãy tải lại.",
      );
    const d = a.data as AttemptData,
      bank = a.bank as Bank;
    if (!d.paused && a.heartbeat_at) {
      const elapsed = Math.max(
        0,
        Math.min(20000, Date.now() - new Date(a.heartbeat_at).getTime()),
      );
      const currentId = d.ids[d.index];
      d.elapsedMs += elapsed;
      d.responseMs[currentId] = (d.responseMs[currentId] || 0) + elapsed;
    }
    const tracking = await one(
      sql`SELECT logging FROM users WHERE id=${user}`,
      tx,
    );
    if (action === "answer") {
      const q = bank.questions.find(
        (q) => q.id === b.questionId && d.ids.includes(q.id),
      );
      if (!q || (b.selected !== undefined && b.selected >= q.options.length))
        throw new BadRequestException("Đáp án không hợp lệ");
      if (b.selected !== undefined) d.answers[q.id] = b.selected;
      if (b.flagged !== undefined)
        d.flagged = b.flagged
          ? [...new Set([...d.flagged, q.id])]
          : d.flagged.filter((x) => x !== q.id);
      if (tracking?.logging)
        await tx.execute(
          sql`INSERT INTO events(id,user_id,course_id,attempt_id,type,data) VALUES (${randomUUID()},${user},${a.course_id},${id},'answer_selected',${json({ questionId: q.id, selected: b.selected, flagged: b.flagged })})`,
        );
    } else if (action === "next") {
      if (d.answers[d.ids[d.index]] === undefined)
        throw new BadRequestException("Chọn đáp án trước khi tiếp tục");
      if (d.index === d.ids.length - 1 && d.ids.length < d.count) {
        const past = (await history(user, a.course_id, tx)).flatMap(
          (s) => s.answers,
        );
        const chosen = chooseQuestion(bank, d, past, a.mode);
        if (!chosen)
          throw new ConflictException("Ngân hàng không còn câu phù hợp");
        d.ids.push(chosen.q.id);
        d.decisions.push({ questionId: chosen.q.id, reason: chosen.reason });
        await event(
          user,
          a.course_id,
          "question_issued",
          { ...d.decisions.at(-1), algorithmVersion: a.algorithm_version },
          id,
          tx,
        );
      }
      d.index = Math.min(d.index + 1, d.ids.length - 1);
      d.paused = false;
    } else if (action === "navigate") {
      if (b.index === undefined || b.index >= d.ids.length)
        throw new BadRequestException();
      d.index = b.index;
      d.paused = false;
    } else if (action === "pause") d.paused = true;
    else if (action === "resume") d.paused = false;
    else if (action === "submit") {
      if (
        d.ids.length !== d.count ||
        d.ids.some((id) => d.answers[id] === undefined)
      )
        throw new BadRequestException("Hãy hoàn thành tất cả câu hỏi");
      d.result = d.ids.map((questionId) => {
        const q = bank.questions.find((q) => q.id === questionId)!;
        return {
          questionId,
          topic: q.topic,
          level: q.level,
          selected: d.answers[questionId],
          correct: d.answers[questionId] === q.answer,
          flagged: d.flagged.includes(questionId),
          responseMs: d.responseMs[questionId] || 0,
          question: q,
        };
      });
      d.paused = true;
      await event(
        user,
        a.course_id,
        "quiz_submitted",
        {
          releaseId: a.release_id,
          correct: d.result.filter((a) => a.correct).length,
          count: d.count,
        },
        id,
        tx,
      );
    } else if (action !== "abandon") throw new BadRequestException();
    if (tracking?.logging && ["next", "navigate", "resume"].includes(action))
      await tx.execute(
        sql`INSERT INTO events(id,user_id,course_id,attempt_id,type,data) VALUES (${randomUUID()},${user},${a.course_id},${id},'question_viewed',${json({ questionId: d.ids[d.index] })})`,
      );
    const status =
      action === "submit"
        ? "submitted"
        : action === "abandon"
          ? "abandoned"
          : "active";
    const updated = await one(
      sql`UPDATE attempts SET data=${json(d)},revision=revision+1,status=${status},
      submitted_at=CASE WHEN ${status}='submitted' THEN now() ELSE submitted_at END,heartbeat_at=now() WHERE id=${id} RETURNING *`,
      tx,
    );
    await tx.execute(
      sql`INSERT INTO attempt_commands(attempt_id,request_id,body_hash) VALUES (${id},${b.requestId},${hash})`,
    );
    return serializeAttempt(updated, bank);
  });
}
export async function heartbeat(user: string, id: string, raw: unknown) {
  z.uuid().parse(id);
  const b = z
    .object({ questionId: z.number().int(), visible: z.boolean() })
    .strict()
    .parse(raw);
  await db.transaction(async (tx) => {
    const a = await one(
      sql`SELECT * FROM attempts WHERE id=${id} AND user_id=${user} FOR UPDATE`,
      tx,
    );
    if (!a) throw new NotFoundException();
    const d = a.data as AttemptData;
    if (a.status !== "active" || d.paused || d.ids[d.index] !== b.questionId)
      return;
    const elapsed = a.heartbeat_at
      ? Math.max(
          0,
          Math.min(20000, Date.now() - new Date(a.heartbeat_at).getTime()),
        )
      : 0;
    d.elapsedMs += elapsed;
    d.responseMs[b.questionId] = (d.responseMs[b.questionId] || 0) + elapsed;
    await tx.execute(
      sql`UPDATE attempts SET data=${json(d)},heartbeat_at=${b.visible ? new Date().toISOString() : null} WHERE id=${id}`,
    );
  });
  return { ok: true };
}
