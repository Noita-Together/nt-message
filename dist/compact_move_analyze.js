"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const node_events_1 = require("node:events");
const node_fs_1 = require("node:fs");
const node_readline_1 = require("node:readline");
const pbjs_pb_1 = require("./pbjs_pb");
const compact_move_1 = require("./compact_move");
const infile = node_path_1.default.resolve(__dirname, '../ndjson');
const stats = {
    messages: 0,
    x: { min: Infinity, max: -Infinity, zero: 0, nan: 0 },
    y: { min: Infinity, max: -Infinity, zero: 0, nan: 0 },
    armR: { min: Infinity, max: -Infinity, zero: 0, nan: 0 },
    armScaleY: { min: Infinity, max: -Infinity, zero: 0, nan: 0 },
    scaleX: { min: Infinity, max: -Infinity, zero: 0, nan: 0 },
    anim: { min: Infinity, max: -Infinity, zero: 0, nan: 0 },
    held: { min: Infinity, max: -Infinity, zero: 0, nan: 0 },
};
const addStat = (key, v) => {
    if (isNaN(v)) {
        stats[key].nan++;
        return true;
    }
    stats[key].min = Math.min(stats[key].min, v);
    stats[key].max = Math.max(stats[key].max, v);
    if (v === 0)
        stats[key].zero++;
    return false;
};
const addStats = (obj) => {
    let s = false;
    s || (s = addStat('x', obj.x));
    s || (s = addStat('y', obj.y));
    s || (s = addStat('armR', obj.armR));
    s || (s = addStat('armScaleY', obj.armScaleY));
    s || (s = addStat('scaleX', obj.scaleX));
    s || (s = addStat('anim', obj.anim));
    s || (s = addStat('held', obj.held));
    if (s) {
        console.log(obj);
        process.exit(1);
    }
};
let lastStats = Date.now() + 5000;
const diffFrame = (a, b, xyTolerance = 0.051, armrTolerance = (Math.PI * 2 + 1) / 2 ** 7) => {
    let samey = true;
    samey && (samey = Math.abs(a.x - b.x) < xyTolerance);
    samey && (samey = Math.abs(a.y - b.y) < xyTolerance);
    samey && (samey = Math.abs(a.armR - b.armR) < armrTolerance);
    samey && (samey = a.armScaleY === b.armScaleY);
    samey && (samey = a.scaleX === b.scaleX);
    samey && (samey = a.held === b.held);
    samey && (samey = a.anim === b.anim);
    if (samey)
        return;
    return {
        x: b.x - a.x,
        y: b.y - a.y,
        armR: b.armR - a.armR,
        armScaleY: [a.armScaleY, b.armScaleY],
        scaleX: [a.scaleX, b.scaleX],
        held: [a.held, b.held],
        anim: [a.anim, b.anim],
    };
};
const diffFrames = (a, b) => {
    for (let i = 0; i < a.length; i++) {
        const diff = diffFrame(a[i], b[i]);
        if (diff)
            return { i, ...diff };
    }
};
const calcPrecision = ({ x, y, armR }, a, b) => {
    for (let i = 0; i < a.length; i++) {
        x = Math.max(x, Math.abs(a[i].x - b[i].x));
        y = Math.max(y, Math.abs(a[i].y - b[i].y));
        armR = Math.max(armR, Math.abs(b[i].armR - a[i].armR));
    }
    return { x, y, armR };
};
const bytesAt = (players, bytes) => bytes * (players + 1);
let oldSize = 0;
let newSize = 0;
let lineCount = 0;
const { encodeFrames, decodeFrames } = (0, compact_move_1.createFrameCoder)();
(async function processLineByLine() {
    try {
        const rl = (0, node_readline_1.createInterface)({
            input: (0, node_fs_1.createReadStream)(infile),
            crlfDelay: Infinity,
        });
        let prec = { x: 0, y: 0, armR: 0 };
        rl.on('line', line => {
            const obj = JSON.parse(line);
            if (!obj.frames || !obj.frames.length)
                return;
            oldSize += pbjs_pb_1.NT.OldClientPlayerMove.encode(obj).finish().length;
            const compact = encodeFrames(obj.frames);
            newSize += pbjs_pb_1.NT.CompactPlayerFrames.encode(compact).finish().length;
            const roundtrip = decodeFrames(compact);
            const diff = diffFrames(obj.frames, roundtrip);
            if (diff) {
                console.log(lineCount);
                console.log(diff);
                process.exit();
            }
            prec = calcPrecision(prec, obj.frames, roundtrip);
            lineCount++;
            //   stats.messages++;
            //   try {
            //     obj.frames.forEach((frame: any) => addStats(frame));
            //   } catch (e) {}
            //   if (Date.now() > lastStats) {
            //     console.log(stats);
            //     lastStats = Date.now() + 5000;
            //   }
        });
        await (0, node_events_1.once)(rl, 'close');
        console.log('File processed.');
        const oldSizeAt90 = bytesAt(90, oldSize);
        const newSizeAt90 = bytesAt(90, newSize);
        console.log({
            oldSize: oldSize.toLocaleString() + 'b',
            oldSizeAt90: oldSizeAt90.toLocaleString() + 'b',
            newSize: newSize.toLocaleString() + 'b',
            newSizeAt90: newSizeAt90.toLocaleString() + 'b',
            pctAt90: ((100 * newSizeAt90) / oldSizeAt90).toFixed(2) + '%',
        });
        console.log(prec);
        // console.log(stats);
    }
    catch (err) {
        console.error(err);
    }
})();
