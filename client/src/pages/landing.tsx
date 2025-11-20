/**
 * Secure Landing Page
 * Emulates a 404 error to hide the application from unauthorized access
 * Only shows authentication when specific URL pattern is detected
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Landing() {
  const [, setLocation] = useLocation();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Security: Prevent search engine indexing
  useEffect(() => {
    // Add noindex meta tag
    const metaRobots = document.createElement('meta');
    metaRobots.name = 'robots';
    metaRobots.content = 'noindex, nofollow';
    document.head.appendChild(metaRobots);

    // Update title to match 404
    const originalTitle = document.title;
    document.title = '404 Not Found';

    return () => {
      document.head.removeChild(metaRobots);
      document.title = originalTitle;
    };
  }, []);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  // Security: Prevent context menu and dev tools hints
  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => {
      if (!showAuth) {
        e.preventDefault();
      }
    };

    const preventKeyboardShortcuts = (e: KeyboardEvent) => {
      // Prevent F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && e.key === 'u')
      ) {
        if (!showAuth) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('keydown', preventKeyboardShortcuts);

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('keydown', preventKeyboardShortcuts);
    };
  }, [showAuth]);

  // Secret knock: Triple-click on the 404 text to reveal auth
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const handleSecretKnock = () => {
    const now = Date.now();
    
    // Reset counter if clicks are too far apart (> 800ms)
    if (now - lastClickTime > 800) {
      setClickCount(1);
    } else {
      setClickCount(prev => prev + 1);
    }
    
    setLastClickTime(now);

    // Reveal auth on 3 rapid clicks
    if (clickCount + 1 >= 3) {
      setShowAuth(true);
      setClickCount(0);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email);
      setMagicLinkSent(true);
    } catch (err) {
      setError("Failed to send magic link");
    } finally {
      setIsLoading(false);
    }
  };

  // Standard browser 404 error page emulation (for platform)
  // OR institutional page (for customer deployments)
  const isCustomerDeployment = import.meta.env.VITE_DEPLOYMENT_TYPE === 'customer';
  
  if (isCustomerDeployment) {
    // Customer deployment: Show institutional/corporate landing page
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">ContinuityBridge</h1>
                <p className="text-sm text-gray-600 mt-1">Enterprise Integration Platform</p>
              </div>
              <Button
                onClick={() => setLocation('/admin')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Sign In
              </Button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl">
              Enterprise Integration
              <span className="block text-blue-600">Made Simple</span>
            </h2>
            <p className="mt-6 max-w-2xl mx-auto text-xl text-gray-600">
              Connect, transform, and orchestrate data flows across your entire technology ecosystem
              with our powerful middleware platform.
            </p>
            <div className="mt-10 flex justify-center gap-4">
              <Button
                onClick={() => setLocation('/admin')}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg"
              >
                Access Platform
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="mt-24 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <h3 className="text-xl font-semibold text-gray-900">Visual Flow Builder</h3>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Design complex integration workflows with our intuitive drag-and-drop interface.
                  No coding required.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-xl font-semibold text-gray-900">Real-Time Monitoring</h3>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Track data flows in real-time with comprehensive dashboards and alerting capabilities.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-xl font-semibold text-gray-900">Enterprise Security</h3>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Bank-grade encryption, role-based access control, and comprehensive audit logging.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-24 bg-white border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <p className="text-center text-gray-500 text-sm">
              © {new Date().getFullYear()} ContinuityBridge. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    );
  }

  // Platform deployment: Show 404 security page
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        {/* Emulates standard browser 404 */}
        <div className="space-y-6">
          <h1 
            className="text-9xl font-bold text-gray-200 select-none cursor-default"
            onClick={handleSecretKnock}
            onContextMenu={(e) => e.preventDefault()}
            style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none' }}
          >
            404
          </h1>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-gray-800">
              Not Found
            </h2>
            <p className="text-gray-600 max-w-md mx-auto">
              The requested URL was not found on this server.
            </p>
          </div>

          {/* Show auth card only after secret knock */}
          {showAuth && (
            <Card className="mt-8 max-w-md mx-auto border-gray-200 shadow-sm">
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">Authentication Required</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {magicLinkSent
                    ? "Check your email for the magic link"
                    : "Enter your email to receive a magic link"}
                </p>
              </CardHeader>
              <CardContent>
                {magicLinkSent ? (
                  <div className="space-y-4">
                    <p className="text-sm text-green-600">
                      Magic link sent to {email}. Check your inbox.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setMagicLinkSent(false);
                        setEmail("");
                      }}
                    >
                      Send Another Link
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full"
                        disabled={isLoading}
                        autoFocus
                      />
                    </div>
                    
                    {error && (
                      <p className="text-sm text-red-600">{error}</p>
                    )}
                    
                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={isLoading || !email}
                    >
                      {isLoading ? "Sending..." : "Send Magic Link"}
                    </Button>

                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-500 text-center mb-2">
                        Secure passwordless authentication
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full text-sm"
                        onClick={() => {
                          const isCustomerDeployment = import.meta.env.VITE_DEPLOYMENT_TYPE === 'customer';
                          setLocation(isCustomerDeployment ? '/admin' : '/sys/auth/bridge');
                        }}
                      >
                        Go to Login Page
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          )}

          {/* Standard footer like nginx/apache */}
          <div className="mt-16 text-sm text-gray-400 border-t border-gray-200 pt-6">
            nginx/1.18.0
          </div>
        </div>
      </div>
    </div>
  );
}
