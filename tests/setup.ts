import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

process.env.NODE_ENV = "test";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_ACCESS_TOKEN = "test-access-token";
process.env.META_APP_SECRET = "test-app-secret";
process.env.WEBHOOK_VERIFY_TOKEN = "test-verify-token";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.APIFY_API_TOKEN = "test-apify-token";
process.env.PHONE_HASH_SALT = "test-salt-value-minimum-8-chars";
process.env.PORT = "3001";
process.env.LOG_LEVEL = "silent";
process.env.DEFAULT_CITY = "Buenos Aires";
