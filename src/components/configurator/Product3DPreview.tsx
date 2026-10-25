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
import { useEffect, useRef, useState } from "react";
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

const completedEntranceShines = new Set<string>();

function disposeGroupChildren(group: THREE.Group, preservedTexture?: THREE.Texture | null) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  for (const child of [...group.children]) {
    child.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const objectMaterials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of objectMaterials) {
        materials.add(material);
        const map = (material as THREE.Material & { map?: THREE.Texture | null }).map;
        if (map && map !== preservedTexture) textures.add(map);
      }
    });
    group.remove(child);
  }

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
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
  const textureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [autoRotate, setAutoRotate] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const productProfile = resolveProduct3DProfile(structuralDesign, productType, {
    materialName,
    colors: [background, accent],
  });
  const [isReady, setIsReady] = useState(false);
  const [webGlSupported, setWebGlSupported] = useState(true);

  // Initialize Scene, Camera, Renderer, Controls
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    setIsReady(false);
    onReadyChange?.(false);

    // Detect WebGL capability
    try {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) {
        setWebGlSupported(false);
        onReadyChange?.(false);
        return;
      }
    } catch {
      setWebGlSupported(false);
      onReadyChange?.(false);
      return;
    }

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(
      productProfile.cameraDistance * 0.68,
      productProfile.cameraDistance * 0.52,
      productProfile.cameraDistance,
    );
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.2;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI / 2 + 0.15; // Don't let camera go completely below ground
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.5;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(4, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 15;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.6);
    fillLight.position.set(-4, 3, -3);
    scene.add(fillLight);

    const softFloorLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.5);
    scene.add(softFloorLight);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldPlayEntranceShine = !reducedMotion && !completedEntranceShines.has(productName);
    const shineLight = new THREE.DirectionalLight(0xffffff, 0);
    shineLight.position.set(-4, 2.5, 4);
    scene.add(shineLight);
    const shineStartedAt = window.performance.now();
    let entranceShineComplete = !shouldPlayEntranceShine;

    // Subtle contact shadow floor
    const floorGeo = new THREE.PlaneGeometry(10, 10);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.12 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.9;
    floor.receiveShadow = true;
    scene.add(floor);

    // Product Mesh Group
    const group = new THREE.Group();
    scene.add(group);
    meshGroupRef.current = group;

    // Render loop
    let active = true;
    const animate = () => {
      if (!active) return;
      if (!entranceShineComplete) {
        const shineProgress = Math.min(1, (window.performance.now() - shineStartedAt) / 1_400);
        shineLight.position.x = -4 + shineProgress * 8;
        shineLight.intensity = shineProgress < 1 ? Math.sin(shineProgress * Math.PI) * 0.55 : 0;
        if (shineProgress === 1) {
          entranceShineComplete = true;
          completedEntranceShines.add(productName);
        }
      }
      controls.update();
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    // Resize handling
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      textureRef.current?.dispose();
      textureRef.current = null;
      textureCanvasRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      meshGroupRef.current = null;
      onReadyChange?.(false);
    };
  }, [onReadyChange]);

  // Update autoRotate when state changes
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!isReady || !camera || !controls) return;

    const direction = camera.position.clone().normalize();
    camera.position.copy(direction.multiplyScalar(productProfile.cameraDistance));
    controls.update();
  }, [isReady, productProfile.cameraDistance]);

  // Build 3D Product Geometry & Apply Dynamic Texture
  useEffect(() => {
    const group = meshGroupRef.current;
    if (!group) return;

    // Clear old geometry, including nested product details and cloned textures.
    disposeGroupChildren(group, textureRef.current);

    // Prepare offscreen canvas for dynamic texture
    let textureCanvas = textureCanvasRef.current;
    if (!textureCanvas) {
      textureCanvas = window.document.createElement("canvas");
      textureCanvasRef.current = textureCanvas;
    }

    const primaryDef = surfaces[0] ?? {
      id: "primary",
      label: "Primary",
      width: 600,
      height: 360,
      safeInset: 24,
    };

    let cancelled = false;
    renderSurfaceToCanvas(
      textureCanvas,
      document,
      primaryDef.id,
      primaryDef,
      background,
      accent,
      2,
    );

    let texture = textureRef.current;
    if (!texture) {
      texture = new THREE.CanvasTexture(textureCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      textureRef.current = texture;
    }
    texture.needsUpdate = true;
    const textureVariants = [
      texture,
      ...buildProductGeometry({
        group,
        kind: productProfile.kind,
        primaryDef,
        texture,
        theme: productProfile.categoryTheme,
      }),
    ];
    setIsReady(true);
    onReadyChange?.(true);

    void preloadArtworkImages(document).then(() => {
      if (cancelled) return;
      renderSurfaceToCanvas(
        textureCanvas,
        document,
        primaryDef.id,
        primaryDef,
        background,
        accent,
        2,
      );
      textureVariants.forEach((updatedTexture) => {
        updatedTexture.needsUpdate = true;
      });
    });

    return () => {
      cancelled = true;
      disposeGroupChildren(group, texture);
    };
  }, [
    document,
    surfaces,
    background,
    accent,
    structuralDesign,
    productType,
    dimensionsMm,
    materialName,
    productProfile.kind,
    onReadyChange,
  ]);

  // Camera presets
  const setCameraView = (view: "front" | "iso" | "back" | "side" | "top") => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    setAutoRotate(false);
    controls.reset();

    const distance = productProfile.cameraDistance;
    switch (view) {
      case "front":
        camera.position.set(0, 0, distance);
        break;
      case "iso":
        camera.position.set(distance * 0.68, distance * 0.52, distance);
        break;
      case "back":
        camera.position.set(0, 0, -distance);
        break;
      case "side":
        camera.position.set(distance, 0, 0);
        break;
      case "top":
        camera.position.set(0, distance, 0.001);
        break;
    }
    camera.lookAt(0, 0, 0);
    controls.update();
  };

  const handleZoom = (delta: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    camera.position.multiplyScalar(delta);
    controls.update();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!documentFullscreenElement()) {
      containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      window.document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  function documentFullscreenElement() {
    return typeof window !== "undefined" ? window.document.fullscreenElement : null;
  }

  if (!webGlSupported) {
    return (
      <div className={styles.webGlFallback}>
        <p>3D hardware acceleration is unavailable on this device or browser.</p>
        <p>Switch to the 2D Artwork Studio to customize your design.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${isFullscreen ? styles.fullscreen : ""}`}
      aria-label={`Interactive 3D preview for ${productName}`}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      {!isReady && <div className={styles.loadingOverlay} role="status">Preparing 3D preview…</div>}

      {/* 3D Viewport Controls Overlay */}
      <div className={styles.controlsBar}>
        <div className={styles.viewButtons} role="toolbar" aria-label="Camera angles">
          <button
            type="button"
            onClick={() => setCameraView("front")}
            title="Front view"
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => setCameraView("iso")}
            title="3D Perspective"
            className={styles.activeAngle}
          >
            <Compass className={styles.icon} /> 3D View
          </button>
          <button
            type="button"
            onClick={() => setCameraView("side")}
            title="Side profile"
          >
            Side
          </button>
          <button
            type="button"
            onClick={() => setCameraView("back")}
            title="Back view"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setCameraView("top")}
            title="Top down"
          >
            Top
          </button>
        </div>

        <div className={styles.actionButtons}>
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={autoRotate ? styles.activeToggle : ""}
            title={autoRotate ? "Pause rotation" : "Auto-rotate"}
            aria-pressed={autoRotate}
          >
            <RotateCw className={styles.icon} />
            <span>{autoRotate ? "Rotating" : "Rotate"}</span>
          </button>
          <button
            type="button"
            onClick={() => handleZoom(0.85)}
            title="Zoom in"
          >
            <ZoomIn className={styles.icon} />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1.15)}
            title="Zoom out"
          >
            <ZoomOut className={styles.icon} />
          </button>
          <button
            type="button"
            onClick={() => setCameraView("iso")}
            title="Reset camera position"
          >
            <RefreshCw className={styles.icon} />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
          >
            {isFullscreen ? (
              <Minimize2 className={styles.icon} />
            ) : (
              <Maximize2 className={styles.icon} />
            )}
          </button>
        </div>
      </div>

      {/* Floating Material & Dimension Badge */}
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
        <span>Drag to orbit &bull; Scroll to zoom &bull; Right click to pan</span>
      </div>
    </div>
  );
}
