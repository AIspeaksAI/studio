# ManualConversion

This document maps your `%%ManualConvertion%%` clicks to the exact frontend/backend functions currently executed.

## 0) App startup after `studio-windows.bat`

1. `web-ui/src/main/resources/studio-windows.bat` starts Vert.x (`io.vertx.core.Launcher run ...`).
2. `web-ui/src/main/java/studio/webui/MainVerticle.java:101` starts HTTP server on `http://localhost:8080`.
3. `web-ui/src/main/java/studio/webui/MainVerticle.java:84` exposes event bus at `/eventbus/*`.
4. `web-ui/src/main/java/studio/webui/MainVerticle.java:140` and `web-ui/src/main/java/studio/webui/MainVerticle.java:143` mount `/api/device` and `/api/library`.
5. Frontend boot: `web-ui/javascript/src/App.js:59` connects `EventBus('http://localhost:8080/eventbus')`.
6. Frontend registers device/transfer listeners and loads library/device state via Redux actions (`App.js:64`, `App.js:70`).

## 1) CONVERSION: click tile button `to archive` (`➔🗜`)

UI element:
- `web-ui/javascript/src/components/PackLibrary.js:536`

Call sequence:
1. `PackLibrary.onConvertLibraryPack(pack, 'archive')` (`PackLibrary.js:265`).
2. Dispatch `actionConvertInLibrary(uuid, path, format, allowEnriched, ...)` (`PackLibrary.js:582`).
3. `actionConvertInLibrary` calls `convertInLibrary(...)` service (`web-ui/javascript/src/actions/index.js:419`).
4. Service POSTs `/api/library/convert` (`web-ui/javascript/src/services/library.js:46`).
5. Backend route `LibraryController` handles `/convert` (`web-ui/src/main/java/studio/webui/api/LibraryController.java:78`).
6. For archive target, backend calls `LibraryService.addConvertedArchivePackFile(packPath)` (`LibraryController.java:114`, `LibraryService.java:238`).
7. On success, frontend refreshes library (`actions/index.js:433` -> `actionRefreshLibrary` at `actions/index.js:296`).

## 2) CONVERSION: click tile button `Open this story pack in editor`

UI element:
- `web-ui/javascript/src/components/PackLibrary.js:540`

Call sequence:
1. `PackLibrary.onEditLibraryPack(pack)` (`PackLibrary.js:282`).
2. Download archive via `actionDownloadFromLibrary(...)` (`PackLibrary.js:580`, `actions/index.js:312`).
3. Service POST `/api/library/download` (`services/library.js:19`).
4. Backend `/download` returns pack file (`LibraryController.java:47`).
5. Load in editor via `actionLoadPackInEditor(blob, filename)` (`PackLibrary.js:287`, `actions/index.js:349`).
6. `readFromArchive(...)` parses the archive into diagram model (`web-ui/javascript/src/utils/reader.js:17`).
7. Redux sets editor model/filename and switches screen to editor (`actions/index.js:356`, `actions/index.js:358`).

## 3) CONVERSION: popup “Generate a new pack filename?” click `Yes`

Where popup comes from:
1. `#pack-title` blur triggers `checkFilename` (`PackDiagramWidget.js:408`, `PackDiagramWidget.js:71`).
2. If current filename differs from generated one, modal is shown (`PackDiagramWidget.js:74`, modal id `suggest-pack-filename` at `PackDiagramWidget.js:389`).
3. Modal buttons use `btn btn-secondary` in shared `Modal` component (`web-ui/javascript/src/components/Modal.js:34`).
4. Clicking `Yes` calls `useSuggestedFilename` (`PackDiagramWidget.js:397`, `PackDiagramWidget.js:82`).
5. `useSuggestedFilename` renews entry-point UUID and sets new generated filename (`PackDiagramWidget.js:84` to `PackDiagramWidget.js:86`).

Important effect:
- This UUID renewal is what creates a new pack identity (new tile/group in library later), not just a rename.

## 4) CONVERSION: enter audiobook name in `#pack-title`

1. Input change calls `changeTitle` (`PackDiagramWidget.js:408`, function at `PackDiagramWidget.js:56`).
2. Diagram model `title` is updated in memory.
3. On blur, `checkFilename` can suggest regenerating filename again so title+filename stay aligned (`PackDiagramWidget.js:71`).

## 5) CONVERSION: click save icon (`glyphicon-floppy-disk`)

UI element:
- `web-ui/javascript/src/components/diagram/PackEditor.js:199`

Call sequence:
1. `PackEditor.savePackToLibrary()` (`PackEditor.js:96`).
2. If no overwrite conflict, `doSavePackToLibrary()` (`PackEditor.js:103`, `PackEditor.js:107`).
3. Diagram is serialized as archive with `writeToArchive(model)` (`PackEditor.js:114`, `web-ui/javascript/src/utils/writer.js:12`).
4. Dispatch upload `actionUploadToLibrary(uuid, path, blob)` (`PackEditor.js:116`, `actions/index.js:387`).
5. Service POST/XHR upload to `/api/library/upload` (`services/library.js:27`).
6. Backend `/upload` stores file via `LibraryService.addPackFile(...)` (`LibraryController.java:63`, `LibraryController.java:66`, `LibraryService.java:374`).
7. Frontend refreshes library (`actions/index.js:407`).

## 6) CONVERSION: click “Pack library” icon (`glyphicon-film`)

UI element:
- `web-ui/javascript/src/App.js:193`

Call sequence:
1. Click triggers `App.showLibrary()` (`App.js:119`).
2. Dispatch `showLibrary()` action (`App.js:120`, `actions/index.js:565`).
3. UI reducer sets `shown: 'library'` (`web-ui/javascript/src/reducers/ui.js`).
4. App renders `<PackLibrary/>` (`App.js:197`).

## 7) CONVERSION: click new tile button `to fs` (`➔📂`)

UI element:
- `web-ui/javascript/src/components/PackLibrary.js:546`

Call sequence:
1. Same conversion path as step 1, now with `format='fs'`.
2. Backend calls `LibraryService.addConvertedFsPackFile(packPath, allowEnriched)` (`LibraryController.java:102`, `LibraryService.java:306`).
3. Library refresh occurs after success (`actions/index.js:433`).

## 8) TRANSFER: drag new tile (`pack-tile pack-draggable pack-night-mode`) to Lunii dropzone (`pack-grid`)

Drag source:
- Local tile is draggable at `PackLibrary.js:505` and class is built at `PackLibrary.js:506`.
- Drag payload key: `"local-library-pack"` (`PackLibrary.js:510`).

Drop target:
- Device dropzone `onDrop={this.onDropPackIntoDevice}` (`PackLibrary.js:402`, `PackLibrary.js:403`).

Transfer sequence:
1. `onDropPackIntoDevice` parses the dropped pack group (`PackLibrary.js:81` to `PackLibrary.js:84`).
2. It selects latest pack and device-compatible pack (`PackLibrary.js:88` to `PackLibrary.js:93`).
3. If needed, it converts first; otherwise calls `doAddToDevice(...)` (`PackLibrary.js:97` to `PackLibrary.js:130`).
4. `doAddToDevice` dispatches `actionAddFromLibrary(...)` (`PackLibrary.js:132`).
5. Service POST `/api/device/addFromLibrary` (`web-ui/javascript/src/services/device.js:20`).
6. Backend controller route `/addFromLibrary` (`DeviceController.java:65`) calls `storyTellerService.addPack(...)` (`DeviceController.java:70`).
7. Driver upload path:
   - Firmware 1.x: `addPackV1` (`StoryTellerService.java:235`)
   - Firmware 2.x: `addPackV2` (`StoryTellerService.java:294`)
8. Progress and completion are emitted on event bus `storyteller.transfer.<id>.progress/done` (`StoryTellerService.java:259`, `StoryTellerService.java:282`, `StoryTellerService.java:313`, `StoryTellerService.java:330`).
9. Frontend listens and updates toast progress (`actions/index.js:158`, `actions/index.js:165`), then refreshes device list (`actions/index.js:172`).

## Notes specific to your workflow

1. Your manual “convert to fs before transfer” aligns with the drop logic when device driver is `fs`.
2. If a compatible format already exists and is latest, drop transfers directly without reconversion.
3. The “Yes” on filename suggestion is the step that intentionally creates a new UUID/new tile lineage.
