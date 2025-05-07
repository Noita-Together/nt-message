export declare const Messages: {
    Envelope: {
        gameAction: number;
        lobbyAction: number;
    };
    GameAction: {
        cPlayerMove: number;
        sPlayerMoves: number;
        cPlayerUpdate: number;
        sPlayerUpdate: number;
        cPlayerUpdateInventory: number;
        sPlayerUpdateInventory: number;
        cHostItemBank: number;
        sHostItemBank: number;
        cHostUserTake: number;
        sHostUserTake: number;
        cHostUserTakeGold: number;
        sHostUserTakeGold: number;
        cPlayerAddGold: number;
        sPlayerAddGold: number;
        cPlayerTakeGold: number;
        sPlayerTakeGold: number;
        cPlayerAddItem: number;
        sPlayerAddItem: number;
        cPlayerTakeItem: number;
        sPlayerTakeItem: number;
        cPlayerPickup: number;
        sPlayerPickup: number;
        cNemesisAbility: number;
        sNemesisAbility: number;
        cNemesisPickupItem: number;
        sNemesisPickupItem: number;
        cChat: number;
        sChat: number;
        cPlayerDeath: number;
        sPlayerDeath: number;
        cPlayerNewGamePlus: number;
        sPlayerNewGamePlus: number;
        cPlayerSecretHourglass: number;
        sPlayerSecretHourglass: number;
        cCustomModEvent: number;
        sCustomModEvent: number;
        cRespawnPenalty: number;
        sRespawnPenalty: number;
        cAngerySteve: number;
        sAngerySteve: number;
        sStatUpdate: number;
    };
    PlayerFrame: {
        x: number;
        y: number;
        armR: number;
        armScaleY: number;
        scaleX: number;
        anim: number;
        held: number;
    };
    OldClientPlayerMove: {
        frames: number;
    };
    OldServerPlayerMove: {
        userId: number;
        frames: number;
    };
    CompactPlayerFrames: {
        xInit: number;
        yInit: number;
        xDeltas: number;
        yDeltas: number;
        armR: number;
        armScaleY: number;
        scaleX: number;
        animIdx: number;
        animVal: number;
        heldIdx: number;
        heldVal: number;
        userId: number;
    };
    ServerPlayerMoves: {
        userFrames: number;
    };
    ClientPlayerUpdate: {
        curHp: number;
        maxHp: number;
        location: number;
        sampo: number;
    };
    ServerPlayerUpdate: {
        userId: number;
        curHp: number;
        maxHp: number;
        location: number;
        sampo: number;
    };
    ClientPlayerUpdateInventory: {
        wands: number;
        items: number;
        spells: number;
    };
    ServerPlayerUpdateInventory: {
        userId: number;
        wands: number;
        items: number;
        spells: number;
    };
    ClientHostItemBank: {
        wands: number;
        spells: number;
        items: number;
        gold: number;
        objects: number;
    };
    ServerHostItemBank: {
        wands: number;
        spells: number;
        items: number;
        gold: number;
        objects: number;
    };
    ClientHostUserTake: {
        userId: number;
        id: number;
        success: number;
    };
    ServerHostUserTake: {
        userId: number;
        id: number;
        success: number;
    };
    ClientHostUserTakeGold: {
        userId: number;
        amount: number;
        success: number;
    };
    ServerHostUserTakeGold: {
        userId: number;
        amount: number;
        success: number;
    };
    ClientPlayerAddGold: {
        amount: number;
    };
    ServerPlayerAddGold: {
        userId: number;
        amount: number;
    };
    ClientPlayerTakeGold: {
        amount: number;
    };
    ServerPlayerTakeGold: {
        userId: number;
        amount: number;
    };
    ClientPlayerAddItem: {
        spells: number;
        wands: number;
        flasks: number;
        objects: number;
    };
    ServerPlayerAddItem: {
        userId: number;
        spells: number;
        wands: number;
        flasks: number;
        objects: number;
    };
    ClientPlayerTakeItem: {
        id: number;
    };
    ServerPlayerTakeItem: {
        userId: number;
        id: number;
    };
    ClientChat: {
        message: number;
    };
    ServerChat: {
        id: number;
        userId: number;
        name: number;
        message: number;
    };
    ServerStatsUpdate: {
        data: number;
    };
    ClientPlayerPickup: {
        heart: number;
        orb: number;
    };
    ServerPlayerPickup: {
        userId: number;
        heart: number;
        orb: number;
    };
    ClientNemesisPickupItem: {
        gameId: number;
    };
    ServerNemesisPickupItem: {
        userId: number;
        gameId: number;
    };
    ClientNemesisAbility: {
        gameId: number;
    };
    ServerNemesisAbility: {
        userId: number;
        gameId: number;
    };
    ClientPlayerDeath: {
        isWin: number;
        gameTime: number;
    };
    ServerPlayerDeath: {
        userId: number;
        isWin: number;
        gameTime: number;
    };
    ClientPlayerNewGamePlus: {
        amount: number;
    };
    ServerPlayerNewGamePlus: {
        userId: number;
        amount: number;
    };
    ClientPlayerSecretHourglass: {
        material: number;
    };
    ServerPlayerSecretHourglass: {
        userId: number;
        material: number;
    };
    ClientCustomModEvent: {
        payload: number;
    };
    ServerCustomModEvent: {
        userId: number;
        payload: number;
    };
    ClientRespawnPenalty: {
        deaths: number;
    };
    ServerRespawnPenalty: {
        userId: number;
        deaths: number;
    };
    ClientAngerySteve: {
        idk: number;
    };
    ServerAngerySteve: {
        userId: number;
    };
    Wand: {
        id: number;
        stats: number;
        alwaysCast: number;
        deck: number;
        sentBy: number;
        contributedBy: number;
    };
    Spell: {
        id: number;
        gameId: number;
        sentBy: number;
        contributedBy: number;
        usesRemaining: number;
    };
    Item: {
        id: number;
        color: number;
        content: number;
        sentBy: number;
        contributedBy: number;
        isChest: number;
        itemType: number;
    };
    EntityItem: {
        id: number;
        path: number;
        sprite: number;
        sentBy: number;
    };
    LobbyAction: {
        cRoomCreate: number;
        sRoomCreated: number;
        sRoomCreateFailed: number;
        cRoomUpdate: number;
        sRoomUpdated: number;
        sRoomUpdateFailed: number;
        cRoomFlagsUpdate: number;
        sRoomFlagsUpdated: number;
        sRoomFlagsUpdateFailed: number;
        cRoomDelete: number;
        sRoomDeleted: number;
        cJoinRoom: number;
        sJoinRoomSuccess: number;
        sJoinRoomFailed: number;
        sUserJoinedRoom: number;
        cLeaveRoom: number;
        sUserLeftRoom: number;
        cKickUser: number;
        sUserKicked: number;
        cBanUser: number;
        sUserBanned: number;
        cReadyState: number;
        sUserReadyState: number;
        cStartRun: number;
        sHostStart: number;
        cRequestRoomList: number;
        sRoomList: number;
        sDisconnected: number;
        sRoomAddToList: number;
        cRunOver: number;
        cRoomModFlagsUpdate: number;
        sRoomModFlagsUpdated: number;
        sRoomModFlagsUpdateFailed: number;
    };
    ClientRunOver: {
        idk: number;
    };
    ServerDisconnected: {
        reason: number;
    };
    ClientRoomDelete: {
        id: number;
    };
    ServerRoomDeleted: {
        id: number;
    };
    ClientRoomCreate: {
        name: number;
        gamemode: number;
        maxUsers: number;
        password: number;
    };
    ServerRoomCreated: {
        id: number;
        name: number;
        gamemode: number;
        maxUsers: number;
        password: number;
        locked: number;
        users: number;
    };
    ServerRoomCreateFailed: {
        reason: number;
    };
    ClientRoomUpdate: {
        name: number;
        gamemode: number;
        maxUsers: number;
        password: number;
        locked: number;
    };
    ServerRoomUpdated: {
        name: number;
        gamemode: number;
        maxUsers: number;
        password: number;
        locked: number;
    };
    ServerRoomUpdateFailed: {
        reason: number;
    };
    ClientRoomFlagsUpdate: {
        flags: number;
    };
    ServerRoomFlagsUpdated: {
        flags: number;
    };
    ServerRoomFlagsUpdateFailed: {
        reason: number;
    };
    ModFlagsListType: {
        UNSPECIFIED: number;
        ALLOWED: number;
        DENIED: number;
    };
    ClientModFlagsUpdate: {
        modFlags: number;
    };
    ServerModFlagsUpdated: {
        modFlags: number;
    };
    ServerModFlagsUpdateFailed: {
        reason: number;
    };
    ClientJoinRoom: {
        id: number;
        password: number;
    };
    ServerJoinRoomSuccess: {
        id: number;
        name: number;
        gamemode: number;
        maxUsers: number;
        password: number;
        locked: number;
        users: number;
    };
    ServerJoinRoomFailed: {
        reason: number;
    };
    ServerUserJoinedRoom: {
        userId: number;
        name: number;
    };
    ClientLeaveRoom: {
        userId: number;
    };
    ServerUserLeftRoom: {
        userId: number;
    };
    ClientKickUser: {
        userId: number;
    };
    ServerUserKicked: {
        userId: number;
    };
    ClientBanUser: {
        userId: number;
    };
    ServerUserBanned: {
        userId: number;
    };
    ClientReadyState: {
        ready: number;
        seed: number;
        mods: number;
        version: number;
        beta: number;
    };
    ServerUserReadyState: {
        userId: number;
        ready: number;
        seed: number;
        mods: number;
        version: number;
        beta: number;
    };
    ClientStartRun: {
        forced: number;
    };
    ServerHostStart: {
        forced: number;
    };
    ClientRequestRoomList: {
        page: number;
    };
    ServerRoomList: {
        rooms: number;
        pages: number;
    };
    ServerRoomAddToList: {
        room: number;
    };
};
export declare const gameActions: ("cPlayerMove" | "sPlayerMoves" | "cPlayerUpdate" | "sPlayerUpdate" | "cPlayerUpdateInventory" | "sPlayerUpdateInventory" | "cHostItemBank" | "sHostItemBank" | "cHostUserTake" | "sHostUserTake" | "cHostUserTakeGold" | "sHostUserTakeGold" | "cPlayerAddGold" | "sPlayerAddGold" | "cPlayerTakeGold" | "sPlayerTakeGold" | "cPlayerAddItem" | "sPlayerAddItem" | "cPlayerTakeItem" | "sPlayerTakeItem" | "cPlayerPickup" | "sPlayerPickup" | "cNemesisAbility" | "sNemesisAbility" | "cNemesisPickupItem" | "sNemesisPickupItem" | "cChat" | "sChat" | "cPlayerDeath" | "sPlayerDeath" | "cPlayerNewGamePlus" | "sPlayerNewGamePlus" | "cPlayerSecretHourglass" | "sPlayerSecretHourglass" | "cCustomModEvent" | "sCustomModEvent" | "cRespawnPenalty" | "sRespawnPenalty" | "cAngerySteve" | "sAngerySteve" | "sStatUpdate")[];
export declare const lobbyActions: ("cRoomCreate" | "sRoomCreated" | "sRoomCreateFailed" | "cRoomUpdate" | "sRoomUpdated" | "sRoomUpdateFailed" | "cRoomFlagsUpdate" | "sRoomFlagsUpdated" | "sRoomFlagsUpdateFailed" | "cRoomDelete" | "sRoomDeleted" | "cJoinRoom" | "sJoinRoomSuccess" | "sJoinRoomFailed" | "sUserJoinedRoom" | "cLeaveRoom" | "sUserLeftRoom" | "cKickUser" | "sUserKicked" | "cBanUser" | "sUserBanned" | "cReadyState" | "sUserReadyState" | "cStartRun" | "sHostStart" | "cRequestRoomList" | "sRoomList" | "sDisconnected" | "sRoomAddToList" | "cRunOver" | "cRoomModFlagsUpdate" | "sRoomModFlagsUpdated" | "sRoomModFlagsUpdateFailed")[];
