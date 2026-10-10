// Google account + cloud save.
// Sign In with Google uses Google Identity Services (OAuth 2.0 token model,
// https://accounts.google.com/gsi/client). The save point is stored in the
// player's Google Drive *appDataFolder* — a hidden per-app folder that only
// this game can see; it does not appear among the user's files.
//
// Security: the access token lives in memory only (never localStorage /
// cookies). Sign Out revokes it at Google and wipes it from memory together
// with the cached profile. Nothing else is sent to any server.
//
// Setup: create an OAuth 2.0 "Web application" client ID in Google Cloud
// Console, add this site's origin to "Authorized JavaScript origins", enable
// the Google Drive API, and paste the client ID in Settings → Account.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
const FILE = 'globalskies-save.json';

let gisPromise = null;
function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; reject(new Error('Google sign-in library could not be loaded (offline, blocked by the browser or by this page\'s content security policy).')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

export class CloudSave {
  constructor(settings) {
    this.settings = settings;
    this.token = null;
    this.expires = 0;
    this.profile = null;
    this.fileId = null;
    this.listeners = [];
  }

  get clientId() { return (this.settings.googleClientId || '').trim(); }
  get signedIn() { return !!this.token && Date.now() < this.expires; }
  onChange(f) { this.listeners.push(f); }
  _emit() { for (const f of this.listeners) try { f(this); } catch { /* ignore */ } }

  async signIn() {
    if (!this.clientId) throw new Error('Add your Google OAuth client ID in Settings → Account first.');
    await loadGis();
    const resp = await new Promise((resolve, reject) => {
      const tc = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPES,
        callback: (r) => (r && r.access_token ? resolve(r) : reject(new Error(r && r.error_description ? r.error_description : 'Sign-in was cancelled.'))),
        error_callback: (e) => reject(new Error(e && e.message ? e.message : 'Sign-in failed or the pop-up was closed.')),
      });
      tc.requestAccessToken({ prompt: this.profile ? '' : 'consent' });
    });
    this.token = resp.access_token;
    this.expires = Date.now() + (resp.expires_in || 3600) * 1000 - 30000;
    const me = await this._api('https://www.googleapis.com/oauth2/v3/userinfo');
    this.profile = { name: me.name || '', email: me.email || '', picture: me.picture || '' };
    this._emit();
    return this.profile;
  }

  // Revoke at Google and wipe every trace locally.
  async signOut() {
    const t = this.token;
    this.token = null;
    this.expires = 0;
    this.profile = null;
    this.fileId = null;
    try { sessionStorage.removeItem('globalskies.google'); localStorage.removeItem('globalskies.google'); } catch { /* ignore */ }
    if (t && window.google && window.google.accounts && window.google.accounts.oauth2) {
      await new Promise((res) => window.google.accounts.oauth2.revoke(t, () => res()));
    }
    this._emit();
  }

  async _api(url, opts = {}) {
    if (!this.signedIn) throw new Error('Not signed in (or the session expired). Sign in with Google again.');
    const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${this.token}`, ...(opts.headers || {}) } });
    if (r.status === 401) { this.token = null; this._emit(); throw new Error('Google session expired — sign in again.'); }
    if (!r.ok) throw new Error(`Google API ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : r.text();
  }

  async _findFile() {
    if (this.fileId) return this.fileId;
    const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
    const res = await this._api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`);
    this.fileId = res.files && res.files[0] ? res.files[0].id : null;
    return this.fileId;
  }

  async save(data) {
    const body = JSON.stringify(data);
    const id = await this._findFile();
    if (id) {
      await this._api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    } else {
      const boundary = 'gs' + Math.random().toString(36).slice(2);
      const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
      const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      const res = await this._api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
      this.fileId = res.id;
    }
    this.lastSaved = Date.now();
    this._emit();
  }

  async load() {
    const id = await this._findFile();
    if (!id) return null;
    const txt = await this._api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
    return typeof txt === 'string' ? JSON.parse(txt) : txt;
  }
}
