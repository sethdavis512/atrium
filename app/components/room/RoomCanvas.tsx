import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type MouseEvent as ReactMouseEvent,
    type Dispatch,
    type SetStateAction,
} from 'react';
import {
    Link,
    useFetcher,
    useFetchers,
    useNavigate,
    useSearchParams,
    useSubmit,
} from 'react-router';
import {
    Background,
    ControlButton,
    Controls,
    Flow,
    MiniMap,
    Panel,
    useEdgesState,
    useFlow,
    useFlowState,
    useNodesState,
    type FlowEdge,
    type NodeChange,
    type EdgeTypes,
    type NodeTypes,
    type Viewport,
} from '@sethdavis512/trellis';
import { ArrowLeftIcon, LayoutGridIcon } from 'lucide-react';
import { cx } from 'cva.config';
import { clusterLayout } from '~/lib/arrange';
import type { CanvasSettings } from '~/lib/canvas-settings';
import { createRoomSearch } from '~/lib/search';
import { CanvasMenu, NOT_EMPTY } from './CanvasMenu';
import { AddCardMenu } from './AddCardMenu';
import { PresenceAvatars } from './PresenceAvatars';
import { CanvasSettingsButton, useCanvasSettings } from './CanvasSettings';
import { Button } from '~/components/ui/button';
import {
    sizeOf,
    completeStack,
    focusFrame,
    isCardColor,
    placeNewCard,
    hangSlot,
    hangingUnder,
    parentIdOf,
    placeCards,
    restack,
    type CardSize,
    type Insets,
    type Person,
    type PullRequestCard,
    type Room,
    type Card,
    type CardColor,
} from '~/lib/room';
import { BoardCardView, type BoardNode } from './BoardCardView';
import { VideoCardView, type VideoNode } from './VideoCardView';
import { WebCardView, type WebNode } from './WebCardView';
import { ImageCardView, type ImageNode } from './ImageCardView';
import { NoteCardView, type NoteNode } from './NoteCardView';
import { FloatingEdge } from './FloatingEdge';
import { DELETE_FETCHER_KEY, DeleteCardProvider } from './DeleteCard';
import { SketchCardView, type SketchNode } from './SketchCardView';
import { UiCardView, type UiNode } from './UiCardView';
import { ChartCardView, type ChartNode } from './ChartCardView';
import { ChatCardView, type ChatNode } from './ChatCardView';
import { DocumentCardView, type DocumentNode } from './DocumentCardView';
import {
    FilterBar,
    NO_FILTER,
    matchesFilter,
    type RoomFilter,
} from './FilterBar';
import {
    PullRequestCardView,
    type PullRequestNode,
} from './PullRequestCardView';
import {
    FocusedCardContext,
    RenamingContext,
    ResizingContext,
    StackingContext,
    CardsContext,
    CardColorContext,
    RoomPeopleContext,
    useRoomLinks,
} from './room-context';

type RoomNode =
    | ChatNode
    | DocumentNode
    | PullRequestNode
    | ChartNode
    | BoardNode
    | VideoNode
    | WebNode
    | ImageNode
    | NoteNode
    | SketchNode
    | UiNode;

const edgeTypes = { floating: FloatingEdge } as EdgeTypes;

const nodeTypes = {
    chat: ChatCardView,
    document: DocumentCardView,
    'pull-request': PullRequestCardView,
    chart: ChartCardView,
    board: BoardCardView,
    video: VideoCardView,
    web: WebCardView,
    image: ImageCardView,
    note: NoteCardView,
    sketch: SketchCardView,
    ui: UiCardView,
} as NodeTypes;

/**
 * Canvas left showing around a focused card, in px. The top keeps a row
 * for the "Back to canvas" button.
 */
const FOCUS_INSETS: Insets = { top: 60, right: 12, bottom: 12, left: 12 };
const FLY_DURATION_MS = 500;
/** Cards (and edges) the filter leaves out. Still there, still clickable. */
const DIMMED = 'opacity-25 saturate-50';
/** Grows and shrinks a card in step with the view's flight. */
const RESIZE_TRANSITION =
    'motion-safe:transition-[opacity,width,height] motion-safe:duration-500 motion-safe:ease-out';
/** Cards sliding (and resizing) into place while Arrange runs. */
const ARRANGE_TRANSITION =
    'motion-safe:transition-[opacity,width,height,transform] motion-safe:duration-500 motion-safe:ease-out';
/** Dimming and undimming as filters change. */
const FADE_TRANSITION =
    'motion-safe:transition-opacity motion-safe:duration-200';
const ARRANGE_MS = 500;

/**
 * Inline, because Trellis's stylesheet is unlayered and outranks Tailwind's
 * layered utilities, so a class can't override its variables.
 */
const CANVAS_STYLE = { '--trellis-bg': 'var(--canvas)' } as CSSProperties;

function toNode(card: Card, position: { x: number; y: number }): RoomNode {
    const base = {
        id: card.id,
        position,
        ...sizeOf(card),
        ariaLabel: card.title,
    };
    switch (card.kind) {
        case 'chat':
            return { ...base, type: 'chat', data: { card } };
        case 'document':
            return { ...base, type: 'document', data: { card } };
        case 'pull-request':
            return { ...base, type: 'pull-request', data: { card } };
        case 'chart':
            return { ...base, type: 'chart', data: { card } };
        case 'board':
            return { ...base, type: 'board', data: { card } };
        case 'video':
            return { ...base, type: 'video', data: { card } };
        case 'web':
            return { ...base, type: 'web', data: { card } };
        case 'image':
            return { ...base, type: 'image', data: { card } };
        case 'note':
            return { ...base, type: 'note', data: { card } };
        case 'sketch':
            return { ...base, type: 'sketch', data: { card } };
        case 'ui':
            return { ...base, type: 'ui', data: { card } };
    }
}

/**
 * The cards as they open: the tidy layout (`placeCards`), except the
 * ones someone dragged, which open where they were left (saved positions).
 */
function toNodes(room: Room): RoomNode[] {
    const saved = room.arrangement.positions;
    const byId = new Map(room.cards.map((card) => [card.id, card]));
    // The tidy layout, with cards someone moved where they left them.
    return placeCards(room.cards).map(({ id, x, y }) =>
        toNode(byId.get(id)!, saved[id] ?? { x, y }),
    );
}

/**
 * Brings fresh loader data onto the canvas: existing cards get their new
 * content but keep where (and how big) they are, new cards are placed right
 * of everything, and deleted ones go.
 */
function syncNodes(nodes: RoomNode[], room: Room): RoomNode[] {
    const current = new Map(nodes.map((node) => [node.id, node]));
    const synced: RoomNode[] = [];
    for (const card of room.cards) {
        const node = current.get(card.id);
        if (node) {
            // A card resized somewhere else (an agent, another tab) takes its
            // new size, unless it isn't resting: focused, or being resized.
            const was = sizeOf(node.data.card);
            const now = sizeOf(card);
            const resting =
                node.width === was.width && node.height === was.height;
            const resized =
                was.width !== now.width || was.height !== now.height;
            synced.push({
                ...node,
                ...(resting && resized ? now : {}),
                ariaLabel: card.title,
                data: { card },
            } as RoomNode);
        }
    }
    for (const card of room.cards) {
        if (current.has(card.id)) continue;
        // A card that arrives with a saved spot (a duplicate, placed
        // beside its original) opens there.
        const saved = room.arrangement.positions[card.id];
        if (saved) {
            synced.push(toNode(card, saved));
            continue;
        }
        // A new pull request or chart hangs under its parent, below any
        // cards already hanging there.
        const parentId = parentIdOf(card);
        const parent = parentId
            ? synced.find((node) => node.id === parentId)
            : undefined;
        const position = parent
            ? hangSlot(
                  {
                      ...parent.position,
                      height: sizeOf(parent.data.card).height,
                  },
                  synced
                      .filter(
                          (node) => parentIdOf(node.data.card) === parent.id,
                      )
                      .map((node) => sizeOf(node.data.card).height),
              )
            : placeNewCard(
                  synced.map((node) => ({
                      x: node.position.x,
                      kind: node.type!,
                      width: sizeOf(node.data.card).width,
                  })),
                  card.kind,
              );
        synced.push(toNode(card, position));
    }
    return synced;
}

/**
 * The saved arrangement (stacking order and border colors, from the loader)
 * with any change still on its way to the server applied on top, so a click
 * shows at once and, once saved, survives reloads.
 */
function useArrangement(room: Room) {
    const links = useRoomLinks();
    const submit = useSubmit();
    const fetchers = useFetchers();

    let stack = completeStack(
        room.arrangement.stack,
        room.cards.map((card) => card.id),
    );
    const colors = { ...room.arrangement.colors };
    const locked = new Set(room.arrangement.locked);
    for (const { formData } of fetchers) {
        if (!formData) continue;
        const cardId = String(formData.get('cardId') ?? '');
        const intent = formData.get('intent');
        if (intent === 'restack') {
            const to = formData.get('to') === 'back' ? 'back' : 'front';
            stack = restack(stack, cardId, to);
        } else if (intent === 'set-color') {
            const color = String(formData.get('color') ?? '');
            if (isCardColor(color)) colors[cardId] = color;
            else delete colors[cardId];
        } else if (intent === 'set-lock') {
            if (formData.get('locked') === 'true') locked.add(cardId);
            else locked.delete(cardId);
        }
    }

    const actions = useMemo(() => {
        const save = (fields: Record<string, string>) =>
            submit(fields, {
                method: 'post',
                action: links.action,
                navigate: false,
                fetcherKey: `arrange:${fields.intent}:${fields.cardId}`,
            });
        return {
            bringToFront: (cardId: string) =>
                save({ intent: 'restack', cardId, to: 'front' }),
            sendToBack: (cardId: string) =>
                save({ intent: 'restack', cardId, to: 'back' }),
            setColor: (cardId: string, color: CardColor | null) =>
                save({ intent: 'set-color', cardId, color: color ?? '' }),
            setLocked: (
                cardId: string,
                isLocked: boolean,
                position?: { x: number; y: number },
            ) =>
                save({
                    intent: 'set-lock',
                    cardId,
                    locked: String(isLocked),
                    ...(position
                        ? { x: String(position.x), y: String(position.y) }
                        : {}),
                }),
        };
    }, [submit, links.action]);

    return { stack, colors, locked, ...actions };
}

function toEdges(room: Room): FlowEdge[] {
    const cards = new Map(room.cards.map((card) => [card.id, card]));
    const pairs = new Set(
        room.relations.map((relation) => `${relation.from}>${relation.to}`),
    );
    return room.relations.map((relation) => {
        const target = cards.get(relation.to);
        // A card hanging under its parent (a PR under its chat, a chart
        // under its chat or document) is fed from the parent's bottom, with
        // no label: the column already says it, and Trellis draws labels
        // above cards, so one would float over the cards above.
        const hangs = target && parentIdOf(target) === relation.from;
        return {
            id: relation.id,
            source: relation.from,
            target: relation.to,
            // Hanging cards are fed from the parent's bottom into their top;
            // other links leave from the right, where people drag them
            // from, and arrive on the left.
            sourceHandle: hangs ? 'bottom' : 'link',
            targetHandle: hangs ? undefined : 'in',
            type: hangs ? 'smoothstep' : 'floating',
            // A link back the other way too: each bows to its own side.
            data: {
                bothWays: pairs.has(`${relation.to}>${relation.from}`),
            },
            // Trellis portals labels away from their edge, so the label
            // carries the link's id itself (right-click it to remove).
            label: hangs ? undefined : (
                <span data-edge-id={relation.id}>{relation.label}</span>
            ),
            markerEnd: 'arrowclosed',
        };
    });
}

/** Every card at its resting size, except `focused`, which takes `size`. */
function resize(
    nodes: RoomNode[],
    focused: { id: string; size: { width: number; height: number } } | null,
    animate: boolean,
): RoomNode[] {
    return nodes.map((node) => {
        const size =
            focused && node.id === focused.id
                ? focused.size
                : sizeOf(node.data.card);
        return {
            ...node,
            ...size,
            className: animate ? RESIZE_TRANSITION : undefined,
        };
    });
}

type ViewTarget = {
    center: { x: number; y: number };
    zoom: number;
    cardIds?: string[];
};

/** Room around everything on first load, in px: clears the filter bar. */
const INITIAL_FIT_PADDING = 80;

/** Room around cards a view frames, in px. */
const VIEW_FIT_PADDING = 48;

/**
 * Follows the URL. Focusing a card remembers the view, grows its card to
 * fill the canvas (minus `FOCUS_INSETS`), and frames it at zoom 1; it keeps
 * filling the canvas as the canvas resizes. A saved view flies the canvas to
 * its center and zoom, or, for one that frames cards, fits those cards
 * where they are now (again on every visit, so picking it twice works).
 * Leaving both shrinks any focused card back and flies to the remembered
 * view. The first move after the canvas loads jumps instead of animating, so
 * a deep link opens in place.
 */
function useFocusView(
    focusedId: string | undefined,
    view: ViewTarget | undefined,
    visitKey: string,
    setNodes: Dispatch<SetStateAction<RoomNode[]>>,
) {
    const flow = useFlow();
    // The canvas's own test for "placed and fitted": moving earlier would
    // be undone by its initial fit.
    const ready = useFlowState((s) => s.ready && s.size.width > 0);
    const canvasWidth = useFlowState((s) => s.size.width);
    const canvasHeight = useFlowState((s) => s.size.height);
    const returnView = useRef<Viewport | null>(null);
    const focusedLast = useRef(false);
    const settled = useRef(false);
    // Plain numbers, so fresh loader data (every poll) doesn't re-fly.
    const viewX = view?.center.x;
    const viewY = view?.center.y;
    const viewZoom = view?.zoom;
    const viewCards = view?.cardIds?.join(' ');

    useEffect(() => {
        if (!ready) return;
        const animate = settled.current;
        const duration = animate ? FLY_DURATION_MS : 0;
        settled.current = true;

        const node = focusedId ? flow.getNode(focusedId) : undefined;
        if (focusedId && node) {
            returnView.current ??= flow.getViewport();
            const { size, viewport } = focusFrame(
                { width: canvasWidth, height: canvasHeight },
                node.position,
                FOCUS_INSETS,
            );
            setNodes((all) => resize(all, { id: focusedId, size }, animate));
            flow.setViewport(viewport, { duration });
            focusedLast.current = true;
            return;
        }

        if (focusedLast.current) {
            setNodes((all) => resize(all, null, animate));
            focusedLast.current = false;
        }
        const framed = viewCards?.split(' ').filter((id) => flow.getNode(id));
        if (framed?.length) {
            returnView.current = null;
            flow.fitView({
                nodes: framed,
                padding: VIEW_FIT_PADDING,
                maxZoom: 1.5,
                duration,
            });
        } else if (viewX !== undefined && viewY !== undefined && viewZoom) {
            returnView.current = null;
            flow.setCenter(viewX, viewY, { zoom: viewZoom, duration });
        } else if (returnView.current) {
            flow.setViewport(returnView.current, { duration });
            returnView.current = null;
        }
    }, [
        focusedId,
        viewX,
        viewY,
        viewZoom,
        viewCards,
        visitKey,
        ready,
        canvasWidth,
        canvasHeight,
        flow,
        setNodes,
    ]);
}

type Box = CardSize & { x: number; y: number };

/**
 * Resizing cards by their edges (`ResizeEdges`): the card follows the
 * pointer on the canvas, then its box is saved on release (`resize-card`).
 * Cards hanging under it move with its bottom and left edges, so the column
 * stays lined up under it and never overlaps it.
 */
function useCardResizing(
    room: Room,
    setNodes: Dispatch<SetStateAction<RoomNode[]>>,
    locked: Set<string>,
) {
    const links = useRoomLinks();
    const flow = useFlow();
    const submit = useSubmit();
    const start = useRef<{
        box: Box;
        hanging: Map<string, { x: number; y: number }>;
    } | null>(null);

    return useMemo(() => {
        // Where the hanging cards go for a card at `box`.
        const hangingAt = (box: Box) => {
            const from = start.current;
            if (!from) return new Map<string, { x: number; y: number }>();
            const dx = box.x - from.box.x;
            const dy = box.y + box.height - (from.box.y + from.box.height);
            return new Map(
                [...from.hanging].map(([id, spot]) => [
                    id,
                    { x: spot.x + dx, y: spot.y + dy },
                ]),
            );
        };
        const save = (fields: Record<string, string>, key: string) =>
            void submit(fields, {
                method: 'post',
                action: links.action,
                navigate: false,
                fetcherKey: key,
            });

        return {
            begin: (cardId: string) => {
                const box = flow.getNodeBox(cardId);
                if (!box) return null;
                const hanging = new Map<string, { x: number; y: number }>();
                for (const id of hangingUnder(cardId, room.cards)) {
                    const node = flow.getNode(id);
                    if (node && !locked.has(id)) {
                        hanging.set(id, { ...node.position });
                    }
                }
                start.current = { box, hanging };
                return box;
            },
            resize: (cardId: string, box: Box) => {
                const moved = hangingAt(box);
                setNodes((all) =>
                    all.map((node) => {
                        if (node.id === cardId) {
                            return {
                                ...node,
                                width: box.width,
                                height: box.height,
                                position: { x: box.x, y: box.y },
                                // Follow the pointer, not a transition left
                                // over from focusing.
                                className: undefined,
                            };
                        }
                        const spot = moved.get(node.id);
                        return spot ? { ...node, position: spot } : node;
                    }),
                );
            },
            commit: (cardId: string, box: Box) => {
                const from = start.current;
                const moved = hangingAt(box);
                start.current = null;
                if (!from) return;
                const shifted = box.x !== from.box.x || box.y !== from.box.y;
                save(
                    {
                        intent: 'resize-card',
                        cardId,
                        width: String(box.width),
                        height: String(box.height),
                        ...(shifted
                            ? { x: String(box.x), y: String(box.y) }
                            : {}),
                    },
                    `resize:${cardId}`,
                );
                if (moved.size > 0) {
                    save(
                        {
                            intent: 'move-cards',
                            positions: JSON.stringify(
                                Object.fromEntries(moved),
                            ),
                        },
                        `resize-hanging:${cardId}`,
                    );
                }
            },
        };
    }, [flow, submit, links.action, setNodes, room.cards, locked]);
}

/**
 * Arrange: slides every card into the layout by links (`clusterLayout`:
 * linked cards grouped around their hub, groups packed in rows) at its
 * resting size, fits the view to all of it, and saves the spots (the
 * `arrange` intent), so everyone's canvas slides there too and a reload
 * keeps it.
 */
function useArrange(
    room: Room,
    setNodes: Dispatch<SetStateAction<RoomNode[]>>,
    locked: Set<string>,
    focusedId: string | undefined,
) {
    const links = useRoomLinks();
    const flow = useFlow();
    const submit = useSubmit();
    const [arranging, setArranging] = useState(false);

    // An agent laid cards out (`layoutVersion` went up): slide every card
    // to its saved spot, as Arrange does. The focused card keeps its frame.
    // Adjusted while rendering, like the rest of the loader sync.
    const layoutVersion = room.arrangement.layoutVersion ?? 0;
    const [seenLayout, setSeenLayout] = useState(layoutVersion);
    if (layoutVersion !== seenLayout) {
        setSeenLayout(layoutVersion);
        const saved = room.arrangement.positions;
        setNodes((all) =>
            all.map((node) => {
                const spot = saved[node.id];
                return spot && node.id !== focusedId
                    ? { ...node, position: { x: spot.x, y: spot.y } }
                    : node;
            }),
        );
        if (!focusedId) setArranging(true);
    }

    const arrange = useCallback(() => {
        // Locked cards (and what hangs under them) get no spot: they stay.
        const spots = clusterLayout(room.cards, room.relations, {
            locked,
        });
        setNodes((all) =>
            all.map((node) => {
                const spot = spots[node.id];
                return spot
                    ? {
                          ...node,
                          position: { x: spot.x, y: spot.y },
                          ...sizeOf(node.data.card),
                      }
                    : node;
            }),
        );
        setArranging(true);
        // Saving bumps `layoutVersion`; this canvas is already there.
        setSeenLayout(layoutVersion + 1);
        void submit(
            { intent: 'arrange' },
            {
                method: 'post',
                action: links.action,
                navigate: false,
                fetcherKey: 'arrange',
            },
        );
    }, [
        room.cards,
        room.relations,
        setNodes,
        submit,
        links.action,
        locked,
        layoutVersion,
    ]);

    // After the new positions reach the canvas: fit, then stop animating
    // moves, so dragging stays immediate.
    useEffect(() => {
        if (!arranging) return;
        flow.fitView({ padding: INITIAL_FIT_PADDING, duration: ARRANGE_MS });
        const timer = setTimeout(() => setArranging(false), ARRANGE_MS + 50);
        return () => clearTimeout(timer);
    }, [arranging, flow]);

    return { arrange, arranging };
}

type Props = {
    room: Room;
    /** From the URL (`/cards/:cardId`). */
    focusedId?: string;
    /** From the URL (`/views/:viewId`). */
    view?: ViewTarget;
    /** Changes on every navigation, so revisiting a view flies there again. */
    visitKey: string;
    /** Opens the ⌘K palette (from the canvas's right-click menu). */
    onSearch: () => void;
    /** Everyone viewing the room right now, you included. */
    present: Person[];
    /** This person's canvas settings, from their cookie. */
    canvasSettings: CanvasSettings;
};

export function RoomCanvas({
    room,
    focusedId,
    view,
    visitKey,
    onSearch,
    present,
    canvasSettings,
}: Props) {
    const settings = useCanvasSettings(canvasSettings);
    const flow = useFlow();
    const canvasStyle = useMemo(
        () =>
            ({
                ...CANVAS_STYLE,
                '--trellis-edge-width': `${settings.linkWidth}px`,
            }) as CSSProperties,
        [settings.linkWidth],
    );
    const links = useRoomLinks();
    const navigate = useNavigate();
    // Double-clicking a card's header (its title bar, not a button or field
    // in it) focuses the card, or, on the focused card, goes back to the
    // canvas.
    function handleNodeDoubleClick(
        event: ReactMouseEvent,
        node: { id: string },
    ) {
        const target = event.target as Element;
        if (
            !target.closest('header') ||
            target.closest(
                'button, a, input, textarea, select, [contenteditable="true"]',
            )
        ) {
            return;
        }
        void navigate(
            node.id === focusedId ? links.action : links.card(node.id),
        );
    }
    // Dragging from a card's link dot onto another card relates the two.
    const submitLink = useSubmit();
    function linkFetch(fields: Record<string, string>) {
        void submitLink(fields, {
            method: 'post',
            action: links.action,
            navigate: false,
            fetcherKey: `link:${crypto.randomUUID()}`,
        });
    }
    function canConnect({
        source,
        target,
    }: {
        source: string;
        target: string;
    }) {
        return (
            source !== target &&
            !room.relations.some(
                (relation) =>
                    (relation.from === source && relation.to === target) ||
                    (relation.from === target && relation.to === source),
            )
        );
    }
    function handleConnect({
        source,
        target,
    }: {
        source: string;
        target: string;
    }) {
        if (canConnect({ source, target })) {
            linkFetch({ intent: 'link-cards', from: source, to: target });
        }
    }
    function removeLink(relationId: string) {
        linkFetch({ intent: 'unlink-cards', relationId });
    }

    // Double-clicking empty canvas zooms in a step, like the + button.
    function handleCanvasDoubleClick(event: React.MouseEvent) {
        const target = event.target as Element;
        if (!event.currentTarget.contains(target)) return;
        if (target.closest(NOT_EMPTY)) return;
        flow.zoomIn({ duration: 150 });
    }

    // While a card is focused, a click on the canvas around it goes back.
    function handlePaneClick(event: React.MouseEvent) {
        // React bubbles clicks from portals (a card's menus and pickers)
        // through the canvas, so only a click that landed in it counts.
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (focusedId) void navigate(links.action);
    }
    const initialNodes = useMemo(() => toNodes(room), [room]);
    const initialEdges = useMemo(() => toEdges(room), [room]);
    const [nodes, setNodes, onNodesChange] =
        useNodesState<RoomNode>(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    useFocusView(focusedId, view, visitKey, setNodes);
    const isFocused = nodes.some((node) => node.id === focusedId);

    // Loader data changes as agents and replies arrive (the route polls).
    // Adjusted while rendering, so new content never waits an extra frame.
    const [syncedRoom, setSyncedRoom] = useState(room);
    if (room !== syncedRoom) {
        setSyncedRoom(room);
        setNodes((all) => syncNodes(all, room));
        setEdges(toEdges(room));
    }

    const {
        stack,
        colors,
        locked,
        bringToFront,
        sendToBack,
        setColor,
        setLocked,
    } = useArrangement(room);
    const stacking = useMemo(
        () => ({
            bringToFront,
            sendToBack,
            isLocked: (cardId: string) => locked.has(cardId),
            toggleLock: (cardId: string) =>
                setLocked(
                    cardId,
                    !locked.has(cardId),
                    nodes.find((node) => node.id === cardId)?.position,
                ),
        }),
        [bringToFront, sendToBack, locked, setLocked, nodes],
    );
    const cardColors = useMemo(
        () => ({ colorOf: (id: string) => colors[id], setColor }),
        [colors, setColor],
    );
    const resizing = useCardResizing(room, setNodes, locked);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const renaming = useMemo(
        () => ({
            renamingId,
            startRename: setRenamingId,
            stopRename: () => setRenamingId(null),
        }),
        [renamingId],
    );

    // The focused card always sits above the rest.
    // Filters dim what doesn't match; the focused card never dims.
    // Save where cards end up: at the end of a drag (dragging: false) and
    // on keyboard nudges (no dragging flag), not on every step of a drag.
    const submitPositions = useSubmit();
    const handleNodesChange = useCallback(
        (changes: NodeChange<RoomNode>[]) => {
            onNodesChange(changes);
            const settled = changes.flatMap((change) =>
                change.type === 'position' && change.dragging !== true
                    ? [[change.id, change.position] as const]
                    : [],
            );
            if (settled.length === 0) return;
            void submitPositions(
                {
                    intent: 'move-cards',
                    positions: JSON.stringify(Object.fromEntries(settled)),
                },
                {
                    method: 'post',
                    action: links.action,
                    navigate: false,
                    fetcherKey: `move-cards:${settled.map(([id]) => id).join(',')}`,
                },
            );
        },
        [onNodesChange, submitPositions, links.action],
    );

    const { arrange, arranging } = useArrange(
        room,
        setNodes,
        locked,
        focusedId,
    );
    const [filter, setFilter] = useState<RoomFilter>(NO_FILTER);
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') ?? '';
    const found = useMemo(
        () =>
            query.trim()
                ? createRoomSearch(room.cards).search(query).cardIds
                : null,
        [query, room.cards],
    );
    const dimmed = useMemo(() => {
        if (!filter.kind && !filter.color && !filter.agentOnly && !found) {
            return new Set<string>();
        }
        return new Set(
            room.cards
                .filter(
                    (card) =>
                        card.id !== focusedId &&
                        (!matchesFilter(filter, card, colors[card.id]) ||
                            (found !== null && !found.has(card.id))),
                )
                .map((card) => card.id),
        );
    }, [filter, found, room.cards, colors, focusedId]);

    // The cards there when the canvas opened; any others arrived since (added
    // by hand, by an agent, a duplicate) and fade in.
    const [openedWith] = useState(
        () => new Set(room.cards.map((card) => card.id)),
    );
    // Cards being deleted (and those hanging under them) go at once.
    const deletingId = useFetcher({ key: DELETE_FETCHER_KEY }).formData?.get(
        'cardId',
    );
    const deleting = useMemo(
        () =>
            typeof deletingId === 'string'
                ? new Set([deletingId, ...hangingUnder(deletingId, room.cards)])
                : null,
        [deletingId, room.cards],
    );
    const stackedNodes = useMemo(
        () =>
            nodes.map((node) => ({
                ...node,
                className: cx(
                    arranging
                        ? ARRANGE_TRANSITION
                        : node.className === RESIZE_TRANSITION
                          ? RESIZE_TRANSITION
                          : FADE_TRANSITION,
                    dimmed.has(node.id) && DIMMED,
                    // Only on mount does the animation run, so keeping the
                    // class on afterwards is harmless.
                    !openedWith.has(node.id) && 'motion-safe:animate-card-in',
                ),
                draggable: !locked.has(node.id),
                hidden: deleting?.has(node.id) ?? false,
                zIndex:
                    node.id === focusedId
                        ? stack.length + 1
                        : stack.indexOf(node.id) + 1,
            })),
        [
            nodes,
            stack,
            focusedId,
            dimmed,
            arranging,
            openedWith,
            locked,
            deleting,
        ],
    );
    // A focused card fills the canvas, and Trellis draws edge labels above
    // every card, so edges hide while one is focused.
    const shownEdges = useMemo(
        () =>
            edges.map((edge) => {
                if (focusedId) return { ...edge, hidden: true };
                return dimmed.has(edge.source) || dimmed.has(edge.target)
                    ? { ...edge, className: cx(FADE_TRANSITION, DIMMED) }
                    : edge;
            }),
        [edges, dimmed, focusedId],
    );

    const lookups = useMemo(() => {
        const titles = new Map(room.cards.map((card) => [card.id, card.title]));
        const pullRequests = room.cards.filter(
            (card): card is PullRequestCard => card.kind === 'pull-request',
        );
        const kinds = new Map(room.cards.map((card) => [card.id, card.kind]));
        const byId = new Map(room.cards.map((card) => [card.id, card]));
        return {
            cards: room.cards,
            cardOf: (id: string) => byId.get(id),
            titleOf: (id: string) => titles.get(id),
            kindOf: (id: string) => kinds.get(id),
            pullRequestsFrom: (chatId: string) =>
                pullRequests
                    .filter((pr) => pr.chatId === chatId)
                    .sort((a, b) => b.number - a.number),
        };
    }, [room]);

    const people = useMemo(() => {
        const byId = new Map(room.people.map((p) => [p.id, p]));
        return {
            meId: room.meId,
            people: room.people,
            personById: (id: string) => byId.get(id),
        };
    }, [room]);

    return (
        <RoomPeopleContext.Provider value={people}>
            <CardsContext.Provider value={lookups}>
                <FocusedCardContext.Provider value={focusedId}>
                    <StackingContext.Provider value={stacking}>
                        <CardColorContext.Provider value={cardColors}>
                            <RenamingContext.Provider value={renaming}>
                                <ResizingContext.Provider value={resizing}>
                                    <DeleteCardProvider>
                                        <CanvasMenu
                                            onArrange={arrange}
                                            onSearch={onSearch}
                                            linkLabel={(id) =>
                                                room.relations.find(
                                                    (relation) =>
                                                        relation.id === id,
                                                )?.label
                                            }
                                            onRemoveLink={removeLink}
                                        >
                                            <div
                                                className="size-full"
                                                onDoubleClick={
                                                    handleCanvasDoubleClick
                                                }
                                            >
                                                <Flow
                                                    nodes={stackedNodes}
                                                    edges={shownEdges}
                                                    onNodesChange={
                                                        handleNodesChange
                                                    }
                                                    onEdgesChange={
                                                        onEdgesChange
                                                    }
                                                    nodeTypes={nodeTypes}
                                                    edgeTypes={edgeTypes}
                                                    onNodeDoubleClick={
                                                        handleNodeDoubleClick
                                                    }
                                                    onPaneClick={
                                                        handlePaneClick
                                                    }
                                                    onConnect={handleConnect}
                                                    isValidConnection={
                                                        canConnect
                                                    }
                                                    deleteKeys={null}
                                                    scrollMode="pan"
                                                    minZoom={0.2}
                                                    maxZoom={1.5}
                                                    fitView={{
                                                        padding:
                                                            INITIAL_FIT_PADDING,
                                                    }}
                                                    ariaLabel="Atrium canvas"
                                                    className="size-full"
                                                    style={canvasStyle}
                                                >
                                                    <Background />
                                                    {!isFocused && (
                                                        <Controls>
                                                            <ControlButton
                                                                label="Arrange cards"
                                                                onClick={
                                                                    arrange
                                                                }
                                                            >
                                                                <LayoutGridIcon
                                                                    aria-hidden="true"
                                                                    className="size-4"
                                                                />
                                                            </ControlButton>
                                                        </Controls>
                                                    )}
                                                    {!isFocused && <MiniMap />}
                                                    {!isFocused && (
                                                        <Panel
                                                            position="top-left"
                                                            // The whole top row: Add pinned
                                                            // left, who's here pinned right, the
                                                            // filters centered between, never
                                                            // overlapping. Clicks pass through
                                                            // the gaps to the canvas.
                                                            style={{ right: 0 }}
                                                            className="pointer-events-none flex items-start gap-2"
                                                        >
                                                            <div className="shrink-0">
                                                                <AddCardMenu />
                                                            </div>
                                                            <div className="pointer-events-none flex min-w-0 flex-1 justify-center">
                                                                <FilterBar
                                                                    filter={
                                                                        filter
                                                                    }
                                                                    onChange={
                                                                        setFilter
                                                                    }
                                                                    shown={
                                                                        room
                                                                            .cards
                                                                            .length -
                                                                        dimmed.size
                                                                    }
                                                                    total={
                                                                        room
                                                                            .cards
                                                                            .length
                                                                    }
                                                                    query={
                                                                        query
                                                                    }
                                                                />
                                                            </div>
                                                            <div className="flex shrink-0 items-start gap-2">
                                                                <PresenceAvatars
                                                                    people={
                                                                        present
                                                                    }
                                                                    meId={
                                                                        room.meId
                                                                    }
                                                                />
                                                                <CanvasSettingsButton
                                                                    {...settings}
                                                                />
                                                            </div>
                                                        </Panel>
                                                    )}
                                                    {isFocused && (
                                                        <Panel
                                                            position="top-right"
                                                            className="flex items-start gap-2"
                                                        >
                                                            <PresenceAvatars
                                                                people={present}
                                                                meId={room.meId}
                                                            />
                                                            <CanvasSettingsButton
                                                                {...settings}
                                                            />
                                                        </Panel>
                                                    )}
                                                    {isFocused && (
                                                        <Panel position="top-left">
                                                            <Button
                                                                variant="outline"
                                                                className="bg-card shadow-md"
                                                                render={
                                                                    <Link
                                                                        to={
                                                                            links.action
                                                                        }
                                                                    />
                                                                }
                                                            >
                                                                <ArrowLeftIcon aria-hidden="true" />
                                                                Back to canvas
                                                            </Button>
                                                        </Panel>
                                                    )}
                                                </Flow>
                                            </div>
                                        </CanvasMenu>
                                    </DeleteCardProvider>
                                </ResizingContext.Provider>
                            </RenamingContext.Provider>
                        </CardColorContext.Provider>
                    </StackingContext.Provider>
                </FocusedCardContext.Provider>
            </CardsContext.Provider>
        </RoomPeopleContext.Provider>
    );
}
