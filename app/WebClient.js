"use strict";

const uuid = require('node-uuid');

const WebSocket = require('ws');

class WebClient {

    get uid() {return this._uid};

    /**
     *
     * @param {WebSocket} ws
     */
    constructor(ws){
        this._uid = uuid.v1();
        this._ws = ws;
    }

    /**
     *
     * @param {string} notification
     * @param {Object} data
     */
    notify(notification, data){
        if(this._ws.readyState == WebSocket.OPEN) {
            this._ws.send(JSON.stringify({
                notification: notification,
                type: 'notification',
                data: data
            }));
        }
    }
    
    close(silent) {
        if(silent){
            this._ws.removeAllListeners();
        }
        this._ws.close();
    }
}

module.exports = WebClient;
