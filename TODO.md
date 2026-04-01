# TODO (Scaffold Roadmap)

## Current Assessment (2026-04-01)

What is already working:

- Conversation page has completed `/bootstrap` bootstrapping and remote scene hydration
- In-chat login card, nickname onboarding, task feedback, report cards and project detail tabs are wired
- Backend now exposes auth, bootstrap, chat, company, task, report, share and project endpoints
- Profile page now includes a development/account panel for mock switching, user sync and logout

Highest-priority gaps next:

- [ ] Unify duplicate shell components under one implementation (`components/app-*` vs `components/shell/app-*`)
- [ ] Remove or refactor legacy pages that still use old mock-only flow (`pages/onboarding`, `pages/chat`, some assistant pages)
- [ ] Add a visible runtime/API status hint in the main conversation shell, not only in Profile
- [ ] Stop silent fallback for more core services so real API failures are easier to detect during联调
- [ ] Replace backend in-memory data with persistent storage when business flows stabilize
- [ ] Restore missing repo docs referenced by README (`PRODUCT_MANUAL.md`, `FRONTEND_TASK_BREAKDOWN.md`)

## Phase 0 - Foundation (current)

- [x] Native mini-program baseline (`app.json`, `app.wxss`, `app.js`)
- [x] Core directories: `pages`, `components`, `services`, `mock`, `utils`, `assets`
- [x] Unified request layer
- [x] Global mock switch + persistence
- [x] Initial API contract and project docs

## Phase 1 - Conversation Shell

- [ ] Normalize shell components (`header`, `sidebar`, `bottom-input`)
- [ ] Add scene renderer protocol for conversation cards
- [ ] Add bootstrapping from `/bootstrap` in a single flow
- [ ] Add error and empty states in conversation container

## Phase 2 - Onboarding Flow

- [ ] In-chat login card state transition
- [ ] Name confirmation and branching logic
- [ ] Park policy hook branch
- [ ] First-scene analytics points

## Phase 3 - System Surfaces

- [ ] Profile page from contract-driven service
- [ ] Project detail tabs (`conversation`, `artifacts`)
- [ ] Company panel actions
- [ ] Consistent card spacing and typography tokens

## Phase 4 - Retention Loop

- [ ] Daily task completion feedback
- [ ] Weekly report card action flow
- [ ] Monthly check action flow
- [ ] Social-proof reactivation card

## Phase 5 - Quality and Delivery

- [ ] Runtime API error boundary
- [ ] Mock vs real API smoke checklist
- [ ] Performance pass (first render + scroll)
- [ ] Design QA against prototype screens
