# AutomatedConversion

Implementation plan to automate your `%%ManualConvertion%%` end-to-end, then extend it to batch mode with checkboxes plus `Batch CONVERSION` and `Batch TRANSFER`.

## Scope

1. Preserve current backend APIs where possible.
2. Automate the current manual flow: archive conversion, editor-equivalent UUID/title/filename update, save, FS conversion, transfer.
3. Add batch UX in library view, with buttons placed after:
   - `<p><button class="library-action">Create a new story pack</button> <button class="library-action">or view an example pack</button> ...</p>`
   - Current location: `web-ui/javascript/src/components/PackLibrary.js:492`.

## Existing constraints to account for

1. Device transfer uses async event bus completion, but current `actionAddFromLibrary` resolves before transfer `done` event (`web-ui/javascript/src/actions/index.js:141`).
2. Device operations are mutex-protected with short timeout (`actions/index.js` mutex), so concurrent batch transfer calls will hit `device busy`.
3. The manual “new tile” effect comes from `renewUuid()` in filename suggestion path (`PackDiagramWidget.js:82`), so automation must explicitly renew UUID.
4. Transfer compatibility depends on `device.metadata.driver` (`raw` vs `fs`) and dropped pack group logic (`PackLibrary.js:88` to `PackLibrary.js:126`).

## Phase 1: Single-pack full automation (no manual clicks)

Target: one-click “do my manual conversion + transfer” for one tile.

### A. Add orchestration helpers in `PackLibrary`

File: `web-ui/javascript/src/components/PackLibrary.js`

1. `ensureArchivePack(group)`:
   - If archive exists in `group.packs`, return it.
   - Else convert latest to archive via existing `convertPackInLibrary(...)`.
2. `cloneArchiveWithNewIdentityAndTitle(archivePack, newTitle)`:
   - Download archive (`downloadPackFromLibrary`).
   - Parse with `readFromArchive` (`utils/reader.js`).
   - Apply:
     - `model.getEntryPoint().renewUuid()`
     - `model.title = newTitle`
   - Build filename with `generateFilename(model)` (`utils/packs.js`).
   - Serialize with `writeToArchive(model)` (`utils/writer.js`).
   - Upload via `uploadPackToLibrary(uuid, filename, blob)`.
   - Return `{ uuid, archivePath: filename }`.
3. `convertArchiveToDeviceFormat(uuid, archivePath)`:
   - Call existing `convertPackInLibrary(uuid, archivePath, driver, allowEnriched, context)`.
4. `addFromLibraryAndWait(uuid, path, format)`:
   - Replace/extend current transfer action so Promise resolves on `storyteller.transfer.<id>.done`, not immediately after `/addFromLibrary` response.
   - Unregister progress/done handlers when complete.

### B. Single automation pipeline

For one selected tile/group:
1. `archivePack = await ensureArchivePack(group)`
2. `{uuid, archivePath} = await cloneArchiveWithNewIdentityAndTitle(archivePack, inferredTitle)`
3. `convertedPath = await convertArchiveToDeviceFormat(uuid, archivePath)`
4. `await addFromLibraryAndWait(uuid, convertedPath, deviceDriver)`

`inferredTitle` source:
1. Prefer `group.packs[0].title`.
2. Fallback to `group.uuid`.

## Phase 2: Batch queue UX and execution

## UI changes

File: `web-ui/javascript/src/components/PackLibrary.js`

1. Add checkbox per local-library tile (group-level selection):
   - State: `selectedPackUuids: Set<string>`.
   - Only for non-official/allowed draggable packs.
2. Add buttons right after existing two `library-action` buttons at `PackLibrary.js:492`:
   - `Batch CONVERSION`
   - `Batch TRANSFER`
3. Add running/disabled states:
   - Disable while batch job active.
   - Disable transfer if no device plugged.
   - Disable both if nothing selected.

## Batch CONVERSION behavior

Sequentially process each checked tile:
1. Ensure archive source pack.
2. Clone archive with new UUID/title.
3. Convert cloned archive to device driver format (`fs` for your current flow).
4. Store result in `batchResults[originalGroupUuid] = {newUuid, archivePath, convertedPath, status}`.

Output of this button:
1. Selected audiobooks become conversion-ready.
2. No transfer yet.

## Batch TRANSFER behavior

Sequentially process each checked tile:
1. Resolve transfer candidate:
   - Prefer `batchResults[groupUuid].convertedPath` if available.
   - Else locate latest compatible pack in library group.
2. Call `addFromLibraryAndWait(...)` and await completion before next item.
3. Refresh device list at end.

## Why sequential, not parallel

1. Device operations are mutex-guarded and progress-based.
2. Current driver/event bus model is single-transfer oriented.
3. Sequential avoids `device busy`, race conditions, and out-of-order progress handling.

## Required code refactors for robustness

1. Refactor transfer action to be awaitable to `done` event.
2. Unregister event bus handlers after each transfer completion/failure.
3. Extract shared “compatible pack resolution” logic from drag-drop path (`PackLibrary.onDropPackIntoDevice`) into reusable helper.
4. Centralize toast messaging for batch item status and final summary.

## Suggested implementation order

1. Add awaitable transfer helper/action.
2. Implement single-pack automation pipeline and validate against one tile.
3. Add checkbox selection state and rendering.
4. Add `Batch CONVERSION` orchestration.
5. Add `Batch TRANSFER` orchestration.
6. Add edge-case handling:
   - missing title
   - conversion failure mid-batch
   - device unplug during transfer
   - already-existing destination pack
7. Validate with mixed-format test set (archive/raw/fs).

## Validation checklist

1. New automated pack gets new UUID and appears as new tile group.
2. Title in new tile matches expected audiobook name.
3. Converted format matches `device.metadata.driver`.
4. Batch conversion processes only checked tiles.
5. Batch transfer processes only checked + converted tiles.
6. No `device busy` errors in normal batch run.
7. Progress and final status are visible per item and globally.
