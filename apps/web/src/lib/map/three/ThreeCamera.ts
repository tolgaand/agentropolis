/**
 * ThreeCamera - Isometric OrthographicCamera with pan/zoom controls
 *
 * True isometric: Y rotation = 45°, X rotation = atan(1/√2) ≈ 35.264°
 * Pan = camera position in X/Z plane
 * Zoom = camera.zoom property with smooth lerp
 */

import * as THREE from 'three';
import {
  ISO_ROTATION_X,
  ISO_ROTATION_Y,
  CAMERA_ZOOM_DEFAULT,
  CAMERA_ZOOM_MIN,
  CAMERA_ZOOM_MAX,
  PAN_FRICTION,
  PAN_SPEED,
  ZOOM_LERP_FACTOR,
  ZOOM_STEP_FACTOR,
} from './ThreeConfig';

export interface CameraState {
  panX: number;   // World X position
  panZ: number;   // World Z position
  zoom: number;   // Current orthographic zoom
  targetZoom: number; // Target zoom for smooth interpolation
  vx: number;     // Pan velocity X
  vz: number;     // Pan velocity Z
}

export class ThreeCamera {
  camera: THREE.OrthographicCamera;
  private cameraRig: THREE.Object3D;
  private state: CameraState;

  constructor(aspect: number) {
    // Create orthographic camera
    const frustum = 50;
    this.camera = new THREE.OrthographicCamera(
      -frustum * aspect,
      frustum * aspect,
      frustum,
      -frustum,
      0.1,
      1000,
    );

    // Camera rig: parent handles pan, camera handles isometric rotation
    this.cameraRig = new THREE.Object3D();

    // Set isometric rotation on camera
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = ISO_ROTATION_Y;
    this.camera.rotation.x = -ISO_ROTATION_X;
    this.camera.position.set(0, 100, 0); // Pull back along view direction

    this.cameraRig.add(this.camera);

    this.state = {
      panX: 0,
      panZ: 0,
      zoom: CAMERA_ZOOM_DEFAULT,
      targetZoom: CAMERA_ZOOM_DEFAULT,
      vx: 0,
      vz: 0,
    };

    this.camera.zoom = this.state.zoom;
    this.camera.updateProjectionMatrix();
  }

  getRig(): THREE.Object3D {
    return this.cameraRig;
  }

  getState(): CameraState {
    return this.state;
  }

  /**
   * Resize the camera frustum on window resize
   */
  resize(width: number, height: number): void {
    const aspect = width / height;
    const frustum = 50;
    this.camera.left = -frustum * aspect;
    this.camera.right = frustum * aspect;
    this.camera.top = frustum;
    this.camera.bottom = -frustum;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Pan the camera by screen-space delta (pixels)
   * Converts screen delta to world-space movement in the isometric plane
   */
  pan(screenDx: number, screenDy: number): void {
    // Convert screen pixels to world units (accounting for zoom)
    const scale = PAN_SPEED / this.state.zoom;

    // Rotate screen delta into isometric world space
    // Screen right → world +X/-Z (along iso X axis)
    // Screen down → world +X/+Z (along iso Y axis)
    const cos45 = Math.cos(ISO_ROTATION_Y);
    const sin45 = Math.sin(ISO_ROTATION_Y);

    const worldDx = (screenDx * cos45 + screenDy * sin45) * scale;
    const worldDz = (-screenDx * sin45 + screenDy * cos45) * scale;

    this.state.panX -= worldDx;
    this.state.panZ -= worldDz;
    this.state.vx = -worldDx;
    this.state.vz = -worldDz;

    this.cameraRig.position.set(this.state.panX, 0, this.state.panZ);
  }

  /**
   * Set pan position directly (for centering on a tile)
   */
  setPan(worldX: number, worldZ: number): void {
    this.state.panX = worldX;
    this.state.panZ = worldZ;
    this.state.vx = 0;
    this.state.vz = 0;
    this.cameraRig.position.set(this.state.panX, 0, this.state.panZ);
  }

  /**
   * Zoom toward a screen point (smooth - sets target, lerped in applyInertia)
   */
  zoom(delta: number, _screenX?: number, _screenY?: number): void {
    const factor = delta > 0 ? (1 - ZOOM_STEP_FACTOR) : (1 + ZOOM_STEP_FACTOR);
    this.state.targetZoom = THREE.MathUtils.clamp(
      this.state.targetZoom * factor,
      CAMERA_ZOOM_MIN,
      CAMERA_ZOOM_MAX,
    );
  }

  /**
   * Apply inertia and smooth zoom each frame (call in update loop)
   */
  applyInertia(): void {
    // Smooth zoom interpolation
    if (Math.abs(this.state.zoom - this.state.targetZoom) > 0.001) {
      this.state.zoom = THREE.MathUtils.lerp(
        this.state.zoom,
        this.state.targetZoom,
        ZOOM_LERP_FACTOR,
      );
      this.camera.zoom = this.state.zoom;
      this.camera.updateProjectionMatrix();
    } else if (this.state.zoom !== this.state.targetZoom) {
      this.state.zoom = this.state.targetZoom;
      this.camera.zoom = this.state.zoom;
      this.camera.updateProjectionMatrix();
    }

    // Pan inertia
    if (Math.abs(this.state.vx) > 0.001 || Math.abs(this.state.vz) > 0.001) {
      this.state.panX += this.state.vx;
      this.state.panZ += this.state.vz;
      this.state.vx *= PAN_FRICTION;
      this.state.vz *= PAN_FRICTION;

      if (Math.abs(this.state.vx) < 0.001) this.state.vx = 0;
      if (Math.abs(this.state.vz) < 0.001) this.state.vz = 0;

      this.cameraRig.position.set(this.state.panX, 0, this.state.panZ);
    }
  }

  /**
   * Convert a grid coordinate (x, y) to Three.js world position
   * Grid X → world X, Grid Y → world Z (flat on XZ plane)
   */
  static gridToWorld(gridX: number, gridY: number): THREE.Vector3 {
    return new THREE.Vector3(gridX, 0, gridY);
  }

  /**
   * Stop inertia
   */
  stopInertia(): void {
    this.state.vx = 0;
    this.state.vz = 0;
  }
}
