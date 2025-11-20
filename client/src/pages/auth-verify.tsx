import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { secureStorage } from "@/lib/secure-storage";

// Detect if user is on mobile device
const isMobileDevice = () => {
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  
  // Check for mobile patterns
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  
  // Check screen size as additional indicator
  const isSmallScreen = window.innerWidth <= 768;
  
  return mobileRegex.test(userAgent.toLowerCase()) || isSmallScreen;
};

export default function AuthVerify() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState("");
  const [redirectTarget, setRedirectTarget] = useState<"mobile" | "desktop">("desktop");

  useEffect(() => {
    const verifyMagicLink = async () => {
      try {
        // Get token from URL
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");

        console.log("[AuthVerify] Starting verification with token:", token?.substring(0, 8) + "...");

        if (!token) {
          setStatus("error");
          setErrorMessage("Invalid magic link - no token provided");
          return;
        }

        // Call API to verify token
        console.log("[AuthVerify] Calling verification API...");
        const response = await fetch(`/api/auth/login/verify?token=${token}`, {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
          credentials: "include", // Important for cookies
        });

        console.log("[AuthVerify] Verification response status:", response.status);

        if (!response.ok) {
          const error = await response.json();
          console.error("[AuthVerify] Verification failed:", error);
          setStatus("error");
          setErrorMessage(error.error || "Magic link verification failed");
          return;
        }

        const data = await response.json();
        console.log("[AuthVerify] Verification successful, user:", data.user?.email);
        
        if (data.success) {
          setStatus("success");
          
          // Store JWT token in secure storage (encrypted)
          if (data.sessionToken) {
            secureStorage.setToken(data.sessionToken);
            console.log("[AuthVerify] Token stored in secure storage (encrypted)");
          }
          
          // Detect device and redirect accordingly
          const isMobile = isMobileDevice();
          const redirectUrl = isMobile ? "/mobile" : "/";
          setRedirectTarget(isMobile ? "mobile" : "desktop");
          
          console.log("[AuthVerify] Redirecting to:", redirectUrl);
          
          // Force full page reload to pick up token
          // Use replace() to avoid back button issues
          setTimeout(() => {
            window.location.replace(redirectUrl);
          }, 1500); // Increased delay to ensure token is stored
        } else {
          setStatus("error");
          setErrorMessage(data.error || "Verification failed");
        }
      } catch (error: any) {
        console.error("[AuthVerify] Network error:", error);
        setStatus("error");
        setErrorMessage(error.message || "Network error during verification");
      }
    };

    verifyMagicLink();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-lg text-center">
        {status === "verifying" && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-2">Verifying Magic Link</h2>
            <p className="text-gray-600">Please wait...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="text-green-600 text-5xl mb-4">✓</div>
            <h2 className="text-xl font-semibold mb-2">Login Successful!</h2>
            <p className="text-gray-600">
              Redirecting to {redirectTarget === "mobile" ? "mobile interface" : "dashboard"}...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="text-red-600 text-5xl mb-4">✗</div>
            <h2 className="text-xl font-semibold mb-2">Verification Failed</h2>
            <p className="text-gray-600 mb-4">{errorMessage}</p>
            <button
              onClick={() => setLocation("/sys/auth/bridge")}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
