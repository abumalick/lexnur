import { Observable } from '../observable';
import { readJson, type KeyValueStore } from './kv';

export interface RecentItem { dictionaryId: string; entryId: number; headword: string; gloss: string | null; openedAt: number }
const KEY = 'recents';

export class RecentSearches extends Observable<RecentItem[]> {
  private kv: KeyValueStore;
  private max: number;

  private constructor(kv: KeyValueStore, max: number, items: RecentItem[]) {
    super(items);
    this.kv = kv;
    this.max = max;
  }

  static async load(kv: KeyValueStore, max = 20): Promise<RecentSearches> {
    const raw = await readJson<RecentItem[]>(kv, KEY);
    const items = Array.isArray(raw) ? raw.filter((x) => x && typeof x.dictionaryId === 'string' && Number.isFinite(x.entryId)) : [];
    return new RecentSearches(kv, max, items.slice(0, max));
  }

  private async save(items: RecentItem[]) { this.set(items); await this.kv.set(KEY, JSON.stringify(items)); }

  add(item: Omit<RecentItem, 'openedAt'>, now = Date.now()): Promise<void> {
    const rest = this.value.filter((x) => !(x.dictionaryId === item.dictionaryId && x.entryId === item.entryId));
    return this.save([{ ...item, openedAt: now }, ...rest].slice(0, this.max));
  }
  remove(dictionaryId: string, entryId: number): Promise<void> {
    return this.save(this.value.filter((x) => !(x.dictionaryId === dictionaryId && x.entryId === entryId)));
  }
  removeDictionary(dictionaryId: string): Promise<void> { return this.save(this.value.filter((x) => x.dictionaryId !== dictionaryId)); }
  async remap(dictionaryId: string, find: (headword: string) => Promise<number | null>): Promise<void> {
    const items: RecentItem[] = [];
    for (const x of this.value) {
      if (x.dictionaryId !== dictionaryId) { items.push(x); continue; }
      const entryId = await find(x.headword);
      if (entryId !== null && !items.some((y) => y.dictionaryId === dictionaryId && y.entryId === entryId)) items.push({ ...x, entryId });
    }
    return this.save(items);
  }
  clear(): Promise<void> { return this.save([]); }
}
