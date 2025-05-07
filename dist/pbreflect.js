"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lobbyActions = exports.gameActions = exports.Messages = void 0;
const pbjs_pb_json_1 = __importDefault(require("./pbjs_pb.json"));
const NT = pbjs_pb_json_1.default.nested.NT.nested;
const MessagesImpl = Object.create(null);
for (const [msgName, defs] of Object.entries(NT)) {
    if ('fields' in defs) {
        const fields = Object.create(null);
        for (const [fieldName, nameid] of Object.entries(defs.fields)) {
            fields[fieldName] = nameid.id;
        }
        MessagesImpl[msgName] = fields;
    }
    else if ('values' in defs) {
        const values = Object.create(null);
        for (const [valueName, valueId] of Object.entries(defs.values)) {
            values[valueName] = valueId;
        }
        MessagesImpl[msgName] = values;
    }
}
exports.Messages = MessagesImpl;
exports.gameActions = Object.keys(pbjs_pb_json_1.default.nested.NT.nested.GameAction.fields);
exports.lobbyActions = Object.keys(pbjs_pb_json_1.default.nested.NT.nested.LobbyAction.fields);
