import { Queue } from "bullmq";
import { config } from "./config.js";
const u = new URL(config.REDIS_URL);
export const redisConnection = {
  host: u.hostname,
  port: Number(u.port || 6379),
  password: u.password || undefined,
  username: u.username || undefined,
  maxRetriesPerRequest: null,
};
export const jobs = new Queue("nexus", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
