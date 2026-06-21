// ==UserScript==
// @name         Landwu-桥接同步登录态-双兼容18888_18321-v7
// @namespace    https://user.landwu.com/
// @version      2026.04.17.2
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
  const BADGE_ID = 'landwu-bridge-badge-v7-dual';
  let lastFingerprint = '';
  let collapseTimer = null;
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

  function expandBadge() {
    const badge = document.getElementById(BADGE_ID);
    if (!badge) return;
    badge.dataset.collapsed = '0';
    badge.style.transform = 'translateX(0)';
    badge.style.opacity = '0.96';
  }

  function collapseBadge() {
    const badge = document.getElementById(BADGE_ID);
    if (!badge) return;
    badge.dataset.collapsed = '1';
    badge.style.transform = 'translateX(calc(100% - 16px))';
    badge.style.opacity = '0.76';
  }

  function getBadge() {
    let badge = document.getElementById(BADGE_ID);
    if (badge) return badge;

    badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.style.cssText = [
      'position:fixed',
      'right:10px',
      'bottom:12px',
      'z-index:999999',
      'width:220px',
      'background:rgba(17,24,39,.88)',
      'color:#fff',
      'padding:6px 10px',
      'border-radius:10px',
      'font-size:12px',
      'line-height:1.4',
      'box-shadow:0 8px 24px rgba(0,0,0,.18)',
      'opacity:.96',
      'transition:transform .22s ease, opacity .22s ease',
      'pointer-events:auto',
      'cursor:default',
      'white-space:normal',
      'word-break:break-all',
      'user-select:none',
    ].join(';');
    badge.addEventListener('mouseenter', () => {
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
      expandBadge();
    });
    badge.addEventListener('mouseleave', () => {
      if (badge.dataset.canCollapse === '1') {
        collapseBadge();
      }
    });
    document.body.appendChild(badge);
    return badge;
  }

  function setBadge(text, color = '#16a34a', options = {}) {
    const {
      autoCollapse = true,
      collapseDelay = 2200,
      keepExpanded = false,
      statusKey = '',
      silentIfSame = false,
    } = options;

    if (statusKey) {
      if (silentIfSame && lastStatusKey === statusKey) return;
      lastStatusKey = statusKey;
    }

    const badge = getBadge();
    if (collapseTimer) {
      clearTimeout(collapseTimer);
      collapseTimer = null;
    }

    badge.textContent = text;
    badge.style.border = `1px solid ${color}`;
    badge.dataset.canCollapse = keepExpanded ? '0' : '1';
    expandBadge();

    if (autoCollapse && !keepExpanded) {
      collapseTimer = setTimeout(() => {
        collapseBadge();
      }, collapseDelay);
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
        autoCollapse: true,
        collapseDelay: 1800,
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
        autoCollapse: true,
        collapseDelay: 2200,
        statusKey: `synced:${targetsText}:${auth.username || auth.companyName || ''}`,
      });
      return;
    }

    setBadge('桥接登录态：本地服务未启动', '#dc2626', {
      autoCollapse: true,
      collapseDelay: 1500,
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
