import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

const DB_PATH =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'mini-dokploy.db')

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

export function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), 'migrations')
  migrate(db, { migrationsFolder })
  console.log('Database migrations complete')
}
