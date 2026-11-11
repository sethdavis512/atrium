import {
    useEffect,
    useRef,
    useState,
    type ReactNode,
    type RefObject,
} from 'react';
import { useFetcher, useSubmit } from 'react-router';
import {
    defineAnnotation,
    defineBlockObject,
    defineDecorator,
    defineSchema,
    defineTextBlock,
    EditorProvider,
    PortableTextEditable,
    useEditor,
    useEditorSelector,
    type PortableTextBlock,
} from '@portabletext/editor';
import { EventListenerPlugin, NodePlugin } from '@portabletext/editor/plugins';
import {
    isActiveDecorator,
    isActiveListItem,
    isActiveStyle,
} from '@portabletext/editor/selectors';
import { MarkdownShortcutsPlugin } from '@portabletext/plugin-markdown-shortcuts';
import {
    AtSignIcon,
    BoldIcon,
    CodeIcon,
    Heading2Icon,
    Heading3Icon,
    ItalicIcon,
    ListIcon,
    ListOrderedIcon,
    QuoteIcon,
    type LucideIcon,
} from 'lucide-react';
import { cx } from 'cva.config';
import { Button } from '~/components/ui/button';
import {
    DECORATORS,
    LIST_ITEMS,
    TEXT_STYLES,
    type DocumentBlock,
    type TableBlock,
} from '~/lib/portable-text';
import type { DocumentCard } from '~/lib/room';
import { DocumentTable, CardEmbedView, CardChip } from './DocumentBody';
import { InsertMenuPicker, CardLinkPicker } from './EditorPickers';
import { useRoomLinks } from './room-context';

/** Wait this long after the last keystroke before saving. */
const SAVE_DELAY_MS = 800;

/** The editor's schema: exactly what `documentBlocksSchema` accepts. */
const schemaDefinition = defineSchema({
    decorators: DECORATORS.map((name) => ({ name })),
    styles: TEXT_STYLES.map((name) => ({ name })),
    lists: LIST_ITEMS.map((name) => ({ name })),
    annotations: [
        { name: 'link', fields: [{ name: 'href', type: 'string' }] },
        { name: 'cardRef', fields: [{ name: 'cardId', type: 'string' }] },
    ],
    blockObjects: [
        { name: 'cardEmbed', fields: [{ name: 'cardId', type: 'string' }] },
        // Carried whole: the editor shows a table but doesn't edit its cells.
        {
            name: 'table',
            fields: [
                { name: 'headerRow', type: 'boolean' },
                { name: 'rows', type: 'array' },
            ],
        },
    ],
    inlineObjects: [],
});

const LIST_CLASSES = {
    bullet: "relative ps-6 before:absolute before:start-1.5 before:text-muted-foreground before:content-['•']",
    number: "relative ps-6 [counter-increment:doc-list] before:absolute before:start-0 before:text-muted-foreground before:content-[counter(doc-list)'.']",
} as const;

// At module scope: a fresh array each render would re-register every node
// on every keystroke.
const nodes = [
    defineTextBlock({
        type: 'block',
        render: ({ attributes, children, node }) => {
            if (node.listItem === 'bullet' || node.listItem === 'number') {
                return (
                    <div
                        {...attributes}
                        className={cx(
                            'my-1',
                            LIST_CLASSES[node.listItem],
                            node.listItem === 'bullet' &&
                                '[counter-reset:doc-list]',
                        )}
                        style={{
                            marginInlineStart: `${((node.level ?? 1) - 1) * 1.5}rem`,
                        }}
                    >
                        {children}
                    </div>
                );
            }
            // Any other block restarts numbering.
            const reset = '[counter-reset:doc-list]';
            if (node.style === 'h2') {
                return (
                    <h2 {...attributes} className={reset}>
                        {children}
                    </h2>
                );
            }
            if (node.style === 'h3') {
                return (
                    <h3 {...attributes} className={reset}>
                        {children}
                    </h3>
                );
            }
            if (node.style === 'blockquote') {
                return (
                    <blockquote {...attributes} className={reset}>
                        {children}
                    </blockquote>
                );
            }
            return (
                <p {...attributes} className={reset}>
                    {children}
                </p>
            );
        },
    }),
    defineDecorator({
        type: 'strong',
        render: ({ children }) => <strong>{children}</strong>,
    }),
    defineDecorator({
        type: 'em',
        render: ({ children }) => <em>{children}</em>,
    }),
    defineDecorator({
        type: 'code',
        render: ({ children }) => <code>{children}</code>,
    }),
    defineAnnotation({
        type: 'link',
        render: ({ annotation, children }) => (
            <span
                title={String((annotation as { href?: string }).href ?? '')}
                className="text-foreground underline underline-offset-2"
            >
                {children}
            </span>
        ),
    }),
    defineAnnotation({
        type: 'cardRef',
        render: ({ annotation, children }) => (
            <CardChip
                cardId={String((annotation as { cardId?: string }).cardId)}
                editing
            >
                {children}
            </CardChip>
        ),
    }),
    defineBlockObject({
        type: 'cardEmbed',
        render: ({ attributes, children, node, selected }) => (
            <div
                {...attributes}
                className={cx(
                    'rounded-lg',
                    selected && 'ring-ring ring-2 ring-offset-2',
                )}
            >
                {children}
                <CardEmbedView
                    cardId={String((node as { cardId?: string }).cardId)}
                    editing
                />
            </div>
        ),
    }),
    defineBlockObject({
        type: 'table',
        render: ({ attributes, children, node, selected }) => (
            <div
                {...attributes}
                className={cx(
                    'rounded-lg',
                    selected && 'ring-ring ring-2 ring-offset-2',
                )}
            >
                {children}
                <DocumentTable table={node as unknown as TableBlock} />
            </div>
        ),
    }),
];

type SaveResult = {
    error: string | null;
    updatedAt?: string;
    conflict?: boolean;
};

/** A document's save fetcher, as the last render saw it. */
type SaveState = {
    saving: boolean;
    data: SaveResult | undefined;
    /** The card is gone: nothing will ever update this again. */
    gone: boolean;
};

type Props = {
    doc: DocumentCard;
    /** From `useDocumentSaveState`, held by the card. */
    saveState: RefObject<SaveState>;
};

function saveKey(documentId: string) {
    return `save-doc:${documentId}`;
}

/**
 * Where a document's saves stand, kept by its card (which stays on the
 * canvas) rather than its editor (which closes with "Back to canvas"): a
 * save still waiting when the editor closes can then see the one in flight
 * finish, and build on the version it returned.
 */
export function useDocumentSaveState(documentId: string) {
    const saver = useFetcher<SaveResult>({ key: saveKey(documentId) });
    const state = useRef<SaveState>({
        saving: false,
        data: undefined,
        gone: false,
    });
    useEffect(() => {
        state.current = {
            saving: saver.state !== 'idle',
            data: saver.data,
            gone: false,
        };
    });
    useEffect(
        () => () => {
            state.current = { ...state.current, gone: true };
        },
        [],
    );
    return state;
}

/** The later of two ISO timestamps. */
function later(a: string, b: string | undefined) {
    return b && b > a ? b : a;
}

/**
 * The focused document, editable: Portable Text with Markdown shortcuts,
 * `@` to link a card, `/` for headings, lists, and card cards. Saves a
 * moment after you stop typing (`update-document`), each save naming the
 * version it builds on; if someone (an agent) saved in between, the server
 * refuses and you choose: load theirs, or keep yours over it.
 */
export function DocumentEditor({ doc, saveState }: Props) {
    const links = useRoomLinks();
    const fetcherKey = saveKey(doc.id);
    const saver = useFetcher<SaveResult>({ key: fetcherKey });
    const submit = useSubmit();
    // The card keeps the fetcher between visits: an answer from an earlier
    // one (a conflict that came back after that editor closed, say) isn't
    // this editor's to show or settle.
    const [openedWith] = useState(saver.data);
    const own = (result: SaveResult | undefined) =>
        result === openedWith ? undefined : result;
    const result = own(saver.data);
    // A new session (remounting the editor) when loading someone else's
    // changes; `startedFrom` is the version it opened at.
    const [session, setSession] = useState({
        key: 0,
        startedFrom: doc.updatedAt,
    });
    const savedVersion =
        result && !result.conflict ? result.updatedAt : undefined;
    const base = later(session.startedFrom, savedVersion);
    const conflict = Boolean(result?.conflict);
    const saving = saver.state !== 'idle';

    const pending = useRef<DocumentBlock[] | null>(null);
    // What the editor holds, saved or not: what "Keep mine" keeps.
    const value = useRef<DocumentBlock[]>(doc.blocks);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const startedFrom = useRef(session.startedFrom);
    useEffect(() => {
        startedFrom.current = session.startedFrom;
    });

    function save(baseUpdatedAt: string) {
        const blocks = pending.current;
        if (!blocks) return;
        pending.current = null;
        void submit(
            {
                intent: 'update-document',
                documentId: doc.id,
                baseUpdatedAt,
                blocks: JSON.stringify(blocks),
            },
            {
                method: 'post',
                action: links.action,
                navigate: false,
                fetcherKey,
            },
        );
    }

    function flush() {
        clearTimeout(timer.current);
        // The card's view of the fetcher, which stays current after this
        // editor closes.
        const { saving, gone } = saveState.current;
        const data = own(saveState.current.data);
        if (data?.conflict || !pending.current) return;
        // One save at a time: the next builds on the version this returns.
        // With the card gone nothing will say when, so send it now.
        if (saving && !gone) {
            timer.current = setTimeout(flush, 200);
            return;
        }
        const saved = data && !data.conflict ? data.updatedAt : undefined;
        save(later(startedFrom.current, saved));
    }
    const flushRef = useRef(flush);
    useEffect(() => {
        flushRef.current = flush;
    });

    // Leaving the document (Back to canvas) saves what's left at once.
    useEffect(() => () => flushRef.current(), []);

    function handleChange(next: PortableTextBlock[] | undefined) {
        pending.current = (next ?? []) as DocumentBlock[];
        value.current = pending.current;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY_MS);
    }

    // Someone else saved since this editor's version, and nothing of ours
    // is on its way: saving now would conflict, so say so first.
    const changedElsewhere = !saving && !conflict && doc.updatedAt > base;

    function loadLatest() {
        pending.current = null;
        value.current = doc.blocks;
        clearTimeout(timer.current);
        saver.reset?.();
        setSession((current) => ({
            key: current.key + 1,
            startedFrom: doc.updatedAt,
        }));
    }

    function keepMine() {
        clearTimeout(timer.current);
        // The refused save already took what was pending; send the
        // editor's text again, over theirs.
        pending.current ??= value.current;
        save(doc.updatedAt);
    }

    return (
        <EditorProvider
            key={session.key}
            initialConfig={{
                schemaDefinition,
                initialValue: doc.blocks as PortableTextBlock[],
            }}
        >
            <EventListenerPlugin
                on={(event) => {
                    if (event.type === 'mutation') handleChange(event.value);
                }}
            />
            <NodePlugin nodes={nodes} />
            <MarkdownShortcutsPlugin
                boldDecorator={() => 'strong'}
                italicDecorator={() => 'em'}
                codeDecorator={() => 'code'}
                defaultStyle={() => 'normal'}
                headingStyle={({ props }) =>
                    props.level === 1 || props.level === 2
                        ? 'h2'
                        : props.level === 3
                          ? 'h3'
                          : undefined
                }
                blockquoteStyle={() => 'blockquote'}
                orderedList={() => 'number'}
                unorderedList={() => 'bullet'}
                linkObject={({ props }) =>
                    props.href.startsWith('card:')
                        ? {
                              _type: 'cardRef',
                              cardId: props.href.slice('card:'.length),
                          }
                        : { _type: 'link', href: props.href }
                }
            />
            {doc.blocks.length === 0 && <FocusOnOpen />}
            <CardLinkPicker documentId={doc.id} />
            <InsertMenuPicker documentId={doc.id} />

            <div className="flex flex-col gap-3">
                <div className="bg-card/95 sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1 backdrop-blur">
                    <Toolbar />
                    <SaveStatus
                        saving={saving || pending.current !== null}
                        failed={Boolean(result?.error) && !conflict}
                    />
                </div>
                {(conflict || changedElsewhere) && (
                    <div
                        role="alert"
                        className="bg-warning/12 text-foreground flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                        <span className="flex-1">
                            {conflict
                                ? 'Someone else changed this document, so your last edit was not saved.'
                                : 'Someone else changed this document while you were editing.'}
                        </span>
                        <Button
                            size="xs"
                            variant="outline"
                            onClick={loadLatest}
                        >
                            Load their version
                        </Button>
                        <Button size="xs" variant="ghost" onClick={keepMine}>
                            Keep mine
                        </Button>
                    </div>
                )}
                <PortableTextEditable
                    aria-label={`Edit ${doc.title}`}
                    // The canvas listens for keys (arrows nudge cards,
                    // Backspace removes them); typing stays in the document.
                    onKeyDown={(event) => event.stopPropagation()}
                    renderPlaceholder={() => (
                        <span className="text-muted-foreground pointer-events-none">
                            Write, or type / to insert and @ to link a card
                        </span>
                    )}
                    className="min-h-40 outline-none [&_p]:my-3"
                />
            </div>
        </EditorProvider>
    );
}

/** A new, empty document: the cursor goes straight in, ready to write. */
function FocusOnOpen() {
    const editor = useEditor();
    useEffect(() => {
        editor.send({ type: 'focus' });
    }, [editor]);
    return null;
}

function SaveStatus({ saving, failed }: { saving: boolean; failed: boolean }) {
    return (
        <span
            role="status"
            className={cx(
                'ms-auto pe-1 text-xs',
                failed ? 'text-destructive' : 'text-muted-foreground',
            )}
        >
            {failed ? 'Not saved' : saving ? 'Saving…' : 'Saved'}
        </span>
    );
}

function Toolbar() {
    const editor = useEditor();
    return (
        <div
            role="toolbar"
            aria-label="Formatting"
            className="flex flex-wrap items-center gap-0.5"
        >
            <StyleButton style="h2" icon={Heading2Icon} label="Heading" />
            <StyleButton style="h3" icon={Heading3Icon} label="Subheading" />
            <StyleButton style="blockquote" icon={QuoteIcon} label="Quote" />
            <Divider />
            <DecoratorButton decorator="strong" icon={BoldIcon} label="Bold" />
            <DecoratorButton decorator="em" icon={ItalicIcon} label="Italic" />
            <DecoratorButton decorator="code" icon={CodeIcon} label="Code" />
            <Divider />
            <ListButton
                listItem="bullet"
                icon={ListIcon}
                label="Bulleted list"
            />
            <ListButton
                listItem="number"
                icon={ListOrderedIcon}
                label="Numbered list"
            />
            <Divider />
            <ToolbarButton
                icon={AtSignIcon}
                label="Link a card"
                pressed={false}
                onClick={() => {
                    editor.send({ type: 'focus' });
                    editor.send({ type: 'insert.text', text: '@' });
                }}
            />
        </div>
    );
}

function Divider() {
    return <span aria-hidden="true" className="bg-border mx-1 h-4 w-px" />;
}

type ButtonProps = {
    icon: LucideIcon;
    label: string;
};

function StyleButton({
    style,
    ...props
}: ButtonProps & { style: (typeof TEXT_STYLES)[number] }) {
    const editor = useEditor();
    const active = useEditorSelector(editor, isActiveStyle(style));
    return (
        <ToolbarButton
            {...props}
            pressed={active}
            onClick={() => {
                editor.send({ type: 'style.toggle', style });
                editor.send({ type: 'focus' });
            }}
        />
    );
}

function DecoratorButton({
    decorator,
    ...props
}: ButtonProps & { decorator: (typeof DECORATORS)[number] }) {
    const editor = useEditor();
    const active = useEditorSelector(editor, isActiveDecorator(decorator));
    return (
        <ToolbarButton
            {...props}
            pressed={active}
            onClick={() => {
                editor.send({ type: 'decorator.toggle', decorator });
                editor.send({ type: 'focus' });
            }}
        />
    );
}

function ListButton({
    listItem,
    ...props
}: ButtonProps & { listItem: (typeof LIST_ITEMS)[number] }) {
    const editor = useEditor();
    const active = useEditorSelector(editor, isActiveListItem(listItem));
    return (
        <ToolbarButton
            {...props}
            pressed={active}
            onClick={() => {
                editor.send({ type: 'list item.toggle', listItem });
                editor.send({ type: 'focus' });
            }}
        />
    );
}

type ToolbarButtonProps = ButtonProps & {
    pressed: boolean;
    onClick: () => void;
    children?: ReactNode;
};

function ToolbarButton({
    icon: Icon,
    label,
    pressed,
    onClick,
}: ToolbarButtonProps) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            // Keep the editor's selection while clicking.
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
            className={cx(pressed && 'bg-accent text-foreground')}
        >
            <Icon aria-hidden="true" />
        </Button>
    );
}
