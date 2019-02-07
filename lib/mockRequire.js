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
var disrequire = require('disrequire');
var moduleRequire = Module.prototype.require;
var moduleLoad = Module._load;

var resolveOrSelf = disrequire.resolveOrSelv || disrequire.resolveOrSelf;   // typo in name in 1.0.2

module.exports = {
    mockRequire: mockRequire,
    mockRequireStub: mockRequireStub,
    unmockRequire: unmockRequire,
    require: _require,
    unrequire: disrequire,

    _resolveOrSelf: resolveOrSelf,
}


// the mocked module lookup
var mockedModules = {};
function _require( moduleName ) {
    var path = resolveOrSelf(moduleName, _require);
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

    var path = resolveOrSelf(moduleName, mockRequire);
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
        var path = resolveOrSelf(moduleName, unmockRequire);
        delete mockedModules[path];
    }
    else {
        Module.prototype.require = moduleRequire;
        Module._load = moduleLoad;
        mockedModules = {};
    }
}
