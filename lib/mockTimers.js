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
    // public api
    mockTimers: function() { return overrideTimers(new MockTimers()) },
    unmockTimers: function() { restoreTimers() },

    // testing api
    MockTimers: MockTimers,
    overrideTimers: function(mocks) { overrideTimers(mocks) },
};

var systemTimers = {
    setImmediate: global.setImmediate,
    clearImmediate: global.clearImmediate,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
};

function overrideTimers( mockTimers ) {
    // TODO: omit setImmediate for node v0.8?
    for (var k in systemTimers) global[k] = mockTimers[k];
    return mockTimers;
}

function restoreTimers( ) {
    for (var k in systemTimers) global[k] = systemTimers[k];
}


function MockTimers( ) {
    this.timestamp = 0;                 // milliseconds since program start
    this.immediates = new Array();      // immediate timeouts
    this.timeouts = {};                 // timed timeouts, indexed by timeout ms

    // bind the timers functions to self to make usable as pure functions
    var self = this;
    self.setImmediate = function setImmediate( fn ) {
        var av = new Array();
        for (var i=1; i<arguments.length; i++) av.push(arguments[i]);
        return self.mockSetImmediate(fn, av);
    };

    self.clearImmediate = function clearImmediate( task ) {
        return self.mockClearImmediate(task);
    };

    self.setTimeout = function setTimeout( fn, ms ) {
        var av = new Array();
        for (var i=2; i<arguments.length; i++) av.push(arguments[i]);
        return self.mockSetTimeout(fn, ms, av);
    };

    self.clearTimeout = function mockClearTimeout( task ) {
        return self.mockClearTimeout(task);
    };

    self.setInterval = function mockSetInterval( fn, ms ) {
        var av = new Array();
        for (var i=2; i<arguments.length; i++) av.push(arguments[i]);
        return self.mockSetInterval(fn, ms, av);
    };

    self.clearInterval = function mockClearInterval( task ) {
        return self.mockClearInterval(task);
    };
}

MockTimers.prototype.tick = function tick( ms ) {
    if (! (ms >= 0)) ms = 1;
    var timeLimit = this.timestamp + ms;

    // a tick of 0 ms runs just the pending immediates
    // only run timeouts if more than 0 milliseconds are ticking by
    if (ms === 0) {
        this._processImmediates();
        return;
    }

    // loop over the range of milliseconds, process immediates and timeouts
    // simpler and less tricky to loop over every millisecond than to compute deltas
    for (var time = 0; time < ms; time++) {
        // per nodejs docs, the event loop tick order is:  events, then immediates, then timeouts/intervals
        this.timestamp += 1;
        this._processImmediates();
        this._processTimeouts();
    }

    return this;
};

MockTimers.prototype._scheduleImmediate = function _scheduleImmediate( task ) {
    this.immediates.push(task);
    return task;
};

MockTimers.prototype._scheduleTimeout = function _scheduleTimeout( task ) {
    var queue = this.timeouts[task.tm];
    if (!queue) queue = this.timeouts[task.tm] = new Array();
    queue.push(task);
    return task;
};


MockTimers.prototype._runTimeout = function _runTimeout( task ) {
    if (task.isCleared) return;
    if (task.domain) task.domain.enter();
    try {
        task.fn.apply(task, task.av) ;
    } catch (err) {
        var ret = err;
    }
    if (task.domain) task.domain.exit();
    return ret;
};


// Throw the error in the task domain, and arrange for the callback
// function to run in the default (null) domain afterwards.
// If the task domain is the null default domain, then the caller
// must be trapping errors or else we died.
MockTimers.prototype._throwErrorAndContinue = function _throwErrorAndContinue( task, err, callback ) {
    process.domain = null;
    process.nextTick(callback);
    process.domain = task.domain;
    throw err;
};


// Run all pending immediates, like node-v10 and later.
MockTimers.prototype._processImmediates = function _processImmediates( ) {
    if (this.immediates.length) {
        var err, immediates = this.immediates;
        this.immediates = new Array();
        for (var i=0; i<immediates.length; i++) {
            err = this._runTimeout(immediates[i]);
            if (err) {
                this.immediates = immediates.slice([i+1]).concat(this.immediates);
                var self = this;
                this._throwErrorAndContinue(immediates[i], err, function() { self._processImmediates(); });
            }
        }
    }
};

// Run any timeouts that have come due.
MockTimers.prototype._processTimeouts = function _processTimeouts( ) {
    var timestamp = this.timestamp;
    if (this.timeouts[timestamp]) {
        var err, timeouts = this.timeouts[timestamp];
        delete this.timeouts[timestamp];
        for (var i=0; i<timeouts.length; i++) {
            err = this._runTimeout(timeouts[i]);
            if (err) {
                // not normally possible to create a timeout for the current timestamp, but just in case...
                var newTimeouts = this.timeouts[timestamp] ? this.timeouts[timestamp] : [];
                this.timeouts[timestamp] = timeouts.slice([i+1]).concat(newTimeouts);
                var self = this;
                this._throwErrorAndContinue(timeouts[i], err, function() { self._processTimeouts() });
            }
        }
    }
};


MockTimers.prototype.mockSetImmediate = function mockSetImmediate( fn, av ) {
    return this._scheduleImmediate(this._createTimeout(0, fn, av));
};

MockTimers.prototype.mockClearImmediate = function mockClearImmediate( task ) {
    task.isCleared = true;
};


MockTimers.prototype.mockSetTimeout = function mockSetTimeout( fn, ms, av ) {
    if (!ms || ms < 0) ms = 1;
    return this._scheduleTimeout(this._createTimeout(this.timestamp + ms, fn, av));
};    

MockTimers.prototype.mockClearTimeout = function mockClearTimeout( task ) {
    task.isCleared = true;
};


MockTimers.prototype.mockSetInterval = function mockSetInterval( fn, ms, av ) {
    var self = this;
    if (!ms || ms < 0) ms = 1;
    var task = this._scheduleTimeout(this._createTimeout(this.timestamp + ms, repeated, av));
    var intervalTask = this._createTimeout(0, fn, av);
    return task;

    function repeated() {
        // just run the task, let our caller, _processTimeouts, clean up on error
        var err = self._runTimeout(intervalTask);
        if (err) throw err;

        // schedule next invocation for interval ms after end of last run
        // TODO: or should that be ms after the start of the run?  that could be in the past
        task.tm = self.timestamp + ms;
        self._scheduleTimeout(task);
    }
};

MockTimers.prototype.mockClearInterval = function mockClearInterval( task ) {
    task.isCleared = true;
};

MockTimers.prototype._createTimeout = function _createTimeout( tm, fn, av ) {
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
};

// accelerate method lookup
MockTimers.prototype = MockTimers.prototype;
