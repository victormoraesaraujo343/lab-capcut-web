// Rasteriza um SVG em PNG na thread principal (o worker de exportação não decodifica SVG).

/** Converte um SVG em texto para um PNG quadrado de size×size pixels. */
export async function rasterizeSvg(svg: string, size = 512): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('canvas-2d-unavailable');
    context.drawImage(image, 0, 0, size, size);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (png === null) throw new Error('png-encode-failed');
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}
