/// <reference types="node" />
import Long from 'long';
export declare const enum Wiretype {
    VARINT = 0,
    I64 = 1,
    LEN = 2,
    SGROUP = 3,
    EGROUP = 4,
    I32 = 5
}
export declare const enum DigResult {
    SUCCESS = 0,
    NOT_FOUND = 1,
    ERROR = 2
}
export declare const EMPTY_BUFFER: Buffer;
type Packable = keyof ProtoHax & ('Int32' | 'Int64' | 'Uint32' | 'Uint64' | 'Bool' | 'Enum' | 'Sint32' | 'Sint64' | 'Sfixed32' | 'Fixed32' | 'Float' | 'Sfixed64' | 'Fixed64' | 'Double');
type Unpacked<T extends Packable> = ProtoHax[T] extends () => infer P ? P : never;
/**
 * Read selected values from a serialized protocol buffer message. Used to optimize
 * the processing time of PlayerMove messages.
 */
export declare class ProtoHax {
    private buf;
    private pos;
    private last;
    private end;
    private ok;
    constructor(buf: Buffer);
    atEnd(): boolean;
    private varint;
    private skipVarint;
    private skipBytes;
    private skipGroup;
    private skip;
    private readVarint32;
    private readVarint64;
    Int32(): number;
    Int64(): Long;
    Uint32(): number;
    Uint64(): Long;
    Bool(): boolean;
    Enum(): number;
    Sint32(): number;
    Sint64(): Long;
    Sfixed32(): number;
    Fixed32(): number;
    Float(): number;
    Sfixed64(): Long;
    Fixed64(): Long;
    Double(): number;
    Bytes(): Buffer;
    String(): string;
    Packed<const T extends Packable>(type: T): Unpacked<T>[];
    private seek;
    private size;
    /**
     * Seek to the next instance of fieldId, which must be a LEN wiretype,
     * and rescope this instance to its payload
     */
    with(fieldId: number): ProtoHax;
    /**
     * Find the next instance of the specified fieldId, and call the callback
     * with a new ProtoHax instance if found.
     */
    if(fieldId: number, cb: (phax: ProtoHax) => void): ProtoHax;
    /**
     * Find all instances of the specified fieldId and call the callback
     * with a new ProtoHax instance for each.
     */
    each(fieldId: number, cb: (phax: ProtoHax) => void): ProtoHax;
}
export {};
