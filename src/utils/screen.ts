export function isTouchPointer(pointer: Phaser.Input.Pointer): boolean {
  return (pointer as unknown as { pointerType?: string }).pointerType === 'touch' || pointer.event?.type?.startsWith('touch') === true;
}

export function requestLandscapeLock(): void {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: OrientationLockType) => Promise<void> };
  orientation.lock?.('landscape').catch(() => {
    // Browser may require installed PWA/fullscreen/user settings. CSS overlay still blocks portrait play.
  });
}
