import { createHash } from 'node:crypto';
import type { SessionUser } from '~/context';
import { MOCK_REPLY_DELAY_MS, pickMockReply } from '~/lib/mock-chat';
import {
    arrangeGroups,
    clusterLayout,
    currentLayout,
    topLeftOf,
    type ArrangeDirection,
} from '~/lib/arrange';
import {
    brandRefreshRoom,
    launchRetroRoom,
    type SeedRoom,
} from './seed-rooms.server';
import { uiSpecProblems } from '~/lib/ui-card';
import { markChanged } from './room-events.server';
import {
    markdownToPortableText,
    referencedCardIds,
    type DocumentBlock,
} from '~/lib/portable-text';
import {
    AGENT_ID,
    isAgentChat,
    MEMBER_ROLE,
    frameCards,
    isGifUrl,
    noteTitle,
    normalizeWebUrl,
    placeIssue,
    youtubeVideoId,
    restack,
    type Arrangement,
    type Space,
    type CardKind,
    type RoomSummary,
    type Workspace,
    type BoardCard,
    type VideoCard,
    type ImageCard,
    type NoteCard,
    type SketchCard,
    type SketchStroke,
    type UiCard,
    type WebCard,
    type ChartCard,
    type ChartPoint,
    type ChatCard,
    type ChatMessage,
    type DocumentCard,
    type Issue,
    type IssueComment,
    type IssuePriority,
    type IssueStatus,
    type Person,
    type PullRequestFile,
    type PullRequestCard,
    type PullRequestStatus,
    type Relation,
    type SavedView,
    type Room,
    type Card,
    type CardColor,
    TITLE_MAX,
    hangingUnder,
    parentIdOf,
    isRenamable,
    clampSize,
    isResizable,
    type CardSize,
} from '~/lib/room';

/**
 * The mock room: one shared, in-memory workspace that people (through the
 * app) and agents (through `/api/mcp`) both read and write. It lives for the
 * life of the server process and resets on restart. This is the seam where a
 * real store slots in later: callers only depend on these functions and the
 * `Room` shape.
 */

/** Who agents write as, unless they name someone else. */
export { AGENT_ID };

/**
 * The seeded cast. Signed-in people join them as `members` (by their user
 * id) the first time they open a room; replies from the mock chat
 * service only ever come from this cast, never from a real person.
 */
const PEOPLE: Person[] = [
    { id: 'jordan', name: 'Jordan Lee', initials: 'JL', role: 'Launch Lead' },
    { id: 'maya', name: 'Maya Chen', initials: 'MC', role: 'Head of Product' },
    { id: 'dev', name: 'Dev Patel', initials: 'DP', role: 'Engineering Lead' },
    {
        id: 'rosa',
        name: 'Rosa Alvarez',
        initials: 'RA',
        role: 'Customer Success',
    },
    { id: AGENT_ID, name: 'Concierge', initials: 'AI', role: 'Agent' },
];

/** A room as stored: its name, and how its cards sit. */
type RoomRecord = {
    id: string;
    spaceId: string;
    name: string;
    description: string;
    arrangement: Arrangement;
};

type Store = {
    spaces: Space[];
    /** In order, across all spaces. */
    rooms: RoomRecord[];
    /** Every card, in every room (each says which: `roomId`). */
    cards: Card[];
    relations: Relation[];
    views: SavedView[];
    /** Everyone who has signed in and opened a room, by user id. */
    members: Person[];
};

/** A card before it's put in a room. */
type Unplaced<T> = T extends unknown ? Omit<T, 'roomId'> : never;

/** The seed's main room: everything the app started with is on it. */
export const SEED_ROOM_ID = 'atlas-launch';

/** What the agent says first in the chat every new room starts with. */
const AGENT_GREETING =
    "Hi! I work in this room with you. Ask me to draft a doc, chart some numbers, start an issue board, pin a note, sketch, or pull in a page, video, or image, and I'll put it on the canvas next to this chat.";

/**
 * The chat with the agent a room starts with: whoever writes first
 * joins, so it stays an agent chat (`isAgentChat`). Deletable like any card.
 */
function agentChat(roomId: string, id: string, sentAt: string): ChatCard {
    return {
        kind: 'chat',
        id,
        roomId,
        title: 'Ask the Concierge',
        participantIds: [AGENT_ID],
        messages: [
            {
                id: `${id}-hello`,
                authorId: AGENT_ID,
                text: AGENT_GREETING,
                sentAt,
            },
        ],
        createdById: AGENT_ID,
    };
}

/** A space with one live agent chat on it, to try the agent from scratch. */
function playground(): {
    space: Space;
    room: RoomRecord;
    chat: ChatCard;
} {
    const chat = {
        ...agentChat('agent-test-drive', 'chat-agent', '2026-10-25T09:00:00Z'),
    };
    chat.messages[0]!.id = 'msg-agent-hello';
    return {
        space: {
            id: 'playground',
            name: 'Playground',
            description: 'Try the Concierge on a blank canvas.',
        },
        room: {
            id: chat.roomId,
            spaceId: 'playground',
            name: 'Agent test drive',
            description:
                'One chat with the Concierge; what it makes lands here.',
            arrangement: emptyArrangement([chat.id]),
        },
        chat,
    };
}

function emptyArrangement(cardIds: string[] = []): Arrangement {
    return { stack: cardIds, colors: {}, positions: {}, locked: [] };
}

/** The workspace every fresh store starts from. */
function seed(): Store {
    const content = seedContent();
    const launch: Card[] = content.cards.map(
        (card) => ({ ...card, roomId: SEED_ROOM_ID }) as Card,
    );
    const northwindPlan: DocumentCard = {
        kind: 'document',
        id: 'doc-northwind-plan',
        roomId: 'northwind',
        title: 'Northwind account plan',
        authorId: 'rosa',
        createdById: 'rosa',
        updatedAt: '2026-10-21T15:00:00Z',
        blocks: markdownToPortableText(`
Northwind runs **240 seats** across three regions and renews in March.

## What they need

- SSO before they roll Atlas out past the pilot team
- A named contact for the API freeze

## Next steps

- Share the SSO fast-follow date once it's set
- Invite their admin to the private beta
`),
    };
    const retro = launchRetroRoom('launch-retro');
    const play = playground();
    const brand = brandRefreshRoom('brand-refresh');
    const arranged = (seedRoom: SeedRoom): Arrangement => ({
        ...emptyArrangement(seedRoom.cards.map((card) => card.id)),
        colors: seedRoom.colors,
    });
    return {
        members: [],
        spaces: [
            {
                id: 'product',
                name: 'Product',
                description: 'Building and launching Atlas.',
            },
            {
                id: 'customers',
                name: 'Customers',
                description: 'Accounts, and what they need from us.',
            },
            {
                id: 'design',
                name: 'Design',
                description: 'How Atlas looks, sounds, and feels.',
            },
            play.space,
        ],
        rooms: [
            {
                id: SEED_ROOM_ID,
                spaceId: 'product',
                name: 'Atlas launch',
                description: 'Everything for the Atlas beta and launch.',
                arrangement: emptyArrangement(launch.map((card) => card.id)),
            },
            {
                id: 'launch-retro',
                spaceId: 'product',
                name: 'Launch retro',
                description:
                    'Agents at work on the launch follow-ups: their chats, pull requests, and docs, plus the retro.',
                arrangement: arranged(retro),
            },
            {
                id: 'northwind',
                spaceId: 'customers',
                name: 'Northwind',
                description: 'The Northwind account.',
                arrangement: emptyArrangement([northwindPlan.id]),
            },
            {
                id: 'brand-refresh',
                spaceId: 'design',
                name: 'Brand refresh',
                description:
                    'A warmer Atlas for launch: reviews, assets, and references.',
                arrangement: arranged(brand),
            },
            play.room,
        ],
        cards: [
            ...launch,
            northwindPlan,
            ...retro.cards,
            ...brand.cards,
            play.chat,
        ],
        relations: [
            ...content.relations,
            ...retro.relations,
            ...brand.relations,
        ],
        views: seedViews(launch),
    };
}

/**
 * Starter views, each framing a cluster of related cards: whichever
 * canvas opens one fits those cards where they are now.
 */
function seedViews(cards: Card[]): SavedView[] {
    const clusters: { id: string; name: string; cardIds: string[] }[] = [
        {
            id: 'view-launch',
            name: 'Atlas launch',
            cardIds: [
                'chat-launch',
                'doc-brief',
                'pr-api-freeze',
                'chart-signups',
                'chart-partners',
            ],
        },
        {
            id: 'view-northwind',
            name: 'Northwind SSO',
            cardIds: ['chat-customers', 'doc-sso-notes', 'pr-sso-flag'],
        },
        {
            id: 'view-numbers',
            name: 'Launch numbers',
            cardIds: ['chart-signups', 'chart-partners'],
        },
        { id: 'view-board', name: 'Issue board', cardIds: ['board-atlas'] },
    ];
    return clusters.map(({ id, name, cardIds }) => ({
        id,
        roomId: SEED_ROOM_ID,
        name,
        ...frameCards(cards, cardIds)!,
        cardIds,
    }));
}

/** A seed issue on the Atlas board. */
function issue(
    number: number,
    title: string,
    status: IssueStatus,
    priority: IssuePriority,
    assigneeId: string | undefined,
    links: string[],
    createdById = 'maya',
): Issue {
    return {
        id: `issue-atl-${number}`,
        identifier: `ATL-${number}`,
        title,
        status,
        priority,
        ...(assigneeId ? { assigneeId } : {}),
        links,
        createdById,
        updatedAt: '2026-10-23T10:45:00Z',
    };
}

function seedContent(): {
    cards: Unplaced<Card>[];
    relations: Relation[];
} {
    return {
        cards: [
            {
                kind: 'chat',
                id: 'chat-launch',
                title: 'Launch crew',
                createdById: 'maya',
                participantIds: ['jordan', 'maya', 'dev'],
                messages: [
                    {
                        id: 'm1',
                        authorId: 'maya',
                        text: 'Brief for the Atlas launch is up. Can everyone skim the timeline before standup?',
                        sentAt: '2026-10-23T09:02:00Z',
                    },
                    {
                        id: 'm2',
                        authorId: 'dev',
                        text: 'Read it. The beta date works if we freeze the API by the 6th.',
                        sentAt: '2026-10-23T09:10:00Z',
                    },
                    {
                        id: 'm3',
                        authorId: 'jordan',
                        text: "Let's call the 6th the freeze and note it in the brief.",
                        sentAt: '2026-10-23T09:14:00Z',
                    },
                    {
                        id: 'm4',
                        authorId: 'maya',
                        text: 'Done. Added it under Timeline.',
                        sentAt: '2026-10-23T09:16:00Z',
                    },
                ],
            },
            {
                kind: 'chat',
                id: 'chat-customers',
                title: 'Rosa Alvarez',
                createdById: 'rosa',
                participantIds: ['jordan', 'rosa'],
                messages: [
                    {
                        id: 'c1',
                        authorId: 'rosa',
                        text: 'Northwind asked if Atlas will support SSO at launch.',
                        sentAt: '2026-10-23T10:20:00Z',
                    },
                    {
                        id: 'c2',
                        authorId: 'jordan',
                        text: "It's in the brief as a fast follow, not day one.",
                        sentAt: '2026-10-23T10:24:00Z',
                    },
                    {
                        id: 'c3',
                        authorId: 'rosa',
                        text: "Got it. I'll set expectations and link them the open questions.",
                        sentAt: '2026-10-23T10:25:00Z',
                    },
                ],
            },
            {
                kind: 'document',
                id: 'doc-brief',
                title: 'Atlas launch brief',
                authorId: 'maya',
                createdById: 'maya',
                updatedAt: '2026-10-23T09:16:00Z',
                blocks: markdownToPortableText(`
Atlas gives every team **one shared view** of its accounts, so sales, success, and product stop keeping separate spreadsheets.

## Goals

- Move 40 design partners onto Atlas by launch
- Retire the shared accounts spreadsheet
- Cut time to answer "who owns this account?" to seconds

## Timeline

- Nov 6: API freeze ([#482](card:pr-api-freeze))
- Nov 13: private beta with design partners
- Dec 4: general availability

The work is tracked on the board:

![](card:board-atlas)

## Open questions

- SSO at launch or as a fast follow? See [Northwind's questions](card:doc-sso-notes).
- Which partners get early access to the API?
`),
            },
            {
                kind: 'pull-request',
                id: 'pr-api-freeze',
                title: 'Freeze the public API for the Atlas beta',
                number: 482,
                repo: 'acme/atlas',
                branch: 'atlas/api-freeze',
                base: 'main',
                status: 'open',
                authorId: AGENT_ID,
                createdById: AGENT_ID,
                chatId: 'chat-launch',
                summary:
                    'Locks the v1 endpoints for the Nov 6 freeze and marks the experimental ones as such.',
                checks: { passed: 12, failed: 0, pending: 1 },
                files: [
                    { path: 'api/v1/routes.ts', additions: 48, deletions: 12 },
                    { path: 'api/v1/schema.ts', additions: 31, deletions: 9 },
                    {
                        path: 'docs/api/changelog.md',
                        additions: 22,
                        deletions: 0,
                    },
                ],
                updatedAt: '2026-10-23T09:40:00Z',
            },
            {
                kind: 'pull-request',
                id: 'pr-sso-flag',
                title: 'Add an SSO fast-follow feature flag',
                number: 485,
                repo: 'acme/atlas',
                branch: 'atlas/sso-flag',
                base: 'main',
                status: 'draft',
                authorId: AGENT_ID,
                createdById: AGENT_ID,
                chatId: 'chat-customers',
                summary:
                    'Ships SSO behind a flag so Northwind can try it right after launch.',
                checks: { passed: 9, failed: 1, pending: 0 },
                files: [
                    { path: 'auth/sso.ts', additions: 64, deletions: 3 },
                    { path: 'flags/index.ts', additions: 6, deletions: 0 },
                ],
                updatedAt: '2026-10-23T10:40:00Z',
            },
            {
                kind: 'document',
                id: 'doc-sso-notes',
                title: 'Northwind SSO questions',
                authorId: AGENT_ID,
                createdById: AGENT_ID,
                updatedAt: '2026-10-23T10:30:00Z',
                blocks: markdownToPortableText(`
Drafted by the Concierge from [the chat with Rosa](card:chat-customers), so customer success has one answer to send.

## What Northwind asked

- Will Atlas support SSO at launch?
- Which identity providers are planned?

## What to tell them

SSO is a *fast follow*, not day one. It ships behind a flag ([#485](card:pr-sso-flag)) so Northwind can try it right after launch.
`),
            },
            {
                kind: 'chart',
                id: 'chart-signups',
                title: 'Beta signups this week',
                chart: 'line',
                attachedTo: 'chat-launch',
                caption:
                    'Daily design-partner signups since the brief went out.',
                unit: 'signups',
                points: [
                    { label: 'Mon', value: 4 },
                    { label: 'Tue', value: 7 },
                    { label: 'Wed', value: 6 },
                    { label: 'Thu', value: 11 },
                    { label: 'Fri', value: 14 },
                ],
                createdById: AGENT_ID,
                updatedAt: '2026-10-23T09:50:00Z',
            },
            {
                kind: 'chart',
                id: 'chart-partners',
                title: 'Design partners by stage',
                chart: 'bar',
                attachedTo: 'doc-brief',
                caption: 'Toward the goal of 40 partners on Atlas by launch.',
                unit: 'partners',
                points: [
                    { label: 'Invited', value: 52 },
                    { label: 'Signed', value: 31 },
                    { label: 'Onboarded', value: 18 },
                    { label: 'Active', value: 12 },
                ],
                createdById: 'maya',
                updatedAt: '2026-10-23T09:20:00Z',
            },
            {
                kind: 'video',
                id: 'video-launch',
                title: 'How Apple launched the iPhone',
                videoId: 'MnrJzXM7a6o',
                attachedTo: 'doc-brief',
                createdById: 'maya',
                updatedAt: '2026-10-22T16:00:00Z',
            },
            {
                kind: 'image',
                id: 'image-iphone',
                title: 'The first iPhone',
                src: 'https://upload.wikimedia.org/wikipedia/commons/4/45/IPhone_First_Generation.jpg',
                alt: 'The original iPhone from 2007, face up, showing its home screen.',
                animated: false,
                attachedTo: 'chat-launch',
                createdById: 'maya',
                updatedAt: '2026-10-22T16:10:00Z',
            },
            {
                kind: 'image',
                id: 'image-earth',
                title: 'Launch day, everywhere',
                src: 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif',
                alt: 'An animated globe turning slowly.',
                animated: true,
                attachedTo: 'chat-customers',
                createdById: AGENT_ID,
                updatedAt: '2026-10-23T10:36:00Z',
            },
            {
                kind: 'web',
                id: 'web-launch-guide',
                title: 'Product launch (Wikipedia)',
                url: 'https://en.wikipedia.org/wiki/Product_launch',
                attachedTo: 'doc-sso-notes',
                createdById: AGENT_ID,
                updatedAt: '2026-10-23T10:35:00Z',
            },
            {
                kind: 'board',
                id: 'board-atlas',
                title: 'Atlas launch',
                key: 'ATL',
                createdById: 'maya',
                updatedAt: '2026-10-23T10:45:00Z',
                issues: [
                    issue(
                        11,
                        'Write the beta welcome email',
                        'backlog',
                        'low',
                        'rosa',
                        [],
                    ),
                    issue(
                        12,
                        'Pick early-access partners for the API',
                        'backlog',
                        'medium',
                        undefined,
                        ['doc-brief'],
                    ),
                    issue(
                        13,
                        'Rate limit the public API',
                        'todo',
                        'high',
                        'dev',
                        ['chat-launch'],
                    ),
                    issue(
                        15,
                        'Partner onboarding checklist',
                        'todo',
                        'medium',
                        'maya',
                        ['chart-partners'],
                    ),
                    issue(
                        16,
                        'Accounts table loads slowly past 5k rows',
                        'in_progress',
                        'urgent',
                        'dev',
                        [],
                    ),
                    issue(
                        17,
                        'SSO behind a fast-follow flag',
                        'in_progress',
                        'high',
                        'dev',
                        ['pr-sso-flag', 'doc-sso-notes'],
                        AGENT_ID,
                    ),
                    issue(
                        14,
                        'Freeze the public API for the beta',
                        'in_review',
                        'urgent',
                        'dev',
                        ['pr-api-freeze', 'chat-launch'],
                        AGENT_ID,
                    ),
                    issue(
                        10,
                        'Draft the Atlas launch brief',
                        'done',
                        'medium',
                        'maya',
                        ['doc-brief'],
                    ),
                ],
            },
        ],
        relations: [
            {
                id: 'r1',
                from: 'chat-launch',
                to: 'doc-brief',
                label: 'discusses',
            },
            {
                id: 'r2',
                from: 'chat-customers',
                to: 'doc-brief',
                label: 'references',
            },
            {
                id: 'r3',
                from: 'chat-launch',
                to: 'pr-api-freeze',
                label: 'opened',
            },
            {
                id: 'r4',
                from: 'chat-customers',
                to: 'pr-sso-flag',
                label: 'opened',
            },
            {
                id: 'r5',
                from: 'chat-customers',
                to: 'doc-sso-notes',
                label: 'summarized in',
            },
            {
                id: 'r6',
                from: 'chat-launch',
                to: 'chart-signups',
                label: 'charted',
            },
            {
                id: 'r7',
                from: 'doc-brief',
                to: 'chart-partners',
                label: 'charted',
            },
            {
                id: 'r8',
                from: 'board-atlas',
                to: 'doc-brief',
                label: 'tracks',
            },
            {
                id: 'r9',
                from: 'doc-brief',
                to: 'video-launch',
                label: 'inspired by',
            },
            {
                id: 'r11',
                from: 'chat-launch',
                to: 'image-iphone',
                label: 'image',
            },
            {
                id: 'r12',
                from: 'chat-customers',
                to: 'image-earth',
                label: 'image',
            },
            {
                id: 'r10',
                from: 'doc-sso-notes',
                to: 'web-launch-guide',
                label: 'references',
            },
        ],
    };
}

// Kept on globalThis so dev-server reloads of this module keep the data.
const STORE_KEY = Symbol.for('atrium.mock-store');
type WithStore = typeof globalThis & { [STORE_KEY]?: Store };

function store(): Store {
    const scope = globalThis as WithStore;
    // A store made by older code (kept across dev reloads) from before
    // spaces and rooms: start over from the seed.
    if (!scope[STORE_KEY] || !('spaces' in scope[STORE_KEY])) {
        scope[STORE_KEY] = seed();
    }
    const current = scope[STORE_KEY];
    // Stores from before real people (kept across dev reloads).
    current.members ??= [];
    // Stores from before locking (kept across dev reloads).
    for (const room of current.rooms) room.arrangement.locked ??= [];
    // Stores from before shapes were removed: their shape cards go.
    dropRemovedKinds(current);
    // Stores from before the playground space get it.
    if (!current.spaces.some((space) => space.id === 'playground')) {
        const play = playground();
        current.spaces.push(play.space);
        current.rooms.push(play.room);
        current.cards.push(play.chat);
    }
    // Documents from before Portable Text: seeded ones take the new seed's
    // content (with its links), others are converted.
    const legacy = current.cards.filter(
        (card): card is DocumentCard =>
            card.kind === 'document' && !isPortableText(card.blocks),
    );
    if (legacy.length > 0) {
        const seeded = new Map(
            seedContent().cards.map((card) => [card.id, card]),
        );
        for (const doc of legacy) {
            const fresh = seeded.get(doc.id);
            doc.blocks =
                fresh?.kind === 'document'
                    ? fresh.blocks
                    : toPortableText(doc.blocks);
        }
    }
    return current;
}

/** Kinds of card the app no longer has (shapes, removed 2026-10-25). */
const REMOVED_KINDS = new Set(['shape']);

/**
 * Takes cards of removed kinds out of a store made by older code (kept
 * across dev reloads), with their links, arrangement, and view framing.
 */
function dropRemovedKinds(current: Store) {
    const gone = new Set(
        current.cards
            .filter((card) => REMOVED_KINDS.has(card.kind as string))
            .map((card) => card.id),
    );
    if (gone.size === 0) return;
    current.cards = current.cards.filter((card) => !gone.has(card.id));
    current.relations = current.relations.filter(
        (relation) => !gone.has(relation.from) && !gone.has(relation.to),
    );
    for (const { arrangement } of current.rooms) {
        arrangement.stack = arrangement.stack.filter((id) => !gone.has(id));
        arrangement.locked = arrangement.locked.filter((id) => !gone.has(id));
        for (const id of gone) {
            delete arrangement.colors[id];
            delete arrangement.positions[id];
        }
    }
    for (const view of current.views) {
        view.cardIds = view.cardIds?.filter((id) => !gone.has(id));
    }
}

/**
 * Now, but always later than `previous`: two edits in the same millisecond
 * must still get different versions, or a stale save would look current.
 */
function nextTimestamp(previous: string): string {
    const now = Date.now();
    const last = Date.parse(previous);
    return new Date(now > last ? now : last + 1).toISOString();
}

/** Blocks from before documents were Portable Text, converted. */
type LegacyBlock =
    | { type: 'heading'; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'list'; cards: string[] };

function isPortableText(
    blocks: (DocumentBlock | LegacyBlock)[],
): blocks is DocumentBlock[] {
    return blocks.every((block) => '_type' in block);
}

function toPortableText(blocks: (DocumentBlock | LegacyBlock)[]) {
    if (isPortableText(blocks)) return blocks;
    return blocks.flatMap((block) => {
        if ('_type' in block) return [block];
        if (block.type === 'heading') {
            return markdownToPortableText(`## ${block.text}`);
        }
        if (block.type === 'list') {
            return markdownToPortableText(
                block.cards.map((entry) => `- ${entry}`).join('\n'),
            );
        }
        return markdownToPortableText(block.text);
    });
}

/** Back to the seed data. For tests. */
export function resetRoom() {
    (globalThis as WithStore)[STORE_KEY] = seed();
}

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? [parts[0], parts.at(-1)!] : parts;
    return letters.map((part) => part[0]!.toUpperCase()).join('') || '?';
}

function newId(prefix: string) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export class RoomError extends Error {}

/** A save based on a version someone else has since replaced. */
export class RoomConflictError extends RoomError {}

function requireCard(id: string): Card {
    const card = store().cards.find((candidate) => candidate.id === id);
    if (!card) throw new RoomError(`No card with id "${id}".`);
    return card;
}

function requireRoom(id: string): RoomRecord {
    const room = store().rooms.find((candidate) => candidate.id === id);
    if (!room) throw new RoomError(`No room with id "${id}".`);
    return room;
}

function requireSpace(id: string): Space {
    const space = store().spaces.find((candidate) => candidate.id === id);
    if (!space) throw new RoomError(`No space with id "${id}".`);
    return space;
}

/** The arrangement of the room a card is on. */
function arrangementOf(cardId: string): Arrangement {
    return requireRoom(requireCard(cardId).roomId).arrangement;
}

/** Puts a new card in its room, on top of the stack. */
function storeCard(card: Card) {
    requireRoom(card.roomId).arrangement.stack.push(card.id);
    store().cards.push(card);
}

/**
 * Where a new card goes: under its parent's room when it hangs from
 * one, else the room named.
 */
function roomFor(
    parentId: string | undefined,
    roomId: string | undefined,
): string {
    if (parentId) return requireCard(parentId).roomId;
    if (!roomId) {
        throw new RoomError(
            'Say which room it goes in (roomId; see list_spaces).',
        );
    }
    return requireRoom(roomId).id;
}

/** Cards a document links to or embeds must be in its room. */
function requireReferencesOn(roomId: string, blocks: DocumentBlock[]) {
    for (const id of referencedCardIds(blocks)) {
        if (requireCard(id).roomId !== roomId) {
            throw new RoomError(
                `"${id}" is in another room; documents link to cards in their own room.`,
            );
        }
    }
}

function requireKnownPeople(ids: string[]) {
    const known = new Set(listPeople().map((person) => person.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
        throw new RoomError(`Unknown people: ${unknown.join(', ')}.`);
    }
}

export function isMember(id: string) {
    return store().members.some((member) => member.id === id);
}

/**
 * The signed-in user as a person in the room, added to `members` the
 * first time (and renamed when their name changes).
 */
export function rememberPerson(user: SessionUser): Person {
    const name = user.name || user.email;
    const person: Person = {
        id: user.id,
        name,
        initials: initialsOf(name),
        role: MEMBER_ROLE,
    };
    const { members } = store();
    const index = members.findIndex((member) => member.id === user.id);
    if (index === -1) members.push(person);
    else members[index] = person;
    return structuredClone(person);
}

/** Everyone: signed-in members, then the seeded cast and the agent. */
export function listPeople(): Person[] {
    return structuredClone([...store().members, ...PEOPLE]);
}

/** Every space and its rooms, in order, with what's on each. */
export function getWorkspace(): Workspace {
    const { spaces, rooms, cards } = store();
    return structuredClone({
        spaces: spaces.map((space) => ({
            ...space,
            rooms: rooms
                .filter((room) => room.spaceId === space.id)
                .map((room) => {
                    const held = cards.filter(
                        (card) => card.roomId === room.id,
                    );
                    return {
                        id: room.id,
                        spaceId: room.spaceId,
                        name: room.name,
                        description: room.description,
                        cardCount: held.length,
                        kinds: [...new Set(held.map((card) => card.kind))],
                    };
                }),
        })),
    });
}

/** One room, open; null when there's no such room. */
export async function getRoomForUser(
    user: SessionUser,
    roomId: string,
): Promise<Room | null> {
    const record = store().rooms.find((candidate) => candidate.id === roomId);
    if (!record) return null;
    const me = rememberPerson(user);
    const cards = store().cards.filter((card) => card.roomId === roomId);
    const ids = new Set(cards.map((card) => card.id));

    // A copy, so nothing outside this module can change the store by hand.
    return structuredClone({
        id: record.id,
        name: record.name,
        description: record.description,
        space: requireSpace(record.spaceId),
        workspace: getWorkspace(),
        meId: me.id,
        people: [me, ...listPeople().filter((person) => person.id !== me.id)],
        cards,
        relations: store().relations.filter(
            (relation) => ids.has(relation.from) && ids.has(relation.to),
        ),
        arrangement: record.arrangement,
        views: store().views.filter((view) => view.roomId === roomId),
    });
}

/**
 * A fingerprint of what's in a room (the same for every viewer), or null
 * for no such room. The page keeps the one it loaded and reloads when
 * the event stream sends another. Only this room counts: new rooms
 * elsewhere (the switcher's list) and people signing in show with the next
 * reload, rather than reloading every open room at once.
 */
export function roomVersion(roomId: string): string | null {
    const { rooms, cards: allCards, relations, views } = store();
    const record = rooms.find((candidate) => candidate.id === roomId);
    if (!record) return null;
    const cards = allCards.filter((card) => card.roomId === roomId);
    const ids = new Set(cards.map((card) => card.id));
    const shared = JSON.stringify([
        record,
        requireSpace(record.spaceId),
        cards,
        relations.filter(
            (relation) => ids.has(relation.from) && ids.has(relation.to),
        ),
        views.filter((view) => view.roomId === roomId),
    ]);
    return createHash('sha1').update(shared).digest('base64url').slice(0, 16);
}

/** A card in this room, or null. */
export async function getCardInRoom(
    _user: SessionUser,
    roomId: string,
    cardId: string,
): Promise<Card | null> {
    const card = store().cards.find(
        (candidate) => candidate.id === cardId && candidate.roomId === roomId,
    );
    return card ? structuredClone(card) : null;
}

export function listCards(roomId?: string) {
    if (roomId) requireRoom(roomId);
    return store()
        .cards.filter((card) => !roomId || card.roomId === roomId)
        .map((card) => ({
            id: card.id,
            kind: card.kind,
            title: card.title,
            roomId: card.roomId,
        }));
}

/** Starts a space, empty. */
export function createSpace({
    name,
    description = '',
}: {
    name: string;
    description?: string;
}): Space {
    const space: Space = { id: newId('space'), name, description };
    store().spaces.push(space);
    return structuredClone(space);
}

/** Starts a room in a space, with a chat with the agent on it. */
export function createRoom({
    spaceId,
    name,
    description = '',
}: {
    spaceId: string;
    name: string;
    description?: string;
}): RoomSummary {
    requireSpace(spaceId);
    const record: RoomRecord = {
        id: newId('room'),
        spaceId,
        name,
        description,
        arrangement: emptyArrangement(),
    };
    store().rooms.push(record);
    storeCard(agentChat(record.id, newId('chat'), new Date().toISOString()));
    return {
        id: record.id,
        spaceId,
        name,
        description,
        cardCount: 1,
        kinds: ['chat'],
    };
}

export function getCard(cardId: string): Card {
    return structuredClone(requireCard(cardId));
}

export function createChat({
    roomId,
    title,
    participantIds = [AGENT_ID],
    firstMessage,
    authorId = AGENT_ID,
}: {
    roomId: string;
    title: string;
    participantIds?: string[];
    firstMessage?: string;
    authorId?: string;
}): ChatCard {
    const participants = [...new Set([...participantIds, authorId])];
    requireKnownPeople(participants);
    const chat: ChatCard = {
        kind: 'chat',
        id: newId('chat'),
        roomId: requireRoom(roomId).id,
        title,
        participantIds: participants,
        messages: [],
        createdById: authorId,
    };
    storeCard(chat);
    if (firstMessage)
        postMessage({ chatId: chat.id, authorId, text: firstMessage });
    return structuredClone(chat);
}

/**
 * Adds a message. When a person (not an agent) writes, someone else in the
 * chat answers after a pause, from the mock reply service; `awaitingReply`
 * is true until then. Agent chats (`isAgentChat`) never get mock replies:
 * only the live agent answers them, so with it off nobody does rather than
 * the agent seeming to answer. `mockReply: false` skips it anywhere.
 */
export function postMessage({
    chatId,
    authorId,
    text,
    id = crypto.randomUUID(),
    parts,
    mockReply = true,
}: {
    chatId: string;
    authorId: string;
    text: string;
    /** The id the client already shows it under (a streamed message's). */
    id?: string;
    parts?: ChatMessage['parts'];
    mockReply?: boolean;
}): ChatMessage {
    const chat = requireCard(chatId);
    if (chat.kind !== 'chat') {
        throw new RoomError(`"${chatId}" is a ${chat.kind}, not a chat.`);
    }
    requireKnownPeople([authorId]);

    if (chat.messages.some((existing) => existing.id === id)) {
        throw new RoomError(`A message with id "${id}" is already there.`);
    }
    const message: ChatMessage = {
        id,
        authorId,
        text,
        sentAt: new Date().toISOString(),
        ...(parts && { parts }),
    };
    chat.messages.push(message);
    if (!chat.participantIds.includes(authorId)) {
        chat.participantIds.push(authorId);
    }

    // Only the seeded cast and the agent answer: a real person's words are
    // never made up for them.
    const repliers = chat.participantIds.filter((id) => !isMember(id));
    if (
        isMember(authorId) &&
        mockReply &&
        !isAgentChat(chat, isMember) &&
        repliers.length > 0
    ) {
        const replied = countReply(chat);
        setTimeout(() => {
            chat.messages.push(
                pickMockReply(
                    { participantIds: repliers },
                    { meId: authorId, exclude: [AGENT_ID] },
                ),
            );
            replied();
            markChanged();
        }, MOCK_REPLY_DELAY_MS);
    }
    return structuredClone(message);
}

/**
 * Counts one more reply on its way to a chat, so it shows someone typing,
 * and returns what to call when that reply lands or fails. The chat stops
 * showing typing when every reply counted has; calling it again changes
 * nothing, and it never throws (the chat may be deleted by then).
 */
function countReply(chat: ChatCard): () => void {
    chat.pendingReplies = (chat.pendingReplies ?? 0) + 1;
    chat.awaitingReply = true;
    let done = false;
    return () => {
        if (done) return;
        done = true;
        chat.pendingReplies = Math.max(0, (chat.pendingReplies ?? 0) - 1);
        chat.awaitingReply = chat.pendingReplies > 0;
    };
}

/**
 * Shows someone typing in a chat (the live agent's turn) until the function
 * it returns is called: once the reply is saved, or the turn failed.
 */
export function expectReply(chatId: string): () => void {
    const chat = requireCard(chatId);
    if (chat.kind !== 'chat') {
        throw new RoomError(`"${chatId}" is a ${chat.kind}, not a chat.`);
    }
    return countReply(chat);
}

export function createDocument({
    roomId,
    title,
    blocks,
    authorId = AGENT_ID,
}: {
    roomId: string;
    title: string;
    blocks: DocumentBlock[];
    authorId?: string;
}): DocumentCard {
    requireRoom(roomId);
    requireKnownPeople([authorId]);
    requireReferencesOn(roomId, blocks);
    const doc: DocumentCard = {
        kind: 'document',
        id: newId('doc'),
        roomId,
        title,
        authorId,
        createdById: authorId,
        updatedAt: new Date().toISOString(),
        blocks,
    };
    storeCard(doc);
    return structuredClone(doc);
}

export function appendToDocument({
    documentId,
    blocks,
    authorId = AGENT_ID,
}: {
    documentId: string;
    blocks: DocumentBlock[];
    authorId?: string;
}): DocumentCard {
    const doc = requireCard(documentId);
    if (doc.kind !== 'document') {
        throw new RoomError(
            `"${documentId}" is a ${doc.kind}, not a document.`,
        );
    }
    requireKnownPeople([authorId]);
    requireReferencesOn(doc.roomId, blocks);
    doc.blocks.push(...blocks);
    doc.authorId = authorId;
    doc.updatedAt = nextTimestamp(doc.updatedAt);
    return structuredClone(doc);
}

/**
 * Replaces a document's content, as long as nobody else has changed it
 * since `baseUpdatedAt` (the version the editor started from); otherwise a
 * `RoomConflictError`, so an agent's edit is never silently lost.
 */
export function updateDocument({
    documentId,
    blocks,
    baseUpdatedAt,
    authorId = AGENT_ID,
}: {
    documentId: string;
    blocks: DocumentBlock[];
    baseUpdatedAt: string;
    authorId?: string;
}): DocumentCard {
    const doc = requireCard(documentId);
    if (doc.kind !== 'document') {
        throw new RoomError(
            `"${documentId}" is a ${doc.kind}, not a document.`,
        );
    }
    if (doc.updatedAt !== baseUpdatedAt) {
        throw new RoomConflictError(
            'This document changed since you started editing.',
        );
    }
    requireKnownPeople([authorId]);
    requireReferencesOn(doc.roomId, blocks);
    doc.blocks = blocks;
    doc.authorId = authorId;
    doc.updatedAt = nextTimestamp(doc.updatedAt);
    return structuredClone(doc);
}

export function linkCards({
    from,
    to,
    label,
}: {
    from: string;
    to: string;
    label: string;
}): Relation {
    if (requireCard(from).roomId !== requireCard(to).roomId) {
        throw new RoomError('Cards in different rooms can not be linked.');
    }
    const relation: Relation = { id: newId('rel'), from, to, label };
    store().relations.push(relation);
    return structuredClone(relation);
}

/** Removes a relation between two cards (the line between them). */
export function unlinkRelation(relationId: string) {
    const relations = store().relations;
    const index = relations.findIndex((relation) => relation.id === relationId);
    if (index === -1) {
        throw new RoomError(`No link with id "${relationId}".`);
    }
    relations.splice(index, 1);
}

/** Removes every link between two cards, either way round; how many went. */
/** The links between cards in a room, each with both cards' titles. */
export function listLinks(roomId: string) {
    requireRoom(roomId);
    const titles = new Map(
        store()
            .cards.filter((card) => card.roomId === roomId)
            .map((card) => [card.id, card.title]),
    );
    return store()
        .relations.filter(
            (relation) => titles.has(relation.from) && titles.has(relation.to),
        )
        .map((relation) => ({
            ...relation,
            fromTitle: titles.get(relation.from)!,
            toTitle: titles.get(relation.to)!,
        }));
}

export function unlinkCards({ from, to }: { from: string; to: string }) {
    requireCard(from);
    requireCard(to);
    const relations = store().relations;
    const before = relations.length;
    store().relations = relations.filter(
        (relation) =>
            !(
                (relation.from === from && relation.to === to) ||
                (relation.from === to && relation.to === from)
            ),
    );
    return before - store().relations.length;
}

/** Brings a card to the front of the canvas, or sends it to the back. */
export function restackCard(cardId: string, to: 'front' | 'back'): string[] {
    const arrangement = arrangementOf(cardId);
    arrangement.stack = restack(arrangement.stack, cardId, to);
    return [...arrangement.stack];
}

/** Sets a card's border color; `null` goes back to the default border. */
export function setCardColor(cardId: string, color: CardColor | null) {
    const { colors } = arrangementOf(cardId);
    if (color) colors[cardId] = color;
    else delete colors[cardId];
}

export function getSavedView(viewId: string): SavedView | null {
    const view = store().views.find((candidate) => candidate.id === viewId);
    return view ? structuredClone(view) : null;
}

/** Saves a place on the canvas to jump back to. */
export function saveView({
    roomId,
    name,
    center,
    zoom,
    cardIds,
}: Omit<SavedView, 'id'>): SavedView {
    requireRoom(roomId);
    for (const id of cardIds ?? []) {
        if (requireCard(id).roomId !== roomId) {
            throw new RoomError(`"${id}" is not in this room.`);
        }
    }
    const view: SavedView = {
        id: newId('view'),
        roomId,
        name,
        center,
        zoom,
        ...(cardIds ? { cardIds } : {}),
    };
    store().views.push(view);
    return structuredClone(view);
}

export function deleteView(viewId: string) {
    const views = store().views;
    const index = views.findIndex((view) => view.id === viewId);
    if (index === -1) throw new RoomError(`No view with id "${viewId}".`);
    views.splice(index, 1);
}

export function listViews(roomId?: string): SavedView[] {
    return structuredClone(
        store().views.filter((view) => !roomId || view.roomId === roomId),
    );
}

/** All cards, for laying out views (see `frameCards`). */
export function allCards(): Card[] {
    return structuredClone(store().cards);
}

/**
 * Opens a (mock) pull request from a chat: the change a conversation
 * produced. It hangs under the chat on the canvas, linked as "opened", and
 * the chat gets a message saying so.
 */
export function openPullRequest({
    chatId,
    title,
    branch,
    base = 'main',
    summary = '',
    files = [],
    draft = false,
    authorId = AGENT_ID,
}: {
    chatId: string;
    title: string;
    branch: string;
    base?: string;
    summary?: string;
    files?: PullRequestFile[];
    draft?: boolean;
    authorId?: string;
}): PullRequestCard {
    const chat = requireCard(chatId);
    if (chat.kind !== 'chat') {
        throw new RoomError(`"${chatId}" is a ${chat.kind}, not a chat.`);
    }
    requireKnownPeople([authorId]);

    const numbers = store()
        .cards.filter((card) => card.kind === 'pull-request')
        .map((card) => (card as PullRequestCard).number);
    const pr: PullRequestCard = {
        kind: 'pull-request',
        id: newId('pr'),
        roomId: chat.roomId,
        title,
        number: Math.max(480, ...numbers) + 1,
        repo: 'acme/atlas',
        branch,
        base,
        status: draft ? 'draft' : 'open',
        authorId,
        createdById: authorId,
        chatId,
        summary,
        // Mock CI: everything queued until someone (or an agent) moves it on.
        checks: { passed: 0, failed: 0, pending: 8 },
        files,
        updatedAt: new Date().toISOString(),
    };
    storeCard(pr);
    linkCards({ from: chatId, to: pr.id, label: 'opened' });
    postMessage({
        chatId,
        authorId,
        text: `Opened #${pr.number}: ${title} (${branch} → ${base}).`,
    });
    return structuredClone(pr);
}

/** Moves a pull request along: draft, open, merged, or closed. */
export function setPullRequestStatus(
    pullRequestId: string,
    status: PullRequestStatus,
): PullRequestCard {
    const pr = requireCard(pullRequestId);
    if (pr.kind !== 'pull-request') {
        throw new RoomError(
            `"${pullRequestId}" is a ${pr.kind}, not a pull request.`,
        );
    }
    pr.status = status;
    if (status === 'merged') {
        pr.checks = {
            passed: pr.checks.passed + pr.checks.pending,
            failed: pr.checks.failed,
            pending: 0,
        };
    }
    pr.updatedAt = new Date().toISOString();
    // Merging finishes the issues it was in review for.
    if (status === 'merged') {
        for (const board of boards()) {
            for (const tracked of board.issues) {
                if (
                    tracked.links.includes(pr.id) &&
                    tracked.status === 'in_review'
                ) {
                    tracked.status = 'done';
                    tracked.updatedAt = pr.updatedAt;
                }
            }
        }
    }
    return structuredClone(pr);
}

/**
 * Adds a (mock) chart hanging under the chat or document it explains,
 * linked as "charted".
 */
export function createChart({
    attachedTo,
    title,
    chart,
    caption = '',
    unit,
    points,
    authorId = AGENT_ID,
}: {
    attachedTo: string;
    title: string;
    chart: ChartCard['chart'];
    caption?: string;
    unit: string;
    points: ChartPoint[];
    authorId?: string;
}): ChartCard {
    const parent = requireCard(attachedTo);
    if (parent.kind !== 'chat' && parent.kind !== 'document') {
        throw new RoomError(
            `Charts attach to chats and documents, and "${attachedTo}" is a ${parent.kind}.`,
        );
    }
    requireKnownPeople([authorId]);
    const card: ChartCard = {
        kind: 'chart',
        id: newId('chart'),
        roomId: parent.roomId,
        title,
        chart,
        attachedTo,
        caption,
        unit,
        points,
        createdById: authorId,
        updatedAt: new Date().toISOString(),
    };
    storeCard(card);
    linkCards({ from: attachedTo, to: card.id, label: 'charted' });
    return structuredClone(card);
}

function boards(): BoardCard[] {
    return store().cards.filter(
        (card): card is BoardCard => card.kind === 'board',
    );
}

function requireBoard(boardId: string): BoardCard {
    const board = requireCard(boardId);
    if (board.kind !== 'board') {
        throw new RoomError(`"${boardId}" is a ${board.kind}, not a board.`);
    }
    return board;
}

/** Starts an issue board. `key` prefixes its issue identifiers ("ATL-1"). */
/** Checks a parent for videos and web pages: a chat or a document. */
function requireAttachable(attachedTo: string | undefined, what: string) {
    if (attachedTo === undefined) return;
    const parent = requireCard(attachedTo);
    if (parent.kind !== 'chat' && parent.kind !== 'document') {
        throw new RoomError(
            `${what} attach to chats and documents, and "${attachedTo}" is a ${parent.kind}.`,
        );
    }
}

/**
 * Adds a YouTube video from a link (any YouTube URL form) or an id. With
 * `attachedTo`, it hangs under that chat or document, linked as "video";
 * otherwise it joins the main row.
 */
export function createVideo({
    url,
    title,
    attachedTo,
    authorId = AGENT_ID,
    roomId,
}: {
    url: string;
    title: string;
    attachedTo?: string;
    authorId?: string;
    roomId?: string;
}): VideoCard {
    const videoId = youtubeVideoId(url);
    if (!videoId) throw new RoomError(`"${url}" is not a YouTube video.`);
    requireAttachable(attachedTo, 'Videos');
    requireKnownPeople([authorId]);
    const card: VideoCard = {
        kind: 'video',
        id: newId('video'),
        roomId: roomFor(attachedTo, roomId),
        title,
        videoId,
        ...(attachedTo ? { attachedTo } : {}),
        createdById: authorId,
        updatedAt: new Date().toISOString(),
    };
    storeCard(card);
    if (attachedTo)
        linkCards({ from: attachedTo, to: card.id, label: 'video' });
    return structuredClone(card);
}

/**
 * Adds a web page (https only) in a browser card, hanging under
 * `attachedTo` (linked as "references") or on the main row.
 */
export function createWebPage({
    url,
    title,
    attachedTo,
    authorId = AGENT_ID,
    roomId,
}: {
    url: string;
    title: string;
    attachedTo?: string;
    authorId?: string;
    roomId?: string;
}): WebCard {
    const normalized = normalizeWebUrl(url);
    if (!normalized) {
        throw new RoomError(`"${url}" is not an https web address.`);
    }
    requireAttachable(attachedTo, 'Web pages');
    requireKnownPeople([authorId]);
    const card: WebCard = {
        kind: 'web',
        id: newId('web'),
        roomId: roomFor(attachedTo, roomId),
        title,
        url: normalized,
        ...(attachedTo ? { attachedTo } : {}),
        createdById: authorId,
        updatedAt: new Date().toISOString(),
    };
    storeCard(card);
    if (attachedTo) {
        linkCards({ from: attachedTo, to: card.id, label: 'references' });
    }
    return structuredClone(card);
}

/**
 * Adds a picture from an https address; a .gif is marked animated unless
 * `animated` says otherwise. Hangs under `attachedTo` (linked as "image")
 * or joins the main row.
 */
export function createImage({
    url,
    title,
    alt = '',
    animated,
    attachedTo,
    authorId = AGENT_ID,
    roomId,
}: {
    url: string;
    title: string;
    alt?: string;
    animated?: boolean;
    attachedTo?: string;
    authorId?: string;
    roomId?: string;
}): ImageCard {
    const src = normalizeWebUrl(url);
    if (!src) throw new RoomError(`"${url}" is not an https image address.`);
    requireAttachable(attachedTo, 'Images');
    requireKnownPeople([authorId]);
    const card: ImageCard = {
        kind: 'image',
        id: newId('image'),
        roomId: roomFor(attachedTo, roomId),
        title,
        src,
        alt,
        animated: animated ?? isGifUrl(src),
        ...(attachedTo ? { attachedTo } : {}),
        createdById: authorId,
        updatedAt: new Date().toISOString(),
    };
    storeCard(card);
    if (attachedTo)
        linkCards({ from: attachedTo, to: card.id, label: 'image' });
    return structuredClone(card);
}

/**
 * Copies a card: a new id, "(copy)" after the title, made by `authorId`
 * now, with its own message and issue ids, the original's border color,
 * and the same relations (so a hanging copy hangs under the same parent).
 * Pull requests can't be copied: each stands for one real code change.
 * With `position`, the copy opens there (beside the original) instead of
 * where the tidy layout would put it.
 */
export function duplicateCard({
    cardId,
    authorId = AGENT_ID,
    position,
}: {
    cardId: string;
    authorId?: string;
    position?: { x: number; y: number };
}): Card {
    const original = requireCard(cardId);
    if (original.kind === 'pull-request') {
        throw new RoomError('Pull requests can not be duplicated.');
    }
    requireKnownPeople([authorId]);
    const copy = structuredClone(original);
    copy.id = newId(original.kind);
    copy.title = `${original.title} (copy)`;
    copy.createdById = authorId;
    if ('updatedAt' in copy) copy.updatedAt = new Date().toISOString();
    if (copy.kind === 'chat') {
        copy.messages = copy.messages.map((message) => ({
            ...message,
            id: newId('msg'),
        }));
        copy.awaitingReply = false;
        copy.pendingReplies = 0;
    } else if (copy.kind === 'board') {
        copy.issues = copy.issues.map((issue) => ({
            ...issue,
            id: newId('issue'),
        }));
    } else if (copy.kind === 'document') {
        copy.authorId = authorId;
    }

    const { cards, relations } = store();
    const arrangement = arrangementOf(original.id);
    cards.push(copy);
    arrangement.stack.push(copy.id);
    const color = arrangement.colors[original.id];
    if (color) arrangement.colors[copy.id] = color;
    if (position) arrangement.positions[copy.id] = { ...position };
    for (const relation of relations.filter(
        (candidate) =>
            candidate.from === original.id || candidate.to === original.id,
    )) {
        relations.push({
            ...relation,
            id: newId('rel'),
            from: relation.from === original.id ? copy.id : relation.from,
            to: relation.to === original.id ? copy.id : relation.to,
        });
    }
    return structuredClone(copy);
}

/**
 * Adds a card the way a person does in the app: a kind, maybe a title and
 * an address, and either a spot in the room (`position`, where they
 * were looking) or a parent card to hang from (`attachedTo`). Blank ones
 * get a starting title; a chart starts with sample numbers and a pull
 * request starts as a draft, so there's something to see.
 */
export function addCard({
    roomId,
    kind,
    title,
    url,
    attachedTo,
    position,
    authorId = AGENT_ID,
}: {
    roomId: string;
    kind: CardKind;
    title?: string;
    url?: string;
    attachedTo?: string;
    position?: { x: number; y: number };
    authorId?: string;
}): Card {
    requireRoom(roomId);
    if (attachedTo && requireCard(attachedTo).roomId !== roomId) {
        throw new RoomError(`"${attachedTo}" is not in this room.`);
    }
    const named = title?.trim() || undefined;
    const needUrl = () => {
        if (!url?.trim()) throw new RoomError('Give it an address.');
        return url.trim();
    };
    const parent = () => {
        if (!attachedTo) {
            throw new RoomError(
                'Add it from the chat or document it belongs to.',
            );
        }
        return attachedTo;
    };
    let card: Card;
    switch (kind) {
        case 'chat':
            card = createChat({
                roomId,
                title: named ?? 'New chat',
                authorId,
            });
            break;
        case 'note':
            card = createNote({ roomId, text: named ?? '', authorId });
            break;
        case 'sketch':
            card = createSketch({ roomId, title: named, authorId });
            break;
        case 'document':
            card = createDocument({
                roomId,
                title: named ?? 'Untitled document',
                blocks: [],
                authorId,
            });
            break;
        case 'board':
            card = createBoard({
                roomId,
                title: named ?? 'New board',
                key: boardKey(named),
                authorId,
            });
            break;
        case 'video':
            card = createVideo({
                roomId,
                attachedTo,
                url: needUrl(),
                title: named ?? 'Video',
                authorId,
            });
            break;
        case 'web': {
            const address = needUrl();
            card = createWebPage({
                roomId,
                attachedTo,
                url: address,
                title:
                    named ??
                    new URL(normalizeWebUrl(address) ?? 'https://web.page')
                        .hostname,
                authorId,
            });
            break;
        }
        case 'image':
            card = createImage({
                roomId,
                attachedTo,
                url: needUrl(),
                title: named ?? 'Image',
                authorId,
            });
            break;
        case 'chart':
            card = createChart({
                attachedTo: parent(),
                title: named ?? 'New chart',
                chart: 'bar',
                unit: 'count',
                caption: 'Sample numbers: ask an agent to chart real ones.',
                points: [
                    { label: 'A', value: 3 },
                    { label: 'B', value: 5 },
                    { label: 'C', value: 4 },
                ],
                authorId,
            });
            break;
        case 'pull-request':
            card = openPullRequest({
                chatId: parent(),
                title: named ?? 'New change',
                branch: `change-${crypto.randomUUID().slice(0, 6)}`,
                draft: true,
                authorId,
            });
            break;
        case 'ui':
            card = createUi({
                roomId,
                title: named ?? 'Room at a glance',
                spec: STARTER_UI,
                authorId,
            });
            break;
    }
    if (position && !attachedTo) {
        requireRoom(roomId).arrangement.positions[card.id] = {
            ...position,
        };
    }
    return card;
}

/** A board's issue prefix from its name: its first letters, or "NEW". */
function boardKey(title: string | undefined): string {
    const letters = (title ?? '')
        .split(/\s+/)
        .map((word) => word.replace(/[^a-z]/gi, '')[0] ?? '')
        .join('')
        .toUpperCase();
    return letters.length >= 2 ? letters.slice(0, 5) : 'NEW';
}

/** Sticks a note in a room; `color` is from the card palette. */
export function createNote({
    roomId,
    text = '',
    color,
    authorId = AGENT_ID,
}: {
    roomId: string;
    text?: string;
    color?: CardColor;
    authorId?: string;
}): NoteCard {
    requireRoom(roomId);
    requireKnownPeople([authorId]);
    const note: NoteCard = {
        kind: 'note',
        id: newId('note'),
        roomId,
        title: noteTitle(text),
        text,
        createdById: authorId,
        updatedAt: new Date().toISOString(),
    };
    storeCard(note);
    if (color) requireRoom(roomId).arrangement.colors[note.id] = color;
    return structuredClone(note);
}

/**
 * Deletes a card for everyone, with the cards hanging under it (a chat's
 * pull requests and charts, a document's media: they hang from nothing
 * without it), and everything that points at them: links, their place in
 * the arrangement, saved views' framing, and issues' links. Documents that
 * mention a deleted card keep the mention, shown struck through. Returns
 * the ids that went, the card's first.
 */
export function deleteCard(cardId: string): string[] {
    const card = requireCard(cardId);
    const data = store();
    const gone = [card.id, ...hangingUnder(card.id, data.cards)];
    const isGone = (id: string) => gone.includes(id);

    data.cards = data.cards.filter((candidate) => !isGone(candidate.id));
    data.relations = data.relations.filter(
        (relation) => !isGone(relation.from) && !isGone(relation.to),
    );
    const arrangement = requireRoom(card.roomId).arrangement;
    arrangement.stack = arrangement.stack.filter((id) => !isGone(id));
    arrangement.locked = arrangement.locked.filter((id) => !isGone(id));
    for (const id of gone) {
        delete arrangement.colors[id];
        delete arrangement.positions[id];
    }
    for (const view of data.views) {
        if (view.cardIds)
            view.cardIds = view.cardIds.filter((id) => !isGone(id));
    }
    for (const board of data.cards) {
        if (board.kind !== 'board') continue;
        for (const issue of board.issues) {
            issue.links = issue.links.filter((id) => !isGone(id));
        }
    }
    return gone;
}

/**
 * Gives a card a new title (not a sticky note: its first line names it).
 * Leaves `updatedAt` alone, since that's a document's version and a new
 * title shouldn't read as someone rewriting it.
 */
export function renameCard({
    cardId,
    title,
}: {
    cardId: string;
    title: string;
}): Card {
    const card = requireCard(cardId);
    if (!isRenamable(card)) {
        throw new RoomError(
            'A sticky note is named by its first line; rewrite its text instead.',
        );
    }
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > TITLE_MAX) {
        throw new RoomError(`A title needs 1 to ${TITLE_MAX} characters.`);
    }
    card.title = trimmed;
    return structuredClone(card);
}

/**
 * Resizes a card (chats, so far: `RESIZE_LIMITS`), clamped to its kind's
 * limits; that size becomes where it rests. `position` is its top left
 * corner afterwards, saved when given, since dragging a left or top edge
 * moves the card. Leaves `updatedAt` alone, as renaming does.
 */
export function resizeCard({
    cardId,
    size,
    position,
}: {
    cardId: string;
    size: CardSize;
    position?: { x: number; y: number };
}): Card {
    const card = requireCard(cardId);
    if (!isResizable(card.kind) || card.kind !== 'chat') {
        throw new RoomError(`A ${card.kind} card can't be resized.`);
    }
    card.size = clampSize(card.kind, size);
    if (position) {
        arrangementOf(cardId).positions[cardId] = {
            x: Math.round(position.x),
            y: Math.round(position.y),
        };
    }
    return structuredClone(card);
}

/** Rewrites a note (the last writer wins: notes are quick, not documents). */
export function updateNote({
    noteId,
    text,
}: {
    noteId: string;
    text: string;
}): NoteCard {
    const note = requireCard(noteId);
    if (note.kind !== 'note') {
        throw new RoomError(`"${noteId}" is a ${note.kind}, not a note.`);
    }
    note.text = text;
    note.title = noteTitle(text);
    note.updatedAt = nextTimestamp(note.updatedAt);
    return structuredClone(note);
}

/** Starts a blank sketch. */
export function createSketch({
    roomId,
    title = 'Untitled sketch',
    strokes = [],
    authorId = AGENT_ID,
}: {
    roomId: string;
    title?: string;
    strokes?: SketchStroke[];
    authorId?: string;
}): SketchCard {
    requireRoom(roomId);
    requireKnownPeople([authorId]);
    const sketch: SketchCard = {
        kind: 'sketch',
        id: newId('sketch'),
        roomId,
        title,
        strokes,
        createdById: authorId,
        updatedAt: new Date().toISOString(),
    };
    storeCard(sketch);
    return structuredClone(sketch);
}

/**
 * A UI card a person adds by hand: this room's numbers at a glance,
 * bound live, for an agent (or anyone) to build on.
 */
const STARTER_UI: UiCard['spec'] = {
    root: 'main',
    elements: {
        main: {
            type: 'Stack',
            props: { direction: null, gap: 'md' },
            children: ['heading', 'metrics', 'hint'],
        },
        heading: {
            type: 'Heading',
            props: { text: 'This room', level: null },
        },
        metrics: {
            type: 'Grid',
            props: { columns: 3 },
            children: ['cards', 'issues', 'prs'],
        },
        cards: {
            type: 'Metric',
            props: {
                label: 'Cards',
                value: { $state: '/stats/cards' },
                hint: null,
            },
        },
        issues: {
            type: 'Metric',
            props: {
                label: 'Open issues',
                value: { $state: '/stats/openIssues' },
                hint: null,
            },
        },
        prs: {
            type: 'Metric',
            props: {
                label: 'Open pull requests',
                value: { $state: '/stats/openPullRequests' },
                hint: null,
            },
        },
        hint: {
            type: 'Text',
            props: {
                text: 'Ask the Concierge to turn this into the view you need: a triage list, a review queue, a launch tracker.',
                muted: true,
            },
        },
    },
};

function requireUiSpec(spec: unknown): UiCard['spec'] {
    const problems = uiSpecProblems(spec);
    if (problems.length > 0) {
        throw new RoomError(
            `That UI spec doesn't work: ${problems.slice(0, 5).join('; ')}`,
        );
    }
    return structuredClone(spec as UiCard['spec']);
}

/** Puts a UI card (a json-render spec over the UI catalog) in a room. */
export function createUi({
    roomId,
    title,
    spec,
    authorId = AGENT_ID,
}: {
    roomId: string;
    title: string;
    spec: unknown;
    authorId?: string;
}): UiCard {
    requireRoom(roomId);
    requireKnownPeople([authorId]);
    const ui: UiCard = {
        kind: 'ui',
        id: newId('ui'),
        roomId,
        title: title.slice(0, TITLE_MAX),
        spec: requireUiSpec(spec),
        createdById: authorId,
        updatedAt: new Date().toISOString(),
    };
    storeCard(ui);
    return structuredClone(ui);
}

/** Replaces a UI card's spec (last writer wins, like a sketch). */
export function updateUi({
    uiId,
    spec,
    title,
}: {
    uiId: string;
    spec: unknown;
    title?: string;
}): UiCard {
    const ui = requireCard(uiId);
    if (ui.kind !== 'ui') {
        throw new RoomError(`"${uiId}" is a ${ui.kind}, not a UI card.`);
    }
    ui.spec = requireUiSpec(spec);
    if (title) ui.title = title.slice(0, TITLE_MAX);
    ui.updatedAt = nextTimestamp(ui.updatedAt);
    return structuredClone(ui);
}

/** Replaces a sketch's strokes (the whole drawing, as the canvas holds it). */
export function updateSketch({
    sketchId,
    strokes,
}: {
    sketchId: string;
    strokes: SketchStroke[];
}): SketchCard {
    const sketch = requireCard(sketchId);
    if (sketch.kind !== 'sketch') {
        throw new RoomError(`"${sketchId}" is a ${sketch.kind}, not a sketch.`);
    }
    sketch.strokes = strokes;
    sketch.updatedAt = nextTimestamp(sketch.updatedAt);
    return structuredClone(sketch);
}

/** Points a browser card somewhere else (its address bar). */
export function navigateWebPage({
    webId,
    url,
}: {
    webId: string;
    url: string;
}): WebCard {
    const card = requireCard(webId);
    if (card.kind !== 'web') {
        throw new RoomError(`"${webId}" is a ${card.kind}, not a web page.`);
    }
    const normalized = normalizeWebUrl(url);
    if (!normalized) {
        throw new RoomError(`"${url}" is not an https web address.`);
    }
    card.url = normalized;
    card.updatedAt = new Date().toISOString();
    return structuredClone(card);
}

export function createBoard({
    roomId,
    title,
    key,
    authorId = AGENT_ID,
}: {
    roomId: string;
    title: string;
    key: string;
    authorId?: string;
}): BoardCard {
    requireKnownPeople([authorId]);
    const board: BoardCard = {
        kind: 'board',
        id: newId('board'),
        roomId: requireRoom(roomId).id,
        title,
        key: key.toUpperCase(),
        issues: [],
        createdById: authorId,
        updatedAt: new Date().toISOString(),
    };
    storeCard(board);
    return structuredClone(board);
}

/** Files an issue on a board, numbered after its highest issue. */
export function createIssue({
    boardId,
    title,
    status = 'todo',
    priority = 'none',
    assigneeId,
    links = [],
    authorId = AGENT_ID,
}: {
    boardId: string;
    title: string;
    status?: IssueStatus;
    priority?: IssuePriority;
    assigneeId?: string;
    links?: string[];
    authorId?: string;
}): Issue {
    const board = requireBoard(boardId);
    requireKnownPeople([authorId, ...(assigneeId ? [assigneeId] : [])]);
    links.forEach(requireCard);
    const numbers = board.issues.map((existing) =>
        Number(existing.identifier.split('-').at(-1)),
    );
    const number = Math.max(0, ...numbers) + 1;
    const created: Issue = {
        id: newId('issue'),
        identifier: `${board.key}-${number}`,
        title,
        status,
        priority,
        ...(assigneeId ? { assigneeId } : {}),
        links,
        createdById: authorId,
        updatedAt: new Date().toISOString(),
    };
    board.issues.push(created);
    board.updatedAt = created.updatedAt;
    return structuredClone(created);
}

/**
 * Moves an issue (to another column and/or a position in its column), or
 * changes its priority. `index` is its place in the column, top = 0.
 */
export function updateIssue({
    boardId,
    issueId,
    status,
    priority,
    index,
    title,
    description,
    assigneeId,
}: {
    boardId: string;
    issueId: string;
    status?: IssueStatus;
    priority?: IssuePriority;
    index?: number;
    title?: string;
    description?: string;
    /** `null` unassigns. */
    assigneeId?: string | null;
}): Issue {
    const board = requireBoard(boardId);
    const found = board.issues.find(
        (candidate) =>
            candidate.id === issueId || candidate.identifier === issueId,
    );
    if (!found) {
        throw new RoomError(`No issue "${issueId}" on "${board.title}".`);
    }
    if (priority) found.priority = priority;
    if (title?.trim()) found.title = title.trim();
    if (description !== undefined) found.description = description;
    if (assigneeId === null) delete found.assigneeId;
    else if (assigneeId !== undefined) {
        requireKnownPeople([assigneeId]);
        found.assigneeId = assigneeId;
    }
    found.updatedAt = new Date().toISOString();
    if (status !== undefined || index !== undefined) {
        board.issues = placeIssue(
            board.issues,
            found.id,
            status ?? found.status,
            index,
        );
    }
    board.updatedAt = found.updatedAt;
    return structuredClone(
        board.issues.find((candidate) => candidate.id === found.id)!,
    );
}

/** Adds a comment to an issue's activity. */
export function commentOnIssue({
    boardId,
    issueId,
    text,
    authorId = AGENT_ID,
}: {
    boardId: string;
    issueId: string;
    text: string;
    authorId?: string;
}): IssueComment {
    const board = requireBoard(boardId);
    const found = board.issues.find(
        (candidate) =>
            candidate.id === issueId || candidate.identifier === issueId,
    );
    if (!found) {
        throw new RoomError(`No issue "${issueId}" on "${board.title}".`);
    }
    requireKnownPeople([authorId]);
    const comment: IssueComment = {
        id: newId('comment'),
        authorId,
        text,
        at: new Date().toISOString(),
    };
    found.comments = [...(found.comments ?? []), comment];
    found.updatedAt = comment.at;
    board.updatedAt = comment.at;
    return structuredClone(comment);
}

/** Saves where cards were moved to (ids not in the room are skipped). */
export function moveCards(positions: Record<string, { x: number; y: number }>) {
    const ids = new Set(store().cards.map((card) => card.id));
    for (const [id, position] of Object.entries(positions)) {
        if (ids.has(id)) {
            arrangementOf(id).positions[id] = { x: position.x, y: position.y };
        }
    }
}

/** A room's cards as a fresh load lays them out, with what's locked. */
export function getLayout(roomId: string) {
    const { arrangement } = requireRoom(roomId);
    const cards = store().cards.filter((card) => card.roomId === roomId);
    const byId = new Map(cards.map((card) => [card.id, card]));
    return currentLayout(cards, arrangement.positions).map((spot) => {
        const card = byId.get(spot.id)!;
        const parentId = parentIdOf(card);
        return {
            id: spot.id,
            kind: spot.kind,
            title: card.title,
            x: Math.round(spot.x),
            y: Math.round(spot.y),
            width: spot.width,
            height: spot.height,
            ...(parentId && byId.has(parentId) && { hangsUnder: parentId }),
            ...(arrangement.locked.includes(spot.id) && { locked: true }),
        };
    });
}

/**
 * Lays out groups of cards in a room (`arrangeGroups`) and saves where
 * they land, starting at `origin` (else where the cards it moves begin).
 * Open canvases slide to it (`layoutVersion`).
 */
export function arrangeCards({
    roomId,
    groups,
    direction,
    origin,
    gap,
    rest,
}: {
    roomId: string;
    groups: string[][];
    direction: ArrangeDirection;
    origin?: { x: number; y: number };
    gap?: number;
    rest?: 'append' | 'leave';
}) {
    const room = requireRoom(roomId);
    const cards = store().cards.filter((card) => card.roomId === roomId);
    const ids = new Set(cards.map((card) => card.id));
    const unknown = groups.flat().filter((id) => !ids.has(id));
    if (unknown.length > 0) {
        throw new RoomError(
            `Not in this room: ${unknown.join(', ')}. See list_cards.`,
        );
    }
    const { arrangement } = room;
    const laid = arrangeGroups(cards, groups, {
        direction,
        origin: { x: 0, y: 0 },
        gap,
        locked: new Set(arrangement.locked),
        rest,
    });
    // Start where the cards it moves are now, unless told otherwise.
    const start =
        origin ??
        topLeftOf(
            currentLayout(cards, arrangement.positions).filter(
                (spot) => spot.id in laid.positions,
            ),
        );
    const shift = (spot: { x: number; y: number }) => ({
        x: Math.round(spot.x + start.x),
        y: Math.round(spot.y + start.y),
    });
    for (const [id, spot] of Object.entries(laid.positions)) {
        arrangement.positions[id] = shift(spot);
    }
    arrangement.layoutVersion = (arrangement.layoutVersion ?? 0) + 1;
    return {
        moved: Object.keys(laid.positions).length,
        skipped: laid.skipped,
        groups: laid.groups.map((box) => ({ ...box, ...shift(box) })),
    };
}

/**
 * Moves one card to a spot (its top-left corner), taking whatever hangs
 * under it along. Open canvases slide to it.
 */
export function moveCard({
    cardId,
    x,
    y,
}: {
    cardId: string;
    x: number;
    y: number;
}) {
    const card = requireCard(cardId);
    const room = requireRoom(card.roomId);
    const { arrangement } = room;
    if (arrangement.locked.includes(cardId)) {
        throw new RoomError(`"${card.title}" is locked in place.`);
    }
    const cards = store().cards.filter(
        (candidate) => candidate.roomId === room.id,
    );
    const now = new Map(
        currentLayout(cards, arrangement.positions).map((spot) => [
            spot.id,
            spot,
        ]),
    );
    const from = now.get(cardId)!;
    const dx = x - from.x;
    const dy = y - from.y;
    for (const id of [cardId, ...hangingUnder(cardId, cards)]) {
        const spot = now.get(id)!;
        arrangement.positions[id] = { x: spot.x + dx, y: spot.y + dy };
    }
    arrangement.layoutVersion = (arrangement.layoutVersion ?? 0) + 1;
    return { id: card.id, kind: card.kind, title: card.title, x, y };
}

/**
 * Arrange: lays the room out by links (`clusterLayout`: each cluster of
 * linked cards a block around its hub, blocks packed in rows) and saves
 * every new spot, so the layout is shared and survives reloads. Open
 * canvases slide to it (`layoutVersion`). Locked cards stay put.
 */
export function arrangeByLinks(roomId: string) {
    const { arrangement } = requireRoom(roomId);
    const cards = store().cards.filter((card) => card.roomId === roomId);
    const ids = new Set(cards.map((card) => card.id));
    const positions = clusterLayout(
        cards,
        store().relations.filter(
            (relation) => ids.has(relation.from) && ids.has(relation.to),
        ),
        { locked: new Set(arrangement.locked) },
    );
    arrangement.positions = { ...arrangement.positions, ...positions };
    arrangement.layoutVersion = (arrangement.layoutVersion ?? 0) + 1;
    return positions;
}

/** Forgets moved cards, except locked ones, which stay put. */
export function resetCardPositions(roomId: string) {
    const arrangement = requireRoom(roomId).arrangement;
    arrangement.positions = Object.fromEntries(
        Object.entries(arrangement.positions).filter(([id]) =>
            arrangement.locked.includes(id),
        ),
    );
}

/**
 * Locks a card where it is (it can't be dragged, and Arrange leaves it), or
 * unlocks it. `position` is where it is now on the canvas, saved so it
 * stays there through Arrange and reloads.
 */
export function setCardLocked(
    cardId: string,
    locked: boolean,
    position?: { x: number; y: number },
) {
    const arrangement = arrangementOf(cardId);
    arrangement.locked = arrangement.locked.filter((id) => id !== cardId);
    if (locked) {
        arrangement.locked.push(cardId);
        if (position) arrangement.positions[cardId] = { ...position };
    }
}
