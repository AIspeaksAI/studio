import { actionAddFromLibrary } from './index';
import { addFromLibrary } from '../services/device';

jest.mock('../services/device', () => ({
    fetchDeviceInfos: jest.fn(),
    fetchDevicePacks: jest.fn(),
    addFromLibrary: jest.fn(),
    removeFromDevice: jest.fn(),
    reorderPacks: jest.fn(),
    addToLibrary: jest.fn()
}));

jest.mock('react-toastify', () => {
    const toast = jest.fn(() => 'toast-id');
    toast.update = jest.fn();
    toast.error = jest.fn();
    toast.dismiss = jest.fn();
    toast.TYPE = { SUCCESS: 'success', ERROR: 'error', INFO: 'info' };
    return { toast };
});

describe('actionAddFromLibrary', () => {
    const t = key => key;
    const waitUntil = async (predicate, timeoutMs = 500) => {
        let started = Date.now();
        while (Date.now() - started < timeoutMs) {
            if (predicate()) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        throw new Error('Timed out waiting for condition');
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('waits for transfer done event and unregisters handlers', async () => {
        addFromLibrary.mockResolvedValue({ transferId: 'transfer-1' });

        const handlers = {};
        const eventBus = {
            registerHandler: jest.fn((address, handler) => {
                handlers[address] = handler;
            }),
            unregisterHandler: jest.fn()
        };
        const context = { eventBus };
        const dispatch = jest.fn();

        let promise = actionAddFromLibrary('uuid-1', 'pack.path', 'fs', 'fs', context, t)(dispatch);
        await waitUntil(() =>
            handlers['storyteller.transfer.transfer-1.progress'] &&
            handlers['storyteller.transfer.transfer-1.done']
        );

        expect(handlers['storyteller.transfer.transfer-1.progress']).toBeDefined();
        expect(handlers['storyteller.transfer.transfer-1.done']).toBeDefined();

        handlers['storyteller.transfer.transfer-1.progress'](null, { body: { progress: 0.4 } });
        handlers['storyteller.transfer.transfer-1.done'](null, { body: { success: true } });

        const result = await promise;
        expect(result).toBe(true);
        expect(eventBus.unregisterHandler).toHaveBeenCalledTimes(2);
        expect(eventBus.unregisterHandler).toHaveBeenCalledWith(
            'storyteller.transfer.transfer-1.progress',
            expect.any(Function)
        );
        expect(eventBus.unregisterHandler).toHaveBeenCalledWith(
            'storyteller.transfer.transfer-1.done',
            expect.any(Function)
        );
        expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
    });

    it('returns false when transfer done reports failure', async () => {
        addFromLibrary.mockResolvedValue({ transferId: 'transfer-2' });

        const handlers = {};
        const context = {
            eventBus: {
                registerHandler: jest.fn((address, handler) => {
                    handlers[address] = handler;
                }),
                unregisterHandler: jest.fn()
            }
        };

        let promise = actionAddFromLibrary('uuid-1', 'pack.path', 'fs', 'fs', context, t)(jest.fn());
        await waitUntil(() => handlers['storyteller.transfer.transfer-2.done']);
        handlers['storyteller.transfer.transfer-2.done'](null, { body: { success: false } });

        const result = await promise;
        expect(result).toBe(false);
    });

    it('returns false when no event bus is provided', async () => {
        let result = await actionAddFromLibrary('uuid-1', 'pack.path', 'fs', 'fs', null, t)(jest.fn());
        expect(result).toBe(false);
        expect(addFromLibrary).not.toHaveBeenCalled();
    });

    it('returns false when pack format is not compatible', async () => {
        let result = await actionAddFromLibrary('uuid-1', 'pack.path', 'archive', 'fs', { eventBus: {} }, t)(jest.fn());
        expect(result).toBe(false);
        expect(addFromLibrary).not.toHaveBeenCalled();
    });
});
