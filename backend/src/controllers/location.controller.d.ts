import { Request, Response } from 'express';
export declare const getCountries: (req: Request, res: Response) => Promise<void>;
export declare const getStatesByCountry: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getCitiesByState: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=location.controller.d.ts.map