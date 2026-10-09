import { describe, expect, it } from 'vitest';
import { createMuxer } from '../src/engine/export/muxers';
import { DEFAULT_EXPORT_SETTINGS, resolveExport } from '../src/engine/export/exportSettings';
import { createProject } from '../src/engine/project/createProject';

describe('createMuxer com áudio Opus no MP4', () => {
  it('aceita audioCodec opus ao criar o muxer', () => {
    const config = { ...resolveExport(createProject('T'), { ...DEFAULT_EXPORT_SETTINGS, format: 'mp4' }), audioCodec: 'opus' };
    const muxer = createMuxer(config, true, 48000);
    expect(typeof muxer.addAudioChunk).toBe('function');
  });
});
