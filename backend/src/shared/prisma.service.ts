import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getAppConfig } from "./app-config";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const config = getAppConfig();
    const { connectionString, schema } = resolveAdapterConnection(config.databaseUrl);
    const logger = console;
    const adapter = new PrismaPg(
      {
        connectionString,
        application_name: "opc-backend",
        min: 4,
        max: 20,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 300_000,
        keepAlive: true,
        lock_timeout: 5_000,
        query_timeout: 30_000,
        statement_timeout: 30_000
      },
      {
        ...(schema ? { schema } : {}),
        onConnectionError(error) {
          logger.error(`[PrismaService] pool connection error: ${error.message}`);
        },
        onPoolError(error) {
          logger.error(`[PrismaService] pool error: ${error.message}`);
        }
      }
    );

    super({
      adapter
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.$queryRawUnsafe("SELECT 1");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

function resolveAdapterConnection(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const schema = String(parsed.searchParams.get("schema") || "").trim();

  if (schema) {
    parsed.searchParams.delete("schema");
  }

  return {
    connectionString: parsed.toString(),
    schema
  };
}
