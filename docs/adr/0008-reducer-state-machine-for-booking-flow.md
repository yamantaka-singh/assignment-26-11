# ADR-0008: The booking flow is a pure reducer state machine

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: the author

## Context

The brief wants the number of people to match the number of tickets "as the person changes their mind, several times", and discourages one large component holding all the state. Edits ripple: removing a person drops their tickets, dinner and workshop choices; changing an age may make a ticket invalid; removing a Family Pass strands its members.

## Decision

All flow state lives in one reducer (`bookingReducer` in `src/booking/machine.ts`, with draft edits in `draftReducer.ts` and helpers in `model.ts`). Steps are `group -> tickets -> extras -> review -> paying -> confirmed`.

- The reducer is pure: no fetch, no clock, no randomness. Ids and idempotency keys arrive inside actions, so every transition is a plain function call in a test.
- Every draft edit goes through `normalizeDraft`, which keeps people, tickets, passes and extras consistent (an age change that moves a person across bands clears tickets that no longer fit; a removed person takes their extras with them).
- Side effects live in separate hooks (`src/booking/effects.ts`): debounced `POST /api/quote` with abort of the previous request, catalog reload, key issue, the single payment request, restore from `#booking=<id>`, and a refresh when the browser goes back online. They dispatch server answers as actions.
- "May I go to the next step?" is answered from the last server quote (`advanceCheck`), not from browser rules. The UI shows the server's field errors next to the fields.
- On a 409 the reducer returns the person to the step that holds the problem, with a notice and refreshed stock.

## Alternatives considered

### Alternative 1: Many `useState` calls in one component
- **Pros**: least ceremony.
- **Cons**: the consistency rules end up scattered across handlers.
- **Why not**: the brief names it as a thing to avoid.

### Alternative 2: A state library (Redux, Zustand, XState)
- **Pros**: tooling, devtools.
- **Cons**: a dependency for one screen flow.
- **Why not**: `useReducer` is already there and is sufficient.

## Consequences

### Positive
- Flow rules (sync, step gating, error routing, double-submit guard) are tested without a DOM (`tests/machine.test.ts`).
- The reducer never contains a price. The only total on screen is the server's.

### Negative
- Gating on the server quote means the Next button waits for a response, and can only be as available as the network. There is a visible loading state, and an offline notice with retry.
- More indirection than a form library. A reader must follow action -> reducer -> effect -> action.
