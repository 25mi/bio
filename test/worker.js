/*
 * Created by Henry Leu (henryleu@126.com) on 2017/12/25
 */
const newClient = require('./basics');
const Queue = require('../src/queue');
const client = newClient();
const queue = new Queue({client});
const jobName = 'enroll';
queue.process(jobName, 3, function (data, next) {
    console.log(data);
    setTimeout(() => { next(); }, 10000);
});

// setInterval(() => {
//     queue.create(jobName, {district: '南开', school: '南开5幼儿园'}).then(console.log);
// }, 5000);
