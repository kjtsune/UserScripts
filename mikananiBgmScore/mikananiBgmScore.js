// ==UserScript==
// @name         mikananiBgmScore
// @namespace    https://github.com/kjtsune/UserScripts
// @version      0.1
// @description  在蜜柑计划首页显示 Bangumi 评分及跳转链接。
// @author       kjtsune
// @match        https://mikanani.me/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mikanani.me
// @grant        none
// ==/UserScript==
'use strict';

let config = { logLevel: 2 };

let logger = {
    error: function (...args) {
        if (config.logLevel >= 1)
            console.log("%cerror", "color: yellow; font-style: italic; background-color: blue;",
                args);
    },
    info: function (...args) {
        if (config.logLevel >= 2)
            console.log("%cinfo", "color: yellow; font-style: italic; background-color: blue;",
                args);
    },
    debug: function (...args) {
        if (config.logLevel >= 3)
            console.log("%cdebug", "color: yellow; font-style: italic; background-color: blue;",
                args);
    },
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJSON(url) {
    try {
        const response = await fetch(url);
        logger.info(`fetch ${url}`)
        if (response.status >= 200 && response.status < 400)
            return await response.json();
        console.error(`Error fetching ${url}:`, response.status, response.statusText, await response.text());
    }
    catch (e) {
        console.error(`Error fetching ${url}:`, e);
    }
}

async function getBgmJson(bgmId) {
    let url = `https://api.bgm.tv/v0/subjects/${bgmId}`
    return await getJSON(url)
}

function multiTimesSeletor(storage = null, seletorAll = false, ...cssSeletor) {
    const seletor = cssSeletor[0]
    const restSeletor = cssSeletor.slice(1)
    if (!seletor) return storage;

    function queryForArray(query, array) {
        let result = [];
        for (let index = 0; index < array.length; index++) {
            const element = array[index];
            let res = element.querySelectorAll(query);
            if (!res) logger.error("not result", query, array);
            result.push(...res);
        }
        return result
    }
    if (seletorAll) {
        storage = storage || [document]
        let res = queryForArray(seletor, storage);
        if (res) storage = res;
        storage && logger.debug('storage', storage.length, seletor, restSeletor);
        if (!restSeletor) {
            return storage;
        } else {
            return multiTimesSeletor(storage, true, ...restSeletor);
        }
    } else {
        storage = storage || document;
        const lastRes = storage;
        storage = storage.querySelector(seletor);
        storage && logger.debug('storage', storage, seletor);
        if (!storage) logger.error("not result", seletor, lastRes);
        if (!restSeletor) {
            return storage;
        } else {
            return multiTimesSeletor(storage, false, ...restSeletor);
        }
    }
}

async function myFetch(url, selector = null, selectAll = false) {
    let response = await fetch(url);
    let text = await response.text();
    const parser = new DOMParser();
    const htmlDocument = parser.parseFromString(text, "text/html");
    const element = htmlDocument.documentElement;
    if (!selector) return element;
    if (selectAll) {
        return element.querySelectorAll(selector);
    } else {
        return element.querySelector(selector);
    }
}

async function getBgmId(mikanUrl) {
    let selector = "p.bangumi-info > a[href*='tv/subject']";
    let bgm = await myFetch(mikanUrl, selector);
    if (bgm) bgm = bgm.href.split("/").slice(-1)[0];
    return bgm
}

class MyStorage {
    constructor(prefix, splitStr = '|', expireDay = 0) {
        this.prefix = prefix;
        this.splitStr = splitStr;
        this.expireMs = expireDay * 864E5
    }

    _keyGenerator(key) {
        return `${this.prefix}${this.splitStr}${key}`
    }

    get(key, defalut = null) {
        key = this._keyGenerator(key);
        let res = localStorage.getItem(key);
        if (this.expireMs && res) {
            res = JSON.parse(localStorage.getItem(key)).value;
        }
        res = res || defalut;
        return res
    }

    set(key, value) {
        key = this._keyGenerator(key);
        if (this.expireMs) {
            value = JSON.stringify({ timestamp: Date.now(), value: value })
        }
        localStorage.setItem(key, value)
    }

    del(key) {
        key = this._keyGenerator(key);
        if (key in localStorage) { localStorage.removeItem(key) };
    }

    checkIsExpire(key) {
        key = this._keyGenerator(key);
        if (!(key in localStorage)) return true;
        if (!this.expireMs && key in localStorage) { return false };
        let timestamp = JSON.parse(localStorage.getItem(key)).timestamp;
        if (!timestamp) throw `checkIsExpire not work , not timestamp, key: ${key}`;
        if (timestamp + this.expireMs < Date.now()) {
            return true;
        } else {
            return false;
        }
    }
}

let mikanBgmStorage = new MyStorage("mikan");
let bgmInfoStorage = new MyStorage("bgm", undefined, 7);

async function storeMikanBgm(mikanElementList, storeBgmInfo = false) {

    async function checkBgmInfoExist(mkId) {
        let bgmId = mikanBgmStorage.get(mkId);
        if (!bgmId) return;
        if (bgmInfoStorage.checkIsExpire(bgmId)) {
            bgmInfoStorage.set(bgmId, await parseBgmInfo(bgmId));
        }
    }

    for (const element of mikanElementList) {
        let mikanUrl = element.href;
        let mikanId = mikanUrl.split('/').slice(-1)[0];
        if (storeBgmInfo) await checkBgmInfoExist(mikanId);
        if (!mikanBgmStorage.checkIsExpire(mikanId)) { continue };
        let bgmId = await getBgmId(mikanUrl);
        logger.info("fetch run", mikanId)
        await sleep(1000);
        if (mikanBgmStorage.checkIsExpire(mikanId)) {
            mikanBgmStorage.set(mikanId, bgmId);
            logger.info(`set ${mikanId} to ${bgmId}`);
        }
    }
}

async function parseBgmInfo(bgmId, stringify = false) {
    let bgmJson = await getBgmJson(bgmId);
    let score = (bgmJson) ? bgmJson.rating.score : 0.1;
    let summary = (bgmJson) ? bgmJson.summary : "maybe 18x";
    let res = { score: score, summary: summary }
    res = (stringify) ? JSON.stringify(res) : res;
    return res
}

async function addScoreSummaryToHtml(mikanElementList) {
    for (const element of mikanElementList) {
        let scoreElement = element.nextElementSibling;
        if (scoreElement) continue;
        let mikanUrl = element.href;
        let mikanId = mikanUrl.split('/').slice(-1)[0];
        let bgmId = mikanBgmStorage.get(mikanId);
        let bgmInfo = bgmInfoStorage.get(bgmId);
        if (!bgmId || !bgmInfo) continue;
        let bgmUrl = `https://bgm.tv/subject/${bgmId}`
        let score = bgmInfo.score;
        let summary = bgmInfo.summary
        let bgmHtml = `<a href="${bgmUrl}" target="_blank" title="${summary}" id="bgmScore">${score}</a>`
        element.insertAdjacentHTML("afterend", bgmHtml);
        let pathName = element.pathname;
        let mobileElement = document.querySelectorAll(`a[href="${pathName}"`)[1].nextElementSibling
        let title = mobileElement.textContent;
        let mobileHtml = `<a href="${bgmUrl}" target="_blank" title="${summary}" id="bgmScore">${title} ${score}</a>`
        mobileElement.insertAdjacentHTML("afterend", mobileHtml);
        mobileElement.remove();
    }
}

async function main() {
    let animeList = multiTimesSeletor(null, true, "div.sk-bangumi", "a[href^='/Home/Bangumi']");
    // animeList = animeList.slice(0, 81);
    await storeMikanBgm(animeList, true);
    await addScoreSummaryToHtml(animeList);
    logger.info(animeList)

}

(function loop() {
    setTimeout(async function () {
        let start = Date.now()
        await main();
        let usedSec = (Date.now() - start) / 1000;
        if (usedSec > 0.01) logger.info(`used time ${usedSec}`);
        loop();
    }, 2000);
})();
