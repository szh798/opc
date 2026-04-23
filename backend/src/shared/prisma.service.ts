import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getAppConfig } from "./app-config";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const config = getAppConfig();
    const { connectionString, schema } = resolveAdapterConnection(config.databaseUrl);
    const adapter = new PrismaPg(
      { connectionString },
      schema ? { schema } : undefined
    );

    super({
      adapter
    });
  }

  async onModuleInit() {
    await this.$connect();
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
