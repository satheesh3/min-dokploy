"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.docker = void 0;
exports.assertDockerConnected = assertDockerConnected;
const dockerode_1 = __importDefault(require("dockerode"));
exports.docker = new dockerode_1.default({ socketPath: '/var/run/docker.sock' });
async function assertDockerConnected() {
    await exports.docker.ping();
    console.log('Docker connection verified');
}
