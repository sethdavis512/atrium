# Personas

Who Atrium is for, what they come to get done, and the workflows that get
them there. Use it to check product, copy, and feature decisions against
real kinds of people: "would Rosa open this before a customer call?", "can
Nora find her way around a room she didn't make?".

The people are composites, not real people. Maya, Dev, and Rosa are in the
seed data (`PEOPLE` in `app/models/room.server.ts`), and every persona has a
seeded room to start a walkthrough from.

## How much of this is evidence

Revised on 2026-11-10 against a deep-research pass: 21 sources fetched, 25
claims checked by three independent reviewers each, 18 kept and 7 refuted
(see [Sources](#sources)). Each persona and workflow is labeled:

- **Backed**: rests on a verified finding, cited inline.
- **Partly backed**: the role or pain is backed, the specifics are ours.
- **Hypothesis**: drawn from Atrium's features and seed scenarios. Nothing
  about it survived verification, either because no source covered it or
  because the sources were too weak. Treat it as a guess to test with real
  users.

Almost every source is a vendor with a stake in the answer (Miro,
Atlassian, Glean, Slack, Linear, Figma), and the pain-point numbers are
self-reported. They point in a consistent direction, but they aren't
independent measurements.

### What the research supports

1. **Canvases are cross-functional product tools.** They started in UX
   design and agile product development and spread to workshops, process
   design, and problem-solving [2], [3]. Leaders use them more than individual
   contributors (27.1% of leaders vs 19.9% of ICs used Miro, in a survey of
   2,220 design professionals), which the survey's authors put down to
   cross-functional work [1]. Figma has reported that about two-thirds of
   FigJam's users aren't designers (company figures, reported in the press).
2. **Finding things is the biggest drain.** Knowledge workers say they
   spend about a quarter of their time looking for information, documents,
   or people: 25% in Atlassian's 2025 survey of 12,000 workers [6], and
   about two hours a day in a 2021 Harris Poll for Glean [7].
3. **Switching apps gets in the way.** 56% of people who use many work apps
   say switching between them makes essential work harder (Slack, 2019, so
   before today's AI tools) [8].
4. **Delegating to an agent doesn't hand off responsibility.** In Linear's
   model the agent works on an issue while a person stays responsible, its
   code comes back as a pull request linked to the issue, and its output
   goes through the same review as anyone else's [9]. This is the strongest
   finding, though it describes how one product works, not how widely teams
   work that way.
5. **Trust in AI output is low and falling, and unchecked output costs the
   team.** 33% of developers trust the accuracy of AI tools, down from 43%,
   and the top complaint (66%) is answers that are "almost right, but not
   quite" [10]. 66% of employees who use AI at work have relied on its
   output without checking it, and 40% of US employees received AI
   "workslop" in the past month, each case taking about two hours to deal
   with [11].
6. **Vendors are betting on the shared canvas as the place people and agents
   meet,** because people using AI alone come back with different context
   [4], [12]. That's positioning, not measured demand, but it's the same bet
   Atrium makes with the Concierge, shared memory, and MCP.

What the research could not back: customer success, consultants,
researchers, founders, onboarding, team size, industry, canvas sprawl, or
any anti-persona. Those parts below are hypotheses.

---

## At a glance

| Persona                                            | Role                         | Main job                                                       | Evidence      | Home room (seed)              |
| -------------------------------------------------- | ---------------------------- | -------------------------------------------------------------- | ------------- | ----------------------------- |
| [Maya](#maya-the-head-of-product)                  | Head of Product              | See a launch whole and run reviews from it                     | Backed        | Atlas launch (Product)        |
| [Dev](#dev-the-engineering-lead)                   | Engineering Lead             | Delegate work to agents, review what comes back                | Backed        | Launch retro (Product)        |
| [Kenji](#kenji-the-brand-designer)                 | Brand designer               | Gather references and decisions for a direction, run critiques | Partly backed | Brand refresh (Design)        |
| [Sam](#sam-the-drop-in-contributor)                | Engineer or writer, on loan  | Drop into a room, comment, edit, leave                         | Partly backed | Atlas launch (Product)        |
| [Rosa](#rosa-the-customer-success-manager)         | Customer Success             | Know an account before the call, hand it over cleanly          | Hypothesis    | Northwind (Customers)         |
| [Nora](#nora-the-new-hire)                         | New hire, any team           | Understand a project from its room, without a tour             | Hypothesis    | Any, made by someone else     |
| [The Concierge](#the-concierge-and-outside-agents) | The agent, or any MCP client | Do work in a room and leave it tidy and reviewable             | Backed        | Agent test drive (Playground) |

Plus [workflows that cross personas](#workflows-across-personas) and
[who this is not for](#who-this-is-not-for).

---

## Maya, the Head of Product

**Evidence: backed.** Product leads coordinating cross-functional work are
canvases' core users [1], [3], and the product lifecycle (insights →
critique → spec → brief) is how vendors frame the main jobs [4]. That
framing is a vendor's, not measured use.

**Context:** runs product at a 60-person software company. Owns the Atlas
launch: a brief, a backlog, a few metrics, and a dozen conversations with
engineering, design, and customer success that all touch it.

**Tasks she wants to get done**

- Turn customer feedback and a brainstorm into a launch brief.
- Keep the launch plan current: what's decided, what's in flight, what the
  numbers say.
- Run a launch review from the work itself, not from slides about it.
- Trace a decision back to the chat where it was made and forward to the
  issues it changed.
- Ask the Concierge for a chart, a status summary, or a tidy layout before
  a meeting.

**Workflows**

1. **Brief from insights.** Collect customer quotes and notes in the room
   (Rosa's notes, chat excerpts), ask the Concierge to draft a brief from
   them, edit it, and `@`-link each claim to its source card.
2. **Plan to board.** Break the brief into issues on a board, link the board
   from the brief, and hang charts under it for the metrics that decide
   success.
3. **Review prep.** Ask the Concierge to arrange the room by workstream,
   save views for each part of the review ("Atlas launch", "Launch
   numbers"), and fly between them during the meeting.
4. **Decision trail.** When a call is made in a chat, link the chat to the
   brief and the issues it touched, so the reason stays findable.

**Pains today:** the brief lives in Notion, the issues in Linear, the
numbers in a dashboard, the decisions in Slack threads nobody can find a
week later [6], [8]. Reviews open with ten minutes of "where's the link?".
Status decks are out of date the morning after they're written.

**How Maya uses Atrium:** documents with `@` links, an issue board, charts
hung under the brief, saved views, filters and search to dim everything but
one kind or the Concierge's work, and Arrange.

**What would make her stay:** the room becoming where reviews happen, so it
stays current because people work in it.

**Objections:** "Isn't this another tool to keep in sync?" (today it is:
boards and charts are mocks, not live Linear or analytics). "Who can see my
edits?" (everyone in the workspace; there are no permissions yet).

**Speak to Maya with:** "See your whole launch on one canvas, and how every
piece connects." Lead with the picture, not the card kinds.

**Walkthrough:** Maya opens Atlas launch the morning of a review, flies to
"Launch numbers", asks the Concierge to add a signups chart, links it into
the brief, and saves a view for the meeting.

---

## Dev, the Engineering Lead

**Evidence: backed.** The delegate-and-review loop is the strongest
finding [9], and developers' low trust in AI output [10] is why the review
step has to be easy.

**Context:** leads a team of five and runs several coding agents a day on
cleanup, upgrades, and flaky tests. Reviews more agent pull requests than
human ones.

**Tasks he wants to get done**

- Hand an issue to an agent and get back a pull request with the reasoning
  and sources attached.
- Review agent work the way he'd review a teammate's: what it changed, why,
  and what it read.
- See several agents' runs side by side and spot which ones went wrong.
- Close the loop: merging moves the linked issues to Done.
- Run a retro on a week of agent work from evidence, not anecdotes.

**Workflows**

1. **Delegate and review** (backed [9]). Start an agent chat from an issue,
   or point Claude Code at the room over MCP. The agent works, opens a pull
   request that hangs under its chat, and links it to the issue. Dev reads
   the chat, the PR, and the docs pages the agent read, asks for changes in
   the same chat, then merges, and the issue moves to Done. Dev stays
   responsible throughout.
2. **Take it over.** When an agent gets stuck, Dev opens the work in his
   own tools with the chat's context, finishes it, and the PR still lands in
   the same column.
3. **Retro** (backed as a common practice [5]). After a sprint, the team
   adds sticky notes next to the agent chats they're about, groups and
   votes on them, and turns the action items into issues on a board linked
   back to the retro.

**Pains today:** agent transcripts vanish into terminal scrollback or a
vendor UI that doesn't link to the PR. The docs page an agent relied on is
gone by review time. Output that's "almost right" costs more to debug than
it saved [10].

**How Dev uses Atrium:** live agent chats whose tool calls leave cards in
the room, pull requests hung under the chat that opened them, web page cards
for what the agent read, sticky notes for retro takeaways, and Claude Code
over MCP (`.mcp.json`) so the canvas fills in while he codes.

**What would make him stay:** pull requests backed by a real repository,
and agent chats he can resume with full context.

**Objections:** "The PRs aren't real" (true: no repository behind them
yet). "I won't leave my terminal" (with MCP he doesn't have to).

**Speak to Dev with:** "Every agent run, its PR, and what it read, in one
column." Be concrete and technical; Dev reads tool names.

**Walkthrough:** Dev opens Launch retro after a week of agent work, reads
the three agent chats and their PRs, merges one, watches the linked issue
move to Done, and adds a sticky note about the flaky test.

---

## Kenji, the brand designer

**Evidence: partly backed.** Canvases started in UX design [3] and design
critiques are among the jobs vendors build for [4]. Kenji's specific brand
work is our own scenario.

**Context:** leads a brand refresh across logo, color, and components.
Works across two design boards and a lot of references.

**Tasks he wants to get done**

- Collect references, sketches, and decisions together, with the reasons.
- Run a design critique where people react in place.
- Track design requests and reviews alongside engineering, without leaving
  the visual space.

**Workflows**

1. **Moodboard to direction.** Add images, GIFs, and pages of color tools
   as reference cards, sketch variations next to them, color-code by
   option, and lock the moodboard so Arrange leaves it alone.
2. **Critique.** Share the room, let people leave sticky notes beside the
   options, collect them into a decision note linked to the winning sketch,
   and file follow-ups as issues (DSN, AST boards).
3. **Hand to engineering.** Link the decision note and final references
   from the issue the engineers will pick up.

**Pains today:** moodboards in one tool, tickets in another, rationale in a
doc nobody opens. Quick sketches happen on paper and never reach the team.

**What would make him stay:** uploading files directly (images are https
addresses only today), and a sketch tool good enough to replace paper.

**Objections:** "I can't drop a file in" (true). "It's not Figma" (it isn't
meant to be: it's where Figma links and decisions meet the rest of the
company).

**Speak to Kenji with:** "Your references, sketches, and decisions on one
canvas, next to the work they shape." Show, don't list.

**Walkthrough:** Kenji opens Brand refresh, adds a GIF reference, sketches
a logo variation, locks the moodboard, and files a DSN issue for the next
design review that links the sketch.

---

## Sam, the drop-in contributor

**Evidence: partly backed.** Non-designers are a core group of canvas
users (Figma reports about two-thirds of FigJam users aren't designers), and
much of their use is joining someone else's board to comment and edit [1].
Sam's tasks are our own reading of that.

**Context:** an engineer or technical writer pulled into the Atlas launch
for a week. Gets a link to a room from Maya, not a tour.

**Tasks Sam wants to get done**

- Find the one card Sam was asked about, read it, and answer.
- Leave a comment or an edit where the owner will see it.
- Get out without rearranging anyone's room.

**Workflows**

1. **Answer a question.** Open the link (a card route focuses the card
   straight away), read, reply in the card's chat or edit the document,
   and go back to the canvas.
2. **Leave a trace.** Add a sticky note next to the card and link it, so
   the owner sees it in context.

**Pains today:** a canvas someone else made can look like a wall of cards;
not knowing whether a change will move things for everyone.

**What would make Sam stay:** links that open exactly the right card, and
edits that never disturb someone else's layout.

**Speak to Sam with:** "Open the link, it's right there." Sam never reads
onboarding copy.

**Walkthrough:** Sam opens a link to the Atlas brief's card, reads it
focused, adds a sticky note with a correction linked to the brief, and
closes the tab.

---

## Rosa, the customer success manager

**Evidence: hypothesis.** Findability [6], [7] and app switching [8] are
backed pains in general, but nothing about customer success or account prep
survived verification.

**Context:** manages twelve accounts, Northwind among them. Northwind is
mid-rollout and asking about SSO.

**Tasks she wants to get done**

- Before every call, know what was promised, what's open, and who asked.
- Hand an account to a teammate without a two-hour handover meeting.
- Bring product the customer's own words, linked to the issue they affect.

**Workflows**

1. **Account prep.** Ten minutes before a call: open the account's room,
   search for the topic ("SSO"), read the plan, and ask the Concierge what
   changed since the last call. It remembers customers across spaces.
2. **During and after the call.** Type sticky notes during the call, link
   them to the account document afterwards, and post the follow-up in the
   chat with Maya and Dev.
3. **Handover.** Save views of the room's key parts and send the room link,
   so the new owner tours it without a meeting.

**Pains today:** account context split across CRM notes, email, a shared
doc, and memory. Product asks "which customers want this?" and the answer
takes a day.

**What would make her stay:** finding a customer's history in seconds, and
links from account rooms into the product rooms that mention them.

**Objections:** "Links can't cross rooms" (true today: links and references
stay inside one room, so Northwind can't point at an Atlas issue). "Many
sites won't load in the web card" (frame-blocking; the card offers
open-in-new-tab).

**Speak to Rosa with:** "Everything about an account on one page, ready
before the call." Plain words; no canvas or card jargon.

**Walkthrough:** Rosa has a Northwind call in ten minutes, opens the
Northwind room, searches for SSO, reads the plan, adds a note of the
customer's new question, and links it to the document.

---

## Nora, the new hire

**Evidence: hypothesis.** Nothing on onboarding survived verification.

**Context:** joined last week. Was told "it's all in the room" and handed a
link.

**Tasks she wants to get done**

- Understand what the project is, who's involved, and what's happening now,
  without asking five people.
- Find the one document that matters first.
- Find the issue assigned to her.

**Workflows**

1. **Self-guided tour.** Step through the room's saved views in the floor
   plan, focus each key card, and follow links to see how things relate.
2. **Ask the Concierge.** "What's this project, and who owns what?" It
   answers from the whole workspace and its notes on people and decisions.
3. **Find her work.** Use the directory (⌘K) to search for her name or an
   issue key, and Recent to get back to what she just read.

**Pains today:** onboarding docs are stale, and the real context is in
conversations Nora wasn't part of.

**What would make her stay:** a room that explains itself in the first
minute.

**Objections:** "Where do I start?" (there's no overview or pinned start
card yet; saved views are the closest thing).

**Speak to Nora with:** "Everything the team knows, laid out so you can
follow it." Nora is the real test of empty states and first impressions.

**Walkthrough:** Nora opens Atlas launch for the first time, works through
each saved view, focuses the brief, follows a link to the board, and
searches for the issue assigned to her.

---

## The Concierge and outside agents

**Evidence: backed.** Agents work best as delegates whose output gets the
same review as a teammate's [9], trust in unchecked AI output is low and
falling [10], and unchecked output costs the team hours [11]. Vendors are
moving agents onto the shared canvas for the same reasons [4], [12].

**Context:** the Concierge in live agent chats, or any MCP client (Claude
Code, another agent) connected to `/api/mcp`. Reads and writes the same
store people do, and every change shows on open canvases within seconds.

**Tasks it needs to get done**

- Know what's in a room, and how it relates, before changing it.
- Make cards people can read: documents in Markdown, links that say why.
- Remember what it learns about the company (people, customers, projects,
  decisions) across spaces.
- Leave the canvas tidier than it found it, and its work easy to check.

**Workflows**

1. **Read, then act.** `list_cards`, `get_card`, `search`, and
   `get_layout` before making anything.
2. **Make and attribute.** Create documents (`[text](card:<id>)` references,
   `![](card:<id>)` embeds), boards, charts, and notes; everything it makes
   is marked as the Concierge's (stripe, badge, "By Concierge" filter).
3. **Lay it out for people.** `arrange_cards` and `move_card` to place what
   it made, `save_view` to frame it, so nobody hunts for its work.
4. **Hand back for review.** Link what it made to the chat that asked, so a
   person can check it there before it counts as the team's.

**Pains (for agents in general):** tools with internal names nobody uses;
no sense of space, so an agent can add ten cards and bury the one a person
was reading.

**Speak to the agent with:** tool names and descriptions that say "room"
and "card", obvious parameters, and errors that say what to pass instead.

**Walkthrough:** in Agent test drive, a person asks the Concierge to plan a
launch; it makes a brief, a board with three issues, and a chart, links
them, arranges them into a column, and saves a view.

---

## Workflows across personas

The handoffs matter more than any one person's flow. Each names who hands
what to whom.

| Workflow                     | Handoff                                                                                    | Evidence                          |
| ---------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------- |
| Launch pipeline              | Rosa's customer notes → Maya's brief → Kenji's critique → board → Dev's agents             | Partly backed [4], vendor framing |
| Delegate and review          | Dev → agent (issue) → PR under the chat → Dev reviews → merge moves the issue to Done      | Backed [9]                        |
| Agent work becomes team work | Concierge makes cards → stripe and badge mark them → a person checks and links them in     | Backed [10], [11]                 |
| Retro to action items        | Facilitator → everyone's sticky notes → grouped and voted → issues on a board, linked back | Backed as common practice [5]     |
| Account handover             | Rosa → saved views and room link → the new owner                                           | Hypothesis                        |
| Onboarding                   | Team's saved views and links → Nora → questions to the Concierge                           | Hypothesis                        |
| Drop-in review               | Maya sends a card link → Sam reads it focused → a linked sticky note back                  | Partly backed [1]                 |

What these say Atrium needs most, in order of evidence:

1. **Agent work that's easy to see, attribute, and review** before it
   counts (backed). Attribution exists; an explicit review step doesn't.
2. **Findability across the whole workspace** (backed): the directory, the
   Concierge reading every space, and links that land on the right card.
3. **Fewer places to look** (backed, older data): chats, documents,
   boards, PRs, and pages side by side, linked.
4. **Links across rooms** (hypothesis): Rosa's and the launch pipeline's
   handoffs cross rooms today and can't.

---

## Who this is not for

None of these survived verification. They're judgment calls from Atrium's
design, to revisit with real users.

**The diagrammer.** Wants flowcharts, shapes, and connectors drawn to the
pixel. Atrium is a canvas of working cards, not a whiteboard; flowchart
shapes were removed on 2026-10-25, and features should not drift back
toward Miro.

**The system-of-record admin.** Wants Atrium to replace Linear, the CRM,
or the repository, with permissions and audit trails. Boards, pull requests,
and charts are views of work that lives elsewhere (mocks today,
integrations later), not the source of truth.

**The solo note-taker.** A personal knowledge base with no one to hand off
to gets little from multiplayer rooms, presence, or a shared agent memory.
Heptabase or Muse fit better.

**The locked-down team.** A team that can't let an agent read across every
space (regulated data, client confidentiality) can't use the Concierge as
designed, since its memory and search span the whole workspace.

---

## Open questions

- Does the canvas hold up beyond product, design, and engineering (customer
  success, consulting, research, onboarding), and at what team size does
  sprawl outweigh the benefit of seeing everything spatially?
- How should agent memory be scoped (whole workspace or per space), and
  what review step do teams expect before agent-made cards count as the
  team's work?
- Is there independent (non-vendor) evidence that using AI alone hurts team
  alignment?

---

## Using these personas

- **Feature check:** name the persona and the task a feature serves. If it
  serves none, question it. If it only serves the agent, check that people
  can still read and review what it leaves behind.
- **Copy check:** read labels and empty states as Rosa (plain words), Nora
  (no prior context), and Sam (won't read instructions). Say "room" and
  "card" wherever people or agents read.
- **Evidence check:** prefer the backed personas and workflows when
  priorities conflict, and treat a hypothesis persona's request as
  something to test, not a mandate.
- **Walkthroughs:** each persona's walkthrough starts from a seeded room, so
  it can run against a fresh dev server with no setup.
- **Roadmap signals:** a review step for agent work (Dev, the Concierge),
  real integrations behind boards and pull requests (Maya, Dev), links
  across rooms (Rosa), file uploads (Kenji), a room overview or start card
  (Nora, Sam), and permissions (everyone, and the locked-down team).

---

## Sources

Fetched and verified November 2026. Dates matter: [7] and [8] predate
today's AI tools.

1. UX Tools, 2024 Design Tools Survey, digital whiteboarding trends (2,220
   respondents). https://www.uxtools.co/survey/digital-whiteboarding/trends
2. Sacra, Miro research notes.
   https://sacra.com/chat/h/352f6742-1c66-41d7-9746-2a2878b5bd7d/
3. McKinsey, "How Miro is redefining collaboration across the product
   development life cycle" (interview with Miro's CEO).
   https://karriere.mckinsey.de/capabilities/mckinsey-technology/our-insights/how-miro-is-redefining-collaboration-across-the-product-development-life-cycle
4. Constellation Research, "Miro aims to smooth out AI-human collaboration"
   (Miro Canvas 25, October 2025).
   https://www.constellationr.com/insights/news/miro-aims-smooth-out-ai-human-collaboration
5. Atlassian, "How to run a retro on a Confluence whiteboard" (vendor
   guide). https://www.atlassian.com/software/confluence/resources/guides/how-to/whiteboard-retros
6. Atlassian, State of Teams 2025 (12,000 knowledge workers, 6 markets).
   https://www.atlassian.com/blog/state-of-teams-2025
7. Glean and Harris Poll, hybrid workplace report (1,043 US adults,
   December 2021).
   https://www.glean.com/press/hybrid-workplace-habits-hangups-report-frustrated-employees-spend-a-quarter-of-workweek-searching-for-information-needed-to-do-their-jobs
8. Slack and GlobalWebIndex, "The app era is here" (17,000 knowledge
   workers, 2019). https://slack.com/blog/the-app-era-is-here
9. Linear, AI agents enablement guide.
   https://linear.app/enablement/guide/ai-agents
10. Stack Overflow, 2025 Developer Survey, AI section (49,000+
    respondents). https://survey.stackoverflow.co/2025/ai
11. KPMG and University of Melbourne trust in AI study (2025, 32,352
    workers) and BetterUp Labs and Stanford's "workslop" research (HBR,
    September 2025), as reported by Interaksyon.
    https://interaksyon.philstar.com/trends-spotlights/2025/10/21/303795/ai-workslop-is-creating-unnecessary-extra-work-heres-how-we-can-stop-it/
12. Miro, Intelligent Canvas product page. https://miro.com/intelligent-canvas/

**Refuted in verification; don't cite:** that 35% of workers switch apps
four or more times an hour; that 68% spend 30+ minutes a day switching
apps; that Miro's core adopters are product, engineering, IT, UX,
consulting, marketing, and sales; that about 60% of Miro's customers work
in product, engineering, or design; a specific list of the main jobs done on
Miro boards; that fragmentation across PM, design, and engineering tools was
the canvas's core pain point; and that teams use the canvas as the context
layer feeding AI code generation.
