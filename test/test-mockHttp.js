/**
 * Copyright (C) 2017,2020 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var http = require('http');
var https = require('https');
var assert = require('assert');

// the system request methods before they were intercepted
var httpRequest = http.request;
var httpsRequest = https.request;

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

        'should re-vector request methods when loaded': function(t) {
            qmock.mockHttp(function(req, res) {});
            t.notEqual(http.request, httpRequest);
            t.notEqual(https.request, httpsRequest);
            t.equal(http.request, mockHttp._methods.interceptedHttpRequest);
            t.equal(https.request, mockHttp._methods.interceptedHttpsRequest);
            t.notEqual(mockHttp._methods.httpRequest, mockHttp._methods.sysHttpRequest);
            t.notEqual(mockHttp._methods.httpsRequest, mockHttp._methods.sysHttpsRequest);
            t.done();
        },

        'should restore methods': function(t) {
            qmock.unmockHttp();
            t.equal(mockHttp._methods.httpRequest, mockHttp._methods.sysHttpRequest);
            t.equal(mockHttp._methods.httpsRequest, mockHttp._methods.sysHttpsRequest);
            t.done();
        },

        're-vectored methods should make http requests': function(t) {
            var server = http.createServer(function(req, res) {
                res.writeHead(201);
                res.end();
            })
            server.listen(1337);
            t.expect(1);
            var req = http.request("http://localhost:1337/", function(res) {
                server.close();
                t.equal(res.statusCode, 201);
                t.done();
            })
            req.end();
        },

        'should install and uninstall mock methods, uninstalled by default': function(t) {
            mockHttp.install();
            var req = http.request;
            var reqs = https.request;
            mockHttp.uninstall();
            t.equal(http.request, httpRequest);
            t.equal(https.request, httpsRequest);
            t.notEqual(http.request, req);
            t.notEqual(https.request, reqs);
            t.done();
        },

        'request should return instance of ClientRequest': function(t) {
            qmock.mockHttp(function(){})
            var req = http.request("", function(){});
            t.ok(req instanceof http.ClientRequest);
            t.done();
        },

        'http and https request methods should invoke the provided handler': function(t) {
            var ncalls = 0;
            t.expect(2);
            qmock.mockHttp(function handler(req, res) {
                t.ok(1);
                if (++ncalls == 2) t.done();
            })
            http.request({}, function(res) {});
            https.request({}, function(res) {});
        },

        'http and https request functions should invoke the provided handler': function(t) {
            var ncalls = 0;
            t.expect(2);
            qmock.mockHttp(function handler(req, res) {
                t.ok(1);
                if (++ncalls == 2) t.done();
            })
            var request = http.request;
            request({}, function(res) {});
            var request = https.request;
            request({}, function(res) {});
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

        'should propagate request options headers': function(t) {
            qmock.mockHttp(function(req, res) {
                t.contains(getHeaders(req), { 'header-one': 1, 'header-two': 2, 'header-three': 3 });
                t.done();
            })
            var req = http.request({ host: "localhost", path: "/some/path", headers: { 'Header-One': 1, 'Header-Two': 222 }}, function(res) {
            })
            req.setHeader('header-two', 2);
            req.setHeader('header-three', 3);
            t.contains(getHeaders(req), { 'header-one': 1, 'header-two': 2, 'header-three': 3 });
        },

        'should allow setTimeout on request': function(t) {
            qmock.mockHttp(function(req, res) {
                qmock.unmockHttp();
                t.done();
            })
            var req = http.request("http://localhost:1337", function(res) { });
            t.equal(typeof req.setTimeout, 'function');
            req.setTimeout(999999);
            req.end();
        },

        'should add auth to url': function(t) {
            qmock.mockHttp(function(req, res) {
                t.equals(req._headers.authorization, 'Basic dXNlcjEyMzQ6cGFzczU2Nzg=');
                t.done();
            });
            var req = http.request({ protocol: 'http', host: 'somehost', path: '/some/path?a&b#hash', auth: 'user1234:pass5678' }, function(res) {});
            req.end();
        },

        'should throw on invalid auth': function(t) {
            t.throws(function(){ http.request({ protocol: 'http', host: 'somehost', path: '/some/path', auth: 1234 }, function(res) {}) });
            t.done();
        },

        'abort should emit an error': function(t) {
            qmock.mockHttp(function() {});
            var req = http.request('http://somehost/some/path');
            req.on('error', function(err) {
                t.ok(err);
                t.equal(err.code, 'ECONNRESET');
                t.contains(err.message, 'socket hang up');
                t.done();
            })
            req.end();
            req.abort();
        },

        'socket.destroy should emit an error and stop delivering writes': function(t) {
            qmock.mockHttp(function(req, res) {
                // destroyed connections should not deliver writes
                req.on('_mockWrite', function() { t.fail() });
            })
            var req = http.request('http://somehost/some/path');
            req.on('error', function(err) {
                t.ok(err);
                t.ok(err.code);
                setTimeout(t.done, 40);
            })
            req.socket.destroy();
            req.write('');
            req.end();
        },
    },
};


// newer headers are an Object with a null constructor
function assign(target, obj) {
    var keys = Object.keys(obj);
    for (var i=0; i<keys.length; i++) target[keys[i]] = obj[keys[i]];
    return target;
}
// older node does not have req.getHeaders(), newer deprecates accessing req._headers,
function getHeaders(req) {
    return req.getHeaders ? assign({}, req.getHeaders()) : req._headers;
}
