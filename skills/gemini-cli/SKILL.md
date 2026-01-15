---
name: gemini-cli
description: Delegate code reading, bug investigation, codebase search, and code summarization tasks to gemini-cli to reduce Claude Code quota consumption. Use this skill when you need to understand code logic, investigate bugs, search for specific patterns in the codebase, or generate code summaries - especially for exploratory or time-consuming tasks.
---

# Gemini CLI Delegation

Delegate context-heavy tasks to gemini-cli to conserve Claude Code quota.

## When to Delegate

Delegate to gemini-cli when:
- Reading and understanding large files or modules
- Investigating bugs or tracing error sources
- Searching codebase for specific patterns, functions, or classes
- Generating summaries or documentation for code sections
- Exploratory tasks that may require multiple iterations

Do NOT delegate when:
- Making code edits (gemini output needs human/Claude review first)
- Tasks requiring Claude-specific tools or context
- Quick, small tasks that don't justify the overhead

## Usage Pattern

Use non-interactive one-shot mode:

```bash
gemini "your query here"
```

For tasks requiring file context, include paths:

```bash
gemini "Explain the logic in src/auth/login.ts and identify potential security issues"
```

For codebase-wide searches:

```bash
gemini "Find all usages of the deprecated API fetchUserData() and list the files"
```

## Task Templates

### Code Understanding

```bash
gemini "Read and explain the purpose of [file_path]. Focus on:
1. Main functionality
2. Key functions and their roles
3. Dependencies and how they're used"
```

### Bug Investigation

```bash
gemini "Investigate the bug: [error message or description].
Check these files: [file_paths]
Trace the error source and suggest potential fixes."
```

### Codebase Search

```bash
gemini "Search the codebase for [pattern/function/class].
List all occurrences with file paths and line context.
Explain how each usage relates to [feature]."
```

### Code Summary

```bash
gemini "Generate a concise summary of [file_path or directory]:
- Purpose and responsibility
- Public API/exports
- Key implementation details"
```

## Best Practices

1. **Be specific**: Include file paths and specific questions
2. **Provide context**: Mention relevant error messages or symptoms
3. **Scope appropriately**: Don't ask gemini to analyze the entire codebase at once
4. **Review output**: Always verify gemini's findings before acting on them
5. **Use for read-only tasks**: Let gemini analyze, let Claude (or human) edit
