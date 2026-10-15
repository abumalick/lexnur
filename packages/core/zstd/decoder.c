// Decoder-only zstd for package bodies: one DCtx, dictionaries prepared once as DDicts.
#define ZSTD_STATIC_LINKING_ONLY
#include <stdlib.h>
#include "zstd.h"

static ZSTD_DCtx *dctx;

void *lx_malloc(size_t n) { return malloc(n); }
void lx_free(void *p) { free(p); }

ZSTD_DDict *lx_ddict(const void *dict, size_t n) { return ZSTD_createDDict(dict, n); }

// Frames are stored without the 4-byte magic number. Returns (size_t)-1 when the header gives no size
// below 1 GiB, so no 64-bit value crosses into JavaScript.
size_t lx_content_size(const void *src, size_t n) {
  ZSTD_frameHeader h;
  if (ZSTD_getFrameHeader_advanced(&h, src, n, ZSTD_f_zstd1_magicless) != 0) return (size_t)-1;
  if (h.frameContentSize >= (1ULL << 30)) return (size_t)-1;
  return (size_t)h.frameContentSize;
}

// Returns the decoded size, or 0 with a nonzero error code in *err.
size_t lx_decode(ZSTD_DDict *ddict, void *dst, size_t cap, const void *src, size_t n) {
  if (!dctx) {
    dctx = ZSTD_createDCtx();
    ZSTD_DCtx_setParameter(dctx, ZSTD_d_format, ZSTD_f_zstd1_magicless);
  }
  ZSTD_DCtx_refDDict(dctx, ddict);
  size_t r = ZSTD_decompressDCtx(dctx, dst, cap, src, n);
  return ZSTD_isError(r) ? (size_t)-1 : r;
}
