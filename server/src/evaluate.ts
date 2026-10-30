import "dotenv/config";
import { readFile } from "node:fs/promises";
import { config } from "./config.js";
// Explicit operator command: performs up to one paid model call per dataset row.
const base = process.env.RAG_EVAL_API_URL || "http://127.0.0.1:3001";
const email = process.env.RAG_EVAL_EMAIL,
  password = process.env.RAG_EVAL_PASSWORD;
if (!email || !password || !config.AI_GATEWAY_API_KEY)
  throw new Error(
    "Set RAG_EVAL_EMAIL, RAG_EVAL_PASSWORD and AI_GATEWAY_API_KEY in the server environment before running the live evaluation.",
  );
const file =
  process.argv[2] || new URL("../data/rag-eval.json", import.meta.url);
const dataset = JSON.parse(await readFile(file, "utf8")) as {
  question: string;
  expectedMaterialIds?: string[];
  expectAbstention?: boolean;
  forbiddenText?: string;
}[];
let cookie = "",
  csrf = "";
async function call(path: string, body: unknown) {
  const response = await fetch(base + "/api/v1" + path, {
    method: "POST",
    headers: {
      Origin: new URL(config.APP_URL).origin,
      "Content-Type": "application/json",
      Cookie: cookie,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Evaluation request failed: ${response.status}`);
  return response;
}
const login = await call("/auth/login", { email, password });
cookie = login.headers.get("set-cookie")!.split(";")[0];
csrf = (await login.json()).csrf;
let failed = 0;
for (const [index, item] of dataset.entries()) {
  const conversation = await (
    await call("/conversations", { title: `RAG evaluation ${index + 1}` })
  ).json();
  const response = await call(`/conversations/${conversation.id}/messages`, {
    text: item.question,
    requestId: crypto.randomUUID(),
  });
  const events = (await response.text())
    .split("\n\n")
    .filter((x) => x.startsWith("data: "))
    .map((x) => JSON.parse(x.slice(6)));
  const done = events.find((e) => e.type === "done");
  const grounded =
    !!done &&
    (item.expectAbstention
      ? done.sources.length === 0 && /chưa|không.*tìm|thiếu/i.test(done.text)
      : done.sources.some((s: any) =>
          item.expectedMaterialIds?.includes(s.materialId),
        ));
  const safe =
    !!done && (!item.forbiddenText || !done.text.includes(item.forbiddenText));
  const pass = grounded && safe;
  if (!pass) failed++;
  console.log(
    JSON.stringify({
      case: index + 1,
      pass,
      grounded,
      safe,
      sourceCount: done?.sources?.length || 0,
    }),
  );
}
console.log(
  `Evaluation: ${dataset.length - failed}/${dataset.length} passed. Human review of factual accuracy is still required.`,
);
process.exitCode = failed ? 1 : 0;
