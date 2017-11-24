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

        'should export test functions': function(t) {
            t.equal(typeof mockTimers.MockTimers, 'function');
            t.equal(typeof mockTimers.overrideTimers, 'function');
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

        'should override timers with provided mocks': function(t) {
            mockTimers.overrideTimers({
                setImmediate: 1,
                setTimeout: 2,
            })
            var si = setImmediate;
            var st = setTimeout;
            mockTimers.unmockTimers();
            t.equal(si, 1);
            t.equal(st, 2);
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
                clearImmediate(null);
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

            'timeout should have ref and unref methods': function(t) {
                var timeout = setTimeout(function(){}, 1);
                t.equal(typeof timeout.ref, 'function');
                t.equal(typeof timeout.unref, 'function');
                t.strictEqual(timeout.isRef, true);
                timeout.unref();
                t.strictEqual(timeout.isRef, false);
                timeout.ref();
                t.strictEqual(timeout.isRef, true);
                t.done();
            },

            'should clearTimeout': function(t) {
                var called = false;
                var task = setTimeout(function(){ called = true }, 1);
                clearTimeout(task);
                clearTimeout(null);
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

            'interval should have ref and unref methods': function(t) {
                var timeout = setTimeout(function(){}, 1);
                t.equal(typeof timeout.ref, 'function');
                t.equal(typeof timeout.unref, 'function');
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
                clock.clearInterval(null);
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
};
