import { use, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { Handle, type FlowNode, type NodeProps } from '@sethdavis512/trellis';
import { cx } from 'cva.config';
import { DEFAULT_NOTE_COLOR, isAgentMade, type NoteCard } from '~/lib/room';
import { AgentIcon, AgentStripe } from './AgentMark';
import {
    FocusedCardContext,
    useRoomLinks,
    useCardColors,
} from './room-context';
import { NOTE_FILLS } from './card-colors';
import { CardControls } from './CardControls';
import { ZoomOverlay } from './ZoomOverlay';
import { LinkHandle } from './LinkHandle';

export type NoteNode = FlowNode<{ card: NoteCard }, 'note'>;

/** Wait this long after the last keystroke before saving. */
const SAVE_DELAY_MS = 600;

/**
 * A sticky note: a colored square you type straight into. Its color is the
 * card's palette color (amber until someone picks one), so the color menu
 * recolors it. Saves a moment after you stop typing (`update-note`); an
 * agent's change shows when you aren't typing in it.
 */
export function NoteCardView({ data, selected }: NodeProps<NoteNode>) {
    const note = data.card;
    const links = useRoomLinks();
    const { colorOf } = useCardColors();
    const focused = use(FocusedCardContext) === note.id;
    const color = colorOf(note.id) ?? DEFAULT_NOTE_COLOR;
    const fetcher = useFetcher({ key: `note:${note.id}` });
    // What you're typing, until it's saved and the loader catches up.
    const [draft, setDraft] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const text = draft ?? note.text;

    useEffect(() => () => clearTimeout(timer.current), []);

    function save(value: string) {
        void fetcher.submit(
            { intent: 'update-note', noteId: note.id, text: value },
            { method: 'post', action: links.action },
        );
    }

    return (
        <div className="group/card relative size-full">
            <Handle type="target" position="top" />
            <LinkHandle radius={6} />
            <CardControls
                cardId={note.id}
                title={note.title}
                focused={focused}
                selected={selected}
            />
            <ZoomOverlay
                cardId={note.id}
                title={note.title}
                kind="Sticky note"
                rounded="rounded-md"
            />
            <article
                aria-label={`Sticky note: ${note.title}`}
                className={cx(
                    'bg-card text-foreground relative isolate flex size-full flex-col overflow-hidden rounded-md border shadow-lg transition-shadow before:pointer-events-none before:absolute before:inset-0 before:-z-10',
                    NOTE_FILLS[color],
                    selected && 'ring-ring ring-2',
                )}
            >
                {isAgentMade(note) && <AgentStripe />}
                {/* The grip: drag the note by its top edge, double-click to
                    focus it. */}
                <header className="flex h-7 shrink-0 cursor-grab items-center justify-end px-2 active:cursor-grabbing">
                    {isAgentMade(note) && <AgentIcon />}
                </header>
                <textarea
                    aria-label={`Text of ${note.title}`}
                    value={text}
                    placeholder="Write something…"
                    maxLength={4000}
                    spellCheck
                    onChange={(event) => {
                        const value = event.target.value;
                        setDraft(value);
                        clearTimeout(timer.current);
                        timer.current = setTimeout(
                            () => save(value),
                            SAVE_DELAY_MS,
                        );
                    }}
                    onBlur={() => {
                        if (draft === null) return;
                        clearTimeout(timer.current);
                        if (draft !== note.text) save(draft);
                        setDraft(null);
                    }}
                    // Typing stays in the note, not the canvas's shortcuts.
                    onKeyDown={(event) => event.stopPropagation()}
                    className={cx(
                        'nodrag nowheel placeholder:text-foreground/40 min-h-0 flex-1 resize-none scrollbar-none bg-transparent px-4 pb-4 leading-snug font-medium outline-none',
                        focused ? 'text-2xl' : 'text-base',
                    )}
                />
            </article>
        </div>
    );
}
