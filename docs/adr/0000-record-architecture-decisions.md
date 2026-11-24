# ADR-0000: Record architecture decisions

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: the author

## Context

The brief (section 9) wants to see where a plan changed, and the interview walks through "why did you choose X". Reasons that live only in chat or memory are gone by then.

## Decision

Significant decisions are written as short ADRs in `docs/adr/`, numbered, using the Context / Decision / Alternatives / Consequences format. They are written close to the moment of decision and not rewritten later. A changed decision gets a new ADR that supersedes the old one.

`DESIGN.md` (the pre-coding note) is likewise left as written. The README section "How the plan changed" lists where the code differs from it.

## Alternatives considered

- **Only the README.** Rejected: the README is a summary for a stranger, not a log of trade-offs.
- **Comments in code.** Rejected: they explain one function, not a choice that spans domain, API and database.

## Consequences

- Positive: a reviewer can read nine short files and see every load-bearing choice and its cost.
- Negative: small upkeep. An ADR whose decision changes must be marked superseded, or it misleads.
