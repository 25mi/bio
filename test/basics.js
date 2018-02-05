/*
 * Created by Henry Leu (henryleu@126.com) on 2017/12/25
 */
const Client = require('../src').Client;
let sessionId = '' + new Date().getTime();
const reader = function () {
    console.error('readSessionId');
    return sessionId;
};

const writer = function (id) {
    sessionId = id;
    console.error('writeSessionId');
    console.error(id);
};

module.exports = () => {
    const client = new Client({
        url: 'http://127.0.0.1:3050',
        sessionId: {reader, writer},
        websockets: false
    });
    client.open();
    return client;
}
