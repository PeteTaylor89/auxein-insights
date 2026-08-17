// services/blocksCache.js — Stale-while-revalidate wrapper for the block list.
//
// Its own module rather than part of observationsCache because blocks aren't
// an observation concept: BlockPickerModal is shared by task creation too, and
// every one of those flows is equally dead offline without a block to pick.
import { swr, REFERENCE_TTL_MS } from './offlineCache';
import { blocksService } from '../api/services';

export async function getCompanyBlocksCached(opts = {}) {
  return swr('blocks.company', () => blocksService.getCompanyBlocks(), {
    ttlMs: REFERENCE_TTL_MS,
    ...opts,
  });
}
