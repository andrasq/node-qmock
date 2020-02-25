/**
 * Copyright (C) 2017-2020 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var http = require('http');
var https = require('https');
var util = require('util');
var events = require('events');

var qmock = require('../');
var qassert = require('qassert');
var mockHttp = require('../lib/mockHttp');
var mockHttpServer = require('../lib/mockHttpServer');

// fromBuf adapted from qibl
var fromBuf = eval('parseInt(process.versions.node) >= 6 ? Buffer.from : Buffer');

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

            var req = http.request({ hostname: 'localhost', port: 1337, path: '/test/page' }, function(res) {
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
                    .write(fromBuf(" "))
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
                    .delay(50)
                    .send(200, "1")
                .when("http://host2/url2")
                    .send(200, "2");

            var responses = [];
            function checkResponse( res ) {
                res.on('data', function(chunk) {
                    responses.push(chunk.toString());
                    if (responses.length === 3) {
                        // NOTE: node-v8.1.4 failed on [0] under tracis-ci once... node timers?
                        // NOTE: also node-v4.8.4 once, also node-v0.10.48 repeatedly.
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
            }, 10);
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
                    .when("GET:http://localhost:1337/test/call")
                var uri = { method: 'GET', hostname: 'localhost', port: 1337, path: "/test/call" };
                var req = http.request(uri, function(res){ t.done(); });
                req.on('error', function(err) { t.done(err) });
                req.end();

                uri.method = 'POST';
                var req = http.request(uri, function(res){ t.fail(); });
                req.on('error', function(err) { t.contains(err.message, 'no handler for') })
                req.end();
            },

            'should match by method and path string': function(t) {
                var mock = qmock.mockHttp()
                    .when("POST:/test/call")
                var uri = { method: 'POST', hostname: 'localhost', port: 1337, path: "/test/call?a=1" };
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
                var uri = { method: 'POST', hostname: 'localhost', port: 1337, path: "/test/call/yes/matched" };
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

            'should respond with on': function(t) {
                var mock = qmock.mockHttp()
                    .on("http://somehost:80/some/path")
                    .send(200, "some response");

                var req = http.request({ host: 'somehost', port: 80, path: '/some/path' }, function(res) {
                    var body = "";
                    res.on('data', function(chunk) { body += chunk });
                    res.on('end', function() {
                        t.equal(body, "some response");
                        t.done();
                    })
                })
                req.end();
            },

            'should respond with once': function(t) {
                var mock = qmock.mockHttp()
                    .once("http://somehost:80/some/path")
                        .send(200, "some response")
                    .once("http://somehost:80/some/path")
                        .send(200, "other response")
                    .default()
                      .write('default response');

                var req = http.request({ host: 'somehost', port: 80, path: '/some/path' }, function(res) {
                    var body = "";
                    res.on('data', function(chunk) { body += chunk });
                    res.on('end', function() {
                        t.equal(body, "some response");
                        var req2 = http.request({ host: 'somehost', port: 80, path: '/some/path' }, function(res) {
                            var body = "";
                            res.on('data', function(chunk) { body += chunk });
                            res.on('end', function() {
                                t.equal(body, "other response");
                                t.done();
                            })
                        })
                        req2.end();
                    })
                })
                req.end();
            },

            'should respond with default': function(t) {
                var mock = qmock.mockHttp()
                    .when('http://somehost/some/path')
                      .send(200, 'some response')
                    .default()
                      .write('default')
                      .write(' ')
                      .send(200, 'response');

                var req = http.request('/some/other/path', function(res) {
                    var body = "";
                    res.on('data', function(chunk) { body += chunk });
                    res.on('end', function() {
                        t.equal(body, 'default response');
                        t.done();
                    })
                })
                req.end();
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

        'makeRequest': {

            before: function(done) {
                var self = this;
                this.echoServer = http.createServer(function requestListener(req, res) {
                    var chunks = [];
                    req.on('data', function(chunk) {
                        chunks.push(chunk);
                    });
                    req.on('end', function() {
                        var response = {
                            echo: {
                                method: req.method,
                                url: req.url,
                                path: req.path,
                                headers: req.headers,
                                body: Buffer.concat(chunks).toString(),
                            }
                        };
                        res.writeHead(202);
                        res.write(JSON.stringify(response));
                        res.end();
                    })
                    req.on('error', function(err) { })
                });
                this.echoServer.listen(1337, done);
            },

            after: function(done) {
                this.echoServer.close(done);
            },

            setUp: function(done) {
                this.mockReq = new events.EventEmitter();
                this.mockReq._mockWrites = [];
                this.mockReq._headers = {};
                this.mockReq.write = function(chunk, encoding){ this._mockWrites.push([chunk, encoding]) };
                this.mockReq.end = function(){ this._mockWrites.push(null) };
                this.mockReq.setHeader = function(name, value) { this._headers[name] = value };
                done();
            },

            'should make real request': function(t) {
                var calls = [];
                var mockReq = this.mockReq;
                var spy = t.stubOnce(mockHttp._methods, 'sysHttpsRequest', function(uri) { calls.push(uri); return mockReq });
                var mock = qmock.mockHttp()
                    .when("http://localhost:8008/test/call")
                      .makeRequest("https://otherhost.com:1234/other/call")

                var req = http.request("http://localhost:8008/test/call", function(res) { });
                setTimeout(function() {
                    t.equal(calls[0].protocol, 'https:');
                    t.equal(calls[0].hostname, 'otherhost.com');
                    t.equal(calls[0].port, 1234);
                    t.equal(calls[0].path, '/other/call');
                    t.done();
                }, 10)
                req.on('error', function(err) { t.done(err) });
                req.end();
            },

            'should make actual real request with request body': function(t) {
                var uri = {
                    host: 'localhost', port: 1337, protocol: 'http:', method: 'PUT', path: '/other/call2?a&b',
                    headers: {
                        'transfer-encoding': 'chunked',
                    }
                };
                var mock = qmock.mockHttp()
                    .when('http://localhost:8008/test/call')
                      .makeRequest(uri);
                var req = http.request('http://localhost:8008/test/call', function(res) {
                    var chunks = [];
                    res.on('data', function(chunk) { chunks.push(chunk) });
                    res.on('end', function() {
                        var body = Buffer.concat(chunks);
                        body = JSON.parse(body);
                        t.equal(body.echo.url, '/other/call2?a&b');
                        t.equal(body.echo.method, 'PUT');
                        t.done();
                    })
                })
                req.on('error', function(err) { t.done(err) });
                req.end('test req body');
            },

            'should use url from the request': function(t) {
                var calls = [];
                var mockReq = this.mockReq;
                var spy = t.stubOnce(mockHttp._methods, 'sysHttpsRequest', function(uri) { calls.push(uri); return mockReq });
                var mock = qmock.mockHttp()
                    .when("https://localhost:123/test/call")
                      .makeRequest()

                var req = https.request("https://localhost:123/test/call", function(res) { });
                setTimeout(function() {
                    t.equal(calls[0].protocol, 'https:');
                    t.equal(calls[0].hostname, 'localhost');
                    t.equal(calls[0].port, 123);
                    t.equal(calls[0].path, '/test/call');
                    t.done();
                }, 10)
                req.on('error', function(){ t.done(err) });
                req.end("foo");
            },

            'should emit error if method deleted from req': function(t) {
                qmock.mockHttp()
                    .on('http://localhost:1337/some/path')
                      .compute(function(req, res, next) { delete req.method; next() })
                      .makeRequest();

                var req = http.request('http://localhost:1337/some/path', function(res) {
                })
                req.on('error', function(err) { t.contains(err.message, 'was deleted'); t.done() });
                req.end();
            },

            'provided params': {
                'should use provided uri': function(t) {
                    var uri = { method: 'POST', host: 'localhost', port: 1337, path: '/other/path2' };
                    qmock.mockHttp()
                        .when('http://somehost/host/path')
                          .makeRequest(uri, "alternate body", { 'custom-header-1': 1, 'custom-header-2': 2 });

                    var req = http.request('http://somehost/host/path', function(res) {
                        var response = '';
                        res.on('data', function(chunk) { response += chunk });
                        res.on('end', function() {
                            response = JSON.parse(response);
                            t.equal(response.echo.url, '/other/path2');
                            t.equal(response.echo.headers['custom-header-1'], 1);
                            t.equal(response.echo.method, 'POST');
                            t.done();
                        })
                    })
                    req.end();
                },

                'should use provided url, body and headers': function(t) {
                    qmock.mockHttp()
                        .when('http://host/path')
                          .makeRequest('http://localhost:1337/path2', "alternate body", { 'custom-header-1': 1, 'custom-header-2': 2 });

                    var req = http.request("http://host/path", function(res) {
                        var response = "";
                        res.on('data', function(chunk) { response += chunk });
                        res.on('end', function() {
                            response = JSON.parse(response);
                            t.equal(response.echo.url, '/path2');
                            t.equal(response.echo.body, 'alternate body');
                            t.contains(response.echo.headers, { 'custom-header-1': 1, 'custom-header-2': 2 });
                            t.done();
                        })
                    })
                    req.end();
                },
            },

            'https calls': {
                'should default to http calls': function(t) {
                    var mockReq = this.mockReq;
                    var spy = t.stubOnce(mockHttp._methods, 'sysHttpRequest', function(uri) { return mockReq });
                    var mock = qmock.mockHttp()
                        .when('https://host:1234/call/path')
                          .makeRequest({ host: 'host', port: 1234, path: '/other/path' });

                    var req = https.request('https://host:1234/call/path', function(res) {});
                    setTimeout(function() {
                        t.ok(spy.called);
                        t.equal(spy.args[0][0].protocol, 'http:');
                        t.done();
                    }, 5)
                    req.end();
                },

                'should make https request by protocol': function(t) {
                    var mockReq = this.mockReq;
                    var spy = t.stubOnce(mockHttp._methods, 'sysHttpsRequest', function(uri) { return mockReq });
                    var mock = qmock.mockHttp()
                        .when('https://host:1234/call/path')
                          .makeRequest();

                    var req = https.request('https://host:1234/call/path', function(res) {});
                    setTimeout(function() {
                        t.equal(spy.args[0][0].protocol, 'https:');
                        t.done();
                    }, 5);
                    req.end();
                },

                'should make https request by port': function(t) {
                    var mockReq = this.mockReq;
                    var spy = t.stubOnce(mockHttp._methods, 'sysHttpsRequest', function(uri) { return mockReq });
                    var mock = qmock.mockHttp()
                        .when('https://host:1234/call/path')
                          .makeRequest({ host: 'host', port: 443, path: '/other/path' });

                    var req = https.request('https://host:1234/call/path', function(res) {});
                    setTimeout(function() {
                        t.ok(spy.called);
                        t.done();
                    }, 50);
                    req.end();
                },

                'should make https request by url': function(t) {
                    var mockReq = this.mockReq;
                    var spy = t.stubOnce(mockHttp._methods, 'sysHttpsRequest', function(uri) { return mockReq });
                    var mock = qmock.mockHttp()
                        .when('https://host:1234/call/path')
                          .makeRequest();

                    var req = https.request('https://host:1234/call/path', function(res) {});
                    setTimeout(function() {
                        t.ok(spy.called);
                        t.done();
                    }, 50);
                    req.end();
                },
            },

            'should relay request to and response from real request': function(t) {
                qmock.mockHttp()
                    .when("http://localhost:1337/test/call")
                      .makeRequest()

                var req = http.request("http://localhost:1337/test/call", function(res) {
                    var response = "";
                    res.on('data', function(chunk) { response += chunk });
                    res.on('end', function() {
                        t.equal(res.statusCode, 202);
                        response = JSON.parse(response);
                        t.equal(response.echo.body, 'test call body');
                        t.contains(response.echo.headers, { 'transfer-encoding': 'chunked', 'test-header-1': 'value-1' });
                        t.done();
                    })
                })
                req.on('error', function(err) {
                    t.done(err);
                })

                // WARNING: nodejs errors out GET calls with a body but without
                // content-length or transfer-encoding set.  Error is "socket hang up",
                // the internal error is "bytesParsed: 92, code: HPE_INVALID_METHOD".
                //req.setHeader('Content-Length', 14);
                req.setHeader('Transfer-Encoding', 'chunked');

                req.setHeader('test-header-1', 'value-1');
                req.write('test call ');
                req.end('body');
            },

            'should relay req error from real request': function(t) {
                var error = new Error('mock req error');
                var mockReq = this.mockReq;
                t.stubOnce(mockHttp._methods, 'sysHttpRequest', function(uri) {
                    setTimeout(function(){ mockReq.emit('error', error) }, 5);
                    return mockReq;
                });

                qmock.mockHttp()
                    .when('http://localhost/path')
                      .makeRequest()

                var req = http.request("http://localhost/path", function(res) { });
                req.on('error', function(err) {
                    t.equal(err, error);
                    t.done();
                })
                req.end();
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
                    method: 'GET',
                    protocol: undefined,
                    hostname: 'localhost',
                    port: 1337,
                    path: '/test/path',
                };
                done();
            },

            'should build url form uri fields': function(t) {
                var tests = [
                    [ { },                                                      "http://localhost/" ],
                    [ { host: 'somehost' },                                     "http://somehost/" ],
                    [ { host: 'somehost', hostname: 'otherhost' },              "http://otherhost/" ],
                    [ { hostname: 'somehost', port: 1337 },                     "http://somehost:1337/" ],
                    [ { host: 'host', path: '/path/name' },                     "http://host/path/name" ],
                    [ { hostname: 'host2', port: 1337, path: '/path/name' },    "http://host2:1337/path/name" ],
                    [ { host: 'host3', port: 8888, protocol: 'https:' },        "https://host3:8888/" ],
                    [ { host: 'host3', protocol: 'https:', path: '/page' },     "https://host3/page" ],
                    [ { host: 'host4', query: 'a=1', search: '?a=1' },          "http://host4/" ],
                    [ { host: 'host5', path: '/path/?a=1' },                    "http://host5/path" ],
                    [ { host: 'host5', path: '/path' },                         "http://host5/path" ],
                    [ { host: 'host5', path: '/path/?a=1' },                    "http://host5/path" ],
                    [ { host: 'host5', path: '/path?a=1' },                     "http://host5/path" ],
                    [ { host: 'host5', path: '/?a=1' },                         "http://host5/" ],
                    [ { host: 'host5', path: '?a=1' },                          "http://host5/" ],
                    [ { host: 'host5', hostname: 'host6', path: '/path?a=1' },  "http://host6/path" ],
                ];

                // the fields used to make a request are method, protocol, host/hostname, port, path (default "http:// localhost :80 /")
                // If both host and hostname are present, hostname takes precedence.  Pathname, query, search, hash do not participate.

                for (var i=0; i<tests.length; i++) {
                    var uri = tests[i][0];
                    var expect = tests[i][1];
                    var url = mockHttpServer.MockServer.buildUrl(uri);
                    t.equal(url, expect, util.format("tests[%d]: uri = %s", i, util.format(uri)));
                }

                t.done();
            },
        },

        'parseUrl': {
            'should parse annotated url': function(t) {
                var tests = [
                    [ 'post:https://user12:pass34@somehost.com/some/path1', {
                        method: 'POST', protocol: 'https:', hostname: 'somehost.com', path: '/some/path1', auth: 'user12:pass34' } ],
                ];

                for (var i=0; i<tests.length; i++) {
                    t.contains(mockHttpServer.MockServer.parseUrl(tests[i][0]), tests[i][1]);
                }

                t.done();
            },
        },
    }
};
