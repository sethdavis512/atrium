import type { Locator, Page } from '@playwright/test';
import { test, expect, waitForHydration } from './fixtures';

async function mcp(page: Page, name: string, args: Record<string, unknown>) {
    const response = await page.request.post('/api/mcp', {
        headers: { Accept: 'application/json, text/event-stream' },
        data: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: args },
        },
    });
    const { result } = await response.json();
    return JSON.parse(result.content[0].text);
}

type Spot = { id: string; x: number; y: number; width: number; height: number };

async function layout(page: Page, roomId: string) {
    const spots: Spot[] = await mcp(page, 'get_layout', { roomId });
    return new Map(spots.map((spot) => [spot.id, spot]));
}

/** Drags from the middle of `handle` by (dx, dy) screen px. */
async function dragBy(page: Page, handle: Locator, dx: number, dy: number) {
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
}

/** A room of the test's own: one chat with a pull request under it. */
async function openChatRoom(page: Page) {
    const room = await mcp(page, 'create_room', {
        spaceId: 'product',
        name: `Resize ${crypto.randomUUID().slice(0, 6)}`,
    });
    // A new room starts with a chat with the agent; this test wants an
    // empty canvas.
    for (const card of await mcp(page, 'list_cards', {
        roomId: room.id,
    })) {
        await mcp(page, 'delete_card', { cardId: card.id });
    }
    const chat = await mcp(page, 'create_chat', {
        roomId: room.id,
        title: 'Stretchy',
    });
    const pr = await mcp(page, 'open_pull_request', {
        chatId: chat.id,
        title: 'Hangs below',
        summary: 'Moves with the chat.',
        branch: 'resize',
    });
    await page.goto(`/rooms/${room.id}`);
    await waitForHydration(page);
    return {
        roomId: room.id as string,
        chatId: chat.id as string,
        prId: pr.id as string,
    };
}

test.describe('Resizing cards', () => {
    test('a chat resizes from its edges within its limits, and keeps its size', async ({
        authedPage: page,
    }) => {
        const { roomId, chatId, prId } = await openChatRoom(page);
        const chat = page.getByRole('region', { name: 'Chat: Stretchy' });
        const node = page.locator('.trellis__node', { has: chat });
        const zoom = ((await chat.boundingBox())!.width / 360) as number;

        const right = node.locator('[data-resize="right"]');
        await expect(right).toHaveCSS('cursor', 'ew-resize');
        await expect(node.locator('[data-resize="bottom-left"]')).toHaveCSS(
            'cursor',
            'nesw-resize',
        );

        // Wider from the right edge: only the width changes.
        await dragBy(page, right, 100 * zoom, 40 * zoom);
        await expect
            .poll(async () => {
                const box = (await layout(page, roomId)).get(chatId)!;
                return Math.abs(box.width - 460) <= 2;
            })
            .toBe(true);
        expect((await layout(page, roomId)).get(chatId)).toMatchObject({
            x: 0,
            height: 640,
        });

        // Taller from the bottom: the pull request under it moves down too.
        await dragBy(
            page,
            node.locator('[data-resize="bottom"]'),
            0,
            120 * zoom,
        );
        await expect
            .poll(async () => {
                const spots = await layout(page, roomId);
                const box = spots.get(chatId)!;
                return spots.get(prId)!.y - (box.y + box.height);
            })
            .toBe(48);

        // Never past the limit, never below the resting size.
        await dragBy(
            page,
            node.locator('[data-resize="bottom-right"]'),
            3000,
            3000,
        );
        await expect
            .poll(async () => (await layout(page, roomId)).get(chatId))
            .toMatchObject({ width: 1138, height: 1138 });

        await page.reload();
        await waitForHydration(page);
        await expect(node).toHaveCSS('width', '1138px');
        await dragBy(
            page,
            node.locator('[data-resize="top-left"]'),
            3000,
            3000,
        );
        await expect
            .poll(async () => (await layout(page, roomId)).get(chatId))
            .toMatchObject({ width: 360, height: 640 });
    });

    test('a focused chat has no resize edges, and returns to its saved size', async ({
        authedPage: page,
    }) => {
        const { roomId, chatId } = await openChatRoom(page);
        const chat = page.getByRole('region', { name: 'Chat: Stretchy' });
        const node = page.locator('.trellis__node', { has: chat });
        const zoom = ((await chat.boundingBox())!.width / 360) as number;
        await dragBy(
            page,
            node.locator('[data-resize="right"]'),
            200 * zoom,
            0,
        );
        await expect
            .poll(async () => (await layout(page, roomId)).get(chatId)?.width)
            .toBeGreaterThan(550);
        const saved = (await node.evaluate((el) => el.style.width)) as string;

        await page.goto(`/rooms/${roomId}/cards/${chatId}`);
        await expect(node.locator('[data-resize]')).toHaveCount(0);
        await page.getByRole('link', { name: 'Back to canvas' }).click();
        await expect(node).toHaveCSS('width', saved);
        await expect(node.locator('[data-resize]')).toHaveCount(8);
    });
});
