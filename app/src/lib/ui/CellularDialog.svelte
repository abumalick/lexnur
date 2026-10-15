<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { useApp } from '../app-context';
  import { formatBytes } from '../data/format';
  const { cellular, i18n } = useApp();
</script>

{#if $cellular}
  <Dialog open title={$i18n.t('cellular.title')}
    body={`${$i18n.t('cellular.body', { size: formatBytes($cellular.bytes, $i18n.lang) })} ${$i18n.t('cellular.hint')}`}
    onClose={() => $cellular?.resolve('cancel')}
    actions={[
      { label: $i18n.t('cellular.wait'), onClick: () => $cellular?.resolve('wifi') },
      { label: $i18n.t('cellular.now'), primary: true, onClick: () => $cellular?.resolve('now') },
    ]} />
{/if}
