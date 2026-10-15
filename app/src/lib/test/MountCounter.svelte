<script lang="ts">
  import { onMount } from 'svelte';
  import { mounts } from './mounts';
  let { route }: { route: { name: string } } = $props();
  onMount(() => { mounts[route.name] = (mounts[route.name] ?? 0) + 1; });
</script>

<p>counted</p>
