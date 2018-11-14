"use strict";

const EventEmitter   = require('events').EventEmitter;

const http           = require("http");

const url         = require('url');
const querystring = require('querystring');

const fs = require('fs');

const _ = require('lodash');

const Master = require("./Master");

const TAG = "[Balancer]";

const EVENTS = {
    START_WORKER          : 'start-worker',
    GET_WORKER_STATISTICS : 'get-worker-statistics'
};

class Balancer extends EventEmitter {

    /**
     *
     * @returns {{START_WORKER: string, GET_WORKER_STATISTICS: string}}
     * @constructor
     */
    static get EVENTS() {
        return EVENTS;
    }

    /** @returns {boolean} */
    get isMaster() {
        return this._master.isMaster;
    }

    /** @returns {number} */
    get workerCount() {
        return this._workerCount
    }

    /**
     *
     * @param {number} startPort
     */
    constructor() {
        super();

        /**
         *
         * @type {Map.<number, number>}
         * @private
         */
        this._pidToPortMap = new Map();
        
        /**
         *
         * @type {Map.<string, number>}
         * @private
         */
        this._roomIdToPortMap = new Map();

        /**
         *
         * @type {Map.<string, number>}
         * @private
         */
        this._idleRoomsTimeoutMap = new Map();

        /**
         *
         * @type {Array.<{workerPid: number, numberOfUsers: number, roomIds: Array.<number>}>}
         * @private
         */
        this._workersStatistics = [];

        /**
         * 
         * @type {number}
         * @private
         */
        this._prevNumberOfUsers = 0;

        /**
         * 
         * @type {Master}
         * @private
         */
        this._master = new Master();

        this._master.on(Master.EVENTS.MASTER_MESSAGE, this._onMasterMessage.bind(this));
        this._master.on(Master.EVENTS.WORKER_MESSAGE, this._onWorkerMassage.bind(this));
    }

    /**
     *
     * @param {Worker} worker
     * @param {string} data.event
     * @private
     */
    _onMasterMessage(worker, data) {
        if(data.event == 'respond-worker-statistics'){
            this._onStatisticsRevived(worker.process.pid, data.data);
        }
    }

    /**
     *
     * @param {string} data.event
     * @private
     */
    _onWorkerMassage(data) {
        if(data.event == 'init-worker'){
            this.emit(EVENTS.START_WORKER, data.port);
        }else if(data.event == 'request-worker-statistics'){
            this.emit(EVENTS.GET_WORKER_STATISTICS);
        }
    }

    /**
     * Available at worker process
     * @param {Object} data
     */
    sendWorkerStatisticsToMaster(data) {
        this._master.send({event: 'respond-worker-statistics', data: data});
    }

    /**
     * Available at worker process
     */
    sendToMasterWorkerListening() {
        this._master.send({event: 'worker-listening'});
    }

    /**
     * Available at master process
     * @param {number} workerPid
     * @param {Object} data
     * @private
     */
    _onStatisticsRevived(workerPid, data) {
        var workerStatistics = Object.assign({}, { workerPid }, data);

        var index = _.findIndex(this._workersStatistics, {workerPid});

        if(index != -1){
            this._workersStatistics[index] = workerStatistics;
        }else{
            this._workersStatistics.push(workerStatistics);
        }

        var numberOfUsers = _.sumBy(this._workersStatistics, 'numberOfUsers');
        if(numberOfUsers != this._prevNumberOfUsers){
            this._prevNumberOfUsers = numberOfUsers;
            console.log('Users: ', numberOfUsers);
        }

        this._cleanUpRoomIdToPortMap(workerStatistics);
        //console.log(TAG, "Active rooms", this._roomIdToPortMap);
    }

    /**
     *
     * @private
     */
    _startStatisticsLogger() {
        var prevStatisticsStr = '';
        setInterval(()=>{
            var statisticsStr = '';
            for(let statistic of this._workersStatistics){
                statisticsStr += '\n' + JSON.stringify(statistic);
            }

            if(statisticsStr != prevStatisticsStr){
                prevStatisticsStr = statisticsStr;
                console.log('-------------Workers statistics-------------', statisticsStr);
            }
        }, 20000);
    }

    /**
     * 
     * @param {number} port
     * @returns {Array.<number>}
     * @private
     */
    _getRoomIdsByPort(port) {
        var roomIds = [];
        this._roomIdToPortMap.forEach((wPort, roomId)=>{
            if(wPort == port){
                roomIds.push(roomId);
            }
        });
        return roomIds;
    }

    /**
     * 
     * @param {{workerPid: *, numberOfUsers: number, roomIds: Array}} workerStatistics
     * @private
     */
    _cleanUpRoomIdToPortMap(workerStatistics) {
        var port = this._pidToPortMap.get(workerStatistics.workerPid);

        var roomIds = this._getRoomIdsByPort(port);

        for(let roomId of roomIds){
            var isRoomActive = false;

            //ToDo: move to config idle room time.
            if(this._idleRoomsTimeoutMap.has(roomId)){
                if (Date.now() - this._idleRoomsTimeoutMap.get(roomId) <= 10000){
                }else{
                    this._idleRoomsTimeoutMap.delete(roomId);
                }
                continue;
            }

            for(let workerStats of this._workersStatistics) {
                if(workerStats.roomIds.indexOf(roomId) != -1){
                    isRoomActive = true;
                    break;
                }
            }

            if(!isRoomActive){
                this._roomIdToPortMap.delete(roomId);
                console.log(TAG, "cleaned room:", roomId);
            }
        }
    }

    _runCollectingStatistics() {
        setInterval(()=>{
            // console.log(TAG, "Request statistics");
            for(let worker of this._master.workers) {
                worker.send({event: 'request-worker-statistics'});
            }
        } , 10000);
    }

    /**
     * 
     * @param {string} query
     * @returns {string|null}
     * @private
     */
    _parseRoomId(query) {
        return querystring.parse(url.parse(query).query).roomId || null;
    }

    /**
     * 
     * @param {number} port
     * @private
     */
    _runHttpServer(port) {
        var _this = this;

        var crossDomainContent = fs.readFileSync('./crossdomain.xml');
        
        var server = http.createServer((req, res)=>{
            if(req.url == '/crossdomain.xml'){
                res.setHeader('Content-Type', 'application/xml');
                res.setHeader('Content-Length', crossDomainContent.length);
                res.end(crossDomainContent);
                return;
            }
            
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');

            var roomId = this._parseRoomId(req.url);

            if(req.url.indexOf('create')==-1 && !_this._roomIdToPortMap.has(roomId)){
                res.end(JSON.stringify({redirect: true}));
                return
            }

            var port = _this._roomIdToPortMap.get(roomId);

            if (!port) {
                /**
                 * @type {{workerPid: *, numberOfUsers: number, roomIds: Array}}
                 */
                var minLoadWorker = _.minBy(_this._workersStatistics, 'numberOfUsers');
                minLoadWorker.numberOfUsers++;
                port = _this._pidToPortMap.get(minLoadWorker.workerPid);
                _this._roomIdToPortMap.set(roomId, port);
                this._idleRoomsTimeoutMap.set(roomId, Date.now());
                console.log(TAG, `room ${roomId} mapped to port`, port);
            }

            res.end(JSON.stringify({port}));
        });

        server.on('listening', ()=>{
           console.log(TAG, 'HTTP server running');
        });

        server.listen(port);
    }

    /**
     * 
     * @param {number} workerPid
     * @returns {{workerPid: *, numberOfUsers: number, roomIds: Array}}
     * @private
     */
    _getInitWorkerStats(workerPid) {
        return { workerPid, numberOfUsers: 0, roomIds: [] }
    }

    /**
     * 
     * @param {number} pid
     * @param {number} port
     * @private
     */
    _onWorkerResurrection(pid, port) {
        this._pidToPortMap.set(pid, port);
        this._workersStatistics.push(this._getInitWorkerStats(pid));
        console.log(TAG, "On worker resurrection", pid, port);
    }

    /**
     * 
     * @param {number} pid
     * @private
     */
    _onWorkerDie(pid) {
        var port =  this._pidToPortMap.get(pid);

        console.log(TAG, "On worker died clean up", pid);
        
        //Clean pid to port map
        this._pidToPortMap.delete(pid);

        //Clean roomId to port
        var roomIds = this._getRoomIdsByPort(port);
        for(let roomId of roomIds){
            if(this._idleRoomsTimeoutMap.has(roomId)){
                this._idleRoomsTimeoutMap.delete(roomId);
            }
            this._roomIdToPortMap.delete(roomId);
        }

        //Clean statistics
        var index = _.findIndex(this._workersStatistics, {workerPid: pid});
        if (index !== -1) {
            this._workersStatistics.splice(index, 1);
        }
    }

    /**
     * 
     * @param {number} wsPort
     * @param {number} workersStartPort
     */
    start(wsPort, workersStartPort) {
        if (this.isMaster) {
            this._master.createWorkers(workersStartPort)
                .then((workerPorts)=>{
                    this._master.on(Master.EVENTS.WORKER_CREATED, this._onWorkerResurrection.bind(this));
                    this._master.on(Master.EVENTS.WORKER_DIED, this._onWorkerDie.bind(this));

                    for(let workerPort of workerPorts){
                        this._pidToPortMap.set(workerPort.pid, workerPort.port);
                        this._workersStatistics.push(this._getInitWorkerStats(workerPort.pid));
                    }
                    //console.log(TAG, "pidToPortMap", this._pidToPortMap);

                    this._runHttpServer(wsPort);
                    this._runCollectingStatistics();
                    // this._startStatisticsLogger();
                });
        }else{
            throw new Error('The method start can\'t be called in worker process');
        }
    }
}

module.exports = Balancer;
