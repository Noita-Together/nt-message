import { NT } from './pbjs_pb';
import { gameActions, lobbyActions } from './pbreflect';

export interface ActionCreator<T> {
  (data: Exclude<T, undefined | null>, encoded: true): Uint8Array;
  (data: Exclude<T, undefined | null>, encoded: false): NT.Envelope;
  (data: Exclude<T, undefined | null>): NT.Envelope;
}

export type GameActionCreators = {
  [K in keyof NT.IGameAction]-?: ActionCreator<NT.IGameAction[K]>;
};
export type LobbyActionCreators = {
  [K in keyof NT.ILobbyAction]-?: ActionCreator<NT.ILobbyAction[K]>;
};
export type TransportMessageCreators = {
  hello: ActionCreator<NT.Hello>;
};

/**
 * Factory functions for each action type. Each function
 * accepts an action payload and returns an `NT.Envelope` instance
 *
 * @example
 * ```ts
 * M.cChat({ message: 'hi there' })
 * ```
 */
export const M: GameActionCreators & LobbyActionCreators & TransportMessageCreators = {} as any;

for (const key of gameActions) {
  M[key] = ((data, encoded) =>
    encoded
      ? NT.Envelope.encode({ gameAction: { [key]: data } }).finish()
      : NT.Envelope.fromObject({
          gameAction: { [key]: data },
        })) as ActionCreator<NT.IGameAction[typeof key]>;
}
for (const key of lobbyActions) {
  M[key] = ((data, encoded) =>
    encoded
      ? NT.Envelope.encode({ lobbyAction: { [key]: data } }).finish()
      : NT.Envelope.fromObject({
          lobbyAction: { [key]: data },
        })) as ActionCreator<NT.ILobbyAction[typeof key]>;
}

M['hello'] = ((data: NT.IHello, encoded) =>
  encoded
    ? NT.Envelope.encode({ hello: data }).finish()
    : NT.Envelope.fromObject({ hello: data })) as ActionCreator<NT.IHello>;
