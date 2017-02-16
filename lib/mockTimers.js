/**
 * Mock require('timers') setImmediate et al
 *
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * Although works under node v0.8, implements node v0.10 and up semantics:
 *   - implements setImmediate / clearImmediate
 *   - all pending immediates are executed on each tick
 */

'use strict';

module.exports = {
    mockTimers: function() { return overrideTimers(mockTimers()) },
    restoreTimers: function() { restoreTimers() },
};

var systemTimers = {
    setImmediate: global.setImmediate,
    clearImmediate: global.clearImmediate,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
};

function overrideTimers( clock ) {
    if (global.setImmediate) {
        global.setImmediate = clock.setImmediate;
        global.clearImmediate = clock.clearImmediate;
    }
    global.setTimeout = clock.setTimeout;
    global.clearTimeout = clock.clearTimeout;
    global.setInterval = clock.setInterval;
    global.clearInterval = clock.clearInterval;
    return clock;
}

function restoreTimers( ) {
    global.setImmediate = systemTimers.setImmediate;
    global.clearImmediate = systemTimers.clearImmediate;
    global.setTimeout = systemTimers.setTimeout;
    global.clearTimeout = systemTimers.clearTimeout;
    global.setInterval = systemTimers.setInterval;
    global.clearInterval = systemTimers.clearInterval;
}

// mock timer functions factory
function mockTimers( ) {
    var clock = {
        timestamp: 0,                   // milliseconds since program start
        immediates: new Array(),        // immediate timeouts
        timeouts: {},                   // timed timeouts, indexed by timeout ms

// TODO: refactor into an object with prototype methods

        setImmediate: function setImmediate( fn ) {
            var av = new Array();
            for (var i=1; i<arguments.length; i++) av.push(arguments[i]);
            return mockSetImmediate(clock, fn, av);
        },
        clearImmediate: function clearImmediate( task ) {
            return mockClearImmediate(clock, task);
        },
        setTimeout: function setTimeout( fn, ms ) {
            var av = new Array();
            for (var i=2; i<arguments.length; i++) av.push(arguments[i]);
            return mockSetTimeout(clock, fn, ms, av);
        },
        clearTimeout: function mockClearTimeout( task ) {
            return mockClearTimeout(clock, task);
        },
        setInterval: function mockSetInterval( func, ms ) {
            var av = new Array();
            for (var i=2; i<arguments.length; i++) av.push(arguments[i]);
            return mockSetInterval(clock, fn, ms, av);
        },
        clearInterval: function mockClearInterval( task ) {
            return mockClearInterval(clock, task);
        },

        tick: function( ms ) {
            if (! (ms >= 0)) ms = 1;
            var timeLimit = clock.timestamp + ms;

            // every call is an event loop tick, run the immediates already due
            _processImmediates(clock);

            // only run timeouts if more than 0 milliseconds have ticked by
            // loop over the range of milliseconds, process immediates and timeouts
            // simpler and less tricky to loop over every time slot than to compute deltas
            for (var time = 0; time < ms; time++) {
                // per nodejs docs, the event loop tick order is:  events, then immediates, then timeouts/intervals
                clock.timestamp += 1;
                _processImmediates(clock);
                _processTimeouts(clock);
            }

            return clock;
        },
    };

    function _scheduleImmediate( clock, task ) {
        clock.immediates.push(task);
        return task;
    }
    function _scheduleTimeout( clock, task ) {
        var queue = clock.timeouts[task.tm];
        if (!queue) queue = clock.timeouts[task.tm] = new Array();
        queue.push(task);
    }

    function _runTimeout( task ) {
        if (task.isCleared) return;
        if (task.domain) task.domain.enter();
        try {
            task.fn.apply(task, task.av) ;
        } catch (err) {
            var ret = err;
        }
        if (task.domain) task.domain.exit();
        return ret;
    }

    // Throw the error in the task domain, and arrange for the callback
    // function to run in the default (null) domain afterwards.
    // If the task domain is the null default domain, then the caller
    // must be trapping errors or else we died.
    function _throwErrorAndContinue( task, err, callback ) {
        process.domain = null;
        process.nextTick(callback);
        process.domain = task.domain;
        throw err;
    }

    // Run all pending immediates, like node-v10 and later.
    function _processImmediates( clock ) {
        if (clock.immediates.length) {
            var err, immediates = clock.immediates;
            clock.immediates = new Array();
            for (var i=0; i<immediates.length; i++) {
                err = _runTimeout(immediates[i]);
                if (err) {
                    clock.immediates = immediates.slice[i+1].concat(clock.immediates);
                    _throwErrorAndContinue(immediates[i], err, function() { _processImmediates(clock); });
                }
            }
        }
    }
    // Run any timeouts that have come due.
    function _processTimeouts( clock ) {
        var timestamp = clock.timestamp;
        if (clock.timeouts[timestamp]) {
            var err, timeouts = clock.timeouts[timestamp];
            delete clock.timeouts[timestamp];
            for (var i=0; i<timeouts.length; i++) {
                err = _runTimeout(timeouts[i]);
                if (err) {
                    clock.timeouts[timestamp] = timeouts.slice([i+1]).concat(clock.timeouts[timestamp]);
                    _throwErrorAndContinue(timeouts[i], err, function() { _processTimeouts(clock) });
                }
            }
        }
    }

    function mockSetImmediate( clock, fn, av ) {
        return _scheduleImmediate(clock, _createTimeout(0, fn, av));
    }
    function mockClearImmediate( task ) {
        task.isCleared = true;
    }

    function mockSetTimeout( clock, fn, ms, av ) {
        if (!ms || ms < 0) ms = 1;
        return _scheduleTimeout(clock, _createTimeout(clock.timestamp + ms, fn, av));
    }    
    function mockClearTimeout( clock, task ) {
        task.isCleared = true;
    }

    function mockSetInterval( clock, fn, ms, av ) {
        if (!ms || ms < 0) ms = 1;
        if (!interval || interval < 0) interval = 1;
        var task = _scheduleTimeout(clock, _createTimeout(clock.timestamp + ms, repeated, av));
        return task;

        function repeated() {
            if (task.isCleared) return;

            // just run the task, let our caller _processTimeouts clean up on error
            var err = _runTimeout(task);
            if (err) throw err;

            // schedule next invocation for interval ms after end of last run
            // TODO: or should that be ms after the start of the run?  that could be in the past
            task.tm = clock.timestamp + ms;
            _scheduleTimeout(clock, task);
        }
    }
    function mockClearInterval( clock, task ) {
        task.isCleared = true;
    }

    function _createTimeout( tm, fn, av ) {
        // TODO: ref/unref are stubbed, they do nothing
        function doRef( ) { this.isRef = true }
        function doUnref( ) { this.isRef = false }

        return {
            tm: tm,             // timestamp when due
            fn: fn,             // function to run
            av: av,             // arguments to fn
            isCleared: false,   // set when cleared
            domain: process.domain,

            isRef: true,
            ref: doRef,
            unref: doUnref,
        };
    }

    return clock;
}
