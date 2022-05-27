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
    },
    'connected': {
        type: 'state',
        common: {
            name: 'Connected',
            type: 'boolean',
            role: 'indicator.reachable',
            read: true,
            write: false
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
            this.log.debug(`Init ${devices.length} known devices without discovery ...`);
            for (const device of devices) {
                if (device._id && device.native) {
                    await this.initDevice(device.native);
                }
            }
        }

        this.discoveryServer = new PH803WDiscovery();
        this.discoveryServer.on('error', err => this.log.info(`PH803W discovery Error: ${err}`));

        this.discoveryServer.on('device', async data => {
            if (this.devices[data.ip]) {
                this.log.debug(`Discovered PH803W device ${data.id} on IP ${data.ip} already known, ignore`);
                return;
            }
            if (!data.id) {
                this.log.info(`PH803W Device ${data.ip} has no ID, define one by ourself`);
                data.id = `${data.ip.replace(/\./g, '')}-${Date.now()}`;
            }
            this.log.info(`PH803W Device ${data.id} discovered on ${data.ip}`);
            await this.initDevice(data);
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
        if (!device.id) {
            this.log.warn(`No ID for device ${device.ip}. Wait for next discovery message`);
            return;
        }

        const knownIpForDeviceId = Object.keys(this.devices).find(devIp => this.devices[devIp].id === device.id);
        if (knownIpForDeviceId) {
            const knownIpForDevice = this.devices[knownIpForDeviceId];
            if (!knownIpForDevice.isConnected()) {
                this.log.warn(`Device ${device.id} already known on ${knownIpForDevice.ip} and not connected. Overwrite!`);
                await knownIpForDevice.destroy();
                delete this.devices[knownIpForDevice.ip];
            } else {
                this.log.warn(`Device ${device.id} already known on ${knownIpForDevice.ip}, but successfully connected. Ignore!`);
                return;
            }
        }

        this.log.debug(`Start PH803W Device initialization for ${device.id} on IP ${device.ip}`);
        this.devices[device.ip] = new PH803WDevice(device.ip);
        this.devices[device.ip].id = device.id;
        this.devices[device.ip].ip = device.ip;

        const options = {preserve: {common: ['name']}};

        await this.extendObjectAsync(device.id, {
            type: 'device',
            common: {
                name: `PH803W device ${device.id}`,
                statusStates: {
                    onlineId: `${this.namespace}.${device.id}.connected`
                }
            },
            native: device,
        }, options);

        for (const obj in deviceObjects) {
            await this.extendObjectAsync(`${device.id}.${obj}`, deviceObjects[obj], options);
        }

        let deviceConnected = false;
        this.devices[device.ip].on('connected', async () => {
            deviceConnected = true;

            this.log.info(`Connected PH803W device ${device.id} on IP ${device.ip} ... logging in ...`);
            this.setState(`${device.id}.connected`, true, true);
            this.connectedDeviceCount++;
            try {
                await this.devices[device.ip].login();
                await this.devices[device.ip].retrieveData();
            } catch (err) {
                this.log.info(`Connection process for PH803W device ${device.id} on IP ${device.ip} was not successful: ${err}`);
                await this.devices[device.ip].close(true);
                return;
            }

            this.log.debug(`Initialization for PH803W device ${device.id} on IP ${device.ip} done (${this.connectedDeviceCount}/${Object.keys(this.devices).length})`);
            this.setConnected(this.connectedDeviceCount === Object.keys(this.devices).length);
        });
        this.devices[device.ip].on('disconnected', () => {
            this.setState(`${device.id}.connected`, false, true);
            if (deviceConnected) {
                deviceConnected = false;
                this.connectedDeviceCount--;
                this.log.info(`Disconnected PH803W device ${device.id} on IP ${device.ip} (${this.connectedDeviceCount}/${Object.keys(this.devices).length})`);
                this.setConnected(false);
            }
        });

        this.devices[device.ip].on('error', err => {
            this.log.info(`PH803W device ${device.id} Error: ${err}`);
            const otherIpForDeviceId = Object.keys(this.devices).find(devIp => this.devices[devIp].id === device.id && this.devices[devIp].ip !== device.ip);
            if (otherIpForDeviceId) {
                const otherIpForDevice = this.devices[otherIpForDeviceId];
                if (otherIpForDevice.isConnected()) {
                    this.log.warn(`Device ${device.id} already known on ${otherIpForDevice.ip} and connected. Ignore this old IP ${device.ip}!`);
                    this.devices[device.ip].destroy();
                    delete this.devices[device.ip];
                }
            }
        });

        this.devices[device.ip].on('data', data => {
            this.log.debug(`Data received for PH803W device ${device.id}: ${JSON.stringify(data)}`);
            this.setState(`${device.id}.ph.value`, data.ph, true);
            this.setState(`${device.id}.ph.outlet`, data.phOutlet, true);
            this.setState(`${device.id}.redox.value`, data.redox, true);
            this.setState(`${device.id}.redox.outlet`, data.redoxOutlet, true);
        });

        this.devices[device.ip].connect();
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
