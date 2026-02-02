/**
 * ThreeFloatingText - Metin2-style floating damage/reward text system
 *
 * Pool-based sprite system for animated floating text above 3D locations.
 * Pre-allocates sprites and recycles them for performance.
 *
 * Features:
 * - Canvas-based text rendering with outline and shadow
 * - Texture caching to avoid regenerating same text
 * - Smooth float-up animation with fade and scale
 * - Color presets for different event types
 *
 * Usage Example:
 * ```typescript
 * // In CityRenderer3D or component with renderer access
 *
 * // Building level up
 * renderer.showFloatingText({
 *   text: 'Level Up!',
 *   x: building.coords.x * TILE_SIZE,
 *   z: building.coords.y * TILE_SIZE,
 *   type: 'levelup'
 * });
 *
 * // Resource gained
 * renderer.showFloatingText({
 *   text: '+50 Food',
 *   x: parcel.bounds.x * TILE_SIZE,
 *   z: parcel.bounds.y * TILE_SIZE,
 *   type: 'reward'
 * });
 *
 * // Damage taken
 * renderer.showFloatingText({
 *   text: '-120 HP',
 *   x: worldX,
 *   z: worldZ,
 *   type: 'damage'
 * });
 * ```
 */

import * as THREE from 'three';
import { FLOATING_TEXT_SPEED, FLOATING_TEXT_DURATION, FLOATING_TEXT_POOL_SIZE } from './ThreeConfig';

export type FloatingTextType = 'damage' | 'reward' | 'levelup' | 'info';

export interface FloatingTextOptions {
  text: string;
  x: number;
  z: number;
  color?: string;
  fontSize?: number;
  duration?: number;
  type?: FloatingTextType;
}

interface ActiveText {
  sprite: THREE.Sprite;
  startY: number;
  elapsed: number;
  duration: number;
  active: boolean;
}

// Color presets by type
const COLOR_PRESETS: Record<FloatingTextType, string> = {
  damage: '#ff4444',
  reward: '#4ade80',
  levelup: '#fbbf24',
  info: '#ffffff',
};

export class ThreeFloatingText {
  private scene: THREE.Scene;
  private pool: ActiveText[] = [];
  private textureCache = new Map<string, THREE.CanvasTexture>();
  private canvasCache: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create reusable canvas for texture generation
    this.canvasCache = document.createElement('canvas');
    this.canvasCache.width = 256;
    this.canvasCache.height = 64;
    const ctx = this.canvasCache.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    // Pre-allocate sprite pool
    this.initializePool();
  }

  /**
   * Initialize sprite pool
   */
  private initializePool(): void {
    for (let i = 0; i < FLOATING_TEXT_POOL_SIZE; i++) {
      // Create empty sprite (texture will be assigned when spawned)
      const material = new THREE.SpriteMaterial({
        transparent: true,
        opacity: 1.0,
        depthTest: false,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 1000 + i; // Render on top
      this.scene.add(sprite);

      this.pool.push({
        sprite,
        startY: 0,
        elapsed: 0,
        duration: FLOATING_TEXT_DURATION,
        active: false,
      });
    }
  }

  /**
   * Spawn a floating text at world position
   */
  spawn(options: FloatingTextOptions): void {
    // Find inactive sprite from pool
    const entry = this.pool.find((e) => !e.active);
    if (!entry) return; // Pool exhausted

    // Determine color
    const color = options.color ?? (options.type ? COLOR_PRESETS[options.type] : '#c9a84c');
    const fontSize = options.fontSize ?? 24;
    const duration = options.duration ?? FLOATING_TEXT_DURATION;

    // Get or create texture
    const cacheKey = `${options.text}_${color}_${fontSize}`;
    let texture = this.textureCache.get(cacheKey);

    if (!texture) {
      texture = this.createTextTexture(options.text, color, fontSize);
      this.textureCache.set(cacheKey, texture);

      // Cache limit: keep only 50 most recent textures
      if (this.textureCache.size > 50) {
        const firstKey = this.textureCache.keys().next().value as string;
        if (firstKey) {
          const oldTexture = this.textureCache.get(firstKey);
          oldTexture?.dispose();
          this.textureCache.delete(firstKey);
        }
      }
    }

    // Configure sprite
    entry.sprite.material.map = texture;
    entry.sprite.material.needsUpdate = true;
    entry.sprite.material.opacity = 1.0;
    entry.sprite.position.set(options.x, 0.5, options.z); // Start slightly above ground
    entry.sprite.scale.set(1.0, 0.5, 1.0); // Billboard aspect ratio
    entry.sprite.visible = true;

    // Activate
    entry.startY = 0.5;
    entry.elapsed = 0;
    entry.duration = duration;
    entry.active = true;
  }

  /**
   * Create canvas texture for text rendering
   */
  private createTextTexture(text: string, color: string, fontSize: number): THREE.CanvasTexture {
    const canvas = this.canvasCache;
    const ctx = this.ctx;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Font settings
    ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Shadow for depth
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Outline (stroke)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, centerX, centerY);

    // Reset shadow for fill
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Fill text
    ctx.fillStyle = color;
    ctx.fillText(text, centerX, centerY);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return texture;
  }

  /**
   * Animate all active floating texts (called every frame)
   */
  animate(deltaTime: number): void {
    for (const entry of this.pool) {
      if (!entry.active) continue;

      entry.elapsed += deltaTime;
      const progress = entry.elapsed / entry.duration;

      if (progress >= 1.0) {
        // Animation complete — hide sprite
        entry.sprite.visible = false;
        entry.active = false;
        continue;
      }

      // Move upward
      const yOffset = FLOATING_TEXT_SPEED * entry.elapsed;
      entry.sprite.position.y = entry.startY + yOffset;

      // Fade out
      entry.sprite.material.opacity = 1.0 - progress;

      // Scale animation: grow to 1.2, then shrink
      let scale: number;
      if (progress < 0.2) {
        // Grow phase (0.0 → 0.2)
        scale = 1.0 + (progress / 0.2) * 0.2;
      } else if (progress < 0.6) {
        // Hold at 1.2
        scale = 1.2;
      } else {
        // Shrink phase (0.6 → 1.0)
        scale = 1.2 - ((progress - 0.6) / 0.4) * 0.4;
      }

      entry.sprite.scale.set(scale, scale * 0.5, 1.0);
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    // Dispose sprites
    for (const entry of this.pool) {
      entry.sprite.material.dispose();
      this.scene.remove(entry.sprite);
    }
    this.pool = [];

    // Dispose textures
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
  }
}
