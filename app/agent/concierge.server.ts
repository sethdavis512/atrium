import { createAnthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import type { Memory } from '@mastra/memory';
import {
    tool,
    type InferUITools,
    type Tool,
    type UIDataTypes,
    type UIMessage,
} from 'ai';
import { z } from 'zod';
import { env } from '~/lib/env.server';
import {
    markdownToPortableText,
    portableTextToMarkdown,
} from '~/lib/portable-text';
import { createRoomSearch } from '~/lib/search';
import { ARRANGE_DIRECTIONS } from '~/lib/arrange';
import { sketchStrokesSchema } from '~/lib/sketch';
import {
    AGENT_ID,
    ISSUE_PRIORITIES,
    ISSUE_STATUSES,
    SKETCH_COLORS,
    SKETCH_SIZE,
    TITLE_MAX,
    CARD_COLOR_NAMES,
    type ChatCard,
    type Card,
} from '~/lib/room';
import {
    RoomError,
    allCards,
    appendToDocument,
    getWorkspace,
    arrangeCards,
    createBoard,
    createChart,
    createDocument,
    createImage,
    createIssue,
    createNote,
    createSketch,
    createUi,
    updateUi,
    createVideo,
    createWebPage,
    getCard,
    getLayout,
    linkCards,
    listPeople,
    moveCard,
    openPullRequest,
    renameCard,
    setCardColor,
    updateIssue,
} from '~/models/room.server';
import { markChanged } from '~/models/room-events.server';
import { pictureOf } from '~/models/card-picture.server';
import { uiGuide, uiSpecInputSchema } from '~/lib/ui-card';

/**
 * The live agent behind agent chats (`isAgentChat`): Claude, run by Mastra,
 * with tools that read the whole workspace and act on the chat's own room,
 * and the workspace's memory (`app/mastra/workspace-memory.ts`). Whatever it
 * makes lands on the canvas like anything an MCP agent makes, and its replies
 * are saved in the chat with their tool calls (`parts`), so the transcript
 * survives reloads and other tabs see it.
 */

export const AGENT_MODEL = 'claude-sonnet-5-5';

/** Bounds on one turn: tool-call rounds and words. */
export const AGENT_LIMITS = {
    steps: 12,
    maxOutputTokens: 4096,
    /** Earlier messages the agent reads, newest last. */
    history: 40,
} as const;

/** A card a tool made or changed, as the chat shows it. */
export type CardRef = { id: string; kind: Card['kind']; title: string };

function ref(card: Card): CardRef {
    return { id: card.id, kind: card.kind, title: card.title };
}

const markdownSchema = z
    .string()
    .max(20000)
    .describe(
        'Markdown: paragraphs, ## and ### headings, - and 1. lists, > quotes, | pipe | tables | (a `| --- |` line under the header row), **bold**, *italic*, `code`, [text](https://...) links. Point at another card with [text](card:<cardId>), or put a card for one on a line of its own with ![](card:<cardId>).',
    );

/** Where a card lives, for cards found outside this room. */
function placeOf(roomId: string) {
    for (const space of getWorkspace().spaces) {
        const room = space.rooms.find(({ id }) => id === roomId);
        if (room) return { room: room.name, space: space.name };
    }
    return { room: roomId, space: '' };
}

const attachedToSchema = z
    .string()
    .optional()
    .describe(
        'A chat or document in this room to hang it under. Defaults to this chat.',
    );

/** Tools scoped to one chat and the room it's on. */
export function conciergeTools({
    roomId,
    chatId,
}: {
    roomId: string;
    chatId: string;
}) {
    /** A card in this room; the agent never reaches into others. */
    function onRoom(cardId: string): Card {
        const card = getCard(cardId);
        if (card.roomId !== roomId) {
            throw new RoomError(
                `"${cardId}" is in another room; you can only work on this one.`,
            );
        }
        return card;
    }

    /** Placed cards get a "made" link from this chat, so you can see where they came from. */
    function madeHere<T extends Card>(card: T): CardRef {
        linkCards({ from: chatId, to: card.id, label: 'made' });
        return ref(card);
    }

    function boardOf(boardId: string) {
        const board = onRoom(boardId);
        if (board.kind !== 'board') {
            throw new RoomError(
                `"${boardId}" is a ${board.kind}, not a board.`,
            );
        }
        return board;
    }

    return {
        list_spaces: tool({
            description:
                'Every space in the workspace and the rooms in each: id, name, description, and how many cards. Other rooms are yours to read, not change.',
            inputSchema: z.object({}),
            execute: () => ({
                spaces: getWorkspace().spaces.map((space) => ({
                    id: space.id,
                    name: space.name,
                    description: space.description,
                    rooms: space.rooms.map((room) => ({
                        id: room.id,
                        name: room.name,
                        description: room.description,
                        cardCount: room.cardCount,
                    })),
                })),
            }),
        }),
        list_cards: tool({
            description:
                'Every card in a room (this one unless you name another): id, kind, and title. Call it before referring to cards you have not seen this turn.',
            inputSchema: z.object({
                roomId: z
                    .string()
                    .optional()
                    .describe('Another room to list (see list_spaces).'),
            }),
            execute: ({ roomId: listed = roomId }) => ({
                cards: allCards()
                    .filter((card) => card.roomId === listed)
                    .map(ref),
            }),
        }),
        read_card: tool({
            description:
                "One card in full, in any room: a document's Markdown, a chat's recent messages, a board's issues, a chart's numbers, and so on.",
            inputSchema: z.object({ cardId: z.string() }),
            execute: ({ cardId }) => {
                const card = getCard(cardId);
                return card.roomId === roomId
                    ? readable(card)
                    : { ...readable(card), ...placeOf(card.roomId) };
            },
        }),
        look_at_card: tool({
            description:
                'See a sketch or an image card as a picture, in any room: what it shows, which read_card cannot give you (a sketch there is only stroke coordinates). Look before you describe, build on, or make cards from a drawing, wireframe, diagram, screenshot, or photo.',
            inputSchema: z.object({ cardId: z.string() }),
            // The transcript keeps just which card; the picture goes to
            // the model only, drawn from the card as it is now.
            execute: ({ cardId }) => {
                const card = getCard(cardId);
                pictureOf(card);
                return ref(card);
            },
            toModelOutput: ({ output }) => {
                const card = output as CardRef;
                const picture = pictureOf(getCard(card.id));
                const caption = {
                    type: 'text' as const,
                    text: `${card.kind} "${card.title}" (${card.id})${'alt' in picture && picture.alt ? `, described as: ${picture.alt}` : ''}`,
                };
                return {
                    type: 'content',
                    value:
                        'url' in picture
                            ? [caption, { type: 'image-url', url: picture.url }]
                            : [
                                  caption,
                                  {
                                      type: 'image-data',
                                      data: picture.data,
                                      mediaType: picture.mediaType,
                                  },
                              ],
                };
            },
        }),
        search: tool({
            description:
                "Finds cards by what's in them (titles, messages, document text, issues, captions), in this room or, with everywhere, across every space. Every word must match; prefixes and small typos are fine.",
            inputSchema: z.object({
                query: z.string().min(1).max(200),
                everywhere: z
                    .boolean()
                    .optional()
                    .describe('Search every room in the workspace.'),
            }),
            execute: ({ query, everywhere = false }) => {
                const people = new Map(
                    listPeople().map((person) => [person.id, person.name]),
                );
                const cards = allCards().filter(
                    (card) => everywhere || card.roomId === roomId,
                );
                const roomOf = new Map(
                    cards.map((card) => [card.id, card.roomId]),
                );
                const { hits } = createRoomSearch(cards, {
                    nameOf: (id) => people.get(id),
                }).search(query, 10);
                return {
                    hits: hits.map(({ cardId, kind, title, snippet }) => {
                        const hit = { id: cardId, kind, title, snippet };
                        const at = roomOf.get(cardId)!;
                        return at === roomId ? hit : { ...hit, ...placeOf(at) };
                    }),
                };
            },
        }),
        create_document: tool({
            description:
                'Writes a new document card in the room. Use it for anything longer than a couple of paragraphs: briefs, plans, notes, specs, summaries.',
            inputSchema: z.object({
                title: z.string().min(1).max(160),
                markdown: markdownSchema,
            }),
            execute: ({ title, markdown }) =>
                madeHere(
                    createDocument({
                        roomId,
                        title,
                        blocks: markdownToPortableText(markdown),
                    }),
                ),
        }),
        append_to_document: tool({
            description: 'Adds Markdown to the end of a document.',
            inputSchema: z.object({
                documentId: z.string(),
                markdown: markdownSchema.min(1),
            }),
            execute: ({ documentId, markdown }) => {
                onRoom(documentId);
                return ref(
                    appendToDocument({
                        documentId,
                        blocks: markdownToPortableText(markdown),
                    }),
                );
            },
        }),
        create_chart: tool({
            description:
                'A small line or bar chart, hanging under this chat (or the document it explains). Labels run along the x axis; values go up the y axis.',
            inputSchema: z.object({
                title: z.string().min(1).max(80),
                chart: z.enum(['line', 'bar']),
                unit: z
                    .string()
                    .min(1)
                    .max(30)
                    .describe('What the values count, e.g. "signups".'),
                caption: z.string().max(200).optional(),
                points: z
                    .array(
                        z.object({
                            label: z.string().min(1).max(20),
                            value: z.number().finite(),
                        }),
                    )
                    .min(2)
                    .max(24),
                attachedTo: attachedToSchema,
            }),
            execute: ({ attachedTo = chatId, ...input }) => {
                onRoom(attachedTo);
                return ref(createChart({ ...input, attachedTo }));
            },
        }),
        create_board: tool({
            description:
                'Starts an issue board (like a Linear project) with status columns. Add issues with create_issue.',
            inputSchema: z.object({
                title: z.string().min(1).max(80),
                key: z
                    .string()
                    .regex(/^[A-Z]{2,5}$/)
                    .describe(
                        'Issue prefix, 2 to 5 capital letters, e.g. "WEB".',
                    ),
            }),
            execute: ({ title, key }) =>
                madeHere(createBoard({ roomId, title, key })),
        }),
        create_issue: tool({
            description: 'Files an issue on a board.',
            inputSchema: z.object({
                boardId: z.string(),
                title: z.string().min(1).max(160),
                description: z.string().max(4000).optional(),
                status: z.enum(ISSUE_STATUSES).optional(),
                priority: z.enum(ISSUE_PRIORITIES).optional(),
                assigneeId: z
                    .string()
                    .optional()
                    .describe('A person id: me, maya, dev, rosa, or agent.'),
            }),
            execute: ({ boardId, description, ...input }) => {
                boardOf(boardId);
                const issue = createIssue({ boardId, ...input });
                if (description) {
                    updateIssue({ boardId, issueId: issue.id, description });
                }
                return {
                    ...ref(getCard(boardId)),
                    issue: { identifier: issue.identifier, title: issue.title },
                };
            },
        }),
        update_issue: tool({
            description:
                'Changes an issue: move it to another status, reprioritize, retitle, describe, or (re)assign it (null unassigns).',
            inputSchema: z.object({
                boardId: z.string(),
                issue: z
                    .string()
                    .describe('The issue id or identifier, e.g. "WEB-3".'),
                status: z.enum(ISSUE_STATUSES).optional(),
                priority: z.enum(ISSUE_PRIORITIES).optional(),
                title: z.string().min(1).max(160).optional(),
                description: z.string().max(4000).optional(),
                assigneeId: z.string().nullable().optional(),
            }),
            execute: ({ boardId, issue, ...changes }) => {
                const board = boardOf(boardId);
                const found = board.issues.find(
                    (candidate) =>
                        candidate.id === issue ||
                        candidate.identifier === issue,
                );
                if (!found) {
                    throw new RoomError(`No issue "${issue}" on that board.`);
                }
                updateIssue({ boardId, issueId: found.id, ...changes });
                return {
                    ...ref(getCard(boardId)),
                    issue: { identifier: found.identifier, title: found.title },
                };
            },
        }),
        add_note: tool({
            description:
                'Pins a sticky note: a short thought, reminder, or idea. Its first line is its title.',
            inputSchema: z.object({
                text: z.string().min(1).max(500),
                color: z.enum(CARD_COLOR_NAMES).optional(),
            }),
            execute: (input) => madeHere(createNote({ roomId, ...input })),
        }),
        add_sketch: tool({
            description: `Draws a sketch, MS Paint style, on a ${SKETCH_SIZE.width}x${SKETCH_SIZE.height} white paper (origin top left). Each stroke is a color (${SKETCH_COLORS.join(', ')}), a brush size (2 to 24), and points as a flat [x1, y1, x2, y2, ...] list. Keep drawings simple: a few dozen strokes at most.`,
            inputSchema: z.object({
                title: z.string().min(1).max(TITLE_MAX),
                strokes: sketchStrokesSchema.max(80),
            }),
            execute: (input) => madeHere(createSketch({ roomId, ...input })),
        }),
        create_ui: tool({
            description: `Puts a UI card in this room: a small live interface (a dashboard, a triage list, a review queue, a tracker) you compose from a fixed set of components, bound to the room's own data so it stays current. Use it when someone wants to see or act in the room's work at a glance, not for prose (that's a document).\n\n${uiGuide()}`,
            inputSchema: z.object({
                title: z.string().min(1).max(TITLE_MAX),
                spec: uiSpecInputSchema,
            }),
            execute: (input) => madeHere(createUi({ roomId, ...input })),
        }),
        update_ui: tool({
            description:
                "Replaces a UI card's spec (and optionally its title) in this room: read_card first to see the current spec. Same rules as create_ui.",
            inputSchema: z.object({
                uiId: z.string(),
                title: z.string().min(1).max(TITLE_MAX).optional(),
                spec: uiSpecInputSchema,
            }),
            execute: ({ uiId, ...input }) => {
                onRoom(uiId);
                return ref(updateUi({ uiId, ...input }));
            },
        }),
        add_web_page: tool({
            description:
                'Opens a web page (https) in a card, hanging under this chat. Many sites refuse to be framed; prefer docs, wikis, and blogs.',
            inputSchema: z.object({
                url: z.string().url(),
                title: z.string().min(1).max(120),
                attachedTo: attachedToSchema,
            }),
            execute: ({ attachedTo = chatId, ...input }) => {
                onRoom(attachedTo);
                return ref(createWebPage({ ...input, attachedTo }));
            },
        }),
        add_video: tool({
            description:
                'Adds a YouTube video (any YouTube link or a video id) that plays in its own card, hanging under this chat. Only use videos you are confident exist.',
            inputSchema: z.object({
                url: z.string().min(1).max(500),
                title: z.string().min(1).max(120),
                attachedTo: attachedToSchema,
            }),
            execute: ({ attachedTo = chatId, ...input }) => {
                onRoom(attachedTo);
                return ref(createVideo({ ...input, attachedTo }));
            },
        }),
        add_image: tool({
            description:
                'Adds an image or GIF from an https address, hanging under this chat. Only use addresses you are confident exist (Wikimedia Commons upload.wikimedia.org files are a good source).',
            inputSchema: z.object({
                url: z.string().url(),
                title: z.string().min(1).max(120),
                alt: z.string().max(300).describe('What the picture shows.'),
                attachedTo: attachedToSchema,
            }),
            execute: ({ attachedTo = chatId, ...input }) => {
                onRoom(attachedTo);
                return ref(createImage({ ...input, attachedTo }));
            },
        }),
        open_pull_request: tool({
            description:
                'Opens a (mock) pull request for a code change worked out in this chat. It hangs under the chat.',
            inputSchema: z.object({
                title: z.string().min(1).max(160),
                branch: z.string().min(1).max(120),
                summary: z.string().max(1000).optional(),
                files: z
                    .array(
                        z.object({
                            path: z.string().min(1),
                            additions: z.number().int().min(0),
                            deletions: z.number().int().min(0),
                        }),
                    )
                    .max(30)
                    .optional(),
                draft: z.boolean().optional(),
            }),
            execute: (input) => ref(openPullRequest({ chatId, ...input })),
        }),
        get_layout: tool({
            description:
                "Where every card sits in the room: x, y (top-left, in canvas pixels), width, height, what it hangs under, and whether it's locked. Read it before arranging or moving cards.",
            inputSchema: z.object({}),
            execute: () => ({ cards: getLayout(roomId) }),
        }),
        arrange_cards: tool({
            description:
                'Lays cards out in groups so the room reads at a glance: each group a column of cards (groups side by side, left to right) or a row (groups top to bottom). Group what belongs together (a chat with what it produced, a plan with its board, references with each other) and order groups the way the work flows. To title a group, add a sticky note and put it first. Cards hanging under another (charts, pull requests, pages, videos, images) travel with it; locked cards stay put. Cards no group names go in a last group unless rest is "leave". Everyone\'s canvas slides to the new layout.',
            inputSchema: z.object({
                groups: z
                    .array(z.array(z.string()).min(1))
                    .min(1)
                    .max(20)
                    .describe('Card ids, one list per group, in order.'),
                direction: z.enum(ARRANGE_DIRECTIONS),
                rest: z.enum(['append', 'leave']).optional(),
            }),
            execute: (input) => arrangeCards({ roomId, ...input }),
        }),
        move_card: tool({
            description:
                'Moves one card so its top-left corner is at x, y (canvas pixels; see get_layout for sizes), taking what hangs under it along.',
            inputSchema: z.object({
                cardId: z.string(),
                x: z.number().finite(),
                y: z.number().finite(),
            }),
            execute: ({ cardId, x, y }) => {
                onRoom(cardId);
                return moveCard({ cardId: cardId, x, y });
            },
        }),
        link_cards: tool({
            description:
                'Draws a labeled link from one card in this room to another, e.g. "references" or "next".',
            inputSchema: z.object({
                from: z.string(),
                to: z.string(),
                label: z.string().min(1).max(40),
            }),
            execute: ({ from, to, label }) => {
                onRoom(from);
                onRoom(to);
                linkCards({ from, to, label });
                return {
                    from: ref(getCard(from)),
                    to: ref(getCard(to)),
                    label,
                };
            },
        }),
        rename_card: tool({
            description: 'Gives a card (not a sticky note) a new title.',
            inputSchema: z.object({
                cardId: z.string(),
                title: z.string().min(1).max(TITLE_MAX),
            }),
            execute: ({ cardId, title }) => {
                onRoom(cardId);
                renameCard({ cardId: cardId, title });
                return ref(getCard(cardId));
            },
        }),
        set_card_color: tool({
            description:
                "Sets a card's border color (a sticky note's fill), or clears it with null.",
            inputSchema: z.object({
                cardId: z.string(),
                color: z.enum(CARD_COLOR_NAMES).nullable(),
            }),
            execute: ({ cardId, color }) => {
                onRoom(cardId);
                setCardColor(cardId, color);
                return ref(getCard(cardId));
            },
        }),
    };
}

/** A card as the agent reads it: documents in Markdown, chats trimmed. */
function readable(card: Card) {
    switch (card.kind) {
        case 'document': {
            const { blocks, ...rest } = card;
            return { ...rest, markdown: portableTextToMarkdown(blocks) };
        }
        case 'chat':
            return {
                ...card,
                messages: card.messages
                    .slice(-AGENT_LIMITS.history)
                    .map(({ authorId, text }) => ({ authorId, text })),
            };
        case 'sketch':
            return { ...card, strokes: `${card.strokes.length} strokes` };
        default:
            return card;
    }
}

function instructions(chat: ChatCard, { remembers }: { remembers: boolean }) {
    const cards = allCards()
        .filter((card) => card.roomId === chat.roomId)
        .slice(0, 80)
        .map((card) => `- ${card.id} (${card.kind}): ${card.title}`)
        .join('\n');
    return `You are the Concierge, working with a teammate in the chat "${chat.title}" (id ${chat.id}) on a shared canvas of cards. Cards are chats, documents, charts, issue boards, sticky notes, sketches, web pages, videos, images, pull requests, and UI cards (live interfaces over the room's data: dashboards, triage lists, review queues).

Sketches and image cards are pictures: call look_at_card to see one before you describe it or build from it (a wireframe into an issue board, a whiteboard photo into a document). read_card only gives a sketch's stroke coordinates.

Make things, don't just describe them: when the teammate asks for a plan, a summary, notes, numbers, tasks, a diagram, or references, call the tools so the work lands on the canvas as cards, then reply briefly with what you made. Long writing belongs in a document, not the chat. Several cards in one turn are fine when the request calls for them (a board and its issues, a doc and its chart). When the canvas gets busy, or when asked to tidy or organize it, read get_layout and arrange_cards into groups that make sense together.

You can read the whole workspace: list_spaces, then list_cards, read_card, or search with everywhere in other rooms, when a question reaches beyond this room (another team's plans, a customer's account). You can only make or change cards in this room; say where you found anything from elsewhere. Card links ([title](card:<cardId>)) only work for cards in this room: name a card from elsewhere in plain text with its room, e.g. "Northwind account plan (on Northwind)".
${
    remembers
        ? `
Your working memory is shared by every agent chat in every space of this workspace. When you learn a durable fact about the company (who someone is or what they own, a customer's situation, a project's goal or date, a decision, what a term means), save it there, briefly. Don't save chit-chat, things that matter only in this chat, or anything secret (passwords, keys, personal data beyond names and roles). Use what you remember, and say so when it matters.
`
        : ''
}
Replies are short chat messages in Markdown. Mention a card in this room that you made or used as [its title](card:<cardId>) so it shows as a chip. Ask a quick question when a request is truly ambiguous; otherwise make reasonable choices and say what you chose.

Today is ${new Date().toDateString()}. People (each message is prefixed with who wrote it): ${listPeople()
        .map((person) =>
            person.id === AGENT_ID
                ? `${person.id} (you)`
                : `${person.id} (${person.name}, ${person.role === 'Member' ? 'signed in' : person.role})`,
        )
        .join(', ')}.

This chat is in the room ${placeOf(chat.roomId).room} (id ${chat.roomId}) in the ${placeOf(chat.roomId).space} space. Cards in it now:
${cards || '(none yet besides this chat)'}`;
}

/**
 * AI SDK tools as Mastra tools, under the same names, so the reply's tool
 * parts (`tool-<name>`) are the ones the chat renders.
 */
function asMastraTools(tools: Record<string, Tool>) {
    return Object.fromEntries(
        Object.entries(tools).map(([name, aiTool]) => [
            name,
            createTool({
                id: name,
                description: aiTool.description ?? name,
                inputSchema: aiTool.inputSchema as z.ZodType<
                    Record<string, unknown>
                >,
                // Pictures (look_at_card) reach the model through this.
                ...(aiTool.toModelOutput && {
                    toModelOutput: (output: unknown) =>
                        aiTool.toModelOutput!({
                            toolCallId: name,
                            input: undefined,
                            output,
                        }),
                }),
                execute: async (input) => {
                    try {
                        return await aiTool.execute!(input, {
                            toolCallId: name,
                            messages: [],
                        });
                    } finally {
                        // Cards it made or moved reach every open canvas
                        // as it goes, not only when the turn ends.
                        markChanged();
                    }
                },
            }),
        ]),
    );
}

/**
 * One turn's agent. With the workspace memory (null while its database is
 * unreachable) it also reads and updates the workspace's working memory.
 */
export function createConcierge(chat: ChatCard, memory: Memory | null) {
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return new Agent({
        id: 'concierge',
        name: 'Concierge',
        model: anthropic(AGENT_MODEL),
        instructions: instructions(chat, { remembers: Boolean(memory) }),
        tools: asMastraTools(
            conciergeTools({ roomId: chat.roomId, chatId: chat.id }),
        ),
        ...(memory && { memory }),
        defaultOptions: {
            maxSteps: AGENT_LIMITS.steps,
            modelSettings: { maxOutputTokens: AGENT_LIMITS.maxOutputTokens },
        },
    });
}

export type ConciergeUIMessage = UIMessage<
    unknown,
    UIDataTypes,
    InferUITools<ReturnType<typeof conciergeTools>>
>;

/**
 * The chat so far as the agent reads it: its own replies (with their tool
 * calls) as the assistant, everyone else as the user, each line named,
 * since several people can share one agent chat.
 */
export function chatHistory(chat: ChatCard): UIMessage[] {
    const names = new Map(
        listPeople().map((person) => [person.id, person.name]),
    );
    return chat.messages.slice(-AGENT_LIMITS.history).map((message) =>
        message.authorId === AGENT_ID
            ? {
                  id: message.id,
                  role: 'assistant',
                  parts: message.parts ?? [
                      { type: 'text', text: message.text },
                  ],
              }
            : {
                  id: message.id,
                  role: 'user',
                  parts: [
                      {
                          type: 'text',
                          text: `${names.get(message.authorId) ?? message.authorId}: ${message.text}`,
                      },
                  ],
              },
    );
}

/**
 * A failed tool call's message, as the chat shows it. Mastra reports tool
 * errors as a serialized error object (`TOOL_EXECUTION_FAILED`, with the
 * thrown error as its `cause`); the chat wants the thrown message alone.
 */
export function readableToolError(errorText: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(errorText);
    } catch {
        return errorText;
    }
    if (!parsed || typeof parsed !== 'object') return errorText;
    const error = parsed as {
        message?: unknown;
        cause?: { message?: unknown };
        details?: { errorMessage?: unknown };
    };
    for (const message of [
        error.cause?.message,
        error.details?.errorMessage,
        error.message,
    ]) {
        if (typeof message === 'string' && message.trim()) {
            return message.replace(/^Error:\s*/, '');
        }
    }
    return errorText;
}

/** The words of a reply, for search and anything that shows text alone. */
export function replyText(message: UIMessage): string {
    return message.parts
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n\n')
        .trim();
}
