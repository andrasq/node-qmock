/**
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var http = require('http');
var https = require('https');
var assert = require('assert');

var qmock = require('../');
var mockHttp = require('../lib/mockHttp');

module.exports = {

    'mockHttp': {
        'afterEach': function(done) {
            qmock.unmockHttp();
            done();
        },

        'should export functions': function(t) {
            t.equal(qmock.mockHttp, mockHttp.mockHttp);
            t.equal(qmock.unmockHttp, mockHttp.unmockHttp);
            t.equal(qmock.mockHttps, mockHttp.mockHttps);
            t.equal(qmock.unmockHttps, mockHttp.unmockHttps);
            t.done();
        },

        'should restore methods': function(t) {
            var originalHttp = http.request;
            var originalHttps = https.request;
            http.request = function f1(){};
            https.request = function f2(){};
            qmock.unmockHttp();
            t.equal(http.request, originalHttp);
            t.equal(https.request, originalHttps);
            t.done();
        },

        'request should return instance of ClientRequest': function(t) {
            qmock.mockHttp(function(){})
            var req = http.request("", function(){});
            t.ok(req instanceof http.ClientRequest);
            t.done();
        },

        'both http and https requests should invoke the provided handler': function(t) {
            var ncalls = 0;
            t.expect(2);
            qmock.mockHttp(function handler(req, res) {
                t.ok(1);
                if (++ncalls == 2) t.done();
            })
            http.request({}, function(res) {});
            https.request({}, function(res) {});
        },

        'req should be returned before handler is called': function(t) {
            t.expect(3);
            var req, handlerCalled;
            qmock.mockHttp(function(req, res) {
                t.ok(req);
                handlerCalled = true;
                t.done();
            })
            req = http.request({}, function(res) {});
            t.ok(req);
            t.ok(!handlerCalled);
        },

        'can request with a string uri': function(t) {
            var ncalls = 0;
            qmock.mockHttp(function(res, req){
                if (++ncalls >= 2) t.done();
            })
            http.request("http://localhost", function(res){});
            https.request("https://localhost", function(res){});
        },

        'mockResponse req event should trigger http response callback': function(t) {
            t.expect(2);
            var resCount = 0;
            var callbackCalled = false;
            qmock.mockHttp(function handler(req, res) {
                setTimeout(function(){ t.ok(!callbackCalled) }, 2);
                setTimeout(function(){ req.emit('mockResponse', res) }, 4);
                setTimeout(function(){ t.ok(callbackCalled); t.done() }, 6);
            })
            http.request({}, function(res) {
                callbackCalled = true;
            })
        },

        'response callback should be optional': function(t) {
            t.expect(1);
            qmock.mockHttp(function handler(req, res) {
                t.ok(true);
                t.done();
            })
            var req = http.request({});
        },

        'user http handler should receive instance of IncomingMessage': function(t) {
            t.expect(4);
            var resCount = 0;
            qmock.mockHttp(function(req, res){
                setTimeout(function(){ ++resCount; req.emit('mockResponse') }, 2);
            });
            http.request({}, function(res) {
                t.ok(res instanceof http.IncomingMessage);
                t.equal(resCount, 1);
                https.request({}, function(res) {
                    t.ok(res instanceof http.IncomingMessage);
                    t.equal(resCount, 2);
                    t.done();
                })
            })
        },

        'should use handler response if provided': function(t) {
            var res1 = {};
            var res2 = {};
            var ress = [res1, res2];
            qmock.mockHttp(function(req, res) {
                req.emit('mockResponse', ress.shift());
            })
            http.request({}, function(res) {
                t.equal(res, res1);
                https.request({}, function(res) {
                    t.equal(res, res2);
                    t.done();
                })
            })
        },
    },
};
