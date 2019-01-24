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
var mockRequire = require('../lib/mockRequire');

module.exports = {
    setUp: function(done) {
        this.templateClass = function MockClass() {
            this.a = 1;
            this.b = 2.34;
            this.c = null;
            this.d = false;
            this.e = { a:1 };
            this.f = function() { return 'f'; };
            return this;
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

    'qmock': {
        'should export stub and spy': function(t) {
            t.equal(typeof qmock.stub, 'function');
            t.equal(typeof qmock.spy, 'function');
            t.equal(typeof qmock.stubOnce, 'function');
            t.equal(typeof qmock.spyOnce, 'function');
            t.done()
        },

        'should create new mock': function(t) {
            var mock = new QMock();
            t.ok(mock instanceof QMock);
            t.done();
        },

        'should build new mock': function(t) {
            var mock = QMock();
            t.ok(mock instanceof QMock);
            t.done();
        },

        'getMock should copy properties': function(t) {
            var mock = qmock.getMock({ a: 1, b: 2.34 });
            t.equal(mock.a, 1);
            t.equal(mock.b, 2.34);
            t.done();
        },

        'getMock should retain existing methods': function(t) {
            var expects = function(){};
            var method = function(){};
            var check = function(){};

            var mock1 = qmock.getMock({});
            t.ok(typeof mock1.expects == 'function' && mock1.expects != expects);
            t.ok(typeof mock1.method == 'function' && mock1.method != method);
            t.ok(typeof mock1.check == 'function' && mock1.check != check);

            var mock2 = qmock.getMock({ expects: expects, method: method, check: check });
            t.equal(mock2.expects, expects);
            t.equal(mock2.method, method);
            t.equal(mock2.check, check);

            t.done();
        },

        'getMock should retain inherited methods': function(t) {
            var obj = [];
            var mock = qmock.getMock(obj);
            t.equal(typeof mock.concat, 'function');
            t.equal(mock.concat, obj.concat);
            t.done();
        },

        'getMock should retain inherited methods without getPrototypeOf': function(t) {
            var saved = Object.getPrototypeOf;
            Object.getPrototypeOf = function(){};

            var obj = [];
            var mock = qmock.getMock(obj);
            Object.getPrototypeOf = saved;

            t.equal(typeof mock.concat, 'function');
            t.equal(mock.concat, obj.concat);
            t.done();
        },

        'getMock should stub named methods': function(t) {
            var obj = { a: 1, f: function(){} };
            var mock = qmock.getMock(obj, ['f']);
            t.equal(typeof mock.f, 'function');
            t.ok(mock.f != obj.f);
            t.done();
        },

        'getMock should return a clone of the object': function(t) {
            var i;
            var obj = this.templateObject;
            var mock = QMock.getMock(obj, []);
            for (i in obj) {
                t.ok(obj[i] === mock[i]);
            }
            t.done();
        },

        'getMockSkipConstructor should return a clone of the object': function(t) {
            var mock = qmock.getMockSkipConstructor(this.templateObject);
            t.equal(mock.a, 1);
            t.equal(mock.b, 2.34);
            t.done();
        },

        'getMock should return a clone from a constructor': function(t) {
            var mock = qmock.getMock(this.templateClass);
            t.ok(mock instanceof this.templateClass);
            t.equal(mock.a, 1);
            t.equal(mock.b, 2.34);
            t.done();
        },

        'getMockSkipConstructor should return a clone of the class without running constructor': function(t) {
            var mock = qmock.getMockSkipConstructor(this.templateClass);
            t.ok(mock instanceof this.templateClass);
            t.equal(mock.a, undefined);
            t.equal(mock.b, undefined);
            t.done();
        },

        'should return an instance of a mocked constructor': function(t) {
            var ctor = function() { this.a = 1; };
            var obj = new ctor();
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

        'extendWithMocks': {
            'should decorate tester object': function(t) {
                var tester = {};
                QMock.extendWithMocks(tester);
                t.equal(typeof tester.getMock, 'function');
                t.equal(typeof tester.getMockSkipConstructor, 'function');
                t.equal(typeof tester.done, 'function');
                var decoratedMethods = [
                    'getMock', 'getMockSkipConstructor',
                    'stub', 'spy', 'mockTimers', 'unmockTimers', 'mockHttp', 'unmockHttp',
                    'mockRequire', 'mockRequireStub', 'unmockRequire', 'unrequire',
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

            'should decorate with all exported methods': function(t) {
                var tester = qmock.extendWithMocks({});
                for (var name in qmock) {
                    if (typeof qmock[name] === 'function') {
                        t.ok(tester[name]);
                    }
                    if (name !== 'getMock' && name[0] !== '_' && name !== 'getMockSkipConstructor') {
                        t.equal(tester[name], qmock[name]);
                    }
                }
                t.done();
            },

            'should decorate with getMock that invokes qmock.getMock': function(t) {
                var getMock = qmock.getMock;
                var called = false;
                qmock.getMock = function(){ called = arguments[2] };
                var tester = qmock.extendWithMocks({});
                tester.getMock(Date, [], [123]);
                qmock.getMock = getMock;
                t.deepEqual(called, [123]);
                t.done();
            },

            'should decorate with getMockSkipConstructor that invokes qmock.getMockSkipConstructor': function(t) {
                var getMockSkipConstructor = qmock.getMockSkipConstructor;
                var called = false;
                qmock.getMockSkipConstructor = function(){ called = true };
                var tester = qmock.extendWithMocks({});
                tester.getMockSkipConstructor(Date);
                qmock.getMockSkipConstructor = getMockSkipConstructor;
                t.deepEqual(called, true);
                t.done();
            },

            'decorated tester should call existing done method': function(t) {
                var called = false;
                var doneMethod = function() { called = true };

                var tester = qmock.extendWithMocks({});
                tester.done();
                t.ok(!called);

                var tester2 = qmock.extendWithMocks({ done: doneMethod, testCall: function(){} }, 'done');
                tester2.done();
                t.ok(called);

                t.done();
            },

            'decorated tester should check for expected tests': function(t) {
                var tester = qmock.extendWithMocks({});
                var mock1 = tester.getMock()
                var mock2 = tester.getMock();
                mock1.expects(1).method('a');
                mock2.expects(0).method('b');
                mock1.a();
                var spy = t.spy(QMock, 'check');
                tester.done();
                spy.restore();
                t.equal(spy.callCount, 2);
                t.equal(spy.args[0][0], mock1);
                t.equal(spy.args[1][0], mock2);
                t.done();
            },
        }
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

        'returned mock should have an id': function(t) {
            var mock = QMock.getMock();
            assert.ok(mock.__qmock__._id > 0);
            t.done();
        },

        'method should throw if method already set': function(t) {
            t.throws(function(){ QMock.getMock().expects(1).method('a').method('a') }, /already expecting/);
            t.throws(function(){ QMock.getMock().expects(1).method('a').method('b') }, /already expecting/);
            t.done();
        },

        'should clone a hash': function(t) {
            var object = { x: 1 };
            var mock = QMock.getMock(object);
            t.equal(mock.x, 1);
            t.deepEqual(mock.__proto__, object.__proto__);
            t.done();
        },

        'should clone an instance': function(t) {
            function F() { this.a = 1 };
            F.prototype.x = 100;
            var object = new F();
            var mock = QMock.getMock(object);
            t.ok(mock instanceof F);
            t.equal(mock.x, 100);
            t.equal(mock.a, 1);
            t.contains(Object.keys(mock), Object.keys(object));
            t.equal(mock.__proto__, object.__proto__);
            t.done();
        },

        'should clone properties': function(t) {
            var obj = { x: 100 };
            Object.defineProperty(obj, 'x', { enumerable: false });
            var mock = QMock.getMock(obj);
            t.equal(mock.x, 100);
            t.contains(Object.getOwnPropertyDescriptor(obj, 'x'), { writable: true, enumerable: false, value: 100 });
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

        'expects should default to any': function(t) {
            t.equal(QMock.getMock({}).expects().expectedCount, QMock.any());
            t.done();
        },

        'expects should throw if count not recognized': function(t) {
            t.throws(function(){ QMock.getMock({}).expects('seventy-seven') }, /unrecognized count/);
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

            'should return multiple times': function(t) {
                var mock = QMock.getMock();
                mock.expects(2).method('m').will(QMock.returnValue(11)).will(QMock.returnValue(22));
                var ret1 = mock.m();
                var ret2 = mock.m();
                var ret3 = mock.m();
                t.equal(ret1, 11);
                t.equal(ret2, 22);
                t.equal(ret3, undefined);
                t.done();
            },

            'should return on consecutive calls': function(t) {
                var mock = QMock.getMock();
                mock.expects('any').method('m').onConsecutiveCalls([1, 2]).onConsecutiveCalls([3]);
                t.equal(mock.m(), 1);
                t.equal(mock.m(), 2);
                t.equal(mock.m(), 3);
                t.equal(mock.m(), undefined);
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

        'should execute mock method with mockid': function(t) {
            var mock = qmock.getMock();
            var expect = mock.expects(1).method('a');
            var calls = [];
            expect.execute = function() { calls.push(arguments) };
            mock.a(123, 4);
            t.equal(calls[0][0], 'a');
            t.equal(calls[0][1], mock.__qmock__._id);
            t.equal(calls[0][2][0], 123);
            t.equal(calls[0][2][1], 4);
            t.done()
        },

        'execute should throw if mockid not found': function(t) {
            var mock = qmock.getMock();
            var expected = mock.expects(1).method('a');
            delete qmock._expectingMocks[mock.__qmock__._id];
            t.throws(function(){ mock.a() }, /unknown mock/);
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
};
