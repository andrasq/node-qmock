/**
 * Mock require('timers') setImmediate et al
 *
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

module.exports = mockTimers;


// mock timer functions factory
function mockTimers( ) {
    var clock = {
        timestamp: 0,
        immediates: new Array(),
        timeouts: {},
        saved: {
            setImmediate: global.setImmediate,
            clearImmediate: global.clearImmediate,
            setTimeout: global.setTimeout,
            clearTimeout: global.clearTimeout,
            setInterval: global.setInterval,
            clearInterval: global.clearInterval,
        },

// TODO: check if timeouts before immediates or vice versa -- how?
// TODO: refactor into an object with prototype methods

        // TODO: reuse array indexes (currently immediates array grows forever)

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
        setInterval: function mockSetInterval( func, ms, period ) {
            var av = new Array();
            for (var i=3; i<arguments.length; i++) av.push(arguments[i]);
            return mockSetInterval(clock, fn, ms, period, av);
        },
        clearInterval: function mockClearInterval( task ) {
            return mockClearInterval(clock, task);
        },

        tick: function( ms ) {
            if (ms == undefined) ms = 1;

            var timestamp = clock.timestamp;
            do {
                // run all pending immediates like node-v10 and up
                var limit = clock.immediates.length;
                for (var i=0; i<limit; i++) {
                    if (clock.immediates[i].del) continue;
                    var task = clock.immediates[i];
                    task.fn.apply(null, task.av);
                    clock.immediates[i] = null;
                }
                clock.immediates = clock.immediates.slice(i);

                // only run timeouts if more than 0 ms elapsed
                if (ms === 0) break;

                // run any timeouts that have come due
                if (clock.timeouts[timestamp]) {
                    var timeouts = clock.timeouts[timestamp];
                    delete clock.timeouts[timestamp];

                    for (var i=0; i<timeouts.length; i++) {
                        if (timeouts[i].del) continue;
                        var task = timeouts[i];
                        task.fn.apply(null, task.av);
                        // domains not handled
                        // exceptions not handled
                    }
                }

                // advance time, make more timeouts eligible
                timestamp += 1;
                ms -= 1;

            } while (ms > 0);

            clock.time = timestamp;

            return clock;
        },

        install: function( ) {
            // ignore if already done
            if (global.setImmediate === clock.setImmediate) return clock;

            global.setImmediate = clock.setImmediate;
            global.clearImmediate = clock.clearImmediate;
            global.setTimeout = clock.setTimeout;
            global.clearTimeout = clock.clearTimeout;
            if (process.version >= 'v0.10.') {
                global.setInterval = clock.setInterval;
                global.clearInterval = clock.clearInterval;
            }
            return clock;
        },

        uninstall: function( ) {
            global.setImmediate = clock.saved.setImmediate;
            global.clearImmediate = clock.saved.clearImmediate;
            global.setTimeout = clock.saved.setTimeout;
            global.clearTimeout = clock.saved.clearTimeout;
            global.setInterval = clock.saved.setInterval;
            global.clearInterval = clock.saved.clearInterval;
            return clock;
        },
    };

    function mockSetImmediate( clock, fn, av ) {
        return clock.immediates[clock.immediates.length] = _makeTask(0, fn, av);
    }
    function mockClearImmediate( task ) {
        task.del = true;
    }

    function mockSetTimeout( clock, fn, ms, av ) {
        if (!ms || ms < 0) ms = 1;
        var timestamp = clock.time + ms;
        if (!clock.timeouts[timestamp]) clock.timeouts[timestamp] = {};
        return clock.timeouts[timestamp] = _makeTask(tm, fn, av);
    }    
    function mockClearTimeout( clock, task ) {
        task.del = true;
    }

    function mockSetInterval( clock, fn, ms, period, av ) {
        if (!period || period < 0) period = 1;
        var task = mockSetTimeout(clock, function repeated() {
// TODO: check if function duration is included in period or if it is additive
// TODO: we implement additive, ie next invocation is only queued after function finishes
            var ret = fn.apply(null, av);
            mockSetTimeout(clock, repeated, period);
            return ret;
        }, ms);
    }
    function mockClearInterval( clock, task ) {
        task.del = true;
    }

    function _makeTask( tm, fn, av ) {
        // TODO: ref/unref are stubbed, they do nothing
        function doRef( ) { this.isRef = true }
        function doUnref( ) { this.isRef = false }

        return {
            tm: tm,             // timestamp when due
            fn: fn,             // function to run
            av: av,             // arguments to fn
            del: false,         // cleared

            isRef: true,
            ref: doRef,
            unref: doUnref,
        };
    }

    return clock;
}
