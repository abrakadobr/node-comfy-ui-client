import WebSocket from 'ws';

interface NodeInfo {
    class_type: string;
    inputs: {
        [key: string]: any;
    };
}
interface Prompt {
    [nodeId: string]: {
        inputs: Record<string, any>;
        class_type: string;
    };
}
interface ComfyUIError {
    type: string;
    message: string;
    details: string;
    extra_info: any;
}
interface QueuePromptResult {
    prompt_id: string;
    number: number;
    node_errors: Record<string, ComfyUIError>;
}
interface UploadImageResult {
    name: string;
    subfolder: string;
    type: string;
}
interface ImageRef {
    filename: string;
    subfolder?: string;
    type?: string;
}
interface EditHistoryRequest {
    clear?: boolean;
    delete?: string[];
}
interface PromptHistory {
    prompt: any[];
    outputs: Record<string, any>;
}
interface HistoryResult {
    [clientId: string]: PromptHistory;
}
interface OutputImage {
    filename: string;
    subfolder: string;
    type: string;
}
interface ImageContainer {
    blob: Blob;
    image: OutputImage;
}
interface ImagesResponse {
    [nodeId: string]: ImageContainer[];
}
interface DeviceStats {
    name: string;
    type: string;
    index: number;
    vram_total: number;
    vram_free: number;
    torch_vram_total: number;
    torch_vram_free: number;
}
interface SystemStatsResponse {
    devices: DeviceStats[];
}
interface ViewMetadataResponse {
    [key: string]: any;
}
type QueueDataPrimitives = number | string | object;
type QueueData = QueueDataPrimitives | Array<QueueDataPrimitives>;
interface QueueResponse {
    queue_running: QueueData[];
    queue_pending: QueueData[];
}
interface ExecInfo {
    queue_remaining: number;
}
interface PromptQueueResponse {
    exec_info: ExecInfo;
}
interface ObjectInfo {
    input: {
        [key: string]: any;
    };
    output: string[];
    output_is_list: boolean[];
    output_name: string[];
    name: string;
    display_name: string;
    description: string;
    category: string;
    output_node: boolean;
}
interface ObjectInfoResponse {
    [nodeClass: string]: ObjectInfo;
}
interface ResponseError {
    error: string | ComfyUIError;
    node_errors: Record<string, ComfyUIError>;
}
type FolderName = 'checkpoints' | 'configs' | 'loras' | 'vae' | 'clip' | 'unet' | 'clip_vision' | 'style_models' | 'embeddings' | 'diffusers' | 'vae_approx' | 'controlnet' | 'gligen' | 'upscale_models' | 'custom_nodes' | 'hypernetworks';

declare class ComfyUIClient {
    serverAddress: string;
    clientId: string;
    protected ws?: WebSocket;
    constructor(serverAddress: string, clientId: string);
    curl(endpoint: string): URL;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getEmbeddings(): Promise<string[]>;
    getExtensions(): Promise<string[]>;
    queuePrompt(prompt: Prompt): Promise<QueuePromptResult>;
    interrupt(): Promise<void>;
    editHistory(params: EditHistoryRequest): Promise<void>;
    uploadImage(image: Buffer, filename: string, overwrite?: boolean): Promise<UploadImageResult>;
    uploadMask(image: Buffer, filename: string, originalRef: ImageRef, overwrite?: boolean): Promise<UploadImageResult>;
    getImage(filename: string, subfolder: string, type: string): Promise<Blob>;
    viewMetadata(folderName: FolderName, filename: string): Promise<ViewMetadataResponse>;
    getSystemStats(): Promise<SystemStatsResponse>;
    getPrompt(): Promise<PromptQueueResponse>;
    getObjectInfo(nodeClass?: string): Promise<ObjectInfoResponse>;
    getHistory(promptId?: string): Promise<HistoryResult>;
    getQueue(): Promise<QueueResponse>;
    saveImages(response: ImagesResponse, outputDir: string): Promise<void>;
    getImages(prompt: Prompt): Promise<ImagesResponse>;
}

export { ComfyUIClient, ComfyUIError, DeviceStats, EditHistoryRequest, ExecInfo, FolderName, HistoryResult, ImageContainer, ImageRef, ImagesResponse, NodeInfo, ObjectInfo, ObjectInfoResponse, OutputImage, Prompt, PromptHistory, PromptQueueResponse, QueueData, QueueDataPrimitives, QueuePromptResult, QueueResponse, ResponseError, SystemStatsResponse, UploadImageResult, ViewMetadataResponse };
