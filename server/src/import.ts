import "reflect-metadata";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { importBank } from "./content.js";
import { pool } from "./db.js";
const args = process.argv.slice(2),
  dry = args.includes("--dry-run");
try {
  let input: unknown, source: string;
  if (args.includes("--demo")) {
    const fixtureUrl = new URL("../data/catalog.js", import.meta.url).href;
    const { topics, questions } = await import(fixtureUrl);
    source = fileURLToPath(new URL("../data/demo-sources/", import.meta.url));
    await mkdir(source, { recursive: true });
    const sources = new Map<string, unknown>();
    for (const t of topics) {
      await writeFile(
        path.join(source, `${t.id}.md`),
        `# ${t.lesson}\n\n` +
          t.sections.map(([h, b]: string[]) => `## ${h}\n${b}`).join("\n\n"),
        "utf8",
      );
      sources.set(t.id, {
        id: `demo-${t.id}`,
        title: `DEMO — ${t.lesson}`,
        page: 1,
        file: `${t.id}.md`,
      });
    }
    const groups: Record<string, number[]> = {
      linear: [1, 6, 7, 10],
      trees: [8, 9],
      sql: [2, 11, 12, 13],
      integrity: [5, 14],
      search: [3, 15],
      algorithm: [16, 17, 18, 19],
      flow: [4, 21],
      functions: [20, 22, 23, 24],
    };
    input = {
      course: { id: "cntt", name: "Công nghệ thông tin" },
      version: "demo-v1",
      demo: true,
      approved: true,
      topics: topics.map((t: any) => ({ ...t, source: sources.get(t.id) })),
      questions: questions.map((q: any) => ({
        ...q,
        wrong: q.options.map((_: string, i: number) =>
          i === q.answer
            ? null
            : q.wrong[i] ||
              "Phương án này chưa phù hợp với khái niệm được hỏi.",
        ),
        skills: Object.keys(groups).filter((k) => groups[k].includes(q.id)),
        source: sources.get(q.topic),
      })),
    };
  } else {
    const flag = args.indexOf("--file");
    if (flag < 0 || !args[flag + 1])
      throw new Error(
        "Usage: npm run import -- --file bank.json [--sources directory] [--dry-run]",
      );
    const file = path.resolve(args[flag + 1]);
    input = JSON.parse(await readFile(file, "utf8"));
    const sourceFlag = args.indexOf("--sources");
    source =
      sourceFlag >= 0 ? path.resolve(args[sourceFlag + 1]) : path.dirname(file);
  }
  console.log(await importBank(input, source, dry));
} finally {
  await pool.end();
}
