// Inversão de áudio: cada canal mixado é copiado de trás para frente, sem tocar nas entradas.

/** Devolve uma cópia de cada canal com as amostras em ordem inversa; as entradas não mudam. */
export function reverseChannels(channels: Float32Array[]): Float32Array[] {
  return channels.map((channel) => {
    const last = channel.length - 1;
    const out = new Float32Array(channel.length);
    for (let i = 0; i <= last; i++) {
      out[i] = channel[last - i] ?? 0;
    }
    return out;
  });
}
