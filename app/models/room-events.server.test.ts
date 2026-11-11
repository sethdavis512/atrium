import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Person } from '~/lib/room';
import {
    closeAllRoomStreams,
    flushChanges,
    joinRoom,
    markChanged,
    presenceOn,
    type RoomEvent,
} from './room-events.server';

const alice: Person = { id: 'a', name: 'Alice', initials: 'A', role: 'Member' };
const bob: Person = { id: 'b', name: 'Bob', initials: 'B', role: 'Member' };

function listener(person: Person, versionOf: () => string | null) {
    const events: RoomEvent[] = [];
    const close = vi.fn();
    return {
        events,
        close,
        options: {
            person,
            send: (e: RoomEvent) => events.push(e),
            close,
            versionOf,
        },
    };
}

afterEach(() => {
    closeAllRoomStreams();
    vi.useRealTimers();
});

describe('room events', () => {
    it('tells a newcomer the version and who is here, and everyone else that they came and went', () => {
        const first = listener(alice, () => 'v1');
        const second = listener(bob, () => 'v1');
        joinRoom('s', first.options);
        const leave = joinRoom('s', second.options);

        expect(second.events).toEqual([
            { type: 'changed', version: 'v1' },
            { type: 'presence', people: [alice, bob] },
        ]);
        expect(first.events.at(-1)).toEqual({
            type: 'presence',
            people: [alice, bob],
        });

        leave();
        expect(first.events.at(-1)).toEqual({
            type: 'presence',
            people: [alice],
        });
        expect(presenceOn('s')).toEqual([alice]);
    });

    it('lists a person with two tabs open once', () => {
        joinRoom('s', listener(alice, () => 'v1').options);
        joinRoom('s', listener(alice, () => 'v1').options);
        expect(presenceOn('s')).toEqual([alice]);
    });

    it('sends a room the new version only when it moved, once per burst', async () => {
        vi.useFakeTimers();
        let version = 'v1';
        const watching = listener(alice, () => version);
        const other = listener(bob, () => 'w1');
        joinRoom('s', watching.options);
        joinRoom('t', other.options);
        const sent = () =>
            watching.events.filter((event) => event.type === 'changed');

        markChanged();
        await vi.runAllTimersAsync();
        expect(sent()).toHaveLength(1);

        version = 'v2';
        markChanged();
        markChanged();
        await vi.runAllTimersAsync();
        expect(sent()).toEqual([
            { type: 'changed', version: 'v1' },
            { type: 'changed', version: 'v2' },
        ]);
        expect(other.events.filter((e) => e.type === 'changed')).toHaveLength(
            1,
        );
    });

    it('ends every stream for shutdown', () => {
        const watching = listener(alice, () => 'v1');
        joinRoom('s', watching.options);
        closeAllRoomStreams();
        expect(watching.close).toHaveBeenCalledOnce();
        expect(presenceOn('s')).toEqual([]);
        flushChanges();
    });
});
