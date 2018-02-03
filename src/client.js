/*
 * Created by Henry Leu (henryleu@126.com) on 2018/1/22
 */

const Primus = require('primus');
const ClientTracker = require('./tracker');

class WebSocketClient {
    constructor ({
        url,
        sessionId = {},
        transformer = 'WebSockets',
        websockets = true,
        reconnectTimeout = 15000,
        pingTimeout = 35000,
        pathname = '/primus' // server url parameter
    }) {
        this._readSessionId = sessionId.reader;
        this._writeSessionId = sessionId.writer;
        this.sessionId = this._readSessionId && this._readSessionId();

        const Socket = Primus.createSocket({
            // transformer, // WebSockets | sockjs
            plugin: {
                'mirage': require('mirage'),
                'emit': require('primus-emit')
            }
        }); // WebSockets

        this._socket = new Socket(url, {
            manual: true,
            websockets,
            reconnect: {
                max: Infinity // Number: The max delay before we try to reconnect.
                , min: 500 // Number: The minimum delay before we try reconnect.
                , retries: 20 // Number: How many times we should try to reconnect.
                , 'reconnect timeout': 10000
                , factor: 2
            },
            // strategy: false,
            timeout: reconnectTimeout,
            pingTimeout,
            pathname, // server url parameter, by default, '/primus'
            fortress: 'spark', // validate target
            mirage: this.sessionId
        });
        this._tracker = new ClientTracker();
        this._opened = false;
        this._rid = new Date().getTime() * 1000;
        this._init();
    }

    open () {
        if (this._opened) {
            console.log('ignore opening for the client is already opened');
            return;
        }
        this._opened = true;
        this._socket.open(function () {
            console.error('opened');
        });
    }

    end () {
        if (!this._opened) {
            console.log('ignore ending for the client is already ended');
            return;
        }
        this._opened = false;
        this._socket.end();
    }

    request (name, body, cfg) {
        // console.log('subscribe - ', topic);
        const timeout = (cfg && cfg.timeout) || 3000;
        const id = this._rid++; // todo generateId
        this._socket.emit('request', {body, meta: {id, name, timeout}});
        return new Promise((resolve) => {
            const event = `response [id=${id}]`;
            let resolved = false;
            this._socket.once(event, (result) => {
                if (resolved) return;
                resolved = true;
                resolve(result);
            });
            setTimeout(() => {
                if (resolved) return;
                resolved = true;
                this._socket.removeAllListeners(event);
                resolve({code: 'timeout', msg: `request [id=${id}] timeout`});
            }, timeout);
        });
    }

    subscribe (topic, cb) {
        // console.log('subscribe - ', topic);
        const id = this._rid++;
        this._socket.emit('subscribe', {topic, id});
        return new Promise((resolve) => {
            const event = `subscribed ${topic} ${id}`;
            let resolved = false;
            this._socket.once(event, (result) => {
                if (resolved) return;
                resolved = true;
                if (!result.code) { // subscribed successfully
                    this._socket.on('publish ' + topic, cb);
                }
                resolve(result);
            });
            setTimeout(() => {
                if (resolved) return;
                resolved = true;
                this._socket.removeAllListeners(event);
                resolve({code: 'timeout', msg: `subscribe [${topic}] timeout`});
            }, 3000);
        });
    }

    unsubscribe (topic) {
        // console.log('unsubscribe - ', topic);
        const id = this._rid++;
        this._socket.emit('unsubscribe', {topic, id});
        return new Promise((resolve) => {
            const event = `unsubscribed ${topic} ${id}`;
            let resolved = false;
            this._socket.once(event, (result) => {
                if (resolved) return;
                resolved = true;
                if (!result.code) { // unsubscribed successfully
                    this._socket.removeAllListeners('publish ' + topic);
                }
                resolve(result);
            });
            setTimeout(() => {
                if (resolved) return;
                resolved = true;
                this._socket.removeAllListeners(event);
                resolve({code: 'timeout', msg: `unsubscribe [${topic}] timeout`});
            }, 3000);
        });
    }

    publish (topic, ...args) {
        // console.log('publish - ', topic);
        const id = this._rid++;
        this._socket.emit('publish', {topic, id, args});
        return new Promise((resolve) => {
            const event = `published ${topic} ${id}`;
            let resolved = false;
            this._socket.once(event, (result) => {
                if (resolved) return;
                resolved = true;
                resolve(result);
            });
            setTimeout(() => {
                if (resolved) return;
                resolved = true;
                this._socket.removeAllListeners(event);
                resolve({code: 'timeout', msg: `publish [${topic}] timeout`});
            }, 3000);
        });
    }

    _init () {
        const socket = this._socket;
        this._tracker.bind(socket);
        socket.on('open', () => {
        });
        socket.on('close', () => {
        });
        socket.on('end', function () {
            console.log('ended');
        });

        socket.on('data', function (data) {
            console.log('client data received - ', socket.mirage, data);
        });

        /**
         * get session id from server and save it at client side
         * if client is initiated without session id
         */
        this._writeSessionId && socket.on('mirage', (id) => this._writeSessionId(id));
    }
}

module.exports = WebSocketClient;
