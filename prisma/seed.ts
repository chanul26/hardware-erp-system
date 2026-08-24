import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

/**
 * Creates the first admin account and the document-number counters.
 *
 * The admin password is never hardcoded. In production it must be supplied via
 * SEED_ADMIN_PASSWORD; in development a random one is generated and printed
 * once. The previous version shipped a fixed password that was also published
 * in the README, so every deployment started with publicly known credentials.
 */
async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@hardware.com")
    .trim()
    .toLowerCase();

  let password = process.env.SEED_ADMIN_PASSWORD?.trim() || "";
  let generated = false;

  if (!password) {
    if (isProduction) {
      throw new Error(
        "SEED_ADMIN_PASSWORD must be set when seeding a production database."
      );
    }
    // url-safe, 24 bytes of entropy
    password = randomBytes(18).toString("base64url");
    generated = true;
  }

  if (password.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters.");
  }

  // Counters back the gapless invoice / GRN numbering. Created here as well as
  // in the migration so a hand-built database is not left without them.
  await prisma.documentCounter.createMany({
    data: [
      { id: "BILL", value: 0 },
      { id: "PURCHASE", value: 0 },
    ],
    skipDuplicates: true,
  });

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log(`• Admin ${email} already exists — left unchanged.`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name: "Administrator",
        password: await bcrypt.hash(password, 12),
        role: Role.ADMIN,
        isActive: true,
      },
    });

    console.log(`✔ Admin account created: ${email}`);

    if (generated) {
      console.log("");
      console.log("  Generated password (shown once — store it now):");
      console.log(`    ${password}`);
      console.log("");
      console.log("  Change it after signing in.");
    }
  }

  console.log("✔ Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
