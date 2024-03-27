"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFrameCoder = exports.decodeStable = exports.encodeStable = exports.decodeBitfield = exports.encodeBitfield = exports.createDeltaCoder = exports.createArmrCoder = void 0;
const pbjs_pb_1 = require("./pbjs_pb");
/**
 * Create an encoder-decoder pair for lossy-encoding radian
 * values (`armR`) to integers that can be compactly encoded
 * as varints.
 * @param targetBytes The size, in bytes, of encoded values
 * when serialized as a varint
 */
const createArmrCoder = (targetBytes) => {
    const factor = 2 ** (7 * targetBytes);
    const pi2 = Math.PI * 2 + 1;
    return {
        /**
         * Lossily encode `v`, a value in radians between -PI and PI,
         * as an unsigned integer to fit within `targetBytes` of
         * serialized protobuf output.
         * @see {createArmrCoder}
         */
        encodeArmR: (v) => (((v + Math.PI) * factor) / pi2) | 0,
        /**
         * Decode a lossily-encoded value `v` to a value in radians
         * between -PI and PI.
         * @see {createArmrCoder}
         */
        decodeArmR: (v) => (v * pi2) / factor - Math.PI,
    };
};
exports.createArmrCoder = createArmrCoder;
const createDeltaCoder = (fractionalDigits) => {
    const factor = 10 ** fractionalDigits;
    return {
        encodeDelta: (len, get) => {
            if (len === 0)
                return { init: 0, deltas: [] };
            const init = get(0);
            const deltas = [];
            if (typeof init !== 'number')
                throw new Error('Invalid value');
            let last = init;
            for (let i = 1; i < len; i++) {
                const val = get(i);
                if (typeof val !== 'number')
                    throw new Error('Invalid value');
                const d = Math.round((val - last) * factor);
                deltas.push(d);
                last += d / factor; // ameliorate rounding errors
            }
            return { init, deltas };
        },
        decodeDelta: (init, deltas, set) => {
            let cum = init;
            set(0, cum);
            for (let i = 0; i < deltas.length; i++) {
                cum += deltas[i] / factor;
                set(i + 1, cum);
            }
        },
    };
};
exports.createDeltaCoder = createDeltaCoder;
const encodeBitfield = (len, next, snap = true) => {
    if (len > 32)
        throw new Error('Cannot encode more than 32 values in a bitfield');
    let res = 0;
    for (let i = 0; i < len; i++) {
        let val = next(i);
        // scaleX and armScaleY are _usually_ 1 / -1, but might be fractional if the player
        // is using mods or e.g. gets hit by shrinking mage. shrinking mage wasn't accounted
        // for initially, so it crashes NT. for compatibility, we'll "snap" to +- 1 when
        // encountering fractional digits; this will cause other players not to see the
        // "shrunken" mina, but gameplay will continue as normal.
        if (snap && Math.abs(val) !== 1) {
            // 0 is probably invalid, but we don't have to break NT if we encounter it
            val = val > 0 ? 1 : -1;
        }
        // values must be -1 or 1
        if (val !== -1 && val !== 1)
            throw new Error('Invalid value: ' + val);
        res |= ((val + 1) >>> 1) << i;
        // javascript bitwise operations operate on 32-bit signed integers
    }
    return res >>> 0; // convert to unsigned
};
exports.encodeBitfield = encodeBitfield;
const decodeBitfield = (len, val, set) => {
    if (len > 32)
        throw new Error('Cannot encode more than 32 values in a bitfield');
    for (let i = 0; i < len; i++) {
        set(i, ((val & 1) << 1) - 1);
        val >>>= 1;
    }
};
exports.decodeBitfield = decodeBitfield;
const encodeStable = (len, get) => {
    let last = 0;
    const idxs = [];
    const vals = [];
    for (let i = 0; i < len; i++) {
        const val = get(i);
        if (val === last)
            continue;
        idxs.push(i);
        vals.push(val);
        last = val;
    }
    return { idxs, vals };
};
exports.encodeStable = encodeStable;
const decodeStable = (len, idxs, vals, set) => {
    if (idxs.length !== vals.length)
        throw new Error('Invalid data: arrays must be same length');
    let cur = 0;
    for (let i = 0, pos = 0; i < len; i++) {
        if (idxs[pos] === i) {
            cur = vals[pos];
            pos++;
        }
        set(i, cur);
    }
};
exports.decodeStable = decodeStable;
const createFrameCoder = (opts = {}) => {
    var _a, _b;
    const { encodeArmR, decodeArmR } = (0, exports.createArmrCoder)((_a = opts.armrTargetBytes) !== null && _a !== void 0 ? _a : 1);
    const { encodeDelta, decodeDelta } = (0, exports.createDeltaCoder)((_b = opts.deltaCoderFractionalDigits) !== null && _b !== void 0 ? _b : 1);
    const encodeFrames = (frames) => {
        const numFrames = frames.length;
        if (numFrames === 0)
            return new pbjs_pb_1.NT.CompactPlayerFrames();
        if (numFrames > 32)
            throw new Error('cannot compact more than 32 frames');
        const { init: xInit, deltas: xDeltas } = encodeDelta(numFrames, i => frames[i].x);
        const { init: yInit, deltas: yDeltas } = encodeDelta(numFrames, i => frames[i].y);
        const armR = frames.map(f => encodeArmR(f.armR));
        const armScaleY = (0, exports.encodeBitfield)(numFrames, i => frames[i].armScaleY);
        const scaleX = (0, exports.encodeBitfield)(numFrames, i => frames[i].scaleX);
        const { idxs: animIdx, vals: animVal } = (0, exports.encodeStable)(numFrames, i => frames[i].anim);
        const { idxs: heldIdx, vals: heldVal } = (0, exports.encodeStable)(numFrames, i => frames[i].held);
        return new pbjs_pb_1.NT.CompactPlayerFrames({
            xInit,
            xDeltas,
            yInit,
            yDeltas,
            armR,
            armScaleY,
            scaleX,
            animIdx,
            animVal,
            heldIdx,
            heldVal,
        });
    };
    const decodeFrames = (pm) => {
        const numFrames = pm.armR.length;
        const frames = new Array(numFrames);
        for (let i = 0; i < numFrames; i++) {
            frames[i] = new pbjs_pb_1.NT.PlayerFrame({ armR: decodeArmR(pm.armR[i]) });
        }
        decodeDelta(pm.xInit, pm.xDeltas, (i, v) => {
            frames[i].x = v;
        });
        decodeDelta(pm.yInit, pm.yDeltas, (i, v) => {
            frames[i].y = v;
        });
        (0, exports.decodeBitfield)(numFrames, pm.armScaleY, (i, v) => {
            frames[i].armScaleY = v;
        });
        (0, exports.decodeBitfield)(numFrames, pm.scaleX, (i, v) => {
            frames[i].scaleX = v;
        });
        (0, exports.decodeStable)(numFrames, pm.animIdx, pm.animVal, (i, v) => (frames[i].anim = v));
        (0, exports.decodeStable)(numFrames, pm.heldIdx, pm.heldVal, (i, v) => (frames[i].held = v));
        return frames;
    };
    return { encodeFrames, decodeFrames };
};
exports.createFrameCoder = createFrameCoder;
