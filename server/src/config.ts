import "dotenv/config";
import { z } from "zod";
const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(3001),
    APP_URL: z.url().default("http://127.0.0.1:5173"),
    DATABASE_URL: z
      .string()
      .default("postgres://nexus:nexus_local@127.0.0.1:5437/nexus"),
    REDIS_URL: z.string().default("redis://127.0.0.1:6387"),
    SMTP_HOST: z.string().default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().default(1027),
    SMTP_SECURE: z.string().default("false"),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default("NEXUS <noreply@nexus.local>"),
    FILE_ROOT: z.string().default("./data/files"),
    AI_GATEWAY_API_KEY: z.string().optional(),
    AI_CHAT_MODEL: z.string().default("google/gemini-3.8-flash"),
    AI_EMBEDDING_MODEL: z.string().default("cohere/embed-v4.0"),
    AI_INDEX_VERSION: z.string().default("1"),
    AI_DAILY_LIMIT: z.coerce.number().int().min(1).default(30),
    AI_RETRIEVAL_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.35),
  })
  .parse(process.env);
if (env.NODE_ENV === "production" && !env.APP_URL.startsWith("https://"))
  throw new Error("APP_URL must use HTTPS");
export const config = env;
