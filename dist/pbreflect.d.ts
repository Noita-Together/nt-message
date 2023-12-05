declare const NT: {
    Envelope: {
        oneofs: {
            kind: {
                oneof: string[];
            };
        };
        fields: {
            gameAction: {
                type: string;
                id: number;
            };
            lobbyAction: {
                type: string;
                id: number;
            };
        };
    };
    GameAction: {
        oneofs: {
            action: {
                oneof: string[];
            };
        };
        fields: {
            cPlayerMove: {
                type: string;
                id: number;
            };
            sPlayerMoves: {
                type: string;
                id: number;
            };
            cPlayerUpdate: {
                type: string;
                id: number;
            };
            sPlayerUpdate: {
                type: string;
                id: number;
            };
            cPlayerUpdateInventory: {
                type: string;
                id: number;
            };
            sPlayerUpdateInventory: {
                type: string;
                id: number;
            };
            cHostItemBank: {
                type: string;
                id: number;
            };
            sHostItemBank: {
                type: string;
                id: number;
            };
            cHostUserTake: {
                type: string;
                id: number;
            };
            sHostUserTake: {
                type: string;
                id: number;
            };
            cHostUserTakeGold: {
                type: string;
                id: number;
            };
            sHostUserTakeGold: {
                type: string;
                id: number;
            };
            cPlayerAddGold: {
                type: string;
                id: number;
            };
            sPlayerAddGold: {
                type: string;
                id: number;
            };
            cPlayerTakeGold: {
                type: string;
                id: number;
            };
            sPlayerTakeGold: {
                type: string;
                id: number;
            };
            cPlayerAddItem: {
                type: string;
                id: number;
            };
            sPlayerAddItem: {
                type: string;
                id: number;
            };
            cPlayerTakeItem: {
                type: string;
                id: number;
            };
            sPlayerTakeItem: {
                type: string;
                id: number;
            };
            cPlayerPickup: {
                type: string;
                id: number;
            };
            sPlayerPickup: {
                type: string;
                id: number;
            };
            cNemesisAbility: {
                type: string;
                id: number;
            };
            sNemesisAbility: {
                type: string;
                id: number;
            };
            cNemesisPickupItem: {
                type: string;
                id: number;
            };
            sNemesisPickupItem: {
                type: string;
                id: number;
            };
            cChat: {
                type: string;
                id: number;
            };
            sChat: {
                type: string;
                id: number;
            };
            cPlayerDeath: {
                type: string;
                id: number;
            };
            sPlayerDeath: {
                type: string;
                id: number;
            };
            cPlayerNewGamePlus: {
                type: string;
                id: number;
            };
            sPlayerNewGamePlus: {
                type: string;
                id: number;
            };
            cPlayerSecretHourglass: {
                type: string;
                id: number;
            };
            sPlayerSecretHourglass: {
                type: string;
                id: number;
            };
            cCustomModEvent: {
                type: string;
                id: number;
            };
            sCustomModEvent: {
                type: string;
                id: number;
            };
            cRespawnPenalty: {
                type: string;
                id: number;
            };
            sRespawnPenalty: {
                type: string;
                id: number;
            };
            cAngerySteve: {
                type: string;
                id: number;
            };
            sAngerySteve: {
                type: string;
                id: number;
            };
            sStatUpdate: {
                type: string;
                id: number;
            };
        };
    };
    PlayerFrame: {
        oneofs: {
            _x: {
                oneof: string[];
            };
            _y: {
                oneof: string[];
            };
            _armR: {
                oneof: string[];
            };
            _armScaleY: {
                oneof: string[];
            };
            _scaleX: {
                oneof: string[];
            };
            _anim: {
                oneof: string[];
            };
            _held: {
                oneof: string[];
            };
        };
        fields: {
            x: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            y: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            armR: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            armScaleY: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            scaleX: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            anim: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            held: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    OldClientPlayerMove: {
        fields: {
            frames: {
                rule: string;
                type: string;
                id: number;
            };
        };
    };
    OldServerPlayerMove: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            frames: {
                rule: string;
                type: string;
                id: number;
            };
        };
    };
    CompactPlayerFrames: {
        fields: {
            xInit: {
                type: string;
                id: number;
            };
            yInit: {
                type: string;
                id: number;
            };
            xDeltas: {
                rule: string;
                type: string;
                id: number;
            };
            yDeltas: {
                rule: string;
                type: string;
                id: number;
            };
            armR: {
                rule: string;
                type: string;
                id: number;
            };
            armScaleY: {
                type: string;
                id: number;
            };
            scaleX: {
                type: string;
                id: number;
            };
            animIdx: {
                rule: string;
                type: string;
                id: number;
            };
            animVal: {
                rule: string;
                type: string;
                id: number;
            };
            heldIdx: {
                rule: string;
                type: string;
                id: number;
            };
            heldVal: {
                rule: string;
                type: string;
                id: number;
            };
            userId: {
                type: string;
                id: number;
            };
        };
    };
    ServerPlayerMoves: {
        fields: {
            userFrames: {
                rule: string;
                type: string;
                id: number;
            };
        };
    };
    ClientPlayerUpdate: {
        oneofs: {
            _curHp: {
                oneof: string[];
            };
            _maxHp: {
                oneof: string[];
            };
            _location: {
                oneof: string[];
            };
            _sampo: {
                oneof: string[];
            };
        };
        fields: {
            curHp: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            maxHp: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            location: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            sampo: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ServerPlayerUpdate: {
        oneofs: {
            _curHp: {
                oneof: string[];
            };
            _maxHp: {
                oneof: string[];
            };
            _location: {
                oneof: string[];
            };
            _sampo: {
                oneof: string[];
            };
        };
        fields: {
            userId: {
                type: string;
                id: number;
            };
            curHp: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            maxHp: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            location: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            sampo: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ClientPlayerUpdateInventory: {
        fields: {
            wands: {
                rule: string;
                type: string;
                id: number;
            };
            items: {
                rule: string;
                type: string;
                id: number;
            };
            spells: {
                rule: string;
                type: string;
                id: number;
            };
        };
        nested: {
            InventoryWand: {
                fields: {
                    index: {
                        type: string;
                        id: number;
                    };
                    wand: {
                        type: string;
                        id: number;
                    };
                };
            };
            InventoryItem: {
                fields: {
                    index: {
                        type: string;
                        id: number;
                    };
                    item: {
                        type: string;
                        id: number;
                    };
                };
            };
            InventorySpell: {
                fields: {
                    index: {
                        type: string;
                        id: number;
                    };
                    spell: {
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    ServerPlayerUpdateInventory: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            wands: {
                rule: string;
                type: string;
                id: number;
            };
            items: {
                rule: string;
                type: string;
                id: number;
            };
            spells: {
                rule: string;
                type: string;
                id: number;
            };
        };
        nested: {
            InventoryWand: {
                fields: {
                    index: {
                        type: string;
                        id: number;
                    };
                    wand: {
                        type: string;
                        id: number;
                    };
                };
            };
            InventoryItem: {
                fields: {
                    index: {
                        type: string;
                        id: number;
                    };
                    item: {
                        type: string;
                        id: number;
                    };
                };
            };
            InventorySpell: {
                fields: {
                    index: {
                        type: string;
                        id: number;
                    };
                    spell: {
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    ClientHostItemBank: {
        fields: {
            wands: {
                rule: string;
                type: string;
                id: number;
            };
            spells: {
                rule: string;
                type: string;
                id: number;
            };
            items: {
                rule: string;
                type: string;
                id: number;
            };
            gold: {
                type: string;
                id: number;
            };
            objects: {
                rule: string;
                type: string;
                id: number;
            };
        };
    };
    ServerHostItemBank: {
        fields: {
            wands: {
                rule: string;
                type: string;
                id: number;
            };
            spells: {
                rule: string;
                type: string;
                id: number;
            };
            items: {
                rule: string;
                type: string;
                id: number;
            };
            gold: {
                type: string;
                id: number;
            };
            objects: {
                rule: string;
                type: string;
                id: number;
            };
        };
    };
    ClientHostUserTake: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            id: {
                type: string;
                id: number;
            };
            success: {
                type: string;
                id: number;
            };
        };
    };
    ServerHostUserTake: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            id: {
                type: string;
                id: number;
            };
            success: {
                type: string;
                id: number;
            };
        };
    };
    ClientHostUserTakeGold: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            amount: {
                type: string;
                id: number;
            };
            success: {
                type: string;
                id: number;
            };
        };
    };
    ServerHostUserTakeGold: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            amount: {
                type: string;
                id: number;
            };
            success: {
                type: string;
                id: number;
            };
        };
    };
    ClientPlayerAddGold: {
        fields: {
            amount: {
                type: string;
                id: number;
            };
        };
    };
    ServerPlayerAddGold: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            amount: {
                type: string;
                id: number;
            };
        };
    };
    ClientPlayerTakeGold: {
        fields: {
            amount: {
                type: string;
                id: number;
            };
        };
    };
    ServerPlayerTakeGold: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            amount: {
                type: string;
                id: number;
            };
        };
    };
    ClientPlayerAddItem: {
        oneofs: {
            item: {
                oneof: string[];
            };
        };
        fields: {
            spells: {
                type: string;
                id: number;
            };
            wands: {
                type: string;
                id: number;
            };
            flasks: {
                type: string;
                id: number;
            };
            objects: {
                type: string;
                id: number;
            };
        };
        nested: {
            Spells: {
                fields: {
                    list: {
                        rule: string;
                        type: string;
                        id: number;
                    };
                };
            };
            Wands: {
                fields: {
                    list: {
                        rule: string;
                        type: string;
                        id: number;
                    };
                };
            };
            Items: {
                fields: {
                    list: {
                        rule: string;
                        type: string;
                        id: number;
                    };
                };
            };
            Entities: {
                fields: {
                    list: {
                        rule: string;
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    ServerPlayerAddItem: {
        oneofs: {
            item: {
                oneof: string[];
            };
        };
        fields: {
            userId: {
                type: string;
                id: number;
            };
            spells: {
                type: string;
                id: number;
            };
            wands: {
                type: string;
                id: number;
            };
            flasks: {
                type: string;
                id: number;
            };
            objects: {
                type: string;
                id: number;
            };
        };
        nested: {
            Spells: {
                fields: {
                    list: {
                        rule: string;
                        type: string;
                        id: number;
                    };
                };
            };
            Wands: {
                fields: {
                    list: {
                        rule: string;
                        type: string;
                        id: number;
                    };
                };
            };
            Items: {
                fields: {
                    list: {
                        rule: string;
                        type: string;
                        id: number;
                    };
                };
            };
            Entities: {
                fields: {
                    list: {
                        rule: string;
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    ClientPlayerTakeItem: {
        fields: {
            id: {
                type: string;
                id: number;
            };
        };
    };
    ServerPlayerTakeItem: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            id: {
                type: string;
                id: number;
            };
        };
    };
    ClientChat: {
        fields: {
            message: {
                type: string;
                id: number;
            };
        };
    };
    ServerChat: {
        fields: {
            id: {
                type: string;
                id: number;
            };
            userId: {
                type: string;
                id: number;
            };
            name: {
                type: string;
                id: number;
            };
            message: {
                type: string;
                id: number;
            };
        };
    };
    ServerStatsUpdate: {
        fields: {
            data: {
                type: string;
                id: number;
            };
        };
    };
    ClientPlayerPickup: {
        oneofs: {
            kind: {
                oneof: string[];
            };
        };
        fields: {
            heart: {
                type: string;
                id: number;
            };
            orb: {
                type: string;
                id: number;
            };
        };
        nested: {
            HeartPickup: {
                fields: {
                    hpPerk: {
                        type: string;
                        id: number;
                    };
                };
            };
            OrbPickup: {
                fields: {
                    id: {
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    ServerPlayerPickup: {
        oneofs: {
            kind: {
                oneof: string[];
            };
        };
        fields: {
            userId: {
                type: string;
                id: number;
            };
            heart: {
                type: string;
                id: number;
            };
            orb: {
                type: string;
                id: number;
            };
        };
        nested: {
            HeartPickup: {
                fields: {
                    hpPerk: {
                        type: string;
                        id: number;
                    };
                };
            };
            OrbPickup: {
                fields: {
                    id: {
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    ClientNemesisPickupItem: {
        fields: {
            gameId: {
                type: string;
                id: number;
            };
        };
    };
    ServerNemesisPickupItem: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            gameId: {
                type: string;
                id: number;
            };
        };
    };
    ClientNemesisAbility: {
        fields: {
            gameId: {
                type: string;
                id: number;
            };
        };
    };
    ServerNemesisAbility: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            gameId: {
                type: string;
                id: number;
            };
        };
    };
    ClientPlayerDeath: {
        oneofs: {
            _gameTime: {
                oneof: string[];
            };
        };
        fields: {
            isWin: {
                type: string;
                id: number;
            };
            gameTime: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ServerPlayerDeath: {
        oneofs: {
            _gameTime: {
                oneof: string[];
            };
        };
        fields: {
            userId: {
                type: string;
                id: number;
            };
            isWin: {
                type: string;
                id: number;
            };
            gameTime: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ClientPlayerNewGamePlus: {
        fields: {
            amount: {
                type: string;
                id: number;
            };
        };
    };
    ServerPlayerNewGamePlus: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            amount: {
                type: string;
                id: number;
            };
        };
    };
    ClientPlayerSecretHourglass: {
        fields: {
            material: {
                type: string;
                id: number;
            };
        };
    };
    ServerPlayerSecretHourglass: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            material: {
                type: string;
                id: number;
            };
        };
    };
    ClientCustomModEvent: {
        fields: {
            payload: {
                type: string;
                id: number;
            };
        };
    };
    ServerCustomModEvent: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            payload: {
                type: string;
                id: number;
            };
        };
    };
    ClientRespawnPenalty: {
        fields: {
            deaths: {
                type: string;
                id: number;
            };
        };
    };
    ServerRespawnPenalty: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            deaths: {
                type: string;
                id: number;
            };
        };
    };
    ClientAngerySteve: {
        fields: {
            idk: {
                type: string;
                id: number;
            };
        };
    };
    ServerAngerySteve: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
        };
    };
    Wand: {
        oneofs: {
            _sentBy: {
                oneof: string[];
            };
            _contributedBy: {
                oneof: string[];
            };
        };
        fields: {
            id: {
                type: string;
                id: number;
            };
            stats: {
                type: string;
                id: number;
            };
            alwaysCast: {
                rule: string;
                type: string;
                id: number;
            };
            deck: {
                rule: string;
                type: string;
                id: number;
            };
            sentBy: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            contributedBy: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
        nested: {
            WandStats: {
                fields: {
                    sprite: {
                        type: string;
                        id: number;
                    };
                    named: {
                        type: string;
                        id: number;
                    };
                    uiName: {
                        type: string;
                        id: number;
                    };
                    manaMax: {
                        type: string;
                        id: number;
                    };
                    manaChargeSpeed: {
                        type: string;
                        id: number;
                    };
                    reloadTime: {
                        type: string;
                        id: number;
                    };
                    actionsPerRound: {
                        type: string;
                        id: number;
                    };
                    deckCapacity: {
                        type: string;
                        id: number;
                    };
                    shuffleDeckWhenEmpty: {
                        type: string;
                        id: number;
                    };
                    spreadDegrees: {
                        type: string;
                        id: number;
                    };
                    speedMultiplier: {
                        type: string;
                        id: number;
                    };
                    fireRateWait: {
                        type: string;
                        id: number;
                    };
                    tipX: {
                        type: string;
                        id: number;
                    };
                    tipY: {
                        type: string;
                        id: number;
                    };
                    gripX: {
                        type: string;
                        id: number;
                    };
                    gripY: {
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    Spell: {
        oneofs: {
            _sentBy: {
                oneof: string[];
            };
            _contributedBy: {
                oneof: string[];
            };
        };
        fields: {
            id: {
                type: string;
                id: number;
            };
            gameId: {
                type: string;
                id: number;
            };
            sentBy: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            contributedBy: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            usesRemaining: {
                type: string;
                id: number;
            };
        };
    };
    Item: {
        oneofs: {
            _sentBy: {
                oneof: string[];
            };
            _contributedBy: {
                oneof: string[];
            };
        };
        fields: {
            id: {
                type: string;
                id: number;
            };
            color: {
                type: string;
                id: number;
            };
            content: {
                rule: string;
                type: string;
                id: number;
            };
            sentBy: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            contributedBy: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            isChest: {
                type: string;
                id: number;
                options: {
                    deprecated: boolean;
                };
            };
            itemType: {
                type: string;
                id: number;
            };
        };
        nested: {
            Color: {
                fields: {
                    r: {
                        type: string;
                        id: number;
                    };
                    g: {
                        type: string;
                        id: number;
                    };
                    b: {
                        type: string;
                        id: number;
                    };
                };
            };
            Material: {
                fields: {
                    id: {
                        type: string;
                        id: number;
                    };
                    amount: {
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    EntityItem: {
        oneofs: {
            _sentBy: {
                oneof: string[];
            };
        };
        fields: {
            id: {
                type: string;
                id: number;
            };
            path: {
                type: string;
                id: number;
            };
            sprite: {
                type: string;
                id: number;
            };
            sentBy: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    LobbyAction: {
        oneofs: {
            action: {
                oneof: string[];
            };
        };
        fields: {
            cRoomCreate: {
                type: string;
                id: number;
            };
            sRoomCreated: {
                type: string;
                id: number;
            };
            sRoomCreateFailed: {
                type: string;
                id: number;
            };
            cRoomUpdate: {
                type: string;
                id: number;
            };
            sRoomUpdated: {
                type: string;
                id: number;
            };
            sRoomUpdateFailed: {
                type: string;
                id: number;
            };
            cRoomFlagsUpdate: {
                type: string;
                id: number;
            };
            sRoomFlagsUpdated: {
                type: string;
                id: number;
            };
            sRoomFlagsUpdateFailed: {
                type: string;
                id: number;
            };
            cRoomDelete: {
                type: string;
                id: number;
            };
            sRoomDeleted: {
                type: string;
                id: number;
            };
            cJoinRoom: {
                type: string;
                id: number;
            };
            sJoinRoomSuccess: {
                type: string;
                id: number;
            };
            sJoinRoomFailed: {
                type: string;
                id: number;
            };
            sUserJoinedRoom: {
                type: string;
                id: number;
            };
            cLeaveRoom: {
                type: string;
                id: number;
            };
            sUserLeftRoom: {
                type: string;
                id: number;
            };
            cKickUser: {
                type: string;
                id: number;
            };
            sUserKicked: {
                type: string;
                id: number;
            };
            cBanUser: {
                type: string;
                id: number;
            };
            sUserBanned: {
                type: string;
                id: number;
            };
            cReadyState: {
                type: string;
                id: number;
            };
            sUserReadyState: {
                type: string;
                id: number;
            };
            cStartRun: {
                type: string;
                id: number;
            };
            sHostStart: {
                type: string;
                id: number;
            };
            cRequestRoomList: {
                type: string;
                id: number;
            };
            sRoomList: {
                type: string;
                id: number;
            };
            sDisconnected: {
                type: string;
                id: number;
            };
            sRoomAddToList: {
                type: string;
                id: number;
            };
            cRunOver: {
                type: string;
                id: number;
            };
        };
    };
    ClientRunOver: {
        oneofs: {
            _idk: {
                oneof: string[];
            };
        };
        fields: {
            idk: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ServerDisconnected: {
        fields: {
            reason: {
                type: string;
                id: number;
            };
        };
    };
    ClientRoomDelete: {
        fields: {
            id: {
                type: string;
                id: number;
            };
        };
    };
    ServerRoomDeleted: {
        fields: {
            id: {
                type: string;
                id: number;
            };
        };
    };
    ClientRoomCreate: {
        oneofs: {
            _password: {
                oneof: string[];
            };
        };
        fields: {
            name: {
                type: string;
                id: number;
            };
            gamemode: {
                type: string;
                id: number;
            };
            maxUsers: {
                type: string;
                id: number;
            };
            password: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ServerRoomCreated: {
        oneofs: {
            _password: {
                oneof: string[];
            };
        };
        fields: {
            id: {
                type: string;
                id: number;
            };
            name: {
                type: string;
                id: number;
            };
            gamemode: {
                type: string;
                id: number;
            };
            maxUsers: {
                type: string;
                id: number;
            };
            password: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            locked: {
                type: string;
                id: number;
            };
            users: {
                rule: string;
                type: string;
                id: number;
            };
        };
        nested: {
            User: {
                fields: {
                    userId: {
                        type: string;
                        id: number;
                    };
                    name: {
                        type: string;
                        id: number;
                    };
                    ready: {
                        type: string;
                        id: number;
                    };
                    owner: {
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    ServerRoomCreateFailed: {
        fields: {
            reason: {
                type: string;
                id: number;
            };
        };
    };
    ClientRoomUpdate: {
        oneofs: {
            _name: {
                oneof: string[];
            };
            _gamemode: {
                oneof: string[];
            };
            _maxUsers: {
                oneof: string[];
            };
            _password: {
                oneof: string[];
            };
            _locked: {
                oneof: string[];
            };
        };
        fields: {
            name: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            gamemode: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            maxUsers: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            password: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            locked: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ServerRoomUpdated: {
        oneofs: {
            _name: {
                oneof: string[];
            };
            _gamemode: {
                oneof: string[];
            };
            _maxUsers: {
                oneof: string[];
            };
            _password: {
                oneof: string[];
            };
            _locked: {
                oneof: string[];
            };
        };
        fields: {
            name: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            gamemode: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            maxUsers: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            password: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            locked: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ServerRoomUpdateFailed: {
        fields: {
            reason: {
                type: string;
                id: number;
            };
        };
    };
    ClientRoomFlagsUpdate: {
        fields: {
            flags: {
                rule: string;
                type: string;
                id: number;
            };
        };
        nested: {
            GameFlag: {
                oneofs: {
                    _intVal: {
                        oneof: string[];
                    };
                    _strVal: {
                        oneof: string[];
                    };
                    _floatVal: {
                        oneof: string[];
                    };
                    _boolVal: {
                        oneof: string[];
                    };
                    _uIntVal: {
                        oneof: string[];
                    };
                };
                fields: {
                    flag: {
                        type: string;
                        id: number;
                    };
                    intVal: {
                        type: string;
                        id: number;
                        options: {
                            proto3_optional: boolean;
                        };
                    };
                    strVal: {
                        type: string;
                        id: number;
                        options: {
                            proto3_optional: boolean;
                        };
                    };
                    floatVal: {
                        type: string;
                        id: number;
                        options: {
                            proto3_optional: boolean;
                        };
                    };
                    boolVal: {
                        type: string;
                        id: number;
                        options: {
                            proto3_optional: boolean;
                        };
                    };
                    uIntVal: {
                        type: string;
                        id: number;
                        options: {
                            proto3_optional: boolean;
                        };
                    };
                };
            };
        };
    };
    ServerRoomFlagsUpdated: {
        fields: {
            flags: {
                rule: string;
                type: string;
                id: number;
            };
        };
        nested: {
            GameFlag: {
                oneofs: {
                    _intVal: {
                        oneof: string[];
                    };
                    _strVal: {
                        oneof: string[];
                    };
                    _floatVal: {
                        oneof: string[];
                    };
                    _boolVal: {
                        oneof: string[];
                    };
                    _uIntVal: {
                        oneof: string[];
                    };
                };
                fields: {
                    flag: {
                        type: string;
                        id: number;
                    };
                    intVal: {
                        type: string;
                        id: number;
                        options: {
                            proto3_optional: boolean;
                        };
                    };
                    strVal: {
                        type: string;
                        id: number;
                        options: {
                            proto3_optional: boolean;
                        };
                    };
                    floatVal: {
                        type: string;
                        id: number;
                        options: {
                            proto3_optional: boolean;
                        };
                    };
                    boolVal: {
                        type: string;
                        id: number;
                        options: {
                            proto3_optional: boolean;
                        };
                    };
                    uIntVal: {
                        type: string;
                        id: number;
                        options: {
                            proto3_optional: boolean;
                        };
                    };
                };
            };
        };
    };
    ServerRoomFlagsUpdateFailed: {
        fields: {
            reason: {
                type: string;
                id: number;
            };
        };
    };
    ClientJoinRoom: {
        oneofs: {
            _password: {
                oneof: string[];
            };
        };
        fields: {
            id: {
                type: string;
                id: number;
            };
            password: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ServerJoinRoomSuccess: {
        oneofs: {
            _password: {
                oneof: string[];
            };
        };
        fields: {
            id: {
                type: string;
                id: number;
            };
            name: {
                type: string;
                id: number;
            };
            gamemode: {
                type: string;
                id: number;
            };
            maxUsers: {
                type: string;
                id: number;
            };
            password: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            locked: {
                type: string;
                id: number;
            };
            users: {
                rule: string;
                type: string;
                id: number;
            };
        };
        nested: {
            User: {
                fields: {
                    userId: {
                        type: string;
                        id: number;
                    };
                    name: {
                        type: string;
                        id: number;
                    };
                    ready: {
                        type: string;
                        id: number;
                    };
                    owner: {
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    ServerJoinRoomFailed: {
        fields: {
            reason: {
                type: string;
                id: number;
            };
        };
    };
    ServerUserJoinedRoom: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
            name: {
                type: string;
                id: number;
            };
        };
    };
    ClientLeaveRoom: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
        };
    };
    ServerUserLeftRoom: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
        };
    };
    ClientKickUser: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
        };
    };
    ServerUserKicked: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
        };
    };
    ClientBanUser: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
        };
    };
    ServerUserBanned: {
        fields: {
            userId: {
                type: string;
                id: number;
            };
        };
    };
    ClientReadyState: {
        oneofs: {
            _seed: {
                oneof: string[];
            };
            _version: {
                oneof: string[];
            };
            _beta: {
                oneof: string[];
            };
        };
        fields: {
            ready: {
                type: string;
                id: number;
            };
            seed: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            mods: {
                rule: string;
                type: string;
                id: number;
            };
            version: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            beta: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ServerUserReadyState: {
        oneofs: {
            _seed: {
                oneof: string[];
            };
            _version: {
                oneof: string[];
            };
            _beta: {
                oneof: string[];
            };
        };
        fields: {
            userId: {
                type: string;
                id: number;
            };
            ready: {
                type: string;
                id: number;
            };
            seed: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            mods: {
                rule: string;
                type: string;
                id: number;
            };
            version: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
            beta: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
    };
    ClientStartRun: {
        fields: {
            forced: {
                type: string;
                id: number;
            };
        };
    };
    ServerHostStart: {
        fields: {
            forced: {
                type: string;
                id: number;
            };
        };
    };
    ClientRequestRoomList: {
        fields: {
            page: {
                type: string;
                id: number;
            };
        };
    };
    ServerRoomList: {
        oneofs: {
            _pages: {
                oneof: string[];
            };
        };
        fields: {
            rooms: {
                rule: string;
                type: string;
                id: number;
            };
            pages: {
                type: string;
                id: number;
                options: {
                    proto3_optional: boolean;
                };
            };
        };
        nested: {
            Room: {
                fields: {
                    id: {
                        type: string;
                        id: number;
                    };
                    name: {
                        type: string;
                        id: number;
                    };
                    gamemode: {
                        type: string;
                        id: number;
                    };
                    curUsers: {
                        type: string;
                        id: number;
                    };
                    maxUsers: {
                        type: string;
                        id: number;
                    };
                    protected: {
                        type: string;
                        id: number;
                    };
                    owner: {
                        type: string;
                        id: number;
                    };
                    locked: {
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
    ServerRoomAddToList: {
        fields: {
            room: {
                type: string;
                id: number;
            };
        };
        nested: {
            Room: {
                fields: {
                    id: {
                        type: string;
                        id: number;
                    };
                    name: {
                        type: string;
                        id: number;
                    };
                    gamemode: {
                        type: string;
                        id: number;
                    };
                    curUsers: {
                        type: string;
                        id: number;
                    };
                    maxUsers: {
                        type: string;
                        id: number;
                    };
                    protected: {
                        type: string;
                        id: number;
                    };
                    owner: {
                        type: string;
                        id: number;
                    };
                    locked: {
                        type: string;
                        id: number;
                    };
                };
            };
        };
    };
};
type FieldList = {
    [key: string]: {
        type: string;
        id: number;
    };
};
type FieldIds<T extends FieldList> = {
    [K in keyof T]: T[K]['id'];
} & unknown;
type MessageIds<T extends {
    [key in keyof T]: {
        fields: FieldList;
    };
}> = {
    [K in keyof T]: FieldIds<T[K]['fields']>;
} & unknown;
export declare const Messages: MessageIds<typeof NT>;
export declare const gameActions: ("cPlayerMove" | "sPlayerMoves" | "cPlayerUpdate" | "sPlayerUpdate" | "cPlayerUpdateInventory" | "sPlayerUpdateInventory" | "cHostItemBank" | "sHostItemBank" | "cHostUserTake" | "sHostUserTake" | "cHostUserTakeGold" | "sHostUserTakeGold" | "cPlayerAddGold" | "sPlayerAddGold" | "cPlayerTakeGold" | "sPlayerTakeGold" | "cPlayerAddItem" | "sPlayerAddItem" | "cPlayerTakeItem" | "sPlayerTakeItem" | "cPlayerPickup" | "sPlayerPickup" | "cNemesisAbility" | "sNemesisAbility" | "cNemesisPickupItem" | "sNemesisPickupItem" | "cChat" | "sChat" | "cPlayerDeath" | "sPlayerDeath" | "cPlayerNewGamePlus" | "sPlayerNewGamePlus" | "cPlayerSecretHourglass" | "sPlayerSecretHourglass" | "cCustomModEvent" | "sCustomModEvent" | "cRespawnPenalty" | "sRespawnPenalty" | "cAngerySteve" | "sAngerySteve" | "sStatUpdate")[];
export declare const lobbyActions: ("cRoomCreate" | "sRoomCreated" | "sRoomCreateFailed" | "cRoomUpdate" | "sRoomUpdated" | "sRoomUpdateFailed" | "cRoomFlagsUpdate" | "sRoomFlagsUpdated" | "sRoomFlagsUpdateFailed" | "cRoomDelete" | "sRoomDeleted" | "cJoinRoom" | "sJoinRoomSuccess" | "sJoinRoomFailed" | "sUserJoinedRoom" | "cLeaveRoom" | "sUserLeftRoom" | "cKickUser" | "sUserKicked" | "cBanUser" | "sUserBanned" | "cReadyState" | "sUserReadyState" | "cStartRun" | "sHostStart" | "cRequestRoomList" | "sRoomList" | "sDisconnected" | "sRoomAddToList" | "cRunOver")[];
export {};
