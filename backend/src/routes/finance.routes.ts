import { Router } from 'express';
import {
  createFinanceTransaction,
  deleteFinanceTransaction,
  getFinanceTransactionById,
  importFinanceTransactions,
  listFinanceCategories,
  listFinanceTransactions,
  updateFinanceTransaction,
} from '../controllers/finance.controller';
import { requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);
router.get('/transactions', requireAdminOrEmployeePermissions(['finance.read', 'finance.manage']), listFinanceTransactions);
router.get('/transactions/:id', requireAdminOrEmployeePermissions(['finance.read', 'finance.manage']), getFinanceTransactionById);
router.get('/categories', requireAdminOrEmployeePermissions(['finance.read', 'finance.manage']), listFinanceCategories);
router.post('/transactions', requireAdminOrEmployeePermissions(['finance.manage']), createFinanceTransaction);
router.put('/transactions/:id', requireAdminOrEmployeePermissions(['finance.manage']), updateFinanceTransaction);
router.delete('/transactions/:id', requireAdminOrEmployeePermissions(['finance.manage']), deleteFinanceTransaction);
router.post('/imports', requireAdminOrEmployeePermissions(['finance.manage']), importFinanceTransactions);

export default router;
