import { createContext, useContext } from 'react';
import { useParams } from 'react-router';
import type {
    CardSize,
    Person,
    PullRequestCard,
    Card,
    CardKind,
    CardColor,
} from '~/lib/room';
import { cardPath, roomPath, viewPath } from '~/lib/room';

type RoomPeople = {
    meId: string;
    /** Everyone in the room, "me" first. */
    people: Person[];
    personById: (id: string) => Person | undefined;
};

export const RoomPeopleContext = createContext<RoomPeople | null>(null);

export function useRoomPeople(): RoomPeople {
    const value = useContext(RoomPeopleContext);
    if (!value) {
        throw new Error('useRoomPeople needs a RoomPeopleContext');
    }
    return value;
}

/** The card the URL focuses (`/cards/:cardId`), if any. */
export const FocusedCardContext = createContext<string | undefined>(undefined);

type Stacking = {
    bringToFront: (cardId: string) => void;
    sendToBack: (cardId: string) => void;
    /** Locked cards can't be dragged, and Arrange leaves them. */
    isLocked: (cardId: string) => boolean;
    toggleLock: (cardId: string) => void;
};

/** Reorders cards front to back. */
export const StackingContext = createContext<Stacking | null>(null);

export function useStacking(): Stacking {
    const value = useContext(StackingContext);
    if (!value) throw new Error('useStacking needs a StackingContext');
    return value;
}

type CardColors = {
    colorOf: (cardId: string) => CardColor | undefined;
    /** `null` goes back to the default border. */
    setColor: (cardId: string, color: CardColor | null) => void;
};

/** Each card's chosen border color. */
export const CardColorContext = createContext<CardColors | null>(null);

export function useCardColors(): CardColors {
    const value = useContext(CardColorContext);
    if (!value) throw new Error('useCardColors needs a CardColorContext');
    return value;
}

type Cards = {
    cards: Card[];
    cardOf: (cardId: string) => Card | undefined;
    titleOf: (cardId: string) => string | undefined;
    kindOf: (cardId: string) => CardKind | undefined;
    /** Pull requests a chat opened, newest first. */
    pullRequestsFrom: (chatId: string) => PullRequestCard[];
};

/** Lookups cards use to link to each other. */
export const CardsContext = createContext<Cards | null>(null);

export function useCards(): Cards {
    const value = useContext(CardsContext);
    if (!value) throw new Error('useCards needs a CardsContext');
    return value;
}

/**
 * Where things on the open room live: the route actions post to
 * (`action`), a card's focused route, a saved view's route. Use inside the
 * room route (it reads `:roomId`).
 */
export function useRoomLinks() {
    const { roomId } = useParams();
    if (!roomId) throw new Error('useRoomLinks needs a room route');
    return {
        roomId,
        action: roomPath(roomId),
        card: (cardId: string) => cardPath(roomId, cardId),
        view: (viewId: string) => viewPath(roomId, viewId),
    };
}

type Renaming = {
    /** The card whose title is being edited, if any. */
    renamingId: string | null;
    startRename: (cardId: string) => void;
    stopRename: () => void;
};

/** Which card's title is open for editing (`CardTitle`, the card menu). */
export const RenamingContext = createContext<Renaming | null>(null);

export function useRenaming(): Renaming {
    const value = useContext(RenamingContext);
    if (!value) throw new Error('useRenaming needs a RenamingContext');
    return value;
}

type Box = CardSize & { x: number; y: number };

type Resizing = {
    /** Where a card is and how big, at the start of a resize. */
    begin: (cardId: string) => Box | null;
    /** Resizes a card on the canvas while its edge is dragged. */
    resize: (cardId: string, box: Box) => void;
    /** Saves the box it was dropped at (`resize-card`). */
    commit: (cardId: string, box: Box) => void;
};

/** Resizing cards by their edges (`ResizeEdges`). */
export const ResizingContext = createContext<Resizing | null>(null);

export function useResizing(): Resizing {
    const value = useContext(ResizingContext);
    if (!value) throw new Error('useResizing needs a ResizingContext');
    return value;
}
