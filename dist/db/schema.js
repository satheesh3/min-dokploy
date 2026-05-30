"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploymentLogs = exports.deployments = exports.verifications = exports.accounts = exports.sessions = exports.users = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
exports.users = (0, sqlite_core_1.sqliteTable)('users', {
    id: (0, sqlite_core_1.text)('id').primaryKey(),
    email: (0, sqlite_core_1.text)('email').notNull().unique(),
    name: (0, sqlite_core_1.text)('name'),
    emailVerified: (0, sqlite_core_1.integer)('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: (0, sqlite_core_1.text)('image'),
    createdAt: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at', { mode: 'timestamp' }).notNull(),
});
exports.sessions = (0, sqlite_core_1.sqliteTable)('sessions', {
    id: (0, sqlite_core_1.text)('id').primaryKey(),
    userId: (0, sqlite_core_1.text)('user_id')
        .notNull()
        .references(() => exports.users.id, { onDelete: 'cascade' }),
    token: (0, sqlite_core_1.text)('token').notNull().unique(),
    expiresAt: (0, sqlite_core_1.integer)('expires_at', { mode: 'timestamp' }).notNull(),
    ipAddress: (0, sqlite_core_1.text)('ip_address'),
    userAgent: (0, sqlite_core_1.text)('user_agent'),
    createdAt: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at', { mode: 'timestamp' }).notNull(),
});
exports.accounts = (0, sqlite_core_1.sqliteTable)('accounts', {
    id: (0, sqlite_core_1.text)('id').primaryKey(),
    userId: (0, sqlite_core_1.text)('user_id')
        .notNull()
        .references(() => exports.users.id, { onDelete: 'cascade' }),
    accountId: (0, sqlite_core_1.text)('account_id').notNull(),
    providerId: (0, sqlite_core_1.text)('provider_id').notNull(),
    accessToken: (0, sqlite_core_1.text)('access_token'),
    refreshToken: (0, sqlite_core_1.text)('refresh_token'),
    accessTokenExpiresAt: (0, sqlite_core_1.integer)('access_token_expires_at', { mode: 'timestamp' }),
    password: (0, sqlite_core_1.text)('password'),
    createdAt: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at', { mode: 'timestamp' }).notNull(),
});
exports.verifications = (0, sqlite_core_1.sqliteTable)('verifications', {
    id: (0, sqlite_core_1.text)('id').primaryKey(),
    identifier: (0, sqlite_core_1.text)('identifier').notNull(),
    value: (0, sqlite_core_1.text)('value').notNull(),
    expiresAt: (0, sqlite_core_1.integer)('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at', { mode: 'timestamp' }).notNull(),
});
exports.deployments = (0, sqlite_core_1.sqliteTable)('deployments', {
    id: (0, sqlite_core_1.text)('id').primaryKey(),
    userId: (0, sqlite_core_1.text)('user_id')
        .notNull()
        .references(() => exports.users.id, { onDelete: 'cascade' }),
    name: (0, sqlite_core_1.text)('name').notNull(),
    gitUrl: (0, sqlite_core_1.text)('git_url').notNull(),
    dockerfilePath: (0, sqlite_core_1.text)('dockerfile_path').notNull().default('Dockerfile'),
    exposedPort: (0, sqlite_core_1.integer)('exposed_port').notNull(),
    customLabels: (0, sqlite_core_1.text)('custom_labels').notNull().default('{}'),
    status: (0, sqlite_core_1.text)('status').$type().notNull().default('pending'),
    serviceId: (0, sqlite_core_1.text)('service_id'),
    domain: (0, sqlite_core_1.text)('domain'),
    createdAt: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
    userIdx: (0, sqlite_core_1.index)('deployments_user_idx').on(t.userId),
}));
exports.deploymentLogs = (0, sqlite_core_1.sqliteTable)('deployment_logs', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    deploymentId: (0, sqlite_core_1.text)('deployment_id')
        .notNull()
        .references(() => exports.deployments.id, { onDelete: 'cascade' }),
    line: (0, sqlite_core_1.text)('line').notNull(),
    seq: (0, sqlite_core_1.integer)('seq').notNull(),
    createdAt: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
    depSeqIdx: (0, sqlite_core_1.index)('logs_deployment_seq_idx').on(t.deploymentId, t.seq),
}));
