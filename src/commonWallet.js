var bitcoinjs = require('bitcoinjs-lib');
var bitcoin = require('./bitcoin');
var request = require('request');

var simpleCommonWallet = function(options) {
  var commonBlockchain = options.commonBlockchain;
  var network = options.network;
  var wif = (options.wif) ? options.wif : bitcoin.WIFKeyFromSeed(options.seed, network);
  var address = bitcoin.getAddressFromWIF(wif, network);

  var signMessage = function (message, cb) {
    var key = bitcoinjs.ECKey.fromWIF(wif);
    var network = (network === "testnet") ? bitcoinjs.networks.testnet : null;
    cb(null, bitcoinjs.Message.sign(key, message, network).toString('base64'));
  };
  
  //callback (error, tx.to)
  var signRawTransaction = function(txHex, cb) {
    var index = 0;
    var options;
    if (typeof(txHex) == "object") {
      options = txHex;
      txHex = options.txHex;
      index = options.index || 0;
    }
    var tx = bitcoinjs.Transaction.fromHex(txHex);
    var key = bitcoinjs.ECKey.fromWIF(wif);
    tx.sign(index, key);
    var txid = tx.getId();
    cb(false, tx.toHex(), txid);
  };

  var createTransaction = function(opts, callback) {
    var value = opts.value;
    var destinationAddress = opts.destinationAddress;
    commonBlockchain.Addresses.Unspents([address], function (err, addressesUnspents) {
      if(err && !addressesUnspents) {
        callback("error creating transaction: " + err, null);
        return;
      }
      var unspentOutputs = addressesUnspents[0];
      unspentOutputs.forEach(function(utxo) {
        utxo.txHash = utxo.txid;
        utxo.index = utxo.vout;
      });
    
      var signedTxHex;

      bitcoin.buildTransaction({
        sourceWIF: wif,
        destinationAddress: destinationAddress,
        value: value,
        network: network,
        rawUnspentOutputs: unspentOutputs,
        propagateCallback: (opts.propagate) ? commonBlockchain.Transactions.Propagate : null
      }, function (err, transaction) {
          callback(err, transaction);
      });
    });
  };

  var __hosts = {};

  var walletRequest = function(options, callback) {
    var host = options.host;
    var path = options.path;
    var url = host + path;
    options.url = options.url || url;
    var nonce = __hosts[host].nonce;
    signMessage(nonce, function(err, signedNonce) {
      var headers = {
        'x-common-wallet-address': address,
        'x-common-wallet-network': network,
        'x-common-wallet-signed-nonce': signedNonce
      };
      options.headers = options.headers ? options.headers.concat(headers) : headers;
      request(options, function(err, res, body) {
        __hosts[host] = {
          nonce: res.headers['x-common-wallet-nonce'],
          verifiedAddress: res.headers['x-common-wallet-verified-address']
        };
        callback(err, res, body);
      });
    });
  };

  var login = function(host, callback) {
    request({
      url: host + "/nonce",
      headers: {
        'x-common-wallet-address': address,
        'x-common-wallet-network': "testnet"
      }
    }, function(err, res, body) {
      __hosts[host] = {
        nonce: res.headers['x-common-wallet-nonce']
      };
      callback(err, res, body);
    });
  };

  var commonWallet = {
    request: walletRequest,
    login: login,
    network: network,
    signRawTransaction: signRawTransaction,
    signMessage: signMessage,
    address: address,
    createTransaction: createTransaction
  };

  return commonWallet;
};

module.exports = simpleCommonWallet;