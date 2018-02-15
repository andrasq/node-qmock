/**
 * Copyright (C) 2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var mockRequire = require('../lib/mockRequire');

module.exports = {
    setUp: function(done) {
        mockRequire.unmockRequire();
        done();
    },

    'should export expected functions': function(t) {
        t.equal(typeof mockRequire.mockRequire, 'function');
        t.equal(typeof mockRequire.unmockRequire, 'function');
        t.equal(typeof mockRequire.require, 'function');
        t.equal(typeof mockRequire.unrequire, 'function');
        t.done();
    },

    'should override named modules': function(t) {
        mockRequire.mockRequire("modname", "other");
        var p1 = require('modname');
        t.equal(p1, 'other');
        t.done();
    },

    'require should reuse cached module': function(t) {
        var p1 = require('crypto');
        var p2 = require('crypto');
        t.equal(typeof p1, 'object');
        t.equal(p1, p2);
        t.done();
    },

    'should override existing modules': function(t) {
        mockRequire.mockRequire('crypto', 'other');
        var p1 = require('crypto');
        t.equal(p1, 'other');
        t.done();
    },

    'should override modules in other modules too': function(t) {
        mockRequire.mockRequire('crypto', 'other2');
        var mod = require(__dirname + '/load-module');
console.log("AR: loaded", mod.crypto);
        var mod2 = mod.load('crypto');
        t.done();
    },

}
