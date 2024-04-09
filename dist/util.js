"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.M = void 0;
const pbjs_pb_1 = require("./pbjs_pb");
const pbreflect_1 = require("./pbreflect");
/**
 * Factory functions for each action type. Each function
 * accepts an action payload and returns an `NT.Envelope` instance
 *
 * @example
 * ```ts
 * M.cChat({ message: 'hi there' })
 * ```
 */
exports.M = {};
for (const key of pbreflect_1.gameActions) {
    exports.M[key] = ((data, encoded) => encoded
        ? pbjs_pb_1.NT.Envelope.encode({ gameAction: { [key]: data } }).finish()
        : pbjs_pb_1.NT.Envelope.fromObject({
            gameAction: { [key]: data },
        }));
}
for (const key of pbreflect_1.lobbyActions) {
    exports.M[key] = ((data, encoded) => encoded
        ? pbjs_pb_1.NT.Envelope.encode({ lobbyAction: { [key]: data } }).finish()
        : pbjs_pb_1.NT.Envelope.fromObject({
            lobbyAction: { [key]: data },
        }));
}
exports.M['hello'] = ((data, encoded) => encoded
    ? pbjs_pb_1.NT.Envelope.encode({ hello: data }).finish()
    : pbjs_pb_1.NT.Envelope.fromObject({ hello: data }));
