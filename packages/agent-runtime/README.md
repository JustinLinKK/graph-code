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

Every planning, coding, review, and scanning context includes the current index completeness. Partial, stale, failed, and in-progress indexes explicitly prohibit repository-wide claims. Scoped planning uses the selected canvas without round-robin chunk dispatch, while standalone coding/review use the bounded parent/current canvas instead of a full-project graph read. `benchmarkAgentContext` retains legacy context construction without invoking a model for the explicit scalability baseline.

## Orchestration baseline

MA-0 preserves the legacy round-robin planning chunker and adds read-only diagnostics, fixture validation, legacy coding-context measurements, and a deterministic delayed fake provider under `src/orchestration/legacy-baseline.ts`. These exports exist for behavioral tests and later ablations; they do not change production scheduling. Run the complete baseline from the repository root with `pnpm benchmark:agent-orchestration`.

## Isolated work-unit context

MA-3 context contracts and compilation live under `src/context/`. `compileWorkUnitContext` accepts an already scoped work-unit graph and source reader; it has no full-project `readGraph` dependency. The compiler provides:

- exact owned-symbol ranges or explicit unavailable/stale evidence;
- owned, halo, test, edge, contract, upstream, execution, revision, and output sections with roles and selection reasons;
- small/medium/large file, node, edge, source, graph, contract, and total token budgets;
- deterministic priority trimming that never removes owned source in favor of optional evidence;
- bounded follow-up retrieval contracts that require escalation before crossing write ownership;
- generic, OpenAI, Anthropic, and Google provider renderings; and
- coding/review shadow comparison using the conservative four-characters-per-token fallback when no provider tokenizer is available.

`validateActualWriteScopes` rejects structured proposal writes outside the work unit's planned ranges. Work-unit context preview and shadow measurement do not invoke a provider or authorize direct workspace mutation.

## Bounded work-unit execution

MA-4 adds `runCodingWorkUnitAgent` as the provider boundary for partition execution, which is default-on as of MA-7. It accepts an already compiled and compactly rendered capsule, never calls `readGraph`, does not reread uncompiled source, rejects direct-edit CLI permission modes, requires a parseable unified diff, derives actual hunk ranges, validates them against planned write scopes, and stores a proposal for later review/apply. The deterministic fake provider emits a scoped fixture diff for scheduler, API, and ablation acceptance tests; it does not call an external model.

## Bounded integration fallback

MA-5 work-unit responses may append `GRAPHCODE_WORK_UNIT_METADATA_JSON`; the runtime validates contract updates, discovered dependencies, assumptions, unresolved issues, and confidence into the shared proposal envelope without mixing metadata into the diff. `runIntegrationAgent` is a proposal-only medium/large fallback used only after deterministic integration fails. Its typed input contains bounded children, affected contracts, diagnostics, selected exact source, and parent authority. It has no graph-reader call or complete-repository field, and direct-edit CLI modes remain prohibited.
