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
  box: HTMLElement;
  hudBtn: HTMLButtonElement;
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
  private resizeObserver: ResizeObserver | null = null;
  isOpen = false;

  constructor(container: HTMLElement, private onClose?: () => void) {
    this.container = container;
    this.buildUI();
    this.bindSplitters();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.isOpen) {
          this.resize();
        }
      });
      this.resizeObserver.observe(this.container);
    }
  }

  private buildUI() {
    this.container.innerHTML = `
      <div class="v2d-header">
        <div class="v2d-title">
          <span class="v2d-icon">◫</span>
          <span>2D Orthographic Views</span>
        </div>
        <div class="v2d-modes">
          <button data-mode="all" class="v2d-mode-btn active" title="Show all 3 views (Top on top, Front & Side below)">⊞ All 3</button>
          <button data-mode="top" class="v2d-mode-btn" title="Top View (X/Z)">⬆ Top</button>
          <button data-mode="front" class="v2d-mode-btn" title="Front Profile View (X/Y)">↔ Front</button>
          <button data-mode="side" class="v2d-mode-btn" title="Side Profile View (Z/Y)">↕ Side</button>
        </div>
        <button class="v2d-tool-btn" id="v2d-btn-reset-cam" title="Reset all 2D cameras to center">↺ Reset</button>
        <button class="v2d-close-btn" id="v2d-close-btn" title="Close 2D views">✕</button>
      </div>

      <div class="v2d-body mode-all" id="v2d-body">
        <!-- Top View Row (Top) -->
        <div class="v2d-row-top" id="v2d-row-top">
          <div class="v2d-view-box" id="v2d-box-top">
            <div class="v2d-hud-overlay">
              <div class="v2d-hud-left">
                <span class="v2d-badge badge-top">TOP</span>
                <span class="v2d-hud-label">Top View <span class="v2d-hud-dim">X/Z</span></span>
              </div>
              <div class="v2d-hud-right">
                <button class="v2d-hud-btn" data-solo="top" title="Maximize Top View">⛶</button>
              </div>
            </div>
            <canvas id="v2d-canvas-top"></canvas>
          </div>
        </div>

        <!-- Horizontal Splitter between Top and Bottom Rows -->
        <div class="v2d-split-h" id="v2d-split-h" title="Drag to resize Top vs Bottom views"></div>

        <!-- Bottom Row (Front Profile & Side Profile side-by-side) -->
        <div class="v2d-row-bottom" id="v2d-row-bottom">
          <!-- Front View (50% Left) -->
          <div class="v2d-view-box" id="v2d-box-front">
            <div class="v2d-hud-overlay">
              <div class="v2d-hud-left">
                <span class="v2d-badge badge-front">FRONT</span>
                <span class="v2d-hud-label">Front Profile <span class="v2d-hud-dim">X/Y</span></span>
              </div>
              <div class="v2d-hud-right">
                <button class="v2d-hud-btn" data-solo="front" title="Maximize Front View">⛶</button>
              </div>
            </div>
            <canvas id="v2d-canvas-front"></canvas>
          </div>

          <!-- Vertical Splitter between Front and Side Views -->
          <div class="v2d-split-v" id="v2d-split-v" title="Drag to resize Front vs Side views"></div>

          <!-- Side View (50% Right) -->
          <div class="v2d-view-box" id="v2d-box-side">
            <div class="v2d-hud-overlay">
              <div class="v2d-hud-left">
                <span class="v2d-badge badge-side">SIDE</span>
                <span class="v2d-hud-label">Side Profile <span class="v2d-hud-dim">Z/Y</span></span>
              </div>
              <div class="v2d-hud-right">
                <button class="v2d-hud-btn" data-solo="side" title="Maximize Side View">⛶</button>
              </div>
            </div>
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

    this.container.querySelectorAll<HTMLButtonElement>('.v2d-hud-btn').forEach(btn => {
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

    const createSubView = (
      id: 'top' | 'front' | 'side',
      name: string,
      axis: string,
      pos: THREE.Vector3,
      target: THREE.Vector3,
      up: THREE.Vector3
    ): OrthoSubView => {
      const canvas = this.container.querySelector(`#v2d-canvas-${id}`) as HTMLCanvasElement;
      const box = this.container.querySelector(`#v2d-box-${id}`) as HTMLElement;
      const hudBtn = box.querySelector('.v2d-hud-btn') as HTMLButtonElement;

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
      controls.enableRotate = false; // Lock to purely 2D pan/zoom
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.dampingFactor = 0.12;
      controls.enableDamping = true;
      controls.target.copy(target);
      controls.screenSpacePanning = true;

      // Double-click to reset this camera
      canvas.addEventListener('dblclick', () => {
        camera.position.copy(pos);
        camera.up.copy(up);
        controls.target.copy(target);
        camera.zoom = 1;
        camera.updateProjectionMatrix();
      });

      return {
        id, name, axis,
        canvas, renderer, camera, controls, box, hudBtn,
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

  private bindSplitters() {
    const rootBody = this.container.querySelector('#v2d-body') as HTMLElement;
    const splitH = this.container.querySelector('#v2d-split-h') as HTMLElement;
    const splitV = this.container.querySelector('#v2d-split-v') as HTMLElement;
    const rowBottom = this.container.querySelector('#v2d-row-bottom') as HTMLElement;

    // 1. Horizontal Splitter (Top vs Bottom)
    splitH.addEventListener('pointerdown', e => {
      e.preventDefault();
      splitH.classList.add('dragging');
      splitH.setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        const rect = rootBody.getBoundingClientRect();
        const y = ev.clientY - rect.top;
        const clampedY = Math.max(60, Math.min(rect.height - 60, y));
        const pct = (clampedY / rect.height) * 100;
        rootBody.style.setProperty('--v2d-top-h', `${pct}%`);
        this.resize();
      };

      const up = (ev: PointerEvent) => {
        splitH.classList.remove('dragging');
        splitH.removeEventListener('pointermove', move);
        splitH.removeEventListener('pointerup', up);
        splitH.removeEventListener('pointercancel', up);
        try { splitH.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
        this.resize();
      };

      splitH.addEventListener('pointermove', move);
      splitH.addEventListener('pointerup', up);
      splitH.addEventListener('pointercancel', up);
    });

    // 2. Vertical Splitter (Front vs Side)
    splitV.addEventListener('pointerdown', e => {
      e.preventDefault();
      splitV.classList.add('dragging');
      splitV.setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        const rect = rowBottom.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const clampedX = Math.max(50, Math.min(rect.width - 50, x));
        const pct = (clampedX / rect.width) * 100;
        rootBody.style.setProperty('--v2d-front-w', `${pct}%`);
        this.resize();
      };

      const up = (ev: PointerEvent) => {
        splitV.classList.remove('dragging');
        splitV.removeEventListener('pointermove', move);
        splitV.removeEventListener('pointerup', up);
        splitV.removeEventListener('pointercancel', up);
        try { splitV.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
        this.resize();
      };

      splitV.addEventListener('pointermove', move);
      splitV.addEventListener('pointerup', up);
      splitV.addEventListener('pointercancel', up);
    });
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

    Object.values(this.views).forEach(v => {
      const isSolo = this.mode === v.id;
      v.hudBtn.textContent = isSolo ? '🗗' : '⛶';
      v.hudBtn.title = isSolo ? 'Restore all views' : `Maximize ${v.name}`;
      v.hudBtn.classList.toggle('active', isSolo);
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
      const parent = v.box;
      if (!parent || parent.offsetParent === null) return;
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
        if (v.box.offsetParent !== null) {
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
      if (v.box.offsetParent !== null) {
        v.controls.update();
        v.renderer.render(this.scene!, v.camera);
      }
    });
  }
}
