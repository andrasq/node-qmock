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
var mockHttpServer = require('../lib/mockHttpServer');

module.exports = {

    'mockHttpServer': {
        'should export create and MockServer': function(t) {
            t.equal(typeof mockHttpServer.create, 'function');
            t.equal(typeof mockHttpServer.MockServer, 'function');
            t.done();
        },

        'should create() a mock http server': function(t) {
            var server = mockHttpServer.create();
            t.ok(server instanceof mockHttpServer.MockServer);
            t.done();
        },
    },

    'mockHttp server': {
        tearDown: function(done) {
            qmock.unmockHttp();
            done();
        },

        'should respond to string url request': function(t) {
            var wrote = false;
            var mock = qmock.mockHttp()
                .when("http://localhost:1337/test/page")
                .send(200, "It worked!", {'x-test-test': 'headers worked'});

            var req = http.request("http://localhost:1337/test/page", function(res) {
                var data = "";
                res.on('data', function(chunk){ data += chunk });
                res.on('end', function() {
                    t.equal(data, 'It worked!');
                    t.equal(res.headers['x-test-test'], 'headers worked');
                    t.done();
                })
            })
            req.on('error', function(err) { t.done(err) });
            req.end("test");
        },

        'should respond to uri request': function(t) {
            var mock = qmock.mockHttp()
                .when("http://localhost:1337/test/page")
                .send(200, "It worked!", {'x-test-test': 'headers worked'});

            var req = http.request({ hostname: 'localhost', port: 1337, pathname: '/test/page' }, function(res) {
                res.resume();
                res.on('end', function() {
                    t.done();
                })
            });
            req.end();
        },

        'send and write': {

            'send should set statusCode and response body': function(t) {
                var mock = qmock.mockHttp()
                    .when("/")
                    .send(222, "send body")
                var req = http.request("/", function(res) {
                    var data = "";
                    res.on('data', function(chunk) { data += chunk });
                    res.on('end', function() {
                        t.equal(res.statusCode, 222);
                        t.equal(data, 'send body');
                        t.done();
                    })
                })
                req.end();
            },

            'send should set headers': function(t) {
                var mock = qmock.mockHttp()
                    .when("/")
                    .send(222, "send body", {'send-headers': 'also 222'})
                var req = http.request("/", function(res) {
                    var data = "";
                    res.on('data', function(chunk) { data += chunk });
                    res.on('end', function() {
                        t.equal(res.statusCode, 222);
                        t.equal(data, 'send body');
                        t.equal(res.headers['send-headers'], 'also 222');
                        t.done();
                    })
                })
                req.end();
            },

            'send should accept compute function': function(t) {
                var mock = qmock.mockHttp()
                    .when("/")
                    .send(function(req, res, next) {
                        res.push('compute body');
                        res.push(null);
                    })
                var req = http.request("/", function(res) {
                    var data = "";
                    res.on('data', function(chunk) { data += chunk });
                    res.on('end', function() {
                        t.equal(data, 'compute body');
                        t.done();
                    })
                })
                req.end();
            },

            'send should accept just statusCode': function(t) {
                var mock = qmock.mockHttp()
                    .when("/")
                    .send(222)
                var req = http.request("/", function(res) {
                    var data = "";
                    res.on('data', function(chunk) { data += chunk });
                    res.on('end', function() {
                        t.equal(res.statusCode, 222);
                        t.done();
                    })
                })
                req.end();
            },

            'send should accept just body': function(t) {
                var mock = qmock.mockHttp()
                    .when("/")
                    .send("send body")
                var req = http.request("/", function(res) {
                    var data = "";
                    res.on('data', function(chunk) { data += chunk });
                    res.on('end', function() {
                        t.equal(data, 'send body');
                        t.done();
                    })
                })
                req.end();
            },

            'write should write response strings or buffers': function(t) {
                var wrote = false;
                var mock = qmock.mockHttp()
                    .when("http://localhost:1337/test/page")
                    .write("It")
                    .write(new Buffer(" "))
                    .write("work", 'utf8')
                    .write("ed", 'utf8', function(){
                        wrote = true
                    })
                    .send(201, "!");

                var req = http.request("http://localhost:1337/test/page", function(res) {
                    var data = "";
                    res.on('data', function(chunk){ data += chunk });
                    res.on('end', function() {
                        t.equal(data, 'It worked!');
                        t.equal(wrote, true);
                        t.equal(res.statusCode, 201);
                        t.done();
                    })
                })
                req.end();
            },

            'writeHead should set just statusCode': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://host/test")
                    .writeHead(201)
                var req = http.request("http://host/test", function(res) {
                    res.resume();
// FIXME: res.statusCode not set until all mock actions have been run,
// which are run only after this callback is called
                    res.on('end', function(){
                        t.equal(res.statusCode, 201);
                        t.done();
                    });
                })
                req.end();
            },

            'writeHead should set just headers': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://host/test")
                    .writeHead({ 'x-test-header-1': 1 })
                    .writeHead({ 'x-test-header-2': 2 })
                var req = http.request("http://host/test", function(res) {
                    res.resume();
                    res.on('end', function(){
                        t.deepEqual(res.headers, { 'x-test-header-1': '1', 'x-test-header-2': '2' });
                        t.done();
                    });
// FIXME: headers not set until all mock actions have been run at 'end' callback (should be already be set on res in callback)
//                    t.deepEqual(res.headers, { 'x-test-header-1': '1', 'x-test-header-2': '2' });
                })
                req.end();
            },

            'writeHead should set statusCode and headers': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://localhost:1337/test/page")
                    .writeHead(201)
                    .writeHead(202, { 'x-test-header': 1234 })
                    .writeHead({ 'x-test-header-2': 5678 })

                var req = http.request("http://localhost:1337/test/page", function(res) {
                    res.resume();
                    res.on('end', function() {
                        t.equal(res.statusCode, 202);
                        t.equal(res.headers['x-test-header'], '1234');
                        t.equal(res.headers['x-test-header-2'], '5678');
                        t.done();
                    })
                })
                req.end();
            },

            'end should set statusCode': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://host/test")
                    .end(202)
                var req = http.request("http://host/test", function(res) {
                    res.resume();
                    res.on('end', function() {
                        t.equal(res.statusCode, 202);
                        t.done();
                    })
                })
                req.end();
            },

            'end should set the body': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://host/test")
                    .end("test response")
                var req = http.request("http://host/test", function(res) {
                    var data = "";
                    res.resume();
                    res.on('data', function(chunk) {
                        data += chunk;
                    })
                    res.on('end', function() {
                        t.equal(data, "test response");
                        t.done();
                    })
                })
                req.end();
            },

            'end should set statusCode and body': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://host/test")
                    .end(203, "test response")
                var req = http.request("http://host/test", function(res) {
                    var data = "";
                    res.resume();
                    res.on('data', function(chunk) {
                        data += chunk;
                    })
                    res.on('end', function() {
                        t.equal(res.statusCode, 203);
                        t.equal(data, "test response");
                        t.done();
                    })
                })
                req.end();
            },

            'end should start the query': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://host/test")
                    .end(203, null)
                var req = http.request("http://host/test", function(res) {
                    res.resume();
                    var data = "";
                    res.on('data', function(chunk) { data += chunk });
                    res.on('end', function(err) {
                        t.equal(res.statusCode, 203);
                        t.done();
                    })
                })
                req.end();
            },
        },

        'should respond to request launched later': function(t) {
            var mock = qmock.mockHttp()
                .when("http://localhost:1337/test/page")
                .send(200, "It worked!", {'x-test-test': 'it worked'});

            var req = http.request("http://localhost:1337/test/page", function(res) {
                res.resume();
                res.on('end', function() {
                    t.done();
                })
            })
            setTimeout(function(){ req.end("test") }, 2);
        },

        'should allow multiple simultaneous urls': function(t) {
            var mock = qmock.mockHttp()
                .when("http://host1/url1")
                    .delay(10)
                    .send(200, "1")
                .when("http://host2/url2")
                    .send(200, "2");

            var responses = [];
            function checkResponse( res ) {
                res.on('data', function(chunk) {
                    responses.push(chunk.toString());
                    if (responses.length === 3) {
                        // NOTE: node-v8.1.4 failed on [0] under tracis-ci once... node timers?
                        // NOTE: also node-v4.8.4 once.
                        t.ok(responses[0] === "2");
                        t.ok(responses[1] === "1");
                        t.ok(responses[2] === "1");
                        t.done();
                    }
                });
            }
            var req1 = http.request("http://host1/url1", checkResponse);
            var req2 = http.request("http://host1/url1", checkResponse);
            req1.end();
            req2.end();
            setTimeout(function() {
                var req3 = http.request("http://host2/url2", checkResponse);
                req3.end();
            }, 4);
        },

        'when': {

            'should match by url string': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://localhost:1337/test/call")
                var req = http.request("http://localhost:1337/test/call/not/matched", function(res){ t.fail(); });
                req.on('error', function(err) { t.contains(err.message, 'not/matched') })
                req.end();
                var req = http.request("http://localhost:1337/test/call", function(res){ t.done(); });
                req.end();
            },

            'should match by path string': function(t) {
                var mock = qmock.mockHttp()
                    .when("/test/call")
                var req = http.request("http://localhost:1337/test/call/not/matched", function(res){ t.fail(); });
                req.on('error', function(err) { t.contains(err.message, 'not/matched') })
                req.end();
                var req = http.request("http://localhost:2337/test/call", function(res){ t.done(); });
                req.end();
            },

            'should match by regex': function(t) {
                var mock = qmock.mockHttp()
                    .when(/test.call/)
                var req = http.request("http://localhost:1337/not/matched", function(res){ t.fail(); });
                req.on('error', function(err) { t.contains(err.message, 'not/matched') })
                req.end();
                var req = http.request("http://test/call/yes/matched", function(res){
                    t.done();
                });
                req.end();
            },

            'should match by method and url string': function(t) {
                var mock = qmock.mockHttp()
                    .when("POST:http://localhost:1337/test/call")
                var uri = { method: 'POST', hostname: 'localhost', port: 1337, pathname: "/test/call" };
                var req = http.request(uri, function(res){ t.done(); });
                req.on('error', function(err) { t.done(err) });
                req.end();

                uri.method = 'GET';
                var req = http.request(uri, function(res){ t.fail(); });
                req.on('error', function(err) { t.contains(err.message, 'no handler for') })
                req.end();
            },

            'should match by method and path string': function(t) {
                var mock = qmock.mockHttp()
                    .when("POST:/test/call")
                var uri = { method: 'POST', hostname: 'localhost', port: 1337, pathname: "/test/call" };
                var req = http.request(uri, function(res){ t.done(); });
                req.on('error', function(err) { t.done(err) });
                req.end();

                uri.method = 'GET';
                var req = http.request(uri, function(res){ t.fail(); });
                req.on('error', function(err) { t.contains(err.message, 'no handler for') })
                req.end();
            },

            'should match by method and regex': function(t) {
                var mock = qmock.mockHttp()
                    .when(/POST:.*test.call/)
                var uri = { method: 'POST', hostname: 'localhost', port: 1337, pathname: "/test/call/yes/matched" };
                var req = http.request(uri, function(res){
                    t.done();
                });
                req.on('error', function(err) { t.done(err) });
                req.end();

                uri.method = 'GET';
                var req = http.request(uri, function(res){ t.fail(); });
                req.on('error', function(err) { t.contains(err.message, 'no handler for') })
                req.end();
            },

            'should match by function': function(t) {
                var mock = qmock.mockHttp()
                    .when(function(req, res) {
                        return true;
                    })
                var req = http.request("anything", function(){ t.done() });
                req.end();
            },

            'should throw on unrecognized when condition': function(t) {
                t.throws(function(){
                    var mock = qmock.mockHttp().when(123);
                });
                t.done();
            },

        },

        'before / after': {

            'should perform before and after actions': function(t) {
                var beforeCalled = false;
                var afterCalled = false;
                var mock = qmock.mockHttp()
                    .when("http://localhost:1337/test2/page2")
                    .send(200, "test response", {'x-test-worked': 'it worked'})
                    .before(function(req, res, next){ beforeCalled = true; next() })
                    .after(function(req, res, next){ afterCalled = true; next() });
                var req = http.request("http://localhost:1337/test2/page2", function(res) {
                    t.ok(beforeCalled);
                    res.resume();
                    res.on('end', function() {
                        setTimeout(function(){
                            t.ok(afterCalled);
                            t.done();
                        }, 5);
                    });
                })
                req.on('error', function(err) { t.done(err) });
                setTimeout(function(){ req.end() }, 2);
            },

            'before() / after() should select actions list': function(t) {
                var calls = [];
                var mock = qmock.mockHttp()
                    .after()
                    .compute(function(req, res, next) { calls.push('after 1'); next() })
                    .before(function(req, res, next) { calls.push('before 1'); next() })
                    .before()
                    .compute(function(req, res, next) { calls.push('before 2'); next() })
                    .after(function(req, res, next) { calls.push('after 2'); next() })
                    .when("http://localhost/")
                var req = http.request("http://localhost", function(res) { });
                setTimeout(function() {
                    t.deepEqual(calls, ['before 1', 'before 2', 'after 1', 'after 2']);
                    t.done();
                }, 5)
                req.end()
            },

        },

        'errors': {

            'should emit error if no handler defined for url': function(t) {
                var mock = qmock.mockHttp();
                t.expect(1);
                var req = http.request("http://localhost:1337/test/page", function(res) { });
                req.on('error', function(err) {
                    t.ok(err.message.indexOf('no handler for mock route') >= 0);
                    t.done();
                })
                req.end();
            },

            'should emit error from before actions': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://localhost:1337/test/page")
                    .before(function(req, res, next) { next(new Error("die")) })
                var req = http.request("http://localhost:1337/test/page", function(res) { });
                t.expect(1);
                req.on('error', function(err) {
                    t.equal(err.message, "die");
                    t.done();
                })
                req.end();
            },

            'should emit error from actions': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://localhost:1337/test/page")
                    .before(function(req, res, next) { next() })
                    .compute(function(req, res, next){ next(new Error("die")) })
                var req = http.request("http://localhost:1337/test/page", function(res) { });
                t.expect(1);
                req.on('error', function(err) {
                    t.equal(err.message, "die");
                    t.done();
                })
                req.end();
            },

            'should emit error from after actions': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://localhost:1337/test/page")
                    .before(function(req, res, next) { next() })
                    .after(function(req, res, next) { next(new Error("die")) })
                var req = http.request("http://localhost:1337/test/page", function(res) { });
                t.expect(1);
                req.on('error', function(err) {
                    t.equal(err.message, "die");
                    t.done();
                })
                req.end();
            },

            'should emit error programmatically': function(t) {
                var mock = qmock.mockHttp()
                    .when("http://test/call")
                    .emit('error', new Error("test error 409"))
                    .end(409)
                var req = http.request("http://test/call", function(res) {
                    res.resume();
                    t.expect(2);
                    res.on('error', function(err) {
                        t.equal(err.message, "test error 409");
                    })
                    res.on('end', function() {
                        t.equal(res.statusCode, 409);
                        t.done();
                    })
                })
                req.end()
            },

            'throw action should inject req error': function(t) {
                var mock = qmock.mockHttp()
                    .before()
                      .throw(new Error("before error"))
                    .when(/./)
                      .end(200)
                t.expect(1);
                var req = http.request("http://localhost", function(res) {
                    res.on('end', function() {
                        t.fail();
                    })
                })
                req.on('error', function(err) {
                    t.equal(err.message, "before error");
                    t.done();
                })
                req.end();
            },

        },
    },

    'helpers': {

        'buildUrl': {
            'setUp': function(done) {
                this.uri = {
                    protocol: undefined,
                    hostname: 'localhost',
                    port: 1337,
                    pathname: '/test/path',
                };
                done();
            },

            'should build url with host and port': function(t) {
                this.uri.protocol = null;
                var url = mockHttpServer.MockServer.buildUrl(this.uri, "/path");
                t.equal(url, "http://localhost:1337/path");
                t.done();
            },

            'should build url with host, port and protocol': function(t) {
                this.uri.protocol = 'https:';
                var url = mockHttpServer.MockServer.buildUrl(this.uri, "/some/path");
                t.equal(url, "https://localhost:1337/some/path");
                t.done();
            },

            'should build url with just host': function(t) {
                this.uri.port = null;
                var url = mockHttpServer.MockServer.buildUrl(this.uri, "/test/path");
                t.equal(url, "http://localhost/test/path");
                t.done();
            },
        },
    }
};
