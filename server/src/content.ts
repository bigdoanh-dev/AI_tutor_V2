import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { db, sql, one, json } from "./db.js";
import { bankSchema, type Bank } from "./domain.js";
import { config } from "./config.js";
export async function latestBank(course = "cntt") {
  const release = await one(
    sql`SELECT * FROM bank_releases WHERE course_id=${course} ORDER BY published_at DESC,id DESC LIMIT 1`,
  );
  if (!release) throw new NotFoundException("Chưa nhập ngân hàng cho môn học");
  return release as Record<string, any> & { data: Bank };
}
export async function importBank(
  input: unknown,
  sourceDirectory: string,
  dryRun = false,
) {
  const bank = bankSchema.parse(input);
  if (bank.demo && config.NODE_ENV === "production")
    throw new BadRequestException("Không nhập bộ demo trong production");
  const root = await realpath(sourceDirectory);
  const files = new Map<string, string>();
  for (const source of [
    ...bank.topics.map((t) => t.source),
    ...bank.topics.flatMap((t) =>
      t.sections
        .map((section) => section[2])
        .filter((source): source is NonNullable<typeof source> => !!source),
    ),
    ...bank.questions.map((q) => q.source),
  ]) {
    if (path.isAbsolute(source.file) || source.file.includes(".."))
      throw new BadRequestException("Đường dẫn nguồn không hợp lệ");
    const full = await realpath(path.resolve(root, source.file));
    if (!full.startsWith(root + path.sep))
      throw new BadRequestException("File phải nằm trong thư mục nguồn");
    files.set(source.file, full);
  }
  if (dryRun)
    return {
      valid: true,
      questions: bank.questions.length,
      topics: bank.topics.length,
    };
  const hash = createHash("sha256").update(JSON.stringify(bank)).digest("hex");
  const existing = await one(
    sql`SELECT id,content_hash FROM bank_releases WHERE course_id=${bank.course.id} AND version=${bank.version}`,
  );
  if (existing) {
    if (existing.content_hash !== hash)
      throw new BadRequestException(
        "Version đã tồn tại với nội dung khác; tăng version",
      );
    return { id: existing.id, unchanged: true };
  }
  const id = randomUUID();
  for (const [relative, full] of files) {
    const target = path.resolve(config.FILE_ROOT, id, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(full, target);
  }
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`INSERT INTO courses(id,name) VALUES (${bank.course.id},${bank.course.name}) ON CONFLICT(id) DO UPDATE SET name=excluded.name`,
    );
    await tx.execute(
      sql`INSERT INTO bank_releases(id,course_id,version,content_hash,data,demo) VALUES (${id},${bank.course.id},${bank.version},${hash},${json(bank)},${bank.demo})`,
    );
  });
  return { id, questions: bank.questions.length };
}
export async function materialFile(
  course: string,
  id: string,
  releaseId?: string,
) {
  const release = releaseId
    ? await one(
        sql`SELECT * FROM bank_releases WHERE id=${releaseId} AND course_id=${course}`,
      )
    : await latestBank(course);
  const material = (release?.data as Bank)?.topics.find((t) => t.id === id);
  if (!material) throw new NotFoundException();
  const root = await realpath(path.resolve(config.FILE_ROOT, release!.id));
  const file = await realpath(path.resolve(root, material.source.file));
  if (!file.startsWith(root + path.sep)) throw new NotFoundException();
  return file;
}
export async function publicCatalog(course: string) {
  const r = await latestBank(course);
  return {
    course: r.data.course,
    releaseId: r.id,
    version: r.version,
    demo: r.demo,
    topics: r.data.topics,
    questions: r.data.questions.map((q) => ({
      id: q.id,
      topic: q.topic,
      level: q.level,
      skills: q.skills,
    })),
  };
}
