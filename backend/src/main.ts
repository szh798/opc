import "reflect-metadata";
import * as dotenv from "dotenv";
import { mkdir } from "node:fs/promises";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { AppModule } from "./app.module";
import { getAppConfig } from "./shared/app-config";
import { GlobalHttpExceptionFilter } from "./shared/http-exception.filter";

async function bootstrap() {
  const startupLogger = new Logger("Startup");
  dotenv.config();

  // Phase B2：Fastify 自带的 pino logger 输出 JSON，便于 grep / jq / 日志采集。
  //   - level：release 环境 info，其他环境 debug，方便本地排查。
  //   - serializers：把 req/res 压成少量必要字段，避免把整个 socket 对象打出来。
  //   - redact：屏蔽 Authorization / Cookie / set-cookie，减少误吐 token。
  //   - timestamp：ISO 字符串，比默认 epoch ms 更方便人肉读。
  const logLevel = process.env.LOG_LEVEL || (process.env.APP_ENV === "release" ? "info" : "debug");
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: logLevel,
        timestamp: () => `,"time":"${new Date().toISOString()}"`,
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            'res.headers["set-cookie"]'
          ],
          censor: "[redacted]"
        },
        serializers: {
          req(request: any) {
            return {
              id: request.id,
              method: request.method,
              url: request.url,
              route: request.routeOptions?.url || request.routerPath,
              userId: request.user?.id || null,
              remoteAddress: request.ip
            };
          },
          res(reply: any) {
            return { statusCode: reply.statusCode };
          }
        }
      }
    })
  );

  const config = getAppConfig();
  startupLogger.log(
    `Runtime summary: ${JSON.stringify({
      nodeEnv: config.nodeEnv,
      appEnv: config.appEnv || "unset",
      isReleaseLike: config.isReleaseLike,
      enforceReleaseGuards: config.enforceReleaseGuards,
      allowDevFreshUserLogin: config.allowDevFreshUserLogin,
      hasWechatConfig: config.hasWechatConfig
    })}`
  );
  await mkdir(config.storageDir, {
    recursive: true
  });

  await app.register(cors, {
    origin: config.corsOrigin === "*" ? true : config.corsOrigin
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      const user = (request as any).user;
      return (user && user.id) ? String(user.id) : request.ip;
    },
    allowList: (request) => {
      // 健康检查接口不计入限流
      const url = request.url || "";
      return url === "/health" || url === "/ready" || url === "/";
    }
  });

  app.getHttpAdapter().getInstance().addHook("onSend", (request, reply, payload, done) => {
    reply.header("x-request-id", request.id);
    done(null, payload);
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true
    })
  );
  // Phase B1：通过 Nest DI 拿到 filter，确保 ErrorReportService 被注入，5xx 能落表/转发 Sentry。
  app.useGlobalFilters(app.get(GlobalHttpExceptionFilter));

  await app.listen(config.port, "0.0.0.0");
}

bootstrap();
