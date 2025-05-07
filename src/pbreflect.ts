import def from './pbjs_pb.json';
const NT = def.nested.NT.nested;

type FieldList = { [key: string]: { type: string; id: number } };
type ValuesList = { [key: string]: number };

type FieldIds<T extends FieldList> = { [K in keyof T]: T[K]['id'] } & unknown;
type ValueIds<T extends ValuesList> = { [K in keyof T]: T[K] } & unknown;

type FieldDef = { fields: FieldList; [key: string]: any};
type EnumDef = { values: ValuesList; [key: string]: any};
type MessageDef = FieldDef | EnumDef;

type MessageIds<T> = {
  [K in keyof T]: T[K] extends { fields: FieldList } 
    ? FieldIds<T[K]['fields']> 
    : T[K] extends { values: ValuesList }
      ? ValueIds<T[K]['values']>
      : never;
} & unknown;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

const MessagesImpl = Object.create(null) as any;
for (const [msgName, defs] of Object.entries(NT) as [keyof typeof NT, MessageDef][]) {
  if ('fields' in defs) {
    const fields: UnionToIntersection<FieldIds<typeof defs.fields>> = Object.create(null) as any;
    for (const [fieldName, nameid] of Object.entries(defs.fields) as [string, { id: number }][]) {
      fields[fieldName] = nameid.id;
    }
    MessagesImpl[msgName] = fields;
  } else if ('values' in defs) {
    const values: ValueIds<typeof defs.values> = Object.create(null) as any;
    for (const [valueName, valueId] of Object.entries(defs.values)) {
      values[valueName] = valueId;
    }
    MessagesImpl[msgName] = values;
  }
}

export const Messages = MessagesImpl as MessageIds<typeof NT>;
export const gameActions = Object.keys(
  def.nested.NT.nested.GameAction.fields
) as (keyof typeof def.nested.NT.nested.GameAction.fields)[];
export const lobbyActions = Object.keys(
  def.nested.NT.nested.LobbyAction.fields
) as (keyof typeof def.nested.NT.nested.LobbyAction.fields)[];
