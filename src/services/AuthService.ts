import getConfigService from "./AppConfigService";
import jwt from 'jsonwebtoken';



import TheService from "./_service";

/**
 * @notExported
 */
class AuthService extends TheService{
    constructor() {
        super();
    }

    async authorize<IUser>(token: string, constructor: new (data: any) => IUser ): Promise<IUser> {
        const secretKey: string = getConfigService().get('secret_key');
        
        try {
            return await new Promise((approve, reject) => {
                jwt.verify(token, secretKey, (error, tokenData) => {
                    if (error) {                        
                        reject(error);
                        return;
                    }
                
                    approve(new constructor(tokenData))
                });
            })
        }
        catch(e: Error | any){           
            throw e;
        }
    }
}

export default AuthService.getSingleton();