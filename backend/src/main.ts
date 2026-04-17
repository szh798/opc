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

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true
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
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  await app.listen(config.port, "0.0.0.0");
}

bootstrap();
