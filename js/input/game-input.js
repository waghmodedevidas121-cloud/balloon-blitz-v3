export function bindGameInput({
  canvas,
  getState,
  getMode,
  onTap,
  onFireArrow,
  onPause,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document
}) {
  let aimPointer = null;
  let activePointerId = null;
  const setAim = value => { aimPointer = value; };
  const clearPointer = () => { activePointerId = null; setAim(null); };

  function onPointerDown(event) {
    if (event.target !== canvas || getState() !== 'playing' || activePointerId !== null || event.isPrimary === false) return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    activePointerId = event.pointerId ?? null;
    if (getMode() === 'slingshot') {
      setAim({ x: event.clientX, y: event.clientY });
      try { canvas.setPointerCapture(event.pointerId); } catch { /* optional */ }
      return;
    }
    onTap(event.clientX, event.clientY, false);
    try { canvas.setPointerCapture(event.pointerId); } catch { /* optional */ }
  }

  function onPointerMove(event) {
    if (event.target !== canvas || getState() !== 'playing' || activePointerId === null || event.pointerId !== activePointerId) return;
    if (getMode() === 'slingshot' && aimPointer) {
      setAim({ x: event.clientX, y: event.clientY });
      return;
    }
    if (getMode() !== 'puzzle' && event.buttons) onTap(event.clientX, event.clientY, true);
  }

  function onPointerUp(event) {
    if (activePointerId === null || event.pointerId !== activePointerId) return;
    if (getMode() === 'slingshot' && aimPointer && getState() === 'playing') {
      const pointer = { x: event.clientX, y: event.clientY };
      setAim(pointer);
      onFireArrow(pointer);
    }
    clearPointer();
  }

  function onPointerCancel(event) {
    if (activePointerId !== null && event.pointerId === activePointerId) clearPointer();
  }

  function onVisibilityChange() {
    if (!documentTarget.hidden) return;
    clearPointer();
    if (getState() === 'playing') onPause();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && getState() === 'playing') onPause();
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  documentTarget.addEventListener('visibilitychange', onVisibilityChange);
  windowTarget.addEventListener('keydown', onKeyDown);

  return {
    getAimPointer: () => aimPointer,
    clearAim: clearPointer,
    destroy() {
      clearPointer();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      documentTarget.removeEventListener('visibilitychange', onVisibilityChange);
      windowTarget.removeEventListener('keydown', onKeyDown);
    }
  };
}
