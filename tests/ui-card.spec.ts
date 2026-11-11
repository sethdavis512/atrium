import type { Page } from '@playwright/test';
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

test.describe('UI cards', () => {
    test('an agent-made UI card shows live numbers and its buttons change the room', async ({
        authedPage: page,
    }) => {
        const room = await mcp(page, 'create_room', {
            spaceId: 'product',
            name: `UI ${crypto.randomUUID().slice(0, 6)}`,
        });
        const board = await mcp(page, 'create_board', {
            roomId: room.id,
            title: 'Offsite',
            key: 'OFF',
        });
        await mcp(page, 'create_issue', {
            boardId: board.id,
            title: 'Book a venue',
            status: 'todo',
        });
        await mcp(page, 'create_issue', {
            boardId: board.id,
            title: 'Plan meals',
            status: 'todo',
        });
        const path = `/boardById/${board.id}`;
        await mcp(page, 'create_ui', {
            roomId: room.id,
            title: 'Offsite tracker',
            spec: {
                root: 'root',
                elements: {
                    root: {
                        type: 'Stack',
                        props: { direction: null, gap: 'md' },
                        children: ['open', 'list'],
                    },
                    open: {
                        type: 'Metric',
                        props: {
                            label: 'Open',
                            value: { $state: `${path}/open` },
                            hint: null,
                        },
                    },
                    list: {
                        type: 'Stack',
                        props: { direction: null, gap: 'sm' },
                        repeat: { statePath: `${path}/issues`, key: 'id' },
                        children: ['card'],
                    },
                    card: {
                        type: 'ListItem',
                        props: {
                            title: { $item: 'title' },
                            subtitle: { $item: 'identifier' },
                            badge: null,
                            cardId: null,
                        },
                        visible: { $item: 'status', neq: 'done' },
                        children: ['done'],
                    },
                    done: {
                        type: 'Button',
                        props: { label: 'Done', variant: 'outline' },
                        on: {
                            press: {
                                action: 'moveIssue',
                                params: {
                                    boardId: { $item: 'boardId' },
                                    issueId: { $item: 'id' },
                                    status: 'done',
                                },
                            },
                        },
                    },
                },
            },
        });

        await page.goto(`/rooms/${room.id}`);
        await waitForHydration(page);
        const card = page.getByRole('article', { name: 'UI: Offsite tracker' });
        await expect(card).toBeVisible();
        const zoom = page.getByRole('button', {
            name: 'Zoom to Offsite tracker',
        });
        if (await zoom.count()) {
            await zoom.focus();
            await page.keyboard.press('Enter');
        }
        await expect(card.getByText('Book a venue')).toBeVisible();
        await expect(card.getByText('2', { exact: true })).toBeVisible();

        // Done moves the real issue, and the card follows the room.
        await card
            .getByText('Book a venue')
            .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
            .getByRole('button', { name: 'Done' })
            .click();
        await expect(card.getByText('Book a venue')).toHaveCount(0);
        await expect(card.getByText('1', { exact: true })).toBeVisible();
        const after = await mcp(page, 'get_card', { cardId: board.id });
        expect(
            after.issues.find(
                (issue: { title: string }) => issue.title === 'Book a venue',
            ).status,
        ).toBe('done');
    });

    test('a spec outside the catalog is refused, with the reason', async ({
        authedPage: page,
    }) => {
        const response = await page.request.post('/api/mcp', {
            headers: { Accept: 'application/json, text/event-stream' },
            data: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'create_ui',
                    arguments: {
                        roomId: 'atlas-launch',
                        title: 'Nope',
                        spec: {
                            root: 'x',
                            elements: { x: { type: 'Iframe', props: {} } },
                        },
                    },
                },
            },
        });
        const { result } = await response.json();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/no component "Iframe"/);
    });
});
