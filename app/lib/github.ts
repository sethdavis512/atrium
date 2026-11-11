import type { PullRequestCard, PullRequestStatus } from './room';

/** Which pull request a GitHub address points at, or null. */
export function parsePullRequestUrl(
    url: string,
): { owner: string; repo: string; number: number } | null {
    let parsed: URL;
    try {
        parsed = new URL(url.trim());
    } catch {
        return null;
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
        return null;
    }
    const match = parsed.pathname.match(
        /^\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:\/.*)?$/,
    );
    if (!match) return null;
    return { owner: match[1]!, repo: match[2]!, number: Number(match[3]) };
}

/** The parts of a GitHub check run the card counts. */
export type CheckRunState = {
    status: string;
    conclusion: string | null;
};

/**
 * Counts check runs the way the card shows them. Runs still going are
 * pending; success, neutral, and skipped pass; anything else that finished
 * (failure, cancelled, timed out, action required) fails.
 */
export function summarizeCheckRuns(
    runs: CheckRunState[],
): PullRequestCard['checks'] {
    const checks = { passed: 0, failed: 0, pending: 0 };
    for (const run of runs) {
        if (run.status !== 'completed') checks.pending++;
        else if (
            run.conclusion === 'success' ||
            run.conclusion === 'neutral' ||
            run.conclusion === 'skipped'
        ) {
            checks.passed++;
        } else checks.failed++;
    }
    return checks;
}

/** A GitHub pull request's state, in the card's statuses. */
export function pullRequestStatusOf(pr: {
    state: string;
    draft?: boolean;
    merged?: boolean;
    merged_at?: string | null;
}): PullRequestStatus {
    if (pr.merged || pr.merged_at) return 'merged';
    if (pr.state === 'closed') return 'closed';
    return pr.draft ? 'draft' : 'open';
}
