import "reflect-metadata";
import * as dotenv from "dotenv";
import { mkdir } from "node:fs/promises";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cors from "@fastify/cors";
import { AppModule } from "./app.module";
import { getAppConfig } from "./shared/app-config";
import { GlobalHttpExceptionFilter } from "./shared/http-exception.filter";

async function bootstrap() {
  dotenv.config();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true
    })
  );

  const config = getAppConfig();
  await mkdir(config.storageDir, {
    recursive: true
  });

  await app.register(cors, {
    origin: config.corsOrigin === "*" ? true : config.corsOrigin
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
