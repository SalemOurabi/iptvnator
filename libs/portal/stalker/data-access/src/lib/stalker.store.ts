import { signalStore } from '@ngrx/signals';
import {
    withStalkerContent,
    withStalkerContentApi,
    withStalkerEpg,
    withStalkerFavorites,
    withStalkerPlayer,
    withStalkerPortal,
    withStalkerRecent,
    withStalkerSelection,
    withStalkerSeries,
} from './stores/features';

/**
 * StalkerStore facade composed from feature slices.
 * Public API compatibility is preserved while implementation is split by concern.
 */
export const StalkerStore = signalStore(
    { providedIn: 'root' },
    withStalkerPortal(),
    withStalkerSelection(),
    withStalkerContent(),
    withStalkerContentApi(),
    withStalkerSeries(),
    withStalkerPlayer(),
    withStalkerFavorites(),
    withStalkerRecent(),
    withStalkerEpg()
);
