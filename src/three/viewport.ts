import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Heightmap } from '../core/heightmap';
import { biomeColor, grayscale, ColorMode, SetMapData, resolveSetMapColor, getMaterialById, DEFAULT_MATERIALS } from '../render/colormap';
import { SmartMapData, resolveSmartMapColor } from '../nodes/smartcolor';

export class Viewport {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mesh: THREE.Mesh | null = null;
  water: THREE.Mesh | null = null;
  sun: THREE.DirectionalLight;
  colorMode: ColorMode = 'biome';
  wireframe = false;
  waterLevel = 0;
  heightScale = 0.7;
  private container: HTMLElement;
  private frameHandle = 0;
  private setmap: SetMapData | null = null;
  private smartmap: SmartMapData | null = null;
  private materialUniforms: Map<string, THREE.Material> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14171c);
    this.scene.fog = new THREE.Fog(0x14171c, 12, 40);

    this.camera = new THREE.PerspectiveCamera(
      50, container.clientWidth / container.clientHeight, 0.05, 100
    );
    this.camera.position.set(1.6, 1.2, 1.6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.1, 0);
    this.controls.maxDistance = 12;
    this.controls.minDistance = 0.3;

    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    this.sun.position.set(3, 5, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -2.5;
    this.sun.shadow.camera.right = 2.5;
    this.sun.shadow.camera.top = 2.5;
    this.sun.shadow.camera.bottom = -2.5;
    this.sun.shadow.camera.far = 20;
    this.scene.add(this.sun);
    this.scene.add(new THREE.HemisphereLight(0x9db4d6, 0x3a2f26, 0.9));

    const grid = new THREE.GridHelper(10, 20, 0x2c313a, 0x20242b);
    grid.position.y = -0.001;
    this.scene.add(grid);

    this.animate();
  }

  private animate = () => {
    this.frameHandle = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Rebuild the terrain mesh from a heightmap. */
  update(height: Heightmap) {
    // Extract setmap / smartmap data if present (BEFORE potential reduction)
    this.setmap = (height as any).setmap ?? null;
    this.smartmap = (height as any).smartmap ?? null;

    // 4K/8K graphs render through a bilaterally-sampled 1024 proxy mesh:
    // a 8191x8191 PlaneGeometry (67M vertices) is not GPU-viable.
    let src = height;
    if (height.size > 1024) {
      const reduced = new Heightmap(1024);
      for (let y = 0; y < 1024; y++) {
        for (let x = 0; x < 1024; x++) {
          reduced.set(x, y, height.sample(x / 1023, y / 1023));
        }
      }
      // Copy setmap / smartmap data to reduced heightmap
      if (this.setmap) {
        (reduced as any).setmap = this.setmap;
      }
      if (this.smartmap) {
        (reduced as any).smartmap = this.smartmap;
      }
      src = reduced;
    }
    const s = src.size;
    const seg = s - 1;

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }

    const geo = new THREE.PlaneGeometry(2, 2, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const u = (x + 1) / 2, v = (1 - z) / 2;
      const xi = Math.min(Math.round(u * seg), seg);
      const yi = Math.min(Math.round(v * seg), seg);
      const h = src.get(xi, yi);
      pos.setY(i, h * this.heightScale);

      // slope from finite differences
      const xm = Math.max(0, xi - 1), xp = Math.min(seg, xi + 1);
      const ym = Math.max(0, yi - 1), yp = Math.min(seg, yi + 1);
      const dx = (src.get(xp, yi) - src.get(xm, yi)) * this.heightScale * seg * 0.5;
      const dy = (src.get(xi, yp) - src.get(xi, ym)) * this.heightScale * seg * 0.5;
      const slope = Math.min(1, Math.sqrt(dx * dx + dy * dy));

      let c: [number, number, number];
      if (this.colorMode === 'smart' && this.smartmap) {
        c = resolveSmartMapColor(this.smartmap, u, v);
      } else if (this.colorMode === 'materials' && this.setmap) {
        c = resolveSetMapColor(this.setmap, u, v);
      } else if (this.colorMode === 'biome') {
        c = biomeColor(h, slope);
      } else {
        c = grayscale(h);
      }
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    let mat: THREE.Material;
    if (this.colorMode === 'materials' && this.setmap) {
      const baseMat = getMaterialById(this.setmap.baseMaterialId);
      mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: baseMat.roughness,
        metalness: baseMat.metallic,
        wireframe: this.wireframe,
        flatShading: false
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.93,
        metalness: 0.02,
        wireframe: this.wireframe,
        flatShading: false
      });
    }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
    this.updateWater();
  }

  updateWater() {
    if (this.water) {
      this.scene.remove(this.water);
      this.water.geometry.dispose();
      (this.water.material as THREE.Material).dispose();
      this.water = null;
    }
    if (this.waterLevel > 0.001 && this.mesh) {
      const geo = new THREE.PlaneGeometry(2, 2, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0x2a6f8e,
        transparent: true,
        opacity: 0.72,
        roughness: 0.15,
        metalness: 0.1,
        transmission: 0.25
      });
      this.water = new THREE.Mesh(geo, mat);
      this.water.position.y = this.waterLevel * this.heightScale;
      this.scene.add(this.water);
    }
  }

  setWireframe(on: boolean) {
    this.wireframe = on;
    if (this.mesh) (this.mesh.material as THREE.MeshStandardMaterial).wireframe = on;
  }

  setMode(mode: ColorMode) {
    this.colorMode = mode;
  }

  /* ---------- move-mode picking ---------- */
  /** Toggle drag-to-move: disables orbit so the pointer drags the element. */
  setPickMode(on: boolean) {
    this.controls.enabled = !on;
    this.renderer.domElement.style.cursor = on ? 'move' : '';
  }

  /** Raycast a screen point onto the terrain base plane (y=0) -> heightmap UV in [0,1]. */
  pickUV(clientX: number, clientY: number): { u: number; v: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, pt)) return null;
    const u = (pt.x + 1) / 2, v = (1 - pt.z) / 2;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { u, v };
  }

  dispose() {
    cancelAnimationFrame(this.frameHandle);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
