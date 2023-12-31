import { Fixtures } from './fixtures/protohax_pb';
import { ProtoHax } from './protohax';
import Long from 'long';
import fieldSpec from './fixtures/protohax_pb.json';

describe('ProtoHax', () => {
  describe('single numeric values', () => {
    type proto_scalar = number | boolean | Fixtures.Enum | Long;
    type messageScalar = {
      [K in keyof Fixtures.Message as Fixtures.Message[K] extends proto_scalar | proto_scalar[] ? K : never]: K;
    };
    type messageScalars = messageScalar[keyof messageScalar] & keyof Fixtures.Message;

    const scalar = <T extends messageScalars>(key: T, value: proto_scalar) => ({ key, value });

    type phaxReadMethod = {
      [K in keyof ProtoHax as ProtoHax[K] extends () => proto_scalar | proto_scalar[] ? K : never]: K;
    };
    type phaxReadMethods = phaxReadMethod[keyof phaxReadMethod] & keyof ProtoHax;

    const asSingle = (v: number) => {
      const buf = Buffer.alloc(4);
      buf.writeFloatBE(v, 0);
      return buf.readFloatBE(0);
    };

    const methodNames: Record<string, phaxReadMethods> = {
      singleInt32: 'Int32',
      singleUint32: 'Uint32',
      singleSint32: 'Sint32',
      singleFixed32: 'Fixed32',
      singleSfixed32: 'Sfixed32',
      singleFloat: 'Float',
      singleDouble: 'Double',
      singleInt64: 'Int64',
      singleUint64: 'Uint64',
      singleSint64: 'Sint64',
      singleFixed64: 'Fixed64',
      singleSfixed64: 'Sfixed64',
      singleBool: 'Bool',
      singleEnum: 'Enum',
    };

    // prettier-ignore
    const tests: {key: keyof Fixtures.Message, value: any}[] = [
      // small negatives
      scalar('singleInt32',     -1 ), // TODO: deal with reading negative varints when we expect 32 bits (but the encoder wrote 64 bits)
      scalar('singleSint32',    -1            ),
      scalar('singleSfixed32',  -1            ),
      scalar('singleFloat',     asSingle(-1.1)),
      scalar('singleDouble',    -1.1          ),
      scalar('singleInt64',     Long.NEG_ONE  ),
      scalar('singleSint64',    Long.NEG_ONE  ),
      scalar('singleSfixed64',  Long.NEG_ONE  ),

      // zero
      scalar('singleInt32',     0          ),
      scalar('singleUint32',    0          ),
      scalar('singleSint32',    0          ),
      scalar('singleFixed32',   0          ),
      scalar('singleSfixed32',  0          ),
      scalar('singleFloat',     0          ),
      scalar('singleDouble',    0          ),
      scalar('singleInt64',     Long.ZERO  ),
      scalar('singleUint64',    Long.ZERO  ),
      scalar('singleSint64',    Long.ZERO  ),
      scalar('singleFixed64',   Long.ZERO  ),
      scalar('singleSfixed64',  Long.ZERO  ),

      // one
      scalar('singleInt32',     1            ),
      scalar('singleUint32',    1            ),
      scalar('singleSint32',    1            ),
      scalar('singleFixed32',   1            ),
      scalar('singleSfixed32',  1            ),
      scalar('singleFloat',     asSingle(1.1)),
      scalar('singleDouble',    1.1          ),
      scalar('singleInt64',     Long.ONE     ),
      scalar('singleUint64',    Long.ONE     ),
      scalar('singleSint64',    Long.ONE     ),
      scalar('singleFixed64',   Long.ONE     ),
      scalar('singleSfixed64',  Long.ONE     ),

      // varint edges
      scalar('singleInt32', 1<<30),
      scalar('singleInt64', new Long(0b10100110_11001001_10111010_00110011, 0b01100110_10110010_10010111_01011001)),

      // booleans
      scalar('singleBool', true),
      scalar('singleBool', false),

      // enums
      scalar('singleEnum', Fixtures.Enum.ENUM_UNSPECIFIED),
      scalar('singleEnum', Fixtures.Enum.ENUM_ONE),
      scalar('singleEnum', Fixtures.Enum.ENUM_TWO),
    ];

    it.each(tests)('$key $value', ({ key, value }) => {
      const pbjs_encoded = Buffer.from(
        Fixtures.Message.encode({
          [key]: value,
        }).finish()
      );

      const fieldId = (fieldSpec.nested.Fixtures.nested.Message.fields as any)[key]?.id;
      expect(fieldId).not.toBeUndefined();

      const phax = new ProtoHax(pbjs_encoded);
      const readMethod = methodNames[key];
      expect(readMethod).not.toBeUndefined();

      const res = phax.with(fieldId!)[readMethod!]();
      expect(res.toString()).toEqual(value.toString());
    });
  });

  describe('packed repeated', () => {
    it('reads with .Packed()', () => {
      const expected = [1, 2, 3];
      const pbjs_encoded = Buffer.from(Fixtures.Message.encode({ repeatedInt32: expected }).finish());

      const fieldId = fieldSpec.nested.Fixtures.nested.Message.fields.repeatedInt32.id;
      expect(fieldId).not.toBeUndefined();

      const phax = new ProtoHax(pbjs_encoded);

      const actual = phax.with(fieldId!).Packed('Int32');
      expect(actual).toEqual(expected);
    });
    it('reads with value readers', () => {
      const expected = [1, 2, 3];
      const pbes_encoded = Buffer.from(Fixtures.Message.encode({ repeatedInt32: expected }).finish());

      const fieldId = fieldSpec.nested.Fixtures.nested.Message.fields.repeatedInt32.id;
      expect(fieldId).not.toBeUndefined();

      const phax = new ProtoHax(pbes_encoded);

      let actual: number[] = [];
      phax.if(fieldId!, phax => {
        while (!phax.atEnd()) {
          actual.push(phax.Int32());
        }
      });
      expect(actual).toEqual(expected);
    });
  });

  describe('length-delimited', () => {
    it('reads a string', () => {
      const expected = 'hi there ☃';
      const pbes_encoded = Buffer.from(Fixtures.Message.encode({ singleString: expected }).finish());

      const fieldId = fieldSpec.nested.Fixtures.nested.Message.fields.singleString.id;
      expect(fieldId).not.toBeUndefined();

      const phax = new ProtoHax(pbes_encoded);

      const actual = phax.with(fieldId!).String();

      expect(expected).toEqual(actual);
    });
    it('reads bytes', () => {
      const expected = Buffer.from('hi there ☃');
      const pbes_encoded = Buffer.from(Fixtures.Message.encode({ singleBytes: expected }).finish());

      const fieldId = fieldSpec.nested.Fixtures.nested.Message.fields.singleBytes.id;
      expect(fieldId).not.toBeUndefined();

      const phax = new ProtoHax(pbes_encoded);

      const actual = phax.with(fieldId!).Bytes();

      expect(expected).toEqual(actual);
    });
    it('reads messages', () => {
      const pbes_encoded = Buffer.from(
        Fixtures.Message.encode({
          lMessage: {
            singleBool: true,
          },
          repeatedMessage: [{ singleEnum: Fixtures.Enum.ENUM_ONE }, { singleEnum: Fixtures.Enum.ENUM_TWO }],
        }).finish()
      );

      const lMessage = fieldSpec.nested.Fixtures.nested.Message.fields.lMessage.id;
      expect(lMessage).not.toBeUndefined();
      const singleBool = fieldSpec.nested.Fixtures.nested.Message.fields.singleBool.id;
      expect(singleBool).not.toBeUndefined();
      const repeatedMessage = fieldSpec.nested.Fixtures.nested.Message.fields.repeatedMessage.id;
      expect(repeatedMessage).not.toBeUndefined();
      const singleEnum = fieldSpec.nested.Fixtures.nested.Message.fields.singleEnum.id;
      expect(singleEnum).not.toBeUndefined();

      const expected = [true, Fixtures.Enum.ENUM_ONE, Fixtures.Enum.ENUM_TWO];
      const actual: [boolean, number, number] = [] as any;

      actual.push(
        new ProtoHax(pbes_encoded) //
          .with(lMessage!)
          .with(singleBool!)
          .Bool()
      );

      new ProtoHax(pbes_encoded) //
        .each(repeatedMessage!, phax => actual.push(phax.with(singleEnum!).Enum()));

      expect(actual).toEqual(expected);
    });
  });

  describe('if', () => {
    it('finds the first value', () => {
      const expected = 1;
      const pbes_encoded = Buffer.from(Fixtures.Message.encode({ singleInt32: expected }).finish());

      const fieldId = fieldSpec.nested.Fixtures.nested.Message.fields.singleInt32.id;
      expect(fieldId).not.toBeUndefined();

      let found = false;
      const actual = new ProtoHax(pbes_encoded).if(fieldId!, () => {
        found = true;
      });
      expect(found).toEqual(true);
    });
    it('does nothing on no match', () => {
      const expected = 1;
      const pbes_encoded = Buffer.from(Fixtures.Message.encode({ singleInt32: expected }).finish());

      const fieldId = fieldSpec.nested.Fixtures.nested.Message.fields.singleBool.id;
      expect(fieldId).not.toBeUndefined();

      let found = false;
      const actual = new ProtoHax(pbes_encoded).if(fieldId!, () => {
        found = true;
      });
      expect(found).toEqual(false);
    });
    it('bugfix: incorrect usage of last', () => {
      // explanation: `if` did not check this.ok after calling seek, so it attempted to call skip
      // with arbitrary / unrelated data in the last-read value property. this caused an exception
      // when the last-read value indicated a group wiretype ("not implemented").
      // TODO: this.seek could return a boolean directly indicating whether it terminates an operation
      const pbes_encoded = Buffer.from(Fixtures.Message.encode({ singleString: 'hi there11' }).finish());

      const fieldId = fieldSpec.nested.Fixtures.nested.Message.fields.singleInt32.id;
      expect(fieldId).not.toBeUndefined();

      let found = false;
      new ProtoHax(pbes_encoded).if(fieldId!, () => {
        found = true;
      });
      expect(found).toEqual(false);
    });
  });
  describe('each', () => {
    it('reads scalars', () => {
      const expected = [1, 2, 3];
      const pbes_encoded = Buffer.from(Fixtures.Message.encode({ unpackedInt32: expected }).finish());

      const fieldId = fieldSpec.nested.Fixtures.nested.Message.fields.unpackedInt32.id;
      expect(fieldId).not.toBeUndefined();

      const phax = new ProtoHax(pbes_encoded);

      let actual: number[] = [];
      phax.each(fieldId!, phax => actual.push(phax.Int32()));
      expect(actual).toEqual(expected);
    });
    it('reads strings', () => {
      const expected = ['a', 'b'];
      const pbes_encoded = Buffer.from(Fixtures.Message.encode({ repeatedString: expected }).finish());

      const fieldId = fieldSpec.nested.Fixtures.nested.Message.fields.repeatedString.id;
      expect(fieldId).not.toBeUndefined();

      const phax = new ProtoHax(pbes_encoded);

      const actual: string[] = [];
      phax.each(fieldId!, phax => actual.push(phax.String()));

      expect(expected).toEqual(actual);
    });
    it('reads bytes', () => {
      const expected = ['a', 'b'].map(s => Buffer.from(s));
      const pbes_encoded = Buffer.from(Fixtures.Message.encode({ repeatedBytes: expected }).finish());

      const fieldId = fieldSpec.nested.Fixtures.nested.Message.fields.repeatedBytes.id;
      expect(fieldId).not.toBeUndefined();

      const phax = new ProtoHax(pbes_encoded);

      const actual: Buffer[] = [];
      phax.each(fieldId!, phax => actual.push(phax.Bytes()));

      expect(expected).toEqual(actual);
    });
  });
  describe('skip', () => {
    it('can skip over everything', () => {
      const pbes_encoded = Buffer.from(
        Fixtures.Message.encode({
          lMessage: { singleDouble: 1 },
          singleInt32: 1,
          singleInt64: Long.ONE,
          singleUint32: 1,
          singleUint64: Long.ONE,
          singleSint32: 1,
          singleSint64: Long.ONE,
          singleBool: true,
          singleEnum: Fixtures.Enum.ENUM_ONE,
          singleFixed64: Long.ONE,
          singleSfixed64: Long.ONE,
          singleDouble: 1,
          singleString: 'hi',
          singleBytes: Buffer.from('hi'),
          singleFixed32: 1,
          singleSfixed32: 1,
          singleFloat: 1,
          singleMessage: { singleDouble: 1 },
          repeatedInt32: [1],
          repeatedString: ['hi'],
          repeatedBytes: [Buffer.from('hi')],
          repeatedMessage: [{ singleDouble: 1 }],
          unpackedInt32: [1],
        }).finish()
      );
      const phax = new ProtoHax(pbes_encoded);
      phax.if(1337, phax => {
        throw new Error('should not be called');
      });
    });
  });

  describe('empty values', () => {
    it('returns defaults', () => {
      const empty = Buffer.of();
      expect(new ProtoHax(empty).String()).toEqual('');
      expect(new ProtoHax(empty).Bytes()).toEqual(empty);
      expect(new ProtoHax(empty).Int32()).toEqual(0);
      expect(new ProtoHax(empty).Enum()).toEqual(0);
      expect(new ProtoHax(empty).Bool()).toEqual(false);
    });
  });
});
