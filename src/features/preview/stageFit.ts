// Encaixe puro do quadro do projeto dentro do palco (contain centralizado com margem).

/** Retângulo, em px, onde o quadro do projeto aparece dentro do palco. */
export interface StageRect {
  /** Largura do quadro exibido. */
  width: number;
  /** Altura do quadro exibido. */
  height: number;
  /** Deslocamento horizontal dentro do palco. */
  left: number;
  /** Deslocamento vertical dentro do palco. */
  top: number;
}

/** Calcula o maior retângulo com a proporção do projeto que cabe no palco, centralizado, com margem em volta. */
export function fitStage(
  containerW: number,
  containerH: number,
  projectW: number,
  projectH: number,
  padding = 16,
): StageRect {
  const availW = Math.max(0, containerW - padding * 2);
  const availH = Math.max(0, containerH - padding * 2);
  if (!(projectW > 0 && projectH > 0) || availW === 0 || availH === 0) {
    return { width: 0, height: 0, left: 0, top: 0 };
  }
  const scale = Math.min(availW / projectW, availH / projectH);
  const width = projectW * scale;
  const height = projectH * scale;
  return { width, height, left: (containerW - width) / 2, top: (containerH - height) / 2 };
}
