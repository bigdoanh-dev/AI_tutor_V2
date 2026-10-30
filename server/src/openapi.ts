import type { OpenAPIObject } from "@nestjs/swagger";
import { config } from "./config.js";

// Nest's route discovery is complemented with explicit wire schemas. These also
// describe the hand-written Responses (SSE/calendar/export) that reflection cannot infer.
export function describeApi(document: OpenAPIObject) {
  const object = (
    properties: Record<string, unknown>,
    required = Object.keys(properties),
  ) => ({ type: "object", properties, required });
  const string = { type: "string" },
    boolean = { type: "boolean" },
    integer = { type: "integer" },
    uuid = { type: "string", format: "uuid" };
  const question = object({
    id: integer,
    topic: string,
    level: { type: "integer", minimum: 1, maximum: 3 },
    stem: string,
    options: { type: "array", items: string },
    skills: { type: "array", items: string },
  });
  const attempt = object({
    id: uuid,
    courseId: string,
    revision: integer,
    status: { type: "string", enum: ["active", "submitted", "abandoned"] },
    mode: { type: "string", enum: ["adaptive", "fixed"] },
    ids: { type: "array", items: integer },
    index: integer,
    count: integer,
    answers: { type: "object", additionalProperties: integer },
    flagged: { type: "array", items: integer },
    questions: { type: "array", items: question },
    elapsedMs: integer,
    paused: boolean,
    releaseId: uuid,
    algorithmVersion: string,
  });
  document.components ||= {};
  document.components.schemas = {
    ...document.components.schemas,
    PublicQuestion: question as any,
    Attempt: attempt as any,
    Error: object(
      { message: string, issues: { type: "array", items: { type: "object" } } },
      ["message"],
    ) as any,
  };
  const bodies: Record<string, unknown> = {
    "/auth/resend": object({ email: { type: "string", format: "email" } }),
    "/auth/forgot-password": object({
      email: { type: "string", format: "email" },
    }),
    "/auth/reset-password": object({
      token: string,
      password: { type: "string", minLength: 10, maxLength: 128 },
    }),
    "/me": object(
      {
        name: { type: "string", minLength: 1, maxLength: 100 },
        logging: boolean,
      },
      [],
    ),
    "/materials/{id}/state": object({ saved: boolean, read: boolean }),
    "/attempts/{id}/heartbeat": object({
      questionId: integer,
      visible: boolean,
    }),
    "/conversations": object(
      {
        courseId: { type: "string", default: "cntt" },
        title: { type: "string", maxLength: 100 },
        context: {
          ...object({ attemptId: uuid, questionId: integer }),
          nullable: true,
        },
      },
      [],
    ),
    "/conversations/{id}/messages": object({
      text: { type: "string", minLength: 1, maxLength: 2000 },
      requestId: uuid,
    }),
    "/events": object(
      {
        courseId: { type: "string", default: "cntt" },
        events: {
          type: "array",
          maxItems: 100,
          items: object(
            {
              id: uuid,
              type: {
                type: "string",
                enum: [
                  "resource_viewed",
                  "question_viewed",
                  "answer_selected",
                  "quiz_paused",
                  "tutor_question",
                  "recommendation_opened",
                ],
              },
              attemptId: { ...uuid, nullable: true },
              data: { type: "object", additionalProperties: true },
            },
            ["id", "type"],
          ),
        },
      },
      ["events"],
    ),
  };
  for (const [path, item] of Object.entries(document.paths)) {
    const relative = path.replace("/api/v1", "");
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const operation = item[method];
      if (!operation) continue;
      const unsafe = method !== "get";
      operation.responses ||= {};
      for (const code of ["400", "401", "403", "404", "409", "429", "503"])
        operation.responses[code] = {
          description: (
            {
              400: "Invalid input or expired token",
              401: "Login required",
              403: "Unverified email, invalid Origin or CSRF",
              404: "Resource not found or owned by another user",
              409: "Stale revision, duplicate key mismatch or state conflict",
              429: "Rate or daily quota exceeded",
              503: "Dependency unavailable",
            } as Record<string, string>
          )[code],
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        };
      if (unsafe) {
        operation.parameters ||= [];
        operation.parameters.push({
          in: "header",
          name: "Origin",
          required: true,
          schema: { type: "string", example: new URL(config.APP_URL).origin },
        });
        if (!relative.startsWith("/auth/") || relative === "/auth/logout")
          operation.parameters.push({
            in: "header",
            name: "x-csrf-token",
            required: true,
            schema: string,
            description: "Returned by GET /auth/session or login",
          });
        if (!operation.requestBody && bodies[relative])
          operation.requestBody = {
            required: true,
            content: {
              "application/json": { schema: bodies[relative] as any },
            },
          };
      }
      if (
        (relative === "/attempts" && method === "post") ||
        relative === "/attempts/active" ||
        relative === "/attempts/{id}" ||
        relative === "/attempts/{id}/{action}"
      ) {
        operation.responses[method === "post" ? "201" : "200"] = {
          description: "Server-saved attempt; no answer keys or explanations",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Attempt" },
            },
          },
        };
      }
      if (relative === "/attempts/{id}/{action}") {
        const param = operation.parameters?.find(
          (p: any) => p.name === "action",
        ) as any;
        if (param)
          param.schema = {
            type: "string",
            enum: [
              "answer",
              "next",
              "navigate",
              "pause",
              "resume",
              "abandon",
              "submit",
            ],
          };
        operation.description =
          "revision must match latest attempt. requestId is a UUID, reused only for an identical retry. Answer/navigate fields depend on action. Submission is immutable and idempotent.";
      }
      if (relative === "/conversations/{id}/messages" && method === "post")
        operation.responses["200"] = {
          description:
            "SSE delta {text}, done {text,sources} after persistence, or error {message}",
          content: { "text/event-stream": { schema: { type: "string" } } },
        };
      if (relative === "/study-plan/calendar.ics")
        operation.responses["200"] = {
          description: "Seven-day Vietnam-time calendar with 10-minute alarms",
          content: { "text/calendar": { schema: string } },
        };
      if (relative === "/export")
        operation.responses["200"] = {
          description:
            "Authenticated learner export; format=json (default) or csv",
          content: {
            "application/json": { schema: { type: "object" } },
            "text/csv": { schema: string },
          },
        };
    }
  }
  return document;
}
