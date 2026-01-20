import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Dashboard API port
const DASHBOARD_API_PORT = 3847;

// Skill definition
interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  content: string;
}

// Generate skills with dynamic port
function generateSkills(port: number): Record<string, SkillDefinition> {
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
curl -s -X POST "http://localhost:${port}/api/hooks/status" \\
  -H "Content-Type: application/json" \\
  -d '{
    "instanceId": "'$CLAUDE_DASHBOARD_INSTANCE_ID'",
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
curl -s -X POST "http://localhost:${port}/api/hooks/status" \\
  -d '{"instanceId":"'$CLAUDE_DASHBOARD_INSTANCE_ID'","status":"starting","message":"Beginning implementation"}'

# Progress update
curl -s -X POST "http://localhost:${port}/api/hooks/status" \\
  -d '{"instanceId":"'$CLAUDE_DASHBOARD_INSTANCE_ID'","status":"working","message":"50% complete","progress":50}'

# Completion
curl -s -X POST "http://localhost:${port}/api/hooks/status" \\
  -d '{"instanceId":"'$CLAUDE_DASHBOARD_INSTANCE_ID'","status":"completed","message":"Task finished"}'
\`\`\`

Note: The \`$CLAUDE_DASHBOARD_INSTANCE_ID\` environment variable is automatically set by the dashboard.
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
curl -s "http://localhost:${port}/api/hooks/instance/$CLAUDE_DASHBOARD_INSTANCE_ID/context"
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
CONTEXT=$(curl -s "http://localhost:${port}/api/hooks/instance/$CLAUDE_DASHBOARD_INSTANCE_ID/context")

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
curl -s "http://localhost:${port}/api/hooks/instances?projectId=$CLAUDE_DASHBOARD_PROJECT_ID"
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
RESPONSE=$(curl -s "http://localhost:${port}/api/hooks/file-lock?path=$FILE_PATH&projectId=$CLAUDE_DASHBOARD_PROJECT_ID")
LOCKED=$(echo "$RESPONSE" | jq -r '.locked')

if [ "$LOCKED" = "true" ]; then
  echo "Warning: File is being modified by another instance"
fi
\`\`\`

### 2. Report File Activity

When you start modifying important files:

\`\`\`bash
curl -s -X POST "http://localhost:${port}/api/hooks/activity" \\
  -H "Content-Type: application/json" \\
  -d '{
    "instanceId": "'$CLAUDE_DASHBOARD_INSTANCE_ID'",
    "action": "editing",
    "files": ["src/index.ts"]
  }'
\`\`\`

### 3. Check for Conflicts

Before committing or pushing changes:

\`\`\`bash
curl -s "http://localhost:${port}/api/hooks/conflicts?instanceId=$CLAUDE_DASHBOARD_INSTANCE_ID"
\`\`\`

## Best Practices

1. **Scope Work**: Try to work on separate areas of the codebase
2. **Communicate**: Report what files you're modifying
3. **Small Changes**: Make smaller, focused changes to reduce conflicts
4. **Check Status**: Periodically check for other active instances
5. **Coordinate Timing**: Avoid simultaneous modifications to the same files

## Environment Variables

The dashboard automatically sets these environment variables:
- \`CLAUDE_DASHBOARD_INSTANCE_ID\` - Your unique instance ID
- \`CLAUDE_DASHBOARD_PROJECT_ID\` - The project you're working on
- \`CLAUDE_DASHBOARD_API_URL\` - The dashboard API base URL
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
curl -s -X POST "http://localhost:${port}/api/orchestration/propose" \\
  -H "Content-Type: application/json" \\
  -d '{
    "directorId": "'$CLAUDE_DASHBOARD_INSTANCE_ID'",
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
curl -s "http://localhost:${port}/api/orchestration/workers?directorId=$CLAUDE_DASHBOARD_INSTANCE_ID"
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
curl -s "http://localhost:${port}/api/orchestration/context?directorId=$CLAUDE_DASHBOARD_INSTANCE_ID"
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
- \`CLAUDE_DASHBOARD_INSTANCE_ID\` - Your unique instance ID (use as directorId)
- \`CLAUDE_DASHBOARD_PROJECT_ID\` - The project you're working on
- \`CLAUDE_DASHBOARD_API_URL\` - The dashboard API base URL
`,
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
    return Object.values(generateSkills(this.apiPort));
  }

  /**
   * Get a specific skill
   */
  public getSkill(id: string): SkillDefinition | undefined {
    const skills = generateSkills(this.apiPort);
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
    const skills = generateSkills(this.apiPort);

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
      const skills = generateSkills(this.apiPort);
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
      const skills = generateSkills(this.apiPort);

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
    const skills = generateSkills(this.apiPort);
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
