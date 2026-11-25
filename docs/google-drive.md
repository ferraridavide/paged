# Google Drive setup

Paged Editor opens and saves `.pdoc` files in Google Drive straight from the
browser: no server. It needs a Google Cloud project with three values in
`.env.local`:

| Variable | What it is | Where it comes from |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | OAuth client (Web application) | Google Auth platform → Clients |
| `VITE_GOOGLE_API_KEY` | API key for the Google Picker | APIs & Services → Credentials |
| `VITE_GOOGLE_APP_ID` | Project **number** (digits) | Project dashboard / IAM & Admin → Settings |
| `VITE_GOOGLE_DRIVE_INSTALL` | Optional, `true` for Drive's "Open with" menu | step 8 |

Parts 1–7 are enough for **File → Open from Google Drive…** and
**Save to Google Drive**. Part 8 adds Paged Editor to Drive's own
**Open with** and **New** menus, which needs a public HTTPS address
(a Cloudflare tunnel works for development).

## How it works

- **Sign-in:** Google Identity Services opens a Google popup and returns a
  short-lived access token. It stays in memory, so there is no refresh token
  and no backend.
- **Scope:** `drive.file` only. The editor can see the files the user picks in
  the Google Picker and the files it creates, nothing else in their Drive.
  Google classes this scope as non-sensitive, so the app needs no Google
  verification review.
- **Open:** the Picker grants access to the chosen file, then the editor
  downloads it with the Drive API and reads it like a local `.pdoc`.
- **Save (⌘S):** uploads a new revision of the same file. If someone else
  saved a newer revision in the meantime, the editor asks before replacing
  it. Drive keeps the other revision in its version history.
- **Save to Google Drive as… (⇧⌘S):** pick a folder, and the editor creates
  `<title>.pdoc` there and links the document to the new file.

## 1. Create or choose a project

1. Open <https://console.cloud.google.com/> and use the project picker at the
   top → **New project**. Name it, for example, `paged-editor`, and create it.
2. On the project **Dashboard**, the *Project info* card shows the
   **Project number** (digits, e.g. `123456789012`). That is
   `VITE_GOOGLE_APP_ID`. It is *not* the project ID (`paged-editor-4567`).
   It is also under **IAM & Admin → Settings**.

## 2. Enable the APIs

**APIs & Services → Library**, search for each API and click **Enable**:

- **Google Drive API** (download and upload files)
- **Google Picker API** (the file and folder chooser)

## 3. Configure the consent screen (Google Auth platform)

Menu → **Google Auth platform** (older consoles call it **OAuth consent
screen**). The first time, click **Get started**:

1. **App information:** app name `Paged Editor`, and your support email.
2. **Audience:**
   - **Internal** if everyone using it is in your Google Workspace
     organization. There is no test-user list and no publishing step.
   - **External** otherwise. The app starts in *Testing*: only the accounts
     you add under **Audience → Test users** can sign in (up to 100).
3. **Contact information:** your email. Then agree and **Create**.
4. **Data access → Add or remove scopes.** Filter for `drive` and tick:
   - `.../auth/drive.file`: *See, edit, create, and delete only the specific
     Google Drive files you use with this app*
   - `.../auth/drive.install`: only if you do part 8

   Click **Update**, then **Save**. Both scopes are non-sensitive, so they
   appear without a warning badge.

> For an External app used by people outside the test-user list, open
> **Audience → Publish app**. With only non-sensitive scopes there is no
> scope verification review. Google may still ask for brand verification of
> the app name, and always does if you upload a logo.

## 4. Create the OAuth client

**Google Auth platform → Clients → Create client** (or **APIs & Services →
Credentials → Create credentials → OAuth client ID**):

- **Application type:** Web application
- **Name:** `Paged Editor (web)`
- **Authorized JavaScript origins.** Add every address you open the editor at:
  - `http://localhost:5179`
  - plus any other dev port you use, and your tunnel or production origin
    (`https://….trycloudflare.com`, `https://editor.example.com`). Origins
    only: a scheme, a host and an optional port, with no path and no trailing
    slash.
- **Authorized redirect URIs:** leave empty. The token popup doesn't use them.

Click **Create** and copy the **Client ID**
(`…apps.googleusercontent.com`) into `VITE_GOOGLE_CLIENT_ID`. You don't need
the client secret. New origins can take a few minutes to start working.

## 5. Create the API key (for the Picker)

**APIs & Services → Credentials → Create credentials → API key**, then
**Edit API key**:

- **Application restrictions:** *Websites*, and add:
  - `http://localhost:5179/*`
  - `https://*.trycloudflare.com/*` (if you use quick tunnels) or your own domain
  - `https://docs.google.com/*` (**required**: the Picker runs from there.
    Without it the Picker says "The API developer key is invalid")
- **API restrictions:** *Restrict key* → **Google Picker API**.

Save it and copy the key into `VITE_GOOGLE_API_KEY`.

The client ID and API key end up in the browser bundle. That's normal for a
browser app; the restrictions above are what protect them.

## 6. Configure the editor

```bash
cp .env.example .env.local
```

Fill in the three values (`.env.local` is git-ignored), then restart
`pnpm dev`. Vite reads env files only at startup.

## 7. Try it

1. **File → Open from Google Drive…** (⇧⌘O). Google asks you to sign in and
   grant access to "the specific Google Drive files you use with this app".
2. In the Picker, choose a `.pdoc`. To bring in a local file, use the
   **Upload** tab: it uploads the file to Drive and opens it.
3. Edit, then **⌘S**. The status bar pill shows the file name and *Saving… →
   Saved*. Click the pill to show the file in Drive or stop saving to it.
4. **File → Save to Google Drive as…** saves the current document as a new
   file in a folder you pick.

**File → Download .pdoc** still downloads a copy. With no Drive file linked,
⌘S downloads as before.

## 8. Optional: "Open with" and "New" in Google Drive

This lets someone right-click a `.pdoc` in Drive → **Open with → Paged
Editor**, or choose **New → More → Paged Editor**. Drive then opens the
editor with a `?state=…` parameter. The editor shows a banner, and one click
signs in and opens the file, or starts a new document that saves into that
folder.

Drive won't accept `localhost` here: it needs a public **HTTPS** URL. For
development, use a Cloudflare tunnel to the Vite dev server.

### 8a. Get an HTTPS address with cloudflared

**Quick tunnel** (no account; the address changes every run):

```bash
pnpm dev
```

```bash
cloudflared tunnel --url http://localhost:5179
```

It prints `https://<random-words>.trycloudflare.com`. `vite.config.ts`
already allows `*.trycloudflare.com`. Each new address must be added to the
OAuth client's JavaScript origins (step 4) and the Drive UI integration's URLs
(step 8b). That is fine for one debugging session and tedious after that.

**Named tunnel** (stable address on a domain in your Cloudflare account):

```bash
cloudflared tunnel login
```

```bash
cloudflared tunnel create paged-editor
```

```bash
cloudflared tunnel route dns paged-editor editor.example.com
```

```bash
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=editor.example.com pnpm dev
```

```bash
cloudflared tunnel run --url http://localhost:5179 paged-editor
```

Add `https://editor.example.com` to the OAuth client's origins and
`https://editor.example.com/*` to the API key's website restrictions.

### 8b. Configure the Drive UI integration

**APIs & Services → Enabled APIs & services → Google Drive API → Drive UI
integration** tab:

| Field | Value |
|---|---|
| Application name | `Paged Editor` |
| Short / long description | optional |
| Application icons | PNGs with a transparent background (Drive can take up to 24 h to show them) |
| Open URL | `https://<your tunnel host>/` |
| Default MIME types | `application/vnd.paged-editor+zip` |
| Default file extensions | `pdoc` |
| Creating files | ticked; **New URL** `https://<your tunnel host>/`; leave *Document name* empty |
| Importing | leave unticked (Google Docs files aren't .pdoc) |
| Shared drives support | tick it to allow files in shared drives |

Do **not** tick the box that automatically shows the OAuth consent screen.
That option is deprecated, and the editor starts sign-in itself. Click
**Submit**.

### 8c. Turn it on in the editor

1. Set `VITE_GOOGLE_DRIVE_INSTALL=true` in `.env.local` and restart
   `pnpm dev`. Make sure `drive.install` is among the consent screen's scopes
   (step 3).
2. Open the editor at the **tunnel** address and use **File → Open from
   Google Drive…** once. The consent now includes letting Paged Editor
   "appear as an option in the Open with or New menu". Granting it installs
   the app for your account.
3. In Drive, right-click a `.pdoc` → **Open with → Paged Editor**.

Only one Open URL exists per project. When a quick tunnel's address changes,
update the Open URL, the New URL and the OAuth origin. For other people to see
the app in "Open with", they each grant `drive.install` the same way, or you
publish the app on the Google Workspace Marketplace.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Popup says `origin_mismatch` / "redirect_uri_mismatch" | The address in the browser isn't in the OAuth client's **Authorized JavaScript origins**. Check the exact scheme and port, then wait a few minutes. |
| "Access blocked: … has not completed the Google verification process" | External app in Testing: add the account under **Audience → Test users**. |
| Picker: "The API developer key is invalid" | Add `https://docs.google.com/*` to the API key's website restrictions, and check that the Picker API is enabled and allowed on the key. |
| Picker opens but shows no files | It lists `.pdoc`, zip and JSON files only. Upload one in the **Upload** tab. |
| "The file isn't in Google Drive any more, or Paged Editor wasn't given access to it" | With `drive.file`, the editor can only open files picked in the Picker or created by it. Open the file through **Open from Google Drive…** once. |
| "The Google sign-in popup was blocked" | Allow popups for the site. Sign-in has to start from a click. |
| Menu says Google Drive isn't set up | One of the three `VITE_GOOGLE_*` values is missing. Restart `pnpm dev` after editing `.env.local`. |
| Vite: "Blocked request. This host is not allowed" | Start Vite with `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<your host>`. |
| "Open with" doesn't list Paged Editor | Check that `VITE_GOOGLE_DRIVE_INSTALL=true` is set, `drive.install` was granted (sign in again from the tunnel address), the extension is `pdoc`, and the Drive UI integration was submitted. |

To revoke the editor's access to your account, go to
<https://myaccount.google.com/permissions>.
