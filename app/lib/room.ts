/**
 * Atrium's room: every kind of information the company holds (chats
 * and documents today; slides, sites, and more later) and how they relate.
 * Client-safe types and constants; the data comes from
 * `~/models/room.server`.
 */

import type { UIMessage } from 'ai';
import type { DocumentBlock } from './portable-text';

/** Who agents act as. Anything with this `createdById` was made by an agent. */
export const AGENT_ID = 'agent';

export type Person = {
    id: string;
    name: string;
    initials: string;
    role: string;
};

export type ChatMessage = {
    id: string;
    authorId: string;
    text: string;
    sentAt: string;
    /**
     * A live agent's reply as it streamed: its text and the tools it called,
     * in order (AI SDK UI message parts). `text` still holds the words alone.
     */
    parts?: UIMessage['parts'];
};

export type ChatCard = {
    kind: 'chat';
    id: string;
    /** The room the card is on. */
    roomId: string;
    title: string;
    participantIds: string[];
    messages: ChatMessage[];
    /** Someone is "typing": a reply (the agent's, or the mock's) is on its way. */
    awaitingReply?: boolean;
    /**
     * How many replies are on their way (`expectReply`): `awaitingReply` is
     * true while this is above zero, so one reply landing never hides another
     * still coming.
     */
    pendingReplies?: number;
    createdById: string;
    /** Where someone resized it (`resizeCard`); unset, it rests at its kind's size. */
    size?: CardSize;
};

/** Portable Text, with links to other cards (`app/lib/portable-text.ts`). */
export type { DocumentBlock } from './portable-text';

export type DocumentCard = {
    kind: 'document';
    id: string;
    /** The room the card is on. */
    roomId: string;
    title: string;
    /** Who last edited it. */
    authorId: string;
    createdById: string;
    updatedAt: string;
    blocks: DocumentBlock[];
};

export type PullRequestStatus = 'draft' | 'open' | 'merged' | 'closed';

export type PullRequestFile = {
    path: string;
    additions: number;
    deletions: number;
};

export const REVIEW_VERDICTS = [
    'approved',
    'changes_requested',
    'commented',
] as const;

export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

/** One person's review of a pull request, oldest first on the card. */
export type PullRequestReview = {
    id: string;
    authorId: string;
    verdict: ReviewVerdict;
    body: string;
    at: string;
    /** The GitHub commit it reviewed; a new push leaves it behind. */
    headSha?: string;
};

/** The GitHub pull request a card stands for, and when it was last read. */
export type GitHubPullRequestLink = {
    owner: string;
    repo: string;
    number: number;
    url: string;
    /** The commit its checks and a merge are for. */
    headSha: string;
    syncedAt: string;
};

/**
 * A code change a chat produced. `chatId` is the chat it came from; the
 * canvas hangs it under that chat. With `github` it stands for a real pull
 * request (title, files, checks, and state come from GitHub); without, it's
 * a mock.
 */
export type PullRequestCard = {
    kind: 'pull-request';
    id: string;
    /** The room the card is on. */
    roomId: string;
    title: string;
    number: number;
    repo: string;
    branch: string;
    base: string;
    status: PullRequestStatus;
    authorId: string;
    createdById: string;
    chatId?: string;
    summary: string;
    checks: { passed: number; failed: number; pending: number };
    files: PullRequestFile[];
    /** Oldest first. Only a person's approval lets it merge. */
    reviews?: PullRequestReview[];
    github?: GitHubPullRequestLink;
    updatedAt: string;
};

/**
 * Where a pull request's review stands: the latest approval or change
 * request from a person on the commit it's at now. Comments, anything the
 * agent says, and reviews of a commit since pushed over don't count.
 */
export function reviewStateOf(
    pr: Pick<PullRequestCard, 'reviews' | 'github'>,
): 'approved' | 'changes_requested' | 'none' {
    const reviews = pr.reviews ?? [];
    const head = pr.github?.headSha;
    for (let index = reviews.length - 1; index >= 0; index--) {
        const review = reviews[index]!;
        if (review.authorId === AGENT_ID || review.verdict === 'commented') {
            continue;
        }
        if (head && review.headSha && review.headSha !== head) continue;
        return review.verdict;
    }
    return 'none';
}

/** Why a pull request can't merge yet, or null when it can. */
export function mergeBlockerOf(
    pr: Pick<PullRequestCard, 'status' | 'reviews' | 'checks' | 'github'>,
): string | null {
    if (pr.status !== 'open') return 'Only an open pull request can merge.';
    const review = reviewStateOf(pr);
    if (review === 'changes_requested') return 'Changes were requested.';
    if (review !== 'approved') return 'It needs a person to approve it.';
    if (pr.checks.failed > 0) return 'Checks are failing.';
    return null;
}

export type ChartPoint = { label: string; value: number };

/**
 * A small chart attached to the chat or document it explains (a mock: the
 * numbers are made up). It hangs under that card on the canvas.
 */
export type ChartCard = {
    kind: 'chart';
    id: string;
    /** The room the card is on. */
    roomId: string;
    title: string;
    chart: 'line' | 'bar';
    attachedTo?: string;
    caption: string;
    /** What the numbers count, for the axis ("signups", "partners"). */
    unit: string;
    points: ChartPoint[];
    createdById: string;
    updatedAt: string;
};

/** Linear's workflow, left to right on a board. */
export const ISSUE_STATUSES = [
    'backlog',
    'todo',
    'in_progress',
    'in_review',
    'done',
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_PRIORITIES = [
    'urgent',
    'high',
    'medium',
    'low',
    'none',
] as const;

export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export type Issue = {
    id: string;
    /** Board key plus number, like "ATL-14". */
    identifier: string;
    title: string;
    status: IssueStatus;
    priority: IssuePriority;
    assigneeId?: string;
    /** Other cards it's about: a PR, the chat it came from, a doc. */
    links: string[];
    /** Plain text, as long as it needs to be. */
    description?: string;
    /** Oldest first. */
    comments?: IssueComment[];
    /** The agent chat working on it, once it's been handed to an agent. */
    delegatedChatId?: string;
    createdById: string;
    updatedAt: string;
};

export type IssueComment = {
    id: string;
    authorId: string;
    text: string;
    at: string;
};

/**
 * An issue board, like a Linear project: one card per board, its issues
 * in status columns (a mock: nothing syncs to Linear).
 */
export type BoardCard = {
    kind: 'board';
    id: string;
    /** The room the card is on. */
    roomId: string;
    title: string;
    /** Prefix for issue identifiers. */
    key: string;
    issues: Issue[];
    createdById: string;
    updatedAt: string;
};

/** A YouTube video, played in its card (privacy-enhanced embed). */
export type VideoCard = {
    kind: 'video';
    id: string;
    /** The room the card is on. */
    roomId: string;
    title: string;
    /** YouTube's 11-character video id. */
    videoId: string;
    /** The chat or document it belongs to; it hangs under it. */
    attachedTo?: string;
    createdById: string;
    updatedAt: string;
};

/** A web page, live in a browser-like card (an iframe). */
export type WebCard = {
    kind: 'web';
    id: string;
    /** The room the card is on. */
    roomId: string;
    title: string;
    /** Always https (see `normalizeWebUrl`). */
    url: string;
    /** The chat or document it belongs to; it hangs under it. */
    attachedTo?: string;
    createdById: string;
    updatedAt: string;
};

/** A picture: a photo, a diagram, or an animated GIF. */
export type ImageCard = {
    kind: 'image';
    id: string;
    /** The room the card is on. */
    roomId: string;
    title: string;
    /** An https address (see `normalizeWebUrl`). */
    src: string;
    /** What the picture shows, for screen readers. */
    alt: string;
    /** An animated GIF: labeled so, since it moves on its own. */
    animated: boolean;
    /** The chat or document it belongs to; it hangs under it. */
    attachedTo?: string;
    createdById: string;
    updatedAt: string;
};

/** Whether an image address names a GIF. */
export function isGifUrl(src: string): boolean {
    try {
        return /\.gif$/i.test(new URL(src).pathname);
    } catch {
        return false;
    }
}

/** A sticky note: a few lines of text in a colored square. */
export type NoteCard = {
    kind: 'note';
    id: string;
    /** The room the card is on. */
    roomId: string;
    /** Its first line (see `noteTitle`), so lists and search can name it. */
    title: string;
    text: string;
    createdById: string;
    updatedAt: string;
};

/** A note's title: its first line with words, or "Empty note". */
export function noteTitle(text: string): string {
    const line = text
        .split('\n')
        .map((part) => part.trim())
        .find(Boolean);
    if (!line) return 'Empty note';
    return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

/** The longest a card's title can be. */
export const TITLE_MAX = 160;

/**
 * Whether a card's title can be changed by hand: sticky notes take theirs
 * from their first line.
 */
export function isRenamable(card: Pick<Card, 'kind'>) {
    return card.kind !== 'note';
}

/** The drawing area of a sketch, in its own units (strokes use these). */
export const SKETCH_SIZE = { width: 640, height: 400 };

/** Paint's classic sixteen colors, for sketches. */
export const SKETCH_COLORS = [
    '#000000',
    '#808080',
    '#800000',
    '#808000',
    '#008000',
    '#008080',
    '#000080',
    '#800080',
    '#ffffff',
    '#c0c0c0',
    '#ff0000',
    '#ffff00',
    '#00ff00',
    '#00ffff',
    '#0000ff',
    '#ff00ff',
] as const;

export type SketchStroke = {
    /** One of `SKETCH_COLORS` (white is the eraser). */
    color: string;
    /** Brush width, in sketch units (the ink swells and thins around it). */
    size: number;
    /** x, y, x, y, … in sketch units. */
    points: number[];
    /**
     * A pen's pressure (0 to 1) at each point, when drawn with one. Without
     * it, the ink's width follows the pointer's speed.
     */
    pressures?: number[];
};

/** A quick drawing, MS Paint style: strokes on white paper. */
export type SketchCard = {
    kind: 'sketch';
    id: string;
    /** The room the card is on. */
    roomId: string;
    title: string;
    strokes: SketchStroke[];
    createdById: string;
    updatedAt: string;
};

/**
 * A small interface an agent composed from the UI catalog (json-render; see
 * `app/lib/ui-card.ts`): its spec says which components and where their
 * values come from (the room's own data, bound live).
 */
export type UiCard = {
    kind: 'ui';
    id: string;
    /** The room the card is on. */
    roomId: string;
    title: string;
    /** A json-render spec: `{ root, elements, state? }`. */
    spec: {
        root: string;
        elements: Record<string, unknown>;
        state?: Record<string, unknown>;
    };
    createdById: string;
    updatedAt: string;
};

/** A note's color when nobody picked one (the palette recolors it). */
export const DEFAULT_NOTE_COLOR = 'amber';

export type Card =
    | ChatCard
    | DocumentCard
    | PullRequestCard
    | ChartCard
    | BoardCard
    | VideoCard
    | WebCard
    | ImageCard
    | NoteCard
    | SketchCard
    | UiCard;

const YOUTUBE_ID = /^[\w-]{11}$/;

/**
 * The video id in a YouTube link (watch, youtu.be, shorts, embed, live) or
 * a bare id; null for anything else.
 */
export function youtubeVideoId(input: string): string | null {
    const text = input.trim();
    if (YOUTUBE_ID.test(text)) return text;
    let url: URL;
    try {
        url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
        return null;
    }
    const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
    let id: string | null | undefined;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        const [, first, second] = url.pathname.split('/');
        id =
            first === 'watch'
                ? url.searchParams.get('v')
                : ['shorts', 'embed', 'live', 'v'].includes(first ?? '')
                  ? second
                  : null;
    }
    return id && YOUTUBE_ID.test(id) ? id : null;
}

/** The privacy-enhanced player for a video id. */
export function youtubeEmbedUrl(videoId: string): string {
    return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}

/**
 * A web address as a browser loads it: https only (a bare
 * "example.com" gets https:// added); null for anything else.
 */
export function normalizeWebUrl(input: string): string | null {
    const text = input.trim();
    if (!text) return null;
    let url: URL;
    try {
        url = new URL(
            /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`,
        );
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || !url.hostname.includes('.')) return null;
    return url.toString();
}

/** Whether an agent, not a person, made this card. */
export function isAgentMade(card: { createdById: string }): boolean {
    return card.createdById === AGENT_ID;
}

/**
 * A chat between signed-in people (`isMember`) and the agent alone, with
 * none of the mock cast: when chat is live (an
 * Anthropic key is set), the agent answers it for real and can make cards.
 */
export function isAgentChat(
    chat: Pick<ChatCard, 'participantIds'>,
    isMember: (id: string) => boolean,
): boolean {
    return (
        chat.participantIds.includes(AGENT_ID) &&
        chat.participantIds.every((id) => id === AGENT_ID || isMember(id))
    );
}

/** The role of people who sign in (the rest of the cast is mock). */
export const MEMBER_ROLE = 'Member';

/**
 * The card a card hangs under on the canvas: a pull request's chat, a
 * chart's chat or document. Other cards sit on the main row.
 */
export function parentIdOf(card: Card): string | undefined {
    if (card.kind === 'pull-request') return card.chatId;
    // Charts, videos, web pages, and images.
    return 'attachedTo' in card ? card.attachedTo : undefined;
}

/** Every card hanging under this one, and under those, and so on. */
export function hangingUnder(cardId: string, cards: readonly Card[]): string[] {
    const children = cards
        .filter((candidate) => parentIdOf(candidate) === cardId)
        .map((candidate) => candidate.id);
    return children.flatMap((id) => [id, ...hangingUnder(id, cards)]);
}

export type CardKind = Card['kind'];

/** Kinds people add by address (a dialog asks for it first). */
export const URL_KINDS = ['video', 'web', 'image'] as const;
export type UrlKind = (typeof URL_KINDS)[number];

export function isUrlKind(kind: CardKind): kind is UrlKind {
    return (URL_KINDS as readonly string[]).includes(kind);
}

/** Kinds that only exist under a chat or document (added from its card). */
export const ATTACHED_KINDS = ['chart', 'pull-request'] as const;

/** A link between two cards: "this chat references that document". */
export type Relation = {
    id: string;
    from: string;
    to: string;
    label: string;
};

/** The six border colors a card can take (styled in card-colors.ts). */
export const CARD_COLOR_NAMES = [
    'rose',
    'amber',
    'emerald',
    'sky',
    'violet',
    'slate',
] as const;

export type CardColor = (typeof CARD_COLOR_NAMES)[number];

export function isCardColor(value: string): value is CardColor {
    return (CARD_COLOR_NAMES as readonly string[]).includes(value);
}

/** How the cards are arranged: front-to-back order and border colors. */
export type Arrangement = {
    /** Card ids, bottom to top. */
    stack: string[];
    colors: Partial<Record<string, CardColor>>;
    /** Where people dragged cards; unsaved cards use the tidy layout. */
    positions: Partial<Record<string, { x: number; y: number }>>;
    /** Cards pinned where they are: they can't be dragged, and Arrange leaves them. */
    locked: string[];
    /**
     * Goes up each time an agent lays cards out (`arrangeCards`,
     * `moveCard`), so open canvases slide every card to its saved spot.
     */
    layoutVersion?: number;
};

/**
 * A saved place on the canvas: the flow point at the middle of the canvas
 * and the zoom. Stored as a center, not an offset, so a view lands on the
 * same spot whatever the card's size.
 */
export type SavedView = {
    id: string;
    roomId: string;
    name: string;
    center: { x: number; y: number };
    zoom: number;
    /**
     * Set on views made by framing cards (agents save these). Each canvas
     * then fits these cards where they actually are, at its own size;
     * `center` and `zoom` are only the fallback.
     */
    cardIds?: string[];
};

/** A group of rooms, like a team's or a project's. */
export type Space = {
    id: string;
    name: string;
    description: string;
};

/** A room as listed: on the home page and in the switcher. */
export type RoomSummary = {
    id: string;
    spaceId: string;
    name: string;
    description: string;
    /** How many cards, and of which kinds (each once). */
    cardCount: number;
    kinds: CardKind[];
};

/** The whole workspace: every space with its rooms, in order. */
export type Workspace = {
    spaces: (Space & { rooms: RoomSummary[] })[];
};

/** One room, open: its cards and everything about how they sit. */
export type Room = {
    id: string;
    name: string;
    description: string;
    space: Space;
    /** Every space and room, for switching. */
    workspace: Workspace;
    meId: string;
    people: Person[];
    cards: Card[];
    relations: Relation[];
    arrangement: Arrangement;
    /** Oldest first. */
    views: SavedView[];
};

/**
 * Card sizes on the canvas: chats are phones (9:16), documents 16:9, and
 * pull requests (3:4) and charts (4:3) are cards as wide as a chat, so they
 * line up in a column under whatever they hang from.
 */
export const CARD_SIZES = {
    chat: { width: 360, height: 640 },
    document: { width: 960, height: 540 },
    'pull-request': { width: 360, height: 480 },
    chart: { width: 360, height: 270 },
    board: { width: 1120, height: 540 },
    // A 16:9 player under a 44px header.
    video: { width: 640, height: 404 },
    web: { width: 960, height: 640 },
    // Chat-column width, so it hangs neatly under a chat; the picture fits
    // inside (letterboxed) whatever its shape.
    image: { width: 360, height: 314 },
    note: { width: 240, height: 240 },
    // Room for a row of metrics and a list beside the chats.
    ui: { width: 640, height: 520 },
    // The 640x400 paper plus the toolbar above and palette below.
    sketch: { width: 640, height: 540 },
} as const satisfies Record<CardKind, { width: number; height: number }>;

export const CARD_GAP = 48;

export type CardPlacement = {
    id: string;
    kind: CardKind;
    x: number;
    y: number;
    width: number;
    height: number;
};

export type CardSize = { width: number; height: number };

/**
 * Cards you can resize by dragging their edges, and how far: never below
 * their kind's size, never past `max`. Chats grow to a 16:9 box's width at
 * their resting height (640 * 16/9), and as tall as that is wide.
 */
export const RESIZE_LIMITS = {
    chat: { min: CARD_SIZES.chat, max: { width: 1138, height: 1138 } },
} as const satisfies Partial<
    Record<CardKind, { min: CardSize; max: CardSize }>
>;

export type ResizableKind = keyof typeof RESIZE_LIMITS;

export function isResizable(kind: CardKind): kind is ResizableKind {
    return kind in RESIZE_LIMITS;
}

/** A size kept within its kind's limits, in whole pixels. */
export function clampSize(kind: ResizableKind, size: CardSize): CardSize {
    const { min, max } = RESIZE_LIMITS[kind];
    const fit = (value: number, low: number, high: number) =>
        Math.round(Math.min(high, Math.max(low, value)));
    return {
        width: fit(size.width, min.width, max.width),
        height: fit(size.height, min.height, max.height),
    };
}

/** Which edges a resize drags: one side, or two at a corner. */
export type ResizeEdges = {
    x?: 'left' | 'right';
    y?: 'top' | 'bottom';
};

/**
 * A card's box after dragging `edges` by `delta` flow px (screen px over
 * the zoom), clamped to its limits. The opposite edges stay put, so
 * dragging the left or top edge moves the card as it grows.
 */
export function resizeBox(
    kind: ResizableKind,
    start: CardSize & { x: number; y: number },
    edges: ResizeEdges,
    delta: { x: number; y: number },
): CardSize & { x: number; y: number } {
    const size = clampSize(kind, {
        width:
            start.width +
            (edges.x === 'right' ? delta.x : edges.x === 'left' ? -delta.x : 0),
        height:
            start.height +
            (edges.y === 'bottom' ? delta.y : edges.y === 'top' ? -delta.y : 0),
    });
    return {
        ...size,
        x: edges.x === 'left' ? start.x + start.width - size.width : start.x,
        y: edges.y === 'top' ? start.y + start.height - size.height : start.y,
    };
}

/** A card's resting size: where someone resized it to, else its kind's. */
export function sizeOf(card: Card): CardSize {
    if (card.kind === 'chat' && card.size) return card.size;
    return CARD_SIZES[card.kind];
}

/**
 * The spot for a card hanging under `parent`, below the cards already
 * hanging there (their heights, top to bottom).
 */
export function hangSlot(
    parent: { x: number; y: number; height: number },
    heightsAbove: readonly number[],
): { x: number; y: number } {
    return {
        x: parent.x,
        y:
            parent.y +
            parent.height +
            CARD_GAP +
            heightsAbove.reduce((sum, height) => sum + height + CARD_GAP, 0),
    };
}

/**
 * Where each card starts on the canvas: chats side by side, then
 * documents, all on one row and centered on the row's tallest card. Pull
 * requests and charts hang in a column under the card they belong to (or
 * join the row when it is gone).
 */
export function placeCards(cards: Card[]): CardPlacement[] {
    const onRow = new Set(
        cards.filter((card) => !parentIdOf(card)).map((card) => card.id),
    );
    const hangs = (card: Card) => {
        const parentId = parentIdOf(card);
        return parentId !== undefined && onRow.has(parentId);
    };
    const row = [
        ...cards.filter((card) => card.kind === 'chat'),
        ...cards.filter((card) => card.kind !== 'chat' && !hangs(card)),
    ];
    const rowHeight = Math.max(0, ...row.map((card) => sizeOf(card).height));

    // Each row spot is as wide as its widest card: the card itself or
    // anything hanging under it (a web page under a chat), so columns never
    // run into each other.
    const columnWidth = new Map<string, number>();
    for (const card of cards) {
        if (!hangs(card)) continue;
        const parentId = parentIdOf(card)!;
        columnWidth.set(
            parentId,
            Math.max(columnWidth.get(parentId) ?? 0, sizeOf(card).width),
        );
    }

    let x = 0;
    const placed: CardPlacement[] = row.map((card) => {
        const size = sizeOf(card);
        const placement = {
            id: card.id,
            kind: card.kind,
            x,
            y: (rowHeight - size.height) / 2,
            ...size,
        };
        x += Math.max(size.width, columnWidth.get(card.id) ?? 0) + CARD_GAP;
        return placement;
    });

    const parents = new Map(placed.map((spot) => [spot.id, spot]));
    const columns = new Map<string, number[]>();
    for (const card of cards) {
        if (!hangs(card)) continue;
        const parent = parents.get(parentIdOf(card)!)!;
        const above = columns.get(parent.id) ?? [];
        const size = sizeOf(card);
        placed.push({
            id: card.id,
            kind: card.kind,
            ...hangSlot(parent, above),
            ...size,
        });
        columns.set(parent.id, [...above, size.height]);
    }
    return placed;
}

/** The URL that focuses a card on the canvas. */
export function roomPath(roomId: string): string {
    return `/rooms/${encodeURIComponent(roomId)}`;
}

export function cardPath(roomId: string, cardId: string): string {
    return `${roomPath(roomId)}/cards/${encodeURIComponent(cardId)}`;
}

export type Insets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

/**
 * How a focused card fills the canvas: its size (the canvas minus the
 * insets) and the view, at zoom 1, that puts its top-left corner at the
 * insets.
 */
export function focusFrame(
    canvas: { width: number; height: number },
    position: { x: number; y: number },
    insets: Insets,
) {
    return {
        size: {
            width: Math.max(0, canvas.width - insets.left - insets.right),
            height: Math.max(0, canvas.height - insets.top - insets.bottom),
        },
        viewport: {
            x: insets.left - position.x,
            y: insets.top - position.y,
            zoom: 1,
        },
    };
}

export const RECENT_LIMIT = 5;

/** Puts `id` first in a most-recent-first list, without repeats, capped. */
export function pushRecent(
    recent: readonly string[],
    id: string,
    limit = RECENT_LIMIT,
): string[] {
    return [id, ...recent.filter((other) => other !== id)].slice(0, limit);
}

/**
 * Where a card added later (say, by an agent) starts: on the row, right of
 * everything already there, so nothing the person arranged moves.
 */
export function placeNewCard(
    existing: { x: number; kind: CardKind; width?: number }[],
    kind: CardKind,
): { x: number; y: number } {
    const right = Math.max(
        0,
        ...existing.map(
            (window) =>
                window.x +
                (window.width ?? CARD_SIZES[window.kind].width) +
                CARD_GAP,
        ),
    );
    const rowHeight = CARD_SIZES.chat.height;
    return { x: right, y: (rowHeight - CARD_SIZES[kind].height) / 2 };
}

/** Puts `id` on top of (or under) the others in a bottom-to-top stack. */
export function restack(
    stack: readonly string[],
    id: string,
    to: 'front' | 'back',
): string[] {
    const rest = stack.filter((other) => other !== id);
    return to === 'front' ? [...rest, id] : [id, ...rest];
}

/**
 * A stack covering exactly `ids`: the known order first (dropping ids that
 * are gone), then any it has never seen, on top.
 */
export function completeStack(
    stack: readonly string[],
    ids: readonly string[],
): string[] {
    const present = new Set(ids);
    const known = stack.filter((id) => present.has(id));
    const seen = new Set(known);
    return [...known, ...ids.filter((id) => !seen.has(id))];
}

/** The URL that jumps the canvas to a saved view. */
export function viewPath(roomId: string, viewId: string): string {
    return `${roomPath(roomId)}/views/${encodeURIComponent(viewId)}`;
}

/** The flow point at the middle of a canvas of `size` showing `viewport`. */
export function viewCenter(
    viewport: { x: number; y: number; zoom: number },
    size: { width: number; height: number },
): { x: number; y: number } {
    return {
        x: (size.width / 2 - viewport.x) / viewport.zoom,
        y: (size.height / 2 - viewport.y) / viewport.zoom,
    };
}

/** The canvas size agents frame views for, when they can't see a real one. */
export const REFERENCE_CANVAS = { width: 1440, height: 900 } as const;

/**
 * A view framing `cardIds` as the canvas lays them out on a fresh load
 * (`placeCards`), on a canvas of `canvas` size with `padding` px around.
 * Null when none of the ids are in the room.
 */
export function frameCards(
    cards: Card[],
    cardIds: readonly string[],
    canvas: { width: number; height: number } = REFERENCE_CANVAS,
    padding = 48,
): { center: { x: number; y: number }; zoom: number } | null {
    const wanted = new Set(cardIds);
    const boxes = placeCards(cards).filter((box) => wanted.has(box.id));
    if (boxes.length === 0) return null;

    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const zoom = Math.min(
        (canvas.width - 2 * padding) / (right - left),
        (canvas.height - 2 * padding) / (bottom - top),
    );

    return {
        center: { x: (left + right) / 2, y: (top + bottom) / 2 },
        zoom: Math.min(1.5, Math.max(0.2, zoom)),
    };
}

/**
 * Moves an issue into `status`, at `index` among that column's issues (top
 * is 0; clamped; left out, it goes to the bottom). A board's issue array
 * order is the order within each column, so this is the whole of "reorder".
 */
export function placeIssue<T extends { id: string; status: IssueStatus }>(
    issues: readonly T[],
    issueId: string,
    status: IssueStatus,
    index?: number,
): T[] {
    const moving = issues.find((issue) => issue.id === issueId);
    if (!moving) return [...issues];
    const rest = issues.filter((issue) => issue.id !== issueId);
    const moved = { ...moving, status };
    const column = rest.filter((issue) => issue.status === status);
    const at =
        index === undefined
            ? column.length
            : Math.max(0, Math.min(index, column.length));

    const before = column[at];
    const position = before
        ? rest.indexOf(before)
        : column.length > 0
          ? rest.indexOf(column.at(-1)!) + 1
          : rest.length;
    return [...rest.slice(0, position), moved, ...rest.slice(position)];
}
