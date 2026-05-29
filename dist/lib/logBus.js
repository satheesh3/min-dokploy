"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBus = getBus;
exports.emitLog = emitLog;
exports.emitDone = emitDone;
exports.closeBus = closeBus;
exports.onLog = onLog;
exports.onDone = onDone;
const events_1 = require("events");
const buses = new Map();
function getBus(deploymentId) {
    if (!buses.has(deploymentId)) {
        const emitter = new events_1.EventEmitter();
        emitter.setMaxListeners(50);
        buses.set(deploymentId, emitter);
    }
    return buses.get(deploymentId);
}
function emitLog(deploymentId, event) {
    getBus(deploymentId).emit('log', event);
}
function emitDone(deploymentId, finalStatus) {
    const bus = getBus(deploymentId);
    bus.emit('done', finalStatus);
}
function closeBus(deploymentId) {
    const bus = buses.get(deploymentId);
    if (bus) {
        bus.removeAllListeners();
        buses.delete(deploymentId);
    }
}
function onLog(deploymentId, callback) {
    const bus = getBus(deploymentId);
    bus.on('log', callback);
    return () => bus.off('log', callback);
}
function onDone(deploymentId, callback) {
    const bus = getBus(deploymentId);
    bus.once('done', callback);
    return () => bus.off('done', callback);
}
