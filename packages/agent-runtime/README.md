# Agent Runtime

This package coordinates GraphCode's AI-assisted workflows for planning, coding, review, and scanning.

Agent runs stay reviewable. Providers return text, graph patches, diffs, or scan JSON back to GraphCode; the runtime stores those proposals and does not let provider CLIs directly mutate the workspace.

## Providers

- `fake`: deterministic local provider for tests and demos.
- `openai`, `gemini`, `openrouter`: hosted chat providers that require API-key settings.
- `codex`: account-based Codex CLI provider. The configured model field is the CLI command, defaulting to `codex`.
- `claudecode`: account-based Claude Code CLI provider. The configured model field is the CLI command, defaulting to `claude`.

CLI providers use the user's local CLI login instead of GraphCode storing API keys. GraphCode injects its mode-specific system prompts as the portable skill layer for each run, invokes the CLI from the active workspace root, and asks the CLI to return proposals rather than writing files.

## CLI Commands

Codex runs non-interactively with:

```sh
codex --ask-for-approval never exec --cd <workspaceRoot> --sandbox read-only -
```

Claude Code runs in print mode with editing tools disallowed:

```sh
claude -p --append-system-prompt <systemPrompt> --permission-mode plan --disallowedTools Edit MultiEdit Write NotebookEdit --output-format text <prompt>
```

Settings validation checks that the CLI command exists and that the local CLI account is signed in before saving the configuration.
