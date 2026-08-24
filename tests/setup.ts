/**
 * Points every test at a dedicated database and applies migrations once.
 *
 * The URL is overridden before any module that constructs a PrismaClient is
 * imported, so tests can never accidentally run against the development
 * database.
 */
import { execSync } from "node:child_process";

const TEST_DB =
  process.env.TEST_DATABASE_URL ??
  "postgresql://erp_user:erp_password@localhost:5433/hardware_erp_test?schema=public";

process.env.DATABASE_URL = TEST_DB;
process.env.DIRECT_URL = TEST_DB;
process.env.NEXTAUTH_SECRET ??= "test-secret-not-used-outside-tests";
process.env.NEXTAUTH_URL ??= "http://localhost:3001";
// NODE_ENV is typed as readonly by @types/node; assign through the record.
(process.env as Record<string, string>).NODE_ENV = "test";

execSync("npx prisma migrate deploy", {
  stdio: "pipe",
  env: { ...process.env, DATABASE_URL: TEST_DB, DIRECT_URL: TEST_DB },
});
