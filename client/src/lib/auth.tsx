import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { secureStorage } from "./secure-storage";

interface AuthUser {
  id: string;
  email: string;
  role: "superadmin" | "sales" | "consultant" | "customer_admin" | "customer_user";
  organizationId?: string;
  organizationName?: string;
  assignedCustomers?: string[];
  selectedTenant?: {
    tenantId: string;
    environment: "dev" | "test" | "staging" | "prod";
  };
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Get JWT token from secure storage (async now)
      const token = await secureStorage.getToken();
      
      if (!token) {
        setIsLoading(false);
        return;
      }

      // Validate token with server
      const response = await fetch("/api/auth/session", {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
        }
      } else {
        // Token invalid or expired, clear it
        secureStorage.clearToken();
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      secureStorage.clearToken();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password?: string) => {
    // Login via magic link or password
    const endpoint = password ? "/api/auth/login/password" : "/api/auth/login/magic-link";
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login failed");
    }

    const data = await response.json();
    
    // Store JWT token in secure storage (encrypted with AES-GCM)
    if (data.token) {
      await secureStorage.setToken(data.token);
    }

    // Refresh auth state
    await checkAuth();
  };

  const logout = async () => {
    // Get token before clearing
    const token = await secureStorage.getToken();
    
    // Clear token from secure storage
    secureStorage.clearToken();
    setUser(null);
    
    // Optional: Call logout endpoint to invalidate token on server
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error("Logout API call failed:", error);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
