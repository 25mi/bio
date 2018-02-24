/*
 * Created by Henry Leu (henryleu@126.com) on 2017/12/25
 */
const newClient = require('./basics');
const Queue = require('../src').Queue;
const client = newClient();
const queue = new Queue({client});
const jobName = 'enroll';
let counter = 0;

queue.process(jobName, 2, function (job, next) {
    if (counter++ % 2 === 0) {
        setTimeout(() => { next(); }, 10000);
    } else {
        setTimeout(() => { next(new Error('job error')); }, 10000);
    }
});

setInterval(() => {
    queue.create(jobName, {district: '南开', school: '南开5幼儿园'}).then(() => {});
    // queue.create(jobName, {district: '南开', school: '南开5幼儿园'}).then(() => {});
}, 10000);
