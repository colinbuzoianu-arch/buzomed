import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Prisma CLI config (replaces the deprecated `package.json#prisma` block,
 * removed in Prisma 7). Only the CLI reads this — the app runtime reads
 * DATABASE_URL from the process env via @prisma/client independently.
 *
 * NOTE: once a prisma.config.ts exists, Prisma no longer auto-loads `.env`,
 * so we load it ourselves here (`import 'dotenv/config'`). Without this,
 * DATABASE_URL/DIRECT_URL would be undefined and every prisma command would
 * fail to connect.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
