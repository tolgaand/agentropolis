/**
 * ThreeFactionIndicators - Visualize faction ownership on 3D map
 *
 * Two-layer system:
 * 1. Ground overlays: Semi-transparent colored planes over parcel territory
 * 2. Banner poles: Vertical poles with faction-colored flags at parcel centers
 *
 * Uses InstancedMesh for performance with potentially hundreds of parcels.
 */

import * as THREE from 'three';
import {
  TILE_SIZE,
  FACTION_COLORS,
  FACTION_OVERLAY_OPACITY,
  FACTION_BANNER_HEIGHT,
  FACTION_BANNER_HIDE_ZOOM,
} from './ThreeConfig';
import type { MapParcel } from '@agentropolis/shared';

export class ThreeFactionIndicators {
  private scene: THREE.Scene;
  private overlayGroup: THREE.Group;
  private bannerGroup: THREE.Group;
  private overlayMeshes: THREE.InstancedMesh[] = [];
  private poleMeshes: THREE.InstancedMesh[] = [];
  private bannerMeshes: THREE.InstancedMesh[] = [];

  private currentZoom = 1.0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.overlayGroup = new THREE.Group();
    this.overlayGroup.name = 'faction_overlays';
    this.bannerGroup = new THREE.Group();
    this.bannerGroup.name = 'faction_banners';

    this.scene.add(this.overlayGroup);
    this.scene.add(this.bannerGroup);
  }

  /**
   * Rebuild faction indicators from parcel data.
   * Creates ground overlays and banner poles for each faction-owned parcel.
   */
  updateParcels(parcels: MapParcel[]): void {
    this.dispose();

    if (parcels.length === 0) return;

    // Group parcels by faction (worldId)
    const parcelsByFaction = new Map<string, MapParcel[]>();
    for (const parcel of parcels) {
      if (!parcel.worldId) continue; // Skip unclaimed parcels
      if (!parcelsByFaction.has(parcel.worldId)) {
        parcelsByFaction.set(parcel.worldId, []);
      }
      parcelsByFaction.get(parcel.worldId)!.push(parcel);
    }

    // Create instanced meshes per faction
    for (const [factionId, factionParcels] of parcelsByFaction) {
      const color = FACTION_COLORS[factionId] ?? 0xffffff;
      this.createOverlaysForFaction(factionParcels, color);
      this.createBannersForFaction(factionParcels, color);
    }

    // Apply current zoom LOD state
    this.updateCamera(this.currentZoom);
  }

  /**
   * Create ground overlay planes for a faction's parcels.
   * Each parcel gets a semi-transparent colored plane at ground level.
   */
  private createOverlaysForFaction(parcels: MapParcel[], color: number): void {
    // Create one instanced mesh for all parcels of this faction
    // We'll use a standard 1x1 plane and scale per-instance
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2); // Rotate to lie flat (XZ plane)

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: FACTION_OVERLAY_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false, // Prevent z-fighting issues
    });

    const mesh = new THREE.InstancedMesh(geometry, material, parcels.length);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < parcels.length; i++) {
      const parcel = parcels[i];
      const { x, y, width, height } = parcel.bounds;

      // Center position in world coordinates (tile index center)
      const centerX = (x + (width - 1) / 2) * TILE_SIZE;
      const centerZ = (y + (height - 1) / 2) * TILE_SIZE;
      const worldWidth = width * TILE_SIZE;
      const worldHeight = height * TILE_SIZE;

      // Position slightly above ground to avoid z-fighting with terrain
      dummy.position.set(centerX, 0.02, centerZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(worldWidth, worldHeight, 1);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.overlayMeshes.push(mesh);
    this.overlayGroup.add(mesh);
  }

  /**
   * Create banner poles (wooden pole + colored flag cloth) at parcel centers.
   * One banner per parcel, visible from a distance to mark territory.
   */
  private createBannersForFaction(parcels: MapParcel[], color: number): void {
    const count = parcels.length;

    // Pole geometry: thin brown cylinder
    const poleGeometry = new THREE.CylinderGeometry(0.05, 0.05, FACTION_BANNER_HEIGHT, 8);
    const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x5A3520 }); // Brown wood

    const poleMesh = new THREE.InstancedMesh(poleGeometry, poleMaterial, count);
    poleMesh.castShadow = true;
    poleMesh.receiveShadow = true;

    // Banner/flag cloth: small plane with faction color
    const bannerGeometry = new THREE.PlaneGeometry(0.6, 0.4);
    const bannerMaterial = new THREE.MeshLambertMaterial({
      color,
      side: THREE.DoubleSide,
    });

    const bannerMesh = new THREE.InstancedMesh(bannerGeometry, bannerMaterial, count);
    bannerMesh.castShadow = false;
    bannerMesh.receiveShadow = false;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const parcel = parcels[i];
      const { x, y, width, height } = parcel.bounds;

      // Banner position: inset from parcel edge to avoid clipping with buildings
      const inset = Math.max(2, Math.floor(Math.min(width, height) * 0.15));
      const bannerX = (x + inset) * TILE_SIZE;
      const bannerZ = (y + height - 1 - inset) * TILE_SIZE;

      // Place pole at parcel edge (not center, to avoid clipping with keep/buildings)
      dummy.position.set(bannerX, FACTION_BANNER_HEIGHT / 2, bannerZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleMesh.setMatrixAt(i, dummy.matrix);

      // Place banner/flag at top of pole
      dummy.position.set(bannerX + 0.3, FACTION_BANNER_HEIGHT * 0.85, bannerZ);
      dummy.rotation.set(0, Math.PI / 4, 0); // Slight angle for visual interest
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bannerMesh.setMatrixAt(i, dummy.matrix);
    }

    poleMesh.instanceMatrix.needsUpdate = true;
    bannerMesh.instanceMatrix.needsUpdate = true;

    this.poleMeshes.push(poleMesh);
    this.bannerMeshes.push(bannerMesh);
    this.bannerGroup.add(poleMesh);
    this.bannerGroup.add(bannerMesh);
  }

  /**
   * Update visibility and opacity based on camera zoom level.
   * LOD: Hide banners when very zoomed out, adjust overlay opacity.
   */
  updateCamera(zoom: number): void {
    this.currentZoom = zoom;

    // Hide banners when zoomed out (strategic overview)
    const showBanners = zoom >= FACTION_BANNER_HIDE_ZOOM;
    this.bannerGroup.visible = showBanners;

    // Adjust overlay opacity based on zoom (more visible when closer)
    const opacityMultiplier = Math.min(1.0, zoom / 2.0); // 100% at zoom 2.0+
    for (const mesh of this.overlayMeshes) {
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = FACTION_OVERLAY_OPACITY * opacityMultiplier;
    }
  }

  /**
   * Dispose all resources (geometries, materials, meshes)
   */
  dispose(): void {
    // Dispose overlays
    for (const mesh of this.overlayMeshes) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        for (const mat of mesh.material) mat.dispose();
      } else {
        mesh.material.dispose();
      }
    }
    this.overlayMeshes = [];
    this.overlayGroup.clear();

    // Dispose poles and banners
    for (const mesh of [...this.poleMeshes, ...this.bannerMeshes]) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        for (const mat of mesh.material) mat.dispose();
      } else {
        mesh.material.dispose();
      }
    }
    this.poleMeshes = [];
    this.bannerMeshes = [];
    this.bannerGroup.clear();
  }
}
