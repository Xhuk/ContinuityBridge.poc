import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AuthUser {
  id: string;
  email: string;
  role: "superadmin" | "consultant" | "customer_admin" | "customer_user";
  organizationId?: string;
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
  login: (apiKey: string) => Promise<void>;
  logout: () => void;
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
      const apiKey = localStorage.getItem("apiKey");
      if (!apiKey) {
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/users/me", {
        headers: {
          "X-API-Key": apiKey,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        // Invalid API key, clear it
        localStorage.removeItem("apiKey");
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (apiKey: string) => {
    localStorage.setItem("apiKey", apiKey);
    await checkAuth();
  };

  const logout = () => {
    localStorage.removeItem("apiKey");
    setUser(null);
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
