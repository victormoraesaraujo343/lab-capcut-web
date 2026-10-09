// Ambiente de execução: o app pode rodar por endereço da web (http/https) ou aberto direto do disco (file://).
// Por file:// o navegador bloqueia fetch de arquivos locais, então ffmpeg e modelos ONNX ficam indisponíveis.

/** Diz se a página foi aberta direto do disco (endereço file://); dentro de um worker embutido (blob:null/...) também vale. */
export function isFileProtocol(): boolean {
  if (typeof location === 'undefined') return false;
  return location.protocol === 'file:' || (location.protocol === 'blob:' && location.href.startsWith('blob:null/'));
}

/** Diz se o navegador deixa o app baixar arquivos locais (ffmpeg, modelos ONNX); falso por file://. */
export function canFetchLocalAssets(): boolean {
  return !isFileProtocol();
}
