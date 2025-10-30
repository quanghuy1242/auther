import type { BreadcrumbItem } from "@/lib/types";

const routeLabels: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/users": "Users",
  "/admin/users/create": "Create User",
  "/admin/clients": "OAuth Clients",
  "/admin/sessions": "Sessions",
  "/admin/keys": "JWKS Keys",
  "/admin/settings": "Configuration & Secrets",
  "/admin/profile": "Profile Settings",
  "/components-demo": "Component Showcase",
};

/**
 * Generate breadcrumb items from pathname
 */
export function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [];
  
  // Always start with Admin for admin routes
  if (pathname.startsWith("/admin")) {
    items.push({ label: "Admin", href: "/admin" });
    
    // If not just /admin, add the current page
    if (pathname !== "/admin") {
      const label = routeLabels[pathname] || "Page";
      items.push({ label });
    }
  } else {
    // For non-admin routes, just show the current page
    const label = routeLabels[pathname] || "Home";
    items.push({ label });
  }
  
  return items;
}