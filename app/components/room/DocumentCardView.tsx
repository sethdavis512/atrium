import { use } from 'react';
import { Handle, type FlowNode, type NodeProps } from '@sethdavis512/trellis';
import { FileTextIcon } from 'lucide-react';
import { cx } from 'cva.config';
import { isAgentMade, type DocumentCard } from '~/lib/room';
import { Avatar } from './Avatar';
import { DocumentBody } from './DocumentBody';
import { DocumentEditor, useDocumentSaveState } from './DocumentEditor';
import { CardControls } from './CardControls';
import { ZoomOverlay } from './ZoomOverlay';
import {
    FocusedCardContext,
    useRoomPeople,
    useCardColors,
} from './room-context';
import { AgentBadge, AgentStripe } from './AgentMark';
import { cardBorderClass } from './card-colors';
import { LinkHandle } from './LinkHandle';
import { CardTitle } from './CardTitle';

export type DocumentNode = FlowNode<{ card: DocumentCard }, 'document'>;

export function DocumentCardView({ data, selected }: NodeProps<DocumentNode>) {
    const doc = data.card;
    const { personById } = useRoomPeople();
    const author = personById(doc.authorId);
    const focused = use(FocusedCardContext) === doc.id;
    const { colorOf } = useCardColors();
    const saveState = useDocumentSaveState(doc.id);

    return (
        <div className="group/card relative size-full">
            <Handle type="target" position="top" />
            <LinkHandle radius={12} />
            {/* Charts hang below their document. */}
            <Handle id="bottom" type="source" position="bottom" />
            <CardControls
                cardId={doc.id}
                title={doc.title}
                focused={focused}
                selected={selected}
            />
            <ZoomOverlay
                cardId={doc.id}
                title={doc.title}
                kind="Document"
                rounded="rounded-xl"
            />
            <article
                aria-label={`Document: ${doc.title}`}
                className={cx(
                    'bg-card text-card-foreground relative flex size-full flex-col overflow-hidden rounded-xl shadow-lg transition-shadow',
                    cardBorderClass(colorOf(doc.id)),
                    selected && 'ring-ring ring-2',
                )}
            >
                {isAgentMade(doc) && <AgentStripe />}
                <header className="bg-muted/50 flex cursor-grab items-center gap-3 border-b px-5 py-3 active:cursor-grabbing">
                    <FileTextIcon
                        aria-hidden="true"
                        className="text-muted-foreground size-4"
                    />
                    <CardTitle
                        cardId={doc.id}
                        title={doc.title}
                        className="truncate text-sm font-semibold"
                    />
                    {isAgentMade(doc) && <AgentBadge />}
                    <div className="text-muted-foreground ml-auto flex items-center gap-2 text-xs">
                        <Avatar person={author} size="sm" />
                        <span>
                            Edited by {author?.name ?? 'someone'}{' '}
                            <time
                                dateTime={doc.updatedAt}
                                suppressHydrationWarning
                            >
                                {new Date(doc.updatedAt).toLocaleDateString(
                                    [],
                                    {
                                        month: 'short',
                                        day: 'numeric',
                                    },
                                )}
                            </time>
                        </span>
                    </div>
                </header>
                <div className="nodrag nowheel min-h-0 flex-1 cursor-auto scrollbar-none overflow-y-auto px-12 py-8">
                    <div className="prose prose-sm dark:prose-invert mx-auto max-w-3xl">
                        <h1>{doc.title}</h1>
                        {focused ? (
                            <DocumentEditor doc={doc} saveState={saveState} />
                        ) : (
                            <DocumentBody blocks={doc.blocks} />
                        )}
                    </div>
                </div>
            </article>
        </div>
    );
}
