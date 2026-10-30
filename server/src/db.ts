import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql, type SQL } from "drizzle-orm";
import { config } from "./config.js";
export { sql };
export const pool = postgres(config.DATABASE_URL, { max: 10 });
export const db = drizzle(pool);
export type Executor = Pick<PostgresJsDatabase, "execute">;
export async function rows<T = Record<string, any>>(
  query: SQL,
  executor: Executor = db,
): Promise<T[]> {
  return (await executor.execute(query)) as unknown as T[];
}
export async function one<T = Record<string, any>>(
  query: SQL,
  executor: Executor = db,
): Promise<T | undefined> {
  return (await rows<T>(query, executor))[0];
}
export const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
