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

    'mockHttp server': {
        tearDown: function(done) {
            qmock.unmockHttp();
            done();
        },

        'should respond to request': function(t) {
            var mock = qmock.mockHttp()
                .when("http://localhost:1337/test/page")
                .send(200, "It worked!", {'x-test-test': 'it worked'});

            var req = http.request("http://localhost:1337/test/page", function(res) {
                var data = "";
                res.on('data', function(chunk){ data += chunk });
                res.on('end', function() {
                    t.equal(data, 'It worked!');
// FIXME: fix headers
                    t.done();
                })
            })
            req.on('error', function(err) { t.done(err) });
            req.end("test");
        },

        'should allow multiple simultaneous urls': function(t) {
            var mock = qmock.mockHttp()
                .when("http://host1/url1")
                    .delay(5)
                    .send(200, "1")
                .when("http://host2/url2")
                    .send(200, "2");

            var responses = [];
            function checkResponse( res ) {
                res.on('data', function(chunk) {
                    responses.push(chunk.toString());
                    if (responses.length === 3) {
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
            }, 2);
        },
    },
};
