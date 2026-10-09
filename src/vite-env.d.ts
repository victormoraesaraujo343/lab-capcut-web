/// <reference types="vite/client" />

declare module '*?worklet-data' {
  /** URL data:text/javascript;base64 com o script do worklet já empacotado. */
  const url: string;
  export default url;
}

declare module '*?bundled-source' {
  /** Código JS (iife) do arquivo já empacotado, como texto. */
  const code: string;
  export default code;
}
