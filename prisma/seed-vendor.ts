import "./load-env";

import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

import { hashPassword } from "../src/lib/password";

const connectionString = process.env.DATABASE_URL?.trim();
const email = (process.env.SEED_VENDOR_EMAIL ?? "vendor@stationaryecommerce.com").trim().toLowerCase();
const password = process.env.SEED_VENDOR_PASSWORD ?? "";
if (!connectionString) throw new Error("DATABASE_URL is required to seed a vendor account.");
if (password.length < 16 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
  throw new Error("SEED_VENDOR_PASSWORD must have at least 16 characters, including a letter, number and symbol.");
}

const city = "New Delhi";
const normalizedCity = "new delhi";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Plain sequential statements (no interactive transaction): Prisma Postgres throttles
// transaction start on idle instances (P2028), and a failed tail step is cleaned up below.
async function main() {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new Error(`A user already exists for ${email}; refusing to overwrite its credentials.`);

  const roles = await prisma.role.findMany({ where: { key: { in: ["vendor", "vendor_applicant"] } }, select: { id: true, key: true } });
  const vendorRole = roles.find((role) => role.key === "vendor");
  const applicantRole = roles.find((role) => role.key === "vendor_applicant");
  if (!vendorRole || !applicantRole) throw new Error("Vendor roles are not seeded. Run npm run db:seed first.");

  const category = await prisma.category.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!category) throw new Error("No active category is seeded. Run npm run db:seed first.");

  const passwordHash = await hashPassword(password);
  const now = new Date();
  const userId = randomUUID();
  const applicationId = randomUUID();

  try {
    const user = await prisma.user.create({
      data: {
        id: userId,
        email,
        phone: "+919876543210",
        passwordHash,
        firstName: "Vendor",
        lastName: "Demo",
        emailVerifiedAt: now,
        phoneVerifiedAt: now,
        roles: { create: [{ roleId: vendorRole.id }, { roleId: applicantRole.id }] },
      },
      select: { id: true },
    });

    const application = await prisma.vendorApplication.create({
      data: {
        id: applicationId,
        userId: user.id,
        status: "APPROVED",
        ownerName: "Vendor Demo",
        businessName: "Demo Print Studio",
        businessEmail: email,
        businessPhone: "+919876543210",
        addressLine1: "24 Printers Lane",
        city,
        normalizedCity,
        state: "Delhi",
        postalCode: "110001",
        servicePostalCodes: ["110001", "110002"],
        serviceCategoryIds: [category.id],
        printingServices: ["Name labels", "School labels"],
        equipment: ["Epson L1800"],
        termsVersion: "2026-10-23",
        privacyVersion: "2026-10-23",
        termsAcceptedAt: now,
        submittedAt: now,
        reviewedAt: now,
        reviewerId: userId,
        events: {
          create: [
            {
              toStatus: "SUBMITTED",
              action: "APPLICATION_SUBMITTED",
              applicantMessage: "Your printing partner application was submitted for review.",
              createdAt: now,
            },
            {
              actorId: userId,
              fromStatus: "SUBMITTED",
              toStatus: "APPROVED",
              action: "APPLICATION_APPROVED",
              applicantMessage: "Your application was approved. You can now accept orders in the operations workspace.",
              createdAt: now,
            },
          ],
        },
      },
      select: { id: true },
    });

    await prisma.vendorProfile.create({
      data: {
        userId,
        applicationId: application.id,
        businessName: "Demo Print Studio",
        ownerName: "Vendor Demo",
        businessPhone: "+919876543210",
        addressLine1: "24 Printers Lane",
        city,
        normalizedCity,
        state: "Delhi",
        postalCode: "110001",
        servicePostalCodes: ["110001", "110002"],
        serviceCategoryIds: [category.id],
        verificationStatus: "APPROVED",
        operationalStatus: "ACTIVE",
        availabilityStatus: "ONLINE",
        acceptingOrders: true,
        approvedAt: now,
      },
    });

    console.info(`Created approved vendor ${email} (${city}). Remove the seed credentials from the environment now.`);
  } catch (error) {
    await prisma.vendorProfile.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.vendorApplication.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
