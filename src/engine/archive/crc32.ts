// CRC-32 (padrão do ZIP), calculado de forma incremental para ler arquivos em pedaços.

/** Tabela de 256 valores pré-calculada para o polinômio 0xEDB88320. */
const TABLE: Uint32Array = buildTable();

/** Monta a tabela de CRC-32 usada por crc32(). */
function buildTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

/** Calcula o CRC-32 dos bytes; passe o resultado anterior como seed para continuar um cálculo em pedaços. */
export function crc32(data: Uint8Array, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i += 1) {
    crc = (TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
