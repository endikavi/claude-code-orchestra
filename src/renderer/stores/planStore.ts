import { create } from 'zustand';
import type { TrackedPlan } from '@shared/types';

interface PlanState {
  plans: Record<string, TrackedPlan>; // keyed by plan name
  selectedPlanName: string | null;
  selectedPlanContent: string | null;
  isLoading: boolean;
  isLoadingContent: boolean;
  error: string | null;

  loadAllPlans: () => Promise<void>;
  handlePlanCreated: (plan: TrackedPlan) => void;
  handlePlanUpdated: (plan: TrackedPlan) => void;
  handlePlanDeleted: (planName: string) => void;
  selectPlan: (planName: string | null) => Promise<void>;

  getAllPlans: () => TrackedPlan[];
  getPlanCount: () => number;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: {},
  selectedPlanName: null,
  selectedPlanContent: null,
  isLoading: false,
  isLoadingContent: false,
  error: null,

  loadAllPlans: async () => {
    if (!window.electronAPI?.plan) {
      set({ isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const allPlans = await window.electronAPI.plan.getAll();
      const plansMap: Record<string, TrackedPlan> = {};
      for (const plan of allPlans) {
        plansMap[plan.name] = plan;
      }
      set({ plans: plansMap, isLoading: false });
    } catch (error) {
      console.error('Failed to load plans:', error);
      set({ error: 'Failed to load plans', isLoading: false });
    }
  },

  handlePlanCreated: (plan: TrackedPlan) => {
    set((state) => ({
      plans: { ...state.plans, [plan.name]: plan },
    }));
  },

  handlePlanUpdated: (plan: TrackedPlan) => {
    set((state) => ({
      plans: { ...state.plans, [plan.name]: plan },
    }));
  },

  handlePlanDeleted: (planName: string) => {
    set((state) => {
      const { [planName]: _, ...rest } = state.plans;
      const updates: Partial<PlanState> = { plans: rest };
      if (state.selectedPlanName === planName) {
        updates.selectedPlanName = null;
        updates.selectedPlanContent = null;
      }
      return updates as PlanState;
    });
  },

  selectPlan: async (planName: string | null) => {
    if (!planName) {
      set({ selectedPlanName: null, selectedPlanContent: null });
      return;
    }
    set({ selectedPlanName: planName, isLoadingContent: true });
    try {
      if (window.electronAPI?.plan) {
        const plan = await window.electronAPI.plan.getByName(planName);
        set({
          selectedPlanContent: plan?.content || null,
          isLoadingContent: false,
        });
      }
    } catch (error) {
      console.error('Failed to load plan content:', error);
      set({ selectedPlanContent: null, isLoadingContent: false });
    }
  },

  getAllPlans: () => Object.values(get().plans),

  getPlanCount: () => Object.keys(get().plans).length,
}));

export function setupPlanEventListeners(): () => void {
  const store = usePlanStore.getState();

  if (!window.electronAPI?.plan) {
    return () => {};
  }

  const unsubCreated = window.electronAPI.plan.onCreated((plan) => {
    store.handlePlanCreated(plan);
  });

  const unsubUpdated = window.electronAPI.plan.onUpdated((plan) => {
    store.handlePlanUpdated(plan);
  });

  const unsubDeleted = window.electronAPI.plan.onDeleted((planName) => {
    store.handlePlanDeleted(planName);
  });

  void store.loadAllPlans();

  return () => {
    unsubCreated();
    unsubUpdated();
    unsubDeleted();
  };
}
