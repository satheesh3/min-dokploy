// Standalone migration runner — run with: tsx src/db/migrate.ts
import { runMigrations } from './index'

runMigrations()
process.exit(0)
