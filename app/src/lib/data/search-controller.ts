import { Observable } from '../observable';
import type { DictionaryStore, Scope, SuggestResult } from './dictionary-store';

export interface SearchView { query: string; result: SuggestResult | null; loading: boolean }

export class SearchController extends Observable<SearchView> {
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private store: Pick<DictionaryStore, 'suggest'>;
  private delayMs: number;

  constructor(store: Pick<DictionaryStore, 'suggest'>, delayMs = 30) {
    super({ query: '', result: null, loading: false });
    this.store = store;
    this.delayMs = delayMs;
  }

  setQuery(query: string, scope: Scope): void {
    clearTimeout(this.timer);
    this.seq++;
    if (!query.trim()) { this.set({ query, result: null, loading: false }); return; }
    this.set({ ...this.value, query });
    this.timer = setTimeout(() => void this.run(query, scope), this.delayMs);
  }

  rerun(scope: Scope): void {
    clearTimeout(this.timer);
    if (this.value.query.trim()) void this.run(this.value.query, scope);
  }

  private async run(query: string, scope: Scope): Promise<void> {
    const mine = ++this.seq;
    this.set({ ...this.value, loading: true });
    try {
      const result = await this.store.suggest(query, scope);
      if (mine === this.seq) this.set({ query, result, loading: false });
    } catch (e) {
      console.warn('search failed', e);
      if (mine === this.seq) this.set({ ...this.value, loading: false });
    }
  }
}
