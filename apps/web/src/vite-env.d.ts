/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RENDERER?: 'three' | 'canvas';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
