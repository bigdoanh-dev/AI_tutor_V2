import {
  Injectable,
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpException,
  UnauthorizedException,
  ForbiddenException,
  CanActivate,
  ExecutionContext,
} from "@nestjs/common";
import { ApiTags, ApiBody } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  randomBytes,
  createHash,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import { db, one, sql } from "./db.js";
import { config } from "./config.js";
export type User = {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  logging: boolean;
};
export type AuthRequest = Request & {
  user: User;
  auth: { token_hash: string; csrf: string };
};
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
const secret = () => randomBytes(32).toString("hex");
export async function rateLimit(key: string, max: number, seconds: number) {
  const r =
    await one(sql`INSERT INTO rate_limits(key,hits,expires_at) VALUES (${key},1,now()+${seconds}*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END,
    expires_at=CASE WHEN rate_limits.expires_at<now() THEN excluded.expires_at ELSE rate_limits.expires_at END RETURNING hits`);
  if (r!.hits > max)
    throw new HttpException("Quá nhiều yêu cầu. Vui lòng thử lại sau.", 429);
}
export const safeUser = (u: any): User => ({
  id: u.id,
  email: u.email,
  name: u.name,
  verified: u.verified,
  logging: u.logging,
});
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.nexus_session;
    if (!token || typeof token !== "string")
      throw new UnauthorizedException("Vui lòng đăng nhập");
    const session = await one(
      sql`SELECT s.token_hash,s.csrf,u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${digest(token)} AND s.expires_at>now()`,
    );
    if (!session) throw new UnauthorizedException("Phiên đăng nhập đã hết hạn");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const supplied = req.get("x-csrf-token") || "";
      if (
        Buffer.byteLength(supplied) !== Buffer.byteLength(session.csrf) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(session.csrf))
      )
        throw new ForbiddenException("CSRF token không hợp lệ");
    }
    req.user = safeUser(session);
    req.auth = { token_hash: session.token_hash, csrf: session.csrf };
    return true;
  }
}
const credentials = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((x) => x.toLowerCase().trim()),
    password: z.string().min(10).max(128),
  })
  .strict();
const register = credentials.extend({
  name: z.string().trim().min(1).max(100),
});
async function sendToken(user: any, kind: "verify" | "reset") {
  const token = secret();
  const link = `${config.APP_URL}/#auth/${kind}/${token}`;
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`DELETE FROM auth_tokens WHERE user_id=${user.id} AND kind=${kind}`,
    );
    await tx.execute(
      sql`INSERT INTO auth_tokens(token_hash,user_id,kind,expires_at) VALUES (${digest(token)},${user.id},${kind},now()+interval '1 hour')`,
    );
    await tx.execute(
      sql`INSERT INTO mail_outbox(id,recipient,subject,body) VALUES (${randomUUID()},${user.email},${kind === "verify" ? "Xác minh email NEXUS" : "Đặt lại mật khẩu NEXUS"},${`Mở liên kết trong 1 giờ: ${link}\nNếu bạn không yêu cầu, hãy bỏ qua email này.`})`,
    );
  });
}
@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  @Post("register")
  @ApiBody({ schema: z.toJSONSchema(register, { io: "input" }) as any })
  async register(@Body() raw: unknown, @Req() req: Request) {
    const b = register.parse(raw);
    await rateLimit(`register:${req.ip}`, 10, 3600);
    const hash = await argon2.hash(b.password, { type: argon2.argon2id });
    const u = await one(
      sql`INSERT INTO users(id,email,password_hash,name) VALUES (${randomUUID()},${b.email},${hash},${b.name}) ON CONFLICT(email) DO NOTHING RETURNING *`,
    );
    if (u) await sendToken(u, "verify");
    return {
      message:
        "Nếu địa chỉ hợp lệ, email xác minh sẽ được gửi. Hãy kiểm tra hộp thư.",
    };
  }
  @Post("login")
  @ApiBody({ schema: z.toJSONSchema(credentials, { io: "input" }) as any })
  async login(
    @Body() raw: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const b = credentials.parse(raw);
    await rateLimit(`login:${req.ip}`, 30, 900);
    await rateLimit(`login-email:${b.email}`, 10, 900);
    const u = await one(sql`SELECT * FROM users WHERE email=${b.email}`);
    if (!u || !(await argon2.verify(u.password_hash, b.password)))
      throw new UnauthorizedException("Email hoặc mật khẩu không đúng");
    if (!u.verified)
      throw new ForbiddenException(
        "Vui lòng xác minh email trước khi đăng nhập",
      );
    const token = secret(),
      csrf = secret();
    await db.execute(
      sql`INSERT INTO auth_sessions(token_hash,user_id,csrf,expires_at) VALUES (${digest(token)},${u.id},${csrf},now()+interval '7 days')`,
    );
    res.cookie("nexus_session", token, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400000,
    });
    return { user: safeUser(u), csrf };
  }
  @Post("verify")
  @ApiBody({
    schema: {
      type: "object",
      required: ["token"],
      properties: { token: { type: "string" } },
    },
  })
  async verify(@Body() raw: unknown) {
    const { token } = z.object({ token: z.string().length(64) }).parse(raw);
    await db.transaction(async (tx) => {
      const t = await one(
        sql`DELETE FROM auth_tokens WHERE token_hash=${digest(token)} AND kind='verify' AND expires_at>now() RETURNING user_id`,
        tx,
      );
      if (!t) throw new HttpException("Liên kết hết hạn hoặc đã dùng", 400);
      await tx.execute(
        sql`UPDATE users SET verified=true WHERE id=${t.user_id}`,
      );
    });
    return { message: "Đã xác minh email. Bạn có thể đăng nhập." };
  }
  @Post("resend")
  async resend(@Body() raw: unknown, @Req() req: Request) {
    return this.requestToken(raw, req, "verify");
  }
  @Post("forgot-password")
  async forgot(@Body() raw: unknown, @Req() req: Request) {
    return this.requestToken(raw, req, "reset");
  }
  private async requestToken(
    raw: unknown,
    req: Request,
    kind: "verify" | "reset",
  ) {
    const { email } = z
      .object({ email: z.email().transform((x) => x.toLowerCase().trim()) })
      .parse(raw);
    await rateLimit(`mail:${req.ip}`, 10, 3600);
    await rateLimit(`mail-address:${email}`, 3, 3600);
    const u = await one(sql`SELECT * FROM users WHERE email=${email}`);
    if (u && (kind === "reset" || !u.verified)) await sendToken(u, kind);
    return { message: "Nếu tài khoản phù hợp, email sẽ được gửi." };
  }
  @Post("reset-password")
  async reset(@Body() raw: unknown) {
    const b = z
      .object({
        token: z.string().length(64),
        password: z.string().min(10).max(128),
      })
      .strict()
      .parse(raw);
    const hash = await argon2.hash(b.password, { type: argon2.argon2id });
    await db.transaction(async (tx) => {
      const t = await one(
        sql`DELETE FROM auth_tokens WHERE token_hash=${digest(b.token)} AND kind='reset' AND expires_at>now() RETURNING user_id`,
        tx,
      );
      if (!t) throw new HttpException("Liên kết hết hạn hoặc đã dùng", 400);
      await tx.execute(
        sql`UPDATE users SET password_hash=${hash} WHERE id=${t.user_id}`,
      );
      await tx.execute(
        sql`DELETE FROM auth_sessions WHERE user_id=${t.user_id}`,
      );
    });
    return { message: "Đã đổi mật khẩu. Vui lòng đăng nhập lại." };
  }
}
