"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FolderOpen, Users, Plus, ArrowRight } from "lucide-react";

export default function LawyerDashboard() {
  const { user } = useAuth();
  const matters = useQuery(
    api.matters.listByLawyer,
    user ? { lawyerId: user._id } : "skip"
  );
  const stats = useQuery(
    api.matters.getDashboardStats,
    user ? { lawyerId: user._id } : "skip"
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Welcome back, {user?.name?.split(" ")[0]}</h1>
        <p className="text-muted-foreground mt-1">Manage your matters and track client readiness.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                <FolderOpen className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.activeMatters ?? 0}</p>
                <p className="text-sm text-muted-foreground">Active Matters</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.clientsEnrolled ?? 0}</p>
                <p className="text-sm text-muted-foreground">Clients Enrolled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <span className="text-green-600 font-bold text-lg">%</span>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {stats?.avgReadiness != null ? `${stats.avgReadiness}%` : "—"}
                </p>
                <p className="text-sm text-muted-foreground">Avg Readiness</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Matters */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Your Matters</h2>
        <Link href="/lawyer/matters/new">
          <Button size="sm">
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
            <p className="text-muted-foreground mb-4">
              Create your first matter to start preparing clients.
            </p>
            <Link href="/lawyer/matters/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Matter
              </Button>
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
                      <Badge
                        variant="outline"
                        className={
                          matter.persona === "aggressive"
                            ? "border-red-200 text-red-700"
                            : matter.persona === "friendly_manipulative"
                            ? "border-amber-200 text-amber-700"
                            : "border-blue-200 text-blue-700"
                        }
                      >
                        {matter.persona.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Event date: {matter.eventDate}
                    </p>
                    {matter.riskTags.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {matter.riskTags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Link href={`/lawyer/matters/${matter._id}`}>
                    <Button variant="outline" size="sm">
                      View <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
