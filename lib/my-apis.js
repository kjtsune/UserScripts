/*eslint no-unused-vars: "off"*/
'use strict';

/*global BaseApi BangumiApi EmbyApi TraktApi TmdbApi */

// @grant        GM_xmlhttpRequest

let _config = {
    logLevel: 2,
    logStack: false,
};

let _logger = {
    error: function (...args) {
        if (_config.logLevel >= 1) {
            const stack = _config.logStack
                ? `\n→ ${new Error().stack.split('\n')[2].trim()}`
                : '';
            console.log('%cerror', 'color: yellow; font-style: italic; background-color: blue;', ...args, stack);
        }
    },
    info: function (...args) {
        if (_config.logLevel >= 2) {
            const stack = _config.logStack
                ? `\n→ ${new Error().stack.split('\n')[2].trim()}`
                : '';
            console.log('%cinfo', 'color: yellow; font-style: italic; background-color: blue;', ...args, stack);
        }
    },
    debug: function (...args) {
        if (_config.logLevel >= 3) {
            const stack = _config.logStack
                ? `\n→ ${new Error().stack.split('\n')[2].trim()}`
                : '';
            console.log('%cdebug', 'color: yellow; font-style: italic; background-color: blue;', ...args, stack);
        }
    },
};

function _myBool(value) {
    if (Array.isArray(value) && value.length === 0) return false;
    if (value !== null && typeof value === 'object' && Object.keys(value).length === 0) return false;
    return Boolean(value);
}

class BaseApi {
    constructor(host, storageSetting = null) {
        host = new URL(host);
        this.host = `${host.protocol}//${host.host}`;
        this.headers = {};
        this.storage = {};
        if (storageSetting) { this._initStorage(storageSetting); }
        this._trimStringProperties();
    }

    _trimStringProperties() {
        for (const key in this) {
            if (typeof this[key] === 'string') {
                this[key] = this[key].trim();
            }
        }
    }

    _initStorage(storageSetting) {
        // storageSetting = {
        //     'class': MyStorage,
        //     '__default': {'prefix': 'bgm|df', 'expireDay':null},
        //     'getSubject': {'prefix': 'bgm|subj', 'expireDay':null},
        //     'getRelated': {'prefix': 'bgm|rela', 'expireDay':7},
        // }
        let Storage = storageSetting['class'];
        delete storageSetting['class'];
        for (const key in storageSetting) {
            let settings = storageSetting[key];
            this.storage[key] = new Storage(settings.prefix, settings.expireDay)
        }
    }

    _req(method, path, params = null, json = null, preload = null) {
        let query = (params) ? new URLSearchParams(params).toString() : '';
        let url = (query) ? `${this.host}/${path}?${query}` : `${this.host}/${path}`;
        let headers = (_myBool(this.headers)) ? this.headers : undefined;
        let data = (json) ? JSON.stringify(json) : undefined;
        if (method === 'POST' && preload) {
            data = new URLSearchParams(preload);
            headers = headers || {}
            headers = { ...headers, ...{ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', } }
        }
        let res = new Promise((resolve) => {
            let isResolved = false;
            const timeout = setTimeout(() => {
                if (!isResolved) {
                    console.error(`Request to ${url} timed out after 8 seconds.`);
                    resolve();
                    isResolved = true;
                }
            }, 8000);

            GM_xmlhttpRequest({
                method: method,
                url: url,
                headers: headers,
                data: data,
                onload: function (response) {
                    if (!isResolved) {
                        clearTimeout(timeout);
                        if (response.status >= 200 && response.status < 400) {
                            let _res = JSON.parse(response.responseText);
                            resolve(_res);
                            console.info(`xmlhttp getting ${url}:`, response.status, response.statusText, _res);
                        } else if (response.status > 400) {
                            console.error(`Error getting ${url}:`, response.status, response.statusText);
                            resolve();
                        } else {
                            console.error(`Error getting ${url}:`, response.status, response.statusText, response.responseText);
                            resolve();
                        }
                        isResolved = true;
                    }
                },
                onerror: function (response) {
                    if (!isResolved) {
                        clearTimeout(timeout);
                        console.error(`Error during GM_xmlhttpRequest to ${url}:`, response.statusText);
                        resolve();
                        isResolved = true;
                    }
                }
            });
        });

        return res;
    }

    _get(path, params = null) {
        return this._req('GET', path, params);
    }

    _post(path, json = null, params = null) {
        return this._req('POST', path, params, json);
    }

    async _getWithStorage(key, url, funcName) {
        let storageCur = (Object.prototype.hasOwnProperty.call(this.storage, funcName)) ? this.storage[funcName] : null;
        let res = (storageCur) ? storageCur.get(key) : null;
        if (res) {
            res = (typeof (res) == 'object') ? res : JSON.parse(res);
        } else {
            res = await this._get(url);
            storageCur && res && storageCur.set(key, res);
        }
        return res;
    }

}

class BangumiApi extends BaseApi {
    constructor(storageSetting = null, userName = null, accessToken = null, isPrivate = true) {
        super('https://api.bgm.tv/v0', storageSetting); // v0 会被清除。
        this.userName = userName;
        this.accessToken = accessToken;
        this.isPrivate = isPrivate;
        this._trimStringProperties();
    }
    async _get(path, params = null) {
        let res = await this._req('GET', `v0/${path}`, params);
        if (res !== null && typeof res === 'object' && res.error == 'Not Found') { return null; }
        return res;
    }

    async getSubject(subjectId) {
        let key = subjectId;
        let url = `subjects/${subjectId}`;
        let funcName = this.getSubject.name;
        let res = await this._getWithStorage(key, url, funcName);
        return res;
    }

    async getRelated(subjectId) {
        let key = subjectId;
        let url = `subjects/${subjectId}/subjects`;
        let funcName = this.getRelated.name;
        let res = await this._getWithStorage(key, url, funcName);
        return res;
    }

    async getFistSeason(subjectId) {
        let curId = subjectId;
        while (true) {
            let curRelated = await this.getRelated(curId)
            _logger.info('curRelated', curRelated);
            let preSubj = (curRelated.error != 'Not Found') ? curRelated.filter(i => i.relation === '前传') : null;
            if (_myBool(preSubj)) {
                curId = preSubj[0]['id'];
                continue
            } else {
                return this.getSubject(curId);
            }
        }

    }
}

class EmbyApi extends BaseApi {
    constructor(host, apiKey = '', userId = '', userName = '', passWord = '') {
        super(host);
        this.apiKey = apiKey;
        this.userId = userId;
        this.userName = userName;
        this.passWord = passWord;
        this._defaultFields = [
            'PremiereDate',
            'ProviderIds',
            'CommunityRating',
            'CriticRating',
            'OriginalTitle',
            'Path',
        ].join(',');
        this._trimStringProperties();
        this._updateParamsGet();
    }

    _updateParamsGet() {
        this._paramsGet = { 'api_key': this.apiKey };
    }

    _get(path, params = null) {
        path = `emby/${path}`;
        return super._get(path, { ...this._paramsGet, ...params });
    }

    async checkTokenAlive(storageClass) { // MyStorage
        if ([this.apiKey, this.userName, this.passWord].every(v => !v)) { throw ('emby apikey or password require'); }
        let apiDb = new storageClass('emby|api', undefined, undefined, true);
        let apiWorkDb = new storageClass('emby|apiWork', 1, undefined, true);
        let host = new URL(this.host).host;
        this.apiKey = this.apiKey || apiDb.get(host);
        this._updateParamsGet();
        // 仅每天检查一次。
        let workDbKey = `${host}|${this.apiKey}`
        if (apiWorkDb.get(workDbKey)) { return; }
        let isWork;
        if (this.apiKey) {
            isWork = await this._get('System/Info');
            _logger.info(`Emby checkTokenAlive by ${host}`)
        } else {
            isWork = false;
        }
        if (isWork) {
            apiWorkDb.set(workDbKey, true);
            return;
        }
        // 仅设置 apiKey，apiKey 最优先。
        if (this.apiKey && !apiDb.get(host)) {
            throw new Error(`Emby api auth fail, ${this.host}  ${this.apiKey}`);
        }
        let authData;
        // 首次运行时，或者储存的密钥失效。
        if (!this.apiKey && !apiDb.get(host) || apiDb.get(host)) {
            authData = await this.authByName();
            this.apiKey = authData.AccessToken;
            this.apiKey && apiDb.set(host, this.apiKey);
            this._updateParamsGet();
            _logger.info(`Emby authByName by ${host}`)
            return;
        }
        throw new Error(`Emby auth fail, ${this.host}  ${this.userName}  ${this.passWord}`);
    }

    async authByName() {
        let headers = this.headers;
        let res = await this._req('POST', 'emby/Users/authenticatebyname', {
            'X-Emby-Client': 'Emby Web',
            'X-Emby-Device-Id': 'Chrome Windows',
            'X-Emby-Client-Version': '4.8.8.0'
        },
            null,
            { 'Username': this.userName, 'Pw': this.passWord })
        this.headers = headers
        return res
    }

    async getGenreId(genre) {
        let res = await this._get(`Genres/${genre}`).Id
        if (!res) { throw `Genres/${genre} not exists, check it`; }
        return res;
    }

    async getItems({ genre = '', types = 'Movie,Series,Video', fields = null, startIndex = 0,
        ids = null, limit = 50, parentId = null,
        sortBy = 'DateCreated,SortName', recursive = true, extParams = null }) {
        fields = fields || this._defaultFields;
        let params = {
            'HasTmdbId': true,
            'SortBy': sortBy,
            'SortOrder': 'Descending',
            'IncludeItemTypes': types,
            'Recursive': recursive,
            'Fields': fields,
            'StartIndex': startIndex,
            'Limit': limit,
            'api_key': this.apiKey,
        };
        if (genre) {
            params['GenreIds'] = await this.getGenreId(genre);
        }
        if (ids) {
            params['Ids'] = ids;
        }
        if (parentId) {
            params['ParentId'] = parentId;
        }
        if (extParams) {
            Object.assign(params, extParams);
        }

        return await this._get('Items', params);
    }

    async searchByName(name, premiereDate = null, itemTypes = 'Series,Movie', daysBefore = 10, daysAfter = 20) {
        let query = {
            'Fields': this._defaultFields,
            'Recursive': true,
            'GroupProgramsBySeries': true,
            'SearchTerm': name,
        }
        if (premiereDate) {
            premiereDate = new Date(premiereDate);
            premiereDate.setDate(premiereDate.getDate() - daysBefore);
            let minDate = premiereDate.toISOString().slice(0, 10);
            premiereDate.setDate(premiereDate.getDate() + daysAfter);
            let maxDate = premiereDate.toISOString().slice(0, 10);
            query['MinPremiereDate'] = minDate;
            query['MaxPremiereDate'] = maxDate;
        }
        if (itemTypes) {
            query['IncludeItemTypes'] = itemTypes;
        }
        let userPath = '';
        if (this.userId) {
            userPath = `Users/${this.userId}/` // 加用户ID会将不同路径的相同条目合并为一个。但会慢一点。
        }
        let res = await this._get(`${userPath}Items`, query);
        return res.Items;
    }

    async searchByProviiderIds(tkIds, type = undefined) {
        // 只能搜索主条目，集和季不行。集要加 Recursive 和去除 HasTmdbId
        const idsParam = Object.entries(tkIds)
            .filter(([k, v]) => v && (type || k !== 'tmdb')) // 修改这一行
            .map(([k, v]) => `${k}.${v}`)
            .join(',');

        const extParams = { AnyProviderIdEquals: idsParam };
        if (type == 'Episode') {
            extParams['HasTmdbId'] = '';
        }
        const res = await this.getItems({ extParams: extParams, types: type });
        return res.Items;
    }

    itemObjToUrl(item) {
        let url = `${this.host}/web/index.html#!/item?id=${item.Id}&serverId=${item.ServerId}`
        return url;
    }
}

class TraktApi extends BaseApi {
    constructor(userName, clientId, clientSecret, tokenObj) {
        super('https://api.trakt.tv');
        this.userName = userName;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.tokenObj = tokenObj;
        this.headers = {
            'Accept': 'application/json',
            'trakt-api-key': this.clientId,
            'trakt-api-version': '2',
        };
        if (![this.userName, this.clientId, this.clientSecret, _myBool(this.tokenObj)].every(v => v)) {
            throw new Error('Require userName, clientId, clientSecret, tokenObj.');
        }
        this._updateHeader()
    }

    _updateHeader() {
        this.headers['Authorization'] = `Bearer ${this.tokenObj.access_token}`;
    }

    async refreshToken() {
        let expiresTime = this.tokenObj.created_at + this.tokenObj.expires_in;
        if (expiresTime > Date.now() / 1000 + 15 * 86400) {
            this.headers['Authorization'] = `Bearer ${this.tokenObj.access_token}`;
            return;
        } else {
            let data = {
                'refresh_token': this.tokenObj['refresh_token'],
                'client_id': this.clientId,
                'client_secret': this.clientSecret,
                'redirect_uri': 'http://localhost:58000/trakt',
                'grant_type': 'refresh_token'
            };

            let tokenObj = await this._req('POST', 'oauth/token', data);

            if (!_myBool(tokenObj)) {
                _logger.info('trakt: refreshToken error', tokenObj);
                return;
            }
            this.tokenObj = tokenObj;
            this._updateHeader();
            _logger.info('trakt: refreshToken success', tokenObj);
            return tokenObj;
        }
    }

    async _test() {
        let res = await this._get('calendars/my/dvd/2000-01-01/1')
        _logger.info('trakt test', res)
    }

    async idLookup(provider, id, type = '') {
        if (type) {
            type = provider === 'imdb' ? '' : `?type=${type}`;
        }
        const allowedProviders = ['tvdb', 'tmdb', 'imdb', 'trakt'];
        if (!allowedProviders.includes(provider)) {
            throw new Error(`id_type allow: ${allowedProviders}`);
        }
        const res = await this._get(`search/${provider}/${id}${type}`);
        return res;
    }

    async getWatchHistory(idsItem) {
        const type = idsItem.type;
        let pathType = type ? `${type}s` : '';
        pathType = pathType || 'episodes';
        const traktId = type ? idsItem[type].ids.trakt : idsItem.trakt;
        const res = await this._get(`users/${this.userName}/history/${pathType}/${traktId}`);
        return res;
    }

    async getShowWatchedProgress(id) {
        // Trakt ID, Trakt slug, or IMDB ID
        // 含有 aired 的数据，重置的 api 需要 vip
        const res = this._get(`shows/${id}/progress/watched`);
        return res;
    }

    async checkIsWatched(idsItem, returnList = null) {
        // id_lookup -> ids_item
        // returnList -> [bool, watchedData]
        let type = idsItem.type;
        let res;

        if (type === 'movie') {
            res = await this.getWatchHistory(idsItem);
            if (_myBool(res)) {
                return (returnList) ? [_myBool(res), res[0]] : res[0];

            }
            return (returnList) ? [_myBool(res), {}] : {};
        }

        if (type === 'episode') {
            let show = await this.getShowWatchedProgress(idsItem['show'].ids.trakt);
            let seaNum = idsItem.episode.season;
            res = show.seasons.find(season => season.number === seaNum);

        } else {
            const traktId = type ? idsItem[type].ids.trakt : idsItem.trakt;
            res = await this.getShowWatchedProgress(traktId);
        }

        const aired = res.aired;
        const completed = res.completed;

        if (completed >= aired) {
            return (returnList) ? [true, res] : res;
        }
        return (returnList) ? [false, res] : false;
    }

}

class TmdbApi extends BaseApi {
    constructor(token) {
        super('https://api.themoviedb.org/3'); // /3 会被清除
        // if (!token) {
        //     throw new Error('TMDb API key is required.');
        // }
        this.token = token;
        this.headers = {
            'Accept': 'application/json'
        };
        this._updateHeader()
    }

    _updateHeader() {
        this.headers['Authorization'] = `Bearer ${this.token}`;
    }

    _get(path, params = null) {
        path = `3/${path}`;
        return super._get(path, { ...this._paramsGet, ...params });
    }

    async findById(provider, id, language = 'zh-CN') {
        if (!provider.endsWith('_id')) {
            provider += '_id';
        }
        if (!this.token) { return; }
        let query = {
            'external_source': provider,
            'language': language,
        }
        const res = await this._get(`find/${id}`, query);
        return res.movie_results[0]
            || res.tv_results[0]
            || (res.tv_episode_results[0]?.show_id ? { id: res.tv_episode_results[0].show_id, media_type: 'tv' } : null);

    }

    async tmdbExternalIds(tmdbIdStr) {
        const res = await this._get(`${tmdbIdStr}/external_ids`);
        return res;

    }

}