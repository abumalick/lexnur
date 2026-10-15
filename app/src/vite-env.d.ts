/// <reference types="svelte" />
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_DATA?: 'fixture';
  readonly VITE_SMOKE?: '1';
  readonly VITE_SMOKE_INSTALL?: string;
  readonly VITE_SMOKE_DB?: string;
  readonly VITE_SMOKE_STORE?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
declare const __APP_VERSION__: string;
