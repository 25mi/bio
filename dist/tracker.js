'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/*
 * Created by Henry Leu (henryleu@126.com) on 2018/1/22
 */

var ClientTracker = function () {
    function ClientTracker() {
        _classCallCheck(this, ClientTracker);

        this._connected = false;
        this._connectedOn = new Date().getTime();
    }

    _createClass(ClientTracker, [{
        key: 'bind',
        value: function bind(socket) {
            var _this = this;

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

            socket.on('open', function () {
                _this._connected = true;
                _this._connectedOn = new Date().getTime();
                console.log('connected');
            });

            socket.on('close', function () {
                _this._connected = false;
                console.log('disconnected');
                console.log('be opening least ' + (new Date().getTime() - _this._connectedOn));
            });
        }
    }, {
        key: 'connected',
        get: function get() {
            return this._connected;
        }
    }]);

    return ClientTracker;
}();

module.exports = ClientTracker;
//# sourceMappingURL=tracker.js.map