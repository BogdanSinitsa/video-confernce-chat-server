"use strict";

const WebSocketServer = require('ws').Server;

const http = require('http');

const ActionMap = require('./ActionMap');

const Balancer = require('./ws-balancer/Balancer');

const Application = require('./Application');

const config = require('./../config.json');

const TAG = "[Main]";

class Main {

    start() {
        var balancer = new Balancer();

        if(!balancer.isMaster){
            let app = new Application();

            balancer.on(Balancer.EVENTS.START_WORKER, (port)=>{
                //console.log(TAG, 'Working on port:', port);
                var server = http.createServer();
                var wss = new WebSocketServer({server});

                var actionMap = new ActionMap(wss);

                actionMap.map(Application.ACTION.CONNECT, app.connectAction).with(app);
                actionMap.map(Application.ACTION.JOIN, app.joinAction).with(app);
                actionMap.map(Application.ACTION.SEND_MESSAGE, app.sendMessageAction).with(app);
                actionMap.map(Application.ACTION.MUTE, app.muteAction).with(app);
                actionMap.map(Application.ACTION.UNMUTE, app.unmuteAction).with(app);
                actionMap.map(Application.ACTION.MAKE_ADMIN, app.makeAdmin).with(app);
                actionMap.map(Application.ACTION.MAKE_VIEWER, app.makeViewer).with(app);
                actionMap.map(Application.ACTION.SEND_TIP, app.sendTip).with(app);
                actionMap.map(Application.ACTION.SET_TIP_GOAL, app.setTipGoal).with(app);
                actionMap.map(Application.ACTION.GO_PUBLIC, app.goPublicAction).with(app);
                actionMap.map(Application.ACTION.GO_PRIVATE, app.goPrivateAction).with(app);
                actionMap.map(Application.ACTION.SET_ALLOW_GROUP_SHOW, app.setAllowGroupShow).with(app);
                actionMap.map(Application.ACTION.SET_TITLE, app.setTitle).with(app);
                actionMap.map(Application.ACTION.SET_WOWZA_ID, app.setWowzaId).with(app);
                // actionMap.map(Application.ACTION.SET_PROPERTY, app.setPropertyAction).with(app);
                // actionMap.map(Application.ACTION.REMOVE_PROPERTY, app.removePropertyAction).with(app);
                actionMap.map(Application.ACTION.CLOSE, app.closeAction).with(app);

                server.listen(port, ()=>{
                    balancer.sendToMasterWorkerListening();
                });
            });

            balancer.on(Balancer.EVENTS.GET_WORKER_STATISTICS, ()=>{
                balancer.sendWorkerStatisticsToMaster(app.collectStatistics());
            });

        }else{
            balancer.start(config.port, config['start-workers-port']);
        }
    }
}

module.exports = Main;