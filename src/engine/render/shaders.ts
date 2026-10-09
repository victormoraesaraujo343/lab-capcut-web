// Shaders GLSL ES 3.00 do compositor: desenha um quad unitário com textura, recorte e opacidade.

/** Vertex shader: leva o quad unitário [-0.5, 0.5]² a clip space e calcula o UV recortado. */
export const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
uniform mat3 u_matrix;
uniform vec4 u_uvRect;
out vec2 v_uv;

void main() {
  vec3 clip = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  // u_uvRect = [u0, v0, u1, v1] em espaço de imagem (origem no canto superior esquerdo).
  // O quad está no espaço do projeto com y para BAIXO (layerMatrix leva (-0.5,-0.5) ao canto superior
  // esquerdo) e a textura sobe sem UNPACK_FLIP_Y (linha 0 = topo, v = 0), então o UV vertical é direto.
  vec2 unit = a_position + vec2(0.5);
  v_uv = vec2(
    mix(u_uvRect.x, u_uvRect.z, unit.x),
    mix(u_uvRect.y, u_uvRect.w, unit.y)
  );
}
`;

/** Fragment shader: amostra a textura (já pré-multiplicada) e aplica a opacidade da camada. */
export const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_opacity;
out vec4 outColor;

void main() {
  // A textura chega pré-multiplicada (UNPACK_PREMULTIPLY_ALPHA_WEBGL), então escalar tudo mantém o formato.
  outColor = texture(u_texture, v_uv) * u_opacity;
}
`;

/**
 * Vertex shader dos passes (efeitos, transições e composição): quad de tela cheia em clip space.
 * v_uv é identidade entre entrada e saída (v = 0 é a primeira linha da textura, o topo da imagem enviada),
 * então um passe não inverte a imagem, mesmo quando escreve num framebuffer e lê dele depois.
 */
export const PASS_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_position * 0.5 + 0.5;
}
`;

/**
 * Fragment de cópia: lê u_texture em v_uv * u_scale + u_offset e devolve transparente fora de [0, 1].
 * Com escala 1 e deslocamento 0 é cópia simples; com margem (overscan) centraliza a imagem no quadro maior.
 */
export const COPY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_scale;
uniform vec2 u_offset;
out vec4 outColor;

void main() {
  vec2 src = v_uv * u_scale + u_offset;
  if (src.x < 0.0 || src.y < 0.0 || src.x > 1.0 || src.y > 1.0) {
    outColor = vec4(0.0);
    return;
  }
  outColor = texture(u_texture, src);
}
`;
