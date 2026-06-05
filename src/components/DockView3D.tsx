"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import type { DockConfig } from "@/engine";
import { buildSceneSpec, isThreeAvailable, THREE_CDN_URL } from "@/lib/view3d";

/**
 * Interactive 3D viewer (Three.js r128 from CDN). Loaded via dynamic
 * import(ssr:false) so SSR never touches it. Gracefully degrades to a message if
 * Three.js can't load. Reads the same DockConfig via buildSceneSpec — no engine
 * duplication. Gated by entitlements.fullThreeD at the call site.
 */
function loadThree(): Promise<boolean> {
  if (isThreeAvailable()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${THREE_CDN_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(isThreeAvailable()));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = THREE_CDN_URL;
    s.async = true;
    s.onload = () => resolve(isThreeAvailable());
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

export default function DockView3D({ config, primaryColor }: { config: DockConfig; primaryColor?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    void loadThree().then((ok) => {
      if (disposed) return;
      // three.js is loaded from CDN at runtime; type loosely to avoid a build dep.
      const THREE = (globalThis as unknown as { THREE?: any }).THREE;
      const mount = mountRef.current;
      if (!ok || !THREE || !mount) {
        setFailed(true);
        return;
      }
      const spec = buildSceneSpec(config, primaryColor ? { float: primaryColor } : undefined);
      const width = mount.clientWidth || 480;
      const height = 360;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#eef2f7");
      const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
      const { lengthFt, widthFt } = spec.bounds;
      const span = Math.max(lengthFt, widthFt);
      camera.position.set(lengthFt * 0.8, span * 0.9, widthFt * 1.6 + span);
      camera.lookAt(lengthFt / 2, 0, widthFt / 2);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      mount.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(lengthFt, span * 2, widthFt);
      scene.add(dir);

      for (const b of spec.boxes) {
        const mat = new THREE.MeshStandardMaterial({ color: b.color });
        if (b.footprint === "triangle" && b.tri) {
          // Right-triangle deck → triangular prism built from the SHARED world
          // vertices (identical to the 2D canvas), so orientation always matches.
          const v = b.tri.vertices;
          const yb = b.y - b.h / 2;
          const yt = b.y + b.h / 2;
          const P = (i: number, y: number): [number, number, number] => [v[i]![0], y, v[i]![1]];
          const tris: [number, number, number][] = [
            P(0, yt), P(1, yt), P(2, yt), // top face
            P(0, yb), P(2, yb), P(1, yb), // bottom face
          ];
          for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
            tris.push(P(i, yb), P(j, yb), P(j, yt), P(i, yb), P(j, yt), P(i, yt)); // side quad
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
          geo.computeVertexNormals();
          mat.side = THREE.DoubleSide;
          scene.add(new THREE.Mesh(geo, mat));
        } else {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
          mesh.position.set(b.x, b.y, b.z);
          scene.add(mesh);
        }
      }
      // Water plane.
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(span * 4, span * 4),
        new THREE.MeshStandardMaterial({ color: "#bae6fd", transparent: true, opacity: 0.6 }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(lengthFt / 2, 0, widthFt / 2);
      scene.add(water);

      // Lightweight pointer-drag orbit (no extra deps).
      let theta = 0.6;
      let phi = 0.9;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const radius = widthFt * 1.6 + span;
      const center = new THREE.Vector3(lengthFt / 2, 0, widthFt / 2);
      const applyCam = () => {
        camera.position.set(
          center.x + radius * Math.sin(phi) * Math.cos(theta),
          center.y + radius * Math.cos(phi),
          center.z + radius * Math.sin(phi) * Math.sin(theta),
        );
        camera.lookAt(center);
      };
      applyCam();
      const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
      const move = (e: PointerEvent) => {
        if (!dragging) return;
        theta += (e.clientX - lastX) * 0.01;
        phi = Math.max(0.2, Math.min(Math.PI / 2.05, phi - (e.clientY - lastY) * 0.01));
        lastX = e.clientX; lastY = e.clientY; applyCam();
      };
      const up = () => { dragging = false; };
      const el = renderer.domElement;
      el.style.touchAction = "none";
      el.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);

      let raf = 0;
      const animate = () => { raf = requestAnimationFrame(animate); renderer.render(scene, camera); };
      animate();

      cleanup = () => {
        cancelAnimationFrame(raf);
        el.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        renderer.dispose();
        if (el.parentNode === mount) mount.removeChild(el);
      };
    });

    return () => { disposed = true; cleanup(); };
  }, [config, primaryColor]);

  if (failed) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded border border-slate-200 bg-slate-50 text-sm text-slate-500">
        3D viewer couldn’t load — showing the schematic is still available.
      </div>
    );
  }
  return <div ref={mountRef} className="h-[360px] w-full overflow-hidden rounded border border-slate-200 bg-slate-100" />;
}
