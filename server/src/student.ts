import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Req,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiBody } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { db, one, rows, sql, json } from "./db.js";
import { AuthGuard, type AuthRequest } from "./auth.js";
import { latestBank, publicCatalog, materialFile } from "./content.js";
import {
  defaultPlan,
  planSchema,
  calendar,
  upcoming,
  topicStats,
} from "./domain.js";
import {
  createAttempt,
  commandAttempt,
  ownedAttempt,
  serializeAttempt,
  history,
  recommendations,
  event,
  heartbeat,
  createAttemptSchema,
  commandSchema,
} from "./learning.js";
const courseId = (value: unknown) =>
  z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default("cntt")
    .parse(value);
export async function getPlan(user: string, course: string) {
  const p = await one(
    sql`SELECT * FROM study_plans WHERE user_id=${user} AND course_id=${course}`,
  );
  return { ...defaultPlan, ...p?.data, revision: p?.revision || 0 };
}
export async function getRecommendations(user: string, course: string) {
  const [bank, sessions, states] = await Promise.all([
    latestBank(course),
    history(user, course),
    rows(
      sql`SELECT * FROM material_states WHERE user_id=${user} AND course_id=${course}`,
    ),
  ]);
  return recommendations(
    bank.data,
    sessions.flatMap((s) => s.answers),
    states.filter((s) => s.read).map((s) => s.material_id),
  );
}
@ApiTags("Student")
@ApiCookieAuth("nexus_session")
@UseGuards(AuthGuard)
@Controller()
export class StudentController {
  @Get(["me", "auth/session"])
  me(@Req() req: AuthRequest) {
    return { user: req.user, csrf: req.auth.csrf };
  }
  @Post("auth/logout")
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await db.execute(
      sql`DELETE FROM auth_sessions WHERE token_hash=${req.auth.token_hash}`,
    );
    res.clearCookie("nexus_session", { path: "/" });
    return { ok: true };
  }
  @Patch("me")
  async profile(@Req() req: AuthRequest, @Body() raw: unknown) {
    const b = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        logging: z.boolean().optional(),
      })
      .strict()
      .parse(raw);
    await db.transaction(async (tx) => {
      if (b.name !== undefined)
        await tx.execute(
          sql`UPDATE users SET name=${b.name} WHERE id=${req.user.id}`,
        );
      if (b.logging !== undefined)
        await tx.execute(
          sql`UPDATE users SET logging=${b.logging} WHERE id=${req.user.id}`,
        );
    });
    return { ok: true };
  }
  @Get("courses")
  courses() {
    return rows(sql`SELECT id,name FROM courses ORDER BY id`);
  }
  @Get("workspace")
  async workspace(@Req() req: AuthRequest, @Query("courseId") c?: string) {
    const course = courseId(c),
      user = req.user.id;
    const [catalog, sessions, states, plan, active, chats, notifications] =
      await Promise.all([
        publicCatalog(course),
        history(user, course),
        rows(
          sql`SELECT * FROM material_states WHERE user_id=${user} AND course_id=${course}`,
        ),
        getPlan(user, course),
        one(
          sql`SELECT a.*,r.data AS bank FROM attempts a JOIN bank_releases r ON r.id=a.release_id WHERE a.user_id=${user} AND a.course_id=${course} AND status='active'`,
        ),
        rows(
          sql`SELECT id,title,created_at AS at FROM conversations WHERE user_id=${user} AND course_id=${course} ORDER BY created_at DESC LIMIT 30`,
        ),
        rows(
          sql`SELECT id,title,body,read_at,due_at,email_status FROM notifications WHERE user_id=${user} AND course_id=${course} ORDER BY created_at DESC LIMIT 50`,
        ),
      ]);
    return {
      catalog,
      csrf: req.auth.csrf,
      user: req.user,
      state: {
        participantId: user,
        name: req.user.name,
        logging: req.user.logging,
        recommendations: await getRecommendations(user, course),
        sessions,
        read: states.filter((s) => s.read).map((s) => s.material_id),
        saved: states.filter((s) => s.saved).map((s) => s.material_id),
        days: plan.days,
        reminder: plan.reminder,
        weekGoal: plan.weekGoal,
        plan,
        events: [],
        draft: active ? serializeAttempt(active, active.bank) : null,
        chats,
        activeChatId: null,
        notifications,
      },
    };
  }
  @Get("topics")
  async topics(@Query("courseId") c?: string) {
    return (await publicCatalog(courseId(c))).topics;
  }
  @Get("materials")
  async materials(
    @Req() req: AuthRequest,
    @Query() query: Record<string, string>,
  ) {
    const course = courseId(query.courseId),
      bank = await latestBank(course);
    const states = await rows(
      sql`SELECT * FROM material_states WHERE user_id=${req.user.id} AND course_id=${course}`,
    );
    return bank.data.topics
      .map((t) => ({
        ...t,
        saved: !!states.find((s) => s.material_id === t.id)?.saved,
        read: !!states.find((s) => s.material_id === t.id)?.read,
      }))
      .filter(
        (t) =>
          (!query.topic || t.id === query.topic) &&
          (!query.q ||
            (t.name + " " + t.lesson)
              .toLowerCase()
              .includes(query.q.toLowerCase())) &&
          (query.saved !== "true" || t.saved),
      );
  }
  @Get("materials/:id/source")
  async file(
    @Param("id") id: string,
    @Query("courseId") c: string | undefined,
    @Query("releaseId") r: string | undefined,
    @Res() res: Response,
  ) {
    if (r) z.uuid().parse(r);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(await materialFile(courseId(c), id, r));
  }
  @Get("materials/:id")
  async material(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Query("courseId") c?: string,
  ) {
    const course = courseId(c),
      bank = await latestBank(course),
      t = bank.data.topics.find((t) => t.id === id);
    if (!t) throw new NotFoundException();
    if (req.user.logging)
      await event(req.user.id, course, "resource_viewed", {
        materialId: id,
        releaseId: bank.id,
      });
    return { ...t, releaseId: bank.id };
  }
  @Put("materials/:id/state")
  async materialState(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Query("courseId") c: string | undefined,
    @Body() raw: unknown,
  ) {
    const b = z
        .object({ saved: z.boolean(), read: z.boolean() })
        .strict()
        .parse(raw),
      course = courseId(c);
    if (!(await latestBank(course)).data.topics.some((t) => t.id === id))
      throw new NotFoundException();
    await db.execute(sql`INSERT INTO material_states(user_id,course_id,material_id,saved,read) VALUES (${req.user.id},${course},${id},${b.saved},${b.read})
      ON CONFLICT(user_id,course_id,material_id) DO UPDATE SET saved=excluded.saved,read=excluded.read`);
    return b;
  }
  @Post("attempts")
  @ApiBody({
    schema: z.toJSONSchema(createAttemptSchema, { io: "input" }) as any,
  })
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    return createAttempt(req.user.id, body);
  }
  @Get("attempts/active")
  async active(@Req() req: AuthRequest, @Query("courseId") c?: string) {
    const a = await one(
      sql`SELECT a.*,r.data AS bank FROM attempts a JOIN bank_releases r ON r.id=a.release_id WHERE a.user_id=${req.user.id} AND a.course_id=${courseId(c)} AND status='active'`,
    );
    return a ? serializeAttempt(a, a.bank) : null;
  }
  @Get("attempts")
  attempts(@Req() req: AuthRequest, @Query("courseId") c?: string) {
    return history(req.user.id, courseId(c));
  }
  @Get("attempts/:id/result")
  async result(@Req() req: AuthRequest, @Param("id") id: string) {
    const a = await ownedAttempt(req.user.id, id);
    if (a.status !== "submitted") throw new NotFoundException("Chưa nộp bài");
    return {
      id: a.id,
      at: a.submitted_at,
      mode: a.mode,
      topic: a.data.topic,
      elapsedMs: a.data.elapsedMs,
      answers: a.data.result,
    };
  }
  @Get("attempts/:id")
  async attempt(@Req() req: AuthRequest, @Param("id") id: string) {
    const a = await ownedAttempt(req.user.id, id);
    return serializeAttempt(a, a.bank);
  }
  @Post("attempts/:id/heartbeat")
  beat(@Req() req: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return heartbeat(req.user.id, id, b);
  }
  @Post("attempts/:id/:action")
  @ApiBody({ schema: z.toJSONSchema(commandSchema, { io: "input" }) as any })
  command(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() b: unknown,
  ) {
    return commandAttempt(req.user.id, id, action, b);
  }
  @Get("review-items")
  async review(
    @Req() req: AuthRequest,
    @Query("courseId") c: string | undefined,
    @Query("filter") filter?: string,
  ) {
    const latest = new Map(
      (await history(req.user.id, courseId(c)))
        .flatMap((s) => s.answers)
        .map((a) => [a.questionId, a]),
    );
    return [...latest.values()].filter((a) =>
      filter === "flagged" ? a.flagged : !a.correct,
    );
  }
  @Get(["dashboard", "progress"])
  async progress(
    @Req() req: AuthRequest,
    @Query("courseId") c: string | undefined,
    @Query("scope") scope?: string,
  ) {
    const course = courseId(c),
      bank = await latestBank(course),
      all = await history(req.user.id, course),
      sessions = scope === "recent" ? all.slice(-3) : all;
    return {
      sessions,
      topics: topicStats(
        bank.data,
        sessions.flatMap((s) => s.answers),
      ),
      recommendations: await getRecommendations(req.user.id, course),
    };
  }
  @Get("recommendations")
  async recs(@Req() req: AuthRequest, @Query("courseId") c?: string) {
    const course = courseId(c),
      r = await getRecommendations(req.user.id, course);
    await event(req.user.id, course, "recommendations_shown", {
      items: r.map((r) => ({ materialId: r.materialId, reason: r.reason })),
    });
    return r;
  }
  @Get("study-plan/suggestion")
  async suggestion(@Req() req: AuthRequest, @Query("courseId") c?: string) {
    return {
      ...defaultPlan,
      enabled: true,
      email: true,
      durationMinutes: 15,
      timezone: "Asia/Ho_Chi_Minh",
      recommendations: await getRecommendations(req.user.id, courseId(c)),
    };
  }
  @Get("study-plan/calendar.ics")
  async calendar(
    @Req() req: AuthRequest,
    @Query("courseId") c: string | undefined,
    @Res() res: Response,
  ) {
    res
      .type("text/calendar")
      .attachment("nexus-lich-on-tap.ics")
      .send(calendar(await getPlan(req.user.id, courseId(c))));
  }
  @Get("study-plan")
  async plan(@Req() req: AuthRequest, @Query("courseId") c?: string) {
    const course = courseId(c),
      plan = await getPlan(req.user.id, course);
    return {
      ...plan,
      upcoming: upcoming(plan),
      recommendations: await getRecommendations(req.user.id, course),
    };
  }
  @Put("study-plan")
  @ApiBody({ schema: z.toJSONSchema(planSchema, { io: "input" }) as any })
  async savePlan(
    @Req() req: AuthRequest,
    @Query("courseId") c: string | undefined,
    @Body() raw: unknown,
  ) {
    const b = planSchema.parse(raw),
      course = courseId(c);
    await latestBank(course);
    const p =
      await one(sql`INSERT INTO study_plans(user_id,course_id,data) VALUES (${req.user.id},${course},${json(b)})
      ON CONFLICT(user_id,course_id) DO UPDATE SET data=excluded.data,revision=study_plans.revision+1 RETURNING revision`);
    return { ...b, revision: p!.revision };
  }
  @Get("notifications")
  notifications(@Req() req: AuthRequest) {
    return rows(
      sql`SELECT id,title,body,due_at,read_at,email_status FROM notifications WHERE user_id=${req.user.id} ORDER BY created_at DESC LIMIT 100`,
    );
  }
  @Post("notifications/:id/read")
  async read(@Req() req: AuthRequest, @Param("id") id: string) {
    z.uuid().parse(id);
    const n = await one(
      sql`UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=${id} AND user_id=${req.user.id} RETURNING *`,
    );
    if (!n) throw new NotFoundException();
    await event(req.user.id, n.course_id, "notification_opened", {
      notificationId: id,
    });
    return { ok: true };
  }
  @Post("events")
  async log(@Req() req: AuthRequest, @Body() raw: unknown) {
    const b = z
      .object({
        courseId: z.string().default("cntt"),
        events: z
          .array(
            z.object({
              id: z.uuid(),
              type: z.enum([
                "resource_viewed",
                "question_viewed",
                "answer_selected",
                "quiz_paused",
                "tutor_question",
                "recommendation_opened",
              ]),
              attemptId: z.uuid().nullable().optional(),
              data: z
                .record(
                  z.string(),
                  z.union([
                    z.string().max(200),
                    z.number(),
                    z.boolean(),
                    z.null(),
                  ]),
                )
                .default({}),
            }),
          )
          .max(100),
      })
      .strict()
      .parse(raw);
    if (!req.user.logging) return { accepted: 0 };
    await latestBank(b.courseId);
    await db.transaction(async (tx) => {
      for (const e of b.events) {
        if (
          e.attemptId &&
          !(await one(
            sql`SELECT id FROM attempts WHERE id=${e.attemptId} AND user_id=${req.user.id}`,
            tx,
          ))
        )
          throw new NotFoundException();
        await tx.execute(
          sql`INSERT INTO events(id,user_id,course_id,attempt_id,type,data) VALUES (${e.id},${req.user.id},${b.courseId},${e.attemptId || null},${e.type},${json(e.data)}) ON CONFLICT(id) DO NOTHING`,
        );
      }
    });
    return { accepted: b.events.length };
  }
  @Get("export")
  async export(
    @Req() req: AuthRequest,
    @Query("format") format: string | undefined,
    @Res() res: Response,
  ) {
    const sessions = await rows(
      sql`SELECT id,course_id,mode,algorithm_version,release_id,data,submitted_at FROM attempts WHERE user_id=${req.user.id} AND status='submitted' ORDER BY submitted_at`,
    );
    const events = await rows(
      sql`SELECT id,type,data,operational,created_at FROM events WHERE user_id=${req.user.id} ORDER BY created_at`,
    );
    if (format === "csv") {
      const escape = (v: unknown) =>
        '"' +
        String(v ?? "")
          .replace(/^[=+@-]/, "' $&")
          .replaceAll('"', '""') +
        '"';
      const head = [
        "sessionId",
        "courseId",
        "mode",
        "questionId",
        "selected",
        "correct",
        "flagged",
        "responseMs",
      ];
      const lines = sessions.flatMap((s) =>
        s.data.result.map((a: any) =>
          [
            s.id,
            s.course_id,
            s.mode,
            a.questionId,
            a.selected,
            a.correct,
            a.flagged,
            a.responseMs,
          ]
            .map(escape)
            .join(","),
        ),
      );
      res
        .type("text/csv")
        .attachment("nexus-learning.csv")
        .send("\uFEFF" + [head.join(","), ...lines].join("\r\n"));
    } else
      res
        .type("application/json")
        .attachment("nexus-learning.json")
        .send(
          JSON.stringify(
            { schemaVersion: 3, participantId: req.user.id, sessions, events },
            null,
            2,
          ),
        );
  }
}
