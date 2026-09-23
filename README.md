# UNiPLAY

UNiPLAY is a Windows desktop workspace for downloading videos and audio, making clips, playing live streams, broadcasting a custom scene, and keeping a local media library. Its floating player can switch between video and a compact audio view for supported YouTube videos, saved files, and live streams.

## Install

Download `UNiPLAY.exe` from this repository's [Releases](https://github.com/RaoDhruv1203/Uniplay/releases) page, run it, and choose an installation folder. The installer and app use the UNiPLAY name and icon. Windows may show an **Unknown publisher** warning because the installer is not code-signed.

## Use

- Paste a supported video or playlist link in Download, choose format and quality, then queue it.
- In Clip, enter start/end times, choose Video or Audio and its quality, then select Download clip.
- Library shows only completed files that still exist in their saved folder. Select files to move them to the Windows Recycle Bin.
- Use Float on saved media to open the overlay. Saved local files support the compact audio player, Liked, and custom playlists.
- Drag the floating player by its top strip, or resize it with the bottom-right grip. The window keeps the video's aspect ratio.
- YouTube plays inside the app first when a direct stream is available; use Float to open a separate player or switch it to compact audio mode. Some videos only permit the embedded player, which may block playback or audio-only mode.
- Live accepts an individual stream link or an `.m3u`/`.m3u8` playlist from a file, drag and drop, a direct web URL, or a GitHub file-page URL such as `https://github.com/iptv-org/iptv/blob/master/streams/us_firetv.m3u`. HLS master playlists show their available stream variants; HLS media playlists appear as one playable stream. Switch channels between list and logo grid views, and resize grid tiles with the slider. Link-based playlists update only when you click the refresh icon beside the selected playlist; matching channel favorites are preserved. Individual links go to a selectable history that can be exported as M3U.
- Live Studio can queue local videos, direct MP4/M3U8 links, and supported YouTube or website videos; set each item's duration, trim or loop seekable clips, and switch manually. Its timeline controls stay off air. Add text, a scrolling ticker, a customizable LIVE badge, logos, images, and GIF layers. Select a source or layer to drag and resize it on the preview; source controls include fit/fill and crop percentages. Text controls include installed fonts, gradients, background opacity, stroke, and corner radius. The built-in HLS link works on your local network. For a reliable public link, connect your own Cloudflare managed tunnel and hostname in Live Studio, routing it to `http://localhost:7767`. The token is stored encrypted on this PC. Without that setup, **Share outside my network** tries an account-free Quick Tunnel, which is a testing service with no uptime guarantee. UNiPLAY checks the public link before showing it and closes it when broadcasting stops. Windows Firewall may prompt for access.

Downloads and playlists are stored locally. The app checks this repository's public latest release for updates. The bell shows a dot when an update is available; it resumes interrupted installer downloads, verifies the SHA-256 digest and size against GitHub's release metadata, then installs over the existing installation. Browser downloads directly from GitHub depend on GitHub/CDN and your network; UNiPLAY cannot control their speed. It does not upload your local files to GitHub.

Some online videos restrict embedding or include ads controlled by their provider. UNiPLAY cannot guarantee an ad-free YouTube embed. Only download and play content you are allowed to use.

For YouTube, UNiPLAY first tries an anonymous embeddable-player route, then a normal request. This works for some videos that trigger a bot check on the normal route, but cannot bypass private videos, network restrictions, or videos that disallow embedding. Optional browser or `cookies.txt` access in Settings is only a fallback you choose. yt-dlp reads the selected browser's cookie store, which may include cookies beyond YouTube; UNiPLAY does not export those cookies into its settings or release files. Keep both private. [yt-dlp's guide](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp) explains the risks.

## Build from source

Install Node.js and run `npm ci`. Place Windows builds of `yt-dlp.exe`, `ffmpeg.exe`, `ffprobe.exe`, `deno.exe`, and `cloudflared.exe` in `tools/`, with their respective license texts. Then run `npm run dist:win`. The third-party engine binaries and generated installers are intentionally excluded from this source repository; the release installer bundles the engine executables and license texts.

The code is currently published for inspection; no open-source redistribution license is granted. Third-party components retain their own licenses.

Maintainers can publish a tested Windows build with `node scripts/publish-release.cjs` after signing in to Git Credential Manager as the repository owner. The script reads the version from `package.json`, creates a draft, uploads only `release/UNiPLAY.exe`, verifies its size, then publishes it.
