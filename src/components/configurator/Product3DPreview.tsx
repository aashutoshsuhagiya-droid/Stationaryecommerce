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
}

export function Product3DPreview({
  document,
  surfaces,
  background,
  accent,
  structuralDesign,
  dimensionsMm,
  materialName = "Vinyl Matte",
  productName,
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
  const [isReady, setIsReady] = useState(false);
  const [webGlSupported, setWebGlSupported] = useState(true);

  // Initialize Scene, Camera, Renderer, Controls
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Detect WebGL capability
    try {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) {
        setWebGlSupported(false);
        return;
      }
    } catch {
      setWebGlSupported(false);
      return;
    }

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color("#f8fafc");

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(2.2, 1.8, 3.2);
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
      controls.update();
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
    setIsReady(true);

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
    };
  }, []);

  // Update autoRotate when state changes
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Build 3D Product Geometry & Apply Dynamic Texture
  useEffect(() => {
    const group = meshGroupRef.current;
    if (!group) return;

    // Clear old children
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }

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

    preloadArtworkImages(document).then(() => {
      renderSurfaceToCanvas(
        textureCanvas!,
        document,
        primaryDef.id,
        primaryDef,
        background,
        accent,
        2,
      );

      let texture = textureRef.current;
      if (!texture) {
        texture = new THREE.CanvasTexture(textureCanvas!);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        textureRef.current = texture;
      } else {
        texture.needsUpdate = true;
      }

      // Material sheen / roughness based on material name
      const isGlossy = /gloss|waterproof|laminated/i.test(materialName);
      const roughness = isGlossy ? 0.22 : 0.65;
      const metalness = isGlossy ? 0.08 : 0.02;

      const printMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness,
        metalness,
      });

      const paperEdgeMaterial = new THREE.MeshStandardMaterial({
        color: "#f1f5f9",
        roughness: 0.85,
        metalness: 0.0,
      });

      const backCoverMaterial = new THREE.MeshStandardMaterial({
        color: background || "#f8fafc",
        roughness: 0.7,
        metalness: 0.02,
      });

      // Construct Geometry based on structuralDesign
      const designKey = structuralDesign?.toLowerCase() ?? "";

      if (designKey.includes("notebook")) {
        // 3D Notebook with Cover, Spine and Inner Pages
        const bookW = 1.5;
        const bookH = 2.1;
        const bookD = 0.16;

        // Cover materials: [right, left, top, bottom, front (artwork), back]
        const bookMaterials = [
          paperEdgeMaterial, // right (pages)
          new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.4 }), // spine (left)
          paperEdgeMaterial, // top (pages)
          paperEdgeMaterial, // bottom (pages)
          printMaterial,     // front (cover)
          backCoverMaterial, // back
        ];

        const bookGeo = new THREE.BoxGeometry(bookW, bookH, bookD);
        const bookMesh = new THREE.Mesh(bookGeo, bookMaterials);
        bookMesh.castShadow = true;
        bookMesh.receiveShadow = true;
        group.add(bookMesh);

        // Add subtle ribbon bookmark or band
        const bandGeo = new THREE.BoxGeometry(bookW * 0.08, bookH + 0.02, bookD + 0.005);
        const bandMat = new THREE.MeshStandardMaterial({
          color: accent || "#3b82f6",
          roughness: 0.4,
        });
        const band = new THREE.Mesh(bandGeo, bandMat);
        band.position.set(-bookW * 0.35, 0, 0);
        group.add(band);
      } else if (designKey.includes("bottle") || designKey.includes("tiffin")) {
        // 3D Water Bottle with wrap-around label
        const bottleHeight = 2.4;
        const bottleRadius = 0.55;

        // Bottle body (stainless steel / translucent finish)
        const bottleGeo = new THREE.CylinderGeometry(bottleRadius, bottleRadius, bottleHeight, 48);
        const bottleMat = new THREE.MeshStandardMaterial({
          color: "#e2e8f0",
          roughness: 0.25,
          metalness: 0.7,
        });
        const bottle = new THREE.Mesh(bottleGeo, bottleMat);
        bottle.castShadow = true;
        bottle.receiveShadow = true;
        group.add(bottle);

        // Bottle cap
        const capGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.45, 32);
        const capMat = new THREE.MeshStandardMaterial({
          color: "#0f172a",
          roughness: 0.4,
          metalness: 0.2,
        });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = bottleHeight / 2 + 0.22;
        group.add(cap);

        // Cylindrical label wrapping around the bottle
        const labelHeight = 1.0;
        const labelRadius = bottleRadius + 0.006;
        const labelGeo = new THREE.CylinderGeometry(
          labelRadius,
          labelRadius,
          labelHeight,
          48,
          1,
          true,
          -Math.PI * 0.5,
          Math.PI,
        );
        const labelMesh = new THREE.Mesh(labelGeo, printMaterial);
        labelMesh.position.y = -0.1;
        group.add(labelMesh);
      } else if (designKey.includes("pencil")) {
        // 3D Hexagonal Pencil with personalized foil print
        const pencilLength = 2.8;
        const pencilRadius = 0.14;
        const pencilGeo = new THREE.CylinderGeometry(
          pencilRadius,
          pencilRadius,
          pencilLength,
          6,
        );
        const pencilMat = new THREE.MeshStandardMaterial({
          color: background || "#f59e0b",
          roughness: 0.4,
        });
        const pencil = new THREE.Mesh(pencilGeo, pencilMat);
        pencil.rotation.z = Math.PI / 4;
        pencil.castShadow = true;
        group.add(pencil);

        // Ferrule & Eraser
        const ferruleGeo = new THREE.CylinderGeometry(
          pencilRadius * 1.02,
          pencilRadius * 1.02,
          0.2,
          16,
        );
        const ferruleMat = new THREE.MeshStandardMaterial({
          color: "#d97706",
          metalness: 0.8,
          roughness: 0.3,
        });
        const ferrule = new THREE.Mesh(ferruleGeo, ferruleMat);
        ferrule.position.y = pencilLength / 2 + 0.1;
        pencil.add(ferrule);

        const eraserGeo = new THREE.CylinderGeometry(
          pencilRadius * 0.98,
          pencilRadius * 0.98,
          0.22,
          16,
        );
        const eraserMat = new THREE.MeshStandardMaterial({
          color: "#fda4af",
          roughness: 0.9,
        });
        const eraser = new THREE.Mesh(eraserGeo, eraserMat);
        eraser.position.y = pencilLength / 2 + 0.31;
        pencil.add(eraser);
      } else if (designKey.includes("tag") || designKey.includes("backpack")) {
        // 3D Luggage / Backpack Tag
        const tagW = 1.2;
        const tagH = 2.0;
        const tagD = 0.06;
        const tagGeo = new THREE.BoxGeometry(tagW, tagH, tagD);
        const tagMaterials = [
          paperEdgeMaterial,
          paperEdgeMaterial,
          paperEdgeMaterial,
          paperEdgeMaterial,
          printMaterial,
          backCoverMaterial,
        ];
        const tag = new THREE.Mesh(tagGeo, tagMaterials);
        tag.castShadow = true;
        tag.receiveShadow = true;
        group.add(tag);

        // Eyelet ring at top
        const ringGeo = new THREE.TorusGeometry(0.12, 0.03, 16, 32);
        const ringMat = new THREE.MeshStandardMaterial({
          color: "#cbd5e1",
          metalness: 0.9,
          roughness: 0.2,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, tagH / 2 + 0.05, 0);
        group.add(ring);
      } else {
        // Standard Label Sheet / Name Slip Pack / Box
        // Use realistic aspect ratio from surface definition
        const ratio = primaryDef.width / primaryDef.height;
        const cardW = ratio >= 1 ? 2.2 : 2.2 * ratio;
        const cardH = ratio >= 1 ? 2.2 / ratio : 2.2;
        const cardD = 0.08; // Pack thickness

        const cardMaterials = [
          paperEdgeMaterial, // right
          paperEdgeMaterial, // left
          paperEdgeMaterial, // top
          paperEdgeMaterial, // bottom
          printMaterial,     // front
          backCoverMaterial, // back
        ];

        const cardGeo = new THREE.BoxGeometry(cardW, cardH, cardD);
        const cardMesh = new THREE.Mesh(cardGeo, cardMaterials);
        cardMesh.castShadow = true;
        cardMesh.receiveShadow = true;
        group.add(cardMesh);

        // Add 2 subtle stacked cards beneath for realistic depth
        for (let i = 1; i <= 2; i++) {
          const underGeo = new THREE.BoxGeometry(cardW, cardH, 0.02);
          const underMesh = new THREE.Mesh(underGeo, paperEdgeMaterial);
          underMesh.position.set(0.02 * i, -0.02 * i, -cardD / 2 - 0.015 * i);
          underMesh.castShadow = true;
          group.add(underMesh);
        }
      }
    });
  }, [
    document,
    surfaces,
    background,
    accent,
    structuralDesign,
    dimensionsMm,
    materialName,
  ]);

  // Camera presets
  const setCameraView = (view: "front" | "iso" | "back" | "side" | "top") => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    setAutoRotate(false);
    controls.reset();

    switch (view) {
      case "front":
        camera.position.set(0, 0, 3.4);
        break;
      case "iso":
        camera.position.set(2.2, 1.8, 3.2);
        break;
      case "back":
        camera.position.set(0, 0, -3.4);
        break;
      case "side":
        camera.position.set(3.4, 0, 0);
        break;
      case "top":
        camera.position.set(0, 3.4, 0.001);
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
            <strong>3D Mockup</strong>
            <small>{materialName}</small>
          </div>
        </div>
      </div>

      <div className={styles.interactionHint}>
        <span>Drag to orbit • Scroll to zoom • Right click to pan</span>
      </div>
    </div>
  );
}
