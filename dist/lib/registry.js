"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRegistryHost = getRegistryHost;
exports.imageTag = imageTag;
function getRegistryHost() {
    return process.env.REGISTRY_HOST ?? '127.0.0.1:5000';
}
function imageTag(deploymentId) {
    return `${getRegistryHost()}/dep-${deploymentId}:latest`;
}
