import type { ReactElement } from 'react';
import { Link, useSubmit } from 'react-router';
import { useFlow } from '@sethdavis512/trellis';
import {
    BringToFrontIcon,
    CopyPlusIcon,
    ListPlusIcon,
    LockIcon,
    LockOpenIcon,
    Maximize2Icon,
    PaletteIcon,
    SendToBackIcon,
    Trash2Icon,
} from 'lucide-react';
import { cx } from 'cva.config';
import { Button } from '~/components/ui/button';
import {
    Menu,
    MenuGroup,
    MenuGroupLabel,
    MenuPopup,
    MenuRadioGroup,
    MenuRadioItem,
    MenuTrigger,
} from '~/components/ui/menu';
import { CARD_COLOR_NAMES, type CardKind, type CardColor } from '~/lib/room';
import { useAddCard } from './AddCard';
import { useDeleteCard } from './DeleteCard';
import { KindItem } from './AddCardMenu';
import {
    useStacking,
    useCards,
    useCardColors,
    useRoomLinks,
} from './room-context';
import { CARD_COLORS } from './card-colors';

type Props = {
    cardId: string;
    title: string;
    focused: boolean;
    /** The card is selected (also how a tap reveals them on touch). */
    selected: boolean;
};

/**
 * A column of buttons floating off a card's right edge, near the top:
 * Focus (opens the card's own route, which fills the canvas with it),
 * Bring to front, Send to back, Duplicate (not for pull requests), Add to
 * (chats and documents: a chart, a pull request, or a video, page, or
 * image hanging under them), and a border color.
 *
 * They show only while you're working with the card: hovering it (the
 * card's root is `group/card`), focus inside it, the card selected
 * (a tap selects, which covers touch screens), or the color menu open.
 * Hidden, they ignore the pointer so they can't catch clicks meant for the
 * canvas. The column's left padding bridges the gap to the card, so the
 * pointer can travel to them without them fading on the way. Gone entirely
 * on the focused card, which fills the canvas; "Back to canvas" takes
 * over there.
 */
export function CardControls({ cardId, title, focused, selected }: Props) {
    const links = useRoomLinks();
    const { bringToFront, sendToBack, isLocked, toggleLock } = useStacking();
    const locked = isLocked(cardId);
    const { kindOf } = useCards();
    const duplicate = useDuplicate();
    const { confirmDelete } = useDeleteCard();
    if (focused) return null;

    return (
        <div
            className={cx(
                'nodrag absolute top-6 left-full flex flex-col gap-2 ps-3 motion-safe:transition-opacity motion-safe:duration-150',
                selected
                    ? 'opacity-100'
                    : 'pointer-events-none opacity-0 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100 group-hover/card:pointer-events-auto group-hover/card:opacity-100 has-data-popup-open:pointer-events-auto has-data-popup-open:opacity-100',
            )}
        >
            <ControlButton
                label={`Focus ${title}`}
                tip="Focus"
                render={<Link to={links.card(cardId)} prefetch="intent" />}
            >
                <Maximize2Icon aria-hidden="true" />
            </ControlButton>
            <ControlButton
                label={`${locked ? 'Unlock' : 'Lock'} ${title} in place`}
                tip={locked ? 'Unlock' : 'Lock in place'}
                pressed={locked}
                onClick={() => toggleLock(cardId)}
            >
                {locked ? (
                    <LockIcon aria-hidden="true" />
                ) : (
                    <LockOpenIcon aria-hidden="true" />
                )}
            </ControlButton>
            <ControlButton
                label={`Bring ${title} to front`}
                tip="Bring to front"
                onClick={() => bringToFront(cardId)}
            >
                <BringToFrontIcon aria-hidden="true" />
            </ControlButton>
            <ControlButton
                label={`Send ${title} to back`}
                tip="Send to back"
                onClick={() => sendToBack(cardId)}
            >
                <SendToBackIcon aria-hidden="true" />
            </ControlButton>
            {kindOf(cardId) !== 'pull-request' && (
                <ControlButton
                    label={`Duplicate ${title}`}
                    tip="Duplicate"
                    onClick={() => duplicate(cardId)}
                >
                    <CopyPlusIcon aria-hidden="true" />
                </ControlButton>
            )}
            {(kindOf(cardId) === 'chat' || kindOf(cardId) === 'document') && (
                <AddToMenu
                    cardId={cardId}
                    title={title}
                    chat={kindOf(cardId) === 'chat'}
                />
            )}
            <ColorPicker cardId={cardId} title={title} />
            <ControlButton
                label={`Delete ${title}`}
                tip="Delete"
                destructive
                onClick={() => confirmDelete(cardId)}
            >
                <Trash2Icon aria-hidden="true" />
            </ControlButton>
        </div>
    );
}

/** How far down and right of the original a copy opens. */
const COPY_OFFSET = 48;

/**
 * Copies a card (`duplicate` intent). The copy opens a little down and
 * right of the original, where it is now on this canvas, and joins the
 * stack on top.
 */
function useDuplicate() {
    const links = useRoomLinks();
    const flow = useFlow();
    const submit = useSubmit();
    return (cardId: string) => {
        const position = flow.getNode(cardId)?.position;
        void submit(
            {
                intent: 'duplicate',
                cardId,
                ...(position
                    ? {
                          x: String(position.x + COPY_OFFSET),
                          y: String(position.y + COPY_OFFSET),
                      }
                    : {}),
            },
            {
                method: 'post',
                action: links.action,
                navigate: false,
                fetcherKey: `duplicate:${cardId}:${crypto.randomUUID()}`,
            },
        );
    };
}

type ControlButtonProps = {
    label: string;
    tip: string;
    /** A toggle that's on (the lock). */
    pressed?: boolean;
    children: ReactElement;
    onClick?: () => void;
    render?: ReactElement;
    /** Red on hover: it deletes. */
    destructive?: boolean;
};

function ControlButton({
    label,
    tip,
    children,
    onClick,
    render,
    pressed,
    destructive,
}: ControlButtonProps) {
    return (
        <Button
            variant="outline"
            size="icon"
            aria-label={label}
            aria-pressed={pressed}
            title={tip}
            onClick={onClick}
            render={render}
            className={cx(
                'bg-card rounded-full shadow-md',
                pressed && 'border-ring text-foreground bg-accent',
                destructive &&
                    'hover:text-destructive hover:border-destructive/60',
            )}
        >
            {children}
        </Button>
    );
}

type AddToMenuProps = {
    cardId: string;
    title: string;
    /** Chats also take pull requests. */
    chat: boolean;
};

/**
 * Adds a card that hangs under this chat or document: a chart (sample
 * numbers to start), a draft pull request (chats only), or a video, web
 * page, or image by address.
 */
function AddToMenu({ cardId, title, chat }: AddToMenuProps) {
    const { add } = useAddCard();
    const kinds: { kind: CardKind; label: string }[] = [
        { kind: 'chart', label: 'Chart' },
        ...(chat
            ? [{ kind: 'pull-request' as const, label: 'Pull request' }]
            : []),
        { kind: 'video', label: 'Video…' },
        { kind: 'web', label: 'Web page…' },
        { kind: 'image', label: 'Image…' },
    ];
    return (
        <Menu>
            <MenuTrigger
                render={
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Add to ${title}`}
                        title="Add to this card"
                        className="bg-card rounded-full shadow-md"
                    />
                }
            >
                <ListPlusIcon aria-hidden="true" />
            </MenuTrigger>
            <MenuPopup side="right" align="start" className="w-44">
                <MenuGroup>
                    <MenuGroupLabel>Add to {title}</MenuGroupLabel>
                    {kinds.map(({ kind, label }) => (
                        <KindItem
                            key={kind}
                            kind={kind}
                            label={label}
                            onClick={() => add(kind, { attachedTo: cardId })}
                        />
                    ))}
                </MenuGroup>
            </MenuPopup>
        </Menu>
    );
}

const DEFAULT_COLOR = 'default';

type ColorPickerProps = {
    cardId: string;
    title: string;
};

/** Picks the card's border color from the six-color palette, or none. */
function ColorPicker({ cardId, title }: ColorPickerProps) {
    const { colorOf, setColor } = useCardColors();
    const color = colorOf(cardId);

    return (
        <Menu>
            <MenuTrigger
                render={
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Border color for ${title}`}
                        title="Border color"
                        className="bg-card relative rounded-full shadow-md"
                    />
                }
            >
                <PaletteIcon aria-hidden="true" />
                {color && (
                    <span
                        aria-hidden="true"
                        className={cx(
                            'ring-card absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2',
                            CARD_COLORS[color].swatch,
                        )}
                    />
                )}
            </MenuTrigger>
            <MenuPopup side="right" align="start" className="w-40">
                <MenuRadioGroup
                    value={color ?? DEFAULT_COLOR}
                    onValueChange={(value: string) =>
                        setColor(
                            cardId,
                            value === DEFAULT_COLOR
                                ? null
                                : (value as CardColor),
                        )
                    }
                >
                    <MenuRadioItem value={DEFAULT_COLOR} closeOnClick>
                        <span className="flex items-center gap-2">
                            <span
                                aria-hidden="true"
                                className="border-border size-3.5 rounded-full border"
                            />
                            Default
                        </span>
                    </MenuRadioItem>
                    {CARD_COLOR_NAMES.map((name) => (
                        <MenuRadioItem key={name} value={name} closeOnClick>
                            <span className="flex items-center gap-2">
                                <span
                                    aria-hidden="true"
                                    className={cx(
                                        'size-3.5 rounded-full',
                                        CARD_COLORS[name].swatch,
                                    )}
                                />
                                {CARD_COLORS[name].label}
                            </span>
                        </MenuRadioItem>
                    ))}
                </MenuRadioGroup>
            </MenuPopup>
        </Menu>
    );
}
