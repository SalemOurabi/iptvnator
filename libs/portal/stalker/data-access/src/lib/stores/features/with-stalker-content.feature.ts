import { inject, resource } from '@angular/core';
import {
    patchState,
    signalStoreFeature,
    withProps,
    withState,
} from '@ngrx/signals';
import { TranslateService } from '@ngx-translate/core';
import { createLogger } from '@iptvnator/portal/shared/util';
import { DataService } from '@iptvnator/services';
import {
    StalkerCategoryItem,
    StalkerContentItem,
    StalkerItvChannel,
    StalkerVodSource,
} from '../../models';
import { StalkerContentTypes } from '../../stalker-content-types';
import { StalkerItvCacheService } from '../../stalker-itv-cache.service';
import { StalkerSessionService } from '../../stalker-session.service';
import {
    ResourceState,
    StalkerContentFeatureStoreContract,
    StalkerContentType,
} from '../stalker-store.contracts';
import {
    executeStalkerRequest,
    buildCategoryPatch,
    filterItvChannelsByGenre,
    getCategoriesByType,
    toStalkerContentItem,
    toStalkerItvChannel,
} from '../utils';

/**
 * Content/categories/channels feature state.
 */
export interface StalkerContentState {
    totalCount: number;
    vodCategories: StalkerCategoryItem[];
    seriesCategories: StalkerCategoryItem[];
    itvCategories: StalkerCategoryItem[];
    radioCategories: StalkerCategoryItem[];
    hasMoreChannels: boolean;
    itvChannels: StalkerItvChannel[];
    radioChannels: StalkerItvChannel[];
    paginatedContent: StalkerContentItem[];
    categoryError: unknown;
    contentError: unknown;
}

const initialContentState: StalkerContentState = {
    totalCount: 0,
    vodCategories: [],
    seriesCategories: [],
    itvCategories: [],
    radioCategories: [],
    hasMoreChannels: false,
    itvChannels: [],
    radioChannels: [],
    paginatedContent: [],
    categoryError: null,
    contentError: null,
};

interface StalkerCategoryResponseItem {
    id?: string | number;
    title?: string;
    censored?: string | number;
}

interface StalkerCategoryResponse {
    js?: StalkerCategoryResponseItem[];
}

interface StalkerOrderedListResponse {
    js?: {
        data?: StalkerVodSource[];
        total_items?: number;
    };
}

interface StalkerContentResourceStoreContract extends StalkerContentFeatureStoreContract {
    categoryResource: ResourceState<StalkerCategoryItem[]>;
    getContentResource: ResourceState<StalkerContentItem[]>;
}

function buildAllCategory(
    contentType: StalkerContentType,
    translateService: TranslateService
): StalkerCategoryItem {
    return {
        category_name: translateService.instant(
            contentType === 'radio'
                ? 'PORTALS.ALL_RADIO'
                : 'PORTALS.ALL_CATEGORIES'
        ),
        category_id: '*',
    };
}

function prependAllCategory(
    contentType: StalkerContentType,
    categories: StalkerCategoryItem[],
    translateService: TranslateService
): StalkerCategoryItem[] {
    const allIndex = categories.findIndex(
        (category) => category.category_name.trim().toLowerCase() === 'all'
    );

    if (allIndex > 0) {
        categories.unshift(categories.splice(allIndex, 1)[0]);
        return categories;
    }

    if (
        allIndex === -1 &&
        categories.length > 0 &&
        !categories.some((category) => String(category.category_id) === '*')
    ) {
        categories.unshift(buildAllCategory(contentType, translateService));
    }

    return categories;
}

function fallbackRadioCategories(
    translateService: TranslateService
): StalkerCategoryItem[] {
    return [buildAllCategory('radio', translateService)];
}

function buildEmptyContentPatch(
    contentType: StalkerContentType,
    error: unknown
): Partial<StalkerContentState> {
    const patch: Partial<StalkerContentState> = {
        totalCount: 0,
        paginatedContent: [],
        contentError: error,
    };

    if (contentType === 'itv' || contentType === 'radio') {
        patch.hasMoreChannels = false;
        if (contentType === 'itv') {
            patch.itvChannels = [];
        } else {
            patch.radioChannels = [];
        }
    }

    return patch;
}

export function withStalkerContent() {
    const logger = createLogger('withStalkerContent');

    return signalStoreFeature(
        withState<StalkerContentState>(initialContentState),
        withProps(
            (
                store,
                dataService = inject(DataService),
                stalkerSession = inject(StalkerSessionService),
                translateService = inject(TranslateService),
                itvCache = inject(StalkerItvCacheService)
            ) => {
                const storeContext = store as typeof store &
                    StalkerContentResourceStoreContract;
                const requestDeps = {
                    dataService,
                    stalkerSession,
                };

                return {
                    categoryResource: resource({
                        params: () => ({
                            contentType: storeContext.selectedContentType(),
                            currentPlaylist: storeContext.currentPlaylist(),
                        }),
                        loader: async ({
                            params,
                        }): Promise<StalkerCategoryItem[]> => {
                            if (!params.currentPlaylist) {
                                patchState(store, { categoryError: null });
                                return [];
                            }

                            const cachedCategories = getCategoriesByType(
                                store,
                                params.contentType
                            );
                            if (cachedCategories.length > 0) {
                                patchState(store, { categoryError: null });
                                return cachedCategories;
                            }

                            try {
                                const response =
                                    await executeStalkerRequest<StalkerCategoryResponse>(
                                        requestDeps,
                                        params.currentPlaylist,
                                        {
                                            action: StalkerContentTypes[
                                                params.contentType
                                            ].getCategoryAction,
                                            type: params.contentType,
                                        }
                                    );

                                if (!Array.isArray(response?.js)) {
                                    const invalidResponseError = new Error(
                                        'Invalid categories response'
                                    );
                                    logger.warn(
                                        'Invalid categories response',
                                        response
                                    );
                                    if (params.contentType === 'radio') {
                                        const fallback =
                                            fallbackRadioCategories(
                                                translateService
                                            );
                                        patchState(store, {
                                            radioCategories: fallback,
                                            categoryError: null,
                                        });
                                        return fallback;
                                    }
                                    patchState(store, {
                                        ...buildCategoryPatch(
                                            params.contentType,
                                            []
                                        ),
                                        categoryError: invalidResponseError,
                                    });
                                    return [];
                                }

                                const normalizedCategories = response.js.map(
                                    (item): StalkerCategoryItem => ({
                                        category_name: item.title ?? '',
                                        category_id: String(item.id),
                                        censored:
                                            item.censored === 1 ||
                                            item.censored === '1',
                                    })
                                );
                                const categories = prependAllCategory(
                                    params.contentType,
                                    params.contentType === 'radio' &&
                                        normalizedCategories.length === 0
                                        ? fallbackRadioCategories(
                                              translateService
                                          )
                                        : normalizedCategories,
                                    translateService
                                );

                                patchState(store, {
                                    ...buildCategoryPatch(
                                        params.contentType,
                                        categories
                                    ),
                                    categoryError: null,
                                });

                                return categories;
                            } catch (error) {
                                logger.warn('Error loading categories', {
                                    contentType: params.contentType,
                                    error,
                                });
                                if (params.contentType === 'radio') {
                                    const fallback =
                                        fallbackRadioCategories(
                                            translateService
                                        );
                                    patchState(store, {
                                        radioCategories: fallback,
                                        categoryError: null,
                                    });
                                    return fallback;
                                }
                                patchState(store, {
                                    ...buildCategoryPatch(
                                        params.contentType,
                                        []
                                    ),
                                    categoryError: error,
                                });
                                return [];
                            }
                        },
                    }),
                    getContentResource: resource({
                        params: () => ({
                            contentType: storeContext.selectedContentType(),
                            category: storeContext.selectedCategoryId(),
                            search: storeContext.searchPhrase(),
                            pageIndex: storeContext.page() + 1,
                            currentPlaylist: storeContext.currentPlaylist(),
                            // Re-fires the loader once THIS portal's full ITV
                            // channel list finishes loading or is refreshed.
                            // Read only for ITV and scoped per-portal so a
                            // different portal's (or a radio/vod) load never
                            // re-fires and re-appends this resource's page.
                            itvCacheVersion:
                                storeContext.selectedContentType() === 'itv'
                                    ? itvCache.versionFor(
                                          storeContext.currentPlaylist()
                                      )
                                    : 0,
                            availableCategoryCount: getCategoriesByType(
                                store,
                                storeContext.selectedContentType()
                            ).filter(
                                (category) =>
                                    String(category.category_id) !== '*'
                            ).length,
                        }),
                        loader: async ({
                            params,
                        }): Promise<StalkerContentItem[]> => {
                            if (!params.category || params.category === '') {
                                patchState(
                                    store,
                                    buildEmptyContentPatch(
                                        params.contentType,
                                        null
                                    )
                                );
                                return [];
                            }

                            if (
                                params.category === '*' &&
                                (params.contentType === 'vod' ||
                                    params.contentType === 'series') &&
                                params.availableCategoryCount === 0
                            ) {
                                patchState(
                                    store,
                                    buildEmptyContentPatch(
                                        params.contentType,
                                        null
                                    )
                                );
                                return [];
                            }

                            const playlist = params.currentPlaylist;
                            if (!playlist?.portalUrl) {
                                patchState(
                                    store,
                                    buildEmptyContentPatch(
                                        params.contentType,
                                        null
                                    )
                                );
                                return [];
                            }

                            const categoryParam = params.category || '*';

                            if (params.contentType === 'itv') {
                                const cachedChannels =
                                    itvCache.getChannels(playlist);
                                const channels =
                                    cachedChannels !== null
                                        ? filterItvChannelsByGenre(
                                              cachedChannels,
                                              categoryParam
                                          )
                                        : null;
                                // Serve from the cache only when it actually
                                // has channels for this genre. Censored (adult)
                                // genres are typically EXCLUDED from
                                // get_all_channels by the portal, so an empty
                                // filter result falls through to the legacy
                                // paged fetch, which still returns them.
                                if (
                                    channels !== null &&
                                    (categoryParam === '*' ||
                                        channels.length > 0)
                                ) {
                                    patchState(store, {
                                        totalCount: channels.length,
                                        paginatedContent: channels,
                                        itvChannels: channels,
                                        hasMoreChannels: false,
                                        contentError: null,
                                    });
                                    return channels;
                                }

                                // Full-list load runs in the background; the
                                // resource re-fires via `itvCacheVersion` once
                                // the cache is ready. Until then the legacy
                                // paged flow below serves the first pages.
                                void itvCache.ensureLoaded(playlist);
                            }

                            const paramsPlaylistKey =
                                params.currentPlaylist?._id ??
                                params.currentPlaylist?.portalUrl ??
                                null;
                            const isCurrentRequest = (): boolean => {
                                const currentPlaylist =
                                    storeContext.currentPlaylist();
                                const currentPlaylistKey =
                                    currentPlaylist?._id ??
                                    currentPlaylist?.portalUrl ??
                                    null;

                                return (
                                    params.contentType ===
                                        storeContext.selectedContentType() &&
                                    params.category ===
                                        storeContext.selectedCategoryId() &&
                                    params.search ===
                                        storeContext.searchPhrase() &&
                                    params.pageIndex ===
                                        storeContext.page() + 1 &&
                                    paramsPlaylistKey === currentPlaylistKey &&
                                    // A legacy paged response must not overwrite
                                    // the full cached list that a re-fired
                                    // loader served in the meantime. Scoped
                                    // per-portal and to ITV so another portal's
                                    // load never invalidates this response.
                                    params.itvCacheVersion ===
                                        (params.contentType === 'itv'
                                            ? itvCache.versionFor(
                                                  currentPlaylist
                                              )
                                            : 0)
                                );
                            };
                            const queryParams: Record<string, string | number> =
                                {
                                    action: StalkerContentTypes[
                                        params.contentType
                                    ].getContentAction,
                                    type: params.contentType,
                                    sortby: 'added',
                                    ...(params.search !== ''
                                        ? { search: params.search }
                                        : {}),
                                    p: params.pageIndex,
                                };

                            if (params.contentType === 'vod') {
                                queryParams['genre'] = '0';
                                queryParams['category'] = categoryParam;
                            } else if (params.contentType === 'series') {
                                queryParams['category'] = categoryParam;
                            } else if (params.contentType === 'itv') {
                                queryParams['category'] = categoryParam;
                                queryParams['genre'] = categoryParam;
                            } else {
                                queryParams['category'] = categoryParam;
                                queryParams['sortby'] = 'number';
                            }

                            try {
                                patchState(store, {
                                    paginatedContent: [],
                                    contentError: null,
                                });

                                const response =
                                    await executeStalkerRequest<StalkerOrderedListResponse>(
                                        requestDeps,
                                        playlist,
                                        queryParams
                                    );

                                if (!isCurrentRequest()) {
                                    return [];
                                }

                                if (!Array.isArray(response?.js?.data)) {
                                    const invalidResponseError = new Error(
                                        'Invalid response structure'
                                    );
                                    logger.warn(
                                        'Invalid response structure',
                                        response
                                    );
                                    patchState(store, {
                                        ...buildEmptyContentPatch(
                                            params.contentType,
                                            invalidResponseError
                                        ),
                                    });
                                    return [];
                                }

                                const newItems = response.js.data.map((item) =>
                                    toStalkerContentItem(
                                        item,
                                        playlist.portalUrl ?? ''
                                    )
                                );

                                if (
                                    params.contentType === 'itv' ||
                                    params.contentType === 'radio'
                                ) {
                                    const channels =
                                        newItems.map(toStalkerItvChannel);
                                    const existingChannels =
                                        params.contentType === 'itv'
                                            ? store.itvChannels()
                                            : store.radioChannels();
                                    const nextChannels =
                                        params.pageIndex === 1
                                            ? channels
                                            : [
                                                  ...existingChannels,
                                                  ...channels,
                                              ];

                                    patchState(store, {
                                        totalCount:
                                            response.js.total_items ?? 0,
                                        paginatedContent: newItems,
                                        contentError: null,
                                        ...(params.contentType === 'itv'
                                            ? { itvChannels: nextChannels }
                                            : { radioChannels: nextChannels }),
                                        hasMoreChannels:
                                            nextChannels.length <
                                            (response.js.total_items ?? 0),
                                    });
                                } else {
                                    patchState(store, {
                                        totalCount:
                                            response.js.total_items ?? 0,
                                        paginatedContent: newItems,
                                        contentError: null,
                                        hasMoreChannels: false,
                                    });
                                }

                                return newItems;
                            } catch (error) {
                                if (!isCurrentRequest()) {
                                    return [];
                                }

                                logger.warn('Error loading content', {
                                    contentType: params.contentType,
                                    category: params.category,
                                    error,
                                });
                                patchState(
                                    store,
                                    buildEmptyContentPatch(
                                        params.contentType,
                                        error
                                    )
                                );
                                return [];
                            }
                        },
                    }),
                };
            }
        )
    );
}
