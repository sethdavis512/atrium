import type { Person } from '~/lib/room';

/**
 * Who is looking at which room, and the nudges that tell them something
 * changed. Each open room holds one event stream (`/api/rooms/:id/events`)
 * that joins a channel here. After anything that may have written to the store
 * (an action, an MCP call, a mock reply), `markChanged()` compares each open
 * room's version with the last one sent and tells that channel when it moved,
 * so the page reloads its data; the loader stays the source of truth.
 *
 * Channels live in this process's memory, like the store itself: one server
 * only. More replicas would need a shared channel (Postgres LISTEN/NOTIFY).
 */

export type RoomEvent =
    | { type: 'changed'; version: string }
    | { type: 'presence'; people: Person[] };

type Listener = {
    person: Person;
    send: (event: RoomEvent) => void;
    close: () => void;
};

type Channel = {
    listeners: Set<Listener>;
    /** The version last sent to this channel. */
    version: string | null;
    versionOf: () => string | null;
};

type Hub = { channels: Map<string, Channel>; flushScheduled: boolean };

// Kept on globalThis, like the store, so dev reloads keep open streams.
const HUB_KEY = Symbol.for('atrium.room-events');
type WithHub = typeof globalThis & { [HUB_KEY]?: Hub };

function hub(): Hub {
    const scope = globalThis as WithHub;
    scope[HUB_KEY] ??= { channels: new Map(), flushScheduled: false };
    return scope[HUB_KEY];
}

/** Everyone viewing a room, once each, in the order they arrived. */
export function presenceOn(roomId: string): Person[] {
    const channel = hub().channels.get(roomId);
    if (!channel) return [];
    const people = new Map<string, Person>();
    for (const { person } of channel.listeners) {
        if (!people.has(person.id)) people.set(person.id, person);
    }
    return [...people.values()];
}

function broadcast(channel: Channel, event: RoomEvent) {
    for (const listener of channel.listeners) listener.send(event);
}

function broadcastPresence(roomId: string) {
    const channel = hub().channels.get(roomId);
    if (channel) {
        broadcast(channel, { type: 'presence', people: presenceOn(roomId) });
    }
}

/**
 * Joins a room's channel: the new listener hears the current version and
 * who's here at once, and everyone else hears that they arrived. Returns
 * the way out.
 */
export function joinRoom(
    roomId: string,
    {
        person,
        send,
        close,
        versionOf,
    }: Listener & { versionOf: () => string | null },
): () => void {
    const { channels } = hub();
    let channel = channels.get(roomId);
    if (!channel) {
        channel = { listeners: new Set(), version: versionOf(), versionOf };
        channels.set(roomId, channel);
    }
    const listener: Listener = { person, send, close };
    channel.listeners.add(listener);
    if (channel.version) send({ type: 'changed', version: channel.version });
    broadcastPresence(roomId);

    return () => {
        const current = channels.get(roomId);
        if (!current?.listeners.delete(listener)) return;
        if (current.listeners.size === 0) channels.delete(roomId);
        else broadcastPresence(roomId);
    };
}

/** Sends each channel whose room's version moved the new version. */
export function flushChanges() {
    const state = hub();
    state.flushScheduled = false;
    for (const channel of state.channels.values()) {
        const version = channel.versionOf();
        if (!version || version === channel.version) continue;
        channel.version = version;
        broadcast(channel, { type: 'changed', version });
    }
}

/**
 * Something may have written to the store. Checks once the current task is
 * done, so a burst of writes (an MCP call that touches many cards) sends
 * one event per room.
 */
export function markChanged() {
    const state = hub();
    if (state.flushScheduled) return;
    state.flushScheduled = true;
    setTimeout(flushChanges, 0);
}

/** Ends every open stream, so a shutting-down server can drain. */
export function closeAllRoomStreams() {
    for (const channel of hub().channels.values()) {
        for (const listener of [...channel.listeners]) listener.close();
    }
    hub().channels.clear();
}
