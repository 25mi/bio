/*
 * Created by Henry Leu (henryleu@126.com) on 2017/12/25
 */
const newClient = require('./basics');
const client = newClient();

setInterval(() => {
    const topic = 'enrollment model';
    client.subscribe(topic, function (model) {
        console.log('received a published msg');
        console.log(model);
    }).then(console.log);

    setTimeout(() => {
        client.unsubscribe(topic).then(console.log);
        client.unsubscribe('test topic').then(console.log);
    }, 3000);
}, 8000);

// setInterval(() => {
//     client.end();
// }, 10000);
