import { animation_duration, animation_easing, characters, event_types, eventSource, getRequestHeaders, this_chid } from '../../../../../script.js';
import { groups, selected_group } from '../../../../group-chats.js';
import { DragAndDropHandler } from '../../../../dragdrop.js';
import { deleteMediaFromServer } from '../../../../chats.js';
import { loadMovingUIState } from '../../../../power-user.js';
import { dragElement } from '../../../../RossAscends-mods.js';
import { clamp, delay, getBase64Async, getFileExtension, getSanitizedFilename, getVideoThumbnail, loadFileToDocument, saveBase64AsFile } from '../../../../utils.js';
import { MEDIA_REQUEST_TYPE, VIDEO_EXTENSIONS } from '../../../../constants.js';
import { Popup } from '../../../../popup.js';

const NAME = 'CardGalleryViewer';
const EXTENSION_PATH = 'scripts/extensions/gallery/';
const PANEL_ID = 'cardGalleryViewer';
const GALLERY_ID = 'cgv--dragGallery';
const isVideo = (url) => VIDEO_EXTENSIONS.some(ext => new RegExp(`.${ext}$`, 'i').test(url));
const SORT = Object.freeze({
    NAME_ASC: { value: 'nameAsc', field: 'name', order: 'asc', label: 'Name (A-Z)' },
    NAME_DESC: { value: 'nameDesc', field: 'name', order: 'desc', label: 'Name (Z-A)' },
    DATE_DESC: { value: 'dateDesc', field: 'date', order: 'desc', label: 'Newest' },
    DATE_ASC: { value: 'dateAsc', field: 'date', order: 'asc', label: 'Oldest' },
});
const defaults = { folders: {}, sort: SORT.DATE_ASC.value };

class CardGalleryViewer {
    constructor() {
        this.loaded = false;
        this.deleteMode = false;
        this.followCurrent = true;
        this.manualTargetKey = '';
        this.currentTargetKey = '';
        this.dragDropHandler = null;
        this.pollTimer = null;
        this.handlers = [];
    }

    init() {
        this.initSettings();
        this.renderTopButton();
        this.startTracking();
    }

    destroy() {
        this.stopTracking();
        this.dragDropHandler?.destroy?.();
        this.destroyNano();
        document.getElementById('cgv--topButton')?.remove();
        document.getElementById(PANEL_ID)?.remove();
    }

    initSettings() {
        const context = SillyTavern.getContext();
        context.extensionSettings.gallery ??= structuredClone(defaults);
        context.extensionSettings.gallery.folders ??= {};
        context.extensionSettings.gallery.sort ??= defaults.sort;
        context.saveSettingsDebounced?.();
    }

    renderTopButton() {
        if (document.getElementById('cgv--topButton')) return;
        const holder = document.getElementById('top-settings-holder');
        if (!holder) return;
        const button = document.createElement('div');
        button.id = 'cgv--topButton';
        button.classList.add('drawer');

        const toggle = document.createElement('div');
        toggle.classList.add('drawer-toggle', 'drawer-header');

        const icon = document.createElement('div');
        icon.id = 'cgv--topButtonIcon';
        icon.classList.add('drawer-icon', 'fa-solid', 'fa-images', 'fa-fw', 'closedIcon', 'interactable');
        icon.title = 'Card Gallery Viewer';
        icon.tabIndex = 0;
        icon.role = 'button';
        icon.addEventListener('click', () => this.toggle());
        icon.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            this.toggle();
        });

        toggle.append(icon);
        button.append(toggle);
        holder.append(button);
    }

    async ensurePanel() {
        if (document.getElementById(PANEL_ID)) return;
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.classList.add('inline-drawer', 'flexGap5');
        panel.innerHTML = `
            <div class="cgv--header">
                <b>Card Gallery</b>
                <div class="cgv--controls">
                    <div id="cardGalleryViewerheader" class="cgv--controlButton drag-grabber"><i class="custom-drawer-icon fa-solid fa-grip"></i></div>
                    <div id="cardGalleryViewerRefresh" class="cgv--controlButton fa-solid fa-rotate" title="Refresh"></div>
                    <div id="cardGalleryViewerClose" class="cgv--controlButton inline-drawer-icon fa-solid fa-circle-xmark" title="Close"></div>
                </div>
            </div>
            <div class="cgv--toolbar">
                <label class="checkbox_label cgv--followLabel">
                    <input class="cgv--follow" type="checkbox" checked>
                    <span>Follow Current</span>
                </label>
                <select class="text_pole cgv--cardSelect"></select>
                <select class="text_pole cgv--sortSelect"></select>
                <button class="menu_button cgv--add"><i class="fa-solid fa-plus"></i> Add</button>
                <button class="menu_button cgv--delete"><i class="fa-solid fa-trash"></i> Delete</button>
                <input class="cgv--file" type="file" accept="image/*,video/*" multiple hidden>
            </div>
            <div class="cgv--folderRow">
                <input class="text_pole cgv--folderInput" placeholder="Folder Name">
                <button class="menu_button cgv--folderApply">Apply</button>
                <button class="menu_button cgv--folderRestore">Restore</button>
            </div>
            <div class="cgv--content"><div id="${GALLERY_ID}"></div></div>`;
        document.getElementById('movingDivs')?.append(panel);
        loadMovingUIState();
        dragElement($(panel));
        this.bindPanel(panel);
        await this.populateTargets();
    }

    bindPanel(panel) {
        panel.querySelector('#cardGalleryViewerClose').addEventListener('click', () => this.hide());
        panel.querySelector('#cardGalleryViewerRefresh').addEventListener('click', () => this.refresh());
        panel.querySelector('.cgv--follow').addEventListener('change', event => { this.followCurrent = event.currentTarget.checked; this.refreshForCurrent(); });
        panel.querySelector('.cgv--cardSelect').addEventListener('change', event => {
            this.followCurrent = false;
            const follow = panel.querySelector('.cgv--follow');
            follow.checked = false;
            this.manualTargetKey = event.target.value;
            this.refresh();
        });
        const sort = panel.querySelector('.cgv--sortSelect');
        Object.values(SORT).forEach(item => sort.append(new Option(item.label, item.value)));
        sort.value = this.getSortOrder();
        sort.addEventListener('change', () => { this.setSortOrder(sort.value); this.refresh(); });
        panel.querySelector('.cgv--add').addEventListener('click', () => panel.querySelector('.cgv--file').click());
        panel.querySelector('.cgv--file').addEventListener('change', async event => {
            const target = this.getSelectedTarget();
            if (!target) return;
            for (const file of Array.from(event.target.files ?? [])) await this.uploadFile(file, target.folder);
            event.target.value = '';
            await this.refresh();
        });
        panel.querySelector('.cgv--delete').addEventListener('click', event => {
            this.deleteMode = !this.deleteMode;
            event.currentTarget.classList.toggle('cgv--deleteActive', this.deleteMode);
        });
        panel.querySelector('.cgv--folderApply').addEventListener('click', async () => this.applyFolder());
        panel.querySelector('.cgv--folderRestore').addEventListener('click', async () => this.restoreFolder());
    }

    async toggle() {
        await this.ensurePanel();
        const panel = $(`#${PANEL_ID}`);
        if (panel.css('display') === 'none') await this.show();
        else this.hide();
    }

    async show() {
        await this.ensurePanel();
        const panel = $(`#${PANEL_ID}`);
        panel.addClass('resizing').css({ display: 'flex', opacity: 0 });
        await this.refreshForCurrent();
        panel.transition({ opacity: 1, duration: animation_duration }, async () => { await delay(50); panel.removeClass('resizing'); });
    }

    hide() {
        const panel = $(`#${PANEL_ID}`);
        panel.addClass('resizing').transition({ opacity: 0, duration: animation_duration }, async () => { await delay(50); panel.removeClass('resizing').hide(); });
    }

    startTracking() {
        if (this.pollTimer) return;
        const refresh = () => this.refreshForCurrent();
        for (const event of [event_types.CHAT_CHANGED, event_types.CHARACTER_PAGE_LOADED, event_types.CHARACTER_EDITED, event_types.CHARACTER_RENAMED, event_types.CHARACTER_DELETED, event_types.CHARACTER_DUPLICATED, 'groupSelected']) {
            eventSource.on(event, refresh);
            this.handlers.push([event, refresh]);
        }
        this.pollTimer = setInterval(() => this.refreshForCurrent(), 500);
    }

    stopTracking() {
        for (const [event, handler] of this.handlers) eventSource.removeListener(event, handler);
        this.handlers = [];
        clearInterval(this.pollTimer);
        this.pollTimer = null;
    }

    async refreshForCurrent() {
        const target = this.getCurrentTarget();
        const key = target?.key ?? '';
        if (key === this.currentTargetKey && !this.followCurrent) return;
        if (key !== this.currentTargetKey) {
            this.currentTargetKey = key;
            await this.populateTargets();
            if (this.followCurrent && $(`#${PANEL_ID}`).is(':visible')) await this.refresh();
        }
    }

    getTargets() {
        const targets = [];
        if (selected_group) {
            const group = groups.find(item => item.id === selected_group);
            targets.push({ key: `group:${selected_group}`, type: 'group', label: `Group: ${group?.name ?? selected_group}`, folder: selected_group });
        }
        characters.forEach((char, index) => targets.push({ key: `char:${index}`, type: 'character', index, label: char.name, avatar: char.avatar, folder: this.getGalleryFolder(char) }));
        return targets;
    }

    getCurrentTarget() {
        if (selected_group) return this.getTargets().find(target => target.key === `group:${selected_group}`);
        if (this_chid !== undefined && characters[this_chid]) return this.getTargets().find(target => target.key === `char:${this_chid}`);
        return null;
    }

    getSelectedTarget() {
        const key = this.followCurrent ? this.getCurrentTarget()?.key : this.manualTargetKey;
        return this.getTargets().find(target => target.key === key) ?? this.getCurrentTarget() ?? this.getTargets()[0];
    }

    async populateTargets() {
        const select = document.querySelector(`#${PANEL_ID} .cgv--cardSelect`);
        if (!select) return;
        const selectedKey = this.getSelectedTarget()?.key ?? '';
        select.innerHTML = '';
        this.getTargets().forEach(target => select.append(new Option(target.label, target.key)));
        select.value = selectedKey;
    }

    async refresh() {
        await this.ensureAssets();
        const target = this.getSelectedTarget();
        const host = document.getElementById(GALLERY_ID);
        if (!target || !host) return;
        document.querySelector(`#${PANEL_ID} .cgv--folderInput`).value = target.folder;
        host.innerHTML = '<div class="cgv--loading">Loading gallery...</div>';
        this.dragDropHandler?.destroy?.();
        this.destroyNano();
        const items = await this.getGalleryItems(target.folder);
        host.innerHTML = items.length ? '' : '<div class="cgv--empty">No images or videos in this gallery.</div>';
        if (items.length) await this.initGallery(items, target.folder);
    }

    async ensureAssets() {
        if (this.loaded) return;
        await loadFileToDocument(`${EXTENSION_PATH}nanogallery2.woff.min.css`, 'css');
        await loadFileToDocument(`${EXTENSION_PATH}jquery.nanogallery2.min.js`, 'js');
        this.loaded = true;
    }

    destroyNano() {
        try { $(`#${GALLERY_ID}`).nanogallery2?.('destroy'); } catch { /* noop */ }
    }

    async initGallery(items, folder) {
        const gallery = $(`#${GALLERY_ID}`);
        const thumbnailHeight = 150;
        gallery.nanogallery2({
            items,
            thumbnailWidth: 'auto',
            thumbnailHeight,
            galleryMaxRows: clamp(Math.floor((window.innerHeight * 0.85 - 120) / thumbnailHeight), 1, 10),
            galleryDisplayMode: 'pagination',
            galleryPaginationMode: 'rectangles',
            galleryNavigationOverlayButtons: true,
            galleryPaginationTopButtons: false,
            fnThumbnailOpen: items => this.onThumbnailOpen(items),
            fnThumbnailInit: ($thumbnail, item) => item?.src && $thumbnail.attr('title', String(item.src).split('/').pop()),
        });
        this.dragDropHandler = new DragAndDropHandler(`#${GALLERY_ID}`, async files => {
            for (const file of Array.from(files ?? [])) await this.uploadFile(file, folder);
            await this.refresh();
        });
        await delay(100);
        gallery.css('height', 'unset');
        gallery.nanogallery2('resize');
    }

    async getGalleryItems(folder) {
        const sort = Object.values(SORT).find(item => item.value === this.getSortOrder()) ?? SORT.DATE_ASC;
        const response = await fetch('/api/images/list', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ folder, sortField: sort.field, sortOrder: sort.order, type: MEDIA_REQUEST_TYPE.IMAGE | MEDIA_REQUEST_TYPE.VIDEO }) });
        const sanitized = await getSanitizedFilename(folder);
        const files = await response.json();
        return Promise.all(files.map(async file => {
            const item = { src: `user/images/${sanitized}/${file}`, srct: `user/images/${sanitized}/${file}`, title: '' };
            if (isVideo(file)) item.srct = await getVideoThumbnail(item.src, 225, 225).catch(() => item.src);
            return item;
        }));
    }

    getGalleryFolder(char) {
        return SillyTavern.getContext().extensionSettings.gallery.folders[char?.avatar] ?? char?.name;
    }

    getSortOrder() { return SillyTavern.getContext().extensionSettings.gallery.sort ?? defaults.sort; }
    setSortOrder(order) { SillyTavern.getContext().extensionSettings.gallery.sort = order; SillyTavern.getContext().saveSettingsDebounced(); }

    async uploadFile(file, folder) {
        const fileBase64 = await getBase64Async(file);
        const path = await saveBase64AsFile(fileBase64.split(',')[1], folder, '', getFileExtension(file));
        toastr.success(`File uploaded successfully. Saved at: ${path}`);
    }

    async applyFolder() {
        const target = this.getSelectedTarget();
        if (!target || target.type !== 'character') return toastr.warning('Folder overrides are only available for characters.');
        const folder = await getSanitizedFilename(document.querySelector(`#${PANEL_ID} .cgv--folderInput`).value);
        const context = SillyTavern.getContext();
        const char = characters[target.index];
        if (folder === char.name) delete context.extensionSettings.gallery.folders[char.avatar];
        else context.extensionSettings.gallery.folders[char.avatar] = folder;
        context.saveSettingsDebounced();
        await this.populateTargets();
        await this.refresh();
    }

    async restoreFolder() {
        const target = this.getSelectedTarget();
        if (!target || target.type !== 'character') return toastr.warning('Folder overrides are only available for characters.');
        delete SillyTavern.getContext().extensionSettings.gallery.folders[characters[target.index].avatar];
        SillyTavern.getContext().saveSettingsDebounced();
        await this.populateTargets();
        await this.refresh();
    }

    onThumbnailOpen(items) {
        const url = items?.[0]?.responsiveURL?.();
        if (!url) return;
        if (this.deleteMode) {
            Popup.show.confirm('Are you sure you want to delete this image?', url).then(async confirmed => {
                if (!confirmed) return;
                if (await deleteMediaFromServer(url, false)) toastr.success('Image deleted successfully.');
                await this.refresh();
            });
            return;
        }
        this.makeDragMedia(url);
    }

    makeDragMedia(url) {
        const template = document.getElementById('generic_draggable_template');
        if (!(template instanceof HTMLTemplateElement)) return;
        const fragment = document.importNode(template.content, true);
        const draggable = fragment.querySelector('.draggable');
        const media = isVideo(url) ? document.createElement('video') : document.createElement('img');
        media.src = url;
        if (media instanceof HTMLVideoElement) { media.controls = true; media.autoplay = true; }
        const base = String(url.split('/').pop()).replace(/\.[^.]+$/, '').replace(/\W/g, '');
        let id = `cgv-media-${base}`;
        for (let i = 1; document.getElementById(id); i++) id = `cgv-media-${base}-${i}`;
        draggable.id = id;
        draggable.classList.add('galleryImageDraggable');
        draggable.style.display = 'block';
        draggable.style.padding = '0';
        draggable.append(media);
        draggable.querySelector('.dragClose').dataset.relatedId = id;
        draggable.querySelector('.drag-grabber').id = `${id}header`;
        document.getElementById('movingDivs').append(fragment);
        loadMovingUIState();
        dragElement($(`#${id}`));
        $(`#${id} img`).on('dragstart', event => { event.preventDefault(); return false; });
    }
}

let app = null;
const init = () => { if (!app) { app = new CardGalleryViewer(); app.init(); window.CardGalleryViewer = app; } };
const destroy = () => { app?.destroy(); app = null; delete window.CardGalleryViewer; };

export function onActivate() { init(); }
export function onEnable() { init(); }
export function onDisable() { destroy(); }
export function onDelete() { destroy(); }

init();
