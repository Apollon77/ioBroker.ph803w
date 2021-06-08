const path = require('path');
const ph803lib = require.resolve('node-ph803w');

const DeviceServer = require(path.join(path.dirname(ph803lib), 'test/lib/testServer.js'));
const DiscoveryServer = require(path.join(path.dirname(ph803lib), 'test/lib/testUdpServer.js'));

class PH803WTestServer {
    constructor() {
        this.deviceServer = new DeviceServer({bindAddress: '0.0.0.0'});
        this.discoveryServer = new DiscoveryServer();
    }

    async open() {
        await this.deviceServer.open();
        await this.discoveryServer.open();
    }

    async close() {
        await this.deviceServer.close();
        await this.discoveryServer.close();
    }
}

if (require.main !== module) {
    module.exports = PH803WTestServer;
} else {
    // otherwise start the instance directly
    const server = new PH803WTestServer();
    server.open();
}