import { computed, linkedSignal } from '@angular/core';
import {
    StalkerItvChannel,
    normalizeStalkerEntityId,
} from '@iptvnator/portal/stalker/data-access';

const FULL_LIST_RENDER_CHUNK = 100;

interface StalkerLiveChannelStore {
    selectedContentType(): 'vod' | 'series' | 'itv' | 'radio';
    selectedCategoryId(): string | null | undefined;
    searchPhrase(): string;
    itvChannels(): StalkerItvChannel[];
    radioChannels(): StalkerItvChannel[];
    itvFullListActive(): boolean;
    itvFullListLoading(): boolean;
    itvSelectedCategoryFromCache(): boolean;
    itvFullChannelList(): StalkerItvChannel[];
    hasMoreChannels(): boolean;
    isPaginatedContentLoading(): boolean;
}

function mergeChannels(
    cachedChannels: StalkerItvChannel[],
    loadedChannels: StalkerItvChannel[]
): StalkerItvChannel[] {
    if (loadedChannels.length === 0) {
        return cachedChannels;
    }

    const merged = [...cachedChannels];
    const knownIds = new Set(
        cachedChannels.map((channel) => normalizeStalkerEntityId(channel.id))
    );

    for (const channel of loadedChannels) {
        const channelId = normalizeStalkerEntityId(channel.id);
        if (!knownIds.has(channelId)) {
            knownIds.add(channelId);
            merged.push(channel);
        }
    }

    return merged;
}

/**
 * Owns the full-list search and bounded-render state for Stalker Live TV.
 * Portal pagination remains in the host component because it also serves
 * radio and uncached/censored genres.
 */
export function createStalkerLiveChannelBrowser(
    store: StalkerLiveChannelStore
) {
    const isRadioMode = computed(() => store.selectedContentType() === 'radio');
    const channels = computed(() =>
        isRadioMode() ? store.radioChannels() : store.itvChannels()
    );
    const searchTerm = computed(() =>
        store.searchPhrase().trim().toLowerCase()
    );
    const isFullListMode = computed(
        () => !isRadioMode() && store.itvFullListActive()
    );
    const isCategoryFromCache = computed(
        () => !isRadioMode() && store.itvSelectedCategoryFromCache()
    );
    const filteredChannels = computed(() => {
        const term = searchTerm();
        let source = channels();

        if (term && isFullListMode()) {
            source = isCategoryFromCache()
                ? store.itvFullChannelList()
                : mergeChannels(store.itvFullChannelList(), source);
        }

        if (!term) {
            return source;
        }

        return source.filter((item) =>
            `${item.o_name ?? ''} ${item.name ?? ''}`
                .toLowerCase()
                .includes(term)
        );
    });
    const isFullListLoading = computed(
        () => !isRadioMode() && store.itvFullListLoading()
    );
    const showItvAllItems = computed(
        () =>
            !isRadioMode() &&
            !store.selectedCategoryId() &&
            (store.itvFullListActive() || store.itvFullListLoading())
    );
    const renderLimit = linkedSignal({
        source: () => ({
            term: searchTerm(),
            category: store.selectedCategoryId(),
            contentType: store.selectedContentType(),
        }),
        computation: () => FULL_LIST_RENDER_CHUNK,
    });
    const usesRenderWindow = computed(
        () => isCategoryFromCache() || (!!searchTerm() && isFullListMode())
    );
    const visibleChannels = computed(() =>
        usesRenderWindow()
            ? filteredChannels().slice(0, renderLimit())
            : filteredChannels()
    );
    const hasMoreItems = computed(
        () =>
            visibleChannels().length < filteredChannels().length ||
            (!isCategoryFromCache() && store.hasMoreChannels())
    );
    const isInitialChannelsLoading = computed(
        () =>
            !!store.selectedCategoryId() &&
            channels().length === 0 &&
            !searchTerm() &&
            (isFullListLoading() || store.isPaginatedContentLoading())
    );
    const isCategoryEmpty = computed(
        () =>
            !!store.selectedCategoryId() &&
            !searchTerm() &&
            channels().length === 0 &&
            !isInitialChannelsLoading()
    );

    const growRenderWindow = (): boolean => {
        if (visibleChannels().length >= filteredChannels().length) {
            return false;
        }
        renderLimit.update((limit) => limit + FULL_LIST_RENDER_CHUNK);
        return true;
    };

    const ensureChannelIsRendered = (channelId: string): void => {
        if (!usesRenderWindow()) {
            return;
        }
        const index = filteredChannels().findIndex(
            (item) => normalizeStalkerEntityId(item.id) === channelId
        );
        if (index < 0 || index < renderLimit()) {
            return;
        }
        renderLimit.set(
            Math.ceil((index + 1) / FULL_LIST_RENDER_CHUNK) *
                FULL_LIST_RENDER_CHUNK
        );
    };

    return {
        channels,
        ensureChannelIsRendered,
        filteredChannels,
        growRenderWindow,
        hasMoreItems,
        isCategoryEmpty,
        isCategoryFromCache,
        isFullListLoading,
        isFullListMode,
        isInitialChannelsLoading,
        isRadioMode,
        searchTerm,
        showItvAllItems,
        totalChannelCount: computed(() => filteredChannels().length),
        visibleChannels,
    };
}
