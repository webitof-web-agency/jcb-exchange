"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
}
const adapter = new adapter_pg_1.PrismaPg(connectionString);
const prisma = new client_1.PrismaClient({
    adapter,
});
exports.default = prisma;
//# sourceMappingURL=prisma.js.map