# UNiPLAY

UNiPLAY is a Windows desktop workspace for downloading videos and audio, making clips, playing live streams, and keeping a local media library. Its floating player can switch between video and a compact audio view.

## Install

Download `UNiPLAY.exe` from this repository's [Releases](https://github.com/RaoDhruv1203/Uniplay/releases) page, run it, and choose an installation folder. The installer and app use the UNiPLAY name and icon. Windows may show an **Unknown publisher** warning because the installer is not code-signed.

## Use

- Paste a supported video or playlist link in Download, choose format and quality, then queue it.
- In Clip, enter start/end times, choose Video or Audio and its quality, then select Download clip.
- Library shows only completed files that still exist in their saved folder. Select files to move them to the Windows Recycle Bin.
- Use Float on saved media to open the overlay. Saved local files support the compact audio player, Liked, and custom playlists.
- Drag the floating player by its top strip, or resize it with the bottom-right grip. The window keeps the video's aspect ratio.
- Live accepts a stream link or an `.m3u` playlist, including drag and drop.

Downloads and playlists are stored locally. The app checks this repository's public latest release for updates and opens its installer link when a newer version is available. It does not upload your local files to GitHub.

Some online videos restrict embedding or include ads controlled by their provider. UNiPLAY cannot guarantee an ad-free YouTube embed. Only download and play content you are allowed to use.

## Build from source

Install Node.js and run `npm ci`. Place Windows builds of `yt-dlp.exe`, `ffmpeg.exe`, `ffprobe.exe`, and `deno.exe` in `tools/`, with their respective license texts. Then run `npm run dist:win`. The third-party engine binaries and generated installers are intentionally excluded from this source repository; the release installer bundles the engine executables and license texts.

The code is currently published for inspection; no open-source redistribution license is granted. Third-party components retain their own licenses.

Maintainers can publish a tested Windows build with `node scripts/publish-release.cjs` after signing in to Git Credential Manager as the repository owner. The script reads the version from `package.json`, creates a draft, uploads only `release/UNiPLAY.exe`, verifies its size, then publishes it.
