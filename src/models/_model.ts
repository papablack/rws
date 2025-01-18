import { Error500, RWSError } from '../errors';
import { Inject, Injectable, ExecutionContext, createParamDecorator } from '@nestjs/common';
import {DBService} from '../services/DBService';
import { AppConfigService } from '../index';

import TrackType, {IMetaOpts} from './decorators/TrackType';
import { InjectServices } from '../../nest/decorators/InjectServices';
import { ConfigService } from '@nestjs/config';
import { FieldsHelper } from '../helpers/FieldsHelper';

interface IModel{
    [key: string]: any;
    id: string | null;
    save: () => void;
    getCollection: () => string | null;
    configService?: AppConfigService;
    dbService?: DBService;
}

type DBModelFindOneType<ChildClass> = (
    this: OpModelType<ChildClass>,
    conditions: any,
    fields?: string[],
    ordering?: { [fieldName: string]: string }
) => Promise<ChildClass | null>;

type DBModelFindManyType<ChildClass> = (
    this: OpModelType<ChildClass>,
    conditions: any,
    fields?: string[],
    ordering?: { [fieldName: string]: string }
) => Promise<ChildClass | null>;

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
    loadModels: () => Model<any>[];
    checkForInclusionWithThrow: (className: string) => void;
    checkForInclusion: (className: string) => boolean;
    configService?: AppConfigService;
    dbService?: DBService;
    findOneBy<T extends Model<T>>(
        this: OpModelType<T>,
        conditions: {
            [fieldName: string]: any
        },
        fields: string[] | null,
        ordering: { [fieldName: string]: string },
        allowRelations?: boolean
    ): Promise<T | null>;
    find<T extends Model<T>>(
        this: OpModelType<T>,
        id: string,        
        fields?: string[] | null,
        ordering?: { [fieldName: string]: string },
        allowRelations?: boolean
    ): Promise<T | null>;
    findBy<T extends Model<T>>(
        this: OpModelType<T>,    
        conditions: any,
        fields?: string[] | null,
        ordering?: { [fieldName: string]: string },
        allowRelations?: boolean
    ): Promise<T[]>
}

@InjectServices()
class Model<ChildClass> implements IModel{
    configService: AppConfigService
    dbService: DBService

    static configService: AppConfigService
    static dbService: DBService

    [key: string]: any;
    @TrackType(String)
    id: string;
    static _collection: string = null;
    static _RELATIONS = {};
    static _BANNED_KEYS = ['_collection'];

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
        Model.checkForInclusionWithThrow(this.constructor.name)
    }

    static checkForInclusionWithThrow(this: OpModelType<any>, checkModelType: string): void
    {
        if(!this.checkForInclusion(this.name)){
            throw new Error500(new Error('Model undefined: ' + this.name), this.name);
        }
    }

    checkForInclusion(): boolean    
    {                
        return Model.checkForInclusion(this.constructor.name);        
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

    public async _asyncFill(data: any, allowRelations = true): Promise<ChildClass>{
        const collections_to_models: {[key: string]: any} = {};           
        const timeSeriesIds: {[key: string]: {collection: string, hydrationField: string,ids: string[]}} = this.getTimeSeriesModelFields();

        const classFields = FieldsHelper.getAllClassFields(this.constructor);        

        const relOneData = this.getRelationOneMeta(classFields);
        const relManyData = this.getRelationManyMeta(classFields);        
        

        this.loadModels().forEach((model) => {
            collections_to_models[model.getCollection()] = model;      
        });      

        const seriesHydrationfields: string[] = []; 
        
        if(allowRelations){
            for (const key in relManyData) {            
                const relMeta = relManyData[key];  
        
                const relationEnabled = this.checkRelEnabled(relMeta.key);
                if(relationEnabled){            
                    this[relMeta.key] = await relMeta.inversionModel.findBy({
                        [relMeta.foreignKey]: data.id
                    }, null, null, false);    
                }                                
            }
            
            for (const key in relOneData) {            
                const relMeta = relOneData[key];  
        
                const relationEnabled = this.checkRelEnabled(relMeta.key);
                if(relationEnabled){     
                    this[relMeta.key] = await relMeta.model.find(data[relMeta.hydrationField], null, null, false);    
                }                                
            }

        }

        for (const key in data) {
            if (data.hasOwnProperty(key)) {                        
                if(Object.keys(relOneData).includes(key)){               
                    continue;
                }                

                if(seriesHydrationfields.includes(key)){
                    continue;
                }                    

                const timeSeriesMetaData = timeSeriesIds[key];  
          
                if(timeSeriesMetaData){
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
    
    private getRelationOneMeta(classFields: string[]): RelOneMetaType<Model<any>>
    {
        const relIds: RelOneMetaType<Model<any>> = {};
        const relationFields = classFields.filter((item: string) => item.indexOf('Relation') === 0).map((item: string) => item.split(':').at(-1));        

        for (const key of relationFields) {  
             
            const meta = Reflect.getMetadata(`Relation:${key}`, (this as any));                 
            
            if(meta){
                if(!relIds[key]){
                    relIds[key] = {
                        key: meta.key,
                        required: meta.required,
                        model: meta.relatedTo,
                        hydrationField: meta.relationField,
                        foreignKey: meta.relatedToField
                    };
                }
            }                         
            
        } 

        return relIds;
    }

    private getRelationManyMeta(classFields: string[]): RelManyMetaType<Model<any>>
    {
        const relIds: RelManyMetaType<Model<any>> = {};

        const inverseFields = classFields.filter((item: string) => item.indexOf('InverseRelation') === 0).map((item: string) => item.split(':').at(-1));        

        for (const key of inverseFields) {          
       
            const meta = Reflect.getMetadata(`InverseRelation:${key}`, (this as any));                            

            if(meta){
                if(!relIds[key]){
                    relIds[key] = {       
                        key: meta.key,         
                        inversionModel: meta.inversionModel,
                        foreignKey: meta.foreignKey                   
                    };
                }
            }                         
            
        } 

        return relIds;
    }

    public toMongo(): any{
       
        const data: any = {};

        const timeSeriesIds: {[key: string]: {collection: string, hydrationField: string, ids: string[]}} = this.getTimeSeriesModelFields();
        const timeSeriesHydrationFields: string[] = [];
      
        for (const key in (this as any)) { 
            console.log({key, rel: this.hasRelation(key)})  
            if(this.hasRelation(key)){                
                data[key] = this.bindRelation(key, this[key]);                
                continue;
            }

            if(!this.isDbVariable(key)){
                continue;
            } 

            const passedFieldCondition: boolean = this.hasOwnProperty(key) && 
                !((this as any).constructor._BANNED_KEYS 
                    || Model._BANNED_KEYS
                ).includes(key) && 
                !timeSeriesHydrationFields.includes(key)
            ;

            console.log({hasProp: passedFieldCondition})    

            if (passedFieldCondition) {                      
                data[key] = this[key];
            }

            if(timeSeriesIds[key]){
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
        const data = this.toMongo();
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

    static getModelAnnotations<T extends object>(constructor: new () => T): Record<string, {annotationType: string, metadata: any}> {    
        const annotationsData: Record<string, {annotationType: string, metadata: any}> = {};

        const propertyKeys: string[] = Reflect.getMetadataKeys(constructor.prototype).map((item: string): string => {
            return item.split(':')[1];
        });
      
        propertyKeys.forEach(key => {
            if(String(key) == 'id'){
                return;
            }  

            const annotations: string[] = ['TrackType', 'Relation', 'InverseRelation', 'InverseTimeSeries'];

            annotations.forEach(annotation => {
                const metadataKey = `${annotation}:${String(key)}`;
        
                const meta = Reflect.getMetadata(metadataKey, constructor.prototype);
          
                if (meta) {
                    annotationsData[String(key)] = {annotationType: annotation, metadata: meta};
                }
            });                 
        });

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

    isDbVariable(variable: string): boolean 
    {
        return Model.checkDbVariable((this as any).constructor, variable);
    }

    static checkDbVariable(constructor: any, variable: string): boolean
    {                   

        if(variable === 'id'){
            return true;
        }
        
        const dbAnnotations = Model.getModelAnnotations(constructor);
      type AnnotationType = { annotationType: string, key: string };

      const dbProperties: string[] = Object.keys(dbAnnotations).map((key: string): AnnotationType => {return {...dbAnnotations[key], key};}).filter((element: AnnotationType) => element.annotationType === 'TrackType' ).map((element: AnnotationType) => element.key);

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
        conditions: {
            [fieldName: string]: any
        },
        fields: string[] | null = null,
        ordering: { [fieldName: string]: string } = null,
        allowRelations: boolean = true
    ): Promise<ChildClass | null> {
        this.checkForInclusionWithThrow('');

        
        const collection = Reflect.get(this, '_collection');
        const dbData = await this.dbService.findOneBy(collection, conditions, fields, ordering, allowRelations);
        
    
        if (dbData) {
            const inst: ChildClass = new (this as { new(): ChildClass })();
            return await inst._asyncFill(dbData, allowRelations);
        }
    
        return null;
    }

    public static async find<ChildClass extends Model<ChildClass>>(
        this: OpModelType<ChildClass>,
        id: string,        
        fields: string[] | null = null,
        ordering: { [fieldName: string]: string } = null,
        allowRelations: boolean = true
    ): Promise<ChildClass | null> {
        const collection = Reflect.get(this, '_collection');
        this.checkForInclusionWithThrow(this.name);

        const dbData = await this.dbService.findOneBy(collection, { id }, fields, ordering, allowRelations);
    
        if (dbData) {
            const inst: ChildClass = new (this as { new(): ChildClass })();
            return await inst._asyncFill(dbData);
        }
    
        return null;
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
    
    public static async findBy<ChildClass extends Model<ChildClass>>(
        this: OpModelType<ChildClass>,    
        conditions: any,
        fields: string[] | null = null,
        ordering: { [fieldName: string]: string } = null,
        allowRelations: boolean = true
    ): Promise<ChildClass[]> {
        const collection = Reflect.get(this, '_collection');
        this.checkForInclusionWithThrow(this.name);
        try {
            const dbData = await this.dbService.findBy(collection, conditions, fields, ordering, allowRelations);   
            if (dbData.length) {
                const instanced: ChildClass[] = [];
        
                for (const data of dbData) { 
                    const inst: ChildClass = new (this as { new(): ChildClass })();
                    instanced.push((await inst._asyncFill(data, allowRelations)) as ChildClass);
                }
        
                return instanced;
            }
        
            return [];
        } catch (rwsError: RWSError | any) {
            console.error(rwsError);

            throw rwsError;
        }                 
    }
    

    static async create<T extends Model<T>>(this: new () => T, data: any): Promise<T> {
        const newModel = new this();

        const sanitizedData = newModel.sanitizeDBData(data);
     
        await newModel._asyncFill(sanitizedData);
    
        return newModel;
    }

    static loadModels(): Model<any>[]
    {        
        return this.configService.get('user_models');
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


