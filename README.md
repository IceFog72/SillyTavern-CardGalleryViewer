# SillyTavern - Card Gallery Viewer

A persistent, card-aware gallery viewer for SillyTavern. It opens from the top bar and shows the image/video gallery for the current character or group, with upload, delete, sorting, and folder override controls.

---

## Features

- **Top-bar gallery button**: Open the gallery from SillyTavern's top settings bar.
- **Follow current card**: Automatically switch the gallery when the active character or group changes.
- **Manual selection**: Pick a character/group from the dropdown when you want the gallery to stay on a specific target.
- **Image and video support**: Lists gallery media using SillyTavern's image/video APIs.
- **Drag-and-drop upload**: Drop files directly into the gallery to add them to the selected folder.
- **Add button**: Select one or more image/video files from disk.
- **Delete mode**: Toggle delete mode, then click gallery items to remove them after confirmation.
- **Folder overrides**: Change or restore the gallery folder for individual characters.
- **Sorting**: Sort by name or date, ascending or descending.
- **Movable panel**: Gallery panel can be dragged like other SillyTavern floating panels.

---

## Installation

1. Install via SillyTavern's extension installer, or
2. Clone into `SillyTavern/data/default-user/extensions/`

```bash
git clone https://github.com/IceFog72/SillyTavern-CardGalleryViewer
```

Then reload SillyTavern and enable **Card Gallery Viewer**.

---

## Requirements

- SillyTavern `1.12.0` or newer
- Modern Chromium/Firefox-based browser

---

## Quick Start

### Basic Usage

1. Click the **Card Gallery Viewer** image icon in the top bar.
2. Leave **Follow Current** enabled to show the gallery for the active character/group.
3. Disable follow by selecting a specific character/group from the dropdown.
4. Use the sort dropdown to change gallery order.
5. Drag files into the gallery or click **Add** to upload media.

### Delete Mode

1. Click the trash button to enable delete mode.
2. Confirm the warning banner is visible.
3. Click an image/video thumbnail.
4. Confirm the delete prompt.

### Folder Overrides

1. Select a character target.
2. Enter a folder name in **Folder Name**.
3. Click **Apply** to use that folder for the character.
4. Click **Restore** to return to the character's default gallery folder.

---

## Notes

- Folder overrides are available for characters only.
- Group galleries use the selected group id as their folder.
- Media is stored through SillyTavern's normal `user/images` gallery storage.
- The extension reuses SillyTavern's built-in gallery assets (`nanogallery2`).

---

## Project Structure

```text
SillyTavern-CardGalleryViewer/
├── index.js       # SillyTavern entry shim
├── manifest.json  # Extension manifest
├── package.json   # Local check script and package metadata
├── style.css      # Gallery panel and toolbar styles
└── src/
    └── index.js   # Extension runtime logic
```

---

## Support

- **Discord**: [https://discord.gg/2tJcWeMjFQ](https://discord.gg/2tJcWeMjFQ)
- **SillyTavern Discord**: Find me on the official server
- **GitHub Issues**: Bug reports and feature requests

---

## License

GNU License - See [LICENSE](LICENSE) for details.
