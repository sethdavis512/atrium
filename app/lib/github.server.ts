import { createSign } from 'node:crypto';
import { env } from '~/lib/env.server';
import {
    pullRequestStatusOf,
    summarizeCheckRuns,
    type CheckRunState,
} from '~/lib/github';
import type {
    PullRequestCard,
    PullRequestFile,
    PullRequestStatus,
} from '~/lib/room';

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/** A GitHub call that failed, with GitHub's status and message. */
export class GitHubError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = 'GitHubError';
    }
}

type AppCredentials = {
    appId: string;
    privateKey: string;
    installationId: string;
};

function appCredentials(): AppCredentials | null {
    const {
        GITHUB_APP_ID,
        GITHUB_APP_PRIVATE_KEY,
        GITHUB_APP_INSTALLATION_ID,
    } = env;
    if (
        !GITHUB_APP_ID ||
        !GITHUB_APP_PRIVATE_KEY ||
        !GITHUB_APP_INSTALLATION_ID
    ) {
        return null;
    }
    return {
        appId: GITHUB_APP_ID,
        // .env keeps the key on one line with its newlines written as \n.
        privateKey: GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
        installationId: GITHUB_APP_INSTALLATION_ID,
    };
}

/** How Atrium reaches GitHub, or null when it isn't connected. */
export function githubMode(): 'app' | 'token' | null {
    if (appCredentials()) return 'app';
    if (env.GITHUB_TOKEN) return 'token';
    return null;
}

/** Says what to set when GitHub isn't connected. */
export const GITHUB_NOT_CONNECTED =
    'GitHub is not connected: set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID (or GITHUB_TOKEN for a local demo). See docs/MVP.md.';

function base64url(input: string | Buffer) {
    return Buffer.from(input).toString('base64url');
}

/**
 * A JWT that proves Atrium is the GitHub App: RS256, issued a minute in the
 * past for clock drift, good for nine minutes (GitHub allows ten).
 */
export function appJwt(
    { appId, privateKey }: Pick<AppCredentials, 'appId' | 'privateKey'>,
    now = Date.now(),
) {
    const seconds = Math.floor(now / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(
        JSON.stringify({
            iat: seconds - 60,
            exp: seconds + 9 * 60,
            iss: appId,
        }),
    );
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(privateKey).toString('base64url');
    return `${header}.${payload}.${signature}`;
}

/** The installation token, kept until five minutes before it expires. */
let cachedToken: { token: string; expiresAt: number } | null = null;

async function installationToken(credentials: AppCredentials) {
    if (cachedToken && cachedToken.expiresAt - Date.now() > 5 * 60_000) {
        return cachedToken.token;
    }
    const response = await fetch(
        `${API}/app/installations/${credentials.installationId}/access_tokens`,
        {
            method: 'POST',
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${appJwt(credentials)}`,
                'X-GitHub-Api-Version': API_VERSION,
            },
        },
    );
    const body = (await response.json().catch(() => ({}))) as {
        token?: string;
        expires_at?: string;
        message?: string;
    };
    if (!response.ok || !body.token) {
        throw new GitHubError(
            `GitHub refused the app's token request: ${body.message ?? response.statusText}`,
            response.status,
        );
    }
    cachedToken = {
        token: body.token,
        expiresAt: body.expires_at
            ? Date.parse(body.expires_at)
            : Date.now() + 3_600_000,
    };
    return cachedToken.token;
}

async function authorization() {
    const credentials = appCredentials();
    if (credentials) return `Bearer ${await installationToken(credentials)}`;
    if (env.GITHUB_TOKEN) return `Bearer ${env.GITHUB_TOKEN}`;
    throw new GitHubError(GITHUB_NOT_CONNECTED, 503);
}

async function github<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
): Promise<T> {
    const response = await fetch(`${API}${path}`, {
        method: init.method ?? 'GET',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: await authorization(),
            'X-GitHub-Api-Version': API_VERSION,
            ...(init.body !== undefined && {
                'Content-Type': 'application/json',
            }),
        },
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as T & {
        message?: string;
    };
    if (!response.ok) {
        throw new GitHubError(
            `GitHub answered ${response.status}: ${body.message ?? response.statusText}`,
            response.status,
        );
    }
    return body;
}

type GitHubPullRequest = {
    html_url: string;
    number: number;
    title: string;
    body: string | null;
    state: string;
    draft?: boolean;
    merged?: boolean;
    merged_at?: string | null;
    head: { ref: string; sha: string };
    base: { ref: string; repo: { full_name: string } };
};

/** Everything a pull request card shows, read from GitHub. */
export type PullRequestSnapshot = {
    url: string;
    owner: string;
    repo: string;
    number: number;
    title: string;
    summary: string;
    branch: string;
    base: string;
    status: PullRequestStatus;
    headSha: string;
    files: PullRequestFile[];
    checks: PullRequestCard['checks'];
};

const SUMMARY_LIMIT = 600;
const FILE_LIMIT = 50;

/** Reads a pull request, its changed files, and its head commit's checks. */
export async function readPullRequest(ref: {
    owner: string;
    repo: string;
    number: number;
}): Promise<PullRequestSnapshot> {
    const base = `/repos/${ref.owner}/${ref.repo}`;
    const pr = await github<GitHubPullRequest>(`${base}/pulls/${ref.number}`);
    const [files, checkRuns] = await Promise.all([
        github<{ filename: string; additions: number; deletions: number }[]>(
            `${base}/pulls/${ref.number}/files?per_page=${FILE_LIMIT}`,
        ),
        github<{ check_runs: CheckRunState[] }>(
            `${base}/commits/${pr.head.sha}/check-runs?per_page=100`,
        ),
    ]);
    const summary = (pr.body ?? '').trim();
    return {
        url: pr.html_url,
        owner: ref.owner,
        repo: ref.repo,
        number: pr.number,
        title: pr.title,
        summary:
            summary.length > SUMMARY_LIMIT
                ? `${summary.slice(0, SUMMARY_LIMIT).trimEnd()}…`
                : summary,
        branch: pr.head.ref,
        base: pr.base.ref,
        status: pullRequestStatusOf(pr),
        headSha: pr.head.sha,
        files: files.map((file) => ({
            path: file.filename,
            additions: file.additions,
            deletions: file.deletions,
        })),
        checks: summarizeCheckRuns(checkRuns.check_runs),
    };
}

/**
 * Merges on GitHub, squashing, only if the head is still the commit that
 * was reviewed (GitHub answers 409 when it moved, 405 when it can't merge).
 */
export async function mergeOnGitHub(ref: {
    owner: string;
    repo: string;
    number: number;
    headSha: string;
}) {
    await github(`/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/merge`, {
        method: 'PUT',
        body: { sha: ref.headSha, merge_method: 'squash' },
    });
}
