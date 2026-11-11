import { sketchPng } from '~/lib/sketch-png.server';
import type { Card } from '~/lib/room';
import { RoomError } from './room.server';

/**
 * What a card looks like, for agents that read pictures: a sketch drawn as
 * a PNG, or an image card's own address. Other kinds have nothing to see
 * beyond their text, which `read_card` / `get_card` already give.
 */
export type CardPicture =
    { mediaType: 'image/png'; data: string } | { url: string; alt: string };

export function pictureOf(card: Card): CardPicture {
    if (card.kind === 'sketch') {
        return {
            mediaType: 'image/png',
            data: sketchPng(card.strokes).toString('base64'),
        };
    }
    if (card.kind === 'image') return { url: card.src, alt: card.alt };
    throw new RoomError(
        `"${card.title}" is a ${card.kind}: only sketches and images have a picture to look at. Read it instead.`,
    );
}
