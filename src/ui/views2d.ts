import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type View2DMode = 'all' | 'top' | 'front' | 'side';

interface OrthoSubView {
  id: 'top' | 'front' | 'side';
  name: string;
  axis: string;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  card: HTMLElement;
  initialPos: THREE.Vector3;
  initialTarget: THREE.Vector3;
  initialUp: THREE.Vector3;
  frustumSize: number;
}

export class Views2DPanel {
  private container: HTMLElement;
  private scene: THREE.Scene | null = null;
  private mode: View2DMode = 'all';
  private views: Record<'top' | 'front' | 'side', OrthoSubView> = {} as any;
  private modeBtns: Record<View2DMode, HTMLButtonElement> = {} as any;
  private animHandle = 0;
  isOpen = false;

  constructor(container: HTMLElement, private onClose?: () => void) {
    this.container = container;
    this.buildUI();
  }

  private buildUI() {
    this.container.innerHTML = `
      <div class="v2d-header">
        <div class="v2d-title">
          <span class="v2d-icon">◫</span>
          <span>2D Orthographic Views</span>
        </div>
        <div class="v2d-modes">
          <button data-mode="all" class="v2d-mode-btn active" title="Show all 3 orthographic views">⊞ All 3</button>
          <button data-mode="top" class="v2d-mode-btn" title="Top View (X/Z)">⬆ Top</button>
          <button data-mode="front" class="v2d-mode-btn" title="Front Profile View (X/Y)">↔ Front</button>
          <button data-mode="side" class="v2d-mode-btn" title="Side Profile View (Z/Y)">↕ Side</button>
        </div>
        <button class="v2d-tool-btn" id="v2d-btn-reset-cam" title="Reset all 2D cameras to center">↺ Reset</button>
        <button class="v2d-close-btn" id="v2d-close-btn" title="Close 2D views">✕</button>
      </div>

      <div class="v2d-body mode-all" id="v2d-body">
        <!-- Top View Card -->
        <div class="v2d-card" id="v2d-card-top">
          <div class="v2d-card-hdr">
            <div class="v2d-card-title">
              <span class="v2d-badge badge-top">TOP</span>
              <span>Top View <span class="v2d-dim">(Orthographic X/Z)</span></span>
            </div>
            <button class="v2d-card-btn" data-solo="top" title="Maximize view">⛶ Solo</button>
          </div>
          <div class="v2d-card-content">
            <canvas id="v2d-canvas-top"></canvas>
          </div>
        </div>

        <!-- Front Profile Card -->
        <div class="v2d-card" id="v2d-card-front">
          <div class="v2d-card-hdr">
            <div class="v2d-card-title">
              <span class="v2d-badge badge-front">FRONT</span>
              <span>Front Profile <span class="v2d-dim">(Orthographic X/Y)</span></span>
            </div>
            <button class="v2d-card-btn" data-solo="front" title="Maximize view">⛶ Solo</button>
          </div>
          <div class="v2d-card-content">
            <canvas id="v2d-canvas-front"></canvas>
          </div>
        </div>

        <!-- Side Profile Card -->
        <div class="v2d-card" id="v2d-card-side">
          <div class="v2d-card-hdr">
            <div class="v2d-card-title">
              <span class="v2d-badge badge-side">SIDE</span>
              <span>Side Profile <span class="v2d-dim">(Orthographic Z/Y)</span></span>
            </div>
            <button class="v2d-card-btn" data-solo="side" title="Maximize view">⛶ Solo</button>
          </div>
          <div class="v2d-card-content">
            <canvas id="v2d-canvas-side"></canvas>
          </div>
        </div>
      </div>
    `;

    this.container.querySelectorAll<HTMLButtonElement>('.v2d-mode-btn').forEach(btn => {
      const m = btn.getAttribute('data-mode') as View2DMode;
      this.modeBtns[m] = btn;
      btn.addEventListener('click', () => this.setMode(m));
    });

    this.container.querySelectorAll<HTMLButtonElement>('.v2d-card-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-solo') as View2DMode;
        if (this.mode === target) {
          this.setMode('all');
        } else {
          this.setMode(target);
        }
      });
    });

    this.container.querySelector('#v2d-close-btn')?.addEventListener('click', () => {
      this.onClose?.();
    });

    this.container.querySelector('#v2d-btn-reset-cam')?.addEventListener('click', () => {
      this.resetCameras();
    });

    this.initOrthoViews();
  }

  private initOrthoViews() {
    const frustum = 2.4;

    // Helper to create an orthographic subview
    const createSubView = (
      id: 'top' | 'front' | 'side',
      name: string,
      axis: string,
      pos: THREE.Vector3,
      target: THREE.Vector3,
      up: THREE.Vector3
    ): OrthoSubView => {
      const canvas = this.container.querySelector(`#v2d-canvas-${id}`) as HTMLCanvasElement;
      const card = this.container.querySelector(`#v2d-card-${id}`) as HTMLElement;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const camera = new THREE.OrthographicCamera(
        -frustum / 2, frustum / 2,
        frustum / 2, -frustum / 2,
        0.01, 100
      );
      camera.position.copy(pos);
      camera.up.copy(up);
      camera.lookAt(target);

      const controls = new OrbitControls(camera, canvas);
      controls.enableRotate = false; // Lock to purely orthographic 2D pan/zoom!
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.dampingFactor = 0.12;
      controls.enableDamping = true;
      controls.target.copy(target);
      controls.screenSpacePanning = true;

      // Double-click canvas to reset this camera
      canvas.addEventListener('dblclick', () => {
        camera.position.copy(pos);
        camera.up.copy(up);
        controls.target.copy(target);
        camera.zoom = 1;
        camera.updateProjectionMatrix();
      });

      return {
        id, name, axis,
        canvas, renderer, camera, controls, card,
        initialPos: pos.clone(),
        initialTarget: target.clone(),
        initialUp: up.clone(),
        frustumSize: frustum
      };
    };

    // 1. TOP VIEW (looking down from above, -Z is up, +X is right)
    this.views.top = createSubView(
      'top', 'Top View', 'X/Z',
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, 0.2, 0),
      new THREE.Vector3(0, 0, -1)
    );

    // 2. FRONT PROFILE VIEW (looking from the front along +Z, +Y is up, +X is right)
    this.views.front = createSubView(
      'front', 'Front Profile', 'X/Y',
      new THREE.Vector3(0, 0.45, 10),
      new THREE.Vector3(0, 0.45, 0),
      new THREE.Vector3(0, 1, 0)
    );

    // 3. SIDE PROFILE VIEW (looking from the right side along +X, +Y is up, +Z is right/depth)
    this.views.side = createSubView(
      'side', 'Side Profile', 'Z/Y',
      new THREE.Vector3(10, 0.45, 0),
      new THREE.Vector3(0, 0.45, 0),
      new THREE.Vector3(0, 1, 0)
    );
  }

  setScene(scene: THREE.Scene) {
    this.scene = scene;
  }

  setMode(mode: View2DMode) {
    this.mode = mode;
    const body = this.container.querySelector('#v2d-body') as HTMLElement;
    body.className = `v2d-body mode-${mode}`;

    Object.entries(this.modeBtns).forEach(([m, btn]) => {
      btn.classList.toggle('active', m === mode);
    });

    this.container.querySelectorAll<HTMLButtonElement>('.v2d-card-btn').forEach(btn => {
      const target = btn.getAttribute('data-solo') as View2DMode;
      btn.textContent = this.mode === target ? '🗗 Restore' : '⛶ Solo';
      btn.classList.toggle('active', this.mode === target);
    });

    requestAnimationFrame(() => this.resize());
  }

  resetCameras() {
    Object.values(this.views).forEach(v => {
      v.camera.position.copy(v.initialPos);
      v.camera.up.copy(v.initialUp);
      v.controls.target.copy(v.initialTarget);
      v.camera.zoom = 1;
      v.camera.updateProjectionMatrix();
    });
  }

  resize() {
    if (!this.isOpen) return;

    Object.values(this.views).forEach(v => {
      const parent = v.canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const w = Math.max(10, Math.floor(rect.width));
      const h = Math.max(10, Math.floor(rect.height));
      if (w <= 0 || h <= 0) return;

      v.renderer.setSize(w, h);
      const aspect = w / h;
      v.camera.left = (-v.frustumSize * aspect) / 2;
      v.camera.right = (v.frustumSize * aspect) / 2;
      v.camera.top = v.frustumSize / 2;
      v.camera.bottom = -v.frustumSize / 2;
      v.camera.updateProjectionMatrix();
    });
  }

  startLoop() {
    if (this.animHandle) return;
    const animate = () => {
      this.animHandle = requestAnimationFrame(animate);
      if (!this.isOpen || !this.scene) return;

      Object.values(this.views).forEach(v => {
        // Only render visible views
        if (v.card.offsetParent !== null) {
          v.controls.update();
          v.renderer.render(this.scene!, v.camera);
        }
      });
    };
    this.animHandle = requestAnimationFrame(animate);
  }

  stopLoop() {
    if (this.animHandle) {
      cancelAnimationFrame(this.animHandle);
      this.animHandle = 0;
    }
  }

  render() {
    this.resize();
    if (!this.scene) return;
    Object.values(this.views).forEach(v => {
      if (v.card.offsetParent !== null) {
        v.controls.update();
        v.renderer.render(this.scene!, v.camera);
      }
    });
  }
}
