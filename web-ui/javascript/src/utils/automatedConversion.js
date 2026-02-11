/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export function getLatestPack(group) {
    return (group && group.packs && group.packs.length > 0) ? group.packs[0] : null;
}

export function findCompatiblePack(group, driver) {
    if (!group || !group.packs) {
        return null;
    }
    return group.packs.find(p => p.format === driver) || null;
}

export function inferPackTitle(group) {
    let latest = getLatestPack(group);
    if (latest && latest.title && latest.title !== "MISSING_PACK_TITLE") {
        return latest.title;
    }
    return (group && group.uuid) ? group.uuid : '';
}

export async function ensureArchivePack(group, convertPackInLibrary) {
    let latest = getLatestPack(group);
    if (!latest) {
        throw new Error('Pack group is empty');
    }
    if (latest.format === 'archive') {
        return latest;
    }
    let archivePath = await convertPackInLibrary(latest.uuid, latest.path, 'archive');
    if (!archivePath) {
        throw new Error('Archive conversion did not return a destination path');
    }
    return {
        ...latest,
        format: 'archive',
        path: archivePath
    };
}

export async function automateManualConversionForGroup(group, driver, deps, options = {}) {
    if (!driver) {
        throw new Error('Device driver is required');
    }
    let title = (options.title || inferPackTitle(group));
    let archivePack = await ensureArchivePack(group, deps.convertPackInLibrary);
    let archiveFile = await deps.downloadPackFromLibrary(archivePack.uuid, archivePack.path);
    let model = await deps.readFromArchive(archiveFile);

    model.title = title;
    model.getEntryPoint().renewUuid();

    let newUuid = model.getEntryPoint().getUuid();
    let newArchivePath = deps.generateFilename(model);
    let newArchiveFile = await deps.writeToArchive(model);

    await deps.uploadPackToLibrary(newArchivePath, newArchiveFile);
    let convertedPath = await deps.convertPackInLibrary(newUuid, newArchivePath, driver);
    if (!convertedPath) {
        throw new Error('Target conversion did not return a destination path');
    }

    if (options.transferToDevice) {
        await deps.addFromLibrary(newUuid, convertedPath, driver);
    }

    return {
        sourceUuid: group.uuid,
        sourcePath: archivePack.path,
        uuid: newUuid,
        title,
        archivePath: newArchivePath,
        convertedPath,
        driver
    };
}

export async function runSequentialBatch(items, worker) {
    let results = [];
    for (let item of items) {
        try {
            let data = await worker(item);
            results.push({ ok: true, item, data });
        } catch (error) {
            results.push({ ok: false, item, error });
        }
    }
    return results;
}
