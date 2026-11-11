import { use, useState } from 'react';
import { Handle, type FlowNode, type NodeProps } from '@sethdavis512/trellis';
import { ExternalLinkIcon, ImageIcon, ImageOffIcon } from 'lucide-react';
import { cx } from 'cva.config';
import { isAgentMade, type ImageCard } from '~/lib/room';
import { AgentBadge, AgentStripe } from './AgentMark';
import { FocusedCardContext, useCardColors } from './room-context';
import { cardBorderClass } from './card-colors';
import { CardControls } from './CardControls';
import { ZoomOverlay } from './ZoomOverlay';
import { LinkHandle } from './LinkHandle';
import { CardTitle } from './CardTitle';

export type ImageNode = FlowNode<{ card: ImageCard }, 'image'>;

/**
 * A picture, fit inside its card whatever its shape (so a focused image
 * grows to fill the canvas). Animated GIFs say "GIF" in the header. If the
 * address stops serving an image, the card says so instead of a broken
 * icon.
 */
export function ImageCardView({ data, selected }: NodeProps<ImageNode>) {
    const card = data.card;
    const { colorOf } = useCardColors();
    const focused = use(FocusedCardContext) === card.id;
    // Which address failed, so a new address tries again.
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const failed = failedSrc === card.src;

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
                kind={card.animated ? 'GIF' : 'Image'}
                rounded="rounded-xl"
            />
            <article
                aria-label={`${card.animated ? 'GIF' : 'Image'}: ${card.title}`}
                className={cx(
                    'bg-card text-card-foreground relative flex size-full flex-col overflow-hidden rounded-xl shadow-lg transition-shadow',
                    cardBorderClass(colorOf(card.id)),
                    selected && 'ring-ring ring-2',
                )}
            >
                {isAgentMade(card) && <AgentStripe />}
                <header className="flex h-11 shrink-0 cursor-grab items-center gap-2 border-b px-4 active:cursor-grabbing">
                    <ImageIcon
                        aria-hidden="true"
                        className="text-muted-foreground size-4 shrink-0"
                    />
                    <CardTitle
                        cardId={card.id}
                        title={card.title}
                        className="min-w-0 flex-1 truncate text-sm font-semibold"
                    />
                    {card.animated && (
                        <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide">
                            GIF
                        </span>
                    )}
                    {isAgentMade(card) && <AgentBadge />}
                    <a
                        href={card.src}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label="Open the original"
                        title="Open the original"
                        className="nodrag text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring rounded-md p-1 outline-none focus-visible:ring-2"
                    >
                        <ExternalLinkIcon
                            aria-hidden="true"
                            className="size-4"
                        />
                    </a>
                </header>
                <div className="bg-muted/40 dark:bg-foreground/85 flex min-h-0 flex-1 items-center justify-center p-3">
                    {failed ? (
                        <p className="text-muted-foreground flex flex-col items-center gap-2 text-center text-sm">
                            <ImageOffIcon
                                aria-hidden="true"
                                className="size-6"
                            />
                            The image couldn't be loaded.
                        </p>
                    ) : (
                        <img
                            src={card.src}
                            alt={card.alt || card.title}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            draggable={false}
                            onError={() => setFailedSrc(card.src)}
                            className="size-full rounded-md object-contain select-none"
                        />
                    )}
                </div>
            </article>
        </div>
    );
}
