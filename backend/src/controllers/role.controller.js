"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRole = exports.updateRole = exports.createRole = exports.getRoles = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const normalizePermissionList = (permissions) => Array.isArray(permissions)
    ? Array.from(new Set(permissions
        .filter((permission) => typeof permission === 'string')
        .map((permission) => permission.trim())
        .filter(Boolean)))
    : [];
const mapRole = async (role) => {
    const usersCount = await prisma_1.default.user.count({
        where: { customRoleId: role.id, role: 'EMPLOYEE' },
    });
    return {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: Array.isArray(role.permissions) ? role.permissions : [],
        usersCount,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
    };
};
const getRoles = async (req, res) => {
    try {
        const roles = await prisma_1.default.customRole.findMany({
            orderBy: { createdAt: 'desc' }
        });
        const rolesWithCounts = await Promise.all(roles.map(mapRole));
        res.json({ roles: rolesWithCounts });
    }
    catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
};
exports.getRoles = getRoles;
const createRole = async (req, res) => {
    try {
        const { name, permissions, description } = req.body;
        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Role name is required' });
        }
        const normalizedPermissions = normalizePermissionList(permissions);
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ error: 'Permissions must be an array' });
        }
        const role = await prisma_1.default.customRole.create({
            data: {
                name: name.trim(),
                permissions: normalizedPermissions,
                description: typeof description === 'string' ? description.trim() || null : null,
            }
        });
        res.status(201).json({ role: await mapRole(role) });
    }
    catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Role name already exists' });
        }
        console.error('Error creating role:', error);
        res.status(500).json({ error: 'Failed to create role' });
    }
};
exports.createRole = createRole;
const updateRole = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, permissions, description } = req.body;
        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Role name is required' });
        }
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ error: 'Permissions must be an array' });
        }
        const role = await prisma_1.default.customRole.findUnique({
            where: { id },
        });
        if (!role) {
            return res.status(404).json({ error: 'Role not found' });
        }
        const normalizedPermissions = normalizePermissionList(permissions);
        const updatedRole = await prisma_1.default.customRole.update({
            where: { id },
            data: {
                name: name.trim(),
                permissions: normalizedPermissions,
                description: typeof description === 'string' ? description.trim() || null : null,
            },
        });
        await prisma_1.default.user.updateMany({
            where: { customRoleId: id, role: 'EMPLOYEE' },
            data: { updatedAt: new Date() },
        });
        res.json({ role: await mapRole(updatedRole) });
    }
    catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Role name already exists' });
        }
        console.error('Error updating role:', error);
        res.status(500).json({ error: 'Failed to update role' });
    }
};
exports.updateRole = updateRole;
const deleteRole = async (req, res) => {
    try {
        const id = req.params.id;
        // Check if role exists
        const role = await prisma_1.default.customRole.findUnique({
            where: { id }
        });
        if (!role) {
            return res.status(404).json({ error: 'Role not found' });
        }
        // Check if role has users
        const usersCount = await prisma_1.default.user.count({
            where: { customRoleId: id, role: 'EMPLOYEE' }
        });
        if (usersCount > 0) {
            return res.status(400).json({ error: 'Cannot delete role with assigned users' });
        }
        await prisma_1.default.customRole.delete({
            where: { id }
        });
        res.json({ message: 'Role deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({ error: 'Failed to delete role' });
    }
};
exports.deleteRole = deleteRole;
//# sourceMappingURL=role.controller.js.map