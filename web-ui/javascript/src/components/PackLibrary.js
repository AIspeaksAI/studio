/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React from 'react';
import { connect } from 'react-redux';
import {withTranslation} from "react-i18next";
import {toast} from "react-toastify";
import uuidv4 from 'uuid/v4';
import { generateFilename } from '../utils/packs';
import { readFromArchive } from '../utils/reader';
import { writeToArchive } from '../utils/writer';

import {
    actionAddFromLibrary,
    actionRemoveFromDevice,
    actionReorderOnDevice,
    actionAddToLibrary,
    actionDownloadFromLibrary,
    actionLoadPackInEditor,
    actionConvertInLibrary,
    actionRemoveFromLibrary,
    actionUploadToLibrary,
    actionCreatePackInEditor,
    actionLoadSampleInEditor,
    setAllowEnriched
} from "../actions";
import {AppContext} from "../AppContext";
import Modal from "./Modal";
import {
    LOCAL_STORAGE_ALLOW_ENRICHED_BINARY_FORMAT
} from "../utils/storage";

import './PackLibrary.css';


class PackLibrary extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            device: {
                metadata: null,
                packs: []
            },
            library: {
                metadata: null,
                packs: []
            },
            showRemoveFromLibraryConfirmDialog: false,
            removingFromLibrary: null,
            showRemoveFromDeviceConfirmDialog: false,
            removingFromDevice: null,
            dragging: null,
            reordering: null,
            beforeReordering: null,
            allowEnrichedDialog: {
                show: false,
                data: null
            },
            confirmConversionDialog: {
                show: false,
                data: null
            },
            selectedLibraryPacks: new Set(),
            converting: false
        };
    }

    componentDidMount() {
        this.setState({
            device: this.props.device,
            library: this.props.library
        });
    }

    componentWillReceiveProps(nextProps, nextContext) {
        console.log(nextProps);
        this.setState({
            device: nextProps.device,
            library: nextProps.library
        });
    }

    onDropPackIntoDevice = (event) => {
        event.preventDefault();
        let packData = event.dataTransfer.getData("local-library-pack");
        if (!packData) {
            // Ignore missing node data
            return;
        }
        var data = JSON.parse(packData);

        // Get the latest pack
        var latestPack = data.packs[0];
        console.log('latest pack: %o', latestPack);
        // Get the latest device-compatible pack
        var compatiblePack = data.packs.find(p => p.format === this.state.device.metadata.driver);
        console.log('device-compatible pack: %o', compatiblePack);

        if (compatiblePack == null) {   // No compatible pack: convert latest pack
            console.log('latest pack must be converted for driver: %s', this.state.device.metadata.driver);
            // Ask for enriched raw format preference
            if (this.state.device.metadata.driver === 'raw' && localStorage.getItem(LOCAL_STORAGE_ALLOW_ENRICHED_BINARY_FORMAT) === null) {
                this.setState({
                    allowEnrichedDialog: {
                        show: true,
                        data: { pack: {...latestPack, format: this.state.device.metadata.driver}, format: this.state.device.metadata.driver, addToDevice: true }
                    }
                });
            } else {
                // Pack is converted and stored in the local library, then transferred to the device
                this.props.convertPackInLibrary(latestPack.uuid, latestPack.path, this.state.device.metadata.driver, this.props.settings.allowEnriched, this.context)
                    .then(path => {
                        this.doAddToDevice({...latestPack, format: this.state.device.metadata.driver}, path);
                    });
            }
        } else if (latestPack.timestamp > compatiblePack.timestamp) {   // Compatible pack is not the latest pack: confirm re-conversion
            // Ask for conversion confirmation
            console.log('pack is out of date. re-convert from latest ?');
            this.setState({
                confirmConversionDialog: {
                    show: true,
                    data: { pack: {...latestPack, format: this.state.device.metadata.driver}, format: this.state.device.metadata.driver }
                }
            });
        } else {
            console.log('OK, transferring pack: %o', compatiblePack);
            // OK, go on and transfer pack
            this.doAddToDevice(compatiblePack, compatiblePack.path);
        }
    };

    doAddToDevice = (data, path) => {
        // Transfer pack and show progress
        this.props.addFromLibrary(data.uuid, path, data.format, this.state.device.metadata.driver, this.context);
    };

    dismissEnrichedDialog = (allow) => {
        return () => {
            this.props.setAllowEnriched(allow);
            // Pack is converted and stored in the local library, then transferred to the device
            this.props.convertPackInLibrary(this.state.allowEnrichedDialog.data.pack.uuid, this.state.allowEnrichedDialog.data.pack.path, this.state.allowEnrichedDialog.data.format, allow, this.context)
                .then(path => {
                    if (this.state.allowEnrichedDialog.data.addToDevice) {
                        return this.doAddToDevice(this.state.allowEnrichedDialog.data.pack, path);
                    }
                })
                .then(() => {
                    this.setState({
                        allowEnrichedDialog: {
                            show: false,
                            data: null
                        }
                    });
                });
        }
    };

    dismissConfirmConversionDialog = (answer) => {
        return () => {
            if (answer) {
                // Pack is converted and stored in the local library, then transferred to the device
                this.props.convertPackInLibrary(this.state.confirmConversionDialog.data.pack.uuid, this.state.confirmConversionDialog.data.pack.path, this.state.confirmConversionDialog.data.format, this.props.settings.allowEnriched, this.context)
                    .then(path => this.doAddToDevice(this.state.confirmConversionDialog.data.pack, path))
                    .then(() => {
                        this.setState({
                            confirmConversionDialog: {
                                show: false,
                                data: null
                            }
                        });
                    });
            } else {
                this.setState({
                    confirmConversionDialog: {
                        show: false,
                        data: null
                    }
                });
            }
        }
    };

    onRemovePackFromDevice = (uuid) => {
        return () => {
            this.setState({removingFromDevice: uuid});
            this.showRemoveFromDeviceConfirmDialog();
        }
    };

    doRemovePackFromDevice = () => {
        this.props.removeFromDevice(this.state.removingFromDevice)
            .finally(() => {
                // Always hide confirmation dialog
                this.dismissRemoveFromDeviceConfirmDialog();
            });
    };

    showRemoveFromDeviceConfirmDialog = () => {
        this.setState({showRemoveFromDeviceConfirmDialog: true});
    };

    dismissRemoveFromDeviceConfirmDialog = () => {
        this.setState({showRemoveFromDeviceConfirmDialog: false});
    };

    getDroppedFile = (event) => {
        let file = null;
        if (event.dataTransfer.items) {
            // Use first file only
            // If dropped items aren't files, reject them
            if (event.dataTransfer.items[0].kind === 'file') {
                file = event.dataTransfer.items[0].getAsFile();
                console.log('Dropped item file name = ' + file.name);
            } else {
                // Ignore non-file item
                return;
            }
        } else {
            // Use first file only
            file = event.dataTransfer.files[0];
            console.log('Dropped file name = ' + file.name);
        }
        return file;
    };

    onDropPackIntoLibrary = (event) => {
        event.preventDefault();
        let packData = event.dataTransfer.getData("device-pack");
        if (!packData) {
            // Handle dropped file
            if (event.dataTransfer.items || event.dataTransfer.files) {
                let file = this.getDroppedFile(event);
                this.addPackToLibrary(file);
            }
            // Otherwise ignore missing node data / file
            return;
        }
        var data = JSON.parse(packData);
        
        // Transfer pack and show progress
        this.props.addToLibrary(data.uuid, this.state.device.metadata.driver, this.context);
    };

    showAddFileSelector = () => {
        document.getElementById('upload').click();
    };

    packAddFileSelected = (event) => {
        let file = event.target.files[0];
        console.log('Selected file name = ' + file.name);
        this.addPackToLibrary(file);
    };

    addPackToLibrary = (file) => {
        const { t } = this.props;
        if (!file) {
            return;
        }
        console.log(file.type);
        if (['application/zip', 'application/x-zip-compressed'].indexOf(file.type) === -1 && !file.name.endsWith('.pack')) {
            toast.error(t('toasts.library.packFileWrongType'));
            return;
        }
        this.props.uploadPackToLibrary(file.name, file);
    };

    onConvertLibraryPack = (pack, format) => {
        return () => {
            if (format === 'raw' && localStorage.getItem(LOCAL_STORAGE_ALLOW_ENRICHED_BINARY_FORMAT) === null) {
                // Ask for enriched raw format preference
                this.setState({
                    allowEnrichedDialog: {
                        show: true,
                        data: { pack, format, addToDevice: false }
                    }
                });
                return;
            }
            // Pack is converted and stored in the local library
            this.props.convertPackInLibrary(pack.uuid, pack.path, format, this.props.settings.allowEnriched, this.context);
        }
    };

    onEditLibraryPack = (pack) => {
        return () => {
            // First, download pack file from library
            this.props.downloadPackFromLibrary(pack.uuid, pack.path)
                .then(packFile => {
                    // Next, load pack into editor
                    this.props.loadPackInEditor(packFile, pack.path);
                });
        }
    };

    onRemovePackFromLibrary = (path) => {
        return () => {
            this.setState({removingFromLibrary: path});
            this.showRemoveFromLibraryConfirmDialog();
        }
    };

    doRemovePackFromLibrary = () => {
        this.props.removeFromLibrary(this.state.removingFromLibrary)
            .finally(() => {
                // Always hide confirmation dialog
                this.dismissRemoveFromLibraryConfirmDialog();
            });
    };

    showRemoveFromLibraryConfirmDialog = () => {
        this.setState({showRemoveFromLibraryConfirmDialog: true});
    };

    dismissRemoveFromLibraryConfirmDialog = () => {
        this.setState({showRemoveFromLibraryConfirmDialog: false});
    };

    isPackDraggable = (pack) => {
        return !pack.official;
    };

    onCreateNewPackInEditor = (e) => {
        e.preventDefault();
        this.props.createPackInEditor();
    };

    onOpenSamplePackInEditor = (e) => {
        e.preventDefault();
        this.props.loadSampleInEditor();
    };

    handleLibraryPackCheckbox = (uuid) => (e) => {
        this.setState(prevState => {
            const selected = new Set(prevState.selectedLibraryPacks);
            if (e.target.checked) {
                selected.add(uuid);
            } else {
                selected.delete(uuid);
            }
            return { selectedLibraryPacks: selected };
        });
    };

    handleSelectAll = () => {
        const allUuids = this.state.library.packs.map(group => group.uuid);
        this.setState({ selectedLibraryPacks: new Set(allUuids) });
    };

    handleUnselectAll = () => {
        this.setState({ selectedLibraryPacks: new Set() });
    };

    handleBatchConvert = async () => {
        const { t } = this.props;
        const { selectedLibraryPacks, library } = this.state;
        if (selectedLibraryPacks.size === 0) {
            toast.info('No stories selected for conversion');
            return;
        }
        this.setState({ converting: true });
        let errors = [];
        for (const uuid of selectedLibraryPacks) {
            try {
                // Find the group and the latest archive/raw pack
                const group = library.packs.find(g => g.uuid === uuid);
                if (!group) throw new Error('Pack group not found for uuid ' + uuid);
                const originalPack = group.packs.find(p => p.format === 'archive') || group.packs[0];
                // 1. Convert to archive (editable) format if not already
                let archivePath = originalPack.format === 'archive' ? originalPack.path : await this.props.convertPackInLibrary(originalPack.uuid, originalPack.path, 'archive', this.props.settings.allowEnriched, this.context);
                // 2. Download the archive pack data
                const resp = await fetch('http://localhost:8080/api/library/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uuid: originalPack.uuid, path: archivePath })
                });
                if (!resp.ok) throw new Error('Failed to download archive pack');
                const blob = await resp.blob();
                // 3. Read and open in editor
                const arrayBuffer = await blob.arrayBuffer();
                const file = new File([arrayBuffer], archivePath);
                const loadedModel = await readFromArchive(file);
                // 4. Generate new UUID and filename, set title
                loadedModel.title = originalPack.title;
                loadedModel.version = (loadedModel.version || 1) + 1;
                if (loadedModel.getEntryPoint && loadedModel.getEntryPoint()) {
                    loadedModel.getEntryPoint().uuid = uuidv4();
                }
                // 5. Save to library (upload)
                const newFilename = generateFilename(loadedModel);
                const newZipBlob = await writeToArchive(loadedModel);
                await this.props.uploadPackToLibrary(loadedModel.getEntryPoint().uuid, newFilename, newZipBlob);
                // 6. Convert to FS format
                await this.props.convertPackInLibrary(loadedModel.getEntryPoint().uuid, newFilename, 'fs', this.props.settings.allowEnriched, this.context);
            } catch (err) {
                console.error('Error converting story pack:', err);
                errors.push(err);
            }
        }
        this.setState({ converting: false });
        if (errors.length === 0) {
            toast.success('All selected stories converted successfully!');
        } else {
            toast.error('Some stories failed to convert. See console for details.');
        }
    };

    render() {
        const { t } = this.props;
        let storagePercentage = null;
        let storageStatus = null;
        if (this.state.device.metadata) {
            storagePercentage = (100.00 * this.state.device.metadata.storage.taken / this.state.device.metadata.storage.size).toFixed(0) ;
            if ( storagePercentage > 90 ) {
                storageStatus = "critical";
            } else if (storagePercentage > 75 ) {
                storageStatus = "warning";
            } else { storageStatus = ""; }
            storagePercentage = storagePercentage + '%';
        }
        let defaultImage = 'data:image/png;base64,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';
        return (
            <div className="pack-library">

                {this.state.showRemoveFromDeviceConfirmDialog &&
                <Modal id="confirm-device-pack-remove"
                       title={t('dialogs.library.removeFromDevice.title')}
                       content={<p>{t('dialogs.library.removeFromDevice.content')}</p>}
                       buttons={[
                           { label: t('dialogs.shared.no'), onClick: this.dismissRemoveFromDeviceConfirmDialog},
                           { label: t('dialogs.shared.yes'), onClick: this.doRemovePackFromDevice}
                       ]}
                       onClose={this.dismissRemoveFromDeviceConfirmDialog}
                />}
                {this.state.showRemoveFromLibraryConfirmDialog &&
                <Modal id="confirm-library-pack-remove"
                       title={t('dialogs.library.removeFromLibrary.title')}
                       content={<p>{t('dialogs.library.removeFromLibrary.content')}</p>}
                       buttons={[
                           { label: t('dialogs.shared.no'), onClick: this.dismissRemoveFromLibraryConfirmDialog},
                           { label: t('dialogs.shared.yes'), onClick: this.doRemovePackFromLibrary}
                       ]}
                       onClose={this.dismissRemoveFromLibraryConfirmDialog}
                />}
                {this.state.allowEnrichedDialog.show &&
                <Modal id="ask-allow-enriched"
                       title={t('dialogs.library.askAllowEnriched.title')}
                       content={<div dangerouslySetInnerHTML={{__html: t('dialogs.library.askAllowEnriched.content')}} ></div>}
                       buttons={[
                           { label: t('dialogs.shared.no'), onClick: this.dismissEnrichedDialog(false)},
                           { label: t('dialogs.shared.yes'), onClick: this.dismissEnrichedDialog(true)}
                       ]}
                       onClose={this.dismissEnrichedDialog(false)}
                />}
                {this.state.confirmConversionDialog.show &&
                <Modal id="ask-confirm-conversion"
                       title={t('dialogs.library.askConfirmConversion.title')}
                       content={<div dangerouslySetInnerHTML={{__html: t('dialogs.library.askConfirmConversion.content')}} ></div>}
                       buttons={[
                           { label: t('dialogs.shared.no'), onClick: this.dismissConfirmConversionDialog(false)},
                           { label: t('dialogs.shared.yes'), onClick: this.dismissConfirmConversionDialog(true)}
                       ]}
                       onClose={this.dismissConfirmConversionDialog(false)}
                />}

                {/* Device view, if plugged */}
                {this.state.device.metadata && <div className="plugged-device">
                    <div className="header">
                        <h4>{t('library.device.title')}</h4>
                        <div className="header-uuid" title={this.state.device.metadata.uuid}><strong>{t('library.device.uuid')}</strong> {this.state.device.metadata.uuid}</div>
                        <div><strong>{t('library.device.serial')}</strong> {this.state.device.metadata.serial || '-'}</div>
                        <div><strong>{t('library.device.firmware')}</strong> {this.state.device.metadata.firmware || '-'}</div>
                        <div><strong>{t('library.device.sdcardsize')}</strong> { (this.state.device.metadata.storage.size / 1073741824 ).toFixed(1) || '-'} {t('library.device.sdcardunit')}</div>
                        <div><strong>{t('library.device.packs.length')}</strong> { this.state.device.packs.length || '-' }</div>
                        {this.state.device.metadata.error && <p><strong>DEVICE HAS ERRORS</strong></p>}
                        <div className="progress">
                            <div className={`progress-bar ${storageStatus}`} role="progressbar" style={{width: storagePercentage}} aria-valuenow={this.state.device.metadata.storage.taken} aria-valuemin="0" aria-valuemax={this.state.device.metadata.storage.size}>{storagePercentage}</div>
                        </div>
                    </div>
                    <div className={`device-dropzone ${this.state.dragging !== null ? 'highlighted-dropzone' : ''}`}
                         onDrop={this.onDropPackIntoDevice}
                         onDragOver={event => { event.preventDefault(); }}
                         onDragLeave={event => {
                             // Get the location of the dropzone
                             var rect = event.target.closest('.device-dropzone').getBoundingClientRect();
                             // Check whether the mouse coordinates are outside the dropzone rectangle
                             if(event.clientX > rect.left + rect.width || event.clientX < rect.left || event.clientY > rect.top + rect.height || event.clientY < rect.top) {
                                 console.log("Reset reorder to beforeReordering: %o", this.state.beforeReordering);
                                 this.setState({
                                     device: {
                                         ...this.state.device,
                                         packs: [...this.state.beforeReordering]
                                     }
                                 });
                             }
                         }}>
                        {this.state.device.packs.length === 0 && <div className="empty">{t('library.device.empty')}</div>}
                        {this.state.device.packs.length > 0 && <div className="pack-grid">
                            {this.state.device.packs.map((pack,idx) =>
                                <div key={pack.uuid}
                                     draggable={true}
                                     className={`pack-tile pack-${pack.format} pack-draggable ${pack.nightModeAvailable && 'pack-night-mode'}`}
                                     onDragStart={event => {
                                         event.dataTransfer.setData("device-pack", JSON.stringify(pack));
                                         this.setState({dragging: "device-pack", reordering: pack, beforeReordering: [...this.state.device.packs]});
                                     }}
                                     onDragEnter={event => {
                                         let data = this.state.reordering;
                                         if (data && data.uuid !== pack.uuid) {
                                             let reordered = this.state.device.packs;
                                             let draggedIndex = reordered.findIndex(p => p.uuid === data.uuid);
                                             if (draggedIndex < idx) {
                                                 // Going down, place dragged item right after the dragged-over pack
                                                 reordered.splice(idx + 1, 0, reordered[draggedIndex]);
                                                 reordered.splice(draggedIndex, 1);
                                             }
                                             if (draggedIndex > idx) {
                                                 // Going up, place dragged item right before the dragged-over pack
                                                 reordered.splice(idx, 0, reordered[draggedIndex]);
                                                 reordered.splice(++draggedIndex, 1);
                                             }
                                             this.setState({
                                                 device: {
                                                     ...this.state.device,
                                                     packs: reordered
                                                 }
                                             });
                                         }
                                     }}
                                     onDragEnd={event => {
                                         // Reorder on device only if order changed
                                         if (this.state.beforeReordering.reduce((acc,p)=>acc+','+p.uuid, '') !== this.state.device.packs.reduce((acc,p)=>acc+','+p.uuid, '')) {
                                             console.log("Order changed, reordering...");
                                             let uuids = this.state.device.packs.map(p => p.uuid);
                                             this.props.reorderOnDevice(uuids);
                                         }
                                         this.setState({dragging: null,  reordering: null});
                                     }}>
                                    <div className="pack-format">
                                        <span>{t(`library.format.${pack.format}`)}</span>
                                    </div>
                                    <div className="pack-thumb" title={pack.nightModeAvailable && t('library.nightMode')}>
                                        <img src={pack.image || defaultImage} alt="" width="128" height="128" draggable={false} />
                                        <div className="pack-version"><span>{`v${pack.version}`}</span></div>
                                        {pack.official && <div className="pack-ribbon"><span>{t('library.official')}</span></div>}
                                    </div>
                                    <div className="pack-title">
                                        <span title={pack.uuid}>{pack.title && pack.title !== "MISSING_PACK_TITLE" ? pack.title : pack.uuid}</span>&nbsp;
                                    </div>
                                    <div className="pack-actions">
                                        <button className="pack-action" onClick={this.onRemovePackFromDevice(pack.uuid)}>
                                            <span className="glyphicon glyphicon-trash"
                                                  title={t('library.device.removePack')} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>}
                    </div>
                </div>}
                {/* Local pack library */}
                {this.state.library && <div className="local-library">
                    <div className="header">
                        <h4>{t('library.local.title')}</h4>
                        {this.state.library.metadata && <div><strong>{t('library.local.path')}</strong> {this.state.library.metadata.path}</div>}
                        <div><strong>{t('library.local.packs.length')}</strong> { this.state.library.packs.length || '-' }</div>
                        <input type="file" id="upload" style={{visibility: 'hidden', position: 'absolute'}} onChange={this.packAddFileSelected} />
                        <span title={t('library.local.addPack')} className="btn btn-default glyphicon glyphicon-import" onClick={this.showAddFileSelector}/>
                        <div className="header-actions-row">
                            <div className="editor-actions">
                                <p><button className="library-action" onClick={this.onCreateNewPackInEditor}>{t('library.local.empty.link1')}</button> <button className="library-action" onClick={this.onOpenSamplePackInEditor}>{t('library.local.empty.link2')}</button> {t('library.local.empty.suffix')}</p>
                            </div>
                            <div className="special-actions">
                                <button className="library-action" onClick={this.handleSelectAll}>{'Select All'}</button>
                                <button className="library-action" onClick={this.handleUnselectAll}>{'Unselect All'}</button>
                                <button className="library-action" onClick={this.handleBatchConvert} disabled={this.state.converting}>{this.state.converting ? 'Converting...' : 'Convert'}</button>
                            </div>
                        </div>
                    </div>
                    <div className={`library-dropzone ${this.state.dragging === 'device-pack' ? 'highlighted-dropzone' : ''}`}
                         onDrop={this.onDropPackIntoLibrary}
                         onDragOver={event => { event.preventDefault(); }}>
                        {this.state.library.packs.length === 0 && <div className="empty">
                            <p>{t('library.local.empty.header')}</p>
                        </div>}
                        {this.state.library.packs.length > 0 && <div className="pack-grid">
                            {this.state.library.packs.map(group =>
                                <div key={group.uuid}
                                     title={group.uuid}
                                     draggable={this.isPackDraggable(group.packs[0])}
                                     className={`pack-tile ${this.isPackDraggable(group.packs[0]) ? 'pack-draggable' : 'pack-not-draggable'} ${group.packs[0].nightModeAvailable && 'pack-night-mode'}`}
                                     onDragStart={event => {
                                         // Drag first pack
                                         event.dataTransfer.setDragImage(event.target.querySelector('.pack-entry'), 0, 0);
                                         event.dataTransfer.setData("local-library-pack", JSON.stringify(group));
                                         this.setState({dragging: "local-library-pack"});
                                     }}
                                     onDragEnd={event => {
                                         this.setState({dragging: null});
                                     }}>
                                    <div className="pack-checkbox-container">
                                        <input type="checkbox" className="pack-checkbox" checked={this.state.selectedLibraryPacks.has(group.uuid)} onChange={this.handleLibraryPackCheckbox(group.uuid)} />
                                    </div>
                                    <div className="pack-left">
                                        <div className="pack-title">
                                            <span>{group.packs[0].title && group.packs[0].title !== "MISSING_PACK_TITLE" ? group.packs[0].title : group.uuid}</span>&nbsp;
                                        </div>
                                        <div className="pack-thumb" title={group.packs[0].nightModeAvailable && t('library.nightMode')}>
                                            <img src={group.packs[0].image || defaultImage} alt="" width="128" height="128" draggable={false} />
                                            {group.packs[0].official && <div className="pack-ribbon"><span>{t('library.official')}</span></div>}
                                        </div>
                                    </div>
                                    <div className="pack-right">
                                        {group.packs.map((p,idx) => {
                                            return <div key={p.path} title={p.path} className={`pack-entry pack-${p.format} ${idx === 0 && 'latest'}`}>
                                                <div className="pack-filename">
                                                    {p.format === 'archive' && <span role="img" aria-label="archive" title={t('library.format.archive')}>&#x1f5dc;</span>}
                                                    {p.format === 'raw' && <span role="img" aria-label="raw" title={t('library.format.raw')}>&#x1f4e6;</span>}
                                                    {p.format === 'fs' && <span role="img" aria-label="fs" title={t('library.format.fs')}>&#x1f4c2;</span>}
                                                    {p.path}
                                                </div>
                                                <div className="pack-version"><span>{`v${p.version}`}</span></div>
                                                <div className="pack-actions">
                                                    {p.format !== 'archive' && <button className="pack-action" onClick={this.onConvertLibraryPack(p, 'archive')}>
                                                        <span role="img" aria-label="to archive" title={t('library.local.convertPackToArchive')}>&#10132;&#x1f5dc;</span>
                                                    </button>}
                                                    {p.format === 'archive' && <>
                                                        <button className="pack-action" onClick={this.onEditLibraryPack(p)}>
                                                            <span className="glyphicon glyphicon-edit" title={t('library.local.editPack')} />
                                                        </button>
                                                        <button className="pack-action" onClick={this.onConvertLibraryPack(p, 'raw')}>
                                                            <span role="img" aria-label="to raw" title={t('library.local.convertPackToRaw')}>&#10132;&#x1f4e6;</span>
                                                        </button>
                                                        <button className="pack-action" onClick={this.onConvertLibraryPack(p, 'fs')}>
                                                            <span role="img" aria-label="to fs" title={t('library.local.convertPackToFs')}>&#10132;&#x1f4c2;</span>
                                                        </button>
                                                    </>}
                                                    <button className="pack-action" onClick={this.onRemovePackFromLibrary(p.path)}>
                                                        <span className="glyphicon glyphicon-trash" title={t('library.local.removePack')} />
                                                    </button>
                                                </div>
                                            </div>;
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>}
                    </div>
                </div>}
            </div>
        );
    }
}

PackLibrary.contextType = AppContext;

const mapStateToProps = (state, ownProps) => ({
    device: state.device,
    library: state.library,
    settings: state.settings
});

const mapDispatchToProps = (dispatch, ownProps) => ({
    addFromLibrary: (uuid, path, format, driver, context) => dispatch(actionAddFromLibrary(uuid, path, format, driver, context, ownProps.t)),
    removeFromDevice: (uuid) => dispatch(actionRemoveFromDevice(uuid, ownProps.t)),
    reorderOnDevice: (uuids) => dispatch(actionReorderOnDevice(uuids, ownProps.t)),
    addToLibrary: (uuid, driver, context) => dispatch(actionAddToLibrary(uuid, driver, context, ownProps.t)),
    downloadPackFromLibrary: (uuid, path) => dispatch(actionDownloadFromLibrary(uuid, path, ownProps.t)),
    loadPackInEditor: (packData, filename) => dispatch(actionLoadPackInEditor(packData, filename, ownProps.t)),
    convertPackInLibrary: (uuid, path, format, allowEnriched, context) => dispatch(actionConvertInLibrary(uuid, path, format, allowEnriched, context, ownProps.t)),
    removeFromLibrary: (path) => dispatch(actionRemoveFromLibrary(path, ownProps.t)),
    uploadPackToLibrary: (path, packData) => dispatch(actionUploadToLibrary(null, path, packData, ownProps.t)),
    createPackInEditor: () => dispatch(actionCreatePackInEditor(ownProps.t)),
    loadSampleInEditor: () => dispatch(actionLoadSampleInEditor(ownProps.t)),
    setAllowEnriched: (allowEnriched) => dispatch(setAllowEnriched(allowEnriched))
});

export default withTranslation()(
    connect(
        mapStateToProps,
        mapDispatchToProps
    )(PackLibrary)
)
