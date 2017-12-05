/**
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var http = require('http');
var https = require('https');
var assert = require('assert');

var QMock = require('../');
var qmock = QMock;

module.exports = {

    'stub': {
        beforeEach: function(done) {
            var self = this;
            self.ncalls = 0;
            self.obj = {
                call: function() { self.ncalls += 1 ; return "abc123" },
                callcb: function(x, cb) { self.ncalls += 1 ; cb(null, x) }
            };
// FIXME: without done() will sometimes hang forever... but not always?
            done();
        },

        'stub should create an anonymous stub': function(t) {
            var stub = qmock.stub();
            t.equal(typeof stub, 'function');
            t.equal(typeof stub.stub, 'object');
            t.equal(stub.stub._saveLimit, 0);

            var stub2 = qmock.stub(null, function(){});
            t.equal(typeof stub2, 'function');
            t.equal(typeof stub2.stub, 'object');
            t.equal(stub2.stub._saveLimit, 0);

            t.done();
        },

        'stub should override with noop function by default': function(t) {
            var stub = qmock.stub(this.obj, 'call');
            this.obj.call();
            t.equal(this.ncalls, 0);
            t.equal(stub.callCount, 1);
            t.strictEqual(stub.called, true);
            t.done();
        },

        'stub should reject non-function override method': function(t) {
            t.throws(function(){ qmock.stub({ fn: 1 }, 'fn', 123, {}) });
            t.done();
        },

        'stub should override method with my call and return stub with stats': function(t) {
            var called = null;
            var mycall;
            var stub = qmock.stub(this.obj, 'call', mycall = function mycall(a, b) {
                var args = [];
                for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
                called = args;
                return 123;
            })
            t.ok(stub);
            t.equal(stub.callCount, 0);

            this.obj.call(3, 7);
            t.ok(!this.obj.ncalls, "did not override call");
            t.equal(stub.callCount, 1);
            t.deepEqual(stub.callArguments, [3, 7]);
            t.equal(stub.callError, null);
            t.equal(stub.callReturn, 123);
            t.equal(stub.callResult, 123);
            t.deepEqual(called, [3, 7]);
            t.done();
        },

        'stub should restore override': function(t) {
            var originalCall = this.obj.call;
            var mycall;
            var stub = qmock.stub(this.obj, 'call', function mycall() {});
            t.assert(this.obj.call != originalCall);
            stub.restore();
            t.assert(this.obj.call == originalCall);
            t.done();
        },

        'stub should restore added decoration': function(t) {
            t.assert(this.obj.nocall === undefined);
            var mycall;
            var stub = qmock.stub(this.obj, 'nocall', mycall = function mycall() {});
            t.equal(typeof this.obj.nocall, 'function');
            stub.restore();
            t.assert(this.obj.nocall === undefined);
            t.done();
        },

        'stub should track thrown exceptions': function(t) {
            var ncalls = 0;
            var myError = new Error("deliberate error");
            var stub = qmock.stub(this.obj, 'call', function mycall() {
                if (++ncalls < 2) return 1;
                throw myError;
            }, { saveLimit: 2 })
            this.obj.call(1);
            try {
                this.obj.call(7, 6, 5);
                t.fail();
            }
            catch (err) {
                t.equal(err, myError);
                t.ok(stub.callError);
                t.deepEqual(stub.callArguments, [7, 6, 5]);
                t.equal(stub.callError, myError);
                t.equal(stub.callReturn, null);
                t.equal(stub.callResult, null);
                // note: node-v0.10 deepEqual is strict, newer is not strict
                t.deepEqual(stub.getAllErrors(), [ null, myError ]);
                t.deepEqual(stub.getAllArguments(), [ [1], [7, 6, 5] ]);
                t.deepEqual(stub.getAllResults(), [ 1, undefined ]);
                t.done();
            }
        },

        'stub should track callbacks': function(t) {
            var stub = qmock.stub(this.obj, 'call', function mycall(a, b, cb) {
                cb(null, b);
                return 456;
            }, { saveLimit: 2 })
            t.expect(8);
            this.obj.call(33, 77, function mycb(err, b) {
                t.equal(stub.callCount, 1);
                t.deepEqual(stub.callArguments.slice(0, 2), [33, 77]);
                t.equal(typeof stub.callArguments[2], 'function');
                t.deepEqual(stub.callError, null);
                t.deepEqual(stub.callCallbackArguments, [null, 77]);
                t.deepEqual(stub.getAllCallbackArguments(), [ [null, 77] ]);
            })
            t.equal(stub.callReturn, 456);
            t.equal(stub.callResult, 456);
            t.done();
        },

        'stub should throw callback errors': function(t) {
            var myError = new Error("callback error");
            this.obj.call = function(cb) {
                cb();
            }
            var stub = qmock.stub(this.obj, 'call', { saveLimit: 1, stubWithSelf: true });
            try {
                this.obj.call(function callbackThatThrows() { throw myError })
                t.fail("should have thrown");
            }
            catch (err) {
                t.equal(err, myError);
                t.equal(stub.callError, myError);
                t.equal(stub.callCallbackError, myError);
                t.done();
            }
        },

        'spy should reject a non-function': function(t) {
            t.throws(function(){ qmock.spy(123); })
            t.throws(function(){ qmock.spy({}); })
            t.done();
        },

        'spy should spy on a function': function(t) {
            var fn1 = function(){};
            var spyFunc = qmock.spy(fn1);
            spyFunc(12, 345);
            t.equal(spyFunc.restore(), fn1);
            t.equal(spyFunc.stub.callCount, 1);
            t.equal(spyFunc.stub.callArguments[0], 12);
            t.equal(spyFunc.stub.callArguments[1], 345);
            t.done();
        },

        'spy should default to 10 saved calls': function(t) {
            // without options
            var spy = qmock.spy();
            t.equal(spy.stub._saveLimit, 10);
            var spy2 = qmock.spy({fn: function(){}}, 'fn');
            t.equal(spy2._saveLimit, 10);

            // not included in options
            var spy3 = qmock.spy(null, null, {});
            t.equal(spy3.stub._saveLimit, 10);
            var spy4 = qmock.spy({fn: function(){}}, 'fn', {});
            t.equal(spy4._saveLimit, 10);

            t.done();
        },

        'spy should call existing method by default': function(t) {
            var stub = qmock.spy(this.obj, 'call');
            this.obj.call();
            t.equal(this.ncalls, 1);
            t.equal(stub.callCount, 1);
            t.done();
        },

        'spy should spy without replacing': function(t) {
            var stub = qmock.spy(this.obj, 'call');
            this.obj.call(1, 2, 3, 4);
            t.deepEqual(stub.callArguments, [1, 2, 3, 4]);
            t.deepEqual(stub.callReturn, "abc123");
            t.deepEqual(stub.callResult, "abc123");
            t.strictEqual(stub.callError, null);
            t.done();
        },

        'spy should count calls': function(t) {
            var stub = qmock.spy(this.obj, 'call');
            t.equal(stub.callCount, 0);
            this.obj.call();
            t.equal(stub.callCount, 1);
            this.obj.call();
            t.equal(stub.callCount, 2);
            this.obj.call();
            t.equal(stub.callCount, 3);
            t.done();
        },

        'spy should make available the call arguments and return value': function(t) {
            var stub = qmock.spy(this.obj, 'call');
            this.obj.call(1, 2, 3);
            t.deepEqual(stub.callArguments, [1, 2, 3]);
            t.equal(stub.callReturn, "abc123");
            t.equal(stub.callResult, "abc123");
            t.done();
        },

        'spy should record first N calls ': function(t) {
            var stub = qmock.spy(this.obj, 'call', { saveLimit: 2 });
            this.obj.call(1);
            this.obj.call(2, 2);
            this.obj.call(3, 3, 3);
            t.equal(stub.callCount, 3);
            t.deepEqual(stub.callArguments, [3, 3, 3]);
            t.deepEqual(stub.callReturn, "abc123");
            t.deepEqual(stub.callResult, "abc123");
            t.deepEqual(stub.args, [ [1], [2, 2] ]);
            t.deepEqual(stub.getAllArguments(), [ [1], [2, 2] ]);
            t.deepEqual(stub.getAllResults(), [ "abc123", "abc123" ]);
            t.done();
        },

        'spy should record first N callbacks': function(t) {
            var stub = qmock.spy(this.obj, 'callcb', { saveLimit: 2 });
            var cb = qmock.spy();
            this.obj.callcb(1, cb);
            this.obj.callcb(22, cb);
            this.obj.callcb(333, cb);
            t.equal(stub.callCount, 3);
            t.deepEqual(stub.getAllCallbackArguments(), [ [null, 1], [null, 22] ]);
            t.equal(cb.stub.callCount, 3);
            t.done();
        },

        'spy should return a stub': function(t) {
            var spy = qmock.spy(this.obj, 'call');
            t.equal(spy._type, 'qmockStub');
            t.done();
        },

        'spy should create anonymous function stub': function(t) {
            var spy = qmock.spy();
            t.equal(typeof spy, 'function');
            spy(1);
            spy(2, 3);
            t.equal(spy.stub.callCount, 2);
            t.deepEqual(spy.stub.args, [[1], [2,3]]);
            t.done();
        },

        'spy function should access `this`': function(t) {
            var object = { a: 123 };
            object.spy = qmock.spy(function(n) { return n * this.a });
            t.equal(object.spy(3), 369);
            t.done();
        },

        'spy of method should allow restore': function(t) {
            var fn = function() {};
            var object = { method: fn };
            var ncalls = 0;
            qmock.spy(object, 'method', function() {
                ncalls += 1;
            });
            object.method();
            object.method.restore();
            object.method();
            t.equal(ncalls, 1);
            t.equal(object.method, fn);
            t.done();
        },

        'spy should track up to 10 calls': function(t) {
            var spy = qmock.spy(this.obj, 'call');
            t.equal(spy.callCount, 0);
            this.obj.call(1);
            t.equal(spy.callCount, 1);
            this.obj.call(2);
            t.equal(spy.callCount, 2);
            this.obj.call(3);
            this.obj.call(4);
            this.obj.call(5);
            this.obj.call(6);
            this.obj.call(7);
            this.obj.call(8);
            this.obj.call(9);
            this.obj.call(10);
            this.obj.call(11);
            this.obj.call(12);
            t.equal(spy.callCount, 12);
            t.deepEqual(spy.getAllArguments(), [ [1], [2], [3], [4], [5], [6], [7], [8], [9], [10] ]);
            t.done();
        },

        'should stubOnce': function(t) {
            var ncalls = 0;
            var callArg;
            var obj = { fn: function(x) { callArg = x; ncalls += 1 } };
            var fn = obj.fn;
            var stub = qmock.stubOnce(obj, 'fn');
            t.notEqual(obj.fn, fn);
            obj.fn(11);
            t.equal(obj.fn, fn);
            obj.fn(22);
            // stub traps calls, only the un-stubbed should show up
            t.equal(ncalls, 1);
            t.equal(callArg, 22);
            t.equal(stub.callCount, 1);
            t.deepEqual(stub.callArguments, [11]);
            t.done();
        },

        'should spyOnce': function(t) {
            var ncalls = 0;
            var obj = { fn: function() { ncalls += 1 } };
            var fn = obj.fn;
            var spy = qmock.spyOnce(obj, 'fn');
            t.notEqual(obj.fn, fn);
            obj.fn(11);
            t.equal(obj.fn, fn);
            obj.fn(22);
            // spy passes through the calls, both should show up
            t.equal(ncalls, 2);
            t.equal(spy.callCount, 1);
            t.deepEqual(spy.callArguments, [11]);
            t.done();
        },

        'should spyOnce even if it throws': function(t) {
            var error = new Error("deliberate error");
            var obj = { fn: function(){ throw error } };
            var fn = obj.fn;
            var spy = qmock.spyOnce(obj, 'fn');
            try {
                t.notEqual(obj.fn, fn);
                obj.fn(1);
            } catch (err) {
                t.equal(err.message, 'deliberate error');
                t.equal(obj.fn, fn);
                t.equal(spy.callCount, 1);
                t.deepEqual(spy.callArguments, [1]);
                t.equal(spy.error, error);
            }
            t.done();
        },
    },
};
