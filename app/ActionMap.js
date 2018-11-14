"use strict";

const url = require('url');
const querystring = require('querystring');

const WebClient = require('./WebClient');

const SYS_ACTIONS = {
    CONNECT: 'connect',
    CLOSE: 'close'
};

class ActionMap {

    /**
     *
     * @param {WebSocketServer} wss
     */
    constructor(wss) {
        this._actions = new Map();
        wss.on('connection', this._onConnection.bind(this));
        wss.on('error', (e)=>{
            this._logError(e, "Socket server");
        });
    }

    /**
     *
     * @param {string} action
     * @param {Function} func
     */
    map(action, func) {
        var actionItem = {
            action: func,
            context: null
        };

        this._actions.set(action, actionItem);
        return {
            with: (context)=>{
                actionItem.context = context;
            }
        }
    }

    /**
     *
     * @param {string} action
     * @param {Array} params
     * @returns {*}
     * @private
     */
    _runAction(action, params) {
        var actionItem = this._actions.get(action);
        return actionItem.action.apply(actionItem.context, params);
    }

    /**
     *
     * @param {WebSocket} ws
     * @private
     */
    _onConnection(ws) {
        ws._socket.setKeepAlive(true);
        var client  = new WebClient(ws);

        if(this._actions.has(SYS_ACTIONS.CONNECT)){
            var query = url.parse(ws.upgradeReq.url).query;
            var params = querystring.parse(query);

            var args = this._formArgs(client, params);
            try {
                this._runAction(SYS_ACTIONS.CONNECT, args);
            } catch(e) {
                this._logError(e, "Connection");
            }
        }

        ws.on('message', (message)=>{
            this._onMessage(ws, client, message);
        });

        ws.on('error', (e)=>{
            this._logError(e, "Socket connection");
        });

        ws.on('close', ()=>{
            this._onClose(client);
        });
    }

    _formArgs(client, params) {
        var args = [client, params];
        //if(params){
        //    for(let p in params){
        //        args.push(params[p]);
        //    }
        //}
        return args;
    }

    _logError(e, message) {
        console.error('++++++++++++++++Error++++++++++++++++');
        console.error('Request:', message);
        console.error('Stacktrace:',e.stack);
        console.error('----------------Error----------------');
    }

    /**
     *
     * @param {WebSocket} ws
     * @param {WebClient} client
     * @param {string} message
     * @private
     */
    _onMessage(ws, client, message) {
        var isErr = false;
        var errMsg = "";

        //console.log("MSG ", message);

        try {
            var data = JSON.parse(message);
        }catch (e){
            isErr = true;
            errMsg = "Json parse error";
            console.error(errMsg);

            ws.send(JSON.stringify({
                type: 'replay',
                err: {msg: errMsg}
            }));

            return
        }

        if(!data.action){
            isErr = true;
            errMsg = "Action is not specified";
            console.error(errMsg);
        }

        if(!data.requestUid){
            isErr = true;
            errMsg = "requestUid is not specified";
            console.error(errMsg);
        }

        if(!this._actions.has(data.action)){
            isErr = true;
            errMsg = `action "${data.action}" is to mapped`;
            console.error(errMsg);
        }

        if(isErr){
            ws.send(JSON.stringify({
                type: 'replay',
                requestUid: data.requestUid,
                err: {msg: errMsg}
            }));

            return;
        }

        var args = this._formArgs(client, data.params);

        var result;
        try {
            result = this._runAction(data.action, args);
        } catch(e) {
            result = {
                err: "Internal Error"
            };
            this._logError(e, message);
        }
        var response = {
            type: 'replay',
            requestUid: data.requestUid
        };

        if(result instanceof Promise){
                result
                    .then((res)=>{
                        if(!res.err){
                            response.data = res.data;
                        }else{
                            response.err = res.err
                        }
                        ws.send(JSON.stringify(response));
                    })
                    .catch((e)=>{
                        ws.send(JSON.stringify({err: "Internal Error"}));
                        this._logError(e, message);
                    })
        }else if(result) {
            if (result.err) {
                response.err = result.err
            } else {
                response.data = result
            }
            ws.send(JSON.stringify(response));
        }
    }

    /**
     *
     * @param {WebClient} client
     * @private
     */
    _onClose(client) {
        if(this._actions.has(SYS_ACTIONS.CLOSE)){
            try {
                this._runAction(SYS_ACTIONS.CLOSE, [client]);
            } catch(e) {
                this._logError(e, 'Connection close');
            }
        }
    }
}

module.exports = ActionMap;
