/*
 * Created by Henry Leu (henryleu@126.com) on 2018/1/22
 */
const EventEmitter = require('eventemitter3');
// const { Disconnected, Timeout } = require('./outputs');

const Idle = 0;
const WIP = 1;
let _workerId = new Date().getTime() - (40 * 365 * 2400 * 3600000);
const nextWorkerId = () => _workerId++;
const RetryInterval = 500;
const PingInterval = 5000;
// const Running = 'running';
// const Completed = 'complete';
// const Failed = 'failed';
const isoOutput = (output) => Object.assign({}, output.meta, output.body);

class QueueAgent {
    constructor (client, {prefix = 'queue.'}) {
        this.client = client;
        this.prefix = prefix;
        this.listeners = {}; // todo verify if need it
    }

    createJob (job, data) {
        return this.client.request(this.prefix + 'createJob', [job, data]).then(isoOutput);
    }

    applyJob (job) {
        return this.client.request(this.prefix + 'applyJob', [job]).then(isoOutput);
    }

    ackJob (job, id) {
        return this.client.request(this.prefix + 'ackJob', [job, id]).then(isoOutput);
    }

    completeJob (job, id) {
        return this.client.request(this.prefix + 'completeJob', [job, id]).then(isoOutput);
    }

    failJob (job, id, error) {
        return this.client.request(this.prefix + 'failJob', [job, id, error]).then(isoOutput);
    }

    subscribeJob (job, listener) {
        this.listeners[job] = listener;
        return this.client.subscribe(this.prefix + 'job.' + job, listener);
    }

    unsubscribeJob (job) {
        return this.client.unsubscribe(this.prefix + 'job.' + job, this.listeners[job]);
    }
}

class Worker extends EventEmitter {
    constructor (manager, jobName, onProcess) {
        super();
        this.manager = manager;
        this.jobName = jobName;
        this.onProcess = onProcess;
        this.status = Idle;
        this.id = nextWorkerId();
        this.job = null;
        this.timer = null;
        this.stopping = true;
    }

    /**
     * start to grab and process new job.
     */
    start () {
        console.log('starting');
        if (!this.stopping) return;
        this.stopping = false;
        this.startGrabJob(true);
    }

    /**
     * stop gracefully - stop to grab and process new job
     * after finishing the current job.
     */
    stop () {
        if (this.stopping) return;
        this.stopping = true;
        this.stopGrabJob();
    }

    notify () {
        if (this.status === WIP) return;
        this.startGrabJob(true);
    }

    failJob (msg) {
        this.manager.failJob(this.job.id, msg).then((output) => {
            if (output.code) return console.error(output);
            this.status = Idle;
            this.startGrabJob(true);
        });
    }

    // todo retry 3 times
    completeJob () {
        this.manager.completeJob(this.job.id).then((output) => {
            if (output.code) return console.error(output);
            this.status = Idle;
            this.startGrabJob(true);
        });
    }

    processJob (job) {
        this.stopGrabJob();
        this.job = job;
        this.status = WIP;
        try {
            this.onProcess(job, (err) => {
                if (err) {
                    console.error(err);
                    const msg = err instanceof Error ? err.stack || err.toString() : '' + err;
                    return this.failJob(msg);
                } else {
                    return this.completeJob();
                }
            });
        } catch (e) {
            console.error(e);
            return this.failJob(e.stack || e.toString());
        }
    }

    grabJob () {
        return this.manager.applyJob()
            .then((output) => {
                if (output.code) return output;
                if (!output.job) return Object.assign(output, {code: 'no more jobs', msg: 'no more jobs'});
                return this.manager.ackJob(output.job.id);
            });
    }

    startGrabJob (grab) {
        if (this.stopping) return;

        const me = this;
        function tryGrab (retries) {
            if (grab && !retries) {
                return me.startGrabJob(false);
            }

            me.grabJob()
                .then((output) => {
                    if (output.code) return console.error(output);
                    me.processJob(output.job);
                })
                .catch((err) => {
                    console.error(err);
                });
        }
        let retries = 5;
        this.stopGrabJob();
        this.timer = setInterval(() => { tryGrab(retries--); }, grab ? RetryInterval : PingInterval);
    }

    stopGrabJob () {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
    }
}

class Manager extends EventEmitter {
    constructor (queue, job, concurs, onProcess) {
        super();
        this.queue = queue;
        this.job = job;
        this.concurs = concurs;
        this.workers = [];
        this.onProcess = onProcess;
        this.agent = new QueueAgent(queue.client, { prefix: queue.prefix });
        this.started = false;
        this._init();
    }

    /**
     * start to get notified/grab new jobs and begin to work on them
     * @returns {Promise.<Output>}
     */
    start () {
        if (this.started) return;
        this._init();
        for (let worker of this.workers) worker.start();
        return this.subscribeJob().then((output) => {
            if (output.code) return output;
            this.started = true;
        });
    }

    /**
     * stop accepting new jobs and waiting WIP jobs ending
     * @returns {Promise.<Output>}
     */
    stop () {
        if (!this.started) return;
        for (let worker of this.workers) worker.stop();
        return this.unsubscribeJob().then((output) => {
            if (output.code) return output;
            this.started = false;
        });
    }

    notify (queued) {
        if (queued <= 0) return;
        for (let i = 0; i < this.workers; i++) this.workers[i].notify(queued);
    }

    applyJob () { return this.agent.applyJob(this.job); }
    ackJob (id) { return this.agent.applyJob(this.job, id); }
    completeJob (id) { return this.agent.completeJob(this.job, id); }
    failJob (id, error) { return this.agent.failJob(this.job, id, error); }
    subscribeJob () { return this.agent.subscribeJob(this.job, this.notify.bind(this)); }
    unsubscribeJob () { return this.agent.unsubscribeJob(this.job); }

    _init () {
        for (let i = 0; i < this.concurs; i++) {
            let worker = new Worker(this, this.job, this.onProcess);
            // console.log(worker);
            this.workers.push(worker);
        }
    }
}

class Queue extends EventEmitter {
    /**
     * the namespace of the queue in server-side which the worker
     * connects and works on
     * @returns {string}
     */
    static get Name () { return 'default'; }

    /**
     * the prefix of the primus message of request
     * @returns {string}
     */
    static get Prefix () { return 'queue.' };

    constructor ({ client, name = Queue.Name, prefix = Queue.Prefix }) {
        super();
        this.client = client;
        this.name = name;
        this.prefix = prefix;
        this.managers = [];
        this.agent = new QueueAgent(client, { prefix });
    }

    shutdown () {
        for (let manager of this.managers) manager.stop();
    }

    create (job, data) {
        return this.agent.createJob(job, data);
    }

    process (job, concurs, onProcess) {
        if (!onProcess && typeof concurs === 'function') {
            concurs = 1;
            onProcess = concurs;
        }
        if (typeof job !== 'string') throw new Error('job should be a string');
        if (typeof concurs !== 'number') throw new Error('concurs should be a number [1-100]');
        if (typeof onProcess !== 'function') throw new Error('onProcess should be a function');

        const manager = new Manager(this, job, concurs, onProcess);
        this.managers.push(manager);
        return manager.start();
    }
}

module.exports = Queue;
