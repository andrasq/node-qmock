/**
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var http = require('http');
var https = require('https');
var assert = require('assert');
var util = require('util');

var QMock = require('../');
var qmock = QMock;
var stub = require('../lib/stub');

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
            t.equal(stub.stub, stub);
            t.equal(stub.stub._saveLimit, 3);

            // backward compat
            var stub2 = qmock.stub(null, function(){});
            t.equal(typeof stub2, 'function');
            t.equal(stub2.stub, stub2);
            t.equal(stub2.stub._saveLimit, 3);

            var obj = {};
            var stub3 = qmock.stub(obj, 'fn');
            t.equal(typeof stub3, 'function');
            t.equal(obj.fn, stub3);
            obj.fn();
            stub3();
            t.equal(stub3.callCount, 2);

            t.done();
        },

        'stub should override': function(t) {
            var called = false;

            var stub = qmock.stub(function(){ called = 10 });
            stub();
            t.equal(called, false);
            t.ok(stub.called);
            t.equal(stub.callCount, 1);
            t.equal(stub.args.length, 1);
            stub.restore()();
            t.equal(called, 10);

            var stub = qmock.stub(function(){ called = 21 }, null, function(){ called = 22 });
            stub();
            t.equal(called, 22);
            t.ok(stub.called);
            stub.restore()();
            t.equal(called, 21);

            var stub = qmock.stub(function(){ called = 31 }, function(){ called = 32 });
            stub();
            t.equal(called, 32);
            t.ok(stub.called);
            stub.restore()();
            t.equal(called, 31);

            called = 1;
            var obj = { fn: function(){ called = 41 } };
            var stub = qmock.stub(obj, 'fn');
            obj.fn();
            t.equal(called, 1);
            t.ok(stub.called);
            t.equal(stub.restore(), obj.fn);
            obj.fn();
            t.equal(called, 41);

            called = 1;
            var obj = { fn: function(){ called = 51 } };
            var stub = qmock.stub(obj, 'fn', function(){ called = 52 });
            obj.fn();
            t.equal(called, 52);
            t.ok(stub.called);
            t.equal(stub.restore(), obj.fn);
            obj.fn();
            t.equal(called, 51);

            t.done();
        },

        'stub should throw on invalid call args': function(t) {
            t.throws(function(){ qmock.stub(null, 'fname') }, /null object/);
            t.throws(function(){ qmock.stub({}, 'fname', 1) }, /not a function/);
            t.throws(function(){ qmock.stub(1, 2, 'three') }, /invalid arguments.*number,number,string/);
            t.throws(function(){ qmock.stub(1, null, 3) }, /invalid arguments.*number,null,number/);
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

        'stub.returns should return value': function(t) {
            var spy = qmock.stub().returns(12345);
            t.equal(spy(), 12345);
            t.equal(spy(), 12345);
            var spy = qmock.stub().returns(12345);
            t.equal(spy(), 12345);
            t.done();
        },

        'stub.throws should throw': function(t) {
            var spy = qmock.stub().throws(new Error('test error 1234'));
            t.throws(function(){ spy() }, /test error 1234/);
            t.throws(function(){ spy() }, /test error 1234/);
            var spy = qmock.spy().throws(new Error('test error 345'));
            t.throws(function(){ spy() }, /test error 345/);
            t.done();
        },

        'stub.yields should return and call back immediately': function(t) {
            var called;
            var cb = function(a, b, c){ called = [a, b, c] };
            var spy = qmock.stub(function(){}).yields(1, 2).returns(1234);
            var ret = spy(11, 12, cb, 13);
            t.ok(spy.called);
            t.deepEqual(spy.args[0].slice(0, 2), [11, 12]);
            t.ok(called);
            t.deepEqual(called, [1, 2, undefined]);
            t.equal(ret, 1234);
            t.done();
        },

        'stub.yields should throw and call back next tick': function(t) {
            var called;
            var cb = function(a, b, c){ called = [a, b, c] };
            var spy = qmock.stub(function(){}).yields(1, 2).throws(new Error('test error'));
            t.throws(function(){ spy(11, 12, cb, 13) }, /test error/);
            t.ok(spy.called);
            t.deepEqual(spy.args[0].slice(0, 2), [11, 12]);
            setImmediate(function() {
                t.deepEqual(called, [1, 2, undefined]);
                t.done();
            });
        },

        'on a function': {
            'stub should stub': function(t) {
                var called;
                var fn = function(){ called = true };
                var stub = qmock.stub(fn);
                stub();
                t.ok(!called);
                t.ok(stub.called);
                t.equal(stub.callCount, 1);
                t.equal(stub.restore(), fn);
                t.done();
            },

            'should stub a named method': function(t) {
                var called;
                var fn = function(){ called = 1 };
                var fn2 = fn.fn = function(){ called = 2 };
                var stub = qmock.stub(fn, 'fn');
                fn.fn();
                t.ok(!called);
                t.ok(stub.called);
                t.equal(stub.callCount, 1);
                t.equal(stub.restore(), fn2);
                t.done();
            },

            'should stub a function with an override': function(t) {
                var called;
                var fn = function(){ called = 1 };
                var stub = qmock.stub(fn, function(){ called = 2 });
                stub();
                t.ok(called == 2);
                t.ok(stub.called);
                t.equal(stub.callCount, 1);
                t.equal(stub.restore(), fn);
                t.done();
            },

            'should stub a named method with an override': function(t) {
                var called;
                var fn = function(){};
                var fn2 = fn.fn = function(){ called = true };
                var stub = qmock.stub(fn, 'fn', function(){ called = 3 });
                fn();
                fn.fn();
                t.ok(called == 3);
                t.ok(stub.called);
                t.equal(stub.callCount, 1);
                t.equal(stub.restore(), fn2);
                t.done();
            },
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
            }).configure('saveLimit', 2);
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
            }).configure('saveLimit', 2);
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
            var stub = qmock.stub(this.obj, 'call', this.obj.call);
            try {
                this.obj.call(function callbackThatThrows() { throw myError })
                t.fail("should have thrown");
            }
            catch (err) {
                stub.restore();
                t.equal(err, myError);
                t.equal(stub.callError, myError);
                t.equal(stub.callCallbackError, myError);
            }

            var spy = qmock.spy(this.obj, 'call')
            try {
                this.obj.call(function callbackThatThrows() { throw myError });
                t.fail('should have thrown');
            }
            catch (err) {
                spy.restore();
                t.equal(err, myError);
                t.equal(spy.callError, myError);
                t.equal(spy.callCallbackError, myError);
            }

            t.done();
        },

        'stub should default to 3 saved calls': function(t) {
            // without options
            var stub;
            stub = qmock.stub();
            t.equal(stub.stub._saveLimit, 3);
            stub = qmock.stub().configure('saveLimit', 123);
            t.equal(stub.stub._saveLimit, 123);
            stub = qmock.stub(function(){});
            t.equal(stub.stub._saveLimit, 3);
            stub = qmock.stub({ fn: function(){} }, 'fn');
            t.equal(stub.stub._saveLimit, 3);
            stub = qmock.stub({ fn: function(){} }, 'fn', function(){});
            t.equal(stub.stub._saveLimit, 3);

            // not included in options
            stub = qmock.stub(null, null, {});
            t.equal(stub.stub._saveLimit, 3);
            var stub = qmock.stub({fn: function(){}}, 'fn', {});
            t.equal(stub.stub._saveLimit, 3);
            var stub = qmock.stub({fn: function(){}}, 'fn', function(){}, {});
            t.equal(stub.stub._saveLimit, 3);

            t.done();
        },

        'spy should create an anonymous func': function(t) {
            var spy = qmock.spy();
            t.equal(typeof spy, 'function');
            t.equal(spy.stub, spy);
            t.done();
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

        'spy should invoke stub': function(t) {
            var spy = stub.spyOnce(stub, 'stub');
            var fn = function(){};
            stub.spy(fn)();
            t.ok(spy.called);
            t.done();
        },

        'restore should return the function': function(t) {
            var ncalls = 0;
            var fn = function(){ ncalls += 1 };
            var obj = { fn: fn };

            var spy = qmock.stub();
            t.equal(spy.restore(), undefined);

            var spy = qmock.spy();
            t.equal(spy.restore(), undefined);

            var spy = qmock.stub(fn);
            spy();
            t.equal(spy.callCount, 1);
            t.equal(ncalls, 0);
            t.equal(spy.restore(), fn);

            var spy = qmock.stub(obj, 'fn');
            obj.fn();
            t.equal(spy.callCount, 1);
            t.equal(ncalls, 0);
            t.equal(spy.restore(), fn);

            var spy = qmock.spy(fn);
            spy();
            t.equal(spy.callCount, 1);
            t.equal(ncalls, 1);
            t.equal(spy.restore(), fn);
            t.equal(obj.fn, fn);

            var spy = qmock.spy(obj, 'fn');
            obj.fn();
            t.equal(spy.callCount, 1);
            t.equal(ncalls, 2);
            t.equal(spy.restore(), fn);
            t.equal(obj.fn, fn);

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
            var stub = qmock.spy(this.obj, 'call').configure('saveLimit', 2);
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
            var stub = qmock.spy(this.obj, 'callcb').configure('saveLimit', 2);
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
            var spy = qmock.spy(object, 'method', function() {
                ncalls += 1;
            });
            object.method();
            var fn2 = spy.restore();
            t.equal(fn2, fn);
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
            t.equal(ncalls, 1);
            t.equal(spy.callCount, 1);
            obj.fn(22);
            // spy passes through the calls, both should show up
            t.equal(ncalls, 2);
            t.equal(spy.callCount, 1);
            t.deepEqual(spy.callArguments, [11]);
            t.done();

            // TODO: test spyOnce with a callback (to make sure stats are updated when callback is run)
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

        'stub.returnsOnce should return once': function(t) {
            var stub = qmock.stub().returns(1).returnsOnce(2).returnsOnce(3);
            t.equal(stub(), 2);
            t.equal(stub(), 3);
            t.equal(stub(), 1);
            t.equal(stub(), 1);
            t.done();
        },

        'stub.yieldsOnce should yield once': function(t) {
            var stub = qmock.stub().yields(1, 2).yieldsOnce(2, 3).yieldsOnce(3, 4);
            t.expect(8);
            stub(function(a, b) { t.equal(a, 2); t.equal(b, 3); }, 20, 30);
            stub(10, function(a, b) { t.equal(a, 3); t.equal(b, 4); }, 30);
            stub(10, 20, function(a, b) { t.equal(a, 1); t.equal(b, 2); });
            stub(10, 20, function(a, b) { t.equal(a, 1); t.equal(b, 2); });
            t.done();
        },

        'stub.throwsOnce should throw once': function(t) {
            var stub = qmock.stub().throws(new Error("error one")).throwsOnce(new Error("error two")).throwsOnce(new Error("error three"));
            t.throws(function(){ stub() }, /error two/);
            t.throws(function(){ stub() }, /error three/);
            t.throws(function(){ stub() }, /error one/);
            t.throws(function(){ stub() }, /error one/);
            t.done();
        },

        'stub._mockOnce yields should require an array': function(t) {
            t.ok(qmock.stub()._mockOnce());
            t.ok(qmock.stub()._mockOnce(null));
            t.ok(qmock.stub()._mockOnce(null, null));
            t.ok(qmock.stub()._mockOnce(null, null, null));
            t.ok(qmock.stub()._mockOnce(null, null, []));
            t.throws(function(){ qmock.stub()._mockOnce(null, null, 1) });
            t.throws(function(){ qmock.stub()._mockOnce(null, null, false) });
            t.done();
        },

        'getCall should return info about function call': function(t) {
            var spy = qmock.stub().returnsOnce(11).returnsOnce(12).throwsOnce(13);
            spy(1);
            spy(2, 3);
            try { spy() } catch (e) { }

            var call0 = spy.getCall(0);
            t.deepEqual(call0.args, [1]);
            t.deepEqual(call0.returnValue, 11);

            var call1 = spy.getCall(1);
            t.deepEqual(call1.args, [2, 3]);
            t.deepEqual(call1.returnValue, 12);

            var call2 = spy.getCall(2);
            t.deepEqual(call2.args, []);
            t.deepEqual(call2.returnValue, undefined);
            t.deepEqual(call2.exception, 13);

            t.done();
        },

        'getCall should return info about method call': function(t) {
            var obj = { fn: function(){ return 7 }  };
            var spy = qmock.spy(obj, 'fn').returnsOnce(123).throwsOnce(4444);

            obj.fn(1, 2);
            try { obj.fn() } catch (e) { }
            t.deepEqual(spy.getCall(0).args, [1, 2]);
            t.equal(spy.getCall(0).returnValue, 123);
            t.equal(spy.getCall(0).this, obj);
            t.equal(spy.getCall(1).exception, 4444);
            t.done();
        },

        'callsBefore and callsAfter should reflect call order': function(t) {
            var spy1 = qmock.stub();
            var spy2 = qmock.stub();
            t.ok(!spy1.calledBefore(spy2) && !spy1.calledAfter(spy2));
            spy1();
            spy2();
            t.ok(spy1.calledBefore(spy2) && spy2.calledAfter(spy1));
            spy1();
            t.ok(spy2.calledBefore(spy1) && spy1.calledAfter(spy2));
            t.done();
        }
    },
};
