import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TEST_DEFINITIONS, getTestDefinition, type SequenceDurations } from '@/config/tests';
import type { Operator, TestObject, TestResults, TestRun, TestSelection } from './types';

interface AppState {
  operator: Operator | null;
  testObject: TestObject | null;
  selection: TestSelection[];
  runs: Record<string, TestRun>;
  results: TestResults;

  login: (id: string) => void;
  logout: () => void;
  saveTestObject: (obj: TestObject) => void;

  toggleTest: (testId: string) => void;
  /** Adds every available test not yet selected, keeping the existing order first. */
  selectAllTests: () => void;
  clearSelection: () => void;
  /** Creates pending run records for the current selection (tests already run keep theirs). */
  beginSequence: () => void;

  setRunDurations: (testId: string, durations: SequenceDurations) => void;
  markRunStarted: (testId: string) => void;
  markRunEnded: (testId: string, status: 'completed' | 'aborted') => void;
  saveResults: (patch: Partial<TestResults>) => void;
  resetSession: () => void;
  /** Clears the test object and session so the next transformer can be registered. */
  startNewObject: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      operator: null,
      testObject: null,
      selection: [],
      runs: {},
      results: {},

      login: (id) => set({ operator: { id, loginAt: Date.now() } }),
      logout: () => set({ operator: null }),

      saveTestObject: (obj) => set({ testObject: obj }),

      toggleTest: (testId) => {
        const { selection } = get();
        const exists = selection.some((s) => s.testId === testId);
        if (exists) {
          set({ selection: selection.filter((s) => s.testId !== testId) });
          return;
        }
        const def = getTestDefinition(testId);
        if (!def?.available) return;
        set({ selection: [...selection, { testId, side: def.defaultSide }] });
      },

      selectAllTests: () => {
        const { selection } = get();
        const chosen = new Set(selection.map((s) => s.testId));
        const added = TEST_DEFINITIONS.filter((d) => d.available && !chosen.has(d.id)).map((d) => ({
          testId: d.id,
          side: d.defaultSide,
        }));
        set({ selection: [...selection, ...added] });
      },

      clearSelection: () => set({ selection: [] }),

      beginSequence: () => {
        // Sides are fixed per test in config; normalise any older persisted choice.
        const selection = get()
          .selection.map((s) => {
            const def = getTestDefinition(s.testId);
            return def?.available ? { testId: s.testId, side: def.defaultSide } : null;
          })
          .filter((s): s is TestSelection => s !== null);
        const prev = get().runs;
        const runs: Record<string, TestRun> = {};
        for (const s of selection) {
          const def = getTestDefinition(s.testId);
          if (!def) continue;
          runs[s.testId] = prev[s.testId] ?? {
            testId: s.testId,
            side: s.side,
            status: 'pending',
            durations: { ...def.defaultDurations },
            startedAt: null,
            endedAt: null,
          };
        }
        set({ selection, runs });
      },

      setRunDurations: (testId, durations) =>
        set((st) => {
          const run = st.runs[testId];
          return run ? { runs: { ...st.runs, [testId]: { ...run, durations } } } : st;
        }),

      markRunStarted: (testId) =>
        set((st) => {
          const run = st.runs[testId];
          if (!run) return st;
          return {
            runs: {
              ...st.runs,
              [testId]: { ...run, status: 'running', startedAt: Date.now(), endedAt: null },
            },
          };
        }),

      markRunEnded: (testId, status) =>
        set((st) => {
          const run = st.runs[testId];
          if (!run) return st;
          return { runs: { ...st.runs, [testId]: { ...run, status, endedAt: Date.now() } } };
        }),

      saveResults: (patch) => set((st) => ({ results: { ...st.results, ...patch } })),

      resetSession: () => set({ selection: [], runs: {}, results: {} }),
      startNewObject: () => set({ testObject: null, selection: [], runs: {}, results: {} }),
    }),
    {
      name: 'ttb01.session',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // v2: energised side is fixed per test — drop any side chosen in v1.
      migrate: (persisted, version) => {
        const state = persisted as Partial<AppState>;
        if (version < 2 && state.selection) {
          state.selection = state.selection
            .map((s) => {
              const def = getTestDefinition(s.testId);
              return def ? { testId: s.testId, side: def.defaultSide } : null;
            })
            .filter((s): s is TestSelection => s !== null);
        }
        return state as AppState;
      },
      partialize: (s) => ({
        operator: s.operator,
        testObject: s.testObject,
        selection: s.selection,
        runs: s.runs,
        results: s.results,
      }),
    },
  ),
);
