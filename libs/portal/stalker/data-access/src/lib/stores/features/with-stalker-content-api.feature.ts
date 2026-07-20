import { computed, inject } from '@angular/core';
import {
    patchState,
    signalStoreFeature,
    type as signalStoreType,
    withComputed,
    withMethods,
} from '@ngrx/signals';
import { PlaylistMeta } from '@iptvnator/shared/interfaces';
import {
    StalkerCategoryItem,
    StalkerContentItem,
    StalkerItvChannel,
} from '../../models';
import { StalkerItvCacheService } from '../../stalker-itv-cache.service';
import { ResourceState, StalkerContentType } from '../stalker-store.contracts';
import { buildCategoryPatch, getCategoriesByType } from '../utils';
import { StalkerContentState } from './with-stalker-content.feature';

type StalkerContentApiState = StalkerContentState & {
    currentPlaylist: PlaylistMeta | undefined;
    selectedContentType: StalkerContentType;
    selectedCategoryId: string | null | undefined;
    limit: number;
};

interface StalkerContentApiProps {
    categoryResource: ResourceState<StalkerCategoryItem[] | undefined>;
    getContentResource: ResourceState<StalkerContentItem[] | undefined>;
}

/** Public selectors and mutations layered over the Stalker content resources. */
export function withStalkerContentApi() {
    return signalStoreFeature(
        {
            state: signalStoreType<StalkerContentApiState>(),
            props: signalStoreType<StalkerContentApiProps>(),
        },
        withComputed((store) => {
            const itvCache = inject(StalkerItvCacheService);
            const itvFullChannelList = computed(() => {
                const playlist = store.currentPlaylist();
                itvCache.versionFor(playlist);
                return itvCache.getChannels(playlist) ?? [];
            });
            const itvFullListActive = computed(() => {
                const playlist = store.currentPlaylist();
                itvCache.versionFor(playlist);
                return itvCache.getChannels(playlist) !== null;
            });
            const itvCategoryItemCounts = computed(() => {
                const counts = new Map<number, number>();
                const channels = itvFullChannelList();
                for (const channel of channels) {
                    const genreId = Number(channel.tv_genre_id);
                    if (!Number.isNaN(genreId)) {
                        counts.set(genreId, (counts.get(genreId) ?? 0) + 1);
                    }
                }
                counts.set(Number.NaN, channels.length);
                return counts;
            });

            return {
                itvFullListActive,
                itvFullListLoading: computed(() =>
                    itvCache.isLoading(store.currentPlaylist())
                ),
                itvFullListProgress: computed(() =>
                    itvCache.progressOf(store.currentPlaylist())
                ),
                itvFullChannelList,
                itvSelectedCategoryFromCache: computed(() => {
                    if (!itvFullListActive()) {
                        return false;
                    }
                    const categoryId = store.selectedCategoryId();
                    if (!categoryId) {
                        return false;
                    }
                    return (
                        categoryId === '*' ||
                        itvCategoryItemCounts().has(Number(categoryId))
                    );
                }),
                itvCategoryItemCounts,
                getTotalPages: computed(() =>
                    Math.ceil(store.totalCount() / store.limit())
                ),
                getSelectedCategory: computed(() => {
                    const categoryId = store.selectedCategoryId();
                    if (!categoryId) {
                        return {
                            id: 0,
                            category_name: 'All Items',
                            type: store.selectedContentType(),
                        };
                    }
                    const contentType = store.selectedContentType();
                    return (
                        getCategoriesByType(store, contentType).find(
                            (category) =>
                                String(category.category_id) ===
                                String(categoryId)
                        ) ?? {
                            category_id: categoryId,
                            category_name: '',
                            type: contentType,
                        }
                    );
                }),
                getSelectedCategoryName: computed(() => {
                    const categoryId = store.selectedCategoryId();
                    if (!categoryId) {
                        return '';
                    }
                    return (
                        getCategoriesByType(
                            store,
                            store.selectedContentType()
                        ).find(
                            (category) =>
                                String(category.category_id) ===
                                String(categoryId)
                        )?.category_name ?? ''
                    );
                }),
                getPaginatedContent: computed(() => store.paginatedContent()),
                isPaginatedContentLoading: computed(() =>
                    store.getContentResource.isLoading()
                ),
                isPaginatedContentFailed: computed(() => store.contentError()),
                getCategoryResource: computed(() =>
                    getCategoriesByType(store, store.selectedContentType())
                ),
                isCategoryResourceLoading: computed(() =>
                    store.categoryResource.isLoading()
                ),
                isCategoryResourceFailed: computed(() => store.categoryError()),
            };
        }),
        withMethods((store) => {
            const itvCache = inject(StalkerItvCacheService);
            return {
                preloadItvChannels(): void {
                    void itvCache.ensureLoaded(store.currentPlaylist());
                },
                async refreshItvChannels(): Promise<void> {
                    await itvCache.refresh(store.currentPlaylist());
                },
                setCategories(
                    type: StalkerContentType,
                    categories: StalkerCategoryItem[]
                ): void {
                    patchState(store, buildCategoryPatch(type, categories));
                },
                resetCategories(): void {
                    patchState(store, {
                        vodCategories: [],
                        seriesCategories: [],
                        itvCategories: [],
                        radioCategories: [],
                        categoryError: null,
                    });
                },
                setItvChannels(channels: StalkerItvChannel[]): void {
                    patchState(store, { itvChannels: channels });
                },
                setRadioChannels(channels: StalkerItvChannel[]): void {
                    patchState(store, { radioChannels: channels });
                },
            };
        })
    );
}
