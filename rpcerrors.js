// Generated by CoffeeScript 2.7.0
//###########################################################
var rpcErrorMap;

export var PARSE_ERROR = -32700;

export var INVALID_REQUEST = -32600;

export var METHOD_NOT_FOUND = -32601;

export var NOT_AUTHORIZED = -32023;

export var NO_SEATS = -32002;

export var INVALID_PARAMS = -32602;

export var EXECUTION_ERROR = -32032;

//###########################################################
rpcErrorMap = new Map();

//###########################################################
//region Error message For RPC Errors

//###########################################################
rpcErrorMap.set(PARSE_ERROR, {
  message: "JSON Parse Error!"
});

//###########################################################
rpcErrorMap.set(INVALID_REQUEST, {
  message: "Request is invalid thingy-rpc!"
});

//###########################################################
rpcErrorMap.set(METHOD_NOT_FOUND, {
  message: "Method not found!"
});

//###########################################################
rpcErrorMap.set(NOT_AUTHORIZED, {
  message: "Authentication failed!"
});

//###########################################################
rpcErrorMap.set(NO_SEATS, {
  message: "No free ressources available on the server!"
});

//###########################################################
rpcErrorMap.set(INVALID_PARAMS, {
  message: "Invalid params provided!"
});

//###########################################################
rpcErrorMap.set(EXECUTION_ERROR, {
  message: "Execution error!"
});

//endregion

  //###########################################################
export var NetworkError = class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = "NetworkError";
  }

};

//###########################################################
export var ResponseAuthError = class ResponseAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "ResponseAuthError";
  }

};

//###########################################################
export var RPCError = class RPCError extends Error {
  constructor(func, remoteError) {
    var error, errorCode;
    errorCode = remoteError.code;
    error = rpcErrorMap.get(errorCode);
    super(`${func}: (${errorCode}) ${error.message} (${remoteError.message})`);
    this.rpcCode = errorCode;
    this.name = "RPCError";
  }

};
