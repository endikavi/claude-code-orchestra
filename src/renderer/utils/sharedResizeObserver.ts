/**
 * Shared ResizeObserver singleton
 *
 * Instead of creating a new ResizeObserver for each terminal/component,
 * we use a single shared observer to reduce memory and improve performance.
 * With N terminals, this reduces from N observers to 1 observer.
 */

type ResizeCallback = (entry: ResizeObserverEntry) => void;

class SharedResizeObserver {
  private observer: ResizeObserver;
  private callbacks = new Map<Element, ResizeCallback>();

  constructor() {
    this.observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const callback = this.callbacks.get(entry.target);
        if (callback) {
          // Use requestAnimationFrame to batch resize operations
          requestAnimationFrame(() => callback(entry));
        }
      }
    });
  }

  /**
   * Observe an element for resize events
   * @param element The element to observe
   * @param callback The callback to invoke on resize
   * @returns A cleanup function to stop observing
   */
  observe(element: Element, callback: ResizeCallback): () => void {
    this.callbacks.set(element, callback);
    this.observer.observe(element);

    return () => {
      this.callbacks.delete(element);
      this.observer.unobserve(element);
    };
  }

  /**
   * Check if an element is being observed
   */
  isObserving(element: Element): boolean {
    return this.callbacks.has(element);
  }

  /**
   * Get the number of elements being observed
   */
  get observedCount(): number {
    return this.callbacks.size;
  }
}

// Export singleton instance
export const sharedResizeObserver = new SharedResizeObserver();
