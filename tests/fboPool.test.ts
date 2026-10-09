// Testes do pool de framebuffers: reuso por tamanho, limites de livres (por tamanho e total), trim e dispose, com um contexto falso.
import { describe, expect, it, vi } from 'vitest';
import { createFboPool, type FboEntry } from '@/engine/render/fboPool';

/** Contexto WebGL2 falso que conta criações e exclusões de texturas e framebuffers. */
function fakeGl(): { gl: WebGL2RenderingContext; deleteTexture: ReturnType<typeof vi.fn>; deleteFramebuffer: ReturnType<typeof vi.fn> } {
  let counter = 0;
  const deleteTexture = vi.fn();
  const deleteFramebuffer = vi.fn();
  const gl = {
    TEXTURE_2D: 1,
    TEXTURE_MIN_FILTER: 2,
    TEXTURE_MAG_FILTER: 3,
    TEXTURE_WRAP_S: 4,
    TEXTURE_WRAP_T: 5,
    LINEAR: 6,
    CLAMP_TO_EDGE: 7,
    RGBA8: 8,
    RGBA: 9,
    UNSIGNED_BYTE: 10,
    FRAMEBUFFER: 11,
    FRAMEBUFFER_BINDING: 12,
    COLOR_ATTACHMENT0: 13,
    FRAMEBUFFER_COMPLETE: 14,
    getParameter: vi.fn(() => null),
    createTexture: vi.fn(() => ({ id: ++counter }) as unknown as WebGLTexture),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    createFramebuffer: vi.fn(() => ({ id: ++counter }) as unknown as WebGLFramebuffer),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 14),
    deleteTexture,
    deleteFramebuffer,
  };
  return { gl: gl as unknown as WebGL2RenderingContext, deleteTexture, deleteFramebuffer };
}

describe('createFboPool', () => {
  it('reaproveita o framebuffer livre do mesmo tamanho', () => {
    const { gl } = fakeGl();
    const pool = createFboPool(gl);
    const first = pool.acquire(10, 10);
    pool.release(first);
    const second = pool.acquire(10, 10);
    expect(second.texture).toBe(first.texture);
    expect(gl.createTexture).toHaveBeenCalledTimes(1);
  });

  it('guarda no máximo 4 livres por tamanho e apaga o excedente ao devolver', () => {
    const { gl, deleteTexture, deleteFramebuffer } = fakeGl();
    const pool = createFboPool(gl);
    const entries: FboEntry[] = [];
    for (let i = 0; i < 6; i += 1) entries.push(pool.acquire(8, 8));
    for (const entry of entries) pool.release(entry);
    expect(deleteTexture).toHaveBeenCalledTimes(2);
    expect(deleteFramebuffer).toHaveBeenCalledTimes(2);
  });

  it('guarda no máximo 24 livres no total, somando os tamanhos', () => {
    const { gl, deleteTexture } = fakeGl();
    const pool = createFboPool(gl);
    const entries: FboEntry[] = [];
    for (let i = 1; i <= 30; i += 1) entries.push(pool.acquire(i, 1));
    for (const entry of entries) pool.release(entry);
    expect(deleteTexture).toHaveBeenCalledTimes(6);
  });

  it('trim apaga os livres e não toca nos que estão em uso', () => {
    const { gl, deleteTexture } = fakeGl();
    const pool = createFboPool(gl);
    const inUse = pool.acquire(4, 4);
    const free = pool.acquire(5, 5);
    pool.release(free);
    pool.trim();
    expect(deleteTexture).toHaveBeenCalledTimes(1);
    pool.release(inUse);
    const again = pool.acquire(4, 4);
    expect(again.texture).toBe(inUse.texture);
  });

  it('dispose apaga todos os framebuffers e texturas, em uso ou livres', () => {
    const { gl, deleteTexture, deleteFramebuffer } = fakeGl();
    const pool = createFboPool(gl);
    const a = pool.acquire(2, 2);
    pool.acquire(3, 3);
    pool.release(a);
    pool.dispose();
    expect(deleteTexture).toHaveBeenCalledTimes(2);
    expect(deleteFramebuffer).toHaveBeenCalledTimes(2);
  });
});
