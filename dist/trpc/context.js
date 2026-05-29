"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContext = createContext;
const auth_1 = require("../lib/auth");
const db_1 = require("../db");
async function createContext({ req, res, }) {
    const session = await auth_1.auth.api
        .getSession({ headers: req.headers })
        .catch(() => null);
    return { req, res, session, db: db_1.db };
}
