'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/*
 * Created by Henry Leu (henryleu@126.com) on 2018/1/22
 */
var EventEmitter = require('eventemitter3');

var _require = require('./outputs'),
    LostJobData = _require.LostJobData;

var Idle = 0;
var WIP = 1;
// let _workerId = new Date().getTime() - (40 * 365 * 24 * 3600000);
var _workerId = 1;
var nextWorkerId = function nextWorkerId() {
    return _workerId++;
};
var RetryInterval = 1000;
var PingInterval = 5000;
var CommitRetries = 20;
var CheckoutRetries = 10;
var isoOutput = function isoOutput(output) {
    return Object.assign({}, output.meta, output.body);
};

var QueueAgent = function () {
    function QueueAgent(client, _ref) {
        var _ref$prefix = _ref.prefix,
            prefix = _ref$prefix === undefined ? 'queue.' : _ref$prefix;

        _classCallCheck(this, QueueAgent);

        this.client = client;
        this.prefix = prefix;
        this.listeners = {}; // todo verify if need it
    }

    _createClass(QueueAgent, [{
        key: 'createJob',
        value: function createJob(job, data) {
            return this.client.request(this.prefix + 'createJob', [job, data]).then(isoOutput);
        }
    }, {
        key: 'requestJob',
        value: function requestJob(job) {
            return this.client.request(this.prefix + 'requestJob', [job]).then(isoOutput);
        }
    }, {
        key: 'completeJob',
        value: function completeJob(job, id) {
            return this.client.request(this.prefix + 'completeJob', [job, id]).then(isoOutput);
        }
    }, {
        key: 'failJob',
        value: function failJob(job, id, error) {
            return this.client.request(this.prefix + 'failJob', [job, id, error]).then(isoOutput);
        }
    }, {
        key: 'subscribeJob',
        value: function subscribeJob(job, listener) {
            this.listeners[job] = listener;
            return this.client.subscribe(this.prefix + 'job.' + job, listener);
        }
    }, {
        key: 'unsubscribeJob',
        value: function unsubscribeJob(job) {
            return this.client.unsubscribe(this.prefix + 'job.' + job, this.listeners[job]);
        }
    }]);

    return QueueAgent;
}();

var Worker = function (_EventEmitter) {
    _inherits(Worker, _EventEmitter);

    function Worker(manager, jobName, onProcess) {
        _classCallCheck(this, Worker);

        var _this = _possibleConstructorReturn(this, (Worker.__proto__ || Object.getPrototypeOf(Worker)).call(this));

        _this.manager = manager;
        _this.jobName = jobName;
        _this.onProcess = onProcess;
        _this.status = Idle;
        _this.workerId = nextWorkerId();
        _this.job = null;
        _this.timer = null;
        _this.stopping = true;
        return _this;
    }

    /**
     * start to grab and process new job.
     */


    _createClass(Worker, [{
        key: 'start',
        value: function start() {
            console.log('starting');
            if (!this.stopping) return;
            this.stopping = false;
            this.requestJob();
        }

        /**
         * stop gracefully - stop to grab and process new job
         * after finishing the current job.
         */

    }, {
        key: 'stop',
        value: function stop() {
            if (this.stopping) return;
            this.stopping = true;
            this.stopRetry();
        }
    }, {
        key: 'notify',
        value: function notify() {
            if (this.status === WIP) return;
            this.requestJob();
        }
    }, {
        key: 'failJob',
        value: function failJob(msg) {
            var _this2 = this;

            this.startRetry(CommitRetries, RetryInterval, function () {
                return _this2.manager.failJob(_this2.job._id, msg).then(function (output) {
                    if (!output.code) {
                        console.log('failJob - ok');
                        _this2.stopRetry();
                        _this2.requestJob();
                    } else {
                        console.error('failJob - error: ' + output.msg);
                    }
                    return output;
                });
            });
        }
    }, {
        key: 'completeJob',
        value: function completeJob() {
            var _this3 = this;

            this.startRetry(CommitRetries, RetryInterval, function () {
                return _this3.manager.completeJob(_this3.job._id).then(function (output) {
                    if (!output.code) {
                        console.log('completeJob - ok');
                        _this3.stopRetry();
                        _this3.requestJob();
                    } else {
                        console.error('completeJob - error: ' + output.msg);
                    }
                    return output;
                });
            });
        }
    }, {
        key: 'processJob',
        value: function processJob(job) {
            var _this4 = this;

            job.workerId = this.workerId;
            this.job = job;
            this.status = WIP;
            try {
                this.onProcess(job, function (err) {
                    if (err) {
                        console.error(err);
                        var msg = err instanceof Error ? err.stack || err.toString() : '' + err;
                        return _this4.failJob(msg);
                    } else {
                        return _this4.completeJob();
                    }
                });
            } catch (e) {
                console.error(e);
                return this.failJob(e.stack || e.toString());
            }
        }
    }, {
        key: 'requestJob',
        value: function requestJob() {
            var _this5 = this;

            this.status = Idle;
            var doRequestJob = function doRequestJob() {
                return _this5.manager.requestJob().then(function (output) {
                    return !output.code && !output.job ? LostJobData.clone() : output;
                }).then(function (output) {
                    if (output.code) {
                        console.log('requestJob - error: ' + output.msg);
                    } else {
                        console.log('requestJob - ok');
                        _this5.stopRetry();
                        _this5.processJob(output.job);
                    }
                    return output;
                });
            };
            this.startRetry(CheckoutRetries, RetryInterval, doRequestJob, function () {
                _this5.startRetry(0, PingInterval, doRequestJob);
            });
        }
    }, {
        key: 'startRetry',
        value: function startRetry(retries, interval, fn, next) {
            var _this6 = this;

            if (retries === 0) {
                // poll mode
                this.timer = setInterval(fn, interval);
            } else {
                // retry mode
                this.timer = setInterval(function () {
                    console.log('retries - ' + retries);
                    if (retries-- <= 0) {
                        _this6.stopRetry();
                        next && next();
                    } else {
                        fn();
                    }
                }, interval);
            }
        }
    }, {
        key: 'stopRetry',
        value: function stopRetry() {
            if (!this.timer) return;
            clearInterval(this.timer);
            this.timer = null;
        }
    }]);

    return Worker;
}(EventEmitter);

var Manager = function (_EventEmitter2) {
    _inherits(Manager, _EventEmitter2);

    function Manager(queue, job, concurs, onProcess) {
        _classCallCheck(this, Manager);

        var _this7 = _possibleConstructorReturn(this, (Manager.__proto__ || Object.getPrototypeOf(Manager)).call(this));

        _this7.queue = queue;
        _this7.job = job;
        _this7.concurs = concurs;
        _this7.workers = [];
        _this7.onProcess = onProcess;
        _this7.agent = new QueueAgent(queue.client, { prefix: queue.prefix });
        _this7.started = false;
        _this7._init();
        return _this7;
    }

    /**
     * start to get notified/grab new jobs and begin to work on them
     * @returns {Promise.<Output>}
     */


    _createClass(Manager, [{
        key: 'start',
        value: function start() {
            var _this8 = this;

            if (this.started) return;
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this.workers[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var worker = _step.value;
                    worker.start();
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            return this.subscribeJob().then(function (output) {
                if (output.code) return output;
                _this8.started = true;
            });
        }

        /**
         * stop accepting new jobs and waiting WIP jobs ending
         * @returns {Promise.<Output>}
         */

    }, {
        key: 'stop',
        value: function stop() {
            var _this9 = this;

            if (!this.started) return;
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this.workers[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var worker = _step2.value;
                    worker.stop();
                }
            } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion2 && _iterator2.return) {
                        _iterator2.return();
                    }
                } finally {
                    if (_didIteratorError2) {
                        throw _iteratorError2;
                    }
                }
            }

            return this.unsubscribeJob().then(function (output) {
                if (output.code) return output;
                _this9.started = false;
            });
        }
    }, {
        key: 'notify',
        value: function notify(queued) {
            if (queued <= 0) return;
            for (var i = 0; i < this.workers; i++) {
                this.workers[i].notify(queued);
            }
        }
    }, {
        key: 'requestJob',
        value: function requestJob() {
            return this.agent.requestJob(this.job);
        }
    }, {
        key: 'completeJob',
        value: function completeJob(id) {
            return this.agent.completeJob(this.job, id);
        }
    }, {
        key: 'failJob',
        value: function failJob(id, error) {
            return this.agent.failJob(this.job, id, error);
        }
    }, {
        key: 'subscribeJob',
        value: function subscribeJob() {
            return this.agent.subscribeJob(this.job, this.notify.bind(this));
        }
    }, {
        key: 'unsubscribeJob',
        value: function unsubscribeJob() {
            return this.agent.unsubscribeJob(this.job);
        }
    }, {
        key: '_init',
        value: function _init() {
            for (var i = 0; i < this.concurs; i++) {
                var worker = new Worker(this, this.job, this.onProcess);
                this.workers.push(worker);
            }
        }
    }]);

    return Manager;
}(EventEmitter);

var Queue = function (_EventEmitter3) {
    _inherits(Queue, _EventEmitter3);

    _createClass(Queue, null, [{
        key: 'Name',

        /**
         * the namespace of the queue in server-side which the worker
         * connects and works on
         * @returns {string}
         */
        get: function get() {
            return 'default';
        }

        /**
         * the prefix of the primus message of request
         * @returns {string}
         */

    }, {
        key: 'Prefix',
        get: function get() {
            return 'queue.';
        }
    }]);

    function Queue(_ref2) {
        var client = _ref2.client,
            _ref2$name = _ref2.name,
            name = _ref2$name === undefined ? Queue.Name : _ref2$name,
            _ref2$prefix = _ref2.prefix,
            prefix = _ref2$prefix === undefined ? Queue.Prefix : _ref2$prefix;

        _classCallCheck(this, Queue);

        var _this10 = _possibleConstructorReturn(this, (Queue.__proto__ || Object.getPrototypeOf(Queue)).call(this));

        _this10.client = client;
        _this10.name = name;
        _this10.prefix = prefix;
        _this10.managers = [];
        _this10.agent = new QueueAgent(client, { prefix: prefix });
        return _this10;
    }

    _createClass(Queue, [{
        key: 'shutdown',
        value: function shutdown() {
            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
                for (var _iterator3 = this.managers[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var manager = _step3.value;
                    manager.stop();
                }
            } catch (err) {
                _didIteratorError3 = true;
                _iteratorError3 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion3 && _iterator3.return) {
                        _iterator3.return();
                    }
                } finally {
                    if (_didIteratorError3) {
                        throw _iteratorError3;
                    }
                }
            }
        }
    }, {
        key: 'create',
        value: function create(job, data) {
            return this.agent.createJob(job, data);
        }
    }, {
        key: 'process',
        value: function process(job, concurs, onProcess) {
            if (!onProcess && typeof concurs === 'function') {
                concurs = 1;
                onProcess = concurs;
            }
            if (typeof job !== 'string') throw new Error('job should be a string');
            if (typeof concurs !== 'number') throw new Error('concurs should be a number [1-100]');
            if (typeof onProcess !== 'function') throw new Error('onProcess should be a function');

            var manager = new Manager(this, job, concurs, onProcess);
            this.managers.push(manager);
            return manager.start();
        }
    }]);

    return Queue;
}(EventEmitter);

module.exports = Queue;
//# sourceMappingURL=queue.js.map