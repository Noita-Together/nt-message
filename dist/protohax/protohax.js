"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtoHax = exports.EMPTY_BUFFER = exports.DigResult = exports.Wiretype = void 0;
const long_1 = __importDefault(require("long"));
var Wiretype;
(function (Wiretype) {
    Wiretype[Wiretype["VARINT"] = 0] = "VARINT";
    Wiretype[Wiretype["I64"] = 1] = "I64";
    Wiretype[Wiretype["LEN"] = 2] = "LEN";
    Wiretype[Wiretype["SGROUP"] = 3] = "SGROUP";
    Wiretype[Wiretype["EGROUP"] = 4] = "EGROUP";
    Wiretype[Wiretype["I32"] = 5] = "I32";
})(Wiretype || (exports.Wiretype = Wiretype = {}));
var DigResult;
(function (DigResult) {
    DigResult[DigResult["SUCCESS"] = 0] = "SUCCESS";
    DigResult[DigResult["NOT_FOUND"] = 1] = "NOT_FOUND";
    DigResult[DigResult["ERROR"] = 2] = "ERROR";
})(DigResult || (exports.DigResult = DigResult = {}));
exports.EMPTY_BUFFER = Buffer.of();
/**
 * Read selected values from a serialized protocol buffer message. Used to optimize
 * the processing time of PlayerMove messages.
 */
class ProtoHax {
    constructor(buf) {
        this.buf = buf;
        this.pos = 0;
        this.last = 0;
        this.end = buf.length;
        this.ok = this.pos < this.end;
    }
    atEnd() {
        return this.pos >= this.end;
    }
    varint() {
        if (!this.ok)
            return;
        this.last = 0;
        // read up to 4 bytes of a varint (bitwise-safe value up to 28 bits of payload)
        for (var b = 0, shift = 0; shift < 28; shift += 7) {
            b = this.buf[this.pos++];
            this.last |= (b & 0x7f) << shift;
            if ((b & 0x80) === 0)
                return; // we hit the end of the varint
        }
        // if we still have bytes to read, we failed
        this.ok = (b & 0x80) === 0;
    }
    skipVarint() {
        if (!this.ok)
            return;
        // varints can be up to 10 bytes, representing up to a 64-bit unsigned int
        for (var i = 0; i < 10; i++) {
            if ((this.buf[this.pos++] & 0x80) === 0)
                return;
        }
        // we read 10 bytes all with an MSB of 1, we weren't at a valid varint
        this.ok = false;
    }
    // skip the specified number of bytes
    skipBytes(bytes) {
        this.pos += bytes;
    }
    skipGroup(sgroup) {
        var until = sgroup ^ (Wiretype.EGROUP ^ Wiretype.SGROUP);
        do {
            this.skip(); // skip the current tag's payload
            this.varint(); // read the next tag
        } while (this.ok && this.last !== until);
    }
    // skip over a payload. the tag should be in `this.last`
    skip() {
        if (!this.ok)
            return;
        // prettier-ignore
        switch (this.last & 0x07) {
            // VARINT: int32, int64, uint32, uint64, sint32, sint64, bool, enum
            case Wiretype.VARINT:
                this.skipVarint();
                break;
            // I64: fixed64, sfixed64, double
            case Wiretype.I64:
                this.skipBytes(8);
                break;
            // LEN: string, bytes, embedded messages, packed repeated fields
            case Wiretype.LEN:
                this.varint();
                this.skipBytes(this.last);
                break;
            // SGROUP: group start (deprecated)
            case Wiretype.SGROUP:
                this.skipGroup(this.last);
                break;
            // EGROUP: group end (deprecated)
            case Wiretype.EGROUP: break;
            // I32: fixed32, sfixed32, float
            case Wiretype.I32:
                this.skipBytes(4);
                break;
            default: throw new Error('Invalid wire type: ' + (this.last & 0x07));
        }
        this.ok = this.pos < this.buf.length;
    }
    readVarint32() {
        this.varint();
        // if varint succeeded, the value was read in <= 4 bytes and we can just
        // return and call it a day
        if (this.ok)
            return this.last >>> 0;
        // we've read 4 out of a possible 10 bytes so far. the worst case is -1, which will be
        // 9* 0xff followed by 0x01. There are four remaining bits that might have meaning to
        // us, and the rest can be ignored since we're only reading a 32 bit number.
        //
        // even though the wiretype of this varint knows it's a 32 bit number, it still records
        // all 64 bits. it's unclear whether that is sane behavior, but because the data is
        // recorded as little-endian, it has the effect that very large negative values stored
        // as int32 will be smaller in their varint encoding. see:
        // https://github.com/protocolbuffers/protobuf-javascript/blob/8730ba5e0f5153c5889c356193d93778c6300932/binary/encoder.js#L145-L172
        //
        // either way, we have to deal with the data we could potentially receive.
        // read the 5th byte
        var b = this.buf[this.pos++];
        this.ok = (b & 0x80) === 0;
        // store the last 4 bits of the 5th input byte in the top 4 bits of the value
        // ____aaaa aaabbbbb bbcccccc cddddddd
        //                            0___eeee
        // eeee____ ________ ________ ________
        this.last |= (b & 0x0f) << 28;
        // consume up to 5 more bytes of varint and discard them
        for (var i = 0; !this.ok && i < 5; i++) {
            b = this.buf[this.pos++];
            this.ok = (b & 0x80) === 0;
        }
        if (!this.ok)
            throw new Error('VARINT read failed');
        // return as unsigned
        return this.last >>> 0;
    }
    readVarint64() {
        if (!this.ok)
            return long_1.default.ZERO;
        this.varint();
        var big = long_1.default.fromNumber(this.last);
        if (this.ok)
            return big;
        // it's a big one, read the rest. this could probably be
        // done more efficiently by working with in 32 bit space
        // as regular js numbers. however, that's a pain and i'm
        // just looking for something that clearly works for now
        for (var b = 0, shift = 28; shift < 70; shift += 7) {
            b = this.buf[this.pos++];
            big = big.or(long_1.default.fromNumber(b).and(0x07f).shiftLeft(shift));
            if ((b & 0x80) === 0)
                break; // we hit the end of the varint
        }
        this.ok = (b & 0x80) === 0;
        if (!this.ok)
            throw new Error('VARINT64 read failed');
        // we can technically construct >64bit values; we rely on
        // the calling functions to interpret and truncate the data
        return big.and(long_1.default.NEG_ONE);
    }
    // varint     := int32 | int64 | uint32 | uint64 | bool | enum | sint32 | sint64;
    //                 encoded as varints (sintN are ZigZag-encoded first)
    Int32() {
        if (!this.ok)
            return 0;
        return this.readVarint32() | 0;
    }
    Int64() {
        if (!this.ok)
            return long_1.default.ZERO;
        return this.readVarint64();
    }
    Uint32() {
        if (!this.ok)
            return 0;
        return this.readVarint32() >>> 0;
    }
    Uint64() {
        if (!this.ok)
            return long_1.default.UZERO;
        return this.readVarint64().toUnsigned();
    }
    Bool() {
        if (!this.ok)
            return false;
        var val = this.readVarint32();
        switch (val) {
            case 0:
                return false;
            case 1:
                return true;
            default:
                throw new Error('Invalid boolean value');
        }
    }
    Enum() {
        if (!this.ok)
            return 0;
        var val = this.readVarint32();
        return val;
    }
    Sint32() {
        if (!this.ok)
            return 0;
        var zze = this.readVarint32();
        return (zze >>> 1) ^ -(zze & 1);
    }
    Sint64() {
        if (!this.ok)
            return long_1.default.ZERO;
        var zze = this.readVarint64();
        return zze.shiftRight(1).xor(zze.and(long_1.default.ONE).negate());
    }
    // i32        := sfixed32 | fixed32 | float;
    //                 encoded as 4-byte little-endian;
    //                 memcpy of the equivalent C types (u?int32_t, float)
    Sfixed32() {
        if (!this.ok || this.pos > this.end - 4)
            return 0;
        var val = this.buf.readInt32LE(this.pos);
        this.pos += 4;
        return val;
    }
    Fixed32() {
        if (!this.ok || this.pos > this.end - 4)
            return 0;
        var val = this.buf.readUint32LE(this.pos);
        this.pos += 4;
        return val;
    }
    Float() {
        if (!this.ok || this.pos > this.end - 4)
            return 0;
        var val = this.buf.readFloatLE(this.pos);
        this.pos += 4;
        return val;
    }
    // i64        := sfixed64 | fixed64 | double;
    //                 encoded as 8-byte little-endian;
    //                 memcpy of the equivalent C types (u?int64_t, double)
    Sfixed64() {
        if (!this.ok || this.pos > this.end - 8)
            return long_1.default.ZERO;
        var lo = this.buf.readUint32LE(this.pos);
        this.pos += 4;
        var hi = this.buf.readUint32LE(this.pos);
        this.pos += 4;
        return long_1.default.fromBits(lo, hi);
    }
    Fixed64() {
        if (!this.ok || this.pos > this.end - 8)
            return long_1.default.ZERO;
        var lo = this.buf.readUint32LE(this.pos);
        this.pos += 4;
        var hi = this.buf.readUint32LE(this.pos);
        this.pos += 4;
        return long_1.default.fromBits(lo, hi);
    }
    Double() {
        if (!this.ok || this.pos > this.end - 8)
            return 0;
        var val = this.buf.readDoubleLE(this.pos);
        this.pos += 8;
        return val;
    }
    // len-prefix := size (message | string | bytes | packed);
    //                 size encoded as int32 varint
    Bytes() {
        if (!this.ok)
            return exports.EMPTY_BUFFER;
        return this.buf.subarray(this.pos, this.end);
    }
    String() {
        if (!this.ok)
            return '';
        return this.buf.toString('utf-8', this.pos, this.end);
    }
    // Only repeated fields of primitive numeric types can be declared "packed".
    // These are types that would normally use the VARINT, I32, or I64 wire types.
    Packed(type) {
        var arr = [];
        while (this.ok && this.pos < this.end) {
            arr.push(this[type]());
        }
        if (!this.ok)
            throw new Error('packed read failed');
        return arr;
    }
    seek(fieldId) {
        if (!this.ok)
            return;
        this.varint();
        while (this.last >>> 3 !== fieldId) {
            this.skip();
            if (!this.ok)
                break;
            this.varint();
        }
    }
    size() {
        switch ((this.last & 0x07)) {
            case Wiretype.VARINT:
                return 0;
            case Wiretype.I64:
                return 8;
            case Wiretype.I32:
                return 4;
            case Wiretype.LEN:
                return this.readVarint32();
            // can't know the size of groups without reading them, and
            // we don't really care.
            case Wiretype.SGROUP:
            case Wiretype.EGROUP:
                throw new Error('not implemented');
        }
    }
    /**
     * Seek to the next instance of fieldId, which must be a LEN wiretype,
     * and rescope this instance to its payload
     */
    with(fieldId) {
        this.seek(fieldId);
        if (!this.ok)
            return this;
        var size = this.size();
        this.end = size ? this.pos + size : this.end;
        return this;
    }
    /**
     * Find the next instance of the specified fieldId, and call the callback
     * with a new ProtoHax instance if found.
     */
    if(fieldId, cb) {
        if (!this.ok)
            return this;
        this.seek(fieldId);
        if (!this.ok)
            return this;
        var size = this.size();
        var val;
        if (size > 0) {
            val = this.buf.subarray(this.pos, this.pos + size);
            // move the pointer forward by the size of the payload
            this.pos += size;
        }
        else {
            val = this.buf.subarray(this.pos);
            // we're assuming here that size=0 is a varint, and everything
            // else (that doesn't throw an error) has a size that's known
            // up-front. therefore, in order to move our position pointer
            // forward, all we have to do here is skip a varint
            this.skipVarint();
        }
        if (this.ok)
            cb(new ProtoHax(val));
        this.ok = this.pos < this.end;
        return this;
    }
    /**
     * Find all instances of the specified fieldId and call the callback
     * with a new ProtoHax instance for each.
     */
    each(fieldId, cb) {
        while (this.ok) {
            this.if(fieldId, cb);
            // this.skip();
        }
        return this;
    }
}
exports.ProtoHax = ProtoHax;