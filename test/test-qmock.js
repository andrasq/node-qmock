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
var mockHttp = require('../lib/mockHttp');
var mockTimers = require('../lib/mockTimers');
var MockTimers = mockTimers.MockTimers;

module.exports = {
    setUp: function(done) {
        this.templateClass = function() {
            return {
                a: 1,
                b: 2.34,
                c: null,
                d: false,
                e: { a:1 },
                f: function() { return 'e'; },
            };
        };
        this.templateObject = new this.templateClass();
        done();
    },

    tearDown: function(done) {
        done();
    },

    'package.json should be valid json': function(t) {
        var contents = require('../package.json');
        t.done();
    },

    'QMock': {
        'should export stub and spy': function(t) {
            t.equal(typeof qmock.stub, 'function');
            t.equal(typeof qmock.spy, 'function');
            t.equal(typeof qmock.stubOnce, 'function');
            t.equal(typeof qmock.spyOnce, 'function');
            t.done()
        },

        'should return a clone of the object': function(t) {
            var i;
            var obj = this.templateObject;
            var mock = QMock.getMock(obj, []);
            for (i in obj) {
                t.ok(obj[i] === mock[i]);
            }
            t.done();
        },

        'should return an instance of a mocked constructor': function(t) {
            var constructor = function() { this.a = 1; };
            var obj = new constructor();
            t.done();
        },

        'should stub out mocked methods': function(t) {
            var wasCalled = false;
            var obj = { m: function() { wasCalled = true; assert(false, "should not be called"); } };
            var mock = QMock.getMock(obj, ['m']);
            mock.m();
            t.equal(wasCalled, false);
            t.done();
        },

        'should override mocked methods': function(t) {
            var obj = { m: 1 };
            var mock = QMock.getMock(obj, ['m']);
            mock.m();
            t.done();
        },

        'should implement mocked methods': function(t) {
            var obj = { };
            var mock = QMock.getMock(obj, ['m']);
            mock.m();
            t.done();
        },

        'should stub out all methods if methodsToStub is true or undefined': function(t) {
            var obj = {a: function(){ return 1; }, b: function(){ return 2; }};
            var i, yesStub = [true, 1, undefined];
            for (i=0; i<yesStub.length; i++) {
                var mock = QMock.getMock(obj, yesStub[i]);
                t.equal(mock.a(), undefined, yesStub[i] + " should stub out methods");
                t.equal(mock.b(), undefined, yesStub[i] + " should stub out methods");
            }
            t.done();
        },

        'should not stub out any methods methodsToStub is [] or null or false': function(t) {
            var obj = {a: function(){ return 1; }, b: function(){ return 2; }};
            var i, noStub = [null, [], false];
            for (i=0; i<noStub.length; i++) {
                var mock = QMock.getMock(obj, noStub[i]);
                t.equal(mock.a(), 1, noStub[i] + " should not stub out methods");
                t.equal(mock.b(), 2, noStub[i] + " should not stub out methods");
            }
            t.done();
        },

        'should decorate tester object': function(t) {
            var tester = {};
            QMock.extendWithMocks(tester);
            t.equal(typeof tester.getMock, 'function');
            t.equal(typeof tester.getMockSkipConstructor, 'function');
            t.equal(typeof tester.done, 'function');
            var decoratedMethods = [
                'getMock', 'getMockSkipConstructor',
                'stub', 'spy', 'mockTimers', 'unmockTimers', 'mockHttp', 'unmockHttp',
            ];
            for (var i=0; i<decoratedMethods.length; i++) {
                var method = decoratedMethods[i];
                t.equal(typeof tester[method], 'function');
                t.equal(tester[method].name, method);
            }
            t.done();
        },

        'should not decorate tester twice': function(t) {
            var tester = QMock.extendWithMocks({});
            t.expect(1);
            try { QMock.extendWithMocks(tester); assert(false, "expected error"); }
            catch (err) { t.ok(true); };
            t.done();
        },

        'should stubOnce': function(t) {
            var ncalls = 0;
            var callArg;
            var obj = { fn: function(x) { callArg = x; ncalls += 1 } };
            var stub = qmock.stubOnce(obj, 'fn');
            obj.fn(11);
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
            var spy = qmock.spyOnce(obj, 'fn');
            obj.fn(11);
            obj.fn(22);
            // spy passes through the calls, both should show up
            t.equal(ncalls, 2);
            t.equal(spy.callCount, 1);
            t.deepEqual(spy.callArguments, [11]);
            t.done();
        },
    },

    'getMock': {
        'should be instanceof constructor': function(t) {
            var ctor = function(){ };
            var obj = new ctor();
            t.ok(obj instanceof ctor);
            var mock = QMock.getMock(obj);
            t.ok(mock instanceof ctor, "mock not instanceof mocked");
            t.done();
        },

        'expects should return Expected object': function(t) {
            var expected = QMock.getMock({}).expects(0);
            t.equal(typeof expected, 'object');
            t.ok(!(expected instanceof QMock));
            t.done();
        },

        'expects should accept count words': function(t) {
            t.equal(0, QMock.getMock({}).expects('never').expectedCount);
            t.equal(1, QMock.getMock({}).expects('once').expectedCount);
            t.equal(2, QMock.getMock({}).expects('twice').expectedCount);
            t.equal(3, QMock.getMock({}).expects('thrice').expectedCount);
            t.equal(-1, QMock.getMock({}).expects('any').expectedCount);
            t.done();
        },

        'expects should accept exact count values': function(t) {
            var i;
            for (i=-1; i<20; i++) t.equal(i, QMock.getMock({}).expects(i).expectedCount);
            t.done();
        },

        'QMock should provide methods for count words': function(t) {
            t.equal(QMock.any(), -1);
            t.equal(QMock.never(), 0);
            t.equal(QMock.once(), 1);
            t.equal(QMock.twice(), 2);
            t.equal(QMock.thrice(), 3);
            t.equal(QMock.exactly(1234), 1234);
            t.done();
        },
    },

    'getMockSkipConstructor': {
        'should return an instanceof constructor with inherited properties': function(t) {
            var Ctor = function(){ };
            Ctor.prototype.x = 1;
            var mock = QMock.getMockSkipConstructor(Ctor);
            t.ok(mock instanceof Ctor);
            t.equal(mock.x, 1);
            t.done();
        },

        'should not call constructor': function(t) {
            var called = false;
            var Ctor = function(){ called = true; };
            var mock = QMock.getMockSkipConstructor(Ctor);
            t.ok(mock instanceof Ctor);
            t.ok(!called);
            t.done();
        },
    },

    'Expected': {
        'returnValue': {
            'should return scalars': function(t) {
                var ret, i, scalars = [123, 4.56, "seven", null, undefined];
                for (i in scalars) {
                    var mock = QMock.getMock({}, ['m']);
                    mock.expects(1).method('m').will(QMock.returnValue(scalars[i]));
                    var ret = mock.m();
                    t.equal(ret, scalars[i]);
                }
                t.done();
            },

            'should return function': function(t) {
                var mock = QMock.getMock();
                mock.expects(1).method('m').will(QMock.returnValue(function(){ return 1234; }));
                var ret = mock.m();
                t.equal('function', typeof ret);
                t.done();
            },

            'should return computed value': function(t) {
                var mock = QMock.getMock();
                mock.expects(1).method('m').will(QMock.returnComputedValue(function(){ return 1234 }));
                var ret = mock.m();
                t.equal(1234, ret);
                t.done();
            },
        },

        'should return argument': function(t) {
            var mock = QMock.getMock({}, ['m']);
            mock.expects(1).method('m').will(QMock.returnArgument(2));
            var ret = mock.m('a', 'b', 'c', 'd', 'e', 'f');
            t.ok(ret === 'c');
            t.done();
        },

        'should return self': function(t) {
            var mock = QMock.getMock({}, ['m']);
            mock.expects(1).method('m').will(QMock.returnSelf());
            var ret = mock.m();
            t.ok(mock === ret);
            t.done();
        },

        'should throw exception': function(t) {
            var mock = QMock.getMock({}, ['m']);
            mock.expects(1).method('m').will(QMock.throwException(new Error("error")));
            try { var ret = mock.m(); t.ok(false); } catch (err) { t.ok(true); }
            // also works as throwError()
            mock.expects(1).method('n').will(QMock.throwError(new Error("error")));
            try { var ret = mock.n(); t.ok(false); } catch (err) { t.ok(true); }
            t.done();
        },

        'should call callback': function(t) {
            var wasCalled = false;
            var mock = QMock.getMock({}, ['m']);
            mock.expects(1).method('m').will(QMock.callCallback(function(){ wasCalled = true; }));
            mock.m();
            t.ok(wasCalled);
            t.done();
        },

        'should count calls': function(t) {
            var i, mock = QMock.getMock({}, ['test']);
            var expect = mock.expects(QMock.any()).method('test');
            for (i=0; i<20; i++) mock.test();
            t.equal(expect.callCount, 20);
            t.done();
        },

        'should check call count': function(t) {
            var mock = QMock.getMock();
            mock.expects(2).method('test');
            mock.test();
            try { mock.check(); t.ok(false); }
            catch (err) { t.ok(true); }
            t.done();
        },

        'should return error if specified': function(t) {
            var mock = QMock.getMock();
            mock.expects(0).method('test');
            mock.test();
            var err = QMock.check(mock, true);
            t.ok(err.toString().indexOf("called 1 times, expected 0") > 0);
            var err2 = mock.check(true);
            // TODO: why are the (thrown) err and err2 not the same object?
            t.deepEqual(err, err2);
            t.done();
        },

        'should return values onConsecutiveValues': function(t) {
            var mock = QMock.getMock({ m: function() { return 123; } });
            mock.expects(3).method('m').will(QMock.onConsecutiveCalls(1, 2, 3));
            t.equal(mock.m(), 1);
            t.equal(mock.m(), 2);
            t.equal(mock.m(), 3);
            t.equal(mock.m(), undefined);
            t.done();
        },

        'should check call parameters': function(t) {
            var mock = QMock.getMock({});
            mock.expects(2).method('m').with(1,2,3);
            mock.m(1,2,3);
            try {
                mock.m(1,3,2);
                mock.check();
                t.ok(false);
            } catch (err) { t.ok(err.toString().indexOf("wrong arguments") > 0); }
            t.done();
        },

        'should check call parameters on consecutive calls': function(t) {
            // QMock can check call params of multiple consecutive calls
            // the last call params specified are matched against all future calls too
            var mock = QMock.getMock({});
            mock.method('m').with(1).with(2);
            mock.m(1);
            mock.m(2);
            mock.m(2);
            try { mock.m(3); mock.check(); t.ok(false); }
            catch (err) { t.ok(true); }
            t.done();
        },
    },

    'nodeunit': {
        'should extend nodeunit tester with mocks': function(t) {
            var tester = {};
            QMock.extendWithMocks(tester, 'done');
            var mock = tester.getMock({});
            mock.method('m').willReturn('proper and correct return value');
            t.equal(mock.m(), 'proper and correct return value');
            t.done();
        },

        'should assert that expecteds were fulfilled': function(t) {
            var called = false;
            var tester = {};
            tester.done = function() { called = true };
            QMock.extendWithMocks(tester, 'done');
            var mock = tester.getMock({}, ['m']);
            mock.expects(QMock.twice()).method('m');
            try {
                tester.done();
                t.ok(false, "method not called, assertion should throw error");
            }
            catch (err) {
                t.ok(err.toString().indexOf("called 0 times, expected 2") > 0);
                t.ok(true);
                t.ok(called);
                t.done();
            }
        },

        'should not be affected by preceding expecteds': function(t) {
            var tester = {};
            tester.done = t.done;
            tester.done.bind(t);
            QMock.extendWithMocks(tester, 'done');
            tester.done();
        },
    },

    'stub': {
        beforeEach: function(done) {
            var self = this;
            self.ncalls = 0;
            self.obj = {
                call: function() { self.ncalls += 1 ; return "abc123" }
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
                t.deepEqual(stub.getAllErrors(), [ null, myError ]);
                t.deepEqual(stub.getAllArguments(), [ [1], [7, 6, 5] ]);
                t.deepEqual(stub.getAllResults(), [ 1, null ]);
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

        'spy should error out on restore of bare function': function(t) {
            var spy = qmock.spy(function(){});
            t.equal(typeof spy.restore, 'function');
            t.throws(spy.restore);
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
    },

    'mockTimers': {
        before: function(done) {
            this.originals = {
                setImmediate: setImmediate, setTimeout: setTimeout, setInterval: setInterval,
                clearImmediate: clearImmediate, clearTimeout: clearTimeout, clearInterval: clearInterval,
            };
            done();
        },

        afterEach: function(done) {
            qmock.unmockTimers();
            done();
        },

        'should export functions': function(t) {
            t.equal(mockTimers.mockTimers, qmock.mockTimers);
            t.equal(mockTimers.unmockTimers, qmock.unmockTimers);
            t.done();
        },

        'should restore timers': function(t) {
            for (var k in this.originals) global[k] = undefined;
            t.assert(!setImmediate);
            t.assert(!setTimeout);
            qmock.unmockTimers();
            for (var k in this.originals) t.assert(global[k] == this.originals[k]);
            t.done();
        },

        'should mockTimers and unmockTimers': function(t) {
            var clock = qmock.mockTimers(clock);
            for (var k in this.originals) t.equals(clock[k], global[k]);
            qmock.unmockTimers();
            for (var k in this.originals) t.equals(this.originals[k], global[k]);
            t.done();
        },

        'should mockTimers': function(t) {
            qmock.mockTimers();
            t.assert(setImmediate && setImmediate != this.originals.setImmediate);
            t.assert(setTimeout && setTimeout != this.originals.setTimeout);
            for (var k in this.originals) t.assert(global[k] != this.originals[k]);
            t.done();
        },

        'should create a MockTimers object': function(t) {
            var clock = qmock.mockTimers();
            t.assert(clock instanceof MockTimers);
            t.done();
        },

        'should queue immediates': function(t) {
            var clock = qmock.mockTimers();
            var fn1 = function(){};
            var fn2 = function(){};
            clock.setImmediate(fn1);
            clock.setImmediate(fn2);
            t.equal(clock.immediates.length, 2);
            t.contains(clock.immediates[0], fn1);
            t.contains(clock.immediates[1], fn2);
            t.done();
        },

        'should queue timeouts for clock timestamp': function(t) {
            var clock = qmock.mockTimers();
            clock.timestamp = 1000;
            var fn1 = function(){};
            var fn2 = function(){};
            clock.setTimeout(fn1, 1);
            clock.setTimeout(fn2, 2);
            t.contains(clock.timeouts[1001][0], fn1);
            t.contains(clock.timeouts[1002][0], fn2);
            t.done();
        },

        'tick': {
            'should advance the timestamp': function(t) {
                var clock = qmock.mockTimers();
                t.equal(clock.timestamp, 0);
                clock.tick();
                t.equal(clock.timestamp, 1);
                clock.tick(0);
                clock.tick(0);
                t.equal(clock.timestamp, 1);
                clock.tick(3);
                t.equal(clock.timestamp, 4);
                t.done();
            },

            'should run pending immediates': function(t) {
                var clock = qmock.mockTimers();
                var calls = [];
                clock.setImmediate(function(){ calls.push(1); setImmediate(function(){ calls.push(3) }) });
                clock.setImmediate(function(){ calls.push(2) });
                // first tick should run the 2 pending immediates
                clock.tick();
                t.deepEqual(calls, [1, 2]);
                // next tick should run the subsequently queued immediates
                clock.tick();
                t.deepEqual(calls, [1, 2, 3]);
                t.done();
            },

            'should run pending timeouts': function(t) {
                var clock = qmock.mockTimers();
                var calls = [];
                clock.setTimeout(function(){ calls.push(2) }, 2);   // trigger at 2 = 0+2
                clock.setTimeout(function(){ calls.push(5) }, 5);   // trigger at 5 = 0+5
                t.deepEqual(calls, []);
                clock.tick();  // 1
                t.deepEqual(calls, []);
                clock.tick();  // 2
                t.deepEqual(calls, [2]);
                clock.tick();  // 3
                clock.setTimeout(function(){ calls.push(6) }, 3);   // trigger at 6 = 3+3
                t.deepEqual(calls, [2]);
                clock.tick();  // 4
                t.deepEqual(calls, [2]);
                clock.tick();  // 5
                t.deepEqual(calls, [2, 5]);
                clock.tick();  // 6
                t.deepEqual(calls, [2, 5, 6]);
                t.done();
            },

            'should not run timeout before it triggers': function(t) {
                var clock = qmock.mockTimers();
                var calls = [];
                clock.setTimeout(function(){ calls.push(1000) }, 1000);
                clock.tick(990);
                for (var i=0; i<9; i++) clock.tick();
                t.deepEqual(calls, []);
                clock.tick(1);
                t.deepEqual(calls, [1000]);
                t.done();
            },

            'should run all timeouts that have come due': function(t) {
                var calls = [];
                var clock = qmock.mockTimers();
                clock.setTimeout(function(){ calls.push(2) }, 2);
                clock.setTimeout(function(){ calls.push(22) }, 22);
                clock.setTimeout(function(){ calls.push(202) }, 202);
                clock.setTimeout(function(){ calls.push(20002) }, 20002);
                clock.tick(50000);
                t.deepEqual(calls, [2, 22, 202, 20002]);
                t.done();
            },

            'should make timeout time pass quickly': function(t) {
                var calls = [];
                var clock = qmock.mockTimers();
                clock.setTimeout(function(){ calls.push(10000) }, 10000);
                var t1 = Date.now();
                clock.tick(10000);
                var t2 = Date.now();
                t.deepEqual(calls, [10000]);
                t.assert(t2 - t1 < 100);
                t.done();
            },
        },

        'should pass arguments to setImmediate': function(t) {
            var clock = qmock.mockTimers();
            clock.setImmediate(function(a, b) {
                t.equal(a, 1);
                t.equal(b, 2);
                t.equal(arguments.length, 2);
                t.done();
            }, 1, 2)
            clock.tick();
        },

        'should pass arguments to setTimeout': function(t) {
            var clock = qmock.mockTimers();
            clock.setTimeout(function(a, b) {
                t.equal(a, 1);
                t.equal(b, 2);
                t.equal(arguments.length, 2);
                t.done();
            }, 10, 1, 2)
            clock.tick(10);
        },

        'should pass arguments to setInterval': function(t) {
            var clock = qmock.mockTimers();
            clock.setInterval(function(a, b) {
                t.equal(a, 1);
                t.equal(b, 2);
                t.equal(arguments.length, 2);
                t.done();
            }, 10, 1, 2)
            clock.tick(10);
        },

        'setImmediate': {
            beforeEach: function(done) {
                this.clock = qmock.mockTimers();
                done();
            },

            'should setImmediate in clock': function(t) {
                var fn1 = function(){};
                setImmediate(fn1);
                t.equal(this.clock.immediates.length, 1);
                t.contains(this.clock.immediates[0], fn1);
                t.done();
            },

            'should clearImmediate': function(t) {
                if (!setImmediate) t.skip();
                var called = false;
                var task = setImmediate(function(){ called = true });
                clearImmediate(task);
                this.clock.tick(2);
                t.ok(!called);
                t.done();
            },

            'errors should throw but let next immediate run': function(t) {
                var self = this;
                t.expect(1);
                var called = false;
                try {
                    setImmediate(function immediate1(){ throw new Error("test error") });
                    setImmediate(function immediate2(){ called = true });
                    self.clock.tick();
                    t.fail();
                } catch (err) {
                    process.nextTick(function() {
                        t.ok(called);
                        t.done();
                    })
                }
            },
        },
        
        'setTimeout': {
            beforeEach: function(done) {
                this.clock = qmock.mockTimers();
                done();
            },

            'should setTimeout in clock': function(t) {
                var fn1 = function(){};
                setTimeout(fn1, 1);
                t.equal(this.clock.timeouts[1].length, 1);
                t.contains(this.clock.timeouts[1][0], fn1);
                t.done();
            },

            'should clearTimeout': function(t) {
                var called = false;
                var task = setTimeout(function(){ called = true }, 1);
                clearTimeout(task);
                this.clock.tick(2);
                t.ok(!called);
                t.done();
            },

            'should default to 1 ms': function(t) {
                this.clock.setTimeout(function(){});
                this.clock.setTimeout(function(){}, 0);
                t.equal(this.clock.timeouts[1].length, 2);
                t.done();
            },

            'errors should throw but let next task run': function(t) {
                var self = this;
                t.expect(1);
                var called = false;
                try {
                    setTimeout(function timeout1(){ throw new Error("test error") }, 1);
                    setTimeout(function timeout2(){ called = true }, 1);
                    self.clock.tick();
                } catch (err) {
                    process.nextTick(function() {
                        t.ok(called);
                        t.done();
                    })
                }
            },
        },

        'setInterval': {
            beforeEach: function(done) {
                this.clock = qmock.mockTimers();
                done();
            },

            'should setInterval in clock': function(t) {
                setInterval(function(){}, 1);
                t.equal(this.clock.timeouts[1].length, 1);
                t.done();
            },

            'should default to 1 ms': function(t) {
                this.clock.setInterval(function(){});
                this.clock.setInterval(function(){}, 0);
                t.equal(this.clock.timeouts[1].length, 2);
                t.done();
            },

            'should make repeated calls': function(t) {
                var clock = this.clock;
                var calls = [];
                setInterval(function() { calls.push(clock.timestamp) }, 3);
                clock.tick(2);
                t.equal(calls.length, 0);
                clock.tick(1);
                t.equal(calls.length, 1);
                clock.tick(2);
                t.equal(calls.length, 1);
                clock.tick(1);
                t.equal(calls.length, 2);
                clock.tick(9);
                t.equal(calls.length, 5);
                t.done();
            },

            'should clearInterval': function(t) {
                var clock = this.clock;
                var calls = [];
                var task = setInterval(function() { calls.push(clock.timestamp) }, 3);
                clock.tick(3);
                t.equal(calls.length, 1);
                clock.clearInterval(task);
                clock.tick(3);
                t.equal(calls.length, 1);
                t.done();
            },

            'errors should throw but let the next task run': function(t) {
                var self = this;
                t.expect(1);
                var called = false;
                try {
                    setInterval(function interval1(){ throw new Error("test error") }, 1);
                    setInterval(function interval2(){ called = true }, 1);
                    self.clock.tick();
                } catch (err) {
                    process.nextTick(function() {
                        t.ok(called);
                        t.done();
                    })
                }
            },
        },
    },

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
