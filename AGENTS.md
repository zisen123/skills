# Agent Skills Repository Guide

## 1. Project Overview
This repository contains a collection of **Agent Skills**—specialized instruction sets and tools designed to extend the capabilities of AI agents (specifically Claude). Each "skill" acts as a plug-in that teaches the agent how to perform specific tasks, adhere to brand guidelines, or handle complex workflows (like manipulating PDF or Office documents).

The primary goal is to provide a standardized way to package instructions, scripts, and resources that can be dynamically loaded by an agent to improve performance on specialized tasks.

## 2. Directory Structure

### Root Directory
- **`skills/`**: The core library of skills. Each subdirectory represents a standalone skill.
- **`spec/`**: Contains the technical specification for Agent Skills.
- **`template/`**: A boilerplate structure for creating new skills.
- **`.claude/` & `.claude-plugin/`**: Configuration files for integrating with Claude Code and the plugin marketplace.

### `skills/` Directory
Contains various categories of skills. Common structures include:
- **`algorithmic-art/`, `frontend-design/`, `theme-factory/`**: Creative and design-oriented skills.
- **`docx/`, `pdf/`, `pptx/`, `xlsx/`**: "Production-grade" skills for document processing. These often include extensive `scripts/` (Python/JS) to handle file manipulation.
- **`gemini-cli/`**: A skill for delegating tasks to the Gemini CLI.
- **`brand-guidelines/`, `internal-comms/`**: Enterprise-focused skills for maintaining consistency in output.
- **`skill-creator/`**: A meta-skill to help the agent generate new skills.

### Skill Structure
A typical skill folder (e.g., `skills/my-skill/`) contains:
- **`SKILL.md`** (Required): The definition file containing metadata and instructions.
- **`scripts/`** (Optional): Executable code (Python, Bash, JS) that the skill uses to perform actions.
- **`references/`** (Optional): Documentation files (`*.md`) the agent can read for deep-dive knowledge.
- **`assets/`** (Optional): Static resources like templates or fonts.

## 3. Key Files and Roles

### `SKILL.md`
This is the single most important file for any skill. It dictates behavior using two parts:
1.  **YAML Frontmatter**: Metadata like `name` (unique identifier) and `description` (when to use the skill).
2.  **Markdown Body**: The "system prompt" or instructions for the agent. It defines steps, examples, and guidelines the agent must follow when the skill is active.

### `spec/agent-skills-spec.md`
The authoritative reference for the Agent Skills standard. It defines:
- Naming conventions (lowercase, hyphens).
- Directory layout requirements.
- Frontmatter schema (required fields, character limits).

### `template/SKILL.md`
A starting point for contributors. It includes the required frontmatter structure and placeholders for instructions.

## 4. How to Use & Contribute

### Using Skills
Skills are designed to be loaded by Claude Code or compatible agent runtimes.
1.  **Claude Code**: Use `/plugin marketplace add` or `/plugin install` to load skills from this repo.
2.  **Claude.ai**: Skills can be manually uploaded or integrated depending on your plan features.
3.  **Manual**: An agent can technically "use" a skill by reading the `SKILL.md` file and following its instructions.

### Contributing a New Skill
1.  **Copy the Template**: Duplicate the `template/` folder and rename it to your skill's name (e.g., `my-new-skill`).
2.  **Edit `SKILL.md`**:
    - Update `name` (lowercase, hyphens only) and `description` in the frontmatter.
    - Write clear, step-by-step instructions in the body.
    - Add examples of inputs and desired outputs.
3.  **Add Resources**:
    - Place scripts in `scripts/`.
    - Place reference docs in `references/`.
4.  **Validate**: Ensure your skill follows the spec defined in `spec/agent-skills-spec.md`.

## 5. Coding Conventions & Patterns

- **Naming**: Skill directories and names must be lowercase with hyphens (kebab-case). No starting/ending hyphens.
- **Self-Containment**: Each skill should work independently. If it depends on external tools, list them in `compatibility` or ensure the environment provides them.
- **Progressive Disclosure**:
    - Keep `SKILL.md` concise (< 500 lines).
    - Offload complex details to `references/`.
    - Offload logic to `scripts/`.
    - This ensures the agent only loads heavy context when absolutely necessary.
- **Source-Available vs. Open Source**: Note that some skills (like `docx`, `pdf`) are shared as reference implementations and may have different licensing or complexity compared to simple prompt-based skills.
