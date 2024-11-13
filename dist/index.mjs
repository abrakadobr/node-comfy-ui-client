// src/client.ts
import { writeFile } from "fs/promises";
import { join } from "path";
import pino from "pino";
import WebSocket from "ws";
var logger = pino({
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
    const url = `${this.options?.secure ? "https" : "http"}://${this.serverAddress}/${endpoint}?clientId=${this.clientId}`;
    return new URL(url);
  }
  // Comfy fetch
  async cfetch(endpoint, params = {
    method: "GET",
    json: true
  }) {
    const url = this.curl(endpoint);
    if (params.searchParams)
      url.search = params.searchParams.toString();
    const method = params.data || params.method === "POST" ? "POST" : "GET";
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    const options = {
      method,
      headers,
      body: params.data || void 0
    };
    if (this.options && this.options.basicAuth) {
      const basicToken = Buffer.from(`${this.options.basicAuth.user}:${this.options.basicAuth.password}`).toString("base64");
      options.headers.Authorization = `Basic ${basicToken}`;
    }
    const res = await fetch(url, options);
    if (res.status !== 200) {
      console.error("COMFY RESULT !== 200", res);
      return null;
    }
    if (params.json) {
      const json = await res.json();
      if (!json || "error" in json) {
        logger.error("cfetch error", json);
        return null;
      }
      return json;
    }
    if (params.blob) {
      const blob = await res.blob();
      return blob;
    }
    return null;
  }
  connect() {
    return new Promise(async (resolve) => {
      if (this.ws) {
        await this.disconnect();
      }
      let resolved = false;
      const url = `${this.options?.secure ? "wss" : "ws"}://${this.serverAddress}/ws?clientId=${this.clientId}`;
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
      this.ws = new WebSocket(url, options);
      this.ws.on("open", () => {
        if (resolved)
          return;
        resolved = true;
        resolve();
      });
      this.ws.on("close", () => {
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
    return this.cfetch("prompt", {
      method: "POST",
      data: JSON.stringify({
        prompt,
        client_id: this.clientId
      }),
      json: true
    });
  }
  async interrupt() {
    return this.cfetch("interrupt", { method: "POST" });
  }
  async editHistory(params) {
    return this.cfetch("history", { method: "POST", data: JSON.stringify(params) });
  }
  async uploadImage(image, filename, overwrite) {
    const formData = new FormData();
    formData.append("image", new Blob([image]), filename);
    if (overwrite !== void 0) {
      formData.append("overwrite", overwrite.toString());
    }
    return this.cfetch("upload/image", {
      method: "POST",
      data: formData,
      json: true
    });
  }
  async uploadMask(image, filename, originalRef, overwrite) {
    const formData = new FormData();
    formData.append("image", new Blob([image]), filename);
    formData.append("originalRef", JSON.stringify(originalRef));
    if (overwrite !== void 0) {
      formData.append("overwrite", overwrite.toString());
    }
    return this.cfetch("upload/mask", {
      method: "POST",
      data: formData,
      json: true
    });
  }
  async getImage(filename, subfolder, type) {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type
    });
    const blob = await this.cfetch("view", {
      method: "GET",
      searchParams: params,
      json: false,
      blob: true
    });
    return blob;
  }
  async viewMetadata(folderName, filename) {
    const searchParams = new URLSearchParams({ filename });
    return this.cfetch(`view_metadata/${folderName}`, {
      method: "GET",
      searchParams,
      json: true
    });
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
    for (const nodeId of Object.keys(response || {})) {
      for (const img of response[nodeId]) {
        const arrayBuffer = await img.blob.arrayBuffer();
        const outputPath = join(outputDir, img.image.filename);
        await writeFile(outputPath, Buffer.from(arrayBuffer));
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
    if (!queue)
      return {};
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
export {
  ComfyUIClient
};
