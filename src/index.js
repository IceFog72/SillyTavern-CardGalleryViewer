import { animation_duration, animation_easing, characters, event_types, eventSource, getRequestHeaders, this_chid, getOneCharacter, getThumbnailUrl, printCharacters, select_selected_character, unshallowCharacter } from '../../../../../script.js';
import { groups, selected_group } from '../../../../group-chats.js';
import { deleteMediaFromServer } from '../../../../chats.js';
import { loadMovingUIState, power_user } from '../../../../power-user.js';
import { dragElement } from '../../../../RossAscends-mods.js';
import { clamp, delay, getBase64Async, getFileExtension, getSanitizedFilename, getVideoThumbnail, loadFileToDocument, saveBase64AsFile } from '../../../../utils.js';
import { MEDIA_REQUEST_TYPE, VIDEO_EXTENSIONS } from '../../../../constants.js';
import { POPUP_TYPE, Popup } from '../../../../popup.js';

const NAME = 'CardGalleryViewer';
const EXTENSION_PATH = 'scripts/extensions/gallery/';
const PANEL_ID = 'cardGalleryViewer';
const GALLERY_ID = 'cgv--dragGallery';
const isVideo = (url) => VIDEO_EXTENSIONS.some(ext => new RegExp(`.${ext}$`, 'i').test(url));
const getNanoJquery = () => (typeof window.jQuery?.fn?.nanogallery2 === 'function' ? window.jQuery : $);
const getUrlExtension = (url) => String(url).split('?')[0].split('#')[0].split('.').pop()?.toLowerCase().trim() || 'png';
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
        this.dropAbortController = null;
        this.pollTimer = null;
        this.handlers = [];
    }

    init() {
        this.initSettings();
        this.renderTopButton();
        this.ensurePanel();
        this.startTracking();
    }

    destroy() {
        this.stopTracking();
        this.destroyDropHandler();
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
        panel.classList.add('drawer-content', 'flexGap5');
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
                <button class="menu_button cgv--add" title="Add"><i class="fa-solid fa-plus"></i> <span class="cgv--buttonLabel">Add</span></button>
                <button class="menu_button cgv--delete" title="Delete mode"><i class="fa-solid fa-trash"></i> <span class="cgv--buttonLabel cgv--deleteLabel">Delete</span></button>
                <input class="cgv--file" type="file" accept="image/*,video/*" multiple hidden>
            </div>
            <div class="cgv--deleteBanner">Delete mode active — click an image to delete it.</div>
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
            this.updateDeleteMode(event.currentTarget);
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

    updateDeleteMode(button = document.querySelector(`#${PANEL_ID} .cgv--delete`)) {
        const panel = document.getElementById(PANEL_ID);
        const deleteLabel = panel?.querySelector('.cgv--deleteLabel');
        button?.classList.toggle('cgv--deleteActive', this.deleteMode);
        panel?.classList.toggle('cgv--deleteMode', this.deleteMode);
        if (deleteLabel) deleteLabel.textContent = 'Delete';
    }

    async refresh() {
        await this.ensureAssets();
        const target = this.getSelectedTarget();
        const host = document.getElementById(GALLERY_ID);
        if (!target || !host) return;
        document.querySelector(`#${PANEL_ID} .cgv--folderInput`).value = target.folder;
        host.classList.remove('cgv--emptyDropZone');
        host.innerHTML = '<div class="cgv--loading">Loading gallery...</div>';
        this.destroyDropHandler();
        this.destroyNano();
        const items = await this.getGalleryItems(target.folder);
        host.innerHTML = items.length ? '' : '<div class="cgv--empty">No images or videos in this gallery.<br>Drop files here or click Add.</div>';
        host.classList.toggle('cgv--emptyDropZone', !items.length);
        this.bindDropHandler(target.folder);
        if (items.length) await this.initGallery(items, target.folder);
    }

    async ensureAssets() {
        if (this.loaded && typeof getNanoJquery().fn.nanogallery2 === 'function') return;
        if (this.loadingPromise) return this.loadingPromise;

        this.loadingPromise = (async () => {
            try {
                if (typeof getNanoJquery().fn.nanogallery2 !== 'function') {
                    await loadFileToDocument(`${EXTENSION_PATH}nanogallery2.woff.min.css`, 'css');
                    await this.loadNanogalleryScript();
                }
                if (typeof getNanoJquery().fn.nanogallery2 !== 'function') throw new Error('Failed to load nanogallery2.');
                this.loaded = true;
            } finally {
                this.loadingPromise = null;
            }
        })();

        return this.loadingPromise;
    }

    loadNanogalleryScript() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const define = window.define;
            script.src = `${EXTENSION_PATH}jquery.nanogallery2.min.js`;
            script.onload = () => { window.define = define; resolve(); };
            script.onerror = event => { window.define = define; reject(event); };
            window.define = undefined;
            document.body.append(script);
        });
    }

    destroyNano() {
        try { getNanoJquery()(`#${GALLERY_ID}`).nanogallery2?.('destroy'); } catch { /* noop */ }
    }

    destroyDropHandler() {
        this.dropAbortController?.abort();
        this.dropAbortController = null;
        document.getElementById(GALLERY_ID)?.classList.remove('drop_target', 'dragover');
    }

    bindDropHandler(folder) {
        this.destroyDropHandler();
        const host = document.getElementById(GALLERY_ID);
        if (!host) return;
        this.dropAbortController = new AbortController();
        const { signal } = this.dropAbortController;
        const stop = event => {
            event.preventDefault();
            event.stopPropagation();
        };
        host.classList.add('drop_target');
        host.addEventListener('dragover', event => { stop(event); host.classList.add('dragover'); }, { signal });
        host.addEventListener('dragleave', event => { stop(event); host.classList.remove('dragover'); }, { signal });
        host.addEventListener('drop', async event => {
            stop(event);
            host.classList.remove('dragover');
            const files = Array.from(event.dataTransfer?.files ?? []);
            for (const file of files) await this.uploadFile(file, folder);
            if (files.length) await this.refresh();
        }, { signal });
    }

    async initGallery(items, folder) {
        const gallery = getNanoJquery()(`#${GALLERY_ID}`);
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
            fnThumbnailInit: ($thumbnail, item) => {
                if (item?.src) {
                    $thumbnail.attr('title', String(item.src).split('/').pop());
                    $thumbnail.on('contextmenu', (event) => {
                        event.preventDefault();
                        this.showContextMenu(event, item.src, folder);
                    });
                }
            },
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

    showContextMenu(event, imageUrl, folder) {
        // Remove any existing menu
        document.getElementById('cgv--context-menu')?.remove();

        const menu = document.createElement('div');
        menu.id = 'cgv--context-menu';
        menu.className = 'cgv--contextMenu';

        // Check if character avatar replacement is allowed (only for character, not group)
        const target = this.getSelectedTarget();
        const isChar = target && target.type === 'character';
        const isGroup = selected_group;

        // "Replace avatar" option
        const replaceOption = document.createElement('button');
        replaceOption.className = 'cgv--contextMenu-item';
        replaceOption.innerHTML = '<i class="fa-solid fa-user-tie"></i> <span>Set as Avatar</span>';
        if (isGroup || !isChar || this_chid === undefined || !characters[this_chid]) {
            replaceOption.classList.add('disabled');
            replaceOption.title = "Only available for characters, not groups.";
        } else {
            replaceOption.addEventListener('click', () => {
                menu.remove();
                this.replaceCurrentCharacterAvatar(imageUrl);
            });
        }
        menu.appendChild(replaceOption);

        // "Rename" option
        const renameOption = document.createElement('button');
        renameOption.className = 'cgv--contextMenu-item';
        renameOption.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> <span>Rename</span>';
        renameOption.addEventListener('click', () => {
            menu.remove();
            this.renameGalleryItem(imageUrl, folder);
        });
        menu.appendChild(renameOption);

        // "Delete" option
        const deleteOption = document.createElement('button');
        deleteOption.className = 'cgv--contextMenu-item danger';
        deleteOption.innerHTML = '<i class="fa-solid fa-trash"></i> <span>Delete</span>';
        deleteOption.addEventListener('click', () => {
            menu.remove();
            this.deleteGalleryItem(imageUrl);
        });
        menu.appendChild(deleteOption);

        // Append to DOM
        document.body.appendChild(menu);

        // Position menu inside viewport
        const menuWidth = 190;
        const menuHeight = 120;
        const posX = Math.min(event.clientX, window.innerWidth - menuWidth - 10);
        const posY = Math.min(event.clientY, window.innerHeight - menuHeight - 10);
        menu.style.left = `${posX}px`;
        menu.style.top = `${posY}px`;

        // Handle closing
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('contextmenu', closeMenu);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu);
            document.addEventListener('contextmenu', closeMenu);
        }, 50);
    }

    refreshAvatarImageSources(avatarKey, bustedThumbnailUrl) {
        const encodedAvatarKey = encodeURIComponent(avatarKey);
        for (const img of document.querySelectorAll('img')) {
            if (!(img instanceof HTMLImageElement)) continue;
            const src = img.getAttribute('src') ?? '';
            const absoluteSrc = img.src ?? '';
            const isAvatarThumbnail = [src, absoluteSrc].some(value => value.includes('type=avatar') && (value.includes(`file=${avatarKey}`) || value.includes(`file=${encodedAvatarKey}`)));
            const isCharacterFile = [src, absoluteSrc].some(value => value.includes(`/characters/${avatarKey}`) || value.includes(`/characters/${encodedAvatarKey}`));
            if (isAvatarThumbnail || isCharacterFile) img.src = bustedThumbnailUrl;
        }
    }

    async replaceCurrentCharacterAvatar(imageUrl) {
        if (selected_group || this_chid === undefined || !characters[this_chid]) {
            toastr.error("No active character selected.");
            return;
        }

        const confirm = await Popup.show.confirm(
            "Replace Character Avatar",
            `Are you sure you want to set this image as the avatar for ${characters[this_chid].name}?`
        );
        if (!confirm) return;

        try {
            toastr.info("Replacing avatar...");
            
            // 1. Fetch the image content as blob
            const response = await fetch(imageUrl);
            if (!response.ok) throw new Error("Failed to fetch image file");
            const blob = await response.blob();
            
            // Extract file extension and format
            const ext = getUrlExtension(imageUrl);
            const file = new File([blob], `avatar.${ext}`, { type: blob.type });
            let cropData;
            if (!power_user.never_resize_avatars) {
                const fileData = await getBase64Async(file);
                const dlg = new Popup('Set the crop position of the avatar image', POPUP_TYPE.CROP, '', { cropImage: fileData });
                const croppedImage = await dlg.show();
                if (!croppedImage) return;
                cropData = dlg.cropData;
            }

            const formData = new FormData();
            formData.append('avatar', file);
            formData.append('avatar_url', characters[this_chid].avatar);

            let url = '/api/characters/edit-avatar';
            if (cropData !== undefined) url += `?crop=${encodeURIComponent(JSON.stringify(cropData))}`;

            const uploadRes = await fetch(url, {
                method: 'POST',
                headers: getRequestHeaders({ omitContentType: true }),
                body: formData,
                cache: 'no-cache',
            });

            if (!uploadRes.ok) {
                throw new Error("Failed to upload avatar to server");
            }

            // 2. Bust cache for avatar thumbnail and full image
            const avatarKey = characters[this_chid].avatar;
            const thumbnailUrl = getThumbnailUrl('avatar', avatarKey);
            await fetch(thumbnailUrl, { method: 'GET', cache: 'reload' });
            await fetch(`/characters/${avatarKey}`, { method: 'GET', cache: 'reload' });

            // 3. Refresh visible avatar images with a cache-busted URL
            const bustedThumbnailUrl = `${thumbnailUrl}${thumbnailUrl.includes('?') ? '&' : '?'}cgv=${Date.now()}`;
            this.refreshAvatarImageSources(avatarKey, bustedThumbnailUrl);

            // 4. Re-read character and rebuild ST character UI like native avatar change flow
            await unshallowCharacter(this_chid);
            await getOneCharacter(avatarKey);
            await printCharacters();
            select_selected_character(this_chid, { switchMenu: false });
            await delay(100);
            this.refreshAvatarImageSources(avatarKey, bustedThumbnailUrl);

            // 5. Emit event to notify UI
            await eventSource.emit(event_types.CHARACTER_EDITED, { detail: { id: this_chid, character: characters[this_chid] } });

            toastr.success("Character avatar updated successfully!");
        } catch (error) {
            console.error("Error setting avatar:", error);
            toastr.error("Failed to update character avatar.");
        }
    }

    async renameGalleryItem(imageUrl, folder) {
        const filename = imageUrl.split('/').pop();
        const ext = getUrlExtension(imageUrl);
        const currentName = filename.replace(/\.[^/.]+$/, "");

        const newName = await Popup.show.input("Rename File", "Enter a new name for the file:", currentName);
        if (!newName || newName.trim() === "" || newName === currentName) return;

        try {
            toastr.info("Renaming file...");
            
            // 1. Fetch the image content as blob
            const response = await fetch(imageUrl);
            if (!response.ok) throw new Error("Failed to fetch image file");
            const blob = await response.blob();
            
            // 2. Convert blob to base64
            const base64Data = await getBase64Async(blob);
            const base64String = base64Data.split(',')[1];
            
            // 3. Save as new file name
            const newPath = await saveBase64AsFile(base64String, folder, newName.trim(), ext);
            if (!newPath) throw new Error("Failed to save new file");
            
            // 4. Delete the old file
            const deleted = await deleteMediaFromServer(imageUrl, false);
            if (!deleted) console.warn("Failed to delete the old file, but the renamed version was saved.");

            toastr.success("File renamed successfully!");
            await this.refresh();
        } catch (error) {
            console.error("Error renaming gallery item:", error);
            toastr.error("Failed to rename file.");
        }
    }

    async deleteGalleryItem(imageUrl) {
        const confirm = await Popup.show.confirm("Delete File", "Are you sure you want to delete this image? This action cannot be undone.");
        if (!confirm) return;

        try {
            const deleted = await deleteMediaFromServer(imageUrl, false);
            if (deleted) {
                toastr.success("Image deleted successfully.");
                await this.refresh();
            } else {
                toastr.error("Failed to delete image.");
            }
        } catch (error) {
            console.error("Error deleting image:", error);
            toastr.error("Failed to delete image.");
        }
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
