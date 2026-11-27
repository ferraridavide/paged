import type { ComponentSource } from "../../types";
import { text } from "../util";

/** A three.js scene: orbit it in Edit mode; print uses the saved still. */
export const scene3d: ComponentSource = {
  id: "scene3d",
  name: "3D scene",
  entry: "index.tsx",
  dependencies: { three: "0.187.0" },
  files: {
    "index.tsx": text(`import { defineElement, useElementState } from "@paged/sdk";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createScene, type Shape } from "./scene";

type Camera = { position: number[]; target: number[] };
const DEFAULT_CAMERA: Camera = { position: [4.2, 2.6, 5.6], target: [0, 1.1, 0] };

type Props = { shape: Shape; color: string; height: number; caption: string };

export default defineElement<Props>({
  label: "3D scene",
  icon: "◈",
  fields: {
    shape: { kind: "select", options: ["knot", "crystal", "rings"], default: "knot" },
    color: { kind: "color", default: "#6366f1" },
    height: { kind: "number", label: "Height (mm)", default: 85, min: 40, max: 220 },
    caption: { kind: "text", default: "Figure 2. A three.js scene, framed in Edit mode" },
  },
  render: ({ props, mode }) => {
    // Persisted with the element: where the camera is, and a still for print.
    const [camera, setCamera] = useElementState<Camera>("camera", DEFAULT_CAMERA);
    const [snapshot, setSnapshot] = useElementState<string>("snapshot", "");
    const size = { height: props.height + "mm" };

    return (
      <figure className="scene3d">
        {mode === "print" ? (
          snapshot ? (
            <img className="scene3d-view" src={snapshot} style={size} alt="" />
          ) : (
            <div className="scene3d-view scene3d-empty" style={size}>Open in Edit mode to render this scene</div>
          )
        ) : (
          <Viewport props={props} camera={camera} onCamera={setCamera} onSnapshot={setSnapshot} style={size} />
        )}
        <figcaption>{props.caption}</figcaption>
      </figure>
    );
  },
});

/** The live WebGL view (Edit mode only): orbit, pan and zoom, saved on release. */
function Viewport({ props, camera, onCamera, onSnapshot, style }: {
  props: Props;
  camera: Camera;
  onCamera: (c: Camera) => void;
  onSnapshot: (url: string) => void;
  style: React.CSSProperties;
}) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<any>(null);
  const latest = useRef({ onCamera, onSnapshot });
  latest.current = { onCamera, onSnapshot };

  // Create the renderer once.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const world = createScene();
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 2.5;
    controls.maxDistance = 18;

    const render = () => renderer.render(world.scene, cam);
    let snapTimer: ReturnType<typeof setTimeout> | undefined;
    const snap = () => {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        render();
        latest.current.onSnapshot(renderer.domElement.toDataURL("image/jpeg", 0.88));
      }, 250);
    };
    controls.addEventListener("change", render);
    controls.addEventListener("end", () => {
      latest.current.onCamera({ position: cam.position.toArray(), target: controls.target.toArray() });
      snap();
    });

    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      cam.aspect = el.clientWidth / el.clientHeight;
      cam.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    live.current = { renderer, cam, controls, world, render, snap, resize };
    console.log("three.js", THREE.REVISION, "viewport ready");

    return () => {
      clearTimeout(snapTimer);
      ro.disconnect();
      controls.dispose();
      world.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      live.current = null;
    };
  }, []);

  // Apply the saved camera (first render, undo, Reset view).
  const cameraKey = JSON.stringify(camera);
  useEffect(() => {
    const l = live.current;
    if (!l) return;
    l.cam.position.fromArray(camera.position);
    l.controls.target.fromArray(camera.target);
    l.controls.update();
    l.resize();
  }, [cameraKey]);

  // Props change the scene, and the print still with it.
  useEffect(() => {
    const l = live.current;
    if (!l) return;
    l.world.setShape(props.shape);
    l.world.setColor(props.color);
    l.render();
    l.snap();
  }, [props.shape, props.color, props.height]);

  return (
    <div
      ref={host}
      className="scene3d-view"
      style={style}
      // Right-drag pans the camera instead of opening the editor's menu.
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span className="scene3d-hint">Drag to orbit · right-drag to pan · scroll to zoom</span>
      <button
        className="scene3d-reset"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => onCamera(DEFAULT_CAMERA)}
      >
        Reset view
      </button>
    </div>
  );
}
`),
    "scene.ts": text(`import * as THREE from "three";

export type Shape = "knot" | "crystal" | "rings";

/** A glossy shape floating over a grid, under a field of stars. */
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1020");
  scene.fog = new THREE.Fog("#0b1020", 12, 30);

  scene.add(new THREE.HemisphereLight("#c7d2fe", "#0f172a", 0.9));
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(5, 8, 4);
  scene.add(key);
  const rim = new THREE.PointLight("#f472b6", 40, 20);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  const grid = new THREE.GridHelper(40, 60, "#3730a3", "#1e293b");
  scene.add(grid);

  // Stars: random points on a big sphere.
  const stars = new Float32Array(1500);
  for (let i = 0; i < stars.length; i += 3) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20);
    stars.set([v.x, Math.abs(v.y), v.z], i);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#e0e7ff", size: 0.12 })));

  const material = new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.22 });
  const holder = new THREE.Group();
  holder.position.y = 1.2;
  scene.add(holder);

  const shapes: Record<Shape, () => THREE.Object3D> = {
    knot: () => new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.3, 240, 32), material),
    crystal: () => {
      const geo = new THREE.IcosahedronGeometry(1.2, 0);
      return new THREE.Mesh(geo, material);
    },
    rings: () => {
      const g = new THREE.Group();
      [0, 1, 2].forEach((i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1 - i * 0.22, 0.07, 24, 120), material);
        ring.rotation.set(i * 0.9, i * 0.6, 0);
        g.add(ring);
      });
      return g;
    },
  };

  let current: Shape | null = null;
  return {
    scene,
    setShape(shape: Shape) {
      if (shape === current) return;
      current = shape;
      holder.clear();
      holder.add((shapes[shape] ?? shapes.knot)());
    },
    setColor(color: string) {
      material.color.set(color);
      material.emissive.set(color).multiplyScalar(0.12);
    },
    dispose() {
      scene.traverse((o: any) => o.geometry?.dispose());
      material.dispose();
    },
  };
}
`),
    "scene.css": text(`.scene3d { margin: 0 0 1em; }
.scene3d-view {
  position: relative;
  display: block;
  width: 100%;
  border-radius: 3mm;
  overflow: hidden;
  background: #0b1020;
  object-fit: cover;
}
.scene3d-view canvas { display: block; width: 100%; height: 100%; cursor: grab; }
.scene3d-view canvas:active { cursor: grabbing; }
.scene3d-empty { display: grid; place-items: center; color: #94a3b8; font-size: 9pt; }
.scene3d-hint {
  position: absolute; left: 3mm; bottom: 2.5mm; font-size: 8pt; color: rgba(224, 231, 255, 0.7);
  pointer-events: none; font-family: ui-sans-serif, system-ui, sans-serif;
}
.scene3d-reset {
  position: absolute; right: 2.5mm; top: 2.5mm; font: 8pt ui-sans-serif, system-ui, sans-serif;
  color: #e0e7ff; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(165, 180, 252, 0.35);
  border-radius: 4px; padding: 3px 8px; cursor: pointer;
}
.scene3d-reset:hover { background: rgba(79, 70, 229, 0.7); }
.scene3d figcaption { margin-top: 2mm; font-size: 0.85em; color: #78716c; }
`),
  },
};
