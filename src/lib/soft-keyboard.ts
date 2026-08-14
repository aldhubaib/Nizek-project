/**
 * Detect a mobile soft keyboard from visual-viewport vs layout height.
 * iOS often reports innerHeight ≈ visualViewport.height while the keyboard
 * is open, so we compare against a baseline captured when the keyboard was
 * closed — not against the live innerHeight.
 */
export function isSoftKeyboardOpen(input: {
  visualHeight: number;
  layoutHeight: number;
  baselineHeight: number;
}): boolean {
  const vsBaseline = input.baselineHeight - input.visualHeight;
  const vsLayout = input.layoutHeight - input.visualHeight;
  return vsBaseline > 80 || vsLayout > 80;
}
