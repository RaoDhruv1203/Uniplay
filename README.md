# UNiPLAY

UNiPLAY is a Windows desktop workspace for downloading videos and audio, making clips, playing live streams, broadcasting a custom scene, and keeping a local media library. Its floating player can switch between video and a compact audio view for saved files and live streams.

## Install

Download `UNiPLAY.exe` from this repository's [Releases](https://github.com/RaoDhruv1203/Uniplay/releases) page, run it, and choose an installation folder. The installer and app use the UNiPLAY name and icon. Windows may show an **Unknown publisher** warning because the installer is not code-signed.

## Use

- Paste a supported video or playlist link in Download, choose format and quality, then queue it.
- In Clip, enter start/end times, choose Video or Audio and its quality, then select Download clip.
- Library shows only completed files that still exist in their saved folder. Select files to move them to the Windows Recycle Bin.
- Use Float on saved media to open the overlay. Saved local files support the compact audio player, Liked, and custom playlists.
- Drag the floating player by its top strip, or resize it with the bottom-right grip. The window keeps the video's aspect ratio.
- YouTube plays inside the app first; use Float to open a separate player. YouTube's player must remain visible, so its floating mode cannot become audio-only.
- Live accepts a stream link or an `.m3u` playlist from a file, drag and drop, or a web URL. Link-based playlists update only when you click the refresh icon beside the selected playlist; matching channel favorites are preserved. Individual links go to a selectable history that can be exported as M3U.
- Live Studio can queue local videos or M3U8 streams, add text, logos, images, and GIF layers, then broadcast a shareable HLS link. The built-in link works on your local network. Internet viewers require router port forwarding or a relay, and Windows Firewall may prompt for access.

Downloads and playlists are stored locally. The app checks this repository's public latest release for updates. The bell shows a dot when an update is available; it downloads the installer, verifies its SHA-256 digest and size against GitHub's release metadata, then installs it over the existing installation. It does not upload your local files to GitHub.

Some online videos restrict embedding or include ads controlled by their provider. UNiPLAY cannot guarantee an ad-free YouTube embed. Only download and play content you are allowed to use.

If YouTube displays a sign-in or bot-check error, select a YouTube-only Netscape `cookies.txt` file in Settings and retry, or wait for the network rate limit to clear. This is optional and never reads browser cookies automatically. The file path remains in your local app settings; the file is not copied into the app or uploaded. Keep it private. [yt-dlp's guide](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies) explains export precautions and account risks.

## Build from source

Install Node.js and run `npm ci`. Place Windows builds of `yt-dlp.exe`, `ffmpeg.exe`, `ffprobe.exe`, and `deno.exe` in `tools/`, with their respective license texts. Then run `npm run dist:win`. The third-party engine binaries and generated installers are intentionally excluded from this source repository; the release installer bundles the engine executables and license texts.

The code is currently published for inspection; no open-source redistribution license is granted. Third-party components retain their own licenses.

Maintainers can publish a tested Windows build with `node scripts/publish-release.cjs` after signing in to Git Credential Manager as the repository owner. The script reads the version from `package.json`, creates a draft, uploads only `release/UNiPLAY.exe`, verifies its size, then publishes it.
