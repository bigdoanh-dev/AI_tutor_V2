import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  Module,
  Controller,
  Get,
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { SwaggerModule, DocumentBuilder, ApiTags } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { AuthController, AuthGuard } from "./auth.js";
import { StudentController } from "./student.js";
import { TutorController } from "./ai.js";
import { db, sql } from "./db.js";
import { describeApi } from "./openapi.js";
@ApiTags("Health")
@Controller("health")
class HealthController {
  @Get() async health() {
    await db.execute(sql`SELECT 1`);
    return { status: "ok" };
  }
}
@Module({
  controllers: [
    AuthController,
    StudentController,
    TutorController,
    HealthController,
  ],
  providers: [AuthGuard],
})
class AppModule {}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const status =
      error instanceof z.ZodError
        ? 400
        : error instanceof HttpException
          ? error.getStatus()
          : 500;
    const response =
      error instanceof z.ZodError
        ? {
            message: "Dữ liệu không hợp lệ",
            issues: error.issues.map((i) => ({
              path: i.path,
              message: i.message,
            })),
          }
        : error instanceof HttpException
          ? error.getResponse()
          : { message: "Lỗi máy chủ. Vui lòng thử lại sau." };
    if (status === 500)
      console.error(
        "Request failed",
        res.getHeader("x-request-id"),
        error instanceof Error ? error.name : "Error",
      );
    res
      .status(status)
      .json(typeof response === "string" ? { message: response } : response);
  }
}
export async function bootstrap(port = config.PORT) {
  const app = await NestFactory.create(AppModule, {
    logger: config.NODE_ENV === "test" ? ["error"] : ["error", "warn", "log"],
  });
  if (config.NODE_ENV === "production")
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use((req: any, res: any, next: () => void) => {
    res.setHeader("x-request-id", randomUUID());
    res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== new URL(config.APP_URL).origin
    )
      return res.status(403).json({ message: "Origin không hợp lệ" });
    next();
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new Errors());
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("NEXUS Student API")
      .setVersion("1.0.0")
      .setDescription(
        "Cookie session; unsafe requests require Origin=APP_URL and x-csrf-token from /auth/session. Quiz explanations are available only after submission.",
      )
      .addCookieAuth("nexus_session")
      .build(),
  );
  describeApi(doc);
  if (config.NODE_ENV !== "production")
    SwaggerModule.setup("api/docs", app, doc);
  await app.listen(
    port,
    config.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
  );
  app.enableShutdownHooks();
  return app;
}
if (process.argv[1]?.replaceAll("\\", "/").match(/\/main\.(ts|js)$/))
  await bootstrap();
