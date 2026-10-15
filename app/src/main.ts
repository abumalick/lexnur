import { mount } from 'svelte';
import './app.css';

const target = document.getElementById('app')!;
if (import.meta.env.VITE_SMOKE === '1') {
  const { default: Smoke } = import.meta.env.VITE_SMOKE_STORE ? await import('./smoke/StoreBench.svelte') : await import('./smoke/Smoke.svelte');
  mount(Smoke, { target });
} else {
  const { createPlatform } = await import('./lib/platform');
  const { createAppContext } = await import('./lib/app-context');
  const { default: App } = await import('./App.svelte');
  const ctx = await createAppContext(await createPlatform());
  const params = new URLSearchParams(location.search);
  if (import.meta.env.VITE_DATA === 'fixture' && params.get('scene')) {
    const { applyScene } = await import('./lib/scenes');
    await applyScene(ctx, params, target);
  } else {
    mount(App, { target, props: { ctx } });
  }
}
