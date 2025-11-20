import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function AuthVerify() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const verifyMagicLink = async () => {
      try {
        // Get token from URL
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");

        if (!token) {
          setStatus("error");
          setErrorMessage("Invalid magic link - no token provided");
          return;
        }

        // Call API to verify token
        const response = await fetch(`/api/auth/login/verify?token=${token}`, {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
          credentials: "include", // Important for cookies
        });

        if (!response.ok) {
          const error = await response.json();
          setStatus("error");
          setErrorMessage(error.error || "Magic link verification failed");
          return;
        }

        const data = await response.json();
        
        if (data.success) {
          setStatus("success");
          // Wait a moment to show success message, then redirect
          setTimeout(() => {
            window.location.href = "/"; // Force full page reload to pick up session
          }, 1000);
        } else {
          setStatus("error");
          setErrorMessage(data.error || "Verification failed");
        }
      } catch (error: any) {
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
            <p className="text-gray-600">Redirecting to dashboard...</p>
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
