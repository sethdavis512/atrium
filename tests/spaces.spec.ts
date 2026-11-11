import { test, expect, waitForHydration } from './fixtures';

test.describe('Spaces and rooms', () => {
    test('home lists spaces and their rooms, and each room has its own cards', async ({
        authedPage: page,
    }) => {
        await page.goto('/');
        await waitForHydration(page);
        await expect(
            page.getByRole('heading', { name: 'Spaces', level: 1 }),
        ).toBeVisible();
        const customers = page.getByRole('region', { name: 'Customers' });
        await customers.getByRole('link', { name: /Northwind/ }).click();

        await expect(page).toHaveURL(/\/rooms\/northwind$/);
        await expect(page).toHaveTitle(/^Northwind \|/);
        await expect(
            page.getByRole('article', {
                name: 'Document: Northwind account plan',
            }),
        ).toBeVisible();
        // Atlas launch's cards are in their own room, not this one.
        await expect(
            page.getByRole('article', { name: 'Document: Atlas launch brief' }),
        ).toHaveCount(0);

        // The switcher says where you are and jumps to another room.
        const switcher = page.getByRole('button', {
            name: 'Room: Northwind, in Customers. Switch room',
        });
        await switcher.click();
        await page.getByRole('menuitem', { name: 'Atlas launch' }).click();
        await expect(page).toHaveURL(/\/rooms\/atlas-launch$/);
        await expect(
            page.getByRole('article', { name: 'Document: Atlas launch brief' }),
        ).toBeVisible();
    });

    test('a new room opens with a chat with the agent, ready for cards', async ({
        authedPage: page,
    }) => {
        const name = `Planning ${Date.now()}`;
        await page.goto('/');
        await waitForHydration(page);
        const product = page.getByRole('region', { name: 'Product' });
        await product.getByRole('button', { name: 'New room' }).click();
        await product.getByRole('textbox', { name: 'Room name' }).fill(name);
        await product.getByRole('button', { name: 'Create' }).click();

        await expect(page).toHaveURL(/\/rooms\/room-[\w-]+$/);
        await expect(page).toHaveTitle(new RegExp(`^${name} \\|`));
        await expect(
            page.getByRole('button', {
                name: `Room: ${name}, in Product. Switch room`,
            }),
        ).toBeVisible();
        await expect(page.locator('[data-node-id]')).toHaveCount(1);
        await expect(
            page.getByRole('region', { name: 'Chat: Ask the Concierge' }),
        ).toBeVisible();
    });

    test('an unknown room answers 404 with a way home', async ({
        authedPage: page,
    }) => {
        const response = await page.goto('/rooms/not-a-room');
        expect(response?.status()).toBe(404);
        await expect(page.getByText('That room does not exist.')).toBeVisible();
        await page.getByRole('link', { name: 'All spaces' }).click();
        await expect(page).toHaveURL(/\/$/);
    });
});
