// Keyboard + mouse state. Uses pointer lock so the mouse can move forever.
const isTyping = (e) => e.target instanceof HTMLInputElement;

export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.mouse = { left: false, right: false };
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.lockBlocked = false;   // true if this browser/window doesn't allow mouse lock at all
    this.enabled = false;       // false while menus are open
    this.onPauseRequest = null; // set by the game

    addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (e.code === 'Escape' && !this.locked && this.onPauseRequest) this.onPauseRequest();
      // Browsers only allow a mouse lock right after a key press or click,
      // so in game we grab it on the first key you press (W, Shift, anything but Esc).
      else if (this.enabled && !this.locked) this.requestLock();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    addEventListener('mousedown', (e) => {
      // In game but the mouse isn't locked yet: a click anywhere locks it (and doesn't shoot).
      const onControl = e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement;
      if (this.enabled && !this.locked && !onControl) {
        this.requestLock();
        if (!this.lockBlocked) return; // first click just locks; in fallback mode it also shoots
      }
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
      this.mx = e.clientX;
      this.my = e.clientY;
      this.mouseInside = true;
    });
    // Pointer left the window: in pointer-aim mode the plane then just flies straight.
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) this.mouseInside = false; });

    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === this.element;
      if (this.locked) this.lockBlocked = false; // real lock works: leave fallback mode
      if (wasLocked && !this.locked && this.onPauseRequest) this.onPauseRequest();
    });
  }

  /**
   * Lock the mouse to the game: the cursor disappears, can't leave the game, and every
   * movement steers the aim circle. Uses raw mouse input (no acceleration) where supported.
   * If the browser says "not right now" (e.g. Chrome just after you pressed Esc), the
   * "press any key or click" prompt stays up and the next key or click tries again.
   */
  requestLock() {
    if (this.locked) return;
    const failed = (err) => { if (err?.name === 'WrongDocumentError') this.lockBlocked = true; };
    const plain = () => {
      try {
        const p = this.element.requestPointerLock();
        if (p && p.catch) p.catch(failed);
      } catch (err) { failed(err); }
    };
    try {
      const p = this.element.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch((err) => { if (err?.name === 'NotSupportedError') plain(); else failed(err); });
    } catch {
      plain();
    }
  }

  /**
   * Some windows can never lock the mouse (e.g. the browser pane inside the Claude app).
   * They answer every lock request with "WrongDocumentError", even without a click, so we
   * ask once at startup. Only there do we use fallback mode (hidden cursor steers the plane);
   * in a real browser the mouse always stays locked inside the game.
   */
  detectLockSupport() {
    // The Claude app's browser pane names itself "Claude/..." and can never lock the mouse.
    if (/\bClaude\//.test(navigator.userAgent)) this.lockBlocked = true;
  }

  /**
   * Pointer-aim mode, used where the mouse can't be locked: the aim circle sits on the
   * mouse pointer, and the plane turns toward it (pointer far from the centre = turn fast,
   * pointer in the middle = fly straight). Returns the pointer's offset from the screen
   * centre as -1..1, or 0/0 when the pointer is outside the window.
   */
  get pointerMode() { return this.lockBlocked && !this.locked; }
  pointerOffset() {
    if (!this.mouseInside || this.mx === undefined) return { x: 0, y: 0 };
    return { x: (this.mx - innerWidth / 2) / (innerWidth / 2), y: (this.my - innerHeight / 2) / (innerHeight / 2) };
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  consumeMouse() {
    // Only a locked mouse steers, so a free cursor never moves your aim.
    // (If this browser blocks locking completely, we steer with the hidden cursor instead.)
    const d = this.enabled && this.locked ? { dx: this.dx, dy: this.dy } : { dx: 0, dy: 0 };
    this.dx = this.dy = 0;
    return d;
  }

  key(code) { return this.enabled && this.keys.has(code); }
  get throttleUp() { return this.key('KeyW'); }
  get throttleDown() { return this.key('KeyS'); }
  get roll() { return (this.key('KeyD') ? 1 : 0) - (this.key('KeyA') ? 1 : 0); }
  get boost() { return this.key('ShiftLeft') || this.key('ShiftRight'); }
  /** The mouse is steering the plane: locked, or in fallback mode for browsers that block locking. */
  get aiming() { return this.locked || this.lockBlocked; }
  get fire() { return this.enabled && this.aiming && this.mouse.left; }
  get missile() { return this.enabled && this.aiming && this.mouse.right; }
  /** True when the "press any key / click to lock" prompt should show. */
  get needsLock() { return this.enabled && !this.aiming; }
  get flare() { return this.key('KeyF'); }
  get scoreboard() { return this.keys.has('Tab'); }
}
