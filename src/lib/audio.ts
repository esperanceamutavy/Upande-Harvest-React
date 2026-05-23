import { Audio } from 'expo-av';

let beep: Audio.Sound | null = null;
let submit: Audio.Sound | null = null;
let error: Audio.Sound | null = null;

export async function initAudio(): Promise<void> {
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

  beep = new Audio.Sound();
  submit = new Audio.Sound();
  error = new Audio.Sound();

  await beep.loadAsync(require('@/assets/sounds/beep.mp3'));
  await submit.loadAsync(require('@/assets/sounds/submit.mp3'));
  await error.loadAsync(require('@/assets/sounds/error.mp3'));
}

async function replaySound(sound: Audio.Sound | null): Promise<void> {
  if (!sound) return;
  await sound.setPositionAsync(0);
  await sound.playAsync();
}

export const playBeep = (): Promise<void> => replaySound(beep);
export const playSubmit = (): Promise<void> => replaySound(submit);
export const playError = (): Promise<void> => replaySound(error);
