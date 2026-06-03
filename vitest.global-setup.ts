import { execSync } from "node:child_process";

/**
 * One-time: apply migrations to the test database before any test runs.
 * Honors a pre-set DATABASE_URL (CI Postgres service); otherwise targets the
 * local dock_test database.
 */
export default function setup(): void {
  const url =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/dock_test";
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
