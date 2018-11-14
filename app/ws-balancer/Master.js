"use strict";

const EventEmitter   = require('events').EventEmitter;

const cluster = require('cluster');
const os      = require('os');

const TAG = "[Master]";

const EVENTS = {
    MASTER_MESSAGE : 'master-message',
    WORKER_MESSAGE : 'worker-massage',
    WORKER_CREATED : 'worker-created',
    WORKER_DIED    : 'worker-died'
};

class Master extends EventEmitter {

    /**
     *
     * @returns {{MASTER_MESSAGE: string, WORKER_MESSAGE: string, WORKER_CREATED: string, WORKER_DIED: string}}
     * @constructor
     */
    static get EVENTS() {
        return EVENTS;
    }

    /** @returns {Array<Worker>} */
    get workers() {
        return this._workers;
    }

    /** @returns {Map.<Worker, number>} */
    get workerToPortMap() {
        return this._workerToPortMap;
    }

    /** @returns {boolean} */
    get isMaster() {
        return cluster.isMaster;
    }

    constructor() {
        super();
        if(this.isMaster) {
            /**
             *
             * @type {Array}
             * @private
             */
            this._workers = [];
            /**
             *
             * @type {Map.<Worker, number>}
             * @private
             */
            this._workerToPortMap = new Map();

            /**
             * 
             * @type {number}
             * @private
             */
            this._workerCount = os.cpus().length;

            process.on('uncaughtException', (err)=>{
                // handle the error safely
                console.error(err)
            })
        }else{
            process.on('message', (data)=>this.emit(EVENTS.WORKER_MESSAGE, data));
        }
    }

    /**
     *
     * @param {Object} data
     */
    send(data) {
        process.send(data);
    }

    /**
     *
     * @param {number} startPort
     * @returns {Promise}
     */
    createWorkers(startPort) {
        return new Promise((resolve)=>{
            if (!this.isMaster) {
                throw new Error("The method createWorkers cant be called in worker process");
            }

            var spawnWorkersPromises = [];

            for (let i = 0; i < this._workerCount; i++) {
                spawnWorkersPromises.push(this._spawnWorker(startPort + i));
            }

            Promise.all(spawnWorkersPromises).then((workerPorts)=>resolve(workerPorts));
        });
    }

    /**
     * 
     * @param {number} port
     * @returns {Promise}
     * @private
     */
    _spawnWorker(port) {
        return new Promise((resolve)=>{
            var worker = cluster.fork();
            this.workerToPortMap.set(worker, port);

            var _this = this;

            worker.on('message', (data)=>_this.emit(EVENTS.MASTER_MESSAGE, worker, data));

            var pid = worker.process.pid;

            worker.on('exit', (code)=>{
                console.log(TAG, `worker=${pid} died with code=${code}`);
                _this.workerToPortMap.delete(worker);
                worker.removeAllListeners();

                _this.emit(EVENTS.WORKER_DIED, pid);

                _this._respawn(worker, port);
            });

            console.log(TAG, `worker= ${pid} spawn`);
            this.workers.push(worker);

            worker.on('message', (data)=>{
                if(data.event == 'worker-listening'){
                    console.log(TAG, `worker ${pid} listening on port ${port}`);
                    _this.emit(EVENTS.WORKER_CREATED, pid, port);
                    resolve({pid, port});
                }
            });

            worker.on('online', ()=>{
                console.log(TAG, 'shown online', pid);
                // setTimeout(()=> {//ToDo: remove before deploy
                    worker.process.send({event: 'init-worker', port: port});
                // }, 200);
            });
        });
    }

    /**
     *
     * @param {Worker} worker
     * @param  {number} port
     * @private
     */
    _respawn(worker, port) {
        var index = this.workers.indexOf(worker);
        if (index !== -1) {
            this.workers.splice(index, 1);
        }
        this._spawnWorker(port);
    }
}

module.exports = Master;