"use client";

import {
  Box,
  Compass,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  preloadArtworkImages,
  renderSurfaceToCanvas,
} from "./artwork-canvas-renderer";
import type {
  ArtworkDocument,
  PrintableSurfaceDefinition,
} from "./artwork-types";
import { buildProductGeometry } from "./product-3d-model";
import { resolveProduct3DProfile } from "./product-3d-profile";
import styles from "./product-3d.module.css";

interface Product3DPreviewProps {
  document: ArtworkDocument;
  surfaces: PrintableSurfaceDefinition[];
  background: string;
  accent: string;
  structuralDesign?: string;
  productType?: string;
  dimensionsMm?: Record<string, number> | null;
  materialName?: string;
  productName: string;
  onReadyChange?: (ready: boolean) => void;
}

type CameraView = "front" | "iso" | "back" | "left" | "right" | "top";

interface RendererQuality {
  lowPower: boolean;
  maximumPixelRatio: number;
  maximumTextureSide: number;
  textureScale: number;
  shadowMapSize: number;
}

const FALLBACK_SURFACE: PrintableSurfaceDefinition = {
  id: "primary",
  label: "Primary",
  width: 600,
  height: 360,
  safeInset: 24,
};

const completedEntranceShines = new Set<string>();

function detectRendererQuality(): RendererQuality {
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const narrowViewport = window.matchMedia("(max-width: 768px)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const lowPower = coarsePointer || narrowViewport || memory <= 4;
  return lowPower
    ? {
        lowPower: true,
        maximumPixelRatio: 1.25,
        maximumTextureSide: 1_024,
        textureScale: 1,
        shadowMapSize: 512,
      }
    : {
        lowPower: false,
        maximumPixelRatio: 2,
        maximumTextureSide: 2_048,
        textureScale: 2,
        shadowMapSize: 1_024,
      };
}

function surfaceTextureResolution(
  surface: PrintableSurfaceDefinition,
  quality: RendererQuality,
): { width: number; height: number } {
  const width = Math.max(1, surface.width);
  const height = Math.max(1, surface.height);
  const desiredScale = Math.min(
    quality.textureScale,
    quality.maximumTextureSide / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.round(width * desiredScale)),
    height: Math.max(1, Math.round(height * desiredScale)),
  };
}

function disposeGroupChildren(
  group: THREE.Group,
  preservedTextures: ReadonlySet<THREE.Texture> = new Set(),
): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  for (const child of [...group.children]) {
    child.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const objectMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      for (const material of objectMaterials) {
        materials.add(material);
        const map = (material as THREE.Material & { map?: THREE.Texture | null }).map;
        if (map && !preservedTextures.has(map)) textures.add(map);
      }
    });
    group.remove(child);
  }

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

function cameraDirection(view: CameraView): THREE.Vector3 {
  switch (view) {
    case "front":
      return new THREE.Vector3(0, 0.04, 1);
    case "back":
      return new THREE.Vector3(0, 0.04, -1);
    case "left":
      return new THREE.Vector3(-1, 0.04, 0);
    case "right":
      return new THREE.Vector3(1, 0.04, 0);
    case "top":
      return new THREE.Vector3(0, 1, 0.001);
    case "iso":
    default:
      return new THREE.Vector3(0.68, 0.52, 1);
  }
}

function fitCameraToGroup(
  group: THREE.Group,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  view: CameraView,
  minimumDistance: number,
): number {
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const sphere = box.isEmpty()
    ? new THREE.Sphere(center, 1)
    : box.getBoundingSphere(new THREE.Sphere());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.25));
  const limitingFov = Math.max(0.2, Math.min(verticalFov, horizontalFov));
  const distance = Math.max(
    minimumDistance * 0.72,
    (sphere.radius / Math.sin(limitingFov / 2)) * 1.18,
  );
  const direction = cameraDirection(view).normalize();

  controls.target.copy(center);
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  camera.near = Math.max(0.01, distance - sphere.radius * 3.2);
  camera.far = Math.max(50, distance + sphere.radius * 8);
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  controls.minDistance = Math.max(0.4, sphere.radius * 0.72);
  controls.maxDistance = Math.max(8, sphere.radius * 8);
  controls.update();
  return distance;
}

function rendererErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return "The 3D preview could not be rendered. " + error.message;
  }
  return "The 3D preview could not be rendered on this device.";
}

export function Product3DPreview({
  document,
  surfaces,
  background,
  accent,
  structuralDesign,
  productType,
  dimensionsMm,
  materialName = "Vinyl Matte",
  productName,
  onReadyChange,
}: Product3DPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textureCanvasesRef = useRef(new Map<string, HTMLCanvasElement>());
  const textureRefs = useRef(new Map<string, THREE.CanvasTexture>());
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const floorRef = useRef<THREE.Mesh | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const qualityRef = useRef<RendererQuality | null>(null);
  const reducedMotionRef = useRef(false);
  const currentViewRef = useRef<CameraView>("iso");
  const lastGeometrySignatureRef = useRef("");

  const [autoRotate, setAutoRotate] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [webGlSupported, setWebGlSupported] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendererEpoch, setRendererEpoch] = useState(0);
  const productProfile = useMemo(
    () => resolveProduct3DProfile(structuralDesign, productType, {
      materialName,
      colors: [background, accent],
    }),
    [accent, background, materialName, productType, structuralDesign],
  );

  const fitModelToView = useCallback((view: CameraView = currentViewRef.current) => {
    const group = meshGroupRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!group || !camera || !controls || group.children.length === 0) return;
    currentViewRef.current = view;
    fitCameraToGroup(group, camera, controls, view, productProfile.cameraDistance);
  }, [productProfile.cameraDistance]);

  const retryRenderer = useCallback(() => {
    setRenderError(null);
    setWebGlSupported(true);
    setIsReady(false);
    onReadyChange?.(false);
    setRendererEpoch((value) => value + 1);
  }, [onReadyChange]);

  useEffect(() => {
    const handleFullscreen = () => {
      setIsFullscreen(window.document.fullscreenElement === containerRef.current);
    };
    window.document.addEventListener("fullscreenchange", handleFullscreen);
    return () => window.document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  // Scene, camera, renderer, controls and render scheduling.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let active = true;
    let pageVisible = !window.document.hidden;
    let inViewport = true;
    let lastRenderedAt = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let floorGeometry: THREE.PlaneGeometry | null = null;
    let floorMaterial: THREE.ShadowMaterial | null = null;
    let group: THREE.Group | null = null;

    setIsReady(false);
    setRenderError(null);
    onReadyChange?.(false);

    const stopAnimation = () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const failRenderer = (message: string) => {
      if (!active) return;
      stopAnimation();
      setIsReady(false);
      setRenderError(message);
      onReadyChange?.(false);
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      failRenderer("The 3D graphics context was lost. Your 2D design is still available; retry when ready.");
    };
    const handleContextRestored = () => {
      if (!active) return;
      setRenderError(null);
      setRendererEpoch((value) => value + 1);
    };

    try {
      const quality = detectRendererQuality();
      qualityRef.current = quality;
      reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const contextAttributes: WebGLContextAttributes = {
        alpha: true,
        antialias: !quality.lowPower,
        powerPreference: quality.lowPower ? "low-power" : "high-performance",
      };
      const gl = canvas.getContext("webgl2", contextAttributes)
        ?? canvas.getContext("webgl", contextAttributes);
      if (!gl) {
        setWebGlSupported(false);
        failRenderer("3D hardware acceleration is unavailable on this device or browser.");
        return;
      }
      setWebGlSupported(true);

      const width = container.clientWidth || 500;
      const height = container.clientHeight || 450;
      const scene = new THREE.Scene();
      scene.background = null;
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 100);
      camera.position.set(
        productProfile.cameraDistance * 0.68,
        productProfile.cameraDistance * 0.52,
        productProfile.cameraDistance,
      );
      cameraRef.current = camera;

      renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl as WebGLRenderingContext,
        antialias: !quality.lowPower,
        alpha: true,
        powerPreference: quality.lowPower ? "low-power" : "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maximumPixelRatio));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = !quality.lowPower;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      rendererRef.current = renderer;

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.maxPolarAngle = Math.PI / 2 + 0.15;
      controls.autoRotate = autoRotate && !reducedMotionRef.current;
      controls.autoRotateSpeed = 1.35;
      controls.screenSpacePanning = true;
      controlsRef.current = controls;

      scene.add(new THREE.AmbientLight(0xffffff, quality.lowPower ? 1.05 : 0.88));
      const keyLight = new THREE.DirectionalLight(0xffffff, quality.lowPower ? 1.15 : 1.4);
      keyLight.position.set(4, 5, 4);
      keyLight.castShadow = !quality.lowPower;
      keyLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 15;
      keyLight.shadow.bias = -0.0005;
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.62);
      fillLight.position.set(-4, 3, -3);
      scene.add(fillLight);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.48));

      const shouldPlayEntranceShine = !quality.lowPower
        && !reducedMotionRef.current
        && !completedEntranceShines.has(productName);
      const shineLight = new THREE.DirectionalLight(0xffffff, 0);
      shineLight.position.set(-4, 2.5, 4);
      scene.add(shineLight);
      const shineStartedAt = window.performance.now();
      let entranceShineComplete = !shouldPlayEntranceShine;

      floorGeometry = new THREE.PlaneGeometry(10, 10);
      floorMaterial = new THREE.ShadowMaterial({ opacity: quality.lowPower ? 0.07 : 0.12 });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.9;
      floor.receiveShadow = !quality.lowPower;
      floorRef.current = floor;
      scene.add(floor);

      group = new THREE.Group();
      scene.add(group);
      meshGroupRef.current = group;

      const scheduleAnimation = () => {
        if (
          active
          && pageVisible
          && inViewport
          && animationFrameRef.current === null
        ) {
          animationFrameRef.current = window.requestAnimationFrame(animate);
        }
      };
      const animate = (now: number) => {
        animationFrameRef.current = null;
        if (!active || !pageVisible || !inViewport || !renderer || !controls) return;
        if (quality.lowPower && now - lastRenderedAt < 30) {
          scheduleAnimation();
          return;
        }
        lastRenderedAt = now;
        if (!entranceShineComplete) {
          const progress = Math.min(1, (now - shineStartedAt) / 1_400);
          shineLight.position.x = -4 + progress * 8;
          shineLight.intensity = progress < 1 ? Math.sin(progress * Math.PI) * 0.55 : 0;
          if (progress === 1) {
            entranceShineComplete = true;
            completedEntranceShines.add(productName);
          }
        }
        controls.update();
        try {
          renderer.render(scene, camera);
        } catch (error) {
          failRenderer(rendererErrorMessage(error));
          return;
        }
        scheduleAnimation();
      };

      const handleVisibility = () => {
        pageVisible = !window.document.hidden;
        if (pageVisible) scheduleAnimation();
        else stopAnimation();
      };
      window.document.addEventListener("visibilitychange", handleVisibility);
      canvas.addEventListener("webglcontextlost", handleContextLost);
      canvas.addEventListener("webglcontextrestored", handleContextRestored);

      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: nextWidth, height: nextHeight } = entry.contentRect;
          if (nextWidth <= 0 || nextHeight <= 0 || !renderer) continue;
          camera.aspect = nextWidth / nextHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(nextWidth, nextHeight, false);
          scheduleAnimation();
        }
      });
      resizeObserver.observe(container);

      if ("IntersectionObserver" in window) {
        intersectionObserver = new IntersectionObserver((entries) => {
          inViewport = entries.some((entry) => entry.isIntersecting);
          if (inViewport) scheduleAnimation();
          else stopAnimation();
        }, { rootMargin: "160px" });
        intersectionObserver.observe(container);
      }
      scheduleAnimation();

      return () => {
        active = false;
        stopAnimation();
        window.document.removeEventListener("visibilitychange", handleVisibility);
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        controls?.dispose();
        if (group) {
          disposeGroupChildren(group, new Set(textureRefs.current.values()));
          scene.remove(group);
        }
        floorGeometry?.dispose();
        floorMaterial?.dispose();
        textureRefs.current.forEach((texture) => texture.dispose());
        textureRefs.current.clear();
        textureCanvasesRef.current.clear();
        renderer?.renderLists.dispose();
        renderer?.dispose();
        scene.clear();
        controlsRef.current = null;
        cameraRef.current = null;
        rendererRef.current = null;
        sceneRef.current = null;
        meshGroupRef.current = null;
        floorRef.current = null;
        qualityRef.current = null;
        lastGeometrySignatureRef.current = "";
        onReadyChange?.(false);
      };
    } catch (error) {
      setWebGlSupported(false);
      failRenderer(rendererErrorMessage(error));
      controls?.dispose();
      if (group) disposeGroupChildren(group, new Set(textureRefs.current.values()));
      floorGeometry?.dispose();
      floorMaterial?.dispose();
      renderer?.renderLists.dispose();
      renderer?.dispose();
      sceneRef.current?.clear();
      controlsRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      meshGroupRef.current = null;
      floorRef.current = null;
      qualityRef.current = null;
    }
  }, [onReadyChange, productName, rendererEpoch]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate && !reducedMotionRef.current;
    }
  }, [autoRotate]);

  // Build geometry and one live CanvasTexture per configured print surface.
  useEffect(() => {
    const group = meshGroupRef.current;
    const renderer = rendererRef.current;
    const quality = qualityRef.current;
    if (!group || !renderer || !quality || !webGlSupported) return;

    const surfaceDefinitions = surfaces.length ? surfaces : [FALLBACK_SURFACE];
    const preservedBeforeBuild = new Set<THREE.Texture>(textureRefs.current.values());
    disposeGroupChildren(group, preservedBeforeBuild);
    setIsReady(false);
    onReadyChange?.(false);

    let cancelled = false;
    try {
      const activeSurfaceIds = new Set(surfaceDefinitions.map((surface) => surface.id));
      for (const [surfaceId, texture] of textureRefs.current) {
        if (!activeSurfaceIds.has(surfaceId)) {
          texture.dispose();
          textureRefs.current.delete(surfaceId);
          textureCanvasesRef.current.delete(surfaceId);
        }
      }

      for (const surface of surfaceDefinitions) {
        let canvas = textureCanvasesRef.current.get(surface.id);
        if (!canvas) {
          canvas = window.document.createElement("canvas");
          textureCanvasesRef.current.set(surface.id, canvas);
        }
        renderSurfaceToCanvas(
          canvas,
          document,
          surface.id,
          surface,
          background,
          accent,
          surfaceTextureResolution(surface, quality),
        );
        let texture = textureRefs.current.get(surface.id);
        if (!texture) {
          texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(
            renderer.capabilities.getMaxAnisotropy(),
            quality.lowPower ? 2 : 8,
          );
          textureRefs.current.set(surface.id, texture);
        }
        texture.needsUpdate = true;
      }

      const primaryDef = surfaceDefinitions[0] ?? FALLBACK_SURFACE;
      const primaryTexture = textureRefs.current.get(primaryDef.id);
      if (!primaryTexture) throw new Error("The artwork texture could not be prepared.");
      const textureVariants = buildProductGeometry({
        group,
        kind: productProfile.kind,
        primaryDef,
        texture: primaryTexture,
        theme: productProfile.categoryTheme,
        surfaces: surfaceDefinitions,
        textures: textureRefs.current,
        dimensionsMm,
      });

      const bounds = new THREE.Box3().setFromObject(group);
      const floor = floorRef.current;
      if (floor && !bounds.isEmpty()) floor.position.y = bounds.min.y - 0.035;

      const dimensionEntries = Object.entries(dimensionsMm ?? {}).sort(([left], [right]) => left.localeCompare(right));
      const geometrySignature = JSON.stringify({
        kind: productProfile.kind,
        dimensions: dimensionEntries,
        surfaces: surfaceDefinitions.map((surface) => [surface.id, surface.width, surface.height]),
      });
      if (lastGeometrySignatureRef.current !== geometrySignature) {
        lastGeometrySignatureRef.current = geometrySignature;
        fitModelToView(currentViewRef.current);
      }

      setRenderError(null);
      setIsReady(true);
      onReadyChange?.(true);

      void preloadArtworkImages(document)
        .then(() => {
          if (cancelled) return;
          for (const surface of surfaceDefinitions) {
            const canvas = textureCanvasesRef.current.get(surface.id);
            const texture = textureRefs.current.get(surface.id);
            if (!canvas || !texture) continue;
            renderSurfaceToCanvas(
              canvas,
              document,
              surface.id,
              surface,
              background,
              accent,
              surfaceTextureResolution(surface, quality),
            );
            texture.needsUpdate = true;
          }
          textureVariants.forEach((texture) => {
            texture.needsUpdate = true;
          });
        })
        .catch((error: unknown) => {
          if (!cancelled) setRenderError(rendererErrorMessage(error));
        });
    } catch (error) {
      disposeGroupChildren(group, new Set(textureRefs.current.values()));
      setIsReady(false);
      setRenderError(rendererErrorMessage(error));
      onReadyChange?.(false);
    }

    return () => {
      cancelled = true;
      disposeGroupChildren(group, new Set(textureRefs.current.values()));
    };
  }, [
    accent,
    background,
    dimensionsMm,
    document,
    fitModelToView,
    materialName,
    onReadyChange,
    productProfile.categoryTheme,
    productProfile.kind,
    rendererEpoch,
    structuralDesign,
    surfaces,
    productType,
    webGlSupported,
  ]);

  const setCameraView = (view: CameraView) => {
    setAutoRotate(false);
    fitModelToView(view);
  };

  const handleZoom = (factor: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const nextDistance = THREE.MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    );
    camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(nextDistance));
    controls.update();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!window.document.fullscreenElement) {
      void containerRef.current.requestFullscreen?.();
    } else {
      void window.document.exitFullscreen?.();
    }
  };

  if (!webGlSupported) {
    return (
      <div className={styles.webGlFallback} role="alert">
        <strong>3D preview is unavailable.</strong>
        <p>{renderError ?? "This device or browser could not start hardware-accelerated 3D."}</p>
        <p>The 2D product preview remains available and you can continue purchasing.</p>
        <button type="button" onClick={retryRenderer}>Retry 3D preview</button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={styles.container + (isFullscreen ? " " + styles.fullscreen : "")}
      aria-label={"Interactive 3D preview for " + productName}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      {!isReady && !renderError && (
        <div className={styles.loadingOverlay} role="status">Preparing 3D preview…</div>
      )}
      {renderError && (
        <div className={styles.errorOverlay} role="alert">
          <strong>3D preview paused</strong>
          <p>{renderError}</p>
          <p>Your saved artwork is safe. Use the 2D product preview or retry this preview.</p>
          <button type="button" onClick={retryRenderer}>Retry 3D preview</button>
        </div>
      )}

      <div className={styles.controlsBar}>
        <div className={styles.viewButtons} role="toolbar" aria-label="Camera angles">
          <button type="button" onClick={() => setCameraView("front")} title="Front view">Front</button>
          <button type="button" onClick={() => setCameraView("iso")} title="Perspective view">
            <Compass className={styles.icon} /> 3D View
          </button>
          <button type="button" onClick={() => setCameraView("left")} title="Left view">Left</button>
          <button type="button" onClick={() => setCameraView("right")} title="Right view">Right</button>
          <button type="button" onClick={() => setCameraView("back")} title="Back view">Back</button>
          <button type="button" onClick={() => setCameraView("top")} title="Top view">Top</button>
        </div>

        <div className={styles.actionButtons}>
          <button
            type="button"
            onClick={() => setAutoRotate((value) => !value)}
            className={autoRotate ? styles.activeToggle : ""}
            title={autoRotate ? "Pause rotation" : "Auto-rotate"}
            aria-pressed={autoRotate}
          >
            <RotateCw className={styles.icon} />
            <span>{autoRotate ? "Rotating" : "Rotate"}</span>
          </button>
          <button type="button" onClick={() => handleZoom(0.85)} title="Zoom in">
            <ZoomIn className={styles.icon} />
          </button>
          <button type="button" onClick={() => handleZoom(1.15)} title="Zoom out">
            <ZoomOut className={styles.icon} />
          </button>
          <button type="button" onClick={() => fitModelToView()} title="Fit model to view">
            <RefreshCw className={styles.icon} />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
          >
            {isFullscreen
              ? <Minimize2 className={styles.icon} />
              : <Maximize2 className={styles.icon} />}
          </button>
        </div>
      </div>

      <div className={styles.badgeOverlay}>
        <div className={styles.materialBadge}>
          <Box className={styles.badgeIcon} />
          <div>
            <strong>{productProfile.label}</strong>
            <small>{materialName}</small>
          </div>
        </div>
      </div>

      <div className={styles.interactionHint}>
        <span>Drag to orbit &bull; Pinch or scroll to zoom &bull; Two-finger drag to pan</span>
      </div>
    </div>
  );
}
