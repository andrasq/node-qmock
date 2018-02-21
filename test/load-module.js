if (!process.env.NODE_NESTED) return;

module.exports = {
    url: require('url'),
    load: function( name ) { return require(name) },
}
