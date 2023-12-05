import { NT } from './pbjs_pb';
/**
 * Create an encoder-decoder pair for lossy-encoding radian
 * values (`armR`) to integers that can be compactly encoded
 * as varints.
 * @param targetBytes The size, in bytes, of encoded values
 * when serialized as a varint
 */
export declare const createArmrCoder: (targetBytes: number) => {
    /**
     * Lossily encode `v`, a value in radians between -PI and PI,
     * as an unsigned integer to fit within `targetBytes` of
     * serialized protobuf output.
     * @see {createArmrCoder}
     */
    encodeArmR: (v: number) => number;
    /**
     * Decode a lossily-encoded value `v` to a value in radians
     * between -PI and PI.
     * @see {createArmrCoder}
     */
    decodeArmR: (v: number) => number;
};
export declare const createDeltaCoder: (fractionalDigits: number) => {
    encodeDelta: (len: number, get: (i: number) => number) => {
        init: number;
        deltas: number[];
    };
    decodeDelta: (init: number, deltas: number[], set: (i: number, v: number) => void) => void;
};
export declare const encodeBitfield: (len: number, next: (i: number) => number) => number;
export declare const decodeBitfield: (len: number, val: number, set: (i: number, val: number) => void) => void;
export declare const encodeStable: (len: number, get: (i: number) => number) => {
    idxs: number[];
    vals: number[];
};
export declare const decodeStable: (len: number, idxs: number[], vals: number[], set: (i: number, val: number) => void) => void;
export interface FrameCoderConfig {
    armrTargetBytes?: number;
    deltaCoderFractionalDigits?: number;
}
export declare const createFrameCoder: (opts?: FrameCoderConfig) => {
    encodeFrames: (frames: NT.PlayerFrame[]) => NT.CompactPlayerFrames;
    decodeFrames: (pm: NT.CompactPlayerFrames) => NT.PlayerFrame[];
};
