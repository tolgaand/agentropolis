import { useRef, useCallback, useEffect } from 'react';
import type { Camera } from '../lib/map/types';
import { MAP_CONFIG } from '../lib/map/config';

interface UseCameraOptions {
  initialZoom?: number;
  centerOnGrid?: { x: number; y: number };
}

export function useCamera(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  options: UseCameraOptions = {}
) {
  const cameraRef = useRef<Camera>({
    x: 0,
    y: 0,
    zoom: options.initialZoom ?? MAP_CONFIG.DEFAULT_ZOOM,
  });

  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Center camera on grid position
  const centerOn = useCallback((gridX: number, gridY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const halfW = MAP_CONFIG.TILE_WIDTH / 2;
    const halfH = MAP_CONFIG.TILE_HEIGHT / 2;

    // Convert grid to screen
    const screenX = (gridX - gridY) * halfW;
    const screenY = (gridX + gridY) * halfH;

    // Center in viewport
    const { zoom } = cameraRef.current;
    cameraRef.current.x = canvas.clientWidth / 2 - screenX * zoom;
    cameraRef.current.y = canvas.clientHeight / 2 - screenY * zoom;
  }, [canvasRef]);

  // Initial centering
  useEffect(() => {
    if (options.centerOnGrid) {
      // Small delay to ensure canvas is sized
      requestAnimationFrame(() => {
        centerOn(options.centerOnGrid!.x, options.centerOnGrid!.y);
      });
    }
  }, [options.centerOnGrid, centerOn]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;

      cameraRef.current.x += dx;
      cameraRef.current.y += dy;

      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { x, y, zoom } = cameraRef.current;

    // Zoom factor
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(
      MAP_CONFIG.MAX_ZOOM,
      Math.max(MAP_CONFIG.MIN_ZOOM, zoom * delta)
    );

    // Zoom toward mouse position
    const zoomRatio = newZoom / zoom;
    cameraRef.current.x = mouseX - (mouseX - x) * zoomRatio;
    cameraRef.current.y = mouseY - (mouseY - y) * zoomRatio;
    cameraRef.current.zoom = newZoom;
  }, [canvasRef]);

  // Attach/detach event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [canvasRef, handleMouseDown, handleMouseMove, handleMouseUp, handleWheel]);

  return {
    cameraRef,
    centerOn,
    getCamera: () => cameraRef.current,
  };
}
