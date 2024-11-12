import { writeFile } from 'fs/promises';
import { join } from 'path';

import pino from 'pino';
import WebSocket from 'ws';

import type {
  EditHistoryRequest,
  FolderName,
  HistoryResult,
  ImageContainer,
  ImageRef,
  ImagesResponse,
  ObjectInfoResponse,
  Prompt,
  PromptQueueResponse,
  QueuePromptResult,
  QueueResponse,
  // ResponseError,
  SystemStatsResponse,
  UploadImageResult,
  ViewMetadataResponse,
  ComfyUIClientOptions,
  Headers,
} from './types.js';

// TODO: Make logger customizable
const logger = pino({
  level: 'info',
});

export class ComfyUIClient {
  public serverAddress: string;
  public clientId: string;
  public options: ComfyUIClientOptions | undefined;

  protected ws?: WebSocket;

  constructor(serverAddress: string, clientId: string, options?: ComfyUIClientOptions) {
    this.serverAddress = serverAddress;
    this.clientId = clientId;
    this.options = options;
  }

  // Comfy URL
  curl(endpoint = ''): URL {
    const uri = new URL(this.serverAddress)
    const url = `${uri.protocol.startsWith('https') ? 'https' : 'http'}://${uri.host}${uri.pathname}${endpoint}${uri.search || ''}${uri.search ? '&' : '?'}clientId=${this.clientId}`;
    return new URL(url)
  }

  // Comfy fetch
  async cfetch(endpoint: string, requestMethod = 'GET', data?: any, noStringify = false) {
    const url = this.curl(endpoint)
    const method = data || requestMethod === 'POST' ? 'POST' : 'GET'
    const headers: Headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    const options = {
      method,
      headers,
      body: data
        ? noStringify
          ? data
          : JSON.stringify(data)
        : undefined,
    }
    if (this.options && this.options.basicAuth) {
      const basicToken = Buffer.from(`${this.options.basicAuth.user}:${this.options.basicAuth.password}`).toString('base64');
      options.headers.Authorization = `Basic ${basicToken}`
    }
    console.log('CFETCH options', options);
    const res = await fetch(url, options);
    if (res.status !== 200) {
      console.error('COMFY RESULT !== 200', res)
      return null
    }
    const json = await res.json();
    if (!json || 'error' in json) {
      logger.error('cfetch error', json)
      return null
    }
    return json;
  }

  connect() {
    return new Promise<void>(async (resolve) => {
      if (this.ws) {
        await this.disconnect();
      }
      // flag for promise been resolved
      let resolved = false;

      const url = this.curl()
      logger.info(`Connecting to url: ${url}`);

      const options = {
        perMessageDeflate: false,
        headers: {}
      };
      if (this.options && this.options.basicAuth) {
        const basicToken = Buffer.from(`${this.options.basicAuth.user}:${this.options.basicAuth.password}`).toString('base64');
        options.headers = {
          Authorization: `Basic ${basicToken}`,
        }
      }
      this.ws = new WebSocket(url, options);

      this.ws.on('open', () => {
        logger.info('Connection open');
        if (resolved) return;
        resolved = true;
        resolve();
      });

      this.ws.on('close', () => {
        logger.info('Connection closed');
        if (resolved) return;
        resolved = true;
        resolve();
      });

      this.ws.on('error', (err) => {
        logger.error({ err }, 'WebSockets error');
        if (resolved) return;
        resolved = true;
        resolve();
      });

      this.ws.on('message', (data, isBinary) => {
        if (isBinary) {
          logger.debug('Received binary data');
        } else {
          logger.debug('Received data: %s', data.toString());
        }
      });
    });
  }

  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  async getEmbeddings(): Promise<string[]> {
    return this.cfetch('embeddings')
  }

  async getExtensions(): Promise<string[]> {
    return this.cfetch('extensions')
  }

  async queuePrompt(prompt: Prompt): Promise<QueuePromptResult> {
    return this.cfetch('prompt', 'POST', {
      prompt,
      client_id: this.clientId,
    })
  }

  async interrupt(): Promise<void> {
    return this.cfetch('interrupt', 'POST')
  }

  async editHistory(params: EditHistoryRequest): Promise<void> {
    return this.cfetch('history', 'POST', params)
  }

  async uploadImage(
    image: Buffer,
    filename: string,
    overwrite?: boolean,
  ): Promise<UploadImageResult> {
    const formData = new FormData();
    formData.append('image', new Blob([image]), filename);

    if (overwrite !== undefined) {
      formData.append('overwrite', overwrite.toString());
    }
    return this.cfetch('upload/image', 'POST', formData, true)
  }

  async uploadMask(
    image: Buffer,
    filename: string,
    originalRef: ImageRef,
    overwrite?: boolean,
  ): Promise<UploadImageResult> {
    const formData = new FormData();
    formData.append('image', new Blob([image]), filename);
    formData.append('originalRef', JSON.stringify(originalRef));

    if (overwrite !== undefined) {
      formData.append('overwrite', overwrite.toString());
    }

    return this.cfetch('upload/mask', 'POST', formData, true)
  }

  async getImage(
    filename: string,
    subfolder: string,
    type: string,
  ): Promise<Blob> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type,
    })
    const url = this.curl(`view`) + '&' + params.toString()
    const res = await this.cfetch(url);

    const blob = await res.blob();
    return blob;
  }

  async viewMetadata(folderName: FolderName, filename: string,): Promise<ViewMetadataResponse> {
    const url = this.curl(`view_metadata/${folderName}`) + (filename ? `&filename=${filename}` : '')
    return this.cfetch(url)
  }

  async getSystemStats(): Promise<SystemStatsResponse> {
    return this.cfetch('system_start')
  }

  async getPrompt(): Promise<PromptQueueResponse> {
    return this.cfetch('prompt')
  }

  async getObjectInfo(nodeClass?: string): Promise<ObjectInfoResponse> {
    const endpoint = `object_info${nodeClass ? '/' + nodeClass : ''} : ''`;
    return this.cfetch(endpoint);
  }


  async getHistory(promptId?: string): Promise<HistoryResult> {
    return this.cfetch(`history` + (promptId ? `/${promptId}` : ""));
  }

  async getQueue(): Promise<QueueResponse> {
    return this.cfetch(`queue`)
  }

  async saveImages(response: ImagesResponse, outputDir: string) {
    for (const nodeId of Object.keys(response)) {
      for (const img of response[nodeId]) {
        const arrayBuffer = await img.blob.arrayBuffer();

        const outputPath = join(outputDir, img.image.filename);
        await writeFile(outputPath, Buffer.from(arrayBuffer));
      }
    }
  }

  async getImages(prompt: Prompt): Promise<ImagesResponse> {
    if (!this.ws) {
      throw new Error(
        'WebSocket client is not connected. Please call connect() before interacting.',
      );
    }

    const queue = await this.queuePrompt(prompt);
    const promptId = queue.prompt_id;

    return new Promise<ImagesResponse>((resolve, reject) => {
      const outputImages: ImagesResponse = {};

      const onMessage = async (data: WebSocket.RawData, isBinary: boolean) => {
        // Previews are binary data
        if (isBinary) {
          return;
        }

        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'executing') {
            const messageData = message.data;
            if (!messageData.node) {
              const donePromptId = messageData.prompt_id;

              logger.info(`Done executing prompt (ID: ${donePromptId})`);

              // Execution is done
              if (messageData.prompt_id === promptId) {
                // Get history
                const historyRes = await this.getHistory(promptId);
                const history = historyRes[promptId];

                // Populate output images
                for (const nodeId of Object.keys(history.outputs)) {
                  const nodeOutput = history.outputs[nodeId];
                  if (nodeOutput.images) {
                    const imagesOutput: ImageContainer[] = [];
                    for (const image of nodeOutput.images) {
                      const blob = await this.getImage(
                        image.filename,
                        image.subfolder,
                        image.type,
                      );
                      imagesOutput.push({
                        blob,
                        image,
                      });
                    }

                    outputImages[nodeId] = imagesOutput;
                  }
                }

                // Remove listener
                this.ws?.off('message', onMessage);
                return resolve(outputImages);
              }
            }
          }
        } catch (err) {
          return reject(err);
        }
      };

      // Add listener
      this.ws?.on('message', onMessage);
    });
  }
}
