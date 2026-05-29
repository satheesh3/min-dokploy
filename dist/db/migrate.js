"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Standalone migration runner — run with: tsx src/db/migrate.ts
const index_1 = require("./index");
(0, index_1.runMigrations)();
process.exit(0);
