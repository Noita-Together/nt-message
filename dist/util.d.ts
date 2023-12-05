import { NT } from './pbjs_pb';
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
/**
 * Factory functions for each action type. Each function
 * accepts an action payload and returns an `NT.Envelope` instance
 *
 * @example
 * ```ts
 * M.cChat({ message: 'hi there' })
 * ```
 */
export declare const M: GameActionCreators & LobbyActionCreators;
