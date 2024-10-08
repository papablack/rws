import { TextLoader } from 'langchain/document_loaders/fs/text';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableConfig, Runnable } from '@langchain/core/runnables';
import VectorStoreService from '../../services/VectorStoreService';
import ConsoleService from '../../services/ConsoleService';
import RWSVectorStore, { VectorDocType } from '../convo/VectorStore';
import { Document } from 'langchain/document';
import { v4 as uuid } from 'uuid';
import getAppConfig from '../../services/AppConfigService';
import { BaseChain, ConversationChain } from 'langchain/chains';
import RWSPrompt, { IRWSPromptJSON, ILLMChunk } from '../prompts/_prompt';
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Error500 } from '../../errors';
import { ChainValues } from '@langchain/core/utils/types';

import xml2js from 'xml2js';
import fs from 'fs';
import path from 'path';

interface ISplitterParams {
    chunkSize: number
    chunkOverlap: number
    separators: string[]
}

const logConvo = (txt: string) => {
    ConsoleService.log(ConsoleService.color().blueBright(txt));
};

interface IBaseLangchainHyperParams {
    temperature: number;
    topK: number;
    topP: number;
    maxTokens: number;
}

interface IConvoDebugXMLData {
    conversation: {
        $: {
            id: string
            [key: string]: string
        },
        message: IRWSPromptJSON[]        
    }
}

interface IConvoDebugXMLOutput {
    xml: IConvoDebugXMLData,
    path: string
}

interface IChainCallOutput {
    text: string
}

interface IEmbeddingsHandler<T extends object> {
    generateEmbeddings: (text?: string) => Promise<T>
    storeEmbeddings: (embeddings: any, convoId: string) => Promise<void>
}

class ConvoLoader<LLMChat extends BaseChatModel> {
    private loader: TextLoader;
    private docSplitter: RecursiveCharacterTextSplitter;    

    private embeddings: IEmbeddingsHandler<any>;

    private docs: Document[] = [];
    private _initiated = false;
    private store: RWSVectorStore;
    private convo_id: string;    
    private llmChain: BaseChain;
    private llmChat: LLMChat;
    private chatConstructor: new (config: any) => LLMChat;
    private thePrompt: RWSPrompt;

    public _baseSplitterParams: ISplitterParams;
    
    constructor(chatConstructor: new (config: any) => LLMChat, embeddings: IEmbeddingsHandler<any>, convoId: string | null = null, baseSplitterParams: ISplitterParams = {
        chunkSize:400, chunkOverlap:80, separators: ['/n/n','.']
    }){
        this.embeddings = embeddings;
        
        if(convoId === null){
            this.convo_id = ConvoLoader.uuid();
        } else {
            this.convo_id = convoId;
        }                        

        this.chatConstructor = chatConstructor;    
        this._baseSplitterParams = baseSplitterParams;   
    }

    static uuid(): string
    {
        return uuid();
    }


    async splitDocs(filePath: Blob, params: ISplitterParams, callbackFunc: (docs: Document[]) => Promise<void>, splitCheck: boolean,loadedParts: () => Promise<string[]> = async () => [])
    {
        const splitDir = ConvoLoader.debugSplitDir(this.getId());

        if(splitCheck){
            try {
                ConsoleService.log(`Split for conversation "${this.convo_id}" doesn't exist. Splitting docs...`);
                this.loader = new TextLoader(filePath);

                this.docSplitter = new RecursiveCharacterTextSplitter({
                    chunkSize: params.chunkSize, // The size of the chunk that should be split.
                    chunkOverlap: params.chunkOverlap, // Adding overalap so that if a text is broken inbetween, next document may have part of the previous document 
                    separators: params.separators // In this case we are assuming that /n/n would mean one whole sentence. In case there is no nearing /n/n then "." will be used instead. This can be anything that helps derive a complete sentence .
                });

                fs.mkdirSync(splitDir, { recursive: true });
                
                const orgDocs = await this.loader.load();
                const splitDocs = await this.docSplitter.splitDocuments(orgDocs);                

                const avgCharCountPre = this.avgDocLength(orgDocs);
                const avgCharCountPost = this.avgDocLength(splitDocs);

                logConvo(`Average length among ${orgDocs.length} documents loaded is ${avgCharCountPre} characters.`);
                logConvo(`After the split we have ${splitDocs.length} documents more than the original ${orgDocs.length}.`);
                logConvo(`Average length among ${orgDocs.length} documents (after split) is ${avgCharCountPost} characters.`);

                this.docs = splitDocs;                                      

                await callbackFunc(this.docs);
            }catch(e: Error | unknown){
                fs.rmdirSync(splitDir);
                throw new Error500(e);
            }
        }else{           
            for(const txt of (await loadedParts())) {
                this.docs.push(new Document({ pageContent: txt }));              
            }
        }
        
        this.store = await VectorStoreService.createStore(this.docs, await this.embeddings.generateEmbeddings());
    }

    getId(): string {
        return this.convo_id;
    }

    getDocs(): VectorDocType
    {
        return this.docs;
    }
    getStore(): RWSVectorStore
    {
        return this.store;
    }

    isInitiated(): boolean 
    {
        return this._initiated;
    }

    setPrompt(prompt: RWSPrompt): ConvoLoader<LLMChat>
    {
        this.thePrompt = prompt;        

        this.llmChat = new this.chatConstructor({
            streaming: true,
            region: getAppConfig().get('aws_bedrock_region'),  
            credentials: {  
                accessKeyId: getAppConfig().get('aws_access_key'),  
                secretAccessKey: getAppConfig().get('aws_secret_key'),  
            },  
            model: 'anthropic.claude-v2',            
            maxTokens: prompt.getHyperParameter<number>('max_tokens_to_sample'),
            temperature: prompt.getHyperParameter<number>('temperature'),
            modelKwargs: {
                top_p: prompt.getHyperParameter<number>('top_p'),
                top_k: prompt.getHyperParameter<number>('top_k'),
            }
        });        

        return this;
    }

    getChat(): LLMChat
    {
        return this.llmChat;
    }

    private avgDocLength = (documents: Document[]): number => {
        return documents.reduce((sum, doc: Document) => sum + doc.pageContent.length, 0) / documents.length;
    };

    async call(values: ChainValues, cfg: Partial<RunnableConfig>, debugCallback: (debugData: IConvoDebugXMLData) => Promise<IConvoDebugXMLData> = null): Promise<RWSPrompt>
    {   
        const output = await (this.chain()).invoke(values, cfg) as IChainCallOutput;        
        this.thePrompt.listen(output.text);        

        await this.debugCall(debugCallback);

        return this.thePrompt;
    }

    async *callStreamGenerator(
        this: ConvoLoader<LLMChat>, 
        values: ChainValues, 
        cfg: Partial<RunnableConfig>,     
        debugCallback: (debugData: IConvoDebugXMLData) => Promise<IConvoDebugXMLData> = null
    ): AsyncGenerator<string>
    {           
        // const _self = this;
        // const chain = this.chain() as ConversationChain;  
        // ConsoleService.log('call stream');      
        // const stream = await chain.call(values, [{
        //         handleLLMNewToken(token: string) {
        //             yield token;
        //         }
        //     }
        // ]);
        
        // ConsoleService.log('got stream');



        // Listen to the stream and yield data chunks as they come
        // for await (const chunk of stream) {                  
        //     yield chunk.response;
        // }
    }   

    async callStream(values: ChainValues, callback: (streamChunk: ILLMChunk) => void, end: () => void = () => {}, cfg: Partial<RunnableConfig> = {}, debugCallback?: (debugData: IConvoDebugXMLData) => Promise<IConvoDebugXMLData>): Promise<RWSPrompt>
    {
        const _self = this;               

        await this.chain().invoke(values, { callbacks: [{
            handleLLMNewToken(token: string) {
                callback({
                    content: token,
                    status: 'rws_streaming'
                });

                _self.thePrompt.listen(token, true);
            }
        }
        ]});

        end();

        this.debugCall(debugCallback);

        return this.thePrompt;
    }

    async similaritySearch(query: string, splitCount: number): Promise<string>
    {
        ConsoleService.log('Store is ready. Searching for embedds...');            
        const texts = await this.getStore().getFaiss().similaritySearchWithScore(`${query}`, splitCount);
        ConsoleService.log('Found best parts: ' + texts.length);
        return texts.map(([doc, score]: [any, number]) => `${doc['pageContent']}`).join('\n\n');    
    }
    
    private async debugCall(debugCallback: (debugData: IConvoDebugXMLData) => Promise<IConvoDebugXMLData> = null)
    {
        try {
            // const debug = this.initDebugFile();

            // let callData: IConvoDebugXMLData = debug.xml;

            // callData.conversation.message.push(this.thePrompt.toJSON());

            // if(debugCallback){
            //     callData = await debugCallback(callData);
            // }

            // this.debugSave(callData);
        
        }catch(error: Error | unknown){
            ConsoleService.log(error);
        }
    }

    chain(): BaseChain
    {        
        if(this.llmChain){
            return this.llmChain;
        }

        if(!this.thePrompt){
            throw new Error500(new Error('No prompt initialized for conversation'), __filename);
        }        

        const chainParams: { prompt: PromptTemplate, values?: ChainValues } = {            
            prompt: this.thePrompt.getMultiTemplate()
        };      

        this.createChain(chainParams);

        return this.llmChain;
    }

    private async createChain(input: { prompt: PromptTemplate, values?: ChainValues }): Promise<BaseChain>
    {
        this.llmChain = new ConversationChain({
            llm: this.llmChat,
            prompt: input.prompt,              
        });

        return this.llmChain;
    }

    async waitForInit(): Promise<ConvoLoader<LLMChat> | null>
    {
        const _self = this;
        return new Promise((resolve, reject)=>{
            let i = 0;

            const interval: NodeJS.Timeout = setInterval(() => {
                if(this.isInitiated()){
                    clearInterval(interval);
                    resolve(_self);
                }

                if(i>9){
                    clearInterval(interval);
                    reject(null);
                }

                i++;
            }, 300);            
        });
    }  

    private parseXML(xml: string, callback: (err: Error, result: any) => void): xml2js.Parser
    {
        const parser = new xml2js.Parser();        

        parser.parseString(xml, callback);
        return parser;
    }

    static debugConvoDir(id: string){
        return path.resolve(process.cwd(), 'debug', 'conversations', id);
    }

    static debugSplitDir(id: string){
        return path.resolve(process.cwd(), 'debug', 'conversations', id, 'split');
    }
    
    public debugConvoFile(){
        return `${ConvoLoader.debugConvoDir(this.getId())}/conversation.xml`;
    }    

    public debugSplitFile(i: number){
        return `${ConvoLoader.debugSplitDir(this.getId())}/${i}.splitfile`;
    }    

    private initDebugFile(): IConvoDebugXMLOutput
    {
        let xmlContent: string;
        let debugXML: IConvoDebugXMLData = null;

        const convoDir = ConvoLoader.debugConvoDir(this.getId());

        if(!fs.existsSync(convoDir)){
            fs.mkdirSync(convoDir, { recursive: true });
        }

        const convoFilePath = this.debugConvoFile();

        if(!fs.existsSync(convoFilePath)){
            xmlContent = '<conversation id="conversation"></conversation>';

            fs.writeFileSync(convoFilePath, xmlContent);
        }else{
            xmlContent = fs.readFileSync(convoFilePath, 'utf-8');
        }

        this.parseXML(xmlContent, (error: Error, result) => {            
            debugXML = result;
        });

        if(!debugXML.conversation.message){
            debugXML.conversation.message = [];
        }

        return { xml: debugXML, path: convoFilePath };
    }

    private debugSave(xml: IConvoDebugXMLData): void
    {        
        const builder = new xml2js.Builder();
        fs.writeFileSync(this.debugConvoFile(), builder.buildObject(xml), 'utf-8');
    }

}

export default ConvoLoader;
export { IChainCallOutput, IConvoDebugXMLData, IEmbeddingsHandler, ISplitterParams, IBaseLangchainHyperParams };