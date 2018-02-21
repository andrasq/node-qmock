/**
 * Copyright (C) 2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var mockRequire = require('../lib/mockRequire');

module.exports = {
    before: function(done) {
        mockRequire.unrequire(__dirname + '/load-module');
        done();
    },

    tearDown: function(done) {
        mockRequire.unmockRequire();
        mockRequire.unmockRequire();
        done();
    },

    'should load modules normally before and after mocks': function(t) {
        var p1 = require('url');
        mockRequire.mockRequire('url', 'other');
        var p2 = require('url');
        mockRequire.unmockRequire();
        var p3 = require('url');

        t.equal(typeof p1, 'object');
        t.equal(p2, 'other');
        t.equal(typeof p3, 'object');
        t.deepEqual(p1, p3);

        t.done();
    },

    'should layer additional mocked modules': function(t) {
        mockRequire.mockRequire('mod1', 'other1');
        mockRequire.mockRequire('mod2', 'other2');
        var p1 = require('mod1');
        var p2 = require('mod2');
        var p1b = require('mod1');
        t.equal(p1, 'other1');
        t.equal(p2, 'other2');
        t.equal(p1b, 'other1');
        t.done();
    },

    'should throw if no module name given': function(t) {
        t.throws(function(){ mockRequire.mockRequire() }, /module name required/);
        t.done();
    },

    'should unmock modules singly': function(t) {
        mockRequire.mockRequire('url', 'other');
        t.equal(typeof require('url'), 'string');
        mockRequire.unmockRequire('url');
        t.equal(typeof require('url'), 'object');
        t.done();
    },

    'should export expected functions': function(t) {
        t.equal(typeof mockRequire.mockRequire, 'function');
        t.equal(typeof mockRequire.unmockRequire, 'function');
        t.equal(typeof mockRequire.require, 'function');
        t.equal(typeof mockRequire.unrequire, 'function');
        t.done();
    },

    'should load modules not overridden': function(t) {
        mockRequire.mockRequire('some-module');
        var p1 = require('url');
        t.equal(typeof p1, 'object');
        t.done();
    },

    'should override named modules': function(t) {
        mockRequire.mockRequire("modname", "other");
        var p1 = require('modname');
        var p2 = require('url');
        t.equal(p1, 'other');
        t.equal(typeof p2, 'object');
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
        process.env.NODE_NESTED = 1;
        mockRequire.mockRequire('url', 'other2');
        var mod = require(__dirname + '/load-module');
        var mod2 = mod.load('url');
        var mod3 = mod.load('dns');
        t.equal(mod2, 'other2');
        t.equal(typeof mod3, 'object');
        delete process.env.NODE_NESTED;
        t.done();
    },

    'unrequire': {
        'should remove all instances of the module': function(t) {
            var url = require('../package');
            var mod = findCachedModule('../package');
            mockRequire.unrequire('../package');
            var mod2 = findCachedModule('../package');
            t.equal(mod.exports, url);
            t.equal(mod2, undefined);
            t.done();
        },
    },
}

function findCachedModule( name, children ) {
    var root, path = require.resolve(name);

    if (!children) {
        root = module;
        while (root.parent) root = root.parent;
        children = root.children;
    }

    for (var i=0; i<children.length; i++) {
        if (children[i].filename === path) return children[i];
        var mod = findCachedModule(name, children[i].children);
        if (mod) return mod;
    }
}
