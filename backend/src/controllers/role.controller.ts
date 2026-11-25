import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { allowedAdminPermissions } from '../utils/adminPermissions';
import { assertCanGrantPermissions, PermissionGrantError } from '../utils/permissionGrant';

const operatorOf = (req: Request) => ({ userId: req.user!.id, role: req.user!.role });

const normalizePermissionList = (permissions: unknown) =>
  Array.isArray(permissions)
    ? Array.from(
        new Set(
          permissions
            .filter((permission): permission is string => typeof permission === 'string')
            .map((permission) => permission.trim())
            .filter((permission) => permission && allowedAdminPermissions.has(permission))
        )
      )
    : [];

const mapRole = async (role: any) => {
  const usersCount = await prisma.user.count({
    where: { customRoleId: role.id, role: 'EMPLOYEE' },
  });

  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: normalizePermissionList(role.permissions),
    usersCount,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
};

export const getRoles = async (req: Request, res: Response) => {
  try {
    const roles = await prisma.customRole.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const rolesWithCounts = await Promise.all(roles.map(mapRole));

    res.json({ roles: rolesWithCounts });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
};

export const createRole = async (req: Request, res: Response) => {
  try {
    const { name, permissions, description } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    const normalizedPermissions = normalizePermissionList(permissions);

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Permissions must be an array' });
    }
    // A role never carries more than the person creating it holds.
    await assertCanGrantPermissions(operatorOf(req), normalizedPermissions, 'This role');

    const role = await prisma.customRole.create({
      data: {
        name: name.trim(),
        permissions: normalizedPermissions,
        description: typeof description === 'string' ? description.trim() || null : null,
      }
    });

    res.status(201).json({ role: await mapRole(role) });
  } catch (error: any) {
    if (error instanceof PermissionGrantError) return res.status(403).json({ error: error.message });
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Role name already exists' });
    }
    console.error('Error creating role:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
};

export const updateRole = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, permissions, description } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Role name is required' });
    }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Permissions must be an array' });
    }

    const role = await prisma.customRole.findUnique({
      where: { id },
    });

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const normalizedPermissions = normalizePermissionList(permissions);
    // Permissions already on the role may stay; nobody adds one they do not hold themselves (this also stops
    // somebody widening the role they are on).
    const existing = new Set(normalizePermissionList(role.permissions));
    await assertCanGrantPermissions(operatorOf(req), normalizedPermissions.filter((permission) => !existing.has(permission)), 'Adding these permissions');
    const updatedRole = await prisma.customRole.update({
      where: { id },
      data: {
        name: name.trim(),
        permissions: normalizedPermissions,
        description: typeof description === 'string' ? description.trim() || null : null,
      },
    });

    await prisma.user.updateMany({
      where: { customRoleId: id, role: 'EMPLOYEE' },
      data: { updatedAt: new Date() },
    });

    res.json({ role: await mapRole(updatedRole) });
  } catch (error: any) {
    if (error instanceof PermissionGrantError) return res.status(403).json({ error: error.message });
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Role name already exists' });
    }
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
};

export const deleteRole = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    
    // Check if role exists
    const role = await prisma.customRole.findUnique({
      where: { id }
    });

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Check if role has users
    const usersCount = await prisma.user.count({
      where: { customRoleId: id, role: 'EMPLOYEE' }
    });

    if (usersCount > 0) {
      return res.status(400).json({ error: 'Cannot delete role with assigned users' });
    }

    await prisma.customRole.delete({
      where: { id }
    });

    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
};
