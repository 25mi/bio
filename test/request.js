/*
 * Created by Henry Leu (henryleu@126.com) on 2017/12/25
 */
const client = require('./basics');

setInterval(() => {
    const url = 'getJob';
    client.request(url, {id: '001'}).then((output) => {
        console.log(output);
    });
    console.log(url, 'requested');
}, 5000);
