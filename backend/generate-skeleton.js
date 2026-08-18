const fs = require('fs');
const path = require('path');

const srcDir = 'g:/Webitof company/jcbexchange/server/src';

const files = {
  'routes/index.ts': `import { Router } from 'express';\nimport masterRoutes from './master.routes';\nimport authRoutes from './auth.routes';\nimport listingRoutes from './listing.routes';\nimport leadRoutes from './lead.routes';\n\nconst router = Router();\n\nrouter.use('/master', masterRoutes);\nrouter.use('/auth', authRoutes);\nrouter.use('/listings', listingRoutes);\nrouter.use('/leads', leadRoutes);\n\nexport default router;`,
  
  'routes/master.routes.ts': `import { Router } from 'express';\nimport { getCategories, getBrands, getModels } from '../controllers/master.controller';\n\nconst router = Router();\n\nrouter.get('/categories', getCategories);\nrouter.get('/brands', getBrands);\nrouter.get('/models/:brandId', getModels);\n\nexport default router;`,
  'controllers/master.controller.ts': `import { Request, Response, NextFunction } from 'express';\nimport * as masterService from '../services/master.service';\n\nexport const getCategories = async (req: Request, res: Response, next: NextFunction) => {\n  try {\n    res.status(200).json({ success: true, data: [] });\n  } catch (error) {\n    next(error);\n  }\n};\n\nexport const getBrands = async (req: Request, res: Response, next: NextFunction) => {\n  try {\n    res.status(200).json({ success: true, data: [] });\n  } catch (error) {\n    next(error);\n  }\n};\n\nexport const getModels = async (req: Request, res: Response, next: NextFunction) => {\n  try {\n    res.status(200).json({ success: true, data: [] });\n  } catch (error) {\n    next(error);\n  }\n};`,
  'services/master.service.ts': `// Master data business logic (fetching from Prisma)`,

  'routes/auth.routes.ts': `import { Router } from 'express';\nimport { login, verifyOtp, getProfile, submitKyc } from '../controllers/auth.controller';\n\nconst router = Router();\n\nrouter.post('/login', login);\nrouter.post('/verify-otp', verifyOtp);\nrouter.get('/profile', getProfile);\nrouter.post('/partner/kyc', submitKyc);\n\nexport default router;`,
  'controllers/auth.controller.ts': `import { Request, Response, NextFunction } from 'express';\n\nexport const login = async (req: Request, res: Response, next: NextFunction) => { res.json({ message: 'Login logic' }); };\nexport const verifyOtp = async (req: Request, res: Response, next: NextFunction) => { res.json({ message: 'Verify OTP logic' }); };\nexport const getProfile = async (req: Request, res: Response, next: NextFunction) => { res.json({ message: 'Get Profile logic' }); };\nexport const submitKyc = async (req: Request, res: Response, next: NextFunction) => { res.json({ message: 'KYC Logic' }); };`,
  'services/auth.service.ts': `// Auth business logic`,

  'routes/listing.routes.ts': `import { Router } from 'express';\nimport { createListing, getListings, getListingById, updateListingStatus } from '../controllers/listing.controller';\n\nconst router = Router();\n\nrouter.post('/', createListing);\nrouter.get('/', getListings);\nrouter.get('/:id', getListingById);\nrouter.patch('/:id/status', updateListingStatus);\n\nexport default router;`,
  'controllers/listing.controller.ts': `import { Request, Response, NextFunction } from 'express';\n\nexport const createListing = async (req: Request, res: Response, next: NextFunction) => { res.json({ message: 'Create Listing' }); };\nexport const getListings = async (req: Request, res: Response, next: NextFunction) => { res.json({ message: 'Search Listings' }); };\nexport const getListingById = async (req: Request, res: Response, next: NextFunction) => { res.json({ message: 'Listing detail' }); };\nexport const updateListingStatus = async (req: Request, res: Response, next: NextFunction) => { res.json({ message: 'Approve/Reject' }); };`,
  'services/listing.service.ts': `// Listing business logic`,

  'routes/lead.routes.ts': `import { Router } from 'express';\nimport { createLead, getMyLeads } from '../controllers/lead.controller';\n\nconst router = Router();\n\nrouter.post('/', createLead);\nrouter.get('/my-leads', getMyLeads);\n\nexport default router;`,
  'controllers/lead.controller.ts': `import { Request, Response, NextFunction } from 'express';\n\nexport const createLead = async (req: Request, res: Response, next: NextFunction) => { res.json({ message: 'Create lead' }); };\nexport const getMyLeads = async (req: Request, res: Response, next: NextFunction) => { res.json({ message: 'Dealer leads' }); };`,
  'services/lead.service.ts': `// Lead business logic`,

  'middlewares/auth.middleware.ts': `import { Request, Response, NextFunction } from 'express';\n\nexport const requireAuth = (req: Request, res: Response, next: NextFunction) => {\n  // JWT verification logic here\n  next();\n};\n\nexport const requireAdmin = (req: Request, res: Response, next: NextFunction) => {\n  // Check admin role logic here\n  next();\n};`
};

for (const [filepath, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(srcDir, filepath), content);
}
console.log('Skeleton generated');
