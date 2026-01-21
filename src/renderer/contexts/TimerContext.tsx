/**
 * Shared Timer Context
 *
 * Instead of each SubagentCard creating its own setInterval for elapsed time updates,
 * we use a single shared timer that all components can subscribe to.
 * With N active subagents, this reduces from N intervals to 1 interval.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Context holds the current timestamp, updated every second
const TimerContext = createContext<number>(Date.now());

interface TimerProviderProps {
  children: ReactNode;
  /** Update interval in milliseconds (default: 1000ms) */
  interval?: number;
}

/**
 * Provider component that maintains a shared timer
 * All children can access the current timestamp via useSharedTimer()
 */
export function TimerProvider({ children, interval = 1000 }: TimerProviderProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return <TimerContext.Provider value={now}>{children}</TimerContext.Provider>;
}

/**
 * Hook to access the shared timer value
 * Returns the current timestamp, which updates every second (or custom interval)
 * Use this instead of creating component-specific intervals
 */
export function useSharedTimer(): number {
  return useContext(TimerContext);
}

/**
 * Hook for formatting elapsed time from a start timestamp
 * Automatically updates when the shared timer updates
 */
export function useElapsedTime(startedAt: number, completedAt?: number): string {
  const now = useSharedTimer();

  // Use completedAt if available, otherwise use current time
  const end = completedAt || now;
  const duration = end - startedAt;
  const seconds = Math.floor(duration / 1000);

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
