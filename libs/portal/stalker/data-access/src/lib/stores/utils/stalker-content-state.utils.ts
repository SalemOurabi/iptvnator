import { StalkerCategoryItem } from '../../models';
import { StalkerContentType } from '../stalker-store.contracts';

export interface StalkerCategorySignals {
    vodCategories(): StalkerCategoryItem[];
    seriesCategories(): StalkerCategoryItem[];
    itvCategories(): StalkerCategoryItem[];
    radioCategories(): StalkerCategoryItem[];
}

export function getCategoriesByType(
    store: StalkerCategorySignals,
    contentType: StalkerContentType
): StalkerCategoryItem[] {
    switch (contentType) {
        case 'vod':
            return store.vodCategories();
        case 'series':
            return store.seriesCategories();
        case 'itv':
            return store.itvCategories();
        case 'radio':
            return store.radioCategories();
    }
}

export function buildCategoryPatch(
    contentType: StalkerContentType,
    categories: StalkerCategoryItem[]
): Partial<StalkerCategoryState> {
    switch (contentType) {
        case 'vod':
            return { vodCategories: categories };
        case 'series':
            return { seriesCategories: categories };
        case 'itv':
            return { itvCategories: categories };
        case 'radio':
            return { radioCategories: categories };
    }
}

interface StalkerCategoryState {
    vodCategories: StalkerCategoryItem[];
    seriesCategories: StalkerCategoryItem[];
    itvCategories: StalkerCategoryItem[];
    radioCategories: StalkerCategoryItem[];
}
