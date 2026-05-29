"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateId = generateId;
exports.deploymentDomain = deploymentDomain;
const nanoid_1 = require("nanoid");
const nanoid = (0, nanoid_1.customAlphabet)('abcdefghijklmnopqrstuvwxyz0123456789', 8);
function generateId() {
    return nanoid();
}
function deploymentDomain(id) {
    return `dep-${id}.127.0.0.1.sslip.io`;
}
