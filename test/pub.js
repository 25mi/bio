/*
 * Created by Henry Leu (henryleu@126.com) on 2017/12/25
 */
const newClient = require('./basics');
const client = newClient();

setInterval(() => {
    const topic = 'enrollment model';
    client.publish(topic, {ts: new Date().toISOString()}).then(console.log);
    client.publish('test topic').then(console.log);
}, 3000);
