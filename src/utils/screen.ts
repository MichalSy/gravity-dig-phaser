export function isTouchPointer(pointer: Phaser.Input.Pointer): boolean {
  return (pointer as unknown as { pointerType?: string }).pointerType === 'touch' || pointer.event?.type?.startsWith('touch') === true;
}

export function requestFullscreen(): void {
  const target = document.getElementById('game') ?? document.documentElement;
  if (document.fullscreenElement || !target.requestFullscreen) return;

  target.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
    // Browser may block fullscreen until specific user gestures or PWA install state.
  });
}

export function requestLandscapeLock(): void {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: OrientationLockType) => Promise<void> };
  orientation.lock?.('landscape').catch(() => {
    // Browser may require fullscreen/PWA/user settings. CSS overlay still blocks portrait play.
  });
}

export function requestImmersiveLandscape(): void {
  requestFullscreen();
  requestLandscapeLock();
}
