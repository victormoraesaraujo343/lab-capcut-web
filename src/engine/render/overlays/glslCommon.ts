// Trechos GLSL ES 3.00 usados pelas sobreposições: ruído, cor de matiz e escala pela altura do quadro.
// Não incluem `#version` nem `precision`: cada shader declara os seus.

/** Hash pseudo-aleatório (vec2 -> 0..1) estável entre GPUs; prefixo ov para não colidir com outros trechos. */
export const OVERLAY_HASH = `float ovHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/** Cor RGB (0..1) de um matiz 0..1 com saturação e brilho plenos. */
export const OVERLAY_HUE = `vec3 ovHueRgb(float h) {
  vec3 k = vec3(1.0, 2.0 / 3.0, 1.0 / 3.0);
  vec3 p = abs(fract(vec3(h) + k) * 6.0 - 3.0);
  return clamp(p - 1.0, 0.0, 1.0);
}
`;

/** Escala de referência: 1.0 quando o quadro tem 1080 px de altura; tamanhos em px escalam por ela. */
export const OVERLAY_UNIT = `float ovUnit() {
  return u_resolution.y / 1080.0;
}
`;

/** Cor RGB (0..1, sem alfa) com alfa: devolve vec4 pré-multiplicado (rgb = cor * alfa, sempre <= alfa). */
export const OVERLAY_PREMULT = `vec4 ovPremult(vec3 color, float alpha) {
  float a = clamp(alpha, 0.0, 1.0);
  return vec4(clamp(color, 0.0, 1.0) * a, a);
}
`;
