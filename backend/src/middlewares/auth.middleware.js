"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePortalOperator = exports.requireSuperAdminOrEmployeePermissions = exports.requireSuperAdmin = exports.requireAdmin = exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const accountAccess_1 = require("../utils/accountAccess");
const prisma_1 = __importDefault(require("../lib/prisma"));
const JWT_SECRET = process.env.JWT_SECRET || 'jcbexchange_super_secret_key_123';
const getBearerToken = (authorizationHeader) => {
    if (!authorizationHeader?.startsWith('Bearer ')) {
        return null;
    }
    return authorizationHeader.slice(7).trim();
};
const requireAuth = (req, res, next) => {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        (0, accountAccess_1.fetchAuthenticatedUserById)(decoded.id)
            .then((user) => {
            if (!user) {
                return res.status(403).json({
                    error: accountAccess_1.ACCOUNT_REVOKED_MESSAGE,
                    code: accountAccess_1.ACCOUNT_REVOKED_CODE,
                });
            }
            const accessState = (0, accountAccess_1.getAccountAccessState)(user);
            if (accessState === 'inactive') {
                return res.status(403).json({
                    error: accountAccess_1.ACCOUNT_INACTIVE_MESSAGE,
                    code: accountAccess_1.ACCOUNT_INACTIVE_CODE,
                });
            }
            if (accessState === 'revoked') {
                return res.status(403).json({
                    error: accountAccess_1.ACCOUNT_REVOKED_MESSAGE,
                    code: accountAccess_1.ACCOUNT_REVOKED_CODE,
                });
            }
            req.user = {
                id: user.id,
                email: user.email ?? null,
                role: (0, accountAccess_1.resolveEffectiveUserRole)(user),
                status: user.status ?? undefined,
            };
            next();
        })
            .catch((error) => next(error));
    }
    catch {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
};
exports.requireAuth = requireAuth;
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
};
exports.requireAdmin = requireAdmin;
const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super admin access required.' });
    }
    next();
};
exports.requireSuperAdmin = requireSuperAdmin;
const requireSuperAdminOrEmployeePermissions = (requiredPermissions) => async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role === 'SUPER_ADMIN') {
        return next();
    }
    if (req.user.role !== 'EMPLOYEE') {
        return res.status(403).json({ error: 'Super admin access required.' });
    }
    if (!requiredPermissions.length) {
        return next();
    }
    try {
        const employee = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            select: {
                customRole: {
                    select: {
                        permissions: true,
                    },
                },
                adminPermissions: {
                    select: {
                        permission: true,
                    },
                },
            },
        });
        const permissions = Array.isArray(employee?.customRole?.permissions)
            ? employee.customRole.permissions
            : (employee?.adminPermissions || []).map((item) => item.permission);
        const isAllowed = permissions.includes('ALL_ACCESS') ||
            requiredPermissions.some((permission) => permissions.includes(permission));
        if (!isAllowed) {
            return res.status(403).json({ error: 'You do not have permission to access this module.' });
        }
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.requireSuperAdminOrEmployeePermissions = requireSuperAdminOrEmployeePermissions;
const requirePortalOperator = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'PARTNER'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Portal access required.' });
    }
    if ((0, accountAccess_1.isPortalStatusBlocked)(req.user.status)) {
        return res.status(403).json({
            error: accountAccess_1.ACCOUNT_REVOKED_MESSAGE,
            code: accountAccess_1.ACCOUNT_REVOKED_CODE,
        });
    }
    next();
};
exports.requirePortalOperator = requirePortalOperator;
//# sourceMappingURL=auth.middleware.js.map