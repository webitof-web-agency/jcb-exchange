// Loaded before every unit test (npm test). Unit tests use injected fakes; this points the Prisma client at
// a closed local port so a test can never reach a real database (the local .env points at production).
process.env.DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/unit_tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
