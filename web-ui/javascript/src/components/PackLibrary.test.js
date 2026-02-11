import { toast } from 'react-toastify';
import { PackLibrary } from './PackLibrary';

jest.mock('react-toastify', () => {
    const toast = jest.fn();
    toast.info = jest.fn();
    toast.error = jest.fn();
    toast.success = jest.fn();
    return { toast };
});

describe('PackLibrary batch automation', () => {
    const createComponent = (overrides = {}) => {
        const props = {
            t: k => k,
            device: { metadata: null, packs: [] },
            library: { metadata: null, packs: [] },
            settings: { allowEnriched: false },
            convertPackInLibrary: jest.fn(),
            downloadPackFromLibrary: jest.fn(),
            uploadPackToLibrary: jest.fn(),
            addFromLibrary: jest.fn(),
            removeFromDevice: jest.fn(),
            reorderOnDevice: jest.fn(),
            addToLibrary: jest.fn(),
            loadPackInEditor: jest.fn(),
            removeFromLibrary: jest.fn(),
            createPackInEditor: jest.fn(),
            loadSampleInEditor: jest.fn(),
            setAllowEnriched: jest.fn(),
            ...overrides
        };
        const cmp = new PackLibrary(props);
        cmp.context = { eventBus: {} };
        cmp.setState = (update) => {
            const patch = typeof update === 'function' ? update(cmp.state, cmp.props) : update;
            cmp.state = { ...cmp.state, ...patch };
        };
        return cmp;
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('toggles tile selection', () => {
        const cmp = createComponent({
            library: {
                metadata: null,
                packs: [{ uuid: 'g1', packs: [{ format: 'raw', title: 'A' }] }]
            }
        });
        cmp.state.library = cmp.props.library;

        cmp.togglePackSelection('g1')({ stopPropagation: jest.fn() });
        expect(cmp.state.selectedPackUuids.g1).toBe(true);

        cmp.togglePackSelection('g1')({ stopPropagation: jest.fn() });
        expect(cmp.state.selectedPackUuids.g1).toBe(false);
    });

    it('runs batch conversion for selected groups and stores successful results', async () => {
        const groups = [
            { uuid: 'g1', packs: [{ uuid: 'u1', path: 'a.pack', format: 'raw', title: 'A' }] },
            { uuid: 'g2', packs: [{ uuid: 'u2', path: 'b.pack', format: 'raw', title: 'B' }] }
        ];
        const cmp = createComponent({
            device: { metadata: { driver: 'fs' }, packs: [] },
            library: { metadata: null, packs: groups }
        });
        cmp.state.device = cmp.props.device;
        cmp.state.library = cmp.props.library;
        cmp.state.selectedPackUuids = { g1: true, g2: true };

        cmp.runAutomatedConversionForGroup = jest
            .fn()
            .mockResolvedValueOnce({ uuid: 'new-1', convertedPath: 'one.fs' })
            .mockRejectedValueOnce(new Error('conversion failed'));

        await cmp.onBatchConversion();

        expect(cmp.runAutomatedConversionForGroup).toHaveBeenCalledTimes(2);
        expect(cmp.state.batchResults.g1.convertedPath).toBe('one.fs');
        expect(cmp.state.batchResults.g2).toBeUndefined();
        expect(toast.error).toHaveBeenCalled();
    });

    it('blocks batch transfer when no device is connected', async () => {
        const cmp = createComponent({
            library: { metadata: null, packs: [{ uuid: 'g1', packs: [{ uuid: 'u1', format: 'raw' }] }] }
        });
        cmp.state.library = cmp.props.library;
        cmp.state.selectedPackUuids = { g1: true };

        await cmp.onBatchTransfer();
        expect(toast.error).toHaveBeenCalledWith('No Lunii device connected.');
    });

    it('runs batch transfer only for converted selected groups', async () => {
        const cmp = createComponent({
            device: { metadata: { driver: 'fs' }, packs: [] },
            library: { metadata: null, packs: [{ uuid: 'g1', packs: [{ uuid: 'u1', format: 'raw' }] }] },
            addFromLibrary: jest.fn().mockResolvedValue(true)
        });
        cmp.state.device = cmp.props.device;
        cmp.state.library = cmp.props.library;
        cmp.state.selectedPackUuids = { g1: true };
        cmp.state.batchResults = {
            g1: {
                uuid: 'new-g1',
                convertedPath: 'g1.converted'
            }
        };

        await cmp.onBatchTransfer();

        expect(cmp.props.addFromLibrary).toHaveBeenCalledWith(
            'new-g1',
            'g1.converted',
            'fs',
            'fs',
            cmp.context
        );
        expect(toast.success).toHaveBeenCalled();
    });
});
