import { useCallback, useRef } from "react";

type SoundType = "move" | "capture" | "castle" | "check" | "checkmate" | "promote";

function detectSoundType(san: string): SoundType {
  if (san.includes("#")) return "checkmate";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("=")) return "promote";
  if (san.includes("+")) return "check";
  if (san.includes("x")) return "capture";
  return "move";
}

/** Filtered noise burst — sounds like a wooden piece being placed. */
function playClick(ctx: AudioContext, volume: number, duration: number, freq: number) {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

/** Short sine tone — used for check/promote/checkmate accents. */
function playTone(ctx: AudioContext, freq: number, duration: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function useChessSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  function getCtx(): AudioContext {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    // Resume if suspended (browser autoplay policy)
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  const playMoveSound = useCallback((san: string) => {
    try {
      const ctx = getCtx();
      const type = detectSoundType(san);

      switch (type) {
        case "move":
          playClick(ctx, 0.45, 0.07, 1200);
          break;
        case "capture":
          playClick(ctx, 0.65, 0.10, 750);
          break;
        case "castle":
          playClick(ctx, 0.45, 0.07, 1200);
          setTimeout(() => playClick(ctx, 0.4, 0.07, 1000), 70);
          break;
        case "check":
          playClick(ctx, 0.45, 0.07, 1200);
          setTimeout(() => playTone(ctx, 900, 0.22, 0.12), 55);
          break;
        case "promote":
          playClick(ctx, 0.45, 0.07, 1200);
          setTimeout(() => playTone(ctx, 660, 0.3, 0.13), 55);
          break;
        case "checkmate":
          playClick(ctx, 0.55, 0.09, 900);
          setTimeout(() => playTone(ctx, 440, 0.55, 0.18), 80);
          break;
      }
    } catch { /* ignore — audio unavailable in some environments */ }
  }, []);

  return { playMoveSound };
}
