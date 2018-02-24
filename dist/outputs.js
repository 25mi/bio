'use strict';

/*
 * Created by Henry Leu (henryleu@126.com) on 2018/2/3
 */
var Output = require('isocall').Output;

/**
 * 连接已断开。
 * @global
 * @augments Output
 * @see CustomBizResult
 */
var Disconnected = Output.define('Disconnected', null, '连接已断开');

/**
 * 请求超时。
 * @global
 * @augments Output
 * @see CustomBizResult
 */
var Timeout = Output.define('Timeout', null, '请求超时');

/**
 * 当前作业队列为空，没有更多作业。
 * @global
 * @augments Output
 * @see CustomBizResult
 */
var NoMoreJobs = Output.define('NoMoreJobs', null, '无作业');

/**
 * 当请求作业时，没有返回作业数据。
 * @global
 * @augments Output
 * @see CustomBizResult
 */
var LostJobData = Output.define('LostJobData', null, '请求的作业无数据');

module.exports = { Disconnected: Disconnected, Timeout: Timeout, NoMoreJobs: NoMoreJobs, LostJobData: LostJobData };
//# sourceMappingURL=outputs.js.map