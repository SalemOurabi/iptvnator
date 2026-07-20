import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DataService } from '@iptvnator/services';
import { PlaylistMeta } from '@iptvnator/shared/interfaces';
import { StalkerItvCacheService } from './stalker-itv-cache.service';
import { StalkerSessionService } from './stalker-session.service';

jest.mock('@iptvnator/portal/shared/util', () => ({
    createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

const PLAYLIST = {
    _id: 'playlist-1',
    portalUrl: 'http://first.example/stalker_portal/server/load.php',
    macAddress: '00:1A:79:00:00:01',
} as PlaylistMeta;

describe('StalkerItvCacheService portal-scoped reactivity', () => {
    it('does not invalidate one portal reader when another portal becomes ready', async () => {
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: DataService,
                    useValue: {
                        sendIpcEvent: jest.fn().mockResolvedValue({
                            js: {
                                data: [
                                    {
                                        id: '2',
                                        name: 'Other Portal',
                                        cmd: 'ffrt http://other.example/2',
                                    },
                                ],
                                total_items: 1,
                            },
                        }),
                    },
                },
                {
                    provide: StalkerSessionService,
                    useValue: { makeAuthenticatedRequest: jest.fn() },
                },
            ],
        });
        const service = TestBed.inject(StalkerItvCacheService);
        let firstPortalReads = 0;
        const reader = TestBed.runInInjectionContext(() =>
            effect(() => {
                service.getChannels(PLAYLIST);
                firstPortalReads += 1;
            })
        );
        TestBed.flushEffects();
        const initialReads = firstPortalReads;

        await service.ensureLoaded({
            ...PLAYLIST,
            _id: 'playlist-2',
            portalUrl: 'http://other.example/stalker_portal/server/load.php',
        });
        TestBed.flushEffects();

        expect(firstPortalReads).toBe(initialReads);
        reader.destroy();
    });
});
