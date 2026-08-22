import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { DataStore } from './DataStore';

// Dashboard API port
const DASHBOARD_API_PORT = 3847;

/**
 * Get the base API URL for skills (http or https based on SSL config)
 */
function getApiBaseUrl(): string {
  const remoteConfig = DataStore.getInstance().getRemoteConfig();
  const protocol = remoteConfig.ssl?.enabled ? 'https' : 'http';
  const port = remoteConfig.port || DASHBOARD_API_PORT;
  return `${protocol}://localhost:${port}`;
}

// Skill definition
interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  content: string;
}

// Generate skills with dynamic base URL (supports http and https)
function generateSkills(baseUrl: string): Record<string, SkillDefinition> {
  return {
    'dashboard-status': {
      id: 'dashboard-status',
      name: 'Dashboard Status',
      description: 'Report progress and status updates to the dashboard',
      content: `---
name: dashboard-status
description: Report progress and status updates to the Claude Dashboard
---

# Dashboard Status Reporting

When working on tasks, you can report progress to the Claude Dashboard to keep users informed.

## Usage

Use the dashboard notification endpoint to report status:

\`\`\`bash
# Report status update
curl -sk -X POST "${baseUrl}/api/hooks/status" \\
  -H "Content-Type: application/json" \\
  -d '{
    "instanceId": "'$CLAUDE_ORCHESTRA_INSTANCE_ID'",
    "status": "working",
    "message": "Currently implementing feature X",
    "progress": 50
  }'
\`\`\`

## Status Types

- \`starting\` - Beginning a new task
- \`working\` - Actively working on a task
- \`waiting\` - Waiting for user input or external resource
- \`completed\` - Task finished successfully
- \`error\` - Task encountered an error

## When to Report

1. **Task Start**: Report when beginning a significant task
2. **Milestones**: Report progress at significant checkpoints (25%, 50%, 75%)
3. **Completion**: Report when task is done
4. **Errors**: Report any errors encountered

## Example Flow

\`\`\`bash
# Starting task
curl -sk -X POST "${baseUrl}/api/hooks/status" \\
  -d '{"instanceId":"'$CLAUDE_ORCHESTRA_INSTANCE_ID'","status":"starting","message":"Beginning implementation"}'

# Progress update
curl -sk -X POST "${baseUrl}/api/hooks/status" \\
  -d '{"instanceId":"'$CLAUDE_ORCHESTRA_INSTANCE_ID'","status":"working","message":"50% complete","progress":50}'

# Completion
curl -sk -X POST "${baseUrl}/api/hooks/status" \\
  -d '{"instanceId":"'$CLAUDE_ORCHESTRA_INSTANCE_ID'","status":"completed","message":"Task finished"}'
\`\`\`

Note: The \`$CLAUDE_ORCHESTRA_INSTANCE_ID\` environment variable is automatically set by the dashboard.
`,
    },

    'fetch-context': {
      id: 'fetch-context',
      name: 'Fetch Context',
      description: 'Get additional context from the dashboard about the project',
      content: `---
name: fetch-context
description: Fetch additional context from the Claude Dashboard
---

# Fetch Dashboard Context

Before starting complex tasks, you can fetch context from the dashboard to get:
- Related conversations from other instances
- Project-specific notes and TODOs
- Team activity on the same project

## Usage

\`\`\`bash
# Fetch context for current instance
curl -sk "${baseUrl}/api/hooks/instance/$CLAUDE_ORCHESTRA_INSTANCE_ID/context"
\`\`\`

## Response Structure

The endpoint returns JSON with:

\`\`\`json
{
  "projectId": "...",
  "projectName": "...",
  "recentConversations": [
    {
      "id": "...",
      "title": "...",
      "summary": "...",
      "createdAt": 1234567890
    }
  ],
  "activeInstances": [
    {
      "id": "...",
      "status": "running",
      "currentTask": "..."
    }
  ],
  "projectNotes": "...",
  "recentActivity": [...]
}
\`\`\`

## When to Fetch Context

1. **Complex Tasks**: Before major refactors or feature implementations
2. **After Resuming**: When resuming a paused session
3. **Coordination**: When working on files that others might modify

## Example

\`\`\`bash
# Get context and extract relevant info
CONTEXT=$(curl -sk "${baseUrl}/api/hooks/instance/$CLAUDE_ORCHESTRA_INSTANCE_ID/context")

# Check if other instances are active
ACTIVE_COUNT=$(echo "$CONTEXT" | jq '.activeInstances | length')
if [ "$ACTIVE_COUNT" -gt 1 ]; then
  echo "Note: $ACTIVE_COUNT other instances are currently active"
fi
\`\`\`
`,
    },

    'collaborative-awareness': {
      id: 'collaborative-awareness',
      name: 'Collaborative Awareness',
      description: 'Be aware of other Claude instances working on the same project',
      content: `---
name: collaborative-awareness
description: Coordinate with other Claude instances on the same project
---

# Collaborative Awareness

When multiple Claude instances work on the same project, coordination helps avoid conflicts.

## Check Active Instances

Before making significant changes, check if other instances are active:

\`\`\`bash
# Get list of active instances for the project
curl -sk "${baseUrl}/api/hooks/instances?projectId=$CLAUDE_ORCHESTRA_PROJECT_ID"
\`\`\`

## Response

\`\`\`json
{
  "instances": [
    {
      "id": "inst_123",
      "status": "running",
      "startedAt": 1234567890,
      "currentFiles": ["src/index.ts", "src/utils.ts"],
      "lastActivity": 1234567900
    }
  ]
}
\`\`\`

## Coordination Protocol

### 1. Before Modifying Files

Check if the file is being modified by another instance:

\`\`\`bash
FILE_PATH="src/components/Button.tsx"
RESPONSE=$(curl -sk "${baseUrl}/api/hooks/file-lock?path=$FILE_PATH&projectId=$CLAUDE_ORCHESTRA_PROJECT_ID")
LOCKED=$(echo "$RESPONSE" | jq -r '.locked')

if [ "$LOCKED" = "true" ]; then
  echo "Warning: File is being modified by another instance"
fi
\`\`\`

### 2. Report File Activity

When you start modifying important files:

\`\`\`bash
curl -sk -X POST "${baseUrl}/api/hooks/activity" \\
  -H "Content-Type: application/json" \\
  -d '{
    "instanceId": "'$CLAUDE_ORCHESTRA_INSTANCE_ID'",
    "action": "editing",
    "files": ["src/index.ts"]
  }'
\`\`\`

### 3. Check for Conflicts

Before committing or pushing changes:

\`\`\`bash
curl -sk "${baseUrl}/api/hooks/conflicts?instanceId=$CLAUDE_ORCHESTRA_INSTANCE_ID"
\`\`\`

## Best Practices

1. **Scope Work**: Try to work on separate areas of the codebase
2. **Communicate**: Report what files you're modifying
3. **Small Changes**: Make smaller, focused changes to reduce conflicts
4. **Check Status**: Periodically check for other active instances
5. **Coordinate Timing**: Avoid simultaneous modifications to the same files

## Environment Variables

The dashboard automatically sets these environment variables:
- \`CLAUDE_ORCHESTRA_INSTANCE_ID\` - Your unique instance ID
- \`CLAUDE_ORCHESTRA_PROJECT_ID\` - The project you're working on
- \`CLAUDE_ORCHESTRA_API_URL\` - The dashboard API base URL
`,
    },

    'director-mode': {
      id: 'director-mode',
      name: 'Director Mode',
      description: 'Coordinate multiple Claude workers to accomplish complex tasks',
      content: `---
name: director-mode
description: Coordinate multiple Claude workers to accomplish complex tasks
---

# Director Mode

You are a Director instance coordinating multiple worker instances. Use the dashboard API to delegate tasks and coordinate work.

## Proposing Workers

When you identify subtasks that should be delegated, propose workers:

\`\`\`bash
curl -sk -X POST "${baseUrl}/api/orchestration/propose" \\
  -H "Content-Type: application/json" \\
  -d '{
    "directorId": "'$CLAUDE_ORCHESTRA_INSTANCE_ID'",
    "workers": [
      {
        "task": "Implement the authentication API endpoints",
        "model": "sonnet",
        "rationale": "Backend API work is well-suited for Sonnet"
      },
      {
        "task": "Create login and registration UI components",
        "model": "sonnet",
        "rationale": "Frontend components need consistent code style"
      },
      {
        "task": "Write integration tests for auth flow",
        "model": "haiku",
        "rationale": "Test writing is straightforward, Haiku is cost-effective"
      }
    ]
  }'
\`\`\`

The dashboard will show a confirmation modal to the user. Wait for approval before proceeding.

## Checking Worker Status

Monitor your workers' progress:

\`\`\`bash
# Get status of all workers
curl -sk "${baseUrl}/api/orchestration/workers?directorId=$CLAUDE_ORCHESTRA_INSTANCE_ID"
\`\`\`

Response:
\`\`\`json
{
  "success": true,
  "data": {
    "workers": [
      {
        "id": "worker_123",
        "task": "Implement auth API",
        "status": "completed",
        "outputSummary": "Created 5 endpoints in src/api/auth.ts..."
      },
      {
        "id": "worker_456",
        "task": "Create UI components",
        "status": "running"
      }
    ]
  }
}
\`\`\`

## Getting Shared Context

Access the results from completed workers:

\`\`\`bash
curl -sk "${baseUrl}/api/orchestration/context?directorId=$CLAUDE_ORCHESTRA_INSTANCE_ID"
\`\`\`

Response includes:
- Summary of completed work
- Key decisions made by workers
- Files modified
- Any errors encountered

## Director Best Practices

1. **Decompose First**: Analyze the task and identify independent subtasks
2. **Choose Models Wisely**:
   - Opus for complex architecture/design
   - Sonnet for implementation
   - Haiku for simple tasks like tests or docs
3. **Wait for Workers**: Check status before synthesizing results
4. **Coordinate**: Use shared context to avoid conflicts
5. **Synthesize**: After workers complete, review and integrate their work

## Workflow Example

1. Receive complex task from user
2. Analyze and identify 3-4 subtasks
3. POST /api/orchestration/propose with worker specifications
4. Wait for user approval (dashboard notification)
5. GET /api/orchestration/workers to monitor progress
6. When all complete, GET /api/orchestration/context for results
7. Synthesize and present final result to user

## Environment Variables

The dashboard automatically sets these environment variables:
- \`CLAUDE_ORCHESTRA_INSTANCE_ID\` - Your unique instance ID (use as directorId)
- \`CLAUDE_ORCHESTRA_PROJECT_ID\` - The project you're working on
- \`CLAUDE_ORCHESTRA_API_URL\` - The dashboard API base URL
`,
    },

    'shared-context': {
      id: 'shared-context',
      name: 'Shared Context',
      description: 'Share and query context with other Claude instances on the same project',
      content: `---
name: shared-context
description: Coordinate with other Claude instances working on the same project
---

# Shared Context - Multi-Instance Coordination

This skill enables sharing context with other Claude instances on the same project.
Use it to avoid conflicts, share discoveries, and coordinate work effectively.

## MCP Tools (Preferred)

### context_get_peers
See what other instances are working on. Call this before major changes.

### context_publish
Share your current context:
- \`workStatus\`: idle | exploring | implementing | testing | reviewing | planning | waiting
- \`currentTask\`: What you're doing
- \`currentFiles\`: Files you're modifying
- \`notesForOthers\`: Important message for other instances

### context_get_project_knowledge
Get accumulated project knowledge: conventions, warnings, important files.

### context_contribute_knowledge
Share discoveries about the project:
- \`convention\`: {type: "naming|style|architecture", description: "..."}
- \`warning\`: {description: "...", severity: "low|medium|high"}
- \`importantFile\`: {path: "...", description: "..."}

### context_get_summary
Get a human-readable overview of current project state.

## HTTP API (Alternative)

\`\`\`bash
# Check active peers
curl -k "${baseUrl}/api/hooks/context/instances?projectId=$CLAUDE_ORCHESTRA_PROJECT_ID"

# Publish your context
curl -k -X POST "${baseUrl}/api/hooks/context/publish" \\
  -H "Content-Type: application/json" \\
  -H "X-Instance-Id: $CLAUDE_ORCHESTRA_INSTANCE_ID" \\
  -d '{"workStatus":"implementing","currentTask":"Refactoring auth","currentFiles":["src/auth.ts"]}'

# Get project knowledge
curl -k "${baseUrl}/api/hooks/context/project?projectId=$CLAUDE_ORCHESTRA_PROJECT_ID"

# Contribute knowledge
curl -k -X POST "${baseUrl}/api/hooks/context/project/contribute" \\
  -H "Content-Type: application/json" \\
  -H "X-Instance-Id: $CLAUDE_ORCHESTRA_INSTANCE_ID" \\
  -d '{"convention":{"type":"naming","description":"Components use PascalCase"}}'
\`\`\`

## Best Practices

1. **Before major changes**: Call context_get_peers to see if anyone else is working on related files
2. **When starting a task**: Use context_publish to let others know what you're doing
3. **When discovering patterns**: Use context_contribute_knowledge to share conventions
4. **At task start**: Use context_get_project_knowledge to leverage existing discoveries
5. **For warnings**: Contribute important gotchas that others should know about

## Work Status Values

- \`idle\` - Not actively working
- \`exploring\` - Reading code, understanding structure
- \`implementing\` - Writing/modifying code
- \`testing\` - Running or writing tests
- \`reviewing\` - Code review or refactoring
- \`planning\` - Designing approach
- \`waiting\` - Waiting for input or external resource
`,
    },

    'semantic-search': {
      id: 'semantic-search',
      name: 'Semantic Search',
      description: 'Search project documentation using AI-powered semantic understanding',
      content: `---
name: semantic-search
description: Search project documentation using AI-powered semantic understanding
---

# Semantic Search - AI-Powered Documentation Search

This project has been indexed for semantic search. Use the MCP tools below to find relevant documentation.

## Quick Start (Recommended)

Just use the defaults - they are optimized:

\`\`\`
semantic_search({
  query: "your query in English",
  limit: 10
})
\`\`\`

## Performance Benchmarks

| Mode | Time | Quality | Use When |
|------|------|---------|----------|
| With reranking (default) | ~400ms | 8/10 | Most searches - best balance |
| Without reranking | ~40ms | 5/10 | Quick lookups, exact terms |
| With query expansion | ~1.5s | 9/10 | Complex conceptual queries |

**Recommendation**: Keep reranking ON (default). The 400ms cost significantly improves first-result relevance.

## Language Requirement

**Write queries in English** for best results. The embedding model is optimized for English.

- GOOD: \`"how does the ProcessManager work"\`
- LESS GOOD: \`"cómo funciona el ProcessManager"\`

## Parameters Reference

| Parameter | Default | Notes |
|-----------|---------|-------|
| query | required | Natural language, in English |
| limit | 5 | Use 10 for broader searches |
| useReranking | **true** | Keep ON - improves relevance significantly |
| useQueryExpansion | false | Only for complex conceptual queries |
| minimumScore | 0.05 | Lower only if zero results |

## When to Adjust Defaults

| Situation | Action |
|-----------|--------|
| Need faster results | Add \`useReranking: false\` (~40ms) |
| Zero results | Rephrase in English, or lower \`minimumScore: 0.01\` |
| Complex conceptual search | Add \`useQueryExpansion: true\` (~1.5s) |
| Need more results | Increase \`limit: 15\` |

## When to Use semantic_search vs grep

**Use semantic_search when:**
- Looking for conceptually related content
- Searching "how to" or "why" questions
- Finding documentation about features
- Exact terminology is unknown

**Use grep/Glob when:**
- Searching for exact strings
- Finding specific function/class names
- Looking for imports or file references

## Example Queries

\`\`\`
// Basic search (uses optimal defaults - recommended)
semantic_search({ query: "authentication flow", limit: 10 })

// Filter by file type
semantic_search({
  query: "API endpoints",
  filter: { filePath: "docs/**" }
})

// Find code examples
semantic_search({
  query: "database connection",
  filter: { hasCode: true }
})

// Fast mode (skip reranking - only for quick lookups)
semantic_search({
  query: "quick lookup",
  useReranking: false
})
\`\`\`

## Verify Search is Working

\`\`\`
search_index_status()  // Should show searchReady: true
\`\`\`

## Tips

1. **Keep reranking ON** - default is optimal for quality
2. **Use English queries** - best results
3. **Be descriptive**: "user authentication errors" > "auth"
4. **If zero results**: rephrase in different terms
5. **Don't specify rerankStrategy** - embedding default is optimal
`,
    },

    'auto-lint-subagent': {
      id: 'auto-lint-subagent',
      name: 'Auto Lint Subagent',
      description:
        'Automatically spawn a subagent to fix lint/type issues after each task completes',
      content:
        '---\n' +
        'name: auto-lint-subagent\n' +
        'description: Spawn code-fixing subagent after completing tasks\n' +
        '---\n\n' +
        '# Auto Code Fixer Subagent\n\n' +
        '## Behavior\n\n' +
        "**IMPORTANTE**: Cada vez que completes una tarea usando TaskUpdate con status='completed',\n" +
        'DEBES lanzar inmediatamente un subagente en background para verificar y CORREGIR problemas de codigo.\n\n' +
        '## Procedimiento\n\n' +
        'Despues de ejecutar TaskUpdate({ taskId: "X", status: "completed" }), inmediatamente ejecutar:\n\n' +
        'Task({\n' +
        '  description: "Fix code issues",\n' +
        '  prompt: `You are an expert code fixer. Your job is to:\n' +
        '\n' +
        '1. Run typecheck: npm run typecheck (or yarn/pnpm equivalent)\n' +
        '2. If there are TypeScript errors, READ the problematic files and FIX them using Edit tool\n' +
        '3. Run lint: npm run lint (or yarn/pnpm equivalent)\n' +
        '4. If there are lint errors that --fix cannot solve, READ and FIX them manually\n' +
        '5. Run npm run lint:fix to auto-fix what can be auto-fixed\n' +
        '6. Re-run typecheck to verify fixes\n' +
        '\n' +
        'You have full access to Read, Edit, and Bash tools. USE THEM to fix issues.\n' +
        'Do NOT just report errors - ACTUALLY FIX THEM by editing the files.\n' +
        'Work silently and efficiently. Only report if you cannot fix something.`,\n' +
        '  subagent_type: "general-purpose",\n' +
        '  run_in_background: true\n' +
        '})\n\n' +
        '## Notas\n\n' +
        '- El subagente tiene acceso a Read, Edit, Bash, Grep, Glob\n' +
        '- DEBE corregir los errores, no solo reportarlos\n' +
        '- Trabaja independientemente - no esperes a que termine\n' +
        '- Continua con tu siguiente task mientras el subagente arregla errores\n' +
        '- Si el proyecto usa yarn/pnpm, el subagente adaptara los comandos\n\n' +
        '## Ejemplo completo\n\n' +
        'Despues de completar una task:\n' +
        '1. TaskUpdate({ taskId: "1", status: "completed" })\n' +
        '2. Inmediatamente spawn el subagente fixer\n' +
        '3. Continuar con la siguiente task del usuario\n',
    },
  };
}

export class SkillManager extends EventEmitter {
  private static instance: SkillManager | null = null;
  private apiPort: number;

  private constructor() {
    super();
    this.apiPort = DASHBOARD_API_PORT;
  }

  public static getInstance(): SkillManager {
    if (!SkillManager.instance) {
      SkillManager.instance = new SkillManager();
    }
    return SkillManager.instance;
  }

  /**
   * Set the API port for skill content
   */
  public setApiPort(port: number): void {
    this.apiPort = port;
  }

  /**
   * Get all available skills
   */
  public getAvailableSkills(): SkillDefinition[] {
    return Object.values(generateSkills(getApiBaseUrl()));
  }

  /**
   * Get a specific skill
   */
  public getSkill(id: string): SkillDefinition | undefined {
    const skills = generateSkills(getApiBaseUrl());
    return skills[id];
  }

  /**
   * Install skills to a project
   */
  public async installSkills(
    projectPath: string,
    skillIds: string[]
  ): Promise<{ success: boolean; installed: string[]; errors: string[] }> {
    const installed: string[] = [];
    const errors: string[] = [];
    const skills = generateSkills(getApiBaseUrl());

    try {
      const skillsDir = path.join(projectPath, '.claude', 'skills');

      // Create skills directory
      await fs.promises.mkdir(skillsDir, { recursive: true });

      for (const skillId of skillIds) {
        const skill = skills[skillId];
        if (!skill) {
          errors.push(`Skill not found: ${skillId}`);
          continue;
        }

        try {
          // Create skill directory
          const skillDir = path.join(skillsDir, skill.id);
          await fs.promises.mkdir(skillDir, { recursive: true });

          // Write SKILL.md
          const skillPath = path.join(skillDir, 'SKILL.md');
          await fs.promises.writeFile(skillPath, skill.content, 'utf-8');

          installed.push(skillId);
          console.log(`[SkillManager] Installed skill: ${skillId}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to install ${skillId}: ${errorMessage}`);
        }
      }

      if (installed.length > 0) {
        this.emit('skills:installed', { projectPath, skills: installed });
      }

      return {
        success: errors.length === 0,
        installed,
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        installed,
        errors: [...errors, `Setup failed: ${errorMessage}`],
      };
    }
  }

  /**
   * Remove a skill from a project
   */
  public async removeSkill(
    projectPath: string,
    skillId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const skillDir = path.join(projectPath, '.claude', 'skills', skillId);

      await fs.promises.rm(skillDir, { recursive: true, force: true });

      console.log(`[SkillManager] Removed skill: ${skillId}`);
      this.emit('skill:removed', { projectPath, skillId });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Remove all dashboard skills from a project
   */
  public async removeAllSkills(projectPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const skills = generateSkills(getApiBaseUrl());
      const skillsDir = path.join(projectPath, '.claude', 'skills');

      for (const skillId of Object.keys(skills)) {
        const skillDir = path.join(skillsDir, skillId);
        try {
          await fs.promises.rm(skillDir, { recursive: true, force: true });
        } catch {
          // Skill directory might not exist
        }
      }

      console.log(`[SkillManager] Removed all dashboard skills from: ${projectPath}`);
      this.emit('skills:removedAll', { projectPath });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get installed skills for a project
   */
  public async getInstalledSkills(projectPath: string): Promise<string[]> {
    try {
      const skillsDir = path.join(projectPath, '.claude', 'skills');
      const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });
      const skills = generateSkills(getApiBaseUrl());

      const installed: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory() && skills[entry.name]) {
          // Check if SKILL.md exists
          const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
          try {
            await fs.promises.access(skillPath);
            installed.push(entry.name);
          } catch {
            // SKILL.md doesn't exist
          }
        }
      }

      return installed;
    } catch {
      return [];
    }
  }

  /**
   * Check if a skill is installed
   */
  public async isSkillInstalled(projectPath: string, skillId: string): Promise<boolean> {
    try {
      const skillPath = path.join(projectPath, '.claude', 'skills', skillId, 'SKILL.md');
      await fs.promises.access(skillPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update an installed skill to the latest version
   */
  public async updateSkill(
    projectPath: string,
    skillId: string
  ): Promise<{ success: boolean; error?: string }> {
    const skills = generateSkills(getApiBaseUrl());
    const skill = skills[skillId];

    if (!skill) {
      return { success: false, error: `Skill not found: ${skillId}` };
    }

    try {
      const skillPath = path.join(projectPath, '.claude', 'skills', skillId, 'SKILL.md');

      // Check if skill is installed
      try {
        await fs.promises.access(skillPath);
      } catch {
        return { success: false, error: `Skill ${skillId} is not installed` };
      }

      // Update the skill content
      await fs.promises.writeFile(skillPath, skill.content, 'utf-8');

      console.log(`[SkillManager] Updated skill: ${skillId}`);
      this.emit('skill:updated', { projectPath, skillId });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Generate skill content from a custom agent definition
   */
  public generateCustomAgentSkill(
    agentName: string,
    agent: {
      description: string;
      prompt: string;
      tools?: string[];
      model?: string;
      autoTrigger?: {
        afterTaskComplete?: boolean;
        afterFileChange?: boolean;
        afterError?: boolean;
      };
    }
  ): string {
    const toolsStr = agent.tools?.length ? agent.tools.join(', ') : 'All tools';
    const modelStr = agent.model || 'sonnet';

    let autoTriggerSection = '';
    if (agent.autoTrigger) {
      const triggers: string[] = [];
      if (agent.autoTrigger.afterTaskComplete) {
        triggers.push('- After completing any task (TaskUpdate with status="completed")');
      }
      if (agent.autoTrigger.afterFileChange) {
        triggers.push('- After file modifications (Write, Edit tools)');
      }
      if (agent.autoTrigger.afterError) {
        triggers.push('- After encountering errors');
      }
      if (triggers.length > 0) {
        autoTriggerSection =
          '\n\n## Auto-Trigger Conditions\n\n' +
          'This agent should be spawned automatically:\n' +
          triggers.join('\n') +
          '\n';
      }
    }

    return (
      '---\n' +
      `name: ${agentName}\n` +
      `description: ${agent.description}\n` +
      '---\n\n' +
      `# ${agentName} Agent\n\n` +
      `${agent.description}\n\n` +
      '## How to Use\n\n' +
      'Spawn this agent using the Task tool:\n\n' +
      '```\n' +
      'Task({\n' +
      `  description: "${agent.description}",\n` +
      `  prompt: \`${agent.prompt.replace(/`/g, '\\`')}\`,\n` +
      `  subagent_type: "general-purpose",\n` +
      `  model: "${modelStr}",\n` +
      '  run_in_background: true\n' +
      '})\n' +
      '```\n\n' +
      '## Configuration\n\n' +
      `- **Model**: ${modelStr}\n` +
      `- **Tools**: ${toolsStr}\n` +
      autoTriggerSection +
      '\n## Agent Instructions\n\n' +
      agent.prompt +
      '\n'
    );
  }

  /**
   * Install custom agents as skills to a project
   */
  public async installCustomAgents(
    projectPath: string,
    agents: Record<
      string,
      {
        description: string;
        prompt: string;
        tools?: string[];
        model?: string;
        autoTrigger?: {
          afterTaskComplete?: boolean;
          afterFileChange?: boolean;
          afterError?: boolean;
        };
      }
    >
  ): Promise<{ success: boolean; installed: string[]; errors: string[] }> {
    const installed: string[] = [];
    const errors: string[] = [];

    try {
      const skillsDir = path.join(projectPath, '.claude', 'skills');
      await fs.promises.mkdir(skillsDir, { recursive: true });

      for (const [agentName, agentConfig] of Object.entries(agents)) {
        try {
          // Sanitize agent name for filesystem
          const safeAgentName = agentName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
          const skillDir = path.join(skillsDir, safeAgentName);
          await fs.promises.mkdir(skillDir, { recursive: true });

          // Generate and write skill content
          const content = this.generateCustomAgentSkill(agentName, agentConfig);
          const skillPath = path.join(skillDir, 'SKILL.md');
          await fs.promises.writeFile(skillPath, content, 'utf-8');

          installed.push(safeAgentName);
          console.log(`[SkillManager] Installed custom agent skill: ${safeAgentName}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to install ${agentName}: ${errorMessage}`);
        }
      }

      if (installed.length > 0) {
        this.emit('customAgents:installed', { projectPath, agents: installed });
      }

      return { success: errors.length === 0, installed, errors };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        installed,
        errors: [...errors, `Setup failed: ${errorMessage}`],
      };
    }
  }

  /**
   * Remove custom agent skills from a project
   */
  public async removeCustomAgents(
    projectPath: string,
    agentNames: string[]
  ): Promise<{ success: boolean; removed: string[]; errors: string[] }> {
    const removed: string[] = [];
    const errors: string[] = [];

    for (const agentName of agentNames) {
      try {
        const safeAgentName = agentName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        const skillDir = path.join(projectPath, '.claude', 'skills', safeAgentName);
        await fs.promises.rm(skillDir, { recursive: true, force: true });
        removed.push(safeAgentName);
        console.log(`[SkillManager] Removed custom agent skill: ${safeAgentName}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to remove ${agentName}: ${errorMessage}`);
      }
    }

    return { success: errors.length === 0, removed, errors };
  }

  /**
   * Destroy the skill manager
   */
  public destroy(): void {
    SkillManager.instance = null;
  }
}

// Export singleton getter
export function getSkillManager(): SkillManager {
  return SkillManager.getInstance();
}
