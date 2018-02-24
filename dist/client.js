'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/*
 * Created by Henry Leu (henryleu@126.com) on 2018/1/22
 */
var Primus = require('primus');
var EventEmitter = require('eventemitter3');

var ClientTracker = require('./tracker');

var _require = require('./outputs'),
    Disconnected = _require.Disconnected,
    Timeout = _require.Timeout;

var relayer = function relayer(event, target) {
    return function () {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
        }

        return target.emit.apply(target, [event].concat(args));
    };
};

var Client = function (_EventEmitter) {
    _inherits(Client, _EventEmitter);

    _createClass(Client, null, [{
        key: 'ReplyTimeout',
        get: function get() {
            return 2000;
        } // the timeout to get a response event

    }, {
        key: 'ReconnectTimeout',
        get: function get() {
            return 15000;
        }
    }, {
        key: 'PingTimeout',
        get: function get() {
            return 35000;
        }
    }, {
        key: 'Pathname',
        get: function get() {
            return '/primus';
        } // server url parameter

    }]);

    function Client(_ref) {
        var url = _ref.url,
            _ref$sessionId = _ref.sessionId,
            sessionId = _ref$sessionId === undefined ? {} : _ref$sessionId,
            _ref$transformer = _ref.transformer,
            transformer = _ref$transformer === undefined ? 'WebSockets' : _ref$transformer,
            _ref$websockets = _ref.websockets,
            websockets = _ref$websockets === undefined ? true : _ref$websockets,
            _ref$reconnectTimeout = _ref.reconnectTimeout,
            reconnectTimeout = _ref$reconnectTimeout === undefined ? Client.ReconnectTimeout : _ref$reconnectTimeout,
            _ref$pingTimeout = _ref.pingTimeout,
            pingTimeout = _ref$pingTimeout === undefined ? Client.PingTimeout : _ref$pingTimeout,
            _ref$pathname = _ref.pathname,
            pathname = _ref$pathname === undefined ? Client.Pathname : _ref$pathname;

        _classCallCheck(this, Client);

        var _this = _possibleConstructorReturn(this, (Client.__proto__ || Object.getPrototypeOf(Client)).call(this));

        _this._readSessionId = sessionId.reader;
        _this._writeSessionId = sessionId.writer;
        _this.sessionId = _this._readSessionId && _this._readSessionId();

        var Socket = Primus.createSocket({
            transformer: transformer, // WebSockets | sockjs
            plugin: {
                'mirage': require('mirage'),
                'emit': require('primus-emit')
            }
        }); // WebSockets

        _this._socket = new Socket(url, {
            manual: true,
            websockets: websockets,
            reconnect: {
                max: Infinity // Number: The max delay before we try to reconnect.
                , min: 500 // Number: The minimum delay before we try reconnect.
                , retries: 20 // Number: How many times we should try to reconnect.
                , 'reconnect timeout': 10000,
                factor: 2
            },
            // strategy: false,
            timeout: reconnectTimeout,
            pingTimeout: pingTimeout,
            pathname: pathname, // server url parameter, by default, '/primus'
            fortress: 'spark', // validate target
            mirage: _this.sessionId
        });
        _this._tracker = new ClientTracker();
        _this._opened = false;
        _this._rid = new Date().getTime() * 1000;
        _this._init();
        return _this;
    }

    _createClass(Client, [{
        key: 'open',
        value: function open() {
            if (this._opened) return console.log('ignore opening the opened client');
            this._opened = true;
            this._socket.open();
        }
    }, {
        key: 'end',
        value: function end() {
            if (!this._opened) return console.log('ignore ending for the ended client');
            this._opened = false;
            this._socket.end();
        }
    }, {
        key: 'request',
        value: function request(name, body, cfg) {
            var _this2 = this;

            var timeout = cfg && cfg.timeout || Client.ReplyTimeout;
            var id = this._rid++; // todo generateId
            var meta = { id: id, name: name, timeout: timeout };

            if (!this._tracker.connected) {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        return resolve({ meta: Disconnected.clone(meta).toObject() });
                    }, 0);
                });
            }
            this._socket.emit('request', { meta: meta, body: body });

            return new Promise(function (resolve) {
                var event = 'response [id=' + id + ']';
                var resolved = false;
                _this2._socket.once(event, function (result) {
                    if (resolved) return;
                    resolved = true;
                    resolve(result);
                });
                setTimeout(function () {
                    if (resolved) return;
                    resolved = true;
                    _this2._socket.removeAllListeners(event);
                    resolve({ meta: Timeout.clone(meta).toObject() });
                }, timeout);
            });
        }
    }, {
        key: 'subscribe',
        value: function subscribe(topic, cb) {
            var _this3 = this;

            var id = this._rid++;
            if (!this._tracker.connected) {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        return resolve(Disconnected.clone({ id: id, topic: topic }).toObject());
                    }, 0);
                });
            }
            this._socket.emit('subscribe', { topic: topic, id: id });

            return new Promise(function (resolve) {
                var event = 'subscribed ' + topic + ' ' + id;
                var resolved = false;
                _this3._socket.once(event, function (result) {
                    if (resolved) return;
                    resolved = true;
                    if (!result.code) {
                        // subscribed successfully
                        _this3._socket.on('publish ' + topic, cb);
                    }
                    resolve(result);
                });
                setTimeout(function () {
                    if (resolved) return;
                    resolved = true;
                    _this3._socket.removeAllListeners(event);
                    resolve({ meta: Timeout.clone({ id: id, topic: topic }).toObject() });
                }, Client.ReplyTimeout);
            });
        }
    }, {
        key: 'unsubscribe',
        value: function unsubscribe(topic, cfg, cb) {
            var _this4 = this;

            if (typeof cfg === 'function') {
                cb = cfg;
                cfg = {};
            }
            var timeout = cfg && cfg.timeout || Client.ReplyTimeout;
            var id = this._rid++;
            if (!this._tracker.connected) {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        return resolve(Disconnected.clone({ id: id, topic: topic }).toObject());
                    }, 0);
                });
            }
            this._socket.emit('unsubscribe', { topic: topic, id: id });

            return new Promise(function (resolve) {
                var event = 'unsubscribed ' + topic + ' ' + id;
                var resolved = false;
                _this4._socket.once(event, function (result) {
                    if (resolved) return;
                    resolved = true;
                    if (!result.code) {
                        // unsubscribed successfully
                        if (cb) {
                            _this4._socket.removeListener('publish ' + topic, cb);
                        } else {
                            _this4._socket.removeAllListeners('publish ' + topic);
                        }
                    }
                    resolve(result);
                });
                setTimeout(function () {
                    if (resolved) return;
                    resolved = true;
                    _this4._socket.removeAllListeners(event);
                    resolve({ meta: Timeout.clone({ id: id, topic: topic }).toObject() });
                }, timeout);
            });
        }
    }, {
        key: 'publish',
        value: function publish(topic) {
            var _this5 = this;

            for (var _len2 = arguments.length, args = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                args[_key2 - 1] = arguments[_key2];
            }

            var id = this._rid++;
            if (!this._tracker.connected) {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        return resolve(Disconnected.clone({ id: id, topic: topic, args: args }).toObject());
                    }, 0);
                });
            }
            this._socket.emit('publish', { topic: topic, id: id, args: args });

            return new Promise(function (resolve) {
                var event = 'published ' + topic + ' ' + id;
                var resolved = false;
                _this5._socket.once(event, function (result) {
                    if (resolved) return;
                    resolved = true;
                    resolve(result);
                });
                setTimeout(function () {
                    if (resolved) return;
                    resolved = true;
                    _this5._socket.removeAllListeners(event);
                    resolve({ meta: Timeout.clone({ id: id, topic: topic, args: args }).toObject() });
                }, Client.ReplyTimeout);
            });
        }
    }, {
        key: '_relay',
        value: function _relay() {
            for (var _len3 = arguments.length, events = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
                events[_key3] = arguments[_key3];
            }

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = events[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var e = _step.value;
                    this._socket.on(e, relayer(e, this));
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
        }
    }, {
        key: '_init',
        value: function _init() {
            var _this6 = this;

            this._tracker.bind(this._socket);
            this._relay('open', 'close', 'reconnect', 'data', 'error');

            /**
             * get session id from server and save it at client side
             * if client is initiated without session id
             */
            this._writeSessionId && this._socket.on('mirage', function (id) {
                return _this6._writeSessionId(id);
            });
        }
    }]);

    return Client;
}(EventEmitter);

module.exports = Client;
//# sourceMappingURL=client.js.map