import "./load-env";

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

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({ where: { key: "admin" }, select: { id: true } });
    if (!role) throw new Error("The admin role is not seeded. Run npm.cmd run db:seed first.");
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new Error("A user already exists for BOOTSTRAP_ADMIN_EMAIL; refusing to overwrite its credentials.");
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        firstName: process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() || "Super",
        lastName: process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim() || "Admin",
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
  });
  console.info(`Created administrator ${email}. Remove the bootstrap credentials from the environment now.`);
} finally {
  await prisma.$disconnect();
}
