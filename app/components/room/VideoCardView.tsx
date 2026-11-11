import { use } from 'react';
import { Handle, type FlowNode, type NodeProps } from '@sethdavis512/trellis';
import { ExternalLinkIcon, SquarePlayIcon } from 'lucide-react';
import { cx } from 'cva.config';
import { isAgentMade, youtubeEmbedUrl, type VideoCard } from '~/lib/room';
import { AgentBadge, AgentStripe } from './AgentMark';
import { FocusedCardContext, useCardColors } from './room-context';
import { cardBorderClass } from './card-colors';
import { CardControls } from './CardControls';
import { ZoomOverlay } from './ZoomOverlay';
import { LinkHandle } from './LinkHandle';
import { CardTitle } from './CardTitle';

export type VideoNode = FlowNode<{ card: VideoCard }, 'video'>;

/**
 * A YouTube video, playing in its card (the privacy-enhanced player).
 * The player takes clicks only once the card is selected or focused, so
 * dragging across the canvas never gets caught in the iframe.
 */
export function VideoCardView({ data, selected }: NodeProps<VideoNode>) {
    const card = data.card;
    const { colorOf } = useCardColors();
    const focused = use(FocusedCardContext) === card.id;
    const live = selected || focused;

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
                kind="Video"
                rounded="rounded-xl"
            />
            <article
                aria-label={`Video: ${card.title}`}
                className={cx(
                    'bg-card text-card-foreground relative flex size-full flex-col overflow-hidden rounded-xl shadow-lg transition-shadow',
                    cardBorderClass(colorOf(card.id)),
                    selected && 'ring-ring ring-2',
                )}
            >
                {isAgentMade(card) && <AgentStripe />}
                <header className="flex h-11 shrink-0 cursor-grab items-center gap-2 border-b px-4 active:cursor-grabbing">
                    <SquarePlayIcon
                        aria-hidden="true"
                        className="text-muted-foreground size-4 shrink-0"
                    />
                    <CardTitle
                        cardId={card.id}
                        title={card.title}
                        className="min-w-0 flex-1 truncate text-sm font-semibold"
                    />
                    {isAgentMade(card) && <AgentBadge />}
                    <a
                        href={`https://www.youtube.com/watch?v=${card.videoId}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label="Watch on YouTube"
                        title="Watch on YouTube"
                        className="nodrag text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring rounded-md p-1 outline-none focus-visible:ring-2"
                    >
                        <ExternalLinkIcon
                            aria-hidden="true"
                            className="size-4"
                        />
                    </a>
                </header>
                <div className="nodrag nowheel min-h-0 flex-1 bg-black">
                    <iframe
                        src={youtubeEmbedUrl(card.videoId)}
                        title={card.title}
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        className={cx(
                            'size-full border-0',
                            !live && 'pointer-events-none',
                        )}
                    />
                </div>
            </article>
        </div>
    );
}
