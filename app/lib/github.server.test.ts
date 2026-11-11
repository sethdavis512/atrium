import { generateKeyPairSync, createVerify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
    GITHUB_TOKEN: 'github_pat_test' as string | undefined,
    GITHUB_APP_ID: undefined as string | undefined,
    GITHUB_APP_PRIVATE_KEY: undefined as string | undefined,
    GITHUB_APP_INSTALLATION_ID: undefined as string | undefined,
}));
vi.mock('~/lib/env.server', () => ({ env }));

import {
    appJwt,
    githubMode,
    mergeOnGitHub,
    readPullRequest,
} from './github.server';

afterEach(() => {
    vi.unstubAllGlobals();
});

function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('github.server', () => {
    it('signs an RS256 app JWT GitHub can verify', () => {
        const { privateKey, publicKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
        });
        const pem = privateKey
            .export({ type: 'pkcs1', format: 'pem' })
            .toString();
        const now = Date.parse('2026-11-10T12:00:00Z');
        const jwt = appJwt({ appId: '123', privateKey: pem }, now);
        const [header, payload, signature] = jwt.split('.');
        expect(
            JSON.parse(Buffer.from(header!, 'base64url').toString()),
        ).toEqual({ alg: 'RS256', typ: 'JWT' });
        expect(
            JSON.parse(Buffer.from(payload!, 'base64url').toString()),
        ).toEqual({ iat: now / 1000 - 60, exp: now / 1000 + 540, iss: '123' });
        const verifier = createVerify('RSA-SHA256');
        verifier.update(`${header}.${payload}`);
        expect(
            verifier.verify(publicKey, Buffer.from(signature!, 'base64url')),
        ).toBe(true);
    });

    it('prefers the app, then a token', () => {
        expect(githubMode()).toBe('token');
        env.GITHUB_APP_ID = '1';
        env.GITHUB_APP_PRIVATE_KEY = 'key';
        env.GITHUB_APP_INSTALLATION_ID = '2';
        expect(githubMode()).toBe('app');
        env.GITHUB_APP_ID = undefined;
        env.GITHUB_APP_PRIVATE_KEY = undefined;
        env.GITHUB_APP_INSTALLATION_ID = undefined;
    });

    it('reads a pull request with its files and head checks', async () => {
        const fetch = vi.fn(async (url: string) => {
            if (url.endsWith('/pulls/12')) {
                return respond({
                    html_url: 'https://github.com/acme/atlas/pull/12',
                    number: 12,
                    title: 'Back off between retries',
                    body: 'Fixes ATL-21.',
                    state: 'open',
                    draft: false,
                    head: { ref: 'fix/retry', sha: 'abc1234' },
                    base: { ref: 'main', repo: { full_name: 'acme/atlas' } },
                });
            }
            if (url.includes('/pulls/12/files')) {
                return respond([
                    { filename: 'sync/retry.ts', additions: 12, deletions: 3 },
                ]);
            }
            if (url.includes('/commits/abc1234/check-runs')) {
                return respond({
                    check_runs: [
                        { status: 'completed', conclusion: 'success' },
                        { status: 'in_progress', conclusion: null },
                    ],
                });
            }
            return respond({ message: 'Not Found' }, 404);
        });
        vi.stubGlobal('fetch', fetch);

        const pr = await readPullRequest({
            owner: 'acme',
            repo: 'atlas',
            number: 12,
        });
        expect(pr).toMatchObject({
            title: 'Back off between retries',
            summary: 'Fixes ATL-21.',
            branch: 'fix/retry',
            base: 'main',
            status: 'open',
            headSha: 'abc1234',
            files: [{ path: 'sync/retry.ts', additions: 12, deletions: 3 }],
            checks: { passed: 1, failed: 0, pending: 1 },
        });
        const [, init] = fetch.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect((init.headers as Record<string, string>).Authorization).toBe(
            'Bearer github_pat_test',
        );
    });

    it('merges at the reviewed commit and reports what GitHub refused', async () => {
        const fetch = vi.fn(async () =>
            respond({ message: 'Head branch was modified.' }, 409),
        );
        vi.stubGlobal('fetch', fetch);
        await expect(
            mergeOnGitHub({
                owner: 'acme',
                repo: 'atlas',
                number: 12,
                headSha: 'abc1234',
            }),
        ).rejects.toThrow(/409: Head branch was modified/);
        const [url, init] = fetch.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(url).toBe(
            'https://api.github.com/repos/acme/atlas/pulls/12/merge',
        );
        expect(JSON.parse(init.body as string)).toEqual({
            sha: 'abc1234',
            merge_method: 'squash',
        });
    });
});
