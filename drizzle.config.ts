import type { Config } from 'drizzle-kit'
import path from 'path'

export default {
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'mini-dokploy.db'),
  },
} satisfies Config
