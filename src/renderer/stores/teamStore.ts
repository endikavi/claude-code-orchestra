import { create } from 'zustand';
import type { TrackedTeam } from '@shared/types';

interface TeamState {
  // State
  teams: Record<string, TrackedTeam>; // keyed by team name
  isLoading: boolean;
  error: string | null;

  // Operations
  loadAllTeams: () => Promise<void>;
  handleTeamCreated: (team: TrackedTeam) => void;
  handleTeamUpdated: (team: TrackedTeam) => void;
  handleTeamDeleted: (teamName: string) => void;

  // Selectors
  getAllTeams: () => TrackedTeam[];
  getTeamByName: (name: string) => TrackedTeam | undefined;
  getTeamCount: () => number;
  getTotalMembers: () => number;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  teams: {},
  isLoading: false,
  error: null,

  loadAllTeams: async () => {
    if (!window.electronAPI?.team) {
      set({ isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const allTeams = await window.electronAPI.team.getAll();
      const teamsMap: Record<string, TrackedTeam> = {};
      for (const team of allTeams) {
        teamsMap[team.name] = team;
      }
      set({ teams: teamsMap, isLoading: false });
    } catch (error) {
      console.error('Failed to load teams:', error);
      set({ error: 'Failed to load teams', isLoading: false });
    }
  },

  handleTeamCreated: (team: TrackedTeam) => {
    set((state) => ({
      teams: { ...state.teams, [team.name]: team },
    }));
  },

  handleTeamUpdated: (team: TrackedTeam) => {
    set((state) => ({
      teams: { ...state.teams, [team.name]: team },
    }));
  },

  handleTeamDeleted: (teamName: string) => {
    set((state) => {
      const { [teamName]: _, ...rest } = state.teams;
      return { teams: rest };
    });
  },

  getAllTeams: () => Object.values(get().teams),

  getTeamByName: (name: string) => get().teams[name],

  getTeamCount: () => Object.keys(get().teams).length,

  getTotalMembers: () => {
    return Object.values(get().teams).reduce((sum, team) => sum + team.members.length, 0);
  },
}));

export function setupTeamEventListeners(): () => void {
  const store = useTeamStore.getState();

  if (!window.electronAPI?.team) {
    return () => {};
  }

  const unsubCreated = window.electronAPI.team.onCreated((team) => {
    store.handleTeamCreated(team);
  });

  const unsubUpdated = window.electronAPI.team.onUpdated((team) => {
    store.handleTeamUpdated(team);
  });

  const unsubDeleted = window.electronAPI.team.onDeleted((teamName) => {
    store.handleTeamDeleted(teamName);
  });

  void store.loadAllTeams();

  return () => {
    unsubCreated();
    unsubUpdated();
    unsubDeleted();
  };
}
