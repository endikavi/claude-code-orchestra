/**
 * TeamFileWatcher - Watches Claude Code's team config files for changes
 *
 * Claude Code stores team configs in ~/.claude/teams/<team-name>/config.json
 * Each team directory contains a config.json with members and optional description.
 *
 * This is a GLOBAL watcher (not per-instance) that monitors all teams.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import type { TrackedTeam, TeamMember } from '@shared/types/teams';

// Polling interval for directory changes (ms)
const POLL_INTERVAL = 1000;

// Team config file structure as stored by Claude Code
interface ClaudeTeamConfigFile {
  members: Array<{
    name: string;
    agentId: string;
    agentType: string;
  }>;
  description?: string;
}

/**
 * Get the Claude teams directory
 */
export function getClaudeTeamsDir(): string {
  return path.join(homedir(), '.claude', 'teams');
}

export class TeamFileWatcher extends EventEmitter {
  private pollTimer: NodeJS.Timeout | null = null;
  private isWatching: boolean = false;
  private knownTeams: Map<string, TrackedTeam> = new Map();
  private lastModifiedTimes: Map<string, number> = new Map();
  private teamCreatedTimes: Map<string, number> = new Map();
  private teamsDir: string;

  constructor() {
    super();
    this.teamsDir = getClaudeTeamsDir();
  }

  /**
   * Start watching the teams directory for changes
   */
  start(): void {
    if (this.isWatching) {
      return;
    }

    this.isWatching = true;
    this.startPolling();
    this.emit('ready');
  }

  /**
   * Stop watching
   */
  stop(): void {
    this.stopWatching();
    this.emit('close');
  }

  private stopWatching(): void {
    this.isWatching = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Start polling the directory for changes
   */
  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.checkForChanges();
    }, POLL_INTERVAL);

    // Also check immediately
    this.checkForChanges();
  }

  /**
   * Check if team config files have changed
   */
  private checkForChanges(): void {
    if (!this.isWatching) return;

    try {
      // Check if directory exists
      if (!fs.existsSync(this.teamsDir)) {
        // If we had known teams but directory is gone, emit deletions
        if (this.knownTeams.size > 0) {
          for (const [teamName] of this.knownTeams) {
            this.knownTeams.delete(teamName);
            this.lastModifiedTimes.delete(teamName);
            this.teamCreatedTimes.delete(teamName);
            this.emit('team_deleted', { teamName });
          }
        }
        return;
      }

      // Get all subdirectories in the teams directory
      const entries = fs.readdirSync(this.teamsDir, { withFileTypes: true });
      const teamDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      // Track which teams we've seen
      const seenTeams = new Set<string>();

      for (const teamName of teamDirs) {
        const configPath = path.join(this.teamsDir, teamName, 'config.json');
        seenTeams.add(teamName);

        try {
          // Check if config.json exists
          if (!fs.existsSync(configPath)) {
            continue;
          }

          const stats = fs.statSync(configPath);
          const lastModified = stats.mtimeMs;
          const previousModified = this.lastModifiedTimes.get(teamName);

          // Check if file is new or modified
          if (previousModified === undefined || lastModified > previousModified) {
            this.lastModifiedTimes.set(teamName, lastModified);
            this.processTeamConfig(configPath, teamName, previousModified === undefined);
          }
        } catch {
          // File might have been deleted or inaccessible, ignore
        }
      }

      // Check for deleted teams
      for (const [teamName] of this.knownTeams) {
        if (!seenTeams.has(teamName)) {
          this.knownTeams.delete(teamName);
          this.lastModifiedTimes.delete(teamName);
          this.teamCreatedTimes.delete(teamName);
          this.emit('team_deleted', { teamName });
        }
      }
    } catch {
      // Directory might not exist yet or be inaccessible, ignore
    }
  }

  /**
   * Parse and validate a team config file
   */
  private parseTeamConfig(content: string): ClaudeTeamConfigFile | null {
    try {
      const parsed = JSON.parse(content);

      // Validate required fields
      if (!parsed || !Array.isArray(parsed.members)) {
        return null;
      }

      // Validate each member has required fields
      const validMembers = parsed.members.filter(
        (m: Record<string, unknown>) =>
          m &&
          typeof m.name === 'string' &&
          typeof m.agentId === 'string' &&
          typeof m.agentType === 'string'
      );

      return {
        members: validMembers,
        description: typeof parsed.description === 'string' ? parsed.description : undefined,
      };
    } catch {
      // Malformed JSON
      return null;
    }
  }

  /**
   * Convert parsed config to TrackedTeam format
   */
  private toTrackedTeam(
    teamName: string,
    configPath: string,
    config: ClaudeTeamConfigFile,
    createdAt: number
  ): TrackedTeam {
    const members: TeamMember[] = config.members.map((m) => ({
      name: m.name,
      agentId: m.agentId,
      agentType: m.agentType,
    }));

    return {
      name: teamName,
      description: config.description,
      members,
      configPath,
      createdAt,
      updatedAt: Date.now(),
    };
  }

  /**
   * Check if two team configs are meaningfully different
   */
  private hasTeamChanged(previous: TrackedTeam, current: TrackedTeam): boolean {
    if (previous.description !== current.description) return true;
    if (previous.members.length !== current.members.length) return true;

    for (let i = 0; i < previous.members.length; i++) {
      const prevMember = previous.members[i];
      const currMember = current.members[i];
      if (
        prevMember.name !== currMember.name ||
        prevMember.agentId !== currMember.agentId ||
        prevMember.agentType !== currMember.agentType
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Process a team config file and emit appropriate events
   */
  private processTeamConfig(configPath: string, teamName: string, isNew: boolean): void {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = this.parseTeamConfig(content);

      if (!config) {
        console.error(`[TeamFileWatcher] Malformed config for team "${teamName}": ${configPath}`);
        return;
      }

      // Track createdAt - only set on first encounter, preserve afterwards
      if (isNew) {
        this.teamCreatedTimes.set(teamName, Date.now());
      }
      const createdAt = this.teamCreatedTimes.get(teamName) ?? Date.now();

      const trackedTeam = this.toTrackedTeam(teamName, configPath, config, createdAt);
      const previousTeam = this.knownTeams.get(teamName);
      this.knownTeams.set(teamName, trackedTeam);

      if (isNew) {
        this.emit('team_created', { team: trackedTeam });
      } else if (previousTeam && this.hasTeamChanged(previousTeam, trackedTeam)) {
        this.emit('team_updated', { team: trackedTeam });
      }
    } catch (error) {
      console.error(`[TeamFileWatcher] Error reading team config ${configPath}:`, error);
      this.emit('error', error);
    }
  }

  /**
   * Get all currently tracked teams
   */
  getAllTeams(): TrackedTeam[] {
    return Array.from(this.knownTeams.values());
  }

  /**
   * Get a team by name
   */
  getTeamByName(teamName: string): TrackedTeam | null {
    return this.knownTeams.get(teamName) ?? null;
  }

  /**
   * Check if the watcher is currently active
   */
  isActive(): boolean {
    return this.isWatching;
  }
}

// Singleton instance
let teamFileWatcher: TeamFileWatcher | null = null;

export function getTeamFileWatcher(): TeamFileWatcher {
  if (!teamFileWatcher) {
    teamFileWatcher = new TeamFileWatcher();
  }
  return teamFileWatcher;
}
