/**
 * TerminalDimensionManager - Tracks and synchronizes terminal dimensions across connected clients
 *
 * When multiple clients (web, cluster, electron renderer) are connected to the same instance,
 * this service ensures the PTY is resized to the minimum dimensions across all clients
 * to prevent rendering issues.
 *
 * Client identifiers:
 * - Web: `web:${socketId}`
 * - Cluster: `cluster:${nodeId}`
 * - Renderer: `electron:renderer`
 */

export interface ClientDimensions {
  cols: number;
  rows: number;
}

export interface DimensionUpdateResult {
  changed: boolean;
  min: ClientDimensions;
}

// Minimum usable terminal dimensions
const MIN_COLS = 40;
const MIN_ROWS = 10;

export class TerminalDimensionManager {
  private static instance: TerminalDimensionManager | null = null;

  // Map<instanceId, Map<clientId, dimensions>>
  private clientDimensions: Map<string, Map<string, ClientDimensions>> = new Map();

  // Cache of last calculated minimum dimensions per instance
  private minDimensionsCache: Map<string, ClientDimensions> = new Map();

  private constructor() {}

  public static getInstance(): TerminalDimensionManager {
    if (!TerminalDimensionManager.instance) {
      TerminalDimensionManager.instance = new TerminalDimensionManager();
    }
    return TerminalDimensionManager.instance;
  }

  /**
   * Update dimensions for a specific client
   * @returns Whether the minimum dimensions changed and the new minimum
   */
  public updateClientDimensions(
    instanceId: string,
    clientId: string,
    cols: number,
    rows: number
  ): DimensionUpdateResult {
    // Enforce minimum bounds
    const boundedCols = Math.max(MIN_COLS, cols);
    const boundedRows = Math.max(MIN_ROWS, rows);

    // Get or create instance map
    let instanceClients = this.clientDimensions.get(instanceId);
    if (!instanceClients) {
      instanceClients = new Map();
      this.clientDimensions.set(instanceId, instanceClients);
    }

    // Store client dimensions
    instanceClients.set(clientId, { cols: boundedCols, rows: boundedRows });

    // Calculate new minimum
    const newMin = this.calculateMinDimensions(instanceId);
    const oldMin = this.minDimensionsCache.get(instanceId);

    // Check if minimum changed
    const changed = !oldMin || oldMin.cols !== newMin.cols || oldMin.rows !== newMin.rows;

    // Update cache
    this.minDimensionsCache.set(instanceId, newMin);

    console.log(
      `[TerminalDimensionManager] Client ${clientId} for instance ${instanceId}: ` +
        `${boundedCols}x${boundedRows}, min: ${newMin.cols}x${newMin.rows}, changed: ${changed}`
    );

    return { changed, min: newMin };
  }

  /**
   * Remove a client from tracking
   * @returns Whether the minimum dimensions changed and the new minimum (null if no clients left)
   */
  public removeClient(
    instanceId: string,
    clientId: string
  ): { changed: boolean; min: ClientDimensions | null } {
    const instanceClients = this.clientDimensions.get(instanceId);
    if (!instanceClients) {
      return { changed: false, min: null };
    }

    // Remove client
    instanceClients.delete(clientId);

    console.log(
      `[TerminalDimensionManager] Removed client ${clientId} from instance ${instanceId}, ` +
        `${instanceClients.size} clients remaining`
    );

    // If no clients left, cleanup
    if (instanceClients.size === 0) {
      this.clientDimensions.delete(instanceId);
      this.minDimensionsCache.delete(instanceId);
      return { changed: false, min: null };
    }

    // Calculate new minimum
    const newMin = this.calculateMinDimensions(instanceId);
    const oldMin = this.minDimensionsCache.get(instanceId);

    // Check if minimum changed
    const changed = !oldMin || oldMin.cols !== newMin.cols || oldMin.rows !== newMin.rows;

    // Update cache
    this.minDimensionsCache.set(instanceId, newMin);

    return { changed, min: newMin };
  }

  /**
   * Get the current minimum dimensions for an instance
   * @returns Minimum dimensions or null if no clients are tracking this instance
   */
  public getMinDimensions(instanceId: string): ClientDimensions | null {
    return this.minDimensionsCache.get(instanceId) ?? null;
  }

  /**
   * Get all client IDs for an instance
   */
  public getClientIds(instanceId: string): string[] {
    const instanceClients = this.clientDimensions.get(instanceId);
    return instanceClients ? Array.from(instanceClients.keys()) : [];
  }

  /**
   * Get dimensions for a specific client
   */
  public getClientDimensions(instanceId: string, clientId: string): ClientDimensions | null {
    return this.clientDimensions.get(instanceId)?.get(clientId) ?? null;
  }

  /**
   * Clean up all tracking for an instance (called when instance terminates)
   */
  public cleanup(instanceId: string): void {
    const clientCount = this.clientDimensions.get(instanceId)?.size ?? 0;
    this.clientDimensions.delete(instanceId);
    this.minDimensionsCache.delete(instanceId);
    console.log(
      `[TerminalDimensionManager] Cleaned up instance ${instanceId}, was tracking ${clientCount} clients`
    );
  }

  /**
   * Calculate the minimum dimensions across all clients for an instance
   */
  private calculateMinDimensions(instanceId: string): ClientDimensions {
    const instanceClients = this.clientDimensions.get(instanceId);
    if (!instanceClients || instanceClients.size === 0) {
      return { cols: MIN_COLS, rows: MIN_ROWS };
    }

    let minCols = Infinity;
    let minRows = Infinity;

    for (const dims of instanceClients.values()) {
      minCols = Math.min(minCols, dims.cols);
      minRows = Math.min(minRows, dims.rows);
    }

    // Ensure we don't return Infinity
    return {
      cols: minCols === Infinity ? MIN_COLS : minCols,
      rows: minRows === Infinity ? MIN_ROWS : minRows,
    };
  }

  /**
   * Get all tracked instances
   */
  public getTrackedInstances(): string[] {
    return Array.from(this.clientDimensions.keys());
  }

  /**
   * Get client count for an instance
   */
  public getClientCount(instanceId: string): number {
    return this.clientDimensions.get(instanceId)?.size ?? 0;
  }
}

// Export singleton getter
export function getTerminalDimensionManager(): TerminalDimensionManager {
  return TerminalDimensionManager.getInstance();
}
