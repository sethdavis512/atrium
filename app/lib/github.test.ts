import { describe, expect, it } from 'vitest';
import {
    parsePullRequestUrl,
    pullRequestStatusOf,
    summarizeCheckRuns,
} from './github';

describe('parsePullRequestUrl', () => {
    it('reads owner, repo, and number from a pull request address', () => {
        expect(
            parsePullRequestUrl('https://github.com/acme/atlas.app/pull/42'),
        ).toEqual({ owner: 'acme', repo: 'atlas.app', number: 42 });
        expect(
            parsePullRequestUrl(
                ' https://github.com/acme/atlas/pull/7/files?diff=split ',
            ),
        ).toEqual({ owner: 'acme', repo: 'atlas', number: 7 });
    });

    it('refuses anything that is not a GitHub pull request', () => {
        for (const url of [
            'http://github.com/acme/atlas/pull/1',
            'https://gitlab.com/acme/atlas/pull/1',
            'https://github.com/acme/atlas/issues/1',
            'https://github.com/acme/atlas',
            'not a url',
        ]) {
            expect(parsePullRequestUrl(url)).toBeNull();
        }
    });
});

describe('summarizeCheckRuns', () => {
    it('counts running checks as pending and finished ones by conclusion', () => {
        expect(
            summarizeCheckRuns([
                { status: 'completed', conclusion: 'success' },
                { status: 'completed', conclusion: 'skipped' },
                { status: 'completed', conclusion: 'neutral' },
                { status: 'completed', conclusion: 'failure' },
                { status: 'completed', conclusion: 'timed_out' },
                { status: 'in_progress', conclusion: null },
                { status: 'queued', conclusion: null },
            ]),
        ).toEqual({ passed: 3, failed: 2, pending: 2 });
    });
});

describe('pullRequestStatusOf', () => {
    it('maps GitHub states onto the card', () => {
        expect(pullRequestStatusOf({ state: 'open' })).toBe('open');
        expect(pullRequestStatusOf({ state: 'open', draft: true })).toBe(
            'draft',
        );
        expect(
            pullRequestStatusOf({ state: 'closed', merged_at: '2026-11-10' }),
        ).toBe('merged');
        expect(pullRequestStatusOf({ state: 'closed' })).toBe('closed');
    });
});
