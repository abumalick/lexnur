<script lang="ts">
  import { splitLinks } from './entry-model';
  let { text, links, lang, dir, onLink }: { text: string; links?: [string, string][]; lang: string; dir: 'ltr' | 'rtl'; onLink: (word: string) => void } = $props();
  const segments = $derived(splitLinks(text, links));
</script>

<span class="gloss" {lang} {dir}>{#each segments as s, i (i)}{#if s.target}<button class="link" onclick={() => onLink(s.target!)}>{s.text}</button>{:else}{s.text}{/if}{/each}</span>

<style>
  .link { all: unset; text-decoration: underline; text-underline-offset: 3px; color: var(--md-primary); cursor: pointer; padding: 6px 0; margin: -6px 0; }
</style>
