import { describe, expect, it } from 'vitest';
import {
  ACCEPT_ATTRIBUTE,
  ACCEPTED_EXTENSIONS,
  detectAssetKind,
} from '../src/engine/decode/mediaKind';

describe('detectAssetKind', () => {
  it.each([
    ['clip.mp4', 'video/mp4', 'video'],
    ['clip.mov', 'video/quicktime', 'video'],
    ['clip.webm', 'video/webm', 'video'],
    ['clip.m4v', 'video/x-m4v', 'video'],
    ['song.mp3', 'audio/mpeg', 'audio'],
    ['sound.wav', 'audio/wav', 'audio'],
    ['sound.wav', 'audio/x-wav', 'audio'],
    ['sound.wav', 'audio/wave', 'audio'],
    ['voice.aac', 'audio/aac', 'audio'],
    ['voice.m4a', 'audio/mp4', 'audio'],
    ['voice.m4a', 'audio/x-m4a', 'audio'],
    ['track.ogg', 'audio/ogg', 'audio'],
    ['track.opus', 'audio/opus', 'audio'],
    ['pic.jpg', 'image/jpeg', 'image'],
    ['pic.jpeg', 'image/jpeg', 'image'],
    ['pic.png', 'image/png', 'image'],
    ['pic.gif', 'image/gif', 'image'],
    ['pic.webp', 'image/webp', 'image'],
  ])('detecta %s com mime %s como %s', (name, type, expected) => {
    expect(detectAssetKind({ name, type })).toBe(expected);
  });

  it('trata audio/webm como áudio', () => {
    expect(detectAssetKind({ name: 'voice.webm', type: 'audio/webm' })).toBe('audio');
  });

  it('trata .webm sem mime como vídeo', () => {
    expect(detectAssetKind({ name: 'clip.webm', type: '' })).toBe('video');
  });

  it('usa a extensão quando o mime está vazio', () => {
    expect(detectAssetKind({ name: 'CLIP.MP4', type: '' })).toBe('video');
    expect(detectAssetKind({ name: 'song.mp3', type: '' })).toBe('audio');
    expect(detectAssetKind({ name: 'pic.PNG', type: '' })).toBe('image');
  });

  it('usa a extensão quando o mime é application/octet-stream', () => {
    expect(detectAssetKind({ name: 'pic.jpg', type: 'application/octet-stream' })).toBe('image');
    expect(detectAssetKind({ name: 'track.ogg', type: 'application/octet-stream' })).toBe('audio');
  });

  it('ignora parâmetros do mime', () => {
    expect(detectAssetKind({ name: 'clip.mp4', type: 'video/mp4; codecs="avc1.42E01E"' })).toBe(
      'video',
    );
  });

  it('retorna null para formatos não aceitos', () => {
    expect(detectAssetKind({ name: 'notes.txt', type: 'text/plain' })).toBeNull();
    expect(detectAssetKind({ name: 'old.avi', type: 'video/x-msvideo' })).toBeNull();
    expect(detectAssetKind({ name: 'old.avi', type: '' })).toBeNull();
    expect(detectAssetKind({ name: 'semextensao', type: '' })).toBeNull();
  });
});

describe('ACCEPT_ATTRIBUTE e ACCEPTED_EXTENSIONS', () => {
  it('lista todas as extensões aceitas', () => {
    expect(ACCEPTED_EXTENSIONS).toEqual(
      expect.arrayContaining(['.mp4', '.mov', '.webm', '.m4v', '.mp3', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.jpg', '.jpeg', '.png', '.gif', '.webp']),
    );
    expect(ACCEPTED_EXTENSIONS).not.toContain('.avi');
  });

  it('inclui mimes e extensões no atributo accept', () => {
    const tokens = ACCEPT_ATTRIBUTE.split(',');
    expect(tokens).toContain('video/quicktime');
    expect(tokens).toContain('audio/x-m4a');
    expect(tokens).toContain('image/webp');
    expect(tokens).toContain('.opus');
    expect(tokens).not.toContain('.avi');
  });
});
