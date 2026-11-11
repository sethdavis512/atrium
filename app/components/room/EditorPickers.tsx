import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { raise } from '@portabletext/editor/behaviors';
import {
    defineTypeaheadPicker,
    useTypeaheadPicker,
} from '@portabletext/plugin-typeahead-picker';
import {
    Heading2Icon,
    Heading3Icon,
    ListIcon,
    ListOrderedIcon,
    PilcrowIcon,
    QuoteIcon,
    type LucideIcon,
} from 'lucide-react';
import { cx } from 'cva.config';
import type { Card } from '~/lib/room';
import { KIND_ICONS, KIND_NAMES } from './kind-icons';
import { useCards } from './room-context';

/** How many choices a picker shows at once. */
const MAX_MATCHES = 8;

type CardMatch = {
    key: string;
    cardId: string;
    title: string;
    kind: Card['kind'];
};

type Command =
    | { run: 'style'; style: 'normal' | 'h2' | 'h3' | 'blockquote' }
    | { run: 'list'; listItem: 'bullet' | 'number' }
    | { run: 'embed'; cardId: string };

type CommandMatch = {
    key: string;
    label: string;
    hint: string;
    icon: LucideIcon;
    command: Command;
};

const COMMANDS: CommandMatch[] = [
    {
        key: 'normal',
        label: 'Text',
        hint: 'Plain paragraph',
        icon: PilcrowIcon,
        command: { run: 'style', style: 'normal' },
    },
    {
        key: 'h2',
        label: 'Heading',
        hint: '##',
        icon: Heading2Icon,
        command: { run: 'style', style: 'h2' },
    },
    {
        key: 'h3',
        label: 'Subheading',
        hint: '###',
        icon: Heading3Icon,
        command: { run: 'style', style: 'h3' },
    },
    {
        key: 'quote',
        label: 'Quote',
        hint: '>',
        icon: QuoteIcon,
        command: { run: 'style', style: 'blockquote' },
    },
    {
        key: 'bullet',
        label: 'Bulleted list',
        hint: '-',
        icon: ListIcon,
        command: { run: 'list', listItem: 'bullet' },
    },
    {
        key: 'number',
        label: 'Numbered list',
        hint: '1.',
        icon: ListOrderedIcon,
        command: { run: 'list', listItem: 'number' },
    },
];

function matchesKeyword(text: string, keyword: string) {
    return text.toLowerCase().includes(keyword.trim().toLowerCase());
}

/**
 * The cards a picker can offer, read through a ref: picker definitions are
 * made once, but the room's cards change as the route polls.
 */
function useCardsRef(documentId: string) {
    const { cards } = useCards();
    const ref = useRef<Card[]>([]);
    useLayoutEffect(() => {
        ref.current = cards.filter((card) => card.id !== documentId);
    });
    return ref;
}

/**
 * `@` then part of a card's name: picks a card and links the text to it
 * (an `cardRef`, shown as a chip).
 */
export function CardLinkPicker({ documentId }: { documentId: string }) {
    const cards = useCardsRef(documentId);
    const definition = useMemo(
        () =>
            defineTypeaheadPicker<CardMatch>({
                trigger: /@/,
                keyword: /[^\s@]*/,
                getMatches: ({ keyword }) =>
                    cards.current
                        .filter((card) => matchesKeyword(card.title, keyword))
                        .slice(0, MAX_MATCHES)
                        .map((card) => ({
                            key: card.id,
                            cardId: card.id,
                            title: card.title,
                            kind: card.kind,
                        })),
                onSelect: [
                    ({ event }) => [
                        raise({ type: 'delete', at: event.patternSelection }),
                        raise({
                            type: 'insert.span',
                            text: event.match.title,
                            annotations: [
                                {
                                    name: 'cardRef',
                                    value: { cardId: event.match.cardId },
                                },
                            ],
                        }),
                        // A plain space after, so typing on isn't linked.
                        raise({ type: 'insert.span', text: ' ' }),
                    ],
                ],
            }),
        [cards],
    );
    const picker = useTypeaheadPicker(definition);
    if (picker.snapshot.matches('idle')) return null;
    const { matches, selectedIndex } = picker.snapshot.context;

    return (
        <PickerPopover label="Link a card">
            {matches.length === 0 ? (
                <PickerEmpty>No cards match.</PickerEmpty>
            ) : (
                matches.map((match, index) => {
                    const Icon = KIND_ICONS[match.kind];
                    return (
                        <PickerOption
                            key={match.key}
                            selected={index === selectedIndex}
                            onHover={() =>
                                picker.send({ type: 'navigate to', index })
                            }
                            onChoose={() => picker.send({ type: 'select' })}
                            icon={Icon}
                            label={match.title}
                            hint={KIND_NAMES[match.kind]}
                        />
                    );
                })
            )}
        </PickerPopover>
    );
}

/**
 * `/` at the start of a block: turns it into a heading, quote, or list, or
 * puts a card for a card there (an `cardEmbed`).
 */
export function InsertMenuPicker({ documentId }: { documentId: string }) {
    const cards = useCardsRef(documentId);
    const definition = useMemo(
        () =>
            defineTypeaheadPicker<CommandMatch>({
                trigger: /^\//,
                keyword: /[^\n]*/,
                getMatches: ({ keyword }) =>
                    [
                        ...COMMANDS,
                        ...cards.current.map((card) => ({
                            key: `embed:${card.id}`,
                            label: card.title,
                            hint: `Embed ${KIND_NAMES[card.kind].toLowerCase()}`,
                            icon: KIND_ICONS[card.kind],
                            command: {
                                run: 'embed' as const,
                                cardId: card.id,
                            },
                        })),
                    ]
                        .filter(
                            (match) =>
                                matchesKeyword(match.label, keyword) ||
                                matchesKeyword(match.hint, keyword),
                        )
                        .slice(0, MAX_MATCHES),
                onSelect: [
                    ({ event }) => {
                        const remove = raise({
                            type: 'delete',
                            at: event.patternSelection,
                        });
                        const { command } = event.match;
                        if (command.run === 'style') {
                            return [
                                remove,
                                raise({
                                    type: 'style.toggle',
                                    style: command.style,
                                }),
                            ];
                        }
                        if (command.run === 'list') {
                            return [
                                remove,
                                raise({
                                    type: 'list item.toggle',
                                    listItem: command.listItem,
                                }),
                            ];
                        }
                        return [
                            remove,
                            raise({
                                type: 'insert.block',
                                block: {
                                    _type: 'cardEmbed',
                                    cardId: command.cardId,
                                },
                                placement: 'auto',
                                select: 'end',
                            }),
                        ];
                    },
                ],
            }),
        [cards],
    );
    const picker = useTypeaheadPicker(definition);
    if (picker.snapshot.matches('idle')) return null;
    const { matches, selectedIndex } = picker.snapshot.context;

    return (
        <PickerPopover label="Insert">
            {matches.length === 0 ? (
                <PickerEmpty>Nothing matches.</PickerEmpty>
            ) : (
                matches.map((match, index) => (
                    <PickerOption
                        key={match.key}
                        selected={index === selectedIndex}
                        onHover={() =>
                            picker.send({ type: 'navigate to', index })
                        }
                        onChoose={() => picker.send({ type: 'select' })}
                        icon={match.icon}
                        label={match.label}
                        hint={match.hint}
                    />
                ))
            )}
        </PickerPopover>
    );
}

/** Where the caret is on screen, or null without a selection. */
function caretRect(): DOMRect | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return rect.width === 0 && rect.height === 0 ? null : rect;
}

type PopoverProps = {
    label: string;
    children: ReactNode;
};

/**
 * A listbox under the caret, portaled to the body: the canvas is CSS
 * transformed, which would make `position: fixed` relative to it.
 */
function PickerPopover({ label, children }: PopoverProps) {
    const ref = useRef<HTMLDivElement>(null);
    // Placed straight on the element after each render (the caret moves as
    // you type), hidden until it has a spot.
    useLayoutEffect(() => {
        const element = ref.current;
        const rect = caretRect();
        if (!element || !rect) return;
        const left = Math.min(rect.left, window.innerWidth - 296);
        const top =
            rect.bottom + 320 > window.innerHeight
                ? Math.max(8, rect.top - 324)
                : rect.bottom + 6;
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
        element.style.visibility = 'visible';
    });

    return createPortal(
        <div
            ref={ref}
            role="listbox"
            aria-label={label}
            // Keep focus (and the caret) in the editor.
            onMouseDown={(event) => event.preventDefault()}
            style={{ visibility: 'hidden' }}
            className="bg-popover text-popover-foreground fixed z-50 flex max-h-80 w-72 scrollbar-none flex-col overflow-y-auto rounded-lg border p-1 shadow-lg"
        >
            {children}
        </div>,
        document.body,
    );
}

type OptionProps = {
    selected: boolean;
    onHover: () => void;
    onChoose: () => void;
    icon: LucideIcon;
    label: string;
    hint: string;
};

function PickerOption({
    selected,
    onHover,
    onChoose,
    icon: Icon,
    label,
    hint,
}: OptionProps) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    return (
        <div
            ref={ref}
            role="option"
            aria-selected={selected}
            onMouseEnter={onHover}
            onClick={onChoose}
            className={cx(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm pointer-coarse:py-2.5',
                selected && 'bg-accent',
            )}
        >
            <Icon
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
            />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
                {hint}
            </span>
        </div>
    );
}

function PickerEmpty({ children }: { children: ReactNode }) {
    return (
        <p className="text-muted-foreground px-2 py-1.5 text-sm">{children}</p>
    );
}
