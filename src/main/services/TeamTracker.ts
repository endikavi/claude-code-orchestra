import { EventEmitter } from 'events';
import type { TrackedTeam } from '@shared/types/teams';

/**
 * Tracks Claude Code teams detected from both file watching and stream parsing.
 * This is a passive observer that doesn't interfere with Claude's operation.
 */
export class TeamTracker extends EventEmitter {
  // Map of teamName -> TrackedTeam
  private teams = new Map<string, TrackedTeam>();

  /**
   * Set (create or update) a team
   */
  setTeam(team: TrackedTeam): TrackedTeam {
    const existing = this.teams.get(team.name);
    this.teams.set(team.name, team);

    if (existing) {
      console.log(`[TeamTracker] Updated team "${team.name}" (${team.members.length} members)`);
    } else {
      console.log(`[TeamTracker] Added team "${team.name}" (${team.members.length} members)`);
    }

    return team;
  }

  /**
   * Delete a team by name
   */
  deleteTeam(teamName: string): boolean {
    const deleted = this.teams.delete(teamName);
    if (deleted) {
      console.log(`[TeamTracker] Deleted team "${teamName}"`);
    }
    return deleted;
  }

  /**
   * Get all tracked teams
   */
  getAllTeams(): TrackedTeam[] {
    return Array.from(this.teams.values());
  }

  /**
   * Get a team by name
   */
  getTeamByName(teamName: string): TrackedTeam | null {
    return this.teams.get(teamName) ?? null;
  }

  /**
   * Get the number of tracked teams
   */
  getTeamCount(): number {
    return this.teams.size;
  }
}

// Singleton instance
let teamTracker: TeamTracker | null = null;

export function getTeamTracker(): TeamTracker {
  if (!teamTracker) {
    teamTracker = new TeamTracker();
  }
  return teamTracker;
}
