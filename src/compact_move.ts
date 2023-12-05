import { NT } from './pbjs_pb';

/**
 * Create an encoder-decoder pair for lossy-encoding radian
 * values (`armR`) to integers that can be compactly encoded
 * as varints.
 * @param targetBytes The size, in bytes, of encoded values
 * when serialized as a varint
 */
export const createArmrCoder = (targetBytes: number) => {
  const factor = 2 ** (7 * targetBytes);
  const pi2 = Math.PI * 2 + 1;

  return {
    /**
     * Lossily encode `v`, a value in radians between -PI and PI,
     * as an unsigned integer to fit within `targetBytes` of
     * serialized protobuf output.
     * @see {createArmrCoder}
     */
    encodeArmR: (v: number) => (((v + Math.PI) * factor) / pi2) | 0,
    /**
     * Decode a lossily-encoded value `v` to a value in radians
     * between -PI and PI.
     * @see {createArmrCoder}
     */
    decodeArmR: (v: number) => (v * pi2) / factor - Math.PI,
  };
};

export const createDeltaCoder = (fractionalDigits: number) => {
  const factor = 10 ** fractionalDigits;
  return {
    encodeDelta: (len: number, get: (i: number) => number): { init: number; deltas: number[] } => {
      if (len === 0) return { init: 0, deltas: [] };

      const init = get(0);
      const deltas: number[] = [];

      if (typeof init !== 'number') throw new Error('Invalid value');

      let last = init;
      for (let i = 1; i < len; i++) {
        const val = get(i);
        if (typeof val !== 'number') throw new Error('Invalid value');

        const d = Math.round((val - last) * factor);
        deltas.push(d);
        last += d / factor; // ameliorate rounding errors
      }
      return { init, deltas };
    },
    decodeDelta: (init: number, deltas: number[], set: (i: number, v: number) => void): void => {
      let cum = init;
      set(0, cum);
      for (let i = 0; i < deltas.length; i++) {
        cum += deltas[i] / factor;
        set(i + 1, cum);
      }
    },
  };
};

export const encodeBitfield = (len: number, next: (i: number) => number): number => {
  if (len > 32) throw new Error('Cannot encode more than 32 values in a bitfield');
  let res = 0;
  for (let i = 0; i < len; i++) {
    const val = next(i);
    // values must be -1 or 1
    if (val !== -1 && val !== 1) throw new Error('Invalid value: ' + val);
    res |= ((val + 1) >>> 1) << i;
    // javascript bitwise operations operate on 32-bit signed integers
  }
  return res >>> 0; // convert to unsigned
};
export const decodeBitfield = (len: number, val: number, set: (i: number, val: number) => void): void => {
  if (len > 32) throw new Error('Cannot encode more than 32 values in a bitfield');
  for (let i = 0; i < len; i++) {
    set(i, ((val & 1) << 1) - 1);
    val >>>= 1;
  }
};

export const encodeStable = (len: number, get: (i: number) => number): { idxs: number[]; vals: number[] } => {
  let last = 0;
  const idxs: number[] = [];
  const vals: number[] = [];
  for (let i = 0; i < len; i++) {
    const val = get(i);
    if (val === last) continue;
    idxs.push(i);
    vals.push(val);
    last = val;
  }
  return { idxs, vals };
};
export const decodeStable = (
  len: number,
  idxs: number[],
  vals: number[],
  set: (i: number, val: number) => void
): void => {
  if (idxs.length !== vals.length) throw new Error('Invalid data: arrays must be same length');
  let cur = 0;
  for (let i = 0, pos = 0; i < len; i++) {
    if (idxs[pos] === i) {
      cur = vals[pos];
      pos++;
    }
    set(i, cur);
  }
};

export interface FrameCoderConfig {
  armrTargetBytes?: number;
  deltaCoderFractionalDigits?: number;
}

export const createFrameCoder = (opts: FrameCoderConfig = {}) => {
  const { encodeArmR, decodeArmR } = createArmrCoder(opts.armrTargetBytes ?? 1);
  const { encodeDelta, decodeDelta } = createDeltaCoder(opts.deltaCoderFractionalDigits ?? 1);

  const encodeFrames = (frames: NT.PlayerFrame[]): NT.CompactPlayerFrames => {
    const numFrames = frames.length;
    if (numFrames === 0) return new NT.CompactPlayerFrames();
    if (numFrames > 32) throw new Error('cannot compact more than 32 frames');

    const { init: xInit, deltas: xDeltas } = encodeDelta(numFrames, i => frames[i]!.x!);
    const { init: yInit, deltas: yDeltas } = encodeDelta(numFrames, i => frames[i]!.y!);
    const armR: number[] = frames.map(f => encodeArmR(f.armR!));
    const armScaleY = encodeBitfield(numFrames, i => frames[i]!.armScaleY!);
    const scaleX = encodeBitfield(numFrames, i => frames[i]!.scaleX!);
    const { idxs: animIdx, vals: animVal } = encodeStable(numFrames, i => frames[i]!.anim!);
    const { idxs: heldIdx, vals: heldVal } = encodeStable(numFrames, i => frames[i]!.held!);

    return new NT.CompactPlayerFrames({
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

  const decodeFrames = (pm: NT.CompactPlayerFrames): NT.PlayerFrame[] => {
    const numFrames = pm.armR.length;
    const frames: NT.PlayerFrame[] = new Array(numFrames);

    for (let i = 0; i < numFrames; i++) {
      frames[i] = new NT.PlayerFrame({ armR: decodeArmR(pm.armR[i]) });
    }
    decodeDelta(pm.xInit, pm.xDeltas, (i, v) => {
      frames[i].x = v;
    });
    decodeDelta(pm.yInit, pm.yDeltas, (i, v) => {
      frames[i].y = v;
    });
    decodeBitfield(numFrames, pm.armScaleY, (i, v) => {
      frames[i].armScaleY = v;
    });
    decodeBitfield(numFrames, pm.scaleX, (i, v) => {
      frames[i].scaleX = v;
    });
    decodeStable(numFrames, pm.animIdx, pm.animVal, (i, v) => (frames[i].anim = v));
    decodeStable(numFrames, pm.heldIdx, pm.heldVal, (i, v) => (frames[i].held = v));

    return frames;
  };

  return { encodeFrames, decodeFrames };
};
