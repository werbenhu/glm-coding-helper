// ==UserScript==
// @name         GLM Coding Captcha Direct Bridge
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Direct Tencent captcha iframe image grabber for local CNCAPTCHA backend.
// @match        https://*.gtimg.com/*
// @match        https://*.captcha.qcloud.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @connect      127.0.0.1:8888
// @connect      127.0.0.1
// @connect      gtimg.com
// @connect      *.gtimg.com
// @connect      captcha.qcloud.com
// @connect      *.captcha.qcloud.com
// @connect      turing.captcha.qcloud.com
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    var OCR_URL = 'http://127.0.0.1:8888/captcha_direct';
    var solving = false;
    var lastBgUrl = '';
    var cfg = (function () {
        try {
            var raw = GM_getValue('glm_coding_config_v5', '{}');
            var parsed = JSON.parse(raw || '{}');
            return Object.assign({ AUTO_CAPTCHA_CLICK: true, AUTO_CAPTCHA_CONFIRM: false }, parsed);
        } catch (e) {
            return { AUTO_CAPTCHA_CLICK: true, AUTO_CAPTCHA_CONFIRM: false };
        }
    })();

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function log(msg) {
        console.log('%c[glm-direct] ' + msg, 'color:#1890ff');
    }

    function visible(el) {
        if (!el) return false;
        var style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        var rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function backgroundUrl(el) {
        if (!el) return '';
        var bg = (el.style && el.style.backgroundImage) || window.getComputedStyle(el).backgroundImage || '';
        var m = bg.match(/url\(["']?([^"')]+)/);
        if (!m) return '';
        try { return new URL(m[1], location.href).href; } catch (e) { return m[1]; }
    }

    function findBgElement() {
        var selectors = [
            '#slideBg',
            '.tencent-captcha-dy__verify-bg-img',
            '.tencent-captcha-dy__bg-img',
            '[class*="verify-bg"]',
            '[class*="bg-img"]'
        ];
        for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (visible(el) && backgroundUrl(el)) return el;
        }
        return null;
    }

    function findPromptText() {
        var selectors = [
            '#instructionText',
            '.tencent-captcha-dy__header-text',
            '[class*="header-text"]'
        ];
        for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (!visible(el)) continue;
            var raw = (el.textContent || el.getAttribute('aria-label') || '').trim();
            var text = raw
                .replace(/^\s*\u8BF7\u4F9D\u6B21\u70B9\u51FB[:\uff1a]?\s*/, '')
                .replace(/\s+/g, '');
            var chars = (text.match(/[\u4e00-\u9fff]/g) || []).slice(-3);
            if (chars.length >= 3) return chars.join('');
        }
        return '';
    }

    function fetchImage(url) {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: function (res) {
                    var reader = new FileReader();
                    reader.onload = function () { resolve(reader.result); };
                    reader.onerror = function () { reject(new Error('FileReader failed')); };
                    reader.readAsDataURL(res.response);
                },
                onerror: function () { reject(new Error('image download failed')); }
            });
        });
    }

    function postOcr(image, text) {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'POST',
                url: OCR_URL,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    image: image,
                    text: text,
                    remark: text,
                    ts: Date.now(),
                    source: 'glm-coding-captcha-direct.user.js'
                }),
                onload: function (res) {
                    try { resolve(JSON.parse(res.responseText)); }
                    catch (e) { reject(new Error('bad OCR JSON: ' + res.responseText.slice(0, 120))); }
                },
                onerror: function () { reject(new Error('OCR request failed')); }
            });
        });
    }

    function clickAt(el, x, y) {
        var rect = el.getBoundingClientRect();
        var win = el.ownerDocument.defaultView || window;
        var base = {
            clientX: rect.left + x,
            clientY: rect.top + y,
            bubbles: true,
            cancelable: true,
            view: win,
            button: 0,
            buttons: 1
        };
        var pointer = Object.assign({}, base, {
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            pressure: 0.5
        });
        try { if (win.PointerEvent) el.dispatchEvent(new win.PointerEvent('pointerdown', pointer)); } catch (e) {}
        el.dispatchEvent(new win.MouseEvent('mousedown', base));
        try { if (win.PointerEvent) el.dispatchEvent(new win.PointerEvent('pointerup', pointer)); } catch (e) {}
        el.dispatchEvent(new win.MouseEvent('mouseup', base));
        el.dispatchEvent(new win.MouseEvent('click', base));
    }

    function clickConfirm() {
        var btn = document.querySelector('.verify-btn, .tencent-captcha-dy__verify-confirm-btn, .tencent-captcha-dy__btn-confirm');
        if (visible(btn)) btn.click();
    }

    async function solveOnce() {
        if (!cfg.AUTO_CAPTCHA_CLICK) return;
        if (solving) return;
        var bgEl = findBgElement();
        if (!bgEl) return;
        var bgUrl = backgroundUrl(bgEl);
        if (!bgUrl || bgUrl === lastBgUrl) return;
        var text = findPromptText();
        if (text.length < 3) return;

        solving = true;
        lastBgUrl = bgUrl;
        try {
            log('grab ' + text + ' ' + bgUrl.slice(0, 80));
            var image = await fetchImage(bgUrl);
            var resp = await postOcr(image, text);
            var result = resp && resp.result;
            if (!result || !result.success || !Array.isArray(result.click_coords)) {
                log('OCR failed ' + JSON.stringify(resp).slice(0, 160));
                return;
            }
            var rect = bgEl.getBoundingClientRect();
            for (var i = 0; i < result.click_coords.length; i++) {
                var p = result.click_coords[i];
                var x = Number.isFinite(Number(p.x)) ? Number(p.x) : Number(p.nx) * rect.width;
                var y = Number.isFinite(Number(p.y)) ? Number(p.y) : Number(p.ny) * rect.height;
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                clickAt(bgEl, x, y);
                await sleep(180);
            }
            await sleep(300);
            if (cfg.AUTO_CAPTCHA_CONFIRM) clickConfirm();
        } catch (e) {
            log('ERR ' + e.message);
            lastBgUrl = '';
        } finally {
            solving = false;
        }
    }

    log('started host=' + location.hostname + ' GM=' + (typeof GM_xmlhttpRequest !== 'undefined'));
    var observer = new MutationObserver(function () { setTimeout(solveOnce, 100); });
    function start() {
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
        setTimeout(solveOnce, 500);
        setInterval(solveOnce, 1200);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
