import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';

let beep: AudioPlayer | null = null;
let submit: AudioPlayer | null = null;
let error: AudioPlayer | null = null;

export async function initAudio(): Promise<void> {
  await setAudioModeAsync({ playsInSilentMode: true });

  beep = createAudioPlayer(require('@/assets/sounds/beep.mp3'));
  submit = createAudioPlayer(require('@/assets/sounds/submit.mp3'));
  error = createAudioPlayer(require('@/assets/sounds/error.mp3'));
}

function replaySound(player: AudioPlayer | null): void {
  if (!player) return;
  player.seekTo(0);
  player.play();
}

export const playBeep = (): void => replaySound(beep);
export const playSubmit = (): void => replaySound(submit);
export const playError = (): void => replaySound(error);
