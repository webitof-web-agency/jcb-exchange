import { Request, Response } from 'express';
export declare const getRoles: (req: Request, res: Response) => Promise<void>;
export declare const createRole: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateRole: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteRole: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=role.controller.d.ts.map