import {
    getLatestPack,
    findCompatiblePack,
    inferPackTitle,
    ensureArchivePack,
    automateManualConversionForGroup,
    runSequentialBatch
} from './automatedConversion';

describe('automatedConversion utils', () => {
    it('gets latest pack and compatible pack', () => {
        let group = {
            uuid: 'group-a',
            packs: [
                { uuid: 'u1', path: 'latest.pack', format: 'raw' },
                { uuid: 'u1', path: 'older.zip', format: 'archive' }
            ]
        };
        expect(getLatestPack(group).path).toBe('latest.pack');
        expect(findCompatiblePack(group, 'archive').path).toBe('older.zip');
        expect(findCompatiblePack(group, 'fs')).toBeNull();
    });

    it('infers title with fallback to uuid', () => {
        expect(inferPackTitle({
            uuid: 'group-1',
            packs: [{ title: 'My Audio', format: 'raw' }]
        })).toBe('My Audio');

        expect(inferPackTitle({
            uuid: 'group-2',
            packs: [{ title: 'MISSING_PACK_TITLE', format: 'raw' }]
        })).toBe('group-2');
    });

    it('ensures archive by converting latest when needed', async () => {
        let convertMock = jest.fn().mockResolvedValue('converted.zip');
        let archive = await ensureArchivePack({
            uuid: 'g1',
            packs: [{ uuid: 'u1', path: 'a.pack', format: 'raw' }]
        }, convertMock);
        expect(convertMock).toHaveBeenCalledWith('u1', 'a.pack', 'archive');
        expect(archive.path).toBe('converted.zip');
        expect(archive.format).toBe('archive');
    });

    it('runs full manual conversion automation sequence', async () => {
        let calls = [];
        let model = {
            title: 'old',
            _uuid: 'old-uuid',
            getEntryPoint() {
                return {
                    renewUuid: () => {
                        calls.push('renewUuid');
                        model._uuid = 'new-uuid';
                    },
                    getUuid: () => model._uuid
                };
            }
        };

        let deps = {
            convertPackInLibrary: jest
                .fn()
                .mockImplementation((uuid, path, format) => {
                    calls.push(`convert:${uuid}:${path}:${format}`);
                    if (format === 'archive') {
                        return Promise.resolve('source.converted.zip');
                    }
                    return Promise.resolve('target.converted.fs');
                }),
            downloadPackFromLibrary: jest.fn().mockImplementation(() => {
                calls.push('download');
                return Promise.resolve('archive-blob');
            }),
            readFromArchive: jest.fn().mockImplementation(() => {
                calls.push('read');
                return Promise.resolve(model);
            }),
            writeToArchive: jest.fn().mockImplementation(() => {
                calls.push('write');
                return Promise.resolve('new-archive-blob');
            }),
            uploadPackToLibrary: jest.fn().mockImplementation(() => {
                calls.push('upload');
                return Promise.resolve();
            }),
            generateFilename: jest.fn().mockImplementation(() => {
                calls.push('filename');
                return 'new-file.zip';
            }),
            addFromLibrary: jest.fn().mockImplementation(() => {
                calls.push('transfer');
                return Promise.resolve();
            })
        };

        let result = await automateManualConversionForGroup({
            uuid: 'group-1',
            packs: [{ uuid: 'source-uuid', path: 'source.pack', format: 'raw', title: 'My Story' }]
        }, 'fs', deps);

        expect(result.uuid).toBe('new-uuid');
        expect(result.archivePath).toBe('new-file.zip');
        expect(result.convertedPath).toBe('target.converted.fs');
        expect(calls).toEqual([
            'convert:source-uuid:source.pack:archive',
            'download',
            'read',
            'renewUuid',
            'filename',
            'write',
            'upload',
            'convert:new-uuid:new-file.zip:fs'
        ]);
    });

    it('runs sequential batch and keeps processing after failures', async () => {
        let worker = jest.fn().mockImplementation(item => {
            if (item === 'bad') {
                return Promise.reject(new Error('failure'));
            }
            return Promise.resolve(item.toUpperCase());
        });

        let results = await runSequentialBatch(['ok', 'bad', 'later'], worker);
        expect(results).toHaveLength(3);
        expect(results[0].ok).toBe(true);
        expect(results[0].data).toBe('OK');
        expect(results[1].ok).toBe(false);
        expect(results[2].ok).toBe(true);
        expect(results[2].data).toBe('LATER');
    });
});
