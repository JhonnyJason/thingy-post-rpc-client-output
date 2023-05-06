// Generated by CoffeeScript 2.7.0
// ############################################################
// #region debug
// import { createLogFunctions } from "thingy-debug"
// {log, olog} = createLogFunctions("rpcpostclient")
// #endregion

//###########################################################
//region imports
var AUTHCODE_SHA2, TOKEN_SIMPLE, TOKEN_UNIQUE, authenticateServiceAuthCodeSHA2, authenticateServiceSignature, authenticateServiceStatement, doAnonymousRPC, doAuthCodeSHA2RPC, doNoAuthRPC, doPublicAccessRPC, doSignatureRPC, doTokenSimpleRPC, doTokenUniqueRPC, establishSHA2AuthCodeSession, establishSimpleTokenSession, establishUniqueTokenSession, extractServerId, generateSharedSecretSeed, getExplicitSimpleToken, incRequestId, postRPCString, randomPostfix, startSessionExplicitly;

import * as secUtl from "secret-manager-crypto-utils";

import * as validatableStamp from "validatabletimestamp";

import * as sess from "thingy-session-utils";

import * as tbut from "thingy-byte-utils";

import {
  FRAESC as Generator
} from "feistelled-reduced-aes-core";

import {
  NOT_AUTHORIZED,
  NetworkError,
  ResponseAuthError,
  RPCError
} from "./rpcerrors.js";

//endregion

//###########################################################
TOKEN_SIMPLE = 0;

TOKEN_UNIQUE = 1;

AUTHCODE_SHA2 = 2;

//###########################################################
export var RPCPostClient = class RPCPostClient {
  constructor(o) {
    this.serverURL = o.serverURL;
    this.serverId = o.serverId;
    this.serverContext = "thingy-rpc-post-connection";
    this.secretKeyHex = o.secretKeyHex;
    this.publicKeyHex = o.publicKeyHex;
    this.name = "rpc-client" + randomPostfix();
    this.requestId = 0;
    this.sessions = new Array(4);
    this.anonymousToken = null;
    this.publicToken = null;
    if (o.anonymousToken != null) {
      this.anonymousToken = o.anonymousToken;
    }
    if (o.publicToken != null) {
      this.publicToken = o.publicToken;
    }
    if (o.name != null) {
      this.name = o.name;
    }
    if (o.serverContext != null) {
      this.serverContext = o.serverContext;
    }
  }

  
    //#######################################################
  updateServer(serverURL, serverId, serverContext) {
    this.serverURL = serverURL;
    this.serverId = serverId;
    this.serverContext = serverContext;
    this.requestId = 0;
    this.sessionInfo = {};
  }

  updateKeys(secretKeyHex, publicKeyHex) {
    this.secretKeyHex = secretKeyHex;
    this.publicKeyHex = publicKeyHex;
    this.requestId = 0;
    this.sessionInfo = {};
  }

  //#######################################################
  getServerURL() {
    return this.serverURL;
  }

  async getServerId() {
    if (this.serverId == null) {
      await this.requestNodeId("none");
    }
    return this.serverId;
  }

  getSecretKey() {
    return this.secretKeyHex;
  }

  async getPublicKey() {
    if (this.publicKeyHex == null) {
      this.publicKeyHex = (await secUtl.createPublicKeyHex(this.secretKeyHex));
    }
    return this.publicKeyHex;
  }

  //#######################################################
  doRPC(func, args, authType) {
    if (this.requestingNodeId && func !== "getNodeId") {
      throw new Error("Cannot do regular RPCs while requesting NodeId!");
    }
    switch (authType) {
      case "none":
        return doNoAuthRPC(func, args, this);
      case "anonymous":
        return doAnonymousRPC(func, args, this);
      case "publicAccess":
        return doPublicAccessRPC(func, args, this);
      case "tokenSimple":
        return doTokenSimpleRPC(func, args, this);
      case "tokenUnique":
        return doTokenUniqueRPC(func, args, this);
      case "authCodeSHA2":
        return doAuthCodeSHA2RPC(func, args, this);
      case "signature":
      case "clientSignature":
      case "masterSignature":
        return doSignatureRPC(func, args, authType, this);
      default:
        throw new Error(`doRPC: Unknown authType! '${authType}'`);
    }
  }

  //#######################################################
  async requestNodeId(authType) {
    var args, func;
    this.requestingNodeId = true;
    func = "getNodeId";
    args = {};
    try {
      await this.doRPC(func, args, authType);
    } finally {
      this.requestingNodeId = false;
    }
  }

};

//#######################################################
//region internal functions

//#######################################################
randomPostfix = function() {
  var rand;
  rand = Math.random();
  return Math.round(rand * 1000);
};

//#######################################################
postRPCString = async function(url, requestString) {
  var baseMsg, bodyText, details, err, err2, errorMsg, options, response, statusText;
  options = {
    method: 'POST',
    credentials: 'omit',
    body: requestString,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  try {
    response = (await fetch(url, options));
    return (await response.json());
  } catch (error) {
    err = error;
    baseMsg = "Error! RPC could not receive a JSON response!";
    statusText = "No http-status could be provided!";
    try {
      statusText = `HTTP-Status: ${response.status}`;
      bodyText = `Body:  ${(await response.text())}`;
    } catch (error) {
      err2 = error;
      details = `No response could be retrieved! details: ${err.message}`;
      errorMsg = `${baseMsg} ${statusText} ${details}`;
      throw new NetworkError(errorMsg);
    }
    details = `${statusText} ${bodyText}`;
    errorMsg = `${baseMsg} ${details}`;
    throw new NetworkError(errorMsg);
  }
};

//#######################################################
incRequestId = function(c) {
  c.requestId = ++c.requestId % 10000000;
};

//#######################################################
//region RPC execution functions

//#######################################################
extractServerId = async function(response) {
  var content, nodeId, result, sig, verified;
  result = response.result;
  if (typeof result === "object" && (result.serverNodeId != null)) {
    validatableStamp.assertValidity(result.timestamp);
    nodeId = result.serverNodeId;
    sig = result.signature;
    result.signature = "";
    content = JSON.stringify(result);
    verified = (await secUtl.verify(sig, nodeId, content));
    if (!verified) {
      throw new Error("ServerId validation Failed: Invalid Signature!");
    }
    return nodeId;
  }
  if ((response.auth != null) && (response.auth.serverId != null)) {
    return response.auth.serverId;
  }
  return "";
};

//#######################################################
doSignatureRPC = async function(func, args, type, c) {
  var auth, clientId, name, requestId, requestString, response, rpcRequest, serverId, sigHex, signature, timestamp;
  incRequestId(c);
  clientId = (await c.getPublicKey());
  requestId = c.requestId;
  name = c.name;
  timestamp = validatableStamp.create();
  signature = "";
  auth = {type, clientId, name, requestId, timestamp, signature};
  rpcRequest = {auth, func, args};
  serverId = (await c.getServerId());
  requestString = JSON.stringify(rpcRequest);
  sigHex = (await secUtl.createSignature(requestString, c.secretKeyHex));
  requestString = requestString.replace('"signature":""', '"signature":"' + sigHex + '"');
  // log requestString
  response = (await postRPCString(c.serverURL, requestString));
  // olog { response }

  // in case of an error
  if (response.error) {
    throw new RPCError(func, response.error);
  }
  if (c.requestingNodeId) {
    c.serverId = (await extractServerId(response));
  }
  await authenticateServiceSignature(response, requestId, serverId);
  return response.result;
};


//#######################################################
//region public RPCs
doNoAuthRPC = async function(func, args, c) {
  var auth, requestString, response, serverId;
  auth = null;
  requestString = JSON.stringify({auth, func, args});
  serverId = c.serverId;
  response = (await postRPCString(c.serverURL, requestString));
  // olog response
  if (response.error) {
    throw new RPCError(response.error);
  }
  if (c.requestingNodeId) {
    c.serverId = (await extractServerId(response));
  }
  return response.result;
};

doAnonymousRPC = async function(func, args, c) {
  var auth, requestId, requestString, requestToken, response, serverId, timestamp, type;
  incRequestId(c);
  type = "anonymous";
  requestId = c.requestId;
  timestamp = validatableStamp.create();
  requestToken = c.anonymousToken;
  auth = {type, requestId, timestamp, requestToken};
  requestString = JSON.stringify({auth, func, args});
  serverId = c.serverId;
  response = (await postRPCString(c.serverURL, requestString));
  // olog response
  if (response.error) {
    throw new RPCError(response.error);
  }
  if (c.requestingNodeId) {
    c.serverId = (await extractServerId(response));
  }
  return response.result;
};

doPublicAccessRPC = async function(func, args, c) {
  var auth, clientId, requestId, requestString, requestToken, response, serverId, timestamp, type;
  incRequestId(c);
  type = "publicAccess";
  requestId = c.requestId;
  clientId = (await c.getPublicKey());
  timestamp = validatableStamp.create();
  requestToken = c.publicToken;
  auth = {type, clientId, requestId, timestamp, requestToken};
  // olog auth
  requestString = JSON.stringify({auth, func, args});
  serverId = c.serverId;
  response = (await postRPCString(c.serverURL, requestString));
  // olog response
  if (response.error) {
    throw new RPCError(response.error);
  }
  if (c.requestingNodeId) {
    c.serverId = (await extractServerId(response));
  }
  authenticateServiceStatement(response, requestId, serverId);
  return response.result;
};


//endregion

//#######################################################
//region session RPCs
doTokenSimpleRPC = async function(func, args, c) {
  var auth, clientId, corruptSession, name, requestId, requestString, requestToken, response, rpcRequest, serverId, timestamp, type;
  await establishSimpleTokenSession(c);
  incRequestId(c);
  type = "tokenSimple";
  clientId = (await c.getPublicKey());
  requestId = c.requestId;
  name = c.name;
  timestamp = validatableStamp.create();
  requestToken = c.sessions[TOKEN_SIMPLE].token;
  auth = {type, clientId, name, requestId, timestamp, requestToken};
  rpcRequest = {auth, func, args};
  requestString = JSON.stringify(rpcRequest);
  serverId = (await c.getServerId());
  response = (await postRPCString(c.serverURL, requestString));
  // olog { response }

  // in case of an error
  if (response.error) {
    corruptSession = (response.error.code != null) && response.error.code === NOT_AUTHORIZED;
    if (corruptSession) {
      c.sessions[TOKEN_SIMPLE] = null;
    }
    throw new RPCError(func, response.error);
  }
  if (c.requestingNodeId) {
    c.serverId = (await extractServerId(response));
  }
  await authenticateServiceStatement(response, requestId, serverId);
  return response.result;
};

doTokenUniqueRPC = async function(func, args, c) {
  var auth, clientId, corruptSession, name, requestId, requestString, requestToken, response, rpcRequest, serverId, timestamp, type, uniqueBytes;
  throw new Error("doTokenUniqueRPC: Not Implemented yet!");
  await establishUniqueTokenSession(c);
  incRequestId(c);
  type = "tokenUnique";
  clientId = (await c.getPublicKey());
  requestId = c.requestId;
  name = c.name;
  timestamp = validatableStamp.create();
  uniqueBytes = c.sessions[TOKEN_UNIQUE].generator.generate(timestamp);
  requestToken = tbut.bytesToHex(uniqueBytes);
  auth = {type, clientId, name, requestId, timestamp, requestToken};
  rpcRequest = {auth, func, args};
  requestString = JSON.stringify(rpcRequest);
  serverId = (await c.getServerId());
  response = (await postRPCString(c.serverURL, requestString));
  // olog { response }

  // in case of an error
  if (response.error) {
    corruptSession = (response.error.code != null) && response.error.code === NOT_AUTHORIZED;
    if (corruptSession) {
      c.sessions[TOKEN_UNIQUE] = null;
    }
    throw new RPCError(func, response.error);
  }
  if (c.requestingNodeId) {
    c.serverId = (await extractServerId(response));
  }
  await authenticateServiceStatement(response, requestId, serverId);
  return response.result;
};

doAuthCodeSHA2RPC = async function(func, args, c) {
  var auth, authCode, clientId, corruptSession, name, requestAuthCode, requestId, requestString, response, rpcRequest, serverId, session, timestamp, type;
  await establishSHA2AuthCodeSession(c);
  incRequestId(c);
  session = c.sessions[AUTHCODE_SHA2];
  type = "authCodeSHA2";
  clientId = (await c.getPublicKey());
  requestId = c.requestId;
  name = c.name;
  timestamp = validatableStamp.create();
  requestAuthCode = "";
  auth = {type, clientId, name, requestId, timestamp, requestAuthCode};
  rpcRequest = {auth, func, args};
  serverId = (await c.getServerId());
  requestString = JSON.stringify(rpcRequest);
  authCode = (await sess.createAuthCode(session.seedHex, requestString));
  requestString = requestString.replace('"requestAuthCode":""', '"requestAuthCode":"' + authCode + '"');
  // log requestString
  response = (await postRPCString(c.serverURL, requestString));
  // olog { response }

  // in case of an error
  if (response.error) {
    corruptSession = (response.error.code != null) && response.error.code === NOT_AUTHORIZED;
    if (corruptSession) {
      c.sessions[AUTHCODE_SHA2] = null;
    }
    throw new RPCError(func, response.error);
  }
  if (c.requestingNodeId) {
    c.serverId = (await extractServerId(response));
  }
  await authenticateServiceAuthCodeSHA2(response, requestId, serverId, c);
  return response.result;
};


//endregion

//endregion

//###########################################################
//region session establishment
startSessionExplicitly = async function(type, c) {
  var args, authType, err, func, name;
  incRequestId(c);
  name = c.name;
  args = {type, name};
  func = "startSession";
  authType = "clientSignature";
  try {
    return (await c.doRPC(func, args, authType));
  } catch (error) {
    err = error;
    throw new Error(`Explicit Start failed: ${err.message}`);
  }
};

establishSimpleTokenSession = async function(c) {
  var err, message, session;
  if ((c.sessions[TOKEN_SIMPLE] != null) && (c.sessions[TOKEN_SIMPLE].token != null)) {
    return;
  }
  try {
    session = {};
    session.token = (await getExplicitSimpleToken(c));
    // if c.implicitSessions
    //     session.token = await generateImplicitSimpleToken(c)
    // else
    //     session.token = await getExplicitSimpleToken(c)
    c.sessions[TOKEN_SIMPLE] = session;
  } catch (error) {
    err = error;
    message = `Could not establish a simple Token session! Details: ${err.message}`;
    throw new Error(message);
  }
};

generateSharedSecretSeed = async function(timestamp, c) {
  var context, serverContext, specificContext;
  serverContext = c.serverContext;
  specificContext = c.name;
  context = `${specificContext}:${serverContext}_${timestamp}`;
  return (await secUtl.diffieHellmanSecretHashHex(c.secretKeyHex, c.serverId, context));
};

getExplicitSimpleToken = function(c) {
  return startSessionExplicitly("tokenSimple", c);
};

establishUniqueTokenSession = async function(c) {
  var err, message, seedBytes, session, timestamp;
  if ((c.sessions[TOKEN_UNIQUE] != null) && (c.sessions[TOKEN_UNIQUE].seedHex != null)) {
    return;
  }
  try {
    session = {};
    timestamp = (await startSessionExplicitly("tokenUnique", c));
    seedBytes = tbut.hexToBytes((await generateSharedSecretSeed(timestamp, c)));
    session.generator = new Generator(seedBytes);
    c.sessions[TOKEN_UNIQUE] = session;
  } catch (error) {
    err = error;
    message = `Could not establish a unique Token session! Details: ${err.message}`;
    throw new Error(message);
  }
};

establishSHA2AuthCodeSession = async function(c) {
  var err, message, session, timestamp;
  if ((c.sessions[AUTHCODE_SHA2] != null) && (c.sessions[AUTHCODE_SHA2].seedHex != null)) {
    return;
  }
  try {
    session = {};
    timestamp = (await startSessionExplicitly("authCodeSHA2", c));
    session.seedHex = (await generateSharedSecretSeed(timestamp, c));
    c.sessions[AUTHCODE_SHA2] = session;
  } catch (error) {
    err = error;
    message = `Could not establish an authCode with SHA2 session! Details: ${err.message}`;
    throw new Error(message);
  }
};

//endregion

//###########################################################
//region response Authentication
authenticateServiceSignature = async function(response, ourRequestId, ourServerId) {
  var err, requestId, responseString, serverId, signature, timestamp, verified;
  try {
    signature = response.auth.signature;
    timestamp = response.auth.timestamp;
    requestId = response.auth.requestId;
    serverId = response.auth.serverId;
    if (signature == null) {
      throw new Error("No Signature!");
    }
    if (timestamp == null) {
      throw new Error("No Timestamp!");
    }
    if (requestId == null) {
      throw new Error("No RequestId!");
    }
    if (serverId == null) {
      throw new Error("No ServerId!");
    }
    if (requestId !== ourRequestId) {
      throw new Error("RequestId Mismatch!");
    }
    if (serverId !== ourServerId) {
      throw new Error("ServerId Mismatch!");
    }
    validatableStamp.assertValidity(timestamp);
    response.auth.signature = "";
    responseString = JSON.stringify(response);
    verified = (await secUtl.verify(signature, serverId, responseString));
    if (!verified) {
      throw new Error("Invalid Signature!");
    }
  } catch (error) {
    err = error;
    throw new ResponseAuthError(err.message);
  }
};

authenticateServiceStatement = function(response, ourRequestId, ourServerId) {
  var err, requestId, serverId, timestamp;
  try {
    timestamp = response.auth.timestamp;
    requestId = response.auth.requestId;
    serverId = response.auth.serverId;
    if (timestamp == null) {
      throw new Error("No Timestamp!");
    }
    if (requestId == null) {
      throw new Error("No RequestId!");
    }
    if (serverId == null) {
      throw new Error("No ServerId!");
    }
    if (requestId !== ourRequestId) {
      throw new Error("RequestId Mismatch!");
    }
    if (serverId !== ourServerId) {
      throw new Error("ServerId Mismatch!");
    }
    validatableStamp.assertValidity(timestamp);
  } catch (error) {
    err = error;
    throw new ResponseAuthError(err.message);
  }
};

authenticateServiceAuthCodeSHA2 = async function(response, ourRequestId, ourServerId, c) {
  var authCode, err, requestId, responseAuthCode, responseString, serverId, session, timestamp;
  try {
    responseAuthCode = response.auth.responseAuthCode;
    timestamp = response.auth.timestamp;
    requestId = response.auth.requestId;
    serverId = response.auth.serverId;
    if (responseAuthCode == null) {
      throw new Error("No ResponseAuthCode!");
    }
    if (timestamp == null) {
      throw new Error("No Timestamp!");
    }
    if (requestId == null) {
      throw new Error("No RequestId!");
    }
    if (serverId == null) {
      throw new Error("No ServerId!");
    }
    if (requestId !== ourRequestId) {
      throw new Error("RequestId Mismatch!");
    }
    if (serverId !== ourServerId) {
      throw new Error("ServerId Mismatch!");
    }
    validatableStamp.assertValidity(timestamp);
    session = c.sessions[AUTHCODE_SHA2];
    if ((session == null) || (session.seedHex == null)) {
      throw new Error("Local session object has become invalid!");
    }
    response.auth.responseAuthCode = "";
    responseString = JSON.stringify(response);
    // log responseString
    authCode = (await sess.createAuthCode(session.seedHex, responseString));
    // olog { authCode, responseAuthCode }
    if (authCode !== responseAuthCode) {
      throw new Error("AuthCodes did not Match!");
    }
  } catch (error) {
    err = error;
    throw new ResponseAuthError(`authenticateServiceAuthCodeSHA2: ${err.message}`);
  }
};

//endregion

//endregion
