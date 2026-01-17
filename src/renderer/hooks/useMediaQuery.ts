import { useState, useEffect } from 'react';

/**
 * Hook to detect media query matches
 * @param query - CSS media query string
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    // Set initial value
    setMatches(mediaQuery.matches);

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * Hook to detect mobile devices (< 768px)
 */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');

/**
 * Hook to detect tablet devices (768px - 1023px)
 */
export const useIsTablet = () => useMediaQuery('(min-width: 768px) and (max-width: 1023px)');

/**
 * Hook to detect desktop devices (>= 1024px)
 */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
