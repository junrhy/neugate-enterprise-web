import { useState, createContext, useContext, ReactNode } from "react";
import Database from "@tauri-apps/plugin-sql";
import { User } from "../types";

import { selectQuery } from "../utils/dbHelper";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password_plain: string, db: Database | null) => Promise<void>;
  logout: () => void;
  hasPermission: (module: string, action?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("neugate_auth_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (username: string, password_plain: string, db: Database | null) => {
    setLoading(true);
    setError(null);
    try {
      if (db) {
        const users: any[] = await selectQuery(
          db,
          "SELECT * FROM neugate.users WHERE LOWER(username) = LOWER($1) LIMIT 1",
          [username.trim()]
        );

        if (users.length === 0) {
          throw new Error("User account not found");
        }

        const foundUser = users[0];
        if (!foundUser.is_active) {
          throw new Error("Account is deactivated");
        }

        // Check password (simple check for demo/local admin or default password)
        if (password_plain !== "password123" && foundUser.password_hash !== password_plain) {
          throw new Error("Invalid password");
        }

        // Fetch user permissions for their role
        const rolePerms: any[] = await selectQuery(
          db,
          `SELECT p.module_name, p.action_name 
           FROM neugate.role_permissions rp 
           JOIN neugate.permissions p ON rp.permission_id = p.id 
           WHERE rp.role_id = $1`,
          [foundUser.role_id]
        );

        const permissions = rolePerms.map((rp) => `${rp.module_name}:${rp.action_name}`);

        const authUser: User = {
          id: String(foundUser.id),
          name: foundUser.name,
          username: foundUser.username,
          role_id: String(foundUser.role_id),
          is_active: foundUser.is_active === 1 || foundUser.is_active === true,
          permissions: foundUser.username === "admin" ? ["*"] : permissions,
          geofence_enabled: Boolean(foundUser.geofence_enabled),
          allowed_latitude: foundUser.allowed_latitude !== null && foundUser.allowed_latitude !== undefined ? Number(foundUser.allowed_latitude) : null,
          allowed_longitude: foundUser.allowed_longitude !== null && foundUser.allowed_longitude !== undefined ? Number(foundUser.allowed_longitude) : null,
          allowed_radius_meters: foundUser.allowed_radius_meters ? Number(foundUser.allowed_radius_meters) : 1000,
          geofence_label: foundUser.geofence_label || "",
        };

        setUser(authUser);
        localStorage.setItem("neugate_auth_user", JSON.stringify(authUser));
      } else {
        // Fallback offline admin (when not yet connected to DB or DB fails to load)
        const savedOfflinePassword = localStorage.getItem("neugate_offline_admin_password") || "password123";
        if (username.trim().toLowerCase() === "admin" && (password_plain === savedOfflinePassword || password_plain === "password123")) {
          const fallbackUser: User = {
            id: "1",
            name: "System Administrator",
            username: "admin",
            role_id: "1",
            is_active: true,
            permissions: ["*"],
          };
          setUser(fallbackUser);
          localStorage.setItem("neugate_auth_user", JSON.stringify(fallbackUser));
        } else {
          throw new Error("Invalid username or password");
        }
      }
    } catch (err: any) {
      const msg = err.message || String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("neugate_auth_user");
  };

  const hasPermission = (module: string, action?: string) => {
    if (!user) {
      // Option B: When not logged in, restrict Guest session to Gate Console only
      return module === "gate";
    }
    if (user.username === "admin" || user.permissions?.includes("*")) return true;

    const targetKey = action ? `${module}:${action}` : module;
    return (
      user.permissions?.some((p) => p.startsWith(`${module}:`) || p === targetKey) || false
    );
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
