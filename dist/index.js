"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  ComfyUIClient: () => ComfyUIClient
});
module.exports = __toCommonJS(src_exports);

// src/client.ts
var import_promises = require("fs/promises");
var import_path = require("path");
var import_pino = __toESM(require("pino"));
var import_ws = __toESM(require("ws"));
var logger = (0, import_pino.default)({
  level: "info"
});
var ComfyUIClient = class {
  serverAddress;
  clientId;
  options;
  ws;
  constructor(serverAddress, clientId, options) {
    this.serverAddress = serverAddress;
    this.clientId = clientId;
    this.options = options;
  }
  // Comfy URL
  curl(endpoint = "") {
    const uri = new URL(this.serverAddress);
    const url = `${uri.protocol.startsWith("https") ? "https" : "http"}://${uri.host}${uri.pathname}${endpoint}${uri.search || ""}${uri.search ? "&" : "?"}clientId=${this.clientId}`;
    return new URL(url);
  }
  // Comfy fetch
  async cfetch(endpoint, requestMethod = "GET", data, noStringify = false) {
    const url = this.curl(endpoint);
    const method = data || requestMethod === "POST" ? "POST" : "GET";
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    const options = {
      method,
      headers,
      body: data ? noStringify ? data : JSON.stringify(data) : void 0
    };
    if (this.options && this.options.basicAuth) {
      const basicToken = Buffer.from(`${this.options.basicAuth.user}:${this.options.basicAuth.password}`).toString("base64");
      options.headers.Authorization = `Basic ${basicToken}`;
    }
    console.log("CFETCH options", options);
    const res = await fetch(url, options);
    if (res.status !== 200) {
      console.error("COMFY RESULT !== 200", res);
      return null;
    }
    const json = await res.json();
    if (!json || "error" in json) {
      logger.error("cfetch error", json);
      return null;
    }
    return json;
  }
  connect() {
    return new Promise(async (resolve) => {
      if (this.ws) {
        await this.disconnect();
      }
      let resolved = false;
      const url = this.curl();
      logger.info(`Connecting to url: ${url}`);
      const options = {
        perMessageDeflate: false,
        headers: {}
      };
      if (this.options && this.options.basicAuth) {
        const basicToken = Buffer.from(`${this.options.basicAuth.user}:${this.options.basicAuth.password}`).toString("base64");
        options.headers = {
          Authorization: `Basic ${basicToken}`
        };
      }
      this.ws = new import_ws.default(url, options);
      this.ws.on("open", () => {
        logger.info("Connection open");
        if (resolved)
          return;
        resolved = true;
        resolve();
      });
      this.ws.on("close", () => {
        logger.info("Connection closed");
        if (resolved)
          return;
        resolved = true;
        resolve();
      });
      this.ws.on("error", (err) => {
        logger.error({ err }, "WebSockets error");
        if (resolved)
          return;
        resolved = true;
        resolve();
      });
      this.ws.on("message", (data, isBinary) => {
        if (isBinary) {
          logger.debug("Received binary data");
        } else {
          logger.debug("Received data: %s", data.toString());
        }
      });
    });
  }
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = void 0;
    }
  }
  async getEmbeddings() {
    return this.cfetch("embeddings");
  }
  async getExtensions() {
    return this.cfetch("extensions");
  }
  async queuePrompt(prompt) {
    return this.cfetch("prompt", "POST", {
      prompt,
      client_id: this.clientId
    });
  }
  async interrupt() {
    return this.cfetch("interrupt", "POST");
  }
  async editHistory(params) {
    return this.cfetch("history", "POST", params);
  }
  async uploadImage(image, filename, overwrite) {
    const formData = new FormData();
    formData.append("image", new Blob([image]), filename);
    if (overwrite !== void 0) {
      formData.append("overwrite", overwrite.toString());
    }
    return this.cfetch("upload/image", "POST", formData, true);
  }
  async uploadMask(image, filename, originalRef, overwrite) {
    const formData = new FormData();
    formData.append("image", new Blob([image]), filename);
    formData.append("originalRef", JSON.stringify(originalRef));
    if (overwrite !== void 0) {
      formData.append("overwrite", overwrite.toString());
    }
    return this.cfetch("upload/mask", "POST", formData, true);
  }
  async getImage(filename, subfolder, type) {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type
    });
    const url = this.curl(`view`) + "&" + params.toString();
    const res = await this.cfetch(url);
    const blob = await res.blob();
    return blob;
  }
  async viewMetadata(folderName, filename) {
    const url = this.curl(`view_metadata/${folderName}`) + (filename ? `&filename=${filename}` : "");
    return this.cfetch(url);
  }
  async getSystemStats() {
    return this.cfetch("system_start");
  }
  async getPrompt() {
    return this.cfetch("prompt");
  }
  async getObjectInfo(nodeClass) {
    const endpoint = `object_info${nodeClass ? "/" + nodeClass : ""} : ''`;
    return this.cfetch(endpoint);
  }
  async getHistory(promptId) {
    return this.cfetch(`history` + (promptId ? `/${promptId}` : ""));
  }
  async getQueue() {
    return this.cfetch(`queue`);
  }
  async saveImages(response, outputDir) {
    for (const nodeId of Object.keys(response)) {
      for (const img of response[nodeId]) {
        const arrayBuffer = await img.blob.arrayBuffer();
        const outputPath = (0, import_path.join)(outputDir, img.image.filename);
        await (0, import_promises.writeFile)(outputPath, Buffer.from(arrayBuffer));
      }
    }
  }
  async getImages(prompt) {
    if (!this.ws) {
      throw new Error(
        "WebSocket client is not connected. Please call connect() before interacting."
      );
    }
    const queue = await this.queuePrompt(prompt);
    const promptId = queue.prompt_id;
    return new Promise((resolve, reject) => {
      const outputImages = {};
      const onMessage = async (data, isBinary) => {
        if (isBinary) {
          return;
        }
        try {
          const message = JSON.parse(data.toString());
          if (message.type === "executing") {
            const messageData = message.data;
            if (!messageData.node) {
              const donePromptId = messageData.prompt_id;
              logger.info(`Done executing prompt (ID: ${donePromptId})`);
              if (messageData.prompt_id === promptId) {
                const historyRes = await this.getHistory(promptId);
                const history = historyRes[promptId];
                for (const nodeId of Object.keys(history.outputs)) {
                  const nodeOutput = history.outputs[nodeId];
                  if (nodeOutput.images) {
                    const imagesOutput = [];
                    for (const image of nodeOutput.images) {
                      const blob = await this.getImage(
                        image.filename,
                        image.subfolder,
                        image.type
                      );
                      imagesOutput.push({
                        blob,
                        image
                      });
                    }
                    outputImages[nodeId] = imagesOutput;
                  }
                }
                this.ws?.off("message", onMessage);
                return resolve(outputImages);
              }
            }
          }
        } catch (err) {
          return reject(err);
        }
      };
      this.ws?.on("message", onMessage);
    });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ComfyUIClient
});
