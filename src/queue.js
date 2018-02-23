/*
 * Created by Henry Leu (henryleu@126.com) on 2018/1/22
 */
const EventEmitter = require('eventemitter3');
const { LostJobData } = require('./outputs');

const Idle = 0;
const WIP = 1;
// let _workerId = new Date().getTime() - (40 * 365 * 24 * 3600000);
let _workerId = 1;
const nextWorkerId = () => _workerId++;
const RetryInterval = 1000;
const PingInterval = 5000;
const CommitRetries = 20;
const CheckoutRetries = 10;
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

    requestJob (job) {
        return this.client.request(this.prefix + 'requestJob', [job]).then(isoOutput);
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
        this.workerId = nextWorkerId();
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
        this.requestJob();
    }

    /**
     * stop gracefully - stop to grab and process new job
     * after finishing the current job.
     */
    stop () {
        if (this.stopping) return;
        this.stopping = true;
        this.stopRetry();
    }

    notify () {
        if (this.status === WIP) return;
        this.requestJob();
    }

    failJob (msg) {
        this.startRetry(CommitRetries, RetryInterval, () => {
            return this.manager.failJob(this.job._id, msg).then((output) => {
                if (!output.code) {
                    console.log('failJob - ok');
                    this.stopRetry();
                    this.requestJob();
                } else {
                    console.error('failJob - error: ' + output.msg);
                }
                return output;
            });
        });
    }

    completeJob () {
        this.startRetry(CommitRetries, RetryInterval, () => {
            return this.manager.completeJob(this.job._id).then((output) => {
                if (!output.code) {
                    console.log('completeJob - ok');
                    this.stopRetry();
                    this.requestJob();
                } else {
                    console.error('completeJob - error: ' + output.msg);
                }
                return output;
            });
        });
    }

    processJob (job) {
        job.workerId = this.workerId;
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

    requestJob () {
        this.status = Idle;
        const doRequestJob = () => {
            return this.manager.requestJob()
                .then((output) => !output.code && !output.job ? LostJobData.clone() : output)
                .then((output) => {
                    if (output.code) {
                        console.log('requestJob - error: ' + output.msg);
                    } else {
                        console.log('requestJob - ok');
                        this.stopRetry();
                        this.processJob(output.job);
                    }
                    return output;
                });
        };
        this.startRetry(CheckoutRetries, RetryInterval, doRequestJob, () => {
            this.startRetry(0, PingInterval, doRequestJob);
        });
    }

    startRetry (retries, interval, fn, next) {
        if (retries === 0) { // poll mode
            this.timer = setInterval(fn, interval);
        } else { // retry mode
            this.timer = setInterval(
                () => {
                    console.log('retries - ' + retries);
                    if (retries-- <= 0) {
                        this.stopRetry();
                        next && next();
                    } else {
                        fn();
                    }
                }, interval);
        }
    }

    stopRetry () {
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

    requestJob () { return this.agent.requestJob(this.job); }
    completeJob (id) { return this.agent.completeJob(this.job, id); }
    failJob (id, error) { return this.agent.failJob(this.job, id, error); }
    subscribeJob () { return this.agent.subscribeJob(this.job, this.notify.bind(this)); }
    unsubscribeJob () { return this.agent.unsubscribeJob(this.job); }

    _init () {
        for (let i = 0; i < this.concurs; i++) {
            let worker = new Worker(this, this.job, this.onProcess);
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
