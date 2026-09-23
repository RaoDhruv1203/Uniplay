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
- Live Studio can queue local videos or M3U8 streams, set each item's duration, trim or loop local clips, and switch manually. Its timeline controls stay off air. Add text, a scrolling ticker, a movable LIVE badge, logos, images, and GIF layers. The built-in HLS link works on your local network. Click **Share outside my network** while live to request a temporary public link. The app checks that the link is reachable before showing it, and closes it when you stop broadcasting. This uses Cloudflare's account-free Quick Tunnel, a testing service with no uptime guarantee. A stable production link needs a managed tunnel and domain. Windows Firewall may prompt for access.

Downloads and playlists are stored locally. The app checks this repository's public latest release for updates. The bell shows a dot when an update is available; it resumes interrupted installer downloads, verifies the SHA-256 digest and size against GitHub's release metadata, then installs over the existing installation. Browser downloads directly from GitHub depend on GitHub/CDN and your network; UNiPLAY cannot control their speed. It does not upload your local files to GitHub.

Some online videos restrict embedding or include ads controlled by their provider. UNiPLAY cannot guarantee an ad-free YouTube embed. Only download and play content you are allowed to use.

If YouTube displays a sign-in or bot-check error, select a browser in Settings to use yt-dlp's direct browser-cookie support, choose a YouTube-only Netscape `cookies.txt` file, or wait for a network rate limit to clear. Browser access happens only after you select it and can be disconnected. yt-dlp reads the selected browser's cookie store, which may include cookies beyond YouTube; UNiPLAY does not export those cookies into its settings or release files. A cookies file path stays in local app settings. Keep both private. [yt-dlp's guide](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp) explains the risks.

## Build from source

Install Node.js and run `npm ci`. Place Windows builds of `yt-dlp.exe`, `ffmpeg.exe`, `ffprobe.exe`, `deno.exe`, and `cloudflared.exe` in `tools/`, with their respective license texts. Then run `npm run dist:win`. The third-party engine binaries and generated installers are intentionally excluded from this source repository; the release installer bundles the engine executables and license texts.

The code is currently published for inspection; no open-source redistribution license is granted. Third-party components retain their own licenses.

Maintainers can publish a tested Windows build with `node scripts/publish-release.cjs` after signing in to Git Credential Manager as the repository owner. The script reads the version from `package.json`, creates a draft, uploads only `release/UNiPLAY.exe`, verifies its size, then publishes it.
