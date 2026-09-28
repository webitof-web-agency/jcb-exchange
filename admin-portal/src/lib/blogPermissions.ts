import { hasAnyPermission, hasPermission } from './permissionUtils';

export const blogPermissions = {
  read: 'blog.read',
  create: 'blog.create',
  update: 'blog.update',
  delete: 'blog.delete',
} as const;

export type BlogPermission = (typeof blogPermissions)[keyof typeof blogPermissions];

/** Any of these grants access to the blog section */
export const blogAnyPermissions: BlogPermission[] = [
  blogPermissions.read,
  blogPermissions.create,
  blogPermissions.update,
  blogPermissions.delete,
];

export const canUseBlogPermission = (
  user: { role?: string | null; permissions?: string[] } | null | undefined,
  permission: BlogPermission,
) => user?.role === 'SUPER_ADMIN' || hasPermission(user?.permissions, permission);

export const canUseAnyBlogPermission = (
  user: { role?: string | null; permissions?: string[] } | null | undefined,
  permissions: BlogPermission[],
) => user?.role === 'SUPER_ADMIN' || hasAnyPermission(user?.permissions, permissions);
