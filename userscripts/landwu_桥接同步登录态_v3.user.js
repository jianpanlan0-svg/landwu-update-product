// ==UserScript==
// @name         Landwu-桥接同步登录态-v3
// @namespace    https://user.landwu.com/
// @version      2026.04.10.1
// @description  无感自动同步当前 Landwu 登录态到本地上传器，提示更轻量
// @match        https://user.landwu.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const LOCAL_SERVER = 'http://127.0.0.1:18321';
  const BADGE_ID = 'landwu-bridge-badge-v3';
  let lastFingerprint = '';
  let fadeTimer = null;

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

  function setBadge(text, color = '#16a34a', autoFade = true) {
    let badge = document.getElementById(BADGE_ID);
    if (!badge) {
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
        'opacity:.96',
        'transition:opacity .25s ease',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(badge);
    }

    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }

    badge.textContent = text;
    badge.style.border = `1px solid ${color}`;
    badge.style.opacity = '0.96';

    if (autoFade) {
      fadeTimer = setTimeout(() => {
        badge.style.opacity = '0.18';
      }, 2500);
    }
  }

  function syncAuth(force = false) {
    const auth = readAuth();
    if (!auth.token || !auth.factoryId) {
      setBadge('上传器桥接：未登录', '#dc2626', false);
      return;
    }

    const fingerprint = getFingerprint(auth);
    if (!force && fingerprint === lastFingerprint) {
      return;
    }

    GM_xmlhttpRequest({
      method: 'POST',
      url: `${LOCAL_SERVER}/api/auth/sync`,
      headers: {
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(auth),
      onload: (response) => {
        try {
          const json = JSON.parse(response.responseText || '{}');
          if (!json.ok) {
            setBadge('上传器桥接：同步失败', '#dc2626', false);
            return;
          }
          lastFingerprint = fingerprint;
          setBadge(`上传器桥接：已同步 ${auth.username || auth.companyName || ''}`, '#16a34a', true);
        } catch (error) {
          setBadge('上传器桥接：同步异常', '#dc2626', false);
        }
      },
      onerror: () => {
        setBadge('上传器桥接：本地服务未启动', '#dc2626', false);
      },
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
