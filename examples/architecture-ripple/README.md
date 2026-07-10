# Architecture Ripple Example

This example demonstrates how a shared contract change can ripple across multiple modules. It is useful for showing GraphCode's dependency tracing and architecture reasoning.

## What to Scan

Open this directory in GraphCode:

```text
examples/architecture-ripple
```

Suggested initialization:

- Project name: `Architecture Ripple`
- Project description: `Small multi-module order workflow for tracing contract changes across callers.`
- Scanning instructions: `Show the shared contract first, then API, billing, email, and audit consumers. Emphasize calls and impact relationships.`

## Demo Scenario

The shared `OrderEvent` contract is consumed by billing, email, and audit modules. A change to `OrderEvent.currency` or `OrderEvent.totalCents` should visibly affect several downstream functions.

## Demo Prompt

Select `OrderEvent`, then ask:

```text
Plan the changes needed if totalCents must become a Money object with amountCents and currency.
```

## What to Screenshot

- The shared contract node with outgoing relationships.
- Billing, email, and audit modules in the same graph view.
- A planning ticket that lists affected modules.
