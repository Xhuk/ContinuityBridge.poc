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
  const [debugInfo, setDebugInfo] = useState<string>(""); // Debug info to display

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
        console.log("[AuthVerify] Verification successful", {
          user: data.user?.email,
          role: data.user?.role,
          hasToken: !!data.sessionToken,
          serverRedirectTarget: data.redirectTo,
        });
        
        if (data.success) {
          setStatus("success");
          
          // Store JWT token in localStorage (simple approach first, encryption can be added later)
          if (data.sessionToken) {
            try {
              console.log("[AuthVerify] Storing token...", {
                tokenLength: data.sessionToken.length,
                tokenPreview: data.sessionToken.substring(0, 30) + '...',
              });
              
              setDebugInfo(`Token length: ${data.sessionToken.length}`);
              
              // TEMPORARY: Use plain localStorage to verify it works
              // Store with expiry
              const payload = {
                token: data.sessionToken,
                timestamp: Date.now(),
                expiresIn: 7 * 24 * 60 * 60 * 1000, // 7 days
              };
              localStorage.setItem('auth_token', JSON.stringify(payload));
              
              console.log("[AuthVerify] ✅ Token stored in localStorage successfully!");
              
              // Verify it was stored
              const storedToken = localStorage.getItem('auth_token');
              const verified = !!storedToken;
              console.log("[AuthVerify] Verification - token in localStorage:", {
                exists: verified,
                length: storedToken?.length,
              });
              
              setDebugInfo(`Token stored: ${verified ? 'YES' : 'NO'} (${storedToken?.length || 0} bytes)`);
            } catch (error) {
              console.error("[AuthVerify] ❌ Failed to store token:", error);
              setDebugInfo(`ERROR: ${error}`);
            }
          } else {
            setDebugInfo('No sessionToken in response!');
          }
          
          // Detect device and redirect accordingly
          const isMobile = isMobileDevice();
          const redirectUrl = isMobile ? "/mobile" : "/";
          setRedirectTarget(isMobile ? "mobile" : "desktop");
          
          console.log("[AuthVerify] Preparing redirect", {
            detectedDevice: isMobile ? 'mobile' : 'desktop',
            targetUrl: redirectUrl,
            currentUrl: window.location.href,
            willRedirectIn: '1500ms',
          });
          
          // Force full page reload to pick up token
          // Use replace() to avoid back button issues
          setTimeout(() => {
            console.log("[AuthVerify] Executing redirect NOW", {
              from: window.location.href,
              to: redirectUrl,
            });
            window.location.replace(redirectUrl);
            
            // Log if redirect didn't happen (shouldn't reach here)
            setTimeout(() => {
              console.error("[AuthVerify] ⚠️ Still on auth page after redirect! Check browser console.", {
                currentUrl: window.location.href,
                expectedUrl: redirectUrl,
              });
            }, 500);
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
            <p className="text-gray-600 mb-2">
              Redirecting to {redirectTarget === "mobile" ? "mobile interface" : "dashboard"}...
            </p>
            {debugInfo && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-left">
                <div className="font-mono text-xs">{debugInfo}</div>
              </div>
            )}
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
