/*
 * Created by Henry Leu (henryleu@126.com) on 2018/1/22
 */

class ClientTracker {
    constructor () {
        this._connected = false;
        this._connectedOn = new Date().getTime();
    }

    get connected () {
        return this._connected;
    }

    bind (socket) {
        socket.on('error', function (err) {
            console.log('error - ', err);
        });

        // socket.on('incoming::error', function (err) {
        //     console.log('incoming::error -  ', err);
        // });
        //
        // socket.on('timeout', function () {
        //     console.log('timeout - ', Array.prototype.slice.call(arguments).join(', '));
        // });
        //
        // socket.on('online', function () {
        //     console.log('online - ', Array.prototype.slice.call(arguments).join(', '));
        // });
        //
        // socket.on('offline', function () {
        //     console.log('offline - ', Array.prototype.slice.call(arguments).join(', '));
        // });
        //
        // socket.on('incoming::ping', function () {
        //     console.log('incoming::ping - ', Array.prototype.slice.call(arguments).join(', '));
        // });
        //
        // socket.on('outgoing::pong', function () {
        //     console.log('outgoing::pong - ', Array.prototype.slice.call(arguments).join(', '));
        // });
        //
        // socket.on('outgoing::url', function (url) {
        //     console.log('outgoing::url - ', url);
        // });

        socket.on('open', () => {
            this._connected = true;
            this._connectedOn = new Date().getTime();
            console.log('connected');
        });

        socket.on('close', () => {
            this._connected = false;
            console.log('disconnected');
            console.log('be opening least ' + (new Date().getTime() - this._connectedOn));
        });
    }
}

module.exports = ClientTracker;
