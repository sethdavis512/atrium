# MVP: Dev's delegate-and-review loop

One persona, one loop, shown end to end. The persona is
[Dev, the engineering lead](PERSONAS.md#dev-the-engineering-lead): he hands
work to agents and stays responsible for what comes back. It's the
best-evidenced persona and workflow in [PERSONAS.md](PERSONAS.md) (delegation
keeps the human accountable; trust in unchecked AI output is low), and it
uses what only Atrium has: agent chats, pull requests hung under the chat
that made them, what the agent read beside it, and outside agents working in
the room over MCP.

## The loop

1. **Delegate.** Dev hands an issue to an agent: the Concierge from the
   issue itself, or Claude Code from his terminal over MCP.
2. **Work in the open.** The agent works in a chat card linked to the issue.
   What it reads (docs pages) and makes lands in the room as cards.
3. **Open a pull request.** A real GitHub PR, shown as a card under the chat,
   linked to the issue, which moves to In Review.
4. **Review.** Dev reads the chat, the diff summary, the checks, and the
   sources side by side, then approves or requests changes. Requested
   changes go back into the agent's chat.
5. **Merge.** Merging needs a person's approval and no failing checks. It
   merges on GitHub, and the linked issue moves to Done.

## In scope

| Piece                     | What it means                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hand an issue to an agent | "Hand to Concierge" on an issue makes an agent chat linked to it and moves it to In Progress. MCP `start_issue` does the same for outside agents.   |
| Real pull requests        | A PR card can be backed by a GitHub PR (`link_pull_request` with its URL): title, branch, description, files, checks, and state come from GitHub.   |
| Review step               | Approve, request changes, or comment on a PR card. Requested changes post to the agent's chat. Reviews show on the card and to agents (`get_card`). |
| Merge gate                | A PR merges only after a person approves it, never the agent, and with no failing checks. GitHub-backed PRs merge on GitHub.                        |
| Issue follows the PR      | Opening a PR from a delegated chat links it to the issue and moves the issue to In Review; merging moves it to Done.                                |
| Refresh                   | A refresh button re-reads a GitHub-backed PR (new commits, checks, merged elsewhere).                                                               |

## Out of scope for the MVP

Webhooks (refresh by hand for now), GitHub reviews mirrored both ways, a
per-person "Sign in with GitHub" connection, multiple repositories per room,
real diffs inline (the card links to GitHub's), permissions, and everything
for other personas (sketches, UI cards, design boards).

## Connecting to GitHub

A **GitHub App** is the production path: GitHub recommends it over OAuth apps
for integrations, its installation tokens expire after an hour, an installer
picks exactly which repositories it can reach, and it gets webhooks for every
repository it's installed on. A **fine-grained personal access token** is
fine for a local demo: it acts as one person and suits short-lived scripts
and testing. Atrium supports both, preferring the app when both are set. It
talks to the REST API with `fetch`, with no SDK.

| Variable                                                                | Mode                                                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID` | GitHub App: Atrium signs a short-lived JWT (RS256) and trades it for an installation token, cached until it nears its hour. |
| `GITHUB_TOKEN`                                                          | Fine-grained personal access token, for local demos.                                                                        |

Permissions either way, on the demo repository only: **Pull requests**
read and write, **Contents** read and write (merging writes to the base
branch), **Checks** read, **Metadata** read.

Setting up the GitHub App (once):

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
   Name it, set the homepage to the app's URL, and turn webhooks off for
   now.
2. Give it the permissions above, create it, then generate a private key
   (a `.pem` download) and note the App ID.
3. Install it on the demo repository only. The installation's URL ends in
   its installation ID.
4. Put the three values in `.env`, with the key's newlines as `\n` in one
   line.

Without any of these set, PR cards stay mocks and `link_pull_request`
explains what's missing.

## Demo script (about three minutes)

Setup: a demo repository with one small open issue's worth of work, the
GitHub variables set, Claude Code connected to Atrium's MCP endpoint
(`.mcp.json`), and the Launch retro room open.

1. **The board.** "This is my team's room. The issue board has ATL-21:
   'Flaky retry in the sync job'." Open the issue.
2. **Delegate.** In Claude Code: "Pick up ATL-21 in Atrium." It calls
   `start_issue`: an agent chat appears on the canvas, linked to the issue,
   which moves to In Progress. (Or click **Hand to Concierge** on the issue.)
3. **Work in the open.** Claude Code posts its plan in the chat, adds the
   docs page it read as a web card under the chat, fixes the code, pushes a
   branch, opens the PR with `gh`, and calls `link_pull_request`.
4. **The PR lands.** A pull request card drops in under the chat with the
   real title, files, and checks; the issue moves to In Review. "Everything
   I need to review is in one column: the conversation, what it read, and
   the change."
5. **Request changes.** "The retry should back off." Request changes on the
   card; the note appears in the agent's chat, the agent pushes a fix, and
   Refresh shows the new commit and checks.
6. **Approve and merge.** Approve, then Merge. It merges on GitHub, and
   ATL-21 moves to Done. "The agent did the work; I stayed responsible for
   it, and anyone can see how it happened."

## Success criteria

- The whole script runs against a real repository without leaving the
  canvas except for Claude Code.
- No agent can merge, or approve its own work.
- A first-time viewer (Nora) can tell from the room who asked, who did the
  work, what it read, who approved it, and what shipped.

## Sources

- GitHub Docs, [Deciding when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app).
- GitHub Docs, [Generating an installation access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app) and [Generating a JSON Web Token for a GitHub App](https://docs.github.com/en/enterprise-server@3.16/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app).
- GitHub Docs, [REST API: pull requests](https://docs.github.com/en/rest/pulls/pulls) (get, list files, merge) and [check runs](https://docs.github.com/ko/rest/checks/runs) (list for a ref).
- Linear, [AI agents enablement guide](https://linear.app/enablement/guide/ai-agents) (delegation keeps the human responsible).
