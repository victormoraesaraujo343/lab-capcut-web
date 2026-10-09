/** Reduz canais de áudio a picos normalizados (0..1), um por intervalo (bucket). */
export function computePeaks(channels: Float32Array[], buckets: number): number[] {
  if (!Number.isFinite(buckets) || buckets <= 0) {
    return [];
  }

  let sampleCount = 0;
  for (const channel of channels) {
    sampleCount = Math.max(sampleCount, channel.length);
  }
  if (sampleCount === 0) {
    return [];
  }

  const count = Math.min(Math.floor(buckets), sampleCount);
  const peaks: number[] = new Array<number>(count).fill(0);

  for (const channel of channels) {
    for (let bucket = 0; bucket < count; bucket++) {
      const start = Math.floor((bucket * sampleCount) / count);
      const end = Math.min(channel.length, Math.floor(((bucket + 1) * sampleCount) / count));
      let peak = peaks[bucket] ?? 0;
      for (let i = start; i < end; i++) {
        const magnitude = Math.abs(channel[i] ?? 0);
        if (magnitude > peak) {
          peak = magnitude;
        }
      }
      peaks[bucket] = peak;
    }
  }

  let globalMax = 0;
  for (const peak of peaks) {
    if (peak > globalMax) {
      globalMax = peak;
    }
  }
  if (globalMax === 0) {
    return peaks.map(() => 0);
  }

  return peaks.map((peak) => peak / globalMax);
}
