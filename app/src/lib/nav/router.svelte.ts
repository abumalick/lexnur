import { getContext } from 'svelte';

export type Route =
  | { name: 'search' }
  | { name: 'entry'; dictionaryId: string; entryId: number }
  | { name: 'library'; onboarding?: boolean }
  | { name: 'settings' }
  | { name: 'sources' };

export const MAX_ENTRY_DEPTH = 20;

export class Router {
  stack = $state<Route[]>([{ name: 'search' }]);
  get top(): Route { return this.stack[this.stack.length - 1]; }
  get canGoBack(): boolean { return this.stack.length > 1; }
  push(r: Route): void {
    const next = [...this.stack, r];
    if (next.filter((x) => x.name === 'entry').length > MAX_ENTRY_DEPTH) next.splice(next.findIndex((x) => x.name === 'entry'), 1);
    this.stack = next;
  }
  back(): boolean {
    if (this.stack.length <= 1) return false;
    this.stack = this.stack.slice(0, -1);
    return true;
  }
  reset(r: Route): void { this.stack = [r]; }
}

export const useRouter = () => getContext<Router>('router');
