// Builds a brand-new, empty database (a new server, staging, a restore drill) to the current schema.
//
//   DATABASE_URL=postgresql://.../newdb npx tsx scripts/setup-fresh-database.ts
//
// `prisma migrate deploy` cannot do this: the oldest migration assumes the base tables already exist,
// so there is no baseline to start from. Instead this script
//   1. creates every table from prisma/schema.prisma (`prisma db push`),
//   2. runs the INSERT statements the migrations carry (CRM pipeline stages, partner agreement
//      definitions, API wallet ...), which `db push` does not, and
//   3. marks every migration as applied (`prisma migrate resolve`), so later migrations deploy as usual.
// It refuses to touch a database that already has tables, so it can never be pointed at production.
// Afterwards seed master data: scripts/reseed-master.ts --locations, scripts/sync-employee-roles.ts.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import prismaModule from '../src/lib/prisma';

const prisma = prismaModule as any;
const migrationsDir = path.join(__dirname, '../prisma/migrations');

const prismaCli = (...args: string[]) =>
  execFileSync('npx', ['prisma', ...args], { stdio: 'inherit', shell: process.platform === 'win32', cwd: path.join(__dirname, '..') });

const insertStatements = (sql: string) => sql.match(/^\s*INSERT INTO[\s\S]*?;\s*$/gm) ?? [];

const main = async () => {
  const [{ count }] = await prisma.$queryRawUnsafe(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
  );
  if (count > 0) throw new Error(`This database already has ${count} tables. The script only sets up an empty database.`);

  const migrations = readdirSync(migrationsDir)
    .filter((name) => existsSync(path.join(migrationsDir, name, 'migration.sql')))
    .sort();

  console.log('1/3 Creating tables from schema.prisma ...');
  prismaCli('db', 'push');

  console.log('2/3 Loading the data the migrations insert ...');
  for (const name of migrations) {
    for (const statement of insertStatements(readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8'))) {
      await prisma.$executeRawUnsafe(statement);
      console.log(`   ${name}`);
    }
  }

  console.log(`3/3 Marking ${migrations.length} migrations as applied ...`);
  for (const name of migrations) prismaCli('migrate', 'resolve', '--applied', name);

  console.log('Done. Next: npx tsx scripts/reseed-master.ts --locations && npx tsx scripts/sync-employee-roles.ts');
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
