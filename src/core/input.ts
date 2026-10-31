import { audio } from './audio';

export const CAM_ORBIT_SPEED = 2.2;

export type InputState = {
  moveX: number; // -1..1 (left/right)
  moveZ: number; // -1..1 (forward/back, +1 = away from camera / W)
  camX: number; // camera orbit input -1..1
  light: boolean;
  heavy: boolean;
  special: boolean;
  jump: boolean;
  dash: boolean;
  interact: boolean;
  swap: boolean;
  swapIndex: number | null;
  pause: boolean;
  help: boolean;
  pointerLockWanted: boolean;
};

const empty = (): InputState => ({
  moveX: 0,
  moveZ: 0,
  camX: 0,
  light: false,
  heavy: false,
  special: false,
  jump: false,
  dash: false,
  interact: false,
  swap: false,
  swapIndex: null,
  pause: false,
  help: false,
  pointerLockWanted: false,
});

/**
 * Keyboard + mouse + touch input. Buffered "press" flags are read and cleared
 * once per frame by the player controller, so taps are never lost.
 */
export class Input {
  state: InputState = empty();
  private keys = new Set<string>();
  private mouseDown = 0;
  private touchMove = { x: 0, z: 0, active: false };
  private stickOrigin = { x: 0, y: 0 };
  private stickId: number | null = null;
  touchEnabled = false;
  private onPointerLockChange?: () => void;
  private btnPresses = new Set<string>();

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    this.setupTouch();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) {
      // keep movement held, but never re-buffer presses
      return;
    }
    const k = e.code;
    this.keys.add(k);
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
    if (k === 'Space') this.state.jump = true;
    if (k === 'KeyJ') this.state.light = true;
    if (k === 'KeyK') this.state.heavy = true;
    if (k === 'KeyL') this.state.special = true;
    if (k === 'ShiftLeft' || k === 'ShiftRight') this.state.dash = true;
    if (k === 'KeyE') this.state.interact = true;
    if (k === 'KeyQ' || k === 'Tab') {
      this.state.swap = true;
      e.preventDefault();
    }
    if (k === 'Digit1') this.state.swapIndex = 0;
    if (k === 'Digit2') this.state.swapIndex = 1;
    if (k === 'Digit3') this.state.swapIndex = 2;
    if (k === 'Digit4') this.state.swapIndex = 3;
    if (k === 'Escape' || k === 'KeyP') this.state.pause = true;
    if (k === 'KeyH') this.state.help = true;
    if (k === 'KeyM') {
      this.state.help = false;
      audio.ui();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      this.mouseDown = 1;
      this.state.light = true;
    } else if (e.button === 2) {
      this.mouseDown = 2;
    }
  };

  private onMouseUp = () => {
    this.mouseDown = 0;
    this.dragging = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    // right-mouse drag orbits the camera; no pointer lock so Esc stays usable for pause
    if (this.mouseDown === 2) {
      this.state.camX += (e.movementX || 0) * 0.032;
      this.dragging = true;
    }
  };

  dragging = false;

  private releaseAll = () => {
    this.keys.clear();
    this.mouseDown = 0;
    this.touchMove = { x: 0, z: 0, active: false };
  };

  private setupTouch() {
    const ui = document.getElementById('touch-ui');
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    if (!ui || !stick || !knob) return;
    const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
    this.touchEnabled = isTouch;
    if (isTouch) ui.classList.remove('hidden');

    stick.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        this.stickId = (e as PointerEvent).pointerId;
        const r = stick.getBoundingClientRect();
        this.stickOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        this.touchMove.active = true;
      },
      { passive: false },
    );
    window.addEventListener('pointermove', (e) => {
      if (!this.touchMove.active || this.stickId !== e.pointerId) return;
      const dx = e.clientX - this.stickOrigin.x;
      const dy = e.clientY - this.stickOrigin.y;
      const max = 52;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.touchMove.x = (dx * k) / max;
      this.touchMove.z = (-dy * k) / max;
    });
    window.addEventListener('pointerup', (e) => {
      if (this.stickId !== e.pointerId) return;
      this.stickId = null;
      this.touchMove = { x: 0, z: 0, active: false };
      knob.style.transform = 'translate(0,0)';
    });

    ui.querySelectorAll<HTMLButtonElement>('.tbtn').forEach((btn) => {
      const act = btn.dataset.act;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio.resume();
        if (act === 'light') this.state.light = true;
        if (act === 'heavy') this.state.heavy = true;
        if (act === 'special') this.state.special = true;
        if (act === 'jump') this.state.jump = true;
        if (act === 'swap') this.state.swap = true;
      });
    });
  }

  /** Refresh continuous movement axes (call every frame after consuming presses). */
  sample() {
    const s = this.state;
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('KeyD')) x += 1;
    if (this.keys.has('KeyW')) z += 1;
    if (this.keys.has('KeyS')) z -= 1;
    if (this.touchMove.active) {
      x += this.touchMove.x;
      z += this.touchMove.z;
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    s.moveX = x;
    s.moveZ = z;
    // camera orbit keys: arrows / comma-period
    let cx = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('Comma')) cx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('Period')) cx += 1;
    s.camX += cx * CAM_ORBIT_SPEED * 0.016;
  }

  consume(): InputState {
    const s = this.state;
    const snap = { ...s };
    s.light = false;
    s.heavy = false;
    s.special = false;
    s.jump = false;
    s.dash = false;
    s.interact = false;
    s.swap = false;
    s.swapIndex = null;
    s.pause = false;
    s.help = false;
    s.pointerLockWanted = false;
    s.camX = 0;
    return snap;
  }

  isMouseHeld(button: 1 | 2) {
    return this.mouseDown === button;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
  }
}
