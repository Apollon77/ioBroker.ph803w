'use strict';
const utils = require('@iobroker/adapter-core');
const debug = require('debug');
const {PH803WDevice, PH803WDiscovery} = require('node-ph803w');

const deviceObjects = {
    'ph': {
        type: 'channel',
        common: {
            name: 'PH Data',
        },
        native: {},
    },
    'redox': {
        type: 'channel',
        common: {
            name: 'Redox data',
        },
        native: {},
    },
    'ph.value': {
        type: 'state',
        common: {
            name: 'PH Value',
            type: 'number',
            role: 'value',
            unit: '',
            read: true,
            write: false
        }
    },
    'redox.value': {
        type: 'state',
        common: {
            name: 'Redox Value',
            type: 'number',
            role: 'value',
            unit: 'mV',
            read: true,
            write: false,
        }
    },
    'ph.outlet': {
        type: 'state',
        common: {
            name: 'PH Power Outlet',
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
        }
    },
    'redox.outlet': {
        type: 'state',
        common: {
            name: 'Redox Power Outlet',
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: true,
        }
    }
};

class Ph803w extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'ph803w',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));

        this.discoveryServer = null;
        this.devices = {};
        this.connectedDeviceCount = 0;
        this.isConnected = null;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        debug.enable('ph803w:*');
        debug.log = this.log.debug.bind(this);

        this.setConnected(false);

        const devices = await this.getDevicesAsync();
        if (devices && devices.length) {
            this.log.debug('Init ' + devices.length + ' known devices without discovery ...');
            for (const device of devices) {
                if (device._id && device.native) {
                    await this.initDevice(device.native);
                }
            }
        }

        this.discoveryServer = new PH803WDiscovery();
        this.discoveryServer.on('error', err => this.log.info(`PH803W discovery Error: ${err}`));

        this.discoveryServer.on('device', data => {
            if (this.devices[data.ip]) {
                this.log.debug(`Discovered PH803W device ${data.id} on IP ${data.ip} already known, ignore`);
                return;
            }
            this.log.info(`PH803W Device ${data.id} discovered on ${data.ip}`);
            this.initDevice(data);
        });

        this.discoveryServer.discover();
    }

    setConnected(isConnected) {
        if (this.isConnected !== isConnected) {
            this.isConnected = isConnected;
            this.setState('info.connection', this.isConnected, true);
        }
    }

    async initDevice(device) {
        if (this.devices[device.ip]) return;

        this.devices[device.ip] = new PH803WDevice(device.ip);

        const options = {preserve: {common: ['name']}};

        await this.extendObjectAsync(device.id, {
            type: 'device',
            common: {
                name: 'PH803W device ' + device.id,
            },
            native: device,
        }, options);

        for (const obj in deviceObjects) {
            await this.extendObjectAsync(device.id + '.' + obj, deviceObjects[obj], options);
        }

        let deviceConnected = false;
        this.devices[device.ip].on('connected', async () => {
            deviceConnected = true;

            this.log.info(`Connected PH803W device ${device.id} on IP ${device.ip} ... logging in ...`);
            try {
                await this.devices[device.ip].login();
                await this.devices[device.ip].retrieveData();
            } catch (err) {
                this.log.info(`Connection process for PH803W device ${device.id} on IP ${device.ip} was not successful: ${err}`);
                await this.devices[device.ip].close(true);
                return;
            }

            this.connectedDeviceCount++;
            this.setConnected(this.connectedDeviceCount === Object.keys(this.devices).length);
        });
        this.devices[device.ip].on('disconnected', () => {
            if (deviceConnected) {
                deviceConnected = false;
                this.log.info(`Disconnected PH803W device ${device.id} on IP ${device.ip}`);
                this.connectedDeviceCount--;
                this.setConnected(false);
            }
        });

        this.devices[device.ip].on('error', err => this.log.error(`PH803W device ${device.id} Error: ${err}`));

        this.devices[device.ip].on('data', data => {
            this.setState(device.id + '.ph.value', data.ph, true);
            this.setState(device.id + '.ph.outlet', data.phOutlet, true);
            this.setState(device.id + '.redox.value', data.redox, true);
            this.setState(device.id + '.redox.outlet', data.redoxOutlet, true);
        });

        await this.devices[device.ip].connect();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            for (const ip of Object.keys(this.devices)) {
                this.devices[ip] && await this.devices[ip].destroy();
            }
            this.discoveryServer && await this.discoveryServer.stop();
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Ph803w(options);
} else {
    // otherwise start the instance directly
    new Ph803w();
}