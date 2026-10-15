const open: Array<() => void> = [];

export const overlays = {
  push(close: () => void): () => void {
    open.push(close);
    return () => {
      const i = open.lastIndexOf(close);
      if (i >= 0) open.splice(i, 1);
    };
  },
  closeTop(): boolean {
    const close = open[open.length - 1];
    if (!close) return false;
    close();
    return true;
  },
};
