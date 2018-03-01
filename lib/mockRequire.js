/**
 * Mock require()
 *
 * Copyright (C) 2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2018-02-05 - AR.
 */

var Path = require('path');
var Module = require('module');
var moduleRequire = Module.prototype.require;
var moduleLoad = Module._load;

module.exports = {
    mockRequire: mockRequire,
    mockRequireStub: mockRequireStub,
    unmockRequire: unmockRequire,
    require: _require,
    unrequire: unrequire,
}


// the mocked module lookup
var mockedModules = {};
function _require( moduleName ) {
    var path = resolveOrSelf(moduleName);
    var mod = mockedModules[path];

    // note: `require('...foo')` throws "Cannot find module '...foo'", but
    //   `new Module().require('...foo')` loads ./node_modules/...foo ok.
    //   As a result, mockRequire.require() is more tolerant than require()

    return !mod
        ? moduleRequire.call(this, path)        // not mocked
        : mod instanceof RequireStub ? mod.handler(moduleName)
        : mod;                                  // mocked with an exports object
}

// arrange for require() of `moduleName` to load `replacement` instead
function mockRequire( moduleName, replacement ) {
    if (!moduleName) throw new Error('module name required');

    var path = resolveOrSelf(moduleName);
    mockedModules[path] = replacement;

    // global.require calls module.require which calls Module._load
    // We take over module.require by patching Module.prototype.require.
    Module.prototype.require = _require;
    Module._load = function( path, self, isMain ) {
        return moduleLoad.call(Module, path, self, isMain);
    }
}

function RequireStub( handler ) {
    this.handler = handler;
}
// arrange for require() of `moduleName` to return the return value of handler() instead
function mockRequireStub( moduleName, handler ) {
    if (!handler) throw new Error('handler required');
    var replacement = new RequireStub(handler);
    mockRequire(moduleName, replacement);
}

// arrange for require() of `moduleName` to load the real module
// Without a module name uninstall the mock require hooks.
function unmockRequire( moduleName ) {
    if (moduleName) {
        var path = resolveOrSelf(moduleName);
        delete mockedModules[path];
    }
    else {
        Module.prototype.require = moduleRequire;
        Module._load = moduleLoad;
        mockedModules = {};
    }
}

function resolveOrSelf( name ) {
    try { return require.resolve(name) }
    catch (e) { return name }
}

// helper function to unload a module as if it never had been require-d
function unrequire( moduleName ) {
    // resolve relative paths against the source directory of the calling function
    if (/^[.][/]|^[.][.][/]/.test(moduleName)) {
        var stack = {};
        Error.captureStackTrace(stack, unrequire);
        var match = /^[^/]*[(]?(\/.*):\d+:\d+[)]?$/m.exec(stack.stack.split('\n')[1]);
        var callerDir = !match ? process.cwd() : Path.dirname(match[1]);
        moduleName = callerDir + '/' + moduleName;
    }
    var path = resolveOrSelf(moduleName);
            
    var ix, mod = require.cache[path];
    delete require.cache[path];

    while (module.parent) module = module.parent;
    unlinkAll(module.children, mod);

    function unlinkAll( children, mod ) {
        // node-v6 does not have cycles, node-v8 does
        if (children._qmock_visited) return;
        while ((ix = children.indexOf(mod)) >= 0) {
            children.splice(ix, 1);
        }
        children._qmock_visited = true;
        for (var i=0; i<children.length; i++) {
            unlinkAll(children[i].children, mod);
        }
        delete children._qmock_visited;
    }
}
