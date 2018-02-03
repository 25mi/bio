/*
 * Created by Henry Leu (henryleu@126.com) on 2017/12/25
 */
const Client = require('../src').Client;
const client = new Client({
    url: 'http://127.0.0.1:3050',
    websockets: false
});

client.open();

module.exports = client;
