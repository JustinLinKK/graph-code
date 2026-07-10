# UI API Workflow Example

This example demonstrates a user action crossing from frontend UI code into backend route handling. It is useful for showing GraphCode's source-linked workflow navigation.

## What to Scan

Open this directory in GraphCode:

```text
examples/ui-api-workflow
```

Suggested initialization:

- Project name: `UI API Workflow`
- Project description: `Tiny frontend/backend checkout flow for tracing UI-to-API behavior.`
- Scanning instructions: `Group frontend components, frontend API client, backend routes, and backend domain logic. Show the request path from button click to order creation.`

## Demo Prompt

Select `submitOrder`, then ask:

```text
Trace how checkout form data moves from the UI into the backend createOrder route.
```

## What to Screenshot

- `CheckoutPanel` or `submitOrder` selected in the inspector.
- The frontend API client and backend route visible on the canvas.
- Source evidence showing the exact route path.
