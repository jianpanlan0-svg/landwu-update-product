// ==UserScript==
// @name         Landwu-桥接同步登录态-双兼容18888_18321-v6
// @namespace    https://user.landwu.com/
// @version      2026.04.17.1
// @description  无感自动同步当前 Landwu 登录态到本地速卖通专用上传器(18888)和领物TEMU上传器(18321)
// @match        https://user.landwu.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const LOCAL_SERVERS = [
    { url: 'http://127.0.0.1:18888', label: '速卖通18888' },
    { url: 'http://127.0.0.1:18321', label: 'TEMU18321' },
  ];
  const BADGE_ID = 'landwu-bridge-badge-v6-dual';
  let lastFingerprint = '';
  let fadeTimer = null;
  let hideTimer = null;
  let lastStatusKey = '';

  function readAuth() {
    const token = localStorage.getItem('access_token') || '';
    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    const sessionMatch = document.cookie.match(/(?:^|;\s*)(laravel_session=[^;]+)/);

    return {
      token,
      factoryId: userInfo.factory_id ? String(userInfo.factory_id) : '',
      masterFactoryId: userInfo.factory_id ? `6${userInfo.factory_id}` : '',
      session: sessionMatch ? sessionMatch[1] : '',
      username: userInfo.username || userInfo.nickname || '',
      companyName: userInfo.company_name || '',
      source: 'scriptcat-auto',
    };
  }

  function getFingerprint(auth) {
    return [auth.token, auth.factoryId, auth.masterFactoryId, auth.username].join('|');
  }

  function getBadge() {
    let badge = document.getElementById(BADGE_ID);
    if (badge) return badge;

    badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.style.cssText = [
      'position:fixed',
      'right:12px',
      'bottom:12px',
      'z-index:999999',
      'max-width:220px',
      'background:rgba(17,24,39,.88)',
      'color:#fff',
      'padding:6px 10px',
      'border-radius:10px',
      'font-size:12px',
      'line-height:1.4',
      'box-shadow:0 8px 24px rgba(0,0,0,.18)',
      'opacity:0',
      'display:none',
      'transition:opacity .25s ease',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(badge);
    return badge;
  }

  function hideBadge(remove = false) {
    const badge = document.getElementById(BADGE_ID);
    if (!badge) return;
    badge.style.opacity = '0';
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      badge.style.display = 'none';
      if (remove) badge.remove();
    }, 260);
  }

  function setBadge(text, color = '#16a34a', options = {}) {
    const {
      autoFade = true,
      fadeDelay = 2200,
      keepVisible = false,
      statusKey = '',
      silentIfSame = false,
    } = options;

    if (statusKey) {
      if (silentIfSame && lastStatusKey === statusKey) return;
      lastStatusKey = statusKey;
    }

    const badge = getBadge();

    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    badge.textContent = text;
    badge.style.border = `1px solid ${color}`;
    badge.style.display = 'block';
    badge.style.opacity = '0.96';

    if (autoFade && !keepVisible) {
      fadeTimer = setTimeout(() => hideBadge(false), fadeDelay);
    }
  }

  function postAuth(server, auth) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${server.url}/api/auth/sync`,
        headers: {
          'Content-Type': 'application/json',
        },
        data: JSON.stringify(auth),
        onload: (response) => {
          try {
            const json = JSON.parse(response.responseText || '{}');
            if (!json.ok) {
              resolve({ ok: false, server, reason: 'sync-failed' });
              return;
            }
            resolve({ ok: true, server, json });
          } catch (error) {
            resolve({ ok: false, server, reason: 'parse-failed' });
          }
        },
        onerror: () => {
          resolve({ ok: false, server, reason: 'connect-failed' });
        },
      });
    });
  }

  async function syncAuth(force = false) {
    const auth = readAuth();
    if (!auth.token || !auth.factoryId) {
      setBadge('桥接登录态：未登录', '#dc2626', {
        autoFade: true,
        fadeDelay: 1800,
        statusKey: 'not-logged-in',
        silentIfSame: !force,
      });
      return;
    }

    const fingerprint = getFingerprint(auth);
    if (!force && fingerprint === lastFingerprint) {
      return;
    }

    const results = await Promise.all(LOCAL_SERVERS.map((server) => postAuth(server, auth)));
    const successTargets = results.filter((item) => item.ok);

    if (successTargets.length) {
      lastFingerprint = fingerprint;
      const targetsText = successTargets.map((item) => item.server.label).join(' + ');
      setBadge(`桥接登录态：已同步到 ${targetsText} ${auth.username || auth.companyName || ''}`, '#16a34a', {
        autoFade: true,
        fadeDelay: 2200,
        statusKey: `synced:${targetsText}:${auth.username || auth.companyName || ''}`,
      });
      return;
    }

    setBadge('桥接登录态：本地服务未启动', '#dc2626', {
      autoFade: true,
      fadeDelay: 1600,
      statusKey: 'service-offline',
      silentIfSame: !force,
    });
  }

  function boot() {
    syncAuth(true);
    setInterval(() => syncAuth(false), 15000);
    window.addEventListener('focus', () => syncAuth(false));
    window.addEventListener('storage', () => syncAuth(true));
  }

  setTimeout(boot, 1200);
})();
