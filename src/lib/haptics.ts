import * as Haptics from 'expo-haptics';

/** Heavy pulse — used for warnings and errors (≈ Flutter vibration 200ms) */
export function heavyHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

/** Light tap — used on successful barcode scan */
export function lightHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
