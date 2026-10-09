// Trechos GLSL ES 3.00 reutilizáveis pelos efeitos. Não incluem `#version` nem `precision`: cada shader declara os seus.

/** Hash pseudo-aleatório (vec2 -> 0..1) sem seno, estável entre GPUs. */
export const GLSL_HASH = `float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/** Ruído de valor suave (vec2 -> 0..1); já inclui o hash, não combine com GLSL_HASH. */
export const GLSL_NOISE = `${GLSL_HASH}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

/** Luminância (Rec. 601) de uma cor RGB. */
export const GLSL_LUMA = `float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
`;

/** Alfa de máscara com borda suave: distância negativa = dentro (1.0), positiva = fora (0.0). */
export const GLSL_MASK_EDGE = `float maskEdge(float signedDist, float feather) {
  float w = max(feather, 0.0001);
  return 1.0 - smoothstep(-w, w, signedDist);
}
`;
