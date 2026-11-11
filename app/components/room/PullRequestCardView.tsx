import { use, useState, type KeyboardEvent } from 'react';
import { Link, useFetcher } from 'react-router';
import { Handle, type FlowNode, type NodeProps } from '@sethdavis512/trellis';
import {
    CheckCircle2Icon,
    CircleDashedIcon,
    ExternalLinkIcon,
    GitBranchIcon,
    GitPullRequestIcon,
    MessageCircleIcon,
    RefreshCwIcon,
    XCircleIcon,
} from 'lucide-react';
import { cx } from 'cva.config';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import {
    isAgentMade,
    mergeBlockerOf,
    reviewStateOf,
    type PullRequestCard,
    type PullRequestReview,
    type PullRequestStatus,
} from '~/lib/room';
import type { action as roomAction } from '~/routes/room';
import { Avatar } from './Avatar';
import {
    FocusedCardContext,
    useCards,
    useRoomPeople,
    useCardColors,
    useRoomLinks,
} from './room-context';
import { AgentBadge, AgentStripe } from './AgentMark';
import { cardBorderClass } from './card-colors';
import { CardControls } from './CardControls';
import { ZoomOverlay } from './ZoomOverlay';
import { LinkHandle } from './LinkHandle';
import { CardTitle } from './CardTitle';

export type PullRequestNode = FlowNode<
    { card: PullRequestCard },
    'pull-request'
>;

export const PULL_REQUEST_STATUS: Record<
    PullRequestStatus,
    {
        label: string;
        badge: 'success' | 'outline' | 'info' | 'error';
        icon: string;
    }
> = {
    open: { label: 'Open', badge: 'success', icon: 'text-success' },
    draft: { label: 'Draft', badge: 'outline', icon: 'text-muted-foreground' },
    merged: { label: 'Merged', badge: 'info', icon: 'text-tint-violet' },
    closed: { label: 'Closed', badge: 'error', icon: 'text-destructive' },
};

const VERDICT_LOOK: Record<
    PullRequestReview['verdict'],
    { label: string; badge: 'success' | 'warning' | 'outline' }
> = {
    approved: { label: 'Approved', badge: 'success' },
    changes_requested: { label: 'Changes requested', badge: 'warning' },
    commented: { label: 'Commented', badge: 'outline' },
};

/** Keys typed in the review box stay there (the canvas has its own). */
function keepKeys(event: KeyboardEvent) {
    event.stopPropagation();
}

/**
 * A pull request: the code change a chat produced, real when it's backed by
 * GitHub (`pr.github`) and a mock otherwise. Links back to its chat, shows
 * checks, changed files, and reviews, and has the next step as buttons that
 * post to the room action: ready for review, approve or request changes,
 * and merge once a person has approved it (`mergeBlockerOf`).
 */
export function PullRequestCardView({
    data,
    selected,
}: NodeProps<PullRequestNode>) {
    const links = useRoomLinks();
    const pr = data.card;
    const { personById } = useRoomPeople();
    const { titleOf } = useCards();
    const { colorOf } = useCardColors();
    const focused = use(FocusedCardContext) === pr.id;
    const fetcher = useFetcher<typeof roomAction>();
    const reviewFetcher = useFetcher<typeof roomAction>();
    const mergeFetcher = useFetcher<typeof roomAction>();
    const syncFetcher = useFetcher<typeof roomAction>();
    const [requesting, setRequesting] = useState(false);
    const [note, setNote] = useState('');

    // Show the next status at once while it saves.
    const pendingStatus = fetcher.formData?.get('status');
    const status =
        mergeFetcher.state !== 'idle'
            ? 'merged'
            : typeof pendingStatus === 'string'
              ? (pendingStatus as PullRequestStatus)
              : pr.status;
    const reviews = pr.reviews ?? [];
    const reviewState = reviewStateOf(pr);
    const blocker = mergeBlockerOf(pr);
    const error =
        mergeFetcher.data?.error ??
        reviewFetcher.data?.error ??
        syncFetcher.data?.error ??
        fetcher.data?.error;
    const reviewing = reviewFetcher.state !== 'idle';

    function review(verdict: PullRequestReview['verdict'], body = '') {
        reviewFetcher.submit(
            { intent: 'review-pr', pullRequestId: pr.id, verdict, body },
            { method: 'post', action: links.action },
        );
    }
    const look = PULL_REQUEST_STATUS[status];
    const author = personById(pr.authorId);
    const chatTitle = pr.chatId ? titleOf(pr.chatId) : undefined;
    const additions = pr.files.reduce((sum, file) => sum + file.additions, 0);
    const deletions = pr.files.reduce((sum, file) => sum + file.deletions, 0);
    // A GitHub pull request leaves draft on GitHub.
    const readyForReview = status === 'draft' && !pr.github;

    return (
        <div className="group/card relative size-full">
            <Handle type="target" position="top" />
            <LinkHandle radius={16} />
            <CardControls
                cardId={pr.id}
                title={`#${pr.number}`}
                focused={focused}
                selected={selected}
            />
            <ZoomOverlay
                cardId={pr.id}
                title={pr.title}
                kind={`PR #${pr.number}`}
                rounded="rounded-2xl"
            />
            <article
                aria-label={`Pull request: #${pr.number} ${pr.title}`}
                className={cx(
                    'bg-card text-card-foreground relative flex size-full flex-col overflow-hidden rounded-2xl shadow-lg transition-shadow',
                    cardBorderClass(colorOf(pr.id)),
                    selected && 'ring-ring ring-2',
                )}
            >
                {isAgentMade(pr) && <AgentStripe />}
                <header className="flex cursor-grab flex-col gap-2 border-b px-5 pt-4 pb-3 active:cursor-grabbing">
                    <div className="flex items-center gap-2">
                        <GitPullRequestIcon
                            aria-hidden="true"
                            className={cx('size-4 shrink-0', look.icon)}
                        />
                        {pr.github ? (
                            <a
                                href={pr.github.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring nodrag inline-flex items-center gap-1 rounded text-xs outline-none focus-visible:ring-2"
                            >
                                {pr.repo} #{pr.number}
                                <ExternalLinkIcon
                                    aria-label="Open on GitHub"
                                    className="size-3"
                                />
                            </a>
                        ) : (
                            <span className="text-muted-foreground text-xs">
                                {pr.repo} #{pr.number}
                            </span>
                        )}
                        {isAgentMade(pr) && <AgentBadge className="ms-auto" />}
                        <Badge
                            variant={look.badge}
                            className={isAgentMade(pr) ? undefined : 'ms-auto'}
                        >
                            {look.label}
                        </Badge>
                    </div>
                    <CardTitle
                        cardId={pr.id}
                        title={pr.title}
                        className="line-clamp-2 text-sm leading-snug font-semibold"
                    />
                    <p className="text-muted-foreground flex items-center gap-1.5 font-mono text-[11px]">
                        <GitBranchIcon aria-hidden="true" className="size-3" />
                        <span className="truncate">{pr.branch}</span>
                        <span aria-hidden="true">→</span>
                        <span>{pr.base}</span>
                    </p>
                </header>

                <div className="nodrag nowheel flex min-h-0 flex-1 cursor-auto scrollbar-none flex-col gap-4 overflow-y-auto px-5 py-4 text-sm">
                    {chatTitle && (
                        <Link
                            to={links.card(pr.chatId!)}
                            className="bg-muted hover:bg-accent focus-visible:ring-ring flex items-center gap-2 rounded-lg px-3 py-2 text-xs outline-none focus-visible:ring-2"
                        >
                            <MessageCircleIcon
                                aria-hidden="true"
                                className="text-muted-foreground size-3.5"
                            />
                            <span className="text-muted-foreground">
                                From chat
                            </span>
                            <span className="truncate font-medium">
                                {chatTitle}
                            </span>
                        </Link>
                    )}

                    {pr.summary && (
                        <p className="text-muted-foreground leading-snug">
                            {pr.summary}
                        </p>
                    )}

                    <ul
                        aria-label="Checks"
                        className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
                    >
                        <li className="flex items-center gap-1">
                            <CheckCircle2Icon
                                aria-hidden="true"
                                className="text-success size-3.5"
                            />
                            {pr.checks.passed} passed
                        </li>
                        {pr.checks.failed > 0 && (
                            <li className="flex items-center gap-1">
                                <XCircleIcon
                                    aria-hidden="true"
                                    className="text-destructive size-3.5"
                                />
                                {pr.checks.failed} failed
                            </li>
                        )}
                        {pr.checks.pending > 0 && (
                            <li className="flex items-center gap-1">
                                <CircleDashedIcon
                                    aria-hidden="true"
                                    className="text-muted-foreground size-3.5"
                                />
                                {pr.checks.pending} pending
                            </li>
                        )}
                    </ul>

                    {pr.github && (
                        <syncFetcher.Form
                            method="post"
                            action={links.action}
                            className="-mt-2 flex items-center gap-2 text-xs"
                        >
                            <input
                                type="hidden"
                                name="intent"
                                value="sync-pr"
                            />
                            <input
                                type="hidden"
                                name="pullRequestId"
                                value={pr.id}
                            />
                            <span className="text-muted-foreground font-mono">
                                {pr.github.headSha.slice(0, 7)}
                            </span>
                            <Button
                                type="submit"
                                size="xs"
                                variant="ghost"
                                className="nodrag ms-auto"
                                disabled={syncFetcher.state !== 'idle'}
                            >
                                <RefreshCwIcon
                                    aria-hidden="true"
                                    className={cx(
                                        syncFetcher.state !== 'idle' &&
                                            'motion-safe:animate-spin',
                                    )}
                                />
                                Refresh
                            </Button>
                        </syncFetcher.Form>
                    )}

                    <section aria-label="Files changed">
                        <h3 className="text-muted-foreground mb-1.5 flex items-center justify-between text-xs">
                            <span>{pr.files.length} files changed</span>
                            <span className="font-mono">
                                <span className="text-success-foreground">
                                    +{additions}
                                </span>{' '}
                                <span className="text-destructive-foreground">
                                    −{deletions}
                                </span>
                            </span>
                        </h3>
                        <ul className="flex flex-col divide-y rounded-lg border font-mono text-[11px]">
                            {pr.files.map((file) => (
                                <li
                                    key={file.path}
                                    className="flex items-center gap-2 px-2.5 py-1.5"
                                >
                                    <span className="min-w-0 flex-1 truncate">
                                        {file.path}
                                    </span>
                                    <span className="text-success-foreground">
                                        +{file.additions}
                                    </span>
                                    <span className="text-destructive-foreground">
                                        −{file.deletions}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section
                        aria-label="Reviews"
                        className="flex flex-col gap-2"
                    >
                        <h3 className="text-muted-foreground text-xs">
                            {reviews.length === 0
                                ? 'No reviews yet'
                                : `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`}
                        </h3>
                        {reviews.length > 0 && (
                            <ol className="flex flex-col gap-2">
                                {reviews.map((entry) => {
                                    const reviewer = personById(entry.authorId);
                                    const look = VERDICT_LOOK[entry.verdict];
                                    const stale =
                                        pr.github &&
                                        entry.headSha &&
                                        entry.headSha !== pr.github.headSha;
                                    return (
                                        <li
                                            key={entry.id}
                                            className={cx(
                                                'flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-xs',
                                                stale && 'opacity-60',
                                            )}
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <Avatar
                                                    person={reviewer}
                                                    size="sm"
                                                />
                                                <span className="min-w-0 flex-1 truncate font-medium">
                                                    {reviewer?.name ??
                                                        'Someone'}
                                                </span>
                                                <Badge variant={look.badge}>
                                                    {look.label}
                                                </Badge>
                                            </span>
                                            {entry.body && (
                                                <span className="text-muted-foreground leading-snug">
                                                    {entry.body}
                                                </span>
                                            )}
                                            {stale && (
                                                <span className="text-muted-foreground">
                                                    On an earlier commit
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                        {status === 'open' && requesting && (
                            <form
                                className="flex flex-col gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (!note.trim()) return;
                                    review('changes_requested', note);
                                    setNote('');
                                    setRequesting(false);
                                }}
                            >
                                <Textarea
                                    aria-label="What to change"
                                    placeholder="What should change?"
                                    value={note}
                                    autoFocus
                                    onChange={(event) =>
                                        setNote(event.target.value)
                                    }
                                    onKeyDown={keepKeys}
                                    className="nodrag text-xs"
                                />
                                <span className="flex justify-end gap-2">
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="ghost"
                                        className="nodrag"
                                        onClick={() => setRequesting(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        size="xs"
                                        className="nodrag"
                                        disabled={!note.trim() || reviewing}
                                    >
                                        Send to the chat
                                    </Button>
                                </span>
                            </form>
                        )}
                    </section>

                    {error && (
                        <p
                            role="alert"
                            className="text-destructive-foreground text-xs"
                        >
                            {error}
                        </p>
                    )}
                </div>

                <footer className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
                    <Avatar person={author} size="sm" />
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                        {author?.name ?? 'Someone'}
                    </span>
                    {readyForReview && (
                        <fetcher.Form method="post" action={links.action}>
                            <input
                                type="hidden"
                                name="intent"
                                value="set-pr-status"
                            />
                            <input
                                type="hidden"
                                name="pullRequestId"
                                value={pr.id}
                            />
                            <input type="hidden" name="status" value="open" />
                            <Button
                                type="submit"
                                size="xs"
                                variant="outline"
                                className="nodrag"
                            >
                                Ready for review
                            </Button>
                        </fetcher.Form>
                    )}
                    {status === 'open' && (
                        <>
                            {reviewState !== 'approved' && (
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    className="nodrag"
                                    disabled={reviewing}
                                    onClick={() => review('approved')}
                                >
                                    Approve
                                </Button>
                            )}
                            <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                className="nodrag"
                                disabled={reviewing}
                                aria-expanded={requesting}
                                onClick={() => setRequesting(!requesting)}
                            >
                                Request changes
                            </Button>
                            <mergeFetcher.Form
                                method="post"
                                action={links.action}
                            >
                                <input
                                    type="hidden"
                                    name="intent"
                                    value="merge-pr"
                                />
                                <input
                                    type="hidden"
                                    name="pullRequestId"
                                    value={pr.id}
                                />
                                <Button
                                    type="submit"
                                    size="xs"
                                    className="nodrag"
                                    disabled={Boolean(blocker)}
                                    title={blocker ?? undefined}
                                >
                                    Merge
                                </Button>
                            </mergeFetcher.Form>
                        </>
                    )}
                    {status === 'open' && blocker && (
                        <p className="text-muted-foreground w-full text-end text-[11px]">
                            {blocker}
                        </p>
                    )}
                </footer>
            </article>
        </div>
    );
}
