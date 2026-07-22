# Review Proposal Lab

This example is designed to demonstrate GraphCode's proposal-first coding and review loop. It contains a small order-pricing module with an intentional bug that is easy to explain and fix.

## What to Scan

Open this directory in GraphCode:

```text
examples/review-proposal-lab
```

Suggested initialization:

- Project name: `Review Proposal Lab`
- Project description: `Small TypeScript order service for demonstrating scoped coding and review proposals.`
- Scanning instructions: `Group pricing, order creation, and tests. Highlight the selected function's callers and expected test coverage.`

## Intentional Demo Issue

`calculateDiscount` applies a loyalty discount before checking the minimum order amount. The expected behavior is that small orders should not receive loyalty discounts.

## Demo Prompt

Select `calculateDiscount`, then ask:

```text
Fix the loyalty discount so orders under 50 never receive the discount. Keep the change scoped and update the nearby test.
```

The coding task field is required for a function-level run. After the proposal finishes, open the Planning tab to inspect the proposed diff and its automatically attached review. You can also select the generated `Code Graph` module, preview a layered workflow, and apply the layer after its integration checks pass.

## What to Screenshot

- The selected `calculateDiscount` function in the inspector.
- The coding proposal activity row.
- The attached review and proposed-diff disclosure.
- The planning ticket before and after applying its graph patch.
- The layered workflow preview and successful integration checks.
