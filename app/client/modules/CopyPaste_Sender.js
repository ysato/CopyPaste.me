/**
 * CopyPaste.me
 *
 * @author Sebastian Kersten (@supertaboo)
 */

'use strict';


// import
const QRCodeGenerator = require('qrcode-generator');
const SocketIO = require('socket.io-client');


module.exports = function(sGateway)
{
    // start
    this.__construct(sGateway);
};

module.exports.prototype = {

    // connection
    _socket: null,
    _sToken: '',


    // ----------------------------------------------------------------------------
    // --- Constructor ------------------------------------------------------------
    // ----------------------------------------------------------------------------


    /**
     * Constructor
     */
    __construct: function (sGateway)
    {
        // log
        if (console) console.log('Connecting user');

        // setup
        this._socket = new SocketIO.connect(sGateway);


        // register
        let classRoot = this;

        // configure
        this._socket.on('connect', function() { classRoot._socketOnConnect(); });
        this._socket.on('connect_failed', function() { classRoot._socketConnectFailed(); });
        this._socket.on('disconnect', function() { classRoot._socketOnDisconnect(); });


        let sURL = window.location.href;
        console.log('startup token', sURL.substr(sURL.lastIndexOf('/')));


        this._socket.on('token', function(sToken) { classRoot._setupToken(sToken); });
        this._socket.on('data-password', function(sPassword) { classRoot._showPassword(sPassword); });
        this._socket.on('data-openurl', function(sURL) { classRoot._openURL(sURL); });


        // 4. open url (also show URL)
        // 6. show version in bottom/footer
        // 7. onConnect remove QR code -> you are now connected -> check 4 character code
        // 8. change URL to token
        // 10. register token in server
    },

    _socketOnConnect: function ()
    {
        // 1. logon with php
        if (console) console.log('User connected'); // (socket id = ' + this._socket.id + ')');

        if (!this._sToken) this._socket.emit('request_token');

    },

    _socketConnectFailed: function()
    {
        if (console) console.log('You are logged off .. trying to connect ...');
    },

    _socketOnDisconnect: function()
    {
        if (console) console.warn('Connection with server was lost .. reconnecting ..');
    },


    _setupToken: function (sToken)
    {
        // setup
        let sURL = 'http://copypaste.local/' + sToken;

        var typeNumber = 4;
        var errorCorrectionLevel = 'L';
        var qr = QRCodeGenerator(typeNumber, errorCorrectionLevel);
        qr.addData(sURL);
        qr.make();
        document.getElementById('QRCodePlaceHolder').innerHTML = qr.createImgTag(5);


        if (console) console.log('sToken = ' + sToken);

        // store
        this._sToken = sToken;



        document.getElementById("copy_token").innerHTML = sToken;
        document.getElementById("copy_token").addEventListener(
            'click',
            function(e)
            {
                // copy to clipboard
                const el = document.createElement('textarea');
                el.value = sURL;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);

            }.bind(this, sURL)
        );






        document.getElementById("token_url").innerHTML = sURL;

        // document.getElementById("content").innerHTML = response.html;
        // document.title = response.pageTitle;
        // if (window.history.pushState) {
        //     window.history.pushState({}, null, "/" + sToken);
        // }
    },

    _showPassword: function (sPassword)
    {
        // // init
        // var newEl = document.createElement('div');
        //
        // // configure
        // newEl.setAttribute('class', 'password');
        //
        // // output
        // document.getElementById('transferredData').appendChild(newEl);




        document.getElementById('received_data_label_data').setAttribute('data-data', sPassword); // #todo alter to encrypted js
        document.getElementById('received_data_label_data').innerText = '*******';
        document.getElementById('received_data_button').addEventListener('click', this._onClickCopyToClipboard);




        // setup
        //newEl.appendChild(document.createTextNode(sPassword));
        //newEl.innerHTML =


    },

    _openURL: function (sURL)
    {
        window.open(sURL);
    },

    _onClickCopyToClipboard: function()
    {
        // copy to clipboard
        const el = document.createElement('textarea');
        el.value = document.getElementById('received_data_label_data').getAttribute('data-data');
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);



        // register
        let elTooltip = document.getElementById('tooltip');

        elTooltip.classList.remove('tooltip-fade');
        elTooltip.style.display = 'inline-block';
        //elTooltip.style.opacity = 0.5;

        elTooltip.classList.add('tooltip-fade');
    }

};
