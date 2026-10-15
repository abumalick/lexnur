<script lang="ts">
  import type { Snippet } from 'svelte';
  let { onBack, rtl, enabled, children }: { onBack: () => void; rtl: boolean; enabled: boolean; children: Snippet } = $props();
  const EDGE = 24;
  let dx = $state(0);
  let dragging = $state(false);
  let settling = $state(false);
  let startX = 0, startT = 0, width = 1;

  function down(e: PointerEvent) {
    if (!enabled) return;
    const el = e.currentTarget as HTMLElement;
    width = el.clientWidth;
    const fromEdge = rtl ? width - e.clientX : e.clientX;
    if (fromEdge > EDGE) return;
    dragging = true; startX = e.clientX; startT = e.timeStamp;
    el.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (dragging) dx = Math.max(0, (e.clientX - startX) * (rtl ? -1 : 1));
  }
  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const v = dx / Math.max(1, e.timeStamp - startT);
    settling = true;
    if (dx > width * 0.35 || v > 0.5) { dx = width; setTimeout(() => { settling = false; dx = 0; onBack(); }, 180); }
    else { dx = 0; setTimeout(() => (settling = false), 180); }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="swipe" class:dragging style:transform={dragging || settling || dx !== 0 ? `translateX(${rtl ? -dx : dx}px)` : undefined}
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
  {@render children()}
</div>

<style>
  .swipe { position: absolute; inset: 0; background: var(--md-surface); touch-action: pan-y; transition: transform 180ms ease-out; box-shadow: 0 0 24px rgb(0 0 0 / 0.15); }
  .swipe.dragging { transition: none; }
</style>
