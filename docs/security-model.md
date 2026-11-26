# How PhotoDrive protects galleries and photos

*Source text for the owner's review (S3-12). The FAQ entries at the end are written in plain English for translation into the six
languages once the wording is agreed.*

## The short version

A PhotoDrive gallery is a page that shows photos stored in the photographer's **Google Drive folder**. PhotoDrive controls who can
open the gallery page, what they can do on it (view, favourite, download), and how many requests one visitor can make. It does **not**
control the Drive folder itself. The folder has to be shared as "anyone with the link" for the gallery to read it, so **anyone who
obtains the Drive folder link can open the folder in Google Drive, outside PhotoDrive, and PhotoDrive cannot stop that.**

What PhotoDrive protects against is *bypassing the gallery*: getting photos without the password, downloading originals when the
photographer turned downloads off, or fetching other people's files through PhotoDrive's servers. It does not protect against a
leaked folder link, and nothing short of keeping the files out of a shared Drive folder could.

## Gallery types

Every gallery is **public** (no password, the link opens it) or **private** (a password is required). Separately, downloads can be on
or off.

| | Public, downloads on | Public, downloads off | Private (downloads on or off) |
|---|---|---|---|
| Who can open the gallery page | anyone with the link | anyone with the link | only someone who entered the password |
| How photos reach the browser | straight from Google's servers | through PhotoDrive, signed links¹ | through PhotoDrive, signed links¹ |
| Drive file ids and Google image links visible in the page | yes | no¹ | no¹ |
| Download buttons and original files | yes | no | yes if downloads are on, and only after unlocking |
| Favourites and "send my selection" | anyone with the link | anyone with the link | only after unlocking |

¹ **Protected delivery** (`MEDIA_PROTECTED_TIER=1`). It is built and tested but **switched off** until it has been tried on a staging
copy with real galleries and the extra hosting bandwidth has been measured (S3-11). While it is off, the second and third columns
behave like the first for photo delivery: the *gallery page* is still locked behind the password and original downloads are still
refused when downloads are off, but the page's code contains Drive file ids and Google image links.

## What is protected

- **The password.** Stored only as a salted hash (and, so the photographer can see it again, encrypted, never in plain text). Five
  wrong attempts from one visitor on one gallery within ten minutes lock that visitor out of that gallery for fifteen minutes, even
  with the right password. The error message is the same whether the gallery exists, has a password or the password is wrong. A
  separate per-visitor limit stops one visitor trying many galleries. The unlock cookie is HTTP-only, same-site strict, secure on the
  live site, valid seven days, and stops working when the photographer changes the password.
- **Original files.** Served only when the gallery allows downloads and, for a private gallery, only to someone who unlocked it. The
  photographer who owns the gallery and administrators can always fetch them.
- **Which files can be fetched through PhotoDrive.** The photo proxy and the protected delivery route only serve files that are inside
  *that gallery's own* Drive folder. Asking for any other Drive file, or using one gallery's link for another gallery, is refused.
- **Photo links of protected galleries.** Each photo is addressed by an opaque token, not its Drive id. Links are signed, tied to one
  gallery, one photo and one size, and expire after 6 to 12 hours. They cannot be edited, reused for another photo or extended.
- **Abuse.** Per-visitor limits, shared across all servers, apply to password attempts, the contact form, sending a selection,
  creating demos, and photo requests. Visitors' network addresses are stored only as hashes.
- **The browser.** Security headers: no framing by other sites, no content-type guessing, a restricted referrer, camera / microphone /
  location switched off, and a content-security policy that is being observed before it is enforced.
- **Input.** Requests are validated; malformed requests get a clear 400 error and never crash the server.

## What is not protected (said plainly)

1. **A leaked Drive folder link.** Whoever has it can browse and download the folder in Google Drive, with or without a PhotoDrive
   password and whatever the download setting says.
2. **Anything a visitor can see, they can capture.** Screenshots, screen recording, and saving an image the browser has displayed
   cannot be prevented. "Downloads off" removes the download buttons and refuses original files; it is not copy protection.
3. **Videos in a gallery with downloads off.** To play a video the browser has to receive its file, so a determined visitor can save
   it from their browser's developer tools. The same was true when videos played in Google's own player.
4. **A password that is shared.** Anyone who has the password and the link can open a private gallery. The password is per gallery,
   not per person.
5. **Photos copied before a change.** Changing a password or turning downloads off does not recall files already downloaded.
6. **Previews and thumbnails of a public gallery** are on Google's public image servers by design, to keep the gallery fast and keep
   hosting costs down.

## Guidance for photographers

- Want only certain people to see a gallery? Make it **private** and share the password separately from the link.
- Do not want clients to download originals? Turn **downloads off**. Know that it is a deterrent, not copy protection.
- Anything you cannot afford to be seen by someone holding the link should not be in a shared Drive folder. Do not share the
  Drive folder link publicly; share the PhotoDrive gallery link instead.
- If a password or the Drive link got out: change the password (existing unlock cookies stop working at once) and, in Google Drive,
  stop sharing the folder with "anyone with the link" and create a new share.

## For the operator

- **Settings:** `MEDIA_PROTECTED_TIER` (`0` off, `1` on), `MEDIA_SIGNING_SECRET` (optional; otherwise derived from
  `GALLERY_JWT_SECRET`; changing either invalidates the photo links already issued, and changing `GALLERY_JWT_SECRET` also logs
  every visitor out of private galleries), `UPSTASH_REDIS_REST_URL` / `_TOKEN` (shared rate limits), `RATE_LIMIT_SALT`.
- **Cost of the protected tier:** photos for protected galleries pass through PhotoDrive's servers instead of Google's, so hosting
  bandwidth and Drive API calls grow with their traffic. S3-11 measures this before the tier is switched on for production.
- **Open links:** a gallery tab left open for more than about 12 hours shows broken images until reloaded.
- **Where it is built:** `lib/server/media-token.ts`, `app/api/g/[galleryId]/media/[token]/route.ts`,
  `app/api/photos/proxy/route.ts`, `lib/server/protected-photos.ts`, `app/api/gallery/verify-password/route.ts`,
  `lib/server/rate-limit.ts`, `next.config.ts`. Tests: `tests/security/`. Evidence: `docs/upgrade/evidence/S3.md`.

---

## FAQ / help text (English source, for translation)

**What is the difference between a public and a private gallery?**
A public gallery opens for anyone who has its link. A private gallery asks for a password first, and shows nothing until it is
entered. You choose when you create the gallery and can change it later.

**What does "downloads off" do?**
Visitors can look at and favourite photos but see no download buttons, and the original files are not handed out through the gallery.
It stops casual downloading. It does not stop someone taking a screenshot.

**Can someone get my photos without the password?**
Not through your PhotoDrive gallery. But your photos live in your Google Drive folder, which has to be shared with "anyone with the
link" so the gallery can show them. If someone gets that Drive link, they can open the folder in Google Drive directly. Keep that
link to yourself and share the PhotoDrive gallery link instead.

**Someone has the wrong person's link or password. What do I do?**
Change the gallery password in your dashboard: everyone who had unlocked the gallery has to enter the new one. If your Drive folder
link was shared, stop sharing the folder in Google Drive and share it again with a new link.

**Why was I asked to wait before trying again?**
After five wrong passwords in ten minutes, the gallery pauses password attempts from that device for fifteen minutes. This protects
the gallery from people guessing.

**Why do some photos stop loading if I leave the gallery open all day?**
For private galleries and galleries with downloads off, photo links expire after several hours for safety. Reload the page.
