/*
 * Created by Henry Leu (henryleu@126.com) on 2018/2/3
 */
const Output = require('isocall').Output;

/**
 * 连接已断开。
 * @global
 * @augments Output
 * @see CustomBizResult
 */
const Disconnected = Output.define('Disconnected', null, '连接已断开');

/**
 * 请求超时。
 * @global
 * @augments Output
 * @see CustomBizResult
 */
const Timeout = Output.define('Timeout', null, '请求超时');

module.exports = { Disconnected, Timeout };
