# Google account & cloud save

GLOBAL SKIES uses **Sign in with Google** (Google Identity Services, OAuth 2.0 token model)
to keep the player's save point in their Google Drive **appDataFolder**, a hidden folder
that only this game can read and write. It does not appear among the user's Drive files.

## Owner setup (once per site)
1. Google Cloud Console → create (or pick) a project → **APIs & Services → Library** →
   enable **Google Drive API**.
2. **OAuth consent screen**: app name *GLOBAL SKIES: Infinite Horizon*, developer
   *ALON NOVITARGER*; scopes `openid`, `email`, `profile`,
   `https://www.googleapis.com/auth/drive.appdata`.
3. **Credentials → Create credentials → OAuth client ID → Web application**; add the site's
   origin (for example `https://your-domain.example`, or `http://localhost:8123` for testing)
   to **Authorized JavaScript origins**.
4. Copy the client ID (`….apps.googleusercontent.com`) and paste it in the game:
   **Settings → Account & cloud save → OAuth client ID**. To ship it built in, set
   `googleClientId` in the default settings in `web/js/main.js`.

## Behaviour
* **Sign in**: a Google pop-up asks for consent; the game shows the name and e-mail.
* **Cloud save**: every save point (O, the pause menu, the 60 s autosave) is uploaded while
  signed in. *Load from cloud* restores it, then *Continue* on the Home tab resumes it.
* **Sign out**: the access token is revoked at Google (`oauth2.revoke`) and wiped from memory
  together with the profile. Tokens are never written to localStorage, sessionStorage or cookies.
* The token expires after about an hour; the next cloud action asks you to sign in again.

## Limits
* Needs network access to `accounts.google.com` and `www.googleapis.com`. Pages with a strict
  content security policy (for example the Claude artifact viewer) block the Google script;
  the game then shows a clear message and keeps local saves working.
* Tested in the e2e suite against mocked Google endpoints (sign-in, userinfo, Drive upload,
  revoke). A live test needs the owner's client ID and a deployed origin.
