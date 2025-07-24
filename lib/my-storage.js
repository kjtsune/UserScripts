/*eslint no-unused-vars: "off"*/
'use strict';

/*global MyStorage*/

// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue

class MyStorage {
    constructor(prefix, expireDay = 0, splitStr = '|', useGM = false, useShared = false) {
        this.prefix = prefix;
        this.splitStr = splitStr;
        this.expireDay = expireDay;
        this.expireMs = expireDay * 864E5;
        this.useGM = useGM;
        this.useShared = useShared;

        this._getItem = (useGM) ? GM_getValue : localStorage.getItem.bind(localStorage);
        this._setItem = (useGM) ? GM_setValue : localStorage.setItem.bind(localStorage);
        this._removeItem = (useGM) ? GM_deleteValue : localStorage.removeItem.bind(localStorage);

        if (this.useShared) {
            this._initSharedStorage();

            let sTime = localStorage.getItem('SharedStorageServerTime') || 0;
            if (sTime + this._dayToMs(30) < Date.now()) {

                return new Proxy(this, {
                    get(target, prop, receiver) {
                        if (prop.startsWith('share') && typeof target[prop] === 'function') {
                            return () => null;
                        }
                        return Reflect.get(target, prop, receiver);
                    }
                });
            }

        }

    }

    _initSharedStorage() {
        // 使用全局唯一的 requestId，避免多实例冲突
        if (!window._sharedStorageGlobalState) {
            window._sharedStorageGlobalState = {
                requestId: 0,
                pendingRequests: new Map()
            };
        }

        this.globalState = window._sharedStorageGlobalState;

        // 初始化消息监听器（全局只初始化一次）
        if (!window._sharedStorageListenerInit) {
            window.addEventListener('message', (event) => {
                const { type, requestId, result, error } = event.data;

                if (type === 'SHARED_STORAGE_RESPONSE') {
                    const request = this.globalState.pendingRequests.get(requestId);
                    if (request) {
                        this.globalState.pendingRequests.delete(requestId);
                        if (error) {
                            request.reject(new Error(error));
                        } else {
                            request.resolve(result);
                        }
                    }
                }
            });
            window._sharedStorageListenerInit = true;
        }
    }

    withShared(expireDay = null) {
        expireDay = expireDay || this.expireDay
        return new MyStorage(this.prefix, expireDay, this.splitStr, this.useGM, true);
    }

    _sendSharedRequest(action, key = null, value = null, timeout = 5000) {
        return new Promise((resolve, reject) => {
            // 使用全局唯一的 requestId
            const requestNum = ++this.globalState.requestId;
            const requestId = `${action}|${key}|${performance.now()}-${Math.random()}-${requestNum}`

            this.globalState.pendingRequests.set(requestId, { resolve, reject });

            window.postMessage({
                type: 'SHARED_STORAGE',
                action,
                key,
                value,
                requestId
            }, window.location.origin);

            // 设置超时
            setTimeout(() => {
                if (this.globalState.pendingRequests.has(requestId)) {
                    this.globalState.pendingRequests.delete(requestId);
                    reject(new Error(`共享存储请求超时 (requestId: ${requestId})`));
                }
            }, timeout);
        });
    }

    _dayToMs(day) {
        return day * 864E5;
    }

    _msToDay(ms) {
        return ms / 864E5;
    }

    _keyGenerator(key) {
        return `${this.prefix}${this.splitStr}${key}`;
    }

    get(key, defalut = null) {
        key = this._keyGenerator(key);
        let res = this._getItem(key);
        if (this.expireMs && res) {
            let data = (this.useGM) ? res : JSON.parse(res);
            let expireTime = data.expireTime;
            if (!expireTime) {
                res = null
                this.del(key);
            } else {
                if (expireTime < Date.now()) {
                    res = null;
                    this.del(key);
                } else {
                    res = data.value;
                }
            }
        } else if (!this.useGM && res) {
            try {
                res = JSON.parse(res);
            } catch (_error) {
                // pass
            }
        }
        res = res || defalut;
        return res
    }

    set(key, value) {
        key = this._keyGenerator(key);
        if (this.expireMs) {
            value = { expireTime: Date.now() + this.expireMs, value: value };
        }
        if (!this.useGM && typeof (value) == 'object') {
            value = JSON.stringify(value)
        }
        this._setItem(key, value)
    }

    del(key) {
        key = this._keyGenerator(key);
        try {
            this._removeItem(key);
        } catch (_error) {
            // pass
        }
    }

    async shareGet(key, defaultValue = null) {
        const fullKey = this._keyGenerator(key);
        try {
            let res = await this._sendSharedRequest('GET', fullKey);
            if (this.expireMs && res) {
                let expireTime = res.expireTime;
                if (!expireTime) {
                    res = null
                    await this.shareDel(key);
                } else {
                    if (expireTime < Date.now()) {
                        res = null;
                        await this.shareDel(key);
                    } else {
                        res = res.value;
                    }
                }
            }
            return res !== null ? res : defaultValue;
        } catch (error) {
            console.error('MyStorage shareGet error:', error);
            return defaultValue;
        }
    }

    async shareSet(key, value) {
        const fullKey = this._keyGenerator(key);
        try {
            let finalValue = value;
            if (this.expireMs) {
                finalValue = { expireTime: Date.now() + this.expireMs, value: value };
            }
            await this._sendSharedRequest('SET', fullKey, finalValue);
        } catch (error) {
            console.error('MyStorage shareSet error:', error);
        }
    }

    async shareDel(key) {
        const fullKey = this._keyGenerator(key);
        try {
            await this._sendSharedRequest('DELETE', fullKey);
        } catch (error) {
            console.error('MyStorage shareDel error:', error);
        }
    }
}