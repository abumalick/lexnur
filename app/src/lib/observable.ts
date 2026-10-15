export class Observable<T> {
  private subs = new Set<(v: T) => void>();
  protected value: T;

  constructor(value: T) {
    this.value = value;
  }

  subscribe(run: (v: T) => void): () => void {
    this.subs.add(run);
    run(this.value);
    return () => { this.subs.delete(run); };
  }

  get current(): T { return this.value; }

  protected set(v: T): void {
    this.value = v;
    for (const s of this.subs) s(v);
  }
}
