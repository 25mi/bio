/*
 * Created by Henry Leu (henryleu@126.com) on 2017/12/25
 */
const newClient = require('./basics');
const client = newClient();
const topic = 'enrollment model';
client.once('open', function () {
    client.subscribe(topic, function (model) {
        console.log(`topic - ${topic}`);
        console.log(model);
    }).then(console.log);

    client.subscribe('test', function (model) {
        console.log(`topic - test`);
        console.log(model);
    }).then(console.log);
});

setInterval(() => {
    client.end();
    setTimeout(() => {
        client.open();
        client.once('open', function () {
            client.unsubscribe(topic).then(console.log);
            setTimeout(() => {
                client.subscribe(topic, function (model) {
                    console.log(`topic - ${topic}`);
                    console.log(model);
                }).then(console.log);
            }, 5000);
        });
    }, 5000);
}, 20000);
