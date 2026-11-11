import { markdownToPortableText } from '~/lib/portable-text';
import {
    AGENT_ID,
    noteTitle,
    type BoardCard,
    type ChatCard,
    type DocumentCard,
    type ImageCard,
    type Issue,
    type IssuePriority,
    type IssueStatus,
    type NoteCard,
    type PullRequestCard,
    type SketchCard,
    type SketchStroke,
    type Relation,
    type Card,
    type WebCard,
    type CardColor,
} from '~/lib/room';

/**
 * Demo content for two of the seed's rooms, beside the Atlas launch
 * room the store builds itself:
 *
 * - Launch retro: a developer's room, agents at work. Each agent chat has
 *   the pull request it opened and the docs page it worked from hanging
 *   under it, plus retro sticky notes and a summary document.
 * - Brand refresh (in the Design space): a designer's room, two issue
 *   boards, reference images, color and component pages, and notes.
 */

export type SeedRoom = {
    cards: Card[];
    relations: Relation[];
    /** Palette colors by card id (notes take theirs from here). */
    colors: Partial<Record<string, CardColor>>;
};

const DAY = '2026-10-23';

function at(time: string) {
    return `${DAY}T${time}:00Z`;
}

function note(
    roomId: string,
    id: string,
    text: string,
    createdById = 'dev',
): NoteCard {
    return {
        kind: 'note',
        id,
        roomId,
        title: noteTitle(text),
        text,
        createdById,
        updatedAt: at('16:00'),
    };
}

/** Points around an ellipse, for seeded sketches. */
function ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    steps = 36,
): number[] {
    return Array.from({ length: steps + 1 }, (_, i) => {
        const angle = (i / steps) * Math.PI * 2;
        return [
            Math.round((cx + rx * Math.cos(angle)) * 10) / 10,
            Math.round((cy + ry * Math.sin(angle)) * 10) / 10,
        ];
    }).flat();
}

function issue(
    key: string,
    number: number,
    title: string,
    status: IssueStatus,
    priority: IssuePriority,
    assigneeId?: string,
): Issue {
    return {
        id: `issue-${key.toLowerCase()}-${number}`,
        identifier: `${key}-${number}`,
        title,
        status,
        priority,
        ...(assigneeId ? { assigneeId } : {}),
        links: [],
        createdById: 'maya',
        updatedAt: at('11:00'),
    };
}

/** One agent's thread: the chat, the PR it opened, the page it read. */
function agentThread({
    roomId,
    id,
    title,
    messages,
    pr,
    page,
}: {
    roomId: string;
    id: string;
    title: string;
    messages: [author: string, text: string, time: string][];
    pr: Omit<
        PullRequestCard,
        'kind' | 'roomId' | 'chatId' | 'authorId' | 'createdById' | 'base'
    >;
    page: { id: string; title: string; url: string };
}): { cards: Card[]; relations: Relation[] } {
    const chat: ChatCard = {
        kind: 'chat',
        id,
        roomId,
        title,
        participantIds: [AGENT_ID, 'dev', 'maya'],
        createdById: AGENT_ID,
        messages: messages.map(([authorId, text, time], index) => ({
            id: `${id}-m${index + 1}`,
            authorId,
            text,
            sentAt: at(time),
        })),
    };
    const pull: PullRequestCard = {
        kind: 'pull-request',
        roomId,
        chatId: id,
        base: 'main',
        authorId: AGENT_ID,
        createdById: AGENT_ID,
        ...pr,
    };
    const web: WebCard = {
        kind: 'web',
        id: page.id,
        roomId,
        title: page.title,
        url: page.url,
        attachedTo: id,
        createdById: AGENT_ID,
        updatedAt: at('10:00'),
    };
    return {
        cards: [chat, pull, web],
        relations: [
            { id: `${id}-r-pr`, from: id, to: pull.id, label: 'opened' },
            { id: `${id}-r-web`, from: id, to: web.id, label: 'references' },
        ],
    };
}

export function launchRetroRoom(roomId: string): SeedRoom {
    const threads = [
        agentThread({
            roomId,
            id: 'chat-agent-checkout',
            title: 'Agent: flaky checkout test',
            messages: [
                [
                    'dev',
                    'The checkout e2e failed twice on main today.',
                    '09:02',
                ],
                [
                    AGENT_ID,
                    'It sleeps 500ms before the payment frame loads. Swapping the timer for a wait on the frame being ready.',
                    '09:04',
                ],
                [AGENT_ID, 'Opened #493. 40 reruns green.', '09:31'],
            ],
            pr: {
                id: 'pr-checkout-wait',
                number: 493,
                title: 'Wait for the payment frame instead of a timer',
                repo: 'acme/atlas',
                branch: 'agent/checkout-wait',
                status: 'open',
                summary:
                    'Replaces a fixed sleep with a wait on the frame, which removes the flake.',
                checks: { passed: 14, failed: 0, pending: 0 },
                files: [
                    {
                        path: 'tests/checkout.spec.ts',
                        additions: 12,
                        deletions: 5,
                    },
                ],
                updatedAt: at('09:31'),
            },
            page: {
                id: 'web-playwright-waiting',
                title: 'Playwright: actionability',
                url: 'https://playwright.dev/docs/actionability',
            },
        }),
        agentThread({
            roomId,
            id: 'chat-agent-router',
            title: 'Agent: React Router 8 upgrade',
            messages: [
                ['dev', 'Can you take the React Router 8 upgrade?', '10:10'],
                [
                    AGENT_ID,
                    'On it. Middleware is always on now, so the future flag goes, and context moves to a RouterContextProvider.',
                    '10:12',
                ],
                [
                    AGENT_ID,
                    'Draft is up as #494. Typecheck is clean; one route test still fails on the new request URL.',
                    '11:40',
                ],
            ],
            pr: {
                id: 'pr-router-8',
                number: 494,
                title: 'Upgrade to React Router 8',
                repo: 'acme/atlas',
                branch: 'agent/react-router-8',
                status: 'draft',
                summary:
                    'Removes the v8 future flags, adopts RouterContextProvider, and updates the route types.',
                checks: { passed: 9, failed: 1, pending: 2 },
                files: [
                    { path: 'package.json', additions: 4, deletions: 4 },
                    {
                        path: 'react-router.config.ts',
                        additions: 2,
                        deletions: 6,
                    },
                    { path: 'app/root.tsx', additions: 18, deletions: 11 },
                ],
                updatedAt: at('11:40'),
            },
            page: {
                id: 'web-react-router',
                title: 'React Router: installation',
                url: 'https://reactrouter.com/start/framework/installation',
            },
        }),
        agentThread({
            roomId,
            id: 'chat-agent-search',
            title: 'Agent: faster search',
            messages: [
                ['maya', 'Search feels slow on big workspaces.', '13:00'],
                [
                    AGENT_ID,
                    'The index rebuilds on every keystroke. Caching it per room and rebuilding only when cards change: 38ms down to 2ms on 2,000 cards.',
                    '13:20',
                ],
                ['dev', 'Merged. Nice.', '14:05'],
            ],
            pr: {
                id: 'pr-search-cache',
                number: 495,
                title: 'Cache the search index per room',
                repo: 'acme/atlas',
                branch: 'agent/search-cache',
                status: 'merged',
                summary:
                    'Builds the search index once per room and reuses it until a card changes.',
                checks: { passed: 16, failed: 0, pending: 0 },
                files: [
                    { path: 'app/lib/search.ts', additions: 41, deletions: 9 },
                    {
                        path: 'app/lib/search.test.ts',
                        additions: 28,
                        deletions: 0,
                    },
                ],
                updatedAt: at('14:05'),
            },
            page: {
                id: 'web-bun-docs',
                title: 'Bun docs',
                url: 'https://bun.sh/docs',
            },
        }),
    ];

    const summary: DocumentCard = {
        kind: 'document',
        id: 'doc-retro-notes',
        roomId,
        title: 'Launch retro notes',
        authorId: 'dev',
        createdById: 'dev',
        updatedAt: at('15:30'),
        blocks: markdownToPortableText(`
Three agents worked the launch follow-ups today, each in its own chat with a pull request to show for it.

## Shipped

- [Search index cache](card:pr-search-cache) is merged: search is instant again on big workspaces.
- [The checkout flake](card:chat-agent-checkout) has a fix waiting for review.

## In flight

- [React Router 8](card:pr-router-8) is a draft with one failing test.

## Next time

- Agents open **draft** pull requests until a person has looked.
`),
    };

    const notes = [
        note(
            roomId,
            'note-retro-good',
            'Went well: agents shipped three PRs in a day',
        ),
        note(
            roomId,
            'note-retro-change',
            'To change: a flaky e2e test blocked two merges',
        ),
        note(
            roomId,
            'note-retro-try',
            'Try: agents open draft PRs by default',
            'maya',
        ),
        note(
            roomId,
            'note-retro-ask',
            'Ask: who reviews agent PRs on Fridays?',
            AGENT_ID,
        ),
    ];

    return {
        cards: [
            ...threads.flatMap((thread) => thread.cards),
            summary,
            ...notes,
        ],
        relations: [
            ...threads.flatMap((thread) => thread.relations),
            {
                id: 'r-retro-search',
                from: 'doc-retro-notes',
                to: 'chat-agent-search',
                label: 'covers',
            },
        ],
        colors: {
            'note-retro-good': 'emerald',
            'note-retro-change': 'rose',
            'note-retro-try': 'sky',
            'note-retro-ask': 'amber',
        },
    };
}

export function brandRefreshRoom(roomId: string): SeedRoom {
    const reviews: BoardCard = {
        kind: 'board',
        id: 'board-design-reviews',
        roomId,
        title: 'Design reviews',
        key: 'DSN',
        createdById: 'maya',
        updatedAt: at('11:00'),
        issues: [
            {
                ...issue(
                    'DSN',
                    1,
                    'Pick the new accent color',
                    'in_review',
                    'high',
                    'maya',
                ),
                description:
                    'Narrowed to two warm oranges. Both need to pass 4.5:1 on white and on the dark card, and still read as Atlas next to the old blue.',
                links: ['image-color-wheel'],
                comments: [
                    {
                        id: 'comment-dsn-1-1',
                        authorId: AGENT_ID,
                        text: 'Checked both against the dark card: the deeper orange passes at 4.8:1, the lighter one fails at 3.9:1.',
                        at: at('12:10'),
                    },
                    {
                        id: 'comment-dsn-1-2',
                        authorId: 'maya',
                        text: 'Going with the deeper one. Rosa, can you mock it on the pricing page?',
                        at: at('12:40'),
                    },
                ],
            },
            issue(
                'DSN',
                2,
                'Type scale for headings',
                'in_progress',
                'medium',
                'maya',
            ),
            issue('DSN', 3, 'Icon set audit', 'todo', 'low'),
            issue('DSN', 4, 'Dark mode contrast pass', 'backlog', 'high'),
            issue('DSN', 5, 'Logo lockups', 'done', 'medium', 'maya'),
        ],
    };
    const assets: BoardCard = {
        kind: 'board',
        id: 'board-launch-assets',
        roomId,
        title: 'Launch assets',
        key: 'AST',
        createdById: 'maya',
        updatedAt: at('11:30'),
        issues: [
            issue(
                'AST',
                1,
                'Hero illustration',
                'in_progress',
                'urgent',
                'maya',
            ),
            issue('AST', 2, 'Social cards (6 sizes)', 'todo', 'medium'),
            issue(
                'AST',
                3,
                'Product screenshots, light and dark',
                'todo',
                'high',
            ),
            issue('AST', 4, 'Email header', 'backlog', 'low'),
            issue('AST', 5, 'Favicon set', 'done', 'low', 'rosa'),
        ],
    };
    const brief: DocumentCard = {
        kind: 'document',
        id: 'doc-brand-brief',
        roomId,
        title: 'Brand refresh brief',
        authorId: 'maya',
        createdById: 'maya',
        updatedAt: at('09:30'),
        blocks: markdownToPortableText(`
A warmer, calmer Atlas for launch: the same shapes, a new accent, and type that reads well at every size.

## Principles

- **Contrast first**: every pairing passes 4.5:1, light and dark.
- One accent, used sparingly.
- Shapes from the Bauhaus [moodboard](card:image-bauhaus): simple, geometric, honest.

## Where things are

- Reviews run on [Design reviews](card:board-design-reviews).
- Assets for launch week live on [Launch assets](card:board-launch-assets).
`),
    };
    const image = (
        id: string,
        title: string,
        src: string,
        alt: string,
    ): ImageCard => ({
        kind: 'image',
        id,
        roomId,
        title,
        src,
        alt,
        animated: false,
        attachedTo: 'doc-brand-brief',
        createdById: 'maya',
        updatedAt: at('10:00'),
    });
    const images = [
        image(
            'image-bauhaus',
            'Moodboard: Bauhaus Dessau',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Bauhaus_Dessau.jpg/960px-Bauhaus_Dessau.jpg',
            'The Bauhaus building in Dessau: white walls, glass, and strong horizontal lines.',
        ),
        image(
            'image-color-wheel',
            'Accent exploration',
            'https://upload.wikimedia.org/wikipedia/commons/3/38/BYR_color_wheel.svg',
            'A color wheel running through red, yellow, and blue.',
        ),
        image(
            'image-type-anatomy',
            'Type anatomy',
            'https://upload.wikimedia.org/wikipedia/commons/3/39/Typography_Line_Terms.svg',
            'A line of type with its baseline, x-height, cap height, ascender, and descender marked.',
        ),
    ];
    const page = (id: string, title: string, url: string): WebCard => ({
        kind: 'web',
        id,
        roomId,
        title,
        url,
        createdById: AGENT_ID,
        updatedAt: at('12:00'),
    });
    const pages = [
        page(
            'web-radix-colors',
            'Color scales',
            'https://www.radix-ui.com/colors',
        ),
        page('web-coss-ui', 'Component library', 'https://coss.com/ui'),
    ];
    const notes = [
        note(
            roomId,
            'note-design-contrast',
            'Keep contrast at 4.5:1 or better, everywhere',
            'maya',
        ),
        note(
            roomId,
            'note-design-accent',
            'Accent: warmer than last year',
            'maya',
        ),
        note(
            roomId,
            'note-design-dark',
            'Ask: design dark mode first?',
            AGENT_ID,
        ),
    ];

    const logoStrokes: SketchStroke[] = [
        // The mark: two overlapping circles.
        { color: '#000080', size: 6, points: ellipse(170, 190, 90, 90) },
        { color: '#ff0000', size: 6, points: ellipse(250, 190, 90, 90) },
        // A wordmark scribble and its underline.
        {
            color: '#000000',
            size: 6,
            points: [
                380, 200, 395, 160, 410, 200, 425, 160, 440, 200, 455, 170,
            ],
        },
        { color: '#000000', size: 6, points: [470, 200, 470, 160, 500, 180] },
        { color: '#808080', size: 3, points: [380, 230, 560, 228] },
        // "Warmer!" arrow toward the red circle.
        {
            color: '#ff00ff',
            size: 3,
            points: [330, 330, 300, 290, 290, 270],
        },
        { color: '#ff00ff', size: 3, points: [280, 285, 290, 270, 305, 280] },
    ];
    const logoSketch: SketchCard = {
        kind: 'sketch',
        id: 'sketch-logo-doodle',
        roomId,
        title: 'Logo doodle',
        strokes: logoStrokes,
        createdById: 'maya',
        updatedAt: at('15:00'),
    };

    return {
        cards: [
            brief,
            reviews,
            assets,
            ...images,
            ...pages,
            ...notes,
            logoSketch,
        ],
        relations: [
            ...images.map((card) => ({
                id: `r-${card.id}`,
                from: 'doc-brand-brief',
                to: card.id,
                label: 'image',
            })),
            {
                id: 'r-brief-reviews',
                from: 'doc-brand-brief',
                to: 'board-design-reviews',
                label: 'tracked on',
            },
        ],
        colors: {
            'note-design-contrast': 'violet',
            'note-design-accent': 'amber',
            'note-design-dark': 'sky',
            'board-design-reviews': 'violet',
        },
    };
}
