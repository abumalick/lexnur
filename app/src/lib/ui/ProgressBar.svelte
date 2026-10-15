<script lang="ts">
  let { value = null, label }: { value?: number | null; label: string } = $props();
</script>

<div class="track" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100"
  aria-valuenow={value === null ? undefined : Math.round(value * 100)}>
  <div class="fill" class:indeterminate={value === null} style:width={value === null ? '30%' : `${Math.round(value * 100)}%`}></div>
</div>

<style>
  .track { height: 4px; border-radius: 2px; background: var(--md-secondary-container); overflow: hidden; }
  .fill { height: 100%; background: var(--md-primary); transition: width 200ms linear; }
  .indeterminate { animation: slide 1.2s infinite linear; }
  @keyframes slide { from { margin-inline-start: -30%; } to { margin-inline-start: 100%; } }
</style>
