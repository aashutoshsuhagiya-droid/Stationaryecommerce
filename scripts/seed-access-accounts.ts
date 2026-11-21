import "../prisma/load-env";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/password";
import { randomUUID } from "node:crypto";

const connectionString = (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL)!.trim();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Passwords must come from the environment so they never land in git. */
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Set it in .env.local (see .env.example) before running this script.`);
  }
  return value;
}

async function main() {
  console.log("Setting up portals access accounts...");

  // 1. Roles lookup
  const adminRole = await prisma.role.findUnique({ where: { key: "admin" } });
  const vendorRole = await prisma.role.findUnique({ where: { key: "vendor" } });
  const applicantRole = await prisma.role.findUnique({ where: { key: "vendor_applicant" } });

  if (!adminRole || !vendorRole || !applicantRole) {
    throw new Error("Roles not found. Ensure db:seed has run.");
  }

  // 2. Setup/Update Admin Accounts
  const adminPassword = requiredEnv("SEED_ADMIN_PASSWORD");
  const adminHash = await hashPassword(adminPassword);

  const primaryAdmin = await prisma.user.upsert({
    where: { email: "admin@naamly.com" },
    update: {
      passwordHash: adminHash,
      status: "ACTIVE",
      firstName: "Naamly",
      lastName: "Administrator",
      emailVerifiedAt: new Date(),
    },
    create: {
      id: randomUUID(),
      email: "admin@naamly.com",
      passwordHash: adminHash,
      status: "ACTIVE",
      firstName: "Naamly",
      lastName: "Administrator",
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: primaryAdmin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: primaryAdmin.id, roleId: adminRole.id },
  });

  // Also ensure codex walkthrough admin is active
  const walkthroughAdmin = await prisma.user.findUnique({
    where: { email: "codex-local-walkthrough@example.test" },
  });
  if (walkthroughAdmin) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: walkthroughAdmin.id, roleId: adminRole.id } },
      update: {},
      create: { userId: walkthroughAdmin.id, roleId: adminRole.id },
    });
  }

  // 3. Setup/Update Vendor Account
  const vendorEmail = "vendor@naamly.com";
  const vendorPassword = requiredEnv("SEED_VENDOR_PASSWORD");
  const vendorHash = await hashPassword(vendorPassword);

  const vendorUser = await prisma.user.upsert({
    where: { email: vendorEmail },
    update: {
      passwordHash: vendorHash,
      status: "ACTIVE",
      firstName: "Partner",
      lastName: "Printer",
      emailVerifiedAt: new Date(),
    },
    create: {
      id: randomUUID(),
      email: vendorEmail,
      passwordHash: vendorHash,
      status: "ACTIVE",
      firstName: "Partner",
      lastName: "Printer",
      emailVerifiedAt: new Date(),
    },
  });

  // Assign vendor roles
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: vendorUser.id, roleId: vendorRole.id } },
    update: {},
    create: { userId: vendorUser.id, roleId: vendorRole.id },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: vendorUser.id, roleId: applicantRole.id } },
    update: {},
    create: { userId: vendorUser.id, roleId: applicantRole.id },
  });

  // Ensure VendorApplication exists
  let vendorApp = await prisma.vendorApplication.findUnique({
    where: { userId: vendorUser.id },
  });

  if (!vendorApp) {
    vendorApp = await prisma.vendorApplication.create({
      data: {
        userId: vendorUser.id,
        status: "APPROVED",
        ownerName: "Partner Printer",
        businessName: "Naamly Partner Print Works",
        businessEmail: vendorEmail,
        businessPhone: "+919876543210",
        addressLine1: "12 Printing Street, GIDC",
        city: "Ahmedabad",
        normalizedCity: "ahmedabad",
        state: "Gujarat",
        postalCode: "380015",
        servicePostalCodes: ["380015", "380009", "380001"],
        serviceCategoryIds: ["name-slips", "packaging", "stationery"],
        printingServices: ["Digital label printing", "Packaging printing", "Foil stamping"],
        equipment: ["Industrial UV Flatbed", "Rotary Die Cutter", "Digital Label Press"],
        gstin: "24AAACN1234F1Z1",
        termsVersion: "2026-v1",
        privacyVersion: "2026-v1",
        termsAcceptedAt: new Date(),
        submittedAt: new Date(),
        reviewedAt: new Date(),
      },
    });
  } else {
    vendorApp = await prisma.vendorApplication.update({
      where: { id: vendorApp.id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
      },
    });
  }

  // Ensure VendorProfile exists
  const existingProfile = await prisma.vendorProfile.findUnique({
    where: { userId: vendorUser.id },
  });

  if (!existingProfile) {
    await prisma.vendorProfile.create({
      data: {
        userId: vendorUser.id,
        applicationId: vendorApp.id,
        businessName: "Naamly Partner Print Works",
        ownerName: "Partner Printer",
        businessPhone: "+919876543210",
        addressLine1: "12 Printing Street, GIDC",
        city: "Ahmedabad",
        normalizedCity: "ahmedabad",
        state: "Gujarat",
        postalCode: "380015",
        servicePostalCodes: ["380015", "380009", "380001"],
        serviceCategoryIds: ["name-slips", "packaging", "stationery"],
        verificationStatus: "APPROVED",
        operationalStatus: "ACTIVE",
        availabilityStatus: "ONLINE",
        maxConcurrentOrders: 10,
        acceptingOrders: true,
        approvedAt: new Date(),
      },
    });
  } else {
    await prisma.vendorProfile.update({
      where: { id: existingProfile.id },
      data: {
        verificationStatus: "APPROVED",
        operationalStatus: "ACTIVE",
        availabilityStatus: "ONLINE",
        acceptingOrders: true,
      },
    });
  }

  // 4. Setup Customer Demo Account
  const customerEmail = "customer@naamly.com";
  const customerPassword = requiredEnv("SEED_CUSTOMER_PASSWORD");
  const customerHash = await hashPassword(customerPassword);

  await prisma.user.upsert({
    where: { email: customerEmail },
    update: {
      passwordHash: customerHash,
      status: "ACTIVE",
      firstName: "Demo",
      lastName: "Customer",
      emailVerifiedAt: new Date(),
    },
    create: {
      id: randomUUID(),
      email: customerEmail,
      passwordHash: customerHash,
      status: "ACTIVE",
      firstName: "Demo",
      lastName: "Customer",
      emailVerifiedAt: new Date(),
    },
  });

  console.log("SUCCESS: Accounts and credentials configured!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
