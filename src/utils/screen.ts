export function isTouchPointer(pointer: Phaser.Input.Pointer): boolean {
  return (pointer as unknown as { pointerType?: string }).pointerType === 'touch' || pointer.event?.type?.startsWith('touch') === true;
}

type FullscreenTarget = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
};

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: OrientationLockType) => Promise<void>;
};

const TOUCH_IMMERSIVE_RETRY_MS = 500;
let lastTouchImmersiveAttempt = Number.NEGATIVE_INFINITY;

function fullscreenElement(): Element | null {
  const fullscreenDocument = document as FullscreenDocument;
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
}

function isCoarsePointer(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches === true || navigator.maxTouchPoints > 0;
}

function isTouchEvent(event: Event): boolean {
  if (event.type.startsWith('touch')) return true;
  return (event as PointerEvent).pointerType === 'touch';
}

export async function requestFullscreen(): Promise<void> {
  const target = (document.getElementById('game') ?? document.documentElement) as FullscreenTarget;
  if (fullscreenElement()) return;

  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen({ navigationUI: 'hide' });
      return;
    }

    await target.webkitRequestFullscreen?.();
  } catch {
    // Browser may block fullscreen until a specific user gesture or PWA install state.
  }
}

export async function requestLandscapeLock(): Promise<void> {
  const orientation = screen.orientation as ScreenOrientationWithLock | undefined;

  try {
    await orientation?.lock?.('landscape');
  } catch {
    // Browser may require fullscreen/PWA/user settings. CSS overlay still blocks portrait play.
  }
}

export async function requestImmersiveLandscape(): Promise<void> {
  await requestFullscreen();
  await requestLandscapeLock();
}

export function installTouchImmersiveLandscapeGate(): void {
  const requestFromTouch = (event: Event): void => {
    if (!isTouchEvent(event) && !isCoarsePointer()) return;

    const now = performance.now();
    if (now - lastTouchImmersiveAttempt < TOUCH_IMMERSIVE_RETRY_MS) return;
    lastTouchImmersiveAttempt = now;

    void requestImmersiveLandscape();
  };

  window.addEventListener('pointerdown', requestFromTouch, { capture: true, passive: true });
  window.addEventListener('touchstart', requestFromTouch, { capture: true, passive: true });
}
