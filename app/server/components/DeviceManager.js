/**
 * CopyPaste.me
 *
 * @author Sebastian Kersten (@supertaboo)
 */

'use strict';


// import project classes
const Device = require('./Device');

// import extenders
const EventDispatcherExtender = require('./../../common/extenders/EventDispatcherExtender');


module.exports = function()
{
    // start
    this.__construct();
};

module.exports.prototype = {

    // source
    _aDevicesBySocketID: [],
    _aDevicesByDeviceID: [],
    _aOfflineDevices: [],

    // utils
    _timer: null,

    // events
    DEVICE_OFFLINE: 'DEVICE_OFFLINE',
    DEVICE_REMOVED: 'DEVICE_REMOVED',

    // config
    OFFLINE_DEVICE_LIFETIME: 2 * 60 * 1000, //24 * 60 * 60 * 1000,



    // ----------------------------------------------------------------------------
    // --- Constructor ------------------------------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Constructor
     */
    __construct: function ()
    {
        // 1. extend
        new EventDispatcherExtender(this);

        // ---

        // 2. run garbage collection
        this._timer = setInterval(this._cleanupExpiredOfflineDevices.bind(this), 10 * 1000);
    },



    // ----------------------------------------------------------------------------
    // --- Public methods ---------------------------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Register socket
     * @param socket
     */
    registerSocket: function(socket)
    {
        // 1. create
        let device = new Device(socket);

        // 2. store
        this._aDevicesBySocketID[socket.id] = device;
        this._aDevicesByDeviceID[device.getID()] = device;
    },

    /**
     * Unregister socket
     * @param socket
     */
    unregisterSocket: function(socket)
    {
        // 1. load
        let device = this._aDevicesBySocketID[socket.id];

        // 2. move and set moment of expiry
        this._aOfflineDevices[device.getID()] = {
            device: this._aDevicesByDeviceID[device.getID()],
            nExpires: new Date().getTime() + this.OFFLINE_DEVICE_LIFETIME
        };

        // 3. cleanup
        delete this._aDevicesBySocketID[socket.id];
        delete this._aDevicesByDeviceID[device.getID()];

        // 4. broadcast
        this.dispatchEvent(this.DEVICE_OFFLINE, device);
    },

    /**
     * Restore original device and merge new device into it
     * @param originalDevice
     * @param newDevice
     * @return object
     */
    restoreAndMerge: function(originalDevice, newDevice)
    {
        console.log('restoreAndMerge - original = ', originalDevice.getID(), 'new = ', newDevice.getID());

        // 1. transfer
        originalDevice.updateSocket(newDevice.getSocket());

        // 2. cleanup
        delete this._aDevicesBySocketID[newDevice.getSocketID()];
        delete this._aDevicesByDeviceID[newDevice.getID()];

        // 3. cleanup
        delete this._aOfflineDevices[originalDevice.getID()];

        // 4. copy
        this._aDevicesBySocketID[originalDevice.getSocketID()] = originalDevice;
        this._aDevicesByDeviceID[originalDevice.getID()] = originalDevice;

        // 5. send
        return originalDevice;
    },

    /**
     * Get device by socket ID
     * @param sSocketID
     * @returns {*}
     */
    getDeviceBySocketID: function(sSocketID)
    {
        // 1. validate and send
        return (this._aDevicesBySocketID[sSocketID]) ? this._aDevicesBySocketID[sSocketID] : false;
    },

    /**
     * Get device by device ID
     * @param sDeviceID
     * @returns {*}
     */
    getDeviceByDeviceID: function(sDeviceID)
    {
        // 1. validate and send
        return (this._aDevicesByDeviceID[sDeviceID]) ? this._aDevicesByDeviceID[sDeviceID] : false;
    },

    /**
     * Get offline device by device ID
     * @param sDeviceID
     * @returns {*}
     */
    getOfflineDeviceByDeviceID: function(sDeviceID)
    {
        // 1. validate and send
        return (this._aOfflineDevices[sDeviceID]) ? this._aOfflineDevices[sDeviceID].device : false;
    },

    // destroy: function(sDeviceID)
    // {
    //
    //
    //     // d. broadcast
    //     this.dispatchEvent(this.DEVICE_REMOVED, offlineDeviceData.device);
    // }



    // ----------------------------------------------------------------------------
    // --- Private methods --------------------------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Cleanup expired offline devices
     * @private
     */
    _cleanupExpiredOfflineDevices: function()
    {
        // 1. parse all
        for (let sKey in this._aOfflineDevices)
        {
            // a. register
            let offlineDeviceData = this._aOfflineDevices[sKey];

            // b. validate
            if (offlineDeviceData.nExpires >= new Date().getTime()) continue;

            // c. cleanup
            delete this._aOfflineDevices[sKey];

            // d. broadcast
            this.dispatchEvent(this.DEVICE_REMOVED, offlineDeviceData.device);
        }
    },



    // ----------------------------------------------------------------------------
    // --- Helpers for logging purposes -------------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Get number of register devices
     * @returns number
     */
    getNumberOfDevices: function()
    {
        return Object.keys(this._aDevicesBySocketID).length;
    },

    /**
     * Get all devices sorted by socket ID
     * @returns array
     */
    getAllDevicesBySocketID: function()
    {
        return this._aDevicesBySocketID;
    },

    /**
     * Get all devices sorted by device ID
     * @returns array
     */
    getAllDevicesByDeviceID: function()
    {
        return this._aDevicesByDeviceID;
    },

    /**
     * Get all offline devices
     * @returns array
     */
    getAllOfflineDevices: function()
    {
        return this._aOfflineDevices;
    }

};