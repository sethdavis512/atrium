import { data } from 'react-router';
import { requireUserFromContext } from '~/context';
import { onDrainStart } from '~/lib/shutdown.server';
import { authMiddleware } from '~/middleware/auth';
import {
    closeAllRoomStreams,
    joinRoom,
    type RoomEvent,
} from '~/models/room-events.server';
import { rememberPerson, roomVersion } from '~/models/room.server';
import type { Route } from './+types/api-room-events';

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

/** A comment line this often keeps proxies from closing a quiet stream. */
const HEARTBEAT_MS = 20_000;
/** How long the browser waits before reconnecting a dropped stream. */
const RETRY_MS = 3000;

/**
 * One open room's event stream (Server-Sent Events): `changed` with the
 * room's new version whenever anyone (a person or an agent) changes it,
 * and `presence` with everyone viewing it. The page reloads its data on
 * `changed`; nothing else travels here.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
    const user = requireUserFromContext(context);
    const { roomId } = params;
    if (!roomVersion(roomId)) {
        throw data('Room not found', { status: 404 });
    }
    const person = rememberPerson(user);
    onDrainStart(closeAllRoomStreams);

    const encoder = new TextEncoder();
    let end = () => {};
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let open = true;
            const write = (chunk: string) => {
                if (!open) return;
                try {
                    controller.enqueue(encoder.encode(chunk));
                } catch {
                    end();
                }
            };
            const send = (event: RoomEvent) =>
                write(
                    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                );

            write(`retry: ${RETRY_MS}\n\n`);
            const leave = joinRoom(roomId, {
                person,
                send,
                close: () => end(),
                versionOf: () => roomVersion(roomId),
            });
            const heartbeat = setInterval(
                () => write(': ping\n\n'),
                HEARTBEAT_MS,
            );
            end = () => {
                if (!open) return;
                open = false;
                clearInterval(heartbeat);
                request.signal.removeEventListener('abort', end);
                leave();
                try {
                    controller.close();
                } catch {
                    // Already closed by the other side.
                }
            };
            request.signal.addEventListener('abort', end);
        },
        cancel() {
            end();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            // no-transform keeps react-router-serve's compression from
            // buffering the stream.
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
        },
    });
}
