/**
 * Mock require()
 *
 * Copyright (C) 2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2018-02-05 - AR.
 */

var systemRequire = typeof require && require || global.require;
var Module = require('module');

module.exports = {
    mockRequire: mockRequire,
    unmockRequire: unmockRequire,
    require: _require,
    unrequire: unrequire,
}


var mockedModules = {};
function _require( moduleName ) {
    var path = resolveOrSelf(moduleName);
    var mod = mockedModules[path];

    return !mod ? systemRequire(path)
        : typeof mod === 'function' ? mod()
        : mod;
}

// attach the expected properties
_require.resolve = systemRequire.resolve;
_require.main = undefined;
_require.extensions = systemRequire.extensions;
_require.cache = {};
_require.parent = { children: [] };
for (var k in systemRequire) if (_require[k] === undefined) _require[k] = {};


function mockRequire( moduleName, mod ) {
    // define or restore a mocked module
    if (moduleName) {
        // require('no-such-module') maps requests for no-such-module
        var path = resolveOrSelf(moduleName);
        if (mod) mockedModules[path] = mod;
        else delete mockedModules[path];
    }

    // redefine `require` to look among the mocked modules first
    // the global require() invokes module.require, so change the method
    Module.require = _require;
    module.parent.require = _require;
    if (module.main) module.main.require = _require;

    // FIXME: replace require in all child modules too (but is bound! cannot replace)
    // FIXME: infinite recursion
    for (var i = 0; i < module.parent.children.length; i++) {
//        module.parent.children[i].require = _require;
    }
}

function unmockRequire( ) {
    Module.require = systemRequire;
    module.parent.require = systemRequire;
    if (module.main) module.main.require = systemRequire;

    // FIXME: replace require in all child modules too (but is bound! cannot replace)
    for (var i = 0; i < module.parent.children.length; i++) {
//        module.parent.children[i].require = systemRequire;
    }
}

function resolveOrSelf( name ) {
    try { return systemRequire.resolve(name) }
    catch (e) { return name }
}

function unrequire( moduleName ) {
    var path = resolveOrSelf(moduleName);

    var ix, mod = systemRequire.cache[path];
    while (module.parent && module.parent.children && (ix = module.parent.children.indexOf(mod)) >= 0) {
        module.parent.children.splice(ix, 1);
    }
    delete systemRequire.cache[path];
}
