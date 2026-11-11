import type { CSSProperties } from 'react';
import { Handle } from '@sethdavis512/trellis';

/** How far the connect zone reaches outside a card, and into it, in px. */
const OUTSIDE = 10;
const INSIDE = 4;

/**
 * The whole edge of a card is where links start (React Flow's "easy
 * connect"): a band just outside and along its border. Drag from it onto
 * another card to link the two (a "related" relation); it lights up under
 * the pointer. It's a ring (clip-path, which also limits where it can be
 * hit), so the card's own content and header drag are untouched. Links
 * arrive on the hidden `in` handle, though dropping anywhere on a card
 * is enough, and float to whichever sides face each other (`FloatingEdge`).
 */
function ringStyle(inside: number, radius: number) {
    const hole = OUTSIDE + inside;
    // The band is painted as a border, so its inner edge curves along the
    // card's own corner (outer radius minus the border's width).
    const corner = Math.max(radius - inside, 0);
    const far = (n: number) => `calc(100% - ${n}px)`;
    // The hole's corners are cut at 45 degrees inside that curve, so the
    // clip never trims the band's rounded inner edge.
    const holePoints = [
        [`${hole + corner}px`, `${hole}px`],
        [far(hole + corner), `${hole}px`],
        [far(hole), `${hole + corner}px`],
        [far(hole), far(hole + corner)],
        [far(hole + corner), far(hole)],
        [`${hole + corner}px`, far(hole)],
        [`${hole}px`, far(hole + corner)],
        [`${hole}px`, `${hole + corner}px`],
        [`${hole + corner}px`, `${hole}px`],
    ]
        .map((point) => point.join(' '))
        .join(', ');
    return {
        inset: -OUTSIDE,
        top: -OUTSIDE,
        left: -OUTSIDE,
        width: 'auto',
        height: 'auto',
        transform: 'none',
        borderRadius: radius + OUTSIDE,
        borderWidth: hole,
        background: 'transparent',
        zIndex: 0,
        clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${holePoints})`,
        '--trellis-handle-border': 'var(--trellis-handle-bg)',
        '--trellis-selected':
            'color-mix(in oklab, var(--ring) 55%, transparent)',
    } as CSSProperties;
}

/**
 * `inside` is how far the ring reaches into the card; resizable cards pass
 * 0, since their resize bands (`ResizeEdges`) sit just inside the border.
 * `radius` is the card's corner radius in px, so the ring follows it.
 */
export function LinkHandle({
    inside = INSIDE,
    radius,
}: {
    inside?: number;
    radius: number;
}) {
    return (
        <>
            <Handle
                id="in"
                type="target"
                position="left"
                className="opacity-0"
            />
            <Handle
                id="link"
                type="source"
                position="right"
                style={ringStyle(inside, radius)}
                // A faint band while you're over the card says where to
                // grab; it lights up fully under the pointer.
                className="[--trellis-handle-bg:transparent] group-hover/window:[--trellis-handle-bg:color-mix(in_oklab,var(--ring)_18%,transparent)]"
            />
        </>
    );
}
