/*
 * Created by Henry Leu (henryleu@126.com) on 2017/12/25
 */
const client = require('./basics')();

client.on('data', function (data) {
    console.log('client data received - ', data);
});

setInterval(() => {
    const url = 'getJob';
    client.request(url, {id: '001'}).then((output) => {
        console.log(output);
    });
    console.log(url, 'requested');
}, 5000);

// setInterval(() => {
//     client.end();
// }, 10000);
