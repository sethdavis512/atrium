import { use, useState, type FormEvent } from 'react';
import { useFetcher } from 'react-router';
import { Handle, type FlowNode, type NodeProps } from '@sethdavis512/trellis';
import { ExternalLinkIcon, GlobeIcon, RotateCwIcon } from 'lucide-react';
import { cx } from 'cva.config';
import { isAgentMade, normalizeWebUrl, type WebCard } from '~/lib/room';
import { AgentBadge, AgentStripe } from './AgentMark';
import {
    FocusedCardContext,
    useCardColors,
    useRoomLinks,
} from './room-context';
import { cardBorderClass } from './card-colors';
import { CardControls } from './CardControls';
import { ZoomOverlay } from './ZoomOverlay';
import { LinkHandle } from './LinkHandle';
import { CardTitle } from './CardTitle';

export type WebNode = FlowNode<{ card: WebCard }, 'web'>;

/**
 * A web page, live in a browser-like card: an address bar (enter a new
 * address to go there; it's saved, so everyone sees the same page), reload,
 * and open in a new tab. The page is a sandboxed iframe that takes clicks
 * only once the card is selected or focused. Many sites refuse to be
 * framed; the footer says so and offers the new tab.
 */
export function WebCardView({ data, selected }: NodeProps<WebNode>) {
    const links = useRoomLinks();
    const card = data.card;
    const { colorOf } = useCardColors();
    const focused = use(FocusedCardContext) === card.id;
    const live = selected || focused;
    const browse = useFetcher({ key: `navigate-web:${card.id}` });
    const pendingUrl = browse.formData?.get('url');
    const url =
        (typeof pendingUrl === 'string' && normalizeWebUrl(pendingUrl)) ||
        card.url;
    // What's typed in the address bar, until it's submitted or left.
    const [draft, setDraft] = useState<string | null>(null);
    const [reloads, setReloads] = useState(0);
    const invalid = draft !== null && !normalizeWebUrl(draft);

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (draft === null || invalid) return;
        const next = normalizeWebUrl(draft)!;
        setDraft(null);
        if (next === card.url) {
            setReloads((count) => count + 1);
            return;
        }
        void browse.submit(
            { intent: 'navigate-web', webId: card.id, url: next },
            { method: 'post', action: links.action },
        );
    }

    return (
        <div className="group/card relative size-full">
            <Handle type="target" position="top" />
            <LinkHandle radius={12} />
            <CardControls
                cardId={card.id}
                title={card.title}
                focused={focused}
                selected={selected}
            />
            <ZoomOverlay
                cardId={card.id}
                title={card.title}
                kind="Web page"
                rounded="rounded-xl"
            />
            <article
                aria-label={`Web page: ${card.title}`}
                className={cx(
                    'bg-card text-card-foreground relative flex size-full flex-col overflow-hidden rounded-xl shadow-lg transition-shadow',
                    cardBorderClass(colorOf(card.id)),
                    selected && 'ring-ring ring-2',
                )}
            >
                {isAgentMade(card) && <AgentStripe />}
                <header className="flex shrink-0 cursor-grab flex-col gap-2 border-b px-3 pt-2.5 pb-2 active:cursor-grabbing">
                    <div className="flex items-center gap-2 px-1">
                        <GlobeIcon
                            aria-hidden="true"
                            className="text-muted-foreground size-4 shrink-0"
                        />
                        <CardTitle
                            cardId={card.id}
                            title={card.title}
                            className="min-w-0 flex-1 truncate text-sm font-semibold"
                        />
                        {isAgentMade(card) && <AgentBadge />}
                    </div>
                    <form
                        onSubmit={handleSubmit}
                        className="nodrag flex cursor-auto items-center gap-1"
                    >
                        <button
                            type="button"
                            aria-label="Reload page"
                            title="Reload"
                            onClick={() => setReloads((count) => count + 1)}
                            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 outline-none focus-visible:ring-2"
                        >
                            <RotateCwIcon
                                aria-hidden="true"
                                className="size-3.5"
                            />
                        </button>
                        <input
                            aria-label="Web address"
                            aria-invalid={invalid}
                            value={draft ?? url}
                            spellCheck={false}
                            onChange={(event) => setDraft(event.target.value)}
                            onBlur={() => setDraft(null)}
                            onKeyDown={(event) => {
                                // Keep the canvas's keys (arrows, Backspace)
                                // out of the address bar.
                                event.stopPropagation();
                                if (event.key === 'Escape') setDraft(null);
                            }}
                            className="bg-muted focus-visible:ring-ring aria-invalid:ring-destructive min-w-0 flex-1 rounded-full px-3 py-1 font-mono text-xs outline-none focus-visible:ring-2 aria-invalid:ring-2"
                        />
                        <a
                            href={url}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label="Open in a new tab"
                            title="Open in a new tab"
                            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring rounded-md p-1.5 outline-none focus-visible:ring-2"
                        >
                            <ExternalLinkIcon
                                aria-hidden="true"
                                className="size-3.5"
                            />
                        </a>
                    </form>
                </header>
                <div className="nodrag nowheel min-h-0 flex-1 bg-white">
                    <iframe
                        key={`${url}#${reloads}`}
                        src={url}
                        title={card.title}
                        loading="lazy"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                        referrerPolicy="no-referrer"
                        className={cx(
                            'size-full border-0',
                            !live && 'pointer-events-none',
                        )}
                    />
                </div>
                <footer className="text-muted-foreground shrink-0 border-t px-4 py-1.5 text-xs">
                    {live
                        ? 'Blank? Some sites refuse to be embedded: open it in a new tab.'
                        : 'Click the card to use the page.'}
                </footer>
            </article>
        </div>
    );
}
