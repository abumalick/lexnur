<script lang="ts">
  let { kind }: { kind: 'ios' | 'android' } = $props();
  // svelte-ignore state_referenced_locally
  const top = kind === 'ios' ? 54 : 24;
  // svelte-ignore state_referenced_locally
  const bottom = kind === 'ios' ? 34 : 48;
  document.documentElement.style.setProperty('--safe-area-inset-top', `${top}px`);
  document.documentElement.style.setProperty('--safe-area-inset-bottom', `${bottom}px`);
</script>

<div class="status {kind}" style:height="{top}px" data-testid="fake-status-bar" aria-hidden="true">
  <span class="time">{kind === 'ios' ? '9:41' : '12:00'}</span>
  <span class="icons">
    <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2" width="3" height="10" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
    <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 12 0 3.5a11.5 11.5 0 0 1 16 0Z"/></svg>
    <svg width="27" height="12" viewBox="0 0 27 12"><rect x="0.5" y="0.5" width="23" height="11" rx="3" fill="none" stroke="currentColor"/><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="24.5" y="4" width="2" height="4" rx="1"/></svg>
  </span>
</div>
{#if kind === 'ios'}
  <div class="home" style:height="{bottom}px" aria-hidden="true"><span></span></div>
{:else}
  <div class="nav" style:height="{bottom}px" aria-hidden="true"><span>◁</span><span>○</span><span>□</span></div>
{/if}

<style>
  .status { position: fixed; top: 0; inset-inline: 0; z-index: 100; display: flex; justify-content: space-between; align-items: flex-end;
    padding: 0 28px 8px; color: var(--md-on-surface); font: 600 15px/1 -apple-system, system-ui, Roboto, sans-serif; pointer-events: none; direction: ltr; }
  .status.android { align-items: center; padding: 0 16px; font-size: 13px; font-weight: 500; }
  .icons { display: flex; gap: 6px; align-items: center; fill: currentColor; }
  .home { position: fixed; bottom: 0; inset-inline: 0; z-index: 100; display: grid; place-items: center; pointer-events: none; }
  .home span { width: 134px; height: 5px; border-radius: 3px; background: var(--md-on-surface); }
  .nav { position: fixed; bottom: 0; inset-inline: 0; z-index: 100; display: flex; justify-content: space-around; align-items: center;
    background: var(--md-surface-container); color: var(--md-on-surface-variant); font-size: 18px; pointer-events: none; direction: ltr; }
</style>
