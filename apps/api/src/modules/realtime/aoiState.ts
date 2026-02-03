/**
 * AOI (Area of Interest) State — In-memory subscription tracking
 *
 * Tracks which sockets are subscribed to which chunks.
 * Pure in-memory, no persistence.
 */

export class AoiState {
  /** socketId → Set<"chunkX,chunkZ"> */
  private subscriptions = new Map<string, Set<string>>();

  private chunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }

  /**
   * Subscribe a socket to chunks. Returns newly added chunk keys.
   */
  subscribe(
    socketId: string,
    chunks: Array<{ chunkX: number; chunkZ: number }>,
  ): Array<{ chunkX: number; chunkZ: number }> {
    let set = this.subscriptions.get(socketId);
    if (!set) {
      set = new Set();
      this.subscriptions.set(socketId, set);
    }

    const added: Array<{ chunkX: number; chunkZ: number }> = [];
    for (const { chunkX, chunkZ } of chunks) {
      const key = this.chunkKey(chunkX, chunkZ);
      if (!set.has(key)) {
        set.add(key);
        added.push({ chunkX, chunkZ });
      }
    }

    return added;
  }

  /**
   * Unsubscribe a socket from chunks.
   */
  unsubscribe(
    socketId: string,
    chunks: Array<{ chunkX: number; chunkZ: number }>,
  ): void {
    const set = this.subscriptions.get(socketId);
    if (!set) return;

    for (const { chunkX, chunkZ } of chunks) {
      set.delete(this.chunkKey(chunkX, chunkZ));
    }

    if (set.size === 0) {
      this.subscriptions.delete(socketId);
    }
  }

  /**
   * Remove all subscriptions for a socket (on disconnect).
   */
  removeSocket(socketId: string): void {
    this.subscriptions.delete(socketId);
  }

  /**
   * Get all subscribed chunks for a socket.
   */
  getChunks(socketId: string): Array<{ chunkX: number; chunkZ: number }> {
    const set = this.subscriptions.get(socketId);
    if (!set) return [];

    return Array.from(set).map(key => {
      const [cx, cz] = key.split(',').map(Number);
      return { chunkX: cx, chunkZ: cz };
    });
  }

  /**
   * Total number of tracked sockets.
   */
  get socketCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Total subscriptions across all sockets.
   */
  get totalSubscriptions(): number {
    let total = 0;
    for (const set of this.subscriptions.values()) {
      total += set.size;
    }
    return total;
  }
}
