---
name: cursor-cli
description: Delegate code reading, bug investigation, codebase search, and code summarization tasks to cursor agent CLI to reduce Claude Code quota consumption. Use this skill when you need to understand code logic, investigate bugs, search for specific patterns in the codebase, or generate code summaries - especially for exploratory or time-consuming tasks.
---

# Cursor Agent CLI Delegation

Delegate context-heavy tasks to cursor agent to conserve Claude Code quota.

## When to Delegate

Delegate to cursor agent when:
- Reading and understanding large files or modules
- Investigating bugs or tracing error sources
- Searching codebase for specific patterns, functions, or classes
- Generating summaries or documentation for code sections
- Exploratory tasks that may require multiple iterations

Do NOT delegate when:
- Making code edits (cursor output needs human/Claude review first)
- Tasks requiring Claude-specific tools or context
- Quick, small tasks that don't justify the overhead

## Usage Pattern

Use print mode for non-interactive one-shot queries:

```bash
cursor agent -p "your query here"
```

For tasks requiring file context, include paths:

```bash
cursor agent -p "Explain the logic in src/auth/login.ts and identify potential security issues"
```

For codebase-wide searches:

```bash
cursor agent -p "Find all usages of the deprecated API fetchUserData() and list the files"
```

Specify a model if needed:

```bash
cursor agent -p --model sonnet-4 "your query here"
```

## Task Templates

### Code Understanding

```bash
cursor agent -p "Read and explain the purpose of [file_path]. Focus on:
1. Main functionality
2. Key functions and their roles
3. Dependencies and how they're used"
```

### Bug Investigation

```bash
cursor agent -p "Investigate the bug: [error message or description].
Check these files: [file_paths]
Trace the error source and suggest potential fixes."
```

### Codebase Search

```bash
cursor agent -p "Search the codebase for [pattern/function/class].
List all occurrences with file paths and line context.
Explain how each usage relates to [feature]."
```

### Code Summary

```bash
cursor agent -p "Generate a concise summary of [file_path or directory]:
- Purpose and responsibility
- Public API/exports
- Key implementation details"
```

## Best Practices

1. **Use -p flag**: Always use `-p` (print mode) for non-interactive scripted usage
2. **Be specific**: Include file paths and specific questions
3. **Provide context**: Mention relevant error messages or symptoms
4. **Scope appropriately**: Don't ask cursor to analyze the entire codebase at once
5. **Review output**: Always verify cursor's findings before acting on them
6. **Use for read-only tasks**: Let cursor analyze, let Claude (or human) edit
