import { data, isRouteErrorResponse, Link, useParams } from 'react-router';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { APP_NAME } from '~/config';
import { requireUserFromContext } from '~/context';
import { roomPath } from '~/lib/room';
import { getCardInRoom } from '~/models/room.server';
import type { Route } from './+types/room-card';

/**
 * One card, focused: the parent's canvas zooms to the node whose id is in the
 * URL. This route only checks the card is in this room and names the page; the
 * parent's auth middleware already ran.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
    const user = requireUserFromContext(context);
    const card = await getCardInRoom(user, params.roomId, params.cardId);

    if (!card) {
        throw data('Card not found', { status: 404 });
    }

    return { title: card.title };
}

export default function Card({ loaderData }: Route.ComponentProps) {
    return <title>{`${loaderData.title} | ${APP_NAME}`}</title>;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    const { roomId } = useParams();
    const message =
        isRouteErrorResponse(error) && error.status === 404
            ? 'That card is not in this room.'
            : 'Something went wrong opening that card.';

    return (
        <div
            role="alert"
            className="bg-card pointer-events-auto mx-auto mt-6 flex w-fit items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg"
        >
            <title>{`Not found | ${APP_NAME}`}</title>
            <span>{message}</span>
            <Button
                variant="outline"
                size="sm"
                render={<Link to={roomPath(roomId!)} />}
            >
                <ArrowLeftIcon aria-hidden="true" />
                Back to canvas
            </Button>
        </div>
    );
}
