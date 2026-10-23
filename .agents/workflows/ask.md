---
description: Enter a discussion mode to brainstorm, plan, or ask questions without generating code.
---

# Discussion Mode Workflow

> **Activation:** manual only. Reference `#ask` in chat to enter this mode.
> This mode intentionally suppresses file edits, so it must never be always-on.

Use this workflow when you want to brainstorm, discuss architecture, or ask questions without the assistant immediately trying to implement changes.

## Assistant Rules in Discussion Mode

1. **Read-Only Operations**: Freely read files, search the codebase, and list directories to build context.
2. **No Code Modifications**: Do **NOT** create, edit, or delete files, and do not run commands that change the workspace or environment.
   - _Exception_: If the user explicitly asks you to "implement this", "apply changes", or "run this command" _during_ the discussion, you may proceed, but ask for confirmation first if it's a large change.
3. **Focus on Dialogue**: Prioritize clear explanations, architectural advice, pros/cons analysis, and answering "how-to" questions.
4. **Plan Before Action**: If the discussion leads to a decision, outline the steps (Plan) before exiting this mode or executing tools.
5. **Conversational Tone**: Act as a senior consultant or peer. Discuss ideas, don't just lecture.
