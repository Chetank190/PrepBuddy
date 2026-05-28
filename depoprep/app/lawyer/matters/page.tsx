"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, ArrowRight, FolderOpen } from "lucide-react";
import { RemoveMatterButton } from "@/app/lawyer/components/RemoveMatterButton";

export default function MattersPage() {
  const { user } = useAuth();
  const matters = useQuery(
    api.matters.listByLawyer,
    user ? { lawyerId: user._id } : "skip"
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Matters</h1>
          <p className="text-muted-foreground mt-1">All your active cases and client assignments.</p>
        </div>
        <Link href="/lawyer/matters/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Matter
          </Button>
        </Link>
      </div>

      {!matters || matters.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">No matters yet</h3>
            <p className="text-muted-foreground mb-4">Create a matter to assign clients and run simulations.</p>
            <Link href="/lawyer/matters/new">
              <Button><Plus className="w-4 h-4 mr-2" />Create Matter</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {matters.map((matter) => (
            <Card key={matter._id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{matter.title}</h3>
                      <Badge variant="secondary" className="capitalize">
                        {matter.eventType.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">Event: {matter.eventDate}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{matter.caseSummary}</p>
                    {matter.riskTags.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {matter.riskTags.map((tag) => (
                          <span key={tag} className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <RemoveMatterButton
                      matterId={matter._id}
                      matterTitle={matter.title}
                      variant="ghost"
                    />
                    <Link href={`/lawyer/matters/${matter._id}`}>
                      <Button variant="outline" size="sm">
                        View <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
