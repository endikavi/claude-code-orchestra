// ==================== Claude Code Teams Types ====================
// These types track Claude's native Teammate tool (spawnTeam, SendMessage)

// Team member from config.json
export interface TeamMember {
  name: string;
  agentId: string;
  agentType: string;
  status?: 'active' | 'idle' | 'shutdown';
}

// Tracked team from filesystem watching
export interface TrackedTeam {
  name: string; // Team directory name
  description?: string;
  members: TeamMember[];
  parentInstanceId?: string; // Instance that spawned the team
  configPath: string; // Full path to config.json
  createdAt: number;
  updatedAt: number;
}

// Events for team lifecycle
export interface TeamCreatedEvent {
  team: TrackedTeam;
}

export interface TeamUpdatedEvent {
  team: TrackedTeam;
}

export interface TeamDeletedEvent {
  teamName: string;
}

// Team message detected from SendMessage tool
export interface TeamMessageEvent {
  instanceId: string;
  type: 'message' | 'broadcast' | 'shutdown_request' | 'shutdown_response';
  recipient?: string;
  content?: string;
  summary?: string;
}

// Team spawn detected from Teammate tool
export interface TeamSpawnEvent {
  instanceId: string;
  teamName: string;
  description?: string;
  operation: 'spawnTeam' | 'cleanup';
}

// IPC channel types for teams
export interface TeamIpcChannels {
  'team:getAll': () => TrackedTeam[];
  'team:getByName': (name: string) => TrackedTeam | null;
}

// Team events (main -> renderer)
export interface TeamEvents {
  'team:created': (team: TrackedTeam) => void;
  'team:updated': (team: TrackedTeam) => void;
  'team:deleted': (teamName: string) => void;
}
