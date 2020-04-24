/**
 * CopyPaste.me
 *
 * @author Sebastian Kersten (@supertaboo)
 */

'use strict';


// import external classes
const Module_HTTP = require('http');
const Module_FS = require('fs');
const Module_HTTPS = require('https');
const Module_SocketIO = require('socket.io');
const Module_Express = require('express');
const Module_GenerateUniqueID = require('generate-unique-id');
const Module_LogToFile = require('log-to-file');

// import core module
const CoreModule_Assert = require('assert');
const CoreModule_Util = require('util');

// import project classes
const Device = require('./components/Device');
const DeviceManager = require('./components/DeviceManager');
const Pair = require('./components/Pair');
const PairManager = require('./components/PairManager');
const Token = require('./components/Token');
const TokenManager = require('./components/TokenManager');
const MongoDB = require('./components/MongoDB');
const Logger = require('./components/Logger');
const StartupInfo = require('./components/StartupInfo');
const ToggleDirectionStates = require('./../client/components/ToggleDirectionButton/ToggleDirectionStates');
const ConnectorEvents = require('./../client/components/Connector/ConnectorEvents');


module.exports = {

    // runtime modes
    PRODUCTION: 'prod',
    DEVELOPMENT: 'dev',

    // config
    _config: {
        mode: this.PRODUCTION,   // options: "prod" (no output)  | "dev" (output debugging comments)
        https: true,    // options: 'true' (runs on https)  | 'false' (runs on http)
        mongo: true,
        mongoauthenticate: true
    },
    _configFile: null,

    // core
    Mimoto: {},

    // services
    _app: null,
    _server: null,
    _socketIO: null,

    // managers
    _tokenManager: null,



    // ----------------------------------------------------------------------------
    // --- Constructor ------------------------------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Constructor
     */
    __construct: function(config)
    {
        // 1. store
        if (config.mode && config.mode === 'prod' || config.mode === 'dev') this._config.mode = config.mode;
        if (config.https === true || config.https === false) this._config.https = config.https;
        if (config.mongo === true || config.mongo === false) this._config.mongo = config.mongo;
        if (config.mongoauthenticate === true || config.mongoauthenticate === false) this._config.mongoauthenticate = config.mongoauthenticate;

        // 2. load
        let jsonConfigFile = Module_FS.readFileSync('CopyPaste.config.json');

        // 3. convert
        this._configFile = JSON.parse(jsonConfigFile);

        // 4. boot up
        if (!this._startupMongoDB()) this._startupSocketIO();
    },

    /**
     * Startup MongoDB
     * @private
     */
    _startupMongoDB: function()
    {
        // 1. init
        this.Mimoto.mongoDB = new MongoDB(this._configFile, this._config);

        // 2. verify and exit
        if (!this._config.mongo) return false;

        // 3. configure
        this.Mimoto.mongoDB.addEventListener(MongoDB.prototype.MONGODB_READY, this._onMongoDBReady.bind(this));

        // 4. exit
        return true
    },

    /**
     * Handle MongoManager `MONGODB_READY`
     * @private
     */
    _onMongoDBReady: function()
    {
        // 1. start
        this._startupSocketIO();
    },

    /**
     * Startup SocketIO
     * @private
     */
    _startupSocketIO: function()
    {
        // 1. init
        if (this._config.https)
        {
            // a. setup
            this._server = new Module_HTTPS.createServer({
                key: Module_FS.readFileSync(this._configFile.ssl.key.toString(), 'utf8'),
                cert: Module_FS.readFileSync(this._configFile.ssl.certificate.toString(), 'utf8')
            });
        }
        else
        {
            // a. init
            this._app = Module_Express();

            // b. setup
            this._server = new Module_HTTP.createServer(this._app, { pingTimeout: 60000 });
        }

        // 2. setup
        this._socketIO = Module_SocketIO(this._server);

        // 3. configure
        this._socketIO.on('connection', this._onSocketConnect.bind(this));

        // 4. listen
        this._server.listen(this._configFile.socketio.server.port, this._configFile.socketio.server.host, this._onSocketIOConnected.bind(this));
    },


    /**
     * Handle SocketIO `connect`
     * @private
     */
    _onSocketIOConnected: function()
    {
        // 1. startup
        this._init();
    },

    /**
     * Initialize application
     * @private
     */
    _init: function()
    {
        // 1. extend core
        PairManager.prototype.Mimoto = this.Mimoto;
        DeviceManager.prototype.Mimoto = this.Mimoto;
        StartupInfo.prototype.Mimoto = this.Mimoto;
        Pair.prototype.Mimoto = this.Mimoto;

        // 2. init core
        this.Mimoto.logger = new Logger((this._configFile.logtofile.file) ? this._configFile.logtofile.file.toString() : '', this._config.mode === this.DEVELOPMENT);

        // 3. output
        new StartupInfo(this._configFile, this._config, this.Mimoto.mongoDB.isRunning());

        // 4. init core
        this.Mimoto.deviceManager = new DeviceManager();
        this.Mimoto.pairManager = new PairManager();

        // 5. init
        this._tokenManager = new TokenManager();
    },



    // ----------------------------------------------------------------------------
    // --- Sockets ----------------------------------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Handle socket `connect`
     * @param socket
     * @private
     */
    _onSocketConnect: function(socket)
    {
        // 1. store
        this.Mimoto.deviceManager.registerSocket(socket);

        // 2. configure - sockets
        socket.on('disconnect', this._onSocketDisconnect.bind(this, socket));

        // 3. configure primary device
        socket.on(ConnectorEvents.prototype.REQUEST_PRIMARYDEVICE_CONNECT, this._onRequestPrimaryDeviceConnect.bind(this, socket));
        socket.on(ConnectorEvents.prototype.REQUEST_PRIMARYDEVICE_FRESH_TOKEN, this._onRequestPrimaryDeviceFreshToken.bind(this, socket));

        // 4. configure secondary device
        socket.on(ConnectorEvents.prototype.REQUEST_SECONDARYDEVICE_CONNECT_BY_QR, this._onRequestSecondaryDeviceConnectByQR.bind(this, socket));

        // 5. configure both devices
        socket.on(ConnectorEvents.prototype.REQUEST_DEVICE_RECONNECT, this._onRequestDeviceReconnect.bind(this, socket));
        socket.on(ConnectorEvents.prototype.SEND_DATA, this._onSendData.bind(this, socket));
        socket.on(ConnectorEvents.prototype.DATA_RECEIVED, this._onReceiverDataReceived.bind(this, socket));

        // 6. configure - setting events
        socket.on(ConnectorEvents.prototype.REQUEST_TOGGLE_DIRECTION, this._onRequestToggleDirection.bind(this, socket));

        // 7. configure - handshake events
        socket.on(ConnectorEvents.prototype.REQUEST_PRIMARYDEVICE_MANUALCODE, this._onRequestPrimaryDeviceManualCode.bind(this, socket));
        socket.on(ConnectorEvents.prototype.REQUEST_SECONDARYDEVICE_CONNECT_BY_MANUALCODE, this._onRequestSecondaryDeviceConnectByManualCode.bind(this, socket));
        socket.on(ConnectorEvents.prototype.REQUEST_SECONDARYDEVICE_MANUALCODE_HANDSHAKE, this._onRequestSecondaryDeviceManualCodeHandshake.bind(this, socket));
        socket.on(ConnectorEvents.prototype.REQUEST_PRIMARYDEVICE_MANUALCODE_CONFIRMED, this._onRequestPrimaryDeviceManualCodeConfirmed.bind(this, socket));

        // 8. log
        this._logUsers('Socket connected (socket.id = ' + socket.id + ')');
    },

    /**
     * Handle socket `disconnect`
     * @param socket
     * @private
     */
    _onSocketDisconnect: function(socket)
    {
        // 1. store
        this.Mimoto.deviceManager.unregisterSocket(socket);

        // 2. clear configuration
        socket.removeAllListeners();

        // 3. log
        this._logUsers('Socket disconnected (socket.id = ' + socket.id + ')');
    },



    // ----------------------------------------------------------------------------
    // --- Event handlers - Pairing - Primary device ------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Handle primary device `REQUEST_PRIMARYDEVICE_CONNECT`
     * @param primaryDeviceSocket
     * @param sPrimaryDevicePublicKey
     * @private
     */
    _onRequestPrimaryDeviceConnect: function(primaryDeviceSocket, sPrimaryDevicePublicKey)
    {
        // 1. init
        let pair = this.Mimoto.pairManager.initPair(primaryDeviceSocket, sPrimaryDevicePublicKey);

        // 2. create
        let token = this._tokenManager.createToken(pair, Token.prototype.TYPE_QR);

        // 3. send
        pair.getPrimaryDevice().emit(ConnectorEvents.prototype.UPDATE_PRIMARYDEVICE_CONNECTED, pair.getPrimaryDeviceID(), token.getValue(), token.getLifetime());

        // 4. output
        this._logUsers('Primary Device with socket.id = ' + primaryDeviceSocket.id + ' requests token = ' + token.getValue());
    },

    /**
     * Handle device `REQUEST_DEVICE_RECONNECT`
     * @param socket
     * @param sDeviceID
     * @private
     */
    _onRequestDeviceReconnect: function(socket, sDeviceID)
    {
        // 1. load
        let newDevice = this.Mimoto.deviceManager.getDeviceBySocketID(socket.id);
        let originalDevice = this.Mimoto.deviceManager.getOfflineDeviceByDeviceID(sDeviceID);

        // 2. validate
        if (!newDevice || !originalDevice)
        {
            // a. output
            this.Mimoto.logger.log('No original device after server restart sDeviceID = ' + sDeviceID);

            // b. send
            socket.emit(ConnectorEvents.prototype.ERROR_DEVICE_RECONNECT_DEVICEID_NOT_FOUND);

            // c. exit
            return;
        }

        // 3. restore and merge
        let device = this.Mimoto.deviceManager.restoreAndMerge(originalDevice, newDevice);

        // 4. load
        let pair = this.Mimoto.pairManager.getPairByDeviceID(sDeviceID);

        // 5. validate
        if (pair === false)
        {
            // a. output
            this.Mimoto.logger.log('No pair connected to sDeviceID = ' + sDeviceID);

            // b. send
            socket.emit(ConnectorEvents.prototype.ERROR_DEVICE_RECONNECT_DEVICEID_NOT_FOUND);

            // c. exit
            return;
        }

        // 6. init
        let bOtherDeviceConnected = false;

        // 7. select
        switch(device.getType())
        {
            case Device.prototype.PRIMARYDEVICE:

                // a. store
                if (!pair.reconnectPrimaryDevice(device)) return;

                // b. verify
                if (pair.hasSecondaryDevice())
                {
                    // I. toggle
                    bOtherDeviceConnected = true;

                    // II. notify
                    pair.getSecondaryDevice().emit(ConnectorEvents.prototype.UPDATE_OTHERDEVICE_RECONNECTED);
                }

                break;

            case Device.prototype.SECONDARYDEVICE:

                // a. store
                if (!pair.reconnectSecondaryDevice(device)) return;

                // b. verify
                if (pair.hasPrimaryDevice())
                {
                    // I. toggle
                    bOtherDeviceConnected = true;

                    // II. notify
                    pair.getPrimaryDevice().emit(ConnectorEvents.prototype.UPDATE_OTHERDEVICE_RECONNECTED);
                }

                break;

            default:

                return;
        }

        // 8. notify
        socket.emit(ConnectorEvents.prototype.UPDATE_DEVICE_RECONNECTED, bOtherDeviceConnected);


        // ---


        // 9. output
        this._logUsers('Device `' + device.getType() + '` with sDeviceID = `' + sDeviceID + '` reconnected to pair (socket.id = ' + socket.id + ')');
    },



    /**
     * Handle primary device `REQUEST_PRIMARYDEVICE_FRESH_TOKEN`
     * @param socket
     * @private
     */
    _onRequestPrimaryDeviceFreshToken: function(socket)
    {
        // 1. load
        let pair = this.Mimoto.pairManager.getPairBySocketID(socket.id);

        // 2. validate
        if (pair === false) return;

        // 3. refresh
        let token = this._tokenManager.createToken(pair, Token.prototype.TYPE_QR);

        // 4. send
        pair.getPrimaryDevice().emit(ConnectorEvents.prototype.UPDATE_PRIMARYDEVICE_FRESH_TOKEN, token.getValue(), token.getLifetime());
    },



    // ----------------------------------------------------------------------------
    // --- Event handlers - Pairing - Secondary device ----------------------------
    // ----------------------------------------------------------------------------


    /**
     * Handle secondary device `REQUEST_SECONDARYDEVICE_CONNECT_BY_QR`
     * @param socket
     * @param sTokenValue
     * @param sPublicKey
     * @private
     */
    _onRequestSecondaryDeviceConnectByQR: function(socket, sPublicKey, sTokenValue)
    {
        // 1. load
        let device = this.Mimoto.deviceManager.getDeviceBySocketID(socket.id);

        // 2. load
        let token = this._tokenManager.getToken(sTokenValue);

        // 3. validate or send error
        if (token === false)
        {
            this.Mimoto.logger.log('SECONDARYDEVICE_CONNECT_TOKEN_NOT_FOUND for sTokenValue=`' + sTokenValue + '` from socket.id=`' + socket.id + '`');

            // a. broadcast
            socket.emit(ConnectorEvents.prototype.ERROR_SECONDARYDEVICE_CONNECT_BY_QR_TOKEN_NOT_FOUND);

            // b. exit
            return;
        }

        // 4. load
        let pair = token.getPair();

        // 5. validate
        if (!pair.connectSecondaryDevice(socket, sPublicKey, device, token.getType())) return false;

        // 6. store
        //pair.setConnectionType(PairManager.prototype.CONNECTIONTYPE_QR);

        // 7. update
        socket.emit(ConnectorEvents.prototype.UPDATE_SECONDARYDEVICE_CONNECTED_BY_QR, pair.getSecondaryDeviceID(), pair.getPrimaryDevicePublicKey(), pair.getDirection());

        // 8. send
        if (pair.hasPrimaryDevice()) pair.getPrimaryDevice().emit(ConnectorEvents.prototype.UPDATE_OTHERDEVICE_CONNECTED, pair.getSecondaryDevicePublicKey());

        // 9. output
        this._logUsers('Secondary device with socket.id = ' + socket.id + ' requests connection to token = ' + token.getValue());
    },



    // ----------------------------------------------------------------------------
    // --- Private functions - Manual code ----------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Handle 'REQUEST_PRIMARYDEVICE_MANUALCODE'
     * @param socket
     * @private
     */
    _onRequestPrimaryDeviceManualCode: function(socket)
    {
        // 1. load
        let pair = this.Mimoto.pairManager.getPairBySocketID(socket.id);

        // 2. validate
        if (pair === false) return;

        // 3. refresh
        let token = this._tokenManager.createToken(pair, Token.prototype.TYPE_MANUALCODE);

        // 4. send
        socket.emit(ConnectorEvents.prototype.UPDATE_PRIMARYDEVICE_MANUALCODE, token.getValue(), token.getLifetime());


        // ---


        // 5. output
        this.Mimoto.logger.log('Socket.id = ' + socket.id + ' has requested manual code');
    },

    /**
     * Handle event 'REQUEST_SECONDARYDEVICE_CONNECT_BY_MANUALCODE'
     * @param socket
     * @param sPublicKey
     * @param sManualCode
     * @private
     */
    _onRequestSecondaryDeviceConnectByManualCode: function(socket, sPublicKey, sManualCode)
    {
        // 1. load
        let device = this.Mimoto.deviceManager.getDeviceBySocketID(socket.id);

        // 2. load
        let token = this._tokenManager.getToken(sManualCode);

        // 3. validate or send error
        if (token === false)
        {
            this.Mimoto.logger.log('ERROR_SECONDARYDEVICE_CONNECT_BY_MANUALCODE_TOKEN_NOT_FOUND for sManualCode=`' + sManualCode + '` from socket.id=`' + socket.id + '`');

            // a. broadcast
            socket.emit(ConnectorEvents.prototype.ERROR_SECONDARYDEVICE_CONNECT_BY_MANUALCODE_TOKEN_NOT_FOUND);

            // b. exit
            return;
        }

        // 4. load
        let pair = token.getPair();

        // 5. validate
        pair.registerUnconfirmedSecondaryDevice(socket, sPublicKey, device, token.getType());

        // 6. store
        //pair.setConnectionType(PairManager.prototype.CONNECTIONTYPE_MANUALCODE);

        // 7. update
        socket.emit(ConnectorEvents.prototype.UPDATE_SECONDARYDEVICE_MANUALCODE_ACCEPTED, pair.getSecondaryDeviceID(), pair.getPrimaryDevicePublicKey(), pair.getDirection());


        // ---


        // 8. output
        this._logUsers('Secondary device with socket.id = ' + socket.id + ' requests connection to manual code = ' + token.getValue());
    },

    /**
     * Handle `REQUEST_SECONDARYDEVICE_MANUALCODE_HANDSHAKE`
     * @param socket
     * @param sConfirmationCode
     * @private
     */
    _onRequestSecondaryDeviceManualCodeHandshake: function(socket, sConfirmationCode)
    {
        // 1. load
        let pair = this.Mimoto.pairManager.getPairBySocketID(socket.id);

        // 2. validate
        if (pair === false) return;

        // 3. send
        if (pair.hasPrimaryDevice()) pair.getPrimaryDevice().emit(ConnectorEvents.prototype.REQUEST_PRIMARYDEVICE_MANUALCODE_CONFIRMATION, sConfirmationCode);
    },

    /**
     * Handle manualcode event `REQUEST_PRIMARYDEVICE_MANUALCODE_CONFIRMED`
     * @private
     */
    _onRequestPrimaryDeviceManualCodeConfirmed: function(socket)
    {
        // 1. load
        let pair = this.Mimoto.pairManager.getPairBySocketID(socket.id);

        // 2. validate
        if (pair === false) return;

        // 3. transfer and validate
        if (!pair.confirmUnconfirmedSecondaryDevice())
        {
            // a. notify
            socket.emit(ConnectorEvents.prototype.ERROR_PRIMARYDEVICE_CONNECT_BY_MANUALCODE_SECONDARYDEVICE_NOT_FOUND);

            // b. output
            this._logUsers('Secondary device NOt connected by manual code because it`s not there anymore');

            // c. exit
            return;
        }

        // 4. send
        if (pair.hasSecondaryDevice()) pair.getSecondaryDevice().emit(ConnectorEvents.prototype.UPDATE_SECONDARYDEVICE_CONNECTED_BY_MANUALCODE, pair.getSecondaryDeviceID(), pair.getPrimaryDevicePublicKey(), pair.getDirection());

        // 5. send
        if (pair.hasPrimaryDevice()) pair.getPrimaryDevice().emit(ConnectorEvents.prototype.UPDATE_OTHERDEVICE_CONNECTED, pair.getSecondaryDevicePublicKey());


        // --- log ---


        // 6. output
        this._logUsers('Secondary device connected by manual code (socket.id = ' + pair.getSecondaryDevice().id + ')');
    },



    // ----------------------------------------------------------------------------
    // --- Private functions - Settings -------------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Handle `REQUEST_TOGGLE_DIRECTION`
     * @param socket
     * @private
     */
    _onRequestToggleDirection: function(socket)
    {
        // 1. load
        let pair = this.Mimoto.pairManager.getPairBySocketID(socket.id);

        // 2. validate
        if (pair === false) return;

        // 3. toggle
        pair.toggleDirection();

        // 4. send
        if (pair.hasPrimaryDevice()) pair.getPrimaryDevice().emit(ConnectorEvents.prototype.UPDATE_TOGGLE_DIRECTION, pair.getDirection());
        if (pair.hasSecondaryDevice()) pair.getSecondaryDevice().emit(ConnectorEvents.prototype.UPDATE_TOGGLE_DIRECTION, pair.getDirection());
    },



    // ----------------------------------------------------------------------------
    // --- Private functions - Data -----------------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Handle device `SEND_DATA`
     * @param socket
     * @param encryptedData
     * @private
     */
    _onSendData: function(socket, encryptedData)
    {
        // 1. load
        let pair = this.Mimoto.pairManager.getPairBySocketID(socket.id);

        // 2. validate
        if (pair === false) return;

        // 3. forward
        pair.sendData(encryptedData);
    },

    /**
     * Handle receiver `DATA_RECEIVED`
     * @param socket
     * @param data
     * @private
     */
    _onReceiverDataReceived: function(socket, data)
    {
        // 1. load
        let pair = this.Mimoto.pairManager.getPairBySocketID(socket.id);

        // 2. validate
        if (pair === false) return;

        // 3. forward
        if (pair.hasOtherDevice(socket)) pair.getOtherDevice(socket).emit(ConnectorEvents.prototype.DATA_RECEIVED, data);

    },



    // ----------------------------------------------------------------------------
    // --- Private functions - Logging --------------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Log users (for debugging purposes only)
     * @param sTitle
     * @private
     */
    _logUsers: function(sTitle)
    {
        // 1. compose
        let sOutput = '' + '\n' +
            sTitle + '\n' +
            '=========================' + '\n' +
            'Number of sockets:' + this.Mimoto.deviceManager.getNumberOfDevices() + '\n' +
            'Number of pairs:' + this.Mimoto.pairManager.getNumberOfActivePairs() + '\n' +
            'Number of idle pairs:' + this.Mimoto.pairManager.getNumberOfIdlePairs() + '\n' +
            //'---' + '\n' +
            //'Number of pairs that established connection between both devices:' + Object.keys(this._aConnectedPairs).length + '\n' +
            //'Number of pairs that have been used to send data:' + Object.keys(this._aUsedPairs).length +
            '\n';

        // 2. output to file
        this.Mimoto.logger.logToFile(sOutput);

        // 3. output to console
        this.Mimoto.logger.log(sOutput);


        // 3. output
        this.Mimoto.logger.logToFile('');
        this.Mimoto.logger.logToFile(sTitle);
        this.Mimoto.logger.logToFile('Devices by socket ID');
        this.Mimoto.logger.logToFile('=========================');
        this.Mimoto.logger.logToFile(this.Mimoto.deviceManager.getAllDevicesBySocketID());


        this.Mimoto.logger.log('Devices by device ID');
        this.Mimoto.logger.log('=========================');
        this.Mimoto.logger.log(this.Mimoto.deviceManager.getAllDevicesByDeviceID());
        this.Mimoto.logger.log('Offline devices');
        this.Mimoto.logger.log('=========================');
        this.Mimoto.logger.log(this.Mimoto.deviceManager.getAllOfflineDevices());
        this.Mimoto.logger.log('=========================');
        this.Mimoto.logger.log('Pairs');
        this.Mimoto.logger.log('-------------------------');
        this.Mimoto.logger.log(this.Mimoto.pairManager.getActivePairs());
        this.Mimoto.logger.log('');
        // this.Mimoto.logger.log('Idle pairs');
        // this.Mimoto.logger.log('-------------------------');
        // this.Mimoto.logger.log(this._aInactivePairs);
        //this.Mimoto.logger.log(CoreModule_Util.inspect(this._aInactivePairs, false, null, true));
        this.Mimoto.logger.log('');
        this.Mimoto.logger.log('');
    }

};

// init
this.Mimoto = {};
this.Mimoto.config = {};

// read
process.argv.forEach((value, index) => {
    if (value.substr(0, 5) === 'mode=')
    {
        this.Mimoto.config.mode = (value.substr(5) === 'dev') ? 'dev' : 'prod';
    }
    if (value.substr(0, 6) === 'https=')
    {
        this.Mimoto.config.https = (value.substr(6) === 'false') ? false : true;
    }
    if (value.substr(0, 18) === 'mongoauthenticate=')
    {
        this.Mimoto.config.mongoauthenticate = (value.substr(18) === 'false') ? false : true;
    }
});

// auto-start
module.exports.__construct(this.Mimoto.config);
