// src/protohax/protohax.ts
var EMPTY_BUFFER = Buffer.of();
var ProtoHax = class _ProtoHax {
  constructor(buf) {
    this.buf = buf;
    this.end = buf.length;
    this.ok = this.pos < this.end;
  }
  pos = 0;
  last = 0;
  end;
  ok;
  atEnd() {
    return this.pos >= this.end;
  }
  varint() {
    if (!this.ok)
      return;
    this.last = 0;
    for (var b = 0, shift = 0; shift < 28; shift += 7) {
      b = this.buf[this.pos++];
      this.last |= (b & 127) << shift;
      if ((b & 128) === 0)
        return;
    }
    this.ok = (b & 128) === 0;
  }
  skipVarint() {
    if (!this.ok)
      return;
    for (var i = 0; i < 10; i++) {
      if ((this.buf[this.pos++] & 128) === 0)
        return;
    }
    this.ok = false;
  }
  // skip the specified number of bytes
  skipBytes(bytes) {
    this.pos += bytes;
  }
  skipGroup(sgroup) {
    var until = sgroup ^ (4 /* EGROUP */ ^ 3 /* SGROUP */);
    do {
      this.skip();
      this.varint();
    } while (this.ok && this.last !== until);
  }
  // skip over a payload. the tag should be in `this.last`
  skip() {
    if (!this.ok)
      return;
    switch (this.last & 7) {
      case 0 /* VARINT */:
        this.skipVarint();
        break;
      case 1 /* I64 */:
        this.skipBytes(8);
        break;
      case 2 /* LEN */:
        this.varint();
        this.skipBytes(this.last);
        break;
      case 3 /* SGROUP */:
        this.skipGroup(this.last);
        break;
      case 4 /* EGROUP */:
        break;
      case 5 /* I32 */:
        this.skipBytes(4);
        break;
      default:
        throw new Error("Invalid wire type: " + (this.last & 7));
    }
    this.ok = this.pos < this.buf.length;
  }
  readVarint32() {
    this.varint();
    if (this.ok)
      return this.last >>> 0;
    var b = this.buf[this.pos++];
    this.ok = (b & 128) === 0;
    this.last |= (b & 15) << 28;
    for (var i = 0; !this.ok && i < 5; i++) {
      b = this.buf[this.pos++];
      this.ok = (b & 128) === 0;
    }
    if (!this.ok)
      throw new Error("VARINT read failed");
    return this.last >>> 0;
  }
  readVarint64() {
    if (!this.ok)
      return 0n;
    this.varint();
    var big = BigInt(this.last);
    if (this.ok)
      return big;
    for (var b = 0, shift = 28n; shift < 70n; shift += 7n) {
      b = this.buf[this.pos++];
      big |= (BigInt(b) & 0x7fn) << shift;
      if ((b & 128) === 0)
        break;
    }
    this.ok = (b & 128) === 0;
    if (!this.ok)
      throw new Error("VARINT64 read failed");
    return big & 0xffffffffffffffffn;
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
      return 0n;
    return BigInt.asIntN(64, this.readVarint64());
  }
  Uint32() {
    if (!this.ok)
      return 0;
    return this.readVarint32() >>> 0;
  }
  Uint64() {
    if (!this.ok)
      return 0n;
    return BigInt.asUintN(64, this.readVarint64());
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
        throw new Error("Invalid boolean value");
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
    return zze >>> 1 ^ -(zze & 1);
  }
  Sint64() {
    if (!this.ok)
      return 0n;
    var zze = this.readVarint64();
    return zze >> 1n ^ -(zze & 1n);
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
      return 0n;
    var val = this.buf.readBigInt64LE(this.pos);
    this.pos += 8;
    return val;
  }
  Fixed64() {
    if (!this.ok || this.pos > this.end - 8)
      return 0n;
    var val = this.buf.readBigUint64LE(this.pos);
    this.pos += 8;
    return val;
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
      return EMPTY_BUFFER;
    return this.buf.subarray(this.pos, this.end);
  }
  String() {
    if (!this.ok)
      return "";
    return this.buf.toString("utf-8", this.pos, this.end);
  }
  // Only repeated fields of primitive numeric types can be declared "packed".
  // These are types that would normally use the VARINT, I32, or I64 wire types.
  Packed(type) {
    var arr = [];
    while (this.ok && this.pos < this.end) {
      arr.push(this[type]());
    }
    if (!this.ok)
      throw new Error("packed read failed");
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
    switch (this.last & 7) {
      case 0 /* VARINT */:
        return 0;
      case 1 /* I64 */:
        return 8;
      case 5 /* I32 */:
        return 4;
      case 2 /* LEN */:
        return this.readVarint32();
      case 3 /* SGROUP */:
      case 4 /* EGROUP */:
        throw new Error("not implemented");
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
      this.pos += size;
    } else {
      val = this.buf.subarray(this.pos);
      this.skipVarint();
    }
    if (this.ok)
      cb(new _ProtoHax(val));
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
    }
    return this;
  }
};

// src/gen/pbjs_pb.js
import * as $protobuf from "protobufjs/minimal";
var $Reader = $protobuf.Reader;
var $Writer = $protobuf.Writer;
var $util = $protobuf.util;
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});
var NT = $root.NT = (() => {
  const NT3 = {};
  NT3.Envelope = function() {
    function Envelope(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    Envelope.prototype.gameAction = null;
    Envelope.prototype.lobbyAction = null;
    let $oneOfFields;
    Object.defineProperty(Envelope.prototype, "kind", {
      get: $util.oneOfGetter($oneOfFields = ["gameAction", "lobbyAction"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Envelope.create = function create(properties) {
      return new Envelope(properties);
    };
    Envelope.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.gameAction != null && Object.hasOwnProperty.call(message, "gameAction"))
        $root.NT.GameAction.encode(message.gameAction, writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).fork()).ldelim();
      if (message.lobbyAction != null && Object.hasOwnProperty.call(message, "lobbyAction"))
        $root.NT.LobbyAction.encode(message.lobbyAction, writer.uint32(
          /* id 50, wireType 2 =*/
          402
        ).fork()).ldelim();
      return writer;
    };
    Envelope.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    Envelope.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.Envelope();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.gameAction = $root.NT.GameAction.decode(reader, reader.uint32());
            break;
          }
          case 50: {
            message.lobbyAction = $root.NT.LobbyAction.decode(reader, reader.uint32());
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    Envelope.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    Envelope.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.gameAction != null && message.hasOwnProperty("gameAction")) {
        properties.kind = 1;
        {
          let error = $root.NT.GameAction.verify(message.gameAction);
          if (error)
            return "gameAction." + error;
        }
      }
      if (message.lobbyAction != null && message.hasOwnProperty("lobbyAction")) {
        if (properties.kind === 1)
          return "kind: multiple values";
        properties.kind = 1;
        {
          let error = $root.NT.LobbyAction.verify(message.lobbyAction);
          if (error)
            return "lobbyAction." + error;
        }
      }
      return null;
    };
    Envelope.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.Envelope)
        return object;
      let message = new $root.NT.Envelope();
      if (object.gameAction != null) {
        if (typeof object.gameAction !== "object")
          throw TypeError(".NT.Envelope.gameAction: object expected");
        message.gameAction = $root.NT.GameAction.fromObject(object.gameAction);
      }
      if (object.lobbyAction != null) {
        if (typeof object.lobbyAction !== "object")
          throw TypeError(".NT.Envelope.lobbyAction: object expected");
        message.lobbyAction = $root.NT.LobbyAction.fromObject(object.lobbyAction);
      }
      return message;
    };
    Envelope.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (message.gameAction != null && message.hasOwnProperty("gameAction")) {
        object.gameAction = $root.NT.GameAction.toObject(message.gameAction, options);
        if (options.oneofs)
          object.kind = "gameAction";
      }
      if (message.lobbyAction != null && message.hasOwnProperty("lobbyAction")) {
        object.lobbyAction = $root.NT.LobbyAction.toObject(message.lobbyAction, options);
        if (options.oneofs)
          object.kind = "lobbyAction";
      }
      return object;
    };
    Envelope.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    Envelope.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.Envelope";
    };
    return Envelope;
  }();
  NT3.GameAction = function() {
    function GameAction(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    GameAction.prototype.cPlayerMove = null;
    GameAction.prototype.sPlayerMoves = null;
    GameAction.prototype.cPlayerUpdate = null;
    GameAction.prototype.sPlayerUpdate = null;
    GameAction.prototype.cPlayerUpdateInventory = null;
    GameAction.prototype.sPlayerUpdateInventory = null;
    GameAction.prototype.cHostItemBank = null;
    GameAction.prototype.sHostItemBank = null;
    GameAction.prototype.cHostUserTake = null;
    GameAction.prototype.sHostUserTake = null;
    GameAction.prototype.cHostUserTakeGold = null;
    GameAction.prototype.sHostUserTakeGold = null;
    GameAction.prototype.cPlayerAddGold = null;
    GameAction.prototype.sPlayerAddGold = null;
    GameAction.prototype.cPlayerTakeGold = null;
    GameAction.prototype.sPlayerTakeGold = null;
    GameAction.prototype.cPlayerAddItem = null;
    GameAction.prototype.sPlayerAddItem = null;
    GameAction.prototype.cPlayerTakeItem = null;
    GameAction.prototype.sPlayerTakeItem = null;
    GameAction.prototype.cPlayerPickup = null;
    GameAction.prototype.sPlayerPickup = null;
    GameAction.prototype.cNemesisAbility = null;
    GameAction.prototype.sNemesisAbility = null;
    GameAction.prototype.cNemesisPickupItem = null;
    GameAction.prototype.sNemesisPickupItem = null;
    GameAction.prototype.cChat = null;
    GameAction.prototype.sChat = null;
    GameAction.prototype.cPlayerDeath = null;
    GameAction.prototype.sPlayerDeath = null;
    GameAction.prototype.cPlayerNewGamePlus = null;
    GameAction.prototype.sPlayerNewGamePlus = null;
    GameAction.prototype.cPlayerSecretHourglass = null;
    GameAction.prototype.sPlayerSecretHourglass = null;
    GameAction.prototype.cCustomModEvent = null;
    GameAction.prototype.sCustomModEvent = null;
    GameAction.prototype.cRespawnPenalty = null;
    GameAction.prototype.sRespawnPenalty = null;
    GameAction.prototype.cAngerySteve = null;
    GameAction.prototype.sAngerySteve = null;
    GameAction.prototype.sStatUpdate = null;
    let $oneOfFields;
    Object.defineProperty(GameAction.prototype, "action", {
      get: $util.oneOfGetter($oneOfFields = ["cPlayerMove", "sPlayerMoves", "cPlayerUpdate", "sPlayerUpdate", "cPlayerUpdateInventory", "sPlayerUpdateInventory", "cHostItemBank", "sHostItemBank", "cHostUserTake", "sHostUserTake", "cHostUserTakeGold", "sHostUserTakeGold", "cPlayerAddGold", "sPlayerAddGold", "cPlayerTakeGold", "sPlayerTakeGold", "cPlayerAddItem", "sPlayerAddItem", "cPlayerTakeItem", "sPlayerTakeItem", "cPlayerPickup", "sPlayerPickup", "cNemesisAbility", "sNemesisAbility", "cNemesisPickupItem", "sNemesisPickupItem", "cChat", "sChat", "cPlayerDeath", "sPlayerDeath", "cPlayerNewGamePlus", "sPlayerNewGamePlus", "cPlayerSecretHourglass", "sPlayerSecretHourglass", "cCustomModEvent", "sCustomModEvent", "cRespawnPenalty", "sRespawnPenalty", "cAngerySteve", "sAngerySteve", "sStatUpdate"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    GameAction.create = function create(properties) {
      return new GameAction(properties);
    };
    GameAction.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.cPlayerMove != null && Object.hasOwnProperty.call(message, "cPlayerMove"))
        $root.NT.CompactPlayerFrames.encode(message.cPlayerMove, writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).fork()).ldelim();
      if (message.sPlayerMoves != null && Object.hasOwnProperty.call(message, "sPlayerMoves"))
        $root.NT.ServerPlayerMoves.encode(message.sPlayerMoves, writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).fork()).ldelim();
      if (message.cPlayerUpdate != null && Object.hasOwnProperty.call(message, "cPlayerUpdate"))
        $root.NT.ClientPlayerUpdate.encode(message.cPlayerUpdate, writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).fork()).ldelim();
      if (message.sPlayerUpdate != null && Object.hasOwnProperty.call(message, "sPlayerUpdate"))
        $root.NT.ServerPlayerUpdate.encode(message.sPlayerUpdate, writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).fork()).ldelim();
      if (message.cPlayerUpdateInventory != null && Object.hasOwnProperty.call(message, "cPlayerUpdateInventory"))
        $root.NT.ClientPlayerUpdateInventory.encode(message.cPlayerUpdateInventory, writer.uint32(
          /* id 5, wireType 2 =*/
          42
        ).fork()).ldelim();
      if (message.sPlayerUpdateInventory != null && Object.hasOwnProperty.call(message, "sPlayerUpdateInventory"))
        $root.NT.ServerPlayerUpdateInventory.encode(message.sPlayerUpdateInventory, writer.uint32(
          /* id 6, wireType 2 =*/
          50
        ).fork()).ldelim();
      if (message.cHostItemBank != null && Object.hasOwnProperty.call(message, "cHostItemBank"))
        $root.NT.ClientHostItemBank.encode(message.cHostItemBank, writer.uint32(
          /* id 7, wireType 2 =*/
          58
        ).fork()).ldelim();
      if (message.sHostItemBank != null && Object.hasOwnProperty.call(message, "sHostItemBank"))
        $root.NT.ServerHostItemBank.encode(message.sHostItemBank, writer.uint32(
          /* id 8, wireType 2 =*/
          66
        ).fork()).ldelim();
      if (message.cHostUserTake != null && Object.hasOwnProperty.call(message, "cHostUserTake"))
        $root.NT.ClientHostUserTake.encode(message.cHostUserTake, writer.uint32(
          /* id 9, wireType 2 =*/
          74
        ).fork()).ldelim();
      if (message.sHostUserTake != null && Object.hasOwnProperty.call(message, "sHostUserTake"))
        $root.NT.ServerHostUserTake.encode(message.sHostUserTake, writer.uint32(
          /* id 10, wireType 2 =*/
          82
        ).fork()).ldelim();
      if (message.cHostUserTakeGold != null && Object.hasOwnProperty.call(message, "cHostUserTakeGold"))
        $root.NT.ClientHostUserTakeGold.encode(message.cHostUserTakeGold, writer.uint32(
          /* id 11, wireType 2 =*/
          90
        ).fork()).ldelim();
      if (message.sHostUserTakeGold != null && Object.hasOwnProperty.call(message, "sHostUserTakeGold"))
        $root.NT.ServerHostUserTakeGold.encode(message.sHostUserTakeGold, writer.uint32(
          /* id 12, wireType 2 =*/
          98
        ).fork()).ldelim();
      if (message.cPlayerAddGold != null && Object.hasOwnProperty.call(message, "cPlayerAddGold"))
        $root.NT.ClientPlayerAddGold.encode(message.cPlayerAddGold, writer.uint32(
          /* id 13, wireType 2 =*/
          106
        ).fork()).ldelim();
      if (message.sPlayerAddGold != null && Object.hasOwnProperty.call(message, "sPlayerAddGold"))
        $root.NT.ServerPlayerAddGold.encode(message.sPlayerAddGold, writer.uint32(
          /* id 14, wireType 2 =*/
          114
        ).fork()).ldelim();
      if (message.cPlayerTakeGold != null && Object.hasOwnProperty.call(message, "cPlayerTakeGold"))
        $root.NT.ClientPlayerTakeGold.encode(message.cPlayerTakeGold, writer.uint32(
          /* id 15, wireType 2 =*/
          122
        ).fork()).ldelim();
      if (message.sPlayerTakeGold != null && Object.hasOwnProperty.call(message, "sPlayerTakeGold"))
        $root.NT.ServerPlayerTakeGold.encode(message.sPlayerTakeGold, writer.uint32(
          /* id 16, wireType 2 =*/
          130
        ).fork()).ldelim();
      if (message.cPlayerAddItem != null && Object.hasOwnProperty.call(message, "cPlayerAddItem"))
        $root.NT.ClientPlayerAddItem.encode(message.cPlayerAddItem, writer.uint32(
          /* id 17, wireType 2 =*/
          138
        ).fork()).ldelim();
      if (message.sPlayerAddItem != null && Object.hasOwnProperty.call(message, "sPlayerAddItem"))
        $root.NT.ServerPlayerAddItem.encode(message.sPlayerAddItem, writer.uint32(
          /* id 18, wireType 2 =*/
          146
        ).fork()).ldelim();
      if (message.cPlayerTakeItem != null && Object.hasOwnProperty.call(message, "cPlayerTakeItem"))
        $root.NT.ClientPlayerTakeItem.encode(message.cPlayerTakeItem, writer.uint32(
          /* id 19, wireType 2 =*/
          154
        ).fork()).ldelim();
      if (message.sPlayerTakeItem != null && Object.hasOwnProperty.call(message, "sPlayerTakeItem"))
        $root.NT.ServerPlayerTakeItem.encode(message.sPlayerTakeItem, writer.uint32(
          /* id 20, wireType 2 =*/
          162
        ).fork()).ldelim();
      if (message.cPlayerPickup != null && Object.hasOwnProperty.call(message, "cPlayerPickup"))
        $root.NT.ClientPlayerPickup.encode(message.cPlayerPickup, writer.uint32(
          /* id 21, wireType 2 =*/
          170
        ).fork()).ldelim();
      if (message.sPlayerPickup != null && Object.hasOwnProperty.call(message, "sPlayerPickup"))
        $root.NT.ServerPlayerPickup.encode(message.sPlayerPickup, writer.uint32(
          /* id 22, wireType 2 =*/
          178
        ).fork()).ldelim();
      if (message.cNemesisAbility != null && Object.hasOwnProperty.call(message, "cNemesisAbility"))
        $root.NT.ClientNemesisAbility.encode(message.cNemesisAbility, writer.uint32(
          /* id 23, wireType 2 =*/
          186
        ).fork()).ldelim();
      if (message.sNemesisAbility != null && Object.hasOwnProperty.call(message, "sNemesisAbility"))
        $root.NT.ServerNemesisAbility.encode(message.sNemesisAbility, writer.uint32(
          /* id 24, wireType 2 =*/
          194
        ).fork()).ldelim();
      if (message.cNemesisPickupItem != null && Object.hasOwnProperty.call(message, "cNemesisPickupItem"))
        $root.NT.ClientNemesisPickupItem.encode(message.cNemesisPickupItem, writer.uint32(
          /* id 25, wireType 2 =*/
          202
        ).fork()).ldelim();
      if (message.sNemesisPickupItem != null && Object.hasOwnProperty.call(message, "sNemesisPickupItem"))
        $root.NT.ServerNemesisPickupItem.encode(message.sNemesisPickupItem, writer.uint32(
          /* id 26, wireType 2 =*/
          210
        ).fork()).ldelim();
      if (message.cChat != null && Object.hasOwnProperty.call(message, "cChat"))
        $root.NT.ClientChat.encode(message.cChat, writer.uint32(
          /* id 27, wireType 2 =*/
          218
        ).fork()).ldelim();
      if (message.sChat != null && Object.hasOwnProperty.call(message, "sChat"))
        $root.NT.ServerChat.encode(message.sChat, writer.uint32(
          /* id 28, wireType 2 =*/
          226
        ).fork()).ldelim();
      if (message.cPlayerDeath != null && Object.hasOwnProperty.call(message, "cPlayerDeath"))
        $root.NT.ClientPlayerDeath.encode(message.cPlayerDeath, writer.uint32(
          /* id 29, wireType 2 =*/
          234
        ).fork()).ldelim();
      if (message.sPlayerDeath != null && Object.hasOwnProperty.call(message, "sPlayerDeath"))
        $root.NT.ServerPlayerDeath.encode(message.sPlayerDeath, writer.uint32(
          /* id 30, wireType 2 =*/
          242
        ).fork()).ldelim();
      if (message.cPlayerNewGamePlus != null && Object.hasOwnProperty.call(message, "cPlayerNewGamePlus"))
        $root.NT.ClientPlayerNewGamePlus.encode(message.cPlayerNewGamePlus, writer.uint32(
          /* id 31, wireType 2 =*/
          250
        ).fork()).ldelim();
      if (message.sPlayerNewGamePlus != null && Object.hasOwnProperty.call(message, "sPlayerNewGamePlus"))
        $root.NT.ServerPlayerNewGamePlus.encode(message.sPlayerNewGamePlus, writer.uint32(
          /* id 32, wireType 2 =*/
          258
        ).fork()).ldelim();
      if (message.cPlayerSecretHourglass != null && Object.hasOwnProperty.call(message, "cPlayerSecretHourglass"))
        $root.NT.ClientPlayerSecretHourglass.encode(message.cPlayerSecretHourglass, writer.uint32(
          /* id 33, wireType 2 =*/
          266
        ).fork()).ldelim();
      if (message.sPlayerSecretHourglass != null && Object.hasOwnProperty.call(message, "sPlayerSecretHourglass"))
        $root.NT.ServerPlayerSecretHourglass.encode(message.sPlayerSecretHourglass, writer.uint32(
          /* id 34, wireType 2 =*/
          274
        ).fork()).ldelim();
      if (message.cCustomModEvent != null && Object.hasOwnProperty.call(message, "cCustomModEvent"))
        $root.NT.ClientCustomModEvent.encode(message.cCustomModEvent, writer.uint32(
          /* id 35, wireType 2 =*/
          282
        ).fork()).ldelim();
      if (message.sCustomModEvent != null && Object.hasOwnProperty.call(message, "sCustomModEvent"))
        $root.NT.ServerCustomModEvent.encode(message.sCustomModEvent, writer.uint32(
          /* id 36, wireType 2 =*/
          290
        ).fork()).ldelim();
      if (message.cRespawnPenalty != null && Object.hasOwnProperty.call(message, "cRespawnPenalty"))
        $root.NT.ClientRespawnPenalty.encode(message.cRespawnPenalty, writer.uint32(
          /* id 37, wireType 2 =*/
          298
        ).fork()).ldelim();
      if (message.sRespawnPenalty != null && Object.hasOwnProperty.call(message, "sRespawnPenalty"))
        $root.NT.ServerRespawnPenalty.encode(message.sRespawnPenalty, writer.uint32(
          /* id 38, wireType 2 =*/
          306
        ).fork()).ldelim();
      if (message.cAngerySteve != null && Object.hasOwnProperty.call(message, "cAngerySteve"))
        $root.NT.ClientAngerySteve.encode(message.cAngerySteve, writer.uint32(
          /* id 39, wireType 2 =*/
          314
        ).fork()).ldelim();
      if (message.sAngerySteve != null && Object.hasOwnProperty.call(message, "sAngerySteve"))
        $root.NT.ServerAngerySteve.encode(message.sAngerySteve, writer.uint32(
          /* id 40, wireType 2 =*/
          322
        ).fork()).ldelim();
      if (message.sStatUpdate != null && Object.hasOwnProperty.call(message, "sStatUpdate"))
        $root.NT.ServerStatsUpdate.encode(message.sStatUpdate, writer.uint32(
          /* id 42, wireType 2 =*/
          338
        ).fork()).ldelim();
      return writer;
    };
    GameAction.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    GameAction.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.GameAction();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.cPlayerMove = $root.NT.CompactPlayerFrames.decode(reader, reader.uint32());
            break;
          }
          case 2: {
            message.sPlayerMoves = $root.NT.ServerPlayerMoves.decode(reader, reader.uint32());
            break;
          }
          case 3: {
            message.cPlayerUpdate = $root.NT.ClientPlayerUpdate.decode(reader, reader.uint32());
            break;
          }
          case 4: {
            message.sPlayerUpdate = $root.NT.ServerPlayerUpdate.decode(reader, reader.uint32());
            break;
          }
          case 5: {
            message.cPlayerUpdateInventory = $root.NT.ClientPlayerUpdateInventory.decode(reader, reader.uint32());
            break;
          }
          case 6: {
            message.sPlayerUpdateInventory = $root.NT.ServerPlayerUpdateInventory.decode(reader, reader.uint32());
            break;
          }
          case 7: {
            message.cHostItemBank = $root.NT.ClientHostItemBank.decode(reader, reader.uint32());
            break;
          }
          case 8: {
            message.sHostItemBank = $root.NT.ServerHostItemBank.decode(reader, reader.uint32());
            break;
          }
          case 9: {
            message.cHostUserTake = $root.NT.ClientHostUserTake.decode(reader, reader.uint32());
            break;
          }
          case 10: {
            message.sHostUserTake = $root.NT.ServerHostUserTake.decode(reader, reader.uint32());
            break;
          }
          case 11: {
            message.cHostUserTakeGold = $root.NT.ClientHostUserTakeGold.decode(reader, reader.uint32());
            break;
          }
          case 12: {
            message.sHostUserTakeGold = $root.NT.ServerHostUserTakeGold.decode(reader, reader.uint32());
            break;
          }
          case 13: {
            message.cPlayerAddGold = $root.NT.ClientPlayerAddGold.decode(reader, reader.uint32());
            break;
          }
          case 14: {
            message.sPlayerAddGold = $root.NT.ServerPlayerAddGold.decode(reader, reader.uint32());
            break;
          }
          case 15: {
            message.cPlayerTakeGold = $root.NT.ClientPlayerTakeGold.decode(reader, reader.uint32());
            break;
          }
          case 16: {
            message.sPlayerTakeGold = $root.NT.ServerPlayerTakeGold.decode(reader, reader.uint32());
            break;
          }
          case 17: {
            message.cPlayerAddItem = $root.NT.ClientPlayerAddItem.decode(reader, reader.uint32());
            break;
          }
          case 18: {
            message.sPlayerAddItem = $root.NT.ServerPlayerAddItem.decode(reader, reader.uint32());
            break;
          }
          case 19: {
            message.cPlayerTakeItem = $root.NT.ClientPlayerTakeItem.decode(reader, reader.uint32());
            break;
          }
          case 20: {
            message.sPlayerTakeItem = $root.NT.ServerPlayerTakeItem.decode(reader, reader.uint32());
            break;
          }
          case 21: {
            message.cPlayerPickup = $root.NT.ClientPlayerPickup.decode(reader, reader.uint32());
            break;
          }
          case 22: {
            message.sPlayerPickup = $root.NT.ServerPlayerPickup.decode(reader, reader.uint32());
            break;
          }
          case 23: {
            message.cNemesisAbility = $root.NT.ClientNemesisAbility.decode(reader, reader.uint32());
            break;
          }
          case 24: {
            message.sNemesisAbility = $root.NT.ServerNemesisAbility.decode(reader, reader.uint32());
            break;
          }
          case 25: {
            message.cNemesisPickupItem = $root.NT.ClientNemesisPickupItem.decode(reader, reader.uint32());
            break;
          }
          case 26: {
            message.sNemesisPickupItem = $root.NT.ServerNemesisPickupItem.decode(reader, reader.uint32());
            break;
          }
          case 27: {
            message.cChat = $root.NT.ClientChat.decode(reader, reader.uint32());
            break;
          }
          case 28: {
            message.sChat = $root.NT.ServerChat.decode(reader, reader.uint32());
            break;
          }
          case 29: {
            message.cPlayerDeath = $root.NT.ClientPlayerDeath.decode(reader, reader.uint32());
            break;
          }
          case 30: {
            message.sPlayerDeath = $root.NT.ServerPlayerDeath.decode(reader, reader.uint32());
            break;
          }
          case 31: {
            message.cPlayerNewGamePlus = $root.NT.ClientPlayerNewGamePlus.decode(reader, reader.uint32());
            break;
          }
          case 32: {
            message.sPlayerNewGamePlus = $root.NT.ServerPlayerNewGamePlus.decode(reader, reader.uint32());
            break;
          }
          case 33: {
            message.cPlayerSecretHourglass = $root.NT.ClientPlayerSecretHourglass.decode(reader, reader.uint32());
            break;
          }
          case 34: {
            message.sPlayerSecretHourglass = $root.NT.ServerPlayerSecretHourglass.decode(reader, reader.uint32());
            break;
          }
          case 35: {
            message.cCustomModEvent = $root.NT.ClientCustomModEvent.decode(reader, reader.uint32());
            break;
          }
          case 36: {
            message.sCustomModEvent = $root.NT.ServerCustomModEvent.decode(reader, reader.uint32());
            break;
          }
          case 37: {
            message.cRespawnPenalty = $root.NT.ClientRespawnPenalty.decode(reader, reader.uint32());
            break;
          }
          case 38: {
            message.sRespawnPenalty = $root.NT.ServerRespawnPenalty.decode(reader, reader.uint32());
            break;
          }
          case 39: {
            message.cAngerySteve = $root.NT.ClientAngerySteve.decode(reader, reader.uint32());
            break;
          }
          case 40: {
            message.sAngerySteve = $root.NT.ServerAngerySteve.decode(reader, reader.uint32());
            break;
          }
          case 42: {
            message.sStatUpdate = $root.NT.ServerStatsUpdate.decode(reader, reader.uint32());
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    GameAction.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    GameAction.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.cPlayerMove != null && message.hasOwnProperty("cPlayerMove")) {
        properties.action = 1;
        {
          let error = $root.NT.CompactPlayerFrames.verify(message.cPlayerMove);
          if (error)
            return "cPlayerMove." + error;
        }
      }
      if (message.sPlayerMoves != null && message.hasOwnProperty("sPlayerMoves")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerMoves.verify(message.sPlayerMoves);
          if (error)
            return "sPlayerMoves." + error;
        }
      }
      if (message.cPlayerUpdate != null && message.hasOwnProperty("cPlayerUpdate")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientPlayerUpdate.verify(message.cPlayerUpdate);
          if (error)
            return "cPlayerUpdate." + error;
        }
      }
      if (message.sPlayerUpdate != null && message.hasOwnProperty("sPlayerUpdate")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerUpdate.verify(message.sPlayerUpdate);
          if (error)
            return "sPlayerUpdate." + error;
        }
      }
      if (message.cPlayerUpdateInventory != null && message.hasOwnProperty("cPlayerUpdateInventory")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientPlayerUpdateInventory.verify(message.cPlayerUpdateInventory);
          if (error)
            return "cPlayerUpdateInventory." + error;
        }
      }
      if (message.sPlayerUpdateInventory != null && message.hasOwnProperty("sPlayerUpdateInventory")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerUpdateInventory.verify(message.sPlayerUpdateInventory);
          if (error)
            return "sPlayerUpdateInventory." + error;
        }
      }
      if (message.cHostItemBank != null && message.hasOwnProperty("cHostItemBank")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientHostItemBank.verify(message.cHostItemBank);
          if (error)
            return "cHostItemBank." + error;
        }
      }
      if (message.sHostItemBank != null && message.hasOwnProperty("sHostItemBank")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerHostItemBank.verify(message.sHostItemBank);
          if (error)
            return "sHostItemBank." + error;
        }
      }
      if (message.cHostUserTake != null && message.hasOwnProperty("cHostUserTake")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientHostUserTake.verify(message.cHostUserTake);
          if (error)
            return "cHostUserTake." + error;
        }
      }
      if (message.sHostUserTake != null && message.hasOwnProperty("sHostUserTake")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerHostUserTake.verify(message.sHostUserTake);
          if (error)
            return "sHostUserTake." + error;
        }
      }
      if (message.cHostUserTakeGold != null && message.hasOwnProperty("cHostUserTakeGold")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientHostUserTakeGold.verify(message.cHostUserTakeGold);
          if (error)
            return "cHostUserTakeGold." + error;
        }
      }
      if (message.sHostUserTakeGold != null && message.hasOwnProperty("sHostUserTakeGold")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerHostUserTakeGold.verify(message.sHostUserTakeGold);
          if (error)
            return "sHostUserTakeGold." + error;
        }
      }
      if (message.cPlayerAddGold != null && message.hasOwnProperty("cPlayerAddGold")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientPlayerAddGold.verify(message.cPlayerAddGold);
          if (error)
            return "cPlayerAddGold." + error;
        }
      }
      if (message.sPlayerAddGold != null && message.hasOwnProperty("sPlayerAddGold")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerAddGold.verify(message.sPlayerAddGold);
          if (error)
            return "sPlayerAddGold." + error;
        }
      }
      if (message.cPlayerTakeGold != null && message.hasOwnProperty("cPlayerTakeGold")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientPlayerTakeGold.verify(message.cPlayerTakeGold);
          if (error)
            return "cPlayerTakeGold." + error;
        }
      }
      if (message.sPlayerTakeGold != null && message.hasOwnProperty("sPlayerTakeGold")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerTakeGold.verify(message.sPlayerTakeGold);
          if (error)
            return "sPlayerTakeGold." + error;
        }
      }
      if (message.cPlayerAddItem != null && message.hasOwnProperty("cPlayerAddItem")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientPlayerAddItem.verify(message.cPlayerAddItem);
          if (error)
            return "cPlayerAddItem." + error;
        }
      }
      if (message.sPlayerAddItem != null && message.hasOwnProperty("sPlayerAddItem")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerAddItem.verify(message.sPlayerAddItem);
          if (error)
            return "sPlayerAddItem." + error;
        }
      }
      if (message.cPlayerTakeItem != null && message.hasOwnProperty("cPlayerTakeItem")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientPlayerTakeItem.verify(message.cPlayerTakeItem);
          if (error)
            return "cPlayerTakeItem." + error;
        }
      }
      if (message.sPlayerTakeItem != null && message.hasOwnProperty("sPlayerTakeItem")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerTakeItem.verify(message.sPlayerTakeItem);
          if (error)
            return "sPlayerTakeItem." + error;
        }
      }
      if (message.cPlayerPickup != null && message.hasOwnProperty("cPlayerPickup")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientPlayerPickup.verify(message.cPlayerPickup);
          if (error)
            return "cPlayerPickup." + error;
        }
      }
      if (message.sPlayerPickup != null && message.hasOwnProperty("sPlayerPickup")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerPickup.verify(message.sPlayerPickup);
          if (error)
            return "sPlayerPickup." + error;
        }
      }
      if (message.cNemesisAbility != null && message.hasOwnProperty("cNemesisAbility")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientNemesisAbility.verify(message.cNemesisAbility);
          if (error)
            return "cNemesisAbility." + error;
        }
      }
      if (message.sNemesisAbility != null && message.hasOwnProperty("sNemesisAbility")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerNemesisAbility.verify(message.sNemesisAbility);
          if (error)
            return "sNemesisAbility." + error;
        }
      }
      if (message.cNemesisPickupItem != null && message.hasOwnProperty("cNemesisPickupItem")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientNemesisPickupItem.verify(message.cNemesisPickupItem);
          if (error)
            return "cNemesisPickupItem." + error;
        }
      }
      if (message.sNemesisPickupItem != null && message.hasOwnProperty("sNemesisPickupItem")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerNemesisPickupItem.verify(message.sNemesisPickupItem);
          if (error)
            return "sNemesisPickupItem." + error;
        }
      }
      if (message.cChat != null && message.hasOwnProperty("cChat")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientChat.verify(message.cChat);
          if (error)
            return "cChat." + error;
        }
      }
      if (message.sChat != null && message.hasOwnProperty("sChat")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerChat.verify(message.sChat);
          if (error)
            return "sChat." + error;
        }
      }
      if (message.cPlayerDeath != null && message.hasOwnProperty("cPlayerDeath")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientPlayerDeath.verify(message.cPlayerDeath);
          if (error)
            return "cPlayerDeath." + error;
        }
      }
      if (message.sPlayerDeath != null && message.hasOwnProperty("sPlayerDeath")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerDeath.verify(message.sPlayerDeath);
          if (error)
            return "sPlayerDeath." + error;
        }
      }
      if (message.cPlayerNewGamePlus != null && message.hasOwnProperty("cPlayerNewGamePlus")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientPlayerNewGamePlus.verify(message.cPlayerNewGamePlus);
          if (error)
            return "cPlayerNewGamePlus." + error;
        }
      }
      if (message.sPlayerNewGamePlus != null && message.hasOwnProperty("sPlayerNewGamePlus")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerNewGamePlus.verify(message.sPlayerNewGamePlus);
          if (error)
            return "sPlayerNewGamePlus." + error;
        }
      }
      if (message.cPlayerSecretHourglass != null && message.hasOwnProperty("cPlayerSecretHourglass")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientPlayerSecretHourglass.verify(message.cPlayerSecretHourglass);
          if (error)
            return "cPlayerSecretHourglass." + error;
        }
      }
      if (message.sPlayerSecretHourglass != null && message.hasOwnProperty("sPlayerSecretHourglass")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerPlayerSecretHourglass.verify(message.sPlayerSecretHourglass);
          if (error)
            return "sPlayerSecretHourglass." + error;
        }
      }
      if (message.cCustomModEvent != null && message.hasOwnProperty("cCustomModEvent")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientCustomModEvent.verify(message.cCustomModEvent);
          if (error)
            return "cCustomModEvent." + error;
        }
      }
      if (message.sCustomModEvent != null && message.hasOwnProperty("sCustomModEvent")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerCustomModEvent.verify(message.sCustomModEvent);
          if (error)
            return "sCustomModEvent." + error;
        }
      }
      if (message.cRespawnPenalty != null && message.hasOwnProperty("cRespawnPenalty")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientRespawnPenalty.verify(message.cRespawnPenalty);
          if (error)
            return "cRespawnPenalty." + error;
        }
      }
      if (message.sRespawnPenalty != null && message.hasOwnProperty("sRespawnPenalty")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerRespawnPenalty.verify(message.sRespawnPenalty);
          if (error)
            return "sRespawnPenalty." + error;
        }
      }
      if (message.cAngerySteve != null && message.hasOwnProperty("cAngerySteve")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientAngerySteve.verify(message.cAngerySteve);
          if (error)
            return "cAngerySteve." + error;
        }
      }
      if (message.sAngerySteve != null && message.hasOwnProperty("sAngerySteve")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerAngerySteve.verify(message.sAngerySteve);
          if (error)
            return "sAngerySteve." + error;
        }
      }
      if (message.sStatUpdate != null && message.hasOwnProperty("sStatUpdate")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerStatsUpdate.verify(message.sStatUpdate);
          if (error)
            return "sStatUpdate." + error;
        }
      }
      return null;
    };
    GameAction.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.GameAction)
        return object;
      let message = new $root.NT.GameAction();
      if (object.cPlayerMove != null) {
        if (typeof object.cPlayerMove !== "object")
          throw TypeError(".NT.GameAction.cPlayerMove: object expected");
        message.cPlayerMove = $root.NT.CompactPlayerFrames.fromObject(object.cPlayerMove);
      }
      if (object.sPlayerMoves != null) {
        if (typeof object.sPlayerMoves !== "object")
          throw TypeError(".NT.GameAction.sPlayerMoves: object expected");
        message.sPlayerMoves = $root.NT.ServerPlayerMoves.fromObject(object.sPlayerMoves);
      }
      if (object.cPlayerUpdate != null) {
        if (typeof object.cPlayerUpdate !== "object")
          throw TypeError(".NT.GameAction.cPlayerUpdate: object expected");
        message.cPlayerUpdate = $root.NT.ClientPlayerUpdate.fromObject(object.cPlayerUpdate);
      }
      if (object.sPlayerUpdate != null) {
        if (typeof object.sPlayerUpdate !== "object")
          throw TypeError(".NT.GameAction.sPlayerUpdate: object expected");
        message.sPlayerUpdate = $root.NT.ServerPlayerUpdate.fromObject(object.sPlayerUpdate);
      }
      if (object.cPlayerUpdateInventory != null) {
        if (typeof object.cPlayerUpdateInventory !== "object")
          throw TypeError(".NT.GameAction.cPlayerUpdateInventory: object expected");
        message.cPlayerUpdateInventory = $root.NT.ClientPlayerUpdateInventory.fromObject(object.cPlayerUpdateInventory);
      }
      if (object.sPlayerUpdateInventory != null) {
        if (typeof object.sPlayerUpdateInventory !== "object")
          throw TypeError(".NT.GameAction.sPlayerUpdateInventory: object expected");
        message.sPlayerUpdateInventory = $root.NT.ServerPlayerUpdateInventory.fromObject(object.sPlayerUpdateInventory);
      }
      if (object.cHostItemBank != null) {
        if (typeof object.cHostItemBank !== "object")
          throw TypeError(".NT.GameAction.cHostItemBank: object expected");
        message.cHostItemBank = $root.NT.ClientHostItemBank.fromObject(object.cHostItemBank);
      }
      if (object.sHostItemBank != null) {
        if (typeof object.sHostItemBank !== "object")
          throw TypeError(".NT.GameAction.sHostItemBank: object expected");
        message.sHostItemBank = $root.NT.ServerHostItemBank.fromObject(object.sHostItemBank);
      }
      if (object.cHostUserTake != null) {
        if (typeof object.cHostUserTake !== "object")
          throw TypeError(".NT.GameAction.cHostUserTake: object expected");
        message.cHostUserTake = $root.NT.ClientHostUserTake.fromObject(object.cHostUserTake);
      }
      if (object.sHostUserTake != null) {
        if (typeof object.sHostUserTake !== "object")
          throw TypeError(".NT.GameAction.sHostUserTake: object expected");
        message.sHostUserTake = $root.NT.ServerHostUserTake.fromObject(object.sHostUserTake);
      }
      if (object.cHostUserTakeGold != null) {
        if (typeof object.cHostUserTakeGold !== "object")
          throw TypeError(".NT.GameAction.cHostUserTakeGold: object expected");
        message.cHostUserTakeGold = $root.NT.ClientHostUserTakeGold.fromObject(object.cHostUserTakeGold);
      }
      if (object.sHostUserTakeGold != null) {
        if (typeof object.sHostUserTakeGold !== "object")
          throw TypeError(".NT.GameAction.sHostUserTakeGold: object expected");
        message.sHostUserTakeGold = $root.NT.ServerHostUserTakeGold.fromObject(object.sHostUserTakeGold);
      }
      if (object.cPlayerAddGold != null) {
        if (typeof object.cPlayerAddGold !== "object")
          throw TypeError(".NT.GameAction.cPlayerAddGold: object expected");
        message.cPlayerAddGold = $root.NT.ClientPlayerAddGold.fromObject(object.cPlayerAddGold);
      }
      if (object.sPlayerAddGold != null) {
        if (typeof object.sPlayerAddGold !== "object")
          throw TypeError(".NT.GameAction.sPlayerAddGold: object expected");
        message.sPlayerAddGold = $root.NT.ServerPlayerAddGold.fromObject(object.sPlayerAddGold);
      }
      if (object.cPlayerTakeGold != null) {
        if (typeof object.cPlayerTakeGold !== "object")
          throw TypeError(".NT.GameAction.cPlayerTakeGold: object expected");
        message.cPlayerTakeGold = $root.NT.ClientPlayerTakeGold.fromObject(object.cPlayerTakeGold);
      }
      if (object.sPlayerTakeGold != null) {
        if (typeof object.sPlayerTakeGold !== "object")
          throw TypeError(".NT.GameAction.sPlayerTakeGold: object expected");
        message.sPlayerTakeGold = $root.NT.ServerPlayerTakeGold.fromObject(object.sPlayerTakeGold);
      }
      if (object.cPlayerAddItem != null) {
        if (typeof object.cPlayerAddItem !== "object")
          throw TypeError(".NT.GameAction.cPlayerAddItem: object expected");
        message.cPlayerAddItem = $root.NT.ClientPlayerAddItem.fromObject(object.cPlayerAddItem);
      }
      if (object.sPlayerAddItem != null) {
        if (typeof object.sPlayerAddItem !== "object")
          throw TypeError(".NT.GameAction.sPlayerAddItem: object expected");
        message.sPlayerAddItem = $root.NT.ServerPlayerAddItem.fromObject(object.sPlayerAddItem);
      }
      if (object.cPlayerTakeItem != null) {
        if (typeof object.cPlayerTakeItem !== "object")
          throw TypeError(".NT.GameAction.cPlayerTakeItem: object expected");
        message.cPlayerTakeItem = $root.NT.ClientPlayerTakeItem.fromObject(object.cPlayerTakeItem);
      }
      if (object.sPlayerTakeItem != null) {
        if (typeof object.sPlayerTakeItem !== "object")
          throw TypeError(".NT.GameAction.sPlayerTakeItem: object expected");
        message.sPlayerTakeItem = $root.NT.ServerPlayerTakeItem.fromObject(object.sPlayerTakeItem);
      }
      if (object.cPlayerPickup != null) {
        if (typeof object.cPlayerPickup !== "object")
          throw TypeError(".NT.GameAction.cPlayerPickup: object expected");
        message.cPlayerPickup = $root.NT.ClientPlayerPickup.fromObject(object.cPlayerPickup);
      }
      if (object.sPlayerPickup != null) {
        if (typeof object.sPlayerPickup !== "object")
          throw TypeError(".NT.GameAction.sPlayerPickup: object expected");
        message.sPlayerPickup = $root.NT.ServerPlayerPickup.fromObject(object.sPlayerPickup);
      }
      if (object.cNemesisAbility != null) {
        if (typeof object.cNemesisAbility !== "object")
          throw TypeError(".NT.GameAction.cNemesisAbility: object expected");
        message.cNemesisAbility = $root.NT.ClientNemesisAbility.fromObject(object.cNemesisAbility);
      }
      if (object.sNemesisAbility != null) {
        if (typeof object.sNemesisAbility !== "object")
          throw TypeError(".NT.GameAction.sNemesisAbility: object expected");
        message.sNemesisAbility = $root.NT.ServerNemesisAbility.fromObject(object.sNemesisAbility);
      }
      if (object.cNemesisPickupItem != null) {
        if (typeof object.cNemesisPickupItem !== "object")
          throw TypeError(".NT.GameAction.cNemesisPickupItem: object expected");
        message.cNemesisPickupItem = $root.NT.ClientNemesisPickupItem.fromObject(object.cNemesisPickupItem);
      }
      if (object.sNemesisPickupItem != null) {
        if (typeof object.sNemesisPickupItem !== "object")
          throw TypeError(".NT.GameAction.sNemesisPickupItem: object expected");
        message.sNemesisPickupItem = $root.NT.ServerNemesisPickupItem.fromObject(object.sNemesisPickupItem);
      }
      if (object.cChat != null) {
        if (typeof object.cChat !== "object")
          throw TypeError(".NT.GameAction.cChat: object expected");
        message.cChat = $root.NT.ClientChat.fromObject(object.cChat);
      }
      if (object.sChat != null) {
        if (typeof object.sChat !== "object")
          throw TypeError(".NT.GameAction.sChat: object expected");
        message.sChat = $root.NT.ServerChat.fromObject(object.sChat);
      }
      if (object.cPlayerDeath != null) {
        if (typeof object.cPlayerDeath !== "object")
          throw TypeError(".NT.GameAction.cPlayerDeath: object expected");
        message.cPlayerDeath = $root.NT.ClientPlayerDeath.fromObject(object.cPlayerDeath);
      }
      if (object.sPlayerDeath != null) {
        if (typeof object.sPlayerDeath !== "object")
          throw TypeError(".NT.GameAction.sPlayerDeath: object expected");
        message.sPlayerDeath = $root.NT.ServerPlayerDeath.fromObject(object.sPlayerDeath);
      }
      if (object.cPlayerNewGamePlus != null) {
        if (typeof object.cPlayerNewGamePlus !== "object")
          throw TypeError(".NT.GameAction.cPlayerNewGamePlus: object expected");
        message.cPlayerNewGamePlus = $root.NT.ClientPlayerNewGamePlus.fromObject(object.cPlayerNewGamePlus);
      }
      if (object.sPlayerNewGamePlus != null) {
        if (typeof object.sPlayerNewGamePlus !== "object")
          throw TypeError(".NT.GameAction.sPlayerNewGamePlus: object expected");
        message.sPlayerNewGamePlus = $root.NT.ServerPlayerNewGamePlus.fromObject(object.sPlayerNewGamePlus);
      }
      if (object.cPlayerSecretHourglass != null) {
        if (typeof object.cPlayerSecretHourglass !== "object")
          throw TypeError(".NT.GameAction.cPlayerSecretHourglass: object expected");
        message.cPlayerSecretHourglass = $root.NT.ClientPlayerSecretHourglass.fromObject(object.cPlayerSecretHourglass);
      }
      if (object.sPlayerSecretHourglass != null) {
        if (typeof object.sPlayerSecretHourglass !== "object")
          throw TypeError(".NT.GameAction.sPlayerSecretHourglass: object expected");
        message.sPlayerSecretHourglass = $root.NT.ServerPlayerSecretHourglass.fromObject(object.sPlayerSecretHourglass);
      }
      if (object.cCustomModEvent != null) {
        if (typeof object.cCustomModEvent !== "object")
          throw TypeError(".NT.GameAction.cCustomModEvent: object expected");
        message.cCustomModEvent = $root.NT.ClientCustomModEvent.fromObject(object.cCustomModEvent);
      }
      if (object.sCustomModEvent != null) {
        if (typeof object.sCustomModEvent !== "object")
          throw TypeError(".NT.GameAction.sCustomModEvent: object expected");
        message.sCustomModEvent = $root.NT.ServerCustomModEvent.fromObject(object.sCustomModEvent);
      }
      if (object.cRespawnPenalty != null) {
        if (typeof object.cRespawnPenalty !== "object")
          throw TypeError(".NT.GameAction.cRespawnPenalty: object expected");
        message.cRespawnPenalty = $root.NT.ClientRespawnPenalty.fromObject(object.cRespawnPenalty);
      }
      if (object.sRespawnPenalty != null) {
        if (typeof object.sRespawnPenalty !== "object")
          throw TypeError(".NT.GameAction.sRespawnPenalty: object expected");
        message.sRespawnPenalty = $root.NT.ServerRespawnPenalty.fromObject(object.sRespawnPenalty);
      }
      if (object.cAngerySteve != null) {
        if (typeof object.cAngerySteve !== "object")
          throw TypeError(".NT.GameAction.cAngerySteve: object expected");
        message.cAngerySteve = $root.NT.ClientAngerySteve.fromObject(object.cAngerySteve);
      }
      if (object.sAngerySteve != null) {
        if (typeof object.sAngerySteve !== "object")
          throw TypeError(".NT.GameAction.sAngerySteve: object expected");
        message.sAngerySteve = $root.NT.ServerAngerySteve.fromObject(object.sAngerySteve);
      }
      if (object.sStatUpdate != null) {
        if (typeof object.sStatUpdate !== "object")
          throw TypeError(".NT.GameAction.sStatUpdate: object expected");
        message.sStatUpdate = $root.NT.ServerStatsUpdate.fromObject(object.sStatUpdate);
      }
      return message;
    };
    GameAction.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (message.cPlayerMove != null && message.hasOwnProperty("cPlayerMove")) {
        object.cPlayerMove = $root.NT.CompactPlayerFrames.toObject(message.cPlayerMove, options);
        if (options.oneofs)
          object.action = "cPlayerMove";
      }
      if (message.sPlayerMoves != null && message.hasOwnProperty("sPlayerMoves")) {
        object.sPlayerMoves = $root.NT.ServerPlayerMoves.toObject(message.sPlayerMoves, options);
        if (options.oneofs)
          object.action = "sPlayerMoves";
      }
      if (message.cPlayerUpdate != null && message.hasOwnProperty("cPlayerUpdate")) {
        object.cPlayerUpdate = $root.NT.ClientPlayerUpdate.toObject(message.cPlayerUpdate, options);
        if (options.oneofs)
          object.action = "cPlayerUpdate";
      }
      if (message.sPlayerUpdate != null && message.hasOwnProperty("sPlayerUpdate")) {
        object.sPlayerUpdate = $root.NT.ServerPlayerUpdate.toObject(message.sPlayerUpdate, options);
        if (options.oneofs)
          object.action = "sPlayerUpdate";
      }
      if (message.cPlayerUpdateInventory != null && message.hasOwnProperty("cPlayerUpdateInventory")) {
        object.cPlayerUpdateInventory = $root.NT.ClientPlayerUpdateInventory.toObject(message.cPlayerUpdateInventory, options);
        if (options.oneofs)
          object.action = "cPlayerUpdateInventory";
      }
      if (message.sPlayerUpdateInventory != null && message.hasOwnProperty("sPlayerUpdateInventory")) {
        object.sPlayerUpdateInventory = $root.NT.ServerPlayerUpdateInventory.toObject(message.sPlayerUpdateInventory, options);
        if (options.oneofs)
          object.action = "sPlayerUpdateInventory";
      }
      if (message.cHostItemBank != null && message.hasOwnProperty("cHostItemBank")) {
        object.cHostItemBank = $root.NT.ClientHostItemBank.toObject(message.cHostItemBank, options);
        if (options.oneofs)
          object.action = "cHostItemBank";
      }
      if (message.sHostItemBank != null && message.hasOwnProperty("sHostItemBank")) {
        object.sHostItemBank = $root.NT.ServerHostItemBank.toObject(message.sHostItemBank, options);
        if (options.oneofs)
          object.action = "sHostItemBank";
      }
      if (message.cHostUserTake != null && message.hasOwnProperty("cHostUserTake")) {
        object.cHostUserTake = $root.NT.ClientHostUserTake.toObject(message.cHostUserTake, options);
        if (options.oneofs)
          object.action = "cHostUserTake";
      }
      if (message.sHostUserTake != null && message.hasOwnProperty("sHostUserTake")) {
        object.sHostUserTake = $root.NT.ServerHostUserTake.toObject(message.sHostUserTake, options);
        if (options.oneofs)
          object.action = "sHostUserTake";
      }
      if (message.cHostUserTakeGold != null && message.hasOwnProperty("cHostUserTakeGold")) {
        object.cHostUserTakeGold = $root.NT.ClientHostUserTakeGold.toObject(message.cHostUserTakeGold, options);
        if (options.oneofs)
          object.action = "cHostUserTakeGold";
      }
      if (message.sHostUserTakeGold != null && message.hasOwnProperty("sHostUserTakeGold")) {
        object.sHostUserTakeGold = $root.NT.ServerHostUserTakeGold.toObject(message.sHostUserTakeGold, options);
        if (options.oneofs)
          object.action = "sHostUserTakeGold";
      }
      if (message.cPlayerAddGold != null && message.hasOwnProperty("cPlayerAddGold")) {
        object.cPlayerAddGold = $root.NT.ClientPlayerAddGold.toObject(message.cPlayerAddGold, options);
        if (options.oneofs)
          object.action = "cPlayerAddGold";
      }
      if (message.sPlayerAddGold != null && message.hasOwnProperty("sPlayerAddGold")) {
        object.sPlayerAddGold = $root.NT.ServerPlayerAddGold.toObject(message.sPlayerAddGold, options);
        if (options.oneofs)
          object.action = "sPlayerAddGold";
      }
      if (message.cPlayerTakeGold != null && message.hasOwnProperty("cPlayerTakeGold")) {
        object.cPlayerTakeGold = $root.NT.ClientPlayerTakeGold.toObject(message.cPlayerTakeGold, options);
        if (options.oneofs)
          object.action = "cPlayerTakeGold";
      }
      if (message.sPlayerTakeGold != null && message.hasOwnProperty("sPlayerTakeGold")) {
        object.sPlayerTakeGold = $root.NT.ServerPlayerTakeGold.toObject(message.sPlayerTakeGold, options);
        if (options.oneofs)
          object.action = "sPlayerTakeGold";
      }
      if (message.cPlayerAddItem != null && message.hasOwnProperty("cPlayerAddItem")) {
        object.cPlayerAddItem = $root.NT.ClientPlayerAddItem.toObject(message.cPlayerAddItem, options);
        if (options.oneofs)
          object.action = "cPlayerAddItem";
      }
      if (message.sPlayerAddItem != null && message.hasOwnProperty("sPlayerAddItem")) {
        object.sPlayerAddItem = $root.NT.ServerPlayerAddItem.toObject(message.sPlayerAddItem, options);
        if (options.oneofs)
          object.action = "sPlayerAddItem";
      }
      if (message.cPlayerTakeItem != null && message.hasOwnProperty("cPlayerTakeItem")) {
        object.cPlayerTakeItem = $root.NT.ClientPlayerTakeItem.toObject(message.cPlayerTakeItem, options);
        if (options.oneofs)
          object.action = "cPlayerTakeItem";
      }
      if (message.sPlayerTakeItem != null && message.hasOwnProperty("sPlayerTakeItem")) {
        object.sPlayerTakeItem = $root.NT.ServerPlayerTakeItem.toObject(message.sPlayerTakeItem, options);
        if (options.oneofs)
          object.action = "sPlayerTakeItem";
      }
      if (message.cPlayerPickup != null && message.hasOwnProperty("cPlayerPickup")) {
        object.cPlayerPickup = $root.NT.ClientPlayerPickup.toObject(message.cPlayerPickup, options);
        if (options.oneofs)
          object.action = "cPlayerPickup";
      }
      if (message.sPlayerPickup != null && message.hasOwnProperty("sPlayerPickup")) {
        object.sPlayerPickup = $root.NT.ServerPlayerPickup.toObject(message.sPlayerPickup, options);
        if (options.oneofs)
          object.action = "sPlayerPickup";
      }
      if (message.cNemesisAbility != null && message.hasOwnProperty("cNemesisAbility")) {
        object.cNemesisAbility = $root.NT.ClientNemesisAbility.toObject(message.cNemesisAbility, options);
        if (options.oneofs)
          object.action = "cNemesisAbility";
      }
      if (message.sNemesisAbility != null && message.hasOwnProperty("sNemesisAbility")) {
        object.sNemesisAbility = $root.NT.ServerNemesisAbility.toObject(message.sNemesisAbility, options);
        if (options.oneofs)
          object.action = "sNemesisAbility";
      }
      if (message.cNemesisPickupItem != null && message.hasOwnProperty("cNemesisPickupItem")) {
        object.cNemesisPickupItem = $root.NT.ClientNemesisPickupItem.toObject(message.cNemesisPickupItem, options);
        if (options.oneofs)
          object.action = "cNemesisPickupItem";
      }
      if (message.sNemesisPickupItem != null && message.hasOwnProperty("sNemesisPickupItem")) {
        object.sNemesisPickupItem = $root.NT.ServerNemesisPickupItem.toObject(message.sNemesisPickupItem, options);
        if (options.oneofs)
          object.action = "sNemesisPickupItem";
      }
      if (message.cChat != null && message.hasOwnProperty("cChat")) {
        object.cChat = $root.NT.ClientChat.toObject(message.cChat, options);
        if (options.oneofs)
          object.action = "cChat";
      }
      if (message.sChat != null && message.hasOwnProperty("sChat")) {
        object.sChat = $root.NT.ServerChat.toObject(message.sChat, options);
        if (options.oneofs)
          object.action = "sChat";
      }
      if (message.cPlayerDeath != null && message.hasOwnProperty("cPlayerDeath")) {
        object.cPlayerDeath = $root.NT.ClientPlayerDeath.toObject(message.cPlayerDeath, options);
        if (options.oneofs)
          object.action = "cPlayerDeath";
      }
      if (message.sPlayerDeath != null && message.hasOwnProperty("sPlayerDeath")) {
        object.sPlayerDeath = $root.NT.ServerPlayerDeath.toObject(message.sPlayerDeath, options);
        if (options.oneofs)
          object.action = "sPlayerDeath";
      }
      if (message.cPlayerNewGamePlus != null && message.hasOwnProperty("cPlayerNewGamePlus")) {
        object.cPlayerNewGamePlus = $root.NT.ClientPlayerNewGamePlus.toObject(message.cPlayerNewGamePlus, options);
        if (options.oneofs)
          object.action = "cPlayerNewGamePlus";
      }
      if (message.sPlayerNewGamePlus != null && message.hasOwnProperty("sPlayerNewGamePlus")) {
        object.sPlayerNewGamePlus = $root.NT.ServerPlayerNewGamePlus.toObject(message.sPlayerNewGamePlus, options);
        if (options.oneofs)
          object.action = "sPlayerNewGamePlus";
      }
      if (message.cPlayerSecretHourglass != null && message.hasOwnProperty("cPlayerSecretHourglass")) {
        object.cPlayerSecretHourglass = $root.NT.ClientPlayerSecretHourglass.toObject(message.cPlayerSecretHourglass, options);
        if (options.oneofs)
          object.action = "cPlayerSecretHourglass";
      }
      if (message.sPlayerSecretHourglass != null && message.hasOwnProperty("sPlayerSecretHourglass")) {
        object.sPlayerSecretHourglass = $root.NT.ServerPlayerSecretHourglass.toObject(message.sPlayerSecretHourglass, options);
        if (options.oneofs)
          object.action = "sPlayerSecretHourglass";
      }
      if (message.cCustomModEvent != null && message.hasOwnProperty("cCustomModEvent")) {
        object.cCustomModEvent = $root.NT.ClientCustomModEvent.toObject(message.cCustomModEvent, options);
        if (options.oneofs)
          object.action = "cCustomModEvent";
      }
      if (message.sCustomModEvent != null && message.hasOwnProperty("sCustomModEvent")) {
        object.sCustomModEvent = $root.NT.ServerCustomModEvent.toObject(message.sCustomModEvent, options);
        if (options.oneofs)
          object.action = "sCustomModEvent";
      }
      if (message.cRespawnPenalty != null && message.hasOwnProperty("cRespawnPenalty")) {
        object.cRespawnPenalty = $root.NT.ClientRespawnPenalty.toObject(message.cRespawnPenalty, options);
        if (options.oneofs)
          object.action = "cRespawnPenalty";
      }
      if (message.sRespawnPenalty != null && message.hasOwnProperty("sRespawnPenalty")) {
        object.sRespawnPenalty = $root.NT.ServerRespawnPenalty.toObject(message.sRespawnPenalty, options);
        if (options.oneofs)
          object.action = "sRespawnPenalty";
      }
      if (message.cAngerySteve != null && message.hasOwnProperty("cAngerySteve")) {
        object.cAngerySteve = $root.NT.ClientAngerySteve.toObject(message.cAngerySteve, options);
        if (options.oneofs)
          object.action = "cAngerySteve";
      }
      if (message.sAngerySteve != null && message.hasOwnProperty("sAngerySteve")) {
        object.sAngerySteve = $root.NT.ServerAngerySteve.toObject(message.sAngerySteve, options);
        if (options.oneofs)
          object.action = "sAngerySteve";
      }
      if (message.sStatUpdate != null && message.hasOwnProperty("sStatUpdate")) {
        object.sStatUpdate = $root.NT.ServerStatsUpdate.toObject(message.sStatUpdate, options);
        if (options.oneofs)
          object.action = "sStatUpdate";
      }
      return object;
    };
    GameAction.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    GameAction.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.GameAction";
    };
    return GameAction;
  }();
  NT3.PlayerFrame = function() {
    function PlayerFrame(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    PlayerFrame.prototype.x = null;
    PlayerFrame.prototype.y = null;
    PlayerFrame.prototype.armR = null;
    PlayerFrame.prototype.armScaleY = null;
    PlayerFrame.prototype.scaleX = null;
    PlayerFrame.prototype.anim = null;
    PlayerFrame.prototype.held = null;
    let $oneOfFields;
    Object.defineProperty(PlayerFrame.prototype, "_x", {
      get: $util.oneOfGetter($oneOfFields = ["x"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(PlayerFrame.prototype, "_y", {
      get: $util.oneOfGetter($oneOfFields = ["y"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(PlayerFrame.prototype, "_armR", {
      get: $util.oneOfGetter($oneOfFields = ["armR"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(PlayerFrame.prototype, "_armScaleY", {
      get: $util.oneOfGetter($oneOfFields = ["armScaleY"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(PlayerFrame.prototype, "_scaleX", {
      get: $util.oneOfGetter($oneOfFields = ["scaleX"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(PlayerFrame.prototype, "_anim", {
      get: $util.oneOfGetter($oneOfFields = ["anim"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(PlayerFrame.prototype, "_held", {
      get: $util.oneOfGetter($oneOfFields = ["held"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    PlayerFrame.create = function create(properties) {
      return new PlayerFrame(properties);
    };
    PlayerFrame.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.x != null && Object.hasOwnProperty.call(message, "x"))
        writer.uint32(
          /* id 1, wireType 5 =*/
          13
        ).float(message.x);
      if (message.y != null && Object.hasOwnProperty.call(message, "y"))
        writer.uint32(
          /* id 2, wireType 5 =*/
          21
        ).float(message.y);
      if (message.armR != null && Object.hasOwnProperty.call(message, "armR"))
        writer.uint32(
          /* id 3, wireType 5 =*/
          29
        ).float(message.armR);
      if (message.armScaleY != null && Object.hasOwnProperty.call(message, "armScaleY"))
        writer.uint32(
          /* id 4, wireType 5 =*/
          37
        ).float(message.armScaleY);
      if (message.scaleX != null && Object.hasOwnProperty.call(message, "scaleX"))
        writer.uint32(
          /* id 5, wireType 5 =*/
          45
        ).float(message.scaleX);
      if (message.anim != null && Object.hasOwnProperty.call(message, "anim"))
        writer.uint32(
          /* id 6, wireType 0 =*/
          48
        ).int32(message.anim);
      if (message.held != null && Object.hasOwnProperty.call(message, "held"))
        writer.uint32(
          /* id 7, wireType 0 =*/
          56
        ).int32(message.held);
      return writer;
    };
    PlayerFrame.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    PlayerFrame.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.PlayerFrame();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.x = reader.float();
            break;
          }
          case 2: {
            message.y = reader.float();
            break;
          }
          case 3: {
            message.armR = reader.float();
            break;
          }
          case 4: {
            message.armScaleY = reader.float();
            break;
          }
          case 5: {
            message.scaleX = reader.float();
            break;
          }
          case 6: {
            message.anim = reader.int32();
            break;
          }
          case 7: {
            message.held = reader.int32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    PlayerFrame.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    PlayerFrame.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.x != null && message.hasOwnProperty("x")) {
        properties._x = 1;
        if (typeof message.x !== "number")
          return "x: number expected";
      }
      if (message.y != null && message.hasOwnProperty("y")) {
        properties._y = 1;
        if (typeof message.y !== "number")
          return "y: number expected";
      }
      if (message.armR != null && message.hasOwnProperty("armR")) {
        properties._armR = 1;
        if (typeof message.armR !== "number")
          return "armR: number expected";
      }
      if (message.armScaleY != null && message.hasOwnProperty("armScaleY")) {
        properties._armScaleY = 1;
        if (typeof message.armScaleY !== "number")
          return "armScaleY: number expected";
      }
      if (message.scaleX != null && message.hasOwnProperty("scaleX")) {
        properties._scaleX = 1;
        if (typeof message.scaleX !== "number")
          return "scaleX: number expected";
      }
      if (message.anim != null && message.hasOwnProperty("anim")) {
        properties._anim = 1;
        if (!$util.isInteger(message.anim))
          return "anim: integer expected";
      }
      if (message.held != null && message.hasOwnProperty("held")) {
        properties._held = 1;
        if (!$util.isInteger(message.held))
          return "held: integer expected";
      }
      return null;
    };
    PlayerFrame.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.PlayerFrame)
        return object;
      let message = new $root.NT.PlayerFrame();
      if (object.x != null)
        message.x = Number(object.x);
      if (object.y != null)
        message.y = Number(object.y);
      if (object.armR != null)
        message.armR = Number(object.armR);
      if (object.armScaleY != null)
        message.armScaleY = Number(object.armScaleY);
      if (object.scaleX != null)
        message.scaleX = Number(object.scaleX);
      if (object.anim != null)
        message.anim = object.anim | 0;
      if (object.held != null)
        message.held = object.held | 0;
      return message;
    };
    PlayerFrame.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (message.x != null && message.hasOwnProperty("x")) {
        object.x = options.json && !isFinite(message.x) ? String(message.x) : message.x;
        if (options.oneofs)
          object._x = "x";
      }
      if (message.y != null && message.hasOwnProperty("y")) {
        object.y = options.json && !isFinite(message.y) ? String(message.y) : message.y;
        if (options.oneofs)
          object._y = "y";
      }
      if (message.armR != null && message.hasOwnProperty("armR")) {
        object.armR = options.json && !isFinite(message.armR) ? String(message.armR) : message.armR;
        if (options.oneofs)
          object._armR = "armR";
      }
      if (message.armScaleY != null && message.hasOwnProperty("armScaleY")) {
        object.armScaleY = options.json && !isFinite(message.armScaleY) ? String(message.armScaleY) : message.armScaleY;
        if (options.oneofs)
          object._armScaleY = "armScaleY";
      }
      if (message.scaleX != null && message.hasOwnProperty("scaleX")) {
        object.scaleX = options.json && !isFinite(message.scaleX) ? String(message.scaleX) : message.scaleX;
        if (options.oneofs)
          object._scaleX = "scaleX";
      }
      if (message.anim != null && message.hasOwnProperty("anim")) {
        object.anim = message.anim;
        if (options.oneofs)
          object._anim = "anim";
      }
      if (message.held != null && message.hasOwnProperty("held")) {
        object.held = message.held;
        if (options.oneofs)
          object._held = "held";
      }
      return object;
    };
    PlayerFrame.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    PlayerFrame.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.PlayerFrame";
    };
    return PlayerFrame;
  }();
  NT3.OldClientPlayerMove = function() {
    function OldClientPlayerMove(properties) {
      this.frames = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    OldClientPlayerMove.prototype.frames = $util.emptyArray;
    OldClientPlayerMove.create = function create(properties) {
      return new OldClientPlayerMove(properties);
    };
    OldClientPlayerMove.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.frames != null && message.frames.length)
        for (let i = 0; i < message.frames.length; ++i)
          $root.NT.PlayerFrame.encode(message.frames[i], writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).fork()).ldelim();
      return writer;
    };
    OldClientPlayerMove.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    OldClientPlayerMove.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.OldClientPlayerMove();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (!(message.frames && message.frames.length))
              message.frames = [];
            message.frames.push($root.NT.PlayerFrame.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    OldClientPlayerMove.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    OldClientPlayerMove.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.frames != null && message.hasOwnProperty("frames")) {
        if (!Array.isArray(message.frames))
          return "frames: array expected";
        for (let i = 0; i < message.frames.length; ++i) {
          let error = $root.NT.PlayerFrame.verify(message.frames[i]);
          if (error)
            return "frames." + error;
        }
      }
      return null;
    };
    OldClientPlayerMove.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.OldClientPlayerMove)
        return object;
      let message = new $root.NT.OldClientPlayerMove();
      if (object.frames) {
        if (!Array.isArray(object.frames))
          throw TypeError(".NT.OldClientPlayerMove.frames: array expected");
        message.frames = [];
        for (let i = 0; i < object.frames.length; ++i) {
          if (typeof object.frames[i] !== "object")
            throw TypeError(".NT.OldClientPlayerMove.frames: object expected");
          message.frames[i] = $root.NT.PlayerFrame.fromObject(object.frames[i]);
        }
      }
      return message;
    };
    OldClientPlayerMove.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.frames = [];
      if (message.frames && message.frames.length) {
        object.frames = [];
        for (let j = 0; j < message.frames.length; ++j)
          object.frames[j] = $root.NT.PlayerFrame.toObject(message.frames[j], options);
      }
      return object;
    };
    OldClientPlayerMove.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    OldClientPlayerMove.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.OldClientPlayerMove";
    };
    return OldClientPlayerMove;
  }();
  NT3.OldServerPlayerMove = function() {
    function OldServerPlayerMove(properties) {
      this.frames = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    OldServerPlayerMove.prototype.userId = "";
    OldServerPlayerMove.prototype.frames = $util.emptyArray;
    OldServerPlayerMove.create = function create(properties) {
      return new OldServerPlayerMove(properties);
    };
    OldServerPlayerMove.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.frames != null && message.frames.length)
        for (let i = 0; i < message.frames.length; ++i)
          $root.NT.PlayerFrame.encode(message.frames[i], writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).fork()).ldelim();
      return writer;
    };
    OldServerPlayerMove.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    OldServerPlayerMove.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.OldServerPlayerMove();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            if (!(message.frames && message.frames.length))
              message.frames = [];
            message.frames.push($root.NT.PlayerFrame.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    OldServerPlayerMove.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    OldServerPlayerMove.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.frames != null && message.hasOwnProperty("frames")) {
        if (!Array.isArray(message.frames))
          return "frames: array expected";
        for (let i = 0; i < message.frames.length; ++i) {
          let error = $root.NT.PlayerFrame.verify(message.frames[i]);
          if (error)
            return "frames." + error;
        }
      }
      return null;
    };
    OldServerPlayerMove.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.OldServerPlayerMove)
        return object;
      let message = new $root.NT.OldServerPlayerMove();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.frames) {
        if (!Array.isArray(object.frames))
          throw TypeError(".NT.OldServerPlayerMove.frames: array expected");
        message.frames = [];
        for (let i = 0; i < object.frames.length; ++i) {
          if (typeof object.frames[i] !== "object")
            throw TypeError(".NT.OldServerPlayerMove.frames: object expected");
          message.frames[i] = $root.NT.PlayerFrame.fromObject(object.frames[i]);
        }
      }
      return message;
    };
    OldServerPlayerMove.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.frames = [];
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.frames && message.frames.length) {
        object.frames = [];
        for (let j = 0; j < message.frames.length; ++j)
          object.frames[j] = $root.NT.PlayerFrame.toObject(message.frames[j], options);
      }
      return object;
    };
    OldServerPlayerMove.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    OldServerPlayerMove.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.OldServerPlayerMove";
    };
    return OldServerPlayerMove;
  }();
  NT3.CompactPlayerFrames = function() {
    function CompactPlayerFrames(properties) {
      this.xDeltas = [];
      this.yDeltas = [];
      this.armR = [];
      this.animIdx = [];
      this.animVal = [];
      this.heldIdx = [];
      this.heldVal = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    CompactPlayerFrames.prototype.xInit = 0;
    CompactPlayerFrames.prototype.yInit = 0;
    CompactPlayerFrames.prototype.xDeltas = $util.emptyArray;
    CompactPlayerFrames.prototype.yDeltas = $util.emptyArray;
    CompactPlayerFrames.prototype.armR = $util.emptyArray;
    CompactPlayerFrames.prototype.armScaleY = 0;
    CompactPlayerFrames.prototype.scaleX = 0;
    CompactPlayerFrames.prototype.animIdx = $util.emptyArray;
    CompactPlayerFrames.prototype.animVal = $util.emptyArray;
    CompactPlayerFrames.prototype.heldIdx = $util.emptyArray;
    CompactPlayerFrames.prototype.heldVal = $util.emptyArray;
    CompactPlayerFrames.prototype.userId = "";
    CompactPlayerFrames.create = function create(properties) {
      return new CompactPlayerFrames(properties);
    };
    CompactPlayerFrames.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.xInit != null && Object.hasOwnProperty.call(message, "xInit"))
        writer.uint32(
          /* id 1, wireType 5 =*/
          13
        ).float(message.xInit);
      if (message.yInit != null && Object.hasOwnProperty.call(message, "yInit"))
        writer.uint32(
          /* id 2, wireType 5 =*/
          21
        ).float(message.yInit);
      if (message.xDeltas != null && message.xDeltas.length) {
        writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).fork();
        for (let i = 0; i < message.xDeltas.length; ++i)
          writer.sint32(message.xDeltas[i]);
        writer.ldelim();
      }
      if (message.yDeltas != null && message.yDeltas.length) {
        writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).fork();
        for (let i = 0; i < message.yDeltas.length; ++i)
          writer.sint32(message.yDeltas[i]);
        writer.ldelim();
      }
      if (message.armR != null && message.armR.length) {
        writer.uint32(
          /* id 5, wireType 2 =*/
          42
        ).fork();
        for (let i = 0; i < message.armR.length; ++i)
          writer.int32(message.armR[i]);
        writer.ldelim();
      }
      if (message.armScaleY != null && Object.hasOwnProperty.call(message, "armScaleY"))
        writer.uint32(
          /* id 6, wireType 0 =*/
          48
        ).int32(message.armScaleY);
      if (message.scaleX != null && Object.hasOwnProperty.call(message, "scaleX"))
        writer.uint32(
          /* id 7, wireType 0 =*/
          56
        ).int32(message.scaleX);
      if (message.animIdx != null && message.animIdx.length) {
        writer.uint32(
          /* id 8, wireType 2 =*/
          66
        ).fork();
        for (let i = 0; i < message.animIdx.length; ++i)
          writer.int32(message.animIdx[i]);
        writer.ldelim();
      }
      if (message.animVal != null && message.animVal.length) {
        writer.uint32(
          /* id 9, wireType 2 =*/
          74
        ).fork();
        for (let i = 0; i < message.animVal.length; ++i)
          writer.int32(message.animVal[i]);
        writer.ldelim();
      }
      if (message.heldIdx != null && message.heldIdx.length) {
        writer.uint32(
          /* id 10, wireType 2 =*/
          82
        ).fork();
        for (let i = 0; i < message.heldIdx.length; ++i)
          writer.int32(message.heldIdx[i]);
        writer.ldelim();
      }
      if (message.heldVal != null && message.heldVal.length) {
        writer.uint32(
          /* id 11, wireType 2 =*/
          90
        ).fork();
        for (let i = 0; i < message.heldVal.length; ++i)
          writer.int32(message.heldVal[i]);
        writer.ldelim();
      }
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 15, wireType 2 =*/
          122
        ).string(message.userId);
      return writer;
    };
    CompactPlayerFrames.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    CompactPlayerFrames.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.CompactPlayerFrames();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.xInit = reader.float();
            break;
          }
          case 2: {
            message.yInit = reader.float();
            break;
          }
          case 3: {
            if (!(message.xDeltas && message.xDeltas.length))
              message.xDeltas = [];
            if ((tag & 7) === 2) {
              let end2 = reader.uint32() + reader.pos;
              while (reader.pos < end2)
                message.xDeltas.push(reader.sint32());
            } else
              message.xDeltas.push(reader.sint32());
            break;
          }
          case 4: {
            if (!(message.yDeltas && message.yDeltas.length))
              message.yDeltas = [];
            if ((tag & 7) === 2) {
              let end2 = reader.uint32() + reader.pos;
              while (reader.pos < end2)
                message.yDeltas.push(reader.sint32());
            } else
              message.yDeltas.push(reader.sint32());
            break;
          }
          case 5: {
            if (!(message.armR && message.armR.length))
              message.armR = [];
            if ((tag & 7) === 2) {
              let end2 = reader.uint32() + reader.pos;
              while (reader.pos < end2)
                message.armR.push(reader.int32());
            } else
              message.armR.push(reader.int32());
            break;
          }
          case 6: {
            message.armScaleY = reader.int32();
            break;
          }
          case 7: {
            message.scaleX = reader.int32();
            break;
          }
          case 8: {
            if (!(message.animIdx && message.animIdx.length))
              message.animIdx = [];
            if ((tag & 7) === 2) {
              let end2 = reader.uint32() + reader.pos;
              while (reader.pos < end2)
                message.animIdx.push(reader.int32());
            } else
              message.animIdx.push(reader.int32());
            break;
          }
          case 9: {
            if (!(message.animVal && message.animVal.length))
              message.animVal = [];
            if ((tag & 7) === 2) {
              let end2 = reader.uint32() + reader.pos;
              while (reader.pos < end2)
                message.animVal.push(reader.int32());
            } else
              message.animVal.push(reader.int32());
            break;
          }
          case 10: {
            if (!(message.heldIdx && message.heldIdx.length))
              message.heldIdx = [];
            if ((tag & 7) === 2) {
              let end2 = reader.uint32() + reader.pos;
              while (reader.pos < end2)
                message.heldIdx.push(reader.int32());
            } else
              message.heldIdx.push(reader.int32());
            break;
          }
          case 11: {
            if (!(message.heldVal && message.heldVal.length))
              message.heldVal = [];
            if ((tag & 7) === 2) {
              let end2 = reader.uint32() + reader.pos;
              while (reader.pos < end2)
                message.heldVal.push(reader.int32());
            } else
              message.heldVal.push(reader.int32());
            break;
          }
          case 15: {
            message.userId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    CompactPlayerFrames.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    CompactPlayerFrames.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.xInit != null && message.hasOwnProperty("xInit")) {
        if (typeof message.xInit !== "number")
          return "xInit: number expected";
      }
      if (message.yInit != null && message.hasOwnProperty("yInit")) {
        if (typeof message.yInit !== "number")
          return "yInit: number expected";
      }
      if (message.xDeltas != null && message.hasOwnProperty("xDeltas")) {
        if (!Array.isArray(message.xDeltas))
          return "xDeltas: array expected";
        for (let i = 0; i < message.xDeltas.length; ++i)
          if (!$util.isInteger(message.xDeltas[i]))
            return "xDeltas: integer[] expected";
      }
      if (message.yDeltas != null && message.hasOwnProperty("yDeltas")) {
        if (!Array.isArray(message.yDeltas))
          return "yDeltas: array expected";
        for (let i = 0; i < message.yDeltas.length; ++i)
          if (!$util.isInteger(message.yDeltas[i]))
            return "yDeltas: integer[] expected";
      }
      if (message.armR != null && message.hasOwnProperty("armR")) {
        if (!Array.isArray(message.armR))
          return "armR: array expected";
        for (let i = 0; i < message.armR.length; ++i)
          if (!$util.isInteger(message.armR[i]))
            return "armR: integer[] expected";
      }
      if (message.armScaleY != null && message.hasOwnProperty("armScaleY")) {
        if (!$util.isInteger(message.armScaleY))
          return "armScaleY: integer expected";
      }
      if (message.scaleX != null && message.hasOwnProperty("scaleX")) {
        if (!$util.isInteger(message.scaleX))
          return "scaleX: integer expected";
      }
      if (message.animIdx != null && message.hasOwnProperty("animIdx")) {
        if (!Array.isArray(message.animIdx))
          return "animIdx: array expected";
        for (let i = 0; i < message.animIdx.length; ++i)
          if (!$util.isInteger(message.animIdx[i]))
            return "animIdx: integer[] expected";
      }
      if (message.animVal != null && message.hasOwnProperty("animVal")) {
        if (!Array.isArray(message.animVal))
          return "animVal: array expected";
        for (let i = 0; i < message.animVal.length; ++i)
          if (!$util.isInteger(message.animVal[i]))
            return "animVal: integer[] expected";
      }
      if (message.heldIdx != null && message.hasOwnProperty("heldIdx")) {
        if (!Array.isArray(message.heldIdx))
          return "heldIdx: array expected";
        for (let i = 0; i < message.heldIdx.length; ++i)
          if (!$util.isInteger(message.heldIdx[i]))
            return "heldIdx: integer[] expected";
      }
      if (message.heldVal != null && message.hasOwnProperty("heldVal")) {
        if (!Array.isArray(message.heldVal))
          return "heldVal: array expected";
        for (let i = 0; i < message.heldVal.length; ++i)
          if (!$util.isInteger(message.heldVal[i]))
            return "heldVal: integer[] expected";
      }
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      return null;
    };
    CompactPlayerFrames.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.CompactPlayerFrames)
        return object;
      let message = new $root.NT.CompactPlayerFrames();
      if (object.xInit != null)
        message.xInit = Number(object.xInit);
      if (object.yInit != null)
        message.yInit = Number(object.yInit);
      if (object.xDeltas) {
        if (!Array.isArray(object.xDeltas))
          throw TypeError(".NT.CompactPlayerFrames.xDeltas: array expected");
        message.xDeltas = [];
        for (let i = 0; i < object.xDeltas.length; ++i)
          message.xDeltas[i] = object.xDeltas[i] | 0;
      }
      if (object.yDeltas) {
        if (!Array.isArray(object.yDeltas))
          throw TypeError(".NT.CompactPlayerFrames.yDeltas: array expected");
        message.yDeltas = [];
        for (let i = 0; i < object.yDeltas.length; ++i)
          message.yDeltas[i] = object.yDeltas[i] | 0;
      }
      if (object.armR) {
        if (!Array.isArray(object.armR))
          throw TypeError(".NT.CompactPlayerFrames.armR: array expected");
        message.armR = [];
        for (let i = 0; i < object.armR.length; ++i)
          message.armR[i] = object.armR[i] | 0;
      }
      if (object.armScaleY != null)
        message.armScaleY = object.armScaleY | 0;
      if (object.scaleX != null)
        message.scaleX = object.scaleX | 0;
      if (object.animIdx) {
        if (!Array.isArray(object.animIdx))
          throw TypeError(".NT.CompactPlayerFrames.animIdx: array expected");
        message.animIdx = [];
        for (let i = 0; i < object.animIdx.length; ++i)
          message.animIdx[i] = object.animIdx[i] | 0;
      }
      if (object.animVal) {
        if (!Array.isArray(object.animVal))
          throw TypeError(".NT.CompactPlayerFrames.animVal: array expected");
        message.animVal = [];
        for (let i = 0; i < object.animVal.length; ++i)
          message.animVal[i] = object.animVal[i] | 0;
      }
      if (object.heldIdx) {
        if (!Array.isArray(object.heldIdx))
          throw TypeError(".NT.CompactPlayerFrames.heldIdx: array expected");
        message.heldIdx = [];
        for (let i = 0; i < object.heldIdx.length; ++i)
          message.heldIdx[i] = object.heldIdx[i] | 0;
      }
      if (object.heldVal) {
        if (!Array.isArray(object.heldVal))
          throw TypeError(".NT.CompactPlayerFrames.heldVal: array expected");
        message.heldVal = [];
        for (let i = 0; i < object.heldVal.length; ++i)
          message.heldVal[i] = object.heldVal[i] | 0;
      }
      if (object.userId != null)
        message.userId = String(object.userId);
      return message;
    };
    CompactPlayerFrames.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults) {
        object.xDeltas = [];
        object.yDeltas = [];
        object.armR = [];
        object.animIdx = [];
        object.animVal = [];
        object.heldIdx = [];
        object.heldVal = [];
      }
      if (options.defaults) {
        object.xInit = 0;
        object.yInit = 0;
        object.armScaleY = 0;
        object.scaleX = 0;
        object.userId = "";
      }
      if (message.xInit != null && message.hasOwnProperty("xInit"))
        object.xInit = options.json && !isFinite(message.xInit) ? String(message.xInit) : message.xInit;
      if (message.yInit != null && message.hasOwnProperty("yInit"))
        object.yInit = options.json && !isFinite(message.yInit) ? String(message.yInit) : message.yInit;
      if (message.xDeltas && message.xDeltas.length) {
        object.xDeltas = [];
        for (let j = 0; j < message.xDeltas.length; ++j)
          object.xDeltas[j] = message.xDeltas[j];
      }
      if (message.yDeltas && message.yDeltas.length) {
        object.yDeltas = [];
        for (let j = 0; j < message.yDeltas.length; ++j)
          object.yDeltas[j] = message.yDeltas[j];
      }
      if (message.armR && message.armR.length) {
        object.armR = [];
        for (let j = 0; j < message.armR.length; ++j)
          object.armR[j] = message.armR[j];
      }
      if (message.armScaleY != null && message.hasOwnProperty("armScaleY"))
        object.armScaleY = message.armScaleY;
      if (message.scaleX != null && message.hasOwnProperty("scaleX"))
        object.scaleX = message.scaleX;
      if (message.animIdx && message.animIdx.length) {
        object.animIdx = [];
        for (let j = 0; j < message.animIdx.length; ++j)
          object.animIdx[j] = message.animIdx[j];
      }
      if (message.animVal && message.animVal.length) {
        object.animVal = [];
        for (let j = 0; j < message.animVal.length; ++j)
          object.animVal[j] = message.animVal[j];
      }
      if (message.heldIdx && message.heldIdx.length) {
        object.heldIdx = [];
        for (let j = 0; j < message.heldIdx.length; ++j)
          object.heldIdx[j] = message.heldIdx[j];
      }
      if (message.heldVal && message.heldVal.length) {
        object.heldVal = [];
        for (let j = 0; j < message.heldVal.length; ++j)
          object.heldVal[j] = message.heldVal[j];
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      return object;
    };
    CompactPlayerFrames.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    CompactPlayerFrames.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.CompactPlayerFrames";
    };
    return CompactPlayerFrames;
  }();
  NT3.ServerPlayerMoves = function() {
    function ServerPlayerMoves(properties) {
      this.userFrames = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerMoves.prototype.userFrames = $util.emptyArray;
    ServerPlayerMoves.create = function create(properties) {
      return new ServerPlayerMoves(properties);
    };
    ServerPlayerMoves.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userFrames != null && message.userFrames.length)
        for (let i = 0; i < message.userFrames.length; ++i)
          $root.NT.CompactPlayerFrames.encode(message.userFrames[i], writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).fork()).ldelim();
      return writer;
    };
    ServerPlayerMoves.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerMoves.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerMoves();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (!(message.userFrames && message.userFrames.length))
              message.userFrames = [];
            message.userFrames.push($root.NT.CompactPlayerFrames.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerMoves.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerMoves.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userFrames != null && message.hasOwnProperty("userFrames")) {
        if (!Array.isArray(message.userFrames))
          return "userFrames: array expected";
        for (let i = 0; i < message.userFrames.length; ++i) {
          let error = $root.NT.CompactPlayerFrames.verify(message.userFrames[i]);
          if (error)
            return "userFrames." + error;
        }
      }
      return null;
    };
    ServerPlayerMoves.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerMoves)
        return object;
      let message = new $root.NT.ServerPlayerMoves();
      if (object.userFrames) {
        if (!Array.isArray(object.userFrames))
          throw TypeError(".NT.ServerPlayerMoves.userFrames: array expected");
        message.userFrames = [];
        for (let i = 0; i < object.userFrames.length; ++i) {
          if (typeof object.userFrames[i] !== "object")
            throw TypeError(".NT.ServerPlayerMoves.userFrames: object expected");
          message.userFrames[i] = $root.NT.CompactPlayerFrames.fromObject(object.userFrames[i]);
        }
      }
      return message;
    };
    ServerPlayerMoves.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.userFrames = [];
      if (message.userFrames && message.userFrames.length) {
        object.userFrames = [];
        for (let j = 0; j < message.userFrames.length; ++j)
          object.userFrames[j] = $root.NT.CompactPlayerFrames.toObject(message.userFrames[j], options);
      }
      return object;
    };
    ServerPlayerMoves.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerMoves.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerMoves";
    };
    return ServerPlayerMoves;
  }();
  NT3.ClientPlayerUpdate = function() {
    function ClientPlayerUpdate(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientPlayerUpdate.prototype.curHp = null;
    ClientPlayerUpdate.prototype.maxHp = null;
    ClientPlayerUpdate.prototype.location = null;
    ClientPlayerUpdate.prototype.sampo = null;
    let $oneOfFields;
    Object.defineProperty(ClientPlayerUpdate.prototype, "_curHp", {
      get: $util.oneOfGetter($oneOfFields = ["curHp"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ClientPlayerUpdate.prototype, "_maxHp", {
      get: $util.oneOfGetter($oneOfFields = ["maxHp"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ClientPlayerUpdate.prototype, "_location", {
      get: $util.oneOfGetter($oneOfFields = ["location"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ClientPlayerUpdate.prototype, "_sampo", {
      get: $util.oneOfGetter($oneOfFields = ["sampo"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ClientPlayerUpdate.create = function create(properties) {
      return new ClientPlayerUpdate(properties);
    };
    ClientPlayerUpdate.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.curHp != null && Object.hasOwnProperty.call(message, "curHp"))
        writer.uint32(
          /* id 1, wireType 5 =*/
          13
        ).float(message.curHp);
      if (message.maxHp != null && Object.hasOwnProperty.call(message, "maxHp"))
        writer.uint32(
          /* id 2, wireType 5 =*/
          21
        ).float(message.maxHp);
      if (message.location != null && Object.hasOwnProperty.call(message, "location"))
        writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).string(message.location);
      if (message.sampo != null && Object.hasOwnProperty.call(message, "sampo"))
        writer.uint32(
          /* id 4, wireType 0 =*/
          32
        ).bool(message.sampo);
      return writer;
    };
    ClientPlayerUpdate.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientPlayerUpdate.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerUpdate();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.curHp = reader.float();
            break;
          }
          case 2: {
            message.maxHp = reader.float();
            break;
          }
          case 3: {
            message.location = reader.string();
            break;
          }
          case 4: {
            message.sampo = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientPlayerUpdate.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientPlayerUpdate.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.curHp != null && message.hasOwnProperty("curHp")) {
        properties._curHp = 1;
        if (typeof message.curHp !== "number")
          return "curHp: number expected";
      }
      if (message.maxHp != null && message.hasOwnProperty("maxHp")) {
        properties._maxHp = 1;
        if (typeof message.maxHp !== "number")
          return "maxHp: number expected";
      }
      if (message.location != null && message.hasOwnProperty("location")) {
        properties._location = 1;
        if (!$util.isString(message.location))
          return "location: string expected";
      }
      if (message.sampo != null && message.hasOwnProperty("sampo")) {
        properties._sampo = 1;
        if (typeof message.sampo !== "boolean")
          return "sampo: boolean expected";
      }
      return null;
    };
    ClientPlayerUpdate.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientPlayerUpdate)
        return object;
      let message = new $root.NT.ClientPlayerUpdate();
      if (object.curHp != null)
        message.curHp = Number(object.curHp);
      if (object.maxHp != null)
        message.maxHp = Number(object.maxHp);
      if (object.location != null)
        message.location = String(object.location);
      if (object.sampo != null)
        message.sampo = Boolean(object.sampo);
      return message;
    };
    ClientPlayerUpdate.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (message.curHp != null && message.hasOwnProperty("curHp")) {
        object.curHp = options.json && !isFinite(message.curHp) ? String(message.curHp) : message.curHp;
        if (options.oneofs)
          object._curHp = "curHp";
      }
      if (message.maxHp != null && message.hasOwnProperty("maxHp")) {
        object.maxHp = options.json && !isFinite(message.maxHp) ? String(message.maxHp) : message.maxHp;
        if (options.oneofs)
          object._maxHp = "maxHp";
      }
      if (message.location != null && message.hasOwnProperty("location")) {
        object.location = message.location;
        if (options.oneofs)
          object._location = "location";
      }
      if (message.sampo != null && message.hasOwnProperty("sampo")) {
        object.sampo = message.sampo;
        if (options.oneofs)
          object._sampo = "sampo";
      }
      return object;
    };
    ClientPlayerUpdate.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientPlayerUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientPlayerUpdate";
    };
    return ClientPlayerUpdate;
  }();
  NT3.ServerPlayerUpdate = function() {
    function ServerPlayerUpdate(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerUpdate.prototype.userId = "";
    ServerPlayerUpdate.prototype.curHp = null;
    ServerPlayerUpdate.prototype.maxHp = null;
    ServerPlayerUpdate.prototype.location = null;
    ServerPlayerUpdate.prototype.sampo = null;
    let $oneOfFields;
    Object.defineProperty(ServerPlayerUpdate.prototype, "_curHp", {
      get: $util.oneOfGetter($oneOfFields = ["curHp"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ServerPlayerUpdate.prototype, "_maxHp", {
      get: $util.oneOfGetter($oneOfFields = ["maxHp"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ServerPlayerUpdate.prototype, "_location", {
      get: $util.oneOfGetter($oneOfFields = ["location"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ServerPlayerUpdate.prototype, "_sampo", {
      get: $util.oneOfGetter($oneOfFields = ["sampo"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ServerPlayerUpdate.create = function create(properties) {
      return new ServerPlayerUpdate(properties);
    };
    ServerPlayerUpdate.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.curHp != null && Object.hasOwnProperty.call(message, "curHp"))
        writer.uint32(
          /* id 2, wireType 5 =*/
          21
        ).float(message.curHp);
      if (message.maxHp != null && Object.hasOwnProperty.call(message, "maxHp"))
        writer.uint32(
          /* id 3, wireType 5 =*/
          29
        ).float(message.maxHp);
      if (message.location != null && Object.hasOwnProperty.call(message, "location"))
        writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).string(message.location);
      if (message.sampo != null && Object.hasOwnProperty.call(message, "sampo"))
        writer.uint32(
          /* id 5, wireType 0 =*/
          40
        ).bool(message.sampo);
      return writer;
    };
    ServerPlayerUpdate.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerUpdate.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerUpdate();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.curHp = reader.float();
            break;
          }
          case 3: {
            message.maxHp = reader.float();
            break;
          }
          case 4: {
            message.location = reader.string();
            break;
          }
          case 5: {
            message.sampo = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerUpdate.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerUpdate.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.curHp != null && message.hasOwnProperty("curHp")) {
        properties._curHp = 1;
        if (typeof message.curHp !== "number")
          return "curHp: number expected";
      }
      if (message.maxHp != null && message.hasOwnProperty("maxHp")) {
        properties._maxHp = 1;
        if (typeof message.maxHp !== "number")
          return "maxHp: number expected";
      }
      if (message.location != null && message.hasOwnProperty("location")) {
        properties._location = 1;
        if (!$util.isString(message.location))
          return "location: string expected";
      }
      if (message.sampo != null && message.hasOwnProperty("sampo")) {
        properties._sampo = 1;
        if (typeof message.sampo !== "boolean")
          return "sampo: boolean expected";
      }
      return null;
    };
    ServerPlayerUpdate.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerUpdate)
        return object;
      let message = new $root.NT.ServerPlayerUpdate();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.curHp != null)
        message.curHp = Number(object.curHp);
      if (object.maxHp != null)
        message.maxHp = Number(object.maxHp);
      if (object.location != null)
        message.location = String(object.location);
      if (object.sampo != null)
        message.sampo = Boolean(object.sampo);
      return message;
    };
    ServerPlayerUpdate.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.curHp != null && message.hasOwnProperty("curHp")) {
        object.curHp = options.json && !isFinite(message.curHp) ? String(message.curHp) : message.curHp;
        if (options.oneofs)
          object._curHp = "curHp";
      }
      if (message.maxHp != null && message.hasOwnProperty("maxHp")) {
        object.maxHp = options.json && !isFinite(message.maxHp) ? String(message.maxHp) : message.maxHp;
        if (options.oneofs)
          object._maxHp = "maxHp";
      }
      if (message.location != null && message.hasOwnProperty("location")) {
        object.location = message.location;
        if (options.oneofs)
          object._location = "location";
      }
      if (message.sampo != null && message.hasOwnProperty("sampo")) {
        object.sampo = message.sampo;
        if (options.oneofs)
          object._sampo = "sampo";
      }
      return object;
    };
    ServerPlayerUpdate.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerUpdate";
    };
    return ServerPlayerUpdate;
  }();
  NT3.ClientPlayerUpdateInventory = function() {
    function ClientPlayerUpdateInventory(properties) {
      this.wands = [];
      this.items = [];
      this.spells = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientPlayerUpdateInventory.prototype.wands = $util.emptyArray;
    ClientPlayerUpdateInventory.prototype.items = $util.emptyArray;
    ClientPlayerUpdateInventory.prototype.spells = $util.emptyArray;
    ClientPlayerUpdateInventory.create = function create(properties) {
      return new ClientPlayerUpdateInventory(properties);
    };
    ClientPlayerUpdateInventory.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.wands != null && message.wands.length)
        for (let i = 0; i < message.wands.length; ++i)
          $root.NT.ClientPlayerUpdateInventory.InventoryWand.encode(message.wands[i], writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).fork()).ldelim();
      if (message.items != null && message.items.length)
        for (let i = 0; i < message.items.length; ++i)
          $root.NT.ClientPlayerUpdateInventory.InventoryItem.encode(message.items[i], writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).fork()).ldelim();
      if (message.spells != null && message.spells.length)
        for (let i = 0; i < message.spells.length; ++i)
          $root.NT.ClientPlayerUpdateInventory.InventorySpell.encode(message.spells[i], writer.uint32(
            /* id 3, wireType 2 =*/
            26
          ).fork()).ldelim();
      return writer;
    };
    ClientPlayerUpdateInventory.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientPlayerUpdateInventory.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerUpdateInventory();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (!(message.wands && message.wands.length))
              message.wands = [];
            message.wands.push($root.NT.ClientPlayerUpdateInventory.InventoryWand.decode(reader, reader.uint32()));
            break;
          }
          case 2: {
            if (!(message.items && message.items.length))
              message.items = [];
            message.items.push($root.NT.ClientPlayerUpdateInventory.InventoryItem.decode(reader, reader.uint32()));
            break;
          }
          case 3: {
            if (!(message.spells && message.spells.length))
              message.spells = [];
            message.spells.push($root.NT.ClientPlayerUpdateInventory.InventorySpell.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientPlayerUpdateInventory.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientPlayerUpdateInventory.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.wands != null && message.hasOwnProperty("wands")) {
        if (!Array.isArray(message.wands))
          return "wands: array expected";
        for (let i = 0; i < message.wands.length; ++i) {
          let error = $root.NT.ClientPlayerUpdateInventory.InventoryWand.verify(message.wands[i]);
          if (error)
            return "wands." + error;
        }
      }
      if (message.items != null && message.hasOwnProperty("items")) {
        if (!Array.isArray(message.items))
          return "items: array expected";
        for (let i = 0; i < message.items.length; ++i) {
          let error = $root.NT.ClientPlayerUpdateInventory.InventoryItem.verify(message.items[i]);
          if (error)
            return "items." + error;
        }
      }
      if (message.spells != null && message.hasOwnProperty("spells")) {
        if (!Array.isArray(message.spells))
          return "spells: array expected";
        for (let i = 0; i < message.spells.length; ++i) {
          let error = $root.NT.ClientPlayerUpdateInventory.InventorySpell.verify(message.spells[i]);
          if (error)
            return "spells." + error;
        }
      }
      return null;
    };
    ClientPlayerUpdateInventory.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientPlayerUpdateInventory)
        return object;
      let message = new $root.NT.ClientPlayerUpdateInventory();
      if (object.wands) {
        if (!Array.isArray(object.wands))
          throw TypeError(".NT.ClientPlayerUpdateInventory.wands: array expected");
        message.wands = [];
        for (let i = 0; i < object.wands.length; ++i) {
          if (typeof object.wands[i] !== "object")
            throw TypeError(".NT.ClientPlayerUpdateInventory.wands: object expected");
          message.wands[i] = $root.NT.ClientPlayerUpdateInventory.InventoryWand.fromObject(object.wands[i]);
        }
      }
      if (object.items) {
        if (!Array.isArray(object.items))
          throw TypeError(".NT.ClientPlayerUpdateInventory.items: array expected");
        message.items = [];
        for (let i = 0; i < object.items.length; ++i) {
          if (typeof object.items[i] !== "object")
            throw TypeError(".NT.ClientPlayerUpdateInventory.items: object expected");
          message.items[i] = $root.NT.ClientPlayerUpdateInventory.InventoryItem.fromObject(object.items[i]);
        }
      }
      if (object.spells) {
        if (!Array.isArray(object.spells))
          throw TypeError(".NT.ClientPlayerUpdateInventory.spells: array expected");
        message.spells = [];
        for (let i = 0; i < object.spells.length; ++i) {
          if (typeof object.spells[i] !== "object")
            throw TypeError(".NT.ClientPlayerUpdateInventory.spells: object expected");
          message.spells[i] = $root.NT.ClientPlayerUpdateInventory.InventorySpell.fromObject(object.spells[i]);
        }
      }
      return message;
    };
    ClientPlayerUpdateInventory.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults) {
        object.wands = [];
        object.items = [];
        object.spells = [];
      }
      if (message.wands && message.wands.length) {
        object.wands = [];
        for (let j = 0; j < message.wands.length; ++j)
          object.wands[j] = $root.NT.ClientPlayerUpdateInventory.InventoryWand.toObject(message.wands[j], options);
      }
      if (message.items && message.items.length) {
        object.items = [];
        for (let j = 0; j < message.items.length; ++j)
          object.items[j] = $root.NT.ClientPlayerUpdateInventory.InventoryItem.toObject(message.items[j], options);
      }
      if (message.spells && message.spells.length) {
        object.spells = [];
        for (let j = 0; j < message.spells.length; ++j)
          object.spells[j] = $root.NT.ClientPlayerUpdateInventory.InventorySpell.toObject(message.spells[j], options);
      }
      return object;
    };
    ClientPlayerUpdateInventory.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientPlayerUpdateInventory.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientPlayerUpdateInventory";
    };
    ClientPlayerUpdateInventory.InventoryWand = function() {
      function InventoryWand(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      InventoryWand.prototype.index = 0;
      InventoryWand.prototype.wand = null;
      InventoryWand.create = function create(properties) {
        return new InventoryWand(properties);
      };
      InventoryWand.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.index != null && Object.hasOwnProperty.call(message, "index"))
          writer.uint32(
            /* id 1, wireType 0 =*/
            8
          ).uint32(message.index);
        if (message.wand != null && Object.hasOwnProperty.call(message, "wand"))
          $root.NT.Wand.encode(message.wand, writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).fork()).ldelim();
        return writer;
      };
      InventoryWand.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      InventoryWand.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerUpdateInventory.InventoryWand();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.index = reader.uint32();
              break;
            }
            case 2: {
              message.wand = $root.NT.Wand.decode(reader, reader.uint32());
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      InventoryWand.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      InventoryWand.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.index != null && message.hasOwnProperty("index")) {
          if (!$util.isInteger(message.index))
            return "index: integer expected";
        }
        if (message.wand != null && message.hasOwnProperty("wand")) {
          let error = $root.NT.Wand.verify(message.wand);
          if (error)
            return "wand." + error;
        }
        return null;
      };
      InventoryWand.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ClientPlayerUpdateInventory.InventoryWand)
          return object;
        let message = new $root.NT.ClientPlayerUpdateInventory.InventoryWand();
        if (object.index != null)
          message.index = object.index >>> 0;
        if (object.wand != null) {
          if (typeof object.wand !== "object")
            throw TypeError(".NT.ClientPlayerUpdateInventory.InventoryWand.wand: object expected");
          message.wand = $root.NT.Wand.fromObject(object.wand);
        }
        return message;
      };
      InventoryWand.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.index = 0;
          object.wand = null;
        }
        if (message.index != null && message.hasOwnProperty("index"))
          object.index = message.index;
        if (message.wand != null && message.hasOwnProperty("wand"))
          object.wand = $root.NT.Wand.toObject(message.wand, options);
        return object;
      };
      InventoryWand.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      InventoryWand.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ClientPlayerUpdateInventory.InventoryWand";
      };
      return InventoryWand;
    }();
    ClientPlayerUpdateInventory.InventoryItem = function() {
      function InventoryItem(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      InventoryItem.prototype.index = 0;
      InventoryItem.prototype.item = null;
      InventoryItem.create = function create(properties) {
        return new InventoryItem(properties);
      };
      InventoryItem.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.index != null && Object.hasOwnProperty.call(message, "index"))
          writer.uint32(
            /* id 3, wireType 0 =*/
            24
          ).uint32(message.index);
        if (message.item != null && Object.hasOwnProperty.call(message, "item"))
          $root.NT.Item.encode(message.item, writer.uint32(
            /* id 4, wireType 2 =*/
            34
          ).fork()).ldelim();
        return writer;
      };
      InventoryItem.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      InventoryItem.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerUpdateInventory.InventoryItem();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 3: {
              message.index = reader.uint32();
              break;
            }
            case 4: {
              message.item = $root.NT.Item.decode(reader, reader.uint32());
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      InventoryItem.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      InventoryItem.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.index != null && message.hasOwnProperty("index")) {
          if (!$util.isInteger(message.index))
            return "index: integer expected";
        }
        if (message.item != null && message.hasOwnProperty("item")) {
          let error = $root.NT.Item.verify(message.item);
          if (error)
            return "item." + error;
        }
        return null;
      };
      InventoryItem.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ClientPlayerUpdateInventory.InventoryItem)
          return object;
        let message = new $root.NT.ClientPlayerUpdateInventory.InventoryItem();
        if (object.index != null)
          message.index = object.index >>> 0;
        if (object.item != null) {
          if (typeof object.item !== "object")
            throw TypeError(".NT.ClientPlayerUpdateInventory.InventoryItem.item: object expected");
          message.item = $root.NT.Item.fromObject(object.item);
        }
        return message;
      };
      InventoryItem.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.index = 0;
          object.item = null;
        }
        if (message.index != null && message.hasOwnProperty("index"))
          object.index = message.index;
        if (message.item != null && message.hasOwnProperty("item"))
          object.item = $root.NT.Item.toObject(message.item, options);
        return object;
      };
      InventoryItem.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      InventoryItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ClientPlayerUpdateInventory.InventoryItem";
      };
      return InventoryItem;
    }();
    ClientPlayerUpdateInventory.InventorySpell = function() {
      function InventorySpell(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      InventorySpell.prototype.index = 0;
      InventorySpell.prototype.spell = null;
      InventorySpell.create = function create(properties) {
        return new InventorySpell(properties);
      };
      InventorySpell.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.index != null && Object.hasOwnProperty.call(message, "index"))
          writer.uint32(
            /* id 1, wireType 0 =*/
            8
          ).uint32(message.index);
        if (message.spell != null && Object.hasOwnProperty.call(message, "spell"))
          $root.NT.Spell.encode(message.spell, writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).fork()).ldelim();
        return writer;
      };
      InventorySpell.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      InventorySpell.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerUpdateInventory.InventorySpell();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.index = reader.uint32();
              break;
            }
            case 2: {
              message.spell = $root.NT.Spell.decode(reader, reader.uint32());
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      InventorySpell.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      InventorySpell.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.index != null && message.hasOwnProperty("index")) {
          if (!$util.isInteger(message.index))
            return "index: integer expected";
        }
        if (message.spell != null && message.hasOwnProperty("spell")) {
          let error = $root.NT.Spell.verify(message.spell);
          if (error)
            return "spell." + error;
        }
        return null;
      };
      InventorySpell.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ClientPlayerUpdateInventory.InventorySpell)
          return object;
        let message = new $root.NT.ClientPlayerUpdateInventory.InventorySpell();
        if (object.index != null)
          message.index = object.index >>> 0;
        if (object.spell != null) {
          if (typeof object.spell !== "object")
            throw TypeError(".NT.ClientPlayerUpdateInventory.InventorySpell.spell: object expected");
          message.spell = $root.NT.Spell.fromObject(object.spell);
        }
        return message;
      };
      InventorySpell.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.index = 0;
          object.spell = null;
        }
        if (message.index != null && message.hasOwnProperty("index"))
          object.index = message.index;
        if (message.spell != null && message.hasOwnProperty("spell"))
          object.spell = $root.NT.Spell.toObject(message.spell, options);
        return object;
      };
      InventorySpell.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      InventorySpell.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ClientPlayerUpdateInventory.InventorySpell";
      };
      return InventorySpell;
    }();
    return ClientPlayerUpdateInventory;
  }();
  NT3.ServerPlayerUpdateInventory = function() {
    function ServerPlayerUpdateInventory(properties) {
      this.wands = [];
      this.items = [];
      this.spells = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerUpdateInventory.prototype.userId = "";
    ServerPlayerUpdateInventory.prototype.wands = $util.emptyArray;
    ServerPlayerUpdateInventory.prototype.items = $util.emptyArray;
    ServerPlayerUpdateInventory.prototype.spells = $util.emptyArray;
    ServerPlayerUpdateInventory.create = function create(properties) {
      return new ServerPlayerUpdateInventory(properties);
    };
    ServerPlayerUpdateInventory.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.wands != null && message.wands.length)
        for (let i = 0; i < message.wands.length; ++i)
          $root.NT.ServerPlayerUpdateInventory.InventoryWand.encode(message.wands[i], writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).fork()).ldelim();
      if (message.items != null && message.items.length)
        for (let i = 0; i < message.items.length; ++i)
          $root.NT.ServerPlayerUpdateInventory.InventoryItem.encode(message.items[i], writer.uint32(
            /* id 3, wireType 2 =*/
            26
          ).fork()).ldelim();
      if (message.spells != null && message.spells.length)
        for (let i = 0; i < message.spells.length; ++i)
          $root.NT.ServerPlayerUpdateInventory.InventorySpell.encode(message.spells[i], writer.uint32(
            /* id 4, wireType 2 =*/
            34
          ).fork()).ldelim();
      return writer;
    };
    ServerPlayerUpdateInventory.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerUpdateInventory.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerUpdateInventory();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            if (!(message.wands && message.wands.length))
              message.wands = [];
            message.wands.push($root.NT.ServerPlayerUpdateInventory.InventoryWand.decode(reader, reader.uint32()));
            break;
          }
          case 3: {
            if (!(message.items && message.items.length))
              message.items = [];
            message.items.push($root.NT.ServerPlayerUpdateInventory.InventoryItem.decode(reader, reader.uint32()));
            break;
          }
          case 4: {
            if (!(message.spells && message.spells.length))
              message.spells = [];
            message.spells.push($root.NT.ServerPlayerUpdateInventory.InventorySpell.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerUpdateInventory.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerUpdateInventory.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.wands != null && message.hasOwnProperty("wands")) {
        if (!Array.isArray(message.wands))
          return "wands: array expected";
        for (let i = 0; i < message.wands.length; ++i) {
          let error = $root.NT.ServerPlayerUpdateInventory.InventoryWand.verify(message.wands[i]);
          if (error)
            return "wands." + error;
        }
      }
      if (message.items != null && message.hasOwnProperty("items")) {
        if (!Array.isArray(message.items))
          return "items: array expected";
        for (let i = 0; i < message.items.length; ++i) {
          let error = $root.NT.ServerPlayerUpdateInventory.InventoryItem.verify(message.items[i]);
          if (error)
            return "items." + error;
        }
      }
      if (message.spells != null && message.hasOwnProperty("spells")) {
        if (!Array.isArray(message.spells))
          return "spells: array expected";
        for (let i = 0; i < message.spells.length; ++i) {
          let error = $root.NT.ServerPlayerUpdateInventory.InventorySpell.verify(message.spells[i]);
          if (error)
            return "spells." + error;
        }
      }
      return null;
    };
    ServerPlayerUpdateInventory.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerUpdateInventory)
        return object;
      let message = new $root.NT.ServerPlayerUpdateInventory();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.wands) {
        if (!Array.isArray(object.wands))
          throw TypeError(".NT.ServerPlayerUpdateInventory.wands: array expected");
        message.wands = [];
        for (let i = 0; i < object.wands.length; ++i) {
          if (typeof object.wands[i] !== "object")
            throw TypeError(".NT.ServerPlayerUpdateInventory.wands: object expected");
          message.wands[i] = $root.NT.ServerPlayerUpdateInventory.InventoryWand.fromObject(object.wands[i]);
        }
      }
      if (object.items) {
        if (!Array.isArray(object.items))
          throw TypeError(".NT.ServerPlayerUpdateInventory.items: array expected");
        message.items = [];
        for (let i = 0; i < object.items.length; ++i) {
          if (typeof object.items[i] !== "object")
            throw TypeError(".NT.ServerPlayerUpdateInventory.items: object expected");
          message.items[i] = $root.NT.ServerPlayerUpdateInventory.InventoryItem.fromObject(object.items[i]);
        }
      }
      if (object.spells) {
        if (!Array.isArray(object.spells))
          throw TypeError(".NT.ServerPlayerUpdateInventory.spells: array expected");
        message.spells = [];
        for (let i = 0; i < object.spells.length; ++i) {
          if (typeof object.spells[i] !== "object")
            throw TypeError(".NT.ServerPlayerUpdateInventory.spells: object expected");
          message.spells[i] = $root.NT.ServerPlayerUpdateInventory.InventorySpell.fromObject(object.spells[i]);
        }
      }
      return message;
    };
    ServerPlayerUpdateInventory.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults) {
        object.wands = [];
        object.items = [];
        object.spells = [];
      }
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.wands && message.wands.length) {
        object.wands = [];
        for (let j = 0; j < message.wands.length; ++j)
          object.wands[j] = $root.NT.ServerPlayerUpdateInventory.InventoryWand.toObject(message.wands[j], options);
      }
      if (message.items && message.items.length) {
        object.items = [];
        for (let j = 0; j < message.items.length; ++j)
          object.items[j] = $root.NT.ServerPlayerUpdateInventory.InventoryItem.toObject(message.items[j], options);
      }
      if (message.spells && message.spells.length) {
        object.spells = [];
        for (let j = 0; j < message.spells.length; ++j)
          object.spells[j] = $root.NT.ServerPlayerUpdateInventory.InventorySpell.toObject(message.spells[j], options);
      }
      return object;
    };
    ServerPlayerUpdateInventory.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerUpdateInventory.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerUpdateInventory";
    };
    ServerPlayerUpdateInventory.InventoryWand = function() {
      function InventoryWand(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      InventoryWand.prototype.index = 0;
      InventoryWand.prototype.wand = null;
      InventoryWand.create = function create(properties) {
        return new InventoryWand(properties);
      };
      InventoryWand.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.index != null && Object.hasOwnProperty.call(message, "index"))
          writer.uint32(
            /* id 1, wireType 0 =*/
            8
          ).uint32(message.index);
        if (message.wand != null && Object.hasOwnProperty.call(message, "wand"))
          $root.NT.Wand.encode(message.wand, writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).fork()).ldelim();
        return writer;
      };
      InventoryWand.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      InventoryWand.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerUpdateInventory.InventoryWand();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.index = reader.uint32();
              break;
            }
            case 2: {
              message.wand = $root.NT.Wand.decode(reader, reader.uint32());
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      InventoryWand.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      InventoryWand.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.index != null && message.hasOwnProperty("index")) {
          if (!$util.isInteger(message.index))
            return "index: integer expected";
        }
        if (message.wand != null && message.hasOwnProperty("wand")) {
          let error = $root.NT.Wand.verify(message.wand);
          if (error)
            return "wand." + error;
        }
        return null;
      };
      InventoryWand.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerPlayerUpdateInventory.InventoryWand)
          return object;
        let message = new $root.NT.ServerPlayerUpdateInventory.InventoryWand();
        if (object.index != null)
          message.index = object.index >>> 0;
        if (object.wand != null) {
          if (typeof object.wand !== "object")
            throw TypeError(".NT.ServerPlayerUpdateInventory.InventoryWand.wand: object expected");
          message.wand = $root.NT.Wand.fromObject(object.wand);
        }
        return message;
      };
      InventoryWand.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.index = 0;
          object.wand = null;
        }
        if (message.index != null && message.hasOwnProperty("index"))
          object.index = message.index;
        if (message.wand != null && message.hasOwnProperty("wand"))
          object.wand = $root.NT.Wand.toObject(message.wand, options);
        return object;
      };
      InventoryWand.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      InventoryWand.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerPlayerUpdateInventory.InventoryWand";
      };
      return InventoryWand;
    }();
    ServerPlayerUpdateInventory.InventoryItem = function() {
      function InventoryItem(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      InventoryItem.prototype.index = 0;
      InventoryItem.prototype.item = null;
      InventoryItem.create = function create(properties) {
        return new InventoryItem(properties);
      };
      InventoryItem.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.index != null && Object.hasOwnProperty.call(message, "index"))
          writer.uint32(
            /* id 1, wireType 0 =*/
            8
          ).uint32(message.index);
        if (message.item != null && Object.hasOwnProperty.call(message, "item"))
          $root.NT.Item.encode(message.item, writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).fork()).ldelim();
        return writer;
      };
      InventoryItem.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      InventoryItem.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerUpdateInventory.InventoryItem();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.index = reader.uint32();
              break;
            }
            case 2: {
              message.item = $root.NT.Item.decode(reader, reader.uint32());
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      InventoryItem.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      InventoryItem.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.index != null && message.hasOwnProperty("index")) {
          if (!$util.isInteger(message.index))
            return "index: integer expected";
        }
        if (message.item != null && message.hasOwnProperty("item")) {
          let error = $root.NT.Item.verify(message.item);
          if (error)
            return "item." + error;
        }
        return null;
      };
      InventoryItem.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerPlayerUpdateInventory.InventoryItem)
          return object;
        let message = new $root.NT.ServerPlayerUpdateInventory.InventoryItem();
        if (object.index != null)
          message.index = object.index >>> 0;
        if (object.item != null) {
          if (typeof object.item !== "object")
            throw TypeError(".NT.ServerPlayerUpdateInventory.InventoryItem.item: object expected");
          message.item = $root.NT.Item.fromObject(object.item);
        }
        return message;
      };
      InventoryItem.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.index = 0;
          object.item = null;
        }
        if (message.index != null && message.hasOwnProperty("index"))
          object.index = message.index;
        if (message.item != null && message.hasOwnProperty("item"))
          object.item = $root.NT.Item.toObject(message.item, options);
        return object;
      };
      InventoryItem.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      InventoryItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerPlayerUpdateInventory.InventoryItem";
      };
      return InventoryItem;
    }();
    ServerPlayerUpdateInventory.InventorySpell = function() {
      function InventorySpell(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      InventorySpell.prototype.index = 0;
      InventorySpell.prototype.spell = null;
      InventorySpell.create = function create(properties) {
        return new InventorySpell(properties);
      };
      InventorySpell.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.index != null && Object.hasOwnProperty.call(message, "index"))
          writer.uint32(
            /* id 1, wireType 0 =*/
            8
          ).uint32(message.index);
        if (message.spell != null && Object.hasOwnProperty.call(message, "spell"))
          $root.NT.Spell.encode(message.spell, writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).fork()).ldelim();
        return writer;
      };
      InventorySpell.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      InventorySpell.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerUpdateInventory.InventorySpell();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.index = reader.uint32();
              break;
            }
            case 2: {
              message.spell = $root.NT.Spell.decode(reader, reader.uint32());
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      InventorySpell.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      InventorySpell.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.index != null && message.hasOwnProperty("index")) {
          if (!$util.isInteger(message.index))
            return "index: integer expected";
        }
        if (message.spell != null && message.hasOwnProperty("spell")) {
          let error = $root.NT.Spell.verify(message.spell);
          if (error)
            return "spell." + error;
        }
        return null;
      };
      InventorySpell.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerPlayerUpdateInventory.InventorySpell)
          return object;
        let message = new $root.NT.ServerPlayerUpdateInventory.InventorySpell();
        if (object.index != null)
          message.index = object.index >>> 0;
        if (object.spell != null) {
          if (typeof object.spell !== "object")
            throw TypeError(".NT.ServerPlayerUpdateInventory.InventorySpell.spell: object expected");
          message.spell = $root.NT.Spell.fromObject(object.spell);
        }
        return message;
      };
      InventorySpell.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.index = 0;
          object.spell = null;
        }
        if (message.index != null && message.hasOwnProperty("index"))
          object.index = message.index;
        if (message.spell != null && message.hasOwnProperty("spell"))
          object.spell = $root.NT.Spell.toObject(message.spell, options);
        return object;
      };
      InventorySpell.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      InventorySpell.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerPlayerUpdateInventory.InventorySpell";
      };
      return InventorySpell;
    }();
    return ServerPlayerUpdateInventory;
  }();
  NT3.ClientHostItemBank = function() {
    function ClientHostItemBank(properties) {
      this.wands = [];
      this.spells = [];
      this.items = [];
      this.objects = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientHostItemBank.prototype.wands = $util.emptyArray;
    ClientHostItemBank.prototype.spells = $util.emptyArray;
    ClientHostItemBank.prototype.items = $util.emptyArray;
    ClientHostItemBank.prototype.gold = 0;
    ClientHostItemBank.prototype.objects = $util.emptyArray;
    ClientHostItemBank.create = function create(properties) {
      return new ClientHostItemBank(properties);
    };
    ClientHostItemBank.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.wands != null && message.wands.length)
        for (let i = 0; i < message.wands.length; ++i)
          $root.NT.Wand.encode(message.wands[i], writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).fork()).ldelim();
      if (message.spells != null && message.spells.length)
        for (let i = 0; i < message.spells.length; ++i)
          $root.NT.Spell.encode(message.spells[i], writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).fork()).ldelim();
      if (message.items != null && message.items.length)
        for (let i = 0; i < message.items.length; ++i)
          $root.NT.Item.encode(message.items[i], writer.uint32(
            /* id 3, wireType 2 =*/
            26
          ).fork()).ldelim();
      if (message.gold != null && Object.hasOwnProperty.call(message, "gold"))
        writer.uint32(
          /* id 4, wireType 0 =*/
          32
        ).uint32(message.gold);
      if (message.objects != null && message.objects.length)
        for (let i = 0; i < message.objects.length; ++i)
          $root.NT.EntityItem.encode(message.objects[i], writer.uint32(
            /* id 5, wireType 2 =*/
            42
          ).fork()).ldelim();
      return writer;
    };
    ClientHostItemBank.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientHostItemBank.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientHostItemBank();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (!(message.wands && message.wands.length))
              message.wands = [];
            message.wands.push($root.NT.Wand.decode(reader, reader.uint32()));
            break;
          }
          case 2: {
            if (!(message.spells && message.spells.length))
              message.spells = [];
            message.spells.push($root.NT.Spell.decode(reader, reader.uint32()));
            break;
          }
          case 3: {
            if (!(message.items && message.items.length))
              message.items = [];
            message.items.push($root.NT.Item.decode(reader, reader.uint32()));
            break;
          }
          case 4: {
            message.gold = reader.uint32();
            break;
          }
          case 5: {
            if (!(message.objects && message.objects.length))
              message.objects = [];
            message.objects.push($root.NT.EntityItem.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientHostItemBank.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientHostItemBank.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.wands != null && message.hasOwnProperty("wands")) {
        if (!Array.isArray(message.wands))
          return "wands: array expected";
        for (let i = 0; i < message.wands.length; ++i) {
          let error = $root.NT.Wand.verify(message.wands[i]);
          if (error)
            return "wands." + error;
        }
      }
      if (message.spells != null && message.hasOwnProperty("spells")) {
        if (!Array.isArray(message.spells))
          return "spells: array expected";
        for (let i = 0; i < message.spells.length; ++i) {
          let error = $root.NT.Spell.verify(message.spells[i]);
          if (error)
            return "spells." + error;
        }
      }
      if (message.items != null && message.hasOwnProperty("items")) {
        if (!Array.isArray(message.items))
          return "items: array expected";
        for (let i = 0; i < message.items.length; ++i) {
          let error = $root.NT.Item.verify(message.items[i]);
          if (error)
            return "items." + error;
        }
      }
      if (message.gold != null && message.hasOwnProperty("gold")) {
        if (!$util.isInteger(message.gold))
          return "gold: integer expected";
      }
      if (message.objects != null && message.hasOwnProperty("objects")) {
        if (!Array.isArray(message.objects))
          return "objects: array expected";
        for (let i = 0; i < message.objects.length; ++i) {
          let error = $root.NT.EntityItem.verify(message.objects[i]);
          if (error)
            return "objects." + error;
        }
      }
      return null;
    };
    ClientHostItemBank.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientHostItemBank)
        return object;
      let message = new $root.NT.ClientHostItemBank();
      if (object.wands) {
        if (!Array.isArray(object.wands))
          throw TypeError(".NT.ClientHostItemBank.wands: array expected");
        message.wands = [];
        for (let i = 0; i < object.wands.length; ++i) {
          if (typeof object.wands[i] !== "object")
            throw TypeError(".NT.ClientHostItemBank.wands: object expected");
          message.wands[i] = $root.NT.Wand.fromObject(object.wands[i]);
        }
      }
      if (object.spells) {
        if (!Array.isArray(object.spells))
          throw TypeError(".NT.ClientHostItemBank.spells: array expected");
        message.spells = [];
        for (let i = 0; i < object.spells.length; ++i) {
          if (typeof object.spells[i] !== "object")
            throw TypeError(".NT.ClientHostItemBank.spells: object expected");
          message.spells[i] = $root.NT.Spell.fromObject(object.spells[i]);
        }
      }
      if (object.items) {
        if (!Array.isArray(object.items))
          throw TypeError(".NT.ClientHostItemBank.items: array expected");
        message.items = [];
        for (let i = 0; i < object.items.length; ++i) {
          if (typeof object.items[i] !== "object")
            throw TypeError(".NT.ClientHostItemBank.items: object expected");
          message.items[i] = $root.NT.Item.fromObject(object.items[i]);
        }
      }
      if (object.gold != null)
        message.gold = object.gold >>> 0;
      if (object.objects) {
        if (!Array.isArray(object.objects))
          throw TypeError(".NT.ClientHostItemBank.objects: array expected");
        message.objects = [];
        for (let i = 0; i < object.objects.length; ++i) {
          if (typeof object.objects[i] !== "object")
            throw TypeError(".NT.ClientHostItemBank.objects: object expected");
          message.objects[i] = $root.NT.EntityItem.fromObject(object.objects[i]);
        }
      }
      return message;
    };
    ClientHostItemBank.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults) {
        object.wands = [];
        object.spells = [];
        object.items = [];
        object.objects = [];
      }
      if (options.defaults)
        object.gold = 0;
      if (message.wands && message.wands.length) {
        object.wands = [];
        for (let j = 0; j < message.wands.length; ++j)
          object.wands[j] = $root.NT.Wand.toObject(message.wands[j], options);
      }
      if (message.spells && message.spells.length) {
        object.spells = [];
        for (let j = 0; j < message.spells.length; ++j)
          object.spells[j] = $root.NT.Spell.toObject(message.spells[j], options);
      }
      if (message.items && message.items.length) {
        object.items = [];
        for (let j = 0; j < message.items.length; ++j)
          object.items[j] = $root.NT.Item.toObject(message.items[j], options);
      }
      if (message.gold != null && message.hasOwnProperty("gold"))
        object.gold = message.gold;
      if (message.objects && message.objects.length) {
        object.objects = [];
        for (let j = 0; j < message.objects.length; ++j)
          object.objects[j] = $root.NT.EntityItem.toObject(message.objects[j], options);
      }
      return object;
    };
    ClientHostItemBank.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientHostItemBank.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientHostItemBank";
    };
    return ClientHostItemBank;
  }();
  NT3.ServerHostItemBank = function() {
    function ServerHostItemBank(properties) {
      this.wands = [];
      this.spells = [];
      this.items = [];
      this.objects = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerHostItemBank.prototype.wands = $util.emptyArray;
    ServerHostItemBank.prototype.spells = $util.emptyArray;
    ServerHostItemBank.prototype.items = $util.emptyArray;
    ServerHostItemBank.prototype.gold = 0;
    ServerHostItemBank.prototype.objects = $util.emptyArray;
    ServerHostItemBank.create = function create(properties) {
      return new ServerHostItemBank(properties);
    };
    ServerHostItemBank.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.wands != null && message.wands.length)
        for (let i = 0; i < message.wands.length; ++i)
          $root.NT.Wand.encode(message.wands[i], writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).fork()).ldelim();
      if (message.spells != null && message.spells.length)
        for (let i = 0; i < message.spells.length; ++i)
          $root.NT.Spell.encode(message.spells[i], writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).fork()).ldelim();
      if (message.items != null && message.items.length)
        for (let i = 0; i < message.items.length; ++i)
          $root.NT.Item.encode(message.items[i], writer.uint32(
            /* id 3, wireType 2 =*/
            26
          ).fork()).ldelim();
      if (message.gold != null && Object.hasOwnProperty.call(message, "gold"))
        writer.uint32(
          /* id 4, wireType 0 =*/
          32
        ).uint32(message.gold);
      if (message.objects != null && message.objects.length)
        for (let i = 0; i < message.objects.length; ++i)
          $root.NT.EntityItem.encode(message.objects[i], writer.uint32(
            /* id 5, wireType 2 =*/
            42
          ).fork()).ldelim();
      return writer;
    };
    ServerHostItemBank.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerHostItemBank.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerHostItemBank();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (!(message.wands && message.wands.length))
              message.wands = [];
            message.wands.push($root.NT.Wand.decode(reader, reader.uint32()));
            break;
          }
          case 2: {
            if (!(message.spells && message.spells.length))
              message.spells = [];
            message.spells.push($root.NT.Spell.decode(reader, reader.uint32()));
            break;
          }
          case 3: {
            if (!(message.items && message.items.length))
              message.items = [];
            message.items.push($root.NT.Item.decode(reader, reader.uint32()));
            break;
          }
          case 4: {
            message.gold = reader.uint32();
            break;
          }
          case 5: {
            if (!(message.objects && message.objects.length))
              message.objects = [];
            message.objects.push($root.NT.EntityItem.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerHostItemBank.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerHostItemBank.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.wands != null && message.hasOwnProperty("wands")) {
        if (!Array.isArray(message.wands))
          return "wands: array expected";
        for (let i = 0; i < message.wands.length; ++i) {
          let error = $root.NT.Wand.verify(message.wands[i]);
          if (error)
            return "wands." + error;
        }
      }
      if (message.spells != null && message.hasOwnProperty("spells")) {
        if (!Array.isArray(message.spells))
          return "spells: array expected";
        for (let i = 0; i < message.spells.length; ++i) {
          let error = $root.NT.Spell.verify(message.spells[i]);
          if (error)
            return "spells." + error;
        }
      }
      if (message.items != null && message.hasOwnProperty("items")) {
        if (!Array.isArray(message.items))
          return "items: array expected";
        for (let i = 0; i < message.items.length; ++i) {
          let error = $root.NT.Item.verify(message.items[i]);
          if (error)
            return "items." + error;
        }
      }
      if (message.gold != null && message.hasOwnProperty("gold")) {
        if (!$util.isInteger(message.gold))
          return "gold: integer expected";
      }
      if (message.objects != null && message.hasOwnProperty("objects")) {
        if (!Array.isArray(message.objects))
          return "objects: array expected";
        for (let i = 0; i < message.objects.length; ++i) {
          let error = $root.NT.EntityItem.verify(message.objects[i]);
          if (error)
            return "objects." + error;
        }
      }
      return null;
    };
    ServerHostItemBank.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerHostItemBank)
        return object;
      let message = new $root.NT.ServerHostItemBank();
      if (object.wands) {
        if (!Array.isArray(object.wands))
          throw TypeError(".NT.ServerHostItemBank.wands: array expected");
        message.wands = [];
        for (let i = 0; i < object.wands.length; ++i) {
          if (typeof object.wands[i] !== "object")
            throw TypeError(".NT.ServerHostItemBank.wands: object expected");
          message.wands[i] = $root.NT.Wand.fromObject(object.wands[i]);
        }
      }
      if (object.spells) {
        if (!Array.isArray(object.spells))
          throw TypeError(".NT.ServerHostItemBank.spells: array expected");
        message.spells = [];
        for (let i = 0; i < object.spells.length; ++i) {
          if (typeof object.spells[i] !== "object")
            throw TypeError(".NT.ServerHostItemBank.spells: object expected");
          message.spells[i] = $root.NT.Spell.fromObject(object.spells[i]);
        }
      }
      if (object.items) {
        if (!Array.isArray(object.items))
          throw TypeError(".NT.ServerHostItemBank.items: array expected");
        message.items = [];
        for (let i = 0; i < object.items.length; ++i) {
          if (typeof object.items[i] !== "object")
            throw TypeError(".NT.ServerHostItemBank.items: object expected");
          message.items[i] = $root.NT.Item.fromObject(object.items[i]);
        }
      }
      if (object.gold != null)
        message.gold = object.gold >>> 0;
      if (object.objects) {
        if (!Array.isArray(object.objects))
          throw TypeError(".NT.ServerHostItemBank.objects: array expected");
        message.objects = [];
        for (let i = 0; i < object.objects.length; ++i) {
          if (typeof object.objects[i] !== "object")
            throw TypeError(".NT.ServerHostItemBank.objects: object expected");
          message.objects[i] = $root.NT.EntityItem.fromObject(object.objects[i]);
        }
      }
      return message;
    };
    ServerHostItemBank.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults) {
        object.wands = [];
        object.spells = [];
        object.items = [];
        object.objects = [];
      }
      if (options.defaults)
        object.gold = 0;
      if (message.wands && message.wands.length) {
        object.wands = [];
        for (let j = 0; j < message.wands.length; ++j)
          object.wands[j] = $root.NT.Wand.toObject(message.wands[j], options);
      }
      if (message.spells && message.spells.length) {
        object.spells = [];
        for (let j = 0; j < message.spells.length; ++j)
          object.spells[j] = $root.NT.Spell.toObject(message.spells[j], options);
      }
      if (message.items && message.items.length) {
        object.items = [];
        for (let j = 0; j < message.items.length; ++j)
          object.items[j] = $root.NT.Item.toObject(message.items[j], options);
      }
      if (message.gold != null && message.hasOwnProperty("gold"))
        object.gold = message.gold;
      if (message.objects && message.objects.length) {
        object.objects = [];
        for (let j = 0; j < message.objects.length; ++j)
          object.objects[j] = $root.NT.EntityItem.toObject(message.objects[j], options);
      }
      return object;
    };
    ServerHostItemBank.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerHostItemBank.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerHostItemBank";
    };
    return ServerHostItemBank;
  }();
  NT3.ClientHostUserTake = function() {
    function ClientHostUserTake(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientHostUserTake.prototype.userId = "";
    ClientHostUserTake.prototype.id = "";
    ClientHostUserTake.prototype.success = false;
    ClientHostUserTake.create = function create(properties) {
      return new ClientHostUserTake(properties);
    };
    ClientHostUserTake.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.id);
      if (message.success != null && Object.hasOwnProperty.call(message, "success"))
        writer.uint32(
          /* id 3, wireType 0 =*/
          24
        ).bool(message.success);
      return writer;
    };
    ClientHostUserTake.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientHostUserTake.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientHostUserTake();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.id = reader.string();
            break;
          }
          case 3: {
            message.success = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientHostUserTake.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientHostUserTake.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      if (message.success != null && message.hasOwnProperty("success")) {
        if (typeof message.success !== "boolean")
          return "success: boolean expected";
      }
      return null;
    };
    ClientHostUserTake.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientHostUserTake)
        return object;
      let message = new $root.NT.ClientHostUserTake();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.id != null)
        message.id = String(object.id);
      if (object.success != null)
        message.success = Boolean(object.success);
      return message;
    };
    ClientHostUserTake.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.id = "";
        object.success = false;
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      if (message.success != null && message.hasOwnProperty("success"))
        object.success = message.success;
      return object;
    };
    ClientHostUserTake.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientHostUserTake.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientHostUserTake";
    };
    return ClientHostUserTake;
  }();
  NT3.ServerHostUserTake = function() {
    function ServerHostUserTake(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerHostUserTake.prototype.userId = "";
    ServerHostUserTake.prototype.id = "";
    ServerHostUserTake.prototype.success = false;
    ServerHostUserTake.create = function create(properties) {
      return new ServerHostUserTake(properties);
    };
    ServerHostUserTake.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.id);
      if (message.success != null && Object.hasOwnProperty.call(message, "success"))
        writer.uint32(
          /* id 3, wireType 0 =*/
          24
        ).bool(message.success);
      return writer;
    };
    ServerHostUserTake.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerHostUserTake.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerHostUserTake();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.id = reader.string();
            break;
          }
          case 3: {
            message.success = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerHostUserTake.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerHostUserTake.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      if (message.success != null && message.hasOwnProperty("success")) {
        if (typeof message.success !== "boolean")
          return "success: boolean expected";
      }
      return null;
    };
    ServerHostUserTake.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerHostUserTake)
        return object;
      let message = new $root.NT.ServerHostUserTake();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.id != null)
        message.id = String(object.id);
      if (object.success != null)
        message.success = Boolean(object.success);
      return message;
    };
    ServerHostUserTake.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.id = "";
        object.success = false;
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      if (message.success != null && message.hasOwnProperty("success"))
        object.success = message.success;
      return object;
    };
    ServerHostUserTake.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerHostUserTake.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerHostUserTake";
    };
    return ServerHostUserTake;
  }();
  NT3.ClientHostUserTakeGold = function() {
    function ClientHostUserTakeGold(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientHostUserTakeGold.prototype.userId = "";
    ClientHostUserTakeGold.prototype.amount = 0;
    ClientHostUserTakeGold.prototype.success = false;
    ClientHostUserTakeGold.create = function create(properties) {
      return new ClientHostUserTakeGold(properties);
    };
    ClientHostUserTakeGold.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.amount);
      if (message.success != null && Object.hasOwnProperty.call(message, "success"))
        writer.uint32(
          /* id 3, wireType 0 =*/
          24
        ).bool(message.success);
      return writer;
    };
    ClientHostUserTakeGold.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientHostUserTakeGold.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientHostUserTakeGold();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.amount = reader.uint32();
            break;
          }
          case 3: {
            message.success = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientHostUserTakeGold.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientHostUserTakeGold.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.amount != null && message.hasOwnProperty("amount")) {
        if (!$util.isInteger(message.amount))
          return "amount: integer expected";
      }
      if (message.success != null && message.hasOwnProperty("success")) {
        if (typeof message.success !== "boolean")
          return "success: boolean expected";
      }
      return null;
    };
    ClientHostUserTakeGold.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientHostUserTakeGold)
        return object;
      let message = new $root.NT.ClientHostUserTakeGold();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.amount != null)
        message.amount = object.amount >>> 0;
      if (object.success != null)
        message.success = Boolean(object.success);
      return message;
    };
    ClientHostUserTakeGold.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.amount = 0;
        object.success = false;
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.amount != null && message.hasOwnProperty("amount"))
        object.amount = message.amount;
      if (message.success != null && message.hasOwnProperty("success"))
        object.success = message.success;
      return object;
    };
    ClientHostUserTakeGold.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientHostUserTakeGold.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientHostUserTakeGold";
    };
    return ClientHostUserTakeGold;
  }();
  NT3.ServerHostUserTakeGold = function() {
    function ServerHostUserTakeGold(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerHostUserTakeGold.prototype.userId = "";
    ServerHostUserTakeGold.prototype.amount = 0;
    ServerHostUserTakeGold.prototype.success = false;
    ServerHostUserTakeGold.create = function create(properties) {
      return new ServerHostUserTakeGold(properties);
    };
    ServerHostUserTakeGold.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.amount);
      if (message.success != null && Object.hasOwnProperty.call(message, "success"))
        writer.uint32(
          /* id 3, wireType 0 =*/
          24
        ).bool(message.success);
      return writer;
    };
    ServerHostUserTakeGold.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerHostUserTakeGold.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerHostUserTakeGold();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.amount = reader.uint32();
            break;
          }
          case 3: {
            message.success = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerHostUserTakeGold.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerHostUserTakeGold.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.amount != null && message.hasOwnProperty("amount")) {
        if (!$util.isInteger(message.amount))
          return "amount: integer expected";
      }
      if (message.success != null && message.hasOwnProperty("success")) {
        if (typeof message.success !== "boolean")
          return "success: boolean expected";
      }
      return null;
    };
    ServerHostUserTakeGold.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerHostUserTakeGold)
        return object;
      let message = new $root.NT.ServerHostUserTakeGold();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.amount != null)
        message.amount = object.amount >>> 0;
      if (object.success != null)
        message.success = Boolean(object.success);
      return message;
    };
    ServerHostUserTakeGold.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.amount = 0;
        object.success = false;
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.amount != null && message.hasOwnProperty("amount"))
        object.amount = message.amount;
      if (message.success != null && message.hasOwnProperty("success"))
        object.success = message.success;
      return object;
    };
    ServerHostUserTakeGold.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerHostUserTakeGold.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerHostUserTakeGold";
    };
    return ServerHostUserTakeGold;
  }();
  NT3.ClientPlayerAddGold = function() {
    function ClientPlayerAddGold(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientPlayerAddGold.prototype.amount = 0;
    ClientPlayerAddGold.create = function create(properties) {
      return new ClientPlayerAddGold(properties);
    };
    ClientPlayerAddGold.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).uint32(message.amount);
      return writer;
    };
    ClientPlayerAddGold.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientPlayerAddGold.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerAddGold();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.amount = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientPlayerAddGold.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientPlayerAddGold.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.amount != null && message.hasOwnProperty("amount")) {
        if (!$util.isInteger(message.amount))
          return "amount: integer expected";
      }
      return null;
    };
    ClientPlayerAddGold.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientPlayerAddGold)
        return object;
      let message = new $root.NT.ClientPlayerAddGold();
      if (object.amount != null)
        message.amount = object.amount >>> 0;
      return message;
    };
    ClientPlayerAddGold.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.amount = 0;
      if (message.amount != null && message.hasOwnProperty("amount"))
        object.amount = message.amount;
      return object;
    };
    ClientPlayerAddGold.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientPlayerAddGold.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientPlayerAddGold";
    };
    return ClientPlayerAddGold;
  }();
  NT3.ServerPlayerAddGold = function() {
    function ServerPlayerAddGold(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerAddGold.prototype.userId = "";
    ServerPlayerAddGold.prototype.amount = 0;
    ServerPlayerAddGold.create = function create(properties) {
      return new ServerPlayerAddGold(properties);
    };
    ServerPlayerAddGold.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.amount);
      return writer;
    };
    ServerPlayerAddGold.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerAddGold.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerAddGold();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.amount = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerAddGold.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerAddGold.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.amount != null && message.hasOwnProperty("amount")) {
        if (!$util.isInteger(message.amount))
          return "amount: integer expected";
      }
      return null;
    };
    ServerPlayerAddGold.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerAddGold)
        return object;
      let message = new $root.NT.ServerPlayerAddGold();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.amount != null)
        message.amount = object.amount >>> 0;
      return message;
    };
    ServerPlayerAddGold.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.amount = 0;
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.amount != null && message.hasOwnProperty("amount"))
        object.amount = message.amount;
      return object;
    };
    ServerPlayerAddGold.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerAddGold.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerAddGold";
    };
    return ServerPlayerAddGold;
  }();
  NT3.ClientPlayerTakeGold = function() {
    function ClientPlayerTakeGold(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientPlayerTakeGold.prototype.amount = 0;
    ClientPlayerTakeGold.create = function create(properties) {
      return new ClientPlayerTakeGold(properties);
    };
    ClientPlayerTakeGold.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).uint32(message.amount);
      return writer;
    };
    ClientPlayerTakeGold.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientPlayerTakeGold.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerTakeGold();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.amount = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientPlayerTakeGold.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientPlayerTakeGold.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.amount != null && message.hasOwnProperty("amount")) {
        if (!$util.isInteger(message.amount))
          return "amount: integer expected";
      }
      return null;
    };
    ClientPlayerTakeGold.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientPlayerTakeGold)
        return object;
      let message = new $root.NT.ClientPlayerTakeGold();
      if (object.amount != null)
        message.amount = object.amount >>> 0;
      return message;
    };
    ClientPlayerTakeGold.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.amount = 0;
      if (message.amount != null && message.hasOwnProperty("amount"))
        object.amount = message.amount;
      return object;
    };
    ClientPlayerTakeGold.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientPlayerTakeGold.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientPlayerTakeGold";
    };
    return ClientPlayerTakeGold;
  }();
  NT3.ServerPlayerTakeGold = function() {
    function ServerPlayerTakeGold(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerTakeGold.prototype.userId = "";
    ServerPlayerTakeGold.prototype.amount = 0;
    ServerPlayerTakeGold.create = function create(properties) {
      return new ServerPlayerTakeGold(properties);
    };
    ServerPlayerTakeGold.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.amount);
      return writer;
    };
    ServerPlayerTakeGold.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerTakeGold.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerTakeGold();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.amount = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerTakeGold.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerTakeGold.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.amount != null && message.hasOwnProperty("amount")) {
        if (!$util.isInteger(message.amount))
          return "amount: integer expected";
      }
      return null;
    };
    ServerPlayerTakeGold.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerTakeGold)
        return object;
      let message = new $root.NT.ServerPlayerTakeGold();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.amount != null)
        message.amount = object.amount >>> 0;
      return message;
    };
    ServerPlayerTakeGold.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.amount = 0;
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.amount != null && message.hasOwnProperty("amount"))
        object.amount = message.amount;
      return object;
    };
    ServerPlayerTakeGold.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerTakeGold.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerTakeGold";
    };
    return ServerPlayerTakeGold;
  }();
  NT3.ClientPlayerAddItem = function() {
    function ClientPlayerAddItem(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientPlayerAddItem.prototype.spells = null;
    ClientPlayerAddItem.prototype.wands = null;
    ClientPlayerAddItem.prototype.flasks = null;
    ClientPlayerAddItem.prototype.objects = null;
    let $oneOfFields;
    Object.defineProperty(ClientPlayerAddItem.prototype, "item", {
      get: $util.oneOfGetter($oneOfFields = ["spells", "wands", "flasks", "objects"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ClientPlayerAddItem.create = function create(properties) {
      return new ClientPlayerAddItem(properties);
    };
    ClientPlayerAddItem.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.spells != null && Object.hasOwnProperty.call(message, "spells"))
        $root.NT.ClientPlayerAddItem.Spells.encode(message.spells, writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).fork()).ldelim();
      if (message.wands != null && Object.hasOwnProperty.call(message, "wands"))
        $root.NT.ClientPlayerAddItem.Wands.encode(message.wands, writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).fork()).ldelim();
      if (message.flasks != null && Object.hasOwnProperty.call(message, "flasks"))
        $root.NT.ClientPlayerAddItem.Items.encode(message.flasks, writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).fork()).ldelim();
      if (message.objects != null && Object.hasOwnProperty.call(message, "objects"))
        $root.NT.ClientPlayerAddItem.Entities.encode(message.objects, writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).fork()).ldelim();
      return writer;
    };
    ClientPlayerAddItem.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientPlayerAddItem.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerAddItem();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.spells = $root.NT.ClientPlayerAddItem.Spells.decode(reader, reader.uint32());
            break;
          }
          case 2: {
            message.wands = $root.NT.ClientPlayerAddItem.Wands.decode(reader, reader.uint32());
            break;
          }
          case 3: {
            message.flasks = $root.NT.ClientPlayerAddItem.Items.decode(reader, reader.uint32());
            break;
          }
          case 4: {
            message.objects = $root.NT.ClientPlayerAddItem.Entities.decode(reader, reader.uint32());
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientPlayerAddItem.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientPlayerAddItem.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.spells != null && message.hasOwnProperty("spells")) {
        properties.item = 1;
        {
          let error = $root.NT.ClientPlayerAddItem.Spells.verify(message.spells);
          if (error)
            return "spells." + error;
        }
      }
      if (message.wands != null && message.hasOwnProperty("wands")) {
        if (properties.item === 1)
          return "item: multiple values";
        properties.item = 1;
        {
          let error = $root.NT.ClientPlayerAddItem.Wands.verify(message.wands);
          if (error)
            return "wands." + error;
        }
      }
      if (message.flasks != null && message.hasOwnProperty("flasks")) {
        if (properties.item === 1)
          return "item: multiple values";
        properties.item = 1;
        {
          let error = $root.NT.ClientPlayerAddItem.Items.verify(message.flasks);
          if (error)
            return "flasks." + error;
        }
      }
      if (message.objects != null && message.hasOwnProperty("objects")) {
        if (properties.item === 1)
          return "item: multiple values";
        properties.item = 1;
        {
          let error = $root.NT.ClientPlayerAddItem.Entities.verify(message.objects);
          if (error)
            return "objects." + error;
        }
      }
      return null;
    };
    ClientPlayerAddItem.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientPlayerAddItem)
        return object;
      let message = new $root.NT.ClientPlayerAddItem();
      if (object.spells != null) {
        if (typeof object.spells !== "object")
          throw TypeError(".NT.ClientPlayerAddItem.spells: object expected");
        message.spells = $root.NT.ClientPlayerAddItem.Spells.fromObject(object.spells);
      }
      if (object.wands != null) {
        if (typeof object.wands !== "object")
          throw TypeError(".NT.ClientPlayerAddItem.wands: object expected");
        message.wands = $root.NT.ClientPlayerAddItem.Wands.fromObject(object.wands);
      }
      if (object.flasks != null) {
        if (typeof object.flasks !== "object")
          throw TypeError(".NT.ClientPlayerAddItem.flasks: object expected");
        message.flasks = $root.NT.ClientPlayerAddItem.Items.fromObject(object.flasks);
      }
      if (object.objects != null) {
        if (typeof object.objects !== "object")
          throw TypeError(".NT.ClientPlayerAddItem.objects: object expected");
        message.objects = $root.NT.ClientPlayerAddItem.Entities.fromObject(object.objects);
      }
      return message;
    };
    ClientPlayerAddItem.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (message.spells != null && message.hasOwnProperty("spells")) {
        object.spells = $root.NT.ClientPlayerAddItem.Spells.toObject(message.spells, options);
        if (options.oneofs)
          object.item = "spells";
      }
      if (message.wands != null && message.hasOwnProperty("wands")) {
        object.wands = $root.NT.ClientPlayerAddItem.Wands.toObject(message.wands, options);
        if (options.oneofs)
          object.item = "wands";
      }
      if (message.flasks != null && message.hasOwnProperty("flasks")) {
        object.flasks = $root.NT.ClientPlayerAddItem.Items.toObject(message.flasks, options);
        if (options.oneofs)
          object.item = "flasks";
      }
      if (message.objects != null && message.hasOwnProperty("objects")) {
        object.objects = $root.NT.ClientPlayerAddItem.Entities.toObject(message.objects, options);
        if (options.oneofs)
          object.item = "objects";
      }
      return object;
    };
    ClientPlayerAddItem.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientPlayerAddItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientPlayerAddItem";
    };
    ClientPlayerAddItem.Spells = function() {
      function Spells(properties) {
        this.list = [];
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Spells.prototype.list = $util.emptyArray;
      Spells.create = function create(properties) {
        return new Spells(properties);
      };
      Spells.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.list != null && message.list.length)
          for (let i = 0; i < message.list.length; ++i)
            $root.NT.Spell.encode(message.list[i], writer.uint32(
              /* id 1, wireType 2 =*/
              10
            ).fork()).ldelim();
        return writer;
      };
      Spells.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Spells.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerAddItem.Spells();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              if (!(message.list && message.list.length))
                message.list = [];
              message.list.push($root.NT.Spell.decode(reader, reader.uint32()));
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Spells.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Spells.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.list != null && message.hasOwnProperty("list")) {
          if (!Array.isArray(message.list))
            return "list: array expected";
          for (let i = 0; i < message.list.length; ++i) {
            let error = $root.NT.Spell.verify(message.list[i]);
            if (error)
              return "list." + error;
          }
        }
        return null;
      };
      Spells.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ClientPlayerAddItem.Spells)
          return object;
        let message = new $root.NT.ClientPlayerAddItem.Spells();
        if (object.list) {
          if (!Array.isArray(object.list))
            throw TypeError(".NT.ClientPlayerAddItem.Spells.list: array expected");
          message.list = [];
          for (let i = 0; i < object.list.length; ++i) {
            if (typeof object.list[i] !== "object")
              throw TypeError(".NT.ClientPlayerAddItem.Spells.list: object expected");
            message.list[i] = $root.NT.Spell.fromObject(object.list[i]);
          }
        }
        return message;
      };
      Spells.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.arrays || options.defaults)
          object.list = [];
        if (message.list && message.list.length) {
          object.list = [];
          for (let j = 0; j < message.list.length; ++j)
            object.list[j] = $root.NT.Spell.toObject(message.list[j], options);
        }
        return object;
      };
      Spells.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Spells.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ClientPlayerAddItem.Spells";
      };
      return Spells;
    }();
    ClientPlayerAddItem.Wands = function() {
      function Wands(properties) {
        this.list = [];
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Wands.prototype.list = $util.emptyArray;
      Wands.create = function create(properties) {
        return new Wands(properties);
      };
      Wands.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.list != null && message.list.length)
          for (let i = 0; i < message.list.length; ++i)
            $root.NT.Wand.encode(message.list[i], writer.uint32(
              /* id 1, wireType 2 =*/
              10
            ).fork()).ldelim();
        return writer;
      };
      Wands.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Wands.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerAddItem.Wands();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              if (!(message.list && message.list.length))
                message.list = [];
              message.list.push($root.NT.Wand.decode(reader, reader.uint32()));
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Wands.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Wands.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.list != null && message.hasOwnProperty("list")) {
          if (!Array.isArray(message.list))
            return "list: array expected";
          for (let i = 0; i < message.list.length; ++i) {
            let error = $root.NT.Wand.verify(message.list[i]);
            if (error)
              return "list." + error;
          }
        }
        return null;
      };
      Wands.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ClientPlayerAddItem.Wands)
          return object;
        let message = new $root.NT.ClientPlayerAddItem.Wands();
        if (object.list) {
          if (!Array.isArray(object.list))
            throw TypeError(".NT.ClientPlayerAddItem.Wands.list: array expected");
          message.list = [];
          for (let i = 0; i < object.list.length; ++i) {
            if (typeof object.list[i] !== "object")
              throw TypeError(".NT.ClientPlayerAddItem.Wands.list: object expected");
            message.list[i] = $root.NT.Wand.fromObject(object.list[i]);
          }
        }
        return message;
      };
      Wands.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.arrays || options.defaults)
          object.list = [];
        if (message.list && message.list.length) {
          object.list = [];
          for (let j = 0; j < message.list.length; ++j)
            object.list[j] = $root.NT.Wand.toObject(message.list[j], options);
        }
        return object;
      };
      Wands.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Wands.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ClientPlayerAddItem.Wands";
      };
      return Wands;
    }();
    ClientPlayerAddItem.Items = function() {
      function Items(properties) {
        this.list = [];
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Items.prototype.list = $util.emptyArray;
      Items.create = function create(properties) {
        return new Items(properties);
      };
      Items.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.list != null && message.list.length)
          for (let i = 0; i < message.list.length; ++i)
            $root.NT.Item.encode(message.list[i], writer.uint32(
              /* id 1, wireType 2 =*/
              10
            ).fork()).ldelim();
        return writer;
      };
      Items.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Items.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerAddItem.Items();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              if (!(message.list && message.list.length))
                message.list = [];
              message.list.push($root.NT.Item.decode(reader, reader.uint32()));
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Items.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Items.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.list != null && message.hasOwnProperty("list")) {
          if (!Array.isArray(message.list))
            return "list: array expected";
          for (let i = 0; i < message.list.length; ++i) {
            let error = $root.NT.Item.verify(message.list[i]);
            if (error)
              return "list." + error;
          }
        }
        return null;
      };
      Items.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ClientPlayerAddItem.Items)
          return object;
        let message = new $root.NT.ClientPlayerAddItem.Items();
        if (object.list) {
          if (!Array.isArray(object.list))
            throw TypeError(".NT.ClientPlayerAddItem.Items.list: array expected");
          message.list = [];
          for (let i = 0; i < object.list.length; ++i) {
            if (typeof object.list[i] !== "object")
              throw TypeError(".NT.ClientPlayerAddItem.Items.list: object expected");
            message.list[i] = $root.NT.Item.fromObject(object.list[i]);
          }
        }
        return message;
      };
      Items.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.arrays || options.defaults)
          object.list = [];
        if (message.list && message.list.length) {
          object.list = [];
          for (let j = 0; j < message.list.length; ++j)
            object.list[j] = $root.NT.Item.toObject(message.list[j], options);
        }
        return object;
      };
      Items.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Items.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ClientPlayerAddItem.Items";
      };
      return Items;
    }();
    ClientPlayerAddItem.Entities = function() {
      function Entities(properties) {
        this.list = [];
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Entities.prototype.list = $util.emptyArray;
      Entities.create = function create(properties) {
        return new Entities(properties);
      };
      Entities.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.list != null && message.list.length)
          for (let i = 0; i < message.list.length; ++i)
            $root.NT.EntityItem.encode(message.list[i], writer.uint32(
              /* id 1, wireType 2 =*/
              10
            ).fork()).ldelim();
        return writer;
      };
      Entities.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Entities.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerAddItem.Entities();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              if (!(message.list && message.list.length))
                message.list = [];
              message.list.push($root.NT.EntityItem.decode(reader, reader.uint32()));
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Entities.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Entities.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.list != null && message.hasOwnProperty("list")) {
          if (!Array.isArray(message.list))
            return "list: array expected";
          for (let i = 0; i < message.list.length; ++i) {
            let error = $root.NT.EntityItem.verify(message.list[i]);
            if (error)
              return "list." + error;
          }
        }
        return null;
      };
      Entities.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ClientPlayerAddItem.Entities)
          return object;
        let message = new $root.NT.ClientPlayerAddItem.Entities();
        if (object.list) {
          if (!Array.isArray(object.list))
            throw TypeError(".NT.ClientPlayerAddItem.Entities.list: array expected");
          message.list = [];
          for (let i = 0; i < object.list.length; ++i) {
            if (typeof object.list[i] !== "object")
              throw TypeError(".NT.ClientPlayerAddItem.Entities.list: object expected");
            message.list[i] = $root.NT.EntityItem.fromObject(object.list[i]);
          }
        }
        return message;
      };
      Entities.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.arrays || options.defaults)
          object.list = [];
        if (message.list && message.list.length) {
          object.list = [];
          for (let j = 0; j < message.list.length; ++j)
            object.list[j] = $root.NT.EntityItem.toObject(message.list[j], options);
        }
        return object;
      };
      Entities.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Entities.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ClientPlayerAddItem.Entities";
      };
      return Entities;
    }();
    return ClientPlayerAddItem;
  }();
  NT3.ServerPlayerAddItem = function() {
    function ServerPlayerAddItem(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerAddItem.prototype.userId = "";
    ServerPlayerAddItem.prototype.spells = null;
    ServerPlayerAddItem.prototype.wands = null;
    ServerPlayerAddItem.prototype.flasks = null;
    ServerPlayerAddItem.prototype.objects = null;
    let $oneOfFields;
    Object.defineProperty(ServerPlayerAddItem.prototype, "item", {
      get: $util.oneOfGetter($oneOfFields = ["spells", "wands", "flasks", "objects"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ServerPlayerAddItem.create = function create(properties) {
      return new ServerPlayerAddItem(properties);
    };
    ServerPlayerAddItem.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.spells != null && Object.hasOwnProperty.call(message, "spells"))
        $root.NT.ServerPlayerAddItem.Spells.encode(message.spells, writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).fork()).ldelim();
      if (message.wands != null && Object.hasOwnProperty.call(message, "wands"))
        $root.NT.ServerPlayerAddItem.Wands.encode(message.wands, writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).fork()).ldelim();
      if (message.flasks != null && Object.hasOwnProperty.call(message, "flasks"))
        $root.NT.ServerPlayerAddItem.Items.encode(message.flasks, writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).fork()).ldelim();
      if (message.objects != null && Object.hasOwnProperty.call(message, "objects"))
        $root.NT.ServerPlayerAddItem.Entities.encode(message.objects, writer.uint32(
          /* id 5, wireType 2 =*/
          42
        ).fork()).ldelim();
      return writer;
    };
    ServerPlayerAddItem.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerAddItem.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerAddItem();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.spells = $root.NT.ServerPlayerAddItem.Spells.decode(reader, reader.uint32());
            break;
          }
          case 3: {
            message.wands = $root.NT.ServerPlayerAddItem.Wands.decode(reader, reader.uint32());
            break;
          }
          case 4: {
            message.flasks = $root.NT.ServerPlayerAddItem.Items.decode(reader, reader.uint32());
            break;
          }
          case 5: {
            message.objects = $root.NT.ServerPlayerAddItem.Entities.decode(reader, reader.uint32());
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerAddItem.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerAddItem.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.spells != null && message.hasOwnProperty("spells")) {
        properties.item = 1;
        {
          let error = $root.NT.ServerPlayerAddItem.Spells.verify(message.spells);
          if (error)
            return "spells." + error;
        }
      }
      if (message.wands != null && message.hasOwnProperty("wands")) {
        if (properties.item === 1)
          return "item: multiple values";
        properties.item = 1;
        {
          let error = $root.NT.ServerPlayerAddItem.Wands.verify(message.wands);
          if (error)
            return "wands." + error;
        }
      }
      if (message.flasks != null && message.hasOwnProperty("flasks")) {
        if (properties.item === 1)
          return "item: multiple values";
        properties.item = 1;
        {
          let error = $root.NT.ServerPlayerAddItem.Items.verify(message.flasks);
          if (error)
            return "flasks." + error;
        }
      }
      if (message.objects != null && message.hasOwnProperty("objects")) {
        if (properties.item === 1)
          return "item: multiple values";
        properties.item = 1;
        {
          let error = $root.NT.ServerPlayerAddItem.Entities.verify(message.objects);
          if (error)
            return "objects." + error;
        }
      }
      return null;
    };
    ServerPlayerAddItem.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerAddItem)
        return object;
      let message = new $root.NT.ServerPlayerAddItem();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.spells != null) {
        if (typeof object.spells !== "object")
          throw TypeError(".NT.ServerPlayerAddItem.spells: object expected");
        message.spells = $root.NT.ServerPlayerAddItem.Spells.fromObject(object.spells);
      }
      if (object.wands != null) {
        if (typeof object.wands !== "object")
          throw TypeError(".NT.ServerPlayerAddItem.wands: object expected");
        message.wands = $root.NT.ServerPlayerAddItem.Wands.fromObject(object.wands);
      }
      if (object.flasks != null) {
        if (typeof object.flasks !== "object")
          throw TypeError(".NT.ServerPlayerAddItem.flasks: object expected");
        message.flasks = $root.NT.ServerPlayerAddItem.Items.fromObject(object.flasks);
      }
      if (object.objects != null) {
        if (typeof object.objects !== "object")
          throw TypeError(".NT.ServerPlayerAddItem.objects: object expected");
        message.objects = $root.NT.ServerPlayerAddItem.Entities.fromObject(object.objects);
      }
      return message;
    };
    ServerPlayerAddItem.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.spells != null && message.hasOwnProperty("spells")) {
        object.spells = $root.NT.ServerPlayerAddItem.Spells.toObject(message.spells, options);
        if (options.oneofs)
          object.item = "spells";
      }
      if (message.wands != null && message.hasOwnProperty("wands")) {
        object.wands = $root.NT.ServerPlayerAddItem.Wands.toObject(message.wands, options);
        if (options.oneofs)
          object.item = "wands";
      }
      if (message.flasks != null && message.hasOwnProperty("flasks")) {
        object.flasks = $root.NT.ServerPlayerAddItem.Items.toObject(message.flasks, options);
        if (options.oneofs)
          object.item = "flasks";
      }
      if (message.objects != null && message.hasOwnProperty("objects")) {
        object.objects = $root.NT.ServerPlayerAddItem.Entities.toObject(message.objects, options);
        if (options.oneofs)
          object.item = "objects";
      }
      return object;
    };
    ServerPlayerAddItem.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerAddItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerAddItem";
    };
    ServerPlayerAddItem.Spells = function() {
      function Spells(properties) {
        this.list = [];
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Spells.prototype.list = $util.emptyArray;
      Spells.create = function create(properties) {
        return new Spells(properties);
      };
      Spells.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.list != null && message.list.length)
          for (let i = 0; i < message.list.length; ++i)
            $root.NT.Spell.encode(message.list[i], writer.uint32(
              /* id 1, wireType 2 =*/
              10
            ).fork()).ldelim();
        return writer;
      };
      Spells.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Spells.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerAddItem.Spells();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              if (!(message.list && message.list.length))
                message.list = [];
              message.list.push($root.NT.Spell.decode(reader, reader.uint32()));
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Spells.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Spells.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.list != null && message.hasOwnProperty("list")) {
          if (!Array.isArray(message.list))
            return "list: array expected";
          for (let i = 0; i < message.list.length; ++i) {
            let error = $root.NT.Spell.verify(message.list[i]);
            if (error)
              return "list." + error;
          }
        }
        return null;
      };
      Spells.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerPlayerAddItem.Spells)
          return object;
        let message = new $root.NT.ServerPlayerAddItem.Spells();
        if (object.list) {
          if (!Array.isArray(object.list))
            throw TypeError(".NT.ServerPlayerAddItem.Spells.list: array expected");
          message.list = [];
          for (let i = 0; i < object.list.length; ++i) {
            if (typeof object.list[i] !== "object")
              throw TypeError(".NT.ServerPlayerAddItem.Spells.list: object expected");
            message.list[i] = $root.NT.Spell.fromObject(object.list[i]);
          }
        }
        return message;
      };
      Spells.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.arrays || options.defaults)
          object.list = [];
        if (message.list && message.list.length) {
          object.list = [];
          for (let j = 0; j < message.list.length; ++j)
            object.list[j] = $root.NT.Spell.toObject(message.list[j], options);
        }
        return object;
      };
      Spells.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Spells.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerPlayerAddItem.Spells";
      };
      return Spells;
    }();
    ServerPlayerAddItem.Wands = function() {
      function Wands(properties) {
        this.list = [];
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Wands.prototype.list = $util.emptyArray;
      Wands.create = function create(properties) {
        return new Wands(properties);
      };
      Wands.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.list != null && message.list.length)
          for (let i = 0; i < message.list.length; ++i)
            $root.NT.Wand.encode(message.list[i], writer.uint32(
              /* id 2, wireType 2 =*/
              18
            ).fork()).ldelim();
        return writer;
      };
      Wands.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Wands.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerAddItem.Wands();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 2: {
              if (!(message.list && message.list.length))
                message.list = [];
              message.list.push($root.NT.Wand.decode(reader, reader.uint32()));
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Wands.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Wands.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.list != null && message.hasOwnProperty("list")) {
          if (!Array.isArray(message.list))
            return "list: array expected";
          for (let i = 0; i < message.list.length; ++i) {
            let error = $root.NT.Wand.verify(message.list[i]);
            if (error)
              return "list." + error;
          }
        }
        return null;
      };
      Wands.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerPlayerAddItem.Wands)
          return object;
        let message = new $root.NT.ServerPlayerAddItem.Wands();
        if (object.list) {
          if (!Array.isArray(object.list))
            throw TypeError(".NT.ServerPlayerAddItem.Wands.list: array expected");
          message.list = [];
          for (let i = 0; i < object.list.length; ++i) {
            if (typeof object.list[i] !== "object")
              throw TypeError(".NT.ServerPlayerAddItem.Wands.list: object expected");
            message.list[i] = $root.NT.Wand.fromObject(object.list[i]);
          }
        }
        return message;
      };
      Wands.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.arrays || options.defaults)
          object.list = [];
        if (message.list && message.list.length) {
          object.list = [];
          for (let j = 0; j < message.list.length; ++j)
            object.list[j] = $root.NT.Wand.toObject(message.list[j], options);
        }
        return object;
      };
      Wands.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Wands.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerPlayerAddItem.Wands";
      };
      return Wands;
    }();
    ServerPlayerAddItem.Items = function() {
      function Items(properties) {
        this.list = [];
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Items.prototype.list = $util.emptyArray;
      Items.create = function create(properties) {
        return new Items(properties);
      };
      Items.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.list != null && message.list.length)
          for (let i = 0; i < message.list.length; ++i)
            $root.NT.Item.encode(message.list[i], writer.uint32(
              /* id 3, wireType 2 =*/
              26
            ).fork()).ldelim();
        return writer;
      };
      Items.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Items.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerAddItem.Items();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 3: {
              if (!(message.list && message.list.length))
                message.list = [];
              message.list.push($root.NT.Item.decode(reader, reader.uint32()));
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Items.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Items.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.list != null && message.hasOwnProperty("list")) {
          if (!Array.isArray(message.list))
            return "list: array expected";
          for (let i = 0; i < message.list.length; ++i) {
            let error = $root.NT.Item.verify(message.list[i]);
            if (error)
              return "list." + error;
          }
        }
        return null;
      };
      Items.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerPlayerAddItem.Items)
          return object;
        let message = new $root.NT.ServerPlayerAddItem.Items();
        if (object.list) {
          if (!Array.isArray(object.list))
            throw TypeError(".NT.ServerPlayerAddItem.Items.list: array expected");
          message.list = [];
          for (let i = 0; i < object.list.length; ++i) {
            if (typeof object.list[i] !== "object")
              throw TypeError(".NT.ServerPlayerAddItem.Items.list: object expected");
            message.list[i] = $root.NT.Item.fromObject(object.list[i]);
          }
        }
        return message;
      };
      Items.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.arrays || options.defaults)
          object.list = [];
        if (message.list && message.list.length) {
          object.list = [];
          for (let j = 0; j < message.list.length; ++j)
            object.list[j] = $root.NT.Item.toObject(message.list[j], options);
        }
        return object;
      };
      Items.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Items.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerPlayerAddItem.Items";
      };
      return Items;
    }();
    ServerPlayerAddItem.Entities = function() {
      function Entities(properties) {
        this.list = [];
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Entities.prototype.list = $util.emptyArray;
      Entities.create = function create(properties) {
        return new Entities(properties);
      };
      Entities.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.list != null && message.list.length)
          for (let i = 0; i < message.list.length; ++i)
            $root.NT.EntityItem.encode(message.list[i], writer.uint32(
              /* id 4, wireType 2 =*/
              34
            ).fork()).ldelim();
        return writer;
      };
      Entities.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Entities.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerAddItem.Entities();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 4: {
              if (!(message.list && message.list.length))
                message.list = [];
              message.list.push($root.NT.EntityItem.decode(reader, reader.uint32()));
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Entities.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Entities.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.list != null && message.hasOwnProperty("list")) {
          if (!Array.isArray(message.list))
            return "list: array expected";
          for (let i = 0; i < message.list.length; ++i) {
            let error = $root.NT.EntityItem.verify(message.list[i]);
            if (error)
              return "list." + error;
          }
        }
        return null;
      };
      Entities.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerPlayerAddItem.Entities)
          return object;
        let message = new $root.NT.ServerPlayerAddItem.Entities();
        if (object.list) {
          if (!Array.isArray(object.list))
            throw TypeError(".NT.ServerPlayerAddItem.Entities.list: array expected");
          message.list = [];
          for (let i = 0; i < object.list.length; ++i) {
            if (typeof object.list[i] !== "object")
              throw TypeError(".NT.ServerPlayerAddItem.Entities.list: object expected");
            message.list[i] = $root.NT.EntityItem.fromObject(object.list[i]);
          }
        }
        return message;
      };
      Entities.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.arrays || options.defaults)
          object.list = [];
        if (message.list && message.list.length) {
          object.list = [];
          for (let j = 0; j < message.list.length; ++j)
            object.list[j] = $root.NT.EntityItem.toObject(message.list[j], options);
        }
        return object;
      };
      Entities.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Entities.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerPlayerAddItem.Entities";
      };
      return Entities;
    }();
    return ServerPlayerAddItem;
  }();
  NT3.ClientPlayerTakeItem = function() {
    function ClientPlayerTakeItem(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientPlayerTakeItem.prototype.id = "";
    ClientPlayerTakeItem.create = function create(properties) {
      return new ClientPlayerTakeItem(properties);
    };
    ClientPlayerTakeItem.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      return writer;
    };
    ClientPlayerTakeItem.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientPlayerTakeItem.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerTakeItem();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientPlayerTakeItem.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientPlayerTakeItem.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      return null;
    };
    ClientPlayerTakeItem.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientPlayerTakeItem)
        return object;
      let message = new $root.NT.ClientPlayerTakeItem();
      if (object.id != null)
        message.id = String(object.id);
      return message;
    };
    ClientPlayerTakeItem.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.id = "";
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      return object;
    };
    ClientPlayerTakeItem.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientPlayerTakeItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientPlayerTakeItem";
    };
    return ClientPlayerTakeItem;
  }();
  NT3.ServerPlayerTakeItem = function() {
    function ServerPlayerTakeItem(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerTakeItem.prototype.userId = "";
    ServerPlayerTakeItem.prototype.id = "";
    ServerPlayerTakeItem.create = function create(properties) {
      return new ServerPlayerTakeItem(properties);
    };
    ServerPlayerTakeItem.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.id);
      return writer;
    };
    ServerPlayerTakeItem.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerTakeItem.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerTakeItem();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.id = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerTakeItem.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerTakeItem.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      return null;
    };
    ServerPlayerTakeItem.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerTakeItem)
        return object;
      let message = new $root.NT.ServerPlayerTakeItem();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.id != null)
        message.id = String(object.id);
      return message;
    };
    ServerPlayerTakeItem.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.id = "";
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      return object;
    };
    ServerPlayerTakeItem.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerTakeItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerTakeItem";
    };
    return ServerPlayerTakeItem;
  }();
  NT3.ClientChat = function() {
    function ClientChat(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientChat.prototype.message = "";
    ClientChat.create = function create(properties) {
      return new ClientChat(properties);
    };
    ClientChat.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.message != null && Object.hasOwnProperty.call(message, "message"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.message);
      return writer;
    };
    ClientChat.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientChat.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientChat();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.message = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientChat.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientChat.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.message != null && message.hasOwnProperty("message")) {
        if (!$util.isString(message.message))
          return "message: string expected";
      }
      return null;
    };
    ClientChat.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientChat)
        return object;
      let message = new $root.NT.ClientChat();
      if (object.message != null)
        message.message = String(object.message);
      return message;
    };
    ClientChat.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.message = "";
      if (message.message != null && message.hasOwnProperty("message"))
        object.message = message.message;
      return object;
    };
    ClientChat.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientChat.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientChat";
    };
    return ClientChat;
  }();
  NT3.ServerChat = function() {
    function ServerChat(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerChat.prototype.id = "";
    ServerChat.prototype.userId = "";
    ServerChat.prototype.name = "";
    ServerChat.prototype.message = "";
    ServerChat.create = function create(properties) {
      return new ServerChat(properties);
    };
    ServerChat.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.userId);
      if (message.name != null && Object.hasOwnProperty.call(message, "name"))
        writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).string(message.name);
      if (message.message != null && Object.hasOwnProperty.call(message, "message"))
        writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).string(message.message);
      return writer;
    };
    ServerChat.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerChat.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerChat();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          case 2: {
            message.userId = reader.string();
            break;
          }
          case 3: {
            message.name = reader.string();
            break;
          }
          case 4: {
            message.message = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerChat.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerChat.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.name != null && message.hasOwnProperty("name")) {
        if (!$util.isString(message.name))
          return "name: string expected";
      }
      if (message.message != null && message.hasOwnProperty("message")) {
        if (!$util.isString(message.message))
          return "message: string expected";
      }
      return null;
    };
    ServerChat.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerChat)
        return object;
      let message = new $root.NT.ServerChat();
      if (object.id != null)
        message.id = String(object.id);
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.name != null)
        message.name = String(object.name);
      if (object.message != null)
        message.message = String(object.message);
      return message;
    };
    ServerChat.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.id = "";
        object.userId = "";
        object.name = "";
        object.message = "";
      }
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.name != null && message.hasOwnProperty("name"))
        object.name = message.name;
      if (message.message != null && message.hasOwnProperty("message"))
        object.message = message.message;
      return object;
    };
    ServerChat.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerChat.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerChat";
    };
    return ServerChat;
  }();
  NT3.ServerStatsUpdate = function() {
    function ServerStatsUpdate(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerStatsUpdate.prototype.data = "";
    ServerStatsUpdate.create = function create(properties) {
      return new ServerStatsUpdate(properties);
    };
    ServerStatsUpdate.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.data != null && Object.hasOwnProperty.call(message, "data"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.data);
      return writer;
    };
    ServerStatsUpdate.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerStatsUpdate.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerStatsUpdate();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.data = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerStatsUpdate.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerStatsUpdate.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.data != null && message.hasOwnProperty("data")) {
        if (!$util.isString(message.data))
          return "data: string expected";
      }
      return null;
    };
    ServerStatsUpdate.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerStatsUpdate)
        return object;
      let message = new $root.NT.ServerStatsUpdate();
      if (object.data != null)
        message.data = String(object.data);
      return message;
    };
    ServerStatsUpdate.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.data = "";
      if (message.data != null && message.hasOwnProperty("data"))
        object.data = message.data;
      return object;
    };
    ServerStatsUpdate.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerStatsUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerStatsUpdate";
    };
    return ServerStatsUpdate;
  }();
  NT3.ClientPlayerPickup = function() {
    function ClientPlayerPickup(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientPlayerPickup.prototype.heart = null;
    ClientPlayerPickup.prototype.orb = null;
    let $oneOfFields;
    Object.defineProperty(ClientPlayerPickup.prototype, "kind", {
      get: $util.oneOfGetter($oneOfFields = ["heart", "orb"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ClientPlayerPickup.create = function create(properties) {
      return new ClientPlayerPickup(properties);
    };
    ClientPlayerPickup.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.heart != null && Object.hasOwnProperty.call(message, "heart"))
        $root.NT.ClientPlayerPickup.HeartPickup.encode(message.heart, writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).fork()).ldelim();
      if (message.orb != null && Object.hasOwnProperty.call(message, "orb"))
        $root.NT.ClientPlayerPickup.OrbPickup.encode(message.orb, writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).fork()).ldelim();
      return writer;
    };
    ClientPlayerPickup.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientPlayerPickup.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerPickup();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.heart = $root.NT.ClientPlayerPickup.HeartPickup.decode(reader, reader.uint32());
            break;
          }
          case 2: {
            message.orb = $root.NT.ClientPlayerPickup.OrbPickup.decode(reader, reader.uint32());
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientPlayerPickup.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientPlayerPickup.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.heart != null && message.hasOwnProperty("heart")) {
        properties.kind = 1;
        {
          let error = $root.NT.ClientPlayerPickup.HeartPickup.verify(message.heart);
          if (error)
            return "heart." + error;
        }
      }
      if (message.orb != null && message.hasOwnProperty("orb")) {
        if (properties.kind === 1)
          return "kind: multiple values";
        properties.kind = 1;
        {
          let error = $root.NT.ClientPlayerPickup.OrbPickup.verify(message.orb);
          if (error)
            return "orb." + error;
        }
      }
      return null;
    };
    ClientPlayerPickup.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientPlayerPickup)
        return object;
      let message = new $root.NT.ClientPlayerPickup();
      if (object.heart != null) {
        if (typeof object.heart !== "object")
          throw TypeError(".NT.ClientPlayerPickup.heart: object expected");
        message.heart = $root.NT.ClientPlayerPickup.HeartPickup.fromObject(object.heart);
      }
      if (object.orb != null) {
        if (typeof object.orb !== "object")
          throw TypeError(".NT.ClientPlayerPickup.orb: object expected");
        message.orb = $root.NT.ClientPlayerPickup.OrbPickup.fromObject(object.orb);
      }
      return message;
    };
    ClientPlayerPickup.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (message.heart != null && message.hasOwnProperty("heart")) {
        object.heart = $root.NT.ClientPlayerPickup.HeartPickup.toObject(message.heart, options);
        if (options.oneofs)
          object.kind = "heart";
      }
      if (message.orb != null && message.hasOwnProperty("orb")) {
        object.orb = $root.NT.ClientPlayerPickup.OrbPickup.toObject(message.orb, options);
        if (options.oneofs)
          object.kind = "orb";
      }
      return object;
    };
    ClientPlayerPickup.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientPlayerPickup.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientPlayerPickup";
    };
    ClientPlayerPickup.HeartPickup = function() {
      function HeartPickup(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      HeartPickup.prototype.hpPerk = false;
      HeartPickup.create = function create(properties) {
        return new HeartPickup(properties);
      };
      HeartPickup.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.hpPerk != null && Object.hasOwnProperty.call(message, "hpPerk"))
          writer.uint32(
            /* id 1, wireType 0 =*/
            8
          ).bool(message.hpPerk);
        return writer;
      };
      HeartPickup.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      HeartPickup.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerPickup.HeartPickup();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.hpPerk = reader.bool();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      HeartPickup.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      HeartPickup.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.hpPerk != null && message.hasOwnProperty("hpPerk")) {
          if (typeof message.hpPerk !== "boolean")
            return "hpPerk: boolean expected";
        }
        return null;
      };
      HeartPickup.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ClientPlayerPickup.HeartPickup)
          return object;
        let message = new $root.NT.ClientPlayerPickup.HeartPickup();
        if (object.hpPerk != null)
          message.hpPerk = Boolean(object.hpPerk);
        return message;
      };
      HeartPickup.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults)
          object.hpPerk = false;
        if (message.hpPerk != null && message.hasOwnProperty("hpPerk"))
          object.hpPerk = message.hpPerk;
        return object;
      };
      HeartPickup.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      HeartPickup.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ClientPlayerPickup.HeartPickup";
      };
      return HeartPickup;
    }();
    ClientPlayerPickup.OrbPickup = function() {
      function OrbPickup(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      OrbPickup.prototype.id = 0;
      OrbPickup.create = function create(properties) {
        return new OrbPickup(properties);
      };
      OrbPickup.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.id != null && Object.hasOwnProperty.call(message, "id"))
          writer.uint32(
            /* id 1, wireType 0 =*/
            8
          ).uint32(message.id);
        return writer;
      };
      OrbPickup.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      OrbPickup.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerPickup.OrbPickup();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.id = reader.uint32();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      OrbPickup.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      OrbPickup.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.id != null && message.hasOwnProperty("id")) {
          if (!$util.isInteger(message.id))
            return "id: integer expected";
        }
        return null;
      };
      OrbPickup.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ClientPlayerPickup.OrbPickup)
          return object;
        let message = new $root.NT.ClientPlayerPickup.OrbPickup();
        if (object.id != null)
          message.id = object.id >>> 0;
        return message;
      };
      OrbPickup.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults)
          object.id = 0;
        if (message.id != null && message.hasOwnProperty("id"))
          object.id = message.id;
        return object;
      };
      OrbPickup.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      OrbPickup.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ClientPlayerPickup.OrbPickup";
      };
      return OrbPickup;
    }();
    return ClientPlayerPickup;
  }();
  NT3.ServerPlayerPickup = function() {
    function ServerPlayerPickup(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerPickup.prototype.userId = "";
    ServerPlayerPickup.prototype.heart = null;
    ServerPlayerPickup.prototype.orb = null;
    let $oneOfFields;
    Object.defineProperty(ServerPlayerPickup.prototype, "kind", {
      get: $util.oneOfGetter($oneOfFields = ["heart", "orb"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ServerPlayerPickup.create = function create(properties) {
      return new ServerPlayerPickup(properties);
    };
    ServerPlayerPickup.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.heart != null && Object.hasOwnProperty.call(message, "heart"))
        $root.NT.ServerPlayerPickup.HeartPickup.encode(message.heart, writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).fork()).ldelim();
      if (message.orb != null && Object.hasOwnProperty.call(message, "orb"))
        $root.NT.ServerPlayerPickup.OrbPickup.encode(message.orb, writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).fork()).ldelim();
      return writer;
    };
    ServerPlayerPickup.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerPickup.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerPickup();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.heart = $root.NT.ServerPlayerPickup.HeartPickup.decode(reader, reader.uint32());
            break;
          }
          case 3: {
            message.orb = $root.NT.ServerPlayerPickup.OrbPickup.decode(reader, reader.uint32());
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerPickup.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerPickup.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.heart != null && message.hasOwnProperty("heart")) {
        properties.kind = 1;
        {
          let error = $root.NT.ServerPlayerPickup.HeartPickup.verify(message.heart);
          if (error)
            return "heart." + error;
        }
      }
      if (message.orb != null && message.hasOwnProperty("orb")) {
        if (properties.kind === 1)
          return "kind: multiple values";
        properties.kind = 1;
        {
          let error = $root.NT.ServerPlayerPickup.OrbPickup.verify(message.orb);
          if (error)
            return "orb." + error;
        }
      }
      return null;
    };
    ServerPlayerPickup.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerPickup)
        return object;
      let message = new $root.NT.ServerPlayerPickup();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.heart != null) {
        if (typeof object.heart !== "object")
          throw TypeError(".NT.ServerPlayerPickup.heart: object expected");
        message.heart = $root.NT.ServerPlayerPickup.HeartPickup.fromObject(object.heart);
      }
      if (object.orb != null) {
        if (typeof object.orb !== "object")
          throw TypeError(".NT.ServerPlayerPickup.orb: object expected");
        message.orb = $root.NT.ServerPlayerPickup.OrbPickup.fromObject(object.orb);
      }
      return message;
    };
    ServerPlayerPickup.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.heart != null && message.hasOwnProperty("heart")) {
        object.heart = $root.NT.ServerPlayerPickup.HeartPickup.toObject(message.heart, options);
        if (options.oneofs)
          object.kind = "heart";
      }
      if (message.orb != null && message.hasOwnProperty("orb")) {
        object.orb = $root.NT.ServerPlayerPickup.OrbPickup.toObject(message.orb, options);
        if (options.oneofs)
          object.kind = "orb";
      }
      return object;
    };
    ServerPlayerPickup.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerPickup.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerPickup";
    };
    ServerPlayerPickup.HeartPickup = function() {
      function HeartPickup(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      HeartPickup.prototype.hpPerk = false;
      HeartPickup.create = function create(properties) {
        return new HeartPickup(properties);
      };
      HeartPickup.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.hpPerk != null && Object.hasOwnProperty.call(message, "hpPerk"))
          writer.uint32(
            /* id 1, wireType 0 =*/
            8
          ).bool(message.hpPerk);
        return writer;
      };
      HeartPickup.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      HeartPickup.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerPickup.HeartPickup();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.hpPerk = reader.bool();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      HeartPickup.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      HeartPickup.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.hpPerk != null && message.hasOwnProperty("hpPerk")) {
          if (typeof message.hpPerk !== "boolean")
            return "hpPerk: boolean expected";
        }
        return null;
      };
      HeartPickup.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerPlayerPickup.HeartPickup)
          return object;
        let message = new $root.NT.ServerPlayerPickup.HeartPickup();
        if (object.hpPerk != null)
          message.hpPerk = Boolean(object.hpPerk);
        return message;
      };
      HeartPickup.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults)
          object.hpPerk = false;
        if (message.hpPerk != null && message.hasOwnProperty("hpPerk"))
          object.hpPerk = message.hpPerk;
        return object;
      };
      HeartPickup.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      HeartPickup.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerPlayerPickup.HeartPickup";
      };
      return HeartPickup;
    }();
    ServerPlayerPickup.OrbPickup = function() {
      function OrbPickup(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      OrbPickup.prototype.id = 0;
      OrbPickup.create = function create(properties) {
        return new OrbPickup(properties);
      };
      OrbPickup.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.id != null && Object.hasOwnProperty.call(message, "id"))
          writer.uint32(
            /* id 1, wireType 0 =*/
            8
          ).uint32(message.id);
        return writer;
      };
      OrbPickup.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      OrbPickup.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerPickup.OrbPickup();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.id = reader.uint32();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      OrbPickup.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      OrbPickup.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.id != null && message.hasOwnProperty("id")) {
          if (!$util.isInteger(message.id))
            return "id: integer expected";
        }
        return null;
      };
      OrbPickup.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerPlayerPickup.OrbPickup)
          return object;
        let message = new $root.NT.ServerPlayerPickup.OrbPickup();
        if (object.id != null)
          message.id = object.id >>> 0;
        return message;
      };
      OrbPickup.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults)
          object.id = 0;
        if (message.id != null && message.hasOwnProperty("id"))
          object.id = message.id;
        return object;
      };
      OrbPickup.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      OrbPickup.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerPlayerPickup.OrbPickup";
      };
      return OrbPickup;
    }();
    return ServerPlayerPickup;
  }();
  NT3.ClientNemesisPickupItem = function() {
    function ClientNemesisPickupItem(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientNemesisPickupItem.prototype.gameId = "";
    ClientNemesisPickupItem.create = function create(properties) {
      return new ClientNemesisPickupItem(properties);
    };
    ClientNemesisPickupItem.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.gameId != null && Object.hasOwnProperty.call(message, "gameId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.gameId);
      return writer;
    };
    ClientNemesisPickupItem.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientNemesisPickupItem.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientNemesisPickupItem();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.gameId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientNemesisPickupItem.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientNemesisPickupItem.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.gameId != null && message.hasOwnProperty("gameId")) {
        if (!$util.isString(message.gameId))
          return "gameId: string expected";
      }
      return null;
    };
    ClientNemesisPickupItem.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientNemesisPickupItem)
        return object;
      let message = new $root.NT.ClientNemesisPickupItem();
      if (object.gameId != null)
        message.gameId = String(object.gameId);
      return message;
    };
    ClientNemesisPickupItem.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.gameId = "";
      if (message.gameId != null && message.hasOwnProperty("gameId"))
        object.gameId = message.gameId;
      return object;
    };
    ClientNemesisPickupItem.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientNemesisPickupItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientNemesisPickupItem";
    };
    return ClientNemesisPickupItem;
  }();
  NT3.ServerNemesisPickupItem = function() {
    function ServerNemesisPickupItem(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerNemesisPickupItem.prototype.userId = "";
    ServerNemesisPickupItem.prototype.gameId = "";
    ServerNemesisPickupItem.create = function create(properties) {
      return new ServerNemesisPickupItem(properties);
    };
    ServerNemesisPickupItem.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.gameId != null && Object.hasOwnProperty.call(message, "gameId"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.gameId);
      return writer;
    };
    ServerNemesisPickupItem.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerNemesisPickupItem.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerNemesisPickupItem();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.gameId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerNemesisPickupItem.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerNemesisPickupItem.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.gameId != null && message.hasOwnProperty("gameId")) {
        if (!$util.isString(message.gameId))
          return "gameId: string expected";
      }
      return null;
    };
    ServerNemesisPickupItem.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerNemesisPickupItem)
        return object;
      let message = new $root.NT.ServerNemesisPickupItem();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.gameId != null)
        message.gameId = String(object.gameId);
      return message;
    };
    ServerNemesisPickupItem.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.gameId = "";
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.gameId != null && message.hasOwnProperty("gameId"))
        object.gameId = message.gameId;
      return object;
    };
    ServerNemesisPickupItem.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerNemesisPickupItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerNemesisPickupItem";
    };
    return ServerNemesisPickupItem;
  }();
  NT3.ClientNemesisAbility = function() {
    function ClientNemesisAbility(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientNemesisAbility.prototype.gameId = "";
    ClientNemesisAbility.create = function create(properties) {
      return new ClientNemesisAbility(properties);
    };
    ClientNemesisAbility.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.gameId != null && Object.hasOwnProperty.call(message, "gameId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.gameId);
      return writer;
    };
    ClientNemesisAbility.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientNemesisAbility.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientNemesisAbility();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.gameId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientNemesisAbility.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientNemesisAbility.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.gameId != null && message.hasOwnProperty("gameId")) {
        if (!$util.isString(message.gameId))
          return "gameId: string expected";
      }
      return null;
    };
    ClientNemesisAbility.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientNemesisAbility)
        return object;
      let message = new $root.NT.ClientNemesisAbility();
      if (object.gameId != null)
        message.gameId = String(object.gameId);
      return message;
    };
    ClientNemesisAbility.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.gameId = "";
      if (message.gameId != null && message.hasOwnProperty("gameId"))
        object.gameId = message.gameId;
      return object;
    };
    ClientNemesisAbility.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientNemesisAbility.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientNemesisAbility";
    };
    return ClientNemesisAbility;
  }();
  NT3.ServerNemesisAbility = function() {
    function ServerNemesisAbility(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerNemesisAbility.prototype.userId = "";
    ServerNemesisAbility.prototype.gameId = "";
    ServerNemesisAbility.create = function create(properties) {
      return new ServerNemesisAbility(properties);
    };
    ServerNemesisAbility.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.gameId != null && Object.hasOwnProperty.call(message, "gameId"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.gameId);
      return writer;
    };
    ServerNemesisAbility.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerNemesisAbility.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerNemesisAbility();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.gameId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerNemesisAbility.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerNemesisAbility.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.gameId != null && message.hasOwnProperty("gameId")) {
        if (!$util.isString(message.gameId))
          return "gameId: string expected";
      }
      return null;
    };
    ServerNemesisAbility.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerNemesisAbility)
        return object;
      let message = new $root.NT.ServerNemesisAbility();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.gameId != null)
        message.gameId = String(object.gameId);
      return message;
    };
    ServerNemesisAbility.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.gameId = "";
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.gameId != null && message.hasOwnProperty("gameId"))
        object.gameId = message.gameId;
      return object;
    };
    ServerNemesisAbility.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerNemesisAbility.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerNemesisAbility";
    };
    return ServerNemesisAbility;
  }();
  NT3.ClientPlayerDeath = function() {
    function ClientPlayerDeath(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientPlayerDeath.prototype.isWin = false;
    ClientPlayerDeath.prototype.gameTime = null;
    let $oneOfFields;
    Object.defineProperty(ClientPlayerDeath.prototype, "_gameTime", {
      get: $util.oneOfGetter($oneOfFields = ["gameTime"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ClientPlayerDeath.create = function create(properties) {
      return new ClientPlayerDeath(properties);
    };
    ClientPlayerDeath.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.isWin != null && Object.hasOwnProperty.call(message, "isWin"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).bool(message.isWin);
      if (message.gameTime != null && Object.hasOwnProperty.call(message, "gameTime"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.gameTime);
      return writer;
    };
    ClientPlayerDeath.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientPlayerDeath.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerDeath();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.isWin = reader.bool();
            break;
          }
          case 2: {
            message.gameTime = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientPlayerDeath.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientPlayerDeath.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.isWin != null && message.hasOwnProperty("isWin")) {
        if (typeof message.isWin !== "boolean")
          return "isWin: boolean expected";
      }
      if (message.gameTime != null && message.hasOwnProperty("gameTime")) {
        properties._gameTime = 1;
        if (!$util.isInteger(message.gameTime))
          return "gameTime: integer expected";
      }
      return null;
    };
    ClientPlayerDeath.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientPlayerDeath)
        return object;
      let message = new $root.NT.ClientPlayerDeath();
      if (object.isWin != null)
        message.isWin = Boolean(object.isWin);
      if (object.gameTime != null)
        message.gameTime = object.gameTime >>> 0;
      return message;
    };
    ClientPlayerDeath.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.isWin = false;
      if (message.isWin != null && message.hasOwnProperty("isWin"))
        object.isWin = message.isWin;
      if (message.gameTime != null && message.hasOwnProperty("gameTime")) {
        object.gameTime = message.gameTime;
        if (options.oneofs)
          object._gameTime = "gameTime";
      }
      return object;
    };
    ClientPlayerDeath.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientPlayerDeath.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientPlayerDeath";
    };
    return ClientPlayerDeath;
  }();
  NT3.ServerPlayerDeath = function() {
    function ServerPlayerDeath(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerDeath.prototype.userId = "";
    ServerPlayerDeath.prototype.isWin = false;
    ServerPlayerDeath.prototype.gameTime = null;
    let $oneOfFields;
    Object.defineProperty(ServerPlayerDeath.prototype, "_gameTime", {
      get: $util.oneOfGetter($oneOfFields = ["gameTime"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ServerPlayerDeath.create = function create(properties) {
      return new ServerPlayerDeath(properties);
    };
    ServerPlayerDeath.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.isWin != null && Object.hasOwnProperty.call(message, "isWin"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).bool(message.isWin);
      if (message.gameTime != null && Object.hasOwnProperty.call(message, "gameTime"))
        writer.uint32(
          /* id 3, wireType 0 =*/
          24
        ).uint32(message.gameTime);
      return writer;
    };
    ServerPlayerDeath.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerDeath.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerDeath();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.isWin = reader.bool();
            break;
          }
          case 3: {
            message.gameTime = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerDeath.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerDeath.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.isWin != null && message.hasOwnProperty("isWin")) {
        if (typeof message.isWin !== "boolean")
          return "isWin: boolean expected";
      }
      if (message.gameTime != null && message.hasOwnProperty("gameTime")) {
        properties._gameTime = 1;
        if (!$util.isInteger(message.gameTime))
          return "gameTime: integer expected";
      }
      return null;
    };
    ServerPlayerDeath.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerDeath)
        return object;
      let message = new $root.NT.ServerPlayerDeath();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.isWin != null)
        message.isWin = Boolean(object.isWin);
      if (object.gameTime != null)
        message.gameTime = object.gameTime >>> 0;
      return message;
    };
    ServerPlayerDeath.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.isWin = false;
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.isWin != null && message.hasOwnProperty("isWin"))
        object.isWin = message.isWin;
      if (message.gameTime != null && message.hasOwnProperty("gameTime")) {
        object.gameTime = message.gameTime;
        if (options.oneofs)
          object._gameTime = "gameTime";
      }
      return object;
    };
    ServerPlayerDeath.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerDeath.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerDeath";
    };
    return ServerPlayerDeath;
  }();
  NT3.ClientPlayerNewGamePlus = function() {
    function ClientPlayerNewGamePlus(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientPlayerNewGamePlus.prototype.amount = 0;
    ClientPlayerNewGamePlus.create = function create(properties) {
      return new ClientPlayerNewGamePlus(properties);
    };
    ClientPlayerNewGamePlus.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).uint32(message.amount);
      return writer;
    };
    ClientPlayerNewGamePlus.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientPlayerNewGamePlus.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerNewGamePlus();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.amount = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientPlayerNewGamePlus.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientPlayerNewGamePlus.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.amount != null && message.hasOwnProperty("amount")) {
        if (!$util.isInteger(message.amount))
          return "amount: integer expected";
      }
      return null;
    };
    ClientPlayerNewGamePlus.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientPlayerNewGamePlus)
        return object;
      let message = new $root.NT.ClientPlayerNewGamePlus();
      if (object.amount != null)
        message.amount = object.amount >>> 0;
      return message;
    };
    ClientPlayerNewGamePlus.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.amount = 0;
      if (message.amount != null && message.hasOwnProperty("amount"))
        object.amount = message.amount;
      return object;
    };
    ClientPlayerNewGamePlus.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientPlayerNewGamePlus.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientPlayerNewGamePlus";
    };
    return ClientPlayerNewGamePlus;
  }();
  NT3.ServerPlayerNewGamePlus = function() {
    function ServerPlayerNewGamePlus(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerNewGamePlus.prototype.userId = "";
    ServerPlayerNewGamePlus.prototype.amount = 0;
    ServerPlayerNewGamePlus.create = function create(properties) {
      return new ServerPlayerNewGamePlus(properties);
    };
    ServerPlayerNewGamePlus.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.amount);
      return writer;
    };
    ServerPlayerNewGamePlus.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerNewGamePlus.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerNewGamePlus();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.amount = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerNewGamePlus.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerNewGamePlus.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.amount != null && message.hasOwnProperty("amount")) {
        if (!$util.isInteger(message.amount))
          return "amount: integer expected";
      }
      return null;
    };
    ServerPlayerNewGamePlus.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerNewGamePlus)
        return object;
      let message = new $root.NT.ServerPlayerNewGamePlus();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.amount != null)
        message.amount = object.amount >>> 0;
      return message;
    };
    ServerPlayerNewGamePlus.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.amount = 0;
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.amount != null && message.hasOwnProperty("amount"))
        object.amount = message.amount;
      return object;
    };
    ServerPlayerNewGamePlus.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerNewGamePlus.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerNewGamePlus";
    };
    return ServerPlayerNewGamePlus;
  }();
  NT3.ClientPlayerSecretHourglass = function() {
    function ClientPlayerSecretHourglass(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientPlayerSecretHourglass.prototype.material = "";
    ClientPlayerSecretHourglass.create = function create(properties) {
      return new ClientPlayerSecretHourglass(properties);
    };
    ClientPlayerSecretHourglass.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.material != null && Object.hasOwnProperty.call(message, "material"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.material);
      return writer;
    };
    ClientPlayerSecretHourglass.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientPlayerSecretHourglass.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientPlayerSecretHourglass();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.material = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientPlayerSecretHourglass.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientPlayerSecretHourglass.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.material != null && message.hasOwnProperty("material")) {
        if (!$util.isString(message.material))
          return "material: string expected";
      }
      return null;
    };
    ClientPlayerSecretHourglass.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientPlayerSecretHourglass)
        return object;
      let message = new $root.NT.ClientPlayerSecretHourglass();
      if (object.material != null)
        message.material = String(object.material);
      return message;
    };
    ClientPlayerSecretHourglass.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.material = "";
      if (message.material != null && message.hasOwnProperty("material"))
        object.material = message.material;
      return object;
    };
    ClientPlayerSecretHourglass.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientPlayerSecretHourglass.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientPlayerSecretHourglass";
    };
    return ClientPlayerSecretHourglass;
  }();
  NT3.ServerPlayerSecretHourglass = function() {
    function ServerPlayerSecretHourglass(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerPlayerSecretHourglass.prototype.userId = "";
    ServerPlayerSecretHourglass.prototype.material = "";
    ServerPlayerSecretHourglass.create = function create(properties) {
      return new ServerPlayerSecretHourglass(properties);
    };
    ServerPlayerSecretHourglass.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.material != null && Object.hasOwnProperty.call(message, "material"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.material);
      return writer;
    };
    ServerPlayerSecretHourglass.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerPlayerSecretHourglass.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerPlayerSecretHourglass();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.material = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerPlayerSecretHourglass.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerPlayerSecretHourglass.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.material != null && message.hasOwnProperty("material")) {
        if (!$util.isString(message.material))
          return "material: string expected";
      }
      return null;
    };
    ServerPlayerSecretHourglass.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerPlayerSecretHourglass)
        return object;
      let message = new $root.NT.ServerPlayerSecretHourglass();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.material != null)
        message.material = String(object.material);
      return message;
    };
    ServerPlayerSecretHourglass.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.material = "";
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.material != null && message.hasOwnProperty("material"))
        object.material = message.material;
      return object;
    };
    ServerPlayerSecretHourglass.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerPlayerSecretHourglass.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerPlayerSecretHourglass";
    };
    return ServerPlayerSecretHourglass;
  }();
  NT3.ClientCustomModEvent = function() {
    function ClientCustomModEvent(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientCustomModEvent.prototype.payload = "";
    ClientCustomModEvent.create = function create(properties) {
      return new ClientCustomModEvent(properties);
    };
    ClientCustomModEvent.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.payload != null && Object.hasOwnProperty.call(message, "payload"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.payload);
      return writer;
    };
    ClientCustomModEvent.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientCustomModEvent.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientCustomModEvent();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.payload = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientCustomModEvent.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientCustomModEvent.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.payload != null && message.hasOwnProperty("payload")) {
        if (!$util.isString(message.payload))
          return "payload: string expected";
      }
      return null;
    };
    ClientCustomModEvent.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientCustomModEvent)
        return object;
      let message = new $root.NT.ClientCustomModEvent();
      if (object.payload != null)
        message.payload = String(object.payload);
      return message;
    };
    ClientCustomModEvent.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.payload = "";
      if (message.payload != null && message.hasOwnProperty("payload"))
        object.payload = message.payload;
      return object;
    };
    ClientCustomModEvent.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientCustomModEvent.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientCustomModEvent";
    };
    return ClientCustomModEvent;
  }();
  NT3.ServerCustomModEvent = function() {
    function ServerCustomModEvent(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerCustomModEvent.prototype.userId = "";
    ServerCustomModEvent.prototype.payload = "";
    ServerCustomModEvent.create = function create(properties) {
      return new ServerCustomModEvent(properties);
    };
    ServerCustomModEvent.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.payload != null && Object.hasOwnProperty.call(message, "payload"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.payload);
      return writer;
    };
    ServerCustomModEvent.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerCustomModEvent.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerCustomModEvent();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.payload = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerCustomModEvent.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerCustomModEvent.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.payload != null && message.hasOwnProperty("payload")) {
        if (!$util.isString(message.payload))
          return "payload: string expected";
      }
      return null;
    };
    ServerCustomModEvent.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerCustomModEvent)
        return object;
      let message = new $root.NT.ServerCustomModEvent();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.payload != null)
        message.payload = String(object.payload);
      return message;
    };
    ServerCustomModEvent.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.payload = "";
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.payload != null && message.hasOwnProperty("payload"))
        object.payload = message.payload;
      return object;
    };
    ServerCustomModEvent.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerCustomModEvent.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerCustomModEvent";
    };
    return ServerCustomModEvent;
  }();
  NT3.ClientRespawnPenalty = function() {
    function ClientRespawnPenalty(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientRespawnPenalty.prototype.deaths = 0;
    ClientRespawnPenalty.create = function create(properties) {
      return new ClientRespawnPenalty(properties);
    };
    ClientRespawnPenalty.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.deaths != null && Object.hasOwnProperty.call(message, "deaths"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).uint32(message.deaths);
      return writer;
    };
    ClientRespawnPenalty.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientRespawnPenalty.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientRespawnPenalty();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.deaths = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientRespawnPenalty.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientRespawnPenalty.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.deaths != null && message.hasOwnProperty("deaths")) {
        if (!$util.isInteger(message.deaths))
          return "deaths: integer expected";
      }
      return null;
    };
    ClientRespawnPenalty.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientRespawnPenalty)
        return object;
      let message = new $root.NT.ClientRespawnPenalty();
      if (object.deaths != null)
        message.deaths = object.deaths >>> 0;
      return message;
    };
    ClientRespawnPenalty.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.deaths = 0;
      if (message.deaths != null && message.hasOwnProperty("deaths"))
        object.deaths = message.deaths;
      return object;
    };
    ClientRespawnPenalty.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientRespawnPenalty.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientRespawnPenalty";
    };
    return ClientRespawnPenalty;
  }();
  NT3.ServerRespawnPenalty = function() {
    function ServerRespawnPenalty(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerRespawnPenalty.prototype.userId = "";
    ServerRespawnPenalty.prototype.deaths = 0;
    ServerRespawnPenalty.create = function create(properties) {
      return new ServerRespawnPenalty(properties);
    };
    ServerRespawnPenalty.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.deaths != null && Object.hasOwnProperty.call(message, "deaths"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.deaths);
      return writer;
    };
    ServerRespawnPenalty.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerRespawnPenalty.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRespawnPenalty();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.deaths = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerRespawnPenalty.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerRespawnPenalty.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.deaths != null && message.hasOwnProperty("deaths")) {
        if (!$util.isInteger(message.deaths))
          return "deaths: integer expected";
      }
      return null;
    };
    ServerRespawnPenalty.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerRespawnPenalty)
        return object;
      let message = new $root.NT.ServerRespawnPenalty();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.deaths != null)
        message.deaths = object.deaths >>> 0;
      return message;
    };
    ServerRespawnPenalty.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.deaths = 0;
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.deaths != null && message.hasOwnProperty("deaths"))
        object.deaths = message.deaths;
      return object;
    };
    ServerRespawnPenalty.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerRespawnPenalty.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerRespawnPenalty";
    };
    return ServerRespawnPenalty;
  }();
  NT3.ClientAngerySteve = function() {
    function ClientAngerySteve(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientAngerySteve.prototype.idk = false;
    ClientAngerySteve.create = function create(properties) {
      return new ClientAngerySteve(properties);
    };
    ClientAngerySteve.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.idk != null && Object.hasOwnProperty.call(message, "idk"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).bool(message.idk);
      return writer;
    };
    ClientAngerySteve.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientAngerySteve.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientAngerySteve();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.idk = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientAngerySteve.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientAngerySteve.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.idk != null && message.hasOwnProperty("idk")) {
        if (typeof message.idk !== "boolean")
          return "idk: boolean expected";
      }
      return null;
    };
    ClientAngerySteve.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientAngerySteve)
        return object;
      let message = new $root.NT.ClientAngerySteve();
      if (object.idk != null)
        message.idk = Boolean(object.idk);
      return message;
    };
    ClientAngerySteve.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.idk = false;
      if (message.idk != null && message.hasOwnProperty("idk"))
        object.idk = message.idk;
      return object;
    };
    ClientAngerySteve.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientAngerySteve.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientAngerySteve";
    };
    return ClientAngerySteve;
  }();
  NT3.ServerAngerySteve = function() {
    function ServerAngerySteve(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerAngerySteve.prototype.userId = "";
    ServerAngerySteve.create = function create(properties) {
      return new ServerAngerySteve(properties);
    };
    ServerAngerySteve.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      return writer;
    };
    ServerAngerySteve.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerAngerySteve.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerAngerySteve();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerAngerySteve.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerAngerySteve.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      return null;
    };
    ServerAngerySteve.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerAngerySteve)
        return object;
      let message = new $root.NT.ServerAngerySteve();
      if (object.userId != null)
        message.userId = String(object.userId);
      return message;
    };
    ServerAngerySteve.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      return object;
    };
    ServerAngerySteve.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerAngerySteve.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerAngerySteve";
    };
    return ServerAngerySteve;
  }();
  NT3.Wand = function() {
    function Wand(properties) {
      this.alwaysCast = [];
      this.deck = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    Wand.prototype.id = "";
    Wand.prototype.stats = null;
    Wand.prototype.alwaysCast = $util.emptyArray;
    Wand.prototype.deck = $util.emptyArray;
    Wand.prototype.sentBy = null;
    Wand.prototype.contributedBy = null;
    let $oneOfFields;
    Object.defineProperty(Wand.prototype, "_sentBy", {
      get: $util.oneOfGetter($oneOfFields = ["sentBy"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(Wand.prototype, "_contributedBy", {
      get: $util.oneOfGetter($oneOfFields = ["contributedBy"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Wand.create = function create(properties) {
      return new Wand(properties);
    };
    Wand.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      if (message.stats != null && Object.hasOwnProperty.call(message, "stats"))
        $root.NT.Wand.WandStats.encode(message.stats, writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).fork()).ldelim();
      if (message.alwaysCast != null && message.alwaysCast.length)
        for (let i = 0; i < message.alwaysCast.length; ++i)
          $root.NT.Spell.encode(message.alwaysCast[i], writer.uint32(
            /* id 3, wireType 2 =*/
            26
          ).fork()).ldelim();
      if (message.deck != null && message.deck.length)
        for (let i = 0; i < message.deck.length; ++i)
          $root.NT.Spell.encode(message.deck[i], writer.uint32(
            /* id 4, wireType 2 =*/
            34
          ).fork()).ldelim();
      if (message.sentBy != null && Object.hasOwnProperty.call(message, "sentBy"))
        writer.uint32(
          /* id 5, wireType 2 =*/
          42
        ).string(message.sentBy);
      if (message.contributedBy != null && Object.hasOwnProperty.call(message, "contributedBy"))
        writer.uint32(
          /* id 6, wireType 2 =*/
          50
        ).string(message.contributedBy);
      return writer;
    };
    Wand.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    Wand.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.Wand();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          case 2: {
            message.stats = $root.NT.Wand.WandStats.decode(reader, reader.uint32());
            break;
          }
          case 3: {
            if (!(message.alwaysCast && message.alwaysCast.length))
              message.alwaysCast = [];
            message.alwaysCast.push($root.NT.Spell.decode(reader, reader.uint32()));
            break;
          }
          case 4: {
            if (!(message.deck && message.deck.length))
              message.deck = [];
            message.deck.push($root.NT.Spell.decode(reader, reader.uint32()));
            break;
          }
          case 5: {
            message.sentBy = reader.string();
            break;
          }
          case 6: {
            message.contributedBy = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    Wand.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    Wand.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      if (message.stats != null && message.hasOwnProperty("stats")) {
        let error = $root.NT.Wand.WandStats.verify(message.stats);
        if (error)
          return "stats." + error;
      }
      if (message.alwaysCast != null && message.hasOwnProperty("alwaysCast")) {
        if (!Array.isArray(message.alwaysCast))
          return "alwaysCast: array expected";
        for (let i = 0; i < message.alwaysCast.length; ++i) {
          let error = $root.NT.Spell.verify(message.alwaysCast[i]);
          if (error)
            return "alwaysCast." + error;
        }
      }
      if (message.deck != null && message.hasOwnProperty("deck")) {
        if (!Array.isArray(message.deck))
          return "deck: array expected";
        for (let i = 0; i < message.deck.length; ++i) {
          let error = $root.NT.Spell.verify(message.deck[i]);
          if (error)
            return "deck." + error;
        }
      }
      if (message.sentBy != null && message.hasOwnProperty("sentBy")) {
        properties._sentBy = 1;
        if (!$util.isString(message.sentBy))
          return "sentBy: string expected";
      }
      if (message.contributedBy != null && message.hasOwnProperty("contributedBy")) {
        properties._contributedBy = 1;
        if (!$util.isString(message.contributedBy))
          return "contributedBy: string expected";
      }
      return null;
    };
    Wand.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.Wand)
        return object;
      let message = new $root.NT.Wand();
      if (object.id != null)
        message.id = String(object.id);
      if (object.stats != null) {
        if (typeof object.stats !== "object")
          throw TypeError(".NT.Wand.stats: object expected");
        message.stats = $root.NT.Wand.WandStats.fromObject(object.stats);
      }
      if (object.alwaysCast) {
        if (!Array.isArray(object.alwaysCast))
          throw TypeError(".NT.Wand.alwaysCast: array expected");
        message.alwaysCast = [];
        for (let i = 0; i < object.alwaysCast.length; ++i) {
          if (typeof object.alwaysCast[i] !== "object")
            throw TypeError(".NT.Wand.alwaysCast: object expected");
          message.alwaysCast[i] = $root.NT.Spell.fromObject(object.alwaysCast[i]);
        }
      }
      if (object.deck) {
        if (!Array.isArray(object.deck))
          throw TypeError(".NT.Wand.deck: array expected");
        message.deck = [];
        for (let i = 0; i < object.deck.length; ++i) {
          if (typeof object.deck[i] !== "object")
            throw TypeError(".NT.Wand.deck: object expected");
          message.deck[i] = $root.NT.Spell.fromObject(object.deck[i]);
        }
      }
      if (object.sentBy != null)
        message.sentBy = String(object.sentBy);
      if (object.contributedBy != null)
        message.contributedBy = String(object.contributedBy);
      return message;
    };
    Wand.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults) {
        object.alwaysCast = [];
        object.deck = [];
      }
      if (options.defaults) {
        object.id = "";
        object.stats = null;
      }
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      if (message.stats != null && message.hasOwnProperty("stats"))
        object.stats = $root.NT.Wand.WandStats.toObject(message.stats, options);
      if (message.alwaysCast && message.alwaysCast.length) {
        object.alwaysCast = [];
        for (let j = 0; j < message.alwaysCast.length; ++j)
          object.alwaysCast[j] = $root.NT.Spell.toObject(message.alwaysCast[j], options);
      }
      if (message.deck && message.deck.length) {
        object.deck = [];
        for (let j = 0; j < message.deck.length; ++j)
          object.deck[j] = $root.NT.Spell.toObject(message.deck[j], options);
      }
      if (message.sentBy != null && message.hasOwnProperty("sentBy")) {
        object.sentBy = message.sentBy;
        if (options.oneofs)
          object._sentBy = "sentBy";
      }
      if (message.contributedBy != null && message.hasOwnProperty("contributedBy")) {
        object.contributedBy = message.contributedBy;
        if (options.oneofs)
          object._contributedBy = "contributedBy";
      }
      return object;
    };
    Wand.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    Wand.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.Wand";
    };
    Wand.WandStats = function() {
      function WandStats(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      WandStats.prototype.sprite = "";
      WandStats.prototype.named = false;
      WandStats.prototype.uiName = "";
      WandStats.prototype.manaMax = 0;
      WandStats.prototype.manaChargeSpeed = 0;
      WandStats.prototype.reloadTime = 0;
      WandStats.prototype.actionsPerRound = 0;
      WandStats.prototype.deckCapacity = 0;
      WandStats.prototype.shuffleDeckWhenEmpty = false;
      WandStats.prototype.spreadDegrees = 0;
      WandStats.prototype.speedMultiplier = 0;
      WandStats.prototype.fireRateWait = 0;
      WandStats.prototype.tipX = 0;
      WandStats.prototype.tipY = 0;
      WandStats.prototype.gripX = 0;
      WandStats.prototype.gripY = 0;
      WandStats.create = function create(properties) {
        return new WandStats(properties);
      };
      WandStats.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.sprite != null && Object.hasOwnProperty.call(message, "sprite"))
          writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).string(message.sprite);
        if (message.named != null && Object.hasOwnProperty.call(message, "named"))
          writer.uint32(
            /* id 2, wireType 0 =*/
            16
          ).bool(message.named);
        if (message.uiName != null && Object.hasOwnProperty.call(message, "uiName"))
          writer.uint32(
            /* id 3, wireType 2 =*/
            26
          ).string(message.uiName);
        if (message.manaMax != null && Object.hasOwnProperty.call(message, "manaMax"))
          writer.uint32(
            /* id 4, wireType 5 =*/
            37
          ).float(message.manaMax);
        if (message.manaChargeSpeed != null && Object.hasOwnProperty.call(message, "manaChargeSpeed"))
          writer.uint32(
            /* id 5, wireType 5 =*/
            45
          ).float(message.manaChargeSpeed);
        if (message.reloadTime != null && Object.hasOwnProperty.call(message, "reloadTime"))
          writer.uint32(
            /* id 6, wireType 0 =*/
            48
          ).int32(message.reloadTime);
        if (message.actionsPerRound != null && Object.hasOwnProperty.call(message, "actionsPerRound"))
          writer.uint32(
            /* id 7, wireType 0 =*/
            56
          ).uint32(message.actionsPerRound);
        if (message.deckCapacity != null && Object.hasOwnProperty.call(message, "deckCapacity"))
          writer.uint32(
            /* id 8, wireType 0 =*/
            64
          ).uint32(message.deckCapacity);
        if (message.shuffleDeckWhenEmpty != null && Object.hasOwnProperty.call(message, "shuffleDeckWhenEmpty"))
          writer.uint32(
            /* id 9, wireType 0 =*/
            72
          ).bool(message.shuffleDeckWhenEmpty);
        if (message.spreadDegrees != null && Object.hasOwnProperty.call(message, "spreadDegrees"))
          writer.uint32(
            /* id 10, wireType 5 =*/
            85
          ).float(message.spreadDegrees);
        if (message.speedMultiplier != null && Object.hasOwnProperty.call(message, "speedMultiplier"))
          writer.uint32(
            /* id 11, wireType 5 =*/
            93
          ).float(message.speedMultiplier);
        if (message.fireRateWait != null && Object.hasOwnProperty.call(message, "fireRateWait"))
          writer.uint32(
            /* id 12, wireType 0 =*/
            96
          ).int32(message.fireRateWait);
        if (message.tipX != null && Object.hasOwnProperty.call(message, "tipX"))
          writer.uint32(
            /* id 13, wireType 5 =*/
            109
          ).float(message.tipX);
        if (message.tipY != null && Object.hasOwnProperty.call(message, "tipY"))
          writer.uint32(
            /* id 14, wireType 5 =*/
            117
          ).float(message.tipY);
        if (message.gripX != null && Object.hasOwnProperty.call(message, "gripX"))
          writer.uint32(
            /* id 15, wireType 5 =*/
            125
          ).float(message.gripX);
        if (message.gripY != null && Object.hasOwnProperty.call(message, "gripY"))
          writer.uint32(
            /* id 16, wireType 5 =*/
            133
          ).float(message.gripY);
        return writer;
      };
      WandStats.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      WandStats.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.Wand.WandStats();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.sprite = reader.string();
              break;
            }
            case 2: {
              message.named = reader.bool();
              break;
            }
            case 3: {
              message.uiName = reader.string();
              break;
            }
            case 4: {
              message.manaMax = reader.float();
              break;
            }
            case 5: {
              message.manaChargeSpeed = reader.float();
              break;
            }
            case 6: {
              message.reloadTime = reader.int32();
              break;
            }
            case 7: {
              message.actionsPerRound = reader.uint32();
              break;
            }
            case 8: {
              message.deckCapacity = reader.uint32();
              break;
            }
            case 9: {
              message.shuffleDeckWhenEmpty = reader.bool();
              break;
            }
            case 10: {
              message.spreadDegrees = reader.float();
              break;
            }
            case 11: {
              message.speedMultiplier = reader.float();
              break;
            }
            case 12: {
              message.fireRateWait = reader.int32();
              break;
            }
            case 13: {
              message.tipX = reader.float();
              break;
            }
            case 14: {
              message.tipY = reader.float();
              break;
            }
            case 15: {
              message.gripX = reader.float();
              break;
            }
            case 16: {
              message.gripY = reader.float();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      WandStats.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      WandStats.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.sprite != null && message.hasOwnProperty("sprite")) {
          if (!$util.isString(message.sprite))
            return "sprite: string expected";
        }
        if (message.named != null && message.hasOwnProperty("named")) {
          if (typeof message.named !== "boolean")
            return "named: boolean expected";
        }
        if (message.uiName != null && message.hasOwnProperty("uiName")) {
          if (!$util.isString(message.uiName))
            return "uiName: string expected";
        }
        if (message.manaMax != null && message.hasOwnProperty("manaMax")) {
          if (typeof message.manaMax !== "number")
            return "manaMax: number expected";
        }
        if (message.manaChargeSpeed != null && message.hasOwnProperty("manaChargeSpeed")) {
          if (typeof message.manaChargeSpeed !== "number")
            return "manaChargeSpeed: number expected";
        }
        if (message.reloadTime != null && message.hasOwnProperty("reloadTime")) {
          if (!$util.isInteger(message.reloadTime))
            return "reloadTime: integer expected";
        }
        if (message.actionsPerRound != null && message.hasOwnProperty("actionsPerRound")) {
          if (!$util.isInteger(message.actionsPerRound))
            return "actionsPerRound: integer expected";
        }
        if (message.deckCapacity != null && message.hasOwnProperty("deckCapacity")) {
          if (!$util.isInteger(message.deckCapacity))
            return "deckCapacity: integer expected";
        }
        if (message.shuffleDeckWhenEmpty != null && message.hasOwnProperty("shuffleDeckWhenEmpty")) {
          if (typeof message.shuffleDeckWhenEmpty !== "boolean")
            return "shuffleDeckWhenEmpty: boolean expected";
        }
        if (message.spreadDegrees != null && message.hasOwnProperty("spreadDegrees")) {
          if (typeof message.spreadDegrees !== "number")
            return "spreadDegrees: number expected";
        }
        if (message.speedMultiplier != null && message.hasOwnProperty("speedMultiplier")) {
          if (typeof message.speedMultiplier !== "number")
            return "speedMultiplier: number expected";
        }
        if (message.fireRateWait != null && message.hasOwnProperty("fireRateWait")) {
          if (!$util.isInteger(message.fireRateWait))
            return "fireRateWait: integer expected";
        }
        if (message.tipX != null && message.hasOwnProperty("tipX")) {
          if (typeof message.tipX !== "number")
            return "tipX: number expected";
        }
        if (message.tipY != null && message.hasOwnProperty("tipY")) {
          if (typeof message.tipY !== "number")
            return "tipY: number expected";
        }
        if (message.gripX != null && message.hasOwnProperty("gripX")) {
          if (typeof message.gripX !== "number")
            return "gripX: number expected";
        }
        if (message.gripY != null && message.hasOwnProperty("gripY")) {
          if (typeof message.gripY !== "number")
            return "gripY: number expected";
        }
        return null;
      };
      WandStats.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.Wand.WandStats)
          return object;
        let message = new $root.NT.Wand.WandStats();
        if (object.sprite != null)
          message.sprite = String(object.sprite);
        if (object.named != null)
          message.named = Boolean(object.named);
        if (object.uiName != null)
          message.uiName = String(object.uiName);
        if (object.manaMax != null)
          message.manaMax = Number(object.manaMax);
        if (object.manaChargeSpeed != null)
          message.manaChargeSpeed = Number(object.manaChargeSpeed);
        if (object.reloadTime != null)
          message.reloadTime = object.reloadTime | 0;
        if (object.actionsPerRound != null)
          message.actionsPerRound = object.actionsPerRound >>> 0;
        if (object.deckCapacity != null)
          message.deckCapacity = object.deckCapacity >>> 0;
        if (object.shuffleDeckWhenEmpty != null)
          message.shuffleDeckWhenEmpty = Boolean(object.shuffleDeckWhenEmpty);
        if (object.spreadDegrees != null)
          message.spreadDegrees = Number(object.spreadDegrees);
        if (object.speedMultiplier != null)
          message.speedMultiplier = Number(object.speedMultiplier);
        if (object.fireRateWait != null)
          message.fireRateWait = object.fireRateWait | 0;
        if (object.tipX != null)
          message.tipX = Number(object.tipX);
        if (object.tipY != null)
          message.tipY = Number(object.tipY);
        if (object.gripX != null)
          message.gripX = Number(object.gripX);
        if (object.gripY != null)
          message.gripY = Number(object.gripY);
        return message;
      };
      WandStats.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.sprite = "";
          object.named = false;
          object.uiName = "";
          object.manaMax = 0;
          object.manaChargeSpeed = 0;
          object.reloadTime = 0;
          object.actionsPerRound = 0;
          object.deckCapacity = 0;
          object.shuffleDeckWhenEmpty = false;
          object.spreadDegrees = 0;
          object.speedMultiplier = 0;
          object.fireRateWait = 0;
          object.tipX = 0;
          object.tipY = 0;
          object.gripX = 0;
          object.gripY = 0;
        }
        if (message.sprite != null && message.hasOwnProperty("sprite"))
          object.sprite = message.sprite;
        if (message.named != null && message.hasOwnProperty("named"))
          object.named = message.named;
        if (message.uiName != null && message.hasOwnProperty("uiName"))
          object.uiName = message.uiName;
        if (message.manaMax != null && message.hasOwnProperty("manaMax"))
          object.manaMax = options.json && !isFinite(message.manaMax) ? String(message.manaMax) : message.manaMax;
        if (message.manaChargeSpeed != null && message.hasOwnProperty("manaChargeSpeed"))
          object.manaChargeSpeed = options.json && !isFinite(message.manaChargeSpeed) ? String(message.manaChargeSpeed) : message.manaChargeSpeed;
        if (message.reloadTime != null && message.hasOwnProperty("reloadTime"))
          object.reloadTime = message.reloadTime;
        if (message.actionsPerRound != null && message.hasOwnProperty("actionsPerRound"))
          object.actionsPerRound = message.actionsPerRound;
        if (message.deckCapacity != null && message.hasOwnProperty("deckCapacity"))
          object.deckCapacity = message.deckCapacity;
        if (message.shuffleDeckWhenEmpty != null && message.hasOwnProperty("shuffleDeckWhenEmpty"))
          object.shuffleDeckWhenEmpty = message.shuffleDeckWhenEmpty;
        if (message.spreadDegrees != null && message.hasOwnProperty("spreadDegrees"))
          object.spreadDegrees = options.json && !isFinite(message.spreadDegrees) ? String(message.spreadDegrees) : message.spreadDegrees;
        if (message.speedMultiplier != null && message.hasOwnProperty("speedMultiplier"))
          object.speedMultiplier = options.json && !isFinite(message.speedMultiplier) ? String(message.speedMultiplier) : message.speedMultiplier;
        if (message.fireRateWait != null && message.hasOwnProperty("fireRateWait"))
          object.fireRateWait = message.fireRateWait;
        if (message.tipX != null && message.hasOwnProperty("tipX"))
          object.tipX = options.json && !isFinite(message.tipX) ? String(message.tipX) : message.tipX;
        if (message.tipY != null && message.hasOwnProperty("tipY"))
          object.tipY = options.json && !isFinite(message.tipY) ? String(message.tipY) : message.tipY;
        if (message.gripX != null && message.hasOwnProperty("gripX"))
          object.gripX = options.json && !isFinite(message.gripX) ? String(message.gripX) : message.gripX;
        if (message.gripY != null && message.hasOwnProperty("gripY"))
          object.gripY = options.json && !isFinite(message.gripY) ? String(message.gripY) : message.gripY;
        return object;
      };
      WandStats.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      WandStats.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.Wand.WandStats";
      };
      return WandStats;
    }();
    return Wand;
  }();
  NT3.Spell = function() {
    function Spell(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    Spell.prototype.id = "";
    Spell.prototype.gameId = "";
    Spell.prototype.sentBy = null;
    Spell.prototype.contributedBy = null;
    Spell.prototype.usesRemaining = 0;
    let $oneOfFields;
    Object.defineProperty(Spell.prototype, "_sentBy", {
      get: $util.oneOfGetter($oneOfFields = ["sentBy"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(Spell.prototype, "_contributedBy", {
      get: $util.oneOfGetter($oneOfFields = ["contributedBy"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Spell.create = function create(properties) {
      return new Spell(properties);
    };
    Spell.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      if (message.gameId != null && Object.hasOwnProperty.call(message, "gameId"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.gameId);
      if (message.sentBy != null && Object.hasOwnProperty.call(message, "sentBy"))
        writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).string(message.sentBy);
      if (message.contributedBy != null && Object.hasOwnProperty.call(message, "contributedBy"))
        writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).string(message.contributedBy);
      if (message.usesRemaining != null && Object.hasOwnProperty.call(message, "usesRemaining"))
        writer.uint32(
          /* id 5, wireType 0 =*/
          40
        ).int32(message.usesRemaining);
      return writer;
    };
    Spell.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    Spell.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.Spell();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          case 2: {
            message.gameId = reader.string();
            break;
          }
          case 3: {
            message.sentBy = reader.string();
            break;
          }
          case 4: {
            message.contributedBy = reader.string();
            break;
          }
          case 5: {
            message.usesRemaining = reader.int32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    Spell.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    Spell.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      if (message.gameId != null && message.hasOwnProperty("gameId")) {
        if (!$util.isString(message.gameId))
          return "gameId: string expected";
      }
      if (message.sentBy != null && message.hasOwnProperty("sentBy")) {
        properties._sentBy = 1;
        if (!$util.isString(message.sentBy))
          return "sentBy: string expected";
      }
      if (message.contributedBy != null && message.hasOwnProperty("contributedBy")) {
        properties._contributedBy = 1;
        if (!$util.isString(message.contributedBy))
          return "contributedBy: string expected";
      }
      if (message.usesRemaining != null && message.hasOwnProperty("usesRemaining")) {
        if (!$util.isInteger(message.usesRemaining))
          return "usesRemaining: integer expected";
      }
      return null;
    };
    Spell.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.Spell)
        return object;
      let message = new $root.NT.Spell();
      if (object.id != null)
        message.id = String(object.id);
      if (object.gameId != null)
        message.gameId = String(object.gameId);
      if (object.sentBy != null)
        message.sentBy = String(object.sentBy);
      if (object.contributedBy != null)
        message.contributedBy = String(object.contributedBy);
      if (object.usesRemaining != null)
        message.usesRemaining = object.usesRemaining | 0;
      return message;
    };
    Spell.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.id = "";
        object.gameId = "";
        object.usesRemaining = 0;
      }
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      if (message.gameId != null && message.hasOwnProperty("gameId"))
        object.gameId = message.gameId;
      if (message.sentBy != null && message.hasOwnProperty("sentBy")) {
        object.sentBy = message.sentBy;
        if (options.oneofs)
          object._sentBy = "sentBy";
      }
      if (message.contributedBy != null && message.hasOwnProperty("contributedBy")) {
        object.contributedBy = message.contributedBy;
        if (options.oneofs)
          object._contributedBy = "contributedBy";
      }
      if (message.usesRemaining != null && message.hasOwnProperty("usesRemaining"))
        object.usesRemaining = message.usesRemaining;
      return object;
    };
    Spell.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    Spell.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.Spell";
    };
    return Spell;
  }();
  NT3.Item = function() {
    function Item(properties) {
      this.content = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    Item.prototype.id = "";
    Item.prototype.color = null;
    Item.prototype.content = $util.emptyArray;
    Item.prototype.sentBy = null;
    Item.prototype.contributedBy = null;
    Item.prototype.isChest = false;
    Item.prototype.itemType = "";
    let $oneOfFields;
    Object.defineProperty(Item.prototype, "_sentBy", {
      get: $util.oneOfGetter($oneOfFields = ["sentBy"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(Item.prototype, "_contributedBy", {
      get: $util.oneOfGetter($oneOfFields = ["contributedBy"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Item.create = function create(properties) {
      return new Item(properties);
    };
    Item.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      if (message.color != null && Object.hasOwnProperty.call(message, "color"))
        $root.NT.Item.Color.encode(message.color, writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).fork()).ldelim();
      if (message.content != null && message.content.length)
        for (let i = 0; i < message.content.length; ++i)
          $root.NT.Item.Material.encode(message.content[i], writer.uint32(
            /* id 3, wireType 2 =*/
            26
          ).fork()).ldelim();
      if (message.sentBy != null && Object.hasOwnProperty.call(message, "sentBy"))
        writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).string(message.sentBy);
      if (message.contributedBy != null && Object.hasOwnProperty.call(message, "contributedBy"))
        writer.uint32(
          /* id 5, wireType 2 =*/
          42
        ).string(message.contributedBy);
      if (message.isChest != null && Object.hasOwnProperty.call(message, "isChest"))
        writer.uint32(
          /* id 6, wireType 0 =*/
          48
        ).bool(message.isChest);
      if (message.itemType != null && Object.hasOwnProperty.call(message, "itemType"))
        writer.uint32(
          /* id 7, wireType 2 =*/
          58
        ).string(message.itemType);
      return writer;
    };
    Item.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    Item.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.Item();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          case 2: {
            message.color = $root.NT.Item.Color.decode(reader, reader.uint32());
            break;
          }
          case 3: {
            if (!(message.content && message.content.length))
              message.content = [];
            message.content.push($root.NT.Item.Material.decode(reader, reader.uint32()));
            break;
          }
          case 4: {
            message.sentBy = reader.string();
            break;
          }
          case 5: {
            message.contributedBy = reader.string();
            break;
          }
          case 6: {
            message.isChest = reader.bool();
            break;
          }
          case 7: {
            message.itemType = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    Item.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    Item.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      if (message.color != null && message.hasOwnProperty("color")) {
        let error = $root.NT.Item.Color.verify(message.color);
        if (error)
          return "color." + error;
      }
      if (message.content != null && message.hasOwnProperty("content")) {
        if (!Array.isArray(message.content))
          return "content: array expected";
        for (let i = 0; i < message.content.length; ++i) {
          let error = $root.NT.Item.Material.verify(message.content[i]);
          if (error)
            return "content." + error;
        }
      }
      if (message.sentBy != null && message.hasOwnProperty("sentBy")) {
        properties._sentBy = 1;
        if (!$util.isString(message.sentBy))
          return "sentBy: string expected";
      }
      if (message.contributedBy != null && message.hasOwnProperty("contributedBy")) {
        properties._contributedBy = 1;
        if (!$util.isString(message.contributedBy))
          return "contributedBy: string expected";
      }
      if (message.isChest != null && message.hasOwnProperty("isChest")) {
        if (typeof message.isChest !== "boolean")
          return "isChest: boolean expected";
      }
      if (message.itemType != null && message.hasOwnProperty("itemType")) {
        if (!$util.isString(message.itemType))
          return "itemType: string expected";
      }
      return null;
    };
    Item.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.Item)
        return object;
      let message = new $root.NT.Item();
      if (object.id != null)
        message.id = String(object.id);
      if (object.color != null) {
        if (typeof object.color !== "object")
          throw TypeError(".NT.Item.color: object expected");
        message.color = $root.NT.Item.Color.fromObject(object.color);
      }
      if (object.content) {
        if (!Array.isArray(object.content))
          throw TypeError(".NT.Item.content: array expected");
        message.content = [];
        for (let i = 0; i < object.content.length; ++i) {
          if (typeof object.content[i] !== "object")
            throw TypeError(".NT.Item.content: object expected");
          message.content[i] = $root.NT.Item.Material.fromObject(object.content[i]);
        }
      }
      if (object.sentBy != null)
        message.sentBy = String(object.sentBy);
      if (object.contributedBy != null)
        message.contributedBy = String(object.contributedBy);
      if (object.isChest != null)
        message.isChest = Boolean(object.isChest);
      if (object.itemType != null)
        message.itemType = String(object.itemType);
      return message;
    };
    Item.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.content = [];
      if (options.defaults) {
        object.id = "";
        object.color = null;
        object.isChest = false;
        object.itemType = "";
      }
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      if (message.color != null && message.hasOwnProperty("color"))
        object.color = $root.NT.Item.Color.toObject(message.color, options);
      if (message.content && message.content.length) {
        object.content = [];
        for (let j = 0; j < message.content.length; ++j)
          object.content[j] = $root.NT.Item.Material.toObject(message.content[j], options);
      }
      if (message.sentBy != null && message.hasOwnProperty("sentBy")) {
        object.sentBy = message.sentBy;
        if (options.oneofs)
          object._sentBy = "sentBy";
      }
      if (message.contributedBy != null && message.hasOwnProperty("contributedBy")) {
        object.contributedBy = message.contributedBy;
        if (options.oneofs)
          object._contributedBy = "contributedBy";
      }
      if (message.isChest != null && message.hasOwnProperty("isChest"))
        object.isChest = message.isChest;
      if (message.itemType != null && message.hasOwnProperty("itemType"))
        object.itemType = message.itemType;
      return object;
    };
    Item.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    Item.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.Item";
    };
    Item.Color = function() {
      function Color(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Color.prototype.r = 0;
      Color.prototype.g = 0;
      Color.prototype.b = 0;
      Color.create = function create(properties) {
        return new Color(properties);
      };
      Color.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.r != null && Object.hasOwnProperty.call(message, "r"))
          writer.uint32(
            /* id 1, wireType 5 =*/
            13
          ).float(message.r);
        if (message.g != null && Object.hasOwnProperty.call(message, "g"))
          writer.uint32(
            /* id 2, wireType 5 =*/
            21
          ).float(message.g);
        if (message.b != null && Object.hasOwnProperty.call(message, "b"))
          writer.uint32(
            /* id 3, wireType 5 =*/
            29
          ).float(message.b);
        return writer;
      };
      Color.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Color.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.Item.Color();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.r = reader.float();
              break;
            }
            case 2: {
              message.g = reader.float();
              break;
            }
            case 3: {
              message.b = reader.float();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Color.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Color.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.r != null && message.hasOwnProperty("r")) {
          if (typeof message.r !== "number")
            return "r: number expected";
        }
        if (message.g != null && message.hasOwnProperty("g")) {
          if (typeof message.g !== "number")
            return "g: number expected";
        }
        if (message.b != null && message.hasOwnProperty("b")) {
          if (typeof message.b !== "number")
            return "b: number expected";
        }
        return null;
      };
      Color.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.Item.Color)
          return object;
        let message = new $root.NT.Item.Color();
        if (object.r != null)
          message.r = Number(object.r);
        if (object.g != null)
          message.g = Number(object.g);
        if (object.b != null)
          message.b = Number(object.b);
        return message;
      };
      Color.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.r = 0;
          object.g = 0;
          object.b = 0;
        }
        if (message.r != null && message.hasOwnProperty("r"))
          object.r = options.json && !isFinite(message.r) ? String(message.r) : message.r;
        if (message.g != null && message.hasOwnProperty("g"))
          object.g = options.json && !isFinite(message.g) ? String(message.g) : message.g;
        if (message.b != null && message.hasOwnProperty("b"))
          object.b = options.json && !isFinite(message.b) ? String(message.b) : message.b;
        return object;
      };
      Color.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Color.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.Item.Color";
      };
      return Color;
    }();
    Item.Material = function() {
      function Material(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Material.prototype.id = 0;
      Material.prototype.amount = 0;
      Material.create = function create(properties) {
        return new Material(properties);
      };
      Material.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.id != null && Object.hasOwnProperty.call(message, "id"))
          writer.uint32(
            /* id 1, wireType 0 =*/
            8
          ).uint32(message.id);
        if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
          writer.uint32(
            /* id 2, wireType 0 =*/
            16
          ).uint32(message.amount);
        return writer;
      };
      Material.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Material.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.Item.Material();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.id = reader.uint32();
              break;
            }
            case 2: {
              message.amount = reader.uint32();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Material.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Material.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.id != null && message.hasOwnProperty("id")) {
          if (!$util.isInteger(message.id))
            return "id: integer expected";
        }
        if (message.amount != null && message.hasOwnProperty("amount")) {
          if (!$util.isInteger(message.amount))
            return "amount: integer expected";
        }
        return null;
      };
      Material.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.Item.Material)
          return object;
        let message = new $root.NT.Item.Material();
        if (object.id != null)
          message.id = object.id >>> 0;
        if (object.amount != null)
          message.amount = object.amount >>> 0;
        return message;
      };
      Material.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.id = 0;
          object.amount = 0;
        }
        if (message.id != null && message.hasOwnProperty("id"))
          object.id = message.id;
        if (message.amount != null && message.hasOwnProperty("amount"))
          object.amount = message.amount;
        return object;
      };
      Material.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Material.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.Item.Material";
      };
      return Material;
    }();
    return Item;
  }();
  NT3.EntityItem = function() {
    function EntityItem(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    EntityItem.prototype.id = "";
    EntityItem.prototype.path = "";
    EntityItem.prototype.sprite = "";
    EntityItem.prototype.sentBy = null;
    let $oneOfFields;
    Object.defineProperty(EntityItem.prototype, "_sentBy", {
      get: $util.oneOfGetter($oneOfFields = ["sentBy"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    EntityItem.create = function create(properties) {
      return new EntityItem(properties);
    };
    EntityItem.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      if (message.path != null && Object.hasOwnProperty.call(message, "path"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.path);
      if (message.sprite != null && Object.hasOwnProperty.call(message, "sprite"))
        writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).string(message.sprite);
      if (message.sentBy != null && Object.hasOwnProperty.call(message, "sentBy"))
        writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).string(message.sentBy);
      return writer;
    };
    EntityItem.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    EntityItem.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.EntityItem();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          case 2: {
            message.path = reader.string();
            break;
          }
          case 3: {
            message.sprite = reader.string();
            break;
          }
          case 4: {
            message.sentBy = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    EntityItem.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    EntityItem.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      if (message.path != null && message.hasOwnProperty("path")) {
        if (!$util.isString(message.path))
          return "path: string expected";
      }
      if (message.sprite != null && message.hasOwnProperty("sprite")) {
        if (!$util.isString(message.sprite))
          return "sprite: string expected";
      }
      if (message.sentBy != null && message.hasOwnProperty("sentBy")) {
        properties._sentBy = 1;
        if (!$util.isString(message.sentBy))
          return "sentBy: string expected";
      }
      return null;
    };
    EntityItem.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.EntityItem)
        return object;
      let message = new $root.NT.EntityItem();
      if (object.id != null)
        message.id = String(object.id);
      if (object.path != null)
        message.path = String(object.path);
      if (object.sprite != null)
        message.sprite = String(object.sprite);
      if (object.sentBy != null)
        message.sentBy = String(object.sentBy);
      return message;
    };
    EntityItem.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.id = "";
        object.path = "";
        object.sprite = "";
      }
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      if (message.path != null && message.hasOwnProperty("path"))
        object.path = message.path;
      if (message.sprite != null && message.hasOwnProperty("sprite"))
        object.sprite = message.sprite;
      if (message.sentBy != null && message.hasOwnProperty("sentBy")) {
        object.sentBy = message.sentBy;
        if (options.oneofs)
          object._sentBy = "sentBy";
      }
      return object;
    };
    EntityItem.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    EntityItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.EntityItem";
    };
    return EntityItem;
  }();
  NT3.LobbyAction = function() {
    function LobbyAction(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    LobbyAction.prototype.cRoomCreate = null;
    LobbyAction.prototype.sRoomCreated = null;
    LobbyAction.prototype.sRoomCreateFailed = null;
    LobbyAction.prototype.cRoomUpdate = null;
    LobbyAction.prototype.sRoomUpdated = null;
    LobbyAction.prototype.sRoomUpdateFailed = null;
    LobbyAction.prototype.cRoomFlagsUpdate = null;
    LobbyAction.prototype.sRoomFlagsUpdated = null;
    LobbyAction.prototype.sRoomFlagsUpdateFailed = null;
    LobbyAction.prototype.cRoomDelete = null;
    LobbyAction.prototype.sRoomDeleted = null;
    LobbyAction.prototype.cJoinRoom = null;
    LobbyAction.prototype.sJoinRoomSuccess = null;
    LobbyAction.prototype.sJoinRoomFailed = null;
    LobbyAction.prototype.sUserJoinedRoom = null;
    LobbyAction.prototype.cLeaveRoom = null;
    LobbyAction.prototype.sUserLeftRoom = null;
    LobbyAction.prototype.cKickUser = null;
    LobbyAction.prototype.sUserKicked = null;
    LobbyAction.prototype.cBanUser = null;
    LobbyAction.prototype.sUserBanned = null;
    LobbyAction.prototype.cReadyState = null;
    LobbyAction.prototype.sUserReadyState = null;
    LobbyAction.prototype.cStartRun = null;
    LobbyAction.prototype.sHostStart = null;
    LobbyAction.prototype.cRequestRoomList = null;
    LobbyAction.prototype.sRoomList = null;
    LobbyAction.prototype.sDisconnected = null;
    LobbyAction.prototype.sRoomAddToList = null;
    LobbyAction.prototype.cRunOver = null;
    let $oneOfFields;
    Object.defineProperty(LobbyAction.prototype, "action", {
      get: $util.oneOfGetter($oneOfFields = ["cRoomCreate", "sRoomCreated", "sRoomCreateFailed", "cRoomUpdate", "sRoomUpdated", "sRoomUpdateFailed", "cRoomFlagsUpdate", "sRoomFlagsUpdated", "sRoomFlagsUpdateFailed", "cRoomDelete", "sRoomDeleted", "cJoinRoom", "sJoinRoomSuccess", "sJoinRoomFailed", "sUserJoinedRoom", "cLeaveRoom", "sUserLeftRoom", "cKickUser", "sUserKicked", "cBanUser", "sUserBanned", "cReadyState", "sUserReadyState", "cStartRun", "sHostStart", "cRequestRoomList", "sRoomList", "sDisconnected", "sRoomAddToList", "cRunOver"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    LobbyAction.create = function create(properties) {
      return new LobbyAction(properties);
    };
    LobbyAction.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.cRoomCreate != null && Object.hasOwnProperty.call(message, "cRoomCreate"))
        $root.NT.ClientRoomCreate.encode(message.cRoomCreate, writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).fork()).ldelim();
      if (message.sRoomCreated != null && Object.hasOwnProperty.call(message, "sRoomCreated"))
        $root.NT.ServerRoomCreated.encode(message.sRoomCreated, writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).fork()).ldelim();
      if (message.sRoomCreateFailed != null && Object.hasOwnProperty.call(message, "sRoomCreateFailed"))
        $root.NT.ServerRoomCreateFailed.encode(message.sRoomCreateFailed, writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).fork()).ldelim();
      if (message.cRoomUpdate != null && Object.hasOwnProperty.call(message, "cRoomUpdate"))
        $root.NT.ClientRoomUpdate.encode(message.cRoomUpdate, writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).fork()).ldelim();
      if (message.sRoomUpdated != null && Object.hasOwnProperty.call(message, "sRoomUpdated"))
        $root.NT.ServerRoomUpdated.encode(message.sRoomUpdated, writer.uint32(
          /* id 5, wireType 2 =*/
          42
        ).fork()).ldelim();
      if (message.sRoomUpdateFailed != null && Object.hasOwnProperty.call(message, "sRoomUpdateFailed"))
        $root.NT.ServerRoomUpdateFailed.encode(message.sRoomUpdateFailed, writer.uint32(
          /* id 6, wireType 2 =*/
          50
        ).fork()).ldelim();
      if (message.cRoomFlagsUpdate != null && Object.hasOwnProperty.call(message, "cRoomFlagsUpdate"))
        $root.NT.ClientRoomFlagsUpdate.encode(message.cRoomFlagsUpdate, writer.uint32(
          /* id 7, wireType 2 =*/
          58
        ).fork()).ldelim();
      if (message.sRoomFlagsUpdated != null && Object.hasOwnProperty.call(message, "sRoomFlagsUpdated"))
        $root.NT.ServerRoomFlagsUpdated.encode(message.sRoomFlagsUpdated, writer.uint32(
          /* id 8, wireType 2 =*/
          66
        ).fork()).ldelim();
      if (message.sRoomFlagsUpdateFailed != null && Object.hasOwnProperty.call(message, "sRoomFlagsUpdateFailed"))
        $root.NT.ServerRoomFlagsUpdateFailed.encode(message.sRoomFlagsUpdateFailed, writer.uint32(
          /* id 9, wireType 2 =*/
          74
        ).fork()).ldelim();
      if (message.cRoomDelete != null && Object.hasOwnProperty.call(message, "cRoomDelete"))
        $root.NT.ClientRoomDelete.encode(message.cRoomDelete, writer.uint32(
          /* id 10, wireType 2 =*/
          82
        ).fork()).ldelim();
      if (message.sRoomDeleted != null && Object.hasOwnProperty.call(message, "sRoomDeleted"))
        $root.NT.ServerRoomDeleted.encode(message.sRoomDeleted, writer.uint32(
          /* id 11, wireType 2 =*/
          90
        ).fork()).ldelim();
      if (message.cJoinRoom != null && Object.hasOwnProperty.call(message, "cJoinRoom"))
        $root.NT.ClientJoinRoom.encode(message.cJoinRoom, writer.uint32(
          /* id 12, wireType 2 =*/
          98
        ).fork()).ldelim();
      if (message.sJoinRoomSuccess != null && Object.hasOwnProperty.call(message, "sJoinRoomSuccess"))
        $root.NT.ServerJoinRoomSuccess.encode(message.sJoinRoomSuccess, writer.uint32(
          /* id 13, wireType 2 =*/
          106
        ).fork()).ldelim();
      if (message.sJoinRoomFailed != null && Object.hasOwnProperty.call(message, "sJoinRoomFailed"))
        $root.NT.ServerJoinRoomFailed.encode(message.sJoinRoomFailed, writer.uint32(
          /* id 14, wireType 2 =*/
          114
        ).fork()).ldelim();
      if (message.sUserJoinedRoom != null && Object.hasOwnProperty.call(message, "sUserJoinedRoom"))
        $root.NT.ServerUserJoinedRoom.encode(message.sUserJoinedRoom, writer.uint32(
          /* id 15, wireType 2 =*/
          122
        ).fork()).ldelim();
      if (message.cLeaveRoom != null && Object.hasOwnProperty.call(message, "cLeaveRoom"))
        $root.NT.ClientLeaveRoom.encode(message.cLeaveRoom, writer.uint32(
          /* id 16, wireType 2 =*/
          130
        ).fork()).ldelim();
      if (message.sUserLeftRoom != null && Object.hasOwnProperty.call(message, "sUserLeftRoom"))
        $root.NT.ServerUserLeftRoom.encode(message.sUserLeftRoom, writer.uint32(
          /* id 17, wireType 2 =*/
          138
        ).fork()).ldelim();
      if (message.cKickUser != null && Object.hasOwnProperty.call(message, "cKickUser"))
        $root.NT.ClientKickUser.encode(message.cKickUser, writer.uint32(
          /* id 18, wireType 2 =*/
          146
        ).fork()).ldelim();
      if (message.sUserKicked != null && Object.hasOwnProperty.call(message, "sUserKicked"))
        $root.NT.ServerUserKicked.encode(message.sUserKicked, writer.uint32(
          /* id 19, wireType 2 =*/
          154
        ).fork()).ldelim();
      if (message.cBanUser != null && Object.hasOwnProperty.call(message, "cBanUser"))
        $root.NT.ClientBanUser.encode(message.cBanUser, writer.uint32(
          /* id 20, wireType 2 =*/
          162
        ).fork()).ldelim();
      if (message.sUserBanned != null && Object.hasOwnProperty.call(message, "sUserBanned"))
        $root.NT.ServerUserBanned.encode(message.sUserBanned, writer.uint32(
          /* id 21, wireType 2 =*/
          170
        ).fork()).ldelim();
      if (message.cReadyState != null && Object.hasOwnProperty.call(message, "cReadyState"))
        $root.NT.ClientReadyState.encode(message.cReadyState, writer.uint32(
          /* id 22, wireType 2 =*/
          178
        ).fork()).ldelim();
      if (message.sUserReadyState != null && Object.hasOwnProperty.call(message, "sUserReadyState"))
        $root.NT.ServerUserReadyState.encode(message.sUserReadyState, writer.uint32(
          /* id 23, wireType 2 =*/
          186
        ).fork()).ldelim();
      if (message.cStartRun != null && Object.hasOwnProperty.call(message, "cStartRun"))
        $root.NT.ClientStartRun.encode(message.cStartRun, writer.uint32(
          /* id 24, wireType 2 =*/
          194
        ).fork()).ldelim();
      if (message.sHostStart != null && Object.hasOwnProperty.call(message, "sHostStart"))
        $root.NT.ServerHostStart.encode(message.sHostStart, writer.uint32(
          /* id 25, wireType 2 =*/
          202
        ).fork()).ldelim();
      if (message.cRequestRoomList != null && Object.hasOwnProperty.call(message, "cRequestRoomList"))
        $root.NT.ClientRequestRoomList.encode(message.cRequestRoomList, writer.uint32(
          /* id 27, wireType 2 =*/
          218
        ).fork()).ldelim();
      if (message.sRoomList != null && Object.hasOwnProperty.call(message, "sRoomList"))
        $root.NT.ServerRoomList.encode(message.sRoomList, writer.uint32(
          /* id 28, wireType 2 =*/
          226
        ).fork()).ldelim();
      if (message.sDisconnected != null && Object.hasOwnProperty.call(message, "sDisconnected"))
        $root.NT.ServerDisconnected.encode(message.sDisconnected, writer.uint32(
          /* id 31, wireType 2 =*/
          250
        ).fork()).ldelim();
      if (message.sRoomAddToList != null && Object.hasOwnProperty.call(message, "sRoomAddToList"))
        $root.NT.ServerRoomAddToList.encode(message.sRoomAddToList, writer.uint32(
          /* id 32, wireType 2 =*/
          258
        ).fork()).ldelim();
      if (message.cRunOver != null && Object.hasOwnProperty.call(message, "cRunOver"))
        $root.NT.ClientRunOver.encode(message.cRunOver, writer.uint32(
          /* id 33, wireType 2 =*/
          266
        ).fork()).ldelim();
      return writer;
    };
    LobbyAction.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    LobbyAction.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.LobbyAction();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.cRoomCreate = $root.NT.ClientRoomCreate.decode(reader, reader.uint32());
            break;
          }
          case 2: {
            message.sRoomCreated = $root.NT.ServerRoomCreated.decode(reader, reader.uint32());
            break;
          }
          case 3: {
            message.sRoomCreateFailed = $root.NT.ServerRoomCreateFailed.decode(reader, reader.uint32());
            break;
          }
          case 4: {
            message.cRoomUpdate = $root.NT.ClientRoomUpdate.decode(reader, reader.uint32());
            break;
          }
          case 5: {
            message.sRoomUpdated = $root.NT.ServerRoomUpdated.decode(reader, reader.uint32());
            break;
          }
          case 6: {
            message.sRoomUpdateFailed = $root.NT.ServerRoomUpdateFailed.decode(reader, reader.uint32());
            break;
          }
          case 7: {
            message.cRoomFlagsUpdate = $root.NT.ClientRoomFlagsUpdate.decode(reader, reader.uint32());
            break;
          }
          case 8: {
            message.sRoomFlagsUpdated = $root.NT.ServerRoomFlagsUpdated.decode(reader, reader.uint32());
            break;
          }
          case 9: {
            message.sRoomFlagsUpdateFailed = $root.NT.ServerRoomFlagsUpdateFailed.decode(reader, reader.uint32());
            break;
          }
          case 10: {
            message.cRoomDelete = $root.NT.ClientRoomDelete.decode(reader, reader.uint32());
            break;
          }
          case 11: {
            message.sRoomDeleted = $root.NT.ServerRoomDeleted.decode(reader, reader.uint32());
            break;
          }
          case 12: {
            message.cJoinRoom = $root.NT.ClientJoinRoom.decode(reader, reader.uint32());
            break;
          }
          case 13: {
            message.sJoinRoomSuccess = $root.NT.ServerJoinRoomSuccess.decode(reader, reader.uint32());
            break;
          }
          case 14: {
            message.sJoinRoomFailed = $root.NT.ServerJoinRoomFailed.decode(reader, reader.uint32());
            break;
          }
          case 15: {
            message.sUserJoinedRoom = $root.NT.ServerUserJoinedRoom.decode(reader, reader.uint32());
            break;
          }
          case 16: {
            message.cLeaveRoom = $root.NT.ClientLeaveRoom.decode(reader, reader.uint32());
            break;
          }
          case 17: {
            message.sUserLeftRoom = $root.NT.ServerUserLeftRoom.decode(reader, reader.uint32());
            break;
          }
          case 18: {
            message.cKickUser = $root.NT.ClientKickUser.decode(reader, reader.uint32());
            break;
          }
          case 19: {
            message.sUserKicked = $root.NT.ServerUserKicked.decode(reader, reader.uint32());
            break;
          }
          case 20: {
            message.cBanUser = $root.NT.ClientBanUser.decode(reader, reader.uint32());
            break;
          }
          case 21: {
            message.sUserBanned = $root.NT.ServerUserBanned.decode(reader, reader.uint32());
            break;
          }
          case 22: {
            message.cReadyState = $root.NT.ClientReadyState.decode(reader, reader.uint32());
            break;
          }
          case 23: {
            message.sUserReadyState = $root.NT.ServerUserReadyState.decode(reader, reader.uint32());
            break;
          }
          case 24: {
            message.cStartRun = $root.NT.ClientStartRun.decode(reader, reader.uint32());
            break;
          }
          case 25: {
            message.sHostStart = $root.NT.ServerHostStart.decode(reader, reader.uint32());
            break;
          }
          case 27: {
            message.cRequestRoomList = $root.NT.ClientRequestRoomList.decode(reader, reader.uint32());
            break;
          }
          case 28: {
            message.sRoomList = $root.NT.ServerRoomList.decode(reader, reader.uint32());
            break;
          }
          case 31: {
            message.sDisconnected = $root.NT.ServerDisconnected.decode(reader, reader.uint32());
            break;
          }
          case 32: {
            message.sRoomAddToList = $root.NT.ServerRoomAddToList.decode(reader, reader.uint32());
            break;
          }
          case 33: {
            message.cRunOver = $root.NT.ClientRunOver.decode(reader, reader.uint32());
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    LobbyAction.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    LobbyAction.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.cRoomCreate != null && message.hasOwnProperty("cRoomCreate")) {
        properties.action = 1;
        {
          let error = $root.NT.ClientRoomCreate.verify(message.cRoomCreate);
          if (error)
            return "cRoomCreate." + error;
        }
      }
      if (message.sRoomCreated != null && message.hasOwnProperty("sRoomCreated")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerRoomCreated.verify(message.sRoomCreated);
          if (error)
            return "sRoomCreated." + error;
        }
      }
      if (message.sRoomCreateFailed != null && message.hasOwnProperty("sRoomCreateFailed")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerRoomCreateFailed.verify(message.sRoomCreateFailed);
          if (error)
            return "sRoomCreateFailed." + error;
        }
      }
      if (message.cRoomUpdate != null && message.hasOwnProperty("cRoomUpdate")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientRoomUpdate.verify(message.cRoomUpdate);
          if (error)
            return "cRoomUpdate." + error;
        }
      }
      if (message.sRoomUpdated != null && message.hasOwnProperty("sRoomUpdated")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerRoomUpdated.verify(message.sRoomUpdated);
          if (error)
            return "sRoomUpdated." + error;
        }
      }
      if (message.sRoomUpdateFailed != null && message.hasOwnProperty("sRoomUpdateFailed")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerRoomUpdateFailed.verify(message.sRoomUpdateFailed);
          if (error)
            return "sRoomUpdateFailed." + error;
        }
      }
      if (message.cRoomFlagsUpdate != null && message.hasOwnProperty("cRoomFlagsUpdate")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientRoomFlagsUpdate.verify(message.cRoomFlagsUpdate);
          if (error)
            return "cRoomFlagsUpdate." + error;
        }
      }
      if (message.sRoomFlagsUpdated != null && message.hasOwnProperty("sRoomFlagsUpdated")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerRoomFlagsUpdated.verify(message.sRoomFlagsUpdated);
          if (error)
            return "sRoomFlagsUpdated." + error;
        }
      }
      if (message.sRoomFlagsUpdateFailed != null && message.hasOwnProperty("sRoomFlagsUpdateFailed")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerRoomFlagsUpdateFailed.verify(message.sRoomFlagsUpdateFailed);
          if (error)
            return "sRoomFlagsUpdateFailed." + error;
        }
      }
      if (message.cRoomDelete != null && message.hasOwnProperty("cRoomDelete")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientRoomDelete.verify(message.cRoomDelete);
          if (error)
            return "cRoomDelete." + error;
        }
      }
      if (message.sRoomDeleted != null && message.hasOwnProperty("sRoomDeleted")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerRoomDeleted.verify(message.sRoomDeleted);
          if (error)
            return "sRoomDeleted." + error;
        }
      }
      if (message.cJoinRoom != null && message.hasOwnProperty("cJoinRoom")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientJoinRoom.verify(message.cJoinRoom);
          if (error)
            return "cJoinRoom." + error;
        }
      }
      if (message.sJoinRoomSuccess != null && message.hasOwnProperty("sJoinRoomSuccess")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerJoinRoomSuccess.verify(message.sJoinRoomSuccess);
          if (error)
            return "sJoinRoomSuccess." + error;
        }
      }
      if (message.sJoinRoomFailed != null && message.hasOwnProperty("sJoinRoomFailed")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerJoinRoomFailed.verify(message.sJoinRoomFailed);
          if (error)
            return "sJoinRoomFailed." + error;
        }
      }
      if (message.sUserJoinedRoom != null && message.hasOwnProperty("sUserJoinedRoom")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerUserJoinedRoom.verify(message.sUserJoinedRoom);
          if (error)
            return "sUserJoinedRoom." + error;
        }
      }
      if (message.cLeaveRoom != null && message.hasOwnProperty("cLeaveRoom")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientLeaveRoom.verify(message.cLeaveRoom);
          if (error)
            return "cLeaveRoom." + error;
        }
      }
      if (message.sUserLeftRoom != null && message.hasOwnProperty("sUserLeftRoom")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerUserLeftRoom.verify(message.sUserLeftRoom);
          if (error)
            return "sUserLeftRoom." + error;
        }
      }
      if (message.cKickUser != null && message.hasOwnProperty("cKickUser")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientKickUser.verify(message.cKickUser);
          if (error)
            return "cKickUser." + error;
        }
      }
      if (message.sUserKicked != null && message.hasOwnProperty("sUserKicked")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerUserKicked.verify(message.sUserKicked);
          if (error)
            return "sUserKicked." + error;
        }
      }
      if (message.cBanUser != null && message.hasOwnProperty("cBanUser")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientBanUser.verify(message.cBanUser);
          if (error)
            return "cBanUser." + error;
        }
      }
      if (message.sUserBanned != null && message.hasOwnProperty("sUserBanned")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerUserBanned.verify(message.sUserBanned);
          if (error)
            return "sUserBanned." + error;
        }
      }
      if (message.cReadyState != null && message.hasOwnProperty("cReadyState")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientReadyState.verify(message.cReadyState);
          if (error)
            return "cReadyState." + error;
        }
      }
      if (message.sUserReadyState != null && message.hasOwnProperty("sUserReadyState")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerUserReadyState.verify(message.sUserReadyState);
          if (error)
            return "sUserReadyState." + error;
        }
      }
      if (message.cStartRun != null && message.hasOwnProperty("cStartRun")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientStartRun.verify(message.cStartRun);
          if (error)
            return "cStartRun." + error;
        }
      }
      if (message.sHostStart != null && message.hasOwnProperty("sHostStart")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerHostStart.verify(message.sHostStart);
          if (error)
            return "sHostStart." + error;
        }
      }
      if (message.cRequestRoomList != null && message.hasOwnProperty("cRequestRoomList")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientRequestRoomList.verify(message.cRequestRoomList);
          if (error)
            return "cRequestRoomList." + error;
        }
      }
      if (message.sRoomList != null && message.hasOwnProperty("sRoomList")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerRoomList.verify(message.sRoomList);
          if (error)
            return "sRoomList." + error;
        }
      }
      if (message.sDisconnected != null && message.hasOwnProperty("sDisconnected")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerDisconnected.verify(message.sDisconnected);
          if (error)
            return "sDisconnected." + error;
        }
      }
      if (message.sRoomAddToList != null && message.hasOwnProperty("sRoomAddToList")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ServerRoomAddToList.verify(message.sRoomAddToList);
          if (error)
            return "sRoomAddToList." + error;
        }
      }
      if (message.cRunOver != null && message.hasOwnProperty("cRunOver")) {
        if (properties.action === 1)
          return "action: multiple values";
        properties.action = 1;
        {
          let error = $root.NT.ClientRunOver.verify(message.cRunOver);
          if (error)
            return "cRunOver." + error;
        }
      }
      return null;
    };
    LobbyAction.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.LobbyAction)
        return object;
      let message = new $root.NT.LobbyAction();
      if (object.cRoomCreate != null) {
        if (typeof object.cRoomCreate !== "object")
          throw TypeError(".NT.LobbyAction.cRoomCreate: object expected");
        message.cRoomCreate = $root.NT.ClientRoomCreate.fromObject(object.cRoomCreate);
      }
      if (object.sRoomCreated != null) {
        if (typeof object.sRoomCreated !== "object")
          throw TypeError(".NT.LobbyAction.sRoomCreated: object expected");
        message.sRoomCreated = $root.NT.ServerRoomCreated.fromObject(object.sRoomCreated);
      }
      if (object.sRoomCreateFailed != null) {
        if (typeof object.sRoomCreateFailed !== "object")
          throw TypeError(".NT.LobbyAction.sRoomCreateFailed: object expected");
        message.sRoomCreateFailed = $root.NT.ServerRoomCreateFailed.fromObject(object.sRoomCreateFailed);
      }
      if (object.cRoomUpdate != null) {
        if (typeof object.cRoomUpdate !== "object")
          throw TypeError(".NT.LobbyAction.cRoomUpdate: object expected");
        message.cRoomUpdate = $root.NT.ClientRoomUpdate.fromObject(object.cRoomUpdate);
      }
      if (object.sRoomUpdated != null) {
        if (typeof object.sRoomUpdated !== "object")
          throw TypeError(".NT.LobbyAction.sRoomUpdated: object expected");
        message.sRoomUpdated = $root.NT.ServerRoomUpdated.fromObject(object.sRoomUpdated);
      }
      if (object.sRoomUpdateFailed != null) {
        if (typeof object.sRoomUpdateFailed !== "object")
          throw TypeError(".NT.LobbyAction.sRoomUpdateFailed: object expected");
        message.sRoomUpdateFailed = $root.NT.ServerRoomUpdateFailed.fromObject(object.sRoomUpdateFailed);
      }
      if (object.cRoomFlagsUpdate != null) {
        if (typeof object.cRoomFlagsUpdate !== "object")
          throw TypeError(".NT.LobbyAction.cRoomFlagsUpdate: object expected");
        message.cRoomFlagsUpdate = $root.NT.ClientRoomFlagsUpdate.fromObject(object.cRoomFlagsUpdate);
      }
      if (object.sRoomFlagsUpdated != null) {
        if (typeof object.sRoomFlagsUpdated !== "object")
          throw TypeError(".NT.LobbyAction.sRoomFlagsUpdated: object expected");
        message.sRoomFlagsUpdated = $root.NT.ServerRoomFlagsUpdated.fromObject(object.sRoomFlagsUpdated);
      }
      if (object.sRoomFlagsUpdateFailed != null) {
        if (typeof object.sRoomFlagsUpdateFailed !== "object")
          throw TypeError(".NT.LobbyAction.sRoomFlagsUpdateFailed: object expected");
        message.sRoomFlagsUpdateFailed = $root.NT.ServerRoomFlagsUpdateFailed.fromObject(object.sRoomFlagsUpdateFailed);
      }
      if (object.cRoomDelete != null) {
        if (typeof object.cRoomDelete !== "object")
          throw TypeError(".NT.LobbyAction.cRoomDelete: object expected");
        message.cRoomDelete = $root.NT.ClientRoomDelete.fromObject(object.cRoomDelete);
      }
      if (object.sRoomDeleted != null) {
        if (typeof object.sRoomDeleted !== "object")
          throw TypeError(".NT.LobbyAction.sRoomDeleted: object expected");
        message.sRoomDeleted = $root.NT.ServerRoomDeleted.fromObject(object.sRoomDeleted);
      }
      if (object.cJoinRoom != null) {
        if (typeof object.cJoinRoom !== "object")
          throw TypeError(".NT.LobbyAction.cJoinRoom: object expected");
        message.cJoinRoom = $root.NT.ClientJoinRoom.fromObject(object.cJoinRoom);
      }
      if (object.sJoinRoomSuccess != null) {
        if (typeof object.sJoinRoomSuccess !== "object")
          throw TypeError(".NT.LobbyAction.sJoinRoomSuccess: object expected");
        message.sJoinRoomSuccess = $root.NT.ServerJoinRoomSuccess.fromObject(object.sJoinRoomSuccess);
      }
      if (object.sJoinRoomFailed != null) {
        if (typeof object.sJoinRoomFailed !== "object")
          throw TypeError(".NT.LobbyAction.sJoinRoomFailed: object expected");
        message.sJoinRoomFailed = $root.NT.ServerJoinRoomFailed.fromObject(object.sJoinRoomFailed);
      }
      if (object.sUserJoinedRoom != null) {
        if (typeof object.sUserJoinedRoom !== "object")
          throw TypeError(".NT.LobbyAction.sUserJoinedRoom: object expected");
        message.sUserJoinedRoom = $root.NT.ServerUserJoinedRoom.fromObject(object.sUserJoinedRoom);
      }
      if (object.cLeaveRoom != null) {
        if (typeof object.cLeaveRoom !== "object")
          throw TypeError(".NT.LobbyAction.cLeaveRoom: object expected");
        message.cLeaveRoom = $root.NT.ClientLeaveRoom.fromObject(object.cLeaveRoom);
      }
      if (object.sUserLeftRoom != null) {
        if (typeof object.sUserLeftRoom !== "object")
          throw TypeError(".NT.LobbyAction.sUserLeftRoom: object expected");
        message.sUserLeftRoom = $root.NT.ServerUserLeftRoom.fromObject(object.sUserLeftRoom);
      }
      if (object.cKickUser != null) {
        if (typeof object.cKickUser !== "object")
          throw TypeError(".NT.LobbyAction.cKickUser: object expected");
        message.cKickUser = $root.NT.ClientKickUser.fromObject(object.cKickUser);
      }
      if (object.sUserKicked != null) {
        if (typeof object.sUserKicked !== "object")
          throw TypeError(".NT.LobbyAction.sUserKicked: object expected");
        message.sUserKicked = $root.NT.ServerUserKicked.fromObject(object.sUserKicked);
      }
      if (object.cBanUser != null) {
        if (typeof object.cBanUser !== "object")
          throw TypeError(".NT.LobbyAction.cBanUser: object expected");
        message.cBanUser = $root.NT.ClientBanUser.fromObject(object.cBanUser);
      }
      if (object.sUserBanned != null) {
        if (typeof object.sUserBanned !== "object")
          throw TypeError(".NT.LobbyAction.sUserBanned: object expected");
        message.sUserBanned = $root.NT.ServerUserBanned.fromObject(object.sUserBanned);
      }
      if (object.cReadyState != null) {
        if (typeof object.cReadyState !== "object")
          throw TypeError(".NT.LobbyAction.cReadyState: object expected");
        message.cReadyState = $root.NT.ClientReadyState.fromObject(object.cReadyState);
      }
      if (object.sUserReadyState != null) {
        if (typeof object.sUserReadyState !== "object")
          throw TypeError(".NT.LobbyAction.sUserReadyState: object expected");
        message.sUserReadyState = $root.NT.ServerUserReadyState.fromObject(object.sUserReadyState);
      }
      if (object.cStartRun != null) {
        if (typeof object.cStartRun !== "object")
          throw TypeError(".NT.LobbyAction.cStartRun: object expected");
        message.cStartRun = $root.NT.ClientStartRun.fromObject(object.cStartRun);
      }
      if (object.sHostStart != null) {
        if (typeof object.sHostStart !== "object")
          throw TypeError(".NT.LobbyAction.sHostStart: object expected");
        message.sHostStart = $root.NT.ServerHostStart.fromObject(object.sHostStart);
      }
      if (object.cRequestRoomList != null) {
        if (typeof object.cRequestRoomList !== "object")
          throw TypeError(".NT.LobbyAction.cRequestRoomList: object expected");
        message.cRequestRoomList = $root.NT.ClientRequestRoomList.fromObject(object.cRequestRoomList);
      }
      if (object.sRoomList != null) {
        if (typeof object.sRoomList !== "object")
          throw TypeError(".NT.LobbyAction.sRoomList: object expected");
        message.sRoomList = $root.NT.ServerRoomList.fromObject(object.sRoomList);
      }
      if (object.sDisconnected != null) {
        if (typeof object.sDisconnected !== "object")
          throw TypeError(".NT.LobbyAction.sDisconnected: object expected");
        message.sDisconnected = $root.NT.ServerDisconnected.fromObject(object.sDisconnected);
      }
      if (object.sRoomAddToList != null) {
        if (typeof object.sRoomAddToList !== "object")
          throw TypeError(".NT.LobbyAction.sRoomAddToList: object expected");
        message.sRoomAddToList = $root.NT.ServerRoomAddToList.fromObject(object.sRoomAddToList);
      }
      if (object.cRunOver != null) {
        if (typeof object.cRunOver !== "object")
          throw TypeError(".NT.LobbyAction.cRunOver: object expected");
        message.cRunOver = $root.NT.ClientRunOver.fromObject(object.cRunOver);
      }
      return message;
    };
    LobbyAction.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (message.cRoomCreate != null && message.hasOwnProperty("cRoomCreate")) {
        object.cRoomCreate = $root.NT.ClientRoomCreate.toObject(message.cRoomCreate, options);
        if (options.oneofs)
          object.action = "cRoomCreate";
      }
      if (message.sRoomCreated != null && message.hasOwnProperty("sRoomCreated")) {
        object.sRoomCreated = $root.NT.ServerRoomCreated.toObject(message.sRoomCreated, options);
        if (options.oneofs)
          object.action = "sRoomCreated";
      }
      if (message.sRoomCreateFailed != null && message.hasOwnProperty("sRoomCreateFailed")) {
        object.sRoomCreateFailed = $root.NT.ServerRoomCreateFailed.toObject(message.sRoomCreateFailed, options);
        if (options.oneofs)
          object.action = "sRoomCreateFailed";
      }
      if (message.cRoomUpdate != null && message.hasOwnProperty("cRoomUpdate")) {
        object.cRoomUpdate = $root.NT.ClientRoomUpdate.toObject(message.cRoomUpdate, options);
        if (options.oneofs)
          object.action = "cRoomUpdate";
      }
      if (message.sRoomUpdated != null && message.hasOwnProperty("sRoomUpdated")) {
        object.sRoomUpdated = $root.NT.ServerRoomUpdated.toObject(message.sRoomUpdated, options);
        if (options.oneofs)
          object.action = "sRoomUpdated";
      }
      if (message.sRoomUpdateFailed != null && message.hasOwnProperty("sRoomUpdateFailed")) {
        object.sRoomUpdateFailed = $root.NT.ServerRoomUpdateFailed.toObject(message.sRoomUpdateFailed, options);
        if (options.oneofs)
          object.action = "sRoomUpdateFailed";
      }
      if (message.cRoomFlagsUpdate != null && message.hasOwnProperty("cRoomFlagsUpdate")) {
        object.cRoomFlagsUpdate = $root.NT.ClientRoomFlagsUpdate.toObject(message.cRoomFlagsUpdate, options);
        if (options.oneofs)
          object.action = "cRoomFlagsUpdate";
      }
      if (message.sRoomFlagsUpdated != null && message.hasOwnProperty("sRoomFlagsUpdated")) {
        object.sRoomFlagsUpdated = $root.NT.ServerRoomFlagsUpdated.toObject(message.sRoomFlagsUpdated, options);
        if (options.oneofs)
          object.action = "sRoomFlagsUpdated";
      }
      if (message.sRoomFlagsUpdateFailed != null && message.hasOwnProperty("sRoomFlagsUpdateFailed")) {
        object.sRoomFlagsUpdateFailed = $root.NT.ServerRoomFlagsUpdateFailed.toObject(message.sRoomFlagsUpdateFailed, options);
        if (options.oneofs)
          object.action = "sRoomFlagsUpdateFailed";
      }
      if (message.cRoomDelete != null && message.hasOwnProperty("cRoomDelete")) {
        object.cRoomDelete = $root.NT.ClientRoomDelete.toObject(message.cRoomDelete, options);
        if (options.oneofs)
          object.action = "cRoomDelete";
      }
      if (message.sRoomDeleted != null && message.hasOwnProperty("sRoomDeleted")) {
        object.sRoomDeleted = $root.NT.ServerRoomDeleted.toObject(message.sRoomDeleted, options);
        if (options.oneofs)
          object.action = "sRoomDeleted";
      }
      if (message.cJoinRoom != null && message.hasOwnProperty("cJoinRoom")) {
        object.cJoinRoom = $root.NT.ClientJoinRoom.toObject(message.cJoinRoom, options);
        if (options.oneofs)
          object.action = "cJoinRoom";
      }
      if (message.sJoinRoomSuccess != null && message.hasOwnProperty("sJoinRoomSuccess")) {
        object.sJoinRoomSuccess = $root.NT.ServerJoinRoomSuccess.toObject(message.sJoinRoomSuccess, options);
        if (options.oneofs)
          object.action = "sJoinRoomSuccess";
      }
      if (message.sJoinRoomFailed != null && message.hasOwnProperty("sJoinRoomFailed")) {
        object.sJoinRoomFailed = $root.NT.ServerJoinRoomFailed.toObject(message.sJoinRoomFailed, options);
        if (options.oneofs)
          object.action = "sJoinRoomFailed";
      }
      if (message.sUserJoinedRoom != null && message.hasOwnProperty("sUserJoinedRoom")) {
        object.sUserJoinedRoom = $root.NT.ServerUserJoinedRoom.toObject(message.sUserJoinedRoom, options);
        if (options.oneofs)
          object.action = "sUserJoinedRoom";
      }
      if (message.cLeaveRoom != null && message.hasOwnProperty("cLeaveRoom")) {
        object.cLeaveRoom = $root.NT.ClientLeaveRoom.toObject(message.cLeaveRoom, options);
        if (options.oneofs)
          object.action = "cLeaveRoom";
      }
      if (message.sUserLeftRoom != null && message.hasOwnProperty("sUserLeftRoom")) {
        object.sUserLeftRoom = $root.NT.ServerUserLeftRoom.toObject(message.sUserLeftRoom, options);
        if (options.oneofs)
          object.action = "sUserLeftRoom";
      }
      if (message.cKickUser != null && message.hasOwnProperty("cKickUser")) {
        object.cKickUser = $root.NT.ClientKickUser.toObject(message.cKickUser, options);
        if (options.oneofs)
          object.action = "cKickUser";
      }
      if (message.sUserKicked != null && message.hasOwnProperty("sUserKicked")) {
        object.sUserKicked = $root.NT.ServerUserKicked.toObject(message.sUserKicked, options);
        if (options.oneofs)
          object.action = "sUserKicked";
      }
      if (message.cBanUser != null && message.hasOwnProperty("cBanUser")) {
        object.cBanUser = $root.NT.ClientBanUser.toObject(message.cBanUser, options);
        if (options.oneofs)
          object.action = "cBanUser";
      }
      if (message.sUserBanned != null && message.hasOwnProperty("sUserBanned")) {
        object.sUserBanned = $root.NT.ServerUserBanned.toObject(message.sUserBanned, options);
        if (options.oneofs)
          object.action = "sUserBanned";
      }
      if (message.cReadyState != null && message.hasOwnProperty("cReadyState")) {
        object.cReadyState = $root.NT.ClientReadyState.toObject(message.cReadyState, options);
        if (options.oneofs)
          object.action = "cReadyState";
      }
      if (message.sUserReadyState != null && message.hasOwnProperty("sUserReadyState")) {
        object.sUserReadyState = $root.NT.ServerUserReadyState.toObject(message.sUserReadyState, options);
        if (options.oneofs)
          object.action = "sUserReadyState";
      }
      if (message.cStartRun != null && message.hasOwnProperty("cStartRun")) {
        object.cStartRun = $root.NT.ClientStartRun.toObject(message.cStartRun, options);
        if (options.oneofs)
          object.action = "cStartRun";
      }
      if (message.sHostStart != null && message.hasOwnProperty("sHostStart")) {
        object.sHostStart = $root.NT.ServerHostStart.toObject(message.sHostStart, options);
        if (options.oneofs)
          object.action = "sHostStart";
      }
      if (message.cRequestRoomList != null && message.hasOwnProperty("cRequestRoomList")) {
        object.cRequestRoomList = $root.NT.ClientRequestRoomList.toObject(message.cRequestRoomList, options);
        if (options.oneofs)
          object.action = "cRequestRoomList";
      }
      if (message.sRoomList != null && message.hasOwnProperty("sRoomList")) {
        object.sRoomList = $root.NT.ServerRoomList.toObject(message.sRoomList, options);
        if (options.oneofs)
          object.action = "sRoomList";
      }
      if (message.sDisconnected != null && message.hasOwnProperty("sDisconnected")) {
        object.sDisconnected = $root.NT.ServerDisconnected.toObject(message.sDisconnected, options);
        if (options.oneofs)
          object.action = "sDisconnected";
      }
      if (message.sRoomAddToList != null && message.hasOwnProperty("sRoomAddToList")) {
        object.sRoomAddToList = $root.NT.ServerRoomAddToList.toObject(message.sRoomAddToList, options);
        if (options.oneofs)
          object.action = "sRoomAddToList";
      }
      if (message.cRunOver != null && message.hasOwnProperty("cRunOver")) {
        object.cRunOver = $root.NT.ClientRunOver.toObject(message.cRunOver, options);
        if (options.oneofs)
          object.action = "cRunOver";
      }
      return object;
    };
    LobbyAction.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    LobbyAction.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.LobbyAction";
    };
    return LobbyAction;
  }();
  NT3.ClientRunOver = function() {
    function ClientRunOver(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientRunOver.prototype.idk = null;
    let $oneOfFields;
    Object.defineProperty(ClientRunOver.prototype, "_idk", {
      get: $util.oneOfGetter($oneOfFields = ["idk"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ClientRunOver.create = function create(properties) {
      return new ClientRunOver(properties);
    };
    ClientRunOver.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.idk != null && Object.hasOwnProperty.call(message, "idk"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).bool(message.idk);
      return writer;
    };
    ClientRunOver.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientRunOver.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientRunOver();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.idk = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientRunOver.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientRunOver.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.idk != null && message.hasOwnProperty("idk")) {
        properties._idk = 1;
        if (typeof message.idk !== "boolean")
          return "idk: boolean expected";
      }
      return null;
    };
    ClientRunOver.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientRunOver)
        return object;
      let message = new $root.NT.ClientRunOver();
      if (object.idk != null)
        message.idk = Boolean(object.idk);
      return message;
    };
    ClientRunOver.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (message.idk != null && message.hasOwnProperty("idk")) {
        object.idk = message.idk;
        if (options.oneofs)
          object._idk = "idk";
      }
      return object;
    };
    ClientRunOver.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientRunOver.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientRunOver";
    };
    return ClientRunOver;
  }();
  NT3.ServerDisconnected = function() {
    function ServerDisconnected(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerDisconnected.prototype.reason = "";
    ServerDisconnected.create = function create(properties) {
      return new ServerDisconnected(properties);
    };
    ServerDisconnected.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.reason != null && Object.hasOwnProperty.call(message, "reason"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.reason);
      return writer;
    };
    ServerDisconnected.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerDisconnected.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerDisconnected();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.reason = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerDisconnected.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerDisconnected.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.reason != null && message.hasOwnProperty("reason")) {
        if (!$util.isString(message.reason))
          return "reason: string expected";
      }
      return null;
    };
    ServerDisconnected.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerDisconnected)
        return object;
      let message = new $root.NT.ServerDisconnected();
      if (object.reason != null)
        message.reason = String(object.reason);
      return message;
    };
    ServerDisconnected.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.reason = "";
      if (message.reason != null && message.hasOwnProperty("reason"))
        object.reason = message.reason;
      return object;
    };
    ServerDisconnected.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerDisconnected.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerDisconnected";
    };
    return ServerDisconnected;
  }();
  NT3.ClientRoomDelete = function() {
    function ClientRoomDelete(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientRoomDelete.prototype.id = "";
    ClientRoomDelete.create = function create(properties) {
      return new ClientRoomDelete(properties);
    };
    ClientRoomDelete.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      return writer;
    };
    ClientRoomDelete.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientRoomDelete.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientRoomDelete();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientRoomDelete.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientRoomDelete.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      return null;
    };
    ClientRoomDelete.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientRoomDelete)
        return object;
      let message = new $root.NT.ClientRoomDelete();
      if (object.id != null)
        message.id = String(object.id);
      return message;
    };
    ClientRoomDelete.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.id = "";
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      return object;
    };
    ClientRoomDelete.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientRoomDelete.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientRoomDelete";
    };
    return ClientRoomDelete;
  }();
  NT3.ServerRoomDeleted = function() {
    function ServerRoomDeleted(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerRoomDeleted.prototype.id = "";
    ServerRoomDeleted.create = function create(properties) {
      return new ServerRoomDeleted(properties);
    };
    ServerRoomDeleted.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      return writer;
    };
    ServerRoomDeleted.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerRoomDeleted.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomDeleted();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerRoomDeleted.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerRoomDeleted.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      return null;
    };
    ServerRoomDeleted.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerRoomDeleted)
        return object;
      let message = new $root.NT.ServerRoomDeleted();
      if (object.id != null)
        message.id = String(object.id);
      return message;
    };
    ServerRoomDeleted.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.id = "";
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      return object;
    };
    ServerRoomDeleted.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerRoomDeleted.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerRoomDeleted";
    };
    return ServerRoomDeleted;
  }();
  NT3.ClientRoomCreate = function() {
    function ClientRoomCreate(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientRoomCreate.prototype.name = "";
    ClientRoomCreate.prototype.gamemode = 0;
    ClientRoomCreate.prototype.maxUsers = 0;
    ClientRoomCreate.prototype.password = null;
    let $oneOfFields;
    Object.defineProperty(ClientRoomCreate.prototype, "_password", {
      get: $util.oneOfGetter($oneOfFields = ["password"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ClientRoomCreate.create = function create(properties) {
      return new ClientRoomCreate(properties);
    };
    ClientRoomCreate.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.name != null && Object.hasOwnProperty.call(message, "name"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.name);
      if (message.gamemode != null && Object.hasOwnProperty.call(message, "gamemode"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.gamemode);
      if (message.maxUsers != null && Object.hasOwnProperty.call(message, "maxUsers"))
        writer.uint32(
          /* id 3, wireType 0 =*/
          24
        ).uint32(message.maxUsers);
      if (message.password != null && Object.hasOwnProperty.call(message, "password"))
        writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).string(message.password);
      return writer;
    };
    ClientRoomCreate.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientRoomCreate.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientRoomCreate();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.name = reader.string();
            break;
          }
          case 2: {
            message.gamemode = reader.uint32();
            break;
          }
          case 3: {
            message.maxUsers = reader.uint32();
            break;
          }
          case 4: {
            message.password = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientRoomCreate.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientRoomCreate.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.name != null && message.hasOwnProperty("name")) {
        if (!$util.isString(message.name))
          return "name: string expected";
      }
      if (message.gamemode != null && message.hasOwnProperty("gamemode")) {
        if (!$util.isInteger(message.gamemode))
          return "gamemode: integer expected";
      }
      if (message.maxUsers != null && message.hasOwnProperty("maxUsers")) {
        if (!$util.isInteger(message.maxUsers))
          return "maxUsers: integer expected";
      }
      if (message.password != null && message.hasOwnProperty("password")) {
        properties._password = 1;
        if (!$util.isString(message.password))
          return "password: string expected";
      }
      return null;
    };
    ClientRoomCreate.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientRoomCreate)
        return object;
      let message = new $root.NT.ClientRoomCreate();
      if (object.name != null)
        message.name = String(object.name);
      if (object.gamemode != null)
        message.gamemode = object.gamemode >>> 0;
      if (object.maxUsers != null)
        message.maxUsers = object.maxUsers >>> 0;
      if (object.password != null)
        message.password = String(object.password);
      return message;
    };
    ClientRoomCreate.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.name = "";
        object.gamemode = 0;
        object.maxUsers = 0;
      }
      if (message.name != null && message.hasOwnProperty("name"))
        object.name = message.name;
      if (message.gamemode != null && message.hasOwnProperty("gamemode"))
        object.gamemode = message.gamemode;
      if (message.maxUsers != null && message.hasOwnProperty("maxUsers"))
        object.maxUsers = message.maxUsers;
      if (message.password != null && message.hasOwnProperty("password")) {
        object.password = message.password;
        if (options.oneofs)
          object._password = "password";
      }
      return object;
    };
    ClientRoomCreate.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientRoomCreate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientRoomCreate";
    };
    return ClientRoomCreate;
  }();
  NT3.ServerRoomCreated = function() {
    function ServerRoomCreated(properties) {
      this.users = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerRoomCreated.prototype.id = "";
    ServerRoomCreated.prototype.name = "";
    ServerRoomCreated.prototype.gamemode = 0;
    ServerRoomCreated.prototype.maxUsers = 0;
    ServerRoomCreated.prototype.password = null;
    ServerRoomCreated.prototype.locked = false;
    ServerRoomCreated.prototype.users = $util.emptyArray;
    let $oneOfFields;
    Object.defineProperty(ServerRoomCreated.prototype, "_password", {
      get: $util.oneOfGetter($oneOfFields = ["password"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ServerRoomCreated.create = function create(properties) {
      return new ServerRoomCreated(properties);
    };
    ServerRoomCreated.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      if (message.name != null && Object.hasOwnProperty.call(message, "name"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.name);
      if (message.gamemode != null && Object.hasOwnProperty.call(message, "gamemode"))
        writer.uint32(
          /* id 3, wireType 0 =*/
          24
        ).uint32(message.gamemode);
      if (message.maxUsers != null && Object.hasOwnProperty.call(message, "maxUsers"))
        writer.uint32(
          /* id 4, wireType 0 =*/
          32
        ).uint32(message.maxUsers);
      if (message.password != null && Object.hasOwnProperty.call(message, "password"))
        writer.uint32(
          /* id 5, wireType 2 =*/
          42
        ).string(message.password);
      if (message.locked != null && Object.hasOwnProperty.call(message, "locked"))
        writer.uint32(
          /* id 6, wireType 0 =*/
          48
        ).bool(message.locked);
      if (message.users != null && message.users.length)
        for (let i = 0; i < message.users.length; ++i)
          $root.NT.ServerRoomCreated.User.encode(message.users[i], writer.uint32(
            /* id 7, wireType 2 =*/
            58
          ).fork()).ldelim();
      return writer;
    };
    ServerRoomCreated.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerRoomCreated.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomCreated();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          case 2: {
            message.name = reader.string();
            break;
          }
          case 3: {
            message.gamemode = reader.uint32();
            break;
          }
          case 4: {
            message.maxUsers = reader.uint32();
            break;
          }
          case 5: {
            message.password = reader.string();
            break;
          }
          case 6: {
            message.locked = reader.bool();
            break;
          }
          case 7: {
            if (!(message.users && message.users.length))
              message.users = [];
            message.users.push($root.NT.ServerRoomCreated.User.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerRoomCreated.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerRoomCreated.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      if (message.name != null && message.hasOwnProperty("name")) {
        if (!$util.isString(message.name))
          return "name: string expected";
      }
      if (message.gamemode != null && message.hasOwnProperty("gamemode")) {
        if (!$util.isInteger(message.gamemode))
          return "gamemode: integer expected";
      }
      if (message.maxUsers != null && message.hasOwnProperty("maxUsers")) {
        if (!$util.isInteger(message.maxUsers))
          return "maxUsers: integer expected";
      }
      if (message.password != null && message.hasOwnProperty("password")) {
        properties._password = 1;
        if (!$util.isString(message.password))
          return "password: string expected";
      }
      if (message.locked != null && message.hasOwnProperty("locked")) {
        if (typeof message.locked !== "boolean")
          return "locked: boolean expected";
      }
      if (message.users != null && message.hasOwnProperty("users")) {
        if (!Array.isArray(message.users))
          return "users: array expected";
        for (let i = 0; i < message.users.length; ++i) {
          let error = $root.NT.ServerRoomCreated.User.verify(message.users[i]);
          if (error)
            return "users." + error;
        }
      }
      return null;
    };
    ServerRoomCreated.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerRoomCreated)
        return object;
      let message = new $root.NT.ServerRoomCreated();
      if (object.id != null)
        message.id = String(object.id);
      if (object.name != null)
        message.name = String(object.name);
      if (object.gamemode != null)
        message.gamemode = object.gamemode >>> 0;
      if (object.maxUsers != null)
        message.maxUsers = object.maxUsers >>> 0;
      if (object.password != null)
        message.password = String(object.password);
      if (object.locked != null)
        message.locked = Boolean(object.locked);
      if (object.users) {
        if (!Array.isArray(object.users))
          throw TypeError(".NT.ServerRoomCreated.users: array expected");
        message.users = [];
        for (let i = 0; i < object.users.length; ++i) {
          if (typeof object.users[i] !== "object")
            throw TypeError(".NT.ServerRoomCreated.users: object expected");
          message.users[i] = $root.NT.ServerRoomCreated.User.fromObject(object.users[i]);
        }
      }
      return message;
    };
    ServerRoomCreated.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.users = [];
      if (options.defaults) {
        object.id = "";
        object.name = "";
        object.gamemode = 0;
        object.maxUsers = 0;
        object.locked = false;
      }
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      if (message.name != null && message.hasOwnProperty("name"))
        object.name = message.name;
      if (message.gamemode != null && message.hasOwnProperty("gamemode"))
        object.gamemode = message.gamemode;
      if (message.maxUsers != null && message.hasOwnProperty("maxUsers"))
        object.maxUsers = message.maxUsers;
      if (message.password != null && message.hasOwnProperty("password")) {
        object.password = message.password;
        if (options.oneofs)
          object._password = "password";
      }
      if (message.locked != null && message.hasOwnProperty("locked"))
        object.locked = message.locked;
      if (message.users && message.users.length) {
        object.users = [];
        for (let j = 0; j < message.users.length; ++j)
          object.users[j] = $root.NT.ServerRoomCreated.User.toObject(message.users[j], options);
      }
      return object;
    };
    ServerRoomCreated.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerRoomCreated.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerRoomCreated";
    };
    ServerRoomCreated.User = function() {
      function User(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      User.prototype.userId = "";
      User.prototype.name = "";
      User.prototype.ready = false;
      User.prototype.owner = false;
      User.create = function create(properties) {
        return new User(properties);
      };
      User.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
          writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).string(message.userId);
        if (message.name != null && Object.hasOwnProperty.call(message, "name"))
          writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).string(message.name);
        if (message.ready != null && Object.hasOwnProperty.call(message, "ready"))
          writer.uint32(
            /* id 3, wireType 0 =*/
            24
          ).bool(message.ready);
        if (message.owner != null && Object.hasOwnProperty.call(message, "owner"))
          writer.uint32(
            /* id 4, wireType 0 =*/
            32
          ).bool(message.owner);
        return writer;
      };
      User.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      User.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomCreated.User();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.userId = reader.string();
              break;
            }
            case 2: {
              message.name = reader.string();
              break;
            }
            case 3: {
              message.ready = reader.bool();
              break;
            }
            case 4: {
              message.owner = reader.bool();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      User.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      User.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.userId != null && message.hasOwnProperty("userId")) {
          if (!$util.isString(message.userId))
            return "userId: string expected";
        }
        if (message.name != null && message.hasOwnProperty("name")) {
          if (!$util.isString(message.name))
            return "name: string expected";
        }
        if (message.ready != null && message.hasOwnProperty("ready")) {
          if (typeof message.ready !== "boolean")
            return "ready: boolean expected";
        }
        if (message.owner != null && message.hasOwnProperty("owner")) {
          if (typeof message.owner !== "boolean")
            return "owner: boolean expected";
        }
        return null;
      };
      User.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerRoomCreated.User)
          return object;
        let message = new $root.NT.ServerRoomCreated.User();
        if (object.userId != null)
          message.userId = String(object.userId);
        if (object.name != null)
          message.name = String(object.name);
        if (object.ready != null)
          message.ready = Boolean(object.ready);
        if (object.owner != null)
          message.owner = Boolean(object.owner);
        return message;
      };
      User.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.userId = "";
          object.name = "";
          object.ready = false;
          object.owner = false;
        }
        if (message.userId != null && message.hasOwnProperty("userId"))
          object.userId = message.userId;
        if (message.name != null && message.hasOwnProperty("name"))
          object.name = message.name;
        if (message.ready != null && message.hasOwnProperty("ready"))
          object.ready = message.ready;
        if (message.owner != null && message.hasOwnProperty("owner"))
          object.owner = message.owner;
        return object;
      };
      User.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      User.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerRoomCreated.User";
      };
      return User;
    }();
    return ServerRoomCreated;
  }();
  NT3.ServerRoomCreateFailed = function() {
    function ServerRoomCreateFailed(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerRoomCreateFailed.prototype.reason = "";
    ServerRoomCreateFailed.create = function create(properties) {
      return new ServerRoomCreateFailed(properties);
    };
    ServerRoomCreateFailed.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.reason != null && Object.hasOwnProperty.call(message, "reason"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.reason);
      return writer;
    };
    ServerRoomCreateFailed.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerRoomCreateFailed.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomCreateFailed();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.reason = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerRoomCreateFailed.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerRoomCreateFailed.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.reason != null && message.hasOwnProperty("reason")) {
        if (!$util.isString(message.reason))
          return "reason: string expected";
      }
      return null;
    };
    ServerRoomCreateFailed.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerRoomCreateFailed)
        return object;
      let message = new $root.NT.ServerRoomCreateFailed();
      if (object.reason != null)
        message.reason = String(object.reason);
      return message;
    };
    ServerRoomCreateFailed.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.reason = "";
      if (message.reason != null && message.hasOwnProperty("reason"))
        object.reason = message.reason;
      return object;
    };
    ServerRoomCreateFailed.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerRoomCreateFailed.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerRoomCreateFailed";
    };
    return ServerRoomCreateFailed;
  }();
  NT3.ClientRoomUpdate = function() {
    function ClientRoomUpdate(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientRoomUpdate.prototype.name = null;
    ClientRoomUpdate.prototype.gamemode = null;
    ClientRoomUpdate.prototype.maxUsers = null;
    ClientRoomUpdate.prototype.password = null;
    ClientRoomUpdate.prototype.locked = null;
    let $oneOfFields;
    Object.defineProperty(ClientRoomUpdate.prototype, "_name", {
      get: $util.oneOfGetter($oneOfFields = ["name"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ClientRoomUpdate.prototype, "_gamemode", {
      get: $util.oneOfGetter($oneOfFields = ["gamemode"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ClientRoomUpdate.prototype, "_maxUsers", {
      get: $util.oneOfGetter($oneOfFields = ["maxUsers"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ClientRoomUpdate.prototype, "_password", {
      get: $util.oneOfGetter($oneOfFields = ["password"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ClientRoomUpdate.prototype, "_locked", {
      get: $util.oneOfGetter($oneOfFields = ["locked"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ClientRoomUpdate.create = function create(properties) {
      return new ClientRoomUpdate(properties);
    };
    ClientRoomUpdate.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.name != null && Object.hasOwnProperty.call(message, "name"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.name);
      if (message.gamemode != null && Object.hasOwnProperty.call(message, "gamemode"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.gamemode);
      if (message.maxUsers != null && Object.hasOwnProperty.call(message, "maxUsers"))
        writer.uint32(
          /* id 3, wireType 0 =*/
          24
        ).uint32(message.maxUsers);
      if (message.password != null && Object.hasOwnProperty.call(message, "password"))
        writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).string(message.password);
      if (message.locked != null && Object.hasOwnProperty.call(message, "locked"))
        writer.uint32(
          /* id 5, wireType 0 =*/
          40
        ).bool(message.locked);
      return writer;
    };
    ClientRoomUpdate.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientRoomUpdate.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientRoomUpdate();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.name = reader.string();
            break;
          }
          case 2: {
            message.gamemode = reader.uint32();
            break;
          }
          case 3: {
            message.maxUsers = reader.uint32();
            break;
          }
          case 4: {
            message.password = reader.string();
            break;
          }
          case 5: {
            message.locked = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientRoomUpdate.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientRoomUpdate.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.name != null && message.hasOwnProperty("name")) {
        properties._name = 1;
        if (!$util.isString(message.name))
          return "name: string expected";
      }
      if (message.gamemode != null && message.hasOwnProperty("gamemode")) {
        properties._gamemode = 1;
        if (!$util.isInteger(message.gamemode))
          return "gamemode: integer expected";
      }
      if (message.maxUsers != null && message.hasOwnProperty("maxUsers")) {
        properties._maxUsers = 1;
        if (!$util.isInteger(message.maxUsers))
          return "maxUsers: integer expected";
      }
      if (message.password != null && message.hasOwnProperty("password")) {
        properties._password = 1;
        if (!$util.isString(message.password))
          return "password: string expected";
      }
      if (message.locked != null && message.hasOwnProperty("locked")) {
        properties._locked = 1;
        if (typeof message.locked !== "boolean")
          return "locked: boolean expected";
      }
      return null;
    };
    ClientRoomUpdate.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientRoomUpdate)
        return object;
      let message = new $root.NT.ClientRoomUpdate();
      if (object.name != null)
        message.name = String(object.name);
      if (object.gamemode != null)
        message.gamemode = object.gamemode >>> 0;
      if (object.maxUsers != null)
        message.maxUsers = object.maxUsers >>> 0;
      if (object.password != null)
        message.password = String(object.password);
      if (object.locked != null)
        message.locked = Boolean(object.locked);
      return message;
    };
    ClientRoomUpdate.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (message.name != null && message.hasOwnProperty("name")) {
        object.name = message.name;
        if (options.oneofs)
          object._name = "name";
      }
      if (message.gamemode != null && message.hasOwnProperty("gamemode")) {
        object.gamemode = message.gamemode;
        if (options.oneofs)
          object._gamemode = "gamemode";
      }
      if (message.maxUsers != null && message.hasOwnProperty("maxUsers")) {
        object.maxUsers = message.maxUsers;
        if (options.oneofs)
          object._maxUsers = "maxUsers";
      }
      if (message.password != null && message.hasOwnProperty("password")) {
        object.password = message.password;
        if (options.oneofs)
          object._password = "password";
      }
      if (message.locked != null && message.hasOwnProperty("locked")) {
        object.locked = message.locked;
        if (options.oneofs)
          object._locked = "locked";
      }
      return object;
    };
    ClientRoomUpdate.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientRoomUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientRoomUpdate";
    };
    return ClientRoomUpdate;
  }();
  NT3.ServerRoomUpdated = function() {
    function ServerRoomUpdated(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerRoomUpdated.prototype.name = null;
    ServerRoomUpdated.prototype.gamemode = null;
    ServerRoomUpdated.prototype.maxUsers = null;
    ServerRoomUpdated.prototype.password = null;
    ServerRoomUpdated.prototype.locked = null;
    let $oneOfFields;
    Object.defineProperty(ServerRoomUpdated.prototype, "_name", {
      get: $util.oneOfGetter($oneOfFields = ["name"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ServerRoomUpdated.prototype, "_gamemode", {
      get: $util.oneOfGetter($oneOfFields = ["gamemode"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ServerRoomUpdated.prototype, "_maxUsers", {
      get: $util.oneOfGetter($oneOfFields = ["maxUsers"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ServerRoomUpdated.prototype, "_password", {
      get: $util.oneOfGetter($oneOfFields = ["password"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ServerRoomUpdated.prototype, "_locked", {
      get: $util.oneOfGetter($oneOfFields = ["locked"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ServerRoomUpdated.create = function create(properties) {
      return new ServerRoomUpdated(properties);
    };
    ServerRoomUpdated.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.name != null && Object.hasOwnProperty.call(message, "name"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.name);
      if (message.gamemode != null && Object.hasOwnProperty.call(message, "gamemode"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.gamemode);
      if (message.maxUsers != null && Object.hasOwnProperty.call(message, "maxUsers"))
        writer.uint32(
          /* id 3, wireType 0 =*/
          24
        ).uint32(message.maxUsers);
      if (message.password != null && Object.hasOwnProperty.call(message, "password"))
        writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).string(message.password);
      if (message.locked != null && Object.hasOwnProperty.call(message, "locked"))
        writer.uint32(
          /* id 5, wireType 0 =*/
          40
        ).bool(message.locked);
      return writer;
    };
    ServerRoomUpdated.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerRoomUpdated.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomUpdated();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.name = reader.string();
            break;
          }
          case 2: {
            message.gamemode = reader.uint32();
            break;
          }
          case 3: {
            message.maxUsers = reader.uint32();
            break;
          }
          case 4: {
            message.password = reader.string();
            break;
          }
          case 5: {
            message.locked = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerRoomUpdated.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerRoomUpdated.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.name != null && message.hasOwnProperty("name")) {
        properties._name = 1;
        if (!$util.isString(message.name))
          return "name: string expected";
      }
      if (message.gamemode != null && message.hasOwnProperty("gamemode")) {
        properties._gamemode = 1;
        if (!$util.isInteger(message.gamemode))
          return "gamemode: integer expected";
      }
      if (message.maxUsers != null && message.hasOwnProperty("maxUsers")) {
        properties._maxUsers = 1;
        if (!$util.isInteger(message.maxUsers))
          return "maxUsers: integer expected";
      }
      if (message.password != null && message.hasOwnProperty("password")) {
        properties._password = 1;
        if (!$util.isString(message.password))
          return "password: string expected";
      }
      if (message.locked != null && message.hasOwnProperty("locked")) {
        properties._locked = 1;
        if (typeof message.locked !== "boolean")
          return "locked: boolean expected";
      }
      return null;
    };
    ServerRoomUpdated.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerRoomUpdated)
        return object;
      let message = new $root.NT.ServerRoomUpdated();
      if (object.name != null)
        message.name = String(object.name);
      if (object.gamemode != null)
        message.gamemode = object.gamemode >>> 0;
      if (object.maxUsers != null)
        message.maxUsers = object.maxUsers >>> 0;
      if (object.password != null)
        message.password = String(object.password);
      if (object.locked != null)
        message.locked = Boolean(object.locked);
      return message;
    };
    ServerRoomUpdated.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (message.name != null && message.hasOwnProperty("name")) {
        object.name = message.name;
        if (options.oneofs)
          object._name = "name";
      }
      if (message.gamemode != null && message.hasOwnProperty("gamemode")) {
        object.gamemode = message.gamemode;
        if (options.oneofs)
          object._gamemode = "gamemode";
      }
      if (message.maxUsers != null && message.hasOwnProperty("maxUsers")) {
        object.maxUsers = message.maxUsers;
        if (options.oneofs)
          object._maxUsers = "maxUsers";
      }
      if (message.password != null && message.hasOwnProperty("password")) {
        object.password = message.password;
        if (options.oneofs)
          object._password = "password";
      }
      if (message.locked != null && message.hasOwnProperty("locked")) {
        object.locked = message.locked;
        if (options.oneofs)
          object._locked = "locked";
      }
      return object;
    };
    ServerRoomUpdated.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerRoomUpdated.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerRoomUpdated";
    };
    return ServerRoomUpdated;
  }();
  NT3.ServerRoomUpdateFailed = function() {
    function ServerRoomUpdateFailed(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerRoomUpdateFailed.prototype.reason = "";
    ServerRoomUpdateFailed.create = function create(properties) {
      return new ServerRoomUpdateFailed(properties);
    };
    ServerRoomUpdateFailed.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.reason != null && Object.hasOwnProperty.call(message, "reason"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.reason);
      return writer;
    };
    ServerRoomUpdateFailed.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerRoomUpdateFailed.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomUpdateFailed();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.reason = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerRoomUpdateFailed.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerRoomUpdateFailed.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.reason != null && message.hasOwnProperty("reason")) {
        if (!$util.isString(message.reason))
          return "reason: string expected";
      }
      return null;
    };
    ServerRoomUpdateFailed.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerRoomUpdateFailed)
        return object;
      let message = new $root.NT.ServerRoomUpdateFailed();
      if (object.reason != null)
        message.reason = String(object.reason);
      return message;
    };
    ServerRoomUpdateFailed.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.reason = "";
      if (message.reason != null && message.hasOwnProperty("reason"))
        object.reason = message.reason;
      return object;
    };
    ServerRoomUpdateFailed.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerRoomUpdateFailed.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerRoomUpdateFailed";
    };
    return ServerRoomUpdateFailed;
  }();
  NT3.ClientRoomFlagsUpdate = function() {
    function ClientRoomFlagsUpdate(properties) {
      this.flags = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientRoomFlagsUpdate.prototype.flags = $util.emptyArray;
    ClientRoomFlagsUpdate.create = function create(properties) {
      return new ClientRoomFlagsUpdate(properties);
    };
    ClientRoomFlagsUpdate.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.flags != null && message.flags.length)
        for (let i = 0; i < message.flags.length; ++i)
          $root.NT.ClientRoomFlagsUpdate.GameFlag.encode(message.flags[i], writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).fork()).ldelim();
      return writer;
    };
    ClientRoomFlagsUpdate.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientRoomFlagsUpdate.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientRoomFlagsUpdate();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (!(message.flags && message.flags.length))
              message.flags = [];
            message.flags.push($root.NT.ClientRoomFlagsUpdate.GameFlag.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientRoomFlagsUpdate.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientRoomFlagsUpdate.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.flags != null && message.hasOwnProperty("flags")) {
        if (!Array.isArray(message.flags))
          return "flags: array expected";
        for (let i = 0; i < message.flags.length; ++i) {
          let error = $root.NT.ClientRoomFlagsUpdate.GameFlag.verify(message.flags[i]);
          if (error)
            return "flags." + error;
        }
      }
      return null;
    };
    ClientRoomFlagsUpdate.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientRoomFlagsUpdate)
        return object;
      let message = new $root.NT.ClientRoomFlagsUpdate();
      if (object.flags) {
        if (!Array.isArray(object.flags))
          throw TypeError(".NT.ClientRoomFlagsUpdate.flags: array expected");
        message.flags = [];
        for (let i = 0; i < object.flags.length; ++i) {
          if (typeof object.flags[i] !== "object")
            throw TypeError(".NT.ClientRoomFlagsUpdate.flags: object expected");
          message.flags[i] = $root.NT.ClientRoomFlagsUpdate.GameFlag.fromObject(object.flags[i]);
        }
      }
      return message;
    };
    ClientRoomFlagsUpdate.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.flags = [];
      if (message.flags && message.flags.length) {
        object.flags = [];
        for (let j = 0; j < message.flags.length; ++j)
          object.flags[j] = $root.NT.ClientRoomFlagsUpdate.GameFlag.toObject(message.flags[j], options);
      }
      return object;
    };
    ClientRoomFlagsUpdate.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientRoomFlagsUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientRoomFlagsUpdate";
    };
    ClientRoomFlagsUpdate.GameFlag = function() {
      function GameFlag(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      GameFlag.prototype.flag = "";
      GameFlag.prototype.intVal = null;
      GameFlag.prototype.strVal = null;
      GameFlag.prototype.floatVal = null;
      GameFlag.prototype.boolVal = null;
      GameFlag.prototype.uIntVal = null;
      let $oneOfFields;
      Object.defineProperty(GameFlag.prototype, "_intVal", {
        get: $util.oneOfGetter($oneOfFields = ["intVal"]),
        set: $util.oneOfSetter($oneOfFields)
      });
      Object.defineProperty(GameFlag.prototype, "_strVal", {
        get: $util.oneOfGetter($oneOfFields = ["strVal"]),
        set: $util.oneOfSetter($oneOfFields)
      });
      Object.defineProperty(GameFlag.prototype, "_floatVal", {
        get: $util.oneOfGetter($oneOfFields = ["floatVal"]),
        set: $util.oneOfSetter($oneOfFields)
      });
      Object.defineProperty(GameFlag.prototype, "_boolVal", {
        get: $util.oneOfGetter($oneOfFields = ["boolVal"]),
        set: $util.oneOfSetter($oneOfFields)
      });
      Object.defineProperty(GameFlag.prototype, "_uIntVal", {
        get: $util.oneOfGetter($oneOfFields = ["uIntVal"]),
        set: $util.oneOfSetter($oneOfFields)
      });
      GameFlag.create = function create(properties) {
        return new GameFlag(properties);
      };
      GameFlag.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.flag != null && Object.hasOwnProperty.call(message, "flag"))
          writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).string(message.flag);
        if (message.intVal != null && Object.hasOwnProperty.call(message, "intVal"))
          writer.uint32(
            /* id 2, wireType 0 =*/
            16
          ).int32(message.intVal);
        if (message.strVal != null && Object.hasOwnProperty.call(message, "strVal"))
          writer.uint32(
            /* id 3, wireType 2 =*/
            26
          ).string(message.strVal);
        if (message.floatVal != null && Object.hasOwnProperty.call(message, "floatVal"))
          writer.uint32(
            /* id 4, wireType 5 =*/
            37
          ).float(message.floatVal);
        if (message.boolVal != null && Object.hasOwnProperty.call(message, "boolVal"))
          writer.uint32(
            /* id 5, wireType 0 =*/
            40
          ).bool(message.boolVal);
        if (message.uIntVal != null && Object.hasOwnProperty.call(message, "uIntVal"))
          writer.uint32(
            /* id 6, wireType 0 =*/
            48
          ).uint32(message.uIntVal);
        return writer;
      };
      GameFlag.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      GameFlag.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientRoomFlagsUpdate.GameFlag();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.flag = reader.string();
              break;
            }
            case 2: {
              message.intVal = reader.int32();
              break;
            }
            case 3: {
              message.strVal = reader.string();
              break;
            }
            case 4: {
              message.floatVal = reader.float();
              break;
            }
            case 5: {
              message.boolVal = reader.bool();
              break;
            }
            case 6: {
              message.uIntVal = reader.uint32();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      GameFlag.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      GameFlag.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        let properties = {};
        if (message.flag != null && message.hasOwnProperty("flag")) {
          if (!$util.isString(message.flag))
            return "flag: string expected";
        }
        if (message.intVal != null && message.hasOwnProperty("intVal")) {
          properties._intVal = 1;
          if (!$util.isInteger(message.intVal))
            return "intVal: integer expected";
        }
        if (message.strVal != null && message.hasOwnProperty("strVal")) {
          properties._strVal = 1;
          if (!$util.isString(message.strVal))
            return "strVal: string expected";
        }
        if (message.floatVal != null && message.hasOwnProperty("floatVal")) {
          properties._floatVal = 1;
          if (typeof message.floatVal !== "number")
            return "floatVal: number expected";
        }
        if (message.boolVal != null && message.hasOwnProperty("boolVal")) {
          properties._boolVal = 1;
          if (typeof message.boolVal !== "boolean")
            return "boolVal: boolean expected";
        }
        if (message.uIntVal != null && message.hasOwnProperty("uIntVal")) {
          properties._uIntVal = 1;
          if (!$util.isInteger(message.uIntVal))
            return "uIntVal: integer expected";
        }
        return null;
      };
      GameFlag.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ClientRoomFlagsUpdate.GameFlag)
          return object;
        let message = new $root.NT.ClientRoomFlagsUpdate.GameFlag();
        if (object.flag != null)
          message.flag = String(object.flag);
        if (object.intVal != null)
          message.intVal = object.intVal | 0;
        if (object.strVal != null)
          message.strVal = String(object.strVal);
        if (object.floatVal != null)
          message.floatVal = Number(object.floatVal);
        if (object.boolVal != null)
          message.boolVal = Boolean(object.boolVal);
        if (object.uIntVal != null)
          message.uIntVal = object.uIntVal >>> 0;
        return message;
      };
      GameFlag.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults)
          object.flag = "";
        if (message.flag != null && message.hasOwnProperty("flag"))
          object.flag = message.flag;
        if (message.intVal != null && message.hasOwnProperty("intVal")) {
          object.intVal = message.intVal;
          if (options.oneofs)
            object._intVal = "intVal";
        }
        if (message.strVal != null && message.hasOwnProperty("strVal")) {
          object.strVal = message.strVal;
          if (options.oneofs)
            object._strVal = "strVal";
        }
        if (message.floatVal != null && message.hasOwnProperty("floatVal")) {
          object.floatVal = options.json && !isFinite(message.floatVal) ? String(message.floatVal) : message.floatVal;
          if (options.oneofs)
            object._floatVal = "floatVal";
        }
        if (message.boolVal != null && message.hasOwnProperty("boolVal")) {
          object.boolVal = message.boolVal;
          if (options.oneofs)
            object._boolVal = "boolVal";
        }
        if (message.uIntVal != null && message.hasOwnProperty("uIntVal")) {
          object.uIntVal = message.uIntVal;
          if (options.oneofs)
            object._uIntVal = "uIntVal";
        }
        return object;
      };
      GameFlag.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      GameFlag.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ClientRoomFlagsUpdate.GameFlag";
      };
      return GameFlag;
    }();
    return ClientRoomFlagsUpdate;
  }();
  NT3.ServerRoomFlagsUpdated = function() {
    function ServerRoomFlagsUpdated(properties) {
      this.flags = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerRoomFlagsUpdated.prototype.flags = $util.emptyArray;
    ServerRoomFlagsUpdated.create = function create(properties) {
      return new ServerRoomFlagsUpdated(properties);
    };
    ServerRoomFlagsUpdated.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.flags != null && message.flags.length)
        for (let i = 0; i < message.flags.length; ++i)
          $root.NT.ServerRoomFlagsUpdated.GameFlag.encode(message.flags[i], writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).fork()).ldelim();
      return writer;
    };
    ServerRoomFlagsUpdated.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerRoomFlagsUpdated.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomFlagsUpdated();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (!(message.flags && message.flags.length))
              message.flags = [];
            message.flags.push($root.NT.ServerRoomFlagsUpdated.GameFlag.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerRoomFlagsUpdated.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerRoomFlagsUpdated.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.flags != null && message.hasOwnProperty("flags")) {
        if (!Array.isArray(message.flags))
          return "flags: array expected";
        for (let i = 0; i < message.flags.length; ++i) {
          let error = $root.NT.ServerRoomFlagsUpdated.GameFlag.verify(message.flags[i]);
          if (error)
            return "flags." + error;
        }
      }
      return null;
    };
    ServerRoomFlagsUpdated.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerRoomFlagsUpdated)
        return object;
      let message = new $root.NT.ServerRoomFlagsUpdated();
      if (object.flags) {
        if (!Array.isArray(object.flags))
          throw TypeError(".NT.ServerRoomFlagsUpdated.flags: array expected");
        message.flags = [];
        for (let i = 0; i < object.flags.length; ++i) {
          if (typeof object.flags[i] !== "object")
            throw TypeError(".NT.ServerRoomFlagsUpdated.flags: object expected");
          message.flags[i] = $root.NT.ServerRoomFlagsUpdated.GameFlag.fromObject(object.flags[i]);
        }
      }
      return message;
    };
    ServerRoomFlagsUpdated.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.flags = [];
      if (message.flags && message.flags.length) {
        object.flags = [];
        for (let j = 0; j < message.flags.length; ++j)
          object.flags[j] = $root.NT.ServerRoomFlagsUpdated.GameFlag.toObject(message.flags[j], options);
      }
      return object;
    };
    ServerRoomFlagsUpdated.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerRoomFlagsUpdated.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerRoomFlagsUpdated";
    };
    ServerRoomFlagsUpdated.GameFlag = function() {
      function GameFlag(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      GameFlag.prototype.flag = "";
      GameFlag.prototype.intVal = null;
      GameFlag.prototype.strVal = null;
      GameFlag.prototype.floatVal = null;
      GameFlag.prototype.boolVal = null;
      GameFlag.prototype.uIntVal = null;
      let $oneOfFields;
      Object.defineProperty(GameFlag.prototype, "_intVal", {
        get: $util.oneOfGetter($oneOfFields = ["intVal"]),
        set: $util.oneOfSetter($oneOfFields)
      });
      Object.defineProperty(GameFlag.prototype, "_strVal", {
        get: $util.oneOfGetter($oneOfFields = ["strVal"]),
        set: $util.oneOfSetter($oneOfFields)
      });
      Object.defineProperty(GameFlag.prototype, "_floatVal", {
        get: $util.oneOfGetter($oneOfFields = ["floatVal"]),
        set: $util.oneOfSetter($oneOfFields)
      });
      Object.defineProperty(GameFlag.prototype, "_boolVal", {
        get: $util.oneOfGetter($oneOfFields = ["boolVal"]),
        set: $util.oneOfSetter($oneOfFields)
      });
      Object.defineProperty(GameFlag.prototype, "_uIntVal", {
        get: $util.oneOfGetter($oneOfFields = ["uIntVal"]),
        set: $util.oneOfSetter($oneOfFields)
      });
      GameFlag.create = function create(properties) {
        return new GameFlag(properties);
      };
      GameFlag.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.flag != null && Object.hasOwnProperty.call(message, "flag"))
          writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).string(message.flag);
        if (message.intVal != null && Object.hasOwnProperty.call(message, "intVal"))
          writer.uint32(
            /* id 2, wireType 0 =*/
            16
          ).int32(message.intVal);
        if (message.strVal != null && Object.hasOwnProperty.call(message, "strVal"))
          writer.uint32(
            /* id 3, wireType 2 =*/
            26
          ).string(message.strVal);
        if (message.floatVal != null && Object.hasOwnProperty.call(message, "floatVal"))
          writer.uint32(
            /* id 4, wireType 5 =*/
            37
          ).float(message.floatVal);
        if (message.boolVal != null && Object.hasOwnProperty.call(message, "boolVal"))
          writer.uint32(
            /* id 5, wireType 0 =*/
            40
          ).bool(message.boolVal);
        if (message.uIntVal != null && Object.hasOwnProperty.call(message, "uIntVal"))
          writer.uint32(
            /* id 6, wireType 0 =*/
            48
          ).uint32(message.uIntVal);
        return writer;
      };
      GameFlag.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      GameFlag.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomFlagsUpdated.GameFlag();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.flag = reader.string();
              break;
            }
            case 2: {
              message.intVal = reader.int32();
              break;
            }
            case 3: {
              message.strVal = reader.string();
              break;
            }
            case 4: {
              message.floatVal = reader.float();
              break;
            }
            case 5: {
              message.boolVal = reader.bool();
              break;
            }
            case 6: {
              message.uIntVal = reader.uint32();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      GameFlag.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      GameFlag.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        let properties = {};
        if (message.flag != null && message.hasOwnProperty("flag")) {
          if (!$util.isString(message.flag))
            return "flag: string expected";
        }
        if (message.intVal != null && message.hasOwnProperty("intVal")) {
          properties._intVal = 1;
          if (!$util.isInteger(message.intVal))
            return "intVal: integer expected";
        }
        if (message.strVal != null && message.hasOwnProperty("strVal")) {
          properties._strVal = 1;
          if (!$util.isString(message.strVal))
            return "strVal: string expected";
        }
        if (message.floatVal != null && message.hasOwnProperty("floatVal")) {
          properties._floatVal = 1;
          if (typeof message.floatVal !== "number")
            return "floatVal: number expected";
        }
        if (message.boolVal != null && message.hasOwnProperty("boolVal")) {
          properties._boolVal = 1;
          if (typeof message.boolVal !== "boolean")
            return "boolVal: boolean expected";
        }
        if (message.uIntVal != null && message.hasOwnProperty("uIntVal")) {
          properties._uIntVal = 1;
          if (!$util.isInteger(message.uIntVal))
            return "uIntVal: integer expected";
        }
        return null;
      };
      GameFlag.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerRoomFlagsUpdated.GameFlag)
          return object;
        let message = new $root.NT.ServerRoomFlagsUpdated.GameFlag();
        if (object.flag != null)
          message.flag = String(object.flag);
        if (object.intVal != null)
          message.intVal = object.intVal | 0;
        if (object.strVal != null)
          message.strVal = String(object.strVal);
        if (object.floatVal != null)
          message.floatVal = Number(object.floatVal);
        if (object.boolVal != null)
          message.boolVal = Boolean(object.boolVal);
        if (object.uIntVal != null)
          message.uIntVal = object.uIntVal >>> 0;
        return message;
      };
      GameFlag.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults)
          object.flag = "";
        if (message.flag != null && message.hasOwnProperty("flag"))
          object.flag = message.flag;
        if (message.intVal != null && message.hasOwnProperty("intVal")) {
          object.intVal = message.intVal;
          if (options.oneofs)
            object._intVal = "intVal";
        }
        if (message.strVal != null && message.hasOwnProperty("strVal")) {
          object.strVal = message.strVal;
          if (options.oneofs)
            object._strVal = "strVal";
        }
        if (message.floatVal != null && message.hasOwnProperty("floatVal")) {
          object.floatVal = options.json && !isFinite(message.floatVal) ? String(message.floatVal) : message.floatVal;
          if (options.oneofs)
            object._floatVal = "floatVal";
        }
        if (message.boolVal != null && message.hasOwnProperty("boolVal")) {
          object.boolVal = message.boolVal;
          if (options.oneofs)
            object._boolVal = "boolVal";
        }
        if (message.uIntVal != null && message.hasOwnProperty("uIntVal")) {
          object.uIntVal = message.uIntVal;
          if (options.oneofs)
            object._uIntVal = "uIntVal";
        }
        return object;
      };
      GameFlag.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      GameFlag.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerRoomFlagsUpdated.GameFlag";
      };
      return GameFlag;
    }();
    return ServerRoomFlagsUpdated;
  }();
  NT3.ServerRoomFlagsUpdateFailed = function() {
    function ServerRoomFlagsUpdateFailed(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerRoomFlagsUpdateFailed.prototype.reason = "";
    ServerRoomFlagsUpdateFailed.create = function create(properties) {
      return new ServerRoomFlagsUpdateFailed(properties);
    };
    ServerRoomFlagsUpdateFailed.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.reason != null && Object.hasOwnProperty.call(message, "reason"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.reason);
      return writer;
    };
    ServerRoomFlagsUpdateFailed.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerRoomFlagsUpdateFailed.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomFlagsUpdateFailed();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.reason = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerRoomFlagsUpdateFailed.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerRoomFlagsUpdateFailed.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.reason != null && message.hasOwnProperty("reason")) {
        if (!$util.isString(message.reason))
          return "reason: string expected";
      }
      return null;
    };
    ServerRoomFlagsUpdateFailed.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerRoomFlagsUpdateFailed)
        return object;
      let message = new $root.NT.ServerRoomFlagsUpdateFailed();
      if (object.reason != null)
        message.reason = String(object.reason);
      return message;
    };
    ServerRoomFlagsUpdateFailed.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.reason = "";
      if (message.reason != null && message.hasOwnProperty("reason"))
        object.reason = message.reason;
      return object;
    };
    ServerRoomFlagsUpdateFailed.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerRoomFlagsUpdateFailed.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerRoomFlagsUpdateFailed";
    };
    return ServerRoomFlagsUpdateFailed;
  }();
  NT3.ClientJoinRoom = function() {
    function ClientJoinRoom(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientJoinRoom.prototype.id = "";
    ClientJoinRoom.prototype.password = null;
    let $oneOfFields;
    Object.defineProperty(ClientJoinRoom.prototype, "_password", {
      get: $util.oneOfGetter($oneOfFields = ["password"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ClientJoinRoom.create = function create(properties) {
      return new ClientJoinRoom(properties);
    };
    ClientJoinRoom.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      if (message.password != null && Object.hasOwnProperty.call(message, "password"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.password);
      return writer;
    };
    ClientJoinRoom.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientJoinRoom.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientJoinRoom();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          case 2: {
            message.password = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientJoinRoom.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientJoinRoom.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      if (message.password != null && message.hasOwnProperty("password")) {
        properties._password = 1;
        if (!$util.isString(message.password))
          return "password: string expected";
      }
      return null;
    };
    ClientJoinRoom.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientJoinRoom)
        return object;
      let message = new $root.NT.ClientJoinRoom();
      if (object.id != null)
        message.id = String(object.id);
      if (object.password != null)
        message.password = String(object.password);
      return message;
    };
    ClientJoinRoom.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.id = "";
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      if (message.password != null && message.hasOwnProperty("password")) {
        object.password = message.password;
        if (options.oneofs)
          object._password = "password";
      }
      return object;
    };
    ClientJoinRoom.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientJoinRoom.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientJoinRoom";
    };
    return ClientJoinRoom;
  }();
  NT3.ServerJoinRoomSuccess = function() {
    function ServerJoinRoomSuccess(properties) {
      this.users = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerJoinRoomSuccess.prototype.id = "";
    ServerJoinRoomSuccess.prototype.name = "";
    ServerJoinRoomSuccess.prototype.gamemode = 0;
    ServerJoinRoomSuccess.prototype.maxUsers = 0;
    ServerJoinRoomSuccess.prototype.password = null;
    ServerJoinRoomSuccess.prototype.locked = false;
    ServerJoinRoomSuccess.prototype.users = $util.emptyArray;
    let $oneOfFields;
    Object.defineProperty(ServerJoinRoomSuccess.prototype, "_password", {
      get: $util.oneOfGetter($oneOfFields = ["password"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ServerJoinRoomSuccess.create = function create(properties) {
      return new ServerJoinRoomSuccess(properties);
    };
    ServerJoinRoomSuccess.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.id != null && Object.hasOwnProperty.call(message, "id"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.id);
      if (message.name != null && Object.hasOwnProperty.call(message, "name"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.name);
      if (message.gamemode != null && Object.hasOwnProperty.call(message, "gamemode"))
        writer.uint32(
          /* id 3, wireType 0 =*/
          24
        ).uint32(message.gamemode);
      if (message.maxUsers != null && Object.hasOwnProperty.call(message, "maxUsers"))
        writer.uint32(
          /* id 4, wireType 0 =*/
          32
        ).uint32(message.maxUsers);
      if (message.password != null && Object.hasOwnProperty.call(message, "password"))
        writer.uint32(
          /* id 5, wireType 2 =*/
          42
        ).string(message.password);
      if (message.locked != null && Object.hasOwnProperty.call(message, "locked"))
        writer.uint32(
          /* id 6, wireType 0 =*/
          48
        ).bool(message.locked);
      if (message.users != null && message.users.length)
        for (let i = 0; i < message.users.length; ++i)
          $root.NT.ServerJoinRoomSuccess.User.encode(message.users[i], writer.uint32(
            /* id 7, wireType 2 =*/
            58
          ).fork()).ldelim();
      return writer;
    };
    ServerJoinRoomSuccess.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerJoinRoomSuccess.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerJoinRoomSuccess();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.id = reader.string();
            break;
          }
          case 2: {
            message.name = reader.string();
            break;
          }
          case 3: {
            message.gamemode = reader.uint32();
            break;
          }
          case 4: {
            message.maxUsers = reader.uint32();
            break;
          }
          case 5: {
            message.password = reader.string();
            break;
          }
          case 6: {
            message.locked = reader.bool();
            break;
          }
          case 7: {
            if (!(message.users && message.users.length))
              message.users = [];
            message.users.push($root.NT.ServerJoinRoomSuccess.User.decode(reader, reader.uint32()));
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerJoinRoomSuccess.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerJoinRoomSuccess.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.id != null && message.hasOwnProperty("id")) {
        if (!$util.isString(message.id))
          return "id: string expected";
      }
      if (message.name != null && message.hasOwnProperty("name")) {
        if (!$util.isString(message.name))
          return "name: string expected";
      }
      if (message.gamemode != null && message.hasOwnProperty("gamemode")) {
        if (!$util.isInteger(message.gamemode))
          return "gamemode: integer expected";
      }
      if (message.maxUsers != null && message.hasOwnProperty("maxUsers")) {
        if (!$util.isInteger(message.maxUsers))
          return "maxUsers: integer expected";
      }
      if (message.password != null && message.hasOwnProperty("password")) {
        properties._password = 1;
        if (!$util.isString(message.password))
          return "password: string expected";
      }
      if (message.locked != null && message.hasOwnProperty("locked")) {
        if (typeof message.locked !== "boolean")
          return "locked: boolean expected";
      }
      if (message.users != null && message.hasOwnProperty("users")) {
        if (!Array.isArray(message.users))
          return "users: array expected";
        for (let i = 0; i < message.users.length; ++i) {
          let error = $root.NT.ServerJoinRoomSuccess.User.verify(message.users[i]);
          if (error)
            return "users." + error;
        }
      }
      return null;
    };
    ServerJoinRoomSuccess.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerJoinRoomSuccess)
        return object;
      let message = new $root.NT.ServerJoinRoomSuccess();
      if (object.id != null)
        message.id = String(object.id);
      if (object.name != null)
        message.name = String(object.name);
      if (object.gamemode != null)
        message.gamemode = object.gamemode >>> 0;
      if (object.maxUsers != null)
        message.maxUsers = object.maxUsers >>> 0;
      if (object.password != null)
        message.password = String(object.password);
      if (object.locked != null)
        message.locked = Boolean(object.locked);
      if (object.users) {
        if (!Array.isArray(object.users))
          throw TypeError(".NT.ServerJoinRoomSuccess.users: array expected");
        message.users = [];
        for (let i = 0; i < object.users.length; ++i) {
          if (typeof object.users[i] !== "object")
            throw TypeError(".NT.ServerJoinRoomSuccess.users: object expected");
          message.users[i] = $root.NT.ServerJoinRoomSuccess.User.fromObject(object.users[i]);
        }
      }
      return message;
    };
    ServerJoinRoomSuccess.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.users = [];
      if (options.defaults) {
        object.id = "";
        object.name = "";
        object.gamemode = 0;
        object.maxUsers = 0;
        object.locked = false;
      }
      if (message.id != null && message.hasOwnProperty("id"))
        object.id = message.id;
      if (message.name != null && message.hasOwnProperty("name"))
        object.name = message.name;
      if (message.gamemode != null && message.hasOwnProperty("gamemode"))
        object.gamemode = message.gamemode;
      if (message.maxUsers != null && message.hasOwnProperty("maxUsers"))
        object.maxUsers = message.maxUsers;
      if (message.password != null && message.hasOwnProperty("password")) {
        object.password = message.password;
        if (options.oneofs)
          object._password = "password";
      }
      if (message.locked != null && message.hasOwnProperty("locked"))
        object.locked = message.locked;
      if (message.users && message.users.length) {
        object.users = [];
        for (let j = 0; j < message.users.length; ++j)
          object.users[j] = $root.NT.ServerJoinRoomSuccess.User.toObject(message.users[j], options);
      }
      return object;
    };
    ServerJoinRoomSuccess.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerJoinRoomSuccess.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerJoinRoomSuccess";
    };
    ServerJoinRoomSuccess.User = function() {
      function User(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      User.prototype.userId = "";
      User.prototype.name = "";
      User.prototype.ready = false;
      User.prototype.owner = false;
      User.create = function create(properties) {
        return new User(properties);
      };
      User.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
          writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).string(message.userId);
        if (message.name != null && Object.hasOwnProperty.call(message, "name"))
          writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).string(message.name);
        if (message.ready != null && Object.hasOwnProperty.call(message, "ready"))
          writer.uint32(
            /* id 3, wireType 0 =*/
            24
          ).bool(message.ready);
        if (message.owner != null && Object.hasOwnProperty.call(message, "owner"))
          writer.uint32(
            /* id 4, wireType 0 =*/
            32
          ).bool(message.owner);
        return writer;
      };
      User.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      User.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerJoinRoomSuccess.User();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.userId = reader.string();
              break;
            }
            case 2: {
              message.name = reader.string();
              break;
            }
            case 3: {
              message.ready = reader.bool();
              break;
            }
            case 4: {
              message.owner = reader.bool();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      User.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      User.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.userId != null && message.hasOwnProperty("userId")) {
          if (!$util.isString(message.userId))
            return "userId: string expected";
        }
        if (message.name != null && message.hasOwnProperty("name")) {
          if (!$util.isString(message.name))
            return "name: string expected";
        }
        if (message.ready != null && message.hasOwnProperty("ready")) {
          if (typeof message.ready !== "boolean")
            return "ready: boolean expected";
        }
        if (message.owner != null && message.hasOwnProperty("owner")) {
          if (typeof message.owner !== "boolean")
            return "owner: boolean expected";
        }
        return null;
      };
      User.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerJoinRoomSuccess.User)
          return object;
        let message = new $root.NT.ServerJoinRoomSuccess.User();
        if (object.userId != null)
          message.userId = String(object.userId);
        if (object.name != null)
          message.name = String(object.name);
        if (object.ready != null)
          message.ready = Boolean(object.ready);
        if (object.owner != null)
          message.owner = Boolean(object.owner);
        return message;
      };
      User.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.userId = "";
          object.name = "";
          object.ready = false;
          object.owner = false;
        }
        if (message.userId != null && message.hasOwnProperty("userId"))
          object.userId = message.userId;
        if (message.name != null && message.hasOwnProperty("name"))
          object.name = message.name;
        if (message.ready != null && message.hasOwnProperty("ready"))
          object.ready = message.ready;
        if (message.owner != null && message.hasOwnProperty("owner"))
          object.owner = message.owner;
        return object;
      };
      User.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      User.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerJoinRoomSuccess.User";
      };
      return User;
    }();
    return ServerJoinRoomSuccess;
  }();
  NT3.ServerJoinRoomFailed = function() {
    function ServerJoinRoomFailed(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerJoinRoomFailed.prototype.reason = "";
    ServerJoinRoomFailed.create = function create(properties) {
      return new ServerJoinRoomFailed(properties);
    };
    ServerJoinRoomFailed.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.reason != null && Object.hasOwnProperty.call(message, "reason"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.reason);
      return writer;
    };
    ServerJoinRoomFailed.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerJoinRoomFailed.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerJoinRoomFailed();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.reason = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerJoinRoomFailed.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerJoinRoomFailed.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.reason != null && message.hasOwnProperty("reason")) {
        if (!$util.isString(message.reason))
          return "reason: string expected";
      }
      return null;
    };
    ServerJoinRoomFailed.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerJoinRoomFailed)
        return object;
      let message = new $root.NT.ServerJoinRoomFailed();
      if (object.reason != null)
        message.reason = String(object.reason);
      return message;
    };
    ServerJoinRoomFailed.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.reason = "";
      if (message.reason != null && message.hasOwnProperty("reason"))
        object.reason = message.reason;
      return object;
    };
    ServerJoinRoomFailed.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerJoinRoomFailed.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerJoinRoomFailed";
    };
    return ServerJoinRoomFailed;
  }();
  NT3.ServerUserJoinedRoom = function() {
    function ServerUserJoinedRoom(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerUserJoinedRoom.prototype.userId = "";
    ServerUserJoinedRoom.prototype.name = "";
    ServerUserJoinedRoom.create = function create(properties) {
      return new ServerUserJoinedRoom(properties);
    };
    ServerUserJoinedRoom.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.name != null && Object.hasOwnProperty.call(message, "name"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.name);
      return writer;
    };
    ServerUserJoinedRoom.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerUserJoinedRoom.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerUserJoinedRoom();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.name = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerUserJoinedRoom.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerUserJoinedRoom.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.name != null && message.hasOwnProperty("name")) {
        if (!$util.isString(message.name))
          return "name: string expected";
      }
      return null;
    };
    ServerUserJoinedRoom.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerUserJoinedRoom)
        return object;
      let message = new $root.NT.ServerUserJoinedRoom();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.name != null)
        message.name = String(object.name);
      return message;
    };
    ServerUserJoinedRoom.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults) {
        object.userId = "";
        object.name = "";
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.name != null && message.hasOwnProperty("name"))
        object.name = message.name;
      return object;
    };
    ServerUserJoinedRoom.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerUserJoinedRoom.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerUserJoinedRoom";
    };
    return ServerUserJoinedRoom;
  }();
  NT3.ClientLeaveRoom = function() {
    function ClientLeaveRoom(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientLeaveRoom.prototype.userId = "";
    ClientLeaveRoom.create = function create(properties) {
      return new ClientLeaveRoom(properties);
    };
    ClientLeaveRoom.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      return writer;
    };
    ClientLeaveRoom.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientLeaveRoom.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientLeaveRoom();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientLeaveRoom.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientLeaveRoom.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      return null;
    };
    ClientLeaveRoom.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientLeaveRoom)
        return object;
      let message = new $root.NT.ClientLeaveRoom();
      if (object.userId != null)
        message.userId = String(object.userId);
      return message;
    };
    ClientLeaveRoom.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      return object;
    };
    ClientLeaveRoom.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientLeaveRoom.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientLeaveRoom";
    };
    return ClientLeaveRoom;
  }();
  NT3.ServerUserLeftRoom = function() {
    function ServerUserLeftRoom(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerUserLeftRoom.prototype.userId = "";
    ServerUserLeftRoom.create = function create(properties) {
      return new ServerUserLeftRoom(properties);
    };
    ServerUserLeftRoom.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      return writer;
    };
    ServerUserLeftRoom.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerUserLeftRoom.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerUserLeftRoom();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerUserLeftRoom.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerUserLeftRoom.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      return null;
    };
    ServerUserLeftRoom.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerUserLeftRoom)
        return object;
      let message = new $root.NT.ServerUserLeftRoom();
      if (object.userId != null)
        message.userId = String(object.userId);
      return message;
    };
    ServerUserLeftRoom.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      return object;
    };
    ServerUserLeftRoom.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerUserLeftRoom.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerUserLeftRoom";
    };
    return ServerUserLeftRoom;
  }();
  NT3.ClientKickUser = function() {
    function ClientKickUser(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientKickUser.prototype.userId = "";
    ClientKickUser.create = function create(properties) {
      return new ClientKickUser(properties);
    };
    ClientKickUser.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      return writer;
    };
    ClientKickUser.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientKickUser.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientKickUser();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientKickUser.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientKickUser.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      return null;
    };
    ClientKickUser.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientKickUser)
        return object;
      let message = new $root.NT.ClientKickUser();
      if (object.userId != null)
        message.userId = String(object.userId);
      return message;
    };
    ClientKickUser.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      return object;
    };
    ClientKickUser.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientKickUser.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientKickUser";
    };
    return ClientKickUser;
  }();
  NT3.ServerUserKicked = function() {
    function ServerUserKicked(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerUserKicked.prototype.userId = "";
    ServerUserKicked.create = function create(properties) {
      return new ServerUserKicked(properties);
    };
    ServerUserKicked.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      return writer;
    };
    ServerUserKicked.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerUserKicked.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerUserKicked();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerUserKicked.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerUserKicked.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      return null;
    };
    ServerUserKicked.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerUserKicked)
        return object;
      let message = new $root.NT.ServerUserKicked();
      if (object.userId != null)
        message.userId = String(object.userId);
      return message;
    };
    ServerUserKicked.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      return object;
    };
    ServerUserKicked.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerUserKicked.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerUserKicked";
    };
    return ServerUserKicked;
  }();
  NT3.ClientBanUser = function() {
    function ClientBanUser(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientBanUser.prototype.userId = "";
    ClientBanUser.create = function create(properties) {
      return new ClientBanUser(properties);
    };
    ClientBanUser.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      return writer;
    };
    ClientBanUser.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientBanUser.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientBanUser();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientBanUser.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientBanUser.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      return null;
    };
    ClientBanUser.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientBanUser)
        return object;
      let message = new $root.NT.ClientBanUser();
      if (object.userId != null)
        message.userId = String(object.userId);
      return message;
    };
    ClientBanUser.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      return object;
    };
    ClientBanUser.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientBanUser.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientBanUser";
    };
    return ClientBanUser;
  }();
  NT3.ServerUserBanned = function() {
    function ServerUserBanned(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerUserBanned.prototype.userId = "";
    ServerUserBanned.create = function create(properties) {
      return new ServerUserBanned(properties);
    };
    ServerUserBanned.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      return writer;
    };
    ServerUserBanned.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerUserBanned.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerUserBanned();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerUserBanned.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerUserBanned.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      return null;
    };
    ServerUserBanned.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerUserBanned)
        return object;
      let message = new $root.NT.ServerUserBanned();
      if (object.userId != null)
        message.userId = String(object.userId);
      return message;
    };
    ServerUserBanned.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.userId = "";
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      return object;
    };
    ServerUserBanned.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerUserBanned.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerUserBanned";
    };
    return ServerUserBanned;
  }();
  NT3.ClientReadyState = function() {
    function ClientReadyState(properties) {
      this.mods = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientReadyState.prototype.ready = false;
    ClientReadyState.prototype.seed = null;
    ClientReadyState.prototype.mods = $util.emptyArray;
    ClientReadyState.prototype.version = null;
    ClientReadyState.prototype.beta = null;
    let $oneOfFields;
    Object.defineProperty(ClientReadyState.prototype, "_seed", {
      get: $util.oneOfGetter($oneOfFields = ["seed"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ClientReadyState.prototype, "_version", {
      get: $util.oneOfGetter($oneOfFields = ["version"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ClientReadyState.prototype, "_beta", {
      get: $util.oneOfGetter($oneOfFields = ["beta"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ClientReadyState.create = function create(properties) {
      return new ClientReadyState(properties);
    };
    ClientReadyState.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.ready != null && Object.hasOwnProperty.call(message, "ready"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).bool(message.ready);
      if (message.seed != null && Object.hasOwnProperty.call(message, "seed"))
        writer.uint32(
          /* id 2, wireType 2 =*/
          18
        ).string(message.seed);
      if (message.mods != null && message.mods.length)
        for (let i = 0; i < message.mods.length; ++i)
          writer.uint32(
            /* id 3, wireType 2 =*/
            26
          ).string(message.mods[i]);
      if (message.version != null && Object.hasOwnProperty.call(message, "version"))
        writer.uint32(
          /* id 4, wireType 2 =*/
          34
        ).string(message.version);
      if (message.beta != null && Object.hasOwnProperty.call(message, "beta"))
        writer.uint32(
          /* id 5, wireType 0 =*/
          40
        ).bool(message.beta);
      return writer;
    };
    ClientReadyState.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientReadyState.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientReadyState();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.ready = reader.bool();
            break;
          }
          case 2: {
            message.seed = reader.string();
            break;
          }
          case 3: {
            if (!(message.mods && message.mods.length))
              message.mods = [];
            message.mods.push(reader.string());
            break;
          }
          case 4: {
            message.version = reader.string();
            break;
          }
          case 5: {
            message.beta = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientReadyState.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientReadyState.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.ready != null && message.hasOwnProperty("ready")) {
        if (typeof message.ready !== "boolean")
          return "ready: boolean expected";
      }
      if (message.seed != null && message.hasOwnProperty("seed")) {
        properties._seed = 1;
        if (!$util.isString(message.seed))
          return "seed: string expected";
      }
      if (message.mods != null && message.hasOwnProperty("mods")) {
        if (!Array.isArray(message.mods))
          return "mods: array expected";
        for (let i = 0; i < message.mods.length; ++i)
          if (!$util.isString(message.mods[i]))
            return "mods: string[] expected";
      }
      if (message.version != null && message.hasOwnProperty("version")) {
        properties._version = 1;
        if (!$util.isString(message.version))
          return "version: string expected";
      }
      if (message.beta != null && message.hasOwnProperty("beta")) {
        properties._beta = 1;
        if (typeof message.beta !== "boolean")
          return "beta: boolean expected";
      }
      return null;
    };
    ClientReadyState.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientReadyState)
        return object;
      let message = new $root.NT.ClientReadyState();
      if (object.ready != null)
        message.ready = Boolean(object.ready);
      if (object.seed != null)
        message.seed = String(object.seed);
      if (object.mods) {
        if (!Array.isArray(object.mods))
          throw TypeError(".NT.ClientReadyState.mods: array expected");
        message.mods = [];
        for (let i = 0; i < object.mods.length; ++i)
          message.mods[i] = String(object.mods[i]);
      }
      if (object.version != null)
        message.version = String(object.version);
      if (object.beta != null)
        message.beta = Boolean(object.beta);
      return message;
    };
    ClientReadyState.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.mods = [];
      if (options.defaults)
        object.ready = false;
      if (message.ready != null && message.hasOwnProperty("ready"))
        object.ready = message.ready;
      if (message.seed != null && message.hasOwnProperty("seed")) {
        object.seed = message.seed;
        if (options.oneofs)
          object._seed = "seed";
      }
      if (message.mods && message.mods.length) {
        object.mods = [];
        for (let j = 0; j < message.mods.length; ++j)
          object.mods[j] = message.mods[j];
      }
      if (message.version != null && message.hasOwnProperty("version")) {
        object.version = message.version;
        if (options.oneofs)
          object._version = "version";
      }
      if (message.beta != null && message.hasOwnProperty("beta")) {
        object.beta = message.beta;
        if (options.oneofs)
          object._beta = "beta";
      }
      return object;
    };
    ClientReadyState.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientReadyState.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientReadyState";
    };
    return ClientReadyState;
  }();
  NT3.ServerUserReadyState = function() {
    function ServerUserReadyState(properties) {
      this.mods = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerUserReadyState.prototype.userId = "";
    ServerUserReadyState.prototype.ready = false;
    ServerUserReadyState.prototype.seed = null;
    ServerUserReadyState.prototype.mods = $util.emptyArray;
    ServerUserReadyState.prototype.version = null;
    ServerUserReadyState.prototype.beta = null;
    let $oneOfFields;
    Object.defineProperty(ServerUserReadyState.prototype, "_seed", {
      get: $util.oneOfGetter($oneOfFields = ["seed"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ServerUserReadyState.prototype, "_version", {
      get: $util.oneOfGetter($oneOfFields = ["version"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    Object.defineProperty(ServerUserReadyState.prototype, "_beta", {
      get: $util.oneOfGetter($oneOfFields = ["beta"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ServerUserReadyState.create = function create(properties) {
      return new ServerUserReadyState(properties);
    };
    ServerUserReadyState.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
        writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).string(message.userId);
      if (message.ready != null && Object.hasOwnProperty.call(message, "ready"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).bool(message.ready);
      if (message.seed != null && Object.hasOwnProperty.call(message, "seed"))
        writer.uint32(
          /* id 3, wireType 2 =*/
          26
        ).string(message.seed);
      if (message.mods != null && message.mods.length)
        for (let i = 0; i < message.mods.length; ++i)
          writer.uint32(
            /* id 4, wireType 2 =*/
            34
          ).string(message.mods[i]);
      if (message.version != null && Object.hasOwnProperty.call(message, "version"))
        writer.uint32(
          /* id 5, wireType 2 =*/
          42
        ).string(message.version);
      if (message.beta != null && Object.hasOwnProperty.call(message, "beta"))
        writer.uint32(
          /* id 6, wireType 0 =*/
          48
        ).bool(message.beta);
      return writer;
    };
    ServerUserReadyState.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerUserReadyState.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerUserReadyState();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.userId = reader.string();
            break;
          }
          case 2: {
            message.ready = reader.bool();
            break;
          }
          case 3: {
            message.seed = reader.string();
            break;
          }
          case 4: {
            if (!(message.mods && message.mods.length))
              message.mods = [];
            message.mods.push(reader.string());
            break;
          }
          case 5: {
            message.version = reader.string();
            break;
          }
          case 6: {
            message.beta = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerUserReadyState.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerUserReadyState.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.userId != null && message.hasOwnProperty("userId")) {
        if (!$util.isString(message.userId))
          return "userId: string expected";
      }
      if (message.ready != null && message.hasOwnProperty("ready")) {
        if (typeof message.ready !== "boolean")
          return "ready: boolean expected";
      }
      if (message.seed != null && message.hasOwnProperty("seed")) {
        properties._seed = 1;
        if (!$util.isString(message.seed))
          return "seed: string expected";
      }
      if (message.mods != null && message.hasOwnProperty("mods")) {
        if (!Array.isArray(message.mods))
          return "mods: array expected";
        for (let i = 0; i < message.mods.length; ++i)
          if (!$util.isString(message.mods[i]))
            return "mods: string[] expected";
      }
      if (message.version != null && message.hasOwnProperty("version")) {
        properties._version = 1;
        if (!$util.isString(message.version))
          return "version: string expected";
      }
      if (message.beta != null && message.hasOwnProperty("beta")) {
        properties._beta = 1;
        if (typeof message.beta !== "boolean")
          return "beta: boolean expected";
      }
      return null;
    };
    ServerUserReadyState.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerUserReadyState)
        return object;
      let message = new $root.NT.ServerUserReadyState();
      if (object.userId != null)
        message.userId = String(object.userId);
      if (object.ready != null)
        message.ready = Boolean(object.ready);
      if (object.seed != null)
        message.seed = String(object.seed);
      if (object.mods) {
        if (!Array.isArray(object.mods))
          throw TypeError(".NT.ServerUserReadyState.mods: array expected");
        message.mods = [];
        for (let i = 0; i < object.mods.length; ++i)
          message.mods[i] = String(object.mods[i]);
      }
      if (object.version != null)
        message.version = String(object.version);
      if (object.beta != null)
        message.beta = Boolean(object.beta);
      return message;
    };
    ServerUserReadyState.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.mods = [];
      if (options.defaults) {
        object.userId = "";
        object.ready = false;
      }
      if (message.userId != null && message.hasOwnProperty("userId"))
        object.userId = message.userId;
      if (message.ready != null && message.hasOwnProperty("ready"))
        object.ready = message.ready;
      if (message.seed != null && message.hasOwnProperty("seed")) {
        object.seed = message.seed;
        if (options.oneofs)
          object._seed = "seed";
      }
      if (message.mods && message.mods.length) {
        object.mods = [];
        for (let j = 0; j < message.mods.length; ++j)
          object.mods[j] = message.mods[j];
      }
      if (message.version != null && message.hasOwnProperty("version")) {
        object.version = message.version;
        if (options.oneofs)
          object._version = "version";
      }
      if (message.beta != null && message.hasOwnProperty("beta")) {
        object.beta = message.beta;
        if (options.oneofs)
          object._beta = "beta";
      }
      return object;
    };
    ServerUserReadyState.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerUserReadyState.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerUserReadyState";
    };
    return ServerUserReadyState;
  }();
  NT3.ClientStartRun = function() {
    function ClientStartRun(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientStartRun.prototype.forced = false;
    ClientStartRun.create = function create(properties) {
      return new ClientStartRun(properties);
    };
    ClientStartRun.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.forced != null && Object.hasOwnProperty.call(message, "forced"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).bool(message.forced);
      return writer;
    };
    ClientStartRun.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientStartRun.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientStartRun();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.forced = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientStartRun.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientStartRun.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.forced != null && message.hasOwnProperty("forced")) {
        if (typeof message.forced !== "boolean")
          return "forced: boolean expected";
      }
      return null;
    };
    ClientStartRun.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientStartRun)
        return object;
      let message = new $root.NT.ClientStartRun();
      if (object.forced != null)
        message.forced = Boolean(object.forced);
      return message;
    };
    ClientStartRun.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.forced = false;
      if (message.forced != null && message.hasOwnProperty("forced"))
        object.forced = message.forced;
      return object;
    };
    ClientStartRun.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientStartRun.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientStartRun";
    };
    return ClientStartRun;
  }();
  NT3.ServerHostStart = function() {
    function ServerHostStart(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerHostStart.prototype.forced = false;
    ServerHostStart.create = function create(properties) {
      return new ServerHostStart(properties);
    };
    ServerHostStart.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.forced != null && Object.hasOwnProperty.call(message, "forced"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).bool(message.forced);
      return writer;
    };
    ServerHostStart.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerHostStart.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerHostStart();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.forced = reader.bool();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerHostStart.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerHostStart.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.forced != null && message.hasOwnProperty("forced")) {
        if (typeof message.forced !== "boolean")
          return "forced: boolean expected";
      }
      return null;
    };
    ServerHostStart.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerHostStart)
        return object;
      let message = new $root.NT.ServerHostStart();
      if (object.forced != null)
        message.forced = Boolean(object.forced);
      return message;
    };
    ServerHostStart.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.forced = false;
      if (message.forced != null && message.hasOwnProperty("forced"))
        object.forced = message.forced;
      return object;
    };
    ServerHostStart.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerHostStart.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerHostStart";
    };
    return ServerHostStart;
  }();
  NT3.ClientRequestRoomList = function() {
    function ClientRequestRoomList(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ClientRequestRoomList.prototype.page = 0;
    ClientRequestRoomList.create = function create(properties) {
      return new ClientRequestRoomList(properties);
    };
    ClientRequestRoomList.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.page != null && Object.hasOwnProperty.call(message, "page"))
        writer.uint32(
          /* id 1, wireType 0 =*/
          8
        ).uint32(message.page);
      return writer;
    };
    ClientRequestRoomList.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ClientRequestRoomList.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ClientRequestRoomList();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.page = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ClientRequestRoomList.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ClientRequestRoomList.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.page != null && message.hasOwnProperty("page")) {
        if (!$util.isInteger(message.page))
          return "page: integer expected";
      }
      return null;
    };
    ClientRequestRoomList.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ClientRequestRoomList)
        return object;
      let message = new $root.NT.ClientRequestRoomList();
      if (object.page != null)
        message.page = object.page >>> 0;
      return message;
    };
    ClientRequestRoomList.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.page = 0;
      if (message.page != null && message.hasOwnProperty("page"))
        object.page = message.page;
      return object;
    };
    ClientRequestRoomList.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ClientRequestRoomList.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ClientRequestRoomList";
    };
    return ClientRequestRoomList;
  }();
  NT3.ServerRoomList = function() {
    function ServerRoomList(properties) {
      this.rooms = [];
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerRoomList.prototype.rooms = $util.emptyArray;
    ServerRoomList.prototype.pages = null;
    let $oneOfFields;
    Object.defineProperty(ServerRoomList.prototype, "_pages", {
      get: $util.oneOfGetter($oneOfFields = ["pages"]),
      set: $util.oneOfSetter($oneOfFields)
    });
    ServerRoomList.create = function create(properties) {
      return new ServerRoomList(properties);
    };
    ServerRoomList.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.rooms != null && message.rooms.length)
        for (let i = 0; i < message.rooms.length; ++i)
          $root.NT.ServerRoomList.Room.encode(message.rooms[i], writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).fork()).ldelim();
      if (message.pages != null && Object.hasOwnProperty.call(message, "pages"))
        writer.uint32(
          /* id 2, wireType 0 =*/
          16
        ).uint32(message.pages);
      return writer;
    };
    ServerRoomList.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerRoomList.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomList();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            if (!(message.rooms && message.rooms.length))
              message.rooms = [];
            message.rooms.push($root.NT.ServerRoomList.Room.decode(reader, reader.uint32()));
            break;
          }
          case 2: {
            message.pages = reader.uint32();
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerRoomList.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerRoomList.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      let properties = {};
      if (message.rooms != null && message.hasOwnProperty("rooms")) {
        if (!Array.isArray(message.rooms))
          return "rooms: array expected";
        for (let i = 0; i < message.rooms.length; ++i) {
          let error = $root.NT.ServerRoomList.Room.verify(message.rooms[i]);
          if (error)
            return "rooms." + error;
        }
      }
      if (message.pages != null && message.hasOwnProperty("pages")) {
        properties._pages = 1;
        if (!$util.isInteger(message.pages))
          return "pages: integer expected";
      }
      return null;
    };
    ServerRoomList.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerRoomList)
        return object;
      let message = new $root.NT.ServerRoomList();
      if (object.rooms) {
        if (!Array.isArray(object.rooms))
          throw TypeError(".NT.ServerRoomList.rooms: array expected");
        message.rooms = [];
        for (let i = 0; i < object.rooms.length; ++i) {
          if (typeof object.rooms[i] !== "object")
            throw TypeError(".NT.ServerRoomList.rooms: object expected");
          message.rooms[i] = $root.NT.ServerRoomList.Room.fromObject(object.rooms[i]);
        }
      }
      if (object.pages != null)
        message.pages = object.pages >>> 0;
      return message;
    };
    ServerRoomList.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.arrays || options.defaults)
        object.rooms = [];
      if (message.rooms && message.rooms.length) {
        object.rooms = [];
        for (let j = 0; j < message.rooms.length; ++j)
          object.rooms[j] = $root.NT.ServerRoomList.Room.toObject(message.rooms[j], options);
      }
      if (message.pages != null && message.hasOwnProperty("pages")) {
        object.pages = message.pages;
        if (options.oneofs)
          object._pages = "pages";
      }
      return object;
    };
    ServerRoomList.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerRoomList.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerRoomList";
    };
    ServerRoomList.Room = function() {
      function Room(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Room.prototype.id = "";
      Room.prototype.name = "";
      Room.prototype.gamemode = 0;
      Room.prototype.curUsers = 0;
      Room.prototype.maxUsers = 0;
      Room.prototype["protected"] = false;
      Room.prototype.owner = "";
      Room.prototype.locked = false;
      Room.create = function create(properties) {
        return new Room(properties);
      };
      Room.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.id != null && Object.hasOwnProperty.call(message, "id"))
          writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).string(message.id);
        if (message.name != null && Object.hasOwnProperty.call(message, "name"))
          writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).string(message.name);
        if (message.gamemode != null && Object.hasOwnProperty.call(message, "gamemode"))
          writer.uint32(
            /* id 3, wireType 0 =*/
            24
          ).uint32(message.gamemode);
        if (message.curUsers != null && Object.hasOwnProperty.call(message, "curUsers"))
          writer.uint32(
            /* id 4, wireType 0 =*/
            32
          ).uint32(message.curUsers);
        if (message.maxUsers != null && Object.hasOwnProperty.call(message, "maxUsers"))
          writer.uint32(
            /* id 5, wireType 0 =*/
            40
          ).uint32(message.maxUsers);
        if (message["protected"] != null && Object.hasOwnProperty.call(message, "protected"))
          writer.uint32(
            /* id 6, wireType 0 =*/
            48
          ).bool(message["protected"]);
        if (message.owner != null && Object.hasOwnProperty.call(message, "owner"))
          writer.uint32(
            /* id 7, wireType 2 =*/
            58
          ).string(message.owner);
        if (message.locked != null && Object.hasOwnProperty.call(message, "locked"))
          writer.uint32(
            /* id 8, wireType 0 =*/
            64
          ).bool(message.locked);
        return writer;
      };
      Room.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Room.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomList.Room();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.id = reader.string();
              break;
            }
            case 2: {
              message.name = reader.string();
              break;
            }
            case 3: {
              message.gamemode = reader.uint32();
              break;
            }
            case 4: {
              message.curUsers = reader.uint32();
              break;
            }
            case 5: {
              message.maxUsers = reader.uint32();
              break;
            }
            case 6: {
              message["protected"] = reader.bool();
              break;
            }
            case 7: {
              message.owner = reader.string();
              break;
            }
            case 8: {
              message.locked = reader.bool();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Room.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Room.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.id != null && message.hasOwnProperty("id")) {
          if (!$util.isString(message.id))
            return "id: string expected";
        }
        if (message.name != null && message.hasOwnProperty("name")) {
          if (!$util.isString(message.name))
            return "name: string expected";
        }
        if (message.gamemode != null && message.hasOwnProperty("gamemode")) {
          if (!$util.isInteger(message.gamemode))
            return "gamemode: integer expected";
        }
        if (message.curUsers != null && message.hasOwnProperty("curUsers")) {
          if (!$util.isInteger(message.curUsers))
            return "curUsers: integer expected";
        }
        if (message.maxUsers != null && message.hasOwnProperty("maxUsers")) {
          if (!$util.isInteger(message.maxUsers))
            return "maxUsers: integer expected";
        }
        if (message["protected"] != null && message.hasOwnProperty("protected")) {
          if (typeof message["protected"] !== "boolean")
            return "protected: boolean expected";
        }
        if (message.owner != null && message.hasOwnProperty("owner")) {
          if (!$util.isString(message.owner))
            return "owner: string expected";
        }
        if (message.locked != null && message.hasOwnProperty("locked")) {
          if (typeof message.locked !== "boolean")
            return "locked: boolean expected";
        }
        return null;
      };
      Room.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerRoomList.Room)
          return object;
        let message = new $root.NT.ServerRoomList.Room();
        if (object.id != null)
          message.id = String(object.id);
        if (object.name != null)
          message.name = String(object.name);
        if (object.gamemode != null)
          message.gamemode = object.gamemode >>> 0;
        if (object.curUsers != null)
          message.curUsers = object.curUsers >>> 0;
        if (object.maxUsers != null)
          message.maxUsers = object.maxUsers >>> 0;
        if (object["protected"] != null)
          message["protected"] = Boolean(object["protected"]);
        if (object.owner != null)
          message.owner = String(object.owner);
        if (object.locked != null)
          message.locked = Boolean(object.locked);
        return message;
      };
      Room.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.id = "";
          object.name = "";
          object.gamemode = 0;
          object.curUsers = 0;
          object.maxUsers = 0;
          object["protected"] = false;
          object.owner = "";
          object.locked = false;
        }
        if (message.id != null && message.hasOwnProperty("id"))
          object.id = message.id;
        if (message.name != null && message.hasOwnProperty("name"))
          object.name = message.name;
        if (message.gamemode != null && message.hasOwnProperty("gamemode"))
          object.gamemode = message.gamemode;
        if (message.curUsers != null && message.hasOwnProperty("curUsers"))
          object.curUsers = message.curUsers;
        if (message.maxUsers != null && message.hasOwnProperty("maxUsers"))
          object.maxUsers = message.maxUsers;
        if (message["protected"] != null && message.hasOwnProperty("protected"))
          object["protected"] = message["protected"];
        if (message.owner != null && message.hasOwnProperty("owner"))
          object.owner = message.owner;
        if (message.locked != null && message.hasOwnProperty("locked"))
          object.locked = message.locked;
        return object;
      };
      Room.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Room.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerRoomList.Room";
      };
      return Room;
    }();
    return ServerRoomList;
  }();
  NT3.ServerRoomAddToList = function() {
    function ServerRoomAddToList(properties) {
      if (properties) {
        for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
          if (properties[keys[i]] != null)
            this[keys[i]] = properties[keys[i]];
      }
    }
    ServerRoomAddToList.prototype.room = null;
    ServerRoomAddToList.create = function create(properties) {
      return new ServerRoomAddToList(properties);
    };
    ServerRoomAddToList.encode = function encode(message, writer) {
      if (!writer)
        writer = $Writer.create();
      if (message.room != null && Object.hasOwnProperty.call(message, "room"))
        $root.NT.ServerRoomAddToList.Room.encode(message.room, writer.uint32(
          /* id 1, wireType 2 =*/
          10
        ).fork()).ldelim();
      return writer;
    };
    ServerRoomAddToList.encodeDelimited = function encodeDelimited(message, writer) {
      return this.encode(message, writer).ldelim();
    };
    ServerRoomAddToList.decode = function decode(reader, length) {
      if (!(reader instanceof $Reader))
        reader = $Reader.create(reader);
      let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomAddToList();
      while (reader.pos < end) {
        let tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: {
            message.room = $root.NT.ServerRoomAddToList.Room.decode(reader, reader.uint32());
            break;
          }
          default:
            reader.skipType(tag & 7);
            break;
        }
      }
      return message;
    };
    ServerRoomAddToList.decodeDelimited = function decodeDelimited(reader) {
      if (!(reader instanceof $Reader))
        reader = new $Reader(reader);
      return this.decode(reader, reader.uint32());
    };
    ServerRoomAddToList.verify = function verify(message) {
      if (typeof message !== "object" || message === null)
        return "object expected";
      if (message.room != null && message.hasOwnProperty("room")) {
        let error = $root.NT.ServerRoomAddToList.Room.verify(message.room);
        if (error)
          return "room." + error;
      }
      return null;
    };
    ServerRoomAddToList.fromObject = function fromObject(object) {
      if (object instanceof $root.NT.ServerRoomAddToList)
        return object;
      let message = new $root.NT.ServerRoomAddToList();
      if (object.room != null) {
        if (typeof object.room !== "object")
          throw TypeError(".NT.ServerRoomAddToList.room: object expected");
        message.room = $root.NT.ServerRoomAddToList.Room.fromObject(object.room);
      }
      return message;
    };
    ServerRoomAddToList.toObject = function toObject(message, options) {
      if (!options)
        options = {};
      let object = {};
      if (options.defaults)
        object.room = null;
      if (message.room != null && message.hasOwnProperty("room"))
        object.room = $root.NT.ServerRoomAddToList.Room.toObject(message.room, options);
      return object;
    };
    ServerRoomAddToList.prototype.toJSON = function toJSON() {
      return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };
    ServerRoomAddToList.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
      if (typeUrlPrefix === void 0) {
        typeUrlPrefix = "type.googleapis.com";
      }
      return typeUrlPrefix + "/NT.ServerRoomAddToList";
    };
    ServerRoomAddToList.Room = function() {
      function Room(properties) {
        if (properties) {
          for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
            if (properties[keys[i]] != null)
              this[keys[i]] = properties[keys[i]];
        }
      }
      Room.prototype.id = "";
      Room.prototype.name = "";
      Room.prototype.gamemode = 0;
      Room.prototype.curUsers = 0;
      Room.prototype.maxUsers = 0;
      Room.prototype["protected"] = false;
      Room.prototype.owner = "";
      Room.prototype.locked = false;
      Room.create = function create(properties) {
        return new Room(properties);
      };
      Room.encode = function encode(message, writer) {
        if (!writer)
          writer = $Writer.create();
        if (message.id != null && Object.hasOwnProperty.call(message, "id"))
          writer.uint32(
            /* id 1, wireType 2 =*/
            10
          ).string(message.id);
        if (message.name != null && Object.hasOwnProperty.call(message, "name"))
          writer.uint32(
            /* id 2, wireType 2 =*/
            18
          ).string(message.name);
        if (message.gamemode != null && Object.hasOwnProperty.call(message, "gamemode"))
          writer.uint32(
            /* id 3, wireType 0 =*/
            24
          ).uint32(message.gamemode);
        if (message.curUsers != null && Object.hasOwnProperty.call(message, "curUsers"))
          writer.uint32(
            /* id 4, wireType 0 =*/
            32
          ).uint32(message.curUsers);
        if (message.maxUsers != null && Object.hasOwnProperty.call(message, "maxUsers"))
          writer.uint32(
            /* id 5, wireType 0 =*/
            40
          ).uint32(message.maxUsers);
        if (message["protected"] != null && Object.hasOwnProperty.call(message, "protected"))
          writer.uint32(
            /* id 6, wireType 0 =*/
            48
          ).bool(message["protected"]);
        if (message.owner != null && Object.hasOwnProperty.call(message, "owner"))
          writer.uint32(
            /* id 7, wireType 2 =*/
            58
          ).string(message.owner);
        if (message.locked != null && Object.hasOwnProperty.call(message, "locked"))
          writer.uint32(
            /* id 8, wireType 0 =*/
            64
          ).bool(message.locked);
        return writer;
      };
      Room.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
      };
      Room.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
          reader = $Reader.create(reader);
        let end = length === void 0 ? reader.len : reader.pos + length, message = new $root.NT.ServerRoomAddToList.Room();
        while (reader.pos < end) {
          let tag = reader.uint32();
          switch (tag >>> 3) {
            case 1: {
              message.id = reader.string();
              break;
            }
            case 2: {
              message.name = reader.string();
              break;
            }
            case 3: {
              message.gamemode = reader.uint32();
              break;
            }
            case 4: {
              message.curUsers = reader.uint32();
              break;
            }
            case 5: {
              message.maxUsers = reader.uint32();
              break;
            }
            case 6: {
              message["protected"] = reader.bool();
              break;
            }
            case 7: {
              message.owner = reader.string();
              break;
            }
            case 8: {
              message.locked = reader.bool();
              break;
            }
            default:
              reader.skipType(tag & 7);
              break;
          }
        }
        return message;
      };
      Room.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
          reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
      };
      Room.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
          return "object expected";
        if (message.id != null && message.hasOwnProperty("id")) {
          if (!$util.isString(message.id))
            return "id: string expected";
        }
        if (message.name != null && message.hasOwnProperty("name")) {
          if (!$util.isString(message.name))
            return "name: string expected";
        }
        if (message.gamemode != null && message.hasOwnProperty("gamemode")) {
          if (!$util.isInteger(message.gamemode))
            return "gamemode: integer expected";
        }
        if (message.curUsers != null && message.hasOwnProperty("curUsers")) {
          if (!$util.isInteger(message.curUsers))
            return "curUsers: integer expected";
        }
        if (message.maxUsers != null && message.hasOwnProperty("maxUsers")) {
          if (!$util.isInteger(message.maxUsers))
            return "maxUsers: integer expected";
        }
        if (message["protected"] != null && message.hasOwnProperty("protected")) {
          if (typeof message["protected"] !== "boolean")
            return "protected: boolean expected";
        }
        if (message.owner != null && message.hasOwnProperty("owner")) {
          if (!$util.isString(message.owner))
            return "owner: string expected";
        }
        if (message.locked != null && message.hasOwnProperty("locked")) {
          if (typeof message.locked !== "boolean")
            return "locked: boolean expected";
        }
        return null;
      };
      Room.fromObject = function fromObject(object) {
        if (object instanceof $root.NT.ServerRoomAddToList.Room)
          return object;
        let message = new $root.NT.ServerRoomAddToList.Room();
        if (object.id != null)
          message.id = String(object.id);
        if (object.name != null)
          message.name = String(object.name);
        if (object.gamemode != null)
          message.gamemode = object.gamemode >>> 0;
        if (object.curUsers != null)
          message.curUsers = object.curUsers >>> 0;
        if (object.maxUsers != null)
          message.maxUsers = object.maxUsers >>> 0;
        if (object["protected"] != null)
          message["protected"] = Boolean(object["protected"]);
        if (object.owner != null)
          message.owner = String(object.owner);
        if (object.locked != null)
          message.locked = Boolean(object.locked);
        return message;
      };
      Room.toObject = function toObject(message, options) {
        if (!options)
          options = {};
        let object = {};
        if (options.defaults) {
          object.id = "";
          object.name = "";
          object.gamemode = 0;
          object.curUsers = 0;
          object.maxUsers = 0;
          object["protected"] = false;
          object.owner = "";
          object.locked = false;
        }
        if (message.id != null && message.hasOwnProperty("id"))
          object.id = message.id;
        if (message.name != null && message.hasOwnProperty("name"))
          object.name = message.name;
        if (message.gamemode != null && message.hasOwnProperty("gamemode"))
          object.gamemode = message.gamemode;
        if (message.curUsers != null && message.hasOwnProperty("curUsers"))
          object.curUsers = message.curUsers;
        if (message.maxUsers != null && message.hasOwnProperty("maxUsers"))
          object.maxUsers = message.maxUsers;
        if (message["protected"] != null && message.hasOwnProperty("protected"))
          object["protected"] = message["protected"];
        if (message.owner != null && message.hasOwnProperty("owner"))
          object.owner = message.owner;
        if (message.locked != null && message.hasOwnProperty("locked"))
          object.locked = message.locked;
        return object;
      };
      Room.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
      };
      Room.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === void 0) {
          typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/NT.ServerRoomAddToList.Room";
      };
      return Room;
    }();
    return ServerRoomAddToList;
  }();
  return NT3;
})();

// src/compact_move.ts
var createArmrCoder = (targetBytes) => {
  const factor = 2 ** (7 * targetBytes);
  const pi2 = Math.PI * 2 + 1;
  return {
    /**
     * Lossily encode `v`, a value in radians between -PI and PI,
     * as an unsigned integer to fit within `targetBytes` of
     * serialized protobuf output.
     * @see {createArmrCoder}
     */
    encodeArmR: (v) => (v + Math.PI) * factor / pi2 | 0,
    /**
     * Decode a lossily-encoded value `v` to a value in radians
     * between -PI and PI.
     * @see {createArmrCoder}
     */
    decodeArmR: (v) => v * pi2 / factor - Math.PI
  };
};
var createDeltaCoder = (fractionalDigits) => {
  const factor = 10 ** fractionalDigits;
  return {
    encodeDelta: (len, get) => {
      if (len === 0)
        return { init: 0, deltas: [] };
      const init = get(0);
      const deltas = [];
      if (typeof init !== "number")
        throw new Error("Invalid value");
      let last = init;
      for (let i = 1; i < len; i++) {
        const val = get(i);
        if (typeof val !== "number")
          throw new Error("Invalid value");
        const d = Math.round((val - last) * factor);
        deltas.push(d);
        last += d / factor;
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
    }
  };
};
var encodeBitfield = (len, next) => {
  if (len > 32)
    throw new Error("Cannot encode more than 32 values in a bitfield");
  let res = 0;
  for (let i = 0; i < len; i++) {
    const val = next(i);
    if (val !== -1 && val !== 1)
      throw new Error("Invalid value: " + val);
    res |= val + 1 >>> 1 << i;
  }
  return res >>> 0;
};
var decodeBitfield = (len, val, set) => {
  if (len > 32)
    throw new Error("Cannot encode more than 32 values in a bitfield");
  for (let i = 0; i < len; i++) {
    set(i, ((val & 1) << 1) - 1);
    val >>>= 1;
  }
};
var encodeStable = (len, get) => {
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
var decodeStable = (len, idxs, vals, set) => {
  if (idxs.length !== vals.length)
    throw new Error("Invalid data: arrays must be same length");
  let cur = 0;
  for (let i = 0, pos = 0; i < len; i++) {
    if (idxs[pos] === i) {
      cur = vals[pos];
      pos++;
    }
    set(i, cur);
  }
};
var createFrameCoder = (opts = {}) => {
  const { encodeArmR, decodeArmR } = createArmrCoder(opts.armrTargetBytes ?? 1);
  const { encodeDelta, decodeDelta } = createDeltaCoder(opts.deltaCoderFractionalDigits ?? 1);
  const encodeFrames = (frames) => {
    const numFrames = frames.length;
    if (numFrames === 0)
      return new NT.CompactPlayerFrames();
    if (numFrames > 32)
      throw new Error("cannot compact more than 32 frames");
    const { init: xInit, deltas: xDeltas } = encodeDelta(numFrames, (i) => frames[i].x);
    const { init: yInit, deltas: yDeltas } = encodeDelta(numFrames, (i) => frames[i].y);
    const armR = frames.map((f) => encodeArmR(f.armR));
    const armScaleY = encodeBitfield(numFrames, (i) => frames[i].armScaleY);
    const scaleX = encodeBitfield(numFrames, (i) => frames[i].scaleX);
    const { idxs: animIdx, vals: animVal } = encodeStable(numFrames, (i) => frames[i].anim);
    const { idxs: heldIdx, vals: heldVal } = encodeStable(numFrames, (i) => frames[i].held);
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
      heldVal
    });
  };
  const decodeFrames = (pm) => {
    const numFrames = pm.armR.length;
    const frames = new Array(numFrames);
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
    decodeStable(numFrames, pm.animIdx, pm.animVal, (i, v) => frames[i].anim = v);
    decodeStable(numFrames, pm.heldIdx, pm.heldVal, (i, v) => frames[i].held = v);
    return frames;
  };
  return { encodeFrames, decodeFrames };
};

// src/gen/pbjs_pb.json
var pbjs_pb_default = {
  nested: {
    NT: {
      nested: {
        Envelope: {
          oneofs: {
            kind: {
              oneof: [
                "gameAction",
                "lobbyAction"
              ]
            }
          },
          fields: {
            gameAction: {
              type: "GameAction",
              id: 1
            },
            lobbyAction: {
              type: "LobbyAction",
              id: 50
            }
          }
        },
        GameAction: {
          oneofs: {
            action: {
              oneof: [
                "cPlayerMove",
                "sPlayerMoves",
                "cPlayerUpdate",
                "sPlayerUpdate",
                "cPlayerUpdateInventory",
                "sPlayerUpdateInventory",
                "cHostItemBank",
                "sHostItemBank",
                "cHostUserTake",
                "sHostUserTake",
                "cHostUserTakeGold",
                "sHostUserTakeGold",
                "cPlayerAddGold",
                "sPlayerAddGold",
                "cPlayerTakeGold",
                "sPlayerTakeGold",
                "cPlayerAddItem",
                "sPlayerAddItem",
                "cPlayerTakeItem",
                "sPlayerTakeItem",
                "cPlayerPickup",
                "sPlayerPickup",
                "cNemesisAbility",
                "sNemesisAbility",
                "cNemesisPickupItem",
                "sNemesisPickupItem",
                "cChat",
                "sChat",
                "cPlayerDeath",
                "sPlayerDeath",
                "cPlayerNewGamePlus",
                "sPlayerNewGamePlus",
                "cPlayerSecretHourglass",
                "sPlayerSecretHourglass",
                "cCustomModEvent",
                "sCustomModEvent",
                "cRespawnPenalty",
                "sRespawnPenalty",
                "cAngerySteve",
                "sAngerySteve",
                "sStatUpdate"
              ]
            }
          },
          fields: {
            cPlayerMove: {
              type: "CompactPlayerFrames",
              id: 1
            },
            sPlayerMoves: {
              type: "ServerPlayerMoves",
              id: 2
            },
            cPlayerUpdate: {
              type: "ClientPlayerUpdate",
              id: 3
            },
            sPlayerUpdate: {
              type: "ServerPlayerUpdate",
              id: 4
            },
            cPlayerUpdateInventory: {
              type: "ClientPlayerUpdateInventory",
              id: 5
            },
            sPlayerUpdateInventory: {
              type: "ServerPlayerUpdateInventory",
              id: 6
            },
            cHostItemBank: {
              type: "ClientHostItemBank",
              id: 7
            },
            sHostItemBank: {
              type: "ServerHostItemBank",
              id: 8
            },
            cHostUserTake: {
              type: "ClientHostUserTake",
              id: 9
            },
            sHostUserTake: {
              type: "ServerHostUserTake",
              id: 10
            },
            cHostUserTakeGold: {
              type: "ClientHostUserTakeGold",
              id: 11
            },
            sHostUserTakeGold: {
              type: "ServerHostUserTakeGold",
              id: 12
            },
            cPlayerAddGold: {
              type: "ClientPlayerAddGold",
              id: 13
            },
            sPlayerAddGold: {
              type: "ServerPlayerAddGold",
              id: 14
            },
            cPlayerTakeGold: {
              type: "ClientPlayerTakeGold",
              id: 15
            },
            sPlayerTakeGold: {
              type: "ServerPlayerTakeGold",
              id: 16
            },
            cPlayerAddItem: {
              type: "ClientPlayerAddItem",
              id: 17
            },
            sPlayerAddItem: {
              type: "ServerPlayerAddItem",
              id: 18
            },
            cPlayerTakeItem: {
              type: "ClientPlayerTakeItem",
              id: 19
            },
            sPlayerTakeItem: {
              type: "ServerPlayerTakeItem",
              id: 20
            },
            cPlayerPickup: {
              type: "ClientPlayerPickup",
              id: 21
            },
            sPlayerPickup: {
              type: "ServerPlayerPickup",
              id: 22
            },
            cNemesisAbility: {
              type: "ClientNemesisAbility",
              id: 23
            },
            sNemesisAbility: {
              type: "ServerNemesisAbility",
              id: 24
            },
            cNemesisPickupItem: {
              type: "ClientNemesisPickupItem",
              id: 25
            },
            sNemesisPickupItem: {
              type: "ServerNemesisPickupItem",
              id: 26
            },
            cChat: {
              type: "ClientChat",
              id: 27
            },
            sChat: {
              type: "ServerChat",
              id: 28
            },
            cPlayerDeath: {
              type: "ClientPlayerDeath",
              id: 29
            },
            sPlayerDeath: {
              type: "ServerPlayerDeath",
              id: 30
            },
            cPlayerNewGamePlus: {
              type: "ClientPlayerNewGamePlus",
              id: 31
            },
            sPlayerNewGamePlus: {
              type: "ServerPlayerNewGamePlus",
              id: 32
            },
            cPlayerSecretHourglass: {
              type: "ClientPlayerSecretHourglass",
              id: 33
            },
            sPlayerSecretHourglass: {
              type: "ServerPlayerSecretHourglass",
              id: 34
            },
            cCustomModEvent: {
              type: "ClientCustomModEvent",
              id: 35
            },
            sCustomModEvent: {
              type: "ServerCustomModEvent",
              id: 36
            },
            cRespawnPenalty: {
              type: "ClientRespawnPenalty",
              id: 37
            },
            sRespawnPenalty: {
              type: "ServerRespawnPenalty",
              id: 38
            },
            cAngerySteve: {
              type: "ClientAngerySteve",
              id: 39
            },
            sAngerySteve: {
              type: "ServerAngerySteve",
              id: 40
            },
            sStatUpdate: {
              type: "ServerStatsUpdate",
              id: 42
            }
          }
        },
        PlayerFrame: {
          oneofs: {
            _x: {
              oneof: [
                "x"
              ]
            },
            _y: {
              oneof: [
                "y"
              ]
            },
            _armR: {
              oneof: [
                "armR"
              ]
            },
            _armScaleY: {
              oneof: [
                "armScaleY"
              ]
            },
            _scaleX: {
              oneof: [
                "scaleX"
              ]
            },
            _anim: {
              oneof: [
                "anim"
              ]
            },
            _held: {
              oneof: [
                "held"
              ]
            }
          },
          fields: {
            x: {
              type: "float",
              id: 1,
              options: {
                proto3_optional: true
              }
            },
            y: {
              type: "float",
              id: 2,
              options: {
                proto3_optional: true
              }
            },
            armR: {
              type: "float",
              id: 3,
              options: {
                proto3_optional: true
              }
            },
            armScaleY: {
              type: "float",
              id: 4,
              options: {
                proto3_optional: true
              }
            },
            scaleX: {
              type: "float",
              id: 5,
              options: {
                proto3_optional: true
              }
            },
            anim: {
              type: "int32",
              id: 6,
              options: {
                proto3_optional: true
              }
            },
            held: {
              type: "int32",
              id: 7,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        OldClientPlayerMove: {
          fields: {
            frames: {
              rule: "repeated",
              type: "PlayerFrame",
              id: 1
            }
          }
        },
        OldServerPlayerMove: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            frames: {
              rule: "repeated",
              type: "PlayerFrame",
              id: 2
            }
          }
        },
        CompactPlayerFrames: {
          fields: {
            xInit: {
              type: "float",
              id: 1
            },
            yInit: {
              type: "float",
              id: 2
            },
            xDeltas: {
              rule: "repeated",
              type: "sint32",
              id: 3
            },
            yDeltas: {
              rule: "repeated",
              type: "sint32",
              id: 4
            },
            armR: {
              rule: "repeated",
              type: "int32",
              id: 5
            },
            armScaleY: {
              type: "int32",
              id: 6
            },
            scaleX: {
              type: "int32",
              id: 7
            },
            animIdx: {
              rule: "repeated",
              type: "int32",
              id: 8
            },
            animVal: {
              rule: "repeated",
              type: "int32",
              id: 9
            },
            heldIdx: {
              rule: "repeated",
              type: "int32",
              id: 10
            },
            heldVal: {
              rule: "repeated",
              type: "int32",
              id: 11
            },
            userId: {
              type: "string",
              id: 15
            }
          }
        },
        ServerPlayerMoves: {
          fields: {
            userFrames: {
              rule: "repeated",
              type: "CompactPlayerFrames",
              id: 1
            }
          }
        },
        ClientPlayerUpdate: {
          oneofs: {
            _curHp: {
              oneof: [
                "curHp"
              ]
            },
            _maxHp: {
              oneof: [
                "maxHp"
              ]
            },
            _location: {
              oneof: [
                "location"
              ]
            },
            _sampo: {
              oneof: [
                "sampo"
              ]
            }
          },
          fields: {
            curHp: {
              type: "float",
              id: 1,
              options: {
                proto3_optional: true
              }
            },
            maxHp: {
              type: "float",
              id: 2,
              options: {
                proto3_optional: true
              }
            },
            location: {
              type: "string",
              id: 3,
              options: {
                proto3_optional: true
              }
            },
            sampo: {
              type: "bool",
              id: 4,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ServerPlayerUpdate: {
          oneofs: {
            _curHp: {
              oneof: [
                "curHp"
              ]
            },
            _maxHp: {
              oneof: [
                "maxHp"
              ]
            },
            _location: {
              oneof: [
                "location"
              ]
            },
            _sampo: {
              oneof: [
                "sampo"
              ]
            }
          },
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            curHp: {
              type: "float",
              id: 2,
              options: {
                proto3_optional: true
              }
            },
            maxHp: {
              type: "float",
              id: 3,
              options: {
                proto3_optional: true
              }
            },
            location: {
              type: "string",
              id: 4,
              options: {
                proto3_optional: true
              }
            },
            sampo: {
              type: "bool",
              id: 5,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ClientPlayerUpdateInventory: {
          fields: {
            wands: {
              rule: "repeated",
              type: "InventoryWand",
              id: 1
            },
            items: {
              rule: "repeated",
              type: "InventoryItem",
              id: 2
            },
            spells: {
              rule: "repeated",
              type: "InventorySpell",
              id: 3
            }
          },
          nested: {
            InventoryWand: {
              fields: {
                index: {
                  type: "uint32",
                  id: 1
                },
                wand: {
                  type: "Wand",
                  id: 2
                }
              }
            },
            InventoryItem: {
              fields: {
                index: {
                  type: "uint32",
                  id: 3
                },
                item: {
                  type: "Item",
                  id: 4
                }
              }
            },
            InventorySpell: {
              fields: {
                index: {
                  type: "uint32",
                  id: 1
                },
                spell: {
                  type: "Spell",
                  id: 2
                }
              }
            }
          }
        },
        ServerPlayerUpdateInventory: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            wands: {
              rule: "repeated",
              type: "InventoryWand",
              id: 2
            },
            items: {
              rule: "repeated",
              type: "InventoryItem",
              id: 3
            },
            spells: {
              rule: "repeated",
              type: "InventorySpell",
              id: 4
            }
          },
          nested: {
            InventoryWand: {
              fields: {
                index: {
                  type: "uint32",
                  id: 1
                },
                wand: {
                  type: "Wand",
                  id: 2
                }
              }
            },
            InventoryItem: {
              fields: {
                index: {
                  type: "uint32",
                  id: 1
                },
                item: {
                  type: "Item",
                  id: 2
                }
              }
            },
            InventorySpell: {
              fields: {
                index: {
                  type: "uint32",
                  id: 1
                },
                spell: {
                  type: "Spell",
                  id: 2
                }
              }
            }
          }
        },
        ClientHostItemBank: {
          fields: {
            wands: {
              rule: "repeated",
              type: "Wand",
              id: 1
            },
            spells: {
              rule: "repeated",
              type: "Spell",
              id: 2
            },
            items: {
              rule: "repeated",
              type: "Item",
              id: 3
            },
            gold: {
              type: "uint32",
              id: 4
            },
            objects: {
              rule: "repeated",
              type: "EntityItem",
              id: 5
            }
          }
        },
        ServerHostItemBank: {
          fields: {
            wands: {
              rule: "repeated",
              type: "Wand",
              id: 1
            },
            spells: {
              rule: "repeated",
              type: "Spell",
              id: 2
            },
            items: {
              rule: "repeated",
              type: "Item",
              id: 3
            },
            gold: {
              type: "uint32",
              id: 4
            },
            objects: {
              rule: "repeated",
              type: "EntityItem",
              id: 5
            }
          }
        },
        ClientHostUserTake: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            id: {
              type: "string",
              id: 2
            },
            success: {
              type: "bool",
              id: 3
            }
          }
        },
        ServerHostUserTake: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            id: {
              type: "string",
              id: 2
            },
            success: {
              type: "bool",
              id: 3
            }
          }
        },
        ClientHostUserTakeGold: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            amount: {
              type: "uint32",
              id: 2
            },
            success: {
              type: "bool",
              id: 3
            }
          }
        },
        ServerHostUserTakeGold: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            amount: {
              type: "uint32",
              id: 2
            },
            success: {
              type: "bool",
              id: 3
            }
          }
        },
        ClientPlayerAddGold: {
          fields: {
            amount: {
              type: "uint32",
              id: 1
            }
          }
        },
        ServerPlayerAddGold: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            amount: {
              type: "uint32",
              id: 2
            }
          }
        },
        ClientPlayerTakeGold: {
          fields: {
            amount: {
              type: "uint32",
              id: 1
            }
          }
        },
        ServerPlayerTakeGold: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            amount: {
              type: "uint32",
              id: 2
            }
          }
        },
        ClientPlayerAddItem: {
          oneofs: {
            item: {
              oneof: [
                "spells",
                "wands",
                "flasks",
                "objects"
              ]
            }
          },
          fields: {
            spells: {
              type: "Spells",
              id: 1
            },
            wands: {
              type: "Wands",
              id: 2
            },
            flasks: {
              type: "Items",
              id: 3
            },
            objects: {
              type: "Entities",
              id: 4
            }
          },
          nested: {
            Spells: {
              fields: {
                list: {
                  rule: "repeated",
                  type: "Spell",
                  id: 1
                }
              }
            },
            Wands: {
              fields: {
                list: {
                  rule: "repeated",
                  type: "Wand",
                  id: 1
                }
              }
            },
            Items: {
              fields: {
                list: {
                  rule: "repeated",
                  type: "Item",
                  id: 1
                }
              }
            },
            Entities: {
              fields: {
                list: {
                  rule: "repeated",
                  type: "EntityItem",
                  id: 1
                }
              }
            }
          }
        },
        ServerPlayerAddItem: {
          oneofs: {
            item: {
              oneof: [
                "spells",
                "wands",
                "flasks",
                "objects"
              ]
            }
          },
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            spells: {
              type: "Spells",
              id: 2
            },
            wands: {
              type: "Wands",
              id: 3
            },
            flasks: {
              type: "Items",
              id: 4
            },
            objects: {
              type: "Entities",
              id: 5
            }
          },
          nested: {
            Spells: {
              fields: {
                list: {
                  rule: "repeated",
                  type: "Spell",
                  id: 1
                }
              }
            },
            Wands: {
              fields: {
                list: {
                  rule: "repeated",
                  type: "Wand",
                  id: 2
                }
              }
            },
            Items: {
              fields: {
                list: {
                  rule: "repeated",
                  type: "Item",
                  id: 3
                }
              }
            },
            Entities: {
              fields: {
                list: {
                  rule: "repeated",
                  type: "EntityItem",
                  id: 4
                }
              }
            }
          }
        },
        ClientPlayerTakeItem: {
          fields: {
            id: {
              type: "string",
              id: 1
            }
          }
        },
        ServerPlayerTakeItem: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            id: {
              type: "string",
              id: 2
            }
          }
        },
        ClientChat: {
          fields: {
            message: {
              type: "string",
              id: 1
            }
          }
        },
        ServerChat: {
          fields: {
            id: {
              type: "string",
              id: 1
            },
            userId: {
              type: "string",
              id: 2
            },
            name: {
              type: "string",
              id: 3
            },
            message: {
              type: "string",
              id: 4
            }
          }
        },
        ServerStatsUpdate: {
          fields: {
            data: {
              type: "string",
              id: 1
            }
          }
        },
        ClientPlayerPickup: {
          oneofs: {
            kind: {
              oneof: [
                "heart",
                "orb"
              ]
            }
          },
          fields: {
            heart: {
              type: "HeartPickup",
              id: 1
            },
            orb: {
              type: "OrbPickup",
              id: 2
            }
          },
          nested: {
            HeartPickup: {
              fields: {
                hpPerk: {
                  type: "bool",
                  id: 1
                }
              }
            },
            OrbPickup: {
              fields: {
                id: {
                  type: "uint32",
                  id: 1
                }
              }
            }
          }
        },
        ServerPlayerPickup: {
          oneofs: {
            kind: {
              oneof: [
                "heart",
                "orb"
              ]
            }
          },
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            heart: {
              type: "HeartPickup",
              id: 2
            },
            orb: {
              type: "OrbPickup",
              id: 3
            }
          },
          nested: {
            HeartPickup: {
              fields: {
                hpPerk: {
                  type: "bool",
                  id: 1
                }
              }
            },
            OrbPickup: {
              fields: {
                id: {
                  type: "uint32",
                  id: 1
                }
              }
            }
          }
        },
        ClientNemesisPickupItem: {
          fields: {
            gameId: {
              type: "string",
              id: 1
            }
          }
        },
        ServerNemesisPickupItem: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            gameId: {
              type: "string",
              id: 2
            }
          }
        },
        ClientNemesisAbility: {
          fields: {
            gameId: {
              type: "string",
              id: 1
            }
          }
        },
        ServerNemesisAbility: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            gameId: {
              type: "string",
              id: 2
            }
          }
        },
        ClientPlayerDeath: {
          oneofs: {
            _gameTime: {
              oneof: [
                "gameTime"
              ]
            }
          },
          fields: {
            isWin: {
              type: "bool",
              id: 1
            },
            gameTime: {
              type: "uint32",
              id: 2,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ServerPlayerDeath: {
          oneofs: {
            _gameTime: {
              oneof: [
                "gameTime"
              ]
            }
          },
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            isWin: {
              type: "bool",
              id: 2
            },
            gameTime: {
              type: "uint32",
              id: 3,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ClientPlayerNewGamePlus: {
          fields: {
            amount: {
              type: "uint32",
              id: 1
            }
          }
        },
        ServerPlayerNewGamePlus: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            amount: {
              type: "uint32",
              id: 2
            }
          }
        },
        ClientPlayerSecretHourglass: {
          fields: {
            material: {
              type: "string",
              id: 1
            }
          }
        },
        ServerPlayerSecretHourglass: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            material: {
              type: "string",
              id: 2
            }
          }
        },
        ClientCustomModEvent: {
          fields: {
            payload: {
              type: "string",
              id: 1
            }
          }
        },
        ServerCustomModEvent: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            payload: {
              type: "string",
              id: 2
            }
          }
        },
        ClientRespawnPenalty: {
          fields: {
            deaths: {
              type: "uint32",
              id: 1
            }
          }
        },
        ServerRespawnPenalty: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            deaths: {
              type: "uint32",
              id: 2
            }
          }
        },
        ClientAngerySteve: {
          fields: {
            idk: {
              type: "bool",
              id: 1
            }
          }
        },
        ServerAngerySteve: {
          fields: {
            userId: {
              type: "string",
              id: 1
            }
          }
        },
        Wand: {
          oneofs: {
            _sentBy: {
              oneof: [
                "sentBy"
              ]
            },
            _contributedBy: {
              oneof: [
                "contributedBy"
              ]
            }
          },
          fields: {
            id: {
              type: "string",
              id: 1
            },
            stats: {
              type: "WandStats",
              id: 2
            },
            alwaysCast: {
              rule: "repeated",
              type: "Spell",
              id: 3
            },
            deck: {
              rule: "repeated",
              type: "Spell",
              id: 4
            },
            sentBy: {
              type: "string",
              id: 5,
              options: {
                proto3_optional: true
              }
            },
            contributedBy: {
              type: "string",
              id: 6,
              options: {
                proto3_optional: true
              }
            }
          },
          nested: {
            WandStats: {
              fields: {
                sprite: {
                  type: "string",
                  id: 1
                },
                named: {
                  type: "bool",
                  id: 2
                },
                uiName: {
                  type: "string",
                  id: 3
                },
                manaMax: {
                  type: "float",
                  id: 4
                },
                manaChargeSpeed: {
                  type: "float",
                  id: 5
                },
                reloadTime: {
                  type: "int32",
                  id: 6
                },
                actionsPerRound: {
                  type: "uint32",
                  id: 7
                },
                deckCapacity: {
                  type: "uint32",
                  id: 8
                },
                shuffleDeckWhenEmpty: {
                  type: "bool",
                  id: 9
                },
                spreadDegrees: {
                  type: "float",
                  id: 10
                },
                speedMultiplier: {
                  type: "float",
                  id: 11
                },
                fireRateWait: {
                  type: "int32",
                  id: 12
                },
                tipX: {
                  type: "float",
                  id: 13
                },
                tipY: {
                  type: "float",
                  id: 14
                },
                gripX: {
                  type: "float",
                  id: 15
                },
                gripY: {
                  type: "float",
                  id: 16
                }
              }
            }
          }
        },
        Spell: {
          oneofs: {
            _sentBy: {
              oneof: [
                "sentBy"
              ]
            },
            _contributedBy: {
              oneof: [
                "contributedBy"
              ]
            }
          },
          fields: {
            id: {
              type: "string",
              id: 1
            },
            gameId: {
              type: "string",
              id: 2
            },
            sentBy: {
              type: "string",
              id: 3,
              options: {
                proto3_optional: true
              }
            },
            contributedBy: {
              type: "string",
              id: 4,
              options: {
                proto3_optional: true
              }
            },
            usesRemaining: {
              type: "int32",
              id: 5
            }
          }
        },
        Item: {
          oneofs: {
            _sentBy: {
              oneof: [
                "sentBy"
              ]
            },
            _contributedBy: {
              oneof: [
                "contributedBy"
              ]
            }
          },
          fields: {
            id: {
              type: "string",
              id: 1
            },
            color: {
              type: "Color",
              id: 2
            },
            content: {
              rule: "repeated",
              type: "Material",
              id: 3
            },
            sentBy: {
              type: "string",
              id: 4,
              options: {
                proto3_optional: true
              }
            },
            contributedBy: {
              type: "string",
              id: 5,
              options: {
                proto3_optional: true
              }
            },
            isChest: {
              type: "bool",
              id: 6,
              options: {
                deprecated: true
              }
            },
            itemType: {
              type: "string",
              id: 7
            }
          },
          nested: {
            Color: {
              fields: {
                r: {
                  type: "float",
                  id: 1
                },
                g: {
                  type: "float",
                  id: 2
                },
                b: {
                  type: "float",
                  id: 3
                }
              }
            },
            Material: {
              fields: {
                id: {
                  type: "uint32",
                  id: 1
                },
                amount: {
                  type: "uint32",
                  id: 2
                }
              }
            }
          }
        },
        EntityItem: {
          oneofs: {
            _sentBy: {
              oneof: [
                "sentBy"
              ]
            }
          },
          fields: {
            id: {
              type: "string",
              id: 1
            },
            path: {
              type: "string",
              id: 2
            },
            sprite: {
              type: "string",
              id: 3
            },
            sentBy: {
              type: "string",
              id: 4,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        LobbyAction: {
          oneofs: {
            action: {
              oneof: [
                "cRoomCreate",
                "sRoomCreated",
                "sRoomCreateFailed",
                "cRoomUpdate",
                "sRoomUpdated",
                "sRoomUpdateFailed",
                "cRoomFlagsUpdate",
                "sRoomFlagsUpdated",
                "sRoomFlagsUpdateFailed",
                "cRoomDelete",
                "sRoomDeleted",
                "cJoinRoom",
                "sJoinRoomSuccess",
                "sJoinRoomFailed",
                "sUserJoinedRoom",
                "cLeaveRoom",
                "sUserLeftRoom",
                "cKickUser",
                "sUserKicked",
                "cBanUser",
                "sUserBanned",
                "cReadyState",
                "sUserReadyState",
                "cStartRun",
                "sHostStart",
                "cRequestRoomList",
                "sRoomList",
                "sDisconnected",
                "sRoomAddToList",
                "cRunOver"
              ]
            }
          },
          fields: {
            cRoomCreate: {
              type: "ClientRoomCreate",
              id: 1
            },
            sRoomCreated: {
              type: "ServerRoomCreated",
              id: 2
            },
            sRoomCreateFailed: {
              type: "ServerRoomCreateFailed",
              id: 3
            },
            cRoomUpdate: {
              type: "ClientRoomUpdate",
              id: 4
            },
            sRoomUpdated: {
              type: "ServerRoomUpdated",
              id: 5
            },
            sRoomUpdateFailed: {
              type: "ServerRoomUpdateFailed",
              id: 6
            },
            cRoomFlagsUpdate: {
              type: "ClientRoomFlagsUpdate",
              id: 7
            },
            sRoomFlagsUpdated: {
              type: "ServerRoomFlagsUpdated",
              id: 8
            },
            sRoomFlagsUpdateFailed: {
              type: "ServerRoomFlagsUpdateFailed",
              id: 9
            },
            cRoomDelete: {
              type: "ClientRoomDelete",
              id: 10
            },
            sRoomDeleted: {
              type: "ServerRoomDeleted",
              id: 11
            },
            cJoinRoom: {
              type: "ClientJoinRoom",
              id: 12
            },
            sJoinRoomSuccess: {
              type: "ServerJoinRoomSuccess",
              id: 13
            },
            sJoinRoomFailed: {
              type: "ServerJoinRoomFailed",
              id: 14
            },
            sUserJoinedRoom: {
              type: "ServerUserJoinedRoom",
              id: 15
            },
            cLeaveRoom: {
              type: "ClientLeaveRoom",
              id: 16
            },
            sUserLeftRoom: {
              type: "ServerUserLeftRoom",
              id: 17
            },
            cKickUser: {
              type: "ClientKickUser",
              id: 18
            },
            sUserKicked: {
              type: "ServerUserKicked",
              id: 19
            },
            cBanUser: {
              type: "ClientBanUser",
              id: 20
            },
            sUserBanned: {
              type: "ServerUserBanned",
              id: 21
            },
            cReadyState: {
              type: "ClientReadyState",
              id: 22
            },
            sUserReadyState: {
              type: "ServerUserReadyState",
              id: 23
            },
            cStartRun: {
              type: "ClientStartRun",
              id: 24
            },
            sHostStart: {
              type: "ServerHostStart",
              id: 25
            },
            cRequestRoomList: {
              type: "ClientRequestRoomList",
              id: 27
            },
            sRoomList: {
              type: "ServerRoomList",
              id: 28
            },
            sDisconnected: {
              type: "ServerDisconnected",
              id: 31
            },
            sRoomAddToList: {
              type: "ServerRoomAddToList",
              id: 32
            },
            cRunOver: {
              type: "ClientRunOver",
              id: 33
            }
          }
        },
        ClientRunOver: {
          oneofs: {
            _idk: {
              oneof: [
                "idk"
              ]
            }
          },
          fields: {
            idk: {
              type: "bool",
              id: 1,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ServerDisconnected: {
          fields: {
            reason: {
              type: "string",
              id: 1
            }
          }
        },
        ClientRoomDelete: {
          fields: {
            id: {
              type: "string",
              id: 1
            }
          }
        },
        ServerRoomDeleted: {
          fields: {
            id: {
              type: "string",
              id: 1
            }
          }
        },
        ClientRoomCreate: {
          oneofs: {
            _password: {
              oneof: [
                "password"
              ]
            }
          },
          fields: {
            name: {
              type: "string",
              id: 1
            },
            gamemode: {
              type: "uint32",
              id: 2
            },
            maxUsers: {
              type: "uint32",
              id: 3
            },
            password: {
              type: "string",
              id: 4,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ServerRoomCreated: {
          oneofs: {
            _password: {
              oneof: [
                "password"
              ]
            }
          },
          fields: {
            id: {
              type: "string",
              id: 1
            },
            name: {
              type: "string",
              id: 2
            },
            gamemode: {
              type: "uint32",
              id: 3
            },
            maxUsers: {
              type: "uint32",
              id: 4
            },
            password: {
              type: "string",
              id: 5,
              options: {
                proto3_optional: true
              }
            },
            locked: {
              type: "bool",
              id: 6
            },
            users: {
              rule: "repeated",
              type: "User",
              id: 7
            }
          },
          nested: {
            User: {
              fields: {
                userId: {
                  type: "string",
                  id: 1
                },
                name: {
                  type: "string",
                  id: 2
                },
                ready: {
                  type: "bool",
                  id: 3
                },
                owner: {
                  type: "bool",
                  id: 4
                }
              }
            }
          }
        },
        ServerRoomCreateFailed: {
          fields: {
            reason: {
              type: "string",
              id: 1
            }
          }
        },
        ClientRoomUpdate: {
          oneofs: {
            _name: {
              oneof: [
                "name"
              ]
            },
            _gamemode: {
              oneof: [
                "gamemode"
              ]
            },
            _maxUsers: {
              oneof: [
                "maxUsers"
              ]
            },
            _password: {
              oneof: [
                "password"
              ]
            },
            _locked: {
              oneof: [
                "locked"
              ]
            }
          },
          fields: {
            name: {
              type: "string",
              id: 1,
              options: {
                proto3_optional: true
              }
            },
            gamemode: {
              type: "uint32",
              id: 2,
              options: {
                proto3_optional: true
              }
            },
            maxUsers: {
              type: "uint32",
              id: 3,
              options: {
                proto3_optional: true
              }
            },
            password: {
              type: "string",
              id: 4,
              options: {
                proto3_optional: true
              }
            },
            locked: {
              type: "bool",
              id: 5,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ServerRoomUpdated: {
          oneofs: {
            _name: {
              oneof: [
                "name"
              ]
            },
            _gamemode: {
              oneof: [
                "gamemode"
              ]
            },
            _maxUsers: {
              oneof: [
                "maxUsers"
              ]
            },
            _password: {
              oneof: [
                "password"
              ]
            },
            _locked: {
              oneof: [
                "locked"
              ]
            }
          },
          fields: {
            name: {
              type: "string",
              id: 1,
              options: {
                proto3_optional: true
              }
            },
            gamemode: {
              type: "uint32",
              id: 2,
              options: {
                proto3_optional: true
              }
            },
            maxUsers: {
              type: "uint32",
              id: 3,
              options: {
                proto3_optional: true
              }
            },
            password: {
              type: "string",
              id: 4,
              options: {
                proto3_optional: true
              }
            },
            locked: {
              type: "bool",
              id: 5,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ServerRoomUpdateFailed: {
          fields: {
            reason: {
              type: "string",
              id: 1
            }
          }
        },
        ClientRoomFlagsUpdate: {
          fields: {
            flags: {
              rule: "repeated",
              type: "GameFlag",
              id: 1
            }
          },
          nested: {
            GameFlag: {
              oneofs: {
                _intVal: {
                  oneof: [
                    "intVal"
                  ]
                },
                _strVal: {
                  oneof: [
                    "strVal"
                  ]
                },
                _floatVal: {
                  oneof: [
                    "floatVal"
                  ]
                },
                _boolVal: {
                  oneof: [
                    "boolVal"
                  ]
                },
                _uIntVal: {
                  oneof: [
                    "uIntVal"
                  ]
                }
              },
              fields: {
                flag: {
                  type: "string",
                  id: 1
                },
                intVal: {
                  type: "int32",
                  id: 2,
                  options: {
                    proto3_optional: true
                  }
                },
                strVal: {
                  type: "string",
                  id: 3,
                  options: {
                    proto3_optional: true
                  }
                },
                floatVal: {
                  type: "float",
                  id: 4,
                  options: {
                    proto3_optional: true
                  }
                },
                boolVal: {
                  type: "bool",
                  id: 5,
                  options: {
                    proto3_optional: true
                  }
                },
                uIntVal: {
                  type: "uint32",
                  id: 6,
                  options: {
                    proto3_optional: true
                  }
                }
              }
            }
          }
        },
        ServerRoomFlagsUpdated: {
          fields: {
            flags: {
              rule: "repeated",
              type: "GameFlag",
              id: 1
            }
          },
          nested: {
            GameFlag: {
              oneofs: {
                _intVal: {
                  oneof: [
                    "intVal"
                  ]
                },
                _strVal: {
                  oneof: [
                    "strVal"
                  ]
                },
                _floatVal: {
                  oneof: [
                    "floatVal"
                  ]
                },
                _boolVal: {
                  oneof: [
                    "boolVal"
                  ]
                },
                _uIntVal: {
                  oneof: [
                    "uIntVal"
                  ]
                }
              },
              fields: {
                flag: {
                  type: "string",
                  id: 1
                },
                intVal: {
                  type: "int32",
                  id: 2,
                  options: {
                    proto3_optional: true
                  }
                },
                strVal: {
                  type: "string",
                  id: 3,
                  options: {
                    proto3_optional: true
                  }
                },
                floatVal: {
                  type: "float",
                  id: 4,
                  options: {
                    proto3_optional: true
                  }
                },
                boolVal: {
                  type: "bool",
                  id: 5,
                  options: {
                    proto3_optional: true
                  }
                },
                uIntVal: {
                  type: "uint32",
                  id: 6,
                  options: {
                    proto3_optional: true
                  }
                }
              }
            }
          }
        },
        ServerRoomFlagsUpdateFailed: {
          fields: {
            reason: {
              type: "string",
              id: 1
            }
          }
        },
        ClientJoinRoom: {
          oneofs: {
            _password: {
              oneof: [
                "password"
              ]
            }
          },
          fields: {
            id: {
              type: "string",
              id: 1
            },
            password: {
              type: "string",
              id: 2,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ServerJoinRoomSuccess: {
          oneofs: {
            _password: {
              oneof: [
                "password"
              ]
            }
          },
          fields: {
            id: {
              type: "string",
              id: 1
            },
            name: {
              type: "string",
              id: 2
            },
            gamemode: {
              type: "uint32",
              id: 3
            },
            maxUsers: {
              type: "uint32",
              id: 4
            },
            password: {
              type: "string",
              id: 5,
              options: {
                proto3_optional: true
              }
            },
            locked: {
              type: "bool",
              id: 6
            },
            users: {
              rule: "repeated",
              type: "User",
              id: 7
            }
          },
          nested: {
            User: {
              fields: {
                userId: {
                  type: "string",
                  id: 1
                },
                name: {
                  type: "string",
                  id: 2
                },
                ready: {
                  type: "bool",
                  id: 3
                },
                owner: {
                  type: "bool",
                  id: 4
                }
              }
            }
          }
        },
        ServerJoinRoomFailed: {
          fields: {
            reason: {
              type: "string",
              id: 1
            }
          }
        },
        ServerUserJoinedRoom: {
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            name: {
              type: "string",
              id: 2
            }
          }
        },
        ClientLeaveRoom: {
          fields: {
            userId: {
              type: "string",
              id: 1
            }
          }
        },
        ServerUserLeftRoom: {
          fields: {
            userId: {
              type: "string",
              id: 1
            }
          }
        },
        ClientKickUser: {
          fields: {
            userId: {
              type: "string",
              id: 1
            }
          }
        },
        ServerUserKicked: {
          fields: {
            userId: {
              type: "string",
              id: 1
            }
          }
        },
        ClientBanUser: {
          fields: {
            userId: {
              type: "string",
              id: 1
            }
          }
        },
        ServerUserBanned: {
          fields: {
            userId: {
              type: "string",
              id: 1
            }
          }
        },
        ClientReadyState: {
          oneofs: {
            _seed: {
              oneof: [
                "seed"
              ]
            },
            _version: {
              oneof: [
                "version"
              ]
            },
            _beta: {
              oneof: [
                "beta"
              ]
            }
          },
          fields: {
            ready: {
              type: "bool",
              id: 1
            },
            seed: {
              type: "string",
              id: 2,
              options: {
                proto3_optional: true
              }
            },
            mods: {
              rule: "repeated",
              type: "string",
              id: 3
            },
            version: {
              type: "string",
              id: 4,
              options: {
                proto3_optional: true
              }
            },
            beta: {
              type: "bool",
              id: 5,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ServerUserReadyState: {
          oneofs: {
            _seed: {
              oneof: [
                "seed"
              ]
            },
            _version: {
              oneof: [
                "version"
              ]
            },
            _beta: {
              oneof: [
                "beta"
              ]
            }
          },
          fields: {
            userId: {
              type: "string",
              id: 1
            },
            ready: {
              type: "bool",
              id: 2
            },
            seed: {
              type: "string",
              id: 3,
              options: {
                proto3_optional: true
              }
            },
            mods: {
              rule: "repeated",
              type: "string",
              id: 4
            },
            version: {
              type: "string",
              id: 5,
              options: {
                proto3_optional: true
              }
            },
            beta: {
              type: "bool",
              id: 6,
              options: {
                proto3_optional: true
              }
            }
          }
        },
        ClientStartRun: {
          fields: {
            forced: {
              type: "bool",
              id: 1
            }
          }
        },
        ServerHostStart: {
          fields: {
            forced: {
              type: "bool",
              id: 1
            }
          }
        },
        ClientRequestRoomList: {
          fields: {
            page: {
              type: "uint32",
              id: 1
            }
          }
        },
        ServerRoomList: {
          oneofs: {
            _pages: {
              oneof: [
                "pages"
              ]
            }
          },
          fields: {
            rooms: {
              rule: "repeated",
              type: "Room",
              id: 1
            },
            pages: {
              type: "uint32",
              id: 2,
              options: {
                proto3_optional: true
              }
            }
          },
          nested: {
            Room: {
              fields: {
                id: {
                  type: "string",
                  id: 1
                },
                name: {
                  type: "string",
                  id: 2
                },
                gamemode: {
                  type: "uint32",
                  id: 3
                },
                curUsers: {
                  type: "uint32",
                  id: 4
                },
                maxUsers: {
                  type: "uint32",
                  id: 5
                },
                protected: {
                  type: "bool",
                  id: 6
                },
                owner: {
                  type: "string",
                  id: 7
                },
                locked: {
                  type: "bool",
                  id: 8
                }
              }
            }
          }
        },
        ServerRoomAddToList: {
          fields: {
            room: {
              type: "Room",
              id: 1
            }
          },
          nested: {
            Room: {
              fields: {
                id: {
                  type: "string",
                  id: 1
                },
                name: {
                  type: "string",
                  id: 2
                },
                gamemode: {
                  type: "uint32",
                  id: 3
                },
                curUsers: {
                  type: "uint32",
                  id: 4
                },
                maxUsers: {
                  type: "uint32",
                  id: 5
                },
                protected: {
                  type: "bool",
                  id: 6
                },
                owner: {
                  type: "string",
                  id: 7
                },
                locked: {
                  type: "bool",
                  id: 8
                }
              }
            }
          }
        }
      }
    }
  }
};

// src/pbreflect.ts
var NT2 = pbjs_pb_default.nested.NT.nested;
var Messages = /* @__PURE__ */ Object.create(null);
for (const [msgName, defs] of Object.entries(NT2)) {
  if (!defs.fields)
    continue;
  const fields = /* @__PURE__ */ Object.create(null);
  for (const [fieldName, nameid] of Object.entries(defs.fields)) {
    fields[fieldName] = nameid.id;
  }
  Messages[msgName] = fields;
}
var gameActions = Object.keys(
  pbjs_pb_default.nested.NT.nested.GameAction.fields
);
var lobbyActions = Object.keys(
  pbjs_pb_default.nested.NT.nested.LobbyAction.fields
);

// src/protoutil.ts
var gameActionId = Messages.Envelope.gameAction;
var cPlayerMoveId = Messages.GameAction.cPlayerMove;
var sPlayerMovesId = Messages.GameAction.sPlayerMoves;
var cpfPlayerId = Messages.CompactPlayerFrames.userId;
var userFramesId = Messages.ServerPlayerMoves.userFrames;
var maybePlayerMove = (envelope) => new ProtoHax(envelope).with(gameActionId).with(cPlayerMoveId).Bytes();
var sizeofVarint32 = (val) => {
  if (val <= 127)
    return 1;
  if (val <= 16383)
    return 2;
  if (val <= 2097151)
    return 3;
  if (val <= 268435455)
    return 4;
  if (val <= 4294967295)
    return 5;
  throw new RangeError("Invalid value (too many bits)");
};
var writeVarint32 = (buf, val, pos) => {
  if (val <= 127) {
    buf[pos++] = val;
    return 1;
  }
  if (val <= 16383) {
    buf[pos++] = val & 127 | 128;
    buf[pos++] = val >>> 7 & 127;
    return 2;
  }
  if (val <= 2097151) {
    buf[pos++] = val & 127 | 128;
    buf[pos++] = val >>> 7 & 127 | 128;
    buf[pos++] = val >>> 14 & 127;
    return 3;
  }
  if (val <= 268435455) {
    buf[pos++] = val & 127 | 128;
    buf[pos++] = val >>> 7 & 127 | 128;
    buf[pos++] = val >>> 14 & 127 | 128;
    buf[pos++] = val >>> 21 & 127;
    return 4;
  }
  if (val <= 4294967295) {
    buf[pos++] = val & 127 | 128;
    buf[pos++] = val >>> 7 & 127 | 128;
    buf[pos++] = val >>> 14 & 127 | 128;
    buf[pos++] = val >>> 21 & 127 | 128;
    buf[pos++] = val >>> 28 & 15;
    return 5;
  }
  throw new RangeError("Invalid value (too many bits)");
};
var tagPlayerMove = (cpf, pmId) => {
  const embeddedUserId = new ProtoHax(cpf).with(cpfPlayerId).Bytes();
  if (embeddedUserId.length > 0)
    return;
  const userFramesPayloadSize = 1 + 1 + pmId.length + cpf.length;
  const userFramesHeaderSize = sizeofVarint32(userFramesPayloadSize) + 1;
  const spmPayloadSize = userFramesPayloadSize + userFramesHeaderSize;
  const spmHeaderSize = sizeofVarint32(spmPayloadSize) + 1;
  const gameActionPayloadSize = spmPayloadSize + spmHeaderSize;
  const gameActionHeaderSize = sizeofVarint32(gameActionPayloadSize) + 1;
  const msgLength = gameActionHeaderSize + spmHeaderSize + userFramesHeaderSize + userFramesPayloadSize;
  const buf = Buffer.alloc(msgLength);
  let pos = 0;
  buf[pos++] = gameActionId << 3 | 2 /* LEN */;
  pos += writeVarint32(buf, gameActionPayloadSize, pos);
  buf[pos++] = sPlayerMovesId << 3 | 2 /* LEN */;
  pos += writeVarint32(buf, spmPayloadSize, pos);
  buf[pos++] = userFramesId << 3 | 2 /* LEN */;
  pos += writeVarint32(buf, userFramesPayloadSize, pos);
  buf[pos++] = cpfPlayerId << 3 | 2 /* LEN */;
  buf[pos++] = pmId.length;
  pmId.copy(buf, pos, 0);
  pos += pmId.length;
  cpf.copy(buf, pos);
  return buf;
};

// src/util.ts
var M = {};
for (const key of gameActions) {
  M[key] = (data, encoded) => encoded ? NT.Envelope.encode({ gameAction: { [key]: data } }).finish() : NT.Envelope.fromObject({ gameAction: { [key]: data } });
}
for (const key of lobbyActions) {
  M[key] = (data, encoded) => encoded ? NT.Envelope.encode({ lobbyAction: { [key]: data } }).finish() : NT.Envelope.fromObject({ lobbyAction: { [key]: data } });
}
export {
  M,
  NT,
  ProtoHax,
  createArmrCoder,
  createDeltaCoder,
  createFrameCoder,
  decodeBitfield,
  decodeStable,
  encodeBitfield,
  encodeStable,
  maybePlayerMove,
  tagPlayerMove
};
//# sourceMappingURL=index.mjs.map