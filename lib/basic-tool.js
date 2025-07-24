/*eslint no-unused-vars: "off"*/
'use strict';

/*global MyLogger myBool */

function myBool(value) {
    if (Array.isArray(value) && value.length === 0) return false;
    if (value !== null && typeof value === 'object' && Object.keys(value).length === 0) return false;
    return Boolean(value);
}

class MyLogger {
    constructor({ logLevel = 1, logStack = false } = {}) {
        this.logLevel = logLevel;
        this.logStack = logStack;
        this.styles = {
            error: 'color: yellow; font-style: italic; background-color: blue;',
            info: 'color: yellow; font-style: italic; background-color: blue;',
            debug: 'color: yellow; font-style: italic; background-color: blue;',
        };
    }

    _getStack() {
        return this.logStack
            ? `\n→ ${new Error().stack.split('\n')[3]?.trim() || ''}`
            : '';
    }

    _log(level, ...args) {
        const levels = { error: 1, info: 2, debug: 3 };
        if (this.logLevel >= levels[level]) {
            console.log(`%c${level}`, this.styles[level], ...args, this._getStack());
        }
    }

    error(...args) {
        this._log('error', ...args);
    }

    info(...args) {
        this._log('info', ...args);
    }

    debug(...args) {
        this._log('debug', ...args);
    }
}