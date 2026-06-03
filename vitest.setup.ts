/**
 * Runs in every test worker BEFORE test modules (and thus before the Prisma
 * client in src/lib/db.ts) are imported, so DATABASE_URL points at the test DB.
 * CI/local may pre-set DATABASE_URL (e.g. to a Postgres service); we only fill a
 * sensible local default.
 */
process.env.DATABASE_URL ||= "postgresql://postgres:postgres@127.0.0.1:5432/dock_test";
process.env.AUTH_SECRET ||= "test-secret";
process.env.APP_DOMAIN ||= "app.com";
process.env.DEFAULT_TENANT_SLUG ||= "acme-docks";
process.env.STRIPE_PRICE_STARTER ||= "price_starter";
process.env.STRIPE_PRICE_PRO ||= "price_pro";
process.env.STRIPE_PRICE_PREMIUM ||= "price_premium";
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
