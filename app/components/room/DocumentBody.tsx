import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import type { PortableTextBlock } from '@portabletext/types';
import { ArrowUpRightIcon } from 'lucide-react';
import { type Card } from '~/lib/room';
import type {
    DocumentBlock,
    CardEmbedBlock,
    CardRefMark,
    LinkMark,
    TableBlock,
    TableCell,
} from '~/lib/portable-text';
import { KIND_ICONS, KIND_NAMES } from './kind-icons';
import { useCards, useRoomLinks } from './room-context';

type Props = {
    blocks: DocumentBlock[];
};

/**
 * A document's Portable Text. Standard blocks render as prose; `cardRef`
 * marks become chips that open the card they point at, `cardEmbed`
 * blocks become cards for it, and `table` blocks become tables.
 */
export function DocumentBody({ blocks }: Props) {
    return (
        <PortableText
            value={blocks as PortableTextBlock[]}
            components={components}
        />
    );
}

const marks: PortableTextComponents['marks'] = {
    cardRef: ({ value, children }) => (
        <CardChip cardId={(value as CardRefMark).cardId}>{children}</CardChip>
    ),
    link: ({ value, children }) => (
        <a
            href={(value as LinkMark).href}
            target="_blank"
            rel="noreferrer noopener"
        >
            {children}
        </a>
    ),
};

/** A cell's text renders inline: no paragraph around it. */
const cellComponents: PortableTextComponents = {
    marks,
    block: { normal: ({ children }) => <>{children}</> },
};

function CellText({ cell }: { cell: TableCell }) {
    return (
        <PortableText
            value={
                {
                    _type: 'block',
                    _key: cell._key,
                    style: 'normal',
                    children: cell.children,
                    markDefs: cell.markDefs,
                } as PortableTextBlock
            }
            components={cellComponents}
        />
    );
}

/** A table, scrolling sideways inside the document when it's too wide. */
export function DocumentTable({ table }: { table: TableBlock }) {
    const [first, ...rest] = table.rows;
    const header = table.headerRow ? first : undefined;
    const body = table.headerRow ? rest : table.rows;
    return (
        <div className="not-prose nowheel my-4 overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
                {header && (
                    <thead className="bg-muted/60">
                        <tr>
                            {header.cells.map((cell) => (
                                <th
                                    key={cell._key}
                                    scope="col"
                                    className="border-b px-3 py-2 text-left font-semibold"
                                >
                                    <CellText cell={cell} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                )}
                <tbody>
                    {body.map((row) => (
                        <tr key={row._key} className="border-b last:border-b-0">
                            {row.cells.map((cell) => (
                                <td
                                    key={cell._key}
                                    className="px-3 py-2 align-top"
                                >
                                    <CellText cell={cell} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const components: PortableTextComponents = {
    marks,
    types: {
        cardEmbed: ({ value }) => (
            <CardEmbedView cardId={(value as CardEmbedBlock).cardId} />
        ),
        table: ({ value }) => <DocumentTable table={value as TableBlock} />,
    },
};

type ChipProps = {
    cardId: string;
    children: ReactNode;
    /** Inside the editor: a styled span, so clicking places the caret. */
    editing?: boolean;
};

/** Inline: the linked text with its card's icon, opening the card. */
export function CardChip({ cardId, children, editing = false }: ChipProps) {
    const links = useRoomLinks();
    const { cardOf } = useCards();
    const card = cardOf(cardId);
    if (!card) {
        return (
            <span
                title="No longer in the room"
                className="text-muted-foreground line-through"
            >
                {children}
            </span>
        );
    }
    const Icon = KIND_ICONS[card.kind];
    const title = `${KIND_NAMES[card.kind]}: ${card.title}`;
    const className =
        'not-prose bg-muted text-foreground inline-flex items-baseline gap-1 rounded-md px-1.5 font-medium no-underline';
    const icon = (
        <Icon
            aria-hidden="true"
            className="text-muted-foreground size-3.5 shrink-0 self-center"
        />
    );

    if (editing) {
        return (
            <span title={title} data-card-ref={card.id} className={className}>
                {icon}
                {children}
            </span>
        );
    }
    return (
        <Link
            to={links.card(card.id)}
            title={title}
            className={`${className} hover:bg-accent focus-visible:ring-ring outline-none focus-visible:ring-2`}
        >
            {icon}
            {children}
        </Link>
    );
}

type CardProps = {
    cardId: string;
    /**
     * Inside the editor: the card is something you select, not a link, and
     * the arrow opens the card.
     */
    editing?: boolean;
};

/** A block of its own: the card's kind, title, and a line about it. */
export function CardEmbedView({ cardId, editing = false }: CardProps) {
    const links = useRoomLinks();
    const { cardOf } = useCards();
    const card = cardOf(cardId);
    if (!card) {
        return (
            <p className="text-muted-foreground italic">
                A card that is no longer in the room.
            </p>
        );
    }
    const Icon = KIND_ICONS[card.kind];
    const label = `${KIND_NAMES[card.kind]}: ${card.title}`;
    const body = (
        <>
            <span className="bg-card flex size-9 shrink-0 items-center justify-center rounded-md border">
                <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {KIND_NAMES[card.kind]}
                </span>
                <span className="text-foreground truncate text-sm font-semibold">
                    {card.title}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                    {summary(card)}
                </span>
            </span>
        </>
    );
    const className =
        'not-prose bg-muted/50 my-4 flex items-center gap-3 rounded-lg border px-4 py-3 no-underline';

    if (editing) {
        return (
            <div aria-label={label} className={className}>
                {body}
                <Link
                    to={links.card(card.id)}
                    aria-label={`Open ${card.title}`}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring rounded-md p-1 outline-none focus-visible:ring-2"
                >
                    <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                </Link>
            </div>
        );
    }
    return (
        <Link
            to={links.card(card.id)}
            aria-label={label}
            className={`${className} hover:bg-accent focus-visible:ring-ring outline-none focus-visible:ring-2`}
        >
            {body}
            <ArrowUpRightIcon
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
            />
        </Link>
    );
}

function summary(card: Card): string {
    switch (card.kind) {
        case 'chat': {
            const last = card.messages.at(-1);
            return last ? last.text : 'No messages yet';
        }
        case 'document':
            return `${card.blocks.length} blocks`;
        case 'pull-request':
            return `#${card.number} · ${card.status}`;
        case 'chart':
            return card.caption;
        case 'board': {
            const done = card.issues.filter(
                (issue) => issue.status === 'done',
            ).length;
            return `${card.issues.length} issues · ${done} done`;
        }
        case 'video':
            return 'YouTube video';
        case 'web':
            return new URL(card.url).hostname;
        case 'image':
            return card.animated ? 'Animated GIF' : 'Image';
        case 'note':
            return card.text.replace(/\s+/g, ' ').trim() || 'Empty note';
        case 'sketch':
            return `${card.strokes.length} strokes`;
        case 'ui':
            return 'Live view of this room';
    }
}
