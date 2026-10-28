import "./load-env";

import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

import { hashPassword } from "../src/lib/password";

const connectionString = process.env.DATABASE_URL?.trim();
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
if (!connectionString) throw new Error("DATABASE_URL is required to bootstrap an administrator.");
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set BOOTSTRAP_ADMIN_EMAIL to a valid email address.");
if (password.length < 16 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
  throw new Error("BOOTSTRAP_ADMIN_PASSWORD must have at least 16 characters, including a letter, number and symbol.");
}
const adminEmail = email;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Uses plain sequential statements instead of an interactive transaction: Prisma Postgres
// throttles transaction start on idle instances (P2028), and a failed tail step is cleaned up below.
async function main() {
  const passwordHash = await hashPassword(password);
  const role = await prisma.role.findUnique({ where: { key: "admin" }, select: { id: true } });
  if (!role) throw new Error("The admin role is not seeded. Run npm run db:seed first.");
  const existing = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
  if (existing) throw new Error("A user already exists for BOOTSTRAP_ADMIN_EMAIL; refusing to overwrite its credentials.");

  const userId = randomUUID();
  try {
    await prisma.user.create({
      data: {
        id: userId,
        email: adminEmail,
        passwordHash,
        firstName: process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() || "Super",
        lastName: process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim() || "Admin",
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
    console.info(`Created administrator ${adminEmail}. Remove the bootstrap credentials from the environment now.`);
  } catch (error) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
