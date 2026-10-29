import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __naamlyPrisma: PrismaClient | undefined;
}

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL_POOLED or DATABASE_URL is not configured.");
    this.name = "DatabaseConfigurationError";
  }
}

let productionClient: PrismaClient | undefined;

export function getPrisma() {
  if (globalThis.__naamlyPrisma) return globalThis.__naamlyPrisma;
  if (productionClient) return productionClient;
  const connectionString = (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL)?.trim();
  if (!connectionString) throw new DatabaseConfigurationError();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  if (process.env.NODE_ENV !== "production") globalThis.__naamlyPrisma = prisma;
  else productionClient = prisma;
  return prisma;
}
