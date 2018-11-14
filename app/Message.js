"use strict";

const _TYPE = {
    PUBLIC: "public",
    PRIVATE: "private",
    PRIVATE_CHAT: "private-chat",
    NOTIFICATION: "notification"
};

class Message {

    /**
     *
     * @return {{PUBLIC: string, PRIVATE: string, PRIVATE_CHAT: string, NOTIFICATION: string}}
     */
    static get TYPE(){return _TYPE}

    /**
     *
     * @param {string} senderData
     * @param {string} message
     * @param {string} type
     * @param {string} txtColor
     */
    constructor(senderData, message, type, txtColor) {
        this.senderData = senderData;
        this.message = message;
        this.type = type;
        this.txtColor = txtColor;
    }
}

module.exports = Message;