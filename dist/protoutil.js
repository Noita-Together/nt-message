"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagPlayerMove = exports.maybePlayerMove = void 0;
const protohax_1 = require("./protohax/protohax");
const pbreflect_1 = require("./pbreflect");
const gameActionId = pbreflect_1.Messages.Envelope.gameAction;
const cPlayerMoveId = pbreflect_1.Messages.GameAction.cPlayerMove;
const sPlayerMovesId = pbreflect_1.Messages.GameAction.sPlayerMoves;
const cpfPlayerId = pbreflect_1.Messages.CompactPlayerFrames.userId;
const userFramesId = pbreflect_1.Messages.ServerPlayerMoves.userFrames;
const maybePlayerMove = (envelope) => new protohax_1.ProtoHax(envelope).with(gameActionId).with(cPlayerMoveId).Bytes();
exports.maybePlayerMove = maybePlayerMove;
const sizeofVarint32 = (val) => {
    if (val <= 0x7f)
        return 1;
    if (val <= 0x3fff)
        return 2;
    if (val <= 0x1fffff)
        return 3;
    if (val <= 0xfffffff)
        return 4;
    if (val <= 0xffffffff)
        return 5;
    throw new RangeError('Invalid value (too many bits)');
};
const writeVarint32 = (buf, val, pos) => {
    if (val <= 0x7f) {
        buf[pos++] = val;
        return 1;
    }
    if (val <= 0x3fff) {
        buf[pos++] = (val & 0x7f) | 0x80;
        buf[pos++] = (val >>> 7) & 0x7f;
        return 2;
    }
    if (val <= 0x1fffff) {
        buf[pos++] = (val & 0x7f) | 0x80;
        buf[pos++] = ((val >>> 7) & 0x7f) | 0x80;
        buf[pos++] = (val >>> 14) & 0x7f;
        return 3;
    }
    if (val <= 0xfffffff) {
        buf[pos++] = (val & 0x7f) | 0x80;
        buf[pos++] = ((val >>> 7) & 0x7f) | 0x80;
        buf[pos++] = ((val >>> 14) & 0x7f) | 0x80;
        buf[pos++] = (val >>> 21) & 0x7f;
        return 4;
    }
    if (val <= 0xffffffff) {
        buf[pos++] = (val & 0x7f) | 0x80;
        buf[pos++] = ((val >>> 7) & 0x7f) | 0x80;
        buf[pos++] = ((val >>> 14) & 0x7f) | 0x80;
        buf[pos++] = ((val >>> 21) & 0x7f) | 0x80;
        buf[pos++] = (val >>> 28) & 0x0f;
        return 5;
    }
    throw new RangeError('Invalid value (too many bits)');
};
const tagPlayerMove = (cpf, pmId) => {
    // reject c2s CompactPlayerFrames with userId specified
    const embeddedUserId = new protohax_1.ProtoHax(cpf).with(cpfPlayerId).Bytes();
    if (embeddedUserId.length > 0)
        return;
    // prettier-ignore
    const userFramesPayloadSize = ((1 + 1) // userId string tag + length
        + pmId.length // userId (string) payload
        + cpf.length // CompactPlayerFrames message (from client)
    );
    const userFramesHeaderSize = sizeofVarint32(userFramesPayloadSize) + 1;
    const spmPayloadSize = userFramesPayloadSize + userFramesHeaderSize;
    const spmHeaderSize = sizeofVarint32(spmPayloadSize) + 1;
    const gameActionPayloadSize = spmPayloadSize + spmHeaderSize;
    const gameActionHeaderSize = sizeofVarint32(gameActionPayloadSize) + 1;
    const msgLength = gameActionHeaderSize + spmHeaderSize + userFramesHeaderSize + userFramesPayloadSize;
    const buf = Buffer.alloc(msgLength);
    let pos = 0;
    // write GameAction tag+length
    buf[pos++] = (gameActionId << 3) | protohax_1.Wiretype.LEN;
    pos += writeVarint32(buf, gameActionPayloadSize, pos);
    // write ServerPlayerMoves tag+length
    buf[pos++] = (sPlayerMovesId << 3) | protohax_1.Wiretype.LEN;
    pos += writeVarint32(buf, spmPayloadSize, pos);
    // write CompactPlayerFrames tag+length
    buf[pos++] = (userFramesId << 3) | protohax_1.Wiretype.LEN;
    pos += writeVarint32(buf, userFramesPayloadSize, pos);
    // write userId
    buf[pos++] = (cpfPlayerId << 3) | protohax_1.Wiretype.LEN;
    buf[pos++] = pmId.length;
    pmId.copy(buf, pos, 0);
    pos += pmId.length;
    // write the client-sent compactframes data
    cpf.copy(buf, pos);
    return buf;
};
exports.tagPlayerMove = tagPlayerMove;
