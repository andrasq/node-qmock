if (process.argv[1].indexOf('qnit') >= 0) return;

module.exports = {
    crypto: require('crypto'),
    load: function( name ) { return require(name) },
}
