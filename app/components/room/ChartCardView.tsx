import { use, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Handle, type FlowNode, type NodeProps } from '@sethdavis512/trellis';
import { barY, defineChart, lineY } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { ChartColumnIcon, ChartLineIcon } from 'lucide-react';
import { cx } from 'cva.config';
import { isAgentMade, type ChartCard } from '~/lib/room';
import { AgentBadge, AgentStripe } from './AgentMark';
import {
    FocusedCardContext,
    useCards,
    useCardColors,
    useRoomLinks,
} from './room-context';
import { cardBorderClass } from './card-colors';
import { CardControls } from './CardControls';
import { ZoomOverlay } from './ZoomOverlay';
import { LinkHandle } from './LinkHandle';
import { CardTitle } from './CardTitle';

export type ChartNode = FlowNode<{ card: ChartCard }, 'chart'>;

/** Chart paint: an app token, so it follows light and dark. */
const CHART_COLOR = 'var(--color-tint-sky)';

/** The height of an element, kept current as it resizes (a card focusing). */
function useHeight<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [height, setHeight] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            setHeight(Math.floor(entry!.contentRect.height));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [ref, height] as const;
}

/**
 * A small chart (TanStack Charts) attached to the chat or document it
 * explains. The chart fills the card, so it grows when the card is
 * focused.
 */
export function ChartCardView({ data, selected }: NodeProps<ChartNode>) {
    const links = useRoomLinks();
    const card = data.card;
    const { titleOf } = useCards();
    const { colorOf } = useCardColors();
    const focused = use(FocusedCardContext) === card.id;
    const [plotRef, plotHeight] = useHeight<HTMLDivElement>();
    const parentTitle = card.attachedTo ? titleOf(card.attachedTo) : undefined;
    const Icon = card.chart === 'bar' ? ChartColumnIcon : ChartLineIcon;

    const definition = useMemo(
        () =>
            card.chart === 'bar'
                ? defineChart({
                      marks: [
                          barY(card.points, {
                              x: 'label',
                              y: 'value',
                              fill: CHART_COLOR,
                          }),
                      ],
                      scales: {
                          x: { scale: () => scaleBand().padding(0.25) },
                          y: {
                              scale: scaleLinear,
                              nice: true,
                              grid: true,
                              axis: { label: card.unit },
                          },
                      },
                      tooltip,
                  })
                : defineChart({
                      marks: [
                          lineY(card.points, {
                              x: 'label',
                              y: 'value',
                              stroke: CHART_COLOR,
                              points: true,
                          }),
                      ],
                      scales: {
                          x: { scale: () => scalePoint().padding(0.3) },
                          y: {
                              scale: scaleLinear,
                              nice: true,
                              grid: true,
                              axis: { label: card.unit },
                          },
                      },
                      tooltip,
                  }),
        [card.chart, card.points, card.unit],
    );

    return (
        <div className="group/card relative size-full">
            <Handle type="target" position="top" />
            <LinkHandle radius={16} />
            <CardControls
                cardId={card.id}
                title={card.title}
                focused={focused}
                selected={selected}
            />
            <ZoomOverlay
                cardId={card.id}
                title={card.title}
                kind="Chart"
                rounded="rounded-2xl"
            />
            <article
                aria-label={`Chart: ${card.title}`}
                className={cx(
                    'bg-card text-card-foreground relative flex size-full flex-col overflow-hidden rounded-2xl shadow-lg transition-shadow',
                    cardBorderClass(colorOf(card.id)),
                    selected && 'ring-ring ring-2',
                )}
            >
                {isAgentMade(card) && <AgentStripe />}
                <header className="flex cursor-grab items-center gap-2 border-b px-4 pt-3 pb-2 active:cursor-grabbing">
                    <Icon
                        aria-hidden="true"
                        className="text-muted-foreground size-4 shrink-0"
                    />
                    <CardTitle
                        cardId={card.id}
                        title={card.title}
                        className="min-w-0 flex-1 truncate text-sm font-semibold"
                    />
                    {isAgentMade(card) && <AgentBadge />}
                </header>
                <div
                    ref={plotRef}
                    className="nodrag nowheel min-h-0 flex-1 cursor-auto px-2 pt-2"
                >
                    {plotHeight > 0 && (
                        <Chart
                            definition={definition}
                            height={plotHeight}
                            ariaLabel={card.title}
                            ariaDescription={card.caption}
                        />
                    )}
                </div>
                <footer className="text-muted-foreground flex items-center gap-2 border-t px-4 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">
                        {card.caption}
                    </span>
                    {parentTitle && (
                        <Link
                            to={links.card(card.attachedTo!)}
                            className="hover:text-foreground focus-visible:ring-ring shrink-0 rounded font-medium outline-none focus-visible:ring-2"
                        >
                            {parentTitle}
                        </Link>
                    )}
                </footer>
            </article>
        </div>
    );
}
