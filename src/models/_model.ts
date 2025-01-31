import { Error500, RWSError } from '../errors';
import { Inject, Injectable, ExecutionContext, createParamDecorator } from '@nestjs/common';
import {DBService} from '../services/DBService';
import { RWSConfigService, RWSModel } from '../index';

import TrackType, {IMetaOpts} from './decorators/TrackType';
import { InjectServices } from '../../nest/decorators/InjectServices';
import { FieldsHelper } from '../helpers/FieldsHelper';
import { FindByType } from './types/FindParams';

interface IModel{
    [key: string]: any;
    id: string | null;
    save: () => void;
    getCollection: () => string | null;
    configService?: RWSConfigService;
    dbService?: DBService;
}

type RelationBindType = {
    connect: { id: string }
};

type RelOneMetaType<T extends Model<T>> = {[key: string]: {required: boolean, key?: string, model: OpModelType<T>, hydrationField: string, foreignKey: string}};
type RelManyMetaType<T extends Model<T>> = {[key: string]: {key: string, inversionModel: OpModelType<T>, foreignKey: string}};

export interface OpModelType<ChildClass> {
    new(data?: any | null): ChildClass;
    name: string 
    _collection: string;
    _RELATIONS: {[key: string]: boolean}
    _CUT_KEYS: string[]
    loadModels: () => Model<any>[];
    checkForInclusionWithThrow: (className: string) => void;
    checkForInclusion: (className: string) => boolean;
    configService?: RWSConfigService;
    dbService?: DBService;
    findOneBy<T extends Model<T>>(
        this: OpModelType<T>,
        findParams: FindByType
    ): Promise<T | null>;
    find<T extends Model<T>>(
        this: OpModelType<T>,
        id: string,        
        findParams?: Omit<FindByType, 'conditions'>
    ): Promise<T | null>;
    findBy<T extends Model<T>>(
        this: OpModelType<T>,    
        findParams: FindByType
    ): Promise<T[]>;
    delete<ChildClass extends Model<ChildClass>>(
        this: OpModelType<ChildClass>,
        conditions: any
    ): Promise<void>
    create<T extends Model<T>>(this: OpModelType<T>, data: T): Promise<T>;
    getRelationOneMeta(model: any, classFields: string[]): Promise<RelOneMetaType<Model<any>>>;
    getRelationManyMeta(model: any, classFields: string[]): Promise<RelManyMetaType<Model<any>>>;
}

@InjectServices()
class Model<ChildClass> implements IModel{
    configService: RWSConfigService
    dbService: DBService

    static configService: RWSConfigService;
    static dbService: DBService

    [key: string]: any;
    @TrackType(String)
    id: string;
    static _collection: string = null;
    static _RELATIONS = {};
    static _BANNED_KEYS = ['_collection'];

    static _CUT_KEYS: string[] = [];

    constructor(data: any) {    
        if(!this.getCollection()){
            throw new Error('Model must have a collection defined');
        
        }

        this.dbService = Model.dbService;
        this.configService = Model.configService;

        if(!data){
            return;    
        }          
  
        if(!this.hasTimeSeries()){
            this._fill(data);
        }else{
            throw new Error('Time Series not supported in synchronous constructor. Use `await Model.create(data)` static method to instantiate this model.');
        }
    }    
    
    checkForInclusionWithThrow(): void
    {
        this.checkForInclusionWithThrow()
    }

    static checkForInclusionWithThrow(this: OpModelType<any>, checkModelType: string): void
    {
        if(!this.checkForInclusion(this.name)){
            throw new Error500(new Error('Model undefined: ' + this.name), this.name);
        }
    }

    checkForInclusion(): boolean    
    {                
        return this.checkForInclusion();        
    }

    static checkForInclusion(this: OpModelType<any>, checkModelType: string): boolean
    {        
        return this.loadModels().find((definedModel: Model<any>) => {
            return definedModel.name === checkModelType
        }) !== undefined
    }

    protected _fill(data: any): Model<ChildClass>{
        for (const key in data) {
            if (data.hasOwnProperty(key)) {   
              
                const meta = Reflect.getMetadata(`InverseTimeSeries:${key}`, (this as any).constructor.prototype);
          
                if(meta){
                    data[key] = {
                        create: data[key]
                    };
                }else{
                    this[key] = data[key];
                }                          
            }
        }       
        
        return this;
    }

    protected hasRelation(key: string): boolean
    {
        return !!this[key] && this[key] instanceof Model;
    }

    protected bindRelation(key: string, relatedModel: Model<any>): RelationBindType
    {        
        return {
            connect: {
                id: relatedModel.id
            }
        };
    }

    public async _asyncFill(data: any, fullDataMode = false, allowRelations = true): Promise<ChildClass> {
        const collections_to_models: {[key: string]: any} = {};           
        const timeSeriesIds = this.getTimeSeriesModelFields();
    
        const classFields = FieldsHelper.getAllClassFields(this.constructor);        
    
        // Get both relation metadata types asynchronously
        const [relOneData, relManyData] = await Promise.all([
            this.getRelationOneMeta(classFields),
            this.getRelationManyMeta(classFields)
        ]);        
    
        this.loadModels().forEach((model) => {
            collections_to_models[model.getCollection()] = model;      
        });      
    
        const seriesHydrationfields: string[] = []; 
        
        if (allowRelations) {
            // Handle many-to-many relations
            for (const key in relManyData) { 
                if(!fullDataMode && (this as any).constructor._CUT_KEYS.includes(key)){
                    continue;
                }

                const relMeta = relManyData[key];  
        
                const relationEnabled = this.checkRelEnabled(relMeta.key);
                if (relationEnabled) {                                
                    this[relMeta.key] = await relMeta.inversionModel.findBy({
                        conditions: {
                            [relMeta.foreignKey]: data.id
                        },
                        allowRelations: false
                    });    
                }                                
            }
            
            // Handle one-to-one relations
            for (const key in relOneData) {      
                if(!fullDataMode && (this as any).constructor._CUT_KEYS.includes(key)){
                    continue;
                }

                const relMeta = relOneData[key];          
                const relationEnabled = this.checkRelEnabled(relMeta.key);
                
                if(!data[relMeta.hydrationField] && relMeta.required){
                    throw new Error(`Relation field "${relMeta.hydrationField}" is required in model ${this.constructor.name}.`)
                }
                
                if (relationEnabled && data[relMeta.hydrationField]) {        
                    this[relMeta.key] = await relMeta.model.find(data[relMeta.hydrationField], { allowRelations: false });    
                }                                
                else if(relationEnabled && !data[relMeta.hydrationField] && data[relMeta.key]){                    
                    const newRelModel: RWSModel<any> = await relMeta.model.create(data[relMeta.key]);                    
                    this[relMeta.key] = await newRelModel.save();
                }

                const cutKeys = ((this.constructor as any)._CUT_KEYS as string[]);

                if(!cutKeys.includes(relMeta.hydrationField)){
                    cutKeys.push(relMeta.hydrationField)
                }
            }
        }
    
        // Process regular fields and time series
        for (const key in data) {
            if (data.hasOwnProperty(key)) {                        
                if(!fullDataMode && (this as any).constructor._CUT_KEYS.includes(key)){
                    continue;
                }

                if (Object.keys(relOneData).includes(key)) {               
                    continue;
                }                
    
                if (seriesHydrationfields.includes(key)) {
                    continue;
                }                    
    
                const timeSeriesMetaData = timeSeriesIds[key];  
          
                if (timeSeriesMetaData) {
                    this[key] = data[key];
                    const seriesModel = collections_to_models[timeSeriesMetaData.collection];
            
                    const dataModels = await seriesModel.findBy({
                        id: { in: data[key] }
                    });                        
    
                    seriesHydrationfields.push(timeSeriesMetaData.hydrationField);
            
                    this[timeSeriesMetaData.hydrationField] = dataModels;
                } else {
                    this[key] = data[key];            
                }        
            }       
        }     
    
        return this as any as ChildClass;
    }    

    private getModelScalarFields(model: OpModelType<any>): string[]
    {
        return FieldsHelper.getAllClassFields(model)
                    .filter(item => item.indexOf('TrackType') === 0)
                    .map(item => item.split(':').at(-1))
    }

    private getTimeSeriesModelFields()
    {
        const timeSeriesIds: {[key: string]: {collection: string, hydrationField: string, ids: string[]}} = {};

        for (const key in this as any) {
            if (this.hasOwnProperty(key)) {             
          
                const meta = Reflect.getMetadata(`InverseTimeSeries:${key}`, (this as any));            
                if(meta){
                    if(!timeSeriesIds[key]){
                        timeSeriesIds[key] = {
                            collection: meta.timeSeriesModel,
                            hydrationField: meta.hydrationField,
                            ids: this[key]
                        };
                    }
                }                         
            }
        } 

        return timeSeriesIds;
    }
    
    private async getRelationOneMeta(classFields: string[]): Promise<RelOneMetaType<Model<any>>> {
        return Model.getRelationOneMeta(this, classFields);
    }

    static async getRelationOneMeta(model: any, classFields: string[]): Promise<RelOneMetaType<Model<any>>>
    {
        const relIds: RelOneMetaType<Model<any>> = {};
        const relationFields = classFields
            .filter((item: string) => item.indexOf('Relation') === 0 && !item.includes('Inverse'))
            .map((item: string) => item.split(':').at(-1));        
    
        for (const key of relationFields) {  
            const metadataKey = `Relation:${key}`;
            const metadata = Reflect.getMetadata(metadataKey, model);                 
            
            if (metadata && metadata.promise) {
                const resolvedMetadata = await metadata.promise;
                if (!relIds[key]) {
                    relIds[key] = {
                        key: resolvedMetadata.key,
                        required: resolvedMetadata.required,
                        model: resolvedMetadata.relatedTo,
                        hydrationField: resolvedMetadata.relationField,
                        foreignKey: resolvedMetadata.relatedToField
                    };
                }
            }                         
        } 
    
        return relIds;
    }    

    private async getRelationManyMeta(classFields: string[]): Promise<RelManyMetaType<Model<any>>> {
        return Model.getRelationManyMeta(this, classFields);
    }

    static async getRelationManyMeta(model: any, classFields: string[]): Promise<RelManyMetaType<Model<any>>> 
    {
        const relIds: RelManyMetaType<Model<any>> = {};
    
        const inverseFields = classFields
            .filter((item: string) => item.indexOf('InverseRelation') === 0)
            .map((item: string) => item.split(':').at(-1));
                
        for (const key of inverseFields) {          
            const metadataKey = `InverseRelation:${key}`;
            const metadata = Reflect.getMetadata(metadataKey, model);                            
    
            if (metadata && metadata.promise) {
                const resolvedMetadata = await metadata.promise;
                if (!relIds[key]) {
                    relIds[key] = {       
                        key: resolvedMetadata.key,         
                        inversionModel: resolvedMetadata.inversionModel,
                        foreignKey: resolvedMetadata.foreignKey                   
                    };
                }
            }                         
        } 
    
        return relIds;
    }

    public async toMongo(): Promise<any> {
        const data: any = {};
        const timeSeriesIds = this.getTimeSeriesModelFields();
        const timeSeriesHydrationFields: string[] = [];
      
        for (const key in (this as any)) { 
            if (this.hasRelation(key)) {                
                data[key] = this.bindRelation(key, this[key]);                
                continue;
            }
    
            if (!(await this.isDbVariable(key))) {
                continue;
            } 
    
            const passedFieldCondition: boolean = this.hasOwnProperty(key) && 
                !((this as any).constructor._BANNED_KEYS 
                    || Model._BANNED_KEYS
                ).includes(key) && 
                !timeSeriesHydrationFields.includes(key)
            ;
    
            if (passedFieldCondition) {                      
                data[key] = this[key];
            }
    
            if (timeSeriesIds[key]) {
                data[key] = this[key];
                timeSeriesHydrationFields.push(timeSeriesIds[key].hydrationField);              
            }
        }                
    
        return data;
    }  

    getCollection(): string | null {
        return (this as any).constructor._collection || this._collection;
    }

    static getCollection(): string | null {
        return (this as any).constructor._collection || this._collection;
    }


    async save(): Promise<this> {
        const data = await this.toMongo();
        let updatedModelData = data;         
        if (this.id) {
            this.preUpdate();

            updatedModelData = await this.dbService.update(data, this.getCollection());

            await this._asyncFill(updatedModelData);
            this.postUpdate();
        } else {
            this.preCreate();      
      
            const timeSeriesModel = await import('./types/TimeSeriesModel');      
            const isTimeSeries = this instanceof timeSeriesModel.default;

            updatedModelData = await this.dbService.insert(data, this.getCollection(), isTimeSeries);      

            await this._asyncFill(updatedModelData);   

            this.postCreate();
        }
  
        return this;
    }

    static async getModelAnnotations<T extends unknown>(constructor: new () => T): Promise<Record<string, {annotationType: string, metadata: any}>> {    
        const annotationsData: Record<string, {annotationType: string, metadata: any}> = {};
    
        const metadataKeys = Reflect.getMetadataKeys(constructor.prototype);
        
        // Process all metadata keys and collect promises
        const metadataPromises = metadataKeys.map(async (fullKey: string) => {
            const [annotationType, propertyKey] = fullKey.split(':');
            const metadata = Reflect.getMetadata(fullKey, constructor.prototype);
    
            if (metadata) {
                // If this is a relation metadata with a promise
                if (metadata.promise && (annotationType === 'Relation' || annotationType === 'InverseRelation')) {
                    const resolvedMetadata = await metadata.promise;
                    annotationsData[propertyKey] = {
                        annotationType,
                        metadata: resolvedMetadata
                    };
                } else {
                    // Handle non-relation metadata as before
                    const key = metadata.key || propertyKey;
                    annotationsData[key] = {
                        annotationType,
                        metadata
                    };
                }
            }
        });
    
        // Wait for all metadata to be processed
        await Promise.all(metadataPromises);
        
        return annotationsData;
    }

    public preUpdate(): void
    {
        return;
    }

    public postUpdate(): void
    {
        return;
    }

    public preCreate(): void
    {
        return;
    }

    public postCreate(): void
    {
        return;
    }

    public static isSubclass<T extends Model<T>, C extends new () => T>(constructor: C, baseClass: new () => T): boolean {
        return baseClass.prototype.isPrototypeOf(constructor.prototype);
    }

    hasTimeSeries(): boolean 
    {
        return Model.checkTimeSeries((this as any).constructor);
    }

    static checkTimeSeries(constructor: any): boolean
    {            
        const data = constructor.prototype as any;

        for (const key in data) {

            if (data.hasOwnProperty(key)) {   

                if(Reflect.getMetadata(`InverseTimeSeries:${key}`, constructor.prototype)){
                    return true;
                }
            }
        }

        return false;
    }

    async isDbVariable(variable: string): Promise<boolean> 
    {
        return Model.checkDbVariable((this as any).constructor, variable);
    }

    static async checkDbVariable(constructor: any, variable: string): Promise<boolean> {                   
        if(variable === 'id'){
            return true;
        }
        
        const dbAnnotations = await Model.getModelAnnotations(constructor);
        type AnnotationType = { annotationType: string, key: string };
    
        const dbProperties: string[] = Object.keys(dbAnnotations)
            .map((key: string): AnnotationType => {return {...dbAnnotations[key], key};})
            .filter((element: AnnotationType) => element.annotationType === 'TrackType' )
            .map((element: AnnotationType) => element.key);
    
        return dbProperties.includes(variable);
    }

    sanitizeDBData(data: any): any
    {
        const dataKeys = Object.keys(data);
        const sanitizedData: {[key: string]: any} = {};

        for (const key of dataKeys){
            if(this.isDbVariable(key)){
                sanitizedData[key] = data[key];
            }
        }

        return sanitizedData;
    }

    public static async watchCollection<ChildClass extends Model<ChildClass>>(
        this: OpModelType<ChildClass>, 
        preRun: () => void
    ){
        const collection = Reflect.get(this, '_collection');
        this.checkForInclusionWithThrow(this.name);
        return await this.dbService.watchCollection(collection, preRun);
    }

    public static async findOneBy<ChildClass extends Model<ChildClass>>(
        this: OpModelType<ChildClass>,
        findParams?: FindByType
    ): Promise<ChildClass | null> {
        const conditions = findParams?.conditions ?? {};
        const ordering = findParams?.ordering ?? null;
        const fields = findParams?.fields ?? null;
        const allowRelations = findParams?.allowRelations ?? true;
        const fullData = findParams?.fullData ?? false;

        this.checkForInclusionWithThrow('');

        
        const collection = Reflect.get(this, '_collection');        
        const dbData = await this.dbService.findOneBy(collection, conditions, fields, ordering, allowRelations);
        
    
        if (dbData) {
            const inst: ChildClass = new (this as { new(): ChildClass })();
            return await inst._asyncFill(dbData, fullData, allowRelations);
        }
    
        return null;
    }

    public static async find<ChildClass extends Model<ChildClass>>(
        this: OpModelType<ChildClass>,
        id: string,        
        findParams: Omit<FindByType, 'conditions'> = null
    ): Promise<ChildClass | null> {        
        const ordering = findParams?.ordering ?? null;
        const fields = findParams?.fields ?? null;
        const allowRelations = findParams?.allowRelations ?? true;          
        const fullData = findParams?.fullData ?? false;

        const collection = Reflect.get(this, '_collection');
        this.checkForInclusionWithThrow(this.name);

        const dbData = await this.dbService.findOneBy(collection, { id }, fields, ordering, allowRelations);
    
        if (dbData) {            
            const inst: ChildClass = new (this as { new(): ChildClass })();
            return await inst._asyncFill(dbData, fullData, allowRelations);
        }
    
        return null;
    }   
    
    public static async findBy<ChildClass extends Model<ChildClass>>(
        this: OpModelType<ChildClass>,    
        findParams?: FindByType
    ): Promise<ChildClass[]> {
        const conditions = findParams?.conditions ?? {};
        const ordering = findParams?.ordering ?? null;
        const fields = findParams?.fields ?? null;
        const allowRelations = findParams?.allowRelations ?? true;
        const fullData = findParams?.fullData ?? false;

        const collection = Reflect.get(this, '_collection');
        this.checkForInclusionWithThrow(this.name);
        try {
            const dbData = await this.dbService.findBy(collection, conditions, fields, ordering, allowRelations);   
            if (dbData.length) {
                const instanced: ChildClass[] = [];
        
                for (const data of dbData) { 
                    const inst: ChildClass = new (this as { new(): ChildClass })();
                    instanced.push((await inst._asyncFill(data, fullData,allowRelations)) as ChildClass);
                }
        
                return instanced;
            }
        
            return [];
        } catch (rwsError: RWSError | any) {
            console.error(rwsError);

            throw rwsError;
        }                 
    }

    public static async delete<ChildClass extends Model<ChildClass>>(
        this: OpModelType<ChildClass>,
        conditions: any
    ): Promise<void> {
        const collection = Reflect.get(this, '_collection');
        this.checkForInclusionWithThrow(this.name);         
        return await this.dbService.delete(collection, conditions);
    }

    public async delete<ChildClass extends Model<ChildClass>>(): Promise<void> {
        const collection = Reflect.get(this, '_collection');
        this.checkForInclusionWithThrow();
        return await this.dbService.delete(collection, {
            id: this.id
        });  
    }    
    

    static async create<T extends Model<T>>(this: new () => T, data: any): Promise<T> {
        const newModel = new this();

        const sanitizedData = newModel.sanitizeDBData(data);
     
        await newModel._asyncFill(sanitizedData);
    
        return newModel;
    }

    static loadModels(): Model<any>[]
    {        
        return this.configService.get('db_models');
    }

    loadModels(): Model<any>[]
    {     
        return Model.loadModels();
    }

    private checkRelEnabled(key: string): boolean 
    {
        return Object.keys((this as any).constructor._RELATIONS).includes(key) && (this as any).constructor._RELATIONS[key] === true
    }
}



export default Model;
export { IModel, TrackType, IMetaOpts };


