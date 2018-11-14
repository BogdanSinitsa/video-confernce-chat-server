"use strict";

const ROLE = {
    BROADCASTER  : 'broadcaster',
    VIEWER       : 'viewer',
    ADMIN        : 'admin',
    MOBILE_VIEWER: 'mobileViewer'
};

class User {

    /**
     *
     * @returns {{BROADCASTER: string, VIEWER: string, ADMIN: string, MOBILE_VIEWER: string}}
     * @constructor
     */
    static get ROLE() {
        return ROLE;
    }

    //<editor-fold desc="Properties">
    /** @returns {WebClient} */
    get client() {
        return this._client;
    }

    /**
     *
     * @returns {{id: string, name: string, role: string, role_id: string, muted: string, gender: string, _userImagePath: string}|*}
     */
    get userData() {
        return this._userData;
    }

    /** @returns {boolean} */
    get mute() {
        return this._mute;
    }

    /** @param {boolean} value */
    set mute(value) {
        this._mute = value
    }

    /** @returns {boolean} */
    get tipsBlock() {
        return this._tipsBlock;
    }

    /** @param {boolean} value */
    set tipsBlock(value) {
        this._tipsBlock = value
    }

    /** @return {boolean} */
    get inPrivate() {
        return this._inPrivate;
    }

    /** @param {boolean} value */
    set inPrivate(value) {
        this._inPrivate = value;
    }
    //</editor-fold>

    /**
     *
     * @param {WebClient} client
     * @param {string} userData.id
     * @param {string} userData.name
     * @param {string} userData.role
     * @param {string} userData.role_id
     * @param {string} userData.muted
     * @param {string} userData.gender
     * @param {string} userData._userImagePath
     */
    constructor(client, userData) {
        this._client = client;
        this._userData = userData;
        this._mute = userData.muted;
        this._tipsBlock = false;
        this._inPrivate = false;
    }

    toObject() {
        return Object.assign({}, this._userData, {muted: this._mute, clientUid: this._client.uid});
    }
}

module.exports = User;

