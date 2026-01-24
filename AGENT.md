# AGENT.md - Multi-Agent Orchestration Guide

This file provides guidance for Claude instances running in Claude Dashboard to operate as effective orchestrators of parallel work. When working on complex tasks, you should act as a **coordinator** that delegates work to subagents while maintaining clean context.

## Environment Variables

When running in Claude Dashboard, these variables are available:
- `CLAUDE_DASHBOARD_INSTANCE_ID` - Your unique instance identifier
- `CLAUDE_DASHBOARD_PROJECT_ID` - Current project identifier

## Core Principles

### 1. Parallelism First
Before starting any non-trivial task, analyze which subtasks are **independent** and can run simultaneously:
- Multiple file explorations in different areas
- Independent feature implementations
- Tests that don't share state
- Lint/typecheck/build verification

**Rule**: If tasks don't share dependencies, launch them in parallel using multiple `Task` tool calls in a single message.

### 2. Clean Context Through Delegation
Keep your main context focused on coordination. Delegate to subagents:
- Deep codebase exploration (use `Task` with `subagent_type: "Explore"`)
- Implementation of isolated components
- Running tests and verification
- Research and information gathering

**Rule**: If a task requires reading >5 files or deep analysis, delegate it.

### 3. Active Coordination
Use the shared context system to:
- Announce what you're working on
- Check what peers are doing before modifying shared files
- Share discoveries that benefit other instances
- Avoid duplicate work

## Standard Workflow

### Phase 1: Analysis
```
1. Read the task requirements
2. Call context_get_summary() to see current project state
3. Call context_get_project_knowledge() to get accumulated insights
4. Decompose into independent subtasks
5. Identify dependencies between tasks
```

### Phase 2: Parallel Delegation
```
1. Create ALL tasks upfront with TaskCreate (with dependencies via blockedBy)
2. Launch independent subagents SIMULTANEOUSLY (single message, multiple Task calls)
3. Publish your status: context_publish(workStatus: "planning", currentTask: "...")
```

### Phase 3: Coordination
```
1. Monitor subagent completion
2. Publish context updates as you learn things
3. Check context_get_peers() before modifying shared files
4. Launch dependent tasks as their blockers complete
5. Run verification in background (lint, typecheck)
```

### Phase 4: Synthesis
```
1. Integrate results from subagents
2. Run final verification
3. Contribute knowledge: context_contribute_knowledge(...)
4. Report completion to user
```

## Task Tool - Subagent Types

Use the `Task` tool with appropriate `subagent_type`:

| Type | Use For |
|------|---------|
| `Explore` | Codebase exploration, finding files, understanding patterns |
| `Plan` | Designing implementation approaches, architectural decisions |
| `Bash` | Git operations, running commands, build tasks |
| `general-purpose` | Complex multi-step tasks, implementation work |

### Parallel Launch Example
To explore multiple areas simultaneously, send ONE message with multiple Task calls:

```
Task 1: { subagent_type: "Explore", prompt: "Find all API route handlers" }
Task 2: { subagent_type: "Explore", prompt: "Find authentication middleware" }
Task 3: { subagent_type: "Explore", prompt: "Find database models" }
```

All three run concurrently.

## MCP Context Tools Reference

### context_publish
Announce your current work state:
```json
{
  "workStatus": "implementing",
  "currentTask": "Adding user authentication",
  "currentFiles": ["src/auth/login.ts", "src/auth/middleware.ts"],
  "notesForOthers": ["Auth uses JWT, check AuthService for token handling"]
}
```
**workStatus options**: `idle`, `exploring`, `implementing`, `testing`, `reviewing`, `planning`, `waiting`

### context_get_peers
Check what other instances are doing before modifying shared files:
```json
{}
```
Returns list of active instances with their tasks and files.

### context_get_project_knowledge
Get accumulated project insights:
```json
{}
```
Returns architecture, conventions, important files, warnings.

### context_contribute_knowledge
Persist discoveries for future instances:
```json
{
  "convention": {
    "type": "architecture",
    "description": "All API routes must validate input with zod schemas",
    "examples": ["src/routes/users.ts:15"]
  }
}
```

### context_get_summary
Quick overview of current state:
```json
{}
```
Returns human-readable summary of active work and knowledge.

## Native Task Management

Use the built-in task system for tracking:

### TaskCreate
Create all tasks at the start with clear dependencies:
```
Task 1: "Explore authentication flow" (no dependencies)
Task 2: "Explore user model" (no dependencies)
Task 3: "Implement login endpoint" (blockedBy: [1, 2])
Task 4: "Write login tests" (blockedBy: [3])
```

### TaskUpdate
- Set `status: "in_progress"` when starting
- Set `status: "completed"` when done
- Use `addBlockedBy` to establish dependencies

### TaskList
Monitor progress and find unblocked tasks.

## Delegation Patterns

### Pattern: Multi-Front Exploration
When you need to understand a feature that spans multiple areas:

```
PARALLEL:
  - Task(Explore): "How does user authentication work?"
  - Task(Explore): "How does session management work?"
  - Task(Explore): "How does the API middleware chain work?"

WAIT for all, then SYNTHESIZE findings
```

### Pattern: Modular Implementation
When implementing a feature with independent parts:

```
PARALLEL:
  - Task(general-purpose): "Create the database migration for feature X"
  - Task(general-purpose): "Create the API route handler for feature X"
  - Task(general-purpose): "Create the frontend component for feature X"

SEQUENTIAL (after all above):
  - Task(general-purpose): "Wire everything together and test"
```

### Pattern: Background Verification
Don't wait for verification - run it in background:

```
Task(Bash, run_in_background: true): "npm run typecheck"
Task(Bash, run_in_background: true): "npm run lint"

Continue with other work...
Check results later with TaskOutput
```

### Pattern: Peer Coordination
Before modifying a shared file:

```
1. context_get_peers() -> check if anyone else is editing
2. If conflict: wait or coordinate
3. context_publish(currentFiles: [...]) -> announce your intent
4. Make changes
5. context_publish(workStatus: "completed") -> announce completion
```

## Example: Implementing a New Feature

User request: "Add a password reset feature"

### Step 1: Initial Analysis
```
context_get_summary()
context_get_project_knowledge()
```

### Step 2: Create Task Plan
```
TaskCreate: "Explore existing auth system"
TaskCreate: "Explore email service"
TaskCreate: "Design password reset flow" (blockedBy: exploration tasks)
TaskCreate: "Implement reset token generation" (blockedBy: design)
TaskCreate: "Implement reset email sending" (blockedBy: design)
TaskCreate: "Implement reset form UI" (blockedBy: design)
TaskCreate: "Implement reset API endpoint" (blockedBy: token + email tasks)
TaskCreate: "Write tests" (blockedBy: API endpoint)
```

### Step 3: Parallel Exploration
Single message with multiple Task calls:
```
Task(Explore): "Find how user authentication works in this codebase"
Task(Explore): "Find how emails are sent in this codebase"
```

### Step 4: Design (after exploration)
```
context_publish(workStatus: "planning", currentTask: "Designing password reset flow")
// Create detailed plan based on exploration results
```

### Step 5: Parallel Implementation
Single message:
```
Task(general-purpose): "Implement password reset token generation in src/auth/..."
Task(general-purpose): "Implement password reset email template and sending..."
Task(general-purpose): "Implement password reset form component..."
```

### Step 6: Integration & Testing
```
// Wire up the API endpoint
// Run tests
context_contribute_knowledge(warning: {
  severity: "info",
  description: "Password reset tokens expire in 1 hour, configured in .env"
})
```

## Anti-Patterns to Avoid

1. **Sequential when parallel is possible**: Don't wait for one exploration to finish before starting another independent one.

2. **Deep diving in main context**: Don't read 20 files yourself - delegate to an Explore subagent.

3. **Forgetting to publish context**: Other instances can't coordinate if they don't know what you're doing.

4. **Not checking peers**: Before editing shared files, check if someone else is working on them.

5. **Creating tasks one at a time**: Create ALL tasks upfront with dependencies, then execute.

6. **Blocking on verification**: Run lint/typecheck in background while continuing other work.

## Progress Reporting

Keep the user informed of parallel work:
- Announce when launching subagents: "Launching 3 parallel explorations..."
- Summarize subagent results: "Exploration complete. Found X, Y, Z..."
- Report task completion: "Tasks 1, 2, 3 completed. Starting dependent task 4..."

## Automatic Behaviors (Dashboard-Managed)

The Dashboard automatically handles certain tasks so you can focus on your work:

### Auto-Review on Task Completion

When you complete a task (`TaskUpdate status="completed"`), the Dashboard **automatically** spawns a background review subagent. You do **NOT** need to:
- Spawn lint/typecheck subagents manually
- Worry about code quality verification after each task
- Remember to run verification commands

The auto-review subagent:
- Runs `npm run typecheck` (if available)
- Runs `npm run lint:fix` (if available)
- Fixes any errors found automatically
- **Publishes findings to shared context** via `context_publish`
- Exits automatically when done

**Shared Context Integration**: The review subagent reports its findings:
- `workStatus: "reviewing"` - While running checks
- `workStatus: "completed"` - All passed or issues fixed
- `workStatus: "blocked"` + `notesForOthers: ["NEEDS ATTENTION: ..."]` - Found unfixable issues

**What this means for you**: Focus on your implementation work. Check `context_get_peers()` occasionally to see review status. If you see a review with `workStatus: "blocked"`, there are issues that need manual attention.

### Configuration

Auto-review can be configured per-project in the Dashboard:
- **Enabled by default** for all projects
- Projects can opt-out by setting `autoReview: false`
- Uses economical haiku model to minimize costs
- 30-second cooldown between reviews for the same project
- 500ms debounce to batch rapid task completions

### When Manual Verification is Still Useful

While auto-review handles routine checks, you may still want to run verification manually when:
- You've made significant architectural changes
- You want to see specific error messages for learning
- You're debugging a tricky issue
- The auto-review missed something (rare, but possible)
