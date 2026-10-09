import { describe, expect, it, vi } from 'vitest';
import { crc32 } from '../src/engine/archive/crc32';
import { ArchiveError, readZip } from '../src/engine/archive/zipReader';
import { createZip } from '../src/engine/archive/zipWriter';

const encoder = new TextEncoder();

/** Lê um Blob inteiro como bytes. */
async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Monta um ZIP com uma única entrada, com o método e o conteúdo bruto dados (para testar o leitor). */
function singleEntryZip(name: string, method: number, payload: Uint8Array<ArrayBuffer>): Blob {
  const nameBytes = encoder.encode(name);
  const local = new Uint8Array(30 + nameBytes.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(8, method, true);
  lv.setUint32(18, payload.length, true);
  lv.setUint32(22, payload.length, true);
  lv.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  const central = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, method, true);
  cv.setUint32(20, payload.length, true);
  cv.setUint32(24, payload.length, true);
  cv.setUint16(28, nameBytes.length, true);
  central.set(nameBytes, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length + payload.length, true);
  return new Blob([local, payload, central, end]);
}

/** Comprime bytes em deflate-raw, como o ZIP guarda entradas comprimidas. */
async function deflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const compressed = source.pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

describe('crc32', () => {
  it('confere o valor conhecido de "123456789"', () => {
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
  });

  it('aceita o resultado anterior como seed e dá o mesmo valor de uma vez só', () => {
    const first = encoder.encode('Olá, ');
    const second = encoder.encode('mundo');
    const whole = encoder.encode('Olá, mundo');
    expect(crc32(second, crc32(first))).toBe(crc32(whole));
  });

  it('o CRC de dados vazios é zero', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('zip ida e volta', () => {
  it('preserva vários arquivos, nome com acento e arquivo vazio', async () => {
    const video = new Uint8Array(5000).map((_, i) => (i * 37) % 256);
    const zip = await createZip([
      { name: 'project.json', data: new Blob(['{"a":1}']) },
      { name: 'media/x/clipe-ação-é.mp4', data: new Blob([video]) },
      { name: 'media/x/vazio.bin', data: new Blob([]) },
    ]);
    const files = await readZip(zip);
    expect([...files.keys()].sort()).toEqual(['media/x/clipe-ação-é.mp4', 'media/x/vazio.bin', 'project.json']);
    expect(new TextDecoder().decode(await bytesOf(files.get('project.json')!))).toBe('{"a":1}');
    expect(await bytesOf(files.get('media/x/clipe-ação-é.mp4')!)).toEqual(video);
    expect((await bytesOf(files.get('media/x/vazio.bin')!)).length).toBe(0);
  });

  it('informa o progresso até 1 e funciona sem entradas', async () => {
    const onProgress = vi.fn();
    const zip = await createZip([{ name: 'a.txt', data: new Blob(['abc']) }], onProgress);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    expect((await readZip(zip)).size).toBe(1);
    expect((await readZip(await createZip([]))).size).toBe(0);
  });

  it('lê o registro ZIP64 de fim quando o arquivo é forçado a ZIP64', async () => {
    const zip = await createZip(
      [
        { name: 'um.txt', data: new Blob(['primeiro']) },
        { name: 'dois.txt', data: new Blob(['segundo']) },
      ],
      undefined,
      10,
    );
    const files = await readZip(zip);
    expect(new TextDecoder().decode(await bytesOf(files.get('dois.txt')!))).toBe('segundo');
    expect(files.size).toBe(2);
  });

  it('decodifica entradas comprimidas (deflate)', async () => {
    const original = encoder.encode('texto que se comprime bem '.repeat(20));
    const zip = singleEntryZip('texto.txt', 8, await deflateRaw(original));
    const files = await readZip(zip);
    const got = await bytesOf(files.get('texto.txt')!);
    expect(new TextDecoder().decode(got)).toBe(new TextDecoder().decode(original));
  });
});

describe('readZip rejeita entradas inválidas', () => {
  it('lixo que não é ZIP gera zip-invalid', async () => {
    await expect(readZip(new Blob(['isto não é um zip nem chega perto disso']))).rejects.toMatchObject({
      code: 'zip-invalid',
    });
  });

  it('arquivo vazio gera zip-invalid', async () => {
    const error = await readZip(new Blob([])).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ArchiveError);
    expect((error as ArchiveError).code).toBe('zip-invalid');
  });

  it('método de compressão desconhecido gera zip-unsupported', async () => {
    await expect(readZip(singleEntryZip('a.txt', 12, new Uint8Array([1, 2, 3])))).rejects.toMatchObject({
      code: 'zip-unsupported',
    });
  });
});
