import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Book, Search, RefreshCw, Lock, FileText, Tag } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface WikiPage {
  title: string;
  filename: string;
  content: string;
  tags: string[];
  category: "operational" | "strategic" | "technical" | "business";
  accessLevel: "founder" | "consultant" | "all";
}

export default function Wiki() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);

  // Fetch all wiki pages
  const { data, isLoading, refetch } = useQuery<{ pages: WikiPage[]; userRole: string }>({
    queryKey: ["/api/wiki/pages"],
  });

  const pages = data?.pages || [];
  const userRole = data?.userRole;

  // Filter pages by search term
  const filteredPages = pages.filter(page =>
    page.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    page.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Sync wiki from GitHub (founders only)
  const handleSync = async () => {
    try {
      await apiRequest("/api/wiki/sync", { method: "POST" });
      refetch();
    } catch (error: any) {
      console.error("Failed to sync wiki:", error);
    }
  };

  // Category badge color
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "operational": return "bg-blue-500";
      case "strategic": return "bg-purple-500";
      case "technical": return "bg-green-500";
      case "business": return "bg-orange-500";
      default: return "bg-gray-500";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Book className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Documentation Wiki</h1>
              <p className="text-sm text-gray-500">
                {userRole === "superadmin" 
                  ? "Full documentation access (Founder)"
                  : "Operational documentation (Consultant)"}
              </p>
            </div>
          </div>
          {user?.role === "superadmin" && (
            <Button onClick={handleSync} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync from GitHub
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search documentation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden">
        {/* Sidebar - Page List */}
        <div className="col-span-4 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {filteredPages.length} Page{filteredPages.length !== 1 ? 's' : ''}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {filteredPages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No documentation found</p>
                </div>
              ) : (
                filteredPages.map((page) => (
                  <div
                    key={page.filename}
                    onClick={() => setSelectedPage(page)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedPage?.filename === page.filename
                        ? 'bg-blue-50 border-2 border-blue-500'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{page.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={`${getCategoryColor(page.category)} text-xs`}>
                            {page.category}
                          </Badge>
                          {page.accessLevel === "founder" && (
                            <Lock className="h-3 w-3 text-purple-600" />
                          )}
                        </div>
                      </div>
                    </div>
                    {page.tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        <Tag className="h-3 w-3 text-gray-400" />
                        {page.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-xs text-gray-500">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content - Page Viewer */}
        <div className="col-span-8 overflow-y-auto">
          {selectedPage ? (
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{selectedPage.title}</CardTitle>
                    <CardDescription className="mt-2 flex items-center gap-2">
                      <Badge className={getCategoryColor(selectedPage.category)}>
                        {selectedPage.category}
                      </Badge>
                      {selectedPage.accessLevel === "founder" && (
                        <Badge variant="outline" className="border-purple-500 text-purple-700">
                          <Lock className="h-3 w-3 mr-1" />
                          Founder Only
                        </Badge>
                      )}
                    </CardDescription>
                  </div>
                </div>
                {selectedPage.tags.length > 0 && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {selectedPage.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <div 
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ 
                    __html: selectedPage.content
                      .split('\n')
                      .map(line => {
                        // Convert markdown headings
                        if (line.startsWith('# ')) return `<h1 class="text-2xl font-bold mt-6 mb-4">${line.slice(2)}</h1>`;
                        if (line.startsWith('## ')) return `<h2 class="text-xl font-bold mt-5 mb-3">${line.slice(3)}</h2>`;
                        if (line.startsWith('### ')) return `<h3 class="text-lg font-semibold mt-4 mb-2">${line.slice(4)}</h3>`;
                        if (line.startsWith('**') && line.endsWith('**')) {
                          return `<p class="font-semibold">${line.slice(2, -2)}</p>`;
                        }
                        if (line.trim() === '---') return '<hr class="my-4" />';
                        if (line.trim() === '') return '<br />';
                        return `<p class="mb-2">${line}</p>`;
                      })
                      .join('')
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Book className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Select a page from the sidebar to view</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Access Level Info */}
      {userRole === "consultant" && (
        <Alert className="mx-6 mb-6">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            You're viewing operational documentation. Strategic and business content is restricted to founders.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
