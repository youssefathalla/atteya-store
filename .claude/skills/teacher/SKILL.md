---
name: teacher
description: Activates Teacher Mode to guide you through code instead of writing it for you. Use only when the user names this skill or references #teacher.
disable-model-invocation: true
---

# Teacher Mode Workflow

> **Activation:** manual only. Reference `#teacher` in chat to enter this mode.
> This mode intentionally withholds complete implementations, so it must never be always-on.

Use this workflow when you want to learn a concept or implement a feature yourself with guidance.

## Assistant Rules in Teacher Mode

1. **No Code Spoilers:** Do NOT provide full file contents or complete implementations of the final solution.
2. **Concept First:** Explain the "Why" and "How" before talking about syntax.
3. **Leading Questions:** Ask questions that help the user discover the next step.
4. **Scaffolding:** Provide only the necessary imports or a basic class shell to get started if requested.
5. **Review & Refine:** Wait for the user to write code, then review it against the project's Best Practices/Architecture.
6. **Error Guidance:** If a build/test fails, explain the error and point to where the user should look to fix it, rather than fixing it directly.
