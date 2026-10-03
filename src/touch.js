// On-screen controls for touch devices: a floating thumbstick on the left half of the screen
// and a cluster of buttons on the right. Shown once the first touch happens.

const BUTTONS = [
  // [id, label, edge-or-hold, game edge name]
  ['tBoost', 'Boost', 'hold', null],
  ['tAct', 'Dock', 'edge', 'act'],
  ['tLamp', 'Lamp', 'edge', 'lamp'],
  ['tMap', 'Chart', 'edge', 'map'],
  ['tPause', '❚❚', 'edge', 'esc'],
];

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.x = 0; this.y = 0; this.boost = false;
    this.active = false;
    this.stick = null; // { id, ox, oy }
    const root = (this.root = document.createElement('div'));
    root.id = 'touch';
    root.className = 'hidden';
    root.innerHTML = `
      <div id="tStickZone"></div>
      <div id="tStick"><div id="tKnob"></div></div>
      <div id="tButtons">${BUTTONS.map(([id, label]) => `<button id="${id}" class="tbtn">${label}</button>`).join('')}</div>`;
    document.body.appendChild(root);
    this.base = root.querySelector('#tStick');
    this.knob = root.querySelector('#tKnob');

    addEventListener('touchstart', () => this.enable(), { once: true, passive: true });

    const zone = root.querySelector('#tStickZone');
    zone.addEventListener('pointerdown', (e) => {
      if (this.stick) return;
      try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('on');
      this.move(e);
    });
    zone.addEventListener('pointermove', (e) => { if (this.stick && e.pointerId === this.stick.id) this.move(e); });
    const end = (e) => {
      if (!this.stick || e.pointerId !== this.stick.id) return;
      this.stick = null; this.x = 0; this.y = 0;
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.base.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    for (const [id, , mode, edge] of BUTTONS) {
      const b = root.querySelector(`#${id}`);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        b.classList.add('down');
        this.game.sound.init();
        if (mode === 'hold') this.boost = true;
        else this.game.edges.add(edge);
      });
      const up = () => { b.classList.remove('down'); if (mode === 'hold') this.boost = false; };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    }
    // No page zoom / scroll / long-press menus while playing.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
  }

  enable() {
    this.active = true;
    document.body.classList.add('touch');
    this.show(this.visible);
  }

  show(v) {
    this.visible = v;
    this.root.classList.toggle('hidden', !(v && this.active));
    if (!v) { this.stick = null; this.x = this.y = 0; this.boost = false; this.base.classList.remove('on'); }
  }

  move(e) {
    const R = 56;
    let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      // Let the stick follow a thumb that drifts too far, so it never "runs out".
      this.stick.ox += (dx / l) * (l - R); this.stick.oy += (dy / l) * (l - R);
      this.base.style.left = `${this.stick.ox}px`; this.base.style.top = `${this.stick.oy}px`;
      dx = (dx / l) * R; dy = (dy / l) * R;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const m = Math.hypot(dx, dy) / R;
    if (m < 0.18) { this.x = this.y = 0; return; }
    this.x = dx / R; this.y = -dy / R;
  }

  /** Button label for the interact button depends on what's nearby. */
  setActLabel(text) {
    const b = this.root.querySelector('#tAct');
    b.textContent = text || 'Dock';
    b.classList.toggle('dim', !text);
  }
}
