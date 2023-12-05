import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace Fixtures. */
export namespace Fixtures {

    /** Enum enum. */
    enum Enum {
        ENUM_UNSPECIFIED = 0,
        ENUM_ONE = 1,
        ENUM_TWO = 2
    }

    /** Properties of a Message. */
    interface IMessage {

        /** Message lMessage */
        lMessage?: (Fixtures.IMessage|null);

        /** Message singleInt32 */
        singleInt32?: (number|null);

        /** Message singleInt64 */
        singleInt64?: (number|Long|null);

        /** Message singleUint32 */
        singleUint32?: (number|null);

        /** Message singleUint64 */
        singleUint64?: (number|Long|null);

        /** Message singleSint32 */
        singleSint32?: (number|null);

        /** Message singleSint64 */
        singleSint64?: (number|Long|null);

        /** Message singleBool */
        singleBool?: (boolean|null);

        /** Message singleEnum */
        singleEnum?: (Fixtures.Enum|null);

        /** Message singleFixed64 */
        singleFixed64?: (number|Long|null);

        /** Message singleSfixed64 */
        singleSfixed64?: (number|Long|null);

        /** Message singleDouble */
        singleDouble?: (number|null);

        /** Message singleString */
        singleString?: (string|null);

        /** Message singleBytes */
        singleBytes?: (Uint8Array|null);

        /** Message singleFixed32 */
        singleFixed32?: (number|null);

        /** Message singleSfixed32 */
        singleSfixed32?: (number|null);

        /** Message singleFloat */
        singleFloat?: (number|null);

        /** Message singleMessage */
        singleMessage?: (Fixtures.IMessage|null);

        /** Message repeatedInt32 */
        repeatedInt32?: (number[]|null);

        /** Message repeatedString */
        repeatedString?: (string[]|null);

        /** Message repeatedBytes */
        repeatedBytes?: (Uint8Array[]|null);

        /** Message repeatedMessage */
        repeatedMessage?: (Fixtures.IMessage[]|null);

        /** Message unpackedInt32 */
        unpackedInt32?: (number[]|null);
    }

    /** Represents a Message. */
    class Message implements IMessage {

        /**
         * Constructs a new Message.
         * @param [properties] Properties to set
         */
        constructor(properties?: Fixtures.IMessage);

        /** Message lMessage. */
        public lMessage?: (Fixtures.IMessage|null);

        /** Message singleInt32. */
        public singleInt32: number;

        /** Message singleInt64. */
        public singleInt64: (number|Long);

        /** Message singleUint32. */
        public singleUint32: number;

        /** Message singleUint64. */
        public singleUint64: (number|Long);

        /** Message singleSint32. */
        public singleSint32: number;

        /** Message singleSint64. */
        public singleSint64: (number|Long);

        /** Message singleBool. */
        public singleBool: boolean;

        /** Message singleEnum. */
        public singleEnum: Fixtures.Enum;

        /** Message singleFixed64. */
        public singleFixed64: (number|Long);

        /** Message singleSfixed64. */
        public singleSfixed64: (number|Long);

        /** Message singleDouble. */
        public singleDouble: number;

        /** Message singleString. */
        public singleString: string;

        /** Message singleBytes. */
        public singleBytes: Uint8Array;

        /** Message singleFixed32. */
        public singleFixed32: number;

        /** Message singleSfixed32. */
        public singleSfixed32: number;

        /** Message singleFloat. */
        public singleFloat: number;

        /** Message singleMessage. */
        public singleMessage?: (Fixtures.IMessage|null);

        /** Message repeatedInt32. */
        public repeatedInt32: number[];

        /** Message repeatedString. */
        public repeatedString: string[];

        /** Message repeatedBytes. */
        public repeatedBytes: Uint8Array[];

        /** Message repeatedMessage. */
        public repeatedMessage: Fixtures.IMessage[];

        /** Message unpackedInt32. */
        public unpackedInt32: number[];

        /**
         * Creates a new Message instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Message instance
         */
        public static create(properties?: Fixtures.IMessage): Fixtures.Message;

        /**
         * Encodes the specified Message message. Does not implicitly {@link Fixtures.Message.verify|verify} messages.
         * @param message Message message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Fixtures.IMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Message message, length delimited. Does not implicitly {@link Fixtures.Message.verify|verify} messages.
         * @param message Message message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: Fixtures.IMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Message message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Message
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Fixtures.Message;

        /**
         * Decodes a Message message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Message
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): Fixtures.Message;

        /**
         * Verifies a Message message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Message message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Message
         */
        public static fromObject(object: { [k: string]: any }): Fixtures.Message;

        /**
         * Creates a plain object from a Message message. Also converts values to other types if specified.
         * @param message Message
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: Fixtures.Message, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Message to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for Message
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
